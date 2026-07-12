const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { S3Client } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage'); 
const { PassThrough } = require('stream'); // 🚀 1. 新增：引入 Node 原生中转流

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
const R2_PUBLIC_URL = 'https://video.mless.cc.cd';

// Custom storage engine — images to Cloudinary, videos to R2
const customStorage = {
    _handleFile: async (req, file, cb) => {
        try {
            const isVideo = file.mimetype.startsWith('video/');

            if (isVideo) {
                const fileExt = file.originalname.split('.').pop();
                const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`;

                // 🚀 2. 核心修复：创建中转蓄水池
                const passThroughStream = new PassThrough();
                // 把 Multer 的推流管子，接到蓄水池上
                file.stream.pipe(passThroughStream);

                // 捕获流传输过程中的错误
                file.stream.on('error', cb);

                const parallelUploads3 = new Upload({
                    client: r2Client,
                    params: {
                        Bucket: R2_BUCKET,
                        Key: filename,
                        Body: passThroughStream, // ✅ 3. 改为把蓄水池给 AWS SDK 消费
                        ContentType: file.mimetype
                    }
                });

                // 等待 AWS SDK 彻底把蓄水池里的数据搬运完成到 R2
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