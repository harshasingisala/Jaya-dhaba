import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getAnalytics } from "firebase/analytics";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBT3H0AHT1QMIVWgi4zw5uUkE1KyE-Sq6o",
  authDomain: "feedx-event-passes.firebaseapp.com",
  projectId: "feedx-event-passes",
  storageBucket: "feedx-event-passes.firebasestorage.app",
  messagingSenderId: "789676354433",
  appId: "1:789676354433:web:2d168f4287b849ffd95680",
  measurementId: "G-82NVML4E1P"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

export { auth, analytics };
export default app;
