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

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 .,:;_%()-]/g, "")
    .trim();
}

function computeKeywordCoverage(expectedText, candidateText) {
  const keywords = extractKeywords(expectedText);
  if (keywords.length === 0) return 0;
  const hitCount = keywords.filter((word) => candidateText.includes(word)).length;
  return hitCount / keywords.length;
}

function detectCheatingSignals(problem, files) {
  const expected = normalizeText(problem?.expectedOutput || "");
  const codeText = files.map((f) => String(f.content || "")).join("\n");
  const codeLower = codeText.toLowerCase();

  const hasPrint =
    /(console\.log|print\s*\(|printf\s*\(|cout\s*<<|System\.out\.print|echo\s+)/.test(codeText);
  const hasLogic =
    /(for\s*\(|while\s*\(|if\s*\(|switch\s*\(|function\s+\w+|\w+\s*=>|class\s+\w+|def\s+\w+)/.test(
      codeText
    );
  const hasInput =
    /(readline|stdin|argv|scanf|cin\s*>>|input\s*\(|Scanner|BufferedReader|prompt\s*\()/i.test(
      codeText
    );
  const hardcodedExpected =
    expected.length >= 12 &&
    (codeLower.includes(expected) ||
      expected.split(" ").length >= 4 &&
        expected
          .split(" ")
          .filter((token) => token.length >= 4)
          .slice(0, 6)
          .every((token) => codeLower.includes(token)));

  const shortCode = codeText.split("\n").filter((line) => line.trim() !== "").length <= 10;
  const printOnly = hasPrint && !hasLogic && !hasInput;
  const suspectedCheating = hardcodedExpected && !hasLogic && (printOnly || shortCode);

  let cheatingReason = "";
  if (suspectedCheating) {
    cheatingReason =
      "Code appears to hardcode expected output with print statements and lacks algorithmic logic.";
  }

  return {
    suspectedCheating,
    cheatingReason,
    printOnly,
    hardcodedExpected,
    hasLogic,
    hasInput,
  };
}

function evaluateOutputVerification(problem, files, executionResult) {
  const expected = String(problem.expectedOutput || "").toLowerCase();
  const description = String(problem.description || "").toLowerCase();
  const rubricText = expected || description;
  if (!rubricText) {
    return {
      outputMatchScore: 6.5,
      outputMatched: true,
      mistakeFlags: [],
      outputVerification: "No expected output configured; default verification score applied.",
    };
  }

  const codeText = files.map((f) => f.content.toLowerCase()).join("\n");
  const stdout = String(executionResult?.stdout || "").toLowerCase();
  const stderr = String(executionResult?.stderr || "").toLowerCase();
  const stdoutCoverage = computeKeywordCoverage(rubricText, stdout);
  const codeCoverage = computeKeywordCoverage(rubricText, codeText);
  const descriptionCoverage = description ? computeKeywordCoverage(description, codeText) : 0;
  const bestCoverage = Math.max(stdoutCoverage, codeCoverage, descriptionCoverage * 0.8);

  let score = 2 + bestCoverage * 8;
  const mistakeFlags = [];

  if (stderr && !stdout) {
    score -= 3;
    mistakeFlags.push("Runtime/compile error output detected");
  } else if (stderr) {
    score -= 1;
    mistakeFlags.push("Execution produced stderr warnings/errors");
  }

  if (!stdout && bestCoverage < 0.3) {
    score -= 1.5;
    mistakeFlags.push("Expected output not observed in execution or code");
  }

  const outputMatchScore = round1(clamp(score, 0, MAX_SCORE));
  const outputMatched = outputMatchScore >= 6;
  const outputVerification = outputMatched
    ? "Output appears aligned with expected output signals."
    : "Output verification weak or failed; expected behavior not confidently matched.";

  return {
    outputMatchScore,
    outputMatched,
    mistakeFlags,
    outputVerification,
  };
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
    '  "reasoning": string,',
    '  "issues": string[],',
    '  "suspectedCheating": boolean,',
    '  "cheatingReason": string,',
    '  "mistakeFlags": string[]',
    "}",
    "",
    "Scoring rules:",
    "- Output verification is already computed separately, do not return output score.",
    "- Evaluate code logic quality only.",
    "- If code appears print-only/hardcoded expected output, mark suspectedCheating true.",
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

function buildFeedback({
  outputMatchScore,
  codeQualityScore,
  finalScore,
  daysLate,
  latePenalty,
  reasoning,
  issues,
  suspectedCheating,
  cheatingReason,
  mistakeFlags,
}) {
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
  if (Array.isArray(mistakeFlags) && mistakeFlags.length > 0) {
    lines.push(`Mistakes: ${mistakeFlags.slice(0, 4).join("; ")}`);
  }
  if (suspectedCheating) {
    lines.push(`Cheating flag: ${cheatingReason || "Potential print-only/hardcoded output detected"}`);
  }
  if (Array.isArray(issues) && issues.length > 0) {
    lines.push(`Key issues: ${issues.slice(0, 3).join("; ")}`);
  }

  return lines.join("\n");
}

async function evaluateSubmissionWithAI({ problem, files, executionResult, submittedAt }) {
  const normalizedFiles = normalizeFiles(files);
  const outputReview = evaluateOutputVerification(problem, normalizedFiles, executionResult);
  const cheatSignals = detectCheatingSignals(problem, normalizedFiles);
  const aiResponse = await callGemini(problem, normalizedFiles, executionResult);

  let outputMatchScore = outputReview.outputMatchScore;
  let codeQualityScore;
  let reasoning = "";
  let outputVerification = outputReview.outputVerification;
  let issues = [...outputReview.mistakeFlags];
  let mistakeFlags = [...outputReview.mistakeFlags];
  let suspectedCheating = cheatSignals.suspectedCheating;
  let cheatingReason = cheatSignals.cheatingReason;
  let provider = "heuristic";
  let model = "local";

  if (aiResponse.ok) {
    const data = aiResponse.data;
    codeQualityScore = clamp(Number(data.codeQualityScore), 0, MAX_SCORE);
    reasoning = String(data.reasoning || "");
    issues = issues.concat(Array.isArray(data.issues) ? data.issues.map(String).slice(0, 8) : []);
    mistakeFlags = mistakeFlags.concat(
      Array.isArray(data.mistakeFlags) ? data.mistakeFlags.map(String).slice(0, 8) : []
    );
    if (data.suspectedCheating === true) suspectedCheating = true;
    if (data.cheatingReason) cheatingReason = String(data.cheatingReason);
    provider = "gemini";
    model = DEFAULT_MODEL;
  } else {
    codeQualityScore = heuristicCodeScore(normalizedFiles);
    reasoning = `Fallback grading used because AI call failed: ${aiResponse.message}`;
  }

  if (!Number.isFinite(codeQualityScore)) {
    codeQualityScore = heuristicCodeScore(normalizedFiles);
  }

  if (cheatSignals.printOnly) {
    mistakeFlags.push("Print-only implementation without core logic");
  }
  if (cheatSignals.hardcodedExpected) {
    mistakeFlags.push("Expected output appears hardcoded in source");
  }

  outputMatchScore = round1(clamp(outputMatchScore, 0, MAX_SCORE));
  codeQualityScore = round1(clamp(codeQualityScore, 0, MAX_SCORE));

  if (suspectedCheating) {
    outputMatchScore = Math.min(outputMatchScore, 3);
    codeQualityScore = Math.min(codeQualityScore, 2.5);
    if (cheatingReason) {
      issues.push(`Cheating suspicion: ${cheatingReason}`);
    }
  }

  let rawScore = round1(outputMatchScore * 0.8 + codeQualityScore * 0.2);

  // First gate: output verification must pass before high score.
  if (!outputReview.outputMatched) {
    rawScore = Math.min(rawScore, 4.5);
  }

  if (suspectedCheating) {
    rawScore = Math.min(rawScore, 3);
  }

  const lateness = computeLatePenalty(problem, submittedAt);
  let finalScore = round1(clamp(rawScore - lateness.latePenalty, 0, MAX_SCORE));

  // Requested rule: on-time + output match = full marks (unless cheating is suspected).
  if (outputReview.outputMatched && lateness.daysLate === 0 && !suspectedCheating) {
    rawScore = MAX_SCORE;
    finalScore = MAX_SCORE;
  }

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
      suspectedCheating,
      cheatingReason,
      mistakeFlags,
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
      outputMatched: outputReview.outputMatched,
      mistakeFlags: Array.from(new Set(mistakeFlags)).slice(0, 10),
      suspectedCheating,
      cheatingReason: cheatingReason || "",
      issues: Array.from(new Set(issues)).slice(0, 10),
    },
  };
}

module.exports = {
  MAX_SCORE,
  evaluateSubmissionWithAI,
};
