using System.Collections.Generic;
using System.Linq;
using Unity.Collections;
using Unity.Netcode;
using UnityEngine;

namespace ArenaRush
{
    // Networked player (human or bot). The server owns health, ammo and hit decisions (GDD §14);
    // clients only send movement and "I pulled the trigger" requests.
    [RequireComponent(typeof(CharacterController))]
    public class PlayerNetwork : NetworkBehaviour
    {
        public const int MaxHp = 100;
        const float SpawnProtection = 1.5f;
        const float RegenDelay = 5f;
        const float RegenPerSecond = 20f;

        public static readonly Color[] Palette =
        {
            Arena.Hex(0xff2e88), Arena.Hex(0x00e5ff), Arena.Hex(0xffd600), Arena.Hex(0x76ff03), Arena.Hex(0xff6d00), Arena.Hex(0xd500f9),
            Arena.Hex(0x40c4ff), Arena.Hex(0xff1744), Arena.Hex(0x1de9b6), Arena.Hex(0xf50057), Arena.Hex(0xc6ff00), Arena.Hex(0x651fff),
        };

        public static readonly List<PlayerNetwork> All = new List<PlayerNetwork>();
        public static PlayerNetwork Local { get; private set; }

        public readonly NetworkVariable<FixedString64Bytes> PlayerName = new NetworkVariable<FixedString64Bytes>();
        public readonly NetworkVariable<int> ColorIndex = new NetworkVariable<int>();
        public readonly NetworkVariable<int> Hp = new NetworkVariable<int>(MaxHp);
        public readonly NetworkVariable<int> Kills = new NetworkVariable<int>();
        public readonly NetworkVariable<int> Deaths = new NetworkVariable<int>();
        public readonly NetworkVariable<bool> Alive = new NetworkVariable<bool>();
        public readonly NetworkVariable<bool> IsBot = new NetworkVariable<bool>();
        public readonly NetworkVariable<bool> Protected = new NetworkVariable<bool>();
        public readonly NetworkVariable<int> Weapon = new NetworkVariable<int>();
        public readonly NetworkVariable<Vector3> NetPos = new NetworkVariable<Vector3>();
        public readonly NetworkVariable<float> NetYaw = new NetworkVariable<float>();
        public readonly NetworkVariable<float> NetPitch = new NetworkVariable<float>();

        public string DisplayName => PlayerName.Value.ToString();
        public Color Color => Palette[Mathf.Abs(ColorIndex.Value) % Palette.Length];
        public bool IsLocalHuman => IsOwner && !IsBot.Value;
        public Vector3 Eye => transform.position + Vector3.up * PlayerMotor.EyeHeight;

        // Set by the server before Spawn() for bots
        [System.NonSerialized] public bool PendingBot;
        [System.NonSerialized] public string PendingName;

        // Server-only bookkeeping
        [System.NonSerialized] public int Streak;
        [System.NonSerialized] public float RespawnAt;
        [System.NonSerialized] public int ChatStrikes;
        [System.NonSerialized] public float MutedUntil;
        [System.NonSerialized] public readonly Queue<float> ChatTimes = new Queue<float>();
        [System.NonSerialized] public ulong LastAttacker;
        // Client side: who killed the local player last (for the death camera)
        [System.NonSerialized] public ulong LastAttackerClientView;
        float protectUntil, lastHurt, regen, lastStateTime, graceUntil, reloadUntil;
        int pendingReload = -1;
        int[] ammo;
        float[] lastShot;

        CharacterController cc;
        Collider head;

        void Awake()
        {
            cc = GetComponent<CharacterController>();
            PlayerMotor.Configure(cc);
            var hb = GetComponentInChildren<HeadHitbox>();
            if (hb) head = hb.GetComponent<Collider>();
            int n = WeaponCatalog.All.Length;
            ammo = new int[n];
            lastShot = new float[n];
        }

        public override void OnNetworkSpawn()
        {
            All.Add(this);
            if (IsServer)
            {
                IsBot.Value = PendingBot;
                if (PendingBot) SetIdentity(PendingName);
                NetPos.Value = transform.position;
                NetYaw.Value = transform.eulerAngles.y;
            }
            Alive.OnValueChanged += OnAliveChanged;
            OnAliveChanged(false, Alive.Value);

            if (IsLocalHuman)
            {
                Local = this;
                SetNameRpc(PlayerPrefs.GetString("arena.name", ""));
            }
            GetComponent<PlayerController>().enabled = IsLocalHuman;
            GetComponent<BotBrain>().enabled = IsServer && IsBot.Value;
            GetComponent<PlayerVisual>().Init(this);
        }

        public override void OnNetworkDespawn()
        {
            All.Remove(this);
            Alive.OnValueChanged -= OnAliveChanged;
            if (Local == this) Local = null;
            var match = MatchManager.Instance;
            if (IsServer && !IsBot.Value && match != null && match.IsSpawned && !NetworkManager.ShutdownInProgress) match.Sys($"{DisplayName} עזב/ה");
        }

        void OnAliveChanged(bool _, bool alive)
        {
            if (head) head.enabled = alive;
            // Remote copies keep their collider only while alive, so corpses don't block shots
            if (!IsLocalHuman) cc.enabled = alive;
        }

        void Update()
        {
            if (!IsSpawned) return;
            // Non-authoritative copies follow the server's position smoothly
            if (!IsServer && !IsOwner)
            {
                Vector3 target = NetPos.Value;
                transform.position = (transform.position - target).sqrMagnitude > 25f
                    ? target
                    : Vector3.Lerp(transform.position, target, 1 - Mathf.Exp(-18f * Time.deltaTime));
                transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.Euler(0, NetYaw.Value, 0), 1 - Mathf.Exp(-18f * Time.deltaTime));
            }
            if (IsServer) ServerTick();
        }

        // ---------------- server ----------------
        void ServerTick()
        {
            if (!Alive.Value) return;
            if (Protected.Value && Time.time > protectUntil) Protected.Value = false;
            if (pendingReload >= 0 && Time.time >= reloadUntil)
            {
                ammo[pendingReload] = WeaponCatalog.Get(pendingReload).magazine;
                pendingReload = -1;
            }
            if (Hp.Value < MaxHp && Time.time - lastHurt > RegenDelay)
            {
                regen += RegenPerSecond * Time.deltaTime;
                int add = Mathf.FloorToInt(regen);
                if (add > 0) { regen -= add; Hp.Value = Mathf.Min(MaxHp, Hp.Value + add); }
            }
            if (IsBot.Value || IsOwner) NetPos.Value = transform.position;
        }

        public void SetIdentity(string name)
        {
            PlayerName.Value = new FixedString64Bytes(ChatFilter.CleanName(name));
            var used = All.Where(p => p != this).Select(p => p.ColorIndex.Value).ToHashSet();
            int c = 0;
            while (used.Contains(c) && c < Palette.Length) c++;
            ColorIndex.Value = c % Palette.Length;
        }

        public void ServerRespawn(Vector3 pos)
        {
            PlayerMotor.Teleport(cc, pos);
            cc.enabled = true;
            Vector3 toCenter = -pos; toCenter.y = 0;
            float yaw = Quaternion.LookRotation(toCenter.sqrMagnitude > 0.01f ? toCenter : Vector3.forward).eulerAngles.y;
            transform.rotation = Quaternion.Euler(0, yaw, 0);
            NetPos.Value = pos;
            NetYaw.Value = yaw;
            NetPitch.Value = 0;
            Hp.Value = MaxHp;
            Streak = 0;
            for (int i = 0; i < ammo.Length; i++) ammo[i] = WeaponCatalog.Get(i).magazine;
            pendingReload = -1;
            reloadUntil = 0;
            protectUntil = Time.time + SpawnProtection;
            Protected.Value = true;
            graceUntil = Time.time + 0.3f;
            lastStateTime = Time.time;
            Alive.Value = true;
            OnAliveChanged(false, true);
            TeleportRpc(pos, yaw, true);
        }

        public void ServerKill()
        {
            Alive.Value = false;
            Hp.Value = 0;
            OnAliveChanged(true, false);
        }

        public void ServerFire(int weaponIndex, Vector3 origin, Vector3[] dirs)
        {
            var w = WeaponCatalog.Get(weaponIndex);
            var match = MatchManager.Instance;
            if (w == null || !Alive.Value || match == null || !match.Playing) return;
            float now = Time.time;
            if (pendingReload == weaponIndex) return;
            if (pendingReload >= 0) pendingReload = -1; // switching weapons cancels a reload, like on the client
            if (now - lastShot[weaponIndex] < w.fireInterval * 0.85f) return; // rate-of-fire check
            if (ammo[weaponIndex] <= 0) return;
            if (dirs == null || dirs.Length < 1 || dirs.Length > w.pellets) return;

            lastShot[weaponIndex] = now;
            ammo[weaponIndex]--;
            Weapon.Value = weaponIndex;
            Protected.Value = false;
            protectUntil = 0;
            if ((origin - Eye).sqrMagnitude > 2.5f * 2.5f) origin = Eye; // shots must start at our own eye

            Physics.SyncTransforms();
            var ends = new Vector3[dirs.Length];
            var damage = new Dictionary<PlayerNetwork, (int dmg, bool head, Vector3 at)>();
            for (int i = 0; i < dirs.Length; i++)
            {
                Vector3 d = dirs[i];
                float m = d.sqrMagnitude;
                if (m < 0.25f || m > 2.25f || float.IsNaN(m)) { ends[i] = origin; continue; }
                d.Normalize();
                if (Raycast(origin, d, w.range, out var hit, out var target, out bool isHead))
                {
                    ends[i] = hit.point;
                    if (target != null)
                    {
                        damage.TryGetValue(target, out var e);
                        damage[target] = (e.dmg + w.DamageAt(hit.distance, isHead), e.head || isHead, hit.point);
                    }
                }
                else ends[i] = origin + d * w.range;
            }
            ShotFxRpc(weaponIndex, origin, ends);
            foreach (var kv in damage) kv.Key.ServerDamage(this, kv.Value.dmg, kv.Value.head, weaponIndex, kv.Value.at);
        }

        static readonly RaycastHit[] hits = new RaycastHit[32];

        bool Raycast(Vector3 o, Vector3 d, float range, out RaycastHit best, out PlayerNetwork target, out bool isHead)
        {
            best = default; target = null; isHead = false;
            int n = Physics.RaycastNonAlloc(o, d, hits, range, ~0, QueryTriggerInteraction.Collide);
            float bestDist = float.MaxValue;
            bool found = false;
            for (int i = 0; i < n; i++)
            {
                var h = hits[i];
                if (h.distance >= bestDist) continue;
                var hb = h.collider.GetComponent<HeadHitbox>();
                var pn = h.collider.GetComponentInParent<PlayerNetwork>();
                if (pn == this) continue;
                if (h.collider.isTrigger && hb == null) continue;
                if (pn != null && !pn.Alive.Value) continue;
                best = h; bestDist = h.distance; found = true;
                target = pn; isHead = hb != null;
            }
            return found;
        }

        public void ServerDamage(PlayerNetwork attacker, int dmg, bool isHead, int weaponIndex, Vector3 at)
        {
            if (!Alive.Value || Time.time < protectUntil) return;
            Hp.Value = Mathf.Max(0, Hp.Value - dmg);
            lastHurt = Time.time;
            regen = 0;
            LastAttacker = attacker.NetworkObjectId;
            bool kill = Hp.Value <= 0;
            attacker.HitConfirmRpc(dmg, isHead, kill, at);
            HurtRpc(attacker.transform.position);
            if (IsBot.Value) GetComponent<BotBrain>().OnAttacked(attacker);
            if (kill) MatchManager.Instance.ServerOnKill(attacker, this, weaponIndex, isHead);
        }

        public void ServerReload(int weaponIndex)
        {
            var w = WeaponCatalog.Get(weaponIndex);
            if (w == null || !Alive.Value || pendingReload >= 0 || ammo[weaponIndex] >= w.magazine) return;
            pendingReload = weaponIndex;
            reloadUntil = Time.time + w.reloadTime * 0.9f;
        }

        public int ServerAmmo(int weaponIndex) => ammo[weaponIndex];
        public void ServerHeal(int amount) => Hp.Value = Mathf.Min(MaxHp, Hp.Value + amount);

        // ---------------- RPCs ----------------
        // Only the owning client may drive its player (RPCs are callable by anyone by default)
        bool FromOwner(RpcParams p) => p.Receive.SenderClientId == OwnerClientId;

        [Rpc(SendTo.Server)]
        void SetNameRpc(string name, RpcParams rpcParams = default)
        {
            if (!FromOwner(rpcParams)) return;
            SetIdentity(name);
            MatchManager.Instance?.Sys($"{DisplayName} הצטרף/ה לזירה");
        }

        [Rpc(SendTo.Server, Delivery = RpcDelivery.Unreliable)]
        public void SubmitStateRpc(Vector3 pos, float yaw, float pitch, int weapon, RpcParams rpcParams = default)
        {
            if (!FromOwner(rpcParams) || !Alive.Value || Time.time < graceUntil) return;
            float dt = Mathf.Min(0.5f, Time.time - lastStateTime);
            lastStateTime = Time.time;
            Vector3 cur = IsOwner ? pos : transform.position;
            Vector3 delta = pos - (IsOwner ? NetPos.Value : cur);
            float dh = new Vector2(delta.x, delta.z).magnitude;
            // Speed sanity check (generous for latency); otherwise snap the player back
            if (dh > PlayerMotor.Speed * 1.6f * dt + 0.6f || Mathf.Abs(delta.y) > 14f * dt + 0.8f)
            {
                graceUntil = Time.time + 0.25f;
                TeleportRpc(IsOwner ? NetPos.Value : cur, yaw, false);
                return;
            }
            if (!IsOwner)
            {
                transform.position = pos;
                transform.rotation = Quaternion.Euler(0, yaw, 0);
            }
            NetPos.Value = pos;
            NetYaw.Value = yaw;
            NetPitch.Value = Mathf.Clamp(pitch, -89f, 89f);
            if (WeaponCatalog.Get(weapon) != null) Weapon.Value = weapon;
        }

        [Rpc(SendTo.Server)]
        public void FireRpc(int weapon, Vector3 origin, Vector3[] dirs, RpcParams rpcParams = default)
        {
            if (FromOwner(rpcParams)) ServerFire(weapon, origin, dirs);
        }

        [Rpc(SendTo.Server)]
        public void ReloadRpc(int weapon, RpcParams rpcParams = default)
        {
            if (FromOwner(rpcParams)) ServerReload(weapon);
        }

        [Rpc(SendTo.Owner)]
        void TeleportRpc(Vector3 pos, float yaw, bool respawn)
        {
            if (IsBot.Value) return;
            PlayerMotor.Teleport(cc, pos);
            cc.enabled = true;
            var ctrl = GetComponent<PlayerController>();
            if (ctrl.enabled) ctrl.OnTeleported(yaw, respawn);
        }

        [Rpc(SendTo.Owner)]
        void HitConfirmRpc(int dmg, bool isHead, bool kill, Vector3 at)
        {
            if (!IsBot.Value) GameEvents.RaiseHit(dmg, isHead, kill, at);
        }

        [Rpc(SendTo.Owner)]
        void HurtRpc(Vector3 from)
        {
            if (!IsBot.Value) GameEvents.RaiseHurt(from);
        }

        [Rpc(SendTo.Everyone)]
        void ShotFxRpc(int weapon, Vector3 origin, Vector3[] ends)
        {
            if (IsLocalHuman || Fx.I == null) return; // the shooter already drew its own effects
            var w = WeaponCatalog.Get(weapon);
            if (w == null) return;
            Vector3 muzzle = GetComponent<PlayerVisual>().Muzzle;
            foreach (var e in ends)
            {
                Fx.I.Tracer(muzzle, e, w.color);
                Fx.I.Sparks(e, new Color(1f, 0.84f, 0.3f), 3);
            }
            Fx.I.Shot(w.id, origin, false);
        }
    }
}
