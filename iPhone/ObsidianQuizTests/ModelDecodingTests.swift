import XCTest
@testable import ObsidianQuiz

@MainActor
final class ModelDecodingTests: XCTestCase {
    func testQuizQuestionDecodingUsesExpectedKeys() throws {
        let json = """
        {
          "id": "question-1",
          "questionItemId": "item-1",
          "pageId": "page-1",
          "dataSourceId": "source-1",
          "dataSourceName": "Math",
          "prompt": [{ "plain_text": "2 + 2?" }],
          "correctAnswer": [{ "text": { "content": "4" } }],
          "explanation": [{ "equation": { "expression": "2+2=4" } }],
          "imageUrls": []
        }
        """.data(using: .utf8)!

        let question = try JSONDecoder().decode(QuizQuestion.self, from: json)

        XCTAssertEqual(question.id, "question-1")
        XCTAssertEqual(question.prompt.first?.displayText, "2 + 2?")
        XCTAssertEqual(question.correctAnswer.first?.displayText, "4")
        XCTAssertEqual(question.explanation.first?.displayText, "2+2=4")
    }

    func testQuizSetDecodingAllowsOptionalFields() throws {
        let json = """
        {
          "id": "set-1",
          "name": "Math",
          "description": null,
          "updatedAt": "2026-05-11T00:00:00.000Z",
          "sources": [
            {
              "dataSourceId": "source-1",
              "dataSourceName": "Math",
              "mappings": {
                "question": "prop-question",
                "answer": "prop-answer"
              }
            }
          ]
        }
        """.data(using: .utf8)!

        let quizSet = try JSONDecoder().decode(QuizSetSummary.self, from: json)

        XCTAssertEqual(quizSet.id, "set-1")
        XCTAssertNil(quizSet.description)
        XCTAssertEqual(quizSet.sources.first?.mappings["question"], "prop-question")
    }

    func testObsidianMarkdownQuizPartsUsesFilenameAsPromptWithoutSeparator() {
        let parts = ObsidianMarkdownQuizParts.parse(
            body: """
            # $E = mc^2$ #

            Answer body
            ## Details
            More answer
            """,
            filenamePrompt: "matrix question"
        )

        XCTAssertEqual(parts?.prompt, "matrix question")
        XCTAssertEqual(
            parts?.answer,
            """
            # $E = mc^2$ #

            Answer body
            ## Details
            More answer
            """
        )
    }

    func testObsidianMarkdownQuizPartsAddsTextAboveSeparatorToPrompt() {
        let parts = ObsidianMarkdownQuizParts.parse(
            body: """
            Intro text
            $E = mc^2$

            ---
            Answer body
            ## Details
            More answer
            """,
            filenamePrompt: "Physics"
        )

        XCTAssertEqual(
            parts?.prompt,
            """
            Physics

            Intro text
            $E = mc^2$
            """
        )
        XCTAssertEqual(
            parts?.answer,
            """
            Answer body
            ## Details
            More answer
            """
        )
    }

    func testObsidianMarkdownQuizPartsUsesFilenameOnlyWhenSeparatorHasNoPromptBody() {
        let parts = ObsidianMarkdownQuizParts.parse(
            body: """
            ---
            $\\begin{pmatrix}a\\end{pmatrix}$はなんですか？
            ![](image.png)
            """,
            filenamePrompt: "$\\begin{pmatrix}a\\end{pmatrix}$はなんですか？"
        )

        XCTAssertEqual(parts?.prompt, "$\\begin{pmatrix}a\\end{pmatrix}$はなんですか？")
        XCTAssertEqual(
            parts?.answer,
            """
            $\\begin{pmatrix}a\\end{pmatrix}$はなんですか？
            ![](image.png)
            """
        )
    }

    func testObsidianMarkdownQuizPartsRequiresAnswer() {
        XCTAssertNil(
            ObsidianMarkdownQuizParts.parse(
                body: """
                ---
                """,
                filenamePrompt: "Question"
            )
        )
    }

    func testMarkdownRendererHandlesLatexDelimitedMathInH1Prompt() {
        let inlineHTML = ObsidianMarkdownRenderer.render(#"\(\frac{1}{2}\)"#)
        let displayHTML = ObsidianMarkdownRenderer.render(#"\[\int_0^1 x dx\]"#)

        XCTAssertTrue(inlineHTML.contains(#"class="math-inline""#))
        XCTAssertTrue(inlineHTML.contains(#"\frac{1}{2}"#))
        XCTAssertTrue(displayHTML.contains(#"class="math-display""#))
        XCTAssertTrue(displayHTML.contains(#"\int_0^1 x dx"#))
    }

    func testObsidianURIEncodesVaultAndFileForOpenAction() {
        let url = ObsidianURI.openFile(
            target: ObsidianOpenTarget(
                vaultName: "Private",
                filePath: "transfer-exam/a #1.md"
            )
        )

        XCTAssertEqual(
            url,
            "obsidian://open?vault=Private&file=transfer-exam%2Fa%20%231.md"
        )
    }

    func testObsidianOpenTargetInfersVaultUnderObsidianFolder() {
        let target = ObsidianURI.openTarget(
            fileURL: URL(fileURLWithPath: "/private/var/mobile/Obsidian/Private/transfer-exam/r8.md"),
            selectedRootURL: URL(fileURLWithPath: "/private/var/mobile/Obsidian/Private/transfer-exam"),
            selectedFolderName: "transfer-exam",
            selectedRelativePath: "r8.md"
        )

        XCTAssertEqual(
            target,
            ObsidianOpenTarget(vaultName: "Private", filePath: "transfer-exam/r8.md")
        )
    }

    func testObsidianOpenTargetInfersICloudObsidianVault() {
        let target = ObsidianURI.openTarget(
            fileURL: URL(fileURLWithPath: "/Users/me/Library/Mobile Documents/iCloud~md~obsidian/Documents/Private/transfer-exam/r8.md"),
            selectedRootURL: URL(fileURLWithPath: "/Users/me/Library/Mobile Documents/iCloud~md~obsidian/Documents/Private/transfer-exam"),
            selectedFolderName: "transfer-exam",
            selectedRelativePath: "r8.md"
        )

        XCTAssertEqual(
            target,
            ObsidianOpenTarget(vaultName: "Private", filePath: "transfer-exam/r8.md")
        )
    }
}
