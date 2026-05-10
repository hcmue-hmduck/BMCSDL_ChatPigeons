const { BadRequestError, E2EEErrorCode } = require('../core/errorResponse.js');
const userModel = require('../models/usersModel.js');
const conversationKeysVaultModel = require('../models/conversationkeysvaultModel.js');
const participantsService = require('./participantsService.js');
const conversationsService = require('./conversationsService.js');

class E2EEService {
    async setupKeys(user_id, { public_key, wrapped_private_key, kek_iv, pin_salt }) {
        if (!user_id || !public_key || !wrapped_private_key || !kek_iv || !pin_salt)
            throw new BadRequestError('missing parameters');

        const foundUser = await userModel.findByPk(user_id);
        if (!foundUser) throw BadRequestError('user not found');

        return await foundUser.update({
            public_key,
            wrapped_private_key,
            kek_iv,
            pin_salt,
        });
    }

    async checkStatus(user_id) {
        if (!user_id) throw new BadRequestError('missing parameters');
        const foundUser = await userModel.findByPk(user_id);
        if (!foundUser) throw new BadRequestError('user not found');

        const { wrapped_private_key, kek_iv, pin_salt, public_key } = foundUser;
        return {
            hasSetup: !!(wrapped_private_key && kek_iv && pin_salt && public_key)
        };
    }

    async getKeys(user_id) {
        if (!user_id) throw new BadRequestError('missing parameters');
        const foundUser = await userModel.findByPk(user_id);
        if (!foundUser) throw new BadRequestError('user not found');

        const { wrapped_private_key, kek_iv, pin_salt, public_key } = foundUser;
        if (!wrapped_private_key || !kek_iv || !pin_salt || !public_key) throw new BadRequestError(`missing key`);

        return {
            public_key,
            wrapped_private_key,
            kek_iv,
            pin_salt,
        };
    }

    async getConversationMemberKeys(conversation_id) {
        if (!conversation_id) throw new BadRequestError('missing parameters');

        const participants = await participantsService.getParticipantIdsByConversationId(conversation_id);
        if (!participants || participants.length === 0) throw new BadRequestError(`conversation haven't members`);

        // Trích xuất mảng ID từ mảng Object [{id: '...'}, ...]
        const participant_ids = participants.map((p) => p.user_id);

        return await userModel.findAll({
            where: { id: participant_ids },
            attributes: ['id', 'public_key'],
            raw: true,
        });
    }

    async getLatestConversationKey(user_id, conversation_id, throw_erorr = true) {
        if (!user_id || !conversation_id) throw new BadRequestError('invalid parameters');
        const vault = await conversationKeysVaultModel.findOne({
            where: { conversation_id, user_id },
            order: [['key_version', 'DESC']],
        });

        if (!vault && throw_erorr)
            throw new BadRequestError(
                'conversation not establish security',
                undefined,
                E2EEErrorCode.SERVER_VAULT_NOT_FOUND,
            );

        return vault;
    }

    async addConversationKeys(user_id,  { conversation_key_vaults }) {
        if (!user_id || !conversation_key_vaults || !Array.isArray(conversation_key_vaults) || conversation_key_vaults.length === 0)
            throw new BadRequestError('invalid parameters');

        const validField = ['user_id', 'conversation_id', 'wrapped_shared_key', 'key_version'];
        conversation_key_vaults.forEach((vault) => {
            const keys = Object.keys(vault);
            if (keys.length !== validField.length) throw new BadRequestError('Invalid number of fields in vault entry');

            keys.forEach((key) => {
                if (!validField.includes(key)) throw new BadRequestError(`Invalid field detected: ${key}`);
            });
        });

        const { conversation_id, key_version } = conversation_key_vaults[0];

        const latestConvKey = await this.getLatestConversationKey(user_id, conversation_id, false);

        const latestKeyVersion = latestConvKey?.key_version ? latestConvKey.key_version : 0;

        if (key_version !== latestKeyVersion + 1) {
            throw new BadRequestError(
                `Keys for version ${key_version} invalid in this conversation.`,
                undefined,
                E2EEErrorCode.SERVER_KEY_VERSION_MISMATCH,
            );
        }

        const result = await conversationKeysVaultModel.bulkCreate(conversation_key_vaults);
        await conversationsService.updateKeyStatus(conversation_id,  'active');
        return result;
    }

    async getConversationKey(user_id, conversation_id, key_version) {
        if (!user_id || !conversation_id || !key_version) throw new BadRequestError('invalid parmameters');

        const foundKey = await conversationKeysVaultModel.findOne({
            where: { user_id, conversation_id, key_version },
            attributes: ['wrapped_shared_key', 'key_version'],
            raw: true,
        });

        if (!foundKey)
            throw new BadRequestError('shared key not found', undefined, E2EEErrorCode.SERVER_VAULT_NOT_FOUND);
        return foundKey;
    }

    // Lấy tất cả vault
    async getConversationKeys(user_id) {
        if (!user_id) throw new BadRequestError('invalid parameters');

        return await conversationKeysVaultModel.findAll({
            where: { user_id },
            attributes: {
                exclude: ['id', 'user_id', 'updated_at', 'created_at'],
            },
            raw: true,
        });
    }
}

module.exports = new E2EEService();
