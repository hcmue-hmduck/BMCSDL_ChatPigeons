const { DataTypes } = require('sequelize');
const { sequelize } = require('../configs/sequelizeConfig');

const Friends = sequelize.define('Friends', {
    // Primary Key
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        field: 'id'
    },

    // User ID (người sở hữu quan hệ bạn bè)
    user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'user_id',
        references: {
            model: 'users',
            key: 'id'
        },
        onDelete: 'CASCADE'
    },

    // Friend ID (người được thêm bạn)
    friend_id: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'friend_id',
        references: {
            model: 'users',
            key: 'id'
        },
        onDelete: 'CASCADE'
    },

    // Ngày trở thành bạn bè
    friendship_date: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'friendship_date'
    },

    // Đánh dấu bạn thân / yêu thích
    is_favorite: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'is_favorite'
    },

    // Ghi chú cá nhân về người bạn này
    notes: {
        type: DataTypes.STRING(500),
        allowNull: true,
        field: 'notes'
    }

}, {
    tableName: 'friends',
    timestamps: false,
    freezeTableName: true,
    indexes: [
        { fields: ['user_id'], name: 'idx_friends_user_id' },
        { fields: ['friend_id'], name: 'idx_friends_friend_id' },
        { fields: [{ attribute: 'friendship_date', order: 'DESC' }], name: 'idx_friends_friendship_date' },
        { fields: ['user_id', 'is_favorite'], name: 'idx_friends_favorite' },
        // Đảm bảo mỗi cặp (user_id, friend_id) là duy nhất
        { unique: true, fields: ['user_id', 'friend_id'], name: 'uq_friends_pair' }
    ]
});

// Associations
Friends.associate = (models) => {
    // user_id → User
    Friends.belongsTo(models.User, {
        foreignKey: 'user_id',
        as: 'user'
    });

    // friend_id → User
    Friends.belongsTo(models.User, {
        foreignKey: 'friend_id',
        as: 'friend'
    });
};

module.exports = Friends;