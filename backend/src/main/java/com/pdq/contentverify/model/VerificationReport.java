package com.pdq.contentverify.model;

import java.util.List;

/** Full verification report returned to the frontend. */
public record VerificationReport(
        String expectedLanguage,
        String detectedLanguage,
        int totalGaps,
        int high,
        int mediumLow,
        int categoriesPassed,
        int categoryCount,
        boolean visuallyEqual,
        int totalPages,
        int differingPages,
        double maxDiffPercent,
        String diffId,
        List<CategoryResult> categories) {
}
