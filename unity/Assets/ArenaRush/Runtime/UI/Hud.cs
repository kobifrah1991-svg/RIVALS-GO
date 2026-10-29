using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace ArenaRush
{
    // In-game HUD and chat for the local player, drawn with IMGUI so it needs no prefabs or assets.
    // Hebrew is passed through Rtl.Fix because Unity's built-in text has no RTL support.
    public class Hud : MonoBehaviour
    {
        public static bool QuickMenuOpen { get; private set; }
        public static bool ChatOpen { get; private set; }

        class Line { public string text; public Color color; public float time; }
        class DmgNum { public Vector3 pos; public string text; public Color color; public float born; public float dx; }

        PlayerNetwork pn;
        PlayerController ctrl;
        readonly List<Line> chat = new List<Line>();
        readonly List<Line> feed = new List<Line>();
        readonly List<DmgNum> dmg = new List<DmgNum>();
        readonly HashSet<string> muted = new HashSet<string>();
        string chatText = "";
        int chatOpenedFrame;
        string announce = "", center = "";
        float announceAt = -10, centerUntil, hitAt = -10, hurtAt = -10, hurtAngle;
        int hitKind; // 0 body, 1 head, 2 kill
        bool prevEnded;
        public static bool MenuOpen { get; private set; }
        int kills, heads, streak;
        string endTitle = "", endXp = "", endGoal = "";
        float endXpFill;

        GUIStyle label, big, small, box;
        Texture2D scopeTex, vignetteTex;
        float S => Screen.height / 1080f;

        void OnEnable()
        {
            pn = GetComponent<PlayerNetwork>();
            ctrl = GetComponent<PlayerController>();
            GameEvents.Chat += OnChat;
            GameEvents.KillFeed += OnKill;
            GameEvents.HitConfirmed += OnHit;
            GameEvents.Hurt += OnHurt;
            GameEvents.MatchEnded += OnMatchEnded;
            AddChat($"ברוכים הבאים ל{Arena.MapName}! Enter לצ'אט, B להודעות מהירות, Tab לניקוד.", Color.yellow);
        }

        void OnDisable()
        {
            GameEvents.Chat -= OnChat;
            GameEvents.KillFeed -= OnKill;
            GameEvents.HitConfirmed -= OnHit;
            GameEvents.Hurt -= OnHurt;
            GameEvents.MatchEnded -= OnMatchEnded;
            QuickMenuOpen = ChatOpen = MenuOpen = false;
        }

        // ---------------- events ----------------
        void OnChat(string name, Color color, string text, bool sys, bool quick)
        {
            if (!sys && muted.Contains(name)) return;
            AddChat(sys ? text : $"{name}: {text}", sys ? Color.yellow : color);
            if (!sys) Fx.I.Play(Fx.I.Chat, 0.5f);
        }

        void AddChat(string text, Color color)
        {
            chat.Add(new Line { text = Rtl.Fix(text), color = color, time = Time.time });
            if (chat.Count > 30) chat.RemoveAt(0);
        }

        void OnKill(string killer, string victim, bool killerIsMe, bool victimIsMe, int weapon, bool head, int s, string streakName)
        {
            var w = WeaponCatalog.Get(weapon);
            string k = killerIsMe ? "את/ה" : killer, v = victimIsMe ? "את/ה" : victim;
            feed.Insert(0, new Line { text = Rtl.Fix($"{k} [{w?.displayName}]{(head ? " (ראש)" : "")} {v}"), color = killerIsMe || victimIsMe ? Color.yellow : Color.white, time = Time.time });
            if (feed.Count > 5) feed.RemoveAt(feed.Count - 1);
            if (killerIsMe)
            {
                kills++;
                if (head) heads++;
                streak = s;
                Fx.I.Play(Fx.I.Kill, 0.8f);
                center = Rtl.Fix($"חיסלת את {victim}{(head ? " · ירייה בראש!" : "")}");
                centerUntil = Time.time + 1.8f;
                if (!string.IsNullOrEmpty(streakName)) { announce = streakName; announceAt = Time.time; }
            }
            if (victimIsMe)
            {
                streak = 0;
                center = Rtl.Fix($"חוסלת על ידי {killer}");
                centerUntil = Time.time + 3f;
            }
        }

        void OnHit(int amount, bool head, bool kill, Vector3 at)
        {
            hitAt = Time.time;
            hitKind = kill ? 2 : head ? 1 : 0;
            if (!kill) Fx.I.Play(head ? Fx.I.Head : Fx.I.Hit, 0.7f);
            dmg.Add(new DmgNum { pos = at + Vector3.up * 0.3f, text = amount.ToString(), born = Time.time, dx = Random.Range(-30f, 30f),
                color = kill ? new Color(1f, 0.1f, 0.27f) : head ? new Color(1f, 0.84f, 0f) : Color.white });
        }

        void OnHurt(Vector3 from)
        {
            hurtAt = Time.time;
            Vector3 to = from - transform.position; to.y = 0;
            hurtAngle = Vector3.SignedAngle(transform.forward, to, Vector3.up);
            Fx.I.Play(Fx.I.Hurt, 0.7f);
        }

        void OnMatchEnded(bool won, string winner)
        {
            endTitle = Rtl.Fix(won ? "ניצחת!" : $"{winner} ניצח/ה!");
            // Local progression (GDD §9–10): XP, levels and the "one more game" goal
            int gained = kills * 100 + heads * 50 + (won ? 500 : 100);
            int level = PlayerPrefs.GetInt("arena.level", 1), xp = PlayerPrefs.GetInt("arena.xp", 0) + gained;
            bool up = false;
            while (xp >= Need(level)) { xp -= Need(level); level++; up = true; }
            PlayerPrefs.SetInt("arena.level", level);
            PlayerPrefs.SetInt("arena.xp", xp);
            PlayerPrefs.Save();
            endXp = Rtl.Fix($"+{gained} XP · רמה {level}{(up ? " · עלית רמה!" : "")}");
            endXpFill = (float)xp / Need(level);
            endGoal = Rtl.Fix($"עוד {Mathf.CeilToInt((Need(level) - xp) / 100f)} הריגות לרמה {level + 1}. רק עוד משחק אחד?");
            if (up) { announce = "LEVEL UP"; announceAt = Time.time; }
            kills = heads = 0;
        }

        public static int Need(int level) => 1000 + (level - 1) * 250;

        // ---------------- input ----------------
        void Update()
        {
            var match = MatchManager.Instance;
            bool ended = match != null && match.Ended.Value;
            if (ended && !prevEnded) PlayerController.LockCursor(false);
            if (!ended && prevEnded) PlayerController.LockCursor(true);
            prevEnded = ended;

            if (ChatOpen) return;
            if (InputWrap.Chat()) { OpenChat(); return; }
            if (InputWrap.Quick()) QuickMenuOpen = !QuickMenuOpen;
            if (QuickMenuOpen)
                for (int i = 1; i <= ChatFilter.Quick.Length; i++)
                    if (InputWrap.Digit(i)) { match?.SendChatRpc((i - 1).ToString(), true); QuickMenuOpen = false; }
            if (InputWrap.Escape())
            {
                if (QuickMenuOpen) QuickMenuOpen = false;
                else { MenuOpen = !MenuOpen; PlayerController.LockCursor(!MenuOpen); }
            }
        }

        void OpenChat()
        {
            ChatOpen = true;
            QuickMenuOpen = false;
            chatText = "";
            chatOpenedFrame = Time.frameCount;
            ctrl.InputBlocked = true;
            PlayerController.LockCursor(false);
        }

        void CloseChat(bool send)
        {
            ChatOpen = false;
            ctrl.InputBlocked = false;
            PlayerController.LockCursor(true);
            string text = chatText.Trim();
            chatText = "";
            if (!send || text.Length == 0) return;
            if (text.StartsWith("/")) { Command(text); return; }
            MatchManager.Instance?.SendChatRpc(text, false);
        }

        void Command(string text)
        {
            var parts = text.Substring(1).Split(' ');
            string cmd = parts[0].ToLowerInvariant(), name = parts.Length > 1 ? parts[1] : "";
            bool exists = PlayerNetwork.All.Any(p => p.DisplayName == name);
            switch (cmd)
            {
                case "mute":
                    if (!exists) { AddChat("לא נמצא שחקן בשם הזה.", Color.yellow); return; }
                    muted.Add(name); AddChat($"{name} מושתק/ת אצלך.", Color.yellow); return;
                case "unmute":
                    muted.Remove(name); AddChat($"{name} כבר לא מושתק/ת.", Color.yellow); return;
                case "report":
                    if (!exists) { AddChat("לא נמצא שחקן בשם הזה.", Color.yellow); return; }
                    MatchManager.Instance?.ReportRpc(name, string.Join(" ", parts.Skip(2))); return;
                default:
                    AddChat("פקודות: /mute שם · /unmute שם · /report שם סיבה", Color.yellow); return;
            }
        }

        // ---------------- drawing ----------------
        void Styles()
        {
            if (label != null) return;
            label = new GUIStyle(GUI.skin.label) { fontSize = 22, richText = false, wordWrap = false };
            label.normal.textColor = Color.white;
            big = new GUIStyle(label) { fontSize = 64, fontStyle = FontStyle.Bold, alignment = TextAnchor.MiddleCenter };
            small = new GUIStyle(label) { fontSize = 16 };
            box = new GUIStyle(GUI.skin.box);
            scopeTex = Radial(512, 0.46f, 0.47f, Color.black, true);
            vignetteTex = Radial(256, 0.3f, 0.72f, new Color(1f, 0f, 0.15f, 0.75f), false);
        }

        void OnGUI()
        {
            if (pn == null || !pn.IsSpawned) return;
            Styles();
            float s = S;
            label.fontSize = Mathf.RoundToInt(24 * s);
            small.fontSize = Mathf.RoundToInt(18 * s);
            big.fontSize = Mathf.RoundToInt(64 * s);
            var match = MatchManager.Instance;
            var w = WeaponCatalog.Get(ctrl.WeaponIndex);
            float W = Screen.width, H = Screen.height;
            bool scoped = ctrl.Aiming && w.id == "sniper";

            // Low health / hit vignette
            float vig = Mathf.Max(Mathf.Clamp01(1 - (Time.time - hurtAt) / 0.5f), pn.Hp.Value < 35 && pn.Alive.Value ? 0.45f : 0);
            if (vig > 0) { GUI.color = new Color(1, 1, 1, vig); GUI.DrawTexture(new Rect(0, 0, W, H), vignetteTex); GUI.color = Color.white; }

            if (scoped)
            {
                float d = H;
                GUI.DrawTexture(new Rect((W - d) / 2, 0, d, d), scopeTex);
                Fill((0), 0, (W - d) / 2 + 1, H, Color.black);
                Fill((W + d) / 2 - 1, 0, (W - d) / 2 + 1, H, Color.black);
                Fill(W / 2, 0, 1, H, new Color(0, 0, 0, 0.8f));
                Fill(0, H / 2, W, 1, new Color(0, 0, 0, 0.8f));
            }
            else if (pn.Alive.Value) // crosshair stays while aiming; only the sniper scope replaces it
            {
                float g = ctrl.SpreadVisual * s, l = 9 * s, t = Mathf.Max(2, 2 * s);
                Color c = Color.white;
                Fill(W / 2 - t / 2, H / 2 - g - l, t, l, c); Fill(W / 2 - t / 2, H / 2 + g, t, l, c);
                Fill(W / 2 - g - l, H / 2 - t / 2, l, t, c); Fill(W / 2 + g, H / 2 - t / 2, l, t, c);
            }

            // Hit marker
            float ha = 1 - (Time.time - hitAt) / 0.2f;
            if (ha > 0)
            {
                Color hc = hitKind == 2 ? new Color(1f, 0.1f, 0.27f) : hitKind == 1 ? new Color(1f, 0.84f, 0f) : Color.white;
                hc.a = ha;
                float len = (hitKind == 2 ? 16 : 10) * s;
                for (int i = 0; i < 4; i++)
                {
                    var m = GUI.matrix;
                    GUIUtility.RotateAroundPivot(45 + 90 * i, new Vector2(W / 2, H / 2));
                    Fill(W / 2 + 7 * s, H / 2 - 1, len, 2.5f * s, hc);
                    GUI.matrix = m;
                }
            }

            // Damage direction
            float hd = 1 - (Time.time - hurtAt) / 0.8f;
            if (hd > 0)
            {
                var m = GUI.matrix;
                GUIUtility.RotateAroundPivot(hurtAngle, new Vector2(W / 2, H / 2));
                Fill(W / 2 - 30 * s, H / 2 - 130 * s, 60 * s, 10 * s, new Color(1f, 0.1f, 0.2f, hd));
                GUI.matrix = m;
            }

            // Damage numbers
            var cam = Camera.main;
            for (int i = dmg.Count - 1; i >= 0; i--)
            {
                var n = dmg[i];
                float age = Time.time - n.born;
                if (age > 0.9f || cam == null) { dmg.RemoveAt(i); continue; }
                Vector3 sp = cam.WorldToScreenPoint(n.pos);
                if (sp.z < 0) continue;
                var c = n.color; c.a = Mathf.Clamp01((0.9f - age) * 2);
                Text(new Rect(sp.x - 60 + n.dx * age, H - sp.y - 60 * age - 20, 120, 40), n.text, c, label, TextAnchor.MiddleCenter, true);
            }

            // Top: timer and leader
            if (match != null)
            {
                int left = Mathf.CeilToInt(match.SecondsLeft);
                Fill(W / 2 - 80 * s, 10 * s, 160 * s, 46 * s, new Color(0.05f, 0.05f, 0.13f, 0.75f));
                Text(new Rect(W / 2 - 80 * s, 10 * s, 160 * s, 46 * s), match.Ended.Value ? "--:--" : $"{left / 60}:{left % 60:00}", Color.white, label, TextAnchor.MiddleCenter);
                var lead = PlayerNetwork.All.OrderByDescending(p => p.Kills.Value).FirstOrDefault();
                if (lead != null) Text(new Rect(W / 2 - 300, 58 * s, 600, 30 * s), Rtl.Fix($"מוביל/ה: {lead.DisplayName} ({lead.Kills.Value}/{MatchManager.KillLimit})"), new Color(0.75f, 0.8f, 1f), small, TextAnchor.MiddleCenter);
            }

            // Kill feed (top-left)
            for (int i = 0; i < feed.Count; i++)
            {
                if (Time.time - feed[i].time > 6) continue;
                var r = new Rect(12 * s, (12 + i * 34) * s, 460 * s, 30 * s);
                Fill(r.x, r.y, r.width, r.height, new Color(0.05f, 0.05f, 0.13f, 0.7f));
                Text(new Rect(r.x + 8, r.y, r.width - 16, r.height), feed[i].text, feed[i].color, small, TextAnchor.MiddleLeft);
            }

            // Health (bottom-right)
            float hpW = 260 * s, hpX = W - hpW - 90 * s, hpY = H - 46 * s;
            Fill(hpX, hpY, hpW, 18 * s, new Color(0, 0, 0, 0.55f));
            float hp = Mathf.Clamp01(pn.Hp.Value / (float)PlayerNetwork.MaxHp);
            Fill(hpX, hpY, hpW * hp, 18 * s, hp < 0.35f ? new Color(1f, 0.1f, 0.27f) : new Color(0f, 0.9f, 0.46f));
            Text(new Rect(W - 85 * s, hpY - 14 * s, 80 * s, 44 * s), pn.Hp.Value.ToString(), Color.white, label, TextAnchor.MiddleLeft, true);
            if (streak >= 2) Text(new Rect(hpX, hpY - 36 * s, hpW, 30 * s), Rtl.Fix($"רצף {streak}"), new Color(1f, 0.84f, 0f), label, TextAnchor.MiddleRight, true);

            // Ammo and weapon slots (bottom-left)
            Text(new Rect(20 * s, H - 150 * s, 400 * s, 30 * s), Rtl.Fix(w.displayName), new Color(0.7f, 0.75f, 0.9f), small, TextAnchor.MiddleLeft);
            Text(new Rect(20 * s, H - 125 * s, 400 * s, 60 * s), ctrl.Reloading ? "..." : $"{ctrl.Ammo[ctrl.WeaponIndex]} / {w.magazine}",
                ctrl.Ammo[ctrl.WeaponIndex] == 0 ? new Color(1f, 0.1f, 0.27f) : Color.white, big, TextAnchor.MiddleLeft, true);
            for (int i = 0; i < WeaponCatalog.All.Length; i++)
            {
                var r = new Rect((20 + i * 110) * s, H - 50 * s, 104 * s, 28 * s);
                bool on = i == ctrl.WeaponIndex;
                Fill(r.x, r.y, r.width, r.height, on ? new Color(0f, 0.9f, 1f, 0.9f) : new Color(0.05f, 0.05f, 0.13f, 0.7f));
                Text(r, Rtl.Fix($"{i + 1} {WeaponCatalog.Get(i).displayName}"), on ? Color.black : new Color(0.7f, 0.75f, 0.9f), small, TextAnchor.MiddleCenter);
            }

            // Announcements and centre messages
            float aa = Time.time - announceAt;
            if (aa < 1.6f)
            {
                float scale = aa < 0.15f ? Mathf.Lerp(2f, 1f, aa / 0.15f) : 1f;
                var m = GUI.matrix;
                GUIUtility.ScaleAroundPivot(Vector2.one * scale, new Vector2(W / 2, H * 0.25f));
                Text(new Rect(0, H * 0.25f - 50 * s, W, 100 * s), announce, new Color(1f, 0.84f, 0f, Mathf.Clamp01((1.6f - aa) * 3)), big, TextAnchor.MiddleCenter, true);
                GUI.matrix = m;
            }
            if (Time.time < centerUntil) Text(new Rect(0, H * 0.62f, W, 40 * s), center, Color.white, label, TextAnchor.MiddleCenter, true);

            if (!pn.Alive.Value && match != null && !match.Ended.Value)
            {
                Fill(0, 0, W, H, new Color(0.3f, 0f, 0.08f, 0.3f));
                Text(new Rect(0, H * 0.38f, W, 80 * s), Rtl.Fix("נפלת!"), Color.white, big, TextAnchor.MiddleCenter, true);
                Text(new Rect(0, H * 0.46f, W, 40 * s), Rtl.Fix("חוזר/ת לקרב בעוד רגע…"), Color.white, label, TextAnchor.MiddleCenter, true);
            }

            DrawChat(W, H, s);
            if (InputWrap.ScoreHeld() && !ChatOpen) DrawBoard(W, H, s, Rtl.Fix("טבלת ניקוד"));
            if (match != null && match.Ended.Value) DrawEnd(W, H, s, match);
            else if (MenuOpen) DrawMenu(W, H, s);
            else if (Cursor.lockState != CursorLockMode.Locked && !ChatOpen && pn.Alive.Value)
                Text(new Rect(0, H * 0.7f, W, 40 * s), Rtl.Fix("לחצו על המסך כדי לחזור למשחק"), Color.white, label, TextAnchor.MiddleCenter, true);
        }

        void DrawChat(float W, float H, float s)
        {
            float cw = 460 * s, cx = W - cw - 20 * s, lineH = 28 * s, baseY = H - 120 * s;
            int shown = 0;
            for (int i = chat.Count - 1; i >= 0 && shown < 8; i--)
            {
                float age = Time.time - chat[i].time;
                if (!ChatOpen && age > 12) continue;
                float y = baseY - (shown + 1) * lineH - (ChatOpen ? 40 * s : 0);
                Fill(cx, y, cw, lineH - 2, new Color(0, 0, 0, 0.4f));
                Text(new Rect(cx + 6, y, cw - 12, lineH), chat[i].text, chat[i].color, small, TextAnchor.MiddleRight);
                shown++;
            }
            if (QuickMenuOpen)
            {
                float qy = baseY - 9 * lineH - ChatFilter.Quick.Length * lineH;
                for (int i = 0; i < ChatFilter.Quick.Length; i++)
                {
                    Fill(cx, qy + i * lineH, cw, lineH - 2, new Color(0.05f, 0.05f, 0.13f, 0.85f));
                    Text(new Rect(cx + 6, qy + i * lineH, cw - 12, lineH), Rtl.Fix($"{i + 1}. {ChatFilter.Quick[i]}"), Color.white, small, TextAnchor.MiddleRight);
                }
            }
            if (!ChatOpen || Time.frameCount == chatOpenedFrame) return;

            var e = Event.current;
            if (e.type == EventType.KeyDown && (e.keyCode == KeyCode.Return || e.keyCode == KeyCode.KeypadEnter)) { e.Use(); CloseChat(true); return; }
            if (e.type == EventType.KeyDown && e.keyCode == KeyCode.Escape) { e.Use(); CloseChat(false); return; }
            var field = new Rect(cx, baseY - 36 * s, cw, 32 * s);
            GUI.SetNextControlName("chat");
            chatText = GUI.TextField(field, chatText, ChatFilter.MaxLength, new GUIStyle(GUI.skin.textField) { fontSize = small.fontSize });
            GUI.FocusControl("chat");
            // Typed Hebrew shows reversed inside the raw field, so preview it correctly above
            if (chatText.Length > 0) Text(new Rect(cx, baseY - 4 * s, cw, 28 * s), Rtl.Fix(chatText), new Color(0.6f, 0.9f, 1f), small, TextAnchor.MiddleRight);
            else Text(new Rect(cx, baseY - 4 * s, cw, 28 * s), Rtl.Fix("Enter לשליחה · Esc לביטול"), new Color(0.6f, 0.65f, 0.8f), small, TextAnchor.MiddleRight);
        }

        void DrawBoard(float W, float H, float s, string title)
        {
            var list = PlayerNetwork.All.OrderByDescending(p => p.Kills.Value).ThenBy(p => p.Deaths.Value).ToList();
            float bw = 620 * s, rowH = 34 * s, bh = (90 + list.Count * 34) * s, bx = (W - bw) / 2, by = (H - bh) / 2;
            Fill(bx, by, bw, bh, new Color(0.05f, 0.05f, 0.13f, 0.88f));
            Text(new Rect(bx, by + 8 * s, bw, 40 * s), title, Color.white, label, TextAnchor.MiddleCenter);
            Text(new Rect(bx + 20 * s, by + 50 * s, 120 * s, rowH), "K / D", new Color(0.6f, 0.65f, 0.8f), small, TextAnchor.MiddleLeft);
            for (int i = 0; i < list.Count; i++)
            {
                var p = list[i];
                float y = by + (50 + 34 + i * 34) * s;
                Color c = p == pn ? new Color(1f, 0.84f, 0f) : Color.white;
                Fill(bx + bw - 30 * s, y + 10 * s, 12 * s, 12 * s, p.Color);
                string tagText = (p.IsBot.Value ? "BOT " : "") + p.DisplayName + (muted.Contains(p.DisplayName) ? " (מושתק)" : "");
                Text(new Rect(bx + 150 * s, y, bw - 190 * s, rowH), Rtl.Fix($"{i + 1}. {tagText}"), c, small, TextAnchor.MiddleRight);
                Text(new Rect(bx + 20 * s, y, 120 * s, rowH), $"{p.Kills.Value} / {p.Deaths.Value}", c, small, TextAnchor.MiddleLeft);
            }
        }

        void DrawEnd(float W, float H, float s, MatchManager match)
        {
            Fill(0, 0, W, H, new Color(0.02f, 0.02f, 0.06f, 0.6f));
            Text(new Rect(0, H * 0.1f, W, 80 * s), endTitle, new Color(1f, 0.84f, 0f), big, TextAnchor.MiddleCenter, true);
            DrawBoard(W, H, s, Rtl.Fix("תוצאות הסבב"));
            float y = H * 0.8f, bw = 500 * s, bx = (W - bw) / 2;
            Text(new Rect(0, y, W, 34 * s), endXp, new Color(0f, 0.9f, 1f), label, TextAnchor.MiddleCenter, true);
            Fill(bx, y + 40 * s, bw, 12 * s, new Color(0, 0, 0, 0.6f));
            Fill(bx, y + 40 * s, bw * endXpFill, 12 * s, new Color(1f, 0.18f, 0.53f));
            Text(new Rect(0, y + 58 * s, W, 30 * s), endGoal, Color.white, small, TextAnchor.MiddleCenter, true);
            Text(new Rect(0, y + 90 * s, W, 30 * s), Rtl.Fix($"סבב הבא בעוד {Mathf.CeilToInt(match.SecondsLeft)} שניות…"), new Color(0.7f, 0.75f, 0.9f), small, TextAnchor.MiddleCenter);
        }

        void DrawMenu(float W, float H, float s)
        {
            float bw = 420 * s, bh = 260 * s, bx = (W - bw) / 2, by = (H - bh) / 2;
            Fill(bx, by, bw, bh, new Color(0.05f, 0.05f, 0.13f, 0.92f));
            Text(new Rect(bx, by + 10 * s, bw, 40 * s), Rtl.Fix("השהיה"), Color.white, label, TextAnchor.MiddleCenter);
            Text(new Rect(bx + 20 * s, by + 60 * s, bw - 40 * s, 30 * s), Rtl.Fix($"רגישות עכבר: {PlayerController.Sensitivity:0.0}"), Color.white, small, TextAnchor.MiddleRight);
            float sens = GUI.HorizontalSlider(new Rect(bx + 20 * s, by + 95 * s, bw - 40 * s, 20 * s), PlayerController.Sensitivity, 0.2f, 3f);
            if (!Mathf.Approximately(sens, PlayerController.Sensitivity)) { PlayerController.Sensitivity = sens; PlayerPrefs.SetFloat("arena.sens", sens); }
            if (GUI.Button(new Rect(bx + 20 * s, by + 130 * s, bw - 40 * s, 44 * s), Rtl.Fix("חזרה למשחק"))) { MenuOpen = false; PlayerController.LockCursor(true); }
            if (GUI.Button(new Rect(bx + 20 * s, by + 185 * s, bw - 40 * s, 44 * s), Rtl.Fix("יציאה לתפריט"))) GameBootstrap.Leave();
        }

        // ---------------- helpers ----------------
        static void Fill(float x, float y, float w, float h, Color c)
        {
            var old = GUI.color;
            GUI.color = c;
            GUI.DrawTexture(new Rect(x, y, w, h), Texture2D.whiteTexture);
            GUI.color = old;
        }

        static void Text(Rect r, string text, Color c, GUIStyle style, TextAnchor anchor, bool shadow = false)
        {
            style.alignment = anchor;
            if (shadow)
            {
                style.normal.textColor = new Color(0, 0, 0, c.a * 0.8f);
                GUI.Label(new Rect(r.x + 2, r.y + 2, r.width, r.height), text, style);
            }
            style.normal.textColor = c;
            GUI.Label(r, text, style);
        }

        // inner..outer radius as fraction of size; opaqueOutside: scope mask, otherwise vignette
        static Texture2D Radial(int size, float inner, float outer, Color color, bool opaqueOutside)
        {
            var t = new Texture2D(size, size, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
            var px = new Color[size * size];
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float dx = (x + 0.5f) / size - 0.5f, dy = (y + 0.5f) / size - 0.5f;
                    float d = Mathf.Sqrt(dx * dx + dy * dy);
                    if (!opaqueOutside) { dx *= 0.8f; d = Mathf.Sqrt(dx * dx + dy * dy); }
                    float a = Mathf.InverseLerp(inner, outer, d);
                    var c = color; c.a = (opaqueOutside ? 1f : color.a) * a;
                    px[y * size + x] = c;
                }
            t.SetPixels(px);
            t.Apply();
            return t;
        }
    }
}
