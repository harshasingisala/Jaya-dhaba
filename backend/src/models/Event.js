const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
    title: { type: String, required: true },
    date: { type: String, required: true },
    location: String,
    venue: { type: String, default: "Vignan Vedika" },
    banner: String,
    description: String,
    price: { type: Number, default: 1 },
    category: { type: String, default: "general" },
    totalSeats: { type: Number, default: 240 },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Event", eventSchema);
