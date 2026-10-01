"use strict";

/* ---------------- State ---------------- */
const state = {
  refFiles: [],      // reference Excel files (max 5)
  useCaseFile: null, // optional PPT/PDF
  goldenFile: null,  // optional golden test case Excel
  generated: [],     // generated test cases
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
  return (value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
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
    li.innerHTML = `<span>📄 ${f.name} <em style="color:#64748b">(${size} KB)</em></span>`;
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

/* ---------------- Use case upload ---------------- */
$("useCaseBrowseBtn").addEventListener("click", () => $("useCaseFile").click());
$("useCaseFile").addEventListener("change", (e) => {
  state.useCaseFile = e.target.files[0] || null;
  $("useCaseName").textContent = state.useCaseFile ? state.useCaseFile.name : "No file selected";
});

/* ---------------- Golden test case upload ---------------- */
$("goldenBrowseBtn").addEventListener("click", () => $("goldenFile").click());
$("goldenFile").addEventListener("change", (e) => {
  state.goldenFile = e.target.files[0] || null;
  $("goldenName").textContent = state.goldenFile ? state.goldenFile.name : "No file selected";
});

/* ---------------- Cancel / reset ---------------- */
$("cancelBtn").addEventListener("click", () => {
  $("generatorForm").reset();
  state.refFiles = [];
  state.useCaseFile = null;
  state.goldenFile = null;
  state.generated = [];
  renderRefFiles();
  $("useCaseName").textContent = "No file selected";
  $("goldenName").textContent = "No file selected";
  $("resultsTabBtn").disabled = true;
  document.querySelectorAll(".invalid").forEach((el) => el.classList.remove("invalid"));
  switchTab("input");
  toast("Form cleared");
});

/* ---------------- Validation ---------------- */
function validate() {
  let ok = true;
  document.querySelectorAll(".invalid").forEach((el) => el.classList.remove("invalid"));

  const functionality = $("functionality");
  const keywords = $("keywords");

  if (!functionality.value.trim()) { functionality.classList.add("invalid"); ok = false; }
  if (!keywords.value.trim()) { keywords.classList.add("invalid"); ok = false; }

  if (!ok) toast("Please fill required fields", "error");
  return ok;
}

/* ---------------- Generation logic ---------------- */
function generateTestCases() {
  const testType = document.querySelector('input[name="testType"]:checked').value;
  const functionality = $("functionality").value.trim();
  const keywords = splitCsv($("keywords").value);
  const channels = splitCsv($("channels").value);
  const scenarios = splitCsv($("scenario").value);
  const golden = state.goldenFile ? state.goldenFile.name : "";

  const channelList = channels.length ? channels : ["Default"];
  const cases = [];
  let counter = 1;
  const pad = (n) => String(n).padStart(3, "0");

  // Golden test case takes topmost priority
  if (golden) {
    cases.push({
      id: `TC-${pad(counter++)}`,
      title: `[Golden] ${functionality} - based on ${golden}`,
      type: testType,
      channel: channelList[0],
      precondition: "System is available and user is authenticated",
      steps: `1. Reference golden test case file: ${golden}\n2. Execute ${functionality} flow\n3. Validate outcome`,
      expected: "Behaviour matches the golden reference test case",
      priority: "High",
    });
  }

  // Keyword x Channel matrix (positive cases)
  keywords.forEach((kw) => {
    channelList.forEach((ch) => {
      cases.push({
        id: `TC-${pad(counter++)}`,
        title: `Verify ${functionality} - ${kw} on ${ch}`,
        type: testType,
        channel: ch,
        precondition: `${ch} channel is accessible and preconditions for ${functionality} are met`,
        steps: `1. Navigate to ${functionality} on ${ch}\n2. Apply "${kw}" input/condition\n3. Submit and observe the result`,
        expected: `${functionality} handles "${kw}" correctly on ${ch} without errors`,
        priority: "Medium",
      });
    });
  });

  // Negative / validation case per keyword
  keywords.forEach((kw) => {
    cases.push({
      id: `TC-${pad(counter++)}`,
      title: `Negative - ${functionality} with invalid ${kw}`,
      type: testType,
      channel: channelList[0],
      precondition: `${functionality} is accessible`,
      steps: `1. Open ${functionality}\n2. Provide invalid "${kw}" value\n3. Submit`,
      expected: `Appropriate validation/error message is shown for invalid "${kw}"`,
      priority: "Low",
    });
  });

  // Scenario-driven cases
  scenarios.forEach((sc) => {
    channelList.forEach((ch) => {
      cases.push({
        id: `TC-${pad(counter++)}`,
        title: `Scenario - ${sc} (${functionality}) on ${ch}`,
        type: testType,
        channel: ch,
        precondition: `Setup required for scenario "${sc}"`,
        steps: `1. Prepare data for "${sc}"\n2. Execute ${functionality} on ${ch}\n3. Verify results against expectation`,
        expected: `Scenario "${sc}" completes successfully on ${ch}`,
        priority: "Medium",
      });
    });
  });

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
      <td>${escapeHtml(tc.type)}</td>
      <td>${escapeHtml(tc.channel)}</td>
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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

/* ---------------- Form submit ---------------- */
$("generatorForm").addEventListener("submit", (e) => {
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
    "Type": tc.type,
    "Channel": tc.channel,
    "Precondition": tc.precondition,
    "Test Steps": tc.steps,
    "Expected Result": tc.expected,
    "Priority": tc.priority,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 12 }, { wch: 40 }, { wch: 18 }, { wch: 14 },
    { wch: 35 }, { wch: 45 }, { wch: 40 }, { wch: 10 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Test Cases");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  XLSX.writeFile(wb, `generated-test-cases-${stamp}.xlsx`);
  toast("Exported to Excel", "success");
});

/* ---------------- Init ---------------- */
renderRefFiles();
