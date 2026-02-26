const router = require("express").Router();
const { protect, allowRoles } = require("../middlewares/auth.middleware");
const {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
} = require("../controllers/user.controller");

router.get("/", protect, allowRoles("admin", "hod", "teacher"), getUsers);
router.post("/", protect, allowRoles("admin", "hod"), createUser);
router.put("/:id", protect, allowRoles("admin", "hod"), updateUser);
router.delete("/:id", protect, allowRoles("admin", "hod"), deleteUser);

module.exports = router;
