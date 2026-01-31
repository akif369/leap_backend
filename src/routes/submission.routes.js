const router = require("express").Router();
const { protect, allowRoles } = require("../middlewares/auth.middleware");

const {
  upsertSubmission,
  getMySubmission,
  getSubmissionById,
} = require("../controllers/submission.controller");

const { validateSubmission } = require("../controllers/submission.controller");



// Student: save draft OR submit
router.post("/", protect, allowRoles("student"), upsertSubmission);

// Student: restore submission
router.get("/", protect, allowRoles("student"), getMySubmission);

// Teacher / student: view submission
router.get("/:id", protect, getSubmissionById);

// 👩‍🏫 Teacher validates submission
router.put(
  "/:submissionId",
  protect,
  allowRoles("teacher", "hod"),
  validateSubmission
);


module.exports = router;
 