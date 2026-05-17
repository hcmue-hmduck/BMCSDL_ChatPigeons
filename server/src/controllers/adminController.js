const { sequelize } = require('../configs/sequelizeConfig');
const SuccessResponse = require('../core/successResponse');

class AdminController {
    // GET /admin/stats - Lấy thống kê hệ thống thực tế
    async getStats(req, res, next) {
        try {
            // 1. Lấy overview stats bằng Stored Procedure trực tiếp
            const overviewResult = await sequelize.query(
                'EXEC sp_GetAdminOverviewStats',
                { type: sequelize.QueryTypes.SELECT }
            );
            const totalUsers = overviewResult[0]?.activeUsers || 0;
            const totalMessages = overviewResult[0]?.totalMessages || 0;

            // 2. Lấy daily stats bằng View trực tiếp
            const messagesByDay = await sequelize.query(
                `SELECT date, count FROM vw_DailyMessageStats 
                 WHERE date >= DATEADD(day, -7, GETDATE()) 
                 ORDER BY date ASC`,
                { type: sequelize.QueryTypes.SELECT }
            );

            // Đảm bảo kiểu dữ liệu trả về chuẩn (date là string YYYY-MM-DD)
            const formattedMessagesByDay = messagesByDay.map(item => ({
                date: item.date,
                count: Number(item.count)
            }));

            new SuccessResponse({
                message: 'Get admin stats successfully',
                metadata: {
                    totalUsers,
                    totalMessages,
                    messagesByDay: formattedMessagesByDay
                }
            }).send(res);
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new AdminController();
