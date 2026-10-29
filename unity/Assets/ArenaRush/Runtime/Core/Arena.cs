using System.Collections.Generic;
using UnityEngine;

namespace ArenaRush
{
    // "Neon Warehouse" arena (GDD §15), built from boxes at startup so it needs no art assets yet.
    public static class Arena
    {
        public const string MapName = "מחסן ניאון";

        public static readonly Vector3[] Spawns =
        {
            new Vector3(-26, 0, 0), new Vector3(26, 0, 0), new Vector3(0, 0, -27), new Vector3(0, 0, 27),
            new Vector3(-24, 0, 24), new Vector3(24, 0, -24), new Vector3(-25, 2, -25), new Vector3(25, 2, 25),
            new Vector3(-10, 0, -26), new Vector3(10, 0, 26), new Vector3(-26, 0, 12), new Vector3(26, 0, -12),
        };

        public static readonly Vector3[] Waypoints =
        {
            new Vector3(-24, 0, 0), new Vector3(24, 0, 0), new Vector3(0, 0, -24), new Vector3(0, 0, 24), new Vector3(0, 3, 0),
            new Vector3(-18, 0, -18), new Vector3(18, 0, 18), new Vector3(-18, 0, 18), new Vector3(18, 0, -18),
            new Vector3(-8, 0, 0), new Vector3(8, 0, 0), new Vector3(0, 0, 10), new Vector3(0, 0, -10),
            new Vector3(-25, 2, -25), new Vector3(25, 2, 25),
        };

        static Transform root;

        public static void Build()
        {
            if (root != null) return;
            root = new GameObject("Arena").transform;

            Box(-32, -1, -32, 32, 0, 32, 0x14162a);
            Box(-32, 0, -32, 32, 6, -31, 0x1e2240);
            Box(-32, 0, 31, 32, 6, 32, 0x1e2240);
            Box(-32, 0, -31, -31, 6, 31, 0x1e2240);
            Box(31, 0, -31, 32, 6, 31, 0x1e2240);

            // Central platform with stairs on both sides
            Box(-4, 0, -4, 4, 3, 4, 0x3a2f6b);
            for (int i = 0; i < 7; i++)
            {
                float h = (i + 1) * 0.43f;
                Box(-1.5f, 0, 4 + (6 - i) * 0.57f, 1.5f, h, 4 + (7 - i) * 0.57f, 0x51438f);
                Box(-1.5f, 0, -4 - (7 - i) * 0.57f, 1.5f, h, -4 - (6 - i) * 0.57f, 0x51438f);
            }
            Box(-4, 3, -4, -2, 3.8f, -3.6f, 0xff2e88, true);
            Box(2, 3, 3.6f, 4, 3.8f, 4, 0xff2e88, true);

            // Long cover walls
            Box(-14, 0, -2, -13, 2.5f, 10, 0x24406b);
            Box(13, 0, -10, 14, 2.5f, 2, 0x24406b);
            Box(-6, 0, -18, 8, 2.5f, -17, 0x24406b);
            Box(-8, 0, 17, 6, 2.5f, 18, 0x24406b);

            // Corner platforms with a crate to jump from
            Box(-28, 0, -28, -22, 2, -22, 0x3a2f6b);
            Box(-22, 0, -25.5f, -20.5f, 1.2f, -24, 0xffb300);
            Box(22, 0, 22, 28, 2, 28, 0x3a2f6b);
            Box(20.5f, 0, 24, 22, 1.2f, 25.5f, 0xffb300);

            foreach (var p in new[] { new Vector2(10, 10), new Vector2(-10, 10), new Vector2(10, -10), new Vector2(-10, -10) })
                Box(p.x - 0.6f, 0, p.y - 0.6f, p.x + 0.6f, 6, p.y + 0.6f, 0x00e5ff, true);

            foreach (var p in new[] { new Vector2(-20, 6), new Vector2(-19, 7.6f), new Vector2(18, -6), new Vector2(6, 24), new Vector2(-6, -24),
                         new Vector2(22, -20), new Vector2(-22, 18), new Vector2(-3, 12), new Vector2(4, -12), new Vector2(24, 4), new Vector2(-25, -6) })
                Box(p.x - 0.75f, 0, p.y - 0.75f, p.x + 0.75f, 1.2f, p.y + 0.75f, 0xffb300);
            Box(18, 0, 14, 19.5f, 2.4f, 15.5f, 0xff6d00);
            Box(-19.5f, 0, -15.5f, -18, 2.4f, -14, 0xff6d00);

            // Lighting and atmosphere
            if (Object.FindFirstObjectByType<Light>() == null)
            {
                var sun = new GameObject("Sun").AddComponent<Light>();
                sun.type = LightType.Directional;
                sun.intensity = 1.2f;
                sun.shadows = LightShadows.Soft;
                sun.transform.rotation = Quaternion.Euler(55, -30, 0);
            }
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.35f, 0.38f, 0.55f);
            RenderSettings.fog = true;
            RenderSettings.fogColor = Hex(0x0b0c1a);
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogStartDistance = 40;
            RenderSettings.fogEndDistance = 110;
        }

        static void Box(float x0, float y0, float z0, float x1, float y1, float z1, int color, bool glow = false)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = "Block";
            go.transform.SetParent(root, false);
            go.transform.position = new Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
            go.transform.localScale = new Vector3(x1 - x0, y1 - y0, z1 - z0);
            go.GetComponent<Renderer>().sharedMaterial = Materials.Get(Hex(color), glow ? 0.8f : 0f);
            go.isStatic = true;
        }

        public static Color Hex(int rgb) => new Color(((rgb >> 16) & 255) / 255f, ((rgb >> 8) & 255) / 255f, (rgb & 255) / 255f);

        public static Vector3 PickSpawn(IEnumerable<Vector3> enemies)
        {
            Vector3 best = Spawns[0];
            float bestScore = -1;
            foreach (var s in Spawns)
            {
                float d = 1e9f;
                foreach (var e in enemies) d = Mathf.Min(d, Vector3.Distance(e, s));
                float score = d + Random.value * 6f;
                if (score > bestScore) { bestScore = score; best = s; }
            }
            return best;
        }
    }

    // Material cache. Base materials come from Resources so their shaders are included in builds.
    public static class Materials
    {
        static readonly Dictionary<(Color, float), Material> cache = new Dictionary<(Color, float), Material>();
        static Material litBase, lineBase;

        public static Material Get(Color color, float glow = 0f)
        {
            if (cache.TryGetValue((color, glow), out var m)) return m;
            if (litBase == null)
            {
                litBase = Resources.Load<Material>("ArenaRush/ArenaLit");
                if (litBase == null) litBase = new Material(Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard"));
            }
            m = new Material(litBase) { color = color };
            if (glow > 0)
            {
                m.EnableKeyword("_EMISSION");
                m.SetColor("_EmissionColor", color * glow);
            }
            cache[(color, glow)] = m;
            return m;
        }

        public static Material Line()
        {
            if (lineBase == null)
            {
                lineBase = Resources.Load<Material>("ArenaRush/FxLine");
                if (lineBase == null) lineBase = new Material(Shader.Find("Sprites/Default"));
            }
            return lineBase;
        }
    }
}
