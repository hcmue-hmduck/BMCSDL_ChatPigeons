const { DataTypes } = require('sequelize');
const { sequelize } = require('../configs/sequelizeConfig');

const GroupJoinRequest = sequelize.define('GroupJoinRequest', {
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
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
        validate: {
            isIn: [['pending', 'approved', 'rejected']]
        },
        field: 'status'
    },
    note: {
        type: DataTypes.STRING(500),
        allowNull: true,
        field: 'note'
    },
    processed_by: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'processed_by'
    },
    created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'created_at'
    },
    updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'updated_at'
    }
}, {
    tableName: 'GroupJoinRequests',
    timestamps: false,
    createdAt: false,
    updatedAt: false,
    freezeTableName: true
});

GroupJoinRequest.associate = (models) => {
    GroupJoinRequest.belongsTo(models.User, {
        foreignKey: 'user_id',
        as: 'user'
    });
    GroupJoinRequest.belongsTo(models.Conversation, {
        foreignKey: 'conversation_id',
        as: 'group'
    });
    GroupJoinRequest.belongsTo(models.User, {
        foreignKey: 'processed_by',
        as: 'processor'
    });
};

module.exports = GroupJoinRequest;
