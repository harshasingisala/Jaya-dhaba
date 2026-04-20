const mongoose = require('mongoose');
require('dotenv').config();
const Event = require('../src/models/Event');
const Seat = require('../src/models/Seat');
const logger = require('../src/utils/logger');

async function initSeats() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected!');

        const events = await Event.find();
        if (events.length === 0) {
            console.warn('No events found in database. Create an event first.');
            process.exit(0);
        }

        console.log(`Found ${events.length} events. Initializing seats...`);

        const sections = ['A', 'B', 'C', 'D'];
        const seatsPerSection = 60;

        for (const event of events) {
            console.log(`Processing Event: ${event.title} (${event._id})`);
            
            const existingCount = await Seat.countDocuments({ eventId: event._id });
            if (existingCount >= 240) {
                console.log(`- Event already has ${existingCount} seats. Skipping.`);
                continue;
            }

            const seats = [];
            for (const section of sections) {
                for (let i = 1; i <= seatsPerSection; i++) {
                    const seatId = `${section}${i}`;
                    seats.push({
                        eventId: event._id,
                        seatId: seatId,
                        status: 'available'
                    });
                }
            }

            try {
                // Use ordered: false to ignore duplicates if some seats already exist
                await Seat.insertMany(seats, { ordered: false });
                console.log(`- Successfully initialized 240 seats for ${event.title}`);
            } catch (insertErr) {
                // If it's just duplicate key errors, we're mostly fine
                if (insertErr.code === 11000) {
                    console.log(`- Some seats already existed, partially filled for ${event.title}`);
                } else {
                    throw insertErr;
                }
            }
        }

        console.log('Initialization Complete! 🎉');
        process.exit(0);
    } catch (err) {
        console.error('Initialization Failed:', err);
        process.exit(1);
    }
}

initSeats();
