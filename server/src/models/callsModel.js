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
        field: 'started_at',
        get() {
            const rawValue = this.getDataValue('started_at');
            if (!rawValue) return null;
            const d = new Date(rawValue);
            const pad = n => n.toString().padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${d.getMilliseconds().toString().padStart(3, '0')}`;
        }
    },
    ended_at: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'ended_at',
        get() {
            const rawValue = this.getDataValue('ended_at');
            if (!rawValue) return null;
            const d = new Date(rawValue);
            const pad = n => n.toString().padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${d.getMilliseconds().toString().padStart(3, '0')}`;
        }
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
        field: 'created_at',
        get() {
            const rawValue = this.getDataValue('created_at');
            if (!rawValue) return null;
            const d = new Date(rawValue);
            const pad = n => n.toString().padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${d.getMilliseconds().toString().padStart(3, '0')}`;
        }
    },
    updated_at: {
        type: DataTypes.DATE,
        field: 'updated_at',
        get() {
            const rawValue = this.getDataValue('updated_at');
            if (!rawValue) return null;
            const d = new Date(rawValue);
            const pad = n => n.toString().padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${d.getMilliseconds().toString().padStart(3, '0')}`;
        }
    },
}, {
    tableName: 'calls',
    timestamps: true,
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
