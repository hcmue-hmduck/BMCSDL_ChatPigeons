const conversationsService = require('../services/conversationsService');
const SuccessResponse = require('../core/successResponse');

class ConversationsController {
    // GET /admin/conversations - Lấy tất cả conversations
    async getAllConversations(req, res, next) {
        const allConversations = await conversationsService.getAllConversations();
        new SuccessResponse({
            message: 'Get all conversations successfully',
            metadata: allConversations,
        }).send(res)
    }   
    // GET /admin/conversations/:id - Lấy conversation theo ID
    async getConversationById(req, res) {
        const conversation = await conversationsService.getConversationById(req.params.id);
        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found'
            });
        }
        
        new SuccessResponse({
            message: 'Get conversation successfully',
            metadata: conversation,
        }).send(res)
    }

    // POST /admin/conversations - Tạo conversation mới
    async createConversation(req, res) {
        const newConversation = await conversationsService.createConversation(req.body);
        new SuccessResponse({
            message: 'Create conversation successfully',
            metadata: newConversation,
        }).send(res)
    }

    // PUT /admin/conversations/:id - Cập nhật conversation
    async updateConversation(req, res) {
        const updatedConversation = await conversationsService.updateConversation(req.params.id, req.body);
        if (!updatedConversation) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found'
            });
        }
        new SuccessResponse({
            message: 'Update conversation successfully',
            metadata: updatedConversation,
        }).send(res)
    }

    // DELETE /admin/conversations/:id - Xóa conversation
    async deleteConversation(req, res) {
        const isDeleted = await conversationsService.deleteConversation(req.params.id);
        if (!isDeleted) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found'
            });
        }
        new SuccessResponse({
            message: 'Delete conversation successfully',
        }).send(res)
    }
}

module.exports = new ConversationsController();