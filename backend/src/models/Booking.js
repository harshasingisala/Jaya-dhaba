const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
    seatId: String,
    status: { type: String, enum: ["pending", "sold", "cancelled"], default: "pending" },
    paymentId: String,
    qrData: String,
    passLink: String,
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Booking", bookingSchema);
