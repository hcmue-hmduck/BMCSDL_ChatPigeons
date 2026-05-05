const { DataTypes } = require('sequelize');
const { sequelize } = require('../configs/sequelizeConfig');

const UserBlocks = sequelize.define('UserBlocks', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    blocker_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'Users',
            key: 'id'
        },
        onDelete: 'CASCADE'
    },
    blocked_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'Users',
            key: 'id'
        },
        onDelete: 'CASCADE'
    },
    reason: {
        type: DataTypes.STRING(500),
        allowNull: true
    }
}, {
    tableName: 'userblocks',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false, // Bảng SQL không có updated_at
    indexes: [
        {
            unique: true,
            fields: ['blocker_id', 'blocked_id']
        },
        {
            name: 'idx_user_blocks_blocker',
            fields: ['blocker_id']
        },
        {
            name: 'idx_user_blocks_blocked',
            fields: ['blocked_id']
        }
    ]
});

module.exports = UserBlocks;