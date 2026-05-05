const { DataTypes } = require('sequelize');
const { sequelize } = require('../configs/sequelizeConfig');

const FriendRequests = sequelize.define('FriendRequests', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    sender_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'Users', // Đảm bảo tên bảng Users khớp với model User của bạn
            key: 'id'
        },
        onDelete: 'CASCADE'
    },
    receiver_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'Users',
            key: 'id'
        },
        onDelete: 'CASCADE'
    },
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
        validate: {
            isIn: [['pending', 'accepted', 'rejected', 'blocked']]
        }
    },
    note: {
        type: DataTypes.STRING(500),
        allowNull: true
    }
}, {
    tableName: 'friendrequests',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        {
            unique: true,
            fields: ['sender_id', 'receiver_id']
        },
        {
            name: 'idx_friend_requests_sender',
            fields: ['sender_id']
        },
        {
            name: 'idx_friend_requests_receiver',
            fields: ['receiver_id']
        },
        {
            name: 'idx_friend_requests_status',
            fields: ['status']
        },
        {
            name: 'idx_friend_requests_both',
            fields: ['sender_id', 'receiver_id']
        }
    ]
});

module.exports = FriendRequests;