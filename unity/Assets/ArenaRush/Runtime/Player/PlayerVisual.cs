using UnityEngine;

namespace ArenaRush
{
    // Placeholder character: coloured body, head, gun in hand, name tag and spawn shield.
    public class PlayerVisual : MonoBehaviour
    {
        PlayerNetwork pn;
        Transform headPivot, arm, nameTag;
        GameObject[] guns;
        GameObject shield, body;
        TextMesh label;
        int shownWeapon = -1;
        string shownName;

        public Vector3 Muzzle => arm != null ? arm.TransformPoint(new Vector3(0, 0.03f, 0.85f)) : transform.position + Vector3.up * 1.3f;

        public void Init(PlayerNetwork owner)
        {
            pn = owner;
            body = new GameObject("Body");
            body.transform.SetParent(transform, false);
            Part(PrimitiveType.Cube, body.transform, new Vector3(0, 0.7f, 0), new Vector3(0.8f, 1.4f, 0.5f), pn.Color, 0.15f);
            headPivot = new GameObject("HeadPivot").transform;
            headPivot.SetParent(body.transform, false);
            headPivot.localPosition = new Vector3(0, 1.4f, 0);
            Part(PrimitiveType.Cube, headPivot, new Vector3(0, 0.22f, 0), new Vector3(0.5f, 0.45f, 0.5f), new Color(1f, 0.88f, 0.74f));
            Part(PrimitiveType.Cube, headPivot, new Vector3(0, 0.26f, 0.26f), new Vector3(0.42f, 0.12f, 0.05f), new Color(0.07f, 0.07f, 0.13f));
            arm = new GameObject("Arm").transform;
            arm.SetParent(body.transform, false);
            arm.localPosition = new Vector3(0.32f, 1.25f, 0.2f);
            var all = WeaponCatalog.All;
            guns = new GameObject[all.Length];
            for (int i = 0; i < all.Length; i++) { guns[i] = GunModels.Build(all[i], arm, 1.1f); guns[i].SetActive(false); }
            shield = Part(PrimitiveType.Sphere, transform, new Vector3(0, 0.9f, 0), Vector3.one * 2.4f, Color.white);
            var sr = shield.GetComponent<Renderer>();
            sr.sharedMaterial = new Material(Materials.Line()) { color = new Color(0f, 0.9f, 1f, 0.18f) }; // translucent bubble
            sr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            shield.SetActive(false);

            nameTag = new GameObject("NameTag").transform;
            nameTag.SetParent(transform, false);
            nameTag.localPosition = new Vector3(0, 2.35f, 0);
            label = nameTag.gameObject.AddComponent<TextMesh>();
            var font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            label.font = font;
            nameTag.GetComponent<MeshRenderer>().sharedMaterial = font.material;
            label.fontSize = 64;
            label.characterSize = 0.04f;
            label.anchor = TextAnchor.MiddleCenter;
            label.alignment = TextAlignment.Center;

            // Our own body is invisible to us; we see the view model instead
            if (pn.IsLocalHuman)
            {
                foreach (var r in body.GetComponentsInChildren<Renderer>()) r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.ShadowsOnly;
                nameTag.gameObject.SetActive(false);
            }
        }

        static GameObject Part(PrimitiveType type, Transform parent, Vector3 pos, Vector3 scale, Color color, float glow = 0f)
        {
            var go = GameObject.CreatePrimitive(type);
            Destroy(go.GetComponent<Collider>());
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos;
            go.transform.localScale = scale;
            go.GetComponent<Renderer>().sharedMaterial = Materials.Get(color, glow);
            return go;
        }

        void LateUpdate()
        {
            if (pn == null || !pn.IsSpawned) return;
            bool alive = pn.Alive.Value;
            body.SetActive(alive);
            nameTag.gameObject.SetActive(alive && !pn.IsLocalHuman);
            shield.SetActive(alive && pn.Protected.Value && !pn.IsLocalHuman);

            if (shownName != pn.DisplayName)
            {
                shownName = pn.DisplayName;
                label.text = Rtl.Fix((pn.IsBot.Value ? "BOT " : "") + shownName);
                label.color = pn.Color;
                foreach (var r in body.transform.GetChild(0).GetComponents<Renderer>()) r.sharedMaterial = Materials.Get(pn.Color, 0.15f);
            }
            if (shownWeapon != pn.Weapon.Value)
            {
                shownWeapon = pn.Weapon.Value;
                for (int i = 0; i < guns.Length; i++) guns[i].SetActive(i == shownWeapon);
            }
            float pitch = pn.NetPitch.Value;
            headPivot.localRotation = Quaternion.Euler(pitch * 0.6f, 0, 0);
            arm.localRotation = Quaternion.Euler(pitch, 0, 0);
            var cam = Camera.main;
            if (cam) nameTag.rotation = cam.transform.rotation;
        }
    }
}
