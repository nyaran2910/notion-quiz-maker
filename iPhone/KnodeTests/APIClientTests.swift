import Foundation
import XCTest
@testable import Knode

private final class URLProtocolMock: URLProtocol {
    nonisolated(unsafe) static var requestHandler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        guard let handler = Self.requestHandler else {
            client?.urlProtocol(self, didFailWithError: APIError.invalidResponse)
            return
        }

        do {
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

@MainActor
final class APIClientTests: XCTestCase {
    override func tearDown() {
        URLProtocolMock.requestHandler = nil
        super.tearDown()
    }

    func testGetMeDecodesResponse() async throws {
        let client = makeClient()
        URLProtocolMock.requestHandler = { request in
            XCTAssertEqual(request.url?.path, "/api/mobile/me")
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            let data = """
            {
              "user": {
                "id": "user-1",
                "email": "user@example.com",
                "displayName": "User"
              },
              "obsidianConnection": {
                "workspaceId": "workspace-1",
                "workspaceName": "Workspace",
                "connected": true
              }
            }
            """.data(using: .utf8)!
            return (response, data)
        }

        let result = try await client.getMe()

        XCTAssertEqual(result.user?.id, "user-1")
        XCTAssertEqual(result.obsidianConnection?.connected, true)
    }

    func testServerErrorUsesErrorMessage() async throws {
        let client = makeClient()
        URLProtocolMock.requestHandler = { request in
            let response = HTTPURLResponse(url: request.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!
            let data = #"{"error":"ログインし直してください。"}"#.data(using: .utf8)!
            return (response, data)
        }

        do {
            _ = try await client.getMe() as MobileMeResponse
            XCTFail("Expected APIError.server")
        } catch let error as APIError {
            XCTAssertEqual(error, .server(statusCode: 401, message: "ログインし直してください。"))
        }
    }

    func testRestoreAnswerMetadataReturnsQuestionToPreAnswerFrontMatter() async throws {
        let client = makeClient()
        let folderURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("KnodeTests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: folderURL, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folderURL) }

        let markdownURL = folderURL.appendingPathComponent("Question.md")
        try """
        Answer body
        """.write(to: markdownURL, atomically: true, encoding: .utf8)

        let sources = try await client.addObsidianFolders([folderURL])
        let source = try XCTUnwrap(sources.first)
        let quizSource = QuizSourceConfig(
            dataSourceId: source.id,
            dataSourceName: source.name,
            dataSourceUrl: source.url,
            mappings: [:]
        )
        let started = try await client.startQuiz(sources: [quizSource], questionCount: 1)
        let question = try XCTUnwrap(started.questions.first)
        let beforeAnswer = try String(contentsOf: markdownURL, encoding: .utf8)

        let response = try await client.recordAnswer(
            RecordAnswerRequest(
                pageId: question.pageId,
                questionItemId: question.questionItemId,
                sessionId: started.sessionId,
                isCorrect: true,
                questionPosition: 1,
                responseTimeMs: 1200,
                mappings: nil
            )
        )

        let answered = try String(contentsOf: markdownURL, encoding: .utf8)
        XCTAssertTrue(answered.contains("answer_count: 1"))
        XCTAssertTrue(answered.contains("correct_count: 1"))

        let undoToken = try XCTUnwrap(response.undoToken)
        try await client.restoreAnswerMetadata(undoToken)

        let restored = try String(contentsOf: markdownURL, encoding: .utf8)
        XCTAssertEqual(restored, beforeAnswer)
    }

    func testSelectedParentFolderMergesNestedDatabaseFolders() async throws {
        let client = makeClient()
        let folderURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("KnodeTests-\(UUID().uuidString)", isDirectory: true)
        let matrixDBURL = folderURL.appendingPathComponent("matrixDB", isDirectory: true)
        let odeDBURL = folderURL.appendingPathComponent("odeDB", isDirectory: true)
        try FileManager.default.createDirectory(at: matrixDBURL, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: odeDBURL, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folderURL) }

        try "Rank answer".write(
            to: matrixDBURL.appendingPathComponent("Matrix Rank.md"),
            atomically: true,
            encoding: .utf8
        )
        try "Linear ode answer".write(
            to: odeDBURL.appendingPathComponent("Linear ODE.md"),
            atomically: true,
            encoding: .utf8
        )

        let sources = try await client.addObsidianFolders([folderURL])
        let source = try XCTUnwrap(sources.first)
        let quizSource = QuizSourceConfig(
            dataSourceId: source.id,
            dataSourceName: source.name,
            dataSourceUrl: source.url,
            mappings: [:]
        )

        let sync = try await client.syncSources([quizSource])
        XCTAssertEqual(sync.sourceCount, 1)
        XCTAssertEqual(sync.questionCount, 2)

        let started = try await client.startQuiz(sources: [quizSource], questionCount: 10)
        XCTAssertEqual(started.totalCandidates, 2)
        XCTAssertEqual(started.plannedQuestionCount, 2)
        XCTAssertEqual(Set(started.questions.map(\.dataSourceId)), [source.id])
        XCTAssertEqual(Set(started.questions.map(\.dataSourceName)), [source.name])
        XCTAssertEqual(Set(started.questions.compactMap { $0.prompt.first?.displayText }), ["Matrix Rank", "Linear ODE"])
    }

    func testRenamingObsidianFolderUsesCustomDatabaseName() async throws {
        let client = makeClient()
        let folderURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("KnodeTests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: folderURL, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folderURL) }

        try "Answer body".write(
            to: folderURL.appendingPathComponent("Question.md"),
            atomically: true,
            encoding: .utf8
        )

        let sources = try await client.addObsidianFolders([folderURL])
        let source = try XCTUnwrap(sources.first)
        let originalQuizSource = QuizSourceConfig(
            dataSourceId: source.id,
            dataSourceName: source.name,
            dataSourceUrl: source.url,
            mappings: [:]
        )
        _ = try await client.createQuizSet(
            name: "Daily",
            description: nil,
            sources: [originalQuizSource]
        )

        let renamed = try await client.renameObsidianFolder(id: source.id, name: "Math DB")

        XCTAssertEqual(renamed.id, source.id)
        XCTAssertEqual(renamed.name, "Math DB")

        let dataSources = try await client.listDataSources().dataSources
        XCTAssertEqual(dataSources.first(where: { $0.id == source.id })?.name, "Math DB")

        let quizSets = try await client.listQuizSets().quizSets
        XCTAssertEqual(quizSets.first?.sources.first?.dataSourceName, "Math DB")

        let reauthorized = try await client.addObsidianFolders([folderURL])
        XCTAssertEqual(reauthorized.first?.id, source.id)
        XCTAssertEqual(reauthorized.first?.name, "Math DB")

        let started = try await client.startQuiz(sources: [originalQuizSource], questionCount: 1)
        XCTAssertEqual(started.questions.first?.dataSourceId, source.id)
        XCTAssertEqual(started.questions.first?.dataSourceName, "Math DB")
    }

    func testEditingObsidianFolderCanChangeNameAndReferencedFolder() async throws {
        let client = makeClient()
        let oldFolderURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("KnodeTests-\(UUID().uuidString)-old", isDirectory: true)
        let newFolderURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("KnodeTests-\(UUID().uuidString)-new", isDirectory: true)
        try FileManager.default.createDirectory(at: oldFolderURL, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: newFolderURL, withIntermediateDirectories: true)
        defer {
            try? FileManager.default.removeItem(at: oldFolderURL)
            try? FileManager.default.removeItem(at: newFolderURL)
        }

        try "Old answer".write(
            to: oldFolderURL.appendingPathComponent("Old Question.md"),
            atomically: true,
            encoding: .utf8
        )
        try "New answer".write(
            to: newFolderURL.appendingPathComponent("New Question.md"),
            atomically: true,
            encoding: .utf8
        )

        let sources = try await client.addObsidianFolders([oldFolderURL])
        let source = try XCTUnwrap(sources.first)
        let originalQuizSource = QuizSourceConfig(
            dataSourceId: source.id,
            dataSourceName: source.name,
            dataSourceUrl: source.url,
            mappings: [:]
        )
        _ = try await client.createQuizSet(
            name: "Daily",
            description: nil,
            sources: [originalQuizSource]
        )

        let edited = try await client.updateObsidianFolder(
            id: source.id,
            name: "Physics DB",
            url: newFolderURL
        )

        XCTAssertEqual(edited.id, source.id)
        XCTAssertEqual(edited.name, "Physics DB")
        XCTAssertEqual(edited.parentTitle, newFolderURL.path)

        let quizSets = try await client.listQuizSets().quizSets
        XCTAssertEqual(quizSets.first?.sources.first?.dataSourceName, "Physics DB")
        XCTAssertEqual(quizSets.first?.sources.first?.dataSourceUrl, newFolderURL.path)

        let started = try await client.startQuiz(sources: [originalQuizSource], questionCount: 1)
        XCTAssertEqual(started.questions.first?.dataSourceId, source.id)
        XCTAssertEqual(started.questions.first?.dataSourceName, "Physics DB")
        XCTAssertEqual(started.questions.first?.prompt.first?.displayText, "New Question")
    }

    private func makeClient() -> APIClient {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [URLProtocolMock.self]
        configuration.httpCookieStorage = HTTPCookieStorage()
        let session = URLSession(configuration: configuration)
        let defaults = UserDefaults(suiteName: "KnodeTests-\(UUID().uuidString)")!
        let preferences = AppPreferences(defaults: defaults)
        preferences.baseURLString = "https://example.test"
        return APIClient(preferences: preferences, session: session)
    }
}
