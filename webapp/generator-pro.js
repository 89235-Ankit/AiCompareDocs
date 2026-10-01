"use strict";

/* ---------------- State ---------------- */
const state = {
  refFiles: [],
  useCaseFile: null,
  goldenFile: null,
  generated: [],
  page: 1,
  pageSize: 5,
};
const MAX_REF_FILES = 5;
const $ = (id) => document.getElementById(id);

function toast(msg, type = "") {
  let el = document.querySelector(".toast");
  if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
  el.className = `toast ${type}`;
  el.textContent = msg;
  requestAnimationFrame(() => el.classList.add("show"));
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 2800);
}
function splitCsv(v) { return (v || "").split(",").map((s) => s.trim()).filter(Boolean); }
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------------- Step navigation ---------------- */
function goToStep(n) {
  $("panel1").classList.toggle("active", n === 1);
  $("panel2").classList.toggle("active", n === 2);
  $("step1").classList.toggle("active", n === 1);
  $("step2").classList.toggle("active", n === 2);
  window.scrollTo({ top: 0, behavior: "smooth" });
}
$("step1").addEventListener("click", () => goToStep(1));
$("step2").addEventListener("click", () => {
  if (state.generated.length) goToStep(2);
});
$("backBtn").addEventListener("click", () => goToStep(1));

/* ---------------- Generic file dropzone wiring ---------------- */
function wireDropzone(dropId, inputId, onFiles) {
  const dz = $(dropId);
  const input = $(inputId);
  dz.addEventListener("click", () => input.click());
  input.addEventListener("change", (e) => { onFiles(Array.from(e.target.files || [])); e.target.value = ""; });
  ["dragenter", "dragover"].forEach((ev) =>
    dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("dragover"); }));
  ["dragleave", "drop"].forEach((ev) =>
    dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("dragover"); }));
  dz.addEventListener("drop", (e) => { onFiles(Array.from(e.dataTransfer.files || [])); });
}

/* Reference files */
wireDropzone("refDrop", "refFiles", (files) => {
  for (const f of files) {
    if (!/\.(xlsx|xls)$/i.test(f.name)) { toast(`"${f.name}" is not an Excel file`, "error"); continue; }
    if (state.refFiles.length >= MAX_REF_FILES) { toast(`Maximum ${MAX_REF_FILES} files allowed`, "error"); break; }
    if (state.refFiles.some((x) => x.name === f.name && x.size === f.size)) continue;
    state.refFiles.push(f);
  }
  renderChips();
});
function renderChips() {
  const box = $("refChips");
  box.innerHTML = "";
  state.refFiles.forEach((f, i) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.innerHTML = `<span class="xls">📗</span> ${escapeHtml(f.name)} <span class="x" title="Remove">×</span>`;
    chip.querySelector(".x").addEventListener("click", () => { state.refFiles.splice(i, 1); renderChips(); });
    box.appendChild(chip);
  });
}

/* Use Case */
wireDropzone("useCaseDrop", "useCaseFile", (files) => {
  const f = files[0];
  if (!f) return;
  if (!/\.(ppt|pptx|pdf)$/i.test(f.name)) { toast("Please upload a PPT or PDF file", "error"); return; }
  state.useCaseFile = f;
  $("useCaseNote").textContent = f.name;
});

/* Golden */
wireDropzone("goldenDrop", "goldenFile", (files) => {
  const f = files[0];
  if (!f) return;
  if (!/\.(xlsx|xls)$/i.test(f.name)) { toast("Please upload an Excel file", "error"); return; }
  state.goldenFile = f;
  $("goldenNote").textContent = f.name;
});

/* ---------------- Cancel / reset ---------------- */
$("cancelBtn").addEventListener("click", () => {
  $("proForm").reset();
  Object.assign(state, { refFiles: [], useCaseFile: null, goldenFile: null, generated: [], page: 1 });
  renderChips();
  $("useCaseNote").textContent = "PPT or PDF files only";
  $("goldenNote").textContent = "Excel files only (.xlsx, .xls)";
  document.querySelectorAll(".invalid").forEach((el) => el.classList.remove("invalid"));
  $("exportBtn").disabled = true;
  $("resultsBody").innerHTML = `<tr class="empty-row"><td colspan="7">No test cases yet. Fill the form and click <strong>Generate</strong>.</td></tr>`;
  $("pagination").hidden = true;
  goToStep(1);
  toast("Form cleared");
});

/* ---------------- Validation ---------------- */
function validate() {
  let ok = true;
  document.querySelectorAll(".invalid").forEach((el) => el.classList.remove("invalid"));
  [["functionality"], ["keywords"], ["channels"]].forEach(([id]) => {
    if (!$(id).value.trim()) { $(id).classList.add("invalid"); ok = false; }
  });
  if (!state.refFiles.length) { $("refDrop").classList.add("invalid"); ok = false; }
  if (!ok) toast("Please fill all required fields", "error");
  return ok;
}

/* ---------------- Generation ---------------- */
function generateTestCases() {
  const testType = document.querySelector('input[name="testType"]:checked').value;
  const functionality = $("functionality").value.trim();
  const keywords = splitCsv($("keywords").value);
  const channels = splitCsv($("channels").value);
  const scenarios = splitCsv($("scenario").value);
  const chList = channels.length ? channels : ["Web"];
  const cases = [];
  let c = 1;
  const id = () => `TC${String(c++).padStart(3, "0")}`;

  if (state.goldenFile) {
    cases.push({
      id: id(), title: `Verify ${functionality} per golden reference`, type: testType, functionality,
      preconditions: "1. User is registered\n2. Application is available",
      steps: `1. Reference golden file: ${state.goldenFile.name}\n2. Execute ${functionality}\n3. Validate outcome`,
      expected: "Behaviour matches the golden reference test case.",
    });
  }
  keywords.forEach((kw) => {
    chList.forEach((ch) => {
      cases.push({
        id: id(), title: `Verify ${functionality} - ${kw} (${ch})`, type: testType, functionality,
        preconditions: `1. User is registered\n2. ${ch} channel is available`,
        steps: `1. Navigate to ${functionality} on ${ch}\n2. Apply "${kw}"\n3. Submit and observe`,
        expected: `${functionality} handles "${kw}" correctly on ${ch}.`,
      });
    });
    cases.push({
      id: id(), title: `Negative - ${functionality} with invalid ${kw}`, type: testType, functionality,
      preconditions: "1. Application is available",
      steps: `1. Open ${functionality}\n2. Enter invalid "${kw}"\n3. Submit`,
      expected: `Validation/error message is displayed for invalid "${kw}".`,
    });
  });
  scenarios.forEach((sc) => {
    cases.push({
      id: id(), title: `Scenario - ${sc}`, type: testType, functionality,
      preconditions: `1. Setup for "${sc}" is ready`,
      steps: `1. Prepare data for "${sc}"\n2. Execute ${functionality}\n3. Verify results`,
      expected: `Scenario "${sc}" completes successfully.`,
    });
  });
  return cases;
}

/* ---------------- Pagination + render ---------------- */
function renderResults() {
  const body = $("resultsBody");
  const total = state.generated.length;
  if (!total) {
    body.innerHTML = `<tr class="empty-row"><td colspan="7">No test cases generated.</td></tr>`;
    $("pagination").hidden = true;
    return;
  }
  const pages = Math.ceil(total / state.pageSize);
  if (state.page > pages) state.page = pages;
  const start = (state.page - 1) * state.pageSize;
  const slice = state.generated.slice(start, start + state.pageSize);

  body.innerHTML = "";
  slice.forEach((tc) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${tc.id}</td>
      <td>${escapeHtml(tc.title)}</td>
      <td>${escapeHtml(tc.type)}</td>
      <td>${escapeHtml(tc.functionality)}</td>
      <td><pre>${escapeHtml(tc.preconditions)}</pre></td>
      <td><pre>${escapeHtml(tc.steps)}</pre></td>
      <td>${escapeHtml(tc.expected)}</td>`;
    body.appendChild(tr);
  });

  $("pageInfo").textContent =
    `Showing ${start + 1} to ${Math.min(start + state.pageSize, total)} of ${total} test cases`;
  renderPageControls(pages);
  $("pagination").hidden = false;
}

function renderPageControls(pages) {
  const ctr = $("pageControls");
  ctr.innerHTML = "";
  const mk = (label, page, opts = {}) => {
    const b = document.createElement("button");
    b.textContent = label;
    if (opts.active) b.classList.add("active");
    if (opts.disabled) b.disabled = true;
    if (!opts.disabled && !opts.active) b.addEventListener("click", () => { state.page = page; renderResults(); });
    ctr.appendChild(b);
  };
  mk("«", 1, { disabled: state.page === 1 });
  mk("‹", state.page - 1, { disabled: state.page === 1 });

  const nums = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - state.page) <= 1) nums.push(p);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }
  nums.forEach((p) => {
    if (p === "…") { const s = document.createElement("button"); s.textContent = "…"; s.disabled = true; ctr.appendChild(s); }
    else mk(String(p), p, { active: p === state.page });
  });

  mk("›", state.page + 1, { disabled: state.page === pages });
  mk("»", pages, { disabled: state.page === pages });
}

$("pageSize").addEventListener("change", (e) => {
  state.pageSize = parseInt(e.target.value, 10);
  state.page = 1;
  renderResults();
});

/* ---------------- Submit ---------------- */
$("proForm").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!validate()) return;
  state.generated = generateTestCases();
  state.page = 1;
  renderResults();
  $("exportBtn").disabled = false;
  goToStep(2);
  toast(`${state.generated.length} test cases generated`, "success");
});

/* ---------------- Export ---------------- */
$("exportBtn").addEventListener("click", () => {
  if (!state.generated.length) { toast("Nothing to export", "error"); return; }
  const rows = state.generated.map((tc) => ({
    "TC ID": tc.id, "Test Case Title": tc.title, "Type": tc.type, "Functionality": tc.functionality,
    "Preconditions": tc.preconditions, "Test Steps": tc.steps, "Expected Result": tc.expected,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{ wch: 10 }, { wch: 40 }, { wch: 16 }, { wch: 20 }, { wch: 30 }, { wch: 40 }, { wch: 40 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Test Cases");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  XLSX.writeFile(wb, `test-cases-${stamp}.xlsx`);
  toast("Exported to Excel", "success");
});

/* ---------------- Init ---------------- */
$("step1").classList.add("clickable");
$("step2").classList.add("clickable");
renderChips();
