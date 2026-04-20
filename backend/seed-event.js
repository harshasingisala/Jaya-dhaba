const mongoose = require("mongoose");
require("dotenv").config();
const Event = require("./models/Event");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/feedx";

async function seed() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to MongoDB for seeding...");

        // Check if event exists
        const existingEvent = await Event.findOne({ title: "C Programming Unplugged 2.0" });
        if (!existingEvent) {
            const newEvent = new Event({
                title: "C Programming Unplugged 2.0",
                date: "Tomorrow, 19:30",
                location: "Government Institute of Electronics",
                banner: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80",
                description: "Join us for an electrifying session on C programming concepts, algorithms, and more!",
                totalSeats: 280
            });
            await newEvent.save();
            console.log("Event seeded successfully:", newEvent._id);
        } else {
            console.log("Event already exists:", existingEvent._id);
        }
        
        mongoose.disconnect();
    } catch (err) {
        console.error("Error seeding event:", err);
        mongoose.disconnect();
    }
}

seed();
