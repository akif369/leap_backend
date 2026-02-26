const bcrypt = require("bcrypt");
const User = require("../models/User");

const toPublicUser = (userDoc) => ({
  id: userDoc._id.toString(),
  name: userDoc.name,
  email: userDoc.email,
  role: userDoc.role,
  rollNo: userDoc.rollNo,
  batch: userDoc.batch,
  year: userDoc.year,
  semester: userDoc.semester,
  section: userDoc.section,
  courseIds: userDoc.courseIds || [],
  labIds: userDoc.labIds || [],
});

exports.getUsers = async (req, res) => {
  try {
    const { role } = req.query;
    const query = {};
    if (role) query.role = role;

    const users = await User.find(query).select("-password").sort({ createdAt: -1 });
    return res.json(users.map(toPublicUser));
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch users", error: error.message });
  }
};

exports.createUser = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role,
      rollNo,
      batch,
      year,
      semester,
      section,
      courseIds,
      labIds,
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "name, email and password are required" });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ message: "Email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: role || "student",
      rollNo,
      batch,
      year,
      semester,
      section,
      courseIds: Array.isArray(courseIds) ? courseIds : [],
      labIds: Array.isArray(labIds) ? labIds : [],
    });

    return res.status(201).json({
      message: "User created ✅",
      user: toPublicUser(user),
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create user", error: error.message });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      email,
      password,
      role,
      rollNo,
      batch,
      year,
      semester,
      section,
      courseIds,
      labIds,
    } = req.body;

    const existing = await User.findById(id);
    if (!existing) return res.status(404).json({ message: "User not found" });

    if (email && email.toLowerCase() !== existing.email) {
      const dup = await User.findOne({ email: email.toLowerCase() });
      if (dup) return res.status(409).json({ message: "Email already exists" });
      existing.email = email.toLowerCase();
    }

    if (name !== undefined) existing.name = name;
    if (role !== undefined) existing.role = role;
    if (rollNo !== undefined) existing.rollNo = rollNo;
    if (batch !== undefined) existing.batch = batch;
    if (year !== undefined) existing.year = year;
    if (semester !== undefined) existing.semester = semester;
    if (section !== undefined) existing.section = section;
    if (courseIds !== undefined) existing.courseIds = Array.isArray(courseIds) ? courseIds : [];
    if (labIds !== undefined) existing.labIds = Array.isArray(labIds) ? labIds : [];
    if (password) existing.password = await bcrypt.hash(password, 10);

    await existing.save();

    return res.json({
      message: "User updated ✅",
      user: toPublicUser(existing),
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update user", error: error.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await User.findById(id);
    if (!existing) return res.status(404).json({ message: "User not found" });

    await User.findByIdAndDelete(id);
    return res.json({ message: "User deleted ✅" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete user", error: error.message });
  }
};
