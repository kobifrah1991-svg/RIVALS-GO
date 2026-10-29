namespace ArenaRush
{
    // Unity's built-in text has no bidi support, so Hebrew renders backwards.
    // This reverses visual order for single-line text while keeping Latin words and numbers readable.
    public static class Rtl
    {
        static bool IsRtl(char c) =>
            (c >= 0x0590 && c <= 0x05FF) || (c >= 0x0600 && c <= 0x06FF) || (c >= 0xFB1D && c <= 0xFDFF) || (c >= 0xFE70 && c <= 0xFEFF);

        static bool IsLtr(char c) => char.IsLetterOrDigit(c) && !IsRtl(c);
        static bool Joins(char c) => c == '.' || c == ':' || c == '/' || c == '-' || c == '_' || c == '\'';

        public static string Fix(string s)
        {
            if (string.IsNullOrEmpty(s)) return s;
            bool any = false;
            foreach (char c in s) if (IsRtl(c)) { any = true; break; }
            if (!any) return s;

            var a = s.ToCharArray();
            System.Array.Reverse(a);
            int i = 0;
            while (i < a.Length)
            {
                if (IsLtr(a[i]))
                {
                    int j = i;
                    while (j + 1 < a.Length && (IsLtr(a[j + 1]) || (Joins(a[j + 1]) && j + 2 < a.Length && IsLtr(a[j + 2])))) j++;
                    System.Array.Reverse(a, i, j - i + 1);
                    i = j + 1;
                }
                else
                {
                    a[i] = Mirror(a[i]);
                    // Reversal flips surrogate pairs; put them back in order
                    if (char.IsLowSurrogate(a[i]) && i + 1 < a.Length && char.IsHighSurrogate(a[i + 1]))
                    {
                        (a[i], a[i + 1]) = (a[i + 1], a[i]);
                        i++;
                    }
                    i++;
                }
            }
            return new string(a);
        }

        static char Mirror(char c)
        {
            switch (c)
            {
                case '(': return ')';
                case ')': return '(';
                case '[': return ']';
                case ']': return '[';
                case '<': return '>';
                case '>': return '<';
                default: return c;
            }
        }
    }
}
