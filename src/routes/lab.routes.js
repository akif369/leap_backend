const router = require("express").Router();
const { createLab, getLabs } = require("../controllers/lab.controller");
const { protect, allowRoles } = require("../middlewares/auth.middleware");

router.post("/", protect, allowRoles("admin"), createLab);
router.get("/", protect, getLabs);

module.exports = router;
