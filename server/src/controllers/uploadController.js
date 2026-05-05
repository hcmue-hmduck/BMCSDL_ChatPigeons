const uploadService = require('../services/uploadService');
const SuccessResponse = require('../core/successResponse');
const cloudinary = require('../configs/cloudinaryConfig');
const fs = require('fs');

class CloudinaryController {
    extractFiles(req) {
        const uploadedFields = req.files || {};
        return [...(uploadedFields.files || [])];
    }

    normalizeOriginalName(rawName) {
        try {
            return Buffer.from(rawName || '', 'latin1').toString('utf8').normalize('NFC');
        } catch {
            return rawName || 'file';
        }
    }

    getFormatFromNameOrUrl(originalName, secureUrl) {
        const fromName = (originalName || '').split('.').pop();
        if (fromName) return fromName.toLowerCase();

        try {
            const cleanUrl = (secureUrl || '').split('?')[0];
            const last = cleanUrl.split('/').pop() || '';
            const fromUrl = last.split('.').pop();
            return (fromUrl || 'bin').toLowerCase();
        } catch {
            return 'bin';
        }
    }

    buildDownloadUrl(result, originalName) {
        return result?.secure_url || '';
    }

    buildFileResponse(result, file) {
        const originalName = this.normalizeOriginalName(file.originalname);
        const ext = result.format || file.originalname.split('.').pop() || 'bin';
        const downloadUrl = this.buildDownloadUrl(result, originalName);
        const thumbnailUrl = result.resource_type === 'image'
            ? result.secure_url.replace('/upload/', '/upload/w_200,c_scale/')
            : (result.format
                ? result.secure_url.replace('.' + result.format, '.jpg')
                : result.secure_url);

        return {
            url: result.secure_url,
            download_url: downloadUrl,
            file_size: result.bytes,
            file_name: originalName,
            thumbnail_url: thumbnailUrl,
            public_id: result.public_id,
            resource_type: result.resource_type,
            format: ext,
            duration: result.duration || 0
        };
    }

    async uploadFilesBatch(files, uploadOptions, logPrefix) {
        const uploadPromises = files.map(async (file) => {
            try {
                // Cloudinary Free tier limits safeguard
                const resourceType = uploadService.constructor.getResourceType(file.originalname);
                const isRaw = resourceType === 'raw';
                const maxSize = isRaw ? 10 * 1024 * 1024 : 100 * 1024 * 1024; // 10MB for raw, 100MB for others/video

                if (file.size > maxSize) {
                    const typeLabel = isRaw ? 'tài liệu/nén' : 'tệp tin';
                    const limitLabel = isRaw ? '10MB' : '100MB';
                    throw new Error(`Kích thước ${typeLabel} vượt quá giới hạn Cloudinary (${limitLabel}). Vui lòng nâng cấp gói hoặc giảm dung lượng.`);
                }

                const result = await uploadService.uploadToCloudinary(file.path, {
                    ...uploadOptions,
                    originalName: file.originalname
                });
                return result;
            } catch (error) {
                console.error(`${logPrefix} single-file error:`, {
                    file: file.originalname,
                    message: error?.message,
                    http_code: error?.http_code,
                    name: error?.name
                });
                throw error;
            } finally {
                // Dọn dẹp file tạm trên server ngay khi xử lý xong (thành công hoặc thất bại)
                if (file.path && fs.existsSync(file.path)) {
                    try {
                        fs.unlinkSync(file.path);
                    } catch (err) {
                        console.error(`${logPrefix} unlink error:`, err.message);
                    }
                }
            }
        });

        const uploadResults = await Promise.all(uploadPromises);
        return uploadResults.map((result, i) => this.buildFileResponse(result, files[i]));
    }

    logRequestError(logPrefix, error) {
        console.error(`${logPrefix} error:`, {
            message: error?.message,
            http_code: error?.http_code,
            name: error?.name,
            error
        });
    }

    async handleUpload(req, res, uploadOptions, logPrefix) {
        try {
            const files = this.extractFiles(req);

            if (!files.length) {
                return res.status(400).json({
                    message: 'No files uploaded',
                    hint: 'Send files with field name "files" in multipart/form-data',
                });
            }

            const uploadedFiles = await this.uploadFilesBatch(files, uploadOptions, logPrefix);
            console.log('uploadedFiles', uploadedFiles);

            new SuccessResponse({
                message: `${uploadedFiles.length} file(s) uploaded successfully`,
                metadata: {
                    files: uploadedFiles
                }
            }).send(res);
        } catch (error) {
            this.logRequestError(logPrefix, error);
            res.status(500).json({ message: 'File upload failed', error: error.message });
        }
    }

    async uploadFile(req, res) {
        return this.handleUpload(req, res, { convID: req.params.convID }, 'uploadFile');
    }

    async uploadFileFeeds(req, res) {
        return this.handleUpload(req, res, { feedID: req.params.feedID }, 'uploadFileFeeds');
    }
}

module.exports = new CloudinaryController();