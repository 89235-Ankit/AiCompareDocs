package com.pdq.contentverify.service;

import com.pdq.contentverify.model.Finding;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NamedNodeMap;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Parses an optional "Print Preview" XML and derives verification rules from it:
 *   - key {@code avq$lang}          -> expected content language
 *   - key {@code avq$localeCountry} -> expected content locale (country)
 *   - all other key/value pairs     -> expected field values, grouped into two
 *                                       sub-sections (processData incl. Metadata,
 *                                       and footerData &amp; ContentData).
 */
@Component
public class XmlAnalyzer {

    private static final Logger log = LoggerFactory.getLogger(XmlAnalyzer.class);

    public static final String KEY_LANG = "avq$lang";
    public static final String KEY_LOCALE_COUNTRY = "avq$localeCountry";

    /** Sub-section labels used to group missing-value findings. */
    public static final String SECTION_PROCESS = "processData (incl. Metadata)";
    public static final String SECTION_CONTENT = "footerData & ContentData";

    /** Attribute names that may carry the "key" of a key/value pair (e.g. &lt;entry key="..."&gt;). */
    private static final List<String> KEY_ATTRS = List.of("key");
    /** Attribute names that may carry the "value" of a key/value pair. */
    private static final List<String> VALUE_ATTRS = List.of("value", "val");

    /** One expected key/value pair extracted from the XML together with its section. */
    public record XmlField(String key, String value, String section) {
    }

    /** Result of parsing the Print Preview XML. */
    public record XmlData(String lang, String localeCountry, List<XmlField> fields) {
        public boolean hasLang() { return lang != null && !lang.isBlank(); }
        public boolean hasLocaleCountry() { return localeCountry != null && !localeCountry.isBlank(); }
    }

    /** ISO 639-1 language code -> language name used by the tool. */
    private static final Map<String, String> LANG_NAMES = Map.of(
            "en", "English",
            "de", "German",
            "fr", "French",
            "it", "Italian"
    );

    /* ---------------- Parsing ---------------- */

    public XmlData parse(byte[] xmlBytes) throws Exception {
        DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
        // Harden against XXE (OWASP A05) — disable DTDs and external entities.
        dbf.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        dbf.setFeature("http://xml.org/sax/features/external-general-entities", false);
        dbf.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        dbf.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
        dbf.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
        dbf.setXIncludeAware(false);
        dbf.setExpandEntityReferences(false);
        dbf.setNamespaceAware(false);

        DocumentBuilder builder = dbf.newDocumentBuilder();
        Document doc = builder.parse(new ByteArrayInputStream(xmlBytes));
        doc.getDocumentElement().normalize();

        Map<String, XmlField> byKey = new LinkedHashMap<>();
        collect(doc.getDocumentElement(), "", byKey);

        String lang = null;
        String localeCountry = null;
        List<XmlField> fields = new ArrayList<>();
        for (XmlField f : byKey.values()) {
            if (KEY_LANG.equalsIgnoreCase(f.key())) {
                lang = f.value();
            } else if (KEY_LOCALE_COUNTRY.equalsIgnoreCase(f.key())) {
                localeCountry = f.value();
            } else if (f.value() != null && !f.value().isBlank()) {
                fields.add(f);
            }
        }
        return new XmlData(lang, localeCountry, fields);
    }

    /** Recursively collects key/value pairs, tracking the current section. */
    private void collect(Element el, String section, Map<String, XmlField> out) {
        String currentSection = sectionFor(el.getTagName(), section);

        String key = firstAttr(el, KEY_ATTRS);
        String valueAttr = firstAttr(el, VALUE_ATTRS);

        if (key != null && !key.isBlank()) {
            // Case 1: explicit key attribute, e.g. <entry key="avq$lang" value="en"/>.
            String value = valueAttr != null ? valueAttr : directText(el);
            addField(out, key, value, currentSection);
        } else if (valueAttr != null && !valueAttr.isBlank()) {
            // Case 2: value attribute but no key -> the tag name is the key, e.g. <mailingId value="6421"/>.
            addField(out, el.getTagName(), valueAttr, currentSection);
        } else if (isLeafWithText(el)) {
            // Case 3: leaf element with text -> tag name is the key, e.g. <price>90.2</price>.
            addField(out, el.getTagName(), directText(el), currentSection);
        }

        NodeList children = el.getChildNodes();
        for (int i = 0; i < children.getLength(); i++) {
            Node n = children.item(i);
            if (n.getNodeType() == Node.ELEMENT_NODE) {
                collect((Element) n, currentSection, out);
            }
        }
    }

    /** Adds a field, de-duplicating on the key+value combination so distinct values are all kept. */
    private void addField(Map<String, XmlField> out, String key, String value, String section) {
        if (key == null || key.isBlank() || value == null || value.isBlank()) {
            return;
        }
        String k = key.trim();
        String v = value.trim();
        String dedupKey = k.toLowerCase(Locale.ROOT) + "\u0000" + v.toLowerCase(Locale.ROOT);
        out.putIfAbsent(dedupKey, new XmlField(k, v, section));
    }

    /** Determines the reporting sub-section for a given tag. */
    private String sectionFor(String tag, String inherited) {
        String t = tag == null ? "" : tag.toLowerCase(Locale.ROOT);
        if (t.contains("processdata") || t.contains("metadata")) {
            return SECTION_PROCESS;
        }
        if (t.contains("footerdata") || t.contains("contentdata")) {
            return SECTION_CONTENT;
        }
        // Everything else falls under ContentData per the specification.
        return inherited == null || inherited.isBlank() ? SECTION_CONTENT : inherited;
    }

    private static String firstAttr(Element el, List<String> names) {
        NamedNodeMap attrs = el.getAttributes();
        for (String name : names) {
            Node a = attrs.getNamedItem(name);
            if (a != null && a.getNodeValue() != null && !a.getNodeValue().isBlank()) {
                return a.getNodeValue();
            }
        }
        return null;
    }

    private static boolean isLeafWithText(Element el) {
        NodeList children = el.getChildNodes();
        for (int i = 0; i < children.getLength(); i++) {
            if (children.item(i).getNodeType() == Node.ELEMENT_NODE) {
                return false;
            }
        }
        return true;
    }

    private static String directText(Element el) {
        StringBuilder sb = new StringBuilder();
        NodeList children = el.getChildNodes();
        for (int i = 0; i < children.getLength(); i++) {
            Node n = children.item(i);
            if (n.getNodeType() == Node.TEXT_NODE || n.getNodeType() == Node.CDATA_SECTION_NODE) {
                sb.append(n.getNodeValue());
            }
        }
        return sb.toString().trim();
    }

    /* ---------------- Rules ---------------- */

    /** Rule: if {@code avq$lang} is present, show the document language and flag mismatches. */
    public void analyzeLanguage(XmlData xml, String detectedLanguage, List<Finding> out) {
        if (!xml.hasLang()) {
            return;
        }
        String code = xml.lang().trim().toLowerCase(Locale.ROOT);
        String base = code.contains("-") ? code.substring(0, code.indexOf('-')) : code;
        String expected = LANG_NAMES.getOrDefault(base, xml.lang().trim());

        // Informational: surface the document language derived from the XML.
        out.add(new Finding("info",
                "Document Language: <code>" + escape(expected) + "</code>",
                "From Print Preview XML <code>" + escape(KEY_LANG) + "</code> = <code>" + escape(xml.lang()) + "</code>."));

        if (detectedLanguage != null && !"Unknown".equalsIgnoreCase(detectedLanguage)
                && !expected.equalsIgnoreCase(detectedLanguage)) {
            out.add(new Finding("high",
                    "Content language does not match Print Preview XML <code>" + escape(KEY_LANG) + "</code>.",
                    "XML expects <code>" + escape(expected) + "</code> (" + escape(xml.lang())
                            + ") but content appears to be <code>" + escape(detectedLanguage) + "</code>."));
        }
    }

    /** Rule: if {@code avq$localeCountry} is present, verify the content locale. */
    public void analyzeLocale(XmlData xml, String actualText, List<Finding> out) {
        if (!xml.hasLocaleCountry()) {
            return;
        }
        String country = xml.localeCountry().trim().toUpperCase(Locale.ROOT);
        String text = actualText == null ? "" : actualText;

        // Look for a clearly conflicting currency signal for the expected country.
        String expectedCurrency = CURRENCY_BY_COUNTRY.get(country);
        if (expectedCurrency != null) {
            List<String> conflicting = new ArrayList<>();
            for (Map.Entry<String, String> e : CURRENCY_BY_COUNTRY.entrySet()) {
                String cur = e.getValue();
                if (!cur.equals(expectedCurrency)
                        && text.matches("(?s).*\\b" + cur + "\\b.*")
                        && !text.matches("(?s).*\\b" + expectedCurrency + "\\b.*")) {
                    conflicting.add(cur + " (" + e.getKey() + ")");
                }
            }
            if (!conflicting.isEmpty()) {
                out.add(new Finding("medium",
                        "Content locale may not match Print Preview XML <code>" + escape(KEY_LOCALE_COUNTRY) + "</code>.",
                        "XML expects locale <code>" + escape(country) + "</code> (" + escape(expectedCurrency)
                                + ") but the content contains: " + escape(String.join(", ", conflicting)) + "."));
            }
        }
    }

    /**
     * Rule: when XML is provided, for every key/value whose value is missing from the Actual PDF,
     * emit one row combining the <b>key tag</b> and its <b>value</b> (e.g. {@code price}=90.2,
     * {@code mv}=40229.2 from &lt;position&gt;), grouped into the two sub-sections.
     * Checked across the whole XML. Each finding uses {@code message}=key and {@code detail}=value
     * so the frontend can render it as a table.
     */
    public void analyzeMissingDetails(XmlData xml, String actualText, List<Finding> out) {
        String norm = norm(actualText);
        for (XmlField f : xml.fields()) {
            if (KEY_LANG.equalsIgnoreCase(f.key()) || KEY_LOCALE_COUNTRY.equalsIgnoreCase(f.key())) {
                continue;
            }
            String value = f.value();
            if (value == null || value.isBlank()) {
                continue;
            }
            if (!norm.contains(norm(value))) {
                out.add(new Finding("high",
                        "<code>" + escape(f.key()) + "</code>",
                        escape(value),
                        f.section()));
            }
        }
    }

    private static final Map<String, String> CURRENCY_BY_COUNTRY = Map.of(
            "US", "USD",
            "GB", "GBP",
            "DE", "EUR",
            "FR", "EUR",
            "IT", "EUR",
            "CH", "CHF"
    );

    private static String norm(String s) {
        return s == null ? "" : s.toLowerCase(Locale.ROOT).replaceAll("\\s+", " ").trim();
    }

    private static String escape(String s) {
        return s == null ? "" : s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
