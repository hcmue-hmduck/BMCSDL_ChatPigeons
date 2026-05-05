const { DataTypes } = require("sequelize");
const { sequelize } = require("../configs/sequelizeConfig");

const PinnedMessages = sequelize.define("PinnedMessages", {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        field: 'id'
    },
    message_id: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'message_id',
        unique: true // Each message can only be pinned once
    },
    conversation_id: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'conversation_id'
    },
    pinned_by: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'pinned_by'
    },
    pinned_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: false,
        field: 'pinned_at'
    },
    note: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'note'
    },
    order_index: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: false,
        field: 'order_index'
    },
    is_deleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
        field: 'is_deleted'
    }
}, {
    tableName: 'pinnedmessages',
    timestamps: false,
    freezeTableName: true,
    indexes: [
        { fields: ['conversation_id'] },
        { fields: ['message_id'], unique: true }
    ]
});

module.exports = PinnedMessages;