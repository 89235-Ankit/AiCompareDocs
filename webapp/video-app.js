"use strict";

/* ---------------- State ---------------- */
const state = {
  refFiles: [],   // reference Excel files (max 5)
  generated: [],  // generated test cases
};
const MAX_REF_FILES = 5;

/* ---------------- Helpers ---------------- */
const $ = (id) => document.getElementById(id);

function toast(msg, type = "") {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.className = `toast ${type}`;
  el.textContent = msg;
  requestAnimationFrame(() => el.classList.add("show"));
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 2800);
}

function splitCsv(value) {
  return (value || "").split(",").map((s) => s.trim()).filter(Boolean);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

/* ---------------- Tab switching ---------------- */
function switchTab(name) {
  document.querySelectorAll(".tab-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === name)
  );
  document.querySelectorAll(".tab-panel").forEach((p) =>
    p.classList.toggle("active", p.id === `tab-${name}`)
  );
}
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.disabled) return;
    switchTab(btn.dataset.tab);
  });
});

/* ---------------- URL validation ---------------- */
function isValidUrl(value) {
  if (!value) return false;
  try {
    const u = new URL(value.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function validateUrlField() {
  const input = $("videoUrl");
  const err = $("videoUrlError");
  const val = input.value.trim();
  if (!val) {
    input.classList.remove("invalid");
    err.textContent = "";
    return false;
  }
  if (!isValidUrl(val)) {
    input.classList.add("invalid");
    err.textContent = "Please enter a valid URL (http:// or https://).";
    return false;
  }
  input.classList.remove("invalid");
  err.textContent = "";
  return true;
}
// Validate on Tab / leaving the field
$("videoUrl").addEventListener("blur", validateUrlField);
$("videoUrl").addEventListener("keydown", (e) => {
  if (e.key === "Tab") validateUrlField();
});
$("videoUrl").addEventListener("input", () => {
  if ($("videoUrl").classList.contains("invalid")) validateUrlField();
});

/* ---------------- Default sample URL (copyable, clears on typing) ---------------- */
(() => {
  const urlInput = $("videoUrl");
  const defaultUrl = urlInput.dataset.default || "";
  const isDefault = () => urlInput.value === defaultUrl;

  // Select all on focus so the sample can be copied easily.
  urlInput.addEventListener("focus", () => {
    if (isDefault()) urlInput.select();
  });

  // Clear the sample as soon as the user starts typing/pasting.
  urlInput.addEventListener("beforeinput", (e) => {
    if (isDefault() && e.inputType && e.inputType.startsWith("insert")) {
      urlInput.value = "";
    }
  });
})();

/* ---------------- Char counters ---------------- */
["targetedFunctionality", "videoKeywords", "highLevelExpectation"].forEach((id) => {
  const ta = $(id);
  const counter = $(`${id}Count`);
  ta.addEventListener("input", () => { counter.textContent = ta.value.length; });
});

/* ---------------- Full UI flow toggle ---------------- */
function applyFullFlowState() {
  const isNo = document.querySelector('input[name="fullFlow"]:checked').value === "No";
  ["targetedFunctionality", "videoKeywords"].forEach((id) => {
    const ta = $(id);
    ta.disabled = !isNo;
    if (!isNo) {
      ta.value = "";
      $(`${id}Count`).textContent = "0";
      ta.classList.remove("invalid");
    }
  });
}
document.querySelectorAll('input[name="fullFlow"]').forEach((r) =>
  r.addEventListener("change", applyFullFlowState)
);

/* ---------------- Reference file upload ---------------- */
$("refBrowseBtn").addEventListener("click", () => $("refFiles").click());
$("refFiles").addEventListener("change", (e) => {
  const incoming = Array.from(e.target.files || []);
  for (const f of incoming) {
    if (state.refFiles.length >= MAX_REF_FILES) {
      toast(`Maximum ${MAX_REF_FILES} files allowed`, "error");
      break;
    }
    if (state.refFiles.some((x) => x.name === f.name && x.size === f.size)) continue;
    state.refFiles.push(f);
  }
  e.target.value = "";
  renderRefFiles();
});

function renderRefFiles() {
  const list = $("refFileList");
  list.innerHTML = "";
  state.refFiles.forEach((f, i) => {
    const li = document.createElement("li");
    const size = (f.size / 1024).toFixed(1);
    li.innerHTML = `<span>📄 ${escapeHtml(f.name)} <em style="color:#64748b">(${size} KB)</em></span>`;
    const rm = document.createElement("button");
    rm.className = "remove";
    rm.type = "button";
    rm.textContent = "×";
    rm.title = "Remove";
    rm.addEventListener("click", () => {
      state.refFiles.splice(i, 1);
      renderRefFiles();
    });
    li.appendChild(rm);
    list.appendChild(li);
  });
}

/* ---------------- Cancel / reset ---------------- */
$("cancelBtn").addEventListener("click", () => {
  $("videoForm").reset();
  state.refFiles = [];
  state.generated = [];
  renderRefFiles();
  ["targetedFunctionalityCount", "videoKeywordsCount", "highLevelExpectationCount"]
    .forEach((id) => ($(id).textContent = "0"));
  $("videoUrlError").textContent = "";
  document.querySelectorAll(".invalid").forEach((el) => el.classList.remove("invalid"));
  applyFullFlowState();
  $("resultsTabBtn").disabled = true;
  switchTab("input");
  toast("Form cleared");
});

/* ---------------- Validation ---------------- */
function validate() {
  let ok = true;
  document.querySelectorAll(".invalid").forEach((el) => el.classList.remove("invalid"));

  const url = $("videoUrl");
  if (!url.value.trim()) {
    url.classList.add("invalid");
    $("videoUrlError").textContent = "OneDrive video URL is required.";
    ok = false;
  } else if (!isValidUrl(url.value)) {
    url.classList.add("invalid");
    $("videoUrlError").textContent = "Please enter a valid URL (http:// or https://).";
    ok = false;
  }

  const isNo = document.querySelector('input[name="fullFlow"]:checked').value === "No";
  if (isNo && !$("targetedFunctionality").value.trim()) {
    $("targetedFunctionality").classList.add("invalid");
    ok = false;
  }

  if (!ok) toast("Please fix the highlighted fields", "error");
  return ok;
}

/* ---------------- Generation logic ---------------- */
function generateTestCases() {
  const testLevel = document.querySelector('input[name="testLevel"]:checked').value;
  const fullFlow = document.querySelector('input[name="fullFlow"]:checked').value === "Yes";
  const targeted = $("targetedFunctionality").value.trim();
  const keywords = splitCsv($("videoKeywords").value);
  const expectation = $("highLevelExpectation").value.trim();

  const cases = [];
  let counter = 1;
  const pad = (n) => String(n).padStart(3, "0");
  const baseExpected = expectation || "Behaviour matches the recorded video walkthrough";

  if (fullFlow) {
    const steps = [
      "Launch the application as shown in the video",
      "Navigate through each screen in the recorded sequence",
      "Interact with every control encountered in the flow",
      "Return to the starting screen",
    ];
    steps.forEach((s, idx) => {
      cases.push({
        id: `TC-${pad(counter++)}`,
        title: `UI Flow Step ${idx + 1} - ${s}`,
        level: testLevel,
        precondition: idx === 0 ? "Application is accessible and user is authenticated" : "Previous step completed successfully",
        steps: `1. ${s}\n2. Verify the screen/state matches the video`,
        expected: `Step behaves as demonstrated in the video. ${baseExpected}`,
        priority: idx === 0 ? "High" : "Medium",
      });
    });
    cases.push({
      id: `TC-${pad(counter++)}`,
      title: "End-to-end UI navigation completes successfully",
      level: testLevel,
      precondition: "All individual flow steps pass",
      steps: "1. Execute the complete UI flow from start to finish\n2. Validate no broken navigation or errors",
      expected: baseExpected,
      priority: "High",
    });
  } else {
    // Targeted functionality
    cases.push({
      id: `TC-${pad(counter++)}`,
      title: `Verify targeted functionality: ${targeted.slice(0, 60)}`,
      level: testLevel,
      precondition: "Application is accessible and user is authenticated",
      steps: `1. Navigate to the functionality shown in the video\n2. Perform: ${targeted}\n3. Observe the outcome`,
      expected: baseExpected,
      priority: "High",
    });

    keywords.forEach((kw) => {
      cases.push({
        id: `TC-${pad(counter++)}`,
        title: `Verify "${kw}" within ${targeted.slice(0, 40)}`,
        level: testLevel,
        precondition: "Targeted functionality is reachable",
        steps: `1. Trigger the "${kw}" behaviour as seen in the video\n2. Validate the result`,
        expected: `"${kw}" behaves as expected. ${baseExpected}`,
        priority: "Medium",
      });
      cases.push({
        id: `TC-${pad(counter++)}`,
        title: `Negative - invalid "${kw}"`,
        level: testLevel,
        precondition: "Targeted functionality is reachable",
        steps: `1. Provide an invalid "${kw}" input\n2. Submit`,
        expected: `Appropriate validation/error message is shown for invalid "${kw}"`,
        priority: "Low",
      });
    });
  }

  return cases;
}

/* ---------------- Render results ---------------- */
function renderResults() {
  const body = $("resultsBody");
  body.innerHTML = "";
  state.generated.forEach((tc) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${tc.id}</td>
      <td>${escapeHtml(tc.title)}</td>
      <td>${escapeHtml(tc.level)}</td>
      <td>${escapeHtml(tc.precondition)}</td>
      <td><pre>${escapeHtml(tc.steps)}</pre></td>
      <td>${escapeHtml(tc.expected)}</td>
      <td><span class="badge ${tc.priority.toLowerCase()}">${tc.priority}</span></td>
    `;
    body.appendChild(tr);
  });
  $("resultsSummary").textContent =
    `${state.generated.length} test case(s) generated • ${state.refFiles.length} reference file(s) used`;
}

/* ---------------- Form submit ---------------- */
$("videoForm").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!validate()) return;
  state.generated = generateTestCases();
  renderResults();
  $("resultsTabBtn").disabled = false;
  switchTab("results");
  toast(`${state.generated.length} test cases generated`, "success");
});

$("backBtn").addEventListener("click", () => switchTab("input"));

/* ---------------- Export to Excel ---------------- */
$("exportBtn").addEventListener("click", () => {
  if (!state.generated.length) {
    toast("Nothing to export", "error");
    return;
  }
  const rows = state.generated.map((tc) => ({
    "Test Case ID": tc.id,
    "Title": tc.title,
    "Level": tc.level,
    "Precondition": tc.precondition,
    "Test Steps": tc.steps,
    "Expected Result": tc.expected,
    "Priority": tc.priority,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 12 }, { wch: 45 }, { wch: 22 }, { wch: 35 },
    { wch: 45 }, { wch: 40 }, { wch: 10 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Test Cases");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  XLSX.writeFile(wb, `video-test-cases-${stamp}.xlsx`);
  toast("Exported to Excel", "success");
});

/* ---------------- Init ---------------- */
applyFullFlowState();
renderRefFiles();
