const { Sequelize } = require('sequelize');
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

// Cấu hình Sequelize cho SQL Server
// Lắp ghép chuỗi kết nối theo định dạng URL (yêu cầu của Sequelize)
const connectionString = `mssql://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOST}/${process.env.DB_NAME}?instanceName=${process.env.DB_INSTANCE}&encrypt=false&trustServerCertificate=true`;

const sequelize = new Sequelize(
    connectionString,
    {
        dialect: 'mssql',
        timezone: '+07:00', // Asia/Ho_Chi_Minh
        logging: false, // Tắt log truy vấn để terminal sạch hơn
        dialectOptions: {
            options: {
                encrypt: false,
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
            idle: 10000
        },
        define: {
            schema: 'dbo' 
        }
    }
);

module.exports = { sequelize };
