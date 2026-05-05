const accessService = require('../services/accessService.js');
const SuccessResponse = require('../core/successResponse.js');
const { setCookieTokens, clearCookieTokens } = require('../utils/authUtil.js');
const {
    app: { frontendUrl },
} = require('../configs/index.js');

class AccessController {
    // [POST] /access/signup
    async signup(req, res, next) {
        const results = await accessService.signup(req.body);
        const { accessToken, refreshToken } = results.tokens;
        setCookieTokens(res, accessToken, refreshToken);
        return new SuccessResponse({
            message: 'signup successfully',
            metadata: results.user,
        }).send(res);
    }

    // [POST] /access/login
    async login(req, res, next) {
        const results = await accessService.login(req.user);
        const { accessToken, refreshToken } = results.tokens;
        setCookieTokens(res, accessToken, refreshToken);
        return new SuccessResponse({
            message: 'login successfully',
            metadata: results.user,
        }).send(res);
    }

    // [POST] /access/[social]
    async loginSocial(req, res, next) {
        const results = await accessService.login(req.user);
        const { accessToken, refreshToken } = results.tokens;
        setCookieTokens(res, accessToken, refreshToken);
        return res.redirect(`${frontendUrl}/conversations`);
    }

    // [POST] /access/logout
    async logout(req, res, next) {
        const { id, sid } = req.user;
        const result = await accessService.logout({ userId: id, sid });
        clearCookieTokens(res);
        return new SuccessResponse({
            message: 'logout successfully',
            metadata: result,
        }).send(res);
    }

    // [POST] /access/refresh-token
    async refreshToken(req, res, next) {
        const { id, sid, role, rt_secret, rt_cookie } = req.user;
        const results = await accessService.refreshToken({ userId: id, sid, userRole: role, rt_secret, rt_cookie });
        const { accessToken, refreshToken } = results.tokens;
        setCookieTokens(res, accessToken, refreshToken);
        return new SuccessResponse({
            message: 'refresh token successfully',
            metadata: results,
        }).send(res);
    }

    // [POST] /access/otp/request-signup
    async requestSignupOTP(req, res, next) {
        const { email } = req.body;

        return new SuccessResponse({
            message: 'send otp successfully',
            metadata: await accessService.requestSignupOTP({ email }),
        }).send(res);
    }

    // [POST] /access/otp/verify-signup
    async verifySignupOTP(req, res, next) {
        const { email, otp } = req.body;

        return new SuccessResponse({
            message: 'verify otp successfully',
            metadata: await accessService.verifySignupOTP({ email, otp }),
        }).send(res);
    }

    // [POST] /access/otp/request-forgot-password
    async requestForgotPasswordOTP(req, res, next) {
        const { email } = req.body;

        return new SuccessResponse({
            message: 'send otp successfully',
            metadata: await accessService.requestForgotPasswordOTP({ email }),
        }).send(res);
    }

    // [POST] /access/otp/verify-forgot-password
    async verifyForgotPasswordOTP(req, res, next) {
        const { email, otp } = req.body;

        return new SuccessResponse({
            message: 'verify otp successfully',
            metadata: await accessService.verifyForgotPasswordOTP({ email, otp }),
        }).send(res);
    }

    // [POST] /access/reset-password
    async resetPassword(req, res, next) {
        const {password, email} = req.body;
        return new SuccessResponse({
            message: 'reset password successfully',
            metadata: await accessService.resetPassword(password, email)
        }).send(res);
    }
}

module.exports = new AccessController();
