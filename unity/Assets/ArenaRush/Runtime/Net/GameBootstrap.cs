using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using Unity.Netcode;
using Unity.Netcode.Transports.UTP;
using UnityEngine;

namespace ArenaRush
{
    // Entry point: builds the arena, shows the main menu and starts hosting / joining.
    // Place one in the scene (the "Arena Rush > Build Game Scene" menu does this for you).
    public class GameBootstrap : MonoBehaviour
    {
        public GameObject playerPrefab;
        public GameObject matchPrefab;
        public ushort port = 7777;

        static GameBootstrap instance;
        NetworkManager nm;
        readonly HashSet<ulong> spawned = new HashSet<ulong>();
        string playerName, address, status = "";
        int bots;
        GUIStyle title, label, button, field;

        void Awake()
        {
            instance = this;
            Application.targetFrameRate = Application.isMobilePlatform ? 60 : 144;
            Arena.Build();
            Fx.Init();
            playerName = PlayerPrefs.GetString("arena.name", "");
            address = PlayerPrefs.GetString("arena.address", "127.0.0.1");
            bots = PlayerPrefs.GetInt("arena.bots", 4);
        }

        void Start()
        {
            nm = NetworkManager.Singleton != null ? NetworkManager.Singleton : FindFirstObjectByType<NetworkManager>();
            if (nm == null)
            {
                var go = new GameObject("NetworkManager");
                nm = go.AddComponent<NetworkManager>();
                var t = go.AddComponent<UnityTransport>();
                if (nm.NetworkConfig == null) nm.NetworkConfig = new NetworkConfig();
                nm.NetworkConfig.NetworkTransport = t;
            }
            // Everything networked is spawned from prefabs, so the scene itself never needs syncing
            nm.NetworkConfig.EnableSceneManagement = false;
            Register(playerPrefab);
            Register(matchPrefab);
            nm.OnServerStarted += OnServerStarted;
            nm.OnClientConnectedCallback += OnClientConnected;
            nm.OnClientDisconnectCallback += OnClientDisconnected;
            nm.OnClientStopped += OnStopped;
        }

        void Register(GameObject prefab)
        {
            if (prefab == null) { Debug.LogError("[Arena Rush] Missing prefab on GameBootstrap. Run 'Arena Rush > Build Game Scene'."); return; }
            try { nm.AddNetworkPrefab(prefab); } catch (System.Exception e) { Debug.LogWarning(e.Message); }
        }

        void OnDestroy()
        {
            if (nm == null) return;
            nm.OnServerStarted -= OnServerStarted;
            nm.OnClientConnectedCallback -= OnClientConnected;
            nm.OnClientDisconnectCallback -= OnClientDisconnected;
            nm.OnClientStopped -= OnStopped;
        }

        // ---------------- network ----------------
        void Host(bool practice)
        {
            Save();
            MatchManager.MinFighters = bots + 1; // the slider counts bots alongside one human
            var t = (UnityTransport)nm.NetworkConfig.NetworkTransport;
            t.SetConnectionData(practice ? "127.0.0.1" : "0.0.0.0", port, practice ? "127.0.0.1" : "0.0.0.0");
            status = nm.StartHost() ? "" : "לא הצלחתי לפתוח שרת. אולי הפורט תפוס?";
            if (nm.IsServer && !spawned.Contains(nm.LocalClientId)) SpawnPlayer(nm.LocalClientId);
        }

        void Join()
        {
            Save();
            var t = (UnityTransport)nm.NetworkConfig.NetworkTransport;
            t.SetConnectionData(address.Trim(), port);
            status = nm.StartClient() ? "מתחבר…" : "החיבור נכשל.";
        }

        void Save()
        {
            PlayerPrefs.SetString("arena.name", playerName);
            PlayerPrefs.SetString("arena.address", address);
            PlayerPrefs.SetInt("arena.bots", bots);
            PlayerPrefs.Save();
        }

        void OnServerStarted()
        {
            var match = Instantiate(matchPrefab);
            match.GetComponent<MatchManager>().PlayerPrefab = playerPrefab;
            match.GetComponent<NetworkObject>().Spawn(true);
        }

        void OnClientConnected(ulong clientId)
        {
            if (nm.IsServer && !spawned.Contains(clientId)) SpawnPlayer(clientId);
            if (clientId == nm.LocalClientId) status = "";
        }

        void SpawnPlayer(ulong clientId)
        {
            if (PlayerNetwork.All.Count(p => !p.IsBot.Value) >= MatchManager.MaxPlayers) { nm.DisconnectClient(clientId, "הזירה מלאה"); return; }
            spawned.Add(clientId);
            var pos = Arena.Spawns[Random.Range(0, Arena.Spawns.Length)];
            var go = Instantiate(playerPrefab, pos, Quaternion.identity);
            go.GetComponent<NetworkObject>().SpawnAsPlayerObject(clientId, true);
        }

        void OnClientDisconnected(ulong clientId)
        {
            spawned.Remove(clientId);
            if (!nm.IsServer && clientId == nm.LocalClientId)
                status = string.IsNullOrEmpty(nm.DisconnectReason) ? "החיבור לשרת נותק." : nm.DisconnectReason;
        }

        void OnStopped(bool wasHost)
        {
            spawned.Clear();
            PlayerController.LockCursor(false);
            if (string.IsNullOrEmpty(status) || status == "מתחבר…") status = "החיבור הסתיים.";
        }

        public static void Leave()
        {
            if (instance == null || instance.nm == null) return;
            instance.nm.Shutdown();
            instance.status = "";
            PlayerController.LockCursor(false);
        }

        static string LocalIp()
        {
            try
            {
                return Dns.GetHostEntry(Dns.GetHostName()).AddressList
                    .Where(a => a.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(a))
                    .Select(a => a.ToString()).FirstOrDefault() ?? "?";
            }
            catch { return "?"; }
        }

        // ---------------- main menu ----------------
        void OnGUI()
        {
            if (nm == null || nm.IsListening || nm.ShutdownInProgress) return;
            float s = Screen.height / 1080f;
            if (title == null)
            {
                title = new GUIStyle(GUI.skin.label) { fontStyle = FontStyle.Bold, alignment = TextAnchor.MiddleCenter };
                label = new GUIStyle(GUI.skin.label) { alignment = TextAnchor.MiddleRight };
                button = new GUIStyle(GUI.skin.button) { fontStyle = FontStyle.Bold };
                field = new GUIStyle(GUI.skin.textField);
            }
            title.fontSize = Mathf.RoundToInt(72 * s);
            label.fontSize = field.fontSize = Mathf.RoundToInt(24 * s);
            button.fontSize = Mathf.RoundToInt(30 * s);

            float W = Screen.width, H = Screen.height, bw = Mathf.Min(W - 32, 620 * s), bx = (W - bw) / 2, y = H * 0.08f, row = 52 * s;
            GUI.color = new Color(0.04f, 0.04f, 0.1f, 0.85f);
            GUI.DrawTexture(new Rect(0, 0, W, H), Texture2D.whiteTexture);
            GUI.color = Color.white;

            title.normal.textColor = new Color(1f, 0.18f, 0.53f);
            GUI.Label(new Rect(0, y, W, 90 * s), "ARENA RUSH", title);
            y += 100 * s;
            label.alignment = TextAnchor.MiddleCenter;
            label.normal.textColor = new Color(0.7f, 0.75f, 0.9f);
            GUI.Label(new Rect(0, y, W, row), Rtl.Fix($"יריות בגוף ראשון · כולם נגד כולם · ראשון ל-{MatchManager.KillLimit} הריגות"), label);
            y += row;
            GUI.Label(new Rect(0, y, W, row), Rtl.Fix($"רמה {PlayerPrefs.GetInt("arena.level", 1)} · {PlayerPrefs.GetInt("arena.xp", 0)} XP"), label);
            y += row * 1.2f;
            label.alignment = TextAnchor.MiddleRight;
            label.normal.textColor = Color.white;

            GUI.Label(new Rect(bx, y, bw, row), Rtl.Fix("שם בזירה (אנגלית או עברית):"), label); y += row;
            playerName = GUI.TextField(new Rect(bx, y, bw, row), playerName, 16, field);
            y += row;
            if (playerName.Length > 0) { label.normal.textColor = new Color(0.6f, 0.9f, 1f); GUI.Label(new Rect(bx, y, bw, row), Rtl.Fix(playerName), label); label.normal.textColor = Color.white; }
            y += row * 0.9f;

            GUI.Label(new Rect(bx, y, bw, row), Rtl.Fix($"בוטים: {bots}"), label);
            bots = Mathf.RoundToInt(GUI.HorizontalSlider(new Rect(bx, y + row * 0.4f, bw * 0.6f, row), bots, 0, 8));
            y += row * 1.2f;

            if (GUI.Button(new Rect(bx, y, bw, row * 1.4f), Rtl.Fix("אימון נגד בוטים"), button)) Host(true);
            y += row * 1.6f;
            if (GUI.Button(new Rect(bx, y, bw, row * 1.4f), Rtl.Fix("ארח משחק (חברים מצטרפים אליך)"), button)) Host(false);
            y += row * 1.6f;

            GUI.Label(new Rect(bx, y, bw, row), Rtl.Fix("כתובת IP של המארח:"), label); y += row;
            address = GUI.TextField(new Rect(bx + bw * 0.4f, y, bw * 0.6f, row), address, 40, field);
            if (GUI.Button(new Rect(bx, y, bw * 0.38f, row), Rtl.Fix("הצטרף"), button)) Join();
            y += row * 1.3f;

            label.alignment = TextAnchor.MiddleCenter;
            label.normal.textColor = new Color(0.7f, 0.75f, 0.9f);
            GUI.Label(new Rect(0, y, W, row), Rtl.Fix($"ה-IP שלך ברשת: {LocalIp()} · פורט {port}"), label); y += row;
            label.normal.textColor = new Color(1f, 0.84f, 0f);
            if (!string.IsNullOrEmpty(status)) GUI.Label(new Rect(0, y, W, row), Rtl.Fix(status), label);
            y += row;
            label.normal.textColor = new Color(0.6f, 0.65f, 0.8f);
            GUI.Label(new Rect(0, H - row * 1.5f, W, row), Rtl.Fix("הצ'אט מסונן: בלי קללות, קישורים או מידע אישי. אל תשתפו טלפון או כתובת."), label);
        }
    }
}
