const mongoose = require("mongoose");

const labSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // C Programming Lab
    subject: { type: String, required: true },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // admin / hod
      required: true,
    },

    assignedTeachers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Lab", labSchema);
