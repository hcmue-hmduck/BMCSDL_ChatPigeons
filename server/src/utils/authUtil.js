const bcrypt = require('bcrypt');
const crypto = require('crypto');
const JWT = require('jsonwebtoken');

const createTokenHash = async () => {
    const token = crypto.randomBytes(64).toString('hex');
    const tokenHash = await hashString(token);
    return tokenHash;
}

const hashString = async (string) => {
    return await bcrypt.hash(string, 10);
};

const compareHashString = async (stringInput, stringHash) => {
    return await bcrypt.compare(stringInput, stringHash);
};

const createHashString = (string) => {
    return crypto.createHash('sha256').update(string).digest('hex');
};

const createKey = () => {
    return crypto.randomBytes(64).toString('hex');
};

const signJWT = (payload, secret, timeToLive = '30m') => {
    return JWT.sign(payload, secret, { expiresIn: timeToLive });
};

const verifyJWT = (token, secret) => {
    return JWT.verify(token, secret);
};

const decodeJWT = (token) => {
    return JWT.decode(token);
};

const COOKIE_TOKENS_OPTIONS = {
    httpOnly: true,      // Ngăn XSS
    secure: true,        // HTTPS only (Bắt buộc khi dùng SameSite=None)
    sameSite: 'none',    // Bắt buộc dùng none vì không dùng proxy
    path: '/',
};

const setCookieTokens = (res, accessToken, refreshToken) => {
    res.cookie('at', accessToken, {
        ...COOKIE_TOKENS_OPTIONS,
        maxAge: 1000 * 60 * 30,
    });

    res.cookie('rt', refreshToken, {
        ...COOKIE_TOKENS_OPTIONS,
        maxAge: 1000 * 60 * 60 * 24 * 7,
    });
};

const clearCookieTokens = (res) => {
    res.clearCookie('at', COOKIE_TOKENS_OPTIONS);
    res.clearCookie('rt', COOKIE_TOKENS_OPTIONS);
};

module.exports = {
    hashString,
    compareHashString,
    createKey,
    signJWT,
    verifyJWT,
    createHashString,
    decodeJWT,
    setCookieTokens,
    clearCookieTokens,
    createTokenHash
};
