export const APP_VERSION = '0.1.0-web';
export const DEFAULT_DEVELOPER_EMAILS = ['allinoneaideveloper2026@gmail.com'];

export const CONFIG = {
  version: APP_VERSION,
  developerEmails: (import.meta.env.VITE_DEVELOPER_EMAILS || DEFAULT_DEVELOPER_EMAILS.join(',')).split(','),
  ownerEmails: (import.meta.env.VITE_OWNER_EMAILS || 'owner@malaroyale.com').split(','),
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
  pincodeProxyUrl: import.meta.env.VITE_PINCODE_PROXY_URL || '',
  feedbackUrl: import.meta.env.VITE_FEEDBACK_URL || '',
  maxHostLogins: 3,
  firebase: {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  },
  cloudinary: {
    cloudName: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || '',
    uploadPreset: import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || '',
  },
};
