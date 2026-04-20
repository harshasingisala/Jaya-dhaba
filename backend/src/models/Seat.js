const mongoose = require("mongoose");

const seatSchema = new mongoose.Schema({
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    seatId: { type: String, required: true },
    status: {
        type: String,
        enum: ["available", "locked", "sold"],
        default: "available"
    },
    userId: String,
    paymentId: String,
    expiresAt: { type: Date } // Used for lock duration tracking (NO TTL — handled in queries)
});

// Compound index for unique seats per event and fast lookups
seatSchema.index({ eventId: 1, seatId: 1 }, { unique: true });

// Index for efficient lock expiry queries (NOT a TTL index)
seatSchema.index({ status: 1, expiresAt: 1 });

module.exports = mongoose.model("Seat", seatSchema);
