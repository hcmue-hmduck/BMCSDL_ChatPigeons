-- =====================================================
-- TẠO DATABASE
-- =====================================================

-- Tạo Database mới
CREATE DATABASE ChatPigeons;
GO

-- Sử dụng Database vừa tạo
USE ChatPigeons;
GO

-- =====================================================
-- Bảng users
-- =====================================================
CREATE TABLE users (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    email VARCHAR(100) NOT NULL,
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
    last_online_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    -- E2EE fields
    public_key NVARCHAR(MAX),
    wrapped_private_key NVARCHAR(MAX),
    kek_iv VARCHAR(64),
    pin_salt VARCHAR(64),
    CONSTRAINT uq_users_email UNIQUE(email)
);

-- Index cho users
CREATE UNIQUE NONCLUSTERED INDEX idx_users_phone_unique ON users(phone_number) WHERE phone_number IS NOT NULL;
CREATE INDEX idx_users_status ON users(status);

-- =====================================================
-- Bảng conversations
-- =====================================================
CREATE TABLE conversations (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    conversation_type VARCHAR(20) NOT NULL DEFAULT 'direct' CHECK (conversation_type IN ('direct', 'group')),
    name NVARCHAR(255),
    avatar_url VARCHAR(500),
    created_by UNIQUEIDENTIFIER REFERENCES users(id) ON DELETE SET NULL,
    last_message_id UNIQUEIDENTIFIER,
    last_message_at DATETIME,
    is_active BIT DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index cho conversations
CREATE INDEX idx_conversations_last_message_at ON conversations(last_message_at);
CREATE INDEX idx_conversations_type ON conversations(conversation_type);

-- =====================================================
-- Bảng participants
-- =====================================================
CREATE TABLE participants (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    conversation_id UNIQUEIDENTIFIER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('member', 'admin', 'owner')),
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    left_at DATETIME NULL,
    nick_name NVARCHAR(100),
    is_muted BIT DEFAULT 0,
    is_pinned BIT DEFAULT 0,
    last_read_message_id UNIQUEIDENTIFIER,
    UNIQUE(conversation_id, user_id)
);

-- Index cho participants
CREATE INDEX idx_participants_user_id ON participants(user_id);
CREATE INDEX idx_participants_conversation_id ON participants(conversation_id);
CREATE INDEX idx_participants_last_read ON participants(last_read_message_id);

-- =====================================================
-- Bảng calls
-- =====================================================
CREATE TABLE calls (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    conversation_id UNIQUEIDENTIFIER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    caller_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    call_type VARCHAR(20) NOT NULL DEFAULT 'direct' CHECK (call_type IN ('direct', 'group')),
    media_type VARCHAR(20) NOT NULL DEFAULT 'video' CHECK (media_type IN ('video', 'audio')),
    started_at DATETIME NULL,
    ended_at DATETIME NULL,
    duration_seconds INTEGER,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ongoing', 'completed', 'missed', 'declined', 'cancelled')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index cho calls
CREATE INDEX idx_calls_conversation ON calls(conversation_id);
CREATE INDEX idx_calls_caller ON calls(caller_id);
CREATE INDEX idx_calls_status ON calls(status);

-- =====================================================
-- Bảng messages
-- =====================================================
CREATE TABLE messages (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    conversation_id UNIQUEIDENTIFIER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_type VARCHAR(20) NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'file', 'audio', 'video', 'sticker', 'call', 'system')),
    content NVARCHAR(MAX),
    file_url VARCHAR(500),
    file_size BIGINT,
    file_name NVARCHAR(255),
    thumbnail_url VARCHAR(500),
    link_description NVARCHAR(500),
    duration INTEGER,
    call_id UNIQUEIDENTIFIER REFERENCES calls(id) ON DELETE NO ACTION, -- Tránh chu kỳ cascade trong SQL Server
    has_link BIT DEFAULT 0,
    is_edited BIT DEFAULT 0,
    is_deleted BIT DEFAULT 0,
    deleted_for_all BIT DEFAULT 0,
    parent_message_id UNIQUEIDENTIFIER REFERENCES messages(id) ON DELETE NO ACTION, -- Tự tham chiếu
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    -- For E2EE: if message is encrypted, `encrypted_content` holds ciphertext and `content` may be NULL (plaintext only stored locally)
    is_e2ee BIT DEFAULT 0,
    key_version INTEGER,
    iv VARCHAR(64)
);

-- Index cho messages
CREATE INDEX idx_messages_conversation_created ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_parent ON messages(parent_message_id);
CREATE INDEX idx_messages_call ON messages(call_id);

-- =====================================================
-- Bảng conversationkeysvault
-- =====================================================
CREATE TABLE conversationkeysvault (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    user_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id UNIQUEIDENTIFIER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    key_version INTEGER NOT NULL,
    wrapped_shared_key NVARCHAR(MAX) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index cho conversationkeysvault
CREATE INDEX idx_vault_conversation_id ON conversationkeysvault(conversation_id);
CREATE INDEX idx_vault_user_id ON conversationkeysvault(user_id);

-- =====================================================
-- Bảng pinnedmessages
-- =====================================================
CREATE TABLE pinnedmessages (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    message_id UNIQUEIDENTIFIER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    conversation_id UNIQUEIDENTIFIER NOT NULL REFERENCES conversations(id) ON DELETE NO ACTION, -- Tránh chu kỳ
    pinned_by UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE NO ACTION, -- Tránh chu kỳ
    pinned_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    note NVARCHAR(MAX),
    order_index INTEGER DEFAULT 0,
    is_deleted BIT DEFAULT 0,
    UNIQUE(message_id)
);

-- Index cho pinnedmessages
CREATE INDEX idx_pinned_messages_conversation ON pinnedmessages(conversation_id);

-- =====================================================
-- Bảng friendrequests
-- =====================================================
CREATE TABLE friendrequests (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    sender_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE NO ACTION, -- Tránh chu kỳ
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'blocked')),
    note NVARCHAR(500),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(sender_id, receiver_id)
);

-- Index cho friendrequests
CREATE INDEX idx_friend_requests_sender ON friendrequests(sender_id);
CREATE INDEX idx_friend_requests_receiver ON friendrequests(receiver_id);

-- =====================================================
-- Bảng userblocks
-- =====================================================
CREATE TABLE userblocks (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    blocker_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE NO ACTION, -- Tránh chu kỳ
    reason NVARCHAR(500),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(blocker_id, blocked_id)
);

-- Index cho userblocks
CREATE INDEX idx_user_blocks_blocker ON userblocks(blocker_id);
CREATE INDEX idx_user_blocks_blocked ON userblocks(blocked_id);

-- =====================================================
-- Bảng friends
-- =====================================================
CREATE TABLE friends (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    user_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE NO ACTION, -- Tránh chu kỳ
    friendship_date DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    is_favorite BIT DEFAULT 0,
    notes NVARCHAR(500),
    UNIQUE(user_id, friend_id)
);

-- Index cho friends
CREATE INDEX idx_friends_user_id ON friends(user_id);
CREATE INDEX idx_friends_friend_id ON friends(friend_id);

-- =====================================================
-- Bảng message_reactions
-- =====================================================
CREATE TABLE message_reactions (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    conversation_id UNIQUEIDENTIFIER NOT NULL REFERENCES conversations(id) ON DELETE NO ACTION, -- Tránh chu kỳ
    message_id UNIQUEIDENTIFIER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
    emoji_char NVARCHAR(10) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(message_id, user_id, emoji_char)
);

-- Index cho message_reactions
CREATE INDEX idx_message_reactions_message_id ON message_reactions(message_id);

-- =====================================================
-- Bảng GroupJoinRequests
-- =====================================================
CREATE TABLE GroupJoinRequests (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    user_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE NO ACTION, -- Tránh chu kỳ
    conversation_id UNIQUEIDENTIFIER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    note NVARCHAR(500),
    processed_by UNIQUEIDENTIFIER REFERENCES users(id) ON DELETE NO ACTION,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT check_status CHECK (status IN ('pending', 'approved', 'rejected'))
);
