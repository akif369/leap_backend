const router = require("express").Router();
const { protect, allowRoles } = require("../middlewares/auth.middleware");
const {
  getExperimentSubmissions,
} = require("../controllers/submission.controller");
const {
  getExperimentVivaQuestions,
  createExperimentVivaQuestion,
  generateExperimentVivaQuestions,
} = require("../controllers/vivaQuestion.controller");
const Problem = require("../models/Problem");


// 👩‍🏫 Teacher / HOD grading list
router.get(
  "/:experimentId/submissions",
  protect,
  allowRoles("teacher", "hod"),
  getExperimentSubmissions
);

router.get(
  "/:experimentId/viva-questions",
  protect,
  allowRoles("teacher", "hod", "admin"),
  getExperimentVivaQuestions
);

router.post(
  "/:experimentId/viva-questions",
  protect,
  allowRoles("teacher", "hod", "admin"),
  createExperimentVivaQuestion
);

router.post(
  "/:experimentId/viva-questions/generate",
  protect,
  allowRoles("teacher", "hod", "admin"),
  generateExperimentVivaQuestions
);

// Get single experiment (problem)
router.get("/:experimentId", protect, async (req, res) => {
  try {
    const experiment = await Problem.findById(req.params.experimentId);
    if (!experiment) {
      return res.status(404).json({ message: "Experiment not found" });
    }
    res.json(experiment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
