import mongoose from 'mongoose';

const eventDetailSchema = new mongoose.Schema(
  {
    eventId: { type: Number, required: true, unique: true },
    description: { type: String, default: '' },
    location: { type: String, default: '' },
    posterUrl: { type: String, default: '' },
    updatedBy: { type: String, lowercase: true },
  },
  {
    timestamps: true,
    // Jangan kirim field internal MongoDB (_id, __v) ke client.
    toJSON: { versionKey: false, transform: (_doc, ret) => { delete ret._id; return ret; } },
  }
);

export const EventDetail = mongoose.model('EventDetail', eventDetailSchema);
