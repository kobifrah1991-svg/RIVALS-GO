using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.PackageManager;
using UnityEditor.PackageManager.Requests;
using UnityEngine;
using UnityEngine.Rendering;

namespace ArenaRush.EditorTools
{
    // "Arena Rush > 1. Check Project": lists what the project still needs according to the GDD and setup guide,
    // with a fix button for each item. Has no dependencies, so it works even before anything is installed.
    public class ProjectChecker : EditorWindow
    {
        enum State { Ok, Missing, Warning, Optional }

        class Item
        {
            public string title, detail, fixLabel;
            public State state;
            public Action fix;
        }

        const string Netcode = "com.unity.netcode.gameobjects";
        const string InputSystem = "com.unity.inputsystem";
        const string Urp = "com.unity.render-pipelines.universal";
        const string ScenePath = "Assets/ArenaRush/Scenes/ArenaRush.unity";

        ListRequest listRequest;
        static AddAndRemoveRequest addRequest;
        readonly List<Item> items = new List<Item>();
        Vector2 scroll;

        [MenuItem("Arena Rush/1. Check Project", priority = 1)]
        public static void Open()
        {
            var w = GetWindow<ProjectChecker>(false, "Arena Rush Check");
            w.minSize = new Vector2(520, 520);
            w.Refresh();
        }

        [MenuItem("Arena Rush/2. Install Missing Packages", priority = 2)]
        public static void InstallMissing() => Install(Netcode, InputSystem);

        static void Install(params string[] packages)
        {
            if (addRequest != null && !addRequest.IsCompleted) { Debug.Log("[Arena Rush] Package install already running…"); return; }
            Debug.Log("[Arena Rush] Installing: " + string.Join(", ", packages));
            addRequest = Client.AddAndRemove(packages, null);
            EditorApplication.update += WatchInstall;
        }

        static void WatchInstall()
        {
            if (addRequest == null || !addRequest.IsCompleted) return;
            EditorApplication.update -= WatchInstall;
            if (addRequest.Status == StatusCode.Success)
                Debug.Log("[Arena Rush] Packages installed. If Unity asks to restart for the Input System, click Yes. Then run 'Arena Rush > 3. Build Game Scene'.");
            else
                Debug.LogError("[Arena Rush] Package install failed: " + addRequest.Error?.message);
            foreach (var w in Resources.FindObjectsOfTypeAll<ProjectChecker>()) w.Refresh();
        }

        void Refresh()
        {
            items.Clear();
            listRequest = Client.List(true, false);
            EditorApplication.update -= Poll;
            EditorApplication.update += Poll;
        }

        void Poll()
        {
            if (listRequest == null || !listRequest.IsCompleted) return;
            EditorApplication.update -= Poll;
            var packages = listRequest.Status == StatusCode.Success
                ? listRequest.Result.ToDictionary(p => p.name, p => p.version)
                : new Dictionary<string, string>();
            Build(packages);
            Repaint();
        }

        void Build(Dictionary<string, string> pk)
        {
            string root = Path.GetDirectoryName(Application.dataPath);

            // Engine
            bool unity6 = Application.unityVersion.StartsWith("6");
            Add(unity6 ? State.Ok : State.Warning, "Unity 6", "Version " + Application.unityVersion + (unity6 ? "" : " – the GDD targets Unity 6 LTS."));

            bool cleanPath = !root.Contains(" ") && root.All(c => c < 128);
            Add(cleanPath ? State.Ok : State.Warning, "Project path without spaces / Hebrew",
                cleanPath ? root : root + "\nThe setup guide recommends a path like C:\\Games\\ArenaRush. Usually fine for PC; Android builds are safer without spaces.");

            // Packages
            AddPackage(pk, Netcode, "Netcode for GameObjects (multiplayer)", true);
            AddPackage(pk, InputSystem, "Input System", false);
            bool urpPkg = pk.ContainsKey(Urp);
            bool urpActive = GraphicsSettings.currentRenderPipeline != null;
            Add(urpPkg && urpActive ? State.Ok : State.Missing, "Universal Render Pipeline (URP)",
                urpPkg ? (urpActive ? "Installed and active" : "Installed but not active: Project Settings > Graphics > Default Render Pipeline")
                       : "Create the project from the 'Universal 3D (URP)' template, or install " + Urp,
                urpPkg ? null : "Install", urpPkg ? (Action)null : () => Install(Urp));

            // Build modules
            bool android = BuildPipeline.IsBuildTargetSupported(BuildTargetGroup.Android, BuildTarget.Android);
            Add(android ? State.Ok : State.Missing, "Android Build Support module",
                android ? "Installed" : "Unity Hub > Installs > (your Unity 6) > Add modules > Android Build Support (+ OpenJDK, SDK & NDK)");
            bool windows = BuildPipeline.IsBuildTargetSupported(BuildTargetGroup.Standalone, BuildTarget.StandaloneWindows64);
            Add(windows ? State.Ok : State.Missing, "Windows Build Support",
                windows ? "Installed" : "Unity Hub > Installs > Add modules > Windows Build Support (IL2CPP)");

            // Game content
            bool scene = File.Exists(Path.Combine(root, ScenePath));
            bool inBuild = EditorBuildSettings.scenes.Any(s => s.path == ScenePath && s.enabled);
            Add(scene && inBuild ? State.Ok : State.Missing, "Arena Rush game scene",
                scene ? (inBuild ? ScenePath : "Scene exists but is not in Build Settings – run Build Game Scene again") : "Run 'Arena Rush > 3. Build Game Scene' (after Netcode is installed)",
                pk.ContainsKey(Netcode) ? "Build" : null, pk.ContainsKey(Netcode) ? () => EditorApplication.ExecuteMenuItem("Arena Rush/3. Build Game Scene") : (Action)null);
            Add(PlayerSettings.runInBackground ? State.Ok : State.Missing, "Run In Background",
                "Needed so two game windows can play together while testing multiplayer",
                "Enable", () => { PlayerSettings.runInBackground = true; Refresh(); });

            // Agent workflow from the setup guide
            bool gdd = File.Exists(Path.Combine(root, "docs", "GDD_Arena_Rush.md"));
            Add(gdd ? State.Ok : State.Missing, "docs/GDD_Arena_Rush.md", gdd ? "Found" : "Copy the GDD into a 'docs' folder next to Assets (setup guide, step 4)");
            bool claudeMd = File.Exists(Path.Combine(root, "CLAUDE.md"));
            Add(claudeMd ? State.Ok : State.Missing, "CLAUDE.md (agent instructions)", claudeMd ? "Found" : "Create CLAUDE.md in the project root (setup guide, step 4)");
            bool git = Directory.Exists(Path.Combine(root, ".git"));
            bool ignore = File.Exists(Path.Combine(root, ".gitignore"));
            Add(git && ignore ? State.Ok : State.Missing, "Git repository + Unity .gitignore",
                git ? (ignore ? "Found" : ".gitignore missing") : "Run 'git init' in the project folder (setup guide, step 4)");

            // Optional bridges from the setup guide
            bool mcp = pk.Keys.Any(k => k.Contains("ai.assistant") || k.Contains("unity-mcp") || k.Contains("mcp"));
            Add(mcp ? State.Ok : State.Optional, "Claude Code <-> Unity bridge (optional)",
                mcp ? "Found" : "Optional: Unity AI Assistant (com.unity.ai.assistant) or MCP for Unity – setup guide, step 5");
        }

        void AddPackage(Dictionary<string, string> pk, string id, string title, bool required)
        {
            if (pk.TryGetValue(id, out var v)) Add(State.Ok, title, id + " " + v);
            else Add(required ? State.Missing : State.Warning, title, "Not installed: " + id, "Install", () => Install(id));
        }

        void Add(State s, string title, string detail, string fixLabel = null, Action fix = null) =>
            items.Add(new Item { state = s, title = title, detail = detail, fixLabel = fixLabel, fix = fix });

        void OnGUI()
        {
            EditorGUILayout.Space();
            EditorGUILayout.LabelField("Arena Rush – project check", EditorStyles.boldLabel);
            if (listRequest != null && !listRequest.IsCompleted) { EditorGUILayout.HelpBox("Reading packages…", MessageType.Info); return; }
            if (addRequest != null && !addRequest.IsCompleted) EditorGUILayout.HelpBox("Installing packages… Unity will recompile when done.", MessageType.Info);

            int missing = items.Count(i => i.state == State.Missing);
            EditorGUILayout.HelpBox(missing == 0 ? "Everything required is in place. Open the scene and press Play!" : $"{missing} required item(s) missing. Fix them from top to bottom.",
                missing == 0 ? MessageType.Info : MessageType.Warning);

            scroll = EditorGUILayout.BeginScrollView(scroll);
            foreach (var i in items)
            {
                EditorGUILayout.BeginHorizontal(EditorStyles.helpBox);
                var old = GUI.color;
                GUI.color = i.state == State.Ok ? new Color(0.4f, 1f, 0.5f) : i.state == State.Missing ? new Color(1f, 0.4f, 0.4f) : i.state == State.Warning ? new Color(1f, 0.85f, 0.3f) : new Color(0.7f, 0.8f, 1f);
                GUILayout.Label(i.state == State.Ok ? "OK" : i.state == State.Missing ? "MISSING" : i.state == State.Warning ? "CHECK" : "OPTIONAL", EditorStyles.boldLabel, GUILayout.Width(80));
                GUI.color = old;
                EditorGUILayout.BeginVertical();
                GUILayout.Label(i.title, EditorStyles.boldLabel);
                GUILayout.Label(i.detail, EditorStyles.wordWrappedMiniLabel);
                EditorGUILayout.EndVertical();
                if (i.fix != null && i.state != State.Ok && GUILayout.Button(i.fixLabel ?? "Fix", GUILayout.Width(80), GUILayout.Height(32))) i.fix();
                EditorGUILayout.EndHorizontal();
            }
            EditorGUILayout.EndScrollView();
            if (GUILayout.Button("Check again", GUILayout.Height(28))) Refresh();
        }
    }
}
