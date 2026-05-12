import mongoose from "mongoose";

const savedJobSchema = new mongoose.Schema(
  {
    userEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
    sourceJobId: { type: String, required: true, trim: true },
    title: { type: String, default: "", trim: true },
    company: { type: String, default: "", trim: true },
    location: { type: String, default: "", trim: true },
    type: { type: String, default: "", trim: true },
    salary: { type: String, default: "", trim: true },
    description: { type: String, default: "" },
    url: { type: String, default: "" },
  },
  { timestamps: true }
);

savedJobSchema.index({ userEmail: 1, sourceJobId: 1 }, { unique: true });

const SavedJob = mongoose.model("SavedJob", savedJobSchema);

export default SavedJob;
