const router = require("express").Router();
const { protect, allowRoles } = require("../middlewares/auth.middleware");
const {
  createProblem,
  getProblemsByLab,
} = require("../controllers/problem.controller");

router.post("/", protect, allowRoles("teacher"), createProblem);
router.get("/lab/:labId", protect, getProblemsByLab);

module.exports = router;
