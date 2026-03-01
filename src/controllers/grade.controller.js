const Problem = require("../models/Problem");
const { MAX_SCORE, evaluateSubmissionWithAI } = require("../services/aiGrader.service");

exports.runAiGrade = async (req, res) => {
  try {
    const { experimentId, files, executionResult, submittedAt, expectedOutputOverride, descriptionOverride } = req.body;

    if (!experimentId || !Array.isArray(files)) {
      return res.status(400).json({ message: "experimentId and files are required" });
    }

    const experiment = await Problem.findById(experimentId);
    if (!experiment) {
      return res.status(404).json({ message: "Experiment not found" });
    }

    const gradingProblem =
      expectedOutputOverride || descriptionOverride
        ? {
            ...experiment.toObject(),
            expectedOutput:
              typeof expectedOutputOverride === "string" && expectedOutputOverride.trim()
                ? expectedOutputOverride.trim()
                : experiment.expectedOutput,
            description:
              typeof descriptionOverride === "string" && descriptionOverride.trim()
                ? descriptionOverride.trim()
                : experiment.description,
          }
        : experiment;

    const grading = await evaluateSubmissionWithAI({
      problem: gradingProblem,
      files,
      executionResult,
      submittedAt: submittedAt ? new Date(submittedAt) : new Date(),
    });

    return res.json({
      score: grading.score,
      maxScore: MAX_SCORE,
      feedback: grading.feedback,
      aiEvaluation: grading.aiEvaluation,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to run AI grading",
      error: error.message,
    });
  }
};
