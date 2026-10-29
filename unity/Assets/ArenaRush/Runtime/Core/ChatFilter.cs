using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace ArenaRush
{
    // Teen-safe chat filter (GDD §13): profanity, personal info and external links. Runs on the server.
    public static class ChatFilter
    {
        public const int MaxLength = 100;

        static readonly string[] BadWords =
        {
            "fuck", "shit", "bitch", "cunt", "dick", "asshole", "bastard", "nigger", "faggot", "whore", "slut",
            "זונה", "בן זונה", "כוסאמק", "כוסעמק", "מניאק", "שרמוטה", "זין", "מזדיין", "חרא", "מטומטם", "אידיוט",
        };

        public static readonly string[] Quick = { "עזרה!", "אויב משמאל!", "אויב מימין!", "יפה!", "משחק טוב!", "עקבו אחריי!" };

        static readonly Regex Email = new Regex(@"\S+@\S+\.\S+", RegexOptions.Compiled);
        static readonly Regex Link = new Regex(@"\b((https?://|www\.)\S+|\S+\.(com|net|org|io|gg|co|il|ru|me|xyz|ly)(/\S*)?)\b", RegexOptions.Compiled | RegexOptions.IgnoreCase);
        static readonly Regex Phone = new Regex(@"(\+?\d[\d\s\-.()]{6,}\d)", RegexOptions.Compiled);
        static readonly Regex Bad = new Regex(@"(^|[^\p{L}])(" + string.Join("|", BadWords.Select(Regex.Escape)) + @")(?=$|[^\p{L}])", RegexOptions.Compiled | RegexOptions.IgnoreCase);
        static readonly Regex Control = new Regex(@"[\u0000-\u001f​-‏‪-‮]", RegexOptions.Compiled);

        public static string Filter(string input, out bool flagged)
        {
            bool f = false;
            string t = Control.Replace(input ?? "", "").Trim();
            if (t.Length > MaxLength) t = t.Substring(0, MaxLength);
            t = Email.Replace(t, _ => { f = true; return "[מידע אישי הוסתר]"; });
            t = Link.Replace(t, _ => { f = true; return "[קישור הוסר]"; });
            t = Phone.Replace(t, _ => { f = true; return "[מידע אישי הוסתר]"; });
            t = Bad.Replace(t, m => { f = true; return m.Groups[1].Value + new string('*', m.Groups[2].Value.Length); });
            flagged = f;
            return t;
        }

        public static string CleanName(string name)
        {
            var sb = new StringBuilder();
            foreach (char c in name ?? "")
                if (char.IsLetterOrDigit(c) || c == ' ' || c == '_' || c == '-') sb.Append(c);
            string n = sb.ToString().Trim();
            if (n.Length > 16) n = n.Substring(0, 16);
            Filter(n, out bool bad);
            if (n.Length == 0 || bad) n = "שחקן" + UnityEngine.Random.Range(100, 1000);
            // Must fit a FixedString64Bytes (61 UTF-8 bytes)
            while (Encoding.UTF8.GetByteCount(n) > 60) n = n.Substring(0, n.Length - 1);
            return n;
        }
    }
}
