package com.pdq.contentverify.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.pdq.contentverify.model.VerificationReport;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

@Service
public class AskAdiaService {

    private final RestClient restClient;
    private final ObjectMapper objectMapper;

    @Value("${gemini.api.key}")
    private String apiKey;

    @Value("${gemini.model:gemini-3.5-flash-lite}")
    private String model;

    @Value("${gemini.url:https://generativelanguage.googleapis.com/v1beta}")
    private String geminiUrl;

    public AskAdiaService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.restClient = RestClient.builder().build();
    }

    public String askAboutReport(
            String question,
            VerificationReport report
    ) {

        if (question == null || question.trim().isEmpty()) {
            throw new IllegalArgumentException(
                    "Question cannot be empty"
            );
        }

        if (report == null) {
            return ask(question);
        }

        try {

            String reportJson =
                    objectMapper
                            .writerWithDefaultPrettyPrinter()
                            .writeValueAsString(report);

            String instructions = """
                You are ADIA, the AI document verification assistant
                for Avaloq.

                The user has just completed a document verification.
                They are asking a question about the verification report.

                Use ONLY the supplied verification report to answer.

                IMPORTANT RULES:

                - Treat the verification report as the source of truth.
                - Do not invent findings.
                - Do not change any numbers from the report.
                - Do not claim an issue exists if it is not present.
                - Explain technical findings in simple professional language.
                - If the answer cannot be determined from the report,
                  clearly say that.
                - When useful, mention the relevant verification category.
                - Keep answers concise and practical.
                - Do not repeat the entire report unless specifically asked.

                VERIFICATION REPORT:
                """ + reportJson;

            return callGemini(
                    instructions
                            + "\n\nUSER QUESTION:\n"
                            + question.trim()
            );

        } catch (Exception e) {

            throw new RuntimeException(
                    "Failed to analyse verification report: "
                            + e.getMessage(),
                    e
            );
        }
    }

    /*
     * Existing Ask ADIA chatbot.
     */
    public String ask(String question) {

        if (question == null || question.trim().isEmpty()) {
            throw new IllegalArgumentException("Question cannot be empty");
        }

        String instructions = """
                You are ADIA, an AI document verification assistant
                for Avaloq.

                Help users understand:
                - Document verification
                - PDF comparison
                - Content differences
                - Visual differences
                - Compliance checks
                - Localization and language validation
                - OCR
                - XML validation
                - Print preview validation
                - Verification reports

                Be concise, professional and easy to understand.

                Do not invent verification results.
                If a specific verification result is not provided,
                clearly say that you need the verification report.
                """;

        return callGemini(
                instructions + "\n\nUser question:\n" + question.trim()
        );
    }

    /*
     * NEW:
     * Gemini analyzes the actual VerificationReport generated
     * by PDFBox + pdfcompare.
     */
    public String generateValidationSummary(
            VerificationReport report
    ) {

        try {

            String reportJson =
                    objectMapper
                            .writerWithDefaultPrettyPrinter()
                            .writeValueAsString(report);

            String instructions = """
                    You are ADIA, an AI document verification analyst.

                    You are reviewing the results produced by a deterministic
                    document verification engine.

                    IMPORTANT RULES:

                    1. Treat the supplied verification report as the source
                       of truth.

                    2. Do NOT invent differences that are not present in
                       the report.

                    3. Do NOT change or recalculate the reported gap counts.

                    4. Explain what the detected differences mean in
                       practical terms.

                    5. Highlight important issues that should be reviewed.

                    6. If there are no gaps, clearly state that the documents
                       appear consistent according to the verification engine.

                    7. Do not claim regulatory compliance unless the report
                       explicitly contains evidence for it.

                    Return a concise professional analysis containing:

                    OVERALL ASSESSMENT
                    A short explanation of the verification result.

                    KEY FINDINGS
                    The most important detected issues.

                    IMPACT
                    Explain what the detected differences could affect.

                    RECOMMENDED ACTION
                    What the user should review or correct.

                    Keep the response suitable for displaying inside an
                    enterprise document verification application.
                    """;

            String prompt =
                    instructions
                            + "\n\nVERIFICATION REPORT:\n"
                            + reportJson;

            return callGemini(prompt);

        } catch (Exception e) {

            throw new RuntimeException(
                    "Failed to prepare verification report for Gemini: "
                            + e.getMessage(),
                    e
            );
        }
    }

    private String callGemini(String prompt) {

        Map<String, Object> requestBody = Map.of(
                "contents", List.of(
                        Map.of(
                                "parts", List.of(
                                        Map.of("text", prompt)
                                )
                        )
                )
        );

        try {

            String response =
                    restClient
                            .post()
                            .uri(
                                    geminiUrl
                                            + "/models/"
                                            + model
                                            + ":generateContent"
                            )
                            .header(
                                    "x-goog-api-key",
                                    apiKey
                            )
                            .contentType(MediaType.APPLICATION_JSON)
                            .body(requestBody)
                            .retrieve()
                            .body(String.class);

            return extractAnswer(response);

        } catch (Exception e) {

            throw new RuntimeException(
                    "Failed to communicate with Gemini: "
                            + e.getMessage(),
                    e
            );
        }
    }

    private String extractAnswer(String response) {

        try {

            JsonNode root =
                    objectMapper.readTree(response);

            JsonNode candidates =
                    root.path("candidates");

            if (candidates.isArray()
                    && !candidates.isEmpty()) {

                JsonNode parts =
                        candidates
                                .get(0)
                                .path("content")
                                .path("parts");

                if (parts.isArray()) {

                    StringBuilder answer =
                            new StringBuilder();

                    for (JsonNode part : parts) {

                        JsonNode text =
                                part.path("text");

                        if (text.isTextual()) {

                            if (answer.length() > 0) {
                                answer.append("\n");
                            }

                            answer.append(text.asText());
                        }
                    }

                    if (answer.length() > 0) {
                        return answer.toString();
                    }
                }
            }

            throw new RuntimeException(
                    "Gemini returned no text response"
            );

        } catch (Exception e) {

            throw new RuntimeException(
                    "Unable to parse Gemini response: "
                            + e.getMessage(),
                    e
            );
        }
    }
}