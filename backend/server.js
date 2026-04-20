const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const path = require("path");
require("dotenv").config();

const logger = require("./src/utils/logger");
const connectDB = require("./src/config/db");
const { initializeFirebase } = require("./src/config/firebase");
const { connectRedis } = require("./src/config/redis");

// Controllers
const authController = require("./src/controllers/authController");
const eventController = require("./src/controllers/eventController");
const bookingController = require("./src/controllers/bookingController");
const adminController = require("./src/controllers/adminController");
const setupSocket = require("./src/controllers/socketController");
const { verifyToken, isAdmin } = require("./src/middlewares/authMiddleware");
const Seat = require("./src/models/Seat");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// ─── Global Middleware ────────────────────────────────────────
app.use(cors());

// Helmet (relaxed for inline scripts used by frontend)
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Morgan HTTP logging (skip health checks to reduce noise)
app.use(morgan("short", {
    skip: (req) => req.url === "/health",
    stream: { write: (msg) => logger.info(msg.trim()) }
}));

// ─── Rate Limiters ────────────────────────────────────────────
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30,
    message: { error: "Too many auth attempts, please try again later" },
    standardHeaders: true,
    legacyHeaders: false
});

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: "Too many requests, please try again later" },
    standardHeaders: true,
    legacyHeaders: false
});

// ─── PUBLIC ROUTES ────────────────────────────────────────────
app.post("/api/auth/firebase", authLimiter, authController.firebaseAuth);
app.post("/api/auth/login", authLimiter, authController.login);
app.post("/api/auth/register", authLimiter, authController.register);
app.get("/api/events", eventController.getAllEvents);
app.get("/api/events/:id", eventController.getEventById);
app.get("/api/test", (req, res) => res.json({ message: "API is working", time: new Date() }));
app.get("/api/booking/config", bookingController.getConfig);

// Seats REST endpoint (public — needed for seat map rendering)
app.get("/api/seats", async (req, res) => {
    try {
        const { eventId } = req.query;
        if (!eventId) {
            return res.status(400).json({ error: "eventId query parameter is required" });
        }

        const now = new Date();
        // Auto-release expired locks before returning seat data
        await Seat.updateMany(
            { eventId, status: "locked", expiresAt: { $lt: now } },
            { status: "available", userId: null, expiresAt: null }
        );

        const seats = await Seat.find({ eventId }).lean();
        res.json(seats);
    } catch (err) {
        logger.error("Get Seats Error:", err);
        res.status(500).json({ error: "Failed to fetch seats" });
    }
});

// Admin login (public — no token required)
app.post("/api/admin/login", authLimiter, adminController.adminLogin);

// Contact endpoint (simple — logs and returns success)
app.post("/api/contact", apiLimiter, (req, res) => {
    const { name, email, message } = req.body;
    if (!name || !email || !message) {
        return res.status(400).json({ error: "Name, email, and message are required" });
    }
    logger.info(`📩 Contact Form: ${name} (${email}): ${message}`);
    res.json({ success: true, message: "Message received. We'll get back to you soon!" });
});

// ─── PROTECTED ROUTES ─────────────────────────────────────────
app.post("/api/booking/create-order", verifyToken, bookingController.createOrder);
app.post("/api/booking/verify-payment", verifyToken, bookingController.verifyPayment);
app.get("/api/booking/user/bookings", verifyToken, bookingController.getUserBookings);
app.get("/api/booking/user/pass/:id", verifyToken, bookingController.getBookingById);

// ─── ADMIN ROUTES ─────────────────────────────────────────────
app.get("/api/admin/analytics", [verifyToken, isAdmin], adminController.getAnalytics);
app.get("/api/admin/users", [verifyToken, isAdmin], adminController.getAllUsers);
app.get("/api/admin/events", [verifyToken, isAdmin], adminController.manageEvents);
app.post("/api/admin/events", [verifyToken, isAdmin], adminController.createEvent);
app.post("/api/admin/approve-user", [verifyToken, isAdmin], adminController.approveUser);
app.post("/api/admin/verify-pass", [verifyToken, isAdmin], adminController.verifyPass);


// Health Check
app.get("/health", (req, res) => res.status(200).send("OK"));

// ─── Static Frontend ──────────────────────────────────────────
// Development: Frontend runs on port 5173 via Vite
// Production: Serve from frontend-v2/dist
app.use(express.static(path.join(__dirname, "../frontend-v2/dist")));

// Catch-all: serve index.html for client-side routing
app.all(/.*/, (req, res, next) => {
    if (req.originalUrl && req.originalUrl.startsWith("/api")) {
        return res.status(404).json({ error: "Route not found" });
    }
    res.sendFile(path.join(__dirname, "../frontend-v2/dist/index.html"), (err) => {
        if (err) {
            res.status(404).json({ error: "Frontend build not found. Please run 'npm run build' in frontend-v2 if you are in production mode." });
        }
    });
});

// ─── Global Error Handler ─────────────────────────────────────
app.use((err, req, res, next) => {
    logger.error("Unhandled Error:", {
        message: err.message,
        stack: err.stack,
        url: req.originalUrl,
        method: req.method
    });
    res.status(err.status || 500).json({
        error: err.message || "Internal server error"
    });
});

// ─── Initialize Connections ───────────────────────────────────
connectDB();
initializeFirebase();
connectRedis();

// ─── Background Jobs ──────────────────────────────────────────
// Periodically clear expired seat locks (every 5 minutes)
setInterval(async () => {
    try {
        const now = new Date();
        const result = await Seat.updateMany(
            { status: "locked", expiresAt: { $lt: now } },
            { status: "available", userId: null, expiresAt: null }
        );
        if (result.modifiedCount > 0) {
            logger.info(`🧹 Background Cleanup: Released ${result.modifiedCount} expired seat locks`);
            io.emit("seatUnlocked", { clearedAllExpired: true }); // Notify clients to refresh
        }
    } catch (err) {
        logger.error("Periodic Lock Cleanup Error:", err);
    }
}, 5 * 60 * 1000);

// ─── Wire up Socket.IO ───────────────────────────────────────
setupSocket(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
    logger.info(`Server running on http://0.0.0.0:${PORT} 🚀`);
});

server.on('error', (err) => {
    logger.error('Server Binding Error:', err);
});
