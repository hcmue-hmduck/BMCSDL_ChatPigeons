const linkpreviewService = require('../services/linkpreviewService');
const SuccessResponse = require('../core/successResponse');

class LinkPreviewController {
    async getLinkPreview(req, res) {
        const linkPreview = await linkpreviewService.getLinkPreview(req.query.url);
        new SuccessResponse({
            message: 'Get link preview successfully',
            metadata: {
                linkPreview,
            },
        }).send(res);
    }
}

module.exports = new LinkPreviewController();
