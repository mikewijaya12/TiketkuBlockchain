import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    address: { type: String, required: true, unique: true, lowercase: true },
    name: { type: String, default: '' },
    email: { type: String, default: '' },
    avatarUrl: { type: String, default: '' },
  },
  {
    timestamps: true,
    // Jangan kirim field internal MongoDB (_id, __v) ke client.
    toJSON: { versionKey: false, transform: (_doc, ret) => { delete ret._id; return ret; } },
  }
);

export const User = mongoose.model('User', userSchema);
