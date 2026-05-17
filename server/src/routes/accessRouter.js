const express = require('express');
const accessController = require('../controllers/accessController.js');
const passport = require('../configs/passportConfig.js');
const { authentication, refreshAuthentication } = require('../middlewares/authMiddleware.js');

const {
    app: { frontendUrl },
} = require('../configs/index.js');
const usersController = require('../controllers/usersController.js');
const router = express.Router();

router.post('/signup', accessController.signup);
router.post('/otp/request-signup', accessController.requestSignupOTP);
router.post('/otp/verify-signup', accessController.verifySignupOTP);

router.post('/otp/request-forgot-password', accessController.requestForgotPasswordOTP);
router.post('/otp/verify-forgot-password', accessController.verifyForgotPasswordOTP);


router.post('/refresh-token', refreshAuthentication, accessController.refreshToken);
router.post('/logout', authentication, accessController.logout);

router.post('/login', (req, res, next) => {
    passport.authenticate('local', { session: false }, (err, user, info) => {
        if (err) {
            return next(err);
        }
        if (!user) {
            if (info instanceof Error) {
                return next(info);
            }
            const message = info && info.message ? info.message : 'invalid email or password';
            const status = info && info.status ? info.status : 401;
            const error = new Error(message);
            error.status = status;
            return next(error);
        }
        req.user = user;
        next();
    })(req, res, next);
}, accessController.login);

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get(
    '/google/callback',
    passport.authenticate('google', { session: false, failureRedirect: `${frontendUrl}` }),
    accessController.loginSocial,
);

router.get('/github', passport.authenticate('github', { scope: ['user:email', 'read:user'] }));
router.get(
    '/github/callback',
    passport.authenticate('github', { session: false, failureRedirect: `${frontendUrl}` }),
    accessController.loginSocial,
);

router.post('/reset-password', accessController.resetPassword)

module.exports = router;
