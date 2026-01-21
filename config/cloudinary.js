import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check if Cloudinary is configured
const isCloudinaryConfigured =
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET;

let storage;
let upload;

if (isCloudinaryConfigured) {
  // Configure Cloudinary
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });

  // Create Cloudinary storage for multer
  storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'AKSecure', // Optional: organize uploads in a folder
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'],
      resource_type: 'auto', // Auto-detect file type (image/raw/video)
      transformation: [{ width: 1000, height: 1000, crop: 'limit' }] // Optional: resize images
    }
  });

  console.log('✅ Cloudinary configured successfully');
  console.log(`   Cloud Name: ${process.env.CLOUDINARY_CLOUD_NAME}`);
  console.log(`   Folder: AKSecure`);
} else {
  // Fallback to local storage if Cloudinary is not configured
  console.warn('⚠️ Cloudinary not configured, using local file storage');

  // Create uploads directory if it doesn't exist
  const uploadsDir = path.join(__dirname, '../uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
  });
}

// File filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp|pdf/;
  const extname = allowedTypes.test(file.originalname.toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype) || file.mimetype === 'application/pdf';

  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(new Error('Only image files and PDFs are allowed!'), false);
  }
};

upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter
});

export { upload };
export default cloudinary;