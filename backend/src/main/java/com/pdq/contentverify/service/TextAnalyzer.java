package com.pdq.contentverify.service;

import com.pdq.contentverify.model.Finding;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Text-based analysis using text extracted by Apache PDFBox:
 * language detection, grammatical/spacing mistakes and field / value gaps.
 */
@Component
public class TextAnalyzer {

    private static final Map<String, Set<String>> LANG_STOPWORDS = Map.of(
            "English", Set.of("the", "and", "is", "of", "to", "in", "for", "with", "your", "please", "this", "on", "are"),
            "German", Set.of("der", "die", "das", "und", "ist", "sie", "für", "mit", "nicht", "auf", "ein", "eine", "wir", "bitte"),
            "French", Set.of("le", "la", "les", "et", "est", "vous", "pour", "avec", "une", "des", "dans", "nous", "votre", "merci"),
            "Italian", Set.of("il", "la", "le", "di", "che", "per", "con", "una", "dei", "non", "questo", "grazie", "vostro", "gentile")
    );

    private static final Pattern WORD = Pattern.compile("[a-zà-ÿ]+");
    private static final Pattern FIELD = Pattern.compile("^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 /_()\\-]{1,40}?)\\s*[:：]\\s*(.*)$");

    /* ---------------- Language ---------------- */

    public Map<String, Double> scoreLanguage(String text) {
        Matcher m = WORD.matcher(text.toLowerCase());
        List<String> words = new ArrayList<>();
        while (m.find()) {
            words.add(m.group());
        }
        double total = Math.max(1, words.size());
        Map<String, Double> scores = new LinkedHashMap<>();
        for (Map.Entry<String, Set<String>> e : LANG_STOPWORDS.entrySet()) {
            long hits = words.stream().filter(e.getValue()::contains).count();
            scores.put(e.getKey(), hits / total);
        }
        return scores;
    }

    public String detectLanguage(String text) {
        return scoreLanguage(text).entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .map(Map.Entry::getKey)
                .orElse("Unknown");
    }

    public void analyzeLanguage(String text, String expected, List<Finding> out) {
        Map<String, Double> scores = scoreLanguage(text);
        Map.Entry<String, Double> top = scores.entrySet().stream()
                .max(Map.Entry.comparingByValue()).orElse(null);
        if (top == null || top.getValue() == 0.0) {
            out.add(new Finding("medium",
                    "Could not confidently detect the document language.",
                    "No common words matched. The document may contain mostly numbers, images, or an unsupported language."));
            return;
        }
        if (!top.getKey().equals(expected)) {
            double expScore = scores.getOrDefault(expected, 0.0);
            out.add(new Finding("high",
                    "Document language appears to be <code>" + top.getKey() + "</code> but <code>" + expected + "</code> was expected.",
                    String.format("Confidence — %s: %.1f%%, %s: %.1f%%.",
                            top.getKey(), top.getValue() * 100, expected, expScore * 100)));
        }
    }

    /* ---------------- Grammar / spacing ---------------- */

    private record Rule(Pattern pattern, String label) {
    }

    private static final List<Rule> GRAMMAR_RULES = List.of(
            new Rule(Pattern.compile(",(?=[^\\s,)\\d])"), "Missing space after comma"),
            new Rule(Pattern.compile("\\s+,"), "Space before comma"),
            new Rule(Pattern.compile("\\s+\\."), "Space before full stop"),
            new Rule(Pattern.compile(" {2,}"), "Multiple consecutive spaces")
    );

    public void analyzeGrammar(String text, List<Finding> out) {
        for (Rule rule : GRAMMAR_RULES) {
            Matcher m = rule.pattern().matcher(text);
            int count = 0;
            while (m.find() && count < 8) {
                int i = m.start();
                String snippet = text.substring(Math.max(0, i - 12), Math.min(text.length(), i + 15))
                        .replaceAll("\\s+", " ").trim();
                out.add(new Finding("low", rule.label(), "…" + escape(snippet) + "…"));
                count++;
            }
        }
    }

    /* ---------------- Fields ---------------- */

    /** Returns lowercased-label -> [originalLabel, value]. */
    public Map<String, String[]> extractFields(String text) {
        Map<String, String[]> fields = new LinkedHashMap<>();
        for (String line : text.split("\\r?\\n")) {
            Matcher m = FIELD.matcher(line.trim());
            if (m.matches()) {
                String label = m.group(1).trim().replaceAll("\\s+", " ");
                String value = m.group(2) == null ? "" : m.group(2).trim();
                if (label.length() >= 2) {
                    fields.putIfAbsent(label.toLowerCase(), new String[]{label, value});
                }
            }
        }
        return fields;
    }

    /* ---------------- helpers ---------------- */

    /**
     * Merged Actual-vs-Reference field check producing table-friendly rows
     * ({@code message}=field label, {@code detail}=missing/differing value) for the
     * combined "Missing Details" section when no Print Preview XML is supplied.
     */
    public void analyzeFieldsMerged(Map<String, String[]> actualFields,
                                    Map<String, String[]> refFields,
                                    String actualFullText,
                                    List<Finding> out) {
        String actNorm = norm(actualFullText);
        for (Map.Entry<String, String[]> e : refFields.entrySet()) {
            String key = e.getKey();
            String refLabel = e.getValue()[0];
            String refValue = e.getValue()[1];
            String[] act = actualFields.get(key);
            boolean labelPresent = act != null || actNorm.contains(norm(refLabel));

            if (!labelPresent) {
                out.add(new Finding("high",
                        "<code>" + escape(refLabel) + "</code>",
                        refValue.isEmpty() ? "(field missing in Actual)" : escape(refValue)));
                continue;
            }
            if (refValue.isEmpty()) {
                continue;
            }
            String refVal = norm(refValue);
            String actVal = act != null ? norm(act[1]) : "";
            if (!actVal.isEmpty()) {
                if (!refVal.equals(actVal)) {
                    out.add(new Finding("medium",
                            "<code>" + escape(refLabel) + "</code>",
                            "Actual: \u201c" + escape(act[1]) + "\u201d \u00b7 Reference: \u201c" + escape(refValue) + "\u201d"));
                }
            } else if (!actNorm.contains(refVal)) {
                out.add(new Finding("high",
                        "<code>" + escape(refLabel) + "</code>",
                        escape(refValue)));
            }
        }
    }

    private static String norm(String s) {
        return s == null ? "" : s.toLowerCase().replaceAll("\\s+", " ").trim();
    }

    private static String escape(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
