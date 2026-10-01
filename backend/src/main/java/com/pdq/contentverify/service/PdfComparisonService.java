package com.pdq.contentverify.service;

import com.pdq.contentverify.model.CategoryResult;
import com.pdq.contentverify.model.Finding;
import com.pdq.contentverify.model.VerificationReport;
import de.redsix.pdfcompare.PdfComparator;
import de.redsix.pdfcompare.env.SimpleEnvironment;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Orchestrates a full content verification:
 *   - red6 pdfcompare  -> pixel-by-pixel visual difference PDF
 *   - Apache PDFBox     -> text extraction + page rendering for the remaining categories
 */
@Service
public class PdfComparisonService {

    private static final Logger log = LoggerFactory.getLogger(PdfComparisonService.class);

    private final TextAnalyzer textAnalyzer;
    private final ImageAnalyzer imageAnalyzer;
    private final XmlAnalyzer xmlAnalyzer;
    private final AcrolinxGrammarChecker grammarChecker;

    /** diffId -> generated difference PDF on disk. */
    private final Map<String, Path> diffStore = new ConcurrentHashMap<>();

    private static final int MAX_VISUAL_PAGES = 15; // bound per-page image diff work

    public PdfComparisonService(TextAnalyzer textAnalyzer, ImageAnalyzer imageAnalyzer,
                                XmlAnalyzer xmlAnalyzer, AcrolinxGrammarChecker grammarChecker) {
        this.textAnalyzer = textAnalyzer;
        this.imageAnalyzer = imageAnalyzer;
        this.xmlAnalyzer = xmlAnalyzer;
        this.grammarChecker = grammarChecker;
    }

    public Path getDiffPdf(String id) {
        return diffStore.get(id);
    }

    public VerificationReport verify(MultipartFile actualFile, MultipartFile referenceFile, String language)
            throws IOException {
        return verify(actualFile, referenceFile, language, null);
    }

    public VerificationReport verify(MultipartFile actualFile, MultipartFile referenceFile, String language,
                                    MultipartFile printPreviewXml)
            throws IOException {

        Path actualPath = writeTemp("actual", actualFile);
        Path referencePath = writeTemp("reference", referenceFile);

        List<Finding> languageF = new ArrayList<>();
        List<Finding> localeF = new ArrayList<>();
        List<Finding> uiF = new ArrayList<>();
        List<Finding> alignmentF = new ArrayList<>();
        List<Finding> lineSeparatorF = new ArrayList<>();
        List<Finding> grammarF = new ArrayList<>();
        List<Finding> missingDetailsF = new ArrayList<>();

        // Parse the optional Print Preview XML up front so its rules can be applied later.
        XmlAnalyzer.XmlData xmlData = null;
        if (printPreviewXml != null && !printPreviewXml.isEmpty()) {
            try {
                xmlData = xmlAnalyzer.parse(printPreviewXml.getBytes());
            } catch (Exception ex) {
                log.warn("Print Preview XML could not be parsed", ex);
                missingDetailsF.add(new Finding("medium", "Print Preview XML could not be parsed.",
                        escape(ex.getMessage() == null ? ex.toString() : ex.getMessage())));
            }
        }

        /* ---- 1. Visual comparison via red6 pdfcompare ---- */
        String diffId = UUID.randomUUID().toString();
        boolean visuallyEqual = true;
        try {
            Path diffBase = Files.createTempFile("cv-diff-" + diffId + "-", "");
            Files.deleteIfExists(diffBase); // writeTo wants a base name, appends .pdf
            String base = diffBase.toString();
            visuallyEqual = new PdfComparator<>(referencePath.toFile(), actualPath.toFile())
                    .withEnvironment(new SimpleEnvironment().setAddEqualPagesToResult(false))
                    .compare()
                    .writeTo(base);
            Path diffPdf = Path.of(base + ".pdf");
            if (Files.exists(diffPdf)) {
                diffStore.put(diffId, diffPdf);
            } else {
                diffId = null;
            }
        } catch (Exception ex) {
            log.warn("pdfcompare failed", ex);
            uiF.add(new Finding("medium", "Visual comparison could not be completed.",
                    escape(ex.getMessage() == null ? ex.toString() : ex.getMessage())));
            diffId = null;
        }

        /* ---- 2. PDFBox text + image analysis ---- */
        int totalPages = 0;
        int differingPages = 0;
        double maxDiffPercent = 0;
        String detectedLanguage = "Unknown";

        try (PDDocument actualDoc = Loader.loadPDF(actualPath.toFile());
             PDDocument refDoc = Loader.loadPDF(referencePath.toFile())) {

            PDFTextStripper stripper = new PDFTextStripper();
            stripper.setSortByPosition(true);
            String actualText = stripper.getText(actualDoc);
            String refText = stripper.getText(refDoc);

            detectedLanguage = textAnalyzer.detectLanguage(actualText);
            textAnalyzer.analyzeLanguage(actualText, language, languageF);
            grammarChecker.analyzeGrammar(actualText, language, grammarF);

            if (xmlData != null) {
                // Print Preview XML drives language/locale and the merged missing-details check.
                xmlAnalyzer.analyzeLanguage(xmlData, detectedLanguage, languageF);
                xmlAnalyzer.analyzeLocale(xmlData, actualText, localeF);
                xmlAnalyzer.analyzeMissingDetails(xmlData, actualText, missingDetailsF);
            } else {
                // No XML: fall back to comparing fields between the Actual and Reference PDFs.
                Map<String, String[]> actualFields = textAnalyzer.extractFields(actualText);
                Map<String, String[]> refFields = textAnalyzer.extractFields(refText);
                textAnalyzer.analyzeFieldsMerged(actualFields, refFields, actualText, missingDetailsF);
            }

            if (actualDoc.getNumberOfPages() != refDoc.getNumberOfPages()) {
                uiF.add(new Finding("high", "Page count differs.",
                        String.format("Actual has %d page(s), Reference has %d page(s).",
                                actualDoc.getNumberOfPages(), refDoc.getNumberOfPages())));
            }

            PDFRenderer actualRenderer = new PDFRenderer(actualDoc);
            PDFRenderer refRenderer = new PDFRenderer(refDoc);

            BufferedImage actualImg0 = actualRenderer.renderImageWithDPI(0, 150, ImageType.RGB);
            BufferedImage refImg0 = refRenderer.renderImageWithDPI(0, 150, ImageType.RGB);
            imageAnalyzer.analyzeAlignment(actualImg0, refImg0, alignmentF);
            imageAnalyzer.analyzeLineSeparators(actualImg0, refImg0, lineSeparatorF);

            totalPages = Math.max(actualDoc.getNumberOfPages(), refDoc.getNumberOfPages());
            int comparablePages = Math.min(Math.min(actualDoc.getNumberOfPages(), refDoc.getNumberOfPages()), MAX_VISUAL_PAGES);
            for (int p = 0; p < comparablePages; p++) {
                BufferedImage ai = (p == 0) ? actualImg0 : actualRenderer.renderImageWithDPI(p, 150, ImageType.RGB);
                BufferedImage ri = (p == 0) ? refImg0 : refRenderer.renderImageWithDPI(p, 150, ImageType.RGB);
                double d = imageAnalyzer.diffPercent(ai, ri);
                maxDiffPercent = Math.max(maxDiffPercent, d);
                if (d > 4) {
                    differingPages++;
                }
            }
        }

        /* ---- 3. UI look & feel summary from visual results ---- */
        if (!visuallyEqual && uiF.isEmpty()) {
            String sev = maxDiffPercent > 12 ? "high" : "medium";
            uiF.add(new Finding(sev,
                    String.format("Visual differences detected (up to %.1f%% of pixels differ on a page).", maxDiffPercent),
                    "See the highlighted Difference PDF — red marks content present only in Actual, green marks content missing from Actual."));
        }

        /* ---- 4. Assemble report ---- */
        List<CategoryResult> categories = List.of(
                new CategoryResult("language", "Language", "Document language vs expected language", languageF),
                new CategoryResult("locale", "Content Locale", "Document locale vs Print Preview XML", localeF),
                new CategoryResult("ui", "UI Look & Feel", "Overall visual appearance", uiF),
                new CategoryResult("alignment", "Vertical & Horizontal Alignment", "Content positioning", alignmentF),
                new CategoryResult("lineSeparator", "Line Separator", "Separator / divider lines", lineSeparatorF),
                new CategoryResult("grammar", "Grammatical Mistakes", "Grammar & spelling (Acrolinx)", grammarF),
                new CategoryResult("missingDetails", "Missing Details", "Fields & values from the XML missing in the Actual PDF", missingDetailsF)
        );

        int high = 0, mediumLow = 0, total = 0, passed = 0;
        for (CategoryResult c : categories) {
            boolean hasIssue = false;
            for (Finding f : c.findings()) {
                if ("info".equals(f.severity())) {
                    continue; // informational findings are not gaps
                }
                hasIssue = true;
                total++;
                if ("high".equals(f.severity())) {
                    high++;
                } else {
                    mediumLow++;
                }
            }
            if (!hasIssue) {
                passed++;
            }
        }

        cleanup(actualPath, referencePath);

        return new VerificationReport(language, detectedLanguage, total, high, mediumLow,
                passed, categories.size(), visuallyEqual, totalPages, differingPages,
                Math.round(maxDiffPercent * 10) / 10.0, diffId, categories);
    }

    /* ---------------- helpers ---------------- */

    private Path writeTemp(String prefix, MultipartFile file) throws IOException {
        Path path = Files.createTempFile("cv-" + prefix + "-", ".pdf");
        file.transferTo(path);
        return path;
    }

    private void cleanup(Path... paths) {
        for (Path p : paths) {
            try {
                Files.deleteIfExists(p);
            } catch (IOException ignored) {
                // best effort
            }
        }
    }

    private static String escape(String s) {
        return s == null ? "" : s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
