const { Sequelize } = require('sequelize');
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

// Cấu hình Sequelize cho SQL Server
const sequelize = new Sequelize(
    process.env.POSTGRES_URL,
    {
        dialect: 'postgres',
        timezone: 'Asia/Ho_Chi_Minh',
        logging: false,  // Tắt log SQL queries để console sạch hơn
        pool: {
            max: 20,
            min: 0,
            acquire: 30000,
            idle: 10000
        },
        // dialectOptions: {
        //     ssl: {
        //         require: true,
        //         rejectUnauthorized: false
        //     },
        // },
        dialectOptions: { ssl: false },
        define: {
            schema: 'ChatPigeons'  // Mặc định tất cả model sẽ dùng schema này
        }
    }
);

module.exports = { sequelize };
