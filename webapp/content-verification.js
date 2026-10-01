"use strict";

/* =====================================================================
 * Content Verification Tool — frontend
 * Uploads the Actual + Reference PDFs to the Java backend, which runs
 * Apache PDFBox (text/layout) and red6 pdfcompare (visual diff), then
 * renders the returned gap report and the highlighted difference PDF.
 * ===================================================================== */

const API_BASE = "http://localhost:8080";

const state = {
  actualFile: null,
  refFile: null,
  xmlFile: null,
  language: "English",
  report: null,
  diffUrl: null,
  actualUrl: null,
  refUrl: null,
};

const $ = (id) => document.getElementById(id);

const CATEGORY_ICONS = {
  language: "🌐",
  locale: "🌍",
  ui: "🎨",
  alignment: "📐",
  lineSeparator: "➖",
  grammar: "✍️",
  missingDetails: "🗂️",
  missingField: "🏷️",
  missingValue: "🔢",
};

/* Render the "Missing Details" category as a table, grouped by sub-section. */
function renderMissingDetailsTable(findings) {
  const order = [];
  const groups = {};
  findings.forEach((f) => {
    const sec = f.section || "";
    if (!groups[sec]) { groups[sec] = []; order.push(sec); }
    groups[sec].push(f);
  });
  return order.map((sec) => {
    const rows = groups[sec].map((f) => `
      <tr>
        <td class="md-field">${f.message}</td>
        <td class="md-value">${f.detail || ""}</td>
      </tr>`).join("");
    const cap = sec ? `<h5 class="cv-sub-title">${escapeHtml(sec)}</h5>` : "";
    return `${cap}
      <table class="cv-table">
        <thead><tr><th>Field / Key</th><th>Missing Value</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }).join("");
}

/* Render a list of findings, grouping by `section` into sub-sections when present. */
function renderFindingsHtml(findings, findingClass, sevClass, detailClass) {
  const withSection = findings.filter((f) => f.section);
  const noSection = findings.filter((f) => !f.section);
  const one = (f) => `
    <div class="${findingClass} ${f.severity}">
      <span class="${sevClass} ${f.severity}">${String(f.severity).toUpperCase()}</span>
      <span class="msg">${f.message}${f.detail ? `<span class="${detailClass}">${f.detail}</span>` : ""}</span>
    </div>`;
  let html = noSection.map(one).join("");
  if (withSection.length) {
    const order = [];
    const groups = {};
    withSection.forEach((f) => {
      if (!groups[f.section]) { groups[f.section] = []; order.push(f.section); }
      groups[f.section].push(f);
    });
    html += order.map((sec) =>
      `<div class="cv-subsection"><h5 class="cv-sub-title">${escapeHtml(sec)}</h5>${groups[sec].map(one).join("")}</div>`
    ).join("");
  }
  return html;
}

/* ---------------- Toast ---------------- */
function toast(msg, type = "") {
  let el = document.querySelector(".toast");
  if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
  el.className = `toast ${type}`;
  el.textContent = msg;
  requestAnimationFrame(() => el.classList.add("show"));
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 2800);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------------- Backend health ---------------- */
(async function pingBackend() {
  const el = $("engineStatus");
  try {
    const r = await fetch(`${API_BASE}/api/health`, { method: "GET" });
    if (!r.ok) throw new Error();
    const data = await r.json();
    el.textContent = `✓ Backend ready (${data.engine || "PDFBox + pdfcompare"})`;
    el.classList.add("ready");
  } catch {
    el.textContent = `⚠ Backend not reachable at ${API_BASE}. Start it with:  cd backend  &  ./gradlew bootRun`;
    el.classList.add("error");
  }
})();

/* ---------------- Step navigation ---------------- */
function goToStep(n) {
  $("panel1").classList.toggle("active", n === 1);
  $("panel2").classList.toggle("active", n === 2);
  $("step1").classList.toggle("active", n === 1);
  $("step2").classList.toggle("active", n === 2);
  window.scrollTo({ top: 0, behavior: "smooth" });
}
$("step1").addEventListener("click", () => goToStep(1));
$("step2").addEventListener("click", () => { if (state.report) goToStep(2); });
$("backBtn").addEventListener("click", () => goToStep(1));

/* ---------------- Dropzone wiring ---------------- */
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
function isPdf(f) { return /\.pdf$/i.test(f.name) || f.type === "application/pdf"; }
function isXml(f) { return /\.xml$/i.test(f.name) || /xml/i.test(f.type); }

function renderChip(boxId, file, onRemove) {
  const box = $(boxId);
  box.innerHTML = "";
  if (!file) return;
  const chip = document.createElement("span");
  chip.className = "chip";
  chip.innerHTML = `<span class="xls">📄</span> ${escapeHtml(file.name)} <span class="x" title="Remove">×</span>`;
  chip.querySelector(".x").addEventListener("click", onRemove);
  box.appendChild(chip);
}

wireDropzone("actualDrop", "actualFile", (files) => {
  const f = files[0];
  if (!f) return;
  if (!isPdf(f)) { toast("Please upload a PDF file", "error"); return; }
  state.actualFile = f;
  $("actualDrop").classList.remove("invalid");
  $("actualNote").textContent = f.name;
  renderChip("actualChips", f, () => {
    state.actualFile = null; $("actualNote").textContent = "PDF files only (.pdf)"; renderChip("actualChips", null);
  });
});

wireDropzone("refDrop", "refFile", (files) => {
  const f = files[0];
  if (!f) return;
  if (!isPdf(f)) { toast("Please upload a PDF file", "error"); return; }
  state.refFile = f;
  $("refDrop").classList.remove("invalid");
  $("refNote").textContent = f.name;
  renderChip("refChips", f, () => {
    state.refFile = null; $("refNote").textContent = "PDF files only (.pdf)"; renderChip("refChips", null);
  });
});

wireDropzone("xmlDrop", "xmlFile", (files) => {
  const f = files[0];
  if (!f) return;
  if (!isXml(f)) { toast("Please upload an XML file", "error"); return; }
  state.xmlFile = f;
  $("xmlDrop").classList.remove("invalid");
  $("xmlNote").textContent = f.name;
  renderChip("xmlChips", f, () => {
    state.xmlFile = null; $("xmlNote").textContent = "XML files only (.xml)"; renderChip("xmlChips", null);
  });
});

/* ---------------- Cancel / reset ---------------- */
$("cancelBtn").addEventListener("click", resetAll);
function resetAll() {
  $("cvForm").reset();
  Object.assign(state, { actualFile: null, refFile: null, xmlFile: null, report: null });
  if (state.diffUrl) { URL.revokeObjectURL(state.diffUrl); state.diffUrl = null; }
  if (state.actualUrl) { URL.revokeObjectURL(state.actualUrl); state.actualUrl = null; }
  if (state.refUrl) { URL.revokeObjectURL(state.refUrl); state.refUrl = null; }
  $("actualNote").textContent = "PDF files only (.pdf)";
  $("refNote").textContent = "PDF files only (.pdf)";
  $("xmlNote").textContent = "XML files only (.xml)";
  renderChip("actualChips", null);
  renderChip("refChips", null);
  renderChip("xmlChips", null);
  document.querySelectorAll(".invalid").forEach((el) => el.classList.remove("invalid"));
  $("exportBtn").disabled = true;
  $("cvReport").innerHTML = "";
  $("cvSummary").innerHTML = "";
  $("cvPreview").hidden = true;
  goToStep(1);
  toast("Cleared");
}

/* ---------------- Loader ---------------- */
function showLoader(msg) { $("cvLoaderMsg").textContent = msg || "Analysing PDFs…"; $("cvLoader").hidden = false; }
function hideLoader() { $("cvLoader").hidden = true; }

/* ---------------- Validation ---------------- */
function validate() {
  let ok = true;
  document.querySelectorAll(".dropzone.invalid").forEach((el) => el.classList.remove("invalid"));
  if (!state.actualFile) { $("actualDrop").classList.add("invalid"); ok = false; }
  if (!state.refFile) { $("refDrop").classList.add("invalid"); ok = false; }
  state.language = (document.querySelector('input[name="language"]:checked') || {}).value || "English";
  if (!ok) toast("Please upload both Actual and Reference PDF files", "error");
  return ok;
}

/* ---------------- Submit -> backend ---------------- */
$("cvForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validate()) return;

  showLoader("Uploading & comparing PDFs (PDFBox + pdfcompare)…");
  try {
    const fd = new FormData();
    fd.append("actual", state.actualFile);
    fd.append("reference", state.refFile);
    fd.append("language", state.language);
    if (state.xmlFile) {
      fd.append("printPreviewXml", state.xmlFile);
    }

    const res = await fetch(`${API_BASE}/api/verify`, { method: "POST", body: fd });
    if (!res.ok) {
      let msg = `Server responded ${res.status}`;
      try { const err = await res.json(); if (err.message) msg = err.message; } catch { /* ignore */ }
      throw new Error(msg);
    }
    const report = await res.json();
    state.report = report;
    
updateMatchLevel(report);
    loadSourcePdfs();
    await loadDiffPdf(report.diffId, report.visuallyEqual);
    renderReport(report);
    $("exportBtn").disabled = false;
    goToStep(2);
    toast(report.totalGaps ? `${report.totalGaps} gap${report.totalGaps > 1 ? "s" : ""} found` : "No gaps found ✓",
      report.totalGaps ? "" : "success");
  } catch (err) {
    console.error(err);
    toast("Failed to analyse PDFs: " + (err && err.message ? err.message : err), "error");
  } finally {
    hideLoader();
  }
});

/* ---------------- Source PDFs (Actual / Expected) ---------------- */
function loadSourcePdfs() {
  if (state.actualUrl) { URL.revokeObjectURL(state.actualUrl); state.actualUrl = null; }
  if (state.refUrl) { URL.revokeObjectURL(state.refUrl); state.refUrl = null; }
  if (state.actualFile) {
    state.actualUrl = URL.createObjectURL(state.actualFile);
    $("actualFrame").src = state.actualUrl;
  }
  if (state.refFile) {
    state.refUrl = URL.createObjectURL(state.refFile);
    $("expectedFrame").src = state.refUrl;
  }
}

/* ---------------- Show / hide Difference column ---------------- */
$("showDiffToggle").addEventListener("change", (e) => {
  const show = e.target.checked;
  $("diffCol").hidden = !show;
  $("cvDiffGrid").classList.toggle("two-col", !show);
});

/* ---------------- Diff PDF ---------------- */
async function loadDiffPdf(diffId, equal) {
  if (state.diffUrl) { URL.revokeObjectURL(state.diffUrl); state.diffUrl = null; }
  const frame = $("diffFrame");
  const dl = $("downloadDiff");
  const none = $("diffNone");

  if (!diffId) {
    frame.hidden = true; dl.style.display = "none";
    none.hidden = false;
    none.textContent = equal ? "✓ No visual differences — the pages match pixel-by-pixel." : "Difference PDF unavailable.";
    return;
  }
  try {
    const r = await fetch(`${API_BASE}/api/diff/${diffId}`);
    if (!r.ok) throw new Error();
    const blob = await r.blob();
    state.diffUrl = URL.createObjectURL(blob);
    frame.src = state.diffUrl;
    frame.hidden = false;
    dl.style.display = "";
    dl.href = state.diffUrl;
    dl.setAttribute("download", "difference.pdf");
    none.hidden = true;
  } catch {
    frame.hidden = true; dl.style.display = "none";
    none.hidden = false; none.textContent = "Difference PDF unavailable.";
  }
}

/* ---------------- Report rendering ---------------- */
/* ---------------- Report rendering ---------------- */
function renderReport(report) {
  // Summary tiles
  $("cvSummary").innerHTML = `
    <div class="cv-tile total">
      <span class="tile-val">${report.totalGaps}</span>
      <span class="tile-label">Total Gaps</span>
    </div>

    <div class="cv-tile high">
      <span class="tile-val">${report.high}</span>
      <span class="tile-label">High Severity</span>
    </div>

    <div class="cv-tile medium">
      <span class="tile-val">${report.mediumLow}</span>
      <span class="tile-label">Medium / Low</span>
    </div>

    <div class="cv-tile pass">
      <span class="tile-val">
        ${report.categoriesPassed}/${report.categoryCount}
      </span>
      <span class="tile-label">Categories Passed</span>
    </div>

    <div class="cv-tile lang">
      <span class="tile-val">
        ${escapeHtml(report.expectedLanguage)}
      </span>
      <span class="tile-label">Expected Language</span>
    </div>

    <div class="cv-tile ${report.visuallyEqual ? "pass" : "high"}">
      <span class="tile-val">
        ${report.visuallyEqual
          ? "Match"
          : report.differingPages + "/" + report.totalPages}
      </span>
      <span class="tile-label">
        ${report.visuallyEqual ? "Visual" : "Pages Differ"}
      </span>
    </div>
  `;

  $("cvPreview").hidden = false;

  // AI validation summary
  renderAiValidationSummary(report);

  // Categories
  const wrap = $("cvReport");
  wrap.innerHTML = "";

  report.categories.forEach((cat) => {
    const findings = cat.findings || [];
    const issues = findings.filter((f) => f.severity !== "info");
    const hasIssues = issues.length > 0;
    const anyHigh = issues.some((f) => f.severity === "high");

    const statusClass =
      !hasIssues ? "pass" :
      anyHigh ? "issues" :
      "warn";

    const statusText =
      !hasIssues
        ? "Pass"
        : `${issues.length} issue${issues.length > 1 ? "s" : ""}`;

    const icon = CATEGORY_ICONS[cat.key] || "•";

    const card = document.createElement("div");

    card.className =
      "cv-cat" + (findings.length ? " open" : "");

    card.innerHTML = `
      <div class="cv-cat-head">

        <span class="cv-cat-icon">
          ${icon}
        </span>

        <div class="cv-cat-title">
          <h4>${escapeHtml(cat.name)}</h4>
          <p>${escapeHtml(cat.description)}</p>
        </div>

        <span class="cv-cat-status ${statusClass}">
          ${statusText}
        </span>

        <span class="cv-chevron">
          ▶
        </span>

      </div>

      <div class="cv-cat-body">
        ${
          findings.length
            ? (
                cat.key === "missingDetails"
                  ? renderMissingDetailsTable(findings)
                  : renderFindingsHtml(
                      findings,
                      "cv-finding",
                      "sev",
                      "detail"
                    )
              )
            : `
              <p class="cv-cat-empty">
                ✓ No gaps detected in this category.
              </p>
            `
        }
      </div>
    `;

    card
      .querySelector(".cv-cat-head")
      .addEventListener("click", () =>
        card.classList.toggle("open")
      );

    wrap.appendChild(card);
  });
}
function renderAiValidationSummary(report) {
  const existing = document.getElementById("aiValidationSummary");

  if (!existing) {
    console.warn("AI validation summary container not found");
    return;
  }

  if (!report.aiValidationAvailable || !report.aiValidationSummary) {
    existing.innerHTML = `
      <div class="ai-summary-unavailable">
        AI validation summary is currently unavailable.
      </div>
    `;
    return;
  }

  const formattedSummary = report.aiValidationSummary
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>");

  existing.innerHTML = `
    <div class="ai-summary-content">
      <div class="ai-summary-badge">
        ✨ AI Analysis
      </div>

      <div class="ai-summary-text">
        <p>${formattedSummary}</p>
      </div>
    </div>
  `;
}

/* ---------------- Export report screen to PDF ---------------- */
$("exportBtn").addEventListener("click", exportVerificationReport);

// ============================================================
// EXPORT VERIFICATION REPORT AS PDF
// ============================================================

async function exportVerificationReport() {

  if (!state.report) {
    toast("Please run a verification first.", "error");
    return;
  }

  if (typeof html2pdf === "undefined") {
    toast("PDF export library is not available.", "error");
    console.error("html2pdf.js is not loaded.");
    return;
  }

  const report = state.report;

  const exportBtn = $("exportBtn");

  if (exportBtn) {
    exportBtn.disabled = true;
    exportBtn.dataset.originalText = exportBtn.innerHTML;
    exportBtn.innerHTML = "Generating PDF…";
  }

  try {

    // ----------------------------------------------------------
    // Helper functions
    // ----------------------------------------------------------

    const escapeHtml = value => {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };

    const severityClass = severity => {
      const value = String(severity || "").toLowerCase();

      if (value === "high") return "high";
      if (value === "medium") return "medium";
      return "low";
    };

    const severityLabel = severity => {
      const value = String(severity || "").toLowerCase();

      if (value === "high") return "HIGH";
      if (value === "medium") return "MEDIUM";
      return "LOW";
    };

    // ----------------------------------------------------------
    // Category findings
    // ----------------------------------------------------------

    const categories = Array.isArray(report.categories)
      ? report.categories
      : [];

    let categoryHtml = "";

    categories.forEach(category => {

      const findings = Array.isArray(category.findings)
        ? category.findings
        : [];

      const highCount = findings.filter(
        finding =>
          String(finding.severity || "").toLowerCase() === "high"
      ).length;

      const mediumCount = findings.filter(
        finding =>
          String(finding.severity || "").toLowerCase() === "medium"
      ).length;

      const lowCount = findings.filter(
        finding =>
          String(finding.severity || "").toLowerCase() === "low"
      ).length;

      categoryHtml += `
        <section class="export-category">

          <div class="export-category-header">

            <div>
              <h3>
                ${escapeHtml(category.name || category.key || "Validation")}
              </h3>

              <p>
                ${escapeHtml(category.description || "")}
              </p>
            </div>

            <div class="export-category-counts">

              ${highCount > 0
                ? `<span class="export-count high">${highCount} High</span>`
                : ""}

              ${mediumCount > 0
                ? `<span class="export-count medium">${mediumCount} Medium</span>`
                : ""}

              ${lowCount > 0
                ? `<span class="export-count low">${lowCount} Low</span>`
                : ""}

              ${findings.length === 0
                ? `<span class="export-count passed">✓ Passed</span>`
                : ""}

            </div>

          </div>


          ${
            findings.length === 0

              ? `
                <div class="export-passed">
                  ✓ No issues detected in this validation area.
                </div>
              `

              : findings.map(finding => {

                  const severity =
                    severityLabel(finding.severity);

                  return `
                    <div class="export-finding">

                      <div class="export-severity ${severityClass(finding.severity)}">
                        ${severity}
                      </div>

                      <div class="export-finding-content">

                        <strong>
                          ${escapeHtml(
                            finding.message ||
                            "Verification issue detected."
                          )}
                        </strong>

                        ${
                          finding.detail
                            ? `
                              <p>
                                ${escapeHtml(finding.detail)}
                              </p>
                            `
                            : ""
                        }

                        ${
                          finding.section
                            ? `
                              <span class="export-section">
                                Section:
                                ${escapeHtml(finding.section)}
                              </span>
                            `
                            : ""
                        }

                      </div>

                    </div>
                  `;
                }).join("")
          }

        </section>
      `;
    });


    // ----------------------------------------------------------
    // AI summary
    // ----------------------------------------------------------

    const aiSummary =
      report.aiValidationSummary ||
      "AI validation summary was not available for this verification.";


    // ----------------------------------------------------------
    // Overall status
    // ----------------------------------------------------------

    const totalGaps = Number(report.totalGaps || 0);
    const high = Number(report.high || 0);
    const mediumLow = Number(report.mediumLow || 0);

    const status =
      totalGaps === 0
        ? "PASS"
        : high > 0
          ? "REVIEW REQUIRED"
          : "REVIEW";


    // ----------------------------------------------------------
    // Create isolated export document
    // ----------------------------------------------------------

    const exportContainer = document.createElement("div");

    exportContainer.id = "adiaPdfExport";

    exportContainer.innerHTML = `

      <div class="export-page">

        <!-- HEADER -->

        <div class="export-header">

          <div>

            <div class="export-brand">
              avaloq
            </div>

            <div class="export-adia">
              ADIA
            </div>

            <div class="export-subtitle">
              Avaloq Document Intelligence Agent
            </div>

          </div>

          <div class="export-header-right">
            DOCUMENT VERIFICATION
          </div>

        </div>


        <!-- TITLE -->

        <div class="export-title">

          <span>
            ADIA VERIFICATION REPORT
          </span>

          <h1>
            Document Verification Report
          </h1>

          <p>
            Generated by ADIA Document Intelligence
          </p>

        </div>


        <!-- STATUS -->

        <div class="export-status ${totalGaps === 0 ? "passed" : "review"}">

          <div>

            <span class="export-status-label">
              DOCUMENT STATUS
            </span>

            <strong>
              ${status}
            </strong>

          </div>

          <div class="export-status-summary">

            <span>
              Total Issues
            </span>

            <strong>
              ${totalGaps}
            </strong>

          </div>

        </div>


        <!-- EXECUTIVE SUMMARY -->

        <section class="export-section-block">

          <div class="export-section-title">
            EXECUTIVE SUMMARY
          </div>

          <div class="export-summary-grid">

            <div class="export-metric">
              <span>Expected Language</span>
              <strong>
                ${escapeHtml(report.expectedLanguage || "—")}
              </strong>
            </div>

            <div class="export-metric">
              <span>Detected Language</span>
              <strong>
                ${escapeHtml(report.detectedLanguage || "—")}
              </strong>
            </div>

            <div class="export-metric">
              <span>Total Gaps</span>
              <strong>
                ${totalGaps}
              </strong>
            </div>

            <div class="export-metric">
              <span>High Severity</span>
              <strong>
                ${high}
              </strong>
            </div>

            <div class="export-metric">
              <span>Medium / Low</span>
              <strong>
                ${mediumLow}
              </strong>
            </div>

            <div class="export-metric">
              <span>Categories Passed</span>
              <strong>
                ${report.categoriesPassed ?? 0}
                / ${report.categoryCount ?? categories.length}
              </strong>
            </div>

            <div class="export-metric">
              <span>Total Pages</span>
              <strong>
                ${report.totalPages ?? 0}
              </strong>
            </div>

            <div class="export-metric">
              <span>Different Pages</span>
              <strong>
                ${report.differingPages ?? 0}
              </strong>
            </div>

          </div>

        </section>


        <!-- VISUAL COMPARISON -->

        <section class="export-section-block">

          <div class="export-section-title">
            VISUAL COMPARISON
          </div>

          <div class="export-visual-summary">

            <div>
              <span>
                Visual Match
              </span>

              <strong>
                ${
                  report.visuallyEqual
                    ? "No visual differences detected"
                    : "Visual differences detected"
                }
              </strong>
            </div>

            <div>
              <span>
                Maximum Difference
              </span>

              <strong>
                ${Number(report.maxDiffPercent || 0).toFixed(1)}%
              </strong>
            </div>

            <div>
              <span>
                Differing Pages
              </span>

              <strong>
                ${report.differingPages ?? 0}
              </strong>
            </div>

          </div>

        </section>


        <!-- AI ANALYSIS -->

        <section class="export-ai-section">

          <div class="export-ai-header">

            <span>
              ✦
            </span>

            <strong>
              ADIA AI ANALYSIS
            </strong>

          </div>

          <div class="export-ai-text">
            ${escapeHtml(aiSummary).replace(/\n/g, "<br>")}
          </div>

        </section>


        <!-- FINDINGS -->

        <section class="export-section-block">

          <div class="export-section-title">
            DETAILED FINDINGS
          </div>

          ${categoryHtml}

        </section>


        <!-- FOOTER -->

        <div class="export-footer">

          <span>
            ADIA — Avaloq Document Intelligence Agent
          </span>

          <span>
            Generated ${new Date().toLocaleString()}
          </span>

        </div>

      </div>
    `;


    // ----------------------------------------------------------
    // IMPORTANT:
    // Put the export container into the DOM.
    // html2pdf can otherwise generate a blank document.
    // ----------------------------------------------------------

    exportContainer.style.position = "fixed";
    exportContainer.style.left = "-100000px";
    exportContainer.style.top = "0";
    exportContainer.style.width = "794px";
    exportContainer.style.background = "#ffffff";
    exportContainer.style.zIndex = "-1";

    document.body.appendChild(exportContainer);


    // ----------------------------------------------------------
    // Wait for browser layout / fonts
    // ----------------------------------------------------------

    await new Promise(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    });


    // ----------------------------------------------------------
    // Generate PDF
    // ----------------------------------------------------------

    const options = {

      margin: [
        12,
        12,
        12,
        12
      ],

      filename:
        `ADIA_Verification_Report_${new Date()
          .toISOString()
          .slice(0, 10)}.pdf`,

      image: {
        type: "jpeg",
        quality: 0.95
      },

      html2canvas: {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,

        // Important for off-screen export container
        scrollX: 0,
        scrollY: 0,

        windowWidth: 794
      },

      jsPDF: {
        unit: "mm",
        format: "a4",
        orientation: "portrait"
      },

      pagebreak: {
        mode: [
          "css",
          "legacy"
        ]
      }

    };


    await html2pdf()
      .set(options)
      .from(exportContainer)
      .save();


    // ----------------------------------------------------------
    // Cleanup
    // ----------------------------------------------------------

    exportContainer.remove();

    toast("Verification report exported successfully.", "success");


  } catch (error) {

    console.error(
      "PDF export failed:",
      error
    );

    toast(
      "Could not generate the PDF report.",
      "error"
    );

  } finally {

    if (exportBtn) {

      exportBtn.disabled = false;

      exportBtn.innerHTML =
        exportBtn.dataset.originalText ||
        "↓ Export Report";

    }

  }
}


// ============================================================
// EXPORT BUTTON
// ============================================================

$("exportBtn")?.addEventListener(
  "click",
  exportVerificationReport
);

function updateMatchLevel(report) {

  const percentageEl =
    document.getElementById("mismatchPercentage");

  const labelEl =
    document.getElementById("mismatchLabel");

  const barEl =
    document.getElementById("mismatchBarFill");

  if (!percentageEl || !labelEl || !barEl) {
    return;
  }


  let matchPercentage = 100;


  /*
   * ---------------------------------------------------------------
   * BEST / MOST ACCURATE CALCULATION
   *
   * Use visual difference percentage for EVERY page.
   * ---------------------------------------------------------------
   */

  if (
    Array.isArray(report.pageDiffPercentages) &&
    report.pageDiffPercentages.length > 0
  ) {

    const totalPages =
      report.totalPages ||
      report.pageDiffPercentages.length;


    const totalDifference =
      report.pageDiffPercentages.reduce(
        (sum, value) => {

          const percentage =
            Number(value);

          return sum +
            Math.max(
              0,
              Math.min(100, percentage || 0)
            );

        },
        0
      );


    const averageDifference =
      totalDifference / totalPages;


    matchPercentage =
      100 - averageDifference;

  }


  /*
   * ---------------------------------------------------------------
   * FALLBACK
   *
   * If backend doesn't provide page-level values,
   * use maxDiffPercent.
   * ---------------------------------------------------------------
   */

  else {

    const maxDifference =
      Math.max(
        0,
        Math.min(
          100,
          Number(report.maxDiffPercent) || 0
        )
      );


    matchPercentage =
      100 - maxDifference;
  }


  /*
   * ---------------------------------------------------------------
   * FINAL NORMALIZATION
   * ---------------------------------------------------------------
   */

  matchPercentage =
    Math.max(
      0,
      Math.min(
        100,
        matchPercentage
      )
    );


  /*
   * ---------------------------------------------------------------
   * DISPLAY
   * ---------------------------------------------------------------
   */

  percentageEl.textContent =
    `${matchPercentage.toFixed(2)}%`;

  barEl.style.width =
    `${matchPercentage}%`;


  /*
   * ---------------------------------------------------------------
   * LABEL
   * ---------------------------------------------------------------
   */

  if (matchPercentage >= 99.99) {

    labelEl.textContent =
      "Perfect Match";

    barEl.style.background =
      "#16a34a";

    labelEl.style.background =
      "#dcfce7";

    labelEl.style.color =
      "#15803d";

  }

  else if (matchPercentage >= 95) {

    labelEl.textContent =
      "Excellent Match";

    barEl.style.background =
      "#22c55e";

    labelEl.style.background =
      "#dcfce7";

    labelEl.style.color =
      "#15803d";

  }

  else if (matchPercentage >= 85) {

    labelEl.textContent =
      "Very Good Match";

    barEl.style.background =
      "#84cc16";

    labelEl.style.background =
      "#ecfccb";

    labelEl.style.color =
      "#4d7c0f";

  }

  else if (matchPercentage >= 70) {

    labelEl.textContent =
      "Good Match";

    barEl.style.background =
      "#f59e0b";

    labelEl.style.background =
      "#fff7ed";

    labelEl.style.color =
      "#c2410c";

  }

  else if (matchPercentage >= 50) {

    labelEl.textContent =
      "Partial Match";

    barEl.style.background =
      "#f97316";

    labelEl.style.background =
      "#ffedd5";

    labelEl.style.color =
      "#c2410c";

  }

  else {

    labelEl.textContent =
      "Low Match";

    barEl.style.background =
      "#dc2626";

    labelEl.style.background =
      "#fee2e2";

    labelEl.style.color =
      "#b91c1c";
  }
}
/* =====================================================================
 * AI VERIFICATION ASSISTANT
 * ===================================================================== */

let aiChatHistory = [];


function openAiChat() {

  const panel = $("aiChatPanel");

  if (!panel) {
    return;
  }

  if (!state.report) {

    toast(
      "Run a document verification first.",
      "error"
    );

    return;
  }

  panel.hidden = false;

  setTimeout(() => {

    const input = $("aiChatInput");

    if (input) {
      input.focus();
    }

  }, 100);
}


function closeAiChat() {

  const panel = $("aiChatPanel");

  if (panel) {
    panel.hidden = true;
  }
}


function addAiMessage(message, type) {

  const container =
    $("aiChatMessages");

  if (!container) {
    return;
  }


  const wrapper =
    document.createElement("div");


  wrapper.className =
    type === "user"
      ? "ai-message ai-message-user"
      : "ai-message ai-message-assistant";


  if (type === "user") {

    wrapper.innerHTML = `
      <div class="ai-message-content">
        <div class="ai-message-bubble"></div>
      </div>
    `;

  } else {

    wrapper.innerHTML = `
      <div class="ai-message-avatar">
        ✦
      </div>

      <div class="ai-message-content">
        <div class="ai-message-bubble"></div>
      </div>
    `;
  }


  const bubble =
    wrapper.querySelector(
      ".ai-message-bubble"
    );


  /*
   * textContent deliberately used instead of innerHTML
   * so AI output cannot inject HTML/JavaScript.
   */

  bubble.textContent =
    message;


  container.appendChild(wrapper);


  container.scrollTop =
    container.scrollHeight;
}


function addAiTyping() {

  const container =
    $("aiChatMessages");

  if (!container) {
    return null;
  }


  const wrapper =
    document.createElement("div");


  wrapper.className =
    "ai-message ai-message-assistant";

  wrapper.id =
    "aiTypingMessage";


  wrapper.innerHTML = `
    <div class="ai-message-avatar">
      ✦
    </div>

    <div class="ai-message-content">

      <div class="ai-message-bubble ai-typing">

        <span></span>
        <span></span>
        <span></span>

      </div>

    </div>
  `;


  container.appendChild(wrapper);


  container.scrollTop =
    container.scrollHeight;


  return wrapper;
}


function removeAiTyping() {

  const typing =
    $("aiTypingMessage");

  if (typing) {
    typing.remove();
  }
}

function buildAiReportContext(report) {
  if (!report) {
    return null;
  }

  return {
    expectedLanguage: report.expectedLanguage,
    detectedLanguage: report.detectedLanguage,

    totalGaps: report.totalGaps,
    high: report.high,
    mediumLow: report.mediumLow,

    categoriesPassed: report.categoriesPassed,
    categoryCount: report.categoryCount,

    visuallyEqual: report.visuallyEqual,
    totalPages: report.totalPages,
    differingPages: report.differingPages,
    maxDiffPercent: report.maxDiffPercent,

    categories: report.categories || [],

    aiValidationSummary:
      report.aiValidationSummary || null
  };
}

async function sendAiMessage(question) {

  question =
    String(question || "").trim();


  if (!question) {
    return;
  }


  if (!state.report) {

    toast(
      "Run a document verification first.",
      "error"
    );

    return;
  }


  const sendButton =
    $("aiChatSend");

  const input =
    $("aiChatInput");


  if (sendButton) {
    sendButton.disabled = true;
  }

  if (input) {
    input.disabled = true;
  }


  addAiMessage(
    question,
    "user"
  );


  aiChatHistory.push({
    role: "user",
    content: question
  });


  const typing =
    addAiTyping();


  try {

    const reportContext =
      buildAiReportContext(
        state.report
      );


    const response =
      await fetch(
        `${API_BASE}/api/report/chat`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({

            question,

            report:
              reportContext,

            history:
              aiChatHistory.slice(-8)

          })
        }
      );


    if (!response.ok) {

      let message =
        `Server responded ${response.status}`;


      try {

        const error =
          await response.json();


        if (error.message) {
          message =
            error.message;
        }

      } catch {
        /* Ignore */
      }


      throw new Error(message);
    }


    const data =
      await response.json();


    const answer =
      data.answer ||
      "I couldn't generate an answer for that question.";


    removeAiTyping();


    addAiMessage(
      answer,
      "assistant"
    );


    aiChatHistory.push({
      role: "assistant",
      content: answer
    });


  } catch (error) {

    console.error(
      "AI assistant error:",
      error
    );


    removeAiTyping();


    addAiMessage(
      "I couldn't connect to the verification assistant. Please try again.",
      "assistant"
    );

  } finally {

    if (sendButton) {
      sendButton.disabled = false;
    }

    if (input) {
      input.disabled = false;
    }

    if (input) {
      input.focus();
    }
  }
}


/* ---------------------------------------------------------------------
 * Open / Close
 * --------------------------------------------------------------------- */

$("aiChatButton")?.addEventListener(
  "click",
  openAiChat
);


$("aiChatClose")?.addEventListener(
  "click",
  closeAiChat
);


/* ---------------------------------------------------------------------
 * Send
 * --------------------------------------------------------------------- */

$("aiChatSend")?.addEventListener(
  "click",
  () => {

    const input =
      $("aiChatInput");

    if (!input) {
      return;
    }

    sendAiMessage(
      input.value
    );

    input.value = "";
  }
);


/* ---------------------------------------------------------------------
 * Enter to send
 * Shift + Enter = new line
 * --------------------------------------------------------------------- */

$("aiChatInput")?.addEventListener(
  "keydown",
  event => {

    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {

      event.preventDefault();


      const input =
        $("aiChatInput");


      if (!input) {
        return;
      }


      const question =
        input.value.trim();


      if (!question) {
        return;
      }


      input.value = "";


      sendAiMessage(
        question
      );
    }
  }
);


/* ---------------------------------------------------------------------
 * Suggested questions
 * --------------------------------------------------------------------- */

document
  .querySelectorAll(".ai-suggestion")
  .forEach(button => {

    button.addEventListener(
      "click",
      () => {

        const question =
          button.dataset.question;


        sendAiMessage(
          question
        );
      }
    );

  });
