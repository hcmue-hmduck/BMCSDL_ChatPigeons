USE ChatPigeons;
GO

-- TRIGGER TỰ ĐỘNG CẬP NHẬT updated_at

CREATE TRIGGER trg_UpdateUsersUpdatedAt ON users AFTER UPDATE AS
BEGIN
    UPDATE users SET updated_at = SYSDATETIMEOFFSET() FROM users INNER JOIN inserted i ON users.id = i.id;
END;
GO

CREATE TRIGGER trg_UpdateConversationsUpdatedAt ON conversations AFTER UPDATE AS
BEGIN
    UPDATE conversations SET updated_at = SYSDATETIMEOFFSET() FROM conversations INNER JOIN inserted i ON conversations.id = i.id;
END;
GO

CREATE TRIGGER trg_UpdateParticipantsUpdatedAt ON participants AFTER UPDATE AS
BEGIN
    UPDATE participants SET updated_at = SYSDATETIMEOFFSET() FROM participants INNER JOIN inserted i ON participants.id = i.id;
END;
GO

CREATE TRIGGER trg_UpdateMessagesUpdatedAt ON messages AFTER UPDATE AS
BEGIN
    UPDATE messages SET updated_at = SYSDATETIMEOFFSET() FROM messages INNER JOIN inserted i ON messages.id = i.id;
END;
GO

CREATE TRIGGER trg_UpdateFriendRequestsUpdatedAt ON friendrequests AFTER UPDATE AS
BEGIN
    UPDATE friendrequests SET updated_at = SYSDATETIMEOFFSET() FROM friendrequests INNER JOIN inserted i ON friendrequests.id = i.id;
END;
GO

CREATE TRIGGER trg_UpdateFriendsUpdatedAt ON friends AFTER UPDATE AS
BEGIN
    UPDATE friends SET updated_at = SYSDATETIMEOFFSET() FROM friends INNER JOIN inserted i ON friends.id = i.id;
END;
GO

CREATE TRIGGER trg_UpdateVaultUpdatedAt ON conversationkeysvault AFTER UPDATE AS
BEGIN
    UPDATE conversationkeysvault SET updated_at = SYSDATETIMEOFFSET() FROM conversationkeysvault INNER JOIN inserted i ON conversationkeysvault.id = i.id;
END;
GO

CREATE TRIGGER trg_UpdateCallsUpdatedAt ON calls AFTER UPDATE AS
BEGIN
    UPDATE calls SET updated_at = SYSDATETIMEOFFSET() FROM calls INNER JOIN inserted i ON calls.id = i.id;
END;
GO

CREATE TRIGGER trg_UpdatePinnedMessagesUpdatedAt ON pinnedmessages AFTER UPDATE AS
BEGIN
    UPDATE pinnedmessages SET updated_at = SYSDATETIMEOFFSET() FROM pinnedmessages INNER JOIN inserted i ON pinnedmessages.id = i.id;
END;
GO

CREATE TRIGGER trg_UpdateGroupJoinRequestsUpdatedAt ON GroupJoinRequests AFTER UPDATE AS
BEGIN
    UPDATE GroupJoinRequests SET updated_at = SYSDATETIMEOFFSET() FROM GroupJoinRequests INNER JOIN inserted i ON GroupJoinRequests.id = i.id;
END;
GO

CREATE TRIGGER trg_UpdateUserBlocksUpdatedAt ON userblocks AFTER UPDATE AS
BEGIN
    UPDATE userblocks SET updated_at = SYSDATETIMEOFFSET() FROM userblocks INNER JOIN inserted i ON userblocks.id = i.id;
END;
GO

CREATE TRIGGER trg_UpdateMessageReactionsUpdatedAt ON message_reactions AFTER UPDATE AS
BEGIN
    UPDATE message_reactions SET updated_at = SYSDATETIMEOFFSET() FROM message_reactions INNER JOIN inserted i ON message_reactions.id = i.id;
END;
GO
