const mongoose = require("mongoose");

const problemSchema = new mongoose.Schema(
  {
    labId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lab",
      required: true,
    },

    title: { type: String, required: true },
    description: { type: String, required: true },

    // ✅ NEW (optional but matches document)
    expectedOutput: { type: String },
    hints: [{ type: String }],
    helperLinks: [{ type: String }],

    maxMarks: { type: Number, default: 10 },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Problem", problemSchema);
