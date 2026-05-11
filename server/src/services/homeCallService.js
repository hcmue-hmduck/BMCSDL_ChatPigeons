const messagesService = require('./messagesService.js');
const callService = require('./callService.js');
const { sequelize } = require('../configs/sequelizeConfig.js');
const { CALL_STATUS } = require('../constants/call.constants.js');
const conversationsService = require('./conversationsService.js');

class HomeCallService {
    async startCall({ conversation_id, caller_id, call_type, media_type }) {
        const result = await sequelize.query(
            'EXEC sp_InitCall ?, ?, ?, ?, ?',
            {
                replacements: [
                    conversation_id,
                    caller_id,
                    call_type,
                    media_type,
                    `Cuộc gọi ${media_type === 'audio' ? 'thoại' : media_type}`
                ],
                type: sequelize.QueryTypes.SELECT
            }
        );

        const newMessageId = result[0].NewMessageId;
        const newCallId = result[0].NewCallId;

        // Lấy thông tin đầy đủ để trả về cho client giống như trước
        const message = await messagesService.getMessageById(newMessageId);
        const call = await callService.getCallById(newCallId);

        return {
            ...message.get({ plain: true }),
            call: call.get({ plain: true })
        };
    }

    async createLogJoinGroupCall({ user_id, conversation_id }) {
        if (!user_id || !conversation_id) throw new Error('params is not found');
        const newMessage = await messagesService.createMessage({
            conversation_id,
            sender_id: user_id,
            message_type: 'system',
            content: 'đã tham gia cuộc gọi.',
        });

        await conversationsService.updateConversation(conversation_id, {
            last_message_id: newMessage.id,
        });

        return newMessage
    }

    async setCallOngoing(call_id) {
        const statusCall = await callService.getStatusById(call_id);
        if (statusCall !== CALL_STATUS['PENDING'])
            return {
                success: false,
                message: 'Call status is not pending',
            };
        return await callService.updateStatusCall({ call_id, status: 'ongoing' });
    }

    async setCallCompleted(call_id) {
        return await callService.updateStatusCall({ call_id, status: 'completed' });
    }

    async setCallDecliend(call_id) {
        return await callService.updateStatusCall({ call_id, status: 'declined' });
    }

    async setCallCancelled(call_id) {
        return await callService.updateStatusCall({ call_id, status: 'cancelled' });
    }

    async setCallMissed(call_id) {
        return await callService.updateStatusCall({ call_id, status: 'missed' });
    }

    async endCall(call_id) {
        const status = await callService.getStatusById(call_id);
        let newStatus = '';
        if (status === 'pending') newStatus = 'cancelled';
        else if (status === 'ongoing') newStatus = 'completed';

        if (!newStatus)
            return {
                completed: false,
                message: 'status invalid',
            };

        return await callService.updateStatusCall({ call_id, status: newStatus });
    }
}

module.exports = new HomeCallService();
