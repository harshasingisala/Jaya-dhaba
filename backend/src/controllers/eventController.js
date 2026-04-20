const Event = require("../models/Event");
const logger = require("../utils/logger");
const asyncHandler = require("../utils/asyncHandler");

exports.getAllEvents = asyncHandler(async (req, res) => {
    const events = await Event.find().sort({ date: 1 }).lean();
    logger.info(`Fetched ${events.length} events from database`);
    res.json(events);
});

exports.getEventById = asyncHandler(async (req, res) => {
    const event = await Event.findById(req.params.id).lean();
    if (!event) return res.status(404).json({ error: "Event not found" });
    res.json(event);
});
