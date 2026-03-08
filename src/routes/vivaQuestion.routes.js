const router = require("express").Router();
const { protect, allowRoles } = require("../middlewares/auth.middleware");
const { updateVivaQuestion, deleteVivaQuestion } = require("../controllers/vivaQuestion.controller");

router.put("/:questionId", protect, allowRoles("teacher", "hod", "admin"), updateVivaQuestion);
router.delete("/:questionId", protect, allowRoles("teacher", "hod", "admin"), deleteVivaQuestion);

module.exports = router;
