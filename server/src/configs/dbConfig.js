const { sequelize } = require('./sequelizeConfig');
require('dotenv').config();

async function connectToDB() {
    try {
        await sequelize.authenticate();
        console.log('SQL Server (MSSQL) connected successfully.');
    } catch (err) {
        console.error('SQL Server connection error:', err.message);
        throw new Error('Failed to connect to SQL Server.');
    }
}

module.exports = {
    connectToDB,
};