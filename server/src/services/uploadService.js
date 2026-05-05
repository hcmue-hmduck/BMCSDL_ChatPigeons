const { get } = require('http');
const cloudinary = require('../configs/cloudinaryConfig');

class UploadService {
    static FILE_TYPES = {
        IMAGES: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'tif'],
        VIDEOS: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', 'mpeg', 'mpg'],
        AUDIOS: ['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a'],
        DOCUMENTS: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'],
        ARCHIVES: ['zip', 'rar', '7z', 'tar', 'gz']
    };

    static getResourceType(filename) {
        const extension = filename.split('.').pop().toLowerCase();

        if (this.FILE_TYPES.IMAGES.includes(extension)) return 'image';
        if (this.FILE_TYPES.VIDEOS.includes(extension)) return 'video';
        if (this.FILE_TYPES.AUDIOS.includes(extension)) return 'video';
        if (this.FILE_TYPES.DOCUMENTS.includes(extension)) return 'raw';
        if (this.FILE_TYPES.ARCHIVES.includes(extension)) return 'raw';

        return 'auto';
    }

    removeAccents(str) {
        return str.normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd').replace(/Đ/g, 'D');
    }

    toSafeFileName(fileName) {
        const parts = fileName.split('.');
        if (parts.length > 1) parts.pop(); // Remove extension
        const baseName = parts.join('.');
        return this.removeAccents(baseName)
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '') || 'file';
    }

    async uploadToCloudinary(filePath, options = {}) {
        const path = require('path');
        console.log('options', options);
        let folderPath = 'chatPigeons';
        let fileType = this.constructor.getResourceType(options.originalName || filePath);
        if (fileType === 'raw') {
            fileType = 'file'
        }

        fileType = fileType + 's';
        
        if (options.convID) {
            if (options.convID.startsWith('avatars')) {
                folderPath += `/avatars/${options.convID.split(':')[1]}`;
            } else {
                folderPath += `/conversations/${options.convID}/${fileType}`;
            }
        } else if (options.feedID) {
            folderPath += `/feeds/${options.feedID}`;
        }

        const originalName = options.originalName || path.basename(filePath);
        const resourceType = this.constructor.getResourceType(originalName);
        const safeBase = this.toSafeFileName(originalName);
        const generatedPublicId = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeBase}`;

        const tryUpload = (uploadOptions) => new Promise((resolve, reject) => {
            cloudinary.uploader.upload(filePath, uploadOptions, (error, result) => {
                if (error) return reject(error);
                resolve(result);
            });
        });

        const attempts = [
            {
                folder: folderPath,
                resource_type: resourceType,
                public_id: options.public_id || generatedPublicId,
                overwrite: true
            },
            {
                folder: folderPath,
                resource_type: resourceType,
                overwrite: true
            },
            {
                folder: folderPath,
                resource_type: 'auto',
                overwrite: true
            }
        ];

        let lastError;
        for (const opts of attempts) {
            try {
                console.log('opts', opts);
                return await tryUpload(opts);
            } catch (error) {
                lastError = error;
            }
        }

        throw lastError;
    }
}

module.exports = new UploadService();