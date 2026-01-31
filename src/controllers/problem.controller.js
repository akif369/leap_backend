const Problem = require("../models/Problem");
const Lab = require("../models/Lab");

// Add problem to lab
exports.createProblem = async (req, res) => {
  try {
    const { labId, title, description, maxMarks } = req.body;

    const lab = await Lab.findById(labId);
    if (!lab) return res.status(404).json({ message: "Lab not found" });

    // 🔐 Check if teacher is assigned to this lab
    const isAssigned = lab.assignedTeachers.includes(req.user.id);
    if (!isAssigned) {
      return res.status(403).json({ message: "Not assigned to this lab" });
    }

    const problem = await Problem.create({
      labId,
      title,
      description,
      maxMarks,
      createdBy: req.user.id,
    });

    res.status(201).json({ message: "Problem added ✅", problem });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get problems of a lab
exports.getProblemsByLab = async (req, res) => {
  const { labId } = req.params;

  const problems = await Problem.find({ labId });
  res.json(problems);
};
