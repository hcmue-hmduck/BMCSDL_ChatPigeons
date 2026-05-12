const { Sequelize } = require('sequelize');
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

// Cấu hình Sequelize cho SQL Server
const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS, {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT) || 1433,
    dialect: 'mssql',
    timezone: '+07:00', // Asia/Ho_Chi_Minh
    logging: false,
    dialectOptions: {
        options: {
            encrypt: false, // Tắt mã hóa cho kết nối nội bộ
            trustServerCertificate: true,
            connectTimeout: 30000,
            useUTC: false,
        },
        typeCast: true,
    },
    pool: {
        max: 20,
        min: 0,
        acquire: 30000,
        idle: 10000,
    },
    define: {
        schema: 'dbo',
    },
});

module.exports = { sequelize };
