const { DataTypes } = require('sequelize');
const { sequelize } = require('../configs/sequelizeConfig');

const Message = sequelize.define('Message', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        field: 'id'
    },
    conversation_id: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'conversation_id'
    },
    sender_id: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'sender_id'
    },
    message_type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'text',
        field: 'message_type',
        validate: {
            isIn: [['text', 'image', 'file', 'audio', 'video', 'sticker', 'call', 'system']]
        }
    },
    content: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'content'
    },
    file_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
        field: 'file_url'
    },
    file_size: {
        type: DataTypes.BIGINT,
        allowNull: true,
        field: 'file_size'
    },
    file_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'file_name'
    },
    thumbnail_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
        field: 'thumbnail_url'
    },
    link_description: {
        type: DataTypes.STRING(500),
        allowNull: true,
        field: 'link_description'
    },
    duration: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'duration'
    },
    call_id: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'call_id'
    },
    has_link: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'has_link'
    },
    is_edited: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'is_edited'
    },
    is_deleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'is_deleted'
    },
    deleted_for_all: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'deleted_for_all'
    },
    parent_message_id: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'parent_message_id'
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: false,
        field: 'created_at'
    },
    updated_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: true,
        field: 'updated_at'
    }
}, {
    tableName: 'messages',
    timestamps: false,
    freezeTableName: true,
    indexes: [
        { fields: ['conversation_id', 'created_at'] },
        { fields: ['sender_id'] },
        { fields: ['parent_message_id'] },
        { fields: ['call_id'] }
    ]
});

// Associate với Call
Message.associate = (models) => {
    Message.belongsTo(models.Call, {
        foreignKey: 'call_id',
        as: 'call'
    });
};

module.exports = Message;
