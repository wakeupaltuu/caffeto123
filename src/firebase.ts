import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBuehG5uujfUglO9w_-AzD2IIUyS_ivwUA",
  authDomain: "loyalty-app-f2c9b.firebaseapp.com",
  projectId: "loyalty-app-f2c9b",
  storageBucket: "loyalty-app-f2c9b.appspot.com", // FIXED
  messagingSenderId: "594430643261",
  appId: "1:594430643261:web:e7981ba1a0e38ffda1ae54"
};

const app = initializeApp(firebaseConfig);

// ✅ ADD THESE (VERY IMPORTANT)
export const auth = getAuth(app);
export const db = getFirestore(app);