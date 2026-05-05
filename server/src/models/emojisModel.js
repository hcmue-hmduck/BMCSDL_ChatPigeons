const { DataTypes } = require('sequelize');
const { sequelize } = require('../configs/sequelizeConfig');

/**
 * Model Emojis
 * Matches the SQL script for 'emojis' table
 */
const Emojis = sequelize.define('Emojis', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        field: 'id'
    },
    unicode_char: {
        type: DataTypes.STRING(10),
        allowNull: false,
        field: 'unicode_char'
    },
    name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        field: 'name'
    },
    shortcode: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        field: 'shortcode'
    },
    category: {
        type: DataTypes.STRING(50),
        allowNull: true,
        field: 'category'
    },
    keywords: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'keywords'
    },
    image_url: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'image_url'
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: true,
        field: 'created_at'
    }
}, {
    tableName: 'emojis',
    schema: 'ChatPigeons',
    timestamps: false,
    freezeTableName: true,
    indexes: [
        {
            name: 'idx_emojis_shortcode',
            unique: true,
            fields: ['shortcode']
        },
        {
            name: 'idx_emojis_category',
            fields: ['category']
        }
    ]
});

module.exports = Emojis;