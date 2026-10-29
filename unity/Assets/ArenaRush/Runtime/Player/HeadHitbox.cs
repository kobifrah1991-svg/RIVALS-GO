using UnityEngine;

namespace ArenaRush
{
    // Marks the head trigger so shots there count as headshots.
    public class HeadHitbox : MonoBehaviour
    {
        public PlayerNetwork Owner => GetComponentInParent<PlayerNetwork>();
    }
}
