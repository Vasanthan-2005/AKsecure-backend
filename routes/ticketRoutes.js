import express from 'express';
import {
  createTicket,
  getTickets,
  getTicketById,
  updateTicket,
  addComment,
  markReplyAsSeen,
  markTicketsAsViewed,
  deleteTicket
} from '../controllers/ticketController.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { upload } from '../config/cloudinary.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Create ticket (with image upload support - max 5 images)
router.post('/', upload.array('images', 5), createTicket);

// Get all tickets (admin sees all, user sees their own)
router.get('/', getTickets);

// Get single ticket
router.get('/:id', getTicketById);

// Update ticket (admin only)
router.put('/:id', adminOnly, updateTicket);

// Delete ticket (admin only)
router.delete('/:id', deleteTicket);

// Add comment to ticket (with optional image upload support - max 3 images)
router.post('/:id/comments', upload.array('images', 3), addComment);

// Mark admin reply as seen
router.put('/:ticketId/replies/:timelineIndex/seen', markReplyAsSeen);

// Mark tickets as viewed by admin
router.post('/mark-viewed', adminOnly, markTicketsAsViewed);

export default router;




