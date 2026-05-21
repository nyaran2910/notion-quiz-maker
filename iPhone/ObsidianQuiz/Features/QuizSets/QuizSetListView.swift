import SwiftUI

struct QuizSetListView: View {
    @EnvironmentObject private var appState: AppState

    @State private var quizSets: [QuizSetSummary] = []
    @State private var selectedQuizSetId: String?
    @State private var questionCount = 5
    @State private var customQuestionCount = ""
    @State private var activeQuizSet: QuizSetSummary?
    @State private var activeQuestionCount = 5
    @State private var isLoading = false
    @State private var errorMessage: String?

    private let presetCounts = [5, 10, 20, 50, 100]

    private var selectedQuizSet: QuizSetSummary? {
        quizSets.first { $0.id == selectedQuizSetId }
    }

    var body: some View {
        Group {
            if let activeQuizSet {
                QuizRunnerView(
                    quizSet: activeQuizSet,
                    initialQuestionCount: activeQuestionCount,
                    startsImmediately: true,
                    onClose: {
                        self.activeQuizSet = nil
                    }
                )
            } else if isLoading && quizSets.isEmpty {
                LoadingStateView(message: "Loading...")
            } else if let errorMessage, quizSets.isEmpty {
                ErrorStateView(message: errorMessage) {
                    Task { await loadQuizSets() }
                }
            } else if quizSets.isEmpty {
                ContentUnavailableView("No Sets", systemImage: "rectangle.stack.badge.plus")
            } else {
                quizConfigView
            }
        }
        .navigationTitle("Quiz")
        .task {
            await loadQuizSets()
        }
    }

    private var quizConfigView: some View {
        Form {
            Section("Sets") {
                ForEach(quizSets) { quizSet in
                    Button {
                        selectedQuizSetId = quizSet.id
                    } label: {
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 6) {
                                Text(quizSet.name)
                                    .font(.headline)
                                    .foregroundStyle(.primary)
                            }

                            Spacer()

                            if quizSet.id == selectedQuizSetId {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundStyle(.tint)
                            }
                        }
                        .contentShape(Rectangle())
                        .padding(.vertical, 4)
                    }
                    .buttonStyle(.plain)
                    .swipeActions {
                        Button("Delete", role: .destructive) {
                            Task { await deleteQuizSet(quizSet) }
                        }
                    }
                }
            }

            Section("Questions") {
                Picker("Questions", selection: $questionCount) {
                    ForEach(presetCounts, id: \.self) { count in
                        Text("\(count)").tag(count)
                    }
                }
                .pickerStyle(.segmented)

                TextField("Custom", text: $customQuestionCount)
                    .keyboardType(.numberPad)
                    .onChange(of: customQuestionCount) { _, value in
                        if let parsed = Int(value.trimmingCharacters(in: .whitespacesAndNewlines)), parsed > 0 {
                            questionCount = parsed
                        }
                    }
            }

            Section {
                Button {
                    startSelectedQuiz()
                } label: {
                    Text("Start")
                        .frame(maxWidth: .infinity)
                }
                .disabled(selectedQuizSet == nil)
            }
        }
        .refreshable {
            await loadQuizSets()
        }
    }

    private func loadQuizSets() async {
        isLoading = true
        errorMessage = nil

        do {
            quizSets = try await appState.api.listQuizSets().quizSets
            if let lastId = appState.preferences.lastQuizSetId,
               quizSets.contains(where: { $0.id == lastId }) {
                selectedQuizSetId = selectedQuizSetId ?? lastId
            } else {
                appState.preferences.lastQuizSetId = nil
                selectedQuizSetId = selectedQuizSetId.flatMap { id in
                    quizSets.contains(where: { $0.id == id }) ? id : nil
                } ?? quizSets.first?.id
            }
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    private func requestedQuestionCount() -> Int {
        let trimmed = customQuestionCount.trimmingCharacters(in: .whitespacesAndNewlines)
        if let value = Int(trimmed), value > 0 {
            return value
        }

        return questionCount
    }

    private func startSelectedQuiz() {
        guard let selectedQuizSet else {
            return
        }

        activeQuestionCount = requestedQuestionCount()
        appState.preferences.lastQuizSetId = selectedQuizSet.id
        activeQuizSet = selectedQuizSet
    }

    private func deleteQuizSet(_ quizSet: QuizSetSummary) async {
        do {
            try await appState.api.deleteQuizSet(id: quizSet.id)
            quizSets.removeAll { $0.id == quizSet.id }
            if selectedQuizSetId == quizSet.id {
                selectedQuizSetId = quizSets.first?.id
            }
            if appState.preferences.lastQuizSetId == quizSet.id {
                appState.preferences.lastQuizSetId = nil
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
