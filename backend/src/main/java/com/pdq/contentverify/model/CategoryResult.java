package com.pdq.contentverify.model;

import java.util.List;

/** One of the seven gap categories together with its findings. */
public record CategoryResult(String key, String name, String description, List<Finding> findings) {
}
