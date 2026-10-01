package com.pdq.contentverify.service;

import com.pdq.contentverify.model.Finding;
import org.springframework.stereotype.Component;

import java.awt.image.BufferedImage;
import java.util.List;

/**
 * Image-based analysis on pages rendered by PDFBox:
 * vertical/horizontal alignment, line separators and an overall pixel-diff metric.
 * Uses plain Java raster scanning (no native image library required).
 */
@Component
public class ImageAnalyzer {

    private static final int DARK_THRESHOLD = 140;   // luminance below this = "ink"
    private static final int DIFF_THRESHOLD = 45;    // per-pixel luminance delta counted as a difference

    /* ---------------- Alignment ---------------- */

    public void analyzeAlignment(BufferedImage actual, BufferedImage reference, List<Finding> out) {
        int[] a = contentBox(actual);
        int[] r = contentBox(reference);
        if (a == null || r == null) {
            return;
        }
        // Scale reference box into actual coordinate space for a fair comparison
        double sx = (double) actual.getWidth() / reference.getWidth();
        double sy = (double) actual.getHeight() / reference.getHeight();
        int rLeft = (int) Math.round(r[0] * sx);
        int rTop = (int) Math.round(r[1] * sy);
        int rRight = (int) Math.round((r[0] + r[2]) * sx);
        int rBottom = (int) Math.round((r[1] + r[3]) * sy);

        int aLeft = a[0], aTop = a[1], aRight = a[0] + a[2], aBottom = a[1] + a[3];

        double hTol = actual.getWidth() * 0.02;
        double vTol = actual.getHeight() * 0.02;

        int dxLeft = aLeft - rLeft, dxRight = aRight - rRight;
        int dyTop = aTop - rTop, dyBottom = aBottom - rBottom;

        if (Math.abs(dxLeft) > hTol || Math.abs(dxRight) > hTol) {
            out.add(new Finding("medium",
                    "Horizontal alignment differs from the reference.",
                    String.format("Left edge offset: %dpx, right edge offset: %dpx.", dxLeft, dxRight)));
        }
        if (Math.abs(dyTop) > vTol || Math.abs(dyBottom) > vTol) {
            out.add(new Finding("medium",
                    "Vertical alignment differs from the reference.",
                    String.format("Top edge offset: %dpx, bottom edge offset: %dpx.", dyTop, dyBottom)));
        }
    }

    /* ---------------- Line separators ---------------- */

    public void analyzeLineSeparators(BufferedImage actual, BufferedImage reference, List<Finding> out) {
        int aLines = countHorizontalLines(actual);
        int rLines = countHorizontalLines(reference);
        if (aLines != rLines) {
            out.add(new Finding(aLines < rLines ? "medium" : "low",
                    String.format("Line separator count differs — Actual has %d, Reference has %d.", aLines, rLines),
                    aLines < rLines
                            ? "One or more separator lines appear to be missing in the Actual document."
                            : "The Actual document has extra separator lines."));
        }
    }

    public int countHorizontalLines(BufferedImage img) {
        int w = img.getWidth();
        int h = img.getHeight();
        int minSpan = (int) (w * 0.25);
        int count = 0;
        boolean prevWasLine = false;
        for (int y = 0; y < h; y++) {
            int longestRun = 0, run = 0;
            for (int x = 0; x < w; x++) {
                if (luminance(img.getRGB(x, y)) < DARK_THRESHOLD) {
                    run++;
                    if (run > longestRun) {
                        longestRun = run;
                    }
                } else {
                    run = 0;
                }
            }
            boolean isLine = longestRun >= minSpan;
            if (isLine && !prevWasLine) {
                count++; // count each separator band once
            }
            prevWasLine = isLine;
        }
        return count;
    }

    /* ---------------- Overall pixel difference ---------------- */

    public double diffPercent(BufferedImage a, BufferedImage b) {
        int w = Math.min(a.getWidth(), b.getWidth());
        int h = Math.min(a.getHeight(), b.getHeight());
        if (w == 0 || h == 0) {
            return 0;
        }
        long changed = 0;
        int step = Math.max(1, Math.min(w, h) / 900); // subsample very large pages for speed
        long sampled = 0;
        for (int y = 0; y < h; y += step) {
            for (int x = 0; x < w; x += step) {
                int la = luminance(a.getRGB(x, y));
                int lb = luminance(b.getRGB(x, y));
                if (Math.abs(la - lb) > DIFF_THRESHOLD) {
                    changed++;
                }
                sampled++;
            }
        }
        return sampled == 0 ? 0 : (changed * 100.0) / sampled;
    }

    /* ---------------- helpers ---------------- */

    private int[] contentBox(BufferedImage img) {
        int w = img.getWidth();
        int h = img.getHeight();
        int minX = w, minY = h, maxX = -1, maxY = -1;
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                if (luminance(img.getRGB(x, y)) < DARK_THRESHOLD) {
                    if (x < minX) minX = x;
                    if (y < minY) minY = y;
                    if (x > maxX) maxX = x;
                    if (y > maxY) maxY = y;
                }
            }
        }
        if (maxX < 0) {
            return null;
        }
        return new int[]{minX, minY, maxX - minX, maxY - minY};
    }

    private static int luminance(int rgb) {
        int r = (rgb >> 16) & 0xFF;
        int g = (rgb >> 8) & 0xFF;
        int b = rgb & 0xFF;
        return (int) (0.299 * r + 0.587 * g + 0.114 * b);
    }
}
