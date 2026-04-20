const mongoose = require("mongoose");
require("dotenv").config();
const Event = require("./src/models/Event");

const checkDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const count = await Event.countDocuments();
        const events = await Event.find();
        console.log(`Database check: Founded ${count} events.`);
        console.log("Events:", events);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};
checkDB();
