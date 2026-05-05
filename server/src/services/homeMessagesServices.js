const messagesService = require('./messagesService');
const conversationsService = require('./conversationsService');
const pinnedmessagesService = require('./pinnedmessagesService');
const messageReactionService = require('./message_reactionsService');
const usersService = require('./usersService');
const participantsService = require('./participantsService.js')
const { BadRequestError } = require('../core/errorResponse.js');

class HomeMessagesService {
    async getMessagesByConversation(conversationId, limit = 100, offset = 0) {
        // 1. Song song hóa queries ban đầu
        const [conversation, messages, pinnedMessages] = await Promise.all([
            conversationsService.getConversationById(conversationId),
            messagesService.getAllMessagesByConversationId(conversationId, limit, offset),
            pinnedmessagesService.getPinnedMessagesByConversationId(conversationId),
        ]);

        const messageIds = (messages || []).map((m) => m.id);
        const messageReactions = await messageReactionService.getMessageReactionsByMessageIds(messageIds);

        if (!conversation) {
            // Virtual conversation or non-existent — return empty skeleton instead of 500 error
            return {
                id: conversationId,
                messages: [],
                pinnedMessages: [],
                hasMore: false,
                is_not_found: true,
                conversation_type: 'direct', // Default fallback
            };
        }

        const safePinned = pinnedMessages || [];

        if (messages.length === 0 && safePinned.length === 0) {
            return {
                ...conversation.dataValues,
                messages: [],
                pinnedMessages: [],
                hasMore: false,
            };
        }

        // 2. Thu thập tất cả IDs cần thiết
        const messageSenderIds = messages.map((m) => m.sender_id);
        const pinnedExecutorIds = safePinned.map((p) => p.pinned_by);
        const parentMessageIds = messages.map((m) => m.parent_message_id).filter(Boolean);
        const pinnedTargetMessageIds = safePinned.map((p) => p.message_id).filter(Boolean);
        const refMessageIds = [...new Set([...parentMessageIds, ...pinnedTargetMessageIds])];

        // 3. Query song song: refMessages + "known users" (sender + pinner)
        //    Không cần đợi refMessages mới query users — query trước users đã biết,
        //    rồi chỉ query thêm sender của refMessages nếu chưa có trong set
        const knownUserIds = [...new Set([...messageSenderIds, ...pinnedExecutorIds])];

        const [refMessages, knownUsers] = await Promise.all([
            refMessageIds.length > 0 ? messagesService.getMessagesByIds(refMessageIds) : Promise.resolve([]),
            knownUserIds.length > 0 ? usersService.getAllUsers({ id: knownUserIds }) : Promise.resolve([]),
        ]);

        // 4. Lấy thêm users từ refMessages nếu chưa có (tránh query trùng)
        const knownUserIdSet = new Set(knownUserIds);
        const refSenderIds = refMessages.map((m) => m.sender_id).filter((id) => id && !knownUserIdSet.has(id));
        const uniqueRefSenderIds = [...new Set(refSenderIds)];

        const refSenderUsers =
            uniqueRefSenderIds.length > 0 ? await usersService.getAllUsers({ id: uniqueRefSenderIds }) : [];

        // 5. Merge tất cả users vào 1 Map
        const userMap = new Map([...knownUsers.map((u) => [u.id, u]), ...refSenderUsers.map((u) => [u.id, u])]);
        const refMessagesMap = new Map(refMessages.map((m) => [m.id, m]));

        // Group reactions by message_id
        const reactionsMap = {};
        const countReactionMap = {};
        (messageReactions || []).forEach((r) => {
            const mId = r.message_id;
            if (!reactionsMap[mId]) reactionsMap[mId] = [];
            reactionsMap[mId].push(r.dataValues);
            if (!countReactionMap[mId]) countReactionMap[mId] = {};
            countReactionMap[mId][r.emoji_char] = (countReactionMap[mId][r.emoji_char] || 0) + 1;
        });

        // 6. Map Pinned Messages → plain objects
        const mappedPinnedMessages = safePinned.map((pin) => {
            const pinner = userMap.get(pin.pinned_by);
            const targetMsg = refMessagesMap.get(pin.message_id);
            const sender = targetMsg ? userMap.get(targetMsg.sender_id) : null;

            return {
                ...pin.dataValues,
                pinned_by_name: pinner ? pinner.full_name : 'Unknown',
                content: targetMsg ? targetMsg.content : 'Tin nhắn không tồn tại hoặc đã bị xóa',
                sender_id: targetMsg ? targetMsg.sender_id : null,
                sender_name: sender ? sender.full_name : 'Unknown',
                message_type: targetMsg ? targetMsg.message_type : 'text',
                file_name: targetMsg ? targetMsg.file_name : null,
            };
        });

        // 7. Map Messages chính → plain objects
        const mappedMessages = messages.map((m) => {
            const sender = userMap.get(m.sender_id);
            const result = {
                ...m.dataValues,
                sender_name: sender ? sender.full_name : '',
                sender_avatar: sender ? sender.avatar_url : '',
                sender_status: sender ? sender.status : '',
                parent_message_info: null,
                reactions: reactionsMap[m.id] || [],
                countReactionMap: countReactionMap[m.id] || {},
            };

            if (m.parent_message_id) {
                const parentMsg = refMessagesMap.get(m.parent_message_id);
                if (parentMsg) {
                    const parentSender = userMap.get(parentMsg.sender_id);
                    result.parent_message_info = {
                        parent_message_id: parentMsg.id,
                        parent_message_content: parentMsg.content,
                        parent_message_sender_id: parentMsg.sender_id,
                        parent_message_is_deleted: parentMsg.is_deleted,
                        parent_message_name: parentSender ? parentSender.full_name : 'Unknown',
                        parent_message_thumbnail_url: parentMsg.thumbnail_url,
                        parent_message_type: parentMsg.message_type,
                    };
                }
            }

            return result;
        });

        return {
            ...conversation.dataValues,
            messages: mappedMessages,
            pinnedMessages: mappedPinnedMessages,
            hasMore: messages.length === limit,
        };
    }


    async getUnreadMessages({ conversation_id, last_read_message_id }) {
        if (!conversation_id)
            throw new BadRequestError('params invalid')

        const unreadMessages = await messagesService.getUnreadMessages(
            { conversation_id, last_read_message_id },
            {
                attributes: ['id', 'sender_id', 'message_type', 'content', 'parent_message_id', 'file_name', 'link_description'],
                raw: true,
                order: [['created_at', 'ASC']]
            }
        )

        if (unreadMessages.length === 0) return null

        const senderIds = Array.from(new Set(unreadMessages.map(m => m.sender_id)))

        const participants = await participantsService.getParticipantByConversationsAndUserIds(
            conversation_id,
            senderIds,
            { attributes: ['user_id', 'nick_name'], raw: true }
        )

        const participantsMap = participants.reduce((acc, p) => {
            acc[p.user_id] = p.nick_name
            return acc
        }, {})

        const messageIdsMap = {}
        unreadMessages.forEach((msg, index) => {
            messageIdsMap[msg.id] = index
        })

        const updateUnreadMessages = unreadMessages.map(m => {
            const { id, sender_id, message_type, content, parent_message_id, file_name, link_description } = m
            const result = {
                msg_no: messageIdsMap[id],
                sender: participantsMap[sender_id],
                type: message_type,
                content: content,
            }

            if (file_name) result['file_name'] = file_name
            if (link_description) result['file_desc'] = link_description
            if (parent_message_id) result['reply_to'] = messageIdsMap[parent_message_id]

            return result
        })

        return updateUnreadMessages
    }

    async postMessageToConversation(
        conversationId,
        senderId,
        content,
        parent_message_id = null,
        message_type = 'text',
        file_url = null,
        file_name = null,
        file_size = null,
        thumbnail_url = null,
        duration = null,
        link_description = null,
        has_link = false
    ) {
        let resolvedFileUrl = file_url;
        let resolvedFileName = file_name;
        let resolvedFileSize = file_size;
        let resolvedThumbnailUrl = thumbnail_url;
        let resolvedDuration = duration;
        let resolvedLinkDescription = link_description;
        let resolvedHasLink = has_link;

        // Link preview detection removed (linkpreviewService deleted)
        // has_link flag and link fields must be provided by client if needed

        // 1. Tạo message mới + lấy parent message (song song)
        const [newMessage, parentMessage] = await Promise.all([
            messagesService.createMessage({
                conversation_id: conversationId,
                sender_id: senderId,
                content,
                parent_message_id,
                message_type,
                has_link: resolvedHasLink,
                file_url: resolvedFileUrl,
                file_name: resolvedFileName,
                file_size: resolvedFileSize,
                thumbnail_url: resolvedThumbnailUrl,
                link_description: resolvedLinkDescription,
                duration: resolvedDuration,
                time_sent: new Date(),
            }),
            parent_message_id ? messagesService.getMessageById(parent_message_id) : Promise.resolve(null),
        ]);

        // 2. Update conversation + đồng bộ mốc đã đọc của người gửi + lấy parent sender
        const [, , parentSender] = await Promise.all([
            conversationsService.updateConversation(conversationId, {
                last_message_id: newMessage.id,
            }),
            (async () => {
                const senderParticipant = await participantsService.getParticipant({
                    conversation_id: conversationId,
                    user_id: senderId,
                });

                if (!senderParticipant) return null;

                return participantsService.updateParticipant(senderParticipant.id, {
                    last_read_message_id: newMessage.id,
                });
            })(),
            parentMessage ? usersService.getUserById(parentMessage.sender_id) : Promise.resolve(null),
        ]);

        const parent_message_info = parentMessage
            ? {
                parent_message_id: parentMessage.id,
                parent_message_content: parentMessage.content,
                parent_message_sender_id: parentMessage.sender_id,
                parent_message_is_deleted: parentMessage.is_deleted,
                parent_message_name: parentSender ? parentSender.full_name : '',
                parent_message_type: parentMessage.message_type,
                parent_message_thumbnail_url: parentMessage.thumbnail_url,
            }
            : null;

        return {
            ...newMessage.dataValues,
            parent_message_info,
        };
    }

    async getHomeMessagesMedia(convID) {
        return await messagesService.getHomeMessagesMedia(convID);
    }

    async updateMessageInConversation(messageId, messageData) {
        return await messagesService.updateMessage(messageId, messageData);
    }

    async deleteMessageInConversation(messageId) {
        return await messagesService.deleteMessage(messageId);
    }
}

module.exports = new HomeMessagesService();