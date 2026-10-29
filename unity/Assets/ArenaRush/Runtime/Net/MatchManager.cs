using System.Collections.Generic;
using System.IO;
using System.Linq;
using Unity.Collections;
using Unity.Netcode;
using UnityEngine;

namespace ArenaRush
{
    // Free-for-all match rules, respawns, bots, kill feed and chat. Spawned by the server.
    public class MatchManager : NetworkBehaviour
    {
        public static MatchManager Instance { get; private set; }

        public const int KillLimit = 25;
        public const float MatchSeconds = 300f;
        const float RespawnSeconds = 3f;
        const float IntermissionSeconds = 10f;
        public static int MinFighters = 4;  // bots fill up to this many
        public const int MaxPlayers = 12;

        static readonly Dictionary<int, string> StreakNames = new Dictionary<int, string>
        { { 2, "DOUBLE KILL" }, { 3, "TRIPLE KILL" }, { 5, "RAMPAGE" }, { 7, "UNSTOPPABLE" }, { 10, "GODLIKE" } };
        static readonly string[] BotNames = { "ניאון", "ברק", "טורבו", "פיקסל", "רובו", "צל", "זיק", "קומטה", "גלקסי", "ריינבו" };

        public readonly NetworkVariable<bool> Ended = new NetworkVariable<bool>();
        public readonly NetworkVariable<double> EndTime = new NetworkVariable<double>();
        public readonly NetworkVariable<FixedString64Bytes> Winner = new NetworkVariable<FixedString64Bytes>();

        [System.NonSerialized] public GameObject PlayerPrefab;
        float nextBotCheck;

        public bool Playing => IsSpawned && !Ended.Value;
        public double Now => NetworkManager.ServerTime.Time;
        public float SecondsLeft => (float)System.Math.Max(0, EndTime.Value - Now);

        public static PlayerNetwork FindById(ulong networkObjectId) => PlayerNetwork.All.FirstOrDefault(p => p.NetworkObjectId == networkObjectId);

        public override void OnNetworkSpawn()
        {
            Instance = this;
            if (IsServer) EndTime.Value = Now + MatchSeconds;
            Ended.OnValueChanged += OnEndedChanged;
        }

        public override void OnNetworkDespawn()
        {
            Ended.OnValueChanged -= OnEndedChanged;
            if (Instance == this) Instance = null;
        }

        void OnEndedChanged(bool _, bool ended)
        {
            if (!ended) return;
            var me = PlayerNetwork.Local;
            GameEvents.RaiseMatchEnded(me != null && me.DisplayName == Winner.Value.ToString(), Winner.Value.ToString());
        }

        void Update()
        {
            if (!IsServer || !IsSpawned) return;
            if (!Ended.Value)
            {
                if (Now >= EndTime.Value) EndMatch(null);
                foreach (var p in PlayerNetwork.All.ToArray())
                    if (!p.Alive.Value && Time.time >= p.RespawnAt && p.PlayerName.Value.Length > 0) Respawn(p);
            }
            else if (Now >= EndTime.Value) NewMatch();

            if (Time.time > nextBotCheck) { nextBotCheck = Time.time + 0.5f; BalanceBots(); }
        }

        // ---------------- rules ----------------
        public void Respawn(PlayerNetwork p)
        {
            var enemies = PlayerNetwork.All.Where(o => o != p && o.Alive.Value).Select(o => o.transform.position);
            p.ServerRespawn(Arena.PickSpawn(enemies));
        }

        public void ServerOnKill(PlayerNetwork killer, PlayerNetwork victim, int weapon, bool head)
        {
            victim.ServerKill();
            victim.Deaths.Value++;
            victim.Streak = 0;
            victim.RespawnAt = Time.time + RespawnSeconds;
            killer.Kills.Value++;
            killer.Streak++;
            if (killer.Alive.Value) killer.ServerHeal(25); // kill reward keeps aggressive play fun
            StreakNames.TryGetValue(killer.Streak, out var streakName);
            KillFeedRpc(killer.DisplayName, victim.DisplayName, killer.NetworkObjectId, victim.NetworkObjectId, weapon, head, killer.Streak, streakName ?? "");
            if (killer.Streak >= 5 && streakName != null) Sys($"{killer.DisplayName}: {streakName} ({killer.Streak} ברצף)");
            if (killer.Kills.Value >= KillLimit) EndMatch(killer);
        }

        void EndMatch(PlayerNetwork winner)
        {
            if (Ended.Value) return;
            winner ??= PlayerNetwork.All.OrderByDescending(p => p.Kills.Value).ThenBy(p => p.Deaths.Value).FirstOrDefault();
            Winner.Value = new FixedString64Bytes(winner != null ? winner.DisplayName : "");
            EndTime.Value = Now + IntermissionSeconds;
            Ended.Value = true;
        }

        void NewMatch()
        {
            foreach (var p in PlayerNetwork.All)
            {
                p.Kills.Value = 0;
                p.Deaths.Value = 0;
                Respawn(p);
            }
            EndTime.Value = Now + MatchSeconds;
            Ended.Value = false;
            Sys($"סבב חדש! ראשון ל-{KillLimit} הריגות מנצח.");
        }

        void BalanceBots()
        {
            int humans = PlayerNetwork.All.Count(p => !p.IsBot.Value);
            var bots = PlayerNetwork.All.Where(p => p.IsBot.Value).ToList();
            int want = humans > 0 ? Mathf.Max(0, MinFighters - humans) : 0;
            if (bots.Count < want && PlayerNetwork.All.Count < MaxPlayers && PlayerPrefab != null)
            {
                var used = new HashSet<string>(bots.Select(b => b.DisplayName));
                string name = BotNames.FirstOrDefault(n => !used.Contains(n)) ?? "בוט" + Random.Range(10, 99);
                var go = Instantiate(PlayerPrefab, Arena.Spawns[Random.Range(0, Arena.Spawns.Length)], Quaternion.identity);
                var pn = go.GetComponent<PlayerNetwork>();
                pn.PendingBot = true;
                pn.PendingName = name;
                pn.RespawnAt = Time.time + 0.5f;
                go.GetComponent<NetworkObject>().Spawn(true);
            }
            else if (bots.Count > want)
            {
                bots[bots.Count - 1].NetworkObject.Despawn(true);
            }
        }

        // ---------------- chat (GDD §13) ----------------
        public void Sys(string text) => ChatRpc("", 0, text, true, false);

        [Rpc(SendTo.Server)]
        public void SendChatRpc(string text, bool quick, RpcParams rpcParams = default)
        {
            ulong sender = rpcParams.Receive.SenderClientId;
            var p = PlayerNetwork.All.FirstOrDefault(x => !x.IsBot.Value && x.OwnerClientId == sender);
            if (p == null || text == null) return;
            if (Time.time < p.MutedUntil) { Private(sender, "הצ'אט שלך מושתק זמנית."); return; }
            while (p.ChatTimes.Count > 0 && Time.time - p.ChatTimes.Peek() > 5f) p.ChatTimes.Dequeue();
            if (p.ChatTimes.Count >= 4) { Private(sender, "לאט לאט, יותר מדי הודעות."); return; }
            p.ChatTimes.Enqueue(Time.time);

            string clean;
            bool flagged = false;
            if (quick)
            {
                if (!int.TryParse(text, out int i) || i < 0 || i >= ChatFilter.Quick.Length) return;
                clean = ChatFilter.Quick[i];
            }
            else clean = ChatFilter.Filter(text, out flagged);
            if (string.IsNullOrWhiteSpace(clean)) return;

            if (flagged)
            {
                // Graduated enforcement: two warnings, then a one-minute mute
                p.ChatStrikes++;
                if (p.ChatStrikes >= 3) { p.MutedUntil = Time.time + 60f; p.ChatStrikes = 0; Private(sender, "הושתקת לדקה בגלל שפה או מידע אישי."); }
                else Private(sender, $"אזהרה {p.ChatStrikes}/3: בלי קללות, קישורים או מידע אישי.");
            }
            ChatRpc(p.DisplayName, p.ColorIndex.Value, clean, false, quick);
        }

        [Rpc(SendTo.Server)]
        public void ReportRpc(string playerName, string reason, RpcParams rpcParams = default)
        {
            var reporter = PlayerNetwork.All.FirstOrDefault(x => x.OwnerClientId == rpcParams.Receive.SenderClientId && !x.IsBot.Value);
            string line = $"{System.DateTime.Now:u}\t{reporter?.DisplayName}\t{playerName}\t{(reason ?? "").Replace('\t', ' ')}";
            Debug.Log("[REPORT] " + line);
            try { File.AppendAllText(Path.Combine(Application.persistentDataPath, "reports.txt"), line + "\n"); } catch { /* best effort */ }
            Private(rpcParams.Receive.SenderClientId, "הדיווח התקבל. תודה ששמרת על הזירה בטוחה!");
        }

        void Private(ulong clientId, string text) => PrivateRpc(text, RpcTarget.Single(clientId, RpcTargetUse.Temp));

        [Rpc(SendTo.SpecifiedInParams)]
        void PrivateRpc(string text, RpcParams rpcParams) => GameEvents.RaiseChat("", Color.yellow, text, true, false);

        [Rpc(SendTo.Everyone)]
        void ChatRpc(string name, int color, string text, bool sys, bool quick)
        {
            GameEvents.RaiseChat(name, PlayerNetwork.Palette[Mathf.Abs(color) % PlayerNetwork.Palette.Length], text, sys, quick);
        }

        [Rpc(SendTo.Everyone)]
        void KillFeedRpc(string killer, string victim, ulong killerId, ulong victimId, int weapon, bool head, int streak, string streakName)
        {
            var me = PlayerNetwork.Local;
            bool killerIsMe = me != null && me.NetworkObjectId == killerId;
            bool victimIsMe = me != null && me.NetworkObjectId == victimId;
            if (victimIsMe) me.LastAttackerClientView = killerId;
            GameEvents.RaiseKill(killer, victim, killerIsMe, victimIsMe, weapon, head, streak, streakName);
        }
    }
}
