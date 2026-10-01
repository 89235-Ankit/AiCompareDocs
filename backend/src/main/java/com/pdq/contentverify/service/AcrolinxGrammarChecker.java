package com.pdq.contentverify.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.pdq.contentverify.model.Finding;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;

/**
 * Grammatical-mistake detection powered by the <b>Acrolinx</b> Platform API.
 *
 * <p>When Acrolinx is configured ({@code acrolinx.enabled=true} plus a base URL and
 * API token) the document text is submitted to the Acrolinx checking service and the
 * returned issues are mapped to {@link Finding}s. When Acrolinx is not configured or
 * the call fails, it transparently falls back to the built-in heuristic rules so the
 * tool keeps working offline.</p>
 */
@Component
public class AcrolinxGrammarChecker {

    private static final Logger log = LoggerFactory.getLogger(AcrolinxGrammarChecker.class);

    private final TextAnalyzer textAnalyzer;
    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    @Value("${acrolinx.enabled:false}")
    private boolean enabled;

    @Value("${acrolinx.base-url:}")
    private String baseUrl;

    @Value("${acrolinx.api-token:}")
    private String apiToken;

    @Value("${acrolinx.client-signature:content-verify-tool}")
    private String clientSignature;

    @Value("${acrolinx.guidance-profile:}")
    private String guidanceProfile;

    @Value("${acrolinx.max-poll-attempts:20}")
    private int maxPollAttempts;

    public AcrolinxGrammarChecker(TextAnalyzer textAnalyzer) {
        this.textAnalyzer = textAnalyzer;
    }

    /** Runs grammar analysis, using Acrolinx when available and heuristics otherwise. */
    public void analyzeGrammar(String text, String language, List<Finding> out) {
        if (isConfigured()) {
            try {
                if (checkWithAcrolinx(text, language, out)) {
                    return;
                }
            } catch (Exception ex) {
                log.warn("Acrolinx check failed, falling back to heuristic rules", ex);
                out.clear();
            }
        }
        textAnalyzer.analyzeGrammar(text, out);
    }

    private boolean isConfigured() {
        return enabled && baseUrl != null && !baseUrl.isBlank()
                && apiToken != null && !apiToken.isBlank();
    }

    /* ---------------- Acrolinx Platform API ---------------- */

    private boolean checkWithAcrolinx(String text, String language, List<Finding> out) throws Exception {
        if (text == null || text.isBlank()) {
            return true;
        }
        String root = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;

        // 1. Submit the check.
        ObjectNode body = mapper.createObjectNode();
        body.put("content", text);
        ObjectNode opts = body.putObject("checkOptions");
        opts.put("contentFormat", "TEXT");
        opts.put("checkType", "baseline");
        if (guidanceProfile != null && !guidanceProfile.isBlank()) {
            opts.put("guidanceProfileId", guidanceProfile);
        }
        if (language != null && !language.isBlank()) {
            opts.putObject("languageId").put("value", languageCode(language));
        }
        body.put("contentReference", "content-verification.txt");

        HttpResponse<String> submit = http.send(
                request(root + "/api/v1/checking/checks")
                        .POST(HttpRequest.BodyPublishers.ofString(body.toString()))
                        .build(),
                HttpResponse.BodyHandlers.ofString());

        if (submit.statusCode() >= 300) {
            log.warn("Acrolinx submit returned HTTP {}", submit.statusCode());
            return false;
        }
        JsonNode submitJson = mapper.readTree(submit.body());
        String resultUrl = submitJson.path("data").path("links").path("result").asText(null);
        if (resultUrl == null || resultUrl.isBlank()) {
            resultUrl = submitJson.path("links").path("result").asText(null);
        }
        if (resultUrl == null || resultUrl.isBlank()) {
            return false;
        }

        // 2. Poll for the result.
        JsonNode result = pollForResult(resultUrl);
        if (result == null) {
            return false;
        }

        // 3. Map issues to findings.
        JsonNode issues = result.path("data").path("issues");
        if (!issues.isArray()) {
            return true;
        }
        int count = 0;
        for (JsonNode issue : issues) {
            if (count >= 25) {
                break;
            }
            String label = firstNonBlank(
                    issue.path("displayNameHtml").asText(null),
                    issue.path("displaySurface").asText(null),
                    "Grammatical issue");
            String guidance = firstNonBlank(
                    issue.path("guidanceHtml").asText(null),
                    issue.path("displaySurface").asText(null),
                    "");
            String severity = severityFor(issue);
            out.add(new Finding(severity, label, guidance));
            count++;
        }
        return true;
    }

    private JsonNode pollForResult(String resultUrl) throws Exception {
        long delayMs = 500;
        for (int attempt = 0; attempt < maxPollAttempts; attempt++) {
            HttpResponse<String> resp = http.send(
                    request(resultUrl).GET().build(),
                    HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() == 200) {
                JsonNode json = mapper.readTree(resp.body());
                // 202-style "still running" payloads embed a progress/retryAfter node.
                JsonNode retryAfter = json.path("progress").path("retryAfter");
                if (!retryAfter.isMissingNode() && !json.path("data").has("issues")) {
                    Thread.sleep(Math.min(retryAfter.asLong(1) * 1000L, 3000L));
                    continue;
                }
                return json;
            }
            if (resp.statusCode() == 202) {
                Thread.sleep(delayMs);
                delayMs = Math.min(delayMs * 2, 3000);
                continue;
            }
            log.warn("Acrolinx poll returned HTTP {}", resp.statusCode());
            return null;
        }
        log.warn("Acrolinx result not ready after {} attempts", maxPollAttempts);
        return null;
    }

    private HttpRequest.Builder request(String url) {
        return HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(30))
                .header("X-Acrolinx-Auth", apiToken)
                .header("X-Acrolinx-Client", clientSignature + "; 1.0.0")
                .header("Content-Type", "application/json")
                .header("Accept", "application/json");
    }

    private static String severityFor(JsonNode issue) {
        String type = issue.path("issueType").asText("").toLowerCase();
        String goal = issue.path("goalId").asText("").toLowerCase();
        if (type.contains("spelling") || goal.contains("spelling") || goal.contains("correctness")) {
            return "medium";
        }
        if (type.contains("grammar") || goal.contains("grammar")) {
            return "medium";
        }
        return "low";
    }

    private static String languageCode(String language) {
        return switch (language == null ? "" : language.toLowerCase()) {
            case "german" -> "de";
            case "french" -> "fr";
            case "italian" -> "it";
            default -> "en";
        };
    }

    private static String firstNonBlank(String... values) {
        for (String v : values) {
            if (v != null && !v.isBlank()) {
                return v;
            }
        }
        return "";
    }
}
