const User = require("../models/User");
const admin = require("firebase-admin");
const jwt = require("jsonwebtoken");
const { getIsFirebaseInitialized } = require("../config/firebase");
const logger = require("../utils/logger");

exports.verifyToken = async (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    
    if (!token) return res.status(401).json({ error: "Access Denied 🚫" });

    try {
        // 1. Try Development Bypass (only if Firebase is not initialized)
        if (!getIsFirebaseInitialized() && process.env.NODE_ENV !== 'production' && !token.startsWith("ey")) {
            const devUser = await User.findOne({}).sort({ submittedAt: -1 });
            if (devUser) {
                logger.info(`🛠️ [DEV BYPASS] User=${devUser.email} ID=${devUser._id}`);
                req.user = devUser;
                return next();
            }
        }

        // 2. Try Firebase ID Token
        if (token.startsWith("ey")) {
            try {
                const decodedToken = await admin.auth().verifyIdToken(token);
                let user = await User.findOne({ uid: decodedToken.uid });
                
                if (!user && decodedToken.email) {
                    // Fail-safe: try finding by email if UID link is missing
                    user = await User.findOne({ email: decodedToken.email });
                    if (user && !user.uid) {
                        user.uid = decodedToken.uid;
                        await user.save();
                    }
                }

                if (user) {
                    logger.info(`🔐 [AUTH SUCCESS] Provider=Firebase User=${user.email} ID=${user._id}`);
                    req.user = user;
                    return next();
                }
            } catch (fbErr) {
                logger.debug("Firebase token failed, falling back to legacy...");
            }
        }

        // 3. Try Mock Token Bypass
        if (token.startsWith("mock_") && process.env.NODE_ENV !== 'production') {
            const user = await User.findOne({}).sort({ submittedAt: -1 });
            if (user) {
                logger.info(`🛠️ [MOCK BYPASS] User=${user.email} ID=${user._id}`);
                req.user = user;
                return next();
            }
        }

        logger.warn(`❌ [AUTH FAIL] Token prefix: ${token.substring(0, 10)}... (No valid sync found)`);
        res.status(401).json({ error: "Unauthorized: Please log in again", code: "AUTH_FAIL" });
    } catch (err) {
        logger.error("VerifyToken Critical Error:", err);
        res.status(500).json({ error: "Internal Auth Error" });
    }
};

exports.isAdmin = (req, res, next) => {
    if (req.user && req.user.role === "admin") {
        return next();
    }
    res.status(403).json({ error: "Forbidden: Admin Access Required 🚫" });
};
