const Redis = require("ioredis");
const logger = require("../utils/logger");

let redisClient;

const connectRedis = () => {
    try {
        const REDIS_URL = process.env.REDIS_URL;
        if (REDIS_URL) {
            redisClient = new Redis(REDIS_URL);
            redisClient.on("connect", () => logger.info("Redis Connected 🚀"));
            redisClient.on("error", (err) => logger.error("Redis Error:", err));
        } else {
            logger.warn("⚠️ REDIS_URL not provided. Seat locks will not be Redis-backed.");
        }
    } catch (err) {
        logger.error("Redis Connection Error:", err);
    }
};

const getRedisClient = () => redisClient;

module.exports = { connectRedis, getRedisClient };
