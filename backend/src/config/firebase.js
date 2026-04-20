const admin = require("firebase-admin");
const logger = require("../utils/logger");

let isFirebaseInitialized = false;

const initializeFirebase = () => {
    try {
        const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
        
        if (serviceAccountPath) {
            const serviceAccount = require(serviceAccountPath);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            isFirebaseInitialized = true;
            logger.info("Firebase Admin SDK Initialized 🛡️");
        } else {
            logger.warn("⚠️ Firebase Admin SDK not initialized: Missing FIREBASE_SERVICE_ACCOUNT_PATH");
        }
    } catch (err) {
        logger.error("Firebase Initialization Error:", err);
    }
};

const getIsFirebaseInitialized = () => isFirebaseInitialized;

module.exports = { initializeFirebase, getIsFirebaseInitialized };
