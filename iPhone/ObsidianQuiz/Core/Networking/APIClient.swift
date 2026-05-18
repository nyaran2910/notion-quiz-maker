import Foundation

enum HTTPMethod: String {
    case get = "GET"
    case post = "POST"
    case patch = "PATCH"
    case delete = "DELETE"
}

struct EmptyRequest: Encodable {}
struct OKResponse: Decodable {
    let ok: Bool
}

private struct ServerErrorResponse: Decodable {
    let error: String?
}

@MainActor
final class APIClient {
    private let preferences: AppPreferences
    private let session: URLSession
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder
    private let obsidianStore: ObsidianQuizStore

    init(
        preferences: AppPreferences = .shared,
        session: URLSession = APIClient.makeDefaultSession()
    ) {
        self.preferences = preferences
        self.session = session
        self.encoder = JSONEncoder()
        self.decoder = JSONDecoder()
        self.obsidianStore = ObsidianQuizStore(preferences: preferences)
    }

    private static func makeDefaultSession() -> URLSession {
        let configuration = URLSessionConfiguration.default
        configuration.httpCookieStorage = .shared
        configuration.httpCookieAcceptPolicy = .always
        configuration.httpShouldSetCookies = true
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        return URLSession(configuration: configuration)
    }

    func get<Response: Decodable>(_ path: String) async throws -> Response {
        try await request(path: path, method: .get, body: Optional<EmptyRequest>.none)
    }

    func send<Response: Decodable>(_ path: String, method: HTTPMethod) async throws -> Response {
        try await request(path: path, method: method, body: Optional<EmptyRequest>.none)
    }

    func send<Body: Encodable, Response: Decodable>(_ path: String, method: HTTPMethod, body: Body) async throws -> Response {
        try await request(path: path, method: method, body: body)
    }

    func clearCookies() {
        HTTPCookieStorage.shared.cookies?.forEach { HTTPCookieStorage.shared.deleteCookie($0) }
    }

    private func makeURL(path: String) -> URL? {
        let cleanedPath = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return preferences.baseURL.appendingPathComponent(cleanedPath)
    }

    private func request<Body: Encodable, Response: Decodable>(
        path: String,
        method: HTTPMethod,
        body: Body?
    ) async throws -> Response {
        guard let url = makeURL(path: path) else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.cachePolicy = .reloadIgnoringLocalCacheData

        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try encoder.encode(body)
        }

        let data: Data
        let response: URLResponse

        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.server(statusCode: -1, message: error.localizedDescription)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            let message = (try? decoder.decode(ServerErrorResponse.self, from: data).error) ?? HTTPURLResponse.localizedString(forStatusCode: httpResponse.statusCode)
            throw APIError.server(statusCode: httpResponse.statusCode, message: message)
        }

        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            throw APIError.decoding(message: error.localizedDescription)
        }
    }
}

extension APIClient {
    func getMe() async throws -> MobileMeResponse {
        try await get("/api/mobile/me")
    }

    func signIn(email: String, password: String) async throws -> AuthResponse {
        try await send("/api/mobile/auth/sign-in", method: .post, body: SignInRequest(email: email, password: password))
    }

    func signUp(email: String, password: String, passwordConfirmation: String, displayName: String?) async throws -> AuthResponse {
        try await send(
            "/api/mobile/auth/sign-up",
            method: .post,
            body: SignUpRequest(
                email: email,
                password: password,
                passwordConfirmation: passwordConfirmation,
                displayName: displayName
            )
        )
    }

    func signOut() async throws {
        let _: OKResponse = try await send("/api/mobile/auth/sign-out", method: .post, body: EmptyRequest())
        clearCookies()
    }

    func connectObsidian(token: String) async throws -> ObsidianConnectionResponse {
        try await send("/api/mobile/obsidian/connection", method: .post, body: ConnectObsidianRequest(token: token))
    }

    func disconnectObsidian() async throws {
        let _: OKResponse = try await send("/api/mobile/obsidian/connection", method: .delete)
    }

    func listDataSources() async throws -> DataSourcesResponse {
        try await obsidianStore.listDataSources()
    }

    func getDataSourceSchema(id: String) async throws -> DataSourceSchemaResponse {
        try await obsidianStore.getDataSourceSchema(id: id)
    }

    func createQuizProperty(dataSourceId: String, requirementKey: QuizRequirementKey) async throws -> DataSourceSchemaResponse {
        try await obsidianStore.getDataSourceSchema(id: dataSourceId)
    }

    func resetDataSourceMetadata(dataSourceId: String) async throws {
        try await obsidianStore.resetDataSourceMetadata(dataSourceId: dataSourceId)
    }

    func syncSources(_ sources: [QuizSourceConfig]) async throws -> SyncQuizSourcesResponse {
        try await obsidianStore.syncSources(sources)
    }

    func listQuizSets() async throws -> QuizSetsResponse {
        try await obsidianStore.listQuizSets()
    }

    func createQuizSet(name: String, description: String?, sources: [QuizSourceConfig]) async throws -> QuizSetResponse {
        try await obsidianStore.createQuizSet(name: name, description: description, sources: sources)
    }

    func updateQuizSet(id: String, name: String, description: String?, sources: [QuizSourceConfig]) async throws -> QuizSetResponse {
        try await obsidianStore.updateQuizSet(id: id, name: name, description: description, sources: sources)
    }

    func deleteQuizSet(id: String) async throws {
        try await obsidianStore.deleteQuizSet(id: id)
    }

    func startQuiz(sources: [QuizSourceConfig], questionCount: Int) async throws -> StartedQuizSession {
        try await obsidianStore.startQuiz(sources: sources, questionCount: questionCount)
    }

    func nextQuestion(sessionId: String) async throws -> NextQuizQuestionResponse {
        try await obsidianStore.nextQuestion(sessionId: sessionId)
    }

    func recordAnswer(_ request: RecordAnswerRequest) async throws -> RecordAnswerResponse {
        try await obsidianStore.recordAnswer(request)
    }

    func endQuiz(sessionId: String) async throws -> EndQuizSessionResponse {
        try await obsidianStore.endQuiz(sessionId: sessionId)
    }

    func addObsidianFolders(_ urls: [URL]) async throws -> [AccessibleDataSource] {
        try await obsidianStore.addFolders(urls)
    }

    func removeObsidianFolder(id: String) async throws {
        try await obsidianStore.removeFolder(id: id)
    }
}

private enum ObsidianQuizStoreError: LocalizedError, Equatable {
    case folderNotFound
    case folderUnavailable(String)
    case questionNotFound
    case unreadableMarkdown(String)

    var errorDescription: String? {
        switch self {
        case .folderNotFound:
            return "Folder not found. Select it again in Settings."
        case .folderUnavailable(let name):
            return "\(name) can't be opened. Select the Obsidian folder again."
        case .questionNotFound:
            return "Question file not found."
        case .unreadableMarkdown(let path):
            return "\(path) couldn't be read as Markdown."
        }
    }
}

private struct ObsidianFolderSource: Codable, Equatable, Identifiable {
    let id: String
    var name: String
    var bookmarkData: Data
    var lastKnownPath: String
    var lastKnownURLString: String?
    var createdAt: String
    var updatedAt: String
}

private struct ParsedMarkdown {
    var frontMatterLines: [String]
    var fields: [String: String]
    var body: String
}

struct ObsidianMarkdownQuizParts: Equatable {
    let prompt: String
    let answer: String

    static func parse(body: String) -> ObsidianMarkdownQuizParts? {
        let normalized = body
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
        let lines = normalized.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)

        guard let headingIndex = lines.firstIndex(where: { line in
            h1Content(in: line) != nil
        }), let prompt = h1Content(in: lines[headingIndex]) else {
            return nil
        }

        var answerLines = lines
        answerLines.remove(at: headingIndex)
        let answer = answerLines
            .joined(separator: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        guard !prompt.isEmpty, !answer.isEmpty else {
            return nil
        }

        return ObsidianMarkdownQuizParts(prompt: prompt, answer: answer)
    }

    private static func h1Content(in line: String) -> String? {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        guard trimmed.hasPrefix("#") else {
            return nil
        }

        var hashCount = 0
        var cursor = trimmed.startIndex
        while cursor < trimmed.endIndex, trimmed[cursor] == "#" {
            hashCount += 1
            cursor = trimmed.index(after: cursor)
        }

        guard hashCount == 1, cursor < trimmed.endIndex else {
            return nil
        }

        if trimmed[cursor].isWhitespace {
            cursor = trimmed.index(after: cursor)
        }

        return String(trimmed[cursor...])
            .replacingOccurrences(of: #"[\s#]+$"#, with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

private struct ObsidianQuestionStats: Equatable {
    var questionItemId: String?
    var answerCount: Int
    var correctCount: Int
    var wrongCount: Int
    var correctStreak: Int
    var wrongStreak: Int
    var lastAnsweredAt: Date?
    var lastCorrectAt: Date?
    var lastResult: String?
    var stage: String
    var suspended: Bool
    var stability: Double
    var ease: Double
    var difficulty: Double
    var lastIntervalSeconds: Int?
    var emaAccuracy: Double
    var avgResponseTimeMs: Int?
    var nextDueAt: Date?
    var updatedAt: Date

    static func fresh(now: Date = Date()) -> ObsidianQuestionStats {
        ObsidianQuestionStats(
            questionItemId: nil,
            answerCount: 0,
            correctCount: 0,
            wrongCount: 0,
            correctStreak: 0,
            wrongStreak: 0,
            lastAnsweredAt: nil,
            lastCorrectAt: nil,
            lastResult: nil,
            stage: "NEW",
            suspended: false,
            stability: 0.3,
            ease: 1.3,
            difficulty: 1.0,
            lastIntervalSeconds: nil,
            emaAccuracy: 0.5,
            avgResponseTimeMs: nil,
            nextDueAt: nil,
            updatedAt: now
        )
    }
}

private struct ObsidianQuestionCandidate {
    let source: ObsidianFolderSource
    let sourceConfig: QuizSourceConfig
    let rootURL: URL
    let fileURL: URL
    let relativePath: String
    let category: String?
    let question: QuizQuestion
    let stats: ObsidianQuestionStats
}

@MainActor
private final class ObsidianQuizStore {
    private enum Keys {
        static let folders = "obsidianFolderSources"
        static let quizSets = "obsidianQuizSets"
    }

    private enum Metadata {
        static let questionItemId = "obsidian_quiz_id"
        static let orderedKeys = [
            "answer_count",
            "correct_count",
            "wrong_count",
            "correct_streak",
            "wrong_streak",
            "last_answered_at",
            "last_correct_at",
            "last_result",
            "stage",
            "suspended",
            "stability",
            "ease",
            "difficulty",
            "last_interval_seconds",
            "ema_accuracy",
            "avg_response_time_ms",
            "next_due_at",
            "updated_at",
        ]

        static var ownedKeys: Set<String> {
            Set([questionItemId] + orderedKeys)
        }
    }

    private let defaults: UserDefaults
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()
    private var sessions: [String: [QuizQuestion]] = [:]

    init(preferences: AppPreferences) {
        self.defaults = preferences.storageDefaults
    }

    func listDataSources() async throws -> DataSourcesResponse {
        DataSourcesResponse(dataSources: loadFolders().map(accessibleDataSource))
    }

    func addFolders(_ urls: [URL]) async throws -> [AccessibleDataSource] {
        var folders = loadFolders()
        var added: [ObsidianFolderSource] = []
        let now = isoString(Date())

        for url in urls {
            let didStart = url.startAccessingSecurityScopedResource()
            defer {
                if didStart {
                    url.stopAccessingSecurityScopedResource()
                }
            }

            let bookmarkData = (try? url.bookmarkData(
                options: [],
                includingResourceValuesForKeys: nil,
                relativeTo: nil
            )) ?? Data()
            let name = folderDisplayName(url)
            let path = url.path
            let urlString = url.absoluteString

            if let index = folders.firstIndex(where: { $0.lastKnownURLString == urlString || $0.lastKnownPath == path }) {
                folders[index].name = name
                folders[index].bookmarkData = bookmarkData
                folders[index].lastKnownPath = path
                folders[index].lastKnownURLString = urlString
                folders[index].updatedAt = now
                added.append(folders[index])
            } else {
                let source = ObsidianFolderSource(
                    id: UUID().uuidString,
                    name: name,
                    bookmarkData: bookmarkData,
                    lastKnownPath: path,
                    lastKnownURLString: urlString,
                    createdAt: now,
                    updatedAt: now
                )
                folders.append(source)
                added.append(source)
            }
        }

        saveFolders(folders)
        return added.map(accessibleDataSource)
    }

    func removeFolder(id: String) async throws {
        var folders = loadFolders()
        folders.removeAll { $0.id == id }
        saveFolders(folders)

        let quizSets = loadQuizSets().compactMap { quizSet -> QuizSetSummary? in
            let sources = quizSet.sources.filter { $0.dataSourceId != id }
            guard !sources.isEmpty else {
                return nil
            }
            return QuizSetSummary(
                id: quizSet.id,
                name: quizSet.name,
                description: quizSet.description,
                updatedAt: isoString(Date()),
                sources: sources
            )
        }
        saveQuizSets(quizSets)
    }

    func getDataSourceSchema(id: String) async throws -> DataSourceSchemaResponse {
        guard let folder = loadFolders().first(where: { $0.id == id }) else {
            throw ObsidianQuizStoreError.folderNotFound
        }

        return DataSourceSchemaResponse(
            schema: DataSourceSchema(
                id: folder.id,
                title: folder.name,
                properties: []
            )
        )
    }

    func syncSources(_ sources: [QuizSourceConfig]) async throws -> SyncQuizSourcesResponse {
        let questions = try loadCandidates(sources: sources, ensureIdentifiers: true)
        return SyncQuizSourcesResponse(sourceCount: sources.count, questionCount: questions.count)
    }

    func listQuizSets() async throws -> QuizSetsResponse {
        QuizSetsResponse(quizSets: loadQuizSets())
    }

    func createQuizSet(name: String, description: String?, sources: [QuizSourceConfig]) async throws -> QuizSetResponse {
        var quizSets = loadQuizSets()
        let quizSet = QuizSetSummary(
            id: UUID().uuidString,
            name: name,
            description: description,
            updatedAt: isoString(Date()),
            sources: refreshedSourceSnapshots(sources)
        )
        quizSets.append(quizSet)
        saveQuizSets(quizSets)
        return QuizSetResponse(quizSet: quizSet)
    }

    func updateQuizSet(id: String, name: String, description: String?, sources: [QuizSourceConfig]) async throws -> QuizSetResponse {
        var quizSets = loadQuizSets()
        let updated = QuizSetSummary(
            id: id,
            name: name,
            description: description,
            updatedAt: isoString(Date()),
            sources: refreshedSourceSnapshots(sources)
        )

        if let index = quizSets.firstIndex(where: { $0.id == id }) {
            quizSets[index] = updated
        } else {
            quizSets.append(updated)
        }

        saveQuizSets(quizSets)
        return QuizSetResponse(quizSet: updated)
    }

    func deleteQuizSet(id: String) async throws {
        var quizSets = loadQuizSets()
        quizSets.removeAll { $0.id == id }
        saveQuizSets(quizSets)
    }

    func startQuiz(sources: [QuizSourceConfig], questionCount: Int) async throws -> StartedQuizSession {
        let candidates = try loadCandidates(sources: sources, ensureIdentifiers: true)
        let selected = selectQuestions(from: candidates, limit: questionCount)
        let sessionId = UUID().uuidString
        sessions[sessionId] = selected

        return StartedQuizSession(
            sessionId: sessionId,
            quizSetId: nil,
            plannedQuestionCount: selected.count,
            totalCandidates: candidates.count,
            sourceCount: sources.count,
            questions: selected
        )
    }

    func nextQuestion(sessionId: String) async throws -> NextQuizQuestionResponse {
        NextQuizQuestionResponse(question: nil)
    }

    func recordAnswer(_ request: RecordAnswerRequest) async throws -> RecordAnswerResponse {
        let located = try findQuestionFile(questionItemId: request.questionItemId)
        defer { located.stop() }
        let parsed = try parseMarkdownFile(located.fileURL)
        var stats = stats(from: parsed)
        stats.questionItemId = request.questionItemId
        let updated = updateStats(stats, isCorrect: request.isCorrect, responseTimeMs: request.responseTimeMs)
        try writeMetadata(to: located.fileURL, parsed: parsed, stats: updated)

        return RecordAnswerResponse(
            stats: QuestionStatsSummary(
                askedCount: updated.answerCount,
                accuracy: updated.answerCount > 0 ? Double(updated.correctCount) / Double(updated.answerCount) : 0,
                stage: updated.stage,
                nextDueAt: updated.nextDueAt.map(isoString)
            )
        )
    }

    func endQuiz(sessionId: String) async throws -> EndQuizSessionResponse {
        sessions.removeValue(forKey: sessionId)
        return EndQuizSessionResponse(
            session: EndedQuizSession(id: sessionId, endedAt: isoString(Date()))
        )
    }

    func resetDataSourceMetadata(dataSourceId: String) async throws {
        guard let source = loadFolders().first(where: { $0.id == dataSourceId }) else {
            throw ObsidianQuizStoreError.folderNotFound
        }

        let scoped = try resolve(source)
        defer { scoped.stop() }

        let files = markdownFiles(in: scoped.url)
        for fileURL in files {
            let parsed = try parseMarkdownFile(fileURL)
            var stats = ObsidianQuestionStats.fresh()
            stats.questionItemId = parsed.fields[Metadata.questionItemId] ?? UUID().uuidString
            try writeMetadata(to: fileURL, parsed: parsed, stats: stats)
        }
    }

    private func accessibleDataSource(_ source: ObsidianFolderSource) -> AccessibleDataSource {
        AccessibleDataSource(
            id: source.id,
            name: source.name,
            databaseId: nil,
            parentTitle: source.lastKnownPath,
            url: source.lastKnownPath
        )
    }

    private func refreshedSourceSnapshots(_ sources: [QuizSourceConfig]) -> [QuizSourceConfig] {
        let folders = Dictionary(uniqueKeysWithValues: loadFolders().map { ($0.id, $0) })
        return sources.compactMap { source in
            guard let folder = folders[source.dataSourceId] else {
                return nil
            }

            return QuizSourceConfig(
                dataSourceId: folder.id,
                dataSourceName: folder.name,
                dataSourceUrl: folder.lastKnownPath,
                mappings: [:]
            )
        }
    }

    private func loadFolders() -> [ObsidianFolderSource] {
        guard let data = defaults.data(forKey: Keys.folders),
              let folders = try? decoder.decode([ObsidianFolderSource].self, from: data) else {
            return []
        }

        return folders
    }

    private func saveFolders(_ folders: [ObsidianFolderSource]) {
        if let data = try? encoder.encode(folders) {
            defaults.set(data, forKey: Keys.folders)
        }
    }

    private func loadQuizSets() -> [QuizSetSummary] {
        guard let data = defaults.data(forKey: Keys.quizSets),
              let quizSets = try? decoder.decode([QuizSetSummary].self, from: data) else {
            return []
        }

        return quizSets
    }

    private func saveQuizSets(_ quizSets: [QuizSetSummary]) {
        if let data = try? encoder.encode(quizSets) {
            defaults.set(data, forKey: Keys.quizSets)
        }
    }

    private func folderDisplayName(_ url: URL) -> String {
        (try? url.resourceValues(forKeys: [.localizedNameKey]).localizedName) ?? url.lastPathComponent
    }

    private func resolve(_ source: ObsidianFolderSource) throws -> (url: URL, stop: () -> Void) {
        let url = try resolvedURL(for: source)
        let didStart = url.startAccessingSecurityScopedResource()
        var isDirectory: ObjCBool = false
        let exists = FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory)

        if exists && !isDirectory.boolValue {
            if didStart {
                url.stopAccessingSecurityScopedResource()
            }
            throw ObsidianQuizStoreError.folderUnavailable(source.name)
        }

        return (
            url,
            {
                if didStart {
                    url.stopAccessingSecurityScopedResource()
                }
            }
        )
    }

    private func resolvedURL(for source: ObsidianFolderSource) throws -> URL {
        var isStale = false
        if !source.bookmarkData.isEmpty,
           let bookmarkURL = try? URL(
                resolvingBookmarkData: source.bookmarkData,
                options: [],
                relativeTo: nil,
                bookmarkDataIsStale: &isStale
           ) {
            return bookmarkURL
        }

        if let urlString = source.lastKnownURLString,
           let url = URL(string: urlString) {
            return url
        }

        if !source.lastKnownPath.isEmpty {
            return URL(fileURLWithPath: source.lastKnownPath)
        }

        throw ObsidianQuizStoreError.folderUnavailable(source.name)
    }

    private func coordinatedRead<Result>(at url: URL, _ read: (URL) throws -> Result) throws -> Result {
        var coordinatorError: NSError?
        var result: Result?
        var readError: Error?

        NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coordinatorError) { coordinatedURL in
            do {
                result = try read(coordinatedURL)
            } catch {
                readError = error
            }
        }

        if let readError {
            throw readError
        }

        if let result {
            return result
        }

        if let coordinatorError {
            throw coordinatorError
        }

        throw ObsidianQuizStoreError.folderUnavailable(url.lastPathComponent)
    }

    private func coordinatedWrite(at url: URL, _ write: (URL) throws -> Void) throws {
        var coordinatorError: NSError?
        var writeError: Error?

        NSFileCoordinator().coordinate(writingItemAt: url, options: .forReplacing, error: &coordinatorError) { coordinatedURL in
            do {
                try write(coordinatedURL)
            } catch {
                writeError = error
            }
        }

        if let writeError {
            throw writeError
        }

        if let coordinatorError {
            throw coordinatorError
        }
    }

    private func loadCandidates(sources: [QuizSourceConfig], ensureIdentifiers: Bool) throws -> [ObsidianQuestionCandidate] {
        let foldersById = Dictionary(uniqueKeysWithValues: loadFolders().map { ($0.id, $0) })
        var candidates: [ObsidianQuestionCandidate] = []

        for sourceConfig in sources {
            guard let source = foldersById[sourceConfig.dataSourceId] else {
                continue
            }

            let scoped = try resolve(source)
            defer { scoped.stop() }

            for fileURL in markdownFiles(in: scoped.url) {
                var parsed = try parseMarkdownFile(fileURL)
                var questionStats = stats(from: parsed)

                if questionStats.questionItemId == nil, ensureIdentifiers {
                    questionStats.questionItemId = UUID().uuidString
                    try writeMetadata(to: fileURL, parsed: parsed, stats: questionStats)
                    parsed = try parseMarkdownFile(fileURL)
                    questionStats = stats(from: parsed)
                }

                guard questionStats.suspended == false else {
                    continue
                }

                let relativePath = relativePath(for: fileURL, rootURL: scoped.url)
                let questionItemId = questionStats.questionItemId ?? pathQuestionItemId(sourceId: source.id, relativePath: relativePath)
                guard let quizParts = ObsidianMarkdownQuizParts.parse(body: parsed.body) else {
                    continue
                }

                let question = QuizQuestion(
                    id: questionItemId,
                    questionItemId: questionItemId,
                    pageId: questionItemId,
                    dataSourceId: source.id,
                    dataSourceName: source.name,
                    prompt: [richText(quizParts.prompt)],
                    correctAnswer: [richText(quizParts.answer)],
                    explanation: [],
                    imageUrls: imageURLs(in: quizParts.answer, markdownURL: fileURL)
                )

                candidates.append(
                    ObsidianQuestionCandidate(
                        source: source,
                        sourceConfig: sourceConfig,
                        rootURL: scoped.url,
                        fileURL: fileURL,
                        relativePath: relativePath,
                        category: category(for: relativePath, fallback: source.name),
                        question: question,
                        stats: questionStats
                    )
                )
            }
        }

        return candidates
    }

    private func markdownFiles(in rootURL: URL) -> [URL] {
        (try? coordinatedRead(at: rootURL) { url in
            guard let enumerator = FileManager.default.enumerator(
                at: url,
                includingPropertiesForKeys: [.isRegularFileKey, .isHiddenKey],
                options: [.skipsHiddenFiles]
            ) else {
                return []
            }

            return enumerator.compactMap { item in
                guard let url = item as? URL,
                      url.pathExtension.lowercased() == "md",
                      (try? url.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true else {
                    return nil
                }

                return url.standardizedFileURL
            }
            .sorted { $0.path.localizedStandardCompare($1.path) == .orderedAscending }
        }) ?? []
    }

    private func parseMarkdownFile(_ fileURL: URL) throws -> ParsedMarkdown {
        guard let content = try? coordinatedRead(at: fileURL, { url in
            try String(contentsOf: url, encoding: .utf8)
        }) else {
            throw ObsidianQuizStoreError.unreadableMarkdown(fileURL.lastPathComponent)
        }

        return parseMarkdown(content)
    }

    private func parseMarkdown(_ content: String) -> ParsedMarkdown {
        let normalized = content.replacingOccurrences(of: "\r\n", with: "\n")
        guard normalized.hasPrefix("---\n") else {
            return ParsedMarkdown(frontMatterLines: [], fields: [:], body: normalized)
        }

        let yamlStart = normalized.index(normalized.startIndex, offsetBy: 4)
        guard let delimiter = normalized[yamlStart...].range(of: "\n---\n") else {
            return ParsedMarkdown(frontMatterLines: [], fields: [:], body: normalized)
        }

        let yaml = String(normalized[yamlStart..<delimiter.lowerBound])
        let body = String(normalized[delimiter.upperBound...])
        let lines = yaml.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        var fields: [String: String] = [:]

        for line in lines {
            guard let key = yamlKey(in: line), let colon = line.firstIndex(of: ":") else {
                continue
            }

            let rawValue = String(line[line.index(after: colon)...])
            fields[key] = cleanYAMLScalar(rawValue)
        }

        return ParsedMarkdown(frontMatterLines: lines, fields: fields, body: body)
    }

    private func writeMetadata(to fileURL: URL, parsed: ParsedMarkdown, stats: ObsidianQuestionStats) throws {
        let unknownLines = parsed.frontMatterLines.filter { line in
            guard let key = yamlKey(in: line) else {
                return !line.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            }

            return !Metadata.ownedKeys.contains(key)
        }

        var lines = unknownLines
        lines.append("\(Metadata.questionItemId): \(yamlString(stats.questionItemId ?? UUID().uuidString))")
        lines.append("answer_count: \(stats.answerCount)")
        lines.append("correct_count: \(stats.correctCount)")
        lines.append("wrong_count: \(stats.wrongCount)")
        lines.append("correct_streak: \(stats.correctStreak)")
        lines.append("wrong_streak: \(stats.wrongStreak)")

        if let lastAnsweredAt = stats.lastAnsweredAt {
            lines.append("last_answered_at: \(yamlString(isoString(lastAnsweredAt)))")
        }
        if let lastCorrectAt = stats.lastCorrectAt {
            lines.append("last_correct_at: \(yamlString(isoString(lastCorrectAt)))")
        }
        if let lastResult = stats.lastResult {
            lines.append("last_result: \(yamlString(lastResult))")
        }

        lines.append("stage: \(yamlString(stats.stage))")
        lines.append("suspended: \(stats.suspended ? "true" : "false")")
        lines.append("stability: \(decimalString(stats.stability))")
        lines.append("ease: \(decimalString(stats.ease))")
        lines.append("difficulty: \(decimalString(stats.difficulty))")

        if let lastIntervalSeconds = stats.lastIntervalSeconds {
            lines.append("last_interval_seconds: \(lastIntervalSeconds)")
        }

        lines.append("ema_accuracy: \(decimalString(stats.emaAccuracy))")

        if let avgResponseTimeMs = stats.avgResponseTimeMs {
            lines.append("avg_response_time_ms: \(avgResponseTimeMs)")
        }
        if let nextDueAt = stats.nextDueAt {
            lines.append("next_due_at: \(yamlString(isoString(nextDueAt)))")
        }

        lines.append("updated_at: \(yamlString(isoString(stats.updatedAt)))")

        let newContent = "---\n\(lines.joined(separator: "\n"))\n---\n\(parsed.body)"
        try coordinatedWrite(at: fileURL) { url in
            try newContent.write(to: url, atomically: true, encoding: .utf8)
        }
    }

    private func stats(from parsed: ParsedMarkdown) -> ObsidianQuestionStats {
        var stats = ObsidianQuestionStats.fresh()
        let fields = parsed.fields
        stats.questionItemId = fields[Metadata.questionItemId]
        stats.answerCount = intValue(fields["answer_count"]) ?? stats.answerCount
        stats.correctCount = intValue(fields["correct_count"]) ?? stats.correctCount
        stats.wrongCount = intValue(fields["wrong_count"]) ?? stats.wrongCount
        stats.correctStreak = intValue(fields["correct_streak"]) ?? stats.correctStreak
        stats.wrongStreak = intValue(fields["wrong_streak"]) ?? stats.wrongStreak
        stats.lastAnsweredAt = dateValue(fields["last_answered_at"])
        stats.lastCorrectAt = dateValue(fields["last_correct_at"])
        stats.lastResult = fields["last_result"]
        stats.stage = fields["stage"] ?? stats.stage
        stats.suspended = boolValue(fields["suspended"]) ?? stats.suspended
        stats.stability = doubleValue(fields["stability"]) ?? stats.stability
        stats.ease = doubleValue(fields["ease"]) ?? stats.ease
        stats.difficulty = doubleValue(fields["difficulty"]) ?? stats.difficulty
        stats.lastIntervalSeconds = intValue(fields["last_interval_seconds"])
        stats.emaAccuracy = doubleValue(fields["ema_accuracy"]) ?? stats.emaAccuracy
        stats.avgResponseTimeMs = intValue(fields["avg_response_time_ms"])
        stats.nextDueAt = dateValue(fields["next_due_at"])
        stats.updatedAt = dateValue(fields["updated_at"]) ?? stats.updatedAt
        return stats
    }

    private func selectQuestions(from candidates: [ObsidianQuestionCandidate], limit: Int) -> [QuizQuestion] {
        var remaining = candidates
        var selected: [QuizQuestion] = []
        var recentQuestionIds: [String] = []
        var lastCategory: String?

        while selected.count < limit && !remaining.isEmpty {
            guard let choice = selectNextCandidate(from: remaining, recentQuestionIds: recentQuestionIds, lastCategory: lastCategory) else {
                break
            }

            selected.append(choice.question)
            recentQuestionIds = appendRecentQuestionIds(recentQuestionIds, choice.question.questionItemId)
            lastCategory = choice.category
            remaining.removeAll { $0.question.questionItemId == choice.question.questionItemId }
        }

        return selected
    }

    private func selectNextCandidate(
        from candidates: [ObsidianQuestionCandidate],
        recentQuestionIds: [String],
        lastCategory: String?
    ) -> ObsidianQuestionCandidate? {
        let recentExclusion = Set(recentQuestionIds.suffix(5))
        let active = candidates.filter { !$0.stats.suspended }
        let unseen = active.filter { !recentExclusion.contains($0.question.questionItemId) }
        let pool = unseen.isEmpty ? active : unseen
        guard !pool.isEmpty else {
            return nil
        }

        let now = Date()
        let scored = pool.map { candidate -> (candidate: ObsidianQuestionCandidate, score: Double) in
            var score = calculateQuestionScore(stats: candidate.stats, now: now)
            if let category = candidate.category, let lastCategory, category == lastCategory {
                score *= 0.85
            }
            return (candidate, score)
        }

        let weighted = scored.map { entry in
            (candidate: entry.candidate, weight: pow(max(entry.score, 0), 1.2) + 0.02)
        }
        let total = weighted.reduce(0) { $0 + $1.weight }
        guard total > 0 else {
            return weighted.last?.candidate
        }

        var threshold = Double.random(in: 0..<total)
        for entry in weighted {
            threshold -= entry.weight
            if threshold <= 0 {
                return entry.candidate
            }
        }

        return weighted.last?.candidate
    }

    private func calculateQuestionScore(stats: ObsidianQuestionStats, now: Date) -> Double {
        max(
            0,
            0.4 * dueScore(stats: stats, now: now)
                + 0.2 * weakScore(stats: stats)
                + 0.15 * noveltyScore(stats: stats)
                + 0.15 * difficultyScore(stats: stats)
                - 0.25 * fatiguePenalty(stats: stats, now: now)
        )
    }

    private func dueScore(stats: ObsidianQuestionStats, now: Date) -> Double {
        if let nextDueAt = stats.nextDueAt {
            let overdueDays = max(0, now.timeIntervalSince(nextDueAt) / 86_400)
            return sigmoid(overdueDays / 2)
        }

        guard let lastAnsweredAt = stats.lastAnsweredAt else {
            return 1
        }

        let elapsedDays = now.timeIntervalSince(lastAnsweredAt) / 86_400
        let retention = exp(-elapsedDays / max(stats.stability, 0.1))
        return 1 - retention
    }

    private func weakScore(stats: ObsidianQuestionStats) -> Double {
        let longTerm = 1 - adjustedAccuracy(correctCount: stats.correctCount, answerCount: stats.answerCount)
        let shortTerm = 1 - stats.emaAccuracy
        let raw = 0.6 * shortTerm + 0.4 * longTerm
        let confidence = min(1, Double(stats.answerCount) / 10)
        return confidence * raw + (1 - confidence) * 0.5
    }

    private func noveltyScore(stats: ObsidianQuestionStats) -> Double {
        if stats.answerCount == 0 {
            return 1
        }

        if stats.answerCount < 3 {
            return 0.5
        }

        return 0
    }

    private func difficultyScore(stats: ObsidianQuestionStats) -> Double {
        let clipped = max(0.1, min(3.0, stats.difficulty))
        return (clipped - 0.1) / (3.0 - 0.1)
    }

    private func fatiguePenalty(stats: ObsidianQuestionStats, now: Date) -> Double {
        guard let lastAnsweredAt = stats.lastAnsweredAt else {
            return 0
        }

        let elapsedMinutes = now.timeIntervalSince(lastAnsweredAt) / 60
        return exp(-elapsedMinutes / 30)
    }

    private func updateStats(_ stats: ObsidianQuestionStats, isCorrect: Bool, responseTimeMs: Int?) -> ObsidianQuestionStats {
        let now = Date()
        var updated = stats
        let answerCount = stats.answerCount + 1
        let correctCount = stats.correctCount + (isCorrect ? 1 : 0)
        let wrongCount = stats.wrongCount + (isCorrect ? 0 : 1)
        let correctStreak = isCorrect ? stats.correctStreak + 1 : 0
        let wrongStreak = isCorrect ? 0 : stats.wrongStreak + 1
        let emaAccuracy = stats.emaAccuracy * 0.8 + (isCorrect ? 0.2 : 0)
        let timeFactor = responseTimeFactor(responseTimeMs)

        var stability = stats.stability
        var ease = stats.ease
        var difficulty = stats.difficulty
        let lastIntervalSeconds: Int
        let nextDueAt: Date

        if isCorrect && (stats.stage == "NEW" || stats.stage == "LEARNING") {
            lastIntervalSeconds = learningIntervalSeconds(correctCount: correctCount)
            nextDueAt = now.addingTimeInterval(TimeInterval(lastIntervalSeconds))
            stability = min(180, max(stats.stability, Double(lastIntervalSeconds) / 86_400))
            difficulty = max(0.1, difficulty - 0.03)
            ease = min(2.3, ease + 0.02)
        } else if isCorrect {
            let growth = 1 + min(0.15 + 0.05 * Double(correctStreak), 0.35)
            stability = min(180, stability * growth * ease * timeFactor)
            difficulty = max(0.1, difficulty - 0.03)
            ease = min(2.3, ease + 0.02)
            lastIntervalSeconds = max(600, Int((stability * 86_400).rounded()))
            nextDueAt = now.addingTimeInterval(TimeInterval(lastIntervalSeconds))
        } else {
            stability = max(0.3, stability * 0.5)
            difficulty = min(3.0, difficulty + 0.08)
            ease = max(1.1, ease - 0.04)
            lastIntervalSeconds = max(600, Int((stability * 0.3 * 86_400).rounded()))
            nextDueAt = now.addingTimeInterval(TimeInterval(lastIntervalSeconds))
        }

        let stage = isCorrect
            ? nextStageAfterCorrect(stats: stats, nextCorrectCount: correctCount, nextCorrectStreak: correctStreak, nextStability: stability)
            : nextStageAfterWrong(stats: stats)

        updated.answerCount = answerCount
        updated.correctCount = correctCount
        updated.wrongCount = wrongCount
        updated.correctStreak = correctStreak
        updated.wrongStreak = wrongStreak
        updated.lastAnsweredAt = now
        updated.lastCorrectAt = isCorrect ? now : stats.lastCorrectAt
        updated.lastResult = isCorrect ? "correct" : "wrong"
        updated.stage = stage
        updated.stability = stability
        updated.ease = ease
        updated.difficulty = difficulty
        updated.lastIntervalSeconds = lastIntervalSeconds
        updated.emaAccuracy = emaAccuracy
        updated.avgResponseTimeMs = averageResponseTime(previous: stats.avgResponseTimeMs, next: responseTimeMs)
        updated.nextDueAt = nextDueAt
        updated.updatedAt = now
        return updated
    }

    private func nextStageAfterCorrect(
        stats: ObsidianQuestionStats,
        nextCorrectCount: Int,
        nextCorrectStreak: Int,
        nextStability: Double
    ) -> String {
        let masteredCandidate = nextCorrectCount >= 10
            && adjustedAccuracy(correctCount: nextCorrectCount, answerCount: stats.answerCount + 1) >= 0.9
            && nextStability >= 30

        if masteredCandidate {
            return "MASTERED"
        }

        if stats.stage == "LAPSE" && nextCorrectStreak >= 2 {
            return "REVIEW"
        }

        if stats.stage == "NEW" {
            return "LEARNING"
        }

        if stats.stage == "LEARNING" && nextCorrectCount >= 2 {
            return "REVIEW"
        }

        return stats.stage
    }

    private func nextStageAfterWrong(stats: ObsidianQuestionStats) -> String {
        if stats.stage == "MASTERED" || stats.stage == "REVIEW" {
            return "LAPSE"
        }

        return "LEARNING"
    }

    private func responseTimeFactor(_ responseTimeMs: Int?) -> Double {
        guard let responseTimeMs, responseTimeMs > 5_000 else {
            return 1
        }

        if responseTimeMs <= 12_000 {
            return 0.8
        }

        return 0.6
    }

    private func averageResponseTime(previous: Int?, next: Int?) -> Int? {
        guard let next, next > 0 else {
            return previous
        }

        guard let previous, previous > 0 else {
            return next
        }

        return Int((Double(previous) * 0.7 + Double(next) * 0.3).rounded())
    }

    private func learningIntervalSeconds(correctCount: Int) -> Int {
        let intervals = [600, 86_400, 259_200, 604_800, 1_209_600]
        let index = max(0, min(intervals.count - 1, correctCount - 1))
        return intervals[index]
    }

    private func adjustedAccuracy(correctCount: Int, answerCount: Int) -> Double {
        (Double(correctCount) + 2) / (Double(answerCount) + 4)
    }

    private func sigmoid(_ value: Double) -> Double {
        1 / (1 + exp(-value))
    }

    private func appendRecentQuestionIds(_ recentQuestionIds: [String], _ nextQuestionId: String) -> [String] {
        let next = recentQuestionIds.filter { $0 != nextQuestionId } + [nextQuestionId]
        return Array(next.suffix(5))
    }

    private func findQuestionFile(questionItemId: String) throws -> (source: ObsidianFolderSource, rootURL: URL, fileURL: URL, stop: () -> Void) {
        let folders = loadFolders()

        if let pathIdentity = pathIdentity(from: questionItemId),
           let source = folders.first(where: { $0.id == pathIdentity.sourceId }) {
            let scoped = try resolve(source)
            let fileURL = scoped.url.appendingPathComponent(pathIdentity.relativePath)
            if FileManager.default.fileExists(atPath: fileURL.path) {
                return (source, scoped.url, fileURL, scoped.stop)
            }
            scoped.stop()
        }

        for source in folders {
            let scoped = try resolve(source)

            for fileURL in markdownFiles(in: scoped.url) {
                let parsed = try parseMarkdownFile(fileURL)
                let stats = stats(from: parsed)
                let relativePath = relativePath(for: fileURL, rootURL: scoped.url)
                if stats.questionItemId == questionItemId || pathQuestionItemId(sourceId: source.id, relativePath: relativePath) == questionItemId {
                    return (source, scoped.url, fileURL, scoped.stop)
                }
            }

            scoped.stop()
        }

        throw ObsidianQuizStoreError.questionNotFound
    }

    private func relativePath(for fileURL: URL, rootURL: URL) -> String {
        let rootPath = rootURL.standardizedFileURL.path
        let filePath = fileURL.standardizedFileURL.path

        if filePath.hasPrefix(rootPath + "/") {
            return String(filePath.dropFirst(rootPath.count + 1))
        }

        return fileURL.lastPathComponent
    }

    private func pathQuestionItemId(sourceId: String, relativePath: String) -> String {
        "\(sourceId)::\(relativePath)"
    }

    private func pathIdentity(from questionItemId: String) -> (sourceId: String, relativePath: String)? {
        guard let range = questionItemId.range(of: "::") else {
            return nil
        }

        return (
            String(questionItemId[..<range.lowerBound]),
            String(questionItemId[range.upperBound...])
        )
    }

    private func category(for relativePath: String, fallback: String) -> String {
        let components = relativePath.split(separator: "/").map(String.init)
        if components.count > 1 {
            return components.dropLast().joined(separator: "/")
        }

        return fallback
    }

    private func imageURLs(in markdown: String, markdownURL: URL) -> [String] {
        let result = regexCaptures(pattern: #"!\[[^\]]*\]\(([^)]+)\)|!\[\[([^\]]+)\]\]"#, in: markdown)

        return result.compactMap { raw in
            var value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            if let pipe = value.firstIndex(of: "|") {
                value = String(value[..<pipe])
            }
            value = value.trimmingCharacters(in: CharacterSet(charactersIn: "\"'"))

            if value.hasPrefix("http://") || value.hasPrefix("https://") || value.hasPrefix("file://") {
                return value
            }

            let decoded = value.removingPercentEncoding ?? value
            return markdownURL.deletingLastPathComponent().appendingPathComponent(decoded).absoluteString
        }
    }

    private func regexCaptures(pattern: String, in text: String) -> [String] {
        guard let regex = try? NSRegularExpression(pattern: pattern) else {
            return []
        }

        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        return regex.matches(in: text, range: range).compactMap { match in
            for index in 1..<match.numberOfRanges {
                let nsRange = match.range(at: index)
                guard nsRange.location != NSNotFound,
                      let captureRange = Range(nsRange, in: text) else {
                    continue
                }

                return String(text[captureRange])
            }
            return nil
        }
    }

    private func richText(_ value: String) -> QuizRichTextItem {
        QuizRichTextItem(
            plainText: value,
            type: "text",
            text: QuizRichTextItem.TextValue(content: value),
            equation: nil
        )
    }

    private func yamlKey(in line: String) -> String? {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.hasPrefix("#"), let colon = trimmed.firstIndex(of: ":") else {
            return nil
        }

        return String(trimmed[..<colon]).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func cleanYAMLScalar(_ value: String) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed == "null" || trimmed == "~" {
            return ""
        }

        if (trimmed.hasPrefix("\"") && trimmed.hasSuffix("\"")) || (trimmed.hasPrefix("'") && trimmed.hasSuffix("'")) {
            return String(trimmed.dropFirst().dropLast())
                .replacingOccurrences(of: "\\\"", with: "\"")
                .replacingOccurrences(of: "\\\\", with: "\\")
        }

        return trimmed
    }

    private func yamlString(_ value: String) -> String {
        let escaped = value
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
        return "\"\(escaped)\""
    }

    private func intValue(_ value: String?) -> Int? {
        guard let value, !value.isEmpty else {
            return nil
        }

        return Int(value)
    }

    private func doubleValue(_ value: String?) -> Double? {
        guard let value, !value.isEmpty else {
            return nil
        }

        return Double(value)
    }

    private func boolValue(_ value: String?) -> Bool? {
        guard let value else {
            return nil
        }

        switch value.lowercased() {
        case "true", "yes", "1":
            return true
        case "false", "no", "0":
            return false
        default:
            return nil
        }
    }

    private func dateValue(_ value: String?) -> Date? {
        guard let value, !value.isEmpty else {
            return nil
        }

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) {
            return date
        }

        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value)
    }

    private func isoString(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }

    private func decimalString(_ value: Double) -> String {
        let text = String(format: "%.4f", value)
        return text
            .replacingOccurrences(of: #"0+$"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"\.$"#, with: "", options: .regularExpression)
    }
}
