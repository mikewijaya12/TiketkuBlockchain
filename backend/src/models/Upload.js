import mongoose from 'mongoose';

// Catat siapa pengunggah tiap poster, supaya EO tidak bisa memakai poster milik EO lain.
const uploadSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    owner: { type: String, required: true, lowercase: true, index: true },
  },
  { timestamps: true }
);

export const Upload = mongoose.model('Upload', uploadSchema);
