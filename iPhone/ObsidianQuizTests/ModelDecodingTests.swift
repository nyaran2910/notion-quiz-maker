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

    func testObsidianMarkdownQuizPartsUsesFirstH1AsPrompt() {
        let parts = ObsidianMarkdownQuizParts.parse(
            body: """
            Intro text
            # $E = mc^2$ #

            Answer body
            ## Details
            More answer
            """
        )

        XCTAssertEqual(parts?.prompt, "$E = mc^2$")
        XCTAssertEqual(
            parts?.answer,
            """
            Intro text

            Answer body
            ## Details
            More answer
            """
        )
    }

    func testObsidianMarkdownQuizPartsHandlesCompactH1AndKeepsAnswerText() {
        let parts = ObsidianMarkdownQuizParts.parse(
            body: """
            #$\\begin{pmatrix}a\\end{pmatrix}$はなんですか？#
            $\\begin{pmatrix}a\\end{pmatrix}$はなんですか？
            ![](image.png)
            """
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

    func testObsidianMarkdownQuizPartsIgnoresH2AndRequiresH1() {
        XCTAssertNil(
            ObsidianMarkdownQuizParts.parse(
                body: """
                ## Not a question
                Answer
                """
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
}
