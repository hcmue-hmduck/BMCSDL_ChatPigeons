const { Resend } = require('resend');
const { mail: { resendApiKey } = {} } = require('../configs/index.js') || {};

let resend = null;
if (resendApiKey) {
    try {
        resend = new Resend(resendApiKey);
    } catch (error) {
        console.error('Failed to initialize Resend:', error.message);
    }
} else {
    console.warn('WARNING: RESEND_API_KEY is missing in .env. Email services will be disabled.');
}

module.exports = resend;