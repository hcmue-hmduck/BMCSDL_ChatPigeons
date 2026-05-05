-- =====================================================
-- SCHEMA: ChatPigeons
-- =====================================================

CREATE SCHEMA IF NOT EXISTS "ChatPigeons"
    AUTHORIZATION neondb_owner;

ALTER DATABASE postgres SET search_path TO "ChatPigeons", public;
SET search_path TO "ChatPigeons", public;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA "ChatPigeons";
CREATE EXTENSION IF NOT EXISTS unaccent;

-- =====================================================
-- Bảng Users
-- =====================================================
CREATE TABLE Users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(250),
    full_name VARCHAR(250),
    bio VARCHAR(500),
    avatar_url VARCHAR(500),
    phone_number VARCHAR(20) UNIQUE,
    birthday DATE,
    gender VARCHAR(10) CHECK (gender IN ('male', 'female', 'other', 'unspecified')),
    status VARCHAR(20) DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'away', 'busy')),
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    is_active BOOLEAN DEFAULT TRUE,
    is_email_verified BOOLEAN DEFAULT FALSE,
    is_phone_verified BOOLEAN DEFAULT FALSE,
    last_online_at TIMESTAMPTZ,
	is_bot BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON Users(email);
CREATE INDEX idx_users_phone ON Users(phone_number);
CREATE INDEX idx_users_status ON Users(status);

-- =====================================================
-- Bảng Conversations (Cuộc trò chuyện)
-- =====================================================
CREATE TABLE Conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_type VARCHAR(20) NOT NULL DEFAULT 'direct' CHECK (conversation_type IN ('direct', 'group')),
    name VARCHAR(255),
    avatar_url VARCHAR(500),
    created_by UUID REFERENCES Users(id) ON DELETE SET NULL,
    last_message_id UUID,                -- Sẽ được cập nhật sau khi insert Messages
    last_message_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_conversations_last_message_at ON Conversations(last_message_at);
CREATE INDEX idx_conversations_type ON Conversations(conversation_type);

-- =====================================================
-- Bảng Participants (Thành viên trong cuộc trò chuyện)
-- =====================================================
CREATE TABLE Participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES Conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('member', 'admin', 'owner')),
    joined_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMPTZ NULL,
    nick_name VARCHAR(100),
    is_muted BOOLEAN DEFAULT FALSE,
    is_pinned BOOLEAN DEFAULT FALSE,
    last_read_message_id UUID,            -- Sẽ được tham chiếu sau
    UNIQUE(conversation_id, user_id)
);

CREATE INDEX idx_participants_user_id ON Participants(user_id);
CREATE INDEX idx_participants_conversation_id ON Participants(conversation_id);
CREATE INDEX idx_participants_last_read ON Participants(last_read_message_id);

-- =====================================================
-- Bảng Calls (Cuộc gọi) – Phải tạo trước Messages vì Messages tham chiếu Calls
-- =====================================================
CREATE TABLE Calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES Conversations(id) ON DELETE CASCADE,
    caller_id UUID NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
    call_type VARCHAR(20) NOT NULL DEFAULT 'direct' CHECK (call_type IN ('direct', 'group')),
    media_type VARCHAR(20) NOT NULL DEFAULT 'video' CHECK (media_type IN ('video', 'audio')),
    started_at TIMESTAMPTZ NULL,
    ended_at TIMESTAMPTZ NULL,
    duration_seconds INTEGER,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ongoing', 'completed', 'missed', 'declined', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_calls_conversation ON Calls(conversation_id);
CREATE INDEX idx_calls_caller ON Calls(caller_id);
CREATE INDEX idx_calls_status ON Calls(status);
CREATE INDEX idx_calls_call_type ON Calls(call_type);
CREATE INDEX idx_calls_media_type ON Calls(media_type);

-- =====================================================
-- Bảng Messages (Tin nhắn)
-- =====================================================
CREATE TABLE Messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES Conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
    message_type VARCHAR(20) NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'file', 'audio', 'video', 'sticker', 'call', 'system')),
    content TEXT,
    file_url VARCHAR(500),
    file_size BIGINT,
    file_name VARCHAR(255),
    thumbnail_url VARCHAR(500),
	link_description VARCHAR(500),
    duration INTEGER,
    call_id UUID REFERENCES Calls(id) ON DELETE CASCADE,
	has_link BOOLEAN DEFAULT FALSE,
    is_edited BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_for_all BOOLEAN DEFAULT FALSE,
    parent_message_id UUID REFERENCES Messages(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_messages_conversation_created ON Messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_sender ON Messages(sender_id);
CREATE INDEX idx_messages_parent ON Messages(parent_message_id);
CREATE INDEX idx_messages_call ON Messages(call_id);

-- =====================================================
-- Bảng PinnedMessages (Tin nhắn ghim)
-- =====================================================
CREATE TABLE PinnedMessages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES Messages(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES Conversations(id) ON DELETE CASCADE,
    pinned_by UUID NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
    pinned_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    note TEXT,
    order_index INTEGER DEFAULT 0,
    is_deleted BOOLEAN DEFAULT FALSE,
    UNIQUE(message_id)
);

CREATE INDEX idx_pinned_messages_conversation ON PinnedMessages(conversation_id);
CREATE INDEX idx_pinned_messages_message ON PinnedMessages(message_id);

-- =====================================================
-- Bảng FriendRequests (Lời mời kết bạn)
-- =====================================================
CREATE TABLE FriendRequests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id UUID NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'blocked')),
    note VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(sender_id, receiver_id)
);

CREATE INDEX idx_friend_requests_sender ON FriendRequests(sender_id);
CREATE INDEX idx_friend_requests_receiver ON FriendRequests(receiver_id);
CREATE INDEX idx_friend_requests_status ON FriendRequests(status);
CREATE INDEX idx_friend_requests_both ON FriendRequests(sender_id, receiver_id);

-- =====================================================
-- Bảng UserBlocks (Chặn người dùng)
-- =====================================================
CREATE TABLE UserBlocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    blocker_id UUID NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
    reason VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(blocker_id, blocked_id)
);

CREATE INDEX idx_user_blocks_blocker ON UserBlocks(blocker_id);
CREATE INDEX idx_user_blocks_blocked ON UserBlocks(blocked_id);

-- =====================================================
-- Bảng Friends (Danh sách bạn bè)
-- =====================================================
CREATE TABLE Friends (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
    friend_id UUID NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
    friendship_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    is_favorite BOOLEAN DEFAULT FALSE,
    notes VARCHAR(500),
    UNIQUE(user_id, friend_id)
);

CREATE INDEX idx_friends_user_id ON Friends(user_id);
CREATE INDEX idx_friends_friend_id ON Friends(friend_id);
CREATE INDEX idx_friends_friendship_date ON Friends(friendship_date DESC);
CREATE INDEX idx_friends_favorite ON Friends(user_id, is_favorite);

-- =====================================================
-- Bảng Emojis (Danh sách emojis)
-- =====================================================
CREATE TABLE Emojis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), 
    unicode_char VARCHAR(10) NOT NULL,     
    name VARCHAR(100) NOT NULL,            
    shortcode VARCHAR(50) UNIQUE NOT NULL,
    category VARCHAR(50),                   
    keywords TEXT,                          
    image_url VARCHAR(255),                
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_emojis_shortcode ON emojis(shortcode);
CREATE INDEX idx_emojis_category ON emojis(category);


-- =====================================================
-- Bảng Message Reactions (Danh sách emojis trong 1 message)
-- =====================================================
CREATE TABLE message_reactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	conversation_id UUID NOT NULL REFERENCES Conversations(id) ON DELETE CASCADE,
    message_id UUID NOT NULL REFERENCES Messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
    emoji_char VARCHAR(10) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(message_id, user_id, emoji_char)
);


CREATE INDEX idx_message_reactions_message_id ON message_reactions(message_id);
CREATE INDEX idx_message_reactions_user_id ON message_reactions(user_id);
CREATE INDEX idx_message_reactions_conversation_id ON message_reactions(conversation_id);
CREATE INDEX idx_message_reactions_created_at ON message_reactions(created_at DESC);


-- -----------------------------------------------------
-- Bảng Posts (Bài viết)
-- -----------------------------------------------------
CREATE TABLE Posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
    content TEXT,
    -- Loại bài viết: text, image, video, link, poll, ... (có thể mở rộng)
    post_type VARCHAR(20) DEFAULT 'text' CHECK (post_type IN ('text', 'media', 'link', 'share')),
	-- Trạng thái: public, friends, only_me, custom
    privacy VARCHAR(20) DEFAULT 'public' CHECK (privacy IN ('public', 'friends', 'only_me', 'custom')),
    -- Cảm xúc/hoạt động (tuỳ chọn)
    feeling VARCHAR(50),
    location VARCHAR(255),
    -- Nếu là bài chia sẻ (share) thì liên kết tới bài gốc
    shared_post_id UUID REFERENCES Posts(id) ON DELETE SET NULL,
    -- Tổng hợp số lượng tương tác (có thể cập nhật bằng trigger hoặc batch)
    likes_count INT DEFAULT 0,
    comments_count INT DEFAULT 0,
    shares_count INT DEFAULT 0,
    -- Metadata
	status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'flagged')),
    is_pinned BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_posts_user_id ON Posts(user_id);
CREATE INDEX idx_posts_created_at ON Posts(created_at DESC);
CREATE INDEX idx_posts_privacy ON Posts(privacy);
CREATE INDEX idx_posts_shared_post ON Posts(shared_post_id);

-- -----------------------------------------------------
-- Bảng PostMedia (Hình ảnh/video đính kèm bài viết)
-- -----------------------------------------------------
CREATE TABLE PostMedia (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES Posts(id) ON DELETE CASCADE,
    media_type VARCHAR(10) NOT NULL CHECK (media_type IN ('image', 'video', 'file', 'link')),
    media_url VARCHAR(500) NOT NULL,
    thumbnail_url VARCHAR(500),
    link_description VARCHAR(500),
    link_site_name VARCHAR(500),
    duration INT, -- cho video (giây)
    file_size BIGINT,
    file_name VARCHAR(255),
    -- Thứ tự hiển thị
    display_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_postmedia_post_id ON PostMedia(post_id);

-- -----------------------------------------------------
-- Bảng PostReactions (Cảm xúc bài viết)
-- -----------------------------------------------------
CREATE TABLE PostReactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES Posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
    emoji_char VARCHAR(10) NOT NULL,
    reaction_type VARCHAR(10) NOT NULL CHECK (reaction_type IN ('like', 'love', 'care', 'haha', 'wow', 'sad', 'angry')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(post_id, user_id) -- Mỗi người chỉ được thả một cảm xúc cho một bài
);

CREATE INDEX idx_postreactions_post_id ON PostReactions(post_id);
CREATE INDEX idx_postreactions_user_id ON PostReactions(user_id);

-- -----------------------------------------------------
-- Bảng Comments (Bình luận)
-- -----------------------------------------------------
CREATE TABLE Comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES Posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
    parent_comment_id UUID REFERENCES Comments(id) ON DELETE CASCADE, -- NULL nếu là comment gốc, khác NULL nếu reply
    content TEXT NOT NULL,
    -- Media đính kèm trong comment (có thể dùng riêng bảng CommentMedia nếu cần, nhưng tạm thời để đơn giản)
    media_url VARCHAR(500),
    media_type VARCHAR(10) CHECK (media_type IN ('image', 'video', 'file')),
    -- Số lượng tương tác
    likes_count INT DEFAULT 0,
    replies_count INT DEFAULT 0,
    -- Metadata
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_comments_post_id ON Comments(post_id);
CREATE INDEX idx_comments_user_id ON Comments(user_id);
CREATE INDEX idx_comments_parent ON Comments(parent_comment_id);
CREATE INDEX idx_comments_created_at ON Comments(created_at DESC);

-- -----------------------------------------------------
-- Bảng CommentReactions (Cảm xúc cho bình luận)
-- -----------------------------------------------------
CREATE TABLE CommentReactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    comment_id UUID NOT NULL REFERENCES Comments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
    reaction_type VARCHAR(10) NOT NULL CHECK (reaction_type IN ('like', 'love', 'haha', 'wow', 'sad', 'angry')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(comment_id, user_id)
);

CREATE INDEX idx_commentreactions_comment_id ON CommentReactions(comment_id);
CREATE INDEX idx_commentreactions_user_id ON CommentReactions(user_id);

-- -----------------------------------------------------
-- Bảng Shares (Chia sẻ bài viết, có thể kèm nội dung)
-- -----------------------------------------------------
-- Lưu ý: Posts đã có cột shared_post_id, nhưng nếu muốn lưu chi tiết người chia sẻ và nội dung riêng,
-- ta có thể dùng bảng Shares riêng. Ở đây dùng Posts với shared_post_id là đủ, nhưng để linh hoạt, tạo bảng Shares.
CREATE TABLE Shares (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    original_post_id UUID NOT NULL REFERENCES Posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
    content TEXT, -- nội dung người chia sẻ thêm
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(original_post_id, user_id) -- một người chỉ share một bài một lần (có thể bỏ nếu cho share nhiều lần)
);

CREATE INDEX idx_shares_original_post ON Shares(original_post_id);
CREATE INDEX idx_shares_user_id ON Shares(user_id);
CREATE INDEX idx_shares_created_at ON Shares(created_at DESC);

-- -----------------------------------------------------
-- Bảng PostTags (Gắn thẻ người dùng trong bài viết)
-- -----------------------------------------------------
CREATE TABLE PostTags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES Posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
    -- Toạ độ nếu tag trong ảnh (tuỳ chọn)
    x_coordinate FLOAT,
    y_coordinate FLOAT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(post_id, user_id)
);

CREATE INDEX idx_posttags_post_id ON PostTags(post_id);
CREATE INDEX idx_posttags_user_id ON PostTags(user_id);

-- -----------------------------------------------------
-- Bảng SavedPosts (Lưu bài viết)
-- -----------------------------------------------------
CREATE TABLE SavedPosts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES Posts(id) ON DELETE CASCADE,
    collection_name VARCHAR(100) DEFAULT 'default', -- phân loại (VD: 'Đọc sau', 'Yêu thích')
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(user_id, post_id)
);

CREATE INDEX idx_savedposts_user_id ON SavedPosts(user_id);
CREATE INDEX idx_savedposts_post_id ON SavedPosts(post_id);

-- -----------------------------------------------------
-- Bảng Reports (Báo cáo vi phạm)
-- -----------------------------------------------------
CREATE TABLE Reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
    -- Đối tượng bị báo cáo: có thể là post, comment, user
    target_type VARCHAR(10) NOT NULL CHECK (target_type IN ('post', 'comment', 'user')),
    target_id UUID NOT NULL,
    reason VARCHAR(50) NOT NULL, -- spam, inappropriate, harassment, etc.
    description TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'rejected')),
    resolved_by UUID REFERENCES Users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_reports_reporter ON Reports(reporter_id);
CREATE INDEX idx_reports_target ON Reports(target_type, target_id);
CREATE INDEX idx_reports_status ON Reports(status);

-- -----------------------------------------------------
-- Bảng Notifications (Thông báo)
-- -----------------------------------------------------
CREATE TABLE Notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
    -- Loại thông báo: friend_request, comment, like, share, tag, system, v.v.
    type VARCHAR(30) NOT NULL,
    -- Tham chiếu đến đối tượng liên quan (có thể dùng chung kiểu JSON hoặc các cột riêng)
    reference_id UUID, -- ID của post, comment, friend_request, v.v.
    reference_type VARCHAR(20), -- 'post', 'comment', 'friend_request', ...
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    -- Đường dẫn hành động (deep link)
    action_url VARCHAR(500)
);

CREATE INDEX idx_notifications_user_id ON Notifications(user_id);
CREATE INDEX idx_notifications_user_read ON Notifications(user_id, is_read);
CREATE INDEX idx_notifications_created_at ON Notifications(created_at DESC);

-- -----------------------------------------------------
-- Bảng UserPrivacySettings (Cài đặt quyền riêng tư của người dùng)
-- -----------------------------------------------------
CREATE TABLE UserPrivacySettings (
    user_id UUID PRIMARY KEY REFERENCES Users(id) ON DELETE CASCADE,
    -- Ai có thể xem bài viết mặc định: public, friends, only_me
    default_post_privacy VARCHAR(20) DEFAULT 'public',
    -- Ai có thể bình luận bài viết của tôi: everyone, friends, only_me
    who_can_comment VARCHAR(20) DEFAULT 'everyone',
    -- Ai có thể gửi lời mời kết bạn: everyone, friends_of_friends, nobody
    who_can_send_friend_request VARCHAR(20) DEFAULT 'everyone',
    -- Ai có thể nhìn thấy danh sách bạn bè của tôi: public, friends, only_me
    who_can_see_friends_list VARCHAR(20) DEFAULT 'friends',
    -- Chặn người lạ nhắn tin
    allow_messages_from VARCHAR(20) DEFAULT 'everyone', -- 'everyone', 'friends', 'no_one'
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- BOT PLATFORM SCHEMA UPDATES
-- =============================================

-- 1. Cập nhật bảng Users để hỗ trợ Bot
ALTER TABLE "ChatPigeons"."users" ADD COLUMN IF NOT EXISTS "is_bot" BOOLEAN DEFAULT FALSE;
ALTER TABLE "ChatPigeons"."users" ADD COLUMN IF NOT EXISTS "bot_name" VARCHAR(255);
ALTER TABLE "ChatPigeons"."users" ADD CONSTRAINT "users_bot_name_unique" UNIQUE ("bot_name");

-- 2. Tạo bảng Bots để lưu cấu hình
CREATE TABLE IF NOT EXISTS "ChatPigeons"."bots" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "bot_user_id" UUID NOT NULL REFERENCES "ChatPigeons"."users"("id") ON DELETE CASCADE,
    "owner_id" UUID NOT NULL REFERENCES "ChatPigeons"."users"("id") ON DELETE CASCADE,
    "token_hash" VARCHAR(255) NOT NULL,
    "webhook_url" VARCHAR(255),
    "status" VARCHAR(50) DEFAULT 'active',
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tạo Index để truy vấn nhanh
CREATE INDEX IF NOT EXISTS "idx_bots_bot_user_id" ON "ChatPigeons"."bots"("bot_user_id");
CREATE INDEX IF NOT EXISTS "idx_bots_owner_id" ON "ChatPigeons"."bots"("owner_id");
CREATE INDEX IF NOT EXISTS "idx_users_bot_name" ON "ChatPigeons"."users"("bot_name") WHERE is_bot = TRUE;
