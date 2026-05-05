const { AccessToken } = require('livekit-server-sdk');
const SuccessResponse = require('../core/successResponse.js');
const apiKey = process.env.LIVEKIT_API_KEY;
const apiSecret = process.env.LIVEKIT_API_SECRET;

class LivekitController {
    // [GET] /livekit/access-token
    getAccessToken = async (req, res, next) => {
        const { conversationId, userId, userName, userAvatarUrl } = req.query;
        if (!conversationId || !userId || !userName || !userAvatarUrl) throw new Error('Bad request');
        const token = await this.#createAcessToken(conversationId, userId, userName, userAvatarUrl);
        return new SuccessResponse({
            message: 'Get access token success',
            metadata: { token },
        }).send(res);
    };

    #createAcessToken = async (roomId, participantId, participantName, participantAvatarUrl) => {
        const at = new AccessToken(apiKey, apiSecret, {
            identity: participantId,
            metadata: JSON.stringify({
                participantName,
                participantAvatarUrl,
            }),
        });
        at.addGrant({
            roomJoin: true,
            room: roomId,
            canPublish: true,
            canSubscribe: true,
        });

        const token = await at.toJwt();
        return token;
    };
}

module.exports = new LivekitController();
