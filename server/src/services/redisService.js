const redis = require('../configs/redisConfig.js');
const { InternalServerError } = require('../core/errorResponse.js');
const { ConflictRequestError, BadRequestError } = require('../core/errorResponse.js');

class RedisService {
    async setUserSession({ userId, sid, accessTokenSecret, refreshTokenSecret, timeToLiveSecond }) {
        if (!userId || !sid || !accessTokenSecret || !refreshTokenSecret || !timeToLiveSecond)
            throw new BadRequestError('missing parameters');
        if (isNaN(timeToLiveSecond)) throw new ConflictRequestError('invalid parameters');

        const key = `auth:session:${userId}:${sid}`;
        const results = await redis
            .pipeline()
            .hset(key, {
                at_secret: accessTokenSecret,
                rt_secret: refreshTokenSecret,
                rotated_at: null,
                created_at: new Date().toISOString(),
            })
            .expire(key, timeToLiveSecond)
            .exec();

        const error = results.find((res) => res[0] !== null);
        if (error) {
            throw new InternalServerError(`redis pipeline error: ${error[0]}`);
        }

        return results;
    }

    async updateUserSession({ userId, sid, accessTokenSecret, refreshTokenSecret, timeToLiveSecond }) {
        if (!userId || !sid || !accessTokenSecret || !refreshTokenSecret || !timeToLiveSecond)
            throw new BadRequestError('missing parameters');
        if (isNaN(timeToLiveSecond)) throw new ConflictRequestError('invalid parameters');

        const key = `auth:session:${userId}:${sid}`;
        const results = await redis
            .pipeline()
            .hset(key, {
                at_secret: accessTokenSecret,
                rt_secret: refreshTokenSecret,
                rotated_at: new Date().toISOString(),
            })
            .expire(key, timeToLiveSecond)
            .exec();

        const error = results.find((res) => res[0] !== null);
        if (error) {
            throw new InternalServerError(`redis pipeline error: ${error[0]}`);
        }

        return results;
    }

    async deleteUserSession(userId, sid) {
        if (!userId || !sid) throw new BadRequestError('missing parameters');
        const key = `auth:session:${userId}:${sid}`;
        return (await redis.del(key)) > 0;
    }

    async getAccessTokenSecret(userId, sid) {
        if (!userId || !sid) throw new BadRequestError('missing parameters');
        const key = `auth:session:${userId}:${sid}`;
        return await redis.hget(key, 'at_secret');
    }

    async getSessionInfo(userId, sid) {
        if (!userId || !sid) throw new BadRequestError('missing parameters');
        const key = `auth:session:${userId}:${sid}`;
        return await redis.hgetall(key);
    }

    async setOTP(email, otp, type = 'signup') {
        if (!email || !otp) throw new BadRequestError('missing parameters');
        const key = `auth:${type}-otp:${email}`;
        return await redis.set(key, otp, 'EX', 60 * 5);
    }

    async getOTP(email, type = 'signup') {
        if (!email) throw new BadRequestError('missing parameters');
        const key = `auth:${type}-otp:${email}`;
        return await redis.get(key);
    }

    async deleteOTP(email, type = 'signup') {
        const key = `auth:${type}-otp:${email}`;
        return (await redis.del(key)) > 0;
    }
}

module.exports = new RedisService();
