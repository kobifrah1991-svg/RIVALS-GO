using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace ArenaRush
{
    // Works with both the new Input System (Unity 6 default) and the legacy Input Manager.
    public static class InputWrap
    {
#if ENABLE_INPUT_SYSTEM
        static Keyboard K => Keyboard.current;
        static Mouse M => Mouse.current;
        static bool Held(Key k) => K != null && K[k].isPressed;
        static bool Down(Key k) => K != null && K[k].wasPressedThisFrame;
        static bool Up(Key k) => K != null && K[k].wasReleasedThisFrame;

        public static Vector2 Move()
        {
            float x = (Held(Key.D) || Held(Key.RightArrow) ? 1 : 0) - (Held(Key.A) || Held(Key.LeftArrow) ? 1 : 0);
            float y = (Held(Key.W) || Held(Key.UpArrow) ? 1 : 0) - (Held(Key.S) || Held(Key.DownArrow) ? 1 : 0);
            var pad = Gamepad.current;
            if (pad != null) { var s = pad.leftStick.ReadValue(); x += s.x; y += s.y; }
            return Vector2.ClampMagnitude(new Vector2(x, y), 1f);
        }
        public static Vector2 Look()
        {
            Vector2 d = M != null ? M.delta.ReadValue() : Vector2.zero;
            var pad = Gamepad.current;
            if (pad != null) d += pad.rightStick.ReadValue() * 900f * Time.deltaTime;
            return d;
        }
        public static bool Fire() => (M != null && M.leftButton.isPressed) || (Gamepad.current?.rightTrigger.isPressed ?? false);
        public static bool FireReleased() => (M != null && M.leftButton.wasReleasedThisFrame) || (Gamepad.current?.rightTrigger.wasReleasedThisFrame ?? false);
        public static bool Aim() => (M != null && M.rightButton.isPressed) || (Gamepad.current?.leftTrigger.isPressed ?? false);
        public static bool Jump() => Down(Key.Space) || (Gamepad.current?.buttonSouth.wasPressedThisFrame ?? false);
        public static bool Reload() => Down(Key.R) || (Gamepad.current?.buttonWest.wasPressedThisFrame ?? false);
        public static bool NextWeapon() => Down(Key.Q) || (Gamepad.current?.buttonNorth.wasPressedThisFrame ?? false);
        public static float Scroll() => M != null ? M.scroll.ReadValue().y : 0f;
        public static bool Digit(int n) => n >= 1 && n <= 9 && Down(Key.Digit1 + (n - 1));
        public static bool ScoreHeld() => Held(Key.Tab) || (Gamepad.current?.selectButton.isPressed ?? false);
        public static bool Chat() => Down(Key.Enter) || Down(Key.T);
        public static bool Quick() => Down(Key.B);
        public static bool Escape() => Down(Key.Escape);
        public static bool AnyClick() => M != null && M.leftButton.wasPressedThisFrame;
#else
        public static Vector2 Move() => Vector2.ClampMagnitude(new Vector2(Input.GetAxisRaw("Horizontal"), Input.GetAxisRaw("Vertical")), 1f);
        public static Vector2 Look() => new Vector2(Input.GetAxisRaw("Mouse X"), Input.GetAxisRaw("Mouse Y")) * 10f;
        public static bool Fire() => Input.GetMouseButton(0);
        public static bool FireReleased() => Input.GetMouseButtonUp(0);
        public static bool Aim() => Input.GetMouseButton(1);
        public static bool Jump() => Input.GetKeyDown(KeyCode.Space);
        public static bool Reload() => Input.GetKeyDown(KeyCode.R);
        public static bool NextWeapon() => Input.GetKeyDown(KeyCode.Q);
        public static float Scroll() => Input.mouseScrollDelta.y;
        public static bool Digit(int n) => n >= 1 && n <= 9 && Input.GetKeyDown(KeyCode.Alpha1 + (n - 1));
        public static bool ScoreHeld() => Input.GetKey(KeyCode.Tab);
        public static bool Chat() => Input.GetKeyDown(KeyCode.Return) || Input.GetKeyDown(KeyCode.T);
        public static bool Quick() => Input.GetKeyDown(KeyCode.B);
        public static bool Escape() => Input.GetKeyDown(KeyCode.Escape);
        public static bool AnyClick() => Input.GetMouseButtonDown(0);
#endif
    }
}
