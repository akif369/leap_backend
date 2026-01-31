const mongoose = require("mongoose");

// ProjectFile schema (editor files)
const projectFileSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    content: { type: String, required: true },
    type: { type: String, enum: ["file", "folder"], default: "file" },
    path: { type: String, required: true },
    isReadonly: { type: Boolean, default: false },
  },
  { _id: false }
);

const submissionSchema = new mongoose.Schema(
  {
    experimentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Problem", // your Problem = frontend Experiment
      required: true,
    },

    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    status: {
      type: String,
      enum: ["draft", "submitted", "validated"],
      default: "draft",
    },

    files: {
      type: [projectFileSchema],
      default: [],
    },

    score: {
      type: Number,
      default: null,
    },

    feedback: {
      type: String,
    },

    evaluatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    lastSaved: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// 🔒 One submission per student per experiment
submissionSchema.index(
  { experimentId: 1, studentId: 1 },
  { unique: true }
);

module.exports = mongoose.model("Submission", submissionSchema);
