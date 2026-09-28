// LLM Response Evaluator
// Score two AI responses to the same prompt on a 5-part rubric, flag common
// failure modes, pick a preference, write a rationale, and export the results.

// ---- Rubric definition -------------------------------------------------
// Each dimension is scored 1 (poor) to 5 (excellent).
const RUBRIC = [
  { key: "instruction", label: "Instruction following" },
  { key: "accuracy", label: "Factual accuracy" },
  { key: "relevance", label: "Relevance" },
  { key: "reasoning", label: "Reasoning quality" },
  { key: "clarity", label: "Clarity & formatting" },
];

// Common failure modes evaluators are asked to flag.
const FLAGS = [
  { key: "hallucination", label: "Hallucination" },
  { key: "missedConstraint", label: "Missed constraint" },
  { key: "incomplete", label: "Incomplete" },
  { key: "unsafe", label: "Unsafe / policy issue" },
  { key: "overRefusal", label: "Unnecessary refusal" },
];

// Preference scale: negative favors A, positive favors B.
const PREFS = [
  { value: -2, label: "A much better" },
  { value: -1, label: "A slightly better" },
  { value: 0, label: "Tie" },
  { value: 1, label: "B slightly better" },
  { value: 2, label: "B much better" },
];

const STORAGE_KEY = "llm-evals-v1";
const $ = (id) => document.getElementById(id);

// ---- Storage (wrapped in try/catch so the app still works if blocked) ----
function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function persist(list) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}
let saved = loadSaved();

// ---- Build the form controls from the rubric ---------------------------
function buildControls() {
  document.querySelectorAll(".scores").forEach((box) => {
    const side = box.dataset.side;
    RUBRIC.forEach((dim) => {
      const row = document.createElement("div");
      row.className = "score-row";
      const opts = [1, 2, 3, 4, 5].map((n) => `<option value="${n}">${n}</option>`).join("");
      row.innerHTML = `<span>${dim.label}</span>
        <select id="${side}-${dim.key}" aria-label="${dim.label} score for response ${side}">
          <option value="">–</option>${opts}
        </select>`;
      box.appendChild(row);
    });
  });

  document.querySelectorAll(".flags").forEach((box) => {
    const side = box.dataset.side;
    box.innerHTML = FLAGS.map((f) =>
      `<label><input type="checkbox" id="${side}-flag-${f.key}"> ${f.label}</label>`
    ).join("");
  });

  $("preference").innerHTML = PREFS.map((p) =>
    `<label><input type="radio" name="pref" value="${p.value}">${p.label}</label>`
  ).join("");

  document.querySelectorAll("select").forEach((s) => s.addEventListener("change", updateTotals));
}

// ---- Read current form state -------------------------------------------
function readSide(side) {
  const scores = {};
  RUBRIC.forEach((dim) => {
    const v = $(`${side}-${dim.key}`).value;
    scores[dim.key] = v ? Number(v) : null;
  });
  const flags = FLAGS.filter((f) => $(`${side}-flag-${f.key}`).checked).map((f) => f.key);
  const total = Object.values(scores).reduce((sum, v) => sum + (v || 0), 0);
  return { text: $(`resp${side}`).value.trim(), scores, flags, total };
}

function updateTotals() {
  $("totalA").textContent = readSide("A").total;
  $("totalB").textContent = readSide("B").total;
}

// ---- Quality checks ----------------------------------------------------
// Catches the kinds of inconsistencies a QA reviewer would send back.
function validate(evalItem) {
  const problems = [];
  const { A, B, preference, rationale, prompt } = evalItem;

  if (!prompt) problems.push("Add the prompt.");
  if (!A.text || !B.text) problems.push("Both responses are required.");

  for (const [side, data] of [["A", A], ["B", B]]) {
    if (Object.values(data.scores).some((v) => v === null)) {
      problems.push(`Score every rubric dimension for Response ${side}.`);
    }
    // A hallucination should pull the accuracy score down.
    if (data.flags.includes("hallucination") && data.scores.accuracy >= 4) {
      problems.push(`Response ${side} is flagged for hallucination but accuracy is ${data.scores.accuracy}/5.`);
    }
    // A missed constraint should pull instruction-following down.
    if (data.flags.includes("missedConstraint") && data.scores.instruction >= 4) {
      problems.push(`Response ${side} missed a constraint but instruction following is ${data.scores.instruction}/5.`);
    }
  }

  if (preference === null) problems.push("Choose a preference.");
  // Preference should agree with the score totals.
  if (preference !== null && preference < 0 && B.total > A.total) {
    problems.push(`You preferred A, but B scored higher (${B.total} vs ${A.total}). Re-check scores or explain in the rationale.`);
  }
  if (preference !== null && preference > 0 && A.total > B.total) {
    problems.push(`You preferred B, but A scored higher (${A.total} vs ${B.total}). Re-check scores or explain in the rationale.`);
  }
  if (rationale.length < 40) problems.push("Rationale is too short. Name specific reasons (at least 40 characters).");

  return problems;
}

function showWarnings(list) {
  $("warnings").innerHTML = list.length ? `<ul>${list.map((p) => `<li>${p}</li>`).join("")}</ul>` : "";
}

// ---- Save / render -----------------------------------------------------
function collect() {
  const pref = document.querySelector('input[name="pref"]:checked');
  return {
    id: Date.now(),
    createdAt: new Date().toISOString(),
    prompt: $("prompt").value.trim(),
    A: readSide("A"),
    B: readSide("B"),
    preference: pref ? Number(pref.value) : null,
    rationale: $("rationale").value.trim(),
  };
}

function save() {
  const item = collect();
  const problems = validate(item);
  showWarnings(problems);
  if (problems.length) return;
  saved.push(item);
  persist(saved);
  render();
  resetForm();
}

function prefLabel(v) {
  return (PREFS.find((p) => p.value === v) || {}).label || "";
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function render() {
  $("count").textContent = saved.length;
  $("rows").innerHTML = saved.map((e, i) => {
    const flags = [...e.A.flags.map((f) => "A:" + f), ...e.B.flags.map((f) => "B:" + f)].join(", ") || "—";
    const short = e.prompt.length > 90 ? e.prompt.slice(0, 90) + "…" : e.prompt;
    return `<tr><td>${i + 1}</td><td class="prompt">${escapeHtml(short)}</td>
      <td>${e.A.total}</td><td>${e.B.total}</td><td>${prefLabel(e.preference)}</td><td>${flags}</td></tr>`;
  }).join("");
}

function resetForm() {
  ["prompt", "respA", "respB", "rationale"].forEach((id) => ($(id).value = ""));
  document.querySelectorAll("select").forEach((s) => (s.value = ""));
  document.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach((i) => (i.checked = false));
  showWarnings([]);
  updateTotals();
}

// ---- Export ------------------------------------------------------------
function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function toCsv(list) {
  const cols = ["id", "createdAt", "prompt",
    ...RUBRIC.map((d) => "A_" + d.key), "A_total", "A_flags",
    ...RUBRIC.map((d) => "B_" + d.key), "B_total", "B_flags",
    "preference", "rationale"];
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = list.map((e) => [
    e.id, e.createdAt, e.prompt,
    ...RUBRIC.map((d) => e.A.scores[d.key]), e.A.total, e.A.flags.join("|"),
    ...RUBRIC.map((d) => e.B.scores[d.key]), e.B.total, e.B.flags.join("|"),
    prefLabel(e.preference), e.rationale,
  ].map(q).join(","));
  return [cols.join(","), ...lines].join("\n");
}

// ---- Sample task for demos ---------------------------------------------
const SAMPLE = {
  prompt: "In exactly 3 bullet points, explain why the sky is blue to a 10-year-old.",
  a: "• Sunlight is made of all the colors mixed together.\n• When sunlight hits the air, the tiny bits of air bounce blue light around much more than red light.\n• So blue light comes at your eyes from every direction, and the whole sky looks blue!",
  b: "The sky is blue because it reflects the ocean, which covers 71% of Earth. Scientists proved this in 1902. Also, blue is the most common color in nature, so our eyes are trained to see it. On cloudy days the sky turns gray because the ocean gets darker.",
};

function loadSample() {
  $("prompt").value = SAMPLE.prompt;
  $("respA").value = SAMPLE.a;
  $("respB").value = SAMPLE.b;
}

// ---- Wire up -----------------------------------------------------------
buildControls();
render();
$("save").addEventListener("click", save);
$("reset").addEventListener("click", resetForm);
$("loadSample").addEventListener("click", loadSample);
$("exportJson").addEventListener("click", () => download("evaluations.json", JSON.stringify(saved, null, 2), "application/json"));
$("exportCsv").addEventListener("click", () => download("evaluations.csv", toCsv(saved), "text/csv"));
$("clearAll").addEventListener("click", () => {
  saved = [];
  persist(saved);
  render();
});
