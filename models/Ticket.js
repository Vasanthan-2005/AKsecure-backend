import mongoose from 'mongoose';

const ticketSchema = new mongoose.Schema({
  ticketId: {
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
    enum: ['CCTV', 'Fire Alarm', 'Security Alarm', 'Electrical', 'Plumbing', 'Air Conditioning'],
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
    enum: ['New', 'In Progress', 'Closed'],
    default: 'New'
  },
  preferredVisitAt: {
    type: Date
  },
  assignedVisitAt: {
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
    }]
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
  viewedByAdmin: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});


// Auto-generate human readable ticket IDs (run before validation)
ticketSchema.pre('validate', async function (next) {
  if (!this.isNew || this.ticketId) return next();

  try {
    const lastTicket = await this.constructor
      .findOne({}, { ticketId: 1 })
      .sort({ createdAt: -1 })
      .lean();

    const lastSeq = lastTicket?.ticketId
      ? parseInt(lastTicket.ticketId.replace(/\D/g, ''), 10)
      : 0;

    const nextSeq = Number.isFinite(lastSeq) ? lastSeq + 1 : 1;
    this.ticketId = `TKT-${String(nextSeq).padStart(6, '0')}`;
    next();
  } catch (err) {
    next(err);
  }
});

export default mongoose.model('Ticket', ticketSchema);

