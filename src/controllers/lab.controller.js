const Lab = require("../models/Lab");

// Admin / HOD creates lab
exports.createLab = async (req, res) => {
  try {
    const { name, subject, assignedTeachers } = req.body;

    const lab = await Lab.create({
      name,
      subject,
      createdBy: req.user.id,
      assignedTeachers,
    });

    res.status(201).json({ message: "Lab created ✅", lab });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get all labs
exports.getLabs = async (req, res) => {
  const labs = await Lab.find()
    .populate("assignedTeachers", "name email")
    .populate("createdBy", "name");

  res.json(labs);
};
