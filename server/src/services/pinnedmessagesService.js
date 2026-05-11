const pinnedmessagesModel = require('../models/pinnedmessagesModel');

class PinnedMessagesService {
    async createPinnedMessage(data) {
        const { message_id, conversation_id, pinned_by, note } = data;

        await pinnedmessagesModel.sequelize.query(
            'EXEC sp_PinMessage ?, ?, ?, ?',
            {
                replacements: [
                    message_id,
                    conversation_id,
                    pinned_by,
                    note || null
                ],
                type: pinnedmessagesModel.sequelize.QueryTypes.RAW
            }
        );

        // Lấy lại bản ghi vừa tạo để trả về
        return await pinnedmessagesModel.findOne({
            where: { message_id, conversation_id }
        });
    }

    async deletePinnedMessage(pinMessageId) {
        await pinnedmessagesModel.sequelize.query(
            'EXEC sp_UnpinMessage ?, ?',
            {
                replacements: [
                    pinMessageId,
                    null
                ],
                type: pinnedmessagesModel.sequelize.QueryTypes.RAW
            }
        );
        return { success: true };
    }

    async getAllPinnedMessages() {
        return await pinnedmessagesModel.findAll();
    }

    async getPinnedMessagesByConversationId(conversationId) {
        return await pinnedmessagesModel.sequelize.query(
            'SELECT * FROM vw_GetPinnedMessages WHERE conversation_id = :conversationId ORDER BY pinned_at ASC',
            {
                replacements: { conversationId },
                type: pinnedmessagesModel.sequelize.QueryTypes.SELECT
            }
        );
    }

    async updatePinnedMessage(pinMessageId, data) {
        return await pinnedmessagesModel.update(data, {
            where: {
                id: pinMessageId
            }
        });
    }
}

module.exports = new PinnedMessagesService();