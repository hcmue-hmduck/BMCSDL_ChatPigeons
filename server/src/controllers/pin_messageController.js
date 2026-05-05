const pinMessageService = require('../services/pinnedmessagesService');
const SuccessResponse = require('../core/successResponse');

class PinMessageController {
    async postHomePinMessage(req, res) {
        const pinMessageData = req.body;
        const newPinMessage = await pinMessageService.createPinnedMessage(pinMessageData);
        new SuccessResponse({
            message: 'Create pin message successfully',
            metadata: {
                newPinMessage: newPinMessage,
            },
        }).send(res);
    }

    async putHomePinMessage(req, res) {
        const messageId = req.params.pinMessID;
        const messageData = req.body;
        console.log(messageId, messageData);
        const updatedMessage = await pinMessageService.updatePinnedMessage(messageId, messageData);
        new SuccessResponse({
            message: 'Put home pin message successfully',
            metadata: {
                updatedMessage: updatedMessage,
            },
        }).send(res);
    }

    async deleteHomePinMessage(req, res) {
        const messageId = req.params.pinMessID;
        const deleteResult = await pinMessageService.deletePinnedMessage(messageId);
        new SuccessResponse({
            message: 'Delete home pin message successfully',
            metadata: {
                deleteResult: deleteResult,
            },
        }).send(res);
    }
}

module.exports = new PinMessageController();
