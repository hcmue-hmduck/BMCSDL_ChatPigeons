const { decodeJWT, verifyJWT, clearCookieTokens } = require('../utils/authUtil.js');
const { UnauthorizedError, TooManyRequestError } = require('../core/errorResponse.js');
const redisService = require('../services/redisService.js');

const authentication = async (req, res, next) => {
    const accessToken = req.cookies.at;
    if (!accessToken) throw new UnauthorizedError('missing access token');

    try {
        const decoded = decodeJWT(accessToken);
        const uid = decoded?.uid;
        const sid = decoded?.sid;
        const role = decoded?.role;
        if (!uid || !sid || !role) throw new UnauthorizedError('invalid access token payload');

        const secretKey = await redisService.getAccessTokenSecret(uid, sid);
        if (!secretKey) throw new UnauthorizedError('session expired');

        // nếu chạy qua được thì thành công
        verifyJWT(accessToken, secretKey);

        req.user = { id: uid, role, sid };

        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') throw new UnauthorizedError('access token expired');
        if (error.name === 'JsonWebTokenError') throw new UnauthorizedError('invalid access token');

        throw error;
    }
};

const refreshAuthentication = async (req, res, next) => {
    const refreshToken = req.cookies.rt;
    if (!refreshToken) {
        clearCookieTokens(res);
        throw new UnauthorizedError('missing refresh token');
    }

    let uid;
    let sid;
    try {
        const decoded = decodeJWT(refreshToken);
        uid = decoded?.uid;
        sid = decoded?.sid;
        const role = decoded?.role;
        if (!uid || !sid || !role) throw new UnauthorizedError('invalid refresh token payload');

        const sessionInfo = await redisService.getSessionInfo(uid, sid);
        // rotate rt nhưng giữ nguyên sid, nếu kh tìm được session thì session hết hạn hoặc được logout
        if (!sessionInfo || !sessionInfo.rt_secret) throw new UnauthorizedError('session expired');

        const { rt_secret, rotated_at } = sessionInfo;

        verifyJWT(refreshToken, rt_secret);

        req.user = { id: uid, role, sid, rt_secret, rt_cookie: refreshToken };
        next();
    } catch (error) {
        // lỗi bình thường: token hết hạn || race condition
        if (error.name === 'TokenExpiredError') {
            clearCookieTokens(res);
            throw new UnauthorizedError('refresh token expired');
        }
        if (error instanceof UnauthorizedError) {
            clearCookieTokens(res);
            throw error;
        }
        if (error instanceof TooManyRequestError) {
            throw error;
        }

        //Đăng nhập bất thường: tìm được session nhưng verify không được => đã bị đổi rt => kill session
        if (uid && sid) {
            await redisService.deleteUserSession(uid, sid);
        }
        clearCookieTokens(res);

        throw error;
    }
};

module.exports = {
    authentication,
    refreshAuthentication,
};
