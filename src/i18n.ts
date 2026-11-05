export type Language = 'en' | 'kn';

export interface TranslationDictionary {
  appName: string;
  tagline: string;
  roleDeveloper: string;
  roleHost: string;
  roleCustomer: string;
  courierNoticeTitle: string;
  courierNoticeBody: string;
  acceptCourierNotice: string;
  step1Address: string;
  step2Payment: string;
  step3Confirm: string;
  uploadProof: string;
  enterUtr: string;
  placeOrder: string;
  verifyPayment: string;
  uploadCourierReceipt: string;
  markDispatched: string;
  shareApp: string;
  reportIssue: string;
  addHostHeader: string;
  publishProduct: string;
  itemTotal: string;
  courierCharge: string;
  orderStage: string;
  myOrders: string;
}

export const TRANSLATIONS: Record<Language, TranslationDictionary> = {
  en: {
    appName: 'Mala Royale',
    tagline: 'Exclusive Sarees & Custom Kuchu Styles',
    roleDeveloper: 'Developer View',
    roleHost: 'Host / Owner View',
    roleCustomer: 'Customer View',
    courierNoticeTitle: 'Important Courier Charge Notice',
    courierNoticeBody: 'Item price and courier charge are separate. Courier charge depends on parcel size, weight, and distance, and will be calculated after packing.',
    acceptCourierNotice: 'I understand and accept the courier policy',
    step1Address: '1. Shipping Address',
    step2Payment: '2. Item Payment',
    step3Confirm: '3. Order Confirmation',
    uploadProof: 'Upload Payment Screenshot',
    enterUtr: 'Enter 12-digit UTR Number',
    placeOrder: 'Place Order & Submit Payment Proof',
    verifyPayment: 'Verify Payment',
    uploadCourierReceipt: 'Attach Courier Receipt & Charge',
    markDispatched: 'Submit for Dispatch',
    shareApp: 'Share App / Catalog',
    reportIssue: 'Report Bug / Suggest Feature',
    addHostHeader: 'Authorized Host Email Management',
    publishProduct: 'Publish Product to Catalog',
    itemTotal: 'Item Total',
    courierCharge: 'Courier Charge',
    orderStage: 'Order Stage',
    myOrders: 'My Active Orders & Progress',
  },
  kn: {
    appName: 'ಮಾಲಾ ರಾಯಲ್',
    tagline: 'ಉತ್ತಮ ಸೀರೆಗಳು ಮತ್ತು ಕಸ್ಟಮ್ ಕುಚ್ಚು ಶೈಲಿಗಳು',
    roleDeveloper: 'ಡೆವಲಪರ್ ವೀಕ್ಷಣೆ',
    roleHost: 'ಆತಿಥೇಯ / ಮಾಲೀಕರ ವೀಕ್ಷಣೆ',
    roleCustomer: 'ಗ್ರಾಹಕರ ವೀಕ್ಷಣೆ',
    courierNoticeTitle: 'ಪ್ರಮುಖ ಕೊರಿಯರ್ ಶುಲ್ಕ ಸೂಚನೆ',
    courierNoticeBody: 'ವಸ್ತುವಿನ ಬೆಲೆ ಮತ್ತು ಕೊರಿಯರ್ ಶುಲ್ಕ ಪ್ರತ್ಯೇಕವಾಗಿರುತ್ತವೆ. ಪ್ಯಾಕಿಂಗ್ ನಂತರ ತೂಕ ಮತ್ತು ದೂರದ ಆಧಾರದ ಮೇಲೆ ಕೊರಿಯರ್ ಶುಲ್ಕವನ್ನು ನಿರ್ಧರಿಸಲಾಗುತ್ತದೆ.',
    acceptCourierNotice: 'ನಾನು ಕೊರಿಯರ್ ನೀತಿಯನ್ನು ಒಪ್ಪಿಕೊಳ್ಳುತ್ತೇನೆ',
    step1Address: '೧. ವಿಳಾಸ',
    step2Payment: '೨. ಪಾವತಿ',
    step3Confirm: '೩. ದೃಢೀಕರಣ ಮತ್ತು ಟ್ರ್ಯಾಕಿಂಗ್',
    uploadProof: 'ಪಾವತಿ ಸ್ಕ್ರೀನ್‌ಶಾಟ್ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ',
    enterUtr: 'UTR ಸಂಖ್ಯೆಯನ್ನು ನಮೂದಿಸಿ',
    placeOrder: 'ಆರ್ಡರ್ ಮಾಡಿ',
    verifyPayment: 'ಪಾವತಿಯನ್ನು ಪರಿಶೀಲಿಸಿ',
    uploadCourierReceipt: 'ಕೊರಿಯರ್ ರಸೀದಿ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ',
    markDispatched: 'ರವಾನೆಗೆ ಸಲ್ಲಿಸಿ',
    shareApp: 'ಅಪ್ಲಿಕೇಶನ್ ಹಂಚಿಕೊಳ್ಳಿ',
    reportIssue: 'ಸಮಸ್ಯೆಯನ್ನು ವರದಿ ಮಾಡಿ',
    addHostHeader: 'ಆತಿಥೇಯ ಇಮೇಲ್ ನಿರ್ವಹಣೆ',
    publishProduct: 'ಉತ್ಪನ್ನವನ್ನು ಪ್ರಕಟಿಸಿ',
    itemTotal: 'ಒಟ್ಟು ಮೊತ್ತ',
    courierCharge: 'ಕೊರಿಯರ್ ಶುಲ್ಕ',
    orderStage: 'ಆರ್ಡರ್ ಹಂತ',
    myOrders: 'ನನ್ನ ಸಕ್ರಿಯ ಆರ್ಡರ್‌ಗಳು',
  }
};
