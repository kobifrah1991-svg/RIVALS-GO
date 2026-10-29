using UnityEngine;

namespace ArenaRush
{
    // Balance values live in assets, not code (GDD §7). Edit them in Assets/ArenaRush/Data/Weapons.
    [CreateAssetMenu(menuName = "Arena Rush/Weapon", fileName = "Weapon")]
    public class WeaponData : ScriptableObject
    {
        public string id = "rifle";
        public string displayName = "רובה סער";
        public bool automatic = true;
        public int damage = 22;
        public float headMultiplier = 1.6f;
        [Min(1)] public int pellets = 1;
        [Tooltip("Seconds between shots")] public float fireInterval = 0.1f;
        public int magazine = 30;
        public float reloadTime = 1.8f;
        [Tooltip("Radians")] public float hipSpread = 0.022f;
        [Tooltip("Radians")] public float adsSpread = 0.006f;
        public float falloffStart = 25f;
        public float falloffEnd = 60f;
        [Range(0, 1)] public float minDamageMultiplier = 0.6f;
        public float range = 150f;
        [Tooltip("Degrees of camera kick per shot")] public float recoil = 0.7f;
        public float adsFov = 55f;
        public Color color = new Color(0.25f, 0.77f, 1f);

        public int DamageAt(float distance, bool head)
        {
            float mul = 1f;
            if (distance > falloffStart)
            {
                float k = Mathf.InverseLerp(falloffStart, falloffEnd, distance);
                mul = Mathf.Lerp(1f, minDamageMultiplier, k);
            }
            return Mathf.RoundToInt(damage * mul * (head ? headMultiplier : 1f));
        }
    }
}
