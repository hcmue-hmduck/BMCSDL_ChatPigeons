const { DataTypes } = require('sequelize');
const { sequelize } = require('../configs/sequelizeConfig');

// Định nghĩa model User với Sequelize
const User = sequelize.define('User', {
    // Primary Key
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        field: 'id'
    },

    // Email
    email: {
        type: DataTypes.STRING(100),
        allowNull: true,
        unique: true,
        field: 'email',
        validate: {
            isEmail: true
        }
    },

    // Bot name
    bot_name: {
        type: DataTypes.STRING(50),
        allowNull: true,
        unique: true,
        field: 'bot_name'
    },

    // Is Bot
    is_bot: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'is_bot'
    },

    // Password Hash
    password_hash: {
        type: DataTypes.STRING(250),
        allowNull: true,
        field: 'password_hash'
    },

    // Full Name
    full_name: {
        type: DataTypes.STRING(250),
        allowNull: true,
        field: 'full_name'
    },

    // Bio
    bio: {
        type: DataTypes.STRING(500),
        allowNull: true,
        field: 'bio'
    },

    // Avatar URL
    avatar_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
        field: 'avatar_url'
    },

    // Phone Number
    phone_number: {
        type: DataTypes.STRING(20),
        allowNull: true,
        unique: true,
        field: 'phone_number'
    },

    birthday: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'birthday'
    },

    gender: {
        type: DataTypes.STRING(10),
        allowNull: true,
        field: 'gender'
    },

    // Status
    status: {
        type: DataTypes.STRING(20),
        defaultValue: 'offline',
        field: 'status',
        validate: {
            isIn: [['online', 'offline', 'away', 'busy']]
        }
    },

    // Role
    role: {
        type: DataTypes.STRING(20),
        defaultValue: 'user',
        field: 'role',
        validate: {
            isIn: [['user', 'admin']]
        }
    },

    // Is Active
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: 'is_active'
    },

    // Is Email Verified
    is_email_verified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'is_email_verified'
    },

    // Is Phone Verified
    is_phone_verified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'is_phone_verified'
    },

    // Last Online At
    last_online_at: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'last_online_at'
    },

    // Created At
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: false,
        field: 'created_at'
    },

    // Updated At
    updated_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: true,
        field: 'updated_at'
    }
}, {
    // Cấu hình bảng
    tableName: 'users',
    schema: 'ChatPigeons',
    timestamps: false,
    freezeTableName: true,
    indexes: [
        { fields: ['email'] },
        { fields: ['phone_number'] },
        { fields: ['status'] }
    ]
});

// Instance methods
User.prototype.toJSON = function () {
    const values = { ...this.get() };
    values.hasPassword = !!values.password_hash; // true nếu có password_hash, ngược lại false
    delete values.password_hash;  // Không trả về password
    return values;
};

// Class methods
User.findByEmail = async function (email) {
    return await this.findOne({ where: { email: email } });
};

User.findByPhone = async function (phoneNumber) {
    return await this.findOne({ where: { phone_number: phoneNumber } });
};

User.findActiveUsers = async function () {
    return await this.findAll({ where: { is_active: true } });
};

User.findOnlineUsers = async function () {
    return await this.findAll({ where: { status: 'online' } });
};


module.exports = User;
