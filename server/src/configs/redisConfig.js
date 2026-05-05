const Redis = require("ioredis");

// Singleton
const redis = new Redis(process.env.REDIS_URL, {
    // Tự động thử lại khi mất kết nối
    retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
    maxRetriesPerRequest: null,
});


redis.on('connect', () => console.log('Redis connected successfully'));
redis.on('error', (error) => console.error('Redis connected failure:', error));

module.exports = redis;



