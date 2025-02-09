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
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'mp4', 'mov', 'avi'], // Allowed file types, add video types
    resource_type: 'auto', //Indicate that the file being uploaded can be any type of resource
  },
});

//Multer storage configuration.
const fileFilter = (req, file, cb) => {
  if (['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'video/quicktime', 'video/x-msvideo'].includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type'), false);
  }
};

//Multer configuration.
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024,  // 100MB limit (adjust as needed). This is very important!
  }
});

module.exports = upload; // Export the configured multer middleware
