import ServiceRequest from '../models/ServiceRequest.js';
import User from '../models/User.js';
import { sendNewServiceRequestNotification, sendServiceRequestConfirmation, sendServiceRequestReplyNotification } from '../config/email.js';

export const createServiceRequest = async (req, res) => {
  try {
    const { category, title, description, preferredVisitAt, address, outletName, location } = req.body;
    const userId = req.user._id;

    if (!category || !title || !description || !address || !outletName || !location) {
      return res.status(400).json({ message: 'Please provide category, title, description, address, outlet name and location' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const images = req.files ? req.files.map(file => {
      if (file.path && typeof file.path === 'string' && file.path.startsWith('http')) {
        return file.path;
      }
      if (file.secure_url) {
        return file.secure_url;
      }
      if (file.url) {
        return file.url;
      }
      return `/uploads/${file.filename}`;
    }) : [];

    const serviceRequest = await ServiceRequest.create({
      userId,
      category,
      title,
      description,
      images,
      preferredVisitAt: preferredVisitAt || null,
      address,
      outletName,
      location: {
        lat: location.lat,
        lng: location.lng
      }
    });

    const populatedRequest = await ServiceRequest.findById(serviceRequest._id).populate('userId', 'name companyName email phone');

    // Send emails in background (non-blocking)
    setImmediate(async () => {
      try {
        await sendNewServiceRequestNotification(populatedRequest, user);
        await sendServiceRequestConfirmation(populatedRequest, user);
      } catch (emailError) {
        console.error('Email sending failed:', emailError);
      }
    });

    res.status(201).json(populatedRequest);
  } catch (error) {
    console.error('Create service request error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const getServiceRequests = async (req, res) => {
  try {
    const userId = req.user._id;
    const role = req.user.role;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = {};
    if (role !== 'admin') {
      query.userId = userId;
    }

    const [requests, total] = await Promise.all([
      ServiceRequest.find(query)
        .populate('userId', 'name companyName email phone address location')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ServiceRequest.countDocuments(query)
    ]);

    res.json({
      requests,
      total,
      page,
      pages: Math.ceil(total / limit),
      hasMore: page * limit < total
    });
  } catch (error) {
    console.error('Get service requests error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const getServiceRequestById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const role = req.user.role;

    const serviceRequest = await ServiceRequest.findById(id).populate('userId', 'name companyName email phone address location');

    if (!serviceRequest) {
      return res.status(404).json({ message: 'Service request not found' });
    }

    if (role !== 'admin' && serviceRequest.userId._id.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(serviceRequest);
  } catch (error) {
    console.error('Get service request error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const updateServiceRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, assignedVisitAt } = req.body;
    const role = req.user.role;

    if (role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const serviceRequest = await ServiceRequest.findById(id);
    if (!serviceRequest) {
      return res.status(404).json({ message: 'Service request not found' });
    }

    const oldStatus = serviceRequest.status;
    const oldVisitAt = serviceRequest.assignedVisitAt;

    if (status) {
      if (status === 'Completed' && serviceRequest.status !== 'Completed') {
        serviceRequest.completedAt = new Date();
      } else if (status !== 'Completed' && serviceRequest.status === 'Completed') {
        serviceRequest.completedAt = null;
      }
      serviceRequest.status = status;
    }
    if (assignedVisitAt) serviceRequest.assignedVisitAt = assignedVisitAt;

    await serviceRequest.save();

    const updatedRequest = await ServiceRequest.findById(id).populate('userId', 'name companyName email phone address location');

    // Send email notification if visit time was set or status changed (in background)
    if (updatedRequest.userId && (assignedVisitAt || (status && status !== oldStatus))) {
      setImmediate(async () => {
        try {
          let replyMessage = '';

          if (assignedVisitAt && (!oldVisitAt || new Date(assignedVisitAt).getTime() !== new Date(oldVisitAt).getTime())) {
            replyMessage += `A visit has been scheduled for your service request.\n\n`;
          }

          if (status && status !== oldStatus) {
            if (status === 'Completed') {
              replyMessage += `Your service request has been completed.\n\n`;
              replyMessage += `Thank you for using our service.\n\n`;
            } else if (status === 'Rejected') {
              replyMessage += `Your service request has been rejected.\n\n`;
            } else {
              replyMessage += `Your service request status has been updated to: ${status}.\n\n`;
            }
          }

          if (replyMessage) {
            if (status !== 'Completed' && status !== 'Rejected') {
              replyMessage += `Please check your dashboard for more details.`;
            }
            await sendServiceRequestReplyNotification(updatedRequest, updatedRequest.userId, replyMessage, assignedVisitAt || null, status === 'Completed' || status === 'Rejected');
          }
        } catch (emailError) {
          console.error('Email sending failed:', emailError);
        }
      });
    }

    res.json(updatedRequest);
  } catch (error) {
    console.error('Update service request error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const addComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { note, priceList, totalPrice } = req.body;
    const userId = req.user._id;
    const role = req.user.role;

    if (!note) {
      return res.status(400).json({ message: 'Please provide a note' });
    }

    const serviceRequest = await ServiceRequest.findById(id);
    if (!serviceRequest) {
      return res.status(404).json({ message: 'Service request not found' });
    }

    if (role !== 'admin' && serviceRequest.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Get image URLs from uploaded files (Cloudinary or local)
    const images = req.files ? req.files.map(file => {
      if (file.path && typeof file.path === 'string' && file.path.startsWith('http')) {
        return file.path;
      }
      if (file.secure_url) {
        return file.secure_url;
      }
      if (file.url) {
        return file.url;
      }
      return `/uploads/${file.filename}`;
    }) : [];

    const userName = req.user.name;

    // Parse priceList if it's a string (from multipart/form-data)
    let parsedPriceList = undefined;
    if (priceList) {
      try {
        parsedPriceList = typeof priceList === 'string' ? JSON.parse(priceList) : priceList;
      } catch (e) {
        console.error('Error parsing priceList:', e);
      }
    }

    serviceRequest.timeline.push({
      note,
      images: images.length > 0 ? images : undefined,
      addedBy: userName,
      seenBy: [],
      priceList: parsedPriceList,
      totalPrice: totalPrice ? Number(totalPrice) : undefined
    });

    await serviceRequest.save();

    const updatedRequest = await ServiceRequest.findById(id).populate('userId', 'name companyName email phone address location');

    // Send email notification if admin added a comment (in background)
    if (role === 'admin' && updatedRequest.userId) {
      setImmediate(async () => {
        try {
          await sendServiceRequestReplyNotification(updatedRequest, updatedRequest.userId, note, updatedRequest.assignedVisitAt || null);
        } catch (emailError) {
          console.error('Email sending failed:', emailError);
        }
      });
    }

    res.json(updatedRequest);
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Delete service request (admin or owner)
export const deleteServiceRequest = async (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;

    const serviceRequest = await ServiceRequest.findById(id);

    if (!serviceRequest) {
      return res.status(404).json({ message: 'Service request not found' });
    }

    // Allow deletion if user is admin or if user owns the request
    if (user.role !== 'admin' && serviceRequest.userId.toString() !== user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    await ServiceRequest.findByIdAndDelete(id);

    res.json({ message: 'Service request deleted successfully' });
  } catch (error) {
    console.error('Delete service request error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const markReplyAsSeen = async (req, res) => {
  try {
    const { requestId, timelineIndex } = req.params;
    const userId = req.user._id;

    const serviceRequest = await ServiceRequest.findById(requestId);
    if (!serviceRequest) {
      return res.status(404).json({ message: 'Service request not found' });
    }

    if (serviceRequest.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const timelineItem = serviceRequest.timeline[timelineIndex];
    if (!timelineItem) {
      return res.status(404).json({ message: 'Timeline item not found' });
    }

    if (!timelineItem.seenBy) {
      timelineItem.seenBy = [];
    }

    if (!timelineItem.seenBy.includes(userId)) {
      timelineItem.seenBy.push(userId);
      await serviceRequest.save();
    }

    const updatedRequest = await ServiceRequest.findById(requestId).populate('userId', 'name companyName email phone');
    res.json(updatedRequest);
  } catch (error) {
    console.error('Mark reply as seen error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};






