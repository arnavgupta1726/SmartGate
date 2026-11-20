
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";


const firebaseConfig = {
    apiKey: "AIzaSyDs-vBpCfYeNvVgaSL2COhZhbk3lP_uNRg",
    authDomain: "smartgate-new.firebaseapp.com",
    projectId: "smartgate-new",
    storageBucket: "smartgate-new.firebasestorage.app",
    messagingSenderId: "852289269760",
    appId: "1:852289269760:web:a0a03e6b8fc311a9ba68e5"
};


const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);


export { app, auth, db };
