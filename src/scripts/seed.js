require("dotenv").config();
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");

const connectDB = require("../config/db");
const User = require("../models/User");
const Lab = require("../models/Lab");
const Problem = require("../models/Problem");

const seedUsers = [
  {
    key: "admin",
    name: "Admin User",
    email: "admin@leap.local",
    password: "admin123",
    role: "admin",
  },
  {
    key: "hod",
    name: "HOD User",
    email: "hod@leap.local",
    password: "hod123",
    role: "hod",
  },
  {
    key: "teacher_os",
    name: "Dr. Patel",
    email: "teacher.os@leap.local",
    password: "teacher123",
    role: "teacher",
  },
  {
    key: "teacher_algo",
    name: "Dr. Huang",
    email: "teacher.algo@leap.local",
    password: "teacher123",
    role: "teacher",
  },
  {
    key: "student_1",
    name: "Aisha Khan",
    email: "stu-01@leap.local",
    password: "student123",
    role: "student",
    rollNo: "stu-01",
    batch: "2024",
    year: "2024-2028",
    semester: "6",
    section: "A",
  },
  {
    key: "student_2",
    name: "Diego Silva",
    email: "stu-02@leap.local",
    password: "student123",
    role: "student",
    rollNo: "stu-02",
    batch: "2024",
    year: "2024-2028",
    semester: "6",
    section: "A",
  },
];

const seedLabDefs = [
  {
    key: "lab_os",
    name: "Operating Systems Lab",
    subject: "Advanced Systems (CSE)",
    teacherKeys: ["teacher_os"],
  },
  {
    key: "lab_net",
    name: "Networks Lab",
    subject: "Advanced Systems (CSE)",
    teacherKeys: ["teacher_os"],
  },
  {
    key: "lab_algo",
    name: "Algorithms Lab",
    subject: "Algorithms & Complexity",
    teacherKeys: ["teacher_algo"],
  },
];

const seedProblemsByLabKey = {
  lab_os: [
    {
      title: "Process Scheduling Simulator",
      description:
        "Build a scheduler that supports FCFS and Round Robin. Accept a list of processes with burst time.",
      expectedOutput: "Average waiting time and turnaround time per algorithm.",
      hints: [
        "Start with a queue abstraction for Round Robin.",
        "Validate time quantum > 0 before running.",
      ],
      helperLinks: ["https://en.wikipedia.org/wiki/Round-robin_scheduling"],
      maxMarks: 10,
    },
    {
      title: "Deadlock Detector",
      description: "Implement Banker's Algorithm to flag unsafe states from allocation and available vectors.",
      expectedOutput: "Safe/unsafe and an execution order if safe.",
      hints: ["Normalize matrix dimensions before processing.", "Cover impossible cases early."],
      helperLinks: [],
      maxMarks: 10,
    },
  ],
  lab_net: [
    {
      title: "Ping Diagnostics",
      description: "Simulate ICMP echo requests with artificial latency and packet loss.",
      expectedOutput: "Loss %, average latency, and min/max.",
      hints: ["Seed your RNG for repeatable tests.", "Surface retry counts."],
      helperLinks: [],
      maxMarks: 10,
    },
  ],
  lab_algo: [
    {
      title: "Dynamic Programming Warmup",
      description: "Solve coin change with memoization and tabulation.",
      expectedOutput: "Minimum coins and one valid combination.",
      hints: ["Cache by amount, not index.", "Cover impossible cases early."],
      helperLinks: [],
      maxMarks: 10,
    },
  ],
};

async function upsertUser(userDef) {
  const hashedPassword = await bcrypt.hash(userDef.password, 10);
  const update = {
    name: userDef.name,
    email: userDef.email.toLowerCase(),
    password: hashedPassword,
    role: userDef.role,
    rollNo: userDef.rollNo,
    batch: userDef.batch,
    year: userDef.year,
    semester: userDef.semester,
    section: userDef.section,
  };

  return User.findOneAndUpdate({ email: userDef.email.toLowerCase() }, { $set: update }, { new: true, upsert: true });
}

async function dropObsoleteUserIndexes() {
  const indexes = await User.collection.indexes();
  const legacyNumberIndex = indexes.find((index) => index.name === "number_1");
  if (legacyNumberIndex) {
    await User.collection.dropIndex("number_1");
    console.log("Dropped obsolete users index: number_1");
  }
}

async function upsertLab(labDef, actorId, teacherIds) {
  return Lab.findOneAndUpdate(
    { name: labDef.name, subject: labDef.subject },
    {
      $set: {
        name: labDef.name,
        subject: labDef.subject,
        createdBy: actorId,
        assignedTeachers: teacherIds,
      },
    },
    { new: true, upsert: true }
  );
}

async function upsertProblem(problemDef, labId, actorId) {
  return Problem.findOneAndUpdate(
    { labId, title: problemDef.title },
    {
      $set: {
        labId,
        title: problemDef.title,
        description: problemDef.description,
        expectedOutput: problemDef.expectedOutput,
        hints: problemDef.hints,
        helperLinks: problemDef.helperLinks,
        maxMarks: problemDef.maxMarks,
        createdBy: actorId,
      },
    },
    { new: true, upsert: true }
  );
}

async function seed() {
  await connectDB();
  await dropObsoleteUserIndexes();

  const usersByKey = {};
  for (const userDef of seedUsers) {
    usersByKey[userDef.key] = await upsertUser(userDef);
  }

  const adminUser = usersByKey.admin;
  const labsByKey = {};
  for (const labDef of seedLabDefs) {
    const teacherIds = labDef.teacherKeys.map((key) => usersByKey[key]._id);
    labsByKey[labDef.key] = await upsertLab(labDef, adminUser._id, teacherIds);
  }

  for (const [labKey, problems] of Object.entries(seedProblemsByLabKey)) {
    const lab = labsByKey[labKey];
    if (!lab) continue;
    for (const problemDef of problems) {
      await upsertProblem(problemDef, lab._id, adminUser._id);
    }
  }

  const courseIdsByLab = {
    lab_os: "csc-410",
    lab_net: "csc-410",
    lab_algo: "csc-320",
  };

  const teacherOsLabIds = [labsByKey.lab_os._id.toString(), labsByKey.lab_net._id.toString()];
  const teacherAlgoLabIds = [labsByKey.lab_algo._id.toString()];

  await User.findByIdAndUpdate(usersByKey.teacher_os._id, {
    $set: { labIds: teacherOsLabIds, courseIds: ["csc-410"] },
  });
  await User.findByIdAndUpdate(usersByKey.teacher_algo._id, {
    $set: { labIds: teacherAlgoLabIds, courseIds: ["csc-320"] },
  });

  const allLabIds = Object.keys(labsByKey).map((key) => labsByKey[key]._id.toString());
  const allCourseIds = Array.from(new Set(Object.values(courseIdsByLab)));

  await User.findByIdAndUpdate(usersByKey.student_1._id, {
    $set: { labIds: allLabIds, courseIds: allCourseIds },
  });
  await User.findByIdAndUpdate(usersByKey.student_2._id, {
    $set: { labIds: allLabIds, courseIds: allCourseIds },
  });

  console.log("Seed completed.");
  console.log("Default login accounts:");
  for (const userDef of seedUsers) {
    console.log(`- ${userDef.role.toUpperCase()}: ${userDef.email} / ${userDef.password}`);
  }
}

seed()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
