const usersService = require('./usersService');
const participantsService = require('./participantsService');
const messagesService = require('./messagesService');
const conversationsService = require('./conversationsService');
const { BadRequestError } = require('../core/errorResponse');
const { Op } = require('sequelize');
const messagesModel = require('../models/messagesModel');

class HomeConversationService {
    // Lấy danh sách conversations của user để hiển thị sidebar
    async getAllUserMessagesInJoinedConversations(userId) {
        // 1. Lấy tất cả participant record của user (bao gồm cả các cuộc hội thoại đã rời)
        const userConversations = await messagesModel.sequelize.query(
            'SELECT * FROM vw_GetConversations WHERE user_id = :userId AND is_active = 1',
            {
                replacements: { userId },
                type: messagesModel.sequelize.QueryTypes.SELECT
            }
        );

        const conversationIds = userConversations.map((c) => c.conversation_id);
        if (conversationIds.length === 0) return {
            userInfo: await usersService.getUserById(userId),
            joinedConversations: []
        };

        const conversations = userConversations.map(c => ({
            ...c,
            id: c.conversation_id
        }));

        const userParticipants = userConversations; // Giữ lại biến này cho các logic phía sau

        const [allParticipants] = await Promise.all([
            participantsService.getAllParticipants({ conversation_id: conversationIds }),
        ]);

        // 3. Thu thập userIds duy nhất & relevant message IDs → batch query song song
        const userIds = [...new Set(allParticipants.map((p) => p.user_id))];
        const lastMessageIds = conversations.map((conv) => conv.last_message_id).filter(Boolean);

        const currentUserParticipants = allParticipants.filter(p => p.user_id === userId);
        const lastReadMessageIds = currentUserParticipants.map(p => p.last_read_message_id).filter(Boolean);

        const allRelevantMessageIds = [...new Set([...lastMessageIds, ...lastReadMessageIds])];

        const [users, allRelevantMessages] = await Promise.all([
            usersService.getAllUsers({ id: userIds }),
            allRelevantMessageIds.length > 0 ? messagesService.getMessagesByIds(allRelevantMessageIds) : Promise.resolve([]),
        ]);

        // 4. Tạo Map để lookup O(1)
        const messagesMap = new Map(allRelevantMessages.map((msg) => [msg.id, msg]));
        const usersMap = new Map(users.map((u) => [u.id, u]));
        const conversationsMap = new Map(conversations.map((c) => [c.id, c]));

        const currentUserParticipantMap = new Map(
            userParticipants.map((p) => [String(p.conversation_id), p]),
        );

        // Chuẩn bị thông tin unread count
        const convReadTimestamps = [];
        const lastReadAtMap = new Map(); // conv_id -> timestamp

        // Build participantsMap & ownerInfoMap trong 1 lần duyệt
        const participantsMap = new Map();
        const ownerInfoMap = new Map();
        const isPinnedMap = new Map(); // Store is_pinned status per conversation

        allParticipants.forEach((p) => {
            const user = usersMap.get(p.user_id);
            const conv = conversationsMap.get(p.conversation_id);
            const isOwner = conv && conv.created_by === p.user_id;

            const participantInfo = user
                ? {
                    id: p.id,
                    user_id: user.id,
                    full_name: user.full_name,
                    avatar_url: user.avatar_url,
                    last_online_at: user.last_online_at,
                    owner: p.role,
                    joinned_at: p.joinned_at,
                    left_at: p.left_at,
                    nick_name: p.nick_name,
                    is_muted: p.is_muted,
                    is_pinned: p.is_pinned,
                    last_read_message_id: p.last_read_message_id,
                }
                : {
                    user_id: p.user_id,
                    owner: p.role,
                };

            if (participantInfo.user_id === userId) {
                isPinnedMap.set(p.conversation_id, p.is_pinned);
            }

            if (!participantsMap.has(p.conversation_id)) {
                participantsMap.set(p.conversation_id, []);
            }
            participantsMap.get(p.conversation_id).push(participantInfo);

            if (isOwner) {
                ownerInfoMap.set(p.conversation_id, participantInfo);
            }

            // Lưu timestamp tin nhắn cuối đã đọc của current user
            if (p.user_id === userId) {
                const lastReadMsg = messagesMap.get(p.last_read_message_id);
                const lastReadAt = lastReadMsg ? lastReadMsg.created_at : new Date(0); // Nếu chưa đọc bao giờ thì coi như từ đầu thời gian
                lastReadAtMap.set(p.conversation_id, lastReadAt);

                const conv = conversationsMap.get(p.conversation_id);
                if (conv && conv.last_message_id !== p.last_read_message_id) {
                    convReadTimestamps.push({
                        conversation_id: p.conversation_id,
                        last_read_at: lastReadAt,
                        left_at: p.left_at || null,
                    });
                }
            }
        });

        const leftConversations = conversations.filter((conv) => {
            const currentParticipant = currentUserParticipantMap.get(String(conv.id));
            return !!currentParticipant?.left_at;
        });

        const leftConversationLastMessageMap = new Map();
        if (leftConversations.length > 0) {
            const snapshots = await Promise.all(
                leftConversations.map(async (conv) => {
                    const currentParticipant = currentUserParticipantMap.get(String(conv.id));
                    if (!currentParticipant?.left_at) return [String(conv.id), null];

                    const lastVisibleMessage = await messagesModel.findOne({
                        where: {
                            conversation_id: conv.id,
                            created_at: { [Op.lte]: currentParticipant.left_at },
                        },
                        include: [
                            {
                                association: 'call',
                                required: false,
                            },
                        ],
                        order: [['created_at', 'DESC']],
                    });

                    return [String(conv.id), lastVisibleMessage || null];
                }),
            );

            snapshots.forEach(([convId, msg]) => {
                leftConversationLastMessageMap.set(convId, msg);
            });
        }

        // 5. Batch count unread messages
        const unreadCountsMap = await messagesService.countUnreadMessages(userId);

        // Log results for verification
        if (convReadTimestamps.length > 0) {
            console.log('--- Unread Messages Count ---');
            convReadTimestamps.forEach(item => {
                const count = unreadCountsMap[item.conversation_id] || 0;
                if (count > 0) {
                    console.log(`Conv ${item.conversation_id}: ${count} unread messages since message (at ${item.last_read_at})`);
                }
            });
            console.log('-----------------------------');
        }

        // Build userInfo cho current user
        const currentUser = usersMap.get(userId);
        const userInfo = currentUser
            ? {
                id: currentUser.id,
                password_hash: currentUser.password_hash,
                bio: currentUser.bio,
                phone_number: currentUser.phone_number,
                is_phone_verified: currentUser.is_phone_verified,
                is_email_verified: currentUser.is_email_verified,
                created_at: currentUser.created_at,
                updated_at: currentUser.updated_at,
                full_name: currentUser.full_name,
                avatar_url: currentUser.avatar_url,
                email: currentUser.email,
                status: currentUser.status,
                birthday: currentUser.birthday,
                gender: currentUser.gender,
                last_online_at: currentUser.last_online_at,
            }
            : null;

        // 5. Tổng hợp sidebar — conversations đã filter theo conversationIds của user nên không cần .some()
        const joinedConversations = conversations.map((conv) => {
            const convParticipants = participantsMap.get(conv.id) || [];

            let title = conv.name;
            if (!title) {
                const other = convParticipants.find((p) => p.user_id !== userId);
                title = other ? other.full_name : 'Cuộc trò chuyện';
            }

            const currentParticipant = currentUserParticipantMap.get(String(conv.id));
            const hasLeft = !!currentParticipant?.left_at;
            let sidebarLastMessage = hasLeft
                ? leftConversationLastMessageMap.get(String(conv.id)) || null
                : messagesMap.get(conv.last_message_id) || null;

            let finalUnreadCount = hasLeft ? 0 : unreadCountsMap[conv.id] || 0;

            const historyClearedAt = currentParticipant?.history_cleared_at ? new Date(currentParticipant.history_cleared_at) : null;
            if (historyClearedAt && sidebarLastMessage) {
                const messageCreatedAt = new Date(sidebarLastMessage.created_at);
                if (messageCreatedAt <= historyClearedAt) {
                    sidebarLastMessage = null;
                    finalUnreadCount = 0;
                }
            }

            return {
                conversation_id: conv.id,
                title,
                avatar_url: conv.avatar_url,
                type: conv.conversation_type,
                ownerInfo: ownerInfoMap.get(conv.id) || null,
                participants: convParticipants,
                lastMessage: sidebarLastMessage,
                unread_count: finalUnreadCount,
                is_pinned: isPinnedMap.get(conv.id) || false,
                allow_history_view: conv.allow_history_view,
                allow_member_chat: conv.allow_member_chat
            };
        });

        const filteredJoinedConversations = joinedConversations.filter(c => {
            if (c.lastMessage === null) {
                // Giữ lại nhóm mới tạo chưa có tin nhắn
                if (c.type === 'group') {
                    return true;
                }
                return false;
            }
            return true;
        });

        return { userInfo, joinedConversations: filteredJoinedConversations };
    }

    async updateConversation(conversationId, conversationData, userId = null) {
        // Nếu thay đổi cài đặt cho phép thành viên nhắn tin, dùng Stored Procedure
        if (conversationData && conversationData.allow_member_chat !== undefined && userId) {
            try {
                const result = await messagesModel.sequelize.query(
                    'EXEC sp_UpdateConversationAllowMemberChat :conversationId, :userId, :allowMemberChat',
                    {
                        replacements: {
                            conversationId,
                            userId,
                            allowMemberChat: conversationData.allow_member_chat ? 1 : 0
                        },
                        type: messagesModel.sequelize.QueryTypes.SELECT
                    }
                );
                return result[0];
            } catch (err) {
                const errMsg = err.original?.message || err.message;
                if (errMsg.includes('Chỉ Trưởng nhóm')) {
                    const { ForbiddenError } = require('../core/errorResponse');
                    throw new ForbiddenError(errMsg);
                }
                throw new BadRequestError(errMsg);
            }
        }
        return await conversationsService.updateConversation(conversationId, conversationData);
    }

    async getConversationNameById(conversationId) {
        return await conversationsService.getConversationNameById(conversationId);
    }

    async createConversation(participants_id, conversation_type, name, avatar_url, created_by, last_message_id, last_message_at) {
        let conv;
        let participants = [];
        let you;

        if (conversation_type === 'direct') {
            const result = await messagesModel.sequelize.query(
                'EXEC sp_CreateDirectConversation ?, ?',
                {
                    replacements: [
                        created_by,
                        participants_id
                    ],
                    type: messagesModel.sequelize.QueryTypes.SELECT
                }
            );
            const newConvId = result[0].NewConversationId;
            conv = await conversationsService.getConversationById(newConvId);

            // Lấy danh sách participants vừa tạo từ SP
            const parts = await participantsService.getParticipantByConversationId(newConvId);
            you = parts.find(p => p.user_id === created_by);
            const other = parts.find(p => p.user_id === participants_id);
            if (other) participants.push(other);
        } else {
            conv = await conversationsService.createConversation(conversation_type, name, avatar_url, created_by, last_message_id, last_message_at);

            if (participants_id) {
                participants.push(await participantsService.createParticipant(conv.id, { user_id: participants_id }));
            }
            you = await participantsService.createParticipant(conv.id, { user_id: created_by, role: 'owner' });
        }

        // Enrich participants with user details (full_name, avatar_url)
        const allUserIds = [created_by];
        if (participants_id) allUserIds.push(participants_id);

        const users = await usersService.getAllUsers(
            { id: allUserIds }
        );
        const usersMap = new Map(users.map(u => [String(u.id), u]));

        const enrich = (p) => {
            const user = usersMap.get(String(p.user_id));
            return user ? {
                ...p.toJSON ? p.toJSON() : p,
                full_name: user.full_name,
                avatar_url: user.avatar_url,
                last_online_at: user.last_online_at,
            } : p;
        };

        return {
            conv,
            participants: participants.map(enrich),
            you: enrich(you)
        };
    }

    async createGroup(participants_ids, name, avatar_url, created_by) {
        if (!participants_ids || !Array.isArray(participants_ids) || participants_ids.length < 2) {
            throw new BadRequestError('Nhóm phải có ít nhất 3 người (bao gồm cả bạn).');
        }

        const conv = await conversationsService.createConversation('group', name, avatar_url, created_by);

        const participants = [];
        for (const user_id of participants_ids) {
            participants.push(await participantsService.createParticipant(conv.id, { user_id }));
        }

        const you = await participantsService.getParticipant({
            conversation_id: conv.id,
            user_id: created_by
        });

        const allUserIds = [created_by, ...participants_ids];
        const users = await usersService.getAllUsers(
            { id: allUserIds }
        );
        const usersMap = new Map(users.map(u => [String(u.id), u]));

        const enrich = (p) => {
            const user = usersMap.get(String(p.user_id));
            return user ? {
                ...p.toJSON ? p.toJSON() : p,
                full_name: user.full_name,
                avatar_url: user.avatar_url,
                last_online_at: user.last_online_at,
            } : p;
        };

        return {
            conv,
            participants: participants.map(enrich),
            you: enrich(you)
        };
    }

    async clearConversationHistory(conversationId, userId) {
        if (!conversationId || !userId) throw new BadRequestError('params invalid');

        await messagesModel.sequelize.query(
            'EXEC sp_ClearConversationHistory ?, ?',
            {
                replacements: [conversationId, userId],
                type: messagesModel.sequelize.QueryTypes.RAW
            }
        );

        return { success: true };
    }
}

module.exports = new HomeConversationService();
