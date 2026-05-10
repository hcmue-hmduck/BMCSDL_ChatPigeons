const userService = require('./usersService.js');
const redisService = require('./redisService.js');
const emailService = require('./emailService.js');
const { BadRequestError, ConflictRequestError, NotFoundError } = require('../core/errorResponse.js');
const { hashString, createKey, signJWT } = require('../utils/authUtil.js');
const crypto = require('crypto');

class AccessService {
    async signup({ full_name, email, password }) {
        if (!full_name || !email || !password) throw new BadRequestError('missing parameters');

        const foundUser = await userService.getUserByEmail(email);
        if (foundUser) throw new ConflictRequestError('Email has already');

        const password_hash = await hashString(password);
        const newUser = await userService.createUser({ full_name, email, password_hash, is_email_verified: true });
        if (!newUser) return null;

        const { id, role, avatar_url } = newUser;
        const tokens = await this.#createSession(id, role);

        return {
            user: { id, role, full_name, avatar_url, email, hasPassword: true },
            tokens,
        };
    }

    async login(user) {
        if (!user) throw new BadRequestError('missing parameters');

        const { id, role, full_name, avatar_url, email, bio, phone_number, birthday, gender, is_email_verified, is_phone_verified, last_online_at, created_at, updated_at } = user;
        const tokens = await this.#createSession(id, role);

        return {
            user: { id, role, full_name, avatar_url, email, bio, phone_number, birthday, gender, is_email_verified, is_phone_verified, last_online_at, created_at, updated_at },
            tokens,
        };
    }

    async logout({ userId, sid }) {
        if (!userId || !sid) throw new BadRequestError('missing parameters');
        await redisService.deleteUserSession(userId, sid);
    }

    async refreshToken({ userId, userRole, sid, rt_secret, rt_cookie }) {
        if (!userId || !userRole || !sid || !rt_secret || !rt_cookie) throw new BadRequestError('missing parameters');
        const foundUser = await userService.getUserById(userId);

        // DO NOT rotate refresh token! Just issue new access token.
        const timeToLiveSecond = 60 * 60 * 24 * 7;
        const secretKey1 = createKey();
        const accessToken = signJWT({ uid: userId, role: userRole, sid }, secretKey1, '30m');

        await redisService.updateUserSession({
            userId,
            sid,
            accessTokenSecret: secretKey1,
            refreshTokenSecret: rt_secret, // Keep the old one!
            timeToLiveSecond,
        });

        const tokens = { accessToken, refreshToken: rt_cookie };

        return {
            user: {
                id: userId,
                role: userRole,
                full_name: foundUser.full_name,
                avatar_url: foundUser.avatar_url,
                email: foundUser.email,
                bio: foundUser.bio,
                phone_number: foundUser.phone_number,
                birthday: foundUser.birthday,
                gender: foundUser.gender,
                is_email_verified: foundUser.is_email_verified,
                is_phone_verified: foundUser.is_phone_verified,
                last_online_at: foundUser.last_online_at,
                created_at: foundUser.created_at,
                updated_at: foundUser.updated_at
            },
            tokens,
        };
    }

    async requestSignupOTP({ email }) {
        if (!email) throw new BadRequestError('missing parameters');

        const foundUser = await userService.getUserByEmail(email);
        if (foundUser) throw new ConflictRequestError('email has already');

        const otp = String(crypto.randomInt(100000, 1000000));
        const data = await emailService.sendOTPToYourEmail(email, otp);
        await redisService.setOTP(email, otp, 'signup');

        return data;
    }

    async verifySignupOTP({ email, otp }) {
        if (!email || !otp) throw new BadRequestError('missing parameters');

        const code = await redisService.getOTP(email, 'signup');
        if (!code) throw new NotFoundError('not found otp');

        const isMatch = code === String(otp);
        if (!isMatch) throw new BadRequestError('otp mismatch');

        await redisService.deleteOTP(email, 'signup');

        return isMatch;
    }

    async requestForgotPasswordOTP({ email }) {
        if (!email) throw new BadRequestError('missing parameters');

        const foundUser = await userService.getUserByEmail(email);
        if (!foundUser) throw new BadRequestError('user not found');

        const otp = String(crypto.randomInt(100000, 1000000));
        const data = await emailService.sendOTPToYourEmail(email, otp);
        await redisService.setOTP(email, otp, 'forgot-password');

        return data;
    }

    async verifyForgotPasswordOTP({ email, otp }) {
        if (!email || !otp) throw new BadRequestError('missing parameters');

        const code = await redisService.getOTP(email, 'forgot-password');
        if (!code) throw new NotFoundError('not found otp');

        const isMatch = code === String(otp);
        if (!isMatch) throw new BadRequestError('otp mismatch');

        await redisService.deleteOTP(email, 'forgot-password');

        return isMatch;
    }

    async resetPassword(password, email) {
        if (!password || !email) throw BadRequestError('missing parameters');
        const foundUser = await userService.getUserByEmail(email);
        if (!foundUser) throw BadRequestError('user not found');

        const password_hash = await hashString(password);
        foundUser.password_hash = password_hash;
        return await foundUser.save();
    }

    async #createSession(userId, userRole) {
        const sid = crypto.randomUUID();
        const { accessPair, refreshPair } = this.#createPairTokens({
            uid: userId,
            role: userRole,
            sid,
        });

        const timeToLiveSecond = 60 * 60 * 24 * 7;
        await redisService.setUserSession({
            userId,
            sid,
            accessTokenSecret: accessPair.secretKey,
            refreshTokenSecret: refreshPair.secretKey,
            timeToLiveSecond,
        });

        return { accessToken: accessPair.token, refreshToken: refreshPair.token };
    }

    async #updateSession(userId, userRole, sid) {
        const { accessPair, refreshPair } = this.#createPairTokens({
            uid: userId,
            role: userRole,
            sid,
        });

        const timeToLiveSecond = 60 * 60 * 24 * 7;
        await redisService.updateUserSession({
            userId,
            sid,
            accessTokenSecret: accessPair.secretKey,
            refreshTokenSecret: refreshPair.secretKey,
            timeToLiveSecond,
        });

        return { accessToken: accessPair.token, refreshToken: refreshPair.token };
    }

    #createPairTokens(payload) {
        const secretKey1 = createKey();
        const secretKey2 = createKey();
        const accessToken = signJWT(payload, secretKey1, '30m');
        const refreshToken = signJWT(payload, secretKey2, '7d');

        return {
            accessPair: {
                token: accessToken,
                secretKey: secretKey1,
            },
            refreshPair: {
                token: refreshToken,
                secretKey: secretKey2,
            },
        };
    }
}

module.exports = new AccessService();
