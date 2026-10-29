using System.IO;
using System.Linq;
using Unity.Netcode;
using Unity.Netcode.Transports.UTP;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace ArenaRush.EditorTools
{
    // "Arena Rush > 3. Build Game Scene": creates materials, weapon data assets, network prefabs and the scene.
    // Safe to run again: existing weapon assets are kept so your balance tweaks survive.
    public static class SceneSetup
    {
        const string Root = "Assets/ArenaRush";
        const string ResourcesDir = Root + "/Resources/ArenaRush";
        const string WeaponsDir = Root + "/Data/Weapons";
        const string PrefabsDir = Root + "/Prefabs";
        const string ScenePath = Root + "/Scenes/ArenaRush.unity";

        [MenuItem("Arena Rush/3. Build Game Scene", priority = 3)]
        public static void Build()
        {
            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
            foreach (var dir in new[] { ResourcesDir, WeaponsDir, PrefabsDir, Root + "/Scenes" }) Directory.CreateDirectory(dir);

            CreateMaterials();
            CreateWeapons();
            var player = CreatePlayerPrefab();
            var match = CreateMatchPrefab();
            CreateScene(player, match);
            PlayerSettings.runInBackground = true;

            EditorUtility.DisplayDialog("Arena Rush",
                "The scene is ready!\n\nPress Play, then choose 'Practice vs bots' (the first button).\n\n" +
                "To test multiplayer: File > Build And Run, click Host in one window and Join (127.0.0.1) in the other.", "OK");
        }

        static void CreateMaterials()
        {
            string litPath = ResourcesDir + "/ArenaLit.mat";
            if (AssetDatabase.LoadAssetAtPath<Material>(litPath) == null)
            {
                var shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
                var lit = new Material(shader);
                lit.SetFloat("_Smoothness", 0.35f);
                lit.EnableKeyword("_EMISSION");
                lit.globalIlluminationFlags = MaterialGlobalIlluminationFlags.RealtimeEmissive;
                AssetDatabase.CreateAsset(lit, litPath);
            }
            string linePath = ResourcesDir + "/FxLine.mat";
            if (AssetDatabase.LoadAssetAtPath<Material>(linePath) == null)
                AssetDatabase.CreateAsset(new Material(Shader.Find("Sprites/Default")), linePath);
        }

        static void CreateWeapons()
        {
            string catalogPath = ResourcesDir + "/WeaponCatalog.asset";
            var catalog = AssetDatabase.LoadAssetAtPath<WeaponCatalog>(catalogPath);
            if (catalog != null && catalog.weapons != null && catalog.weapons.Length > 0 && catalog.weapons.All(w => w != null)) return;

            var defaults = WeaponCatalog.CreateDefaults();
            var assets = new WeaponData[defaults.Length];
            for (int i = 0; i < defaults.Length; i++)
            {
                string path = $"{WeaponsDir}/{i + 1}_{defaults[i].id}.asset";
                assets[i] = AssetDatabase.LoadAssetAtPath<WeaponData>(path);
                if (assets[i] == null) { AssetDatabase.CreateAsset(defaults[i], path); assets[i] = defaults[i]; }
            }
            if (catalog == null)
            {
                catalog = ScriptableObject.CreateInstance<WeaponCatalog>();
                AssetDatabase.CreateAsset(catalog, catalogPath);
            }
            catalog.weapons = assets;
            EditorUtility.SetDirty(catalog);
            AssetDatabase.SaveAssets();
        }

        static GameObject CreatePlayerPrefab()
        {
            var go = new GameObject("Player");
            PlayerMotor.Configure(go.AddComponent<CharacterController>());
            go.AddComponent<NetworkObject>();
            go.AddComponent<PlayerNetwork>();
            go.AddComponent<PlayerController>().enabled = false;
            go.AddComponent<BotBrain>().enabled = false;
            go.AddComponent<PlayerVisual>();

            var head = new GameObject("HeadHitbox");
            head.transform.SetParent(go.transform, false);
            head.transform.localPosition = new Vector3(0, 1.62f, 0);
            var sphere = head.AddComponent<SphereCollider>();
            sphere.isTrigger = true;
            sphere.radius = 0.42f; // wider than the body capsule so head-height shots register as headshots
            head.AddComponent<HeadHitbox>();

            return SavePrefab(go, PrefabsDir + "/Player.prefab");
        }

        static GameObject CreateMatchPrefab()
        {
            var go = new GameObject("Match");
            go.AddComponent<NetworkObject>();
            go.AddComponent<MatchManager>();
            return SavePrefab(go, PrefabsDir + "/Match.prefab");
        }

        static GameObject SavePrefab(GameObject go, string path)
        {
            PrefabUtility.SaveAsPrefabAsset(go, path);
            Object.DestroyImmediate(go);
            // Save a second time now that the asset exists, so NetworkObject gets a stable GlobalObjectIdHash
            var contents = PrefabUtility.LoadPrefabContents(path);
            PrefabUtility.SaveAsPrefabAsset(contents, path);
            PrefabUtility.UnloadPrefabContents(contents);
            AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceUpdate);
            return AssetDatabase.LoadAssetAtPath<GameObject>(path);
        }

        static void CreateScene(GameObject player, GameObject match)
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            var camGo = new GameObject("Main Camera", typeof(Camera), typeof(AudioListener)) { tag = "MainCamera" };
            camGo.transform.position = new Vector3(0, 18, -30);
            camGo.transform.rotation = Quaternion.Euler(30, 0, 0);
            var cam = camGo.GetComponent<Camera>();
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.04f, 0.05f, 0.1f);

            var sun = new GameObject("Sun").AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.intensity = 1.2f;
            sun.shadows = LightShadows.Soft;
            sun.transform.rotation = Quaternion.Euler(55, -30, 0);

            var nmGo = new GameObject("NetworkManager");
            var nm = nmGo.AddComponent<NetworkManager>();
            var transport = nmGo.AddComponent<UnityTransport>();
            if (nm.NetworkConfig == null) nm.NetworkConfig = new NetworkConfig();
            nm.NetworkConfig.NetworkTransport = transport;
            nm.NetworkConfig.EnableSceneManagement = false;
            EditorUtility.SetDirty(nm);

            var boot = new GameObject("GameBootstrap").AddComponent<GameBootstrap>();
            boot.playerPrefab = player;
            boot.matchPrefab = match;
            EditorUtility.SetDirty(boot);

            EditorSceneManager.SaveScene(scene, ScenePath);
            var scenes = EditorBuildSettings.scenes.Where(s => s.path != ScenePath).ToList();
            scenes.Insert(0, new EditorBuildSettingsScene(ScenePath, true));
            EditorBuildSettings.scenes = scenes.ToArray();
            AssetDatabase.SaveAssets();
            Debug.Log("[Arena Rush] Scene created at " + ScenePath);
        }
    }
}
