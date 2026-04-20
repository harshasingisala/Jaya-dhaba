const mongoose = require("mongoose");
require("dotenv").config();
const Event = require("./src/models/Event");

const seedEvents = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB for seeding...");

        // Clear existing events to avoid duplicates during testing
        await Event.deleteMany({});

        const events = [
            {
                title: "Electronic Circuit Deep Dive 2026",
                date: new Date(Date.now() + 86400000 * 2).toISOString(), // 2 days from now
                location: "Main Auditorium, Block C",
                banner: "https://images.unsplash.com/photo-1517077304055-6e89abbf09b0?auto=format&fit=crop&q=80&w=1200",
                description: "An intensive session on modern semiconductor physics and integrated circuit design. Perfect for final year students and enthusiasts.",
                totalSeats: 280
            },
            {
                title: "AI & Embedded Systems Workshop",
                date: new Date(Date.now() + 86400000 * 5).toISOString(), // 5 days from now
                location: "Seminar Hall B, Innovation Tower",
                banner: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=1200",
                description: "Exploring the intersection of TinyML and low-power hardware. Limited seats available for hands-on demonstrations.",
                totalSeats: 150
            }
        ];

        await Event.insertMany(events);
        console.log("Database Seeded Successfully! 🌱");
        process.exit(0);
    } catch (err) {
        console.error("Seeding Error:", err);
        process.exit(1);
    }
};

seedEvents();
