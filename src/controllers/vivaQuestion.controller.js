const Lab = require("../models/Lab");
const Problem = require("../models/Problem");
const VivaQuestion = require("../models/VivaQuestion");

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const QUESTIONS_PER_SET = 5;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const parseJsonFromText = (text) => {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch (_innerError) {
        return null;
      }
    }
    return null;
  }
};

const normalizeDifficulty = (value) => {
  const next = String(value || "").toLowerCase().trim();
  if (next === "easy" || next === "medium" || next === "hard") return next;
  return "medium";
};

const mapQuestionItem = (row) => ({
  question: String(row?.question || ""),
  options: Array.isArray(row?.options) ? row.options.map(String) : [],
  correctOptionIndex: Number(row?.correctOptionIndex || 0),
  explanation: String(row?.explanation || ""),
  difficulty: normalizeDifficulty(row?.difficulty),
});

const mapVivaQuestionSet = (doc) => ({
  id: doc._id.toString(),
  experimentId:
    typeof doc.experimentId === "object"
      ? doc.experimentId._id?.toString?.() || doc.experimentId.toString()
      : doc.experimentId.toString(),
  setNumber: Number(doc.setNumber || 1),
  questions: Array.isArray(doc.questions) ? doc.questions.map(mapQuestionItem) : [],
  source: doc.source || "custom",
  createdBy:
    typeof doc.createdBy === "object"
      ? doc.createdBy._id?.toString?.() || doc.createdBy.toString()
      : doc.createdBy.toString(),
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

const canTeacherAccessExperiment = async (teacherId, experiment) => {
  if (!experiment) return false;
  if (experiment.createdBy?.toString() === teacherId) return true;
  const lab = await Lab.findById(experiment.labId).select("assignedTeachers");
  if (!lab) return false;
  return !!lab.assignedTeachers?.some((assignedId) => assignedId.toString() === teacherId);
};

const ensureExperimentAccess = async (experimentId, actor) => {
  const experiment = await Problem.findById(experimentId);
  if (!experiment) return { error: { status: 404, message: "Experiment not found" } };

  if (actor.role === "teacher") {
    const allowed = await canTeacherAccessExperiment(actor.id, experiment);
    if (!allowed) return { error: { status: 403, message: "Not allowed for this experiment" } };
  }

  return { experiment };
};

const validateQuestionPayload = (payload) => {
  const question = String(payload?.question || "").trim();
  const options = Array.isArray(payload?.options)
    ? payload.options.map((option) => String(option || "").trim()).filter(Boolean)
    : [];
  const correctOptionIndex = Number(payload?.correctOptionIndex);
  const explanation = String(payload?.explanation || "").trim();
  const difficulty = normalizeDifficulty(payload?.difficulty);

  if (!question) return { error: "Question is required" };
  if (options.length < 2) return { error: "At least 2 non-empty options are required" };
  if (!Number.isInteger(correctOptionIndex) || correctOptionIndex < 0 || correctOptionIndex >= options.length) {
    return { error: "correctOptionIndex is invalid for provided options" };
  }

  return {
    question,
    options,
    correctOptionIndex,
    explanation,
    difficulty,
  };
};

const validateSetPayload = (payload) => {
  const rawQuestions = Array.isArray(payload?.questions) ? payload.questions : [];
  if (rawQuestions.length !== QUESTIONS_PER_SET) {
    return { error: `Each set must contain exactly ${QUESTIONS_PER_SET} questions` };
  }

  const parsed = [];
  for (const rawQuestion of rawQuestions) {
    const row = validateQuestionPayload(rawQuestion);
    if (row.error) return { error: row.error };
    parsed.push(row);
  }

  return { questions: parsed };
};

const sanitizeAiQuestions = (rawList, count) => {
  if (!Array.isArray(rawList)) return [];
  const sanitized = [];
  for (const rawItem of rawList) {
    const parsed = validateQuestionPayload(rawItem);
    if (parsed.error) continue;
    sanitized.push(parsed);
    if (sanitized.length >= count) break;
  }
  return sanitized;
};

const normalizeTopics = (value) => {
  if (!Array.isArray(value)) return [];
  const cleaned = value
    .map((topic) => String(topic || "").trim())
    .filter(Boolean)
    .slice(0, 12);
  return Array.from(new Set(cleaned));
};

const buildFallbackQuestions = (problem, count, topics = []) => {
  const title = String(problem?.title || "this experiment");
  const expected = String(problem?.expectedOutput || "correct output");
  const hint = Array.isArray(problem?.hints) && problem.hints.length > 0 ? String(problem.hints[0]) : "";

  const bank = [
    {
      question: `Which practice is best for solving ${title}?`,
      options: [
        "Understand input-output and design logic before coding",
        "Write print statements only to match sample output",
        "Skip test runs and submit immediately",
        "Ignore edge cases completely",
      ],
      correctOptionIndex: 0,
      explanation: "Clear logic-first approach improves correctness and maintainability.",
      difficulty: "easy",
    },
    {
      question: "Why should sample output checks be combined with multiple test inputs?",
      options: [
        "To validate correctness beyond one hardcoded case",
        "To make execution slower",
        "To reduce readability",
        "To avoid using conditions/loops",
      ],
      correctOptionIndex: 0,
      explanation: "Multiple test cases reduce risk of hardcoded/partial solutions.",
      difficulty: "medium",
    },
    {
      question: `If expected output is "${expected}", what is a good verification step?`,
      options: [
        "Run program and compare output with expected behavior and edge cases",
        "Only check for compilation success",
        "Only check line count in code",
        "Skip verification when output seems close",
      ],
      correctOptionIndex: 0,
      explanation: "Verification should include behavior and edge conditions.",
      difficulty: "easy",
    },
    {
      question: "Which code quality signal is strongest in lab evaluation?",
      options: [
        "Readable logic with meaningful control flow and decomposition",
        "Large file size without structure",
        "Many comments but no working logic",
        "Repeated print statements",
      ],
      correctOptionIndex: 0,
      explanation: "Structured logic and clarity are strong quality indicators.",
      difficulty: "medium",
    },
    {
      question: "What is the main risk of hardcoding expected output?",
      options: [
        "Program fails for real/hidden inputs despite passing one sample",
        "Program always runs faster",
        "Program becomes easier to maintain",
        "No risk in auto-evaluation",
      ],
      correctOptionIndex: 0,
      explanation: "Hardcoding often fails hidden tests and does not solve the actual problem.",
      difficulty: "hard",
    },
    {
      question: `A useful hint for this experiment is: "${hint || "Break the problem into smaller steps"}". Why?`,
      options: [
        "It improves problem-solving and debugging reliability",
        "It removes the need to test",
        "It guarantees full marks without logic",
        "It prevents using functions",
      ],
      correctOptionIndex: 0,
      explanation: "Small-step reasoning improves correctness and maintainability.",
      difficulty: "medium",
    },
  ];

  const topicSpecific = topics.map((topic) => ({
    question: `Which statement best describes "${topic}" in this lab context?`,
    options: [
      `${topic} should be applied with clear input-output reasoning`,
      `${topic} means skipping logic checks`,
      `${topic} only matters for formatting output`,
      `${topic} removes the need for testing`,
    ],
    correctOptionIndex: 0,
    explanation: `${topic} should be used with correct algorithmic reasoning and validation.`,
    difficulty: "medium",
  }));

  const sourceBank = topicSpecific.length > 0 ? topicSpecific.concat(bank) : bank;
  const output = [];
  for (let idx = 0; idx < count; idx += 1) {
    output.push(sourceBank[idx % sourceBank.length]);
  }
  return output;
};

const callGeminiForViva = async (problem, count, topics = []) => {
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) return { ok: false, message: "GEMINI_API_KEY is not set" };

  const prompt = [
    "Generate viva multiple-choice questions for a programming lab.",
    "Return ONLY JSON with this format:",
    "{",
    '  "questions": [',
    "    {",
    '      "question": "string",',
    '      "options": ["string", "string", "string", "string"],',
    '      "correctOptionIndex": 0,',
    '      "explanation": "string",',
    '      "difficulty": "easy|medium|hard"',
    "    }",
    "  ]",
    "}",
    "",
    `Question count: ${count}`,
    "Rules:",
    "- 4 options per question.",
    "- exactly one correct option.",
    "- no duplicate options in a question.",
    "- keep options concise.",
    "",
    topics.length > 0 ? `Primary topics: ${topics.join(" | ")}` : "Primary topics: derive from experiment content",
    "- Prioritize primary topics in generated questions.",
    "",
    `Experiment title: ${String(problem?.title || "")}`,
    `Description: ${String(problem?.description || "")}`,
    `Expected output: ${String(problem?.expectedOutput || "")}`,
    `Hints: ${Array.isArray(problem?.hints) ? problem.hints.join(" | ") : ""}`,
  ].join("\n");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  let response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        DEFAULT_MODEL
      )}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
          },
        }),
      }
    );
  } catch (error) {
    clearTimeout(timeoutId);
    return { ok: false, message: `Gemini request failed: ${error.message}` };
  } finally {
    clearTimeout(timeoutId);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      message:
        payload?.error?.message || payload?.message || `Gemini request failed (${response.status})`,
    };
  }

  const text =
    payload?.candidates?.[0]?.content?.parts
      ?.map((part) => part?.text || "")
      .join("\n")
      .trim() || "";

  const parsed = parseJsonFromText(text);
  const questions = sanitizeAiQuestions(parsed?.questions, count);
  if (questions.length === 0) {
    return { ok: false, message: "Gemini returned no valid viva questions" };
  }

  return { ok: true, questions };
};

const getNextSetNumber = async (experimentId) => {
  const last = await VivaQuestion.findOne({
    experimentId,
    setNumber: { $exists: true },
  })
    .sort({ setNumber: -1 })
    .select("setNumber")
    .lean();
  return Number(last?.setNumber || 0) + 1;
};

exports.getExperimentVivaQuestions = async (req, res) => {
  try {
    const { experimentId } = req.params;
    const access = await ensureExperimentAccess(experimentId, req.user);
    if (access.error) return res.status(access.error.status).json({ message: access.error.message });

    const rows = await VivaQuestion.find({
      experimentId,
      setNumber: { $exists: true },
      questions: { $size: QUESTIONS_PER_SET },
    }).sort({ setNumber: 1, createdAt: 1 });
    return res.json(rows.map(mapVivaQuestionSet));
  } catch (error) {
    return res.status(500).json({ message: "Failed to load viva question sets", error: error.message });
  }
};

exports.createExperimentVivaQuestion = async (req, res) => {
  try {
    const { experimentId } = req.params;
    const access = await ensureExperimentAccess(experimentId, req.user);
    if (access.error) return res.status(access.error.status).json({ message: access.error.message });

    const parsed = validateSetPayload(req.body);
    if (parsed.error) return res.status(400).json({ message: parsed.error });

    let setNumber = Number(req.body?.setNumber);
    if (!Number.isInteger(setNumber) || setNumber <= 0) {
      setNumber = await getNextSetNumber(experimentId);
    }

    const duplicate = await VivaQuestion.findOne({ experimentId, setNumber }).select("_id").lean();
    if (duplicate) {
      return res.status(409).json({ message: `Set ${setNumber} already exists for this experiment` });
    }

    const row = await VivaQuestion.create({
      experimentId,
      setNumber,
      questions: parsed.questions,
      source: "custom",
      createdBy: req.user.id,
    });

    return res.status(201).json({ set: mapVivaQuestionSet(row) });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create viva question set", error: error.message });
  }
};

exports.generateExperimentVivaQuestions = async (req, res) => {
  try {
    const { experimentId } = req.params;
    const access = await ensureExperimentAccess(experimentId, req.user);
    if (access.error) return res.status(access.error.status).json({ message: access.error.message });

    const setCount = clamp(Number(req.body?.setCount) || 1, 1, 10);
    const topics = normalizeTopics(req.body?.topics);
    const totalQuestions = setCount * QUESTIONS_PER_SET;

    const aiResult = await callGeminiForViva(access.experiment, totalQuestions, topics);
    let generatedQuestions = aiResult.ok
      ? aiResult.questions
      : buildFallbackQuestions(access.experiment, totalQuestions, topics);

    if (generatedQuestions.length < totalQuestions) {
      generatedQuestions = generatedQuestions.concat(
        buildFallbackQuestions(access.experiment, totalQuestions - generatedQuestions.length, topics)
      );
    }

    const startingSetNumber = await getNextSetNumber(experimentId);
    const docsToInsert = [];
    for (let idx = 0; idx < setCount; idx += 1) {
      const start = idx * QUESTIONS_PER_SET;
      const end = start + QUESTIONS_PER_SET;
      docsToInsert.push({
        experimentId,
        setNumber: startingSetNumber + idx,
        questions: generatedQuestions.slice(start, end).map((item) => ({
          question: item.question,
          options: item.options,
          correctOptionIndex: item.correctOptionIndex,
          explanation: item.explanation || "",
          difficulty: normalizeDifficulty(item.difficulty),
        })),
        source: aiResult.ok ? "ai" : "custom",
        createdBy: req.user.id,
      });
    }

    const inserted = await VivaQuestion.insertMany(docsToInsert);

    return res.status(201).json({
      sets: inserted.map(mapVivaQuestionSet),
      meta: {
        provider: aiResult.ok ? "gemini" : "fallback",
        model: aiResult.ok ? DEFAULT_MODEL : "local",
        fallbackUsed: !aiResult.ok,
        topicsUsed: topics,
        message: aiResult.ok
          ? `AI generation successful (${setCount} set(s) created)`
          : `AI unavailable; fallback set(s) generated (${setCount})`,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to generate viva question sets", error: error.message });
  }
};

exports.updateVivaQuestion = async (req, res) => {
  try {
    const { questionId } = req.params;
    const existing = await VivaQuestion.findById(questionId);
    if (!existing) return res.status(404).json({ message: "Viva set not found" });

    const access = await ensureExperimentAccess(existing.experimentId, req.user);
    if (access.error) return res.status(access.error.status).json({ message: access.error.message });

    const parsed = validateSetPayload(req.body);
    if (parsed.error) return res.status(400).json({ message: parsed.error });

    existing.questions = parsed.questions;
    await existing.save();

    return res.json({ set: mapVivaQuestionSet(existing) });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update viva set", error: error.message });
  }
};

exports.deleteVivaQuestion = async (req, res) => {
  try {
    const { questionId } = req.params;
    const existing = await VivaQuestion.findById(questionId);
    if (!existing) return res.status(404).json({ message: "Viva set not found" });

    const access = await ensureExperimentAccess(existing.experimentId, req.user);
    if (access.error) return res.status(access.error.status).json({ message: access.error.message });

    await VivaQuestion.findByIdAndDelete(questionId);
    return res.json({ message: "Viva set deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete viva set", error: error.message });
  }
};
