const emojisModel = require('../models/emojisModel');

class EmojisService {
    async getAllEmojis() {
        return await emojisModel.findAll();
    }
}

module.exports = new EmojisService();