const mongoose = require("mongoose");
const User = require("../models/User");
const Booking = require("../models/Booking");
const Seat = require("../models/Seat");
const Event = require("../models/Event");
const logger = require("../utils/logger");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const asyncHandler = require("../utils/asyncHandler");

// ─── Admin Login ─────────────────────────────────────────────
exports.adminLogin = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
    }

    // Check against known admin email
    if (email !== "harshasingisala@gmail.com") {
        return res.status(403).json({ error: "Not an admin account" });
    }

    const adminHash = process.env.ADMIN_PASSWORD_HASH;
    if (!adminHash) {
        logger.error("ADMIN_PASSWORD_HASH not set in environment");
        return res.status(500).json({ error: "Server configuration error" });
    }

    const isMatch = await bcrypt.compare(password, adminHash);
    if (!isMatch) {
        return res.status(401).json({ error: "Invalid credentials" });
    }

    // Find or create admin user in DB
    let adminUser = await User.findOne({ email });
    if (!adminUser) {
        adminUser = new User({
            name: "Admin",
            email,
            role: "admin",
            activity: [{ action: "Admin Account Auto-Created" }]
        });
        await adminUser.save();
    }

    // Ensure role is admin
    if (adminUser.role !== "admin") {
        adminUser.role = "admin";
        await adminUser.save();
    }

    const token = jwt.sign(
        { id: adminUser._id, email: adminUser.email, role: "admin" },
        process.env.JWT_SECRET,
        { expiresIn: "8h" }
    );

    adminUser.activity.push({ action: "Admin Login" });
    await adminUser.save();

    logger.info(`✅ Admin login successful: ${email}`);
    res.json({ success: true, token, user: { name: adminUser.name, email, role: "admin" } });
});

// ─── Analytics ─────────────────────────────────────────────
exports.getAnalytics = asyncHandler(async (req, res) => {
    const totalUsers = await User.countDocuments();
    const totalBookings = await Booking.countDocuments();
    const totalRevenue = await Booking.aggregate([
        { $match: { status: "sold" } },
        { $group: { _id: null, total: { $sum: 1 } } } // ₹1 per seat for calculation (simplified)
    ]);

    const occupancy = await Seat.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);

    const recentBookings = await Booking.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('eventId', 'title')
        .populate('userId', 'name email');

    res.json({
        success: true,
        analytics: {
            totalUsers,
            totalBookings,
            totalRevenue: totalRevenue[0]?.total || 0,
            occupancy: Object.fromEntries(occupancy.map(o => [o._id, o.count])),
            recentBookings
        }
    });
});

// ─── Users ─────────────────────────────────────────────
exports.getAllUsers = asyncHandler(async (req, res) => {
    const users = await User.find().sort({ submittedAt: -1 }).select("-password");
    res.json(users);
});

// ─── Events ─────────────────────────────────────────────
exports.manageEvents = asyncHandler(async (req, res) => {
    const events = await Event.find().sort({ date: 1 });
    res.json(events);
});

// ─── Create Event (with atomic seat generation) ─────────
exports.createEvent = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { title, description, date, venue, location, banner, price, category } = req.body;

        if (!title || !date) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ error: "Title and date are required" });
        }

        // 1. Create Event
        const event = new Event({
            title,
            description,
            date,
            venue: venue || location || "Vignan Vedika",
            location: location || venue || "Vignan Vedika",
            banner,
            price: Number(price) || 1,
            category: category || "general"
        });
        await event.save({ session });

        // 2. Initialize 240 Seats (A1-D60)
        const sections = ['A', 'B', 'C', 'D'];
        const seats = [];
        for (const section of sections) {
            for (let i = 1; i <= 60; i++) {
                seats.push({
                    eventId: event._id,
                    seatId: `${section}${i}`,
                    status: 'available'
                });
            }
        }
        await Seat.insertMany(seats, { session });

        await session.commitTransaction();
        logger.info(`✅ Successfully created event "${title}" with 240 seats`);
        res.status(201).json({ success: true, event });
    } catch (err) {
        await session.abortTransaction();
        logger.error("Create Event Error:", err);
        res.status(500).json({ error: "Failed to create event" });
    } finally {
        session.endSession();
    }
};

// ─── Approve User ─────────────────────────────────────────────
exports.approveUser = asyncHandler(async (req, res) => {
    const { pin } = req.body;
    if (!pin) return res.status(400).json({ error: "PIN is required" });

    const user = await User.findOneAndUpdate(
        { pin: pin.toUpperCase() },
        { 
            $set: { status: "approved" },
            $push: { activity: { action: "Account Approved by Admin", timestamp: new Date() } }
        },
        { new: true }
    );

    if (!user) return res.status(404).json({ error: "User not found" });

    logger.info(`✅ User approved: ${pin}`);
    res.json({ success: true, user });
});

// ─── Verify Pass (Scanning) ───────────────────────────────────
exports.verifyPass = asyncHandler(async (req, res) => {
    const { uniqueId } = req.body;
    if (!uniqueId) return res.status(400).json({ error: "Unique ID/PIN is required" });

    // Logic: uniqueId could be a booking ID or a PIN
    const booking = await Booking.findOne({ 
        $or: [{ _id: mongoose.Types.ObjectId.isValid(uniqueId) ? uniqueId : null }, { qrData: uniqueId }] 
    }).populate('userId');

    if (booking) {
        if (booking.status === "used") {
            return res.json({ status: "used", name: booking.userId?.name || "Guest" });
        }
        booking.status = "used";
        await booking.save();
        return res.json({ status: "approved", name: booking.userId?.name || "Guest", pin: booking.userId?.pin });
    }

    // Fallback to User PIN lookup if no booking found (legacy/manual)
    const user = await User.findOne({ pin: uniqueId.toUpperCase() });
    if (user) {
        if (user.status !== "approved") {
            return res.json({ status: "pending", name: user.name });
        }
        if (user.used) {
            return res.json({ status: "used", name: user.name });
        }
        user.used = true;
        await user.save();
        return res.json({ status: "approved", name: user.name, pin: user.pin });
    }

    res.status(404).json({ status: "invalid" });
});

