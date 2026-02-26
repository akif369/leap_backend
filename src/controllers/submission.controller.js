const Submission = require("../models/Submission");
const Problem = require("../models/Problem");

/**
 * POST /api/submissions
 * Create or update a submission (draft or submitted)
 */
exports.upsertSubmission = async (req, res) => {
  try {
    const studentId = req.user.id;
    const { experimentId, status, files } = req.body;

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

    // Upsert submission
    const submission = await Submission.findOneAndUpdate(
      { experimentId, studentId },
      {
        experimentId,
        studentId,
        files,
        status: status || "draft",
        lastSaved: new Date(),
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );

    return res.status(200).json({
      submission: {
        id: submission._id.toString(),
        studentId: submission.studentId.toString(),
        experimentId: submission.experimentId.toString(),
        status: submission.status,
        score: submission.score,
        lastSaved: submission.lastSaved,
      },
    });
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
      submission: {
        id: submission._id.toString(),
        studentId: submission.studentId.toString(),
        experimentId: submission.experimentId.toString(),
        status: submission.status,
        score: submission.score,
        lastSaved: submission.lastSaved,
      },
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
      submission: {
        id: submission._id.toString(),
        studentId:
          typeof submission.studentId === "object"
            ? submission.studentId._id?.toString?.() || submission.studentId.toString()
            : submission.studentId.toString(),
        experimentId: submission.experimentId.toString(),
        status: submission.status,
        score: submission.score,
        feedback: submission.feedback,
        lastSaved: submission.lastSaved,
      },
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
      submission: {
        id: sub._id.toString(),
        studentId: sub.studentId._id.toString(),
        experimentId: sub.experimentId.toString(),
        status: sub.status,
        score: sub.score,
        lastSaved: sub.lastSaved,
      },
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

    const submission = await Submission.findById(submissionId);
    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    submission.status = "validated";
    submission.score = score;
    submission.feedback = feedback || "";
    submission.evaluatedBy = teacherId;
    submission.lastSaved = new Date();

    await submission.save();

    return res.json({
      submission: {
        id: submission._id.toString(),
        studentId: submission.studentId.toString(),
        experimentId: submission.experimentId.toString(),
        status: submission.status,
        score: submission.score,
        lastSaved: submission.lastSaved,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to validate submission",
      error: error.message,
    });
  }
};
