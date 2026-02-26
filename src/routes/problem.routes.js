const router = require("express").Router();
const { protect, allowRoles } = require("../middlewares/auth.middleware");
const {
  createProblem,
  getProblemsByLab,
  updateProblem,
  deleteProblem,
} = require("../controllers/problem.controller");

router.post("/", protect, allowRoles("teacher", "hod", "admin"), createProblem);
router.get("/lab/:labId", protect, getProblemsByLab);
router.put("/:id", protect, allowRoles("teacher", "hod", "admin"), updateProblem);
router.delete("/:id", protect, allowRoles("teacher", "hod", "admin"), deleteProblem);

module.exports = router;
