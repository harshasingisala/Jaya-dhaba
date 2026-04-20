const mongoose = require("mongoose");
const logger = require("../utils/logger");

const connectDB = async () => {
    try {
        const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/feedx";
        await mongoose.connect(MONGO_URI);
        logger.info("MongoDB Connected 🔥");
    } catch (err) {
        logger.error("Mongo Error:", err);
        process.exit(1);
    }
};

module.exports = connectDB;
