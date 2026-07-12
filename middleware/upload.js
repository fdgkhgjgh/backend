const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { S3Client } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage'); // 引入 AWS 官方流式上传库

// Configure Cloudinary for images
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure Cloudflare R2 for videos
const r2Client = new S3Client({
    region: 'auto',
    endpoint: `https://1f4ecb5c1d43ebcdd818fe26e5d8d02f.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
    }
});

const R2_BUCKET = 'miniless-videos';
// ✅ 1. 修正为国内畅通无阻的自定义域名
const R2_PUBLIC_URL = 'https://video.mless.cc.cd';

// Custom storage engine — images to Cloudinary, videos to R2
const customStorage = {
    _handleFile: async (req, file, cb) => {
        try {
            const isVideo = file.mimetype.startsWith('video/');

            if (isVideo) {
                // ✅ 2. 优化：规避文件名中可能存在的中文或特殊字符引发的 URL 编码问题
                const fileExt = file.originalname.split('.').pop();
                const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`;

                // ✅ 3. 优化：使用流式上传（Streaming），视频直接管道输送给 R2，零内存占用
                const parallelUploads3 = new Upload({
                    client: r2Client,
                    params: {
                        Bucket: R2_BUCKET,
                        Key: filename,
                        Body: file.stream, // 直接传递流，不再缓存成 Buffer
                        ContentType: file.mimetype
                    }
                });

                await parallelUploads3.done();

                cb(null, {
                    path: `${R2_PUBLIC_URL}/${filename}`,
                    filename: filename
                });
            } else {
                // Upload image to Cloudinary
                const uploadStream = cloudinary.uploader.upload_stream(
                    { folder: 'mini-forum-uploads', resource_type: 'image' },
                    (error, result) => {
                        if (error) return cb(error);
                        cb(null, {
                            path: result.secure_url,
                            filename: result.public_id
                        });
                    }
                );
                file.stream.pipe(uploadStream);
            }
        } catch (err) {
            cb(err);
        }
    },
    _removeFile: (req, file, cb) => {
        cb(null);
    }
};

const fileFilter = (req, file, cb) => {
    if ([
        'image/jpeg', 'image/png', 'image/gif',
        'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'
    ].includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type'), false);
    }
};

const upload = multer({
    storage: customStorage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB
    }
});

module.exports = upload;
