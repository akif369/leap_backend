const bcrypt = require("bcrypt");
const User = require("../models/User");
const { signToken } = require("../utils/token");
const mongoose = require("mongoose");

// ✅ Register
exports.register = async (req, res) => {
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

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
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
      message: "Registered successfully ✅",
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        rollNo: user.rollNo,
        batch: user.batch,
        year: user.year,
        semester: user.semester,
        section: user.section,
        courseIds: user.courseIds || [],
        labIds: user.labIds || [],
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ✅ Login
exports.login = async (req, res) => {
  try {
    const { email, idOrUsername, password, role } = req.body;
    const identifier = (email || idOrUsername || "").trim();

    if (!identifier || !password) {
      return res.status(400).json({ message: "idOrUsername/email and password are required" });
    }

    const query = [
      { email: identifier.toLowerCase() },
      { rollNo: identifier },
    ];

    if (mongoose.Types.ObjectId.isValid(identifier)) {
      query.push({ _id: identifier });
    }

    const user = await User.findOne({ $or: query });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) return res.status(401).json({ message: "Invalid credentials" });
    if (role && user.role !== role) return res.status(401).json({ message: "Invalid credentials" });

    const token = signToken({ id: user._id, role: user.role });

    return res.json({
      message: "Login successful ✅",
      token,
      user: {
        id: user._id.toString(),
        name: user.name,
        role: user.role,
        email: user.email,
        rollNo: user.rollNo,
        batch: user.batch,
        year: user.year,
        semester: user.semester,
        section: user.section,
        courseIds: user.courseIds || [],
        labIds: user.labIds || [],
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};


// ✅ Get current logged-in user (restore session)
exports.getMe = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      rollNo: user.rollNo,
      batch: user.batch,
      year: user.year,
      semester: user.semester,
      section: user.section,
      courseIds: user.courseIds || [],
      labIds: user.labIds || [],
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch user",
      error: error.message,
    });
  }
};

