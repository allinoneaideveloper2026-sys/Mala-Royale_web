import { createContext, useContext } from 'react';
import { TRANSLATIONS } from '../i18n';
import { DICTIONARY } from './dictionary';

/*
 * How translation works
 *  - Every visible customer-facing text is written in English in the code, like tr('Add to cart').
 *  - tr() looks that English text up in DICTIONARY (src/i18n/dictionary.ts) for the chosen language.
 *  - If a translation is missing, the English text is shown, so nothing ever breaks.
 *  - Placeholders such as {count} are filled in after translating: tr('Only {count} left', { count: 2 }).
 *
 * The translations were produced with AI assistance. A native speaker should review the important
 * wording (policies, payment text) before relying on it.
 */

export type UiLanguage = 'en' | 'kn' | 'hi' | 'te' | 'ta';

export const LANGUAGES: Array<{ code: UiLanguage; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'kn', label: 'ಕನ್ನಡ (Kannada)' },
  { code: 'hi', label: 'हिन्दी (Hindi)' },
  { code: 'te', label: 'తెలుగు (Telugu)' },
  { code: 'ta', label: 'தமிழ் (Tamil)' },
];

export const LANGUAGE_STORAGE_KEY = 'mr:language';

export function isUiLanguage(value: string | null | undefined): value is UiLanguage {
  return LANGUAGES.some(language => language.code === value);
}

/** Order of the translations inside each DICTIONARY entry. */
const ENTRY_INDEX: Record<Exclude<UiLanguage, 'en'>, number> = { kn: 0, hi: 1, te: 2, ta: 3 };

export type Vars = Record<string, string | number>;
export type TrFn = (text: string, vars?: Vars) => string;

export function interpolate(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

export function translate(lang: UiLanguage, text: string, vars?: Vars): string {
  let result = text;
  if (lang !== 'en') {
    const entry = DICTIONARY[text];
    const translated = entry ? entry[ENTRY_INDEX[lang]] : undefined;
    if (translated) result = translated;
  }
  return interpolate(result, vars);
}

export const makeTr = (lang: UiLanguage): TrFn => (text, vars) => translate(lang, text, vars);

/** Lets any component call useTr() without passing the language down as a prop. */
export const TrContext = createContext<TrFn>((text, vars) => interpolate(text, vars));
export const useTr = (): TrFn => useContext(TrContext);

/* ---- Strings that already live in src/i18n.ts (English and Kannada) ---- */

type Strings = typeof TRANSLATIONS.en;

const KEY_OVERRIDES: Record<'hi' | 'te' | 'ta', Record<string, string>> = {
  hi: {
    appName: 'Mala Royale',
    tagline: 'खास साड़ियाँ और कस्टम कुचु स्टाइल',
    step1Address: 'चरण 1: डिलीवरी पता',
    step2Payment: 'चरण 2: वस्तु का भुगतान',
    enterUtr: '12 अंकों का UTR नंबर दर्ज करें',
    placeOrder: 'ऑर्डर करें',
    myOrders: 'मेरे ऑर्डर',
    acceptCourierNotice: 'मैंने कूरियर शुल्क की सूचना पढ़ ली है और स्वीकार करता/करती हूँ',
    courierNoticeTitle: 'कूरियर शुल्क की सूचना',
  },
  te: {
    appName: 'Mala Royale',
    tagline: 'ప్రత్యేక చీరలు & కస్టమ్ కుచు స్టైల్స్',
    step1Address: 'దశ 1: డెలివరీ చిరునామా',
    step2Payment: 'దశ 2: వస్తువు చెల్లింపు',
    enterUtr: '12 అంకెల UTR నంబర్ నమోదు చేయండి',
    placeOrder: 'ఆర్డర్ చేయండి',
    myOrders: 'నా ఆర్డర్లు',
    acceptCourierNotice: 'కొరియర్ ఛార్జీల నోటీసును చదివి అంగీకరిస్తున్నాను',
    courierNoticeTitle: 'కొరియర్ ఛార్జీల నోటీసు',
  },
  ta: {
    appName: 'Mala Royale',
    tagline: 'சிறப்பு புடவைகள் & கஸ்டம் குச்சு ஸ்டைல்கள்',
    step1Address: 'படி 1: டெலிவரி முகவரி',
    step2Payment: 'படி 2: பொருள் கட்டணம்',
    enterUtr: '12 இலக்க UTR எண்ணை உள்ளிடவும்',
    placeOrder: 'ஆர்டர் செய்யவும்',
    myOrders: 'என் ஆர்டர்கள்',
    acceptCourierNotice: 'கூரியர் கட்டண அறிவிப்பைப் படித்து ஏற்கிறேன்',
    courierNoticeTitle: 'கூரியர் கட்டண அறிவிப்பு',
  },
};

/**
 * The text bundle used for t.something. English and Kannada come from src/i18n.ts exactly as written.
 * For Hindi, Telugu and Tamil the short labels above are used, and anything not listed (such as the long
 * courier-charge notice) falls back to English until it is translated.
 */
export function buildStrings(lang: UiLanguage): Strings {
  if (lang === 'en' || lang === 'kn') return TRANSLATIONS[lang];
  return { ...TRANSLATIONS.en, ...KEY_OVERRIDES[lang] } as Strings;
}
