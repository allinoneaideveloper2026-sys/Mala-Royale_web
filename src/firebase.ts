import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { CONFIG } from './config';

export const firebaseConfigured = Object.values(CONFIG.firebase).every(Boolean);

const app = firebaseConfigured
  ? getApps()[0] ?? initializeApp(CONFIG.firebase)
  : null;

export const auth = app ? getAuth(app) : null;
export const firestore = app ? getFirestore(app) : null;