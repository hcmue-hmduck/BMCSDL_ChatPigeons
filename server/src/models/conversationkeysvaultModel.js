const { DataTypes } = require('sequelize');
const { sequelize } = require('../configs/sequelizeConfig');

const ConversationKeysVault = sequelize.define('ConversationKeysVault', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        field: 'id'
    },
    user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'user_id'
    },
    conversation_id: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'conversation_id'
    },
    key_version: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'key_version'
    },
    wrapped_shared_key: {
        type: DataTypes.TEXT,
        allowNull: false,
        field: 'wrapped_shared_key'
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
    tableName: 'conversationkeysvault',
    schema: 'ChatPigeons',
    timestamps: false,
    freezeTableName: true,
    indexes: [
        { fields: ['conversation_id'] },
        { fields: ['user_id'] },
        { fields: ['conversation_id', 'user_id', 'key_version'], unique: true }
    ]
});

ConversationKeysVault.associate = (models) => {
    ConversationKeysVault.belongsTo(models.User, {
        foreignKey: 'user_id',
        as: 'user'
    });

    ConversationKeysVault.belongsTo(models.Conversation, {
        foreignKey: 'conversation_id',
        as: 'conversation'
    });
};

module.exports = ConversationKeysVault;