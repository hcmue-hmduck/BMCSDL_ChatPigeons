-- =====================================================
-- VIEW: vw_GetConversations
-- =====================================================
CREATE OR ALTER VIEW vw_GetConversations AS
SELECT 
    p.user_id,
    c.id AS conversation_id,
    c.conversation_type,
    c.name,
    c.avatar_url,
    c.last_message_id,
    c.last_message_at,
    c.is_active,
    c.created_by,
    p.role AS user_role,
    p.nick_name,
    p.is_muted,
    p.is_pinned,
    p.left_at,
    p.joined_at
FROM conversations c
JOIN participants p ON c.id = p.conversation_id;
GO


-- =====================================================
-- VIEW: vw_GetMessages
-- =====================================================
CREATE OR ALTER VIEW vw_GetMessages AS
SELECT 
    id AS message_id,
    conversation_id,
    sender_id,
    message_type,
    content,
    file_url,
    file_size,
    file_name,
    thumbnail_url,
    link_description,
    duration,
    call_id,
    has_link,
    is_edited,
    is_deleted,
    deleted_for_all,
    parent_message_id,
    created_at,
    updated_at,
    is_e2ee,
    key_version,
    iv
FROM messages;
GO


-- =====================================================
-- VIEW: vw_GetUnreadMessages
-- =====================================================
CREATE OR ALTER VIEW vw_GetUnreadMessages AS
SELECT 
    p.user_id,
    m.conversation_id,
    m.id AS message_id,
    m.sender_id,
    m.message_type,
    m.content,
    m.created_at
FROM messages m
JOIN participants p ON m.conversation_id = p.conversation_id
LEFT JOIN messages lm ON p.last_read_message_id = lm.id
WHERE m.created_at > ISNULL(lm.created_at, '1900-01-01')
  AND m.sender_id != p.user_id
  AND (p.left_at IS NULL OR m.created_at <= p.left_at)
  AND m.created_at >= ISNULL(p.joined_at, '1900-01-01'); -- Tránh lỗi nếu joined_at bị NULL
GO


-- =====================================================
-- VIEW: vw_CountUnreadMessages
-- =====================================================
CREATE OR ALTER VIEW vw_CountUnreadMessages AS
SELECT 
    user_id,
    conversation_id,
    COUNT(message_id) AS unread_count
FROM vw_GetUnreadMessages
GROUP BY user_id, conversation_id;
GO


-- =====================================================
-- VIEW: vw_GetHomeMessagesMedia
-- =====================================================
CREATE OR ALTER VIEW vw_GetHomeMessagesMedia AS
SELECT 
    id AS message_id,
    conversation_id,
    sender_id,
    message_type,
    file_url,
    file_size,
    file_name,
    thumbnail_url,
    has_link,
    created_at
FROM messages
WHERE message_type IN ('image', 'file', 'video')
   OR (message_type = 'text' AND has_link = 1);
GO


-- =====================================================
-- VIEW: vw_GetFriendRequests
-- =====================================================
CREATE OR ALTER VIEW vw_GetFriendRequests AS
SELECT 
    fr.id,
    fr.sender_id,
    fr.receiver_id,
    fr.status,
    fr.created_at,
    u.full_name AS sender_name,
    u.avatar_url AS sender_avatar
FROM friendrequests fr
JOIN users u ON fr.sender_id = u.id
WHERE fr.status = 'pending';
GO


-- =====================================================
-- VIEW: vw_GetSentFriendRequests
-- =====================================================
CREATE OR ALTER VIEW vw_GetSentFriendRequests AS
SELECT 
    fr.id,
    fr.sender_id,
    fr.receiver_id,
    fr.status,
    fr.created_at,
    u.full_name AS receiver_name,
    u.avatar_url AS receiver_avatar
FROM friendrequests fr
JOIN users u ON fr.receiver_id = u.id;
GO


-- =====================================================
-- VIEW: vw_GetFriends
-- =====================================================
CREATE OR ALTER VIEW vw_GetFriends AS
SELECT 
    f.user_id,
    f.friend_id,
    f.notes,
    f.is_favorite,
    f.friendship_date,
    u.full_name AS friend_name,
    u.avatar_url AS friend_avatar,
    u.status AS friend_status
FROM friends f
JOIN users u ON f.friend_id = u.id;
GO


-- =====================================================
-- VIEW: vw_GetMessageReactions
-- =====================================================
CREATE OR ALTER VIEW vw_GetMessageReactions AS
SELECT 
    mr.id AS reaction_id,
    mr.conversation_id,
    mr.message_id,
    mr.user_id,
    mr.emoji_char,
    mr.created_at,
    u.full_name AS user_name,
    u.avatar_url AS user_avatar
FROM message_reactions mr
JOIN users u ON mr.user_id = u.id;
GO


-- =====================================================
-- VIEW: vw_GetPinnedMessages
-- =====================================================
CREATE OR ALTER VIEW vw_GetPinnedMessages AS
SELECT 
    pm.id,
    pm.conversation_id,
    pm.message_id,
    pm.pinned_by,
    pm.pinned_at,
    m.sender_id,
    m.message_type,
    m.content,
    m.created_at AS message_created_at,
    u1.full_name AS pinned_by_name,
    u2.full_name AS sender_name
FROM pinnedmessages pm
JOIN messages m ON pm.message_id = m.id
LEFT JOIN users u1 ON pm.pinned_by = u1.id
LEFT JOIN users u2 ON m.sender_id = u2.id;
GO


-- =====================================================
-- VIEW: vw_GetParticipants
-- =====================================================
CREATE OR ALTER VIEW vw_GetParticipants AS
SELECT 
    p.id,
    p.conversation_id,
    p.user_id,
    p.role,
    p.joined_at,
    p.nick_name,
    p.is_muted,
    p.last_read_message_id,
    p.left_at,
    p.is_pinned,
    u.full_name,
    u.avatar_url,
    u.status AS user_status,
    u.last_online_at
FROM participants p
JOIN users u ON p.user_id = u.id;
GO

-- =====================================================
-- VIEW: vw_GetBlockedUsers
-- =====================================================
CREATE OR ALTER VIEW vw_GetBlockedUsers AS
SELECT 
    ub.id,
    ub.blocker_id,
    ub.blocked_id,
    ub.created_at,
    u1.full_name AS blocker_name,
    u1.avatar_url AS blocker_avatar,
    u2.full_name AS blocked_name,
    u2.avatar_url AS blocked_avatar
FROM userblocks ub
LEFT JOIN users u1 ON ub.blocker_id = u1.id
LEFT JOIN users u2 ON ub.blocked_id = u2.id;
GO


-- =====================================================
-- VIEW: vw_SearchUsersAndGroups
-- =====================================================
CREATE OR ALTER VIEW vw_SearchUsersAndGroups AS
SELECT 
    id,
    full_name AS name,
    email,
    avatar_url,
    status,
    'user' AS result_type
FROM users
WHERE is_active = 1 AND public_key IS NOT NULL

UNION ALL

SELECT 
    id,
    name,
    NULL AS email,
    avatar_url,
    'online' AS status,
    'group' AS result_type
FROM conversations
WHERE conversation_type = 'group' AND is_active = 1;
GO


-- =====================================================
-- VIEW: vw_GetUsersByIds
-- =====================================================
CREATE OR ALTER VIEW vw_GetUsersByIds AS
SELECT 
    id,
    email,
    full_name,
    avatar_url,
    bio,
    phone_number,
    status,
    is_active,
    created_at,
    updated_at,
    public_key
FROM users;
GO


-- =====================================================
-- VIEW: vw_GetMessagesWithSender
-- =====================================================
CREATE OR ALTER VIEW vw_GetMessagesWithSender AS
SELECT 
    m.id AS message_id,
    m.conversation_id,
    m.sender_id,
    m.message_type,
    m.content,
    m.file_url,
    m.file_size,
    m.file_name,
    m.thumbnail_url,
    m.link_description,
    m.duration,
    m.call_id,
    m.has_link,
    m.is_edited,
    m.is_deleted,
    m.deleted_for_all,
    m.parent_message_id,
    m.created_at,
    m.updated_at,
    m.is_e2ee,
    m.key_version,
    m.iv,
    u.full_name AS sender_name,
    u.avatar_url AS sender_avatar,
    u.status AS sender_status,
    c.call_type,
    c.media_type,
    c.status AS call_status,
    c.started_at,
    c.ended_at,
    c.duration_seconds
FROM messages m
JOIN users u ON m.sender_id = u.id
LEFT JOIN calls c ON m.call_id = c.id;
GO


-- =====================================================
-- VIEW: vw_GetMessagesWithCalls
-- =====================================================
CREATE OR ALTER VIEW vw_GetMessagesWithCalls AS
SELECT 
    m.id AS message_id,
    m.conversation_id,
    m.sender_id,
    m.message_type,
    m.content,
    m.created_at,
    m.call_id,
    c.call_type,
    c.media_type,
    c.status AS call_status,
    c.started_at,
    c.ended_at,
    c.duration_seconds
FROM messages m
LEFT JOIN calls c ON m.call_id = c.id
WHERE m.message_type = 'call';
GO


-- =====================================================
-- VIEW: vw_GetConversationsWithLastMessage
-- =====================================================
CREATE OR ALTER VIEW vw_GetConversationsWithLastMessage AS 
SELECT 
    c.id AS conversation_id,
    c.conversation_type,
    c.name AS conversation_name,
    c.avatar_url AS conversation_avatar,
    c.last_message_id,
    c.last_message_at,
    m.content AS last_message_content,
    m.message_type AS last_message_type,
    m.sender_id AS last_message_sender_id,
    u.full_name AS last_message_sender_name
FROM conversations c
LEFT JOIN messages m ON c.last_message_id = m.id
LEFT JOIN users u ON m.sender_id = u.id
WHERE c.is_active = 1;
GO
