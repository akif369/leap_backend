const mongoose = require("mongoose");

const vivaQuestionItemSchema = new mongoose.Schema(
  {
    question: { type: String, required: true },
    options: {
      type: [String],
      validate: {
        validator: (value) => Array.isArray(value) && value.length >= 2 && value.length <= 6,
        message: "Options must contain between 2 and 6 choices",
      },
      required: true,
    },
    correctOptionIndex: { type: Number, required: true, min: 0 },
    explanation: { type: String, default: "" },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: "medium",
    },
  },
  { _id: false }
);

const vivaQuestionSchema = new mongoose.Schema(
  {
    experimentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Problem",
      required: true,
      index: true,
    },
    setNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    questions: {
      type: [vivaQuestionItemSchema],
      validate: {
        validator: (value) => Array.isArray(value) && value.length === 5,
        message: "Each viva set must contain exactly 5 questions",
      },
      required: true,
    },
    source: {
      type: String,
      enum: ["ai", "custom"],
      default: "custom",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

vivaQuestionSchema.index(
  { experimentId: 1, setNumber: 1 },
  { unique: true, partialFilterExpression: { setNumber: { $exists: true } } }
);

module.exports = mongoose.model("VivaQuestion", vivaQuestionSchema);
