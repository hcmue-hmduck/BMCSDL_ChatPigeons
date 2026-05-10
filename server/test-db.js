const { sequelize } = require('./src/configs/sequelizeConfig');

async function testQuery() {
    try {
        console.log('Testing query on participants...');
        const [results] = await sequelize.query('SELECT TOP 1 * FROM dbo.participants');
        console.log('Participants query success:', results);
        
        console.log('Testing query on userblocks...');
        const [results2] = await sequelize.query('SELECT TOP 1 * FROM dbo.userblocks');
        console.log('Userblocks query success:', results2);
    } catch (error) {
        console.error('SQL TEST ERROR:', error.message);
        if (error.parent) {
            console.error('ORIGINAL ERROR:', error.parent.message);
        }
    } finally {
        process.exit();
    }
}

testQuery();
