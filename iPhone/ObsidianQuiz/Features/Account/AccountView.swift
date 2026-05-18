import SwiftUI

struct AccountView: View {
    @EnvironmentObject private var appState: AppState

    @State private var folderCount = 0
    @State private var quizSetCount = 0
    @State private var errorMessage: String?

    var body: some View {
        Form {
            Section("Storage") {
                LabeledContent("Folders", value: "\(folderCount)")
                LabeledContent("Sets", value: "\(quizSetCount)")
            }

            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                }
            }
        }
        .navigationTitle("Info")
        .task {
            await loadSummary()
        }
        .refreshable {
            await loadSummary()
        }
    }

    private func loadSummary() async {
        do {
            folderCount = try await appState.api.listDataSources().dataSources.count
            quizSetCount = try await appState.api.listQuizSets().quizSets.count
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
