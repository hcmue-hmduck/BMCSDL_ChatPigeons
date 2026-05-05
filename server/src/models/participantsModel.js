const { DataTypes } = require('sequelize');
const { sequelize } = require('../configs/sequelizeConfig');

const Participant = sequelize.define('Participant', {
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
    user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'user_id'
    },
    role: {
        type: DataTypes.STRING(20),
        defaultValue: 'member',
        field: 'role',
        validate: {
            isIn: [['member', 'admin', 'owner']]
        }
    },
    joined_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        field: 'joined_at'
    },
    left_at: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'left_at'
    },
    nick_name: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'nick_name'
    },
    is_muted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'is_muted'
    },
    is_pinned: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'is_pinned'
    },
    last_read_message_id: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'last_read_message_id'
    }
}, {
    tableName: 'participants',
    timestamps: false,
    freezeTableName: true,
    indexes: [
        { fields: ['user_id'] },
        { fields: ['conversation_id'] },
        { fields: ['last_read_message_id'] }
    ],
    uniqueKeys: {
        unique_participant: {
            fields: ['conversation_id', 'user_id']
        }
    }
});

module.exports = Participant;
