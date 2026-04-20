const { getRedisClient } = require("../config/redis");
const Seat = require("../models/Seat");
const logger = require("../utils/logger");

const setupSocket = (io) => {
    let onlineUsers = 0;

    io.on("connection", (socket) => {
        onlineUsers++;
        io.emit("update-online-users", onlineUsers);
        
        socket.on("requestSeats", async (eventId) => {
            try {
                const seatsData = await Seat.find({ eventId }).lean();
                let seatsObj = {};
                seatsData.forEach(s => {
                    seatsObj[s.seatId] = s;
                });
                socket.emit("initSeats", seatsObj);
            } catch (err) {
                logger.error("Socket RequestSeats Error:", err);
            }
        });

        socket.on("lockSeat", async ({ seatId, eventId }) => {
            try {
                const now = new Date();
                const redisClient = getRedisClient();
                const lockKey = `seat_lock:${eventId}:${seatId}`;
                const LOCK_DURATION_MS = 5 * 60 * 1000; // 5 mins

                if (redisClient) {
                    // ATOMIC UPGRADE: Ultra-fast Redis memory lock (NX avoids race conditions)
                    const acquire = await redisClient.set(lockKey, socket.id, "PX", LOCK_DURATION_MS, "NX");
                    
                    if (!acquire) {
                        const owner = await redisClient.get(lockKey);
                        if (owner !== socket.id) {
                            socket.emit("seatTaken", { seatId, eventId });
                            return;
                        }
                    }

                    // Background sync to Mongo for persistence
                    await Seat.updateOne(
                        { seatId, eventId },
                        { status: "locked", userId: socket.id, expiresAt: new Date(now.getTime() + LOCK_DURATION_MS) }
                    );
                    
                    io.emit("seatLocked", { seatId, eventId, expiresAt: new Date(now.getTime() + LOCK_DURATION_MS) });
                } else {
                    // ATOMIC LOCK FALLBACK (MongoDB Only)
                    const seat = await Seat.findOneAndUpdate(
                        { 
                            seatId, 
                            eventId, 
                            status: { $ne: "sold" },
                            $or: [
                                { status: "available" },
                                { status: "locked", expiresAt: { $lt: now } }
                            ]
                        },
                        {
                            status: "locked",
                            userId: socket.id,
                            expiresAt: new Date(now.getTime() + LOCK_DURATION_MS)
                        },
                        { new: true, upsert: false } 
                    );

                    if (!seat) {
                        socket.emit("seatTaken", { seatId, eventId });
                        return;
                    }

                    io.emit("seatLocked", { seatId, eventId, expiresAt: seat.expiresAt });
                }
            } catch (err) {
                logger.error("Socket LockSeat Error:", err);
            }
        });

        socket.on("unlockSeat", async ({ seatId, eventId }) => {
            try {
                const redisClient = getRedisClient();
                const lockKey = `seat_lock:${eventId}:${seatId}`;

                if (redisClient) {
                    const owner = await redisClient.get(lockKey);
                    if (owner === socket.id) {
                        await redisClient.del(lockKey);
                    }
                }

                const result = await Seat.findOneAndUpdate(
                    { seatId, eventId, status: "locked", userId: socket.id },
                    { status: "available", userId: null, expiresAt: null },
                    { new: true }
                );

                if (result) {
                    io.emit("seatUnlocked", { seatId, eventId });
                }
            } catch (err) {
                logger.error("Socket UnlockSeat Error:", err);
            }
        });

        socket.on("disconnect", async () => {
            onlineUsers = Math.max(0, onlineUsers - 1);
            io.emit("update-online-users", onlineUsers);
            
            try {
                const redisClient = getRedisClient();
                const expiredLocks = await Seat.find({ userId: socket.id, status: "locked" });

                if (expiredLocks.length > 0) {
                    // Batch release mongo
                    await Seat.updateMany(
                        { userId: socket.id, status: "locked" },
                        { status: "available", userId: null, expiresAt: null }
                    );

                    // Batch release Redis & Emit
                    expiredLocks.forEach(async (s) => {
                        if (redisClient) await redisClient.del(`seat_lock:${s.eventId}:${s.seatId}`);
                        io.emit("seatUnlocked", { seatId: s.seatId, eventId: s.eventId });
                    });
                }
            } catch (err) {
                logger.error("Socket Disconnect cleanup Error:", err);
            }
        });
    });
};

module.exports = setupSocket;
