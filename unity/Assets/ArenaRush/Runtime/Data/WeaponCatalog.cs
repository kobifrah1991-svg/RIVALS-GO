using UnityEngine;

namespace ArenaRush
{
    // The loadout, in slot order (keys 1..4). Loaded from Resources/ArenaRush/WeaponCatalog.
    [CreateAssetMenu(menuName = "Arena Rush/Weapon Catalog", fileName = "WeaponCatalog")]
    public class WeaponCatalog : ScriptableObject
    {
        public const string ResourcePath = "ArenaRush/WeaponCatalog";
        public WeaponData[] weapons;

        static WeaponData[] cached;

        public static WeaponData[] All
        {
            get
            {
                if (cached != null) return cached;
                var asset = Resources.Load<WeaponCatalog>(ResourcePath);
                cached = asset != null && asset.weapons != null && asset.weapons.Length > 0 ? asset.weapons : CreateDefaults();
                return cached;
            }
        }

        public static WeaponData Get(int index) => index >= 0 && index < All.Length ? All[index] : null;

        // Starting values; the editor setup saves these as assets so designers can tune them.
        public static WeaponData[] CreateDefaults()
        {
            return new[]
            {
                Make("rifle", "רובה סער", true, 22, 1.6f, 1, 0.1f, 30, 1.8f, 0.022f, 0.006f, 25, 60, 0.6f, 150, 0.7f, 55, new Color(0.25f, 0.77f, 1f)),
                Make("shotgun", "שוטגאן", false, 13, 1.3f, 9, 0.85f, 6, 2.2f, 0.075f, 0.06f, 7, 20, 0.25f, 40, 3f, 65, new Color(1f, 0.57f, 0f)),
                Make("sniper", "צלף", false, 85, 2f, 1, 1.25f, 5, 2.6f, 0.06f, 0f, 200, 300, 1f, 300, 4f, 22, new Color(0.84f, 0f, 0.98f)),
                Make("pistol", "אקדח", false, 30, 1.8f, 1, 0.22f, 12, 1.3f, 0.015f, 0.006f, 15, 40, 0.55f, 100, 1.4f, 60, new Color(0.46f, 1f, 0.01f)),
            };
        }

        static WeaponData Make(string id, string name, bool auto, int dmg, float head, int pellets, float interval, int mag, float reload,
            float hip, float ads, float fs, float fe, float minMul, float range, float recoil, float adsFov, Color color)
        {
            var w = CreateInstance<WeaponData>();
            w.name = id;
            w.id = id; w.displayName = name; w.automatic = auto; w.damage = dmg; w.headMultiplier = head; w.pellets = pellets;
            w.fireInterval = interval; w.magazine = mag; w.reloadTime = reload; w.hipSpread = hip; w.adsSpread = ads;
            w.falloffStart = fs; w.falloffEnd = fe; w.minDamageMultiplier = minMul; w.range = range; w.recoil = recoil;
            w.adsFov = adsFov; w.color = color;
            return w;
        }
    }
}
