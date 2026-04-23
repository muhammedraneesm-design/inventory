import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import importedConfig from '../firebase-applet-config.json';

const firebaseConfig = {
  ...importedConfig,
  firestoreDatabaseId: (importedConfig as any).firestoreDatabaseId
};

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, (firebaseConfig as any).firestoreDatabaseId);
export const auth = getAuth(app);
