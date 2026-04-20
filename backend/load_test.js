const { io } = require("socket.io-client");

const SERVER_URL = "http://localhost:5000";
const EVENT_ID = "660c1b5eeb2b3c2e5c8b4567"; // Use a real or seeded ID
const SEAT_ID = "A1";

async function simulateConcurrentLocks(count) {
    console.log(`🚀 Simulating ${count} concurrent lock attempts for seat ${SEAT_ID}...`);
    
    const results = {
        success: 0,
        taken: 0,
        error: 0
    };

    const promises = Array.from({ length: count }).map((_, i) => {
        return new Promise((resolve) => {
            const socket = io(SERVER_URL);
            
            socket.on("connect", () => {
                socket.emit("lockSeat", { seatId: SEAT_ID, eventId: EVENT_ID });
            });

            socket.on("seatLocked", (data) => {
                if (data.seatId === SEAT_ID) {
                    results.success++;
                    socket.disconnect();
                    resolve();
                }
            });

            socket.on("seatTaken", (data) => {
                if (data.seatId === SEAT_ID) {
                    results.taken++;
                    socket.disconnect();
                    resolve();
                }
            });

            socket.on("connect_error", () => {
                results.error++;
                resolve();
            });

            // Timeout after 5s
            setTimeout(() => {
                socket.disconnect();
                resolve();
            }, 5000);
        });
    });

    await Promise.all(promises);
    
    console.log("-------------------------------");
    console.log("📊 LOAD TEST RESULTS:");
    console.log(`✅ Success (Locked): ${results.success}`);
    console.log(`❌ Taken (Rejected): ${results.taken}`);
    console.log(`⚠️ Errors/Timeouts: ${results.error}`);
    console.log("-------------------------------");
    
    if (results.success === 1) {
        console.log("🔥 ATOMICITY VERIFIED: Only 1 user successfully locked the seat.");
    } else if (results.success > 1) {
        console.error("💀 CRITICAL FAILURE: Multiple users locked the same seat! Atomic operations failed.");
    } else {
        console.warn("❔ No users locked the seat. (Check if the server is running and the event exists)");
    }
}

// Ensure server is running before executing
simulateConcurrentLocks(50);
