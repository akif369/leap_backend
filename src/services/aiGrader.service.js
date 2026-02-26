const MAX_SCORE = 10;
const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round1 = (value) => Math.round(value * 10) / 10;

const stopWords = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "this",
  "that",
  "into",
  "your",
  "have",
  "will",
  "per",
  "using",
  "output",
  "algorithm",
]);

function normalizeFiles(files) {
  if (!Array.isArray(files)) return [];
  return files
    .filter((file) => file && file.type === "file")
    .map((file) => ({
      name: String(file.name || "main.txt"),
      content: String(file.content || ""),
      path: String(file.path || file.name || "main.txt"),
    }));
}

function buildCodeBundle(files, limit = 26000) {
  const sections = files.map((file) => `// File: ${file.path}\n${file.content}`);
  const bundle = sections.join("\n\n");
  if (bundle.length <= limit) return bundle;
  return bundle.slice(0, limit) + "\n\n// [truncated]";
}

function extractKeywords(text) {
  return Array.from(
    new Set(
      String(text || "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((word) => word.trim())
        .filter((word) => word.length >= 4 && !stopWords.has(word))
    )
  ).slice(0, 12);
}

function heuristicOutputScore(problem, files, executionResult) {
  const expected = String(problem.expectedOutput || "").toLowerCase();
  if (!expected) return 6.5;

  const codeText = files.map((f) => f.content.toLowerCase()).join("\n");
  const stdout = String(executionResult?.stdout || "").toLowerCase();
  const stderr = String(executionResult?.stderr || "").toLowerCase();
  const haystack = `${stdout}\n${codeText}`;

  const keywords = extractKeywords(expected);
  if (keywords.length === 0) return 6.5;

  const hitCount = keywords.filter((word) => haystack.includes(word)).length;
  const coverage = hitCount / keywords.length;
  let score = 2 + coverage * 8;

  if (stdout && stderr) score -= 0.8;
  if (stderr && !stdout) score -= 1.5;

  return round1(clamp(score, 0, MAX_SCORE));
}

function heuristicCodeScore(files) {
  if (!files.length) return 0;
  const fullText = files.map((f) => f.content).join("\n");
  const lengthScore = clamp(fullText.length / 1200, 0, 4);
  const hasControlFlow = /(for|while|if|switch)\s*\(/.test(fullText) ? 2 : 0.5;
  const hasFunction = /(function\s+\w+|\w+\s*=>)/.test(fullText) ? 2 : 0.5;
  const hasComments = /(\/\/|\/\*)/.test(fullText) ? 1 : 0.2;
  return round1(clamp(lengthScore + hasControlFlow + hasFunction + hasComments, 0, MAX_SCORE));
}

function parseJsonFromText(text) {
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
}

async function callGemini(problem, files, executionResult) {
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    return { ok: false, message: "GEMINI_API_KEY is not set" };
  }

  const codeBundle = buildCodeBundle(files);
  const prompt = [
    "You are evaluating a student lab submission.",
    "Return ONLY JSON with keys:",
    "{",
    '  "codeQualityScore": number(0-10),',
    '  "outputMatchScore": number(0-10),',
    '  "reasoning": string,',
    '  "outputVerification": string,',
    '  "issues": string[]',
    "}",
    "",
    "Scoring rules:",
    "- Output verification accuracy is most important.",
    "- Evaluate if code likely matches problem and expected output.",
    "- Penalize obvious runtime issues, missing logic, or incomplete implementation.",
    "",
    `Problem title: ${problem.title || ""}`,
    `Problem description: ${problem.description || ""}`,
    `Expected output: ${problem.expectedOutput || ""}`,
    `Hints: ${Array.isArray(problem.hints) ? problem.hints.join(" | ") : ""}`,
    "",
    "Execution result (if present):",
    `stdout: ${String(executionResult?.stdout || "")}`,
    `stderr: ${String(executionResult?.stderr || "")}`,
    `exitCode: ${executionResult?.exitCode ?? "unknown"}`,
    "",
    "Student files:",
    codeBundle,
  ].join("\n");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);
  let response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(DEFAULT_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
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
    const message =
      payload?.error?.message ||
      payload?.message ||
      `Gemini request failed (${response.status})`;
    return { ok: false, message: String(message) };
  }

  const text =
    payload?.candidates?.[0]?.content?.parts
      ?.map((part) => part?.text || "")
      .join("\n")
      .trim() || "";

  const parsed = parseJsonFromText(text);
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, message: "Gemini returned non-JSON content" };
  }

  return { ok: true, data: parsed };
}

function computeLatePenalty(problem, submittedAt) {
  const dueAt = problem?.dueAt ? new Date(problem.dueAt) : null;
  if (!dueAt || Number.isNaN(dueAt.getTime())) {
    return { dueAt: null, daysLate: 0, latePenalty: 0 };
  }

  const submitted = new Date(submittedAt);
  if (submitted.getTime() <= dueAt.getTime()) {
    return { dueAt, daysLate: 0, latePenalty: 0 };
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const daysLate = Math.ceil((submitted.getTime() - dueAt.getTime()) / dayMs);
  const perDay =
    Number.isFinite(Number(problem?.latePenaltyPerDay)) && Number(problem?.latePenaltyPerDay) >= 0
      ? Number(problem.latePenaltyPerDay)
      : 0.5;

  return {
    dueAt,
    daysLate,
    latePenalty: round1(clamp(daysLate * perDay, 0, MAX_SCORE)),
  };
}

function buildFeedback({ outputMatchScore, codeQualityScore, finalScore, daysLate, latePenalty, reasoning, issues }) {
  const lines = [
    `AI score: ${finalScore}/${MAX_SCORE}`,
    `Output verification: ${outputMatchScore}/${MAX_SCORE}`,
    `Code quality: ${codeQualityScore}/${MAX_SCORE}`,
  ];

  if (daysLate > 0) {
    lines.push(`Late penalty: -${latePenalty} (${daysLate} day(s) late)`);
  } else {
    lines.push("Submission timing: on time");
  }

  if (reasoning) lines.push(`Review: ${reasoning}`);
  if (Array.isArray(issues) && issues.length > 0) {
    lines.push(`Key issues: ${issues.slice(0, 3).join("; ")}`);
  }

  return lines.join("\n");
}

async function evaluateSubmissionWithAI({ problem, files, executionResult, submittedAt }) {
  const normalizedFiles = normalizeFiles(files);
  const aiResponse = await callGemini(problem, normalizedFiles, executionResult);

  let outputMatchScore;
  let codeQualityScore;
  let reasoning = "";
  let outputVerification = "";
  let issues = [];
  let provider = "heuristic";
  let model = "local";

  if (aiResponse.ok) {
    const data = aiResponse.data;
    outputMatchScore = clamp(Number(data.outputMatchScore), 0, MAX_SCORE);
    codeQualityScore = clamp(Number(data.codeQualityScore), 0, MAX_SCORE);
    reasoning = String(data.reasoning || "");
    outputVerification = String(data.outputVerification || "");
    issues = Array.isArray(data.issues) ? data.issues.map(String).slice(0, 8) : [];
    provider = "gemini";
    model = DEFAULT_MODEL;
  } else {
    outputMatchScore = heuristicOutputScore(problem, normalizedFiles, executionResult);
    codeQualityScore = heuristicCodeScore(normalizedFiles);
    reasoning = `Fallback grading used because AI call failed: ${aiResponse.message}`;
    outputVerification = "Estimated using expected-output keyword coverage and execution stderr/stdout signals.";
  }

  const rawScore = round1(outputMatchScore * 0.7 + codeQualityScore * 0.3);
  const lateness = computeLatePenalty(problem, submittedAt);
  const finalScore = round1(clamp(rawScore - lateness.latePenalty, 0, MAX_SCORE));

  return {
    score: finalScore,
    feedback: buildFeedback({
      outputMatchScore,
      codeQualityScore,
      finalScore,
      daysLate: lateness.daysLate,
      latePenalty: lateness.latePenalty,
      reasoning,
      issues,
    }),
    aiEvaluation: {
      provider,
      model,
      codeQualityScore: round1(codeQualityScore),
      outputMatchScore: round1(outputMatchScore),
      rawScore,
      latePenalty: lateness.latePenalty,
      finalScore,
      daysLate: lateness.daysLate,
      dueAt: lateness.dueAt,
      submittedAt: new Date(submittedAt),
      reasoning,
      outputVerification,
      issues,
    },
  };
}

module.exports = {
  MAX_SCORE,
  evaluateSubmissionWithAI,
};
