// Teen-safe chat filter (GDD §13): profanity, personal info, external links.
// The word list is deliberately short — extend it in one place.
const BAD_WORDS = [
  'fuck', 'shit', 'bitch', 'cunt', 'dick', 'asshole', 'bastard', 'nigger', 'faggot', 'whore', 'slut',
  'זונה', 'בן זונה', 'כוסאמק', 'כוסעמק', 'מניאק', 'שרמוטה', 'זין', 'מזדיין', 'חרא', 'מטומטם', 'אידיוט',
  'блять', 'бля', 'сука', 'хуй', 'пизда', 'ебать', 'мудак', 'долбоёб',
  'شرموطة', 'منيوك', 'عرص', 'كس امك', 'زبي', 'خول',
];

const LINK = /\b((https?:\/\/|www\.)\S+|\S+\.(com|net|org|io|gg|co|il|ru|me|xyz|ly)(\/\S*)?)\b/gi;
const EMAIL = /\S+@\S+\.\S+/g;
const PHONE = /(\+?\d[\d\s\-.()]{6,}\d)/g;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BAD_RE = new RegExp(`(^|[^\\p{L}])(${BAD_WORDS.map(escapeRe).join('|')})(?=$|[^\\p{L}])`, 'giu');

export function filterChat(text) {
  let t = String(text).replace(/[\u0000-\u001f​-‏‪-‮]/g, '').trim().slice(0, 120);
  let flagged = false;
  const mark = (re, rep) => { t = t.replace(re, (...m) => { flagged = true; return typeof rep === 'function' ? rep(...m) : rep; }); };
  // Replacements are symbols so they read the same in every language
  mark(EMAIL, '[🔒]');
  mark(LINK, '[🔗✖]');
  mark(PHONE, '[🔒]');
  mark(BAD_RE, (_m, pre, word) => pre + '*'.repeat([...word].length));
  return { text: t, flagged };
}

export function cleanName(name) {
  let n = String(name || '').replace(/[^\p{L}\p{N}_\- ]/gu, '').trim().slice(0, 16);
  if (!n || filterChat(n).flagged) n = 'Player' + Math.floor(100 + Math.random() * 900);
  return n;
}

// Quick chat lines are translated on each client (keys quick.0 … quick.5 in i18n.js)
export const QUICK_CHAT = ['quick.0', 'quick.1', 'quick.2', 'quick.3', 'quick.4', 'quick.5'];
