const emojiService = require('../services/emojisService');
const SuccessResponse = require('../core/successResponse');

class EmojiController {
    async getAllEmojis(req, res) {
        try {
            const emojis = await emojiService.getAllEmojis();
            new SuccessResponse({
                message: 'Get all emojis successfully',
                metadata: {
                    emojis: emojis,
                },
            }).send(res);
        } catch (error) {
            console.error('Error in getAllEmojis:', error);
            res.status(500).json({ message: 'Internal Server Error', error: error.message });
        }
    }
}

module.exports = new EmojiController();
