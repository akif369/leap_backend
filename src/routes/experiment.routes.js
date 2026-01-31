const router = require("express").Router();
const { protect, allowRoles } = require("../middlewares/auth.middleware");
const {
  getExperimentSubmissions,
} = require("../controllers/submission.controller");
const Problem = require("../models/problem.model");


// 👩‍🏫 Teacher / HOD grading list
router.get(
  "/:experimentId/submissions",
  protect,
  allowRoles("teacher", "hod"),
  getExperimentSubmissions
);

// Get single experiment (problem)
router.get("/:experimentId", protect, async (req, res) => {
  const experiment = await Problem.findById(req.params.experimentId);
  if (!experiment) {
    return res.status(404).json({ message: "Experiment not found" });
  }
  res.json(experiment);
});

module.exports = router;
