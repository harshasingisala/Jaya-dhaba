const mongoose = require("mongoose");
const Event = require("../models/Event");
require("dotenv").config({ path: "../../.env" });

const sampleEvents = [
  {
    title: "Global Tech Summit 2026",
    date: "2026-05-15T09:00:00Z",
    location: "Main Auditorium, Block A",
    banner: "https://images.unsplash.com/photo-1540575861501-7ad0582373f1?q=80&w=2070&auto=format&fit=crop",
    description: "The world's largest gathering of tech innovators and visionaries.",
    totalSeats: 280
  },
  {
    title: "Annual Design Awards",
    date: "2026-06-20T18:00:00Z",
    location: "Grand Hall, Block B",
    banner: "https://images.unsplash.com/photo-1505373877841-8d25f7d46678?q=80&w=2012&auto=format&fit=crop",
    description: "Celebrating excellence in digital and physical product design.",
    totalSeats: 150
  },
  {
    title: "Future of Web Development",
    date: "2026-07-05T10:00:00Z",
    location: "Conference Room 101",
    banner: "https://images.unsplash.com/photo-1517048676732-d65bc937f952?q=80&w=2070&auto=format&fit=crop",
    description: "A deep dive into the next generation of web technologies.",
    totalSeats: 100
  }
];

const seedDB = async () => {
  try {
    const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/feedx";
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB for seeding...");

    const count = await Event.countDocuments();
    if (count === 0) {
      await Event.insertMany(sampleEvents);
      console.log("Database seeded with sample events! 🌱");
    } else {
      console.log("Database already has events, skipping seed.");
    }
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("Seeding failed:", err);
    process.exit(1);
  }
};

seedDB();
