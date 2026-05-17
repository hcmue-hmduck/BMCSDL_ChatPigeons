USE ChatPigeons;
GO

-- =====================================================
-- STORED PROCEDURE: sp_RegisterUser
-- =====================================================
CREATE OR ALTER PROCEDURE sp_RegisterUser
    @Email VARCHAR(100),
    @PasswordHash VARCHAR(250) = NULL,
    @FullName NVARCHAR(250) = NULL,
    @IsEmailVerified BIT = 0
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @NewUserId UNIQUEIDENTIFIER = NEWID();

    INSERT INTO users (id, email, password_hash, full_name, is_email_verified, status, role, is_active)
    VALUES (@NewUserId, @Email, @PasswordHash, @FullName, @IsEmailVerified, 'offline', 'user', 1);

    SELECT @NewUserId AS NewUserId;
END
GO

-- =====================================================
-- STORED PROCEDURE: sp_SetPassword
-- =====================================================
CREATE OR ALTER PROCEDURE sp_SetPassword
    @UserId UNIQUEIDENTIFIER,
    @PasswordHash VARCHAR(250)
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE users
    SET password_hash = @PasswordHash,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @UserId;

    IF @@ROWCOUNT = 0
    BEGIN
        RAISERROR(N'Không tìm thấy người dùng.', 16, 1);
    END
END
GO

-- =====================================================
-- STORED PROCEDURE: sp_UpdateProfile
-- =====================================================
CREATE OR ALTER PROCEDURE sp_UpdateProfile
    @UserId UNIQUEIDENTIFIER,
    @FullName NVARCHAR(250) = NULL,
    @Bio NVARCHAR(500) = NULL,
    @AvatarUrl VARCHAR(500) = NULL,
    @PhoneNumber VARCHAR(20) = NULL,
    @Birthday DATE = NULL,
    @Gender VARCHAR(10) = NULL,
    @Status VARCHAR(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE users
    SET full_name = @FullName,
        bio = @Bio,
        avatar_url = @AvatarUrl,
        phone_number = @PhoneNumber,
        birthday = @Birthday,
        gender = @Gender,
        status = @Status,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @UserId;
END
GO

-- =====================================================
-- STORED PROCEDURE: sp_SendMessage
-- =====================================================
-- LƯU Ý: Người chặn gửi tin nhắn cho người bị chặn được, còn ngược lại thì không 
CREATE OR ALTER PROCEDURE sp_SendMessage
    @ConversationId UNIQUEIDENTIFIER,
    @SenderId UNIQUEIDENTIFIER,
    @MessageType VARCHAR(20),
    @Content NVARCHAR(MAX),
    @IsE2EE BIT = 0,
    @KeyVersion INT = NULL,
    @Iv VARCHAR(64) = NULL,
    @ParentMessageId UNIQUEIDENTIFIER = NULL,
    @FileUrl VARCHAR(500) = NULL,
    @FileName NVARCHAR(250) = NULL,
    @FileSize INT = NULL,
    @ThumbnailUrl VARCHAR(500) = NULL,
    @Duration INT = NULL,
    @LinkDescription NVARCHAR(500) = NULL,
    @HasLink BIT = 0
AS
BEGIN
    SET NOCOUNT ON;

    -- Kiểm tra loại cuộc trò chuyện
    DECLARE @ConvType VARCHAR(20);
    SELECT @ConvType = conversation_type FROM conversations WHERE id = @ConversationId;

    IF @ConvType = 'direct'
    BEGIN
        -- Tìm người nhận (người còn lại trong cuộc trò chuyện 1-1)
        DECLARE @ReceiverId UNIQUEIDENTIFIER;
        SELECT @ReceiverId = user_id 
        FROM participants 
        WHERE conversation_id = @ConversationId AND user_id <> @SenderId;

        -- Kiểm tra xem sender có bị receiver chặn không
        IF EXISTS (
            SELECT 1 
            FROM userblocks 
            WHERE blocker_id = @ReceiverId AND blocked_id = @SenderId
        )
        BEGIN
            RAISERROR(N'Bạn đã bị người dùng này chặn. Không thể gửi tin nhắn.', 16, 1);
            RETURN;
        END
    END

    -- Chèn tin nhắn mới
    DECLARE @NewMsgId UNIQUEIDENTIFIER = NEWID();

    INSERT INTO messages (id, conversation_id, sender_id, message_type, content, is_e2ee, key_version, iv, parent_message_id, created_at, file_url, file_name, file_size, thumbnail_url, duration, link_description, has_link)
    VALUES (@NewMsgId, @ConversationId, @SenderId, @MessageType, @Content, @IsE2EE, @KeyVersion, @Iv, @ParentMessageId, CURRENT_TIMESTAMP, @FileUrl, @FileName, @FileSize, @ThumbnailUrl, @Duration, @LinkDescription, @HasLink);

    -- Cập nhật last_message_id cho conversation
    UPDATE conversations 
    SET last_message_id = @NewMsgId, 
        last_message_at = CURRENT_TIMESTAMP 
    WHERE id = @ConversationId;

    -- Trả về ID tin nhắn mới
    SELECT @NewMsgId AS NewMessageId;
END
GO


-- =====================================================
-- STORED PROCEDURE: sp_EditMessage
-- =====================================================
CREATE OR ALTER PROCEDURE sp_EditMessage
    @MessageId UNIQUEIDENTIFIER,
    @SenderId UNIQUEIDENTIFIER,
    @Content NVARCHAR(MAX),
    @Iv VARCHAR(250) = NULL,
    @KeyVersion INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE messages
    SET content = @Content,
        iv = ISNULL(@Iv, iv),
        key_version = ISNULL(@KeyVersion, key_version),
        is_edited = 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @MessageId AND sender_id = @SenderId;

    -- Kiểm tra xem có dòng nào được cập nhật không
    IF @@ROWCOUNT = 0
    BEGIN
        RAISERROR(N'Không thể sửa tin nhắn. Tin nhắn không tồn tại hoặc bạn không phải là người gửi.', 16, 1);
    END
END


GO

-- =====================================================
-- STORED PROCEDURE: sp_RevokeMessage
-- =====================================================
CREATE OR ALTER PROCEDURE sp_RevokeMessage
    @MessageId UNIQUEIDENTIFIER,
    @SenderId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE messages
    SET is_deleted = 1,
        deleted_for_all = 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @MessageId AND sender_id = @SenderId;

    -- Kiểm tra xem có dòng nào được cập nhật không
    IF @@ROWCOUNT = 0
    BEGIN
        RAISERROR(N'Không thể thu hồi tin nhắn. Tin nhắn không tồn tại hoặc bạn không phải là người gửi.', 16, 1);
    END
END

GO

-- =====================================================
-- STORED PROCEDURE: sp_CreateGroupConversation
-- =====================================================
CREATE OR ALTER PROCEDURE sp_CreateGroupConversation
    @GroupName NVARCHAR(255),
    @CreatorId UNIQUEIDENTIFIER,
    @AvatarUrl VARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @NewConvId UNIQUEIDENTIFIER = NEWID();

    -- 1. Tạo cuộc trò chuyện mới
    INSERT INTO conversations (id, conversation_type, name, avatar_url, created_by, is_active)
    VALUES (@NewConvId, 'group', @GroupName, @AvatarUrl, @CreatorId, 1);

    -- 2. Thêm người tạo làm owner trong bảng participants
    INSERT INTO participants (conversation_id, user_id, role)
    VALUES (@NewConvId, @CreatorId, 'owner');

    -- Trả về ID của cuộc trò chuyện vừa tạo
    SELECT @NewConvId AS NewConversationId;
END

GO

-- =====================================================
-- STORED PROCEDURE: sp_AddGroupMember
-- =====================================================
CREATE OR ALTER PROCEDURE sp_AddGroupMember
    @ConversationId UNIQUEIDENTIFIER,
    @NewMemberId UNIQUEIDENTIFIER,
    @InviterId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    -- 1. Kiểm tra quyền của người mời
    DECLARE @InviterRole VARCHAR(20);
    SELECT @InviterRole = role 
    FROM participants 
    WHERE conversation_id = @ConversationId AND user_id = @InviterId;

    IF @InviterRole IS NULL OR @InviterRole NOT IN ('owner', 'admin')
    BEGIN
        RAISERROR(N'Chỉ Trưởng nhóm hoặc Phó nhóm mới có quyền thêm thành viên vào nhóm này.', 16, 1);
        RETURN;
    END

    -- 2. Kiểm tra xem user mới đã là thành viên chưa (và đang hoạt động)
    IF EXISTS (
        SELECT 1 
        FROM participants 
        WHERE conversation_id = @ConversationId AND user_id = @NewMemberId AND left_at IS NULL
    )
    BEGIN
        RAISERROR(N'Người dùng này đã là thành viên của nhóm.', 16, 1);
        RETURN;
    END

    -- 3. Thêm thành viên mới hoặc tái kích hoạt
    IF EXISTS (
        SELECT 1 
        FROM participants 
        WHERE conversation_id = @ConversationId AND user_id = @NewMemberId AND left_at IS NOT NULL
    )
    BEGIN
        UPDATE participants
        SET left_at = NULL,
            role = 'member',
            joined_at = CURRENT_TIMESTAMP
        WHERE conversation_id = @ConversationId AND user_id = @NewMemberId;
    END
    ELSE
    BEGIN
        INSERT INTO participants (conversation_id, user_id, role)
        VALUES (@ConversationId, @NewMemberId, 'member');
    END

    -- 4. Cập nhật key_status = 'require_rotation' cho conversation
    UPDATE conversations
    SET key_status = 'require_rotation'
    WHERE id = @ConversationId;
END

GO


-- =====================================================
-- STORED PROCEDURE: sp_KickGroupMember
-- =====================================================
CREATE OR ALTER PROCEDURE sp_KickGroupMember
    @ConversationId UNIQUEIDENTIFIER,
    @MemberId UNIQUEIDENTIFIER,
    @KickerId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    -- 1. Lấy quyền của người kích và người bị kích
    DECLARE @KickerRole VARCHAR(20);
    DECLARE @TargetRole VARCHAR(20);

    SELECT @KickerRole = role FROM participants WHERE conversation_id = @ConversationId AND user_id = @KickerId;
    SELECT @TargetRole = role FROM participants WHERE conversation_id = @ConversationId AND user_id = @MemberId;

    -- Kiểm tra tồn tại
    IF @KickerRole IS NULL
    BEGIN
        RAISERROR(N'Bạn không phải là thành viên của nhóm này.', 16, 1);
        RETURN;
    END

    IF @TargetRole IS NULL
    BEGIN
        RAISERROR(N'Người dùng này không có trong nhóm.', 16, 1);
        RETURN;
    END

    -- 2. Kiểm tra quyền
    -- Kicker phải là owner hoặc admin
    IF @KickerRole NOT IN ('owner', 'admin')
    BEGIN
        RAISERROR(N'Bạn không có quyền xóa thành viên. Chỉ Admin hoặc Owner mới có quyền.', 16, 1);
        RETURN;
    END

    -- Admin không thể kích Owner hoặc Admin khác
    IF @KickerRole = 'admin' AND @TargetRole IN ('owner', 'admin')
    BEGIN
        RAISERROR(N'Admin không thể xóa Admin khác hoặc Owner.', 16, 1);
        RETURN;
    END

    -- Owner không thể tự kích mình
    IF @KickerId = @MemberId AND @KickerRole = 'owner'
    BEGIN
        RAISERROR(N'Chủ nhóm không thể tự xóa mình.', 16, 1);
        RETURN;
    END

    -- 3. Xóa thành viên (Xóa mềm)
    UPDATE participants 
    SET left_at = CURRENT_TIMESTAMP
    WHERE conversation_id = @ConversationId AND user_id = @MemberId;

    -- 4. Cập nhật key_status = 'require_rotation' cho conversation
    UPDATE conversations
    SET key_status = 'require_rotation'
    WHERE id = @ConversationId;
END

GO

-- =====================================================
-- STORED PROCEDURE: sp_ChangeMemberRole
-- =====================================================
CREATE OR ALTER PROCEDURE sp_ChangeMemberRole
    @ConversationId UNIQUEIDENTIFIER,
    @MemberId UNIQUEIDENTIFIER,
    @NewRole VARCHAR(20),
    @ChangerId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    -- 1. Kiểm tra quyền của người đổi (Changer)
    DECLARE @ChangerRole VARCHAR(20);
    SELECT @ChangerRole = role 
    FROM participants 
    WHERE conversation_id = @ConversationId AND user_id = @ChangerId;

    IF @ChangerRole IS NULL OR @ChangerRole <> 'owner'
    BEGIN
        RAISERROR(N'Chỉ có Trưởng nhóm (Owner) mới có quyền thăng cấp hoặc giáng cấp thành viên.', 16, 1);
        RETURN;
    END

    -- 2. Kiểm tra xem người bị đổi có trong nhóm không
    IF NOT EXISTS (
        SELECT 1 
        FROM participants 
        WHERE conversation_id = @ConversationId AND user_id = @MemberId
    )
    BEGIN
        RAISERROR(N'Người dùng này không phải là thành viên của nhóm.', 16, 1);
        RETURN;
    END

    -- 3. Kiểm tra giá trị role mới hợp lệ
    IF @NewRole NOT IN ('admin', 'member', 'owner')
    BEGIN
        RAISERROR(N'Vai trò mới không hợp lệ. Chỉ có thể là ''admin'', ''member'' hoặc ''owner''.', 16, 1);
        RETURN;
    END

    -- 4. Nếu là chuyển quyền sở hữu (owner)
    IF @NewRole = 'owner'
    BEGIN
        -- Đổi vai trò của người hiện tại (Changer) thành 'admin'
        UPDATE participants
        SET role = 'admin'
        WHERE conversation_id = @ConversationId AND user_id = @ChangerId;
        
        -- Đổi vai trò của người mới thành 'owner'
        UPDATE participants
        SET role = 'owner'
        WHERE conversation_id = @ConversationId AND user_id = @MemberId;
    END
    ELSE
    BEGIN
        -- Cập nhật role bình thường
        UPDATE participants
        SET role = @NewRole
        WHERE conversation_id = @ConversationId AND user_id = @MemberId;
    END
END

GO

-- =====================================================
-- STORED PROCEDURE: sp_PinMessage
-- =====================================================
CREATE OR ALTER PROCEDURE sp_PinMessage
    @MessageId UNIQUEIDENTIFIER,
    @ConversationId UNIQUEIDENTIFIER,
    @PinnedBy UNIQUEIDENTIFIER,
    @Note NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- 1. Kiểm tra xem user có trong cuộc trò chuyện không
    DECLARE @UserRole VARCHAR(20);
    SELECT @UserRole = role FROM participants WHERE conversation_id = @ConversationId AND user_id = @PinnedBy;

    IF @UserRole IS NULL
    BEGIN
        RAISERROR(N'Bạn không phải là thành viên của cuộc trò chuyện này.', 16, 1);
        RETURN;
    END

    -- 2. Kiểm tra xem tin nhắn có thuộc cuộc trò chuyện này không
    IF NOT EXISTS (
        SELECT 1 
        FROM messages 
        WHERE id = @MessageId AND conversation_id = @ConversationId
    )
    BEGIN
        RAISERROR(N'Tin nhắn không tồn tại hoặc không thuộc cuộc trò chuyện này.', 16, 1);
        RETURN;
    END

    -- 3. Kiểm tra xem tin nhắn đã được ghim chưa
    IF EXISTS (
        SELECT 1 
        FROM pinnedmessages 
        WHERE message_id = @MessageId AND conversation_id = @ConversationId
    )
    BEGIN
        RAISERROR(N'Tin nhắn này đã được ghim rồi.', 16, 1);
        RETURN;
    END

    -- 4. Ghim tin nhắn
    INSERT INTO pinnedmessages (message_id, conversation_id, pinned_by, note)
    VALUES (@MessageId, @ConversationId, @PinnedBy, @Note);
END

GO

-- =====================================================
-- STORED PROCEDURE: sp_UnpinMessage
-- =====================================================
CREATE OR ALTER PROCEDURE sp_UnpinMessage
    @Id UNIQUEIDENTIFIER = NULL,
    @MessageId UNIQUEIDENTIFIER = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF @Id IS NOT NULL
    BEGIN
        DELETE FROM pinnedmessages
        WHERE id = @Id;
    END
    ELSE IF @MessageId IS NOT NULL
    BEGIN
        DELETE FROM pinnedmessages
        WHERE message_id = @MessageId;
    END
    ELSE
    BEGIN
        RAISERROR(N'Thiếu tham số để bỏ ghim.', 16, 1);
    END
END

GO



-- =====================================================
-- STORED PROCEDURE: sp_BlockUser
-- =====================================================
CREATE OR ALTER PROCEDURE sp_BlockUser
    @BlockerId UNIQUEIDENTIFIER,
    @BlockedId UNIQUEIDENTIFIER,
    @Reason NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- 1. Kiểm tra tự chặn chính mình
    IF @BlockerId = @BlockedId
    BEGIN
        RAISERROR(N'Bạn không thể tự chặn chính mình.', 16, 1);
        RETURN;
    END

    -- 2. Kiểm tra xem đã chặn chưa
    IF EXISTS (
        SELECT 1 
        FROM userblocks 
        WHERE blocker_id = @BlockerId AND blocked_id = @BlockedId
    )
    BEGIN
        RAISERROR(N'Bạn đã chặn người dùng này rồi.', 16, 1);
        RETURN;
    END

    -- 3. Xóa quan hệ bạn bè nếu có
    DELETE FROM friends 
    WHERE (user_id = @BlockerId AND friend_id = @BlockedId)
       OR (user_id = @BlockedId AND friend_id = @BlockerId);

    -- 4. Xóa lời mời kết bạn nếu có
    DELETE FROM friendrequests
    WHERE (sender_id = @BlockerId AND receiver_id = @BlockedId)
       OR (sender_id = @BlockedId AND receiver_id = @BlockerId);

    -- 5. Thêm bản ghi chặn
    INSERT INTO userblocks (blocker_id, blocked_id, reason)
    VALUES (@BlockerId, @BlockedId, @Reason);
END

GO


-- =====================================================
-- STORED PROCEDURE: sp_CreateDirectConversation
-- =====================================================
CREATE OR ALTER PROCEDURE sp_CreateDirectConversation
    @User1Id UNIQUEIDENTIFIER,
    @User2Id UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    -- 1. Kiểm tra xem đã có cuộc trò chuyện 1-1 giữa 2 người này chưa
    DECLARE @ExistingConvId UNIQUEIDENTIFIER;

    SELECT TOP 1 @ExistingConvId = p.conversation_id 
    FROM participants p
    JOIN conversations c ON p.conversation_id = c.id
    WHERE c.conversation_type = 'direct'
      AND p.user_id IN (@User1Id, @User2Id)
    GROUP BY p.conversation_id
    HAVING COUNT(DISTINCT p.user_id) = 2;

    -- Nếu đã có, trả về ID cũ và không tạo mới
    IF @ExistingConvId IS NOT NULL
    BEGIN
        SELECT @ExistingConvId AS NewConversationId;
        RETURN;
    END

    -- 2. Nếu chưa có, tạo mới
    DECLARE @NewConvId UNIQUEIDENTIFIER = NEWID();

    INSERT INTO conversations (id, conversation_type, created_by, is_active)
    VALUES (@NewConvId, 'direct', @User1Id, 1);

    -- Thêm 2 bản ghi vào bảng participants
    INSERT INTO participants (conversation_id, user_id, role)
    VALUES 
    (@NewConvId, @User1Id, 'member'),
    (@NewConvId, @User2Id, 'member');

    -- Trả về ID của cuộc trò chuyện vừa tạo
    SELECT @NewConvId AS NewConversationId;
END

GO

-- =====================================================
-- STORED PROCEDURE: sp_UpdateConversation
-- =====================================================
CREATE OR ALTER PROCEDURE sp_UpdateConversation
    @ConversationId UNIQUEIDENTIFIER,
    @Name NVARCHAR(255) = NULL,
    @AvatarUrl VARCHAR(500) = NULL,
    @LastMessageId UNIQUEIDENTIFIER = NULL
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE conversations
    SET name = ISNULL(@Name, name),
        avatar_url = ISNULL(@AvatarUrl, avatar_url),
        last_message_id = ISNULL(@LastMessageId, last_message_id),
        last_message_at = CASE WHEN @LastMessageId IS NOT NULL THEN CURRENT_TIMESTAMP ELSE last_message_at END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @ConversationId;

    -- Kiểm tra xem có dòng nào được cập nhật không
    IF @@ROWCOUNT = 0
    BEGIN
        RAISERROR(N'Không tìm thấy cuộc trò chuyện.', 16, 1);
    END
END
GO

-- =====================================================
-- STORED PROCEDURE: sp_CreateParticipant
-- =====================================================
CREATE OR ALTER PROCEDURE sp_CreateParticipant
    @ConversationId UNIQUEIDENTIFIER,
    @UserId UNIQUEIDENTIFIER,
    @Role VARCHAR(20) = 'member'
AS
BEGIN
    SET NOCOUNT ON;

    -- Kiểm tra xem đang là thành viên hay không
    IF EXISTS (
        SELECT 1 
        FROM participants 
        WHERE conversation_id = @ConversationId AND user_id = @UserId AND left_at IS NULL
    )
    BEGIN
        RAISERROR(N'Người dùng này đang là thành viên của cuộc trò chuyện.', 16, 1);
        RETURN;
    END

    -- Nếu đã từng tham gia nhưng đã rời đi
    IF EXISTS (
        SELECT 1 
        FROM participants 
        WHERE conversation_id = @ConversationId AND user_id = @UserId AND left_at IS NOT NULL
    )
    BEGIN
        -- Tái kích hoạt
        UPDATE participants
        SET left_at = NULL,
            role = @Role,
            joined_at = CURRENT_TIMESTAMP
        WHERE conversation_id = @ConversationId AND user_id = @UserId;
    END
    ELSE
    BEGIN
        -- Thêm thành viên mới hoàn toàn
        INSERT INTO participants (conversation_id, user_id, role)
        VALUES (@ConversationId, @UserId, @Role);
    END
END

GO

-- =====================================================
-- STORED PROCEDURE: sp_CreateFriendRequest
-- =====================================================
CREATE OR ALTER PROCEDURE sp_CreateFriendRequest
    @SenderId UNIQUEIDENTIFIER,
    @ReceiverId UNIQUEIDENTIFIER,
    @Note NVARCHAR(250) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- 1. Kiểm tra tự gửi lời mời cho chính mình
    IF @SenderId = @ReceiverId
    BEGIN
        RAISERROR(N'Bạn không thể tự gửi lời mời kết bạn cho chính mình.', 16, 1);
        RETURN;
    END

    -- 2. Kiểm tra xem đã là bạn bè chưa
    IF EXISTS (
        SELECT 1 
        FROM friends 
        WHERE (user_id = @SenderId AND friend_id = @ReceiverId)
           OR (user_id = @ReceiverId AND friend_id = @SenderId)
    )
    BEGIN
        RAISERROR(N'Hai người đã là bạn bè rồi.', 16, 1);
        RETURN;
    END

    -- 3. Kiểm tra xem đã có request nào đang chờ (pending) chưa
    IF EXISTS (
        SELECT 1 
        FROM friendrequests 
        WHERE (sender_id = @SenderId AND receiver_id = @ReceiverId AND status = 'pending')
           OR (sender_id = @ReceiverId AND receiver_id = @SenderId AND status = 'pending')
    )
    BEGIN
        RAISERROR(N'Đã có lời mời kết bạn đang chờ xử lý giữa hai người.', 16, 1);
        RETURN;
    END

    -- 4. Thêm lời mời kết bạn mới hoặc cập nhật (Upsert)
    IF EXISTS (
        SELECT 1 
        FROM friendrequests 
        WHERE sender_id = @SenderId AND receiver_id = @ReceiverId
    )
    BEGIN
        UPDATE friendrequests
        SET status = 'pending',
            note = @Note,
            updated_at = CURRENT_TIMESTAMP
        WHERE sender_id = @SenderId AND receiver_id = @ReceiverId;
    END
    ELSE
    BEGIN
        INSERT INTO friendrequests (sender_id, receiver_id, status, note)
        VALUES (@SenderId, @ReceiverId, 'pending', @Note);
    END
END

GO

-- =====================================================
-- STORED PROCEDURE: sp_UpdateFriendRequestStatus
-- =====================================================
CREATE OR ALTER PROCEDURE sp_UpdateFriendRequestStatus
    @RequestId UNIQUEIDENTIFIER,
    @Status VARCHAR(20) -- 'accepted' hoặc 'declined'
AS
BEGIN
    SET NOCOUNT ON;

    -- 1. Lấy thông tin request
    DECLARE @SenderId UNIQUEIDENTIFIER;
    DECLARE @ReceiverId UNIQUEIDENTIFIER;
    DECLARE @CurrentStatus VARCHAR(20);

    SELECT @SenderId = sender_id, @ReceiverId = receiver_id, @CurrentStatus = status
    FROM friendrequests 
    WHERE id = @RequestId;

    -- Kiểm tra tồn tại và trạng thái
    IF @CurrentStatus IS NULL OR @CurrentStatus <> 'pending'
    BEGIN
        RAISERROR(N'Không tìm thấy lời mời kết bạn đang chờ xử lý.', 16, 1);
        RETURN;
    END

    -- 2. Cập nhật trạng thái
    UPDATE friendrequests
    SET status = @Status,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @RequestId;

    -- 3. Nếu là 'accepted', thêm vào bảng friends cho cả 2 phía
    IF @Status = 'accepted'
    BEGIN
        -- Thêm A là bạn của B
        IF NOT EXISTS (SELECT 1 FROM friends WHERE user_id = @SenderId AND friend_id = @ReceiverId)
        BEGIN
            INSERT INTO friends (user_id, friend_id) VALUES (@SenderId, @ReceiverId);
        END

        -- Thêm B là bạn của A
        IF NOT EXISTS (SELECT 1 FROM friends WHERE user_id = @ReceiverId AND friend_id = @SenderId)
        BEGIN
            INSERT INTO friends (user_id, friend_id) VALUES (@ReceiverId, @SenderId);
        END
    END
END

GO

-- =====================================================
-- STORED PROCEDURE: sp_DeleteFriend
-- =====================================================
CREATE OR ALTER PROCEDURE sp_DeleteFriend
    @UserId UNIQUEIDENTIFIER,
    @FriendId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    -- Xóa cả 2 chiều trong bảng friends
    DELETE FROM friends 
    WHERE (user_id = @UserId AND friend_id = @FriendId)
       OR (user_id = @FriendId AND friend_id = @UserId);
END

GO

-- =====================================================
-- STORED PROCEDURE: sp_AddMessageReaction
-- =====================================================
CREATE OR ALTER PROCEDURE sp_AddMessageReaction
    @MessageId UNIQUEIDENTIFIER,
    @UserId UNIQUEIDENTIFIER,
    @EmojiChar NVARCHAR(10)
AS
BEGIN
    SET NOCOUNT ON;

    -- 1. Kiểm tra xem tin nhắn có tồn tại không và lấy conversation_id
    DECLARE @ConversationId UNIQUEIDENTIFIER;
    SELECT @ConversationId = conversation_id FROM messages WHERE id = @MessageId;

    IF @ConversationId IS NULL
    BEGIN
        RAISERROR(N'Tin nhắn không tồn tại.', 16, 1);
        RETURN;
    END

    -- 2. Kiểm tra xem user có trong cuộc trò chuyện đó không
    IF NOT EXISTS (
        SELECT 1 
        FROM participants 
        WHERE conversation_id = @ConversationId AND user_id = @UserId
    )
    BEGIN
        RAISERROR(N'Bạn không phải là thành viên của cuộc trò chuyện này.', 16, 1);
        RETURN;
    END

    -- 3. Kiểm tra xem đã thả emoji này cho tin nhắn này chưa
    IF EXISTS (
        SELECT 1 
        FROM message_reactions 
        WHERE message_id = @MessageId AND user_id = @UserId AND emoji_char = @EmojiChar
    )
    BEGIN
        -- Đã thả rồi thì không làm gì cả
        RETURN;
    END

    -- 4. Thêm reaction mới
    INSERT INTO message_reactions (conversation_id, message_id, user_id, emoji_char)
    VALUES (@ConversationId, @MessageId, @UserId, @EmojiChar);
END

GO

-- =====================================================
-- STORED PROCEDURE: sp_RemoveMessageReaction
-- =====================================================
CREATE OR ALTER PROCEDURE sp_RemoveMessageReaction
    @Id UNIQUEIDENTIFIER = NULL,
    @MessageId UNIQUEIDENTIFIER = NULL,
    @UserId UNIQUEIDENTIFIER = NULL,
    @EmojiChar NVARCHAR(10) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF @Id IS NOT NULL
    BEGIN
        DELETE FROM message_reactions
        WHERE id = @Id;
    END
    ELSE IF @MessageId IS NOT NULL AND @UserId IS NOT NULL
    BEGIN
        IF @EmojiChar IS NOT NULL
        BEGIN
            DELETE FROM message_reactions
            WHERE message_id = @MessageId AND user_id = @UserId AND emoji_char = @EmojiChar;
        END
        ELSE
        BEGIN
            DELETE FROM message_reactions
            WHERE message_id = @MessageId AND user_id = @UserId;
        END
    END
    ELSE
    BEGIN
        RAISERROR(N'Thiếu tham số để xóa cảm xúc.', 16, 1);
    END
END

GO

-- =====================================================
-- STORED PROCEDURE: sp_UpdateParticipant
-- =====================================================
CREATE OR ALTER PROCEDURE sp_UpdateParticipant
    @ParticipantId UNIQUEIDENTIFIER,
    @NickName NVARCHAR(255) = NULL,
    @IsMuted BIT = NULL,
    @IsPinned BIT = NULL,
    @LastReadMessageId UNIQUEIDENTIFIER = NULL
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE participants
    SET nick_name = ISNULL(@NickName, nick_name),
        is_muted = ISNULL(@IsMuted, is_muted),
        is_pinned = ISNULL(@IsPinned, is_pinned),
        last_read_message_id = ISNULL(@LastReadMessageId, last_read_message_id)
    WHERE id = @ParticipantId;

    -- Kiểm tra xem có dòng nào được cập nhật không
    IF @@ROWCOUNT = 0
    BEGIN
        RAISERROR(N'Không tìm thấy thành viên trong cuộc trò chuyện.', 16, 1);
    END
END

GO

-- =====================================================
-- STORED PROCEDURE: sp_UnblockUser
-- =====================================================
CREATE OR ALTER PROCEDURE sp_UnblockUser
    @Id UNIQUEIDENTIFIER = NULL,
    @BlockerId UNIQUEIDENTIFIER = NULL,
    @BlockedId UNIQUEIDENTIFIER = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF @Id IS NOT NULL
    BEGIN
        DELETE FROM userblocks
        WHERE id = @Id;
    END
    ELSE IF @BlockerId IS NOT NULL AND @BlockedId IS NOT NULL
    BEGIN
        DELETE FROM userblocks
        WHERE blocker_id = @BlockerId AND blocked_id = @BlockedId;
    END
    ELSE
    BEGIN
        RAISERROR(N'Thiếu tham số để bỏ chặn.', 16, 1);
    END
END

GO

-- =====================================================
-- STORED PROCEDURE: sp_UpdateUserStatus
-- =====================================================
CREATE OR ALTER PROCEDURE sp_UpdateUserStatus
    @UserId UNIQUEIDENTIFIER,
    @Status VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE users
    SET status = @Status,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @UserId;

    -- Kiểm tra xem có dòng nào được cập nhật không
    IF @@ROWCOUNT = 0
    BEGIN
        RAISERROR(N'Không tìm thấy người dùng.', 16, 1);
    END
END

GO

-- =====================================================
-- STORED PROCEDURE: sp_LeaveConversation
-- =====================================================
CREATE OR ALTER PROCEDURE sp_LeaveConversation
    @ConversationId UNIQUEIDENTIFIER,
    @UserId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    -- 1. Kiểm tra xem có trong nhóm không
    IF NOT EXISTS (
        SELECT 1 FROM participants 
        WHERE conversation_id = @ConversationId AND user_id = @UserId AND left_at IS NULL
    )
    BEGIN
        RAISERROR(N'Bạn không phải là thành viên của cuộc trò chuyện này.', 16, 1);
        RETURN;
    END

    -- 2. Đặt left_at
    UPDATE participants
    SET left_at = CURRENT_TIMESTAMP
    WHERE conversation_id = @ConversationId AND user_id = @UserId;

    -- 3. Cập nhật key_status = 'require_rotation'
    UPDATE conversations
    SET key_status = 'require_rotation'
    WHERE id = @ConversationId;
END
GO

-- =====================================================
-- STORED PROCEDURE: sp_UpdateKeyStatus
-- =====================================================
CREATE OR ALTER PROCEDURE sp_UpdateKeyStatus
    @ConversationId UNIQUEIDENTIFIER,
    @KeyStatus VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE conversations
    SET key_status = @KeyStatus
    WHERE id = @ConversationId;

    IF @@ROWCOUNT = 0
    BEGIN
        RAISERROR(N'Không tìm thấy cuộc trò chuyện.', 16, 1);
    END
END
GO

-- =====================================================
-- STORED PROCEDURE: sp_AddFriend
-- =====================================================
CREATE OR ALTER PROCEDURE sp_AddFriend
    @UserId UNIQUEIDENTIFIER,
    @FriendId UNIQUEIDENTIFIER,
    @IsFavorite BIT = 0,
    @Notes NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- Thêm A là bạn của B
    IF NOT EXISTS (SELECT 1 FROM friends WHERE user_id = @UserId AND friend_id = @FriendId)
    BEGIN
        INSERT INTO friends (user_id, friend_id, is_favorite, notes) 
        VALUES (@UserId, @FriendId, @IsFavorite, @Notes);
    END
    ELSE
    BEGIN
        UPDATE friends
        SET is_favorite = @IsFavorite,
            notes = @Notes
        WHERE user_id = @UserId AND friend_id = @FriendId;
    END

    -- Thêm B là bạn của A (ngược lại)
    IF NOT EXISTS (SELECT 1 FROM friends WHERE user_id = @FriendId AND friend_id = @UserId)
    BEGIN
        INSERT INTO friends (user_id, friend_id, is_favorite, notes) 
        VALUES (@FriendId, @UserId, @IsFavorite, @Notes);
    END
    ELSE
    BEGIN
        UPDATE friends
        SET is_favorite = @IsFavorite,
            notes = @Notes
        WHERE user_id = @FriendId AND friend_id = @UserId;
    END
END
GO

-- =====================================================
-- STORED PROCEDURE: sp_DeleteUser
-- =====================================================
CREATE OR ALTER PROCEDURE sp_DeleteUser
    @UserId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE users
    SET is_active = 0,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @UserId;

    IF @@ROWCOUNT = 0
    BEGIN
        RAISERROR(N'Không tìm thấy người dùng.', 16, 1);
    END
END
GO

-- =====================================================
-- STORED PROCEDURE: sp_SetupE2EEKeys
-- =====================================================
CREATE OR ALTER PROCEDURE sp_SetupE2EEKeys
    @UserId UNIQUEIDENTIFIER,
    @PublicKey VARCHAR(MAX),
    @WrappedPrivateKey VARCHAR(MAX),
    @KekIv VARCHAR(250),
    @PinSalt VARCHAR(250)
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE users
    SET public_key = @PublicKey,
        wrapped_private_key = @WrappedPrivateKey,
        kek_iv = @KekIv,
        pin_salt = @PinSalt,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @UserId;

    IF @@ROWCOUNT = 0
    BEGIN
        RAISERROR(N'Không tìm thấy người dùng.', 16, 1);
    END
END
GO

-- =====================================================
-- STORED PROCEDURE: sp_AddConversationKey
-- =====================================================
CREATE OR ALTER PROCEDURE sp_AddConversationKey
    @UserId UNIQUEIDENTIFIER,
    @ConversationId UNIQUEIDENTIFIER,
    @WrappedSharedKey VARCHAR(MAX),
    @KeyVersion INT
AS
BEGIN
    SET NOCOUNT ON;

    -- Kiểm tra version hợp lệ
    DECLARE @LatestKeyVersion INT = 0;
    SELECT TOP 1 @LatestKeyVersion = key_version 
    FROM conversationkeysvault 
    WHERE conversation_id = @ConversationId AND user_id = @UserId
    ORDER BY key_version DESC;

    SET @LatestKeyVersion = ISNULL(@LatestKeyVersion, 0);

    IF @KeyVersion <= @LatestKeyVersion
    BEGIN
        RAISERROR(N'Key version không hợp lệ. Phải lớn hơn version hiện tại.', 16, 1);
        RETURN;
    END

    -- Chèn khóa mới
    INSERT INTO conversationkeysvault (user_id, conversation_id, wrapped_shared_key, key_version)
    VALUES (@UserId, @ConversationId, @WrappedSharedKey, @KeyVersion);

    -- Cập nhật trạng thái phòng chat thành active
    UPDATE conversations
    SET key_status = 'active'
    WHERE id = @ConversationId;
END
GO

-- =====================================================
-- STORED PROCEDURE: sp_StartCall
-- =====================================================
CREATE OR ALTER PROCEDURE sp_StartCall
    @ConversationId UNIQUEIDENTIFIER,
    @CallerId UNIQUEIDENTIFIER,
    @CallType VARCHAR(20) = 'direct', -- 'direct' hoặc 'group'
    @MediaType VARCHAR(20) = 'video', -- 'video' hoặc 'audio'
    @Status VARCHAR(20) = 'pending' -- 'pending', 'ongoing',...
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @NewCallId UNIQUEIDENTIFIER = NEWID();

    INSERT INTO calls (id, conversation_id, caller_id, call_type, media_type, status, started_at)
    VALUES (@NewCallId, @ConversationId, @CallerId, @CallType, @MediaType, @Status, CURRENT_TIMESTAMP);

    -- Trả về ID của cuộc gọi vừa tạo
    SELECT @NewCallId AS NewCallId;
END

GO

-- =====================================================
-- STORED PROCEDURE: sp_UpdateCallStatus
-- =====================================================
CREATE OR ALTER PROCEDURE sp_UpdateCallStatus
    @CallId UNIQUEIDENTIFIER,
    @Status VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @CurrentTime DATETIME = CURRENT_TIMESTAMP;

    -- Nếu trạng thái là kết thúc (hoàn thành, nhỡ, từ chối, hủy)
    IF @Status IN ('completed', 'missed', 'declined', 'cancelled')
    BEGIN
        DECLARE @StartedAt DATETIME;
        SELECT @StartedAt = started_at FROM calls WHERE id = @CallId;

        UPDATE calls
        SET status = @Status,
            ended_at = @CurrentTime,
            duration_seconds = DATEDIFF(SECOND, @StartedAt, @CurrentTime),
            updated_at = @CurrentTime
        WHERE id = @CallId;
    END
    ELSE IF @Status = 'ongoing'
    BEGIN
        UPDATE calls
        SET status = @Status,
            started_at = @CurrentTime,
            updated_at = @CurrentTime
        WHERE id = @CallId;
    END
    ELSE
    BEGIN
        -- Các trạng thái khác
        UPDATE calls
        SET status = @Status,
            updated_at = @CurrentTime
        WHERE id = @CallId;
    END

    -- Kiểm tra xem có dòng nào được cập nhật không
    IF @@ROWCOUNT = 0
    BEGIN
        RAISERROR(N'Không tìm thấy cuộc gọi.', 16, 1);
    END
END

GO

-- =====================================================
-- STORED PROCEDURE: sp_InitCall
-- =====================================================
CREATE OR ALTER PROCEDURE sp_InitCall
    @ConversationId UNIQUEIDENTIFIER,
    @CallerId UNIQUEIDENTIFIER,
    @CallType VARCHAR(20),
    @MediaType VARCHAR(20),
    @Content NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRANSACTION;

    BEGIN TRY
        -- 1. Tạo cuộc gọi
        DECLARE @NewCallId UNIQUEIDENTIFIER = NEWID();
        INSERT INTO calls (id, conversation_id, caller_id, call_type, media_type, status, started_at)
        VALUES (@NewCallId, @ConversationId, @CallerId, @CallType, @MediaType, 'pending', CURRENT_TIMESTAMP);

        -- 2. Tạo tin nhắn thông báo
        DECLARE @NewMsgId UNIQUEIDENTIFIER = NEWID();
        INSERT INTO messages (id, conversation_id, sender_id, message_type, content, call_id, is_e2ee, created_at)
        VALUES (@NewMsgId, @ConversationId, @CallerId, 'call', @Content, @NewCallId, 0, CURRENT_TIMESTAMP);

        -- 3. Cập nhật conversation
        UPDATE conversations 
        SET last_message_id = @NewMsgId, 
            last_message_at = CURRENT_TIMESTAMP 
        WHERE id = @ConversationId;

        COMMIT TRANSACTION;

        -- Trả về ID tin nhắn và ID cuộc gọi
        SELECT @NewMsgId AS NewMessageId, @NewCallId AS NewCallId;
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO
-- =====================================================
-- STORED PROCEDURE: sp_UpdateFriendRequestStatus
-- =====================================================
CREATE OR ALTER PROCEDURE sp_UpdateFriendRequestStatus
    @Id UNIQUEIDENTIFIER,
    @Status VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE friendrequests
    SET status = @Status,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @Id;

    IF @@ROWCOUNT = 0
    BEGIN
        RAISERROR(N'Không tìm thấy lời mời kết bạn.', 16, 1);
    END
END
GO

-- =====================================================
-- STORED PROCEDURE: sp_AdminLockAccount
-- =====================================================
CREATE OR ALTER PROCEDURE sp_AdminLockAccount
    @UserId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE users 
    SET is_active = 0, 
        updated_at = CURRENT_TIMESTAMP 
    WHERE id = @UserId;

    IF @@ROWCOUNT = 0
    BEGIN
        RAISERROR(N'Không tìm thấy người dùng.', 16, 1);
    END
END
GO

-- =====================================================
-- STORED PROCEDURE: sp_AdminUnlockAccount
-- =====================================================
CREATE OR ALTER PROCEDURE sp_AdminUnlockAccount
    @UserId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE users 
    SET is_active = 1, 
        updated_at = CURRENT_TIMESTAMP 
    WHERE id = @UserId;

    IF @@ROWCOUNT = 0
    BEGIN
        RAISERROR(N'Không tìm thấy người dùng.', 16, 1);
    END
END
GO


-- =====================================================
-- STORED PROCEDURE: sp_DeleteConversation
-- =====================================================
CREATE OR ALTER PROCEDURE sp_DeleteConversation
    @ConversationId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE conversations
    SET is_active = 0,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @ConversationId;

    -- Kiểm tra xem có dòng nào được cập nhật không
    IF @@ROWCOUNT = 0
    BEGIN
        RAISERROR(N'Không tìm thấy cuộc trò chuyện.', 16, 1);
    END
END
GO

-- =====================================================
-- STORED PROCEDURE: sp_LogCallHistory
-- =====================================================
CREATE OR ALTER PROCEDURE sp_LogCallHistory
    @ConversationId UNIQUEIDENTIFIER,
    @CallerId UNIQUEIDENTIFIER,
    @CallType VARCHAR(20),
    @MediaType VARCHAR(20),
    @Status VARCHAR(20),
    @StartedAt DATETIME,
    @EndedAt DATETIME = NULL,
    @DurationSeconds INTEGER = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @NewCallId UNIQUEIDENTIFIER = NEWID();

    INSERT INTO calls (id, conversation_id, caller_id, call_type, media_type, status, started_at, ended_at, duration_seconds)
    VALUES (@NewCallId, @ConversationId, @CallerId, @CallType, @MediaType, @Status, @StartedAt, @EndedAt, @DurationSeconds);

    -- Trả về ID cuộc gọi vừa tạo
    SELECT @NewCallId AS NewCallId;
END

GO

-- =====================================================
-- STORED PROCEDURE: sp_ClearConversationHistory
-- =====================================================
CREATE OR ALTER PROCEDURE sp_ClearConversationHistory
    @ConversationId UNIQUEIDENTIFIER,
    @UserId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE participants
    SET history_cleared_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE conversation_id = @ConversationId AND user_id = @UserId AND left_at IS NULL;

    -- Kiểm tra xem có dòng nào được cập nhật không
    IF @@ROWCOUNT = 0
    BEGIN
        RAISERROR(N'Không tìm thấy thành viên trong cuộc trò chuyện.', 16, 1);
    END
END
GO

-- =====================================================
-- STORED PROCEDURE: sp_UpdateConversationAllowMemberChat
-- =====================================================
CREATE OR ALTER PROCEDURE sp_UpdateConversationAllowMemberChat
    @ConversationId UNIQUEIDENTIFIER,
    @UserId UNIQUEIDENTIFIER,
    @AllowMemberChat BIT
AS
BEGIN
    SET NOCOUNT ON;

    -- 1. Kiểm tra xem cuộc trò chuyện có phải là nhóm (group) không
    DECLARE @ConvType VARCHAR(20);
    SELECT @ConvType = conversation_type FROM conversations WHERE id = @ConversationId;

    IF @ConvType IS NULL
    BEGIN
        RAISERROR(N'Cuộc trò chuyện không tồn tại.', 16, 1);
        RETURN;
    END

    IF @ConvType <> 'group'
    BEGIN
        RAISERROR(N'Chỉ có thể thay đổi cài đặt chat cho cuộc trò chuyện nhóm.', 16, 1);
        RETURN;
    END

    -- 2. Kiểm tra xem người dùng có phải là Trưởng nhóm (owner) không
    DECLARE @UserRole VARCHAR(20);
    SELECT @UserRole = role 
    FROM participants 
    WHERE conversation_id = @ConversationId AND user_id = @UserId AND left_at IS NULL;

    IF @UserRole IS NULL OR @UserRole <> 'owner'
    BEGIN
        RAISERROR(N'Chỉ Trưởng nhóm mới có quyền thay đổi cài đặt này.', 16, 1);
        RETURN;
    END

    -- 3. Cập nhật allow_member_chat
    UPDATE conversations
    SET allow_member_chat = @AllowMemberChat,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @ConversationId;

    -- Trả về thông tin cập nhật
    SELECT allow_member_chat FROM conversations WHERE id = @ConversationId;
END
GO


-- =====================================================
-- STORED PROCEDURE: sp_ToggleUserActive
-- =====================================================
CREATE OR ALTER PROCEDURE sp_ToggleUserActive
    @UserId UNIQUEIDENTIFIER,
    @IsActive BIT
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE users
    SET is_active = @IsActive
    WHERE id = @UserId;
END
GO


-- =====================================================
-- STORED PROCEDURE: sp_GetAdminOverviewStats
-- =====================================================
CREATE OR ALTER PROCEDURE sp_GetAdminOverviewStats
AS
BEGIN
    SET NOCOUNT ON;

    SELECT 
        (SELECT COUNT(*) FROM users WHERE is_active = 1 AND LOWER(role) != 'admin') AS activeUsers,
        (SELECT COUNT(*) FROM messages) AS totalMessages;
END
GO


-- =====================================================
-- GRANT EXECUTE FOR AppRole
-- =====================================================
GRANT EXECUTE ON dbo.sp_RegisterUser TO AppRole;
GRANT EXECUTE ON dbo.sp_SetPassword TO AppRole;
GRANT EXECUTE ON dbo.sp_UpdateProfile TO AppRole;
GRANT EXECUTE ON dbo.sp_SendMessage TO AppRole;
GRANT EXECUTE ON dbo.sp_EditMessage TO AppRole;
GRANT EXECUTE ON dbo.sp_RevokeMessage TO AppRole;
GRANT EXECUTE ON dbo.sp_CreateGroupConversation TO AppRole;
GRANT EXECUTE ON dbo.sp_AddGroupMember TO AppRole;
GRANT EXECUTE ON dbo.sp_KickGroupMember TO AppRole;
GRANT EXECUTE ON dbo.sp_ChangeMemberRole TO AppRole;
GRANT EXECUTE ON dbo.sp_PinMessage TO AppRole;
GRANT EXECUTE ON dbo.sp_UnpinMessage TO AppRole;
GRANT EXECUTE ON dbo.sp_BlockUser TO AppRole;
GRANT EXECUTE ON dbo.sp_CreateDirectConversation TO AppRole;
GRANT EXECUTE ON dbo.sp_UpdateConversation TO AppRole;
GRANT EXECUTE ON dbo.sp_CreateParticipant TO AppRole;
GRANT EXECUTE ON dbo.sp_CreateFriendRequest TO AppRole;
GRANT EXECUTE ON dbo.sp_UpdateFriendRequestStatus TO AppRole;
GRANT EXECUTE ON dbo.sp_DeleteFriend TO AppRole;
GRANT EXECUTE ON dbo.sp_AddMessageReaction TO AppRole;
GRANT EXECUTE ON dbo.sp_RemoveMessageReaction TO AppRole;
GRANT EXECUTE ON dbo.sp_UpdateParticipant TO AppRole;
GRANT EXECUTE ON dbo.sp_UnblockUser TO AppRole;
GRANT EXECUTE ON dbo.sp_UpdateUserStatus TO AppRole;
GRANT EXECUTE ON dbo.sp_LeaveConversation TO AppRole;
GRANT EXECUTE ON dbo.sp_UpdateKeyStatus TO AppRole;
GRANT EXECUTE ON dbo.sp_AddFriend TO AppRole;
GRANT EXECUTE ON dbo.sp_DeleteUser TO AppRole;
GRANT EXECUTE ON dbo.sp_SetupE2EEKeys TO AppRole;
GRANT EXECUTE ON dbo.sp_AddConversationKey TO AppRole;
GRANT EXECUTE ON dbo.sp_StartCall TO AppRole;
GRANT EXECUTE ON dbo.sp_UpdateCallStatus TO AppRole;
GRANT EXECUTE ON dbo.sp_InitCall TO AppRole;
GRANT EXECUTE ON dbo.sp_AdminLockAccount TO AppRole;
GRANT EXECUTE ON dbo.sp_AdminUnlockAccount TO AppRole;
GRANT EXECUTE ON dbo.sp_DeleteConversation TO AppRole;
GRANT EXECUTE ON dbo.sp_LogCallHistory TO AppRole;
GRANT EXECUTE ON dbo.sp_UpdateConversationAllowMemberChat TO AppRole;
GRANT EXECUTE ON dbo.sp_ClearConversationHistory TO AppRole;
GRANT EXECUTE ON dbo.sp_ToggleUserActive TO AppRole;
GRANT EXECUTE ON dbo.sp_GetAdminOverviewStats TO AppRole;
GO