// backend/middleware/upload.js
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary (same as before, but now in a separate file)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure multer and multer-storage-cloudinary (also same as before)
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'mini-forum-uploads', // Optional: Organize uploads in a folder
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif'], // Allowed file types
  },
});

const upload = multer({ storage: storage });

module.exports = upload; // Export the configured multer middleware
