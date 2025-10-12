import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDkY-Mezac1UWkPaudQ9ESdkMRuUMosXH0",
    authDomain: "orium-1b747.firebaseapp.com",
    projectId: "orium-1b747",
    storageBucket: "orium-1b747.firebasestorage.app",
    messagingSenderId: "520785396241",
    appId: "1:520785396241:web:b492a562a9c3cfe9c427b0"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);