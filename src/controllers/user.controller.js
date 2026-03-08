const bcrypt = require("bcrypt");
const User = require("../models/User");
const Submission = require("../models/Submission");
const Problem = require("../models/Problem");
const Lab = require("../models/Lab");

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

const normalizeRole = (value) => (typeof value === "string" ? value.toLowerCase().trim() : "");
const sanitizeEmail = (value) => (typeof value === "string" ? value.toLowerCase().trim() : "");
const manageMap = {
  admin: new Set(["hod", "teacher", "student"]),
  hod: new Set(["teacher", "student"]),
  teacher: new Set(["student"]),
};

const canManageRole = (actorRole, targetRole) => {
  const allowed = manageMap[normalizeRole(actorRole)];
  return !!allowed && allowed.has(normalizeRole(targetRole));
};

const canManageUser = (actor, target) => canManageRole(actor.role, target.role);

const pickAllowedUpdateFields = (body, fields) => {
  const out = {};
  for (const field of fields) {
    if (body[field] !== undefined) {
      out[field] = body[field];
    }
  }
  return out;
};

const round1 = (value) => Math.round(value * 10) / 10;

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

exports.getStudentProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const actor = { id: req.user.id, role: req.user.role };

    const student = await User.findById(id).select("-password");
    if (!student || student.role !== "student") {
      return res.status(404).json({ message: "Student not found" });
    }

    if (!canManageUser(actor, student)) {
      return res.status(403).json({ message: "You are not allowed to view this student profile" });
    }

    const submissions = await Submission.find({ studentId: id }).sort({ lastSaved: -1 }).lean();
    const experimentIds = Array.from(
      new Set(submissions.map((row) => row.experimentId?.toString()).filter(Boolean))
    );
    const experiments = await Problem.find({ _id: { $in: experimentIds } })
      .select("title labId dueAt")
      .lean();
    const experimentsById = new Map(experiments.map((row) => [row._id.toString(), row]));

    const labIds = Array.from(new Set(experiments.map((row) => row.labId?.toString()).filter(Boolean)));
    const labs = await Lab.find({ _id: { $in: labIds } }).select("name subject").lean();
    const labsById = new Map(labs.map((row) => [row._id.toString(), row]));

    const details = submissions.map((row) => {
      const experiment = experimentsById.get(row.experimentId?.toString());
      const lab = experiment?.labId ? labsById.get(experiment.labId.toString()) : null;
      const dueAt = experiment?.dueAt ? new Date(experiment.dueAt) : null;
      const submittedAt = row.submittedAt ? new Date(row.submittedAt) : null;
      const onTime =
        !dueAt || !submittedAt || Number.isNaN(dueAt.getTime()) || Number.isNaN(submittedAt.getTime())
          ? true
          : submittedAt.getTime() <= dueAt.getTime();

      return {
        id: row._id.toString(),
        experimentId: row.experimentId?.toString() || "",
        experimentTitle: experiment?.title || "Unknown Experiment",
        labId: experiment?.labId?.toString() || "",
        labName: lab?.name || "Unknown Lab",
        labSubject: lab?.subject || "",
        status: row.status,
        score: typeof row.score === "number" && Number.isFinite(row.score) ? round1(row.score) : null,
        submittedAt: row.submittedAt || null,
        dueAt: experiment?.dueAt || null,
        onTime,
        lastSaved: row.lastSaved || null,
        feedback: row.feedback || "",
      };
    });

    const scored = details.filter((row) => typeof row.score === "number").map((row) => row.score);
    const statusCounts = details.reduce(
      (acc, row) => {
        if (row.status === "draft") acc.draft += 1;
        if (row.status === "submitted") acc.submitted += 1;
        if (row.status === "validated") acc.validated += 1;
        return acc;
      },
      { draft: 0, submitted: 0, validated: 0 }
    );

    const stats = {
      totalSubmissions: details.length,
      draft: statusCounts.draft,
      submitted: statusCounts.submitted,
      validated: statusCounts.validated,
      averageScore: scored.length > 0 ? round1(scored.reduce((sum, value) => sum + value, 0) / scored.length) : null,
      bestScore: scored.length > 0 ? round1(Math.max(...scored)) : null,
      onTimeCount: details.filter((row) => row.onTime).length,
      lateCount: details.filter((row) => !row.onTime).length,
    };

    return res.json({
      student: toPublicUser(student),
      stats,
      submissions: details,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load student profile", error: error.message });
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
    const actorRole = req.user.role;
    const requestedRole = normalizeRole(role || "student");

    if (!name || !email || !password) {
      return res.status(400).json({ message: "name, email and password are required" });
    }

    if (!["student", "teacher", "hod", "admin"].includes(requestedRole)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    if (requestedRole === "admin") {
      return res.status(403).json({ message: "Cannot create admin from this endpoint" });
    }

    if (!canManageRole(actorRole, requestedRole)) {
      return res.status(403).json({ message: "You are not allowed to create this role" });
    }

    const normalizedEmail = sanitizeEmail(email);
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) return res.status(409).json({ message: "Email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email: normalizedEmail,
      password: hashedPassword,
      role: requestedRole,
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
    const actor = { id: req.user.id, role: req.user.role };

    const existing = await User.findById(id);
    if (!existing) return res.status(404).json({ message: "User not found" });
    const isSelf = existing._id.toString() === actor.id;
    const canManage = canManageUser(actor, existing);

    if (!isSelf && !canManage) {
      return res.status(403).json({ message: "You are not allowed to edit this user" });
    }

    const allowedFields = isSelf
      ? ["name", "email", "year", "semester", "section", "batch"]
      : ["name", "email", "rollNo", "batch", "year", "semester", "section", "courseIds", "labIds"];

    const updates = pickAllowedUpdateFields(req.body, allowedFields);

    if (!isSelf && req.body.role !== undefined && actor.role === "admin") {
      const nextRole = normalizeRole(req.body.role);
      if (!["hod", "teacher", "student"].includes(nextRole)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      if (!canManageRole(actor.role, nextRole)) {
        return res.status(403).json({ message: "Cannot assign this role" });
      }
      updates.role = nextRole;
    }

    if (updates.email && sanitizeEmail(updates.email) !== existing.email) {
      const normalizedEmail = sanitizeEmail(updates.email);
      const dup = await User.findOne({ email: normalizedEmail });
      if (dup) return res.status(409).json({ message: "Email already exists" });
      existing.email = normalizedEmail;
    }

    if (updates.name !== undefined) existing.name = updates.name;
    if (updates.role !== undefined) existing.role = updates.role;
    if (updates.rollNo !== undefined) existing.rollNo = updates.rollNo;
    if (updates.batch !== undefined) existing.batch = updates.batch;
    if (updates.year !== undefined) existing.year = updates.year;
    if (updates.semester !== undefined) existing.semester = updates.semester;
    if (updates.section !== undefined) existing.section = updates.section;
    if (updates.courseIds !== undefined) existing.courseIds = Array.isArray(updates.courseIds) ? updates.courseIds : [];
    if (updates.labIds !== undefined) existing.labIds = Array.isArray(updates.labIds) ? updates.labIds : [];

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
    const actor = { id: req.user.id, role: req.user.role };

    const existing = await User.findById(id);
    if (!existing) return res.status(404).json({ message: "User not found" });
    if (existing._id.toString() === actor.id) {
      return res.status(400).json({ message: "You cannot delete your own account" });
    }
    if (!canManageUser(actor, existing)) {
      return res.status(403).json({ message: "You are not allowed to delete this user" });
    }

    await User.findByIdAndDelete(id);
    return res.json({ message: "User deleted ✅" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete user", error: error.message });
  }
};

exports.changeOwnPassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "currentPassword and newPassword are required" });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) return res.status(401).json({ message: "Current password is incorrect" });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    return res.json({ message: "Password changed successfully ✅" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to change password", error: error.message });
  }
};

exports.changeUserPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const actor = { id: req.user.id, role: req.user.role };
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ message: "newPassword is required" });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }

    const target = await User.findById(id);
    if (!target) return res.status(404).json({ message: "User not found" });
    if (!canManageUser(actor, target)) {
      return res.status(403).json({ message: "You are not allowed to change this password" });
    }

    target.password = await bcrypt.hash(newPassword, 10);
    await target.save();
    return res.json({ message: "Password updated successfully ✅" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update password", error: error.message });
  }
};
