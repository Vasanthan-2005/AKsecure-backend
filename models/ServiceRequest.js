import mongoose from 'mongoose';

const serviceRequestSchema = new mongoose.Schema({
  requestId: {
    type: String,
    required: true,
    unique: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  category: {
    type: String,
    enum: ['CCTV', 'Fire Alarm', 'Security Alarm', 'Intruder Alarm', 'Electrical', 'Plumbing', 'Air Conditioning'],
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  images: [{
    type: String,
    trim: true
  }],
  status: {
    type: String,
    enum: ['New', 'In Progress', 'Completed', 'Rejected'],
    default: 'New'
  },
  preferredVisitAt: {
    type: Date
  },
  assignedVisitAt: {
    type: Date
  },
  completedAt: {
    type: Date
  },
  timeline: [{
    note: {
      type: String,
      required: true,
      trim: true
    },
    images: [{
      type: String,
      trim: true
    }],
    addedBy: {
      type: String,
      required: true
    },
    addedAt: {
      type: Date,
      default: Date.now
    },
    seenBy: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    priceList: [{
      sNo: Number,
      description: String,
      price: Number
    }],
    totalPrice: {
      type: Number,
      default: 0
    }
  }],
  location: {
    lat: {
      type: Number,
      required: true
    },
    lng: {
      type: Number,
      required: true
    }
  },
  address: {
    type: String,
    required: true,
    trim: true
  },
  outletName: {
    type: String,
    required: true,
    trim: true
  },
  cameraType: {
    type: String,
    trim: true
  },
  cameraCount: {
    type: Number
  }
}, {
  timestamps: true
});

// Auto-generate human readable request IDs
serviceRequestSchema.pre('validate', async function (next) {
  if (!this.isNew || this.requestId) return next();

  try {
    const lastRequest = await this.constructor
      .findOne({}, { requestId: 1 })
      .sort({ createdAt: -1 })
      .lean();

    const lastSeq = lastRequest?.requestId
      ? parseInt(lastRequest.requestId.replace(/\D/g, ''), 10)
      : 0;

    const nextSeq = Number.isFinite(lastSeq) ? lastSeq + 1 : 1;
    this.requestId = `SRV-${String(nextSeq).padStart(6, '0')}`;
    next();
  } catch (err) {
    next(err);
  }
});

export default mongoose.model('ServiceRequest', serviceRequestSchema);
