const Booking = require("../models/Booking");
const Seat = require("../models/Seat");
const User = require("../models/User");
const logger = require("../utils/logger");
const crypto = require("crypto");
const mongoose = require("mongoose");
const Razorpay = require("razorpay");
const asyncHandler = require("../utils/asyncHandler");

let razorpay;
try {
    if (process.env.PAYMENT_MODE !== "mock") {
        razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID || "rzp_test_placeholder",
            key_secret: process.env.RAZORPAY_KEY_SECRET || "razorpay_secret_placeholder"
        });
    }
} catch (err) {
    logger.error("🛑 Razorpay Init Error:", err);
}

exports.createOrder = asyncHandler(async (req, res) => {
    const { seat, eventId } = req.body;
    
    // MOCK MODE BYPASS
    if (process.env.PAYMENT_MODE === "mock" || process.env.PAYMENT_MODE === "test") {
        logger.info("🧪 MOCK MODE: Generating simulated order ID");
        return res.json({ 
            id: "order_mock_" + Date.now(), 
            amount: 100, 
            currency: "INR", 
            mode: "mock" 
        });
    }

    const options = {
        amount: 1 * 100, // Amount in paise (1 Rupee)
        currency: "INR",
        receipt: `rcpt_${Date.now()}`
    };
    const order = await razorpay.orders.create(options);
    res.json(order);
});

exports.verifyPayment = async (req, res) => {
    const { seat, eventId, razorpay_order_id, razorpay_payment_id, razorpay_signature, name, branch, year, pin } = req.body;
    
    if (!seat || !eventId) {
        logger.error("❌ Missing required booking details (seat/eventId) in req.body");
        return res.status(400).json({ error: "Missing required booking details (seat/eventId)" });
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const orderIdStr = String(razorpay_order_id || "");
        const isMock = (process.env.PAYMENT_MODE === "mock" || process.env.PAYMENT_MODE === "test") && orderIdStr.startsWith("order_mock_");

        if (!isMock) {
            if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
                throw new Error("Missing Razorpay payment details for production verification");
            }
            const body = razorpay_order_id + "|" + razorpay_payment_id;
            const expectedSignature = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(body).digest("hex");

            if (expectedSignature !== razorpay_signature) {
                logger.error("❌ Signature Mismatch! razorpay_signature invalid.");
                throw new Error("Invalid payment signature");
            }
        } else {
            logger.info("🧪 [MOCK MODE] Bypassing signature verification");
        }

        // 1. Convert eventId to ObjectId for consistent querying
        const eventObjectId = new mongoose.Types.ObjectId(eventId);

        // 2. ATOMIC SEAT UPDATE
        logger.info(`🔍 Step 1: Selling SeatID=${seat}, EventID=${eventObjectId}`);
        const updatedSeat = await Seat.findOneAndUpdate(
            { seatId: seat, eventId: eventObjectId, status: { $ne: "sold" } },
            { status: "sold", paymentId: razorpay_payment_id || "mock_payment", userId: req.user._id, expiresAt: null },
            { session, new: true }
        );

        if (!updatedSeat) {
            logger.warn(`❌ Step 1 FAIL: Seat ${seat} not found or already sold for Event ${eventId}`);
            throw new Error("Seat unavailable or already sold");
        }
        
        // 3. CREATE BOOKING
        logger.info(`📝 Step 2: Creating Booking record`);
        const booking = new Booking({
            userId: req.user._id,
            eventId: eventObjectId,
            seatId: seat,
            status: "sold",
            paymentId: razorpay_payment_id || "mock_payment",
            qrData: `FX-${razorpay_payment_id || "MOCK"}-${Date.now()}`,
            passLink: `/pass/${razorpay_payment_id || "MOCK"}` // Keep for legacy, but frontend uses bookingId
        });
        logger.info(`💾 Saving booking for UserID=${req.user._id}, SeatID=${seat}`);
        await booking.save({ session });
        
        // Update passLink with actual booking ID for consistency
        booking.passLink = `/pass/${booking._id}`;
        await booking.save({ session });

        // 4. UPDATE USER PROFILE
        logger.info(`👤 Step 3: Updating User profile meta (ID: ${req.user._id})`);
        const userUpdate = {
            $set: { name: name || req.user.name },
            $push: {
                bookings: { seatId: seat, eventId: eventObjectId, status: "confirmed" },
                activity: { action: "Seat Booked", metadata: { seat, eventId: eventObjectId, paymentId: razorpay_payment_id || "mock_payment", pin } }
            }
        };
        if (branch) userUpdate.$set.branch = branch;
        if (year) userUpdate.$set.year = year;
        if (pin) userUpdate.$set.pin = pin;

        await User.updateOne({ _id: req.user._id }, userUpdate, { session });

        await session.commitTransaction();
        logger.info(`✅ [TRANSACTION SUCCESS] BookingID=${booking._id} for User=${req.user.email}`);
        res.json({ success: true, bookingId: booking._id, passLink: booking.passLink });

    } catch (err) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        logger.error(`❌ [TRANSACTION ABORTED] Reason: ${err.message}`);
        res.status(400).json({ error: err.message || "Payment verification failed" });
    } finally {
        session.endSession();
    }
};

exports.getConfig = (req, res) => {
    res.json({ 
        razorpay_key_id: process.env.RAZORPAY_KEY_ID || "",
        payment_mode: process.env.PAYMENT_MODE || "production"
    });
};

exports.getUserBookings = asyncHandler(async (req, res) => {
    const bookings = await Booking.find({ userId: req.user._id }).populate('eventId').lean();
    res.json(bookings);
});

exports.getBookingById = asyncHandler(async (req, res) => {
    const id = req.params.id;
    const userId = req.user._id;
    
    logger.info(`🔍 Fetching booking for ID: ${id}, UserID: ${userId}`);
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
        logger.warn(`❌ Invalid Booking ID format: ${id}`);
        return res.status(400).json({ error: "Invalid booking ID" });
    }
    
    // Find booking and ensure it belongs to the authenticated user
    const booking = await Booking.findOne({ _id: id })
        .populate('eventId')
        .populate('userId', 'name email branch year pin')
        .lean();
        
    if (!booking) {
        logger.warn(`❌ Pass not found for Booking ID: ${id}`);
        return res.status(404).json({ error: "Pass not found" });
    }

    // String comparison for the userId to avoid ObjectId vs String issues
    const bookingOwnerId = booking.userId._id ? booking.userId._id.toString() : booking.userId.toString();
    if (bookingOwnerId !== userId.toString()) {
        logger.warn(`🚫 Unauthorized access attempt: Booking ${id} belongs to ${bookingOwnerId}, but requested by ${userId}`);
        return res.status(403).json({ error: "Unauthorized access to this pass" });
    }

    res.json(booking);
});
