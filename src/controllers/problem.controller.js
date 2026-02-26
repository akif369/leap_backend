const Problem = require("../models/Problem");
const Lab = require("../models/Lab");

// Add problem to lab
exports.createProblem = async (req, res) => {
  try {
    const { labId, title, description, maxMarks, expectedOutput, hints, helperLinks } = req.body;

    const lab = await Lab.findById(labId);
    if (!lab) return res.status(404).json({ message: "Lab not found" });

    // Check if teacher is assigned to this lab (hod/admin bypass through role)
    const isAssigned =
      req.user.role === "admin" ||
      req.user.role === "hod" ||
      lab.assignedTeachers.some((teacherId) => teacherId.toString() === req.user.id);
    if (!isAssigned) {
      return res.status(403).json({ message: "Not assigned to this lab" });
    }

    const problem = await Problem.create({
      labId,
      title,
      description,
      expectedOutput,
      hints: Array.isArray(hints) ? hints : [],
      helperLinks: Array.isArray(helperLinks) ? helperLinks : [],
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
  try {
    const { labId } = req.params;

    const problems = await Problem.find({ labId });
    res.json(problems);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update experiment/problem
exports.updateProblem = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, expectedOutput, hints, helperLinks, maxMarks } = req.body;

    const existing = await Problem.findById(id);
    if (!existing) return res.status(404).json({ message: "Problem not found" });

    if (req.user.role === "teacher" && existing.createdBy.toString() !== req.user.id) {
      const lab = await Lab.findById(existing.labId);
      const isAssigned = !!lab?.assignedTeachers.some((teacherId) => teacherId.toString() === req.user.id);
      if (!isAssigned) {
        return res.status(403).json({ message: "Not allowed to update this problem" });
      }
    }

    const updated = await Problem.findByIdAndUpdate(
      id,
      {
        ...(title !== undefined ? { title } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(expectedOutput !== undefined ? { expectedOutput } : {}),
        ...(hints !== undefined ? { hints: Array.isArray(hints) ? hints : [] } : {}),
        ...(helperLinks !== undefined ? { helperLinks: Array.isArray(helperLinks) ? helperLinks : [] } : {}),
        ...(maxMarks !== undefined ? { maxMarks } : {}),
      },
      { new: true }
    );

    return res.json({ message: "Problem updated ✅", problem: updated });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// Delete experiment/problem
exports.deleteProblem = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await Problem.findById(id);
    if (!existing) return res.status(404).json({ message: "Problem not found" });

    if (req.user.role === "teacher" && existing.createdBy.toString() !== req.user.id) {
      const lab = await Lab.findById(existing.labId);
      const isAssigned = !!lab?.assignedTeachers.some((teacherId) => teacherId.toString() === req.user.id);
      if (!isAssigned) {
        return res.status(403).json({ message: "Not allowed to delete this problem" });
      }
    }

    await Problem.findByIdAndDelete(id);
    return res.json({ message: "Problem deleted ✅" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
