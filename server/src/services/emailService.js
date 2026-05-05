const resend = require('../configs/resendConfig.js');
const {
    mail: { fromName, fromAddress },
} = require('../configs/index.js');
const { BadRequestError } = require('../core/errorResponse.js');

class EmailService {
    async sendOTPToYourEmail(email, otp) {
        if (!email || !otp) throw new BadRequestError('missing parameters');

        const { data, error } = await resend.emails.send({
            from: `${fromName} <${fromAddress}>`,
            to: email,
            subject: 'Mã xác thực OTP',
            html: `
            <div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px; overflow: hidden;">
               
                <div style="padding: 30px; color: #333; line-height: 1.6;">
                    <p>Mã OTP để xác thực email của bạn là: </p>
                    <div style="text-align: center; margin: 30px 0;">
                        <span style="display: inline-block; background-color: #f4f4f4; padding: 15px 30px; font-size: 32px; font-weight: bold; color: #dd1b5c; letter-spacing: 5px; border-radius: 5px; border: 1px dashed #dd1b5c;">
                            ${otp}
                        </span>
                    </div>
                    <p style="font-size: 14px; color: #666;">
                        Mã OTP này có hiệu lực trong vòng <strong>05 phút</strong> kể từ thời điểm email này được gửi.
                    </p>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                    <p style="font-size: 13px; color: #999;">
                        <strong>Lưu ý:</strong> Không chia sẻ mã này với bất kỳ ai để đảm bảo an toàn cho tài khoản của bạn.
                    </p>
                    <p style="margin-top: 20px; font-size: 16px;">
                        Trân trọng,<br>
                        <strong>Pigeons</strong>
                    </p>
                </div>
            </div>
            `,
        });

        if (error) throw error;

        return data;
    }
}

module.exports = new EmailService();
