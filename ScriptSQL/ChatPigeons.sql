
-- 1. Tạo Database
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'ChatPigeons')
BEGIN
    CREATE DATABASE ChatPigeons;
END
GO

USE ChatPigeons;
GO

-- 2. Bảng users
CREATE TABLE users (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(250),
    full_name NVARCHAR(250),
    bio NVARCHAR(500),
    avatar_url VARCHAR(500),
    phone_number VARCHAR(20),
    birthday DATE,
    gender VARCHAR(10) CHECK (gender IN ('male', 'female', 'other', 'unspecified')),
    status VARCHAR(20) DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'away', 'busy')),
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    is_active BIT DEFAULT 1,
    is_email_verified BIT DEFAULT 0,
    is_phone_verified BIT DEFAULT 0,
    last_online_at DATETIMEOFFSET,
    public_key NVARCHAR(MAX),
    wrapped_private_key NVARCHAR(MAX),
    kek_iv VARCHAR(64),
    pin_salt VARCHAR(64),
    created_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET() NOT NULL,
    updated_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET()
);
GO

-- 3. Bảng conversations
CREATE TABLE conversations (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    conversation_type VARCHAR(20) NOT NULL DEFAULT 'direct' CHECK (conversation_type IN ('direct', 'group')),
    name NVARCHAR(255),
    avatar_url VARCHAR(500),
    created_by UNIQUEIDENTIFIER REFERENCES users(id) ON DELETE SET NULL,
    last_message_id UNIQUEIDENTIFIER,
    last_message_at DATETIMEOFFSET,
    is_active BIT DEFAULT 1,
    key_status VARCHAR(20) NOT NULL DEFAULT 'no_key' CHECK (key_status IN ('no_key', 'active', 'require_rotation')),
    created_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET() NOT NULL,
    updated_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET()
);
GO

-- 4. Bảng participants
CREATE TABLE participants (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    conversation_id UNIQUEIDENTIFIER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('member', 'admin', 'owner')),
    joined_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
    left_at DATETIMEOFFSET NULL,
    nick_name NVARCHAR(100),
    is_muted BIT DEFAULT 0,
    is_pinned BIT DEFAULT 0,
    last_read_message_id UNIQUEIDENTIFIER,
    created_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET() NOT NULL,
    updated_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT uq_participants UNIQUE(conversation_id, user_id)
);
GO

-- 5. Bảng calls
CREATE TABLE calls (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    conversation_id UNIQUEIDENTIFIER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    caller_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    call_type VARCHAR(20) NOT NULL DEFAULT 'direct' CHECK (call_type IN ('direct', 'group')),
    media_type VARCHAR(20) NOT NULL DEFAULT 'video' CHECK (media_type IN ('video', 'audio')),
    started_at DATETIMEOFFSET,
    ended_at DATETIMEOFFSET,
    duration_seconds INTEGER,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'ongoing', 'completed', 'missed', 'declined', 'cancelled')),
    created_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET() NOT NULL,
    updated_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET()
);
GO

-- 6. Bảng messages
CREATE TABLE messages (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    conversation_id UNIQUEIDENTIFIER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_type VARCHAR(20) DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'file', 'audio', 'video', 'sticker', 'call', 'system')),
    content NVARCHAR(MAX),
    file_url VARCHAR(500),
    file_size BIGINT,
    file_name NVARCHAR(255),
    thumbnail_url VARCHAR(500),
    link_description NVARCHAR(500),
    duration INTEGER,
    call_id UNIQUEIDENTIFIER REFERENCES calls(id) ON DELETE NO ACTION,
    has_link BIT DEFAULT 0,
    is_edited BIT DEFAULT 0,
    is_deleted BIT DEFAULT 0,
    deleted_for_all BIT DEFAULT 0,
    parent_message_id UNIQUEIDENTIFIER REFERENCES messages(id) ON DELETE NO ACTION,
    is_e2ee BIT DEFAULT 0,
    key_version INTEGER,
    iv VARCHAR(64),
    created_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET() NOT NULL,
    updated_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET()
);
GO

-- 7. Bảng conversationkeysvault
CREATE TABLE conversationkeysvault (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    user_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id UNIQUEIDENTIFIER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    key_version INTEGER NOT NULL,
    wrapped_shared_key NVARCHAR(MAX) NOT NULL,
    created_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET() NOT NULL,
    updated_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET()
);
GO

-- 8. Bảng pinnedmessages
CREATE TABLE pinnedmessages (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    message_id UNIQUEIDENTIFIER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    conversation_id UNIQUEIDENTIFIER NOT NULL REFERENCES conversations(id) ON DELETE NO ACTION,
    pinned_by UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
    pinned_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET() NOT NULL, -- Vẫn giữ pinned_at theo yêu cầu cũ
    note NVARCHAR(MAX),
    order_index INTEGER DEFAULT 0,
    is_deleted BIT DEFAULT 0,
    created_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET() NOT NULL,
    updated_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
    UNIQUE(message_id)
);
GO

-- 9. Bảng friendrequests
CREATE TABLE friendrequests (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    sender_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'blocked')),
    note NVARCHAR(500),
    created_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET() NOT NULL,
    updated_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
    UNIQUE(sender_id, receiver_id)
);
GO

-- 10. Bảng userblocks
CREATE TABLE userblocks (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    blocker_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
    reason NVARCHAR(500),
    created_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET() NOT NULL,
    updated_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
    UNIQUE(blocker_id, blocked_id)
);
GO

-- 11. Bảng friends
CREATE TABLE friends (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    user_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
    friendship_date DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET() NOT NULL,
    is_favorite BIT DEFAULT 0,
    notes NVARCHAR(500),
    created_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET() NOT NULL,
    updated_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
    UNIQUE(user_id, friend_id)
);
GO

-- 12. Bảng message_reactions
CREATE TABLE message_reactions (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    conversation_id UNIQUEIDENTIFIER NOT NULL REFERENCES conversations(id) ON DELETE NO ACTION,
    message_id UNIQUEIDENTIFIER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
    emoji_char NVARCHAR(10) NOT NULL,
    created_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET() NOT NULL,
    updated_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
    UNIQUE(message_id, user_id, emoji_char)
);
GO

-- 13. Bảng GroupJoinRequests
CREATE TABLE GroupJoinRequests (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    user_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
    conversation_id UNIQUEIDENTIFIER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    note NVARCHAR(500),
    processed_by UNIQUEIDENTIFIER REFERENCES users(id) ON DELETE NO ACTION,
    created_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET() NOT NULL,
    updated_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET() NOT NULL
);
GO

-- 15. Foreign Key bổ sung
ALTER TABLE conversations
ADD CONSTRAINT fk_conv_last_msg FOREIGN KEY (last_message_id) REFERENCES messages(id) ON DELETE NO ACTION;
GO

