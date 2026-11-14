import type { FeedbackSentiment } from '../domain/types';

/*
 * Feedback analyser. It reads a short customer comment and decides:
 *   - sentiment: positive, negative, a suggestion, or neutral
 *   - category: what the comment is about (product quality, delivery, price, ...)
 *   - language: English, Kannada, Hindi, Telugu or Tamil (from the script used)
 *
 * It runs in the browser using word lists and simple negation handling ("not good" counts as negative),
 * with English words, common romanised Hindi and Kannada words, and Kannada, Hindi, Telugu and Tamil script.
 * It is quick and free, but it is a rule-based classifier, not a language model, so the host can always read
 * the original comment in the Feedback tab.
 */

export interface FeedbackAnalysis {
  sentiment: FeedbackSentiment;
  category: string;
  confidence: number;
  keywords: string[];
  language: string;
}

export const FEEDBACK_CATEGORIES = [
  'Delivery & courier',
  'Payment',
  'Price & offers',
  'Product quality',
  'Website experience',
  'Customer service',
  'Collection & variety',
  'General',
] as const;

const POSITIVE = [
  'good', 'great', 'love', 'loved', 'lovely', 'excellent', 'beautiful', 'gorgeous', 'nice', 'awesome', 'amazing', 'best',
  'perfect', 'happy', 'thank', 'thanks', 'genuine', 'recommend', 'wonderful', 'superb', 'fantastic', 'satisfied', 'pleased',
  'elegant', 'stunning', 'fast', 'quick', 'smooth', 'easy', 'helpful', 'polite', 'worth', 'impressed', 'classy', 'pretty',
  'accha', 'acha', 'badhiya', 'sundar', 'shaandar', 'mast', 'chennagide', 'chennagi', 'super', 'adbhuta', 'olleya',
  'अच्छा', 'अच्छी', 'सुंदर', 'शानदार', 'बढ़िया', 'धन्यवाद', 'ಚೆನ್ನಾಗಿದೆ', 'ಚೆನ್ನಾಗಿ', 'ಸೂಪರ್', 'ಧನ್ಯವಾದ', 'ಅದ್ಭುತ', 'ಒಳ್ಳೆಯ',
  'బాగుంది', 'బాగున్నాయి', 'అద్భుతం', 'நன்று', 'நன்றாக', 'அருமை', 'நன்றி',
];

const NEGATIVE = [
  'bad', 'poor', 'worst', 'terrible', 'awful', 'late', 'delay', 'delayed', 'damaged', 'broken', 'wrong', 'fake', 'cheat',
  'fraud', 'disappointed', 'disappointing', 'waste', 'rude', 'slow', 'expensive', 'overpriced', 'torn', 'dirty', 'faded',
  'difficult', 'confusing', 'error', 'bug', 'stuck', 'problem', 'issue', 'complaint', 'missing', 'pathetic', 'unhappy',
  'kharab', 'bekar', 'bekaar', 'ganda', 'dhokha', 'kettadu', 'ketta', 'bejaar',
  'खराब', 'बेकार', 'धोखा', 'देरी', 'ಕೆಟ್ಟ', 'ತಡ', 'ಮೋಸ', 'చెడు', 'ఆలస్యం', 'மோசம்', 'தாமதம்',
];

const SUGGESTION = [
  'please', 'pls', 'kindly', 'suggest', 'suggestion', 'should', 'could', 'wish', 'add', 'include', 'introduce', 'improve',
  'need', 'needs', 'want', 'consider', 'request', 'maybe', 'option', 'options', 'bring', 'expect', 'hope', 'wonder',
  'karo', 'kijiye', 'chahiye', 'beku', 'bekittu', 'maadi',
  'कृपया', 'चाहिए', 'सुझाव', 'ದಯವಿಟ್ಟು', 'ಬೇಕು', 'ಸೂಚನೆ', 'కావాలి', 'దయచేసి', 'வேண்டும்', 'தயவுசெய்து',
];

const SUGGESTION_PHRASES = ['would be nice', 'would love', 'can you', 'could you', 'why not', 'it would help', 'would help', 'would be great', 'it will be good'];

const NEGATORS = new Set([
  'not', 'no', 'never', 'dont', "don't", 'didnt', "didn't", 'isnt', "isn't", 'wasnt', "wasn't", 'cant', "can't", 'without',
  'nahi', 'nahin', 'illa', 'नहीं', 'ಇಲ್ಲ',
]);

const CATEGORY_WORDS: Array<{ category: string; words: string[] }> = [
  { category: 'Delivery & courier', words: ['delivery', 'deliver', 'delivered', 'courier', 'shipping', 'shipment', 'dispatch', 'parcel', 'package', 'packing', 'packed', 'packaging', 'tracking', 'arrived', 'transit', 'late', 'delay', 'delayed', 'कूरियर', 'डिलीवरी', 'पार्सल', 'ಕೊರಿಯರ್', 'ವಿತರಣೆ', 'డెలివరీ', 'கூரியர்'] },
  { category: 'Payment', words: ['payment', 'pay', 'paid', 'upi', 'utr', 'qr', 'transaction', 'refund', 'money', 'भुगतान', 'ಪಾವತಿ', 'చెల్లింపు', 'பணம்'] },
  { category: 'Price & offers', words: ['price', 'pricing', 'offer', 'offers', 'discount', 'cost', 'expensive', 'cheap', 'value', 'deal', 'sale', 'affordable', 'rate', 'worth', 'कीमत', 'ऑफर', 'छूट', 'ಬೆಲೆ', 'ರಿಯಾಯಿತಿ', 'ధర', 'விலை'] },
  { category: 'Product quality', words: ['quality', 'fabric', 'material', 'stitch', 'stitching', 'silk', 'colour', 'color', 'finish', 'zari', 'weave', 'texture', 'size', 'fit', 'saree', 'sarees', 'kuchu', 'cloth', 'क्वालिटी', 'गुणवत्ता', 'ಗುಣಮಟ್ಟ', 'నాణ్యత', 'தரம்'] },
  { category: 'Website experience', words: ['website', 'site', 'app', 'page', 'checkout', 'login', 'signin', 'loading', 'navigation', 'search', 'filter', 'mobile', 'language', 'translate', 'bug', 'error', 'cart', 'order', 'ordering', 'वेबसाइट', 'ವೆಬ್ಸೈಟ್'] },
  { category: 'Customer service', words: ['service', 'support', 'reply', 'replied', 'response', 'responded', 'staff', 'team', 'whatsapp', 'call', 'helpful', 'rude', 'polite', 'return', 'exchange', 'communication', 'सेवा', 'ಸೇವೆ'] },
  { category: 'Collection & variety', words: ['collection', 'variety', 'designs', 'design', 'range', 'stock', 'colours', 'colors', 'catalogue', 'catalog', 'custom', 'arrivals', 'new', 'limited', 'पैटर्न', 'ವೈವಿಧ್ಯ'] },
];

export function detectLanguage(text: string): string {
  if (/[\u0C80-\u0CFF]/.test(text)) return 'kn';
  if (/[\u0900-\u097F]/.test(text)) return 'hi';
  if (/[\u0C00-\u0C7F]/.test(text)) return 'te';
  if (/[\u0B80-\u0BFF]/.test(text)) return 'ta';
  return 'en';
}

const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}'\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

export function analyzeFeedback(raw: string): FeedbackAnalysis {
  const text = raw.trim();
  const tokens = tokenize(text);
  const joined = ` ${tokens.join(' ')} `;
  const matched: string[] = [];

  const positive = new Set(POSITIVE);
  const negative = new Set(NEGATIVE);
  const suggestion = new Set(SUGGESTION);

  let pos = 0;
  let neg = 0;
  let sug = 0;

  tokens.forEach((token, index) => {
    const negated = NEGATORS.has(tokens[index - 1] ?? '') || NEGATORS.has(tokens[index - 2] ?? '');
    if (positive.has(token)) {
      if (negated) neg += 1; else pos += 1;
      matched.push(token);
    } else if (negative.has(token)) {
      if (negated) pos += 0.5; else neg += 1;
      matched.push(token);
    } else if (suggestion.has(token)) {
      sug += 1;
      matched.push(token);
    }
  });

  SUGGESTION_PHRASES.forEach(phrase => {
    if (joined.includes(` ${phrase} `)) {
      sug += 1.5;
      matched.push(phrase);
    }
  });
  if (text.includes('?')) sug += 0.5;

  let sentiment: FeedbackSentiment;
  if (sug >= 2 || (sug >= 1 && pos + neg === 0)) sentiment = 'SUGGESTION';
  else if (neg > pos) sentiment = 'NEGATIVE';
  else if (pos > neg) sentiment = 'POSITIVE';
  else if (neg > 0) sentiment = 'NEGATIVE';
  else sentiment = 'NEUTRAL';

  const scores = [pos, neg, sug].sort((left, right) => right - left);
  const margin = scores[0] - scores[1];
  const confidence = scores[0] === 0 ? 0.3 : Math.min(0.95, 0.5 + 0.15 * margin + 0.05 * scores[0]);

  let category = 'General';
  let best = 0;
  CATEGORY_WORDS.forEach(entry => {
    const hits = entry.words.filter(word => tokens.includes(word));
    if (hits.length > best) {
      best = hits.length;
      category = entry.category;
      matched.push(...hits);
    }
  });

  return {
    sentiment,
    category,
    confidence: Math.round(confidence * 100) / 100,
    keywords: Array.from(new Set(matched)).slice(0, 6),
    language: detectLanguage(text),
  };
}
