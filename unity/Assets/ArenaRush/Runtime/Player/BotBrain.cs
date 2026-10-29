using UnityEngine;

namespace ArenaRush
{
    // Server-side bot for practice mode and to fill empty slots (GDD §5).
    public class BotBrain : MonoBehaviour
    {
        const float SightRange = 45f;

        PlayerNetwork pn;
        CharacterController cc;
        Vector3 vel;
        Vector3? waypoint;
        float stuck, strafe = 1, strafeTimer, reactAt, aimError, yaw, pitch, lastSeen;
        PlayerNetwork target;

        void OnEnable()
        {
            pn = GetComponent<PlayerNetwork>();
            cc = GetComponent<CharacterController>();
            yaw = transform.eulerAngles.y;
        }

        public void OnAttacked(PlayerNetwork attacker)
        {
            if (target == null) { target = attacker; lastSeen = Time.time; }
        }

        void Update()
        {
            if (!pn.IsSpawned || !pn.Alive.Value) { target = null; return; }
            var match = MatchManager.Instance;
            if (match == null || !match.Playing) return;
            float dt = Time.deltaTime;
            Vector2 input = Vector2.zero;
            bool jump = false;

            PickTarget();
            if (target != null)
            {
                Vector3 to = target.transform.position - transform.position;
                float dist = to.magnitude;
                Vector3 aimPoint = target.transform.position + Vector3.up * 1.0f;
                Vector3 aimDir = aimPoint - pn.Eye;
                float wantYaw = Mathf.Atan2(aimDir.x, aimDir.z) * Mathf.Rad2Deg;
                float wantPitch = -Mathf.Atan2(aimDir.y, new Vector2(aimDir.x, aimDir.z).magnitude) * Mathf.Rad2Deg;
                yaw = Mathf.LerpAngle(yaw, wantYaw, Mathf.Min(1, dt * 6));
                pitch = Mathf.Lerp(pitch, wantPitch, Mathf.Min(1, dt * 6));
                aimError = Mathf.Max(0.055f, aimError - dt * 0.15f);

                strafeTimer -= dt;
                if (strafeTimer <= 0) { strafe = Random.value < 0.5f ? -1 : 1; strafeTimer = Random.Range(0.6f, 1.8f); }
                input = new Vector2(strafe, dist > 18 ? 1 : dist < 6 ? -0.6f : 0);

                int weapon = dist < 7 ? 1 : 0; // shotgun up close, rifle otherwise
                var w = WeaponCatalog.Get(weapon);
                if (pn.ServerAmmo(weapon) <= 0) pn.ServerReload(weapon);
                if (Time.time > reactAt && Mathf.Abs(Mathf.DeltaAngle(yaw, wantYaw)) < 15f)
                {
                    var dirs = new Vector3[w.pellets];
                    for (int i = 0; i < dirs.Length; i++)
                    {
                        float e = (aimError + w.hipSpread) * Mathf.Rad2Deg;
                        dirs[i] = Quaternion.Euler(pitch + Random.Range(-e, e), yaw + Random.Range(-e, e), 0) * Vector3.forward;
                    }
                    pn.ServerFire(weapon, pn.Eye, dirs);
                }
            }
            else
            {
                if (waypoint == null || Flat(waypoint.Value - transform.position) < 1.5f || stuck > 1.2f)
                {
                    waypoint = Arena.Waypoints[Random.Range(0, Arena.Waypoints.Length)];
                    stuck = 0;
                }
                Vector3 to = waypoint.Value - transform.position;
                yaw = Mathf.LerpAngle(yaw, Mathf.Atan2(to.x, to.z) * Mathf.Rad2Deg, Mathf.Min(1, dt * 5));
                pitch = Mathf.Lerp(pitch, 0, dt * 3);
                input = new Vector2(0, 1);
                stuck = Flat(vel) < 1.5f ? stuck + dt : 0;
                jump = stuck > 0.4f;
            }

            transform.rotation = Quaternion.Euler(0, yaw, 0);
            PlayerMotor.Step(cc, ref vel, input, jump, yaw, false, dt);
            pn.NetYaw.Value = yaw;
            pn.NetPitch.Value = pitch;
        }

        void PickTarget()
        {
            PlayerNetwork best = null;
            float bestDist = SightRange;
            foreach (var o in PlayerNetwork.All)
            {
                if (o == pn || !o.Alive.Value || o.Protected.Value) continue;
                float d = Vector3.Distance(o.transform.position, transform.position);
                bool remembered = o == target && Time.time - lastSeen < 2f;
                if ((d < bestDist || remembered) && CanSee(o)) { best = o; bestDist = d; }
            }
            if (best != null && best != target) { reactAt = Time.time + Random.Range(0.5f, 1f); aimError = 0.3f; }
            if (best != null) lastSeen = Time.time;
            target = best;
        }

        bool CanSee(PlayerNetwork o)
        {
            Vector3 from = pn.Eye, to = o.transform.position + Vector3.up * 1.2f;
            if (Physics.Raycast(from, to - from, out var hit, Vector3.Distance(from, to), ~0, QueryTriggerInteraction.Ignore))
                return hit.collider.GetComponentInParent<PlayerNetwork>() == o;
            return true;
        }

        static float Flat(Vector3 v) => new Vector2(v.x, v.z).magnitude;
    }
}
