const { DataTypes } = require('sequelize');
const { sequelize } = require('../configs/sequelizeConfig');

const Conversation = sequelize.define('Conversation', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        field: 'id'
    },
    conversation_type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'direct',
        field: 'conversation_type',
        validate: {
            isIn: [['direct', 'group']]
        }
    },
    name: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'name'
    },
    avatar_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
        field: 'avatar_url'
    },
    created_by: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'created_by'
    },
    last_message_id: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'last_message_id'
    },
    last_message_at: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'last_message_at'
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: 'is_active'
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
    tableName: 'conversations',
    timestamps: false,
    freezeTableName: true,
    indexes: [
        { fields: ['last_message_at'] },
        { fields: ['conversation_type'] }
    ]
});

module.exports = Conversation;
