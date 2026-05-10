const callModel = require('../models/callsModel.js');
const { sequelize } = require('../configs/sequelizeConfig');

class CallService {
    async getCallById(call_id, options = {}) {
        return await callModel.findByPk(call_id, options);
    }

    async getStatusById(call_id) {
        const call = await callModel.findByPk(call_id, {
            attributes: ['status'],
        });
        return call ? call.status : null;
    }

    async startCall({ conversation_id, caller_id, call_type, media_type }, options = {}) {
        return await callModel.create(
            {
                conversation_id,
                caller_id,
                call_type,
                media_type,
                content: `Cuộc gọi ${media_type === 'audio' ? 'thoại' : media_type}`,
            },
            options,
        );
    }

    async updateStatusCall({ call_id, status }, options = {}) {
        if (!call_id || !status) throw new Error('params invalid');
        const STATUS = ['ongoing', 'completed', 'missed', 'declined', 'cancelled'];
        if (!STATUS.includes(status)) throw new Error('Status call is not found');

        const updateData = {
            status,
        };

        const foundCall = await this.getCallById(call_id);
        if (!foundCall) throw new Error('call not found');
        if(foundCall.status === status) return {
            success: false,
            message: 'status already assigned'
        }

        if (status === 'ongoing') updateData.started_at = sequelize.fn('SYSDATETIMEOFFSET');
        else if (status === 'completed' && foundCall.started_at) {
            const now = new Date();
            updateData.ended_at = sequelize.fn('SYSDATETIMEOFFSET');
            const startLog = new Date(foundCall.started_at).getTime();
            const endLog = now.getTime();

            // Tính toán dựa trên miliseconds
            const duration_ms = endLog - startLog;
            const duration_seconds = Math.floor(duration_ms / 1000);

            updateData.duration_seconds = duration_seconds;
        }

        return await callModel.update(updateData, {
            where: {
                id: call_id,
            },
            returning: false, // BẮT BUỘC: false để không dùng OUTPUT clause (xung đột với Trigger)
            ...options,
        });
    }

   
}

module.exports = new CallService();
