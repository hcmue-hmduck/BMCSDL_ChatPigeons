const { DataTypes } = require('sequelize');
const { sequelize } = require('../configs/sequelizeConfig');

const Call = sequelize.define('Call', {
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
    caller_id: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'caller_id'
    },
    call_type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'direct',
        field: 'call_type',
        validate: {
            isIn: [['direct', 'group']]
        }
    },
    media_type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'video',
        field: 'media_type',
        validate: {
            isIn: [['video', 'audio']]
        }
    },
    started_at: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'started_at'
    },
    ended_at: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'ended_at'
    },
    duration_seconds: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'duration_seconds'
    },
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
        field: 'status',
        validate: {
            isIn: [['pending', 'ongoing', 'completed', 'missed', 'declined', 'cancelled']]
        }
    },
    created_at: {
        type: DataTypes.DATE,
        field: 'created_at'
    },
    updated_at: {
        type: DataTypes.DATE,
        field: 'updated_at'
    },
}, {
    tableName: 'calls',
    timestamps: false,
    freezeTableName: true,
    underscored: true
});

// Associate với Messages
Call.associate = (models) => {
    Call.hasMany(models.Message, {
        foreignKey: 'call_id',
        as: 'messages'
    });
};

module.exports = Call;
