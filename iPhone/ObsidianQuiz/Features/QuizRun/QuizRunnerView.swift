import SwiftUI

struct QuizRunnerView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.openURL) private var openURL

    let quizSet: QuizSetSummary
    let initialQuestionCount: Int?
    let startsImmediately: Bool
    let onClose: (() -> Void)?

    @State private var questionCount: Int
    @State private var customQuestionCount = ""
    @State private var session: StartedQuizSession?
    @State private var currentIndex = 0
    @State private var hasRevealedAnswer = false
    @State private var correctCount = 0
    @State private var questionShownAt: Date?
    @State private var isStarting = false
    @State private var isSubmitting = false
    @State private var isRestoringPreviousAnswer = false
    @State private var isFinished = false
    @State private var didEndSession = false
    @State private var didAutoStart = false
    @State private var nextQuestionTask: Task<Void, Never>?
    @State private var nextQuestionIndex: Int?
    @State private var answerHistory: [Int: AnswerHistoryEntry] = [:]
    @State private var errorMessage: String?

    private let presetCounts = [5, 10, 20, 50, 100]

    init(
        quizSet: QuizSetSummary,
        initialQuestionCount: Int? = nil,
        startsImmediately: Bool = false,
        onClose: (() -> Void)? = nil
    ) {
        self.quizSet = quizSet
        self.initialQuestionCount = initialQuestionCount
        self.startsImmediately = startsImmediately
        self.onClose = onClose
        _questionCount = State(initialValue: initialQuestionCount ?? 5)
    }

    private var currentQuestion: QuizQuestion? {
        guard let session, currentIndex < session.questions.count else {
            return nil
        }
        return session.questions[currentIndex]
    }

    private var backTargetIndex: Int? {
        guard session != nil else {
            return nil
        }

        let candidateIndex = isFinished ? currentIndex : currentIndex - 1
        guard candidateIndex >= 0,
              answerHistory[candidateIndex]?.undoToken != nil else {
            return nil
        }
        return candidateIndex
    }

    private var canGoBackOneQuestion: Bool {
        backTargetIndex != nil && !isSubmitting && !isRestoringPreviousAnswer
    }

    var body: some View {
        Group {
            if let session, isFinished {
                resultView(session: session)
            } else if session != nil {
                quizStage
            } else if startsImmediately {
                LoadingStateView(message: "Preparing quiz...")
            } else {
                startView
            }
        }
        .navigationTitle(quizSet.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if session != nil {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        Task { await goBackOneQuestion() }
                    } label: {
                        Label("Previous Question", systemImage: "chevron.left")
                    }
                    .disabled(!canGoBackOneQuestion)
                }
            }

            ToolbarItemGroup(placement: .topBarTrailing) {
                if let onClose {
                    Button {
                        onClose()
                    } label: {
                        Label("Choose Set", systemImage: "rectangle.stack")
                    }
                }

                Button {
                    openCurrentQuestionInObsidian()
                } label: {
                    Label("Open in Obsidian", systemImage: "doc.text")
                }
                .disabled(currentQuestion?.obsidianOpenURL == nil)
            }
        }
        .alert("Error", isPresented: Binding(
            get: { errorMessage != nil },
            set: { if !$0 { errorMessage = nil } }
        )) {
            Button("Close", role: .cancel) {}
        } message: {
            Text(errorMessage ?? "")
        }
        .onDisappear {
            nextQuestionTask?.cancel()
        }
        .task {
            guard startsImmediately, !didAutoStart else {
                return
            }

            didAutoStart = true
            await startQuiz(questionCountOverride: initialQuestionCount)
        }
    }

    private var startView: some View {
        Form {
            Section("DB") {
                ForEach(quizSet.sources) { source in
                    Text(source.dataSourceName)
                }
            }

            Section("Count") {
                Picker("Count", selection: $questionCount) {
                    ForEach(presetCounts, id: \.self) { count in
                        Text("\(count)").tag(count)
                    }
                }
                .pickerStyle(.segmented)

                TextField("Custom", text: $customQuestionCount)
                    .keyboardType(.numberPad)
            }

            Section {
                Button {
                    Task { await startQuiz() }
                } label: {
                    HStack {
                        Spacer()
                        if isStarting {
                            ProgressView()
                        } else {
                            Label("Start", systemImage: "play.fill")
                        }
                        Spacer()
                    }
                }
                .disabled(isStarting || quizSet.sources.isEmpty)
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
            }
        }
    }

    private var quizStage: some View {
        VStack(spacing: 0) {
            headerView

            Divider()

            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    if let currentQuestion {
                        VStack(alignment: .leading, spacing: 0) {
                            MarkdownContentView(
                                items: currentQuestion.prompt,
                                imageUrls: currentQuestion.promptImageUrls,
                                textStyle: .title3
                            )
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding()
                        .background(.thinMaterial)
                        .clipShape(RoundedRectangle(cornerRadius: 12))

                        if hasRevealedAnswer {
                            answerView(question: currentQuestion)
                        }
                    } else {
                        LoadingStateView(message: "Loading...")
                            .frame(minHeight: 240)
                    }
                }
                .padding()
            }

            Divider()

            actionBar
        }
        .onAppear {
            questionShownAt = Date()
        }
    }

    private var headerView: some View {
        HStack {
            Text("Question \(min(currentIndex + 1, session?.plannedQuestionCount ?? 0)) / \(session?.plannedQuestionCount ?? 0)")
                .font(.headline)

            Spacer()

            Text("Correct \(correctCount)")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .padding()
    }

    private func answerView(question: QuizQuestion) -> some View {
        MarkdownContentView(
            items: question.correctAnswer,
            imageUrls: question.imageUrls,
            textStyle: .body
        )
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func openCurrentQuestionInObsidian() {
        guard let urlString = currentQuestion?.obsidianOpenURL,
              let url = URL(string: urlString) else {
            errorMessage = "This question's Markdown file can't be opened."
            return
        }

        openURL(url) { accepted in
            if !accepted {
                errorMessage = "Couldn't open Obsidian. Make sure Obsidian is installed and this folder is open as a vault."
            }
        }
    }

    private var actionBar: some View {
        Group {
            if !hasRevealedAnswer {
                Button {
                    hasRevealedAnswer = true
                } label: {
                    Label("Show Answer", systemImage: "eye")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(currentQuestion == nil || isRestoringPreviousAnswer)
                .padding()
            } else {
                HStack(spacing: 12) {
                    Button {
                        Task { await submitAnswer(isCorrect: false) }
                    } label: {
                        Label("Forgot", systemImage: "xmark.circle")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                    .disabled(isSubmitting || isRestoringPreviousAnswer)

                    Button {
                        Task { await submitAnswer(isCorrect: true) }
                    } label: {
                        Label("Remembered", systemImage: "checkmark.circle")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(isSubmitting || isRestoringPreviousAnswer)
                }
                .padding()
            }
        }
    }

    private func resultView(session: StartedQuizSession) -> some View {
        VStack(spacing: 24) {
            Spacer()

            VStack(spacing: 12) {
                Text("Done")
                    .font(.largeTitle.bold())
                Text("\(correctCount) / \(session.plannedQuestionCount) correct")
                    .font(.title2)
                Text("Accuracy \(session.plannedQuestionCount > 0 ? Int((Double(correctCount) / Double(session.plannedQuestionCount) * 100).rounded()) : 0)%")
                    .foregroundStyle(.secondary)
            }

            Button {
                if startsImmediately {
                    let count = initialQuestionCount ?? requestedQuestionCount()
                    reset()
                    Task { await startQuiz(questionCountOverride: count) }
                } else {
                    reset()
                }
            } label: {
                Label("Again", systemImage: "arrow.clockwise")
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }

    private func requestedQuestionCount() -> Int {
        let trimmed = customQuestionCount.trimmingCharacters(in: .whitespacesAndNewlines)
        if let value = Int(trimmed), value > 0 {
            return value
        }
        return questionCount
    }

    private func startQuiz(questionCountOverride: Int? = nil) async {
        isStarting = true
        errorMessage = nil

        do {
            var started = try await appState.api.startQuiz(sources: quizSet.sources, questionCount: questionCountOverride ?? requestedQuestionCount())
            if started.questions.isEmpty {
                started.plannedQuestionCount = 0
                session = started
                answerHistory = [:]
                isFinished = true
            } else {
                session = started
                appState.preferences.lastQuizSetId = quizSet.id
                currentIndex = 0
                correctCount = 0
                answerHistory = [:]
                hasRevealedAnswer = false
                isFinished = false
                didEndSession = false
                questionShownAt = Date()
                prefetchNextQuestionIfNeeded(after: currentIndex)
            }
        } catch {
            errorMessage = error.localizedDescription
        }

        isStarting = false
    }

    private func goBackOneQuestion() async {
        guard !isRestoringPreviousAnswer,
              let targetIndex = backTargetIndex,
              let entry = answerHistory[targetIndex],
              let undoToken = entry.undoToken else {
            return
        }

        isRestoringPreviousAnswer = true
        errorMessage = nil

        do {
            try await appState.api.restoreAnswerMetadata(undoToken)
            answerHistory[targetIndex] = nil
            if entry.isCorrect {
                correctCount = max(0, correctCount - 1)
            }
            currentIndex = targetIndex
            hasRevealedAnswer = false
            isFinished = false
            didEndSession = false
            questionShownAt = Date()
        } catch {
            errorMessage = error.localizedDescription
        }

        isRestoringPreviousAnswer = false
    }

    private func submitAnswer(isCorrect: Bool) async {
        guard !isSubmitting, let question = currentQuestion, let activeSession = session else {
            return
        }

        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }

        let responseTimeMs = questionShownAt.map { max(0, Int(Date().timeIntervalSince($0) * 1000)) }
        let source = quizSet.sources.first { $0.dataSourceId == question.dataSourceId }

        let request = RecordAnswerRequest(
            pageId: question.pageId,
            questionItemId: question.questionItemId,
            sessionId: activeSession.sessionId,
            isCorrect: isCorrect,
            questionPosition: currentIndex + 1,
            responseTimeMs: responseTimeMs,
            mappings: source?.mappings
        )

        do {
            let response = try await appState.api.recordAnswer(request)
            answerHistory[currentIndex] = AnswerHistoryEntry(isCorrect: isCorrect, undoToken: response.undoToken)

            if isCorrect {
                correctCount += 1
            }

            if currentIndex + 1 >= activeSession.plannedQuestionCount {
                finishSessionInBackground()
                return
            }

            let nextIndex = currentIndex + 1
            currentIndex = nextIndex
            hasRevealedAnswer = false
            questionShownAt = Date()

            if session?.questions.indices.contains(nextIndex) == true {
                prefetchNextQuestionIfNeeded(after: nextIndex)
            } else {
                loadQuestionIfNeeded(at: nextIndex)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func prefetchNextQuestionIfNeeded(after questionIndex: Int) {
        loadQuestionIfNeeded(at: questionIndex + 1)
    }

    private func loadQuestionIfNeeded(at targetIndex: Int) {
        guard let activeSession = session,
              let sessionId = activeSession.sessionId,
              !isFinished else {
            return
        }

        guard targetIndex < activeSession.plannedQuestionCount else {
            return
        }

        if activeSession.questions.indices.contains(targetIndex) {
            return
        }

        if nextQuestionIndex == targetIndex, nextQuestionTask != nil {
            return
        }

        nextQuestionTask?.cancel()
        nextQuestionIndex = targetIndex
        nextQuestionTask = Task { @MainActor in
            do {
                let response = try await appState.api.nextQuestion(sessionId: sessionId)

                guard !Task.isCancelled, nextQuestionIndex == targetIndex, var activeSession = session else {
                    return
                }

                if activeSession.questions.indices.contains(targetIndex) {
                    nextQuestionIndex = nil
                    nextQuestionTask = nil
                    return
                }

                if let next = response.question {
                    activeSession.questions.append(next)
                } else {
                    activeSession.plannedQuestionCount = min(activeSession.plannedQuestionCount, targetIndex)
                }

                session = activeSession
                nextQuestionIndex = nil
                nextQuestionTask = nil

                if currentIndex >= activeSession.plannedQuestionCount {
                    finishSessionInBackground()
                }
            } catch {
                guard !Task.isCancelled, nextQuestionIndex == targetIndex else {
                    return
                }

                errorMessage = error.localizedDescription
                nextQuestionIndex = nil
                nextQuestionTask = nil
            }
        }
    }

    private func finishSessionInBackground() {
        isFinished = true

        guard !didEndSession, let sessionId = session?.sessionId else {
            return
        }

        didEndSession = true

        Task { @MainActor in
            do {
                _ = try await appState.api.endQuiz(sessionId: sessionId)
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func reset() {
        nextQuestionTask?.cancel()
        nextQuestionTask = nil
        nextQuestionIndex = nil
        session = nil
        currentIndex = 0
        hasRevealedAnswer = false
        correctCount = 0
        answerHistory = [:]
        questionShownAt = nil
        isFinished = false
        didEndSession = false
        isRestoringPreviousAnswer = false
        errorMessage = nil
    }
}

private struct AnswerHistoryEntry {
    let isCorrect: Bool
    let undoToken: QuizAnswerUndoToken?
}

private struct MarkdownContentView: View {
    let items: [QuizRichTextItem]
    let imageUrls: [String]
    let textStyle: UIFont.TextStyle

    private var markdown: String {
        items.map(\.displayText).joined().trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var blocks: [MarkdownAnswerBlock] {
        MarkdownAnswerBlock.parse(markdown: markdown, imageUrls: imageUrls)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(blocks) { block in
                switch block.kind {
                case .text(let value):
                    RichTextView(items: [Self.richText(value)], textStyle: textStyle)
                case .image(let urlString):
                    QuestionImageView(urlString: urlString)
                }
            }
        }
    }

    private static func richText(_ value: String) -> QuizRichTextItem {
        QuizRichTextItem(
            plainText: value,
            type: "text",
            text: QuizRichTextItem.TextValue(content: value),
            equation: nil
        )
    }
}

private struct MarkdownAnswerBlock: Identifiable {
    enum Kind {
        case text(String)
        case image(String)
    }

    let id: Int
    let kind: Kind

    static func parse(markdown: String, imageUrls: [String]) -> [MarkdownAnswerBlock] {
        guard !markdown.isEmpty else {
            return [.init(id: 0, kind: .text(""))]
        }

        let pattern = #"!\[[^\]]*\]\(([^)]+)\)|!\[\[([^\]]+)\]\]"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else {
            return [.init(id: 0, kind: .text(markdown))]
        }

        let nsRange = NSRange(markdown.startIndex..<markdown.endIndex, in: markdown)
        let matches = regex.matches(in: markdown, range: nsRange)
        guard !matches.isEmpty else {
            return [.init(id: 0, kind: .text(markdown))]
        }

        var result: [MarkdownAnswerBlock] = []
        var currentIndex = markdown.startIndex
        var imageIndex = 0
        var nextID = 0

        for match in matches {
            guard let matchRange = Range(match.range, in: markdown) else {
                continue
            }

            appendText(markdown[currentIndex..<matchRange.lowerBound], to: &result, nextID: &nextID)

            if imageIndex < imageUrls.count {
                result.append(.init(id: nextID, kind: .image(imageUrls[imageIndex])))
                nextID += 1
                imageIndex += 1
            } else {
                appendText(markdown[matchRange], to: &result, nextID: &nextID)
            }

            currentIndex = matchRange.upperBound
        }

        appendText(markdown[currentIndex..<markdown.endIndex], to: &result, nextID: &nextID)
        return result.isEmpty ? [.init(id: 0, kind: .text(markdown))] : result
    }

    private static func appendText(_ slice: Substring, to result: inout [MarkdownAnswerBlock], nextID: inout Int) {
        let value = String(slice).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else {
            return
        }

        result.append(.init(id: nextID, kind: .text(value)))
        nextID += 1
    }
}

private struct QuestionImageView: View {
    let urlString: String

    @State private var image: UIImage?
    @State private var isLoading = false
    @State private var didFail = false

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            } else if isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 180)
            } else {
                Label(didFail ? "Image failed to load" : "Invalid image URL", systemImage: "photo")
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, minHeight: 80)
            }
        }
        .frame(maxWidth: .infinity)
        .task(id: urlString) {
            await loadImage()
        }
    }

    private func loadImage() async {
        image = nil
        didFail = false

        guard let url = normalizedURL(from: urlString) else {
            didFail = true
            return
        }

        isLoading = true
        defer { isLoading = false }

        do {
            var request = URLRequest(url: url)
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.setValue("image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8", forHTTPHeaderField: "Accept")

            let data: Data
            if url.isFileURL {
                let didStart = url.startAccessingSecurityScopedResource()
                defer {
                    if didStart {
                        url.stopAccessingSecurityScopedResource()
                    }
                }
                data = try Data(contentsOf: url)
            } else {
                let (loadedData, response) = try await URLSession.shared.data(for: request)
                if let httpResponse = response as? HTTPURLResponse,
                   !(200..<300).contains(httpResponse.statusCode) {
                    didFail = true
                    return
                }
                data = loadedData
            }

            guard let loadedImage = UIImage(data: data) else {
                    didFail = true
                    return
            }

            image = loadedImage
        } catch {
            didFail = true
        }
    }

    private func normalizedURL(from value: String) -> URL? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if let url = URL(string: trimmed) {
            return url
        }

        return trimmed.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed).flatMap(URL.init(string:))
    }
}
