import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { firebaseConfig } from './firebase-config.js';
import { ipcRenderer } from 'electron';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const emailInput = document.getElementById('email') as HTMLInputElement;
const passwordInput = document.getElementById('password') as HTMLInputElement;
const loginButton = document.getElementById('login-button') as HTMLButtonElement;
const signupButton = document.getElementById('signup-button') as HTMLButtonElement;

loginButton.addEventListener('click', async () => {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
        const user = userCredential.user;
        if (user) {
            ipcRenderer.send('login-success');
        }
    } catch (error) {
        console.error('Login failed:', error);
    }
});

signupButton.addEventListener('click', async () => {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
        const user = userCredential.user;
        if (user) {
            ipcRenderer.send('login-success');
        }
    } catch (error) {
        console.error('Sign up failed:', error);
    }
});