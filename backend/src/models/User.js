const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    uid: { type: String, unique: true, sparse: true, index: true }, // Firebase UID
    email: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    role: { 
        type: String, 
        enum: ["user", "admin"], 
        default: "user" 
    },
    bookings: [
        {
            seatId: String,
            eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
            status: { type: String, enum: ["pending", "confirmed", "cancelled"], default: "pending" },
            bookedAt: { type: Date, default: Date.now }
        }
    ],
    activity: [
        {
            action: String,
            metadata: Object,
            timestamp: { type: Date, default: Date.now }
        }
    ],
    preferences: {
        notifications: { type: Boolean, default: true },
        theme: { type: String, default: "dark" }
    },
    // Legacy support fields
    password: { type: String },
    firebaseUid: { type: String }, // Old field for migration cleanup
    branch: String,
    year: String,
    gender: String,
    pin: String,
    submittedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("User", userSchema);
