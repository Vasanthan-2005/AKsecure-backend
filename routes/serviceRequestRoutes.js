import express from 'express';
import {
  createServiceRequest,
  getServiceRequests,
  getServiceRequestById,
  updateServiceRequest,
  addComment,
  markReplyAsSeen,
  deleteServiceRequest
} from '../controllers/serviceRequestController.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { upload } from '../config/cloudinary.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Create service request (with image upload support - max 5 images)
router.post('/', upload.array('images', 5), createServiceRequest);

// Get all service requests (admin sees all, user sees their own)
router.get('/', getServiceRequests);

// Get single service request
router.get('/:id', getServiceRequestById);

// Update service request (admin only)
router.put('/:id', adminOnly, updateServiceRequest);

// Delete service request (admin only)
router.delete('/:id', deleteServiceRequest);

// Add comment to service request (with optional image upload support - max 3 images)
router.post('/:id/comments', upload.array('images', 3), addComment);

// Mark admin reply as seen
router.put('/:requestId/replies/:timelineIndex/seen', markReplyAsSeen);

export default router;








