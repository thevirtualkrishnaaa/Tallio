import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Tallio Firebase project
const firebaseConfig = {
  apiKey: 'AIzaSyDilpuV6WlXsLa0AeiX-KtKGNYND2sGllA',
  authDomain: 'talliofinance.firebaseapp.com',
  projectId: 'talliofinance',
  storageBucket: 'talliofinance.firebasestorage.app',
  messagingSenderId: '11685244293',
  appId: '1:11685244293:web:fdf2a3145897f4d6fd68ec',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
