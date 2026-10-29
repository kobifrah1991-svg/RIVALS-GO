using System.Collections.Generic;
using UnityEngine;

namespace ArenaRush
{
    // Tracers, impact sparks and procedurally generated sounds (no audio assets needed yet).
    public class Fx : MonoBehaviour
    {
        public static Fx I { get; private set; }

        AudioSource ui;
        readonly Dictionary<string, AudioClip> shots = new Dictionary<string, AudioClip>();
        public AudioClip Hit, Head, Kill, Hurt, Reload, Empty, Chat;

        struct Live { public Transform t; public LineRenderer line; public float life, max; public Vector3 vel; }
        readonly List<Live> live = new List<Live>();
        readonly Stack<LineRenderer> linePool = new Stack<LineRenderer>();
        readonly Stack<Transform> sparkPool = new Stack<Transform>();

        public static void Init()
        {
            if (I != null) return;
            I = new GameObject("Fx").AddComponent<Fx>();
        }

        void Awake()
        {
            ui = gameObject.AddComponent<AudioSource>();
            ui.spatialBlend = 0;
            shots["rifle"] = Gunshot(0.13f, 0.35f, 120);
            shots["shotgun"] = Gunshot(0.32f, 0.18f, 70);
            shots["sniper"] = Gunshot(0.5f, 0.25f, 55);
            shots["pistol"] = Gunshot(0.11f, 0.45f, 160);
            Hit = Tone(new[] { 1400f }, 0.05f, 0.25f);
            Head = Tone(new[] { 1900f, 2500f }, 0.12f, 0.25f);
            Kill = Tone(new[] { 660f, 990f, 1320f }, 0.35f, 0.35f);
            Hurt = Tone(new[] { 140f }, 0.15f, 0.4f, true);
            Reload = Tone(new[] { 500f, 0f, 700f }, 0.3f, 0.15f);
            Empty = Tone(new[] { 300f }, 0.03f, 0.15f);
            Chat = Tone(new[] { 880f }, 0.05f, 0.1f);
        }

        public void Play(AudioClip clip, float vol = 1f) { if (clip) ui.PlayOneShot(clip, vol); }

        public void Shot(string weapon, Vector3 pos, bool local)
        {
            if (!shots.TryGetValue(weapon, out var clip)) return;
            if (local) ui.PlayOneShot(clip, 0.8f);
            else AudioSource.PlayClipAtPoint(clip, pos, 1f);
        }

        public void Tracer(Vector3 from, Vector3 to, Color color)
        {
            var lr = linePool.Count > 0 ? linePool.Pop() : NewLine();
            lr.gameObject.SetActive(true);
            lr.SetPosition(0, from);
            lr.SetPosition(1, to);
            lr.startColor = lr.endColor = color;
            live.Add(new Live { line = lr, t = lr.transform, life = 0.08f, max = 0.08f });
        }

        public void Sparks(Vector3 at, Color color, int n = 5)
        {
            for (int i = 0; i < n; i++)
            {
                var t = sparkPool.Count > 0 ? sparkPool.Pop() : NewSpark();
                t.gameObject.SetActive(true);
                t.position = at;
                t.GetComponent<Renderer>().sharedMaterial = Materials.Get(color, 1.5f);
                live.Add(new Live { t = t, life = 0.35f, max = 0.35f, vel = new Vector3(Random.Range(-3f, 3f), Random.Range(0f, 5f), Random.Range(-3f, 3f)) });
            }
        }

        void Update()
        {
            float dt = Time.deltaTime;
            for (int i = live.Count - 1; i >= 0; i--)
            {
                var e = live[i];
                e.life -= dt;
                if (e.line)
                {
                    var c = e.line.startColor; c.a = Mathf.Clamp01(e.life / e.max);
                    e.line.startColor = e.line.endColor = c;
                }
                else
                {
                    e.vel.y -= 15f * dt;
                    e.t.position += e.vel * dt;
                    e.t.localScale = Vector3.one * 0.07f * Mathf.Clamp01(e.life / e.max);
                }
                if (e.life <= 0)
                {
                    e.t.gameObject.SetActive(false);
                    if (e.line) linePool.Push(e.line); else sparkPool.Push(e.t);
                    live.RemoveAt(i);
                }
                else live[i] = e;
            }
        }

        LineRenderer NewLine()
        {
            var lr = new GameObject("Tracer").AddComponent<LineRenderer>();
            lr.transform.SetParent(transform);
            lr.sharedMaterial = Materials.Line();
            lr.positionCount = 2;
            lr.startWidth = 0.03f;
            lr.endWidth = 0.015f;
            lr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            return lr;
        }

        Transform NewSpark()
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            Destroy(go.GetComponent<Collider>());
            go.transform.SetParent(transform);
            go.GetComponent<Renderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            return go.transform;
        }

        const int Rate = 44100;

        static AudioClip Gunshot(float dur, float brightness, float thumpHz)
        {
            int n = (int)(Rate * dur);
            var d = new float[n];
            float y = 0;
            for (int i = 0; i < n; i++)
            {
                float t = (float)i / Rate;
                float env = Mathf.Exp(-t * 6f / dur);
                y += brightness * (Random.Range(-1f, 1f) - y);
                float thump = Mathf.Sin(2 * Mathf.PI * thumpHz * t * (1 - 0.35f * t / dur)) * Mathf.Exp(-t * 10f / dur);
                d[i] = (y * 0.9f + thump * 0.7f) * env;
            }
            var clip = AudioClip.Create("shot", n, 1, Rate, false);
            clip.SetData(d, 0);
            return clip;
        }

        // Plays the frequencies one after another (0 = silence)
        static AudioClip Tone(float[] freqs, float dur, float vol, bool saw = false)
        {
            int n = (int)(Rate * dur);
            var d = new float[n];
            int seg = n / freqs.Length;
            for (int i = 0; i < n; i++)
            {
                int k = Mathf.Min(freqs.Length - 1, i / seg);
                float f = freqs[k];
                if (f <= 0) continue;
                float t = (float)i / Rate;
                float local = (float)(i - k * seg) / seg;
                float phase = f * t;
                float w = saw ? (phase - Mathf.Floor(phase)) * 2 - 1 : Mathf.Sign(Mathf.Sin(2 * Mathf.PI * phase)) * 0.6f;
                d[i] = w * vol * (1 - local);
            }
            var clip = AudioClip.Create("tone", n, 1, Rate, false);
            clip.SetData(d, 0);
            return clip;
        }
    }

    // Placeholder weapon meshes built from boxes, until real models are made in Blender.
    public static class GunModels
    {
        public static GameObject Build(WeaponData w, Transform parent, float scale = 1f)
        {
            var g = new GameObject(w.id);
            g.transform.SetParent(parent, false);
            var dark = Materials.Get(new Color(0.14f, 0.15f, 0.23f));
            var accent = Materials.Get(w.color, 0.6f);
            void B(float sx, float sy, float sz, float x, float y, float z, Material m = null)
            {
                var c = GameObject.CreatePrimitive(PrimitiveType.Cube);
                Object.Destroy(c.GetComponent<Collider>());
                c.transform.SetParent(g.transform, false);
                c.transform.localScale = new Vector3(sx, sy, sz) * scale;
                c.transform.localPosition = new Vector3(x, y, z) * scale;
                var r = c.GetComponent<Renderer>();
                r.sharedMaterial = m ?? dark;
                r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            }
            switch (w.id)
            {
                case "shotgun":
                    B(0.1f, 0.1f, 0.5f, 0, 0, 0.1f); B(0.05f, 0.05f, 0.35f, 0.025f, 0.02f, 0.5f); B(0.05f, 0.05f, 0.35f, -0.025f, 0.02f, 0.5f);
                    B(0.105f, 0.04f, 0.2f, 0, -0.05f, 0.35f, accent); B(0.08f, 0.1f, 0.2f, 0, -0.03f, -0.22f);
                    break;
                case "sniper":
                    B(0.07f, 0.09f, 0.7f, 0, 0, 0.1f); B(0.03f, 0.03f, 0.45f, 0, 0.01f, 0.65f); B(0.05f, 0.05f, 0.28f, 0, 0.1f, 0.1f, accent);
                    B(0.07f, 0.12f, 0.2f, 0, -0.03f, -0.3f);
                    break;
                case "pistol":
                    B(0.06f, 0.08f, 0.26f, 0, 0, 0.05f); B(0.055f, 0.14f, 0.06f, 0, -0.09f, -0.03f); B(0.065f, 0.02f, 0.2f, 0, 0.05f, 0.05f, accent);
                    break;
                default:
                    B(0.08f, 0.1f, 0.55f, 0, 0, 0.1f); B(0.04f, 0.04f, 0.3f, 0, 0.02f, 0.5f); B(0.06f, 0.14f, 0.06f, 0, -0.1f, 0.05f);
                    B(0.085f, 0.03f, 0.4f, 0, 0.065f, 0.1f, accent); B(0.07f, 0.1f, 0.18f, 0, -0.02f, -0.22f);
                    break;
            }
            return g;
        }
    }
}
