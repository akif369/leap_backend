const Submission = require("../models/Submission");
const Problem = require("../models/Problem");
const { MAX_SCORE, evaluateSubmissionWithAI } = require("../services/aiGrader.service");

const normalizeScore = (value) => {
  if (value === null || value === undefined) return value;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const adjusted = numeric > MAX_SCORE ? numeric / 10 : numeric;
  return Math.round(adjusted * 10) / 10;
};

const mapSubmission = (submission) => ({
  id: submission._id.toString(),
  studentId:
    typeof submission.studentId === "object"
      ? submission.studentId._id?.toString?.() || submission.studentId.toString()
      : submission.studentId.toString(),
  experimentId: submission.experimentId.toString(),
  status: submission.status,
  score: normalizeScore(submission.score),
  feedback: submission.feedback,
  submittedAt: submission.submittedAt,
  aiEvaluation: submission.aiEvaluation || null,
  lastSaved: submission.lastSaved,
});

/**
 * POST /api/submissions
 * Create or update a submission (draft or submitted)
 */
exports.upsertSubmission = async (req, res) => {
  try {
    const studentId = req.user.id;
    const { experimentId, status, files, executionResult } = req.body;

    if (!experimentId || !files) {
      return res.status(400).json({
        message: "experimentId and files are required",
      });
    }

    // Validate experiment
    const experiment = await Problem.findById(experimentId);
    if (!experiment) {
      return res.status(404).json({ message: "Experiment not found" });
    }

    const existing = await Submission.findOne({ experimentId, studentId });
    const nextStatus = status || existing?.status || "draft";
    const now = new Date();
    const submittedAt =
      nextStatus === "submitted"
        ? existing?.submittedAt || now
        : existing?.submittedAt || null;

    let grading = null;
    if (nextStatus === "submitted") {
      grading = await evaluateSubmissionWithAI({
        problem: experiment,
        files,
        executionResult,
        submittedAt: submittedAt || now,
      });
    }

    const effectiveStatus = grading ? "validated" : nextStatus;

    const updateDoc = {
      experimentId,
      studentId,
      files,
      status: effectiveStatus,
      lastSaved: now,
      ...(submittedAt ? { submittedAt } : {}),
      ...(grading
        ? {
            score: grading.score,
            feedback: grading.feedback,
            aiEvaluation: grading.aiEvaluation,
            evaluatedBy: null,
          }
        : {}),
    };

    const submission = await Submission.findOneAndUpdate(
      { experimentId, studentId },
      updateDoc,
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );

    return res.status(200).json({ submission: mapSubmission(submission) });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * GET /api/submissions?experimentId=
 * Restore student's submission
 */
exports.getMySubmission = async (req, res) => {
  try {
    const studentId = req.user.id;
    const { experimentId } = req.query;

    if (!experimentId) {
      return res.status(400).json({ message: "experimentId is required" });
    }

    const submission = await Submission.findOne({
      experimentId,
      studentId,
    });

    if (!submission) {
      return res.json({ submission: null });
    }

    return res.json({
      submission: mapSubmission(submission),
      files: submission.files,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/**
 * GET /api/submissions/:id
 * Teacher / student fetch submission with files
 */
exports.getSubmissionById = async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id)
      .populate("studentId", "name")
      .populate("evaluatedBy", "name");

    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    return res.json({
      submission: mapSubmission(submission),
      student:
        typeof submission.studentId === "object"
          ? {
              id: submission.studentId._id?.toString?.() || submission.studentId.toString(),
              name: submission.studentId.name,
            }
          : null,
      files: submission.files,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};



exports.getExperimentSubmissions = async (req, res) => {
  try {
    const { experimentId } = req.params;

    const submissions = await Submission.find({ experimentId })
      .populate("studentId", "name email")
      .sort({ lastSaved: -1 });

    const response = submissions.map((sub) => ({
      submission: mapSubmission(sub),
      student: {
        id: sub.studentId._id.toString(),
        name: sub.studentId.name,
        email: sub.studentId.email,
      },
    }));

    return res.json(response);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to load submissions",
      error: error.message,
    });
  }
};

exports.validateSubmission = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { score, feedback } = req.body;
    const teacherId = req.user.id;

    if (score === undefined) {
      return res.status(400).json({ message: "Score is required" });
    }

    const numericScore = Number(score);
    if (!Number.isFinite(numericScore) || numericScore < 0 || numericScore > MAX_SCORE) {
      return res.status(400).json({ message: `Score must be between 0 and ${MAX_SCORE}` });
    }

    const submission = await Submission.findById(submissionId);
    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    submission.status = "validated";
    submission.score = Math.round(numericScore * 10) / 10;
    submission.feedback = feedback || "";
    submission.evaluatedBy = teacherId;
    submission.lastSaved = new Date();
    submission.aiEvaluation = {
      ...(submission.aiEvaluation || {}),
      teacherOverride: true,
      teacherOverrideBy: teacherId,
      teacherOverrideAt: new Date(),
      teacherOverrideScore: submission.score,
    };

    await submission.save();

    return res.json({
      submission: mapSubmission(submission),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to validate submission",
      error: error.message,
    });
  }
};
