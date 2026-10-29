using System;
using UnityEngine;

namespace ArenaRush
{
    // Client-side event hub between networking and the HUD.
    public static class GameEvents
    {
        public static event Action<string, Color, string, bool, bool> Chat;             // name, color, text, system, quick
        public static event Action<string, string, bool, bool, int, bool, int, string> KillFeed; // killer, victim, killerIsMe, victimIsMe, weapon, head, streak, streakName
        public static event Action<int, bool, bool, Vector3> HitConfirmed;               // damage, head, kill, where
        public static event Action<Vector3> Hurt;                                         // attacker position
        public static event Action<bool, string> MatchEnded;                              // I won, winner name

        public static void RaiseChat(string n, Color c, string t, bool sys, bool quick) => Chat?.Invoke(n, c, t, sys, quick);
        public static void RaiseKill(string k, string v, bool kMe, bool vMe, int w, bool head, int streak, string sname) => KillFeed?.Invoke(k, v, kMe, vMe, w, head, streak, sname);
        public static void RaiseHit(int dmg, bool head, bool kill, Vector3 at) => HitConfirmed?.Invoke(dmg, head, kill, at);
        public static void RaiseHurt(Vector3 from) => Hurt?.Invoke(from);
        public static void RaiseMatchEnded(bool won, string winner) => MatchEnded?.Invoke(won, winner);

        public static void Clear() { Chat = null; KillFeed = null; HitConfirmed = null; Hurt = null; MatchEnded = null; }
    }
}
