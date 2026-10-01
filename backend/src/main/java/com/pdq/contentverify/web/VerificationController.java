package com.pdq.contentverify.web;


import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.pdq.contentverify.service.AskAdiaService;
import org.springframework.web.bind.annotation.RequestBody;
import com.pdq.contentverify.model.VerificationReport;
import com.pdq.contentverify.service.PdfComparisonService;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;


@RestController
@RequestMapping("/api")
public class VerificationController {

    private final PdfComparisonService service;
    private final AskAdiaService askAdiaService;
    private final ObjectMapper objectMapper;

    public VerificationController(
            PdfComparisonService service,
            AskAdiaService askAdiaService,
            ObjectMapper objectMapper
    ) {
        this.service = service;
        this.askAdiaService = askAdiaService;
        this.objectMapper = objectMapper;
    }
    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "UP", "engine", "PDFBox + red6 pdfcompare");
    }

    @PostMapping(
            value = "/verify",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    public ObjectNode verify(
            @RequestParam("actual") MultipartFile actual,
            @RequestParam("reference") MultipartFile reference,
            @RequestParam(value = "language", defaultValue = "English") String language,
            @RequestParam(value = "printPreviewXml", required = false) MultipartFile printPreviewXml) {

        if (actual == null || actual.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Actual PDF file is required"
            );
        }

        if (reference == null || reference.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Reference PDF file is required"
            );
        }

        try {

            /*
             * STEP 1
             * Existing deterministic verification.
             */
            VerificationReport report =
                    service.verify(
                            actual,
                            reference,
                            language,
                            printPreviewXml
                    );

            /*
             * STEP 2
             * Ask Gemini to interpret the actual report.
             */
            String aiSummary;

            try {

                aiSummary =
                        askAdiaService.generateValidationSummary(report);

            } catch (Exception aiException) {

                /*
                 * IMPORTANT:
                 * AI failure must NOT make the PDF verification fail.
                 */
                aiException.printStackTrace();

                aiSummary =
                        "AI validation summary is currently unavailable. "
                                + "The document verification results above "
                                + "were generated successfully by the "
                                + "verification engine.";
            }

            /*
             * STEP 3
             * Convert the existing VerificationReport to JSON.
             */
            ObjectNode response =
                    objectMapper.valueToTree(report);

            /*
             * STEP 4
             * Add AI information without removing ANY existing fields.
             */
            response.put(
                    "aiValidationSummary",
                    aiSummary
            );

            response.put(
                    "aiValidationAvailable",
                    !aiSummary.startsWith(
                            "AI validation summary is currently unavailable"
                    )
            );

            return response;

        } catch (IOException e) {

            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Failed to analyse PDFs: "
                            + e.getMessage(),
                    e
            );
        }
    }

    @GetMapping("/diff/{id}")
    public ResponseEntity<Resource> diff(@PathVariable String id) {
        Path pdf = service.getDiffPdf(id);
        if (pdf == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Difference PDF not found");
        }
        Resource resource = new FileSystemResource(pdf);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"difference.pdf\"")
                .body(resource);
    }

    @PostMapping(
            value = "/report/chat",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<Map<String, String>> reportChat(
            @RequestBody ReportChatRequest request
    ) {

        if (request == null ||
                request.question() == null ||
                request.question().trim().isEmpty()) {

            return ResponseEntity.badRequest()
                    .body(
                            Map.of(
                                    "answer",
                                    "Please enter a question."
                            )
                    );
        }

        try {

            String answer =
                    askAdiaService.askAboutReport(
                            request.question().trim(),
                            request.report()
                    );

            return ResponseEntity.ok(
                    Map.of(
                            "answer",
                            answer
                    )
            );

        } catch (Exception e) {

            e.printStackTrace();

            return ResponseEntity
                    .status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(
                            Map.of(
                                    "answer",
                                    "ADIA error: " + e.getMessage()
                            )
                    );
        }
    }

    public record ReportChatRequest(
            String question,
            VerificationReport report,
            List<ChatMessage> history
    ) {
    }

    public record ChatMessage(
            String role,
            String content
    ) {
    }
    @PostMapping(
            value = "/ask-adia",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<Map<String, String>> askAdia(
            @RequestBody AskAdiaRequest request
    ) {

        if (request == null ||
                request.question() == null ||
                request.question().trim().isEmpty()) {

            return ResponseEntity.badRequest()
                    .body(
                            Map.of(
                                    "answer",
                                    "Please enter a question."
                            )
                    );
        }

        try {

            String answer;

            if (request.report() != null) {

                answer = askAdiaService.askAboutReport(
                        request.question().trim(),
                        request.report()
                );

            } else {

                answer = askAdiaService.ask(
                        request.question().trim()
                );
            }

            return ResponseEntity.ok(
                    Map.of(
                            "answer",
                            answer
                    )
            );

        } catch (Exception e) {

            e.printStackTrace();

            return ResponseEntity
                    .status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(
                            Map.of(
                                    "answer",
                                    "ADIA error: " + e.getMessage()
                            )
                    );
        }
    }


    public record AskAdiaRequest(
            String question,
            VerificationReport report
    ) {
    }
}