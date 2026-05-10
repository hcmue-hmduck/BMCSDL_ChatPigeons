const { sequelize } = require('./src/configs/sequelizeConfig');

async function listTables() {
    try {
        console.log('Listing all tables and schemas...');
        const [results] = await sequelize.query("SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'");
        console.log('Tables found:', results.map(r => `${r.TABLE_SCHEMA}.${r.TABLE_NAME}`));
    } catch (error) {
        console.error('ERROR:', error.message);
    } finally {
        process.exit();
    }
}

listTables();
