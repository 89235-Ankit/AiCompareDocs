package com.pdq.contentverify.model;

/** A single detected gap. {@code section} optionally groups findings into sub-sections. */
public record Finding(String severity, String message, String detail, String section) {

    /** Convenience constructor for findings that do not belong to a sub-section. */
    public Finding(String severity, String message, String detail) {
        this(severity, message, detail, null);
    }
}
