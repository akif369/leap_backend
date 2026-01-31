const router = require("express").Router();
const { register, login, getMe } = require("../controllers/auth.controller");
const { protect } = require("../middlewares/auth.middleware");

router.post("/register", register);
router.post("/login", login);

// 🔑 Restore session
router.get("/me", protect, getMe);

module.exports = router;
