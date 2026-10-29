using UnityEngine;

namespace ArenaRush
{
    // Movement shared by the local player and server-side bots.
    public static class PlayerMotor
    {
        public const float Speed = 7.5f;
        public const float AdsSpeed = 4.2f;
        public const float JumpSpeed = 8f;
        public const float Gravity = 22f;
        public const float EyeHeight = 1.6f;
        public const float Height = 1.8f;
        public const float Radius = 0.4f;

        public static void Step(CharacterController cc, ref Vector3 vel, Vector2 input, bool jump, float yawDeg, bool ads, float dt)
        {
            if (!cc.enabled) return;
            var rot = Quaternion.Euler(0, yawDeg, 0);
            Vector3 wish = rot * new Vector3(input.x, 0, input.y) * (ads ? AdsSpeed : Speed);
            float accel = cc.isGrounded ? 14f : 4f;
            vel.x = Mathf.Lerp(vel.x, wish.x, Mathf.Min(1, accel * dt));
            vel.z = Mathf.Lerp(vel.z, wish.z, Mathf.Min(1, accel * dt));
            if (cc.isGrounded)
            {
                if (vel.y < 0) vel.y = -2f;
                if (jump) vel.y = JumpSpeed;
            }
            vel.y -= Gravity * dt;
            var flags = cc.Move(vel * dt);
            if ((flags & CollisionFlags.Above) != 0 && vel.y > 0) vel.y = 0;
            if (cc.transform.position.y < -20) Teleport(cc, new Vector3(0, 3, 0));
        }

        public static void Teleport(CharacterController cc, Vector3 pos)
        {
            bool was = cc.enabled;
            cc.enabled = false;
            cc.transform.position = pos;
            cc.enabled = was;
        }

        public static void Configure(CharacterController cc)
        {
            cc.height = Height;
            cc.radius = Radius;
            cc.center = new Vector3(0, Height / 2, 0);
            cc.stepOffset = 0.45f;
            cc.slopeLimit = 50f;
            cc.skinWidth = 0.05f;
            cc.minMoveDistance = 0f;
        }
    }
}
