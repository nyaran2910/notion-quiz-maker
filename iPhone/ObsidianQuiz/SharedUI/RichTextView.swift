import Foundation
import SwiftUI
import WebKit

struct RichTextView: View {
    let items: [QuizRichTextItem]
    var placeholder: String = "None"
    var textStyle: UIFont.TextStyle = .body

    private var markdown: String {
        items.map { item in
            if item.type == "equation",
               let expression = item.equation?.expression,
               !expression.isEmpty {
                return "$\(expression)$"
            }

            return item.displayText
        }
        .joined()
        .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        if markdown.isEmpty {
            Text(placeholder)
                .foregroundStyle(.secondary)
        } else {
            ObsidianMarkdownHTMLView(markdown: markdown, textStyle: textStyle)
        }
    }
}

private struct ObsidianMarkdownHTMLView: View {
    let markdown: String
    let textStyle: UIFont.TextStyle

    @State private var contentHeight: CGFloat = 36

    var body: some View {
        ObsidianMarkdownWebView(markdown: markdown, textStyle: textStyle, contentHeight: $contentHeight)
            .frame(minHeight: contentHeight, maxHeight: contentHeight)
            .accessibilityLabel(markdown)
    }
}

private struct ObsidianMarkdownWebView: UIViewRepresentable {
    let markdown: String
    let textStyle: UIFont.TextStyle
    @Binding var contentHeight: CGFloat

    func makeCoordinator() -> Coordinator {
        Coordinator(contentHeight: $contentHeight)
    }

    func makeUIView(context: Context) -> WKWebView {
        let contentController = WKUserContentController()
        contentController.add(context.coordinator, name: "height")

        let configuration = WKWebViewConfiguration()
        configuration.userContentController = contentController

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.scrollView.isScrollEnabled = true
        webView.scrollView.alwaysBounceVertical = false
        webView.scrollView.alwaysBounceHorizontal = true
        webView.scrollView.showsVerticalScrollIndicator = false
        webView.scrollView.showsHorizontalScrollIndicator = true
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.contentInset = .zero
        webView.isOpaque = false
        webView.backgroundColor = .clear
        context.coordinator.currentHTML = html
        webView.loadHTMLString(html, baseURL: nil)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        let nextHTML = html
        if context.coordinator.currentHTML != nextHTML {
            context.coordinator.currentHTML = nextHTML
            webView.loadHTMLString(nextHTML, baseURL: nil)
        }
    }

    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "height")
        uiView.navigationDelegate = nil
    }

    private var html: String {
        let font = UIFont.preferredFont(forTextStyle: textStyle)
        let renderedMarkdown = ObsidianMarkdownRenderer.render(markdown)

        return """
        <!doctype html>
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
          <script>
            window.MathJax = {
              startup: { typeset: false },
              svg: { fontCache: "none" }
            };
          </script>
          <script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js"></script>
          <style>
            html, body {
              margin: 0;
              padding: 0;
              background: transparent;
              color: \(Self.cssColor(UIColor.label));
              font: \(font.pointSize)px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif;
              line-height: 1.5;
              overflow-x: hidden;
              overflow-y: hidden;
              -webkit-text-size-adjust: 100%;
            }
            body {
              overflow-wrap: anywhere;
            }
            body > :first-child { margin-top: 0; }
            body > :last-child { margin-bottom: 0; }
            p {
              margin: 0 0 0.75em;
            }
            h1, h2, h3, h4, h5, h6 {
              margin: 0.85em 0 0.35em;
              line-height: 1.25;
              font-weight: 700;
            }
            h1 { font-size: 1.6em; }
            h2 { font-size: 1.38em; }
            h3 { font-size: 1.2em; }
            h4, h5, h6 { font-size: 1.05em; }
            strong { font-weight: 700; }
            em { font-style: italic; }
            mark {
              background: rgba(255, 214, 10, 0.42);
              color: inherit;
              padding: 0 0.08em;
              border-radius: 3px;
            }
            del { color: \(Self.cssColor(UIColor.secondaryLabel)); }
            a, .internal-link {
              color: \(Self.cssColor(UIColor.systemBlue));
              text-decoration: none;
            }
            blockquote {
              margin: 0.4em 0 0.85em;
              padding: 0.1em 0 0.1em 0.8em;
              border-left: 3px solid \(Self.cssColor(UIColor.separator));
              color: \(Self.cssColor(UIColor.secondaryLabel));
            }
            ul, ol {
              margin: 0.35em 0 0.85em 1.1em;
              padding-left: 1em;
            }
            li { margin: 0.22em 0; }
            .task-list-item {
              list-style: none;
              margin-left: -1.45em;
            }
            .task-list-item input {
              margin-right: 0.45em;
              transform: translateY(1px);
            }
            hr {
              border: 0;
              border-top: 1px solid \(Self.cssColor(UIColor.separator));
              margin: 1em 0;
            }
            code {
              font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
              font-size: 0.92em;
              background: \(Self.cssColor(UIColor.secondarySystemBackground));
              border-radius: 4px;
              padding: 0.08em 0.28em;
            }
            pre {
              margin: 0.5em 0 0.9em;
              padding: 0.75em;
              overflow-x: auto;
              background: \(Self.cssColor(UIColor.secondarySystemBackground));
              border-radius: 8px;
            }
            pre code {
              padding: 0;
              background: transparent;
              border-radius: 0;
              font-size: 0.9em;
              white-space: pre;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin: 0.55em 0 0.95em;
              display: block;
              overflow-x: auto;
            }
            th, td {
              border: 1px solid \(Self.cssColor(UIColor.separator));
              padding: 0.42em 0.55em;
              text-align: left;
              vertical-align: top;
            }
            th {
              font-weight: 700;
              background: \(Self.cssColor(UIColor.secondarySystemBackground));
            }
            .callout {
              margin: 0.5em 0 0.9em;
              padding: 0.75em 0.85em;
              border-left: 4px solid \(Self.cssColor(UIColor.systemBlue));
              border-radius: 8px;
              background: \(Self.cssColor(UIColor.secondarySystemBackground));
            }
            .callout-title {
              font-weight: 700;
              margin-bottom: 0.35em;
            }
            .math-inline {
              display: inline-block;
              max-width: 100%;
              overflow-x: auto;
              overflow-y: hidden;
              -webkit-overflow-scrolling: touch;
              vertical-align: middle;
            }
            .math-display {
              margin: 0.85em 0;
              max-width: 100%;
              overflow-x: auto;
              overflow-y: hidden;
              -webkit-overflow-scrolling: touch;
              text-align: left;
            }
            .math-inline mjx-container,
            .math-display mjx-container {
              display: inline-block;
              max-width: none;
              min-width: max-content;
              vertical-align: middle;
            }
            .math-error {
              color: \(Self.cssColor(UIColor.systemRed));
            }
            mjx-assistive-mml {
              position: absolute !important;
              width: 1px !important;
              height: 1px !important;
              padding: 0 !important;
              margin: -1px !important;
              overflow: hidden !important;
              clip: rect(0, 0, 0, 0) !important;
              white-space: nowrap !important;
              border: 0 !important;
            }
          </style>
        </head>
        <body>
          \(renderedMarkdown)
          <script>
            function updateHeight() {
              var height = Math.ceil(Math.max(
                document.body.getBoundingClientRect().height,
                document.body.scrollHeight,
                document.documentElement.scrollHeight
              ));
              window.webkit.messageHandlers.height.postMessage(height);
            }

            function renderMath() {
              var elements = Array.prototype.slice.call(document.querySelectorAll("[data-math='true']"));
              if (!elements.length) {
                updateHeight();
                return;
              }

              if (!(window.MathJax && window.MathJax.tex2svgPromise)) {
                updateHeight();
                return;
              }

              Promise.all(elements.map(function(element) {
                if (element.dataset.rendered === "true") {
                  return Promise.resolve();
                }

                var expression = element.textContent || "";
                var display = element.dataset.display === "true";
                return window.MathJax.tex2svgPromise(expression, { display: display }).then(function(node) {
                  element.innerHTML = "";
                  element.appendChild(node);
                  element.dataset.rendered = "true";
                }).catch(function() {
                  element.classList.add("math-error");
                });
              })).then(updateHeight).catch(updateHeight);
            }

            window.addEventListener("load", function() {
              updateHeight();
              setTimeout(renderMath, 80);
              setTimeout(renderMath, 500);
            });
            window.addEventListener("resize", updateHeight);
            setTimeout(updateHeight, 250);
          </script>
        </body>
        </html>
        """
    }

    private static func cssColor(_ color: UIColor) -> String {
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0

        color.getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        return "rgba(\(Int(red * 255)), \(Int(green * 255)), \(Int(blue * 255)), \(alpha))"
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        var currentHTML: String?
        private var contentHeight: Binding<CGFloat>

        init(contentHeight: Binding<CGFloat>) {
            self.contentHeight = contentHeight
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == "height" else {
                return
            }

            let value: CGFloat?
            if let number = message.body as? NSNumber {
                value = CGFloat(truncating: number)
            } else if let double = message.body as? Double {
                value = CGFloat(double)
            } else {
                value = nil
            }

            guard let value, value > 0 else {
                return
            }

            DispatchQueue.main.async {
                self.contentHeight.wrappedValue = max(24, value)
            }
        }
    }
}

enum ObsidianMarkdownRenderer {
    private struct Fence {
        let marker: Character
        let count: Int
        let language: String
    }

    private enum ListKind {
        case unordered
        case ordered
    }

    private struct ListItem {
        let kind: ListKind
        let content: String
        let checked: Bool?
    }

    static func render(_ markdown: String) -> String {
        let normalized = markdown
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
        let lines = normalized.components(separatedBy: "\n")
        let html = renderLines(lines)
        return html.isEmpty ? "<p></p>" : html
    }

    private static func renderLines(_ lines: [String]) -> String {
        var index = 0
        var blocks: [String] = []

        while index < lines.count {
            let line = lines[index]
            let trimmed = line.trimmingCharacters(in: .whitespaces)

            if trimmed.isEmpty {
                index += 1
                continue
            }

            if trimmed.hasPrefix("%%") {
                index = consumeCommentBlock(lines, from: index)
                continue
            }

            if let fence = fenceStart(line) {
                blocks.append(renderCodeBlock(lines, from: &index, fence: fence))
                continue
            }

            if isDisplayMathStart(trimmed) {
                blocks.append(renderDisplayMath(lines, from: &index))
                continue
            }

            if let heading = renderHeading(line) {
                blocks.append(heading)
                index += 1
                continue
            }

            if isHorizontalRule(trimmed) {
                blocks.append("<hr>")
                index += 1
                continue
            }

            if isTableStart(lines, index: index) {
                blocks.append(renderTable(lines, from: &index))
                continue
            }

            if line.trimmingCharacters(in: .whitespaces).hasPrefix(">") {
                blocks.append(renderQuote(lines, from: &index))
                continue
            }

            if let firstItem = parseListItem(line) {
                blocks.append(renderList(lines, from: &index, firstItem: firstItem))
                continue
            }

            blocks.append(renderParagraph(lines, from: &index))
        }

        return blocks.joined(separator: "\n")
    }

    private static func consumeCommentBlock(_ lines: [String], from start: Int) -> Int {
        var index = start
        var isFirstLine = true
        while index < lines.count {
            let line = lines[index]
            let searchStart = isFirstLine ? line.index(line.startIndex, offsetBy: min(2, line.count)) : line.startIndex
            if line.range(of: "%%", range: searchStart..<line.endIndex) != nil {
                return index + 1
            }
            isFirstLine = false
            index += 1
        }
        return index
    }

    private static func renderParagraph(_ lines: [String], from index: inout Int) -> String {
        var paragraphLines: [String] = []

        while index < lines.count {
            let line = lines[index]
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.isEmpty {
                break
            }

            if !paragraphLines.isEmpty && startsBlock(lines, index: index) {
                break
            }

            paragraphLines.append(line.trimmingCharacters(in: .whitespaces))
            index += 1
        }

        let body = paragraphLines
            .map(renderInline)
            .joined(separator: "<br>")
        return "<p>\(body)</p>"
    }

    private static func startsBlock(_ lines: [String], index: Int) -> Bool {
        let line = lines[index]
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        return trimmed.isEmpty
            || trimmed.hasPrefix("%%")
            || fenceStart(line) != nil
            || isDisplayMathStart(trimmed)
            || renderHeading(line) != nil
            || isHorizontalRule(trimmed)
            || isTableStart(lines, index: index)
            || trimmed.hasPrefix(">")
            || parseListItem(line) != nil
    }

    private static func renderHeading(_ line: String) -> String? {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        var count = 0
        var cursor = trimmed.startIndex

        while cursor < trimmed.endIndex, trimmed[cursor] == "#" {
            count += 1
            cursor = trimmed.index(after: cursor)
        }

        guard (1...6).contains(count),
              cursor < trimmed.endIndex,
              trimmed[cursor] == " " else {
            return nil
        }

        let contentStart = trimmed.index(after: cursor)
        let content = String(trimmed[contentStart...])
            .replacingOccurrences(of: #"[\s#]+$"#, with: "", options: .regularExpression)
        return "<h\(count)>\(renderInline(content))</h\(count)>"
    }

    private static func fenceStart(_ line: String) -> Fence? {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        guard let marker = trimmed.first, marker == "`" || marker == "~" else {
            return nil
        }

        var count = 0
        var cursor = trimmed.startIndex
        while cursor < trimmed.endIndex, trimmed[cursor] == marker {
            count += 1
            cursor = trimmed.index(after: cursor)
        }

        guard count >= 3 else {
            return nil
        }

        let language = String(trimmed[cursor...]).trimmingCharacters(in: .whitespaces)
        return Fence(marker: marker, count: count, language: language)
    }

    private static func isFenceClose(_ line: String, fence: Fence) -> Bool {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        let prefix = String(repeating: String(fence.marker), count: fence.count)
        return trimmed.hasPrefix(prefix)
    }

    private static func renderCodeBlock(_ lines: [String], from index: inout Int, fence: Fence) -> String {
        index += 1
        var codeLines: [String] = []

        while index < lines.count {
            if isFenceClose(lines[index], fence: fence) {
                index += 1
                break
            }

            codeLines.append(lines[index])
            index += 1
        }

        let languageClass = fence.language.isEmpty ? "" : " class=\"language-\(escapeAttribute(fence.language))\""
        return "<pre><code\(languageClass)>\(escapeHTML(codeLines.joined(separator: "\n")))</code></pre>"
    }

    private static func isDisplayMathStart(_ trimmed: String) -> Bool {
        trimmed == "$$" || (trimmed.hasPrefix("$$") && trimmed.count > 2)
    }

    private static func renderDisplayMath(_ lines: [String], from index: inout Int) -> String {
        let trimmed = lines[index].trimmingCharacters(in: .whitespaces)

        if trimmed.hasPrefix("$$"), trimmed.count > 4, trimmed.hasSuffix("$$") {
            let start = trimmed.index(trimmed.startIndex, offsetBy: 2)
            let end = trimmed.index(trimmed.endIndex, offsetBy: -2)
            index += 1
            return mathElement(String(trimmed[start..<end]), display: true)
        }

        index += 1
        var mathLines: [String] = []
        while index < lines.count {
            if lines[index].trimmingCharacters(in: .whitespaces) == "$$" {
                index += 1
                break
            }

            mathLines.append(lines[index])
            index += 1
        }

        return mathElement(mathLines.joined(separator: "\n"), display: true)
    }

    private static func isHorizontalRule(_ trimmed: String) -> Bool {
        let compact = trimmed.replacingOccurrences(of: " ", with: "")
        guard compact.count >= 3 else {
            return false
        }

        return compact.allSatisfy { $0 == "-" }
            || compact.allSatisfy { $0 == "*" }
            || compact.allSatisfy { $0 == "_" }
    }

    private static func isTableStart(_ lines: [String], index: Int) -> Bool {
        guard index + 1 < lines.count,
              lines[index].contains("|") else {
            return false
        }

        return isTableSeparator(lines[index + 1])
    }

    private static func isTableSeparator(_ line: String) -> Bool {
        let cells = splitTableRow(line)
        guard cells.count >= 2 else {
            return false
        }

        return cells.allSatisfy { cell in
            let compact = cell.replacingOccurrences(of: " ", with: "")
            return compact.range(of: #"^:?-{2,}:?$"#, options: .regularExpression) != nil
        }
    }

    private static func renderTable(_ lines: [String], from index: inout Int) -> String {
        let headers = splitTableRow(lines[index])
        index += 2

        var rows: [[String]] = []
        while index < lines.count {
            let line = lines[index]
            if line.trimmingCharacters(in: .whitespaces).isEmpty || !line.contains("|") {
                break
            }

            rows.append(splitTableRow(line))
            index += 1
        }

        let headerHTML = headers.map { "<th>\(renderInline($0))</th>" }.joined()
        let bodyHTML = rows.map { row in
            let cells = row.map { "<td>\(renderInline($0))</td>" }.joined()
            return "<tr>\(cells)</tr>"
        }.joined()

        return "<table><thead><tr>\(headerHTML)</tr></thead><tbody>\(bodyHTML)</tbody></table>"
    }

    private static func splitTableRow(_ line: String) -> [String] {
        var value = line.trimmingCharacters(in: .whitespaces)
        if value.hasPrefix("|") {
            value.removeFirst()
        }
        if value.hasSuffix("|") {
            value.removeLast()
        }

        return value
            .split(separator: "|", omittingEmptySubsequences: false)
            .map { String($0).trimmingCharacters(in: .whitespaces) }
    }

    private static func renderQuote(_ lines: [String], from index: inout Int) -> String {
        var quoteLines: [String] = []

        while index < lines.count {
            let trimmed = lines[index].trimmingCharacters(in: .whitespaces)
            guard trimmed.hasPrefix(">") else {
                break
            }

            let stripped = trimmed.dropFirst().trimmingCharacters(in: .whitespaces)
            quoteLines.append(stripped)
            index += 1
        }

        if let first = quoteLines.first,
           let callout = firstMatch(pattern: #"^\[!([A-Za-z0-9_-]+)\]([+-])?\s*(.*)$"#, in: first) {
            let type = callout[0].lowercased()
            let title = callout[2].isEmpty ? type.capitalized : callout[2]
            let content = quoteLines.dropFirst().map(renderInline).joined(separator: "<br>")
            let body = content.isEmpty ? "" : "<div>\(content)</div>"
            return "<div class=\"callout callout-\(escapeAttribute(type))\"><div class=\"callout-title\">\(renderInline(title))</div>\(body)</div>"
        }

        let content = quoteLines.map(renderInline).joined(separator: "<br>")
        return "<blockquote>\(content)</blockquote>"
    }

    private static func parseListItem(_ line: String) -> ListItem? {
        let trimmed = line.trimmingCharacters(in: .whitespaces)

        if let unordered = firstMatch(pattern: #"^[-*+]\s+(?:\[([^\]]*)\]\s+)?(.+)$"#, in: trimmed) {
            let state = unordered[0]
            let checked = state.isEmpty ? nil : !state.trimmingCharacters(in: .whitespaces).isEmpty
            return ListItem(kind: .unordered, content: unordered[1], checked: checked)
        }

        if let ordered = firstMatch(pattern: #"^\d+[\.)]\s+(.+)$"#, in: trimmed) {
            return ListItem(kind: .ordered, content: ordered[0], checked: nil)
        }

        return nil
    }

    private static func renderList(_ lines: [String], from index: inout Int, firstItem: ListItem) -> String {
        let tag = firstItem.kind == .ordered ? "ol" : "ul"
        var items: [String] = []

        while index < lines.count {
            guard let item = parseListItem(lines[index]), item.kind == firstItem.kind else {
                break
            }

            if let checked = item.checked {
                let checkedAttribute = checked ? " checked" : ""
                items.append("<li class=\"task-list-item\"><input type=\"checkbox\" disabled\(checkedAttribute)>\(renderInline(item.content))</li>")
            } else {
                items.append("<li>\(renderInline(item.content))</li>")
            }

            index += 1
        }

        return "<\(tag)>\(items.joined())</\(tag)>"
    }

    private static func renderInline(_ text: String) -> String {
        var output = ""
        var plain = ""
        var index = text.startIndex

        func flushPlain() {
            guard !plain.isEmpty else {
                return
            }
            output += renderPlainInline(plain)
            plain = ""
        }

        while index < text.endIndex {
            let character = text[index]

            if character == "\\", text.index(after: index) < text.endIndex {
                let next = text.index(after: index)
                if text[next] == "(" {
                    let contentStart = text.index(after: next)
                    if let closing = rangeOfUnescaped("\\)", in: text, from: contentStart) {
                        flushPlain()
                        output += mathElement(String(text[contentStart..<closing.lowerBound]), display: false)
                        index = closing.upperBound
                        continue
                    }
                }

                if text[next] == "[" {
                    let contentStart = text.index(after: next)
                    if let closing = rangeOfUnescaped("\\]", in: text, from: contentStart) {
                        flushPlain()
                        output += mathElement(String(text[contentStart..<closing.lowerBound]), display: true)
                        index = closing.upperBound
                        continue
                    }
                }

                plain.append(text[next])
                index = text.index(after: next)
                continue
            }

            if character == "`",
               let closing = text[index...].dropFirst().firstIndex(of: "`") {
                let contentStart = text.index(after: index)
                flushPlain()
                output += "<code>\(escapeHTML(String(text[contentStart..<closing])))</code>"
                index = text.index(after: closing)
                continue
            }

            if character == "$" {
                let next = text.index(after: index)
                if next < text.endIndex, text[next] == "$" {
                    let contentStart = text.index(after: next)
                    if let closing = rangeOfUnescaped("$$", in: text, from: contentStart) {
                        flushPlain()
                        output += mathElement(String(text[contentStart..<closing.lowerBound]), display: false)
                        index = closing.upperBound
                        continue
                    }
                } else if let closing = rangeOfUnescaped("$", in: text, from: next) {
                    flushPlain()
                    output += mathElement(String(text[next..<closing.lowerBound]), display: false)
                    index = closing.upperBound
                    continue
                }
            }

            plain.append(character)
            index = text.index(after: index)
        }

        flushPlain()
        return output
    }

    private static func renderPlainInline(_ text: String) -> String {
        var html = replaceRegex(#"%%.*?%%"#, in: text, options: [.dotMatchesLineSeparators]) { _ in "" }
        html = escapeHTML(html)

        html = replaceRegex(#"\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]"#, in: html) { captures in
            let label = captures[1].isEmpty ? captures[0] : captures[1]
            return "<span class=\"internal-link\">\(label)</span>"
        }

        html = replaceRegex(#"\[([^\]]+)\]\(([^)]+)\)"#, in: html) { captures in
            "<a href=\"\(escapeAttribute(captures[1]))\">\(captures[0])</a>"
        }

        html = replaceRegex(#"==(.+?)=="#, in: html) { "<mark>\($0[0])</mark>" }
        html = replaceRegex(#"~~(.+?)~~"#, in: html) { "<del>\($0[0])</del>" }
        html = replaceRegex(#"\*\*\*(.+?)\*\*\*"#, in: html) { "<strong><em>\($0[0])</em></strong>" }
        html = replaceRegex(#"___(.+?)___"#, in: html) { "<strong><em>\($0[0])</em></strong>" }
        html = replaceRegex(#"\*\*(.+?)\*\*"#, in: html) { "<strong>\($0[0])</strong>" }
        html = replaceRegex(#"__(.+?)__"#, in: html) { "<strong>\($0[0])</strong>" }
        html = replaceRegex(#"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)"#, in: html) { "<em>\($0[0])</em>" }
        html = replaceRegex(#"(?<!_)_(?!_)(.+?)(?<!_)_(?!_)"#, in: html) { "<em>\($0[0])</em>" }

        return html
    }

    private static func mathElement(_ expression: String, display: Bool) -> String {
        let tag = display ? "div" : "span"
        let className = display ? "math-display" : "math-inline"
        return "<\(tag) class=\"\(className)\" data-math=\"true\" data-display=\"\(display ? "true" : "false")\">\(escapeHTML(expression))</\(tag)>"
    }

    private static func rangeOfUnescaped(_ token: String, in text: String, from start: String.Index) -> Range<String.Index>? {
        var searchRange = start..<text.endIndex
        while let range = text.range(of: token, range: searchRange) {
            if !isEscaped(range.lowerBound, in: text) {
                return range
            }
            searchRange = range.upperBound..<text.endIndex
        }

        return nil
    }

    private static func isEscaped(_ index: String.Index, in text: String) -> Bool {
        var cursor = index
        var count = 0

        while cursor > text.startIndex {
            let previous = text.index(before: cursor)
            if text[previous] == "\\" {
                count += 1
                cursor = previous
            } else {
                break
            }
        }

        return count % 2 == 1
    }

    private static func firstMatch(pattern: String, in value: String) -> [String]? {
        guard let regex = try? NSRegularExpression(pattern: pattern) else {
            return nil
        }

        let nsValue = value as NSString
        let range = NSRange(location: 0, length: nsValue.length)
        guard let match = regex.firstMatch(in: value, range: range) else {
            return nil
        }

        return (1..<match.numberOfRanges).map { index in
            let captureRange = match.range(at: index)
            guard captureRange.location != NSNotFound else {
                return ""
            }
            return nsValue.substring(with: captureRange)
        }
    }

    private static func replaceRegex(
        _ pattern: String,
        in value: String,
        options: NSRegularExpression.Options = [],
        using transform: ([String]) -> String
    ) -> String {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: options) else {
            return value
        }

        let nsValue = value as NSString
        let matches = regex.matches(in: value, range: NSRange(location: 0, length: nsValue.length))
        guard !matches.isEmpty else {
            return value
        }

        var result = ""
        var lastLocation = 0

        for match in matches {
            result += nsValue.substring(with: NSRange(location: lastLocation, length: match.range.location - lastLocation))
            let captures = (1..<match.numberOfRanges).map { index in
                let range = match.range(at: index)
                guard range.location != NSNotFound else {
                    return ""
                }
                return nsValue.substring(with: range)
            }
            result += transform(captures)
            lastLocation = match.range.location + match.range.length
        }

        result += nsValue.substring(from: lastLocation)
        return result
    }

    private static func escapeHTML(_ value: String) -> String {
        value
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
            .replacingOccurrences(of: "'", with: "&#39;")
    }

    private static func escapeAttribute(_ value: String) -> String {
        escapeHTML(value)
            .replacingOccurrences(of: "\n", with: " ")
            .replacingOccurrences(of: "\r", with: " ")
    }
}
