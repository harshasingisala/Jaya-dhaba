const User = require("../models/User");
const admin = require("firebase-admin");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const logger = require("../utils/logger");
const asyncHandler = require("../utils/asyncHandler");
const { getIsFirebaseInitialized } = require("../config/firebase");

exports.register = asyncHandler(async (req, res) => {
    const { name, email, password, uid: rawUid, firebaseUid } = req.body;
    const uid = rawUid || firebaseUid; // Accept either field name
    
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ error: "Email already exists" });

    const hashedPassword = password ? await bcrypt.hash(password, 10) : undefined;
    
    user = new User({ 
        name, 
        email, 
        password: hashedPassword, 
        uid,
        role: "user",
        activity: [{ action: "Account Created" }]
    });
    
    await user.save();
    res.json({ success: true, user: { name: user.name, email: user.email } });
});

exports.login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !user.password) return res.status(401).json({ error: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

    // Update activity
    user.activity.push({ action: "Login (Standard)" });
    await user.save();

    const token = jwt.sign({ id: user._id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: "4h" });
    res.json({ success: true, token, user: { name: user.name, email: user.email, role: user.role } });
});

exports.firebaseAuth = asyncHandler(async (req, res) => {
    const { idToken } = req.body;
    logger.info(`🔐 Auth Sync Attempt: ${idToken ? 'Token Present' : 'MISSING'}`);
    
    let uid, email, name;

    // AUTH METHOD SELECTION LOGIC
    if (idToken && getIsFirebaseInitialized()) {
        try {
            logger.info("🛡️ Verifying Firebase Token...");
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            uid = decodedToken.uid;
            email = decodedToken.email;
            name = decodedToken.name;
            logger.info(`✅ Firebase verification successful for: ${email}`);
        } catch (fbErr) {
            logger.error(`❌ Firebase Token Verification Failed: ${fbErr.message}`);
            
            // If verification fails but we're in dev, fallback to bypass instead of 401
            if (process.env.NODE_ENV !== 'production') {
                logger.warn("⚠️ Firebase Verification failed in DEV mode. Falling back to Mock Sync.");
                email = req.body.email || "dev@example.com";
                uid = req.body.uid || `mock_${Buffer.from(email).toString('base64').substring(0, 10)}`;
                name = req.body.name || "Dev User (Fallback)";
            } else {
                return res.status(401).json({ 
                    error: "Invalid Firebase token", 
                    reason: "firebase_verification_failed",
                    details: fbErr.message 
                });
            }
        }
    } else if (process.env.NODE_ENV !== 'production' || !getIsFirebaseInitialized()) {
        // Enhanced Dev Bypass
        logger.warn("🛠️ Using Dev/Mock Auth Sync");
        email = req.body.email || (req.user ? req.user.email : "dev@example.com");
        uid = req.body.uid || (req.user ? req.user.uid : `mock_${Buffer.from(email).toString('base64').substring(0, 10)}`);
        name = req.body.name || (req.user ? req.user.name : "Dev User");
        logger.info(`ℹ️ Dev Sync: ${email} (UID: ${uid})`);
    } else {
        logger.error("❌ Auth Error: No token provided and not in dev mode. Current ENV: " + process.env.NODE_ENV);
        return res.status(401).json({ 
            error: "Authentication token missing", 
            message: "Verify that the frontend successfully retrieved a Firebase idToken. Check Firebase Admin initialization on backend." 
        });
    }

    let user = await User.findOne({ 
        $or: [{ uid }, { email }, { firebaseUid: uid }] 
    });

    if (!user) {
        user = new User({ 
            uid, 
            email, 
            name: name || email.split('@')[0],
            role: "user",
            activity: [{ action: "Account Sync Created" }]
        });
    } else {
        // Update missing fields
        if (!user.uid) user.uid = uid;
        if (name && !user.name) user.name = name;
        user.activity.push({ action: "Auth Sync Login" });
    }

    await user.save();

    const token = jwt.sign({ id: user._id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: "4h" });
    logger.info(`✅ Sync Successful for ${user.email}`);
    res.json({ success: true, token, user: { name: user.name, email: user.email, role: user.role } });
});
