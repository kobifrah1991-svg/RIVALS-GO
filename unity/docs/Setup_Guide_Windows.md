<div dir="rtl" align="right">

# מדריך התקנה: סביבת פיתוח ל-ARENA RUSH עם סוכן קוד (Windows)

> בסוף המדריך יהיו לך Claude Code, Unity ו-Blender מחוברים זה לזה, ופרויקט מוכן שהסוכן עובד עליו לפי מסמך האפיון.
> זמן משוער: 2–3 שעות, רובן בהורדות.

---

## שלב 0: דרישות

- **Windows:** גרסה 10 (1809 ומעלה) או 11, ‏64 ביט.
- **זיכרון ודיסק:** לפחות 16GB RAM, ו-60GB פנויים על SSD.
- **מנוי Claude:** Pro או גבוה יותר, או מפתח API.
- **טלפון אנדרואיד** לבדיקות, עם כבל USB.

כל הפקודות במדריך מורצות ב-**PowerShell** (לא CMD), שנפתח מתפריט התחל.

---

## שלב 1: Git (שמירת גרסאות)

```powershell
winget install Git.Git
```

סגור ופתח מחדש את PowerShell, ובדוק:

```powershell
git --version
```

---

## שלב 2: Claude Code

```powershell
winget install Anthropic.ClaudeCode
```

אם winget לא עובד, אפשר להשתמש בפקודה הזו במקום:

```powershell
irm https://claude.ai/install.ps1 | iex
```

סגור ופתח מחדש את PowerShell, הרץ את הפקודה הבאה, והתחבר לחשבון Claude שלך בדפדפן שנפתח:

```powershell
claude
```

> **אם מופיעה השגיאה "command not found":** סגור את כל חלונות PowerShell ופתח חדש.

---

## שלב 3: Unity

1. **התקן את Unity Hub:**
   ```powershell
   winget install Unity.UnityHub
   ```
2. **התקן את Unity 6:** פתח את Unity Hub ועבור אל Installs, ואז Install Editor. בחר את גרסת **Unity 6 LTS** האחרונה.
3. **בחר מודולים:** במסך המודולים סמן את:
   - **Android Build Support,** כולל OpenJDK ו-Android SDK & NDK Tools.
   - **Windows Build Support (IL2CPP).**
4. **צור פרויקט:** ב-Unity Hub לחץ על New project, ובחר בתבנית **Universal 3D (URP)**.
   - **שם:** `ArenaRush`
   - **מיקום:** `C:\Games\` (בלי עברית ובלי רווחים בנתיב)

---

## שלב 4: הכנת הפרויקט לסוכן

1. **צור תיקיית מסמכים** בתוך תיקיית הפרויקט:
   ```powershell
   cd C:\Games\ArenaRush
   mkdir docs
   ```
2. **העתק את מסמך האפיון:** שים את `GDD_Arena_Rush.md` בתוך `C:\Games\ArenaRush\docs\`.
3. **צור קובץ הוראות קבוע לסוכן:** צור קובץ בשם `CLAUDE.md` בתיקייה הראשית של הפרויקט, עם התוכן הבא:

   ```markdown
   # ArenaRush – Agent Instructions
   - Read docs/GDD_Arena_Rush.md before every task.
   - Engine: Unity 6, URP, C#. Target: Windows + Android.
   - Work only on the current milestone (see GDD section 17).
   - Balance values in ScriptableObjects/JSON, never hardcoded.
   - No hardcoded UI text: use Unity Localization. Hebrew/Arabic must render RTL.
   - Damage, economy and match results are server-authoritative.
   - After each task: check compile errors, git commit, list what Kobi should test manually.
   - Explain things simply; the owner has limited technical background.
   ```

4. **הפעל את Claude Code והגדר Git:**
   ```powershell
   cd C:\Games\ArenaRush
   claude
   ```
   ובתוך Claude Code כתוב:
   > צור קובץ .gitignore מתאים ל-Unity, אתחל git ובצע commit ראשון.

---

## שלב 5: חיבור Claude Code ל-Unity

יש שתי דרכים. התחום משתנה מהר, אז בקש מ-Claude Code לבדוק מה הדרך המומלצת כרגע:

> בדוק בתיעוד העדכני של Unity מה הדרך המומלצת לחבר את Claude Code ל-Unity Editor (MCP או Unity CLI), התקן אותה בפרויקט הזה והסבר לי מה לאשר בכל שלב.

- **הדרך הרשמית:** חבילת Unity AI Assistant (‏`com.unity.ai.assistant`) ל-Unity 6. היא כוללת גשר שמאפשר לסוכנים חיצוניים לשלוט בעורך. בגרסאות החדשות Unity עוברת מ-MCP לכלי שורת פקודה (Unity CLI).
- **חלופה קהילתית:** חבילת MCP for Unity (של Coplay), עם כלים רבים לסצנות ולנכסים.

**בדיקה שהחיבור עובד:** בקש מ-Claude Code:
> צור בסצנה קובייה אדומה בגובה 2 מטר ותבדוק שאין שגיאות בקונסולה.

אם הקובייה הופיעה ב-Unity, החיבור עובד.

---

## שלב 6: Blender וחיבור ל-Claude Code

1. **התקן את Blender:**
   ```powershell
   winget install BlenderFoundation.Blender
   ```
2. **התקן את uv** (נדרש לשרת החיבור):
   ```powershell
   powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
   ```
   אחר כך סגור ופתח מחדש את PowerShell.
3. **התקן את התוסף ב-Blender:**
   - הורד את הקובץ `addon.py` מהמאגר `github.com/ahujasid/blender-mcp`.
   - ב-Blender עבור אל Edit, ‏Preferences, ‏Add-ons, ואז Install, ובחר את הקובץ.
   - סמן את התוסף **Interface: Blender MCP**.
   - בחלון הראשי לחץ **N**, עבור ללשונית **BlenderMCP** ולחץ **Connect**.
4. **חבר את Claude Code ל-Blender:**
   ```powershell
   claude mcp add blender uvx blender-mcp
   ```
   אם החיבור לא עובד ב-Windows, נסה:
   ```powershell
   claude mcp add blender -- cmd /c uvx blender-mcp
   ```
5. **בדיקה:** ב-Claude Code כתוב:
   > צור ב-Blender ארגז עץ בסגנון low-poly וייצא אותו כ-FBX לתיקייה Assets/Models בפרויקט Unity.

> ⚠️ **התוסף מאפשר לסוכן להריץ קוד Python ב-Blender.** שמור את העבודה לפני כל בקשה.

---

## שלב 7: טלפון אנדרואיד לבדיקות

1. **הפעל מצב מפתחים בטלפון:** עבור להגדרות ואז "אודות הטלפון", ולחץ 7 פעמים על "מספר Build".
2. **הפעל ניפוי באגים:** בהגדרות, תחת "אפשרויות מפתח", הפעל **USB Debugging**.
3. **חבר בכבל ובנה:** ב-Unity עבור אל File ואז Build Profiles, בחר Android ולחץ Switch Platform, ואז **Build And Run**.

---

## שלב 8: פקודות ראשונות לסוכן (שלב M0)

שלח אותן אחת-אחת, ובדוק כל אחת לפני הבאה:

1. **בקר שחקן:**
   > לפי שלב M0 במסמך האפיון: בנה בקר שחקן בגוף ראשון עם ריצה, קפיצה, כריעה וגלישה. שליטה במקלדת ועכבר ובמגע לטלפון.
2. **רובה סער:**
   > הוסף רובה סער עם ירי, רתיעה, טעינה ותחמושת. כל הערכים ב-ScriptableObject.
3. **זירת בדיקה:**
   > בנה זירת בדיקה פשוטה עם כיסויים וגבהים, ו-3 בוטים שזזים ויורים.
4. **תחושת ירי:**
   > הוסף את תחושת הירי מסעיף 9: סימן פגיעה עם צלילים, מספרי נזק, הבזק קנה ורטט בטלפון.
5. **בדיקה על הטלפון:**
   > בנה גרסת אנדרואיד ותגיד לי מה לבדוק בטלפון.

אחרי כל שלב שעובד, בקש: "בצע commit".

---

## טיפים חשובים

- **משימה אחת בכל פעם.** בקשות ענקיות יוצאות גרועות.
- **כשמשהו נשבר,** בקש: "חזור ל-commit הקודם".
- **תתאר מה אתה מרגיש** ולא רק מה לא עובד. לדוגמה: "הירי מרגיש חלש", "הקפיצה איטית מדי".
- **גבה את הפרויקט ל-GitHub** (בקש מהסוכן ליצור מאגר פרטי).
- **מודלים מורכבים** (דמויות, נשקים מפורטים) עדיף לקנות או להוריד מוכנים, ולהשתמש ב-Blender בעיקר להתאמות.

</div>
