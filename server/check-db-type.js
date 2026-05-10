const { sequelize } = require('./src/configs/sequelizeConfig');

async function checkTable() {
    try {
        const [results] = await sequelize.query(`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'calls' AND COLUMN_NAME IN ('started_at', 'created_at', 'updated_at')
        `);
        console.log('--- Cấu trúc bảng calls hiện tại ---');
        console.table(results);
        process.exit(0);
    } catch (error) {
        console.error('Lỗi khi kiểm tra:', error);
        process.exit(1);
    }
}

checkTable();
