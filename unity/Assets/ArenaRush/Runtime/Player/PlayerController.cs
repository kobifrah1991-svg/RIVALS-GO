using UnityEngine;

namespace ArenaRush
{
    // Local player only: input, camera, client-side prediction and shooting feel.
    // The server re-checks everything and decides the damage.
    public class PlayerController : MonoBehaviour
    {
        public static float Sensitivity = 1f;
        public const float BaseFov = 78f;

        public int WeaponIndex { get; private set; }
        public int[] Ammo { get; private set; }
        public bool Aiming { get; private set; }
        public bool Reloading => Time.time < reloadUntil;
        public float SpreadVisual { get; private set; }
        public bool InputBlocked; // set by the HUD while chat is open

        PlayerNetwork pn;
        CharacterController cc;
        Camera cam;
        Transform gunRoot;
        GameObject[] guns;
        Light flash;
        float yaw, pitch, recoil, shake, bob, reloadUntil, lastShot, lastSend, flashOff;
        Vector3 vel;
        bool semiReady = true;
        int reloadingWeapon = -1;
        Vector3 deathCamPos;

        void OnEnable()
        {
            pn = GetComponent<PlayerNetwork>();
            cc = GetComponent<CharacterController>();
            int n = WeaponCatalog.All.Length;
            Ammo = new int[n];
            for (int i = 0; i < n; i++) Ammo[i] = WeaponCatalog.Get(i).magazine;
            yaw = transform.eulerAngles.y;
            Sensitivity = PlayerPrefs.GetFloat("arena.sens", 1f);

            cam = Camera.main;
            if (cam == null) cam = new GameObject("Main Camera", typeof(Camera), typeof(AudioListener)) { tag = "MainCamera" }.GetComponent<Camera>();
            cam.transform.SetParent(transform, false);
            cam.transform.localPosition = new Vector3(0, PlayerMotor.EyeHeight, 0);
            cam.transform.localRotation = Quaternion.identity;
            cam.nearClipPlane = 0.03f;
            cam.fieldOfView = BaseFov;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = Arena.Hex(0x0b0c1a);

            gunRoot = new GameObject("ViewModel").transform;
            gunRoot.SetParent(cam.transform, false);
            guns = new GameObject[n];
            for (int i = 0; i < n; i++) { guns[i] = GunModels.Build(WeaponCatalog.Get(i), gunRoot); guns[i].SetActive(i == 0); }
            flash = new GameObject("MuzzleFlash").AddComponent<Light>();
            flash.transform.SetParent(gunRoot, false);
            flash.transform.localPosition = new Vector3(0, 0.03f, 0.8f);
            flash.type = LightType.Point;
            flash.color = new Color(1f, 0.82f, 0.48f);
            flash.range = 8f;
            flash.intensity = 0;

            if (!GetComponent<Hud>()) gameObject.AddComponent<Hud>();
            LockCursor(true);
        }

        void OnDisable()
        {
            // Keep the camera alive when the player object is destroyed (disconnect)
            if (cam != null && cam.transform.parent == transform) cam.transform.SetParent(null, true);
            if (gunRoot) Destroy(gunRoot.gameObject);
            LockCursor(false);
        }

        public static void LockCursor(bool locked)
        {
            Cursor.lockState = locked ? CursorLockMode.Locked : CursorLockMode.None;
            Cursor.visible = !locked;
        }

        public void OnTeleported(float newYaw, bool respawn)
        {
            vel = Vector3.zero;
            if (!respawn) return;
            yaw = newYaw;
            pitch = 0;
            reloadUntil = 0;
            reloadingWeapon = -1;
            for (int i = 0; i < Ammo.Length; i++) Ammo[i] = WeaponCatalog.Get(i).magazine;
            cam.transform.localPosition = new Vector3(0, PlayerMotor.EyeHeight, 0);
        }

        void Update()
        {
            if (pn == null || !pn.IsSpawned) return;
            float dt = Time.deltaTime;
            var match = MatchManager.Instance;
            bool playing = match != null && match.Playing;
            bool canAct = pn.Alive.Value && playing && !InputBlocked;

            if (Cursor.lockState != CursorLockMode.Locked && !InputBlocked && !Hud.MenuOpen && playing && InputWrap.AnyClick()) LockCursor(true);
            bool locked = Cursor.lockState == CursorLockMode.Locked;

            if (reloadingWeapon >= 0 && Time.time >= reloadUntil)
            {
                Ammo[reloadingWeapon] = WeaponCatalog.Get(reloadingWeapon).magazine;
                reloadingWeapon = -1;
            }

            if (pn.Alive.Value)
            {
                Aiming = canAct && locked && InputWrap.Aim();
                if (canAct && locked)
                {
                    Vector2 look = InputWrap.Look() * 0.08f * Sensitivity * (cam.fieldOfView / BaseFov);
                    yaw += look.x;
                    pitch = Mathf.Clamp(pitch - look.y, -85f, 85f);
                    HandleWeapons();
                }
                Vector2 move = canAct ? InputWrap.Move() : Vector2.zero;
                bool jump = canAct && InputWrap.Jump();
                transform.rotation = Quaternion.Euler(0, yaw, 0);
                PlayerMotor.Step(cc, ref vel, move, jump, yaw, Aiming, dt);
                bob += dt * new Vector2(vel.x, vel.z).magnitude * 1.6f * (cc.isGrounded ? 1 : 0);

                if (Time.time - lastSend > 0.05f)
                {
                    lastSend = Time.time;
                    pn.SubmitStateRpc(transform.position, yaw, pitch, WeaponIndex);
                }
                deathCamPos = cam.transform.position;
            }
            else
            {
                Aiming = false;
                DeathCam(dt);
            }
            UpdateCamera(dt);
        }

        void HandleWeapons()
        {
            if (!Hud.QuickMenuOpen) for (int i = 1; i <= Ammo.Length; i++) if (InputWrap.Digit(i)) SwitchWeapon(i - 1);
            float scroll = InputWrap.Scroll();
            if (scroll < 0 || InputWrap.NextWeapon()) SwitchWeapon((WeaponIndex + 1) % Ammo.Length);
            if (scroll > 0) SwitchWeapon((WeaponIndex - 1 + Ammo.Length) % Ammo.Length);
            if (InputWrap.Reload()) Reload();
            if (InputWrap.FireReleased()) semiReady = true;
            if (InputWrap.Fire()) TryFire();
        }

        void SwitchWeapon(int i)
        {
            if (i == WeaponIndex || WeaponCatalog.Get(i) == null) return;
            WeaponIndex = i;
            reloadUntil = 0;
            reloadingWeapon = -1;
            lastShot = Time.time - WeaponCatalog.Get(i).fireInterval + 0.2f; // short equip delay
            for (int g = 0; g < guns.Length; g++) guns[g].SetActive(g == i);
        }

        void Reload()
        {
            var w = WeaponCatalog.Get(WeaponIndex);
            if (Reloading || Ammo[WeaponIndex] >= w.magazine) return;
            reloadUntil = Time.time + w.reloadTime;
            reloadingWeapon = WeaponIndex;
            pn.ReloadRpc(WeaponIndex);
            Fx.I.Play(Fx.I.Reload, 0.6f);
        }

        void TryFire()
        {
            var w = WeaponCatalog.Get(WeaponIndex);
            if (Reloading || Time.time - lastShot < w.fireInterval) return;
            if (!w.automatic && !semiReady) return;
            if (Ammo[WeaponIndex] <= 0)
            {
                if (semiReady) Fx.I.Play(Fx.I.Empty);
                semiReady = false;
                Reload();
                return;
            }
            semiReady = false;
            lastShot = Time.time;
            Ammo[WeaponIndex]--;

            bool moving = new Vector2(vel.x, vel.z).magnitude > 1f;
            float spread = Aiming ? w.adsSpread : w.hipSpread;
            if (moving) spread += w.hipSpread * 0.4f;
            if (!cc.isGrounded) spread += w.hipSpread;
            if (w.id == "sniper" && !Aiming) spread = Mathf.Max(spread, 0.06f);

            Vector3 origin = pn.Eye;
            Quaternion aim = Quaternion.Euler(pitch, yaw, 0);
            var dirs = new Vector3[w.pellets];
            for (int i = 0; i < dirs.Length; i++)
            {
                Vector2 r = Random.insideUnitCircle * spread * Mathf.Rad2Deg;
                dirs[i] = aim * Quaternion.Euler(r.y, r.x, 0) * Vector3.forward;
            }
            pn.FireRpc(WeaponIndex, origin, dirs);

            // Local effects only; the server decides what was hit
            Vector3 muzzle = flash.transform.position;
            foreach (var d in dirs)
            {
                bool hitPlayer = false;
                Vector3 end = origin + d * w.range;
                foreach (var h in Physics.RaycastAll(origin, d, w.range, ~0, QueryTriggerInteraction.Collide))
                {
                    var other = h.collider.GetComponentInParent<PlayerNetwork>();
                    if (other == pn || (h.collider.isTrigger && h.collider.GetComponent<HeadHitbox>() == null)) continue;
                    if ((h.point - origin).sqrMagnitude < (end - origin).sqrMagnitude) { end = h.point; hitPlayer = other != null; }
                }
                Fx.I.Tracer(muzzle, end, w.color);
                if ((end - origin).sqrMagnitude < w.range * w.range * 0.99f)
                    Fx.I.Sparks(end, hitPlayer ? new Color(1f, 0.1f, 0.27f) : new Color(1f, 0.84f, 0.3f), hitPlayer ? 4 : 5);
            }
            Fx.I.Shot(w.id, origin, true);
            recoil += w.recoil;
            pitch = Mathf.Clamp(pitch - w.recoil * (Aiming ? 0.5f : 1f), -85f, 85f);
            yaw += Random.Range(-0.5f, 0.5f) * w.recoil * 0.4f;
            shake = Mathf.Min(1f, shake + w.recoil * 0.15f);
            flash.intensity = 6f;
            flashOff = Time.time + 0.045f;
#if UNITY_ANDROID || UNITY_IOS
            if (PlayerPrefs.GetInt("arena.vibrate", 1) == 1 && (w.id == "shotgun" || w.id == "sniper")) Handheld.Vibrate();
#endif
            if (Ammo[WeaponIndex] == 0) Invoke(nameof(Reload), 0.25f);
        }

        void UpdateCamera(float dt)
        {
            recoil = Mathf.Lerp(recoil, 0, 1 - Mathf.Exp(-10f * dt));
            shake = Mathf.Lerp(shake, 0, 1 - Mathf.Exp(-8f * dt));
            if (Time.time > flashOff) flash.intensity = 0;
            var w = WeaponCatalog.Get(WeaponIndex);
            bool scoped = Aiming && w.id == "sniper";
            cam.fieldOfView = Mathf.Lerp(cam.fieldOfView, Aiming ? w.adsFov : BaseFov, 1 - Mathf.Exp(-14f * dt));
            if (pn.Alive.Value)
            {
                cam.transform.localPosition = new Vector3(0, PlayerMotor.EyeHeight + Mathf.Sin(bob * 2) * 0.03f, 0);
                cam.transform.localRotation = Quaternion.Euler(pitch + Random.Range(-1f, 1f) * shake, Random.Range(-1f, 1f) * shake, 0);
            }
            float ads = Aiming ? 1 : 0;
            gunRoot.localPosition = new Vector3(
                0.22f * (1 - ads) + Mathf.Sin(bob) * 0.012f * (1 - ads * 0.8f),
                -0.2f + ads * 0.07f + Mathf.Abs(Mathf.Cos(bob)) * 0.01f - (Reloading ? 0.15f : 0),
                0.45f - recoil * 0.03f);
            gunRoot.localRotation = Quaternion.Euler(-recoil * 2f + (Reloading ? 35f : 0), 0, 0);
            gunRoot.gameObject.SetActive(pn.Alive.Value && !scoped);
            bool moving = new Vector2(vel.x, vel.z).magnitude > 1f;
            SpreadVisual = 5 + (moving ? 6 : 0) + (cc.isGrounded ? 0 : 8) + recoil * 4f;
        }

        // Rise above the body and watch whoever got us
        void DeathCam(float dt)
        {
            deathCamPos = Vector3.Lerp(deathCamPos, transform.position + Vector3.up * 4f, 1 - Mathf.Exp(-2f * dt));
            cam.transform.position = deathCamPos;
            var killer = MatchManager.FindById(pn.LastAttackerClientView);
            if (killer != null && killer != pn)
                cam.transform.rotation = Quaternion.Slerp(cam.transform.rotation, Quaternion.LookRotation(killer.transform.position + Vector3.up - deathCamPos), 1 - Mathf.Exp(-5f * dt));
        }
    }
}
