const { sequelize } = require('./src/configs/sequelizeConfig');

async function createMissingTables() {
    const queries = [
        `CREATE TABLE participants (
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
        )`,
        `CREATE INDEX idx_participants_user_id ON participants(user_id)`,
        `CREATE INDEX idx_participants_conversation_id ON participants(conversation_id)`,

        `CREATE TABLE friendrequests (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            sender_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            receiver_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
            status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'blocked')),
            note NVARCHAR(500),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(sender_id, receiver_id)
        )`,

        `CREATE TABLE userblocks (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            blocker_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            blocked_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
            reason NVARCHAR(500),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
            UNIQUE(blocker_id, blocked_id)
        )`,

        `CREATE TABLE friends (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            user_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            friend_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
            friendship_date DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
            is_favorite BIT DEFAULT 0,
            notes NVARCHAR(500),
            UNIQUE(user_id, friend_id)
        )`,

        `CREATE TABLE pinnedmessages (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            message_id UNIQUEIDENTIFIER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
            conversation_id UNIQUEIDENTIFIER NOT NULL REFERENCES conversations(id) ON DELETE NO ACTION,
            pinned_by UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
            pinned_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
            note NVARCHAR(MAX),
            order_index INTEGER DEFAULT 0,
            is_deleted BIT DEFAULT 0,
            UNIQUE(message_id)
        )`,

        `CREATE TABLE emojis (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            unicode_char NVARCHAR(10) NOT NULL,
            name NVARCHAR(100) NOT NULL,
            shortcode NVARCHAR(50) UNIQUE NOT NULL,
            category NVARCHAR(50),
            keywords NVARCHAR(MAX),
            image_url NVARCHAR(255),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
    ];

    for (const query of queries) {
        try {
            console.log(`Executing: ${query.substring(0, 50)}...`);
            await sequelize.query(query);
            console.log('Success!');
        } catch (error) {
            console.error('Failed:', error.message);
        }
    }
    process.exit();
}

createMissingTables();
