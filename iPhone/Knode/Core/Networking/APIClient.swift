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
    private let obsidianStore: KnodeStore

    init(
        preferences: AppPreferences = .shared,
        session: URLSession = APIClient.makeDefaultSession()
    ) {
        self.preferences = preferences
        self.session = session
        self.encoder = JSONEncoder()
        self.decoder = JSONDecoder()
        self.obsidianStore = KnodeStore(preferences: preferences)
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

    func restoreAnswerMetadata(_ token: QuizAnswerUndoToken) async throws {
        try await obsidianStore.restoreAnswerMetadata(token)
    }

    func endQuiz(sessionId: String) async throws -> EndQuizSessionResponse {
        try await obsidianStore.endQuiz(sessionId: sessionId)
    }

    func addObsidianFolders(_ urls: [URL]) async throws -> [AccessibleDataSource] {
        try await obsidianStore.addFolders(urls)
    }

    func renameObsidianFolder(id: String, name: String) async throws -> AccessibleDataSource {
        try await obsidianStore.renameFolder(id: id, name: name)
    }

    func updateObsidianFolder(id: String, name: String, url: URL?) async throws -> AccessibleDataSource {
        try await obsidianStore.updateFolder(id: id, name: name, url: url)
    }

    func removeObsidianFolder(id: String) async throws {
        try await obsidianStore.removeFolder(id: id)
    }
}

private enum KnodeStoreError: LocalizedError, Equatable {
    case folderNotFound
    case folderUnavailable(String)
    case folderAlreadyConfigured
    case invalidDataSourceName
    case questionNotFound
    case unreadableMarkdown(String)

    var errorDescription: String? {
        switch self {
        case .folderNotFound:
            return "Folder not found. Select it again in Settings."
        case .folderUnavailable(let name):
            return "\(name) can't be opened. Select the Obsidian folder again."
        case .folderAlreadyConfigured:
            return "That folder is already configured as another DB."
        case .invalidDataSourceName:
            return "Enter a DB name."
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

    static func parse(body: String, filenamePrompt: String) -> ObsidianMarkdownQuizParts? {
        let normalized = body
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
        let lines = normalized.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)

        let basePrompt = filenamePrompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !basePrompt.isEmpty else {
            return nil
        }

        guard let separatorIndex = lines.firstIndex(where: isQuestionAnswerSeparator) else {
            let answer = normalized.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !answer.isEmpty else {
                return nil
            }
            return ObsidianMarkdownQuizParts(prompt: basePrompt, answer: answer)
        }

        let promptBody = lines[..<separatorIndex]
            .joined(separator: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let answer = lines[lines.index(after: separatorIndex)...]
            .joined(separator: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        guard !answer.isEmpty else {
            return nil
        }

        let prompt = [basePrompt, promptBody]
            .filter { !$0.isEmpty }
            .joined(separator: "\n\n")
        return ObsidianMarkdownQuizParts(prompt: prompt, answer: answer)
    }

    private static func isQuestionAnswerSeparator(_ line: String) -> Bool {
        line.trimmingCharacters(in: .whitespaces) == "---"
    }
}

private struct ObsidianQuestionStats: Equatable {
    var status: ObsidianQuestionStatus

    static func fresh() -> ObsidianQuestionStats {
        ObsidianQuestionStats(status: .unknown)
    }
}

private enum ObsidianQuestionStatus: String, CaseIterable {
    case unknown
    case familiar
    case recognized
    case mastered

    var rank: Int {
        switch self {
        case .unknown:
            return 0
        case .familiar:
            return 1
        case .recognized:
            return 2
        case .mastered:
            return 3
        }
    }

    var stageName: String {
        rawValue
    }

    func advancedAfterCorrect() -> ObsidianQuestionStatus {
        switch self {
        case .unknown:
            return .familiar
        case .familiar:
            return .recognized
        case .recognized, .mastered:
            return .mastered
        }
    }

    func demotedAfterWrong() -> ObsidianQuestionStatus {
        switch self {
        case .unknown, .familiar:
            return .unknown
        case .recognized:
            return .familiar
        case .mastered:
            return .recognized
        }
    }

    static func parse(_ value: String?) -> ObsidianQuestionStatus {
        guard let value else {
            return .unknown
        }

        let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        switch normalized {
        case "unknown", "new", "learning", "lapse":
            return .unknown
        case "familiar":
            return .familiar
        case "recognized", "review":
            return .recognized
        case "mastered":
            return .mastered
        default:
            return .unknown
        }
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

struct ObsidianOpenTarget: Equatable {
    let vaultName: String
    let filePath: String
}

enum ObsidianURI {
    static func openFile(target: ObsidianOpenTarget) -> String? {
        guard let vault = percentEncodeQueryValue(target.vaultName),
              let file = percentEncodeQueryValue(target.filePath) else {
            return nil
        }

        return "obsidian://open?vault=\(vault)&file=\(file)"
    }

    static func openTarget(
        fileURL: URL,
        selectedRootURL: URL,
        selectedFolderName: String,
        selectedRelativePath: String
    ) -> ObsidianOpenTarget {
        if let target = nearestAccessibleVaultTarget(for: fileURL) {
            return target
        }

        let components = fileURL.standardizedFileURL.pathComponents

        if let target = iCloudObsidianTarget(from: components) {
            return target
        }

        if let target = targetAfterMarker("Obsidian", in: components) {
            return target
        }

        let selectedRootName = selectedRootURL.standardizedFileURL.lastPathComponent
        let vaultName = selectedRootName.isEmpty ? selectedFolderName : selectedRootName
        return ObsidianOpenTarget(vaultName: vaultName, filePath: selectedRelativePath)
    }

    private static func percentEncodeQueryValue(_ value: String) -> String? {
        var allowed = CharacterSet.urlQueryAllowed
        allowed.remove(charactersIn: ":#[]@!$&'()*+,;=/?")
        return value.addingPercentEncoding(withAllowedCharacters: allowed)
    }

    private static func nearestAccessibleVaultTarget(for fileURL: URL) -> ObsidianOpenTarget? {
        var candidate = fileURL.standardizedFileURL.deletingLastPathComponent()

        while !candidate.path.isEmpty, candidate.path != "/" {
            if FileManager.default.fileExists(atPath: candidate.appendingPathComponent(".obsidian", isDirectory: true).path) {
                return ObsidianOpenTarget(
                    vaultName: candidate.lastPathComponent,
                    filePath: relativePath(for: fileURL, rootURL: candidate)
                )
            }

            let parent = candidate.deletingLastPathComponent()
            if parent.path == candidate.path {
                break
            }
            candidate = parent
        }

        return nil
    }

    private static func iCloudObsidianTarget(from components: [String]) -> ObsidianOpenTarget? {
        guard let containerIndex = components.lastIndex(where: { $0 == "iCloud~md~obsidian" }),
              containerIndex + 1 < components.count,
              let documentsIndex = components[(containerIndex + 1)...].firstIndex(of: "Documents") else {
            return nil
        }

        return targetAfterIndex(documentsIndex, in: components)
    }

    private static func targetAfterMarker(_ marker: String, in components: [String]) -> ObsidianOpenTarget? {
        guard let markerIndex = components.lastIndex(of: marker) else {
            return nil
        }

        return targetAfterIndex(markerIndex, in: components)
    }

    private static func targetAfterIndex(_ index: Int, in components: [String]) -> ObsidianOpenTarget? {
        let vaultIndex = index + 1
        let firstFileComponentIndex = index + 2
        guard components.indices.contains(vaultIndex),
              components.indices.contains(firstFileComponentIndex) else {
            return nil
        }

        let filePath = components[firstFileComponentIndex...].joined(separator: "/")
        guard !components[vaultIndex].isEmpty, !filePath.isEmpty else {
            return nil
        }

        return ObsidianOpenTarget(vaultName: components[vaultIndex], filePath: filePath)
    }

    private static func relativePath(for fileURL: URL, rootURL: URL) -> String {
        let rootPath = rootURL.standardizedFileURL.path
        let filePath = fileURL.standardizedFileURL.path

        if filePath.hasPrefix(rootPath + "/") {
            return String(filePath.dropFirst(rootPath.count + 1))
        }

        return fileURL.lastPathComponent
    }
}

@MainActor
private final class KnodeStore {
    private enum Keys {
        static let folders = "obsidianFolderSources"
        static let quizSets = "obsidianQuizSets"
    }

    private enum Metadata {
        static let status = "status"

        static var ownedKeys: Set<String> {
            [status]
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
            let defaultName = folderDisplayName(url)
            let path = url.path
            let urlString = url.absoluteString

            if let index = folders.firstIndex(where: { $0.lastKnownURLString == urlString || $0.lastKnownPath == path }) {
                if folders[index].name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    folders[index].name = defaultName
                }
                folders[index].bookmarkData = bookmarkData
                folders[index].lastKnownPath = path
                folders[index].lastKnownURLString = urlString
                folders[index].updatedAt = now
                added.append(folders[index])
            } else {
                let source = ObsidianFolderSource(
                    id: UUID().uuidString,
                    name: defaultName,
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

    func renameFolder(id: String, name: String) async throws -> AccessibleDataSource {
        try await updateFolder(id: id, name: name, url: nil)
    }

    func updateFolder(id: String, name: String, url: URL?) async throws -> AccessibleDataSource {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else {
            throw KnodeStoreError.invalidDataSourceName
        }

        var folders = loadFolders()
        guard let index = folders.firstIndex(where: { $0.id == id }) else {
            throw KnodeStoreError.folderNotFound
        }

        let now = isoString(Date())
        folders[index].name = trimmedName

        if let url {
            let didStart = url.startAccessingSecurityScopedResource()
            defer {
                if didStart {
                    url.stopAccessingSecurityScopedResource()
                }
            }

            let path = url.path
            let urlString = url.absoluteString
            if folders.contains(where: { $0.id != id && ($0.lastKnownPath == path || $0.lastKnownURLString == urlString) }) {
                throw KnodeStoreError.folderAlreadyConfigured
            }

            folders[index].bookmarkData = (try? url.bookmarkData(
                options: [],
                includingResourceValuesForKeys: nil,
                relativeTo: nil
            )) ?? Data()
            folders[index].lastKnownPath = path
            folders[index].lastKnownURLString = urlString
        }

        folders[index].updatedAt = now
        let updated = folders[index]

        saveFolders(folders)
        updateQuizSetSnapshots(for: updated, updatedAt: now)
        return accessibleDataSource(updated)
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
            throw KnodeStoreError.folderNotFound
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
        let questions = try loadCandidates(sources: sources)
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
        let candidates = try loadCandidates(sources: sources)
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
        let stats = stats(from: parsed)
        let undoToken = answerUndoToken(questionItemId: request.questionItemId, stats: stats)
        let updated = updateStats(stats, isCorrect: request.isCorrect)
        try writeMetadata(to: located.fileURL, parsed: parsed, stats: updated)

        return RecordAnswerResponse(
            stats: QuestionStatsSummary(
                askedCount: 0,
                accuracy: request.isCorrect ? 1 : 0,
                stage: updated.status.stageName,
                nextDueAt: nil
            ),
            undoToken: undoToken
        )
    }

    func restoreAnswerMetadata(_ token: QuizAnswerUndoToken) async throws {
        let located = try findQuestionFile(questionItemId: token.questionItemId)
        defer { located.stop() }
        let parsed = try parseMarkdownFile(located.fileURL)
        try writeMetadata(to: located.fileURL, parsed: parsed, stats: stats(from: token))
    }

    func endQuiz(sessionId: String) async throws -> EndQuizSessionResponse {
        sessions.removeValue(forKey: sessionId)
        return EndQuizSessionResponse(
            session: EndedQuizSession(id: sessionId, endedAt: isoString(Date()))
        )
    }

    func resetDataSourceMetadata(dataSourceId: String) async throws {
        guard let source = loadFolders().first(where: { $0.id == dataSourceId }) else {
            throw KnodeStoreError.folderNotFound
        }

        let scoped = try resolve(source)
        defer { scoped.stop() }

        let files = questionMarkdownFiles(in: scoped.url)
        for fileURL in files {
            let parsed = try parseMarkdownFile(fileURL)
            try writeMetadata(to: fileURL, parsed: parsed, stats: .fresh())
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

    private func updateQuizSetSnapshots(for folder: ObsidianFolderSource, updatedAt: String) {
        let quizSets = loadQuizSets().map { quizSet in
            var didUpdate = false
            let sources = quizSet.sources.map { source in
                guard source.dataSourceId == folder.id else {
                    return source
                }

                didUpdate = true
                return QuizSourceConfig(
                    dataSourceId: folder.id,
                    dataSourceName: folder.name,
                    dataSourceUrl: folder.lastKnownPath,
                    mappings: source.mappings
                )
            }

            guard didUpdate else {
                return quizSet
            }

            return QuizSetSummary(
                id: quizSet.id,
                name: quizSet.name,
                description: quizSet.description,
                updatedAt: updatedAt,
                sources: sources
            )
        }

        saveQuizSets(quizSets)
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
            throw KnodeStoreError.folderUnavailable(source.name)
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

        throw KnodeStoreError.folderUnavailable(source.name)
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

        throw KnodeStoreError.folderUnavailable(url.lastPathComponent)
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

    private func loadCandidates(sources: [QuizSourceConfig]) throws -> [ObsidianQuestionCandidate] {
        let foldersById = Dictionary(uniqueKeysWithValues: loadFolders().map { ($0.id, $0) })
        var candidates: [ObsidianQuestionCandidate] = []

        for sourceConfig in sources {
            guard let source = foldersById[sourceConfig.dataSourceId] else {
                continue
            }

            let scoped = try resolve(source)
            defer { scoped.stop() }

            for fileURL in questionMarkdownFiles(in: scoped.url) {
                let parsed = try parseMarkdownFile(fileURL)
                guard !hasIdeaFrontMatterTag(in: parsed) else {
                    continue
                }

                let questionStats = stats(from: parsed)
                let relativePath = relativePath(for: fileURL, rootURL: scoped.url)
                let questionItemId = pathQuestionItemId(sourceId: source.id, relativePath: relativePath)
                let filenamePrompt = fileURL.deletingPathExtension().lastPathComponent
                guard let quizParts = ObsidianMarkdownQuizParts.parse(body: parsed.body, filenamePrompt: filenamePrompt) else {
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
                    promptImageUrls: imageURLs(in: quizParts.prompt, markdownURL: fileURL, rootURL: scoped.url),
                    imageUrls: imageURLs(in: quizParts.answer, markdownURL: fileURL, rootURL: scoped.url),
                    obsidianOpenURL: obsidianOpenURL(
                        source: source,
                        rootURL: scoped.url,
                        fileURL: fileURL,
                        relativePath: relativePath
                    )
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

    private func questionMarkdownFiles(in rootURL: URL) -> [URL] {
        (try? coordinatedRead(at: rootURL) { url in
            guard let enumerator = FileManager.default.enumerator(
                at: url,
                includingPropertiesForKeys: [.isRegularFileKey, .isHiddenKey],
                options: [.skipsHiddenFiles, .skipsPackageDescendants]
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
            throw KnodeStoreError.unreadableMarkdown(fileURL.lastPathComponent)
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

    private func hasIdeaFrontMatterTag(in parsed: ParsedMarkdown) -> Bool {
        let lines = parsed.frontMatterLines

        for (index, line) in lines.enumerated() {
            guard yamlKey(in: line)?.lowercased() == "tags",
                  let colon = line.firstIndex(of: ":") else {
                continue
            }

            let rawValue = String(line[line.index(after: colon)...])
            if !cleanYAMLScalar(rawValue).isEmpty {
                return frontMatterTagsContainIdea(rawValue)
            }

            for nestedLine in lines.dropFirst(index + 1) {
                if yamlKey(in: nestedLine) != nil {
                    break
                }

                let trimmed = nestedLine.trimmingCharacters(in: .whitespacesAndNewlines)
                guard trimmed.hasPrefix("-") else {
                    continue
                }

                let item = String(trimmed.dropFirst())
                if frontMatterTagsContainIdea(item) {
                    return true
                }
            }
        }

        return false
    }

    private func frontMatterTagsContainIdea(_ rawValue: String) -> Bool {
        let cleaned = cleanYAMLScalar(rawValue)
        guard !cleaned.isEmpty else {
            return false
        }

        let listValue: String
        if cleaned.hasPrefix("[") && cleaned.hasSuffix("]") {
            listValue = String(cleaned.dropFirst().dropLast())
        } else {
            listValue = cleaned
        }

        return listValue
            .split(separator: ",")
            .map { cleanYAMLScalar(String($0)) }
            .contains { value in
                value
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                    .trimmingCharacters(in: CharacterSet(charactersIn: "\"'"))
                    .trimmingCharacters(in: CharacterSet(charactersIn: "#"))
                    .lowercased() == "idea"
            }
    }

    private func writeMetadata(to fileURL: URL, parsed: ParsedMarkdown, stats: ObsidianQuestionStats) throws {
        let unknownLines = parsed.frontMatterLines.filter { line in
            guard let key = yamlKey(in: line) else {
                return !line.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            }

            return !Metadata.ownedKeys.contains(key)
        }

        var lines = unknownLines
        lines.append("\(Metadata.status): \(stats.status.rawValue)")

        let newContent = "---\n\(lines.joined(separator: "\n"))\n---\n\(parsed.body)"
        try coordinatedWrite(at: fileURL) { url in
            try newContent.write(to: url, atomically: true, encoding: .utf8)
        }
    }

    private func stats(from parsed: ParsedMarkdown) -> ObsidianQuestionStats {
        let fields = parsed.fields
        return ObsidianQuestionStats(status: ObsidianQuestionStatus.parse(fields[Metadata.status] ?? fields["stage"]))
    }

    private func answerUndoToken(questionItemId: String, stats: ObsidianQuestionStats) -> QuizAnswerUndoToken {
        QuizAnswerUndoToken(
            questionItemId: questionItemId,
            answerCount: 0,
            correctCount: 0,
            wrongCount: 0,
            correctStreak: 0,
            wrongStreak: 0,
            lastAnsweredAt: nil,
            lastCorrectAt: nil,
            lastResult: nil,
            stage: stats.status.rawValue,
            suspended: false,
            stability: 0,
            ease: 0,
            difficulty: 0,
            lastIntervalSeconds: nil,
            emaAccuracy: 0,
            avgResponseTimeMs: nil,
            nextDueAt: nil,
            updatedAt: isoString(Date())
        )
    }

    private func stats(from token: QuizAnswerUndoToken) -> ObsidianQuestionStats {
        ObsidianQuestionStats(status: ObsidianQuestionStatus.parse(token.stage))
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
        let unseen = candidates.filter { !recentExclusion.contains($0.question.questionItemId) }
        let pool = unseen.isEmpty ? candidates : unseen
        guard !pool.isEmpty else {
            return nil
        }

        let lowestRank = pool.map(\.stats.status.rank).min() ?? ObsidianQuestionStatus.unknown.rank
        let weakest = pool.filter { $0.stats.status.rank == lowestRank }
        let varied = weakest.filter { candidate in
            guard let category = candidate.category, let lastCategory else {
                return true
            }

            return category != lastCategory
        }
        let finalPool = varied.isEmpty ? weakest : varied
        return finalPool.randomElement()
    }

    private func updateStats(_ stats: ObsidianQuestionStats, isCorrect: Bool) -> ObsidianQuestionStats {
        ObsidianQuestionStats(status: isCorrect ? stats.status.advancedAfterCorrect() : stats.status.demotedAfterWrong())
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

            for fileURL in questionMarkdownFiles(in: scoped.url) {
                let relativePath = relativePath(for: fileURL, rootURL: scoped.url)
                if pathQuestionItemId(sourceId: source.id, relativePath: relativePath) == questionItemId {
                    return (source, scoped.url, fileURL, scoped.stop)
                }
            }

            scoped.stop()
        }

        throw KnodeStoreError.questionNotFound
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

    private func imageURLs(in markdown: String, markdownURL: URL, rootURL: URL) -> [String] {
        let result = regexCaptures(pattern: #"!\[[^\]]*\]\(([^)]+)\)|!\[\[([^\]]+)\]\]"#, in: markdown)

        return result.compactMap { raw in
            var value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            if let pipe = value.firstIndex(of: "|") {
                value = String(value[..<pipe])
            }
            value = value.trimmingCharacters(in: CharacterSet(charactersIn: "\"'"))

            if value.hasPrefix("http://") || value.hasPrefix("https://") {
                return value
            }

            if value.hasPrefix("file://"),
               let fileURL = URL(string: value) {
                return displayableLocalImageURL(fileURL).absoluteString
            }

            let decoded = value.removingPercentEncoding ?? value
            if decoded.hasPrefix("/") {
                return displayableLocalImageURL(URL(fileURLWithPath: decoded)).absoluteString
            }

            let relativeURL = markdownURL.deletingLastPathComponent().appendingPathComponent(decoded).standardizedFileURL
            if FileManager.default.fileExists(atPath: relativeURL.path) {
                return displayableLocalImageURL(relativeURL).absoluteString
            }

            if let found = findImage(named: (decoded as NSString).lastPathComponent, under: rootURL) {
                return displayableLocalImageURL(found).absoluteString
            }

            return relativeURL.absoluteString
        }
    }

    private func obsidianOpenURL(
        source: ObsidianFolderSource,
        rootURL: URL,
        fileURL: URL,
        relativePath: String
    ) -> String? {
        let target = ObsidianURI.openTarget(
            fileURL: fileURL,
            selectedRootURL: rootURL,
            selectedFolderName: source.name,
            selectedRelativePath: relativePath
        )
        return ObsidianURI.openFile(target: target)
    }

    private func displayableLocalImageURL(_ fileURL: URL) -> URL {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("KnodeImages", isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let destination = directory
                .appendingPathComponent(UUID().uuidString)
                .appendingPathExtension(fileURL.pathExtension)
            if FileManager.default.fileExists(atPath: destination.path) {
                try FileManager.default.removeItem(at: destination)
            }
            try FileManager.default.copyItem(at: fileURL, to: destination)
            return destination
        } catch {
            return fileURL
        }
    }

    private func findImage(named filename: String, under rootURL: URL) -> URL? {
        guard !filename.isEmpty,
              let enumerator = FileManager.default.enumerator(
                at: rootURL,
                includingPropertiesForKeys: [.isRegularFileKey, .isHiddenKey],
                options: [.skipsHiddenFiles]
              ) else {
            return nil
        }

        for item in enumerator {
            guard let url = item as? URL,
                  url.lastPathComponent == filename,
                  (try? url.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true else {
                continue
            }
            return url.standardizedFileURL
        }

        return nil
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
