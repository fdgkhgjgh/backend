const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { Readable } = require('stream');

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
const R2_PUBLIC_URL = 'https://pub-95a4df30d1794761bd8dd751c20dadcc.r2.dev';

// Custom storage engine — images to Cloudinary, videos to R2
const customStorage = {
    _handleFile: async (req, file, cb) => {
        try {
            const isVideo = file.mimetype.startsWith('video/');

            if (isVideo) {
                // Upload video to R2
                const chunks = [];
                file.stream.on('data', chunk => chunks.push(chunk));
                file.stream.on('end', async () => {
                    const buffer = Buffer.concat(chunks);
                    const filename = `${Date.now()}-${file.originalname.replace(/\s/g, '-')}`;

                    await r2Client.send(new PutObjectCommand({
                        Bucket: R2_BUCKET,
                        Key: filename,
                        Body: buffer,
                        ContentType: file.mimetype
                    }));

                    cb(null, {
                        path: `${R2_PUBLIC_URL}/${filename}`,
                        filename: filename
                    });
                });
                file.stream.on('error', cb);
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
