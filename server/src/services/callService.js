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
        const result = await callModel.sequelize.query(
            'EXEC sp_StartCall ?, ?, ?, ?, ?',
            {
                replacements: [
                    conversation_id,
                    caller_id,
                    call_type,
                    media_type,
                    'pending'
                ],
                type: callModel.sequelize.QueryTypes.SELECT,
                ...options
            }
        );
        const newCallId = result[0].NewCallId;
        return await this.getCallById(newCallId, options);
    }

    async updateStatusCall({ call_id, status }, options = {}) {
        if (!call_id || !status) throw new Error('params invalid');
        
        await callModel.sequelize.query(
            'EXEC sp_UpdateCallStatus ?, ?',
            {
                replacements: [call_id, status],
                type: callModel.sequelize.QueryTypes.RAW,
                ...options
            }
        );

        return { success: true };
    }


}

module.exports = new CallService();
