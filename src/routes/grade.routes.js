const router = require("express").Router();
const { protect, allowRoles } = require("../middlewares/auth.middleware");
const { runAiGrade } = require("../controllers/grade.controller");

router.post("/run", protect, allowRoles("student", "teacher", "hod", "admin"), runAiGrade);

module.exports = router;

