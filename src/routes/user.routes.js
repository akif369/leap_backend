const router = require("express").Router();
const { protect, allowRoles } = require("../middlewares/auth.middleware");
const {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  changeOwnPassword,
  changeUserPassword,
} = require("../controllers/user.controller");

router.get("/", protect, allowRoles("admin", "hod", "teacher"), getUsers);
router.post("/", protect, allowRoles("admin", "hod", "teacher"), createUser);
router.put("/:id", protect, allowRoles("admin", "hod", "teacher"), updateUser);
router.put("/me/password", protect, changeOwnPassword);
router.put("/:id/password", protect, allowRoles("admin", "hod", "teacher"), changeUserPassword);
router.delete("/:id", protect, allowRoles("admin", "hod", "teacher"), deleteUser);

module.exports = router;
