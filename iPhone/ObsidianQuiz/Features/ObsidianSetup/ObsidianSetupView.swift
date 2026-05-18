import SwiftUI
import UniformTypeIdentifiers
import UIKit

struct ObsidianSetupView: View {
    @EnvironmentObject private var appState: AppState

    @State private var folders: [AccessibleDataSource] = []
    @State private var quizSets: [QuizSetSummary] = []
    @State private var editingQuizSetId: String?
    @State private var editingQuizSetName = ""
    @State private var editingSelectedFolderIds = Set<String>()
    @State private var isQuizSetEditorPresented = false
    @State private var isFolderPickerPresented = false
    @State private var isEditorFolderPickerPresented = false
    @State private var isLoading = false
    @State private var isSaving = false
    @State private var deletingQuizSetId: String?
    @State private var quizSetPendingDelete: QuizSetSummary?
    @State private var folderPendingDelete: AccessibleDataSource?
    @State private var errorMessage: String?

    var body: some View {
        Form {
            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                    Button("Reload") {
                        Task { await loadAll() }
                    }
                }
            }

            quizSetsSection
            foldersSection
        }
        .navigationTitle("Settings")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await loadAll() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .accessibilityLabel("Reload")
            }
        }
        .sheet(isPresented: $isFolderPickerPresented) {
            FolderDocumentPicker { urls in
                Task { await addFolders(urls) }
            }
        }
        .sheet(isPresented: Binding(
            get: { isQuizSetEditorPresented },
            set: { if !$0 { clearEditingDraft() } }
        )) {
            NavigationStack {
                editingQuizSetView
                    .navigationTitle(editingQuizSetId == nil ? "New Set" : "Edit Set")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Close") {
                                clearEditingDraft()
                            }
                        }
                    }
            }
        }
        .confirmationDialog(
            "Delete set?",
            isPresented: Binding(
                get: { quizSetPendingDelete != nil },
                set: { if !$0 { quizSetPendingDelete = nil } }
            ),
            titleVisibility: .visible
        ) {
            if let quizSet = quizSetPendingDelete {
                Button("Delete", role: .destructive) {
                    Task { await deleteQuizSet(quizSet) }
                }
            }
            Button("Cancel", role: .cancel) {}
        }
        .confirmationDialog(
            "Delete folder?",
            isPresented: Binding(
                get: { folderPendingDelete != nil },
                set: { if !$0 { folderPendingDelete = nil } }
            ),
            titleVisibility: .visible
        ) {
            if let folder = folderPendingDelete {
                Button("Delete", role: .destructive) {
                    Task { await removeFolder(folder) }
                }
            }
            Button("Cancel", role: .cancel) {}
        }
        .task {
            if folders.isEmpty && quizSets.isEmpty {
                await loadAll()
            }
        }
    }

    private var quizSetsSection: some View {
        Section {
            Button {
                beginCreate()
            } label: {
                Label("Add Set", systemImage: "plus.circle")
            }

            if isLoading && quizSets.isEmpty {
                HStack {
                    ProgressView()
                    Text("Loading...")
                }
            } else if quizSets.isEmpty {
                Text("No sets")
            } else {
                ForEach(quizSets) { quizSet in
                    VStack(alignment: .leading, spacing: 8) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(quizSet.name)
                                .font(.headline)
                        }

                        HStack {
                            Button {
                                beginEdit(quizSet)
                            } label: {
                                Label("Edit", systemImage: "square.and.pencil")
                            }
                            .font(.caption)
                            .buttonStyle(.borderless)

                            Spacer()

                            Button(role: .destructive) {
                                quizSetPendingDelete = quizSet
                            } label: {
                                if deletingQuizSetId == quizSet.id {
                                    ProgressView()
                                } else {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                            .font(.caption)
                            .buttonStyle(.borderless)
                            .disabled(deletingQuizSetId == quizSet.id)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        } header: {
            Text("Sets")
        }
    }

    private var foldersSection: some View {
        Section {
            Button {
                isFolderPickerPresented = true
            } label: {
                Label("Add Folder", systemImage: "folder.badge.plus")
            }

            if folders.isEmpty {
                Text("No folders")
            } else {
                ForEach(folders) { folder in
                    HStack {
                        Text(folder.name)
                            .font(.headline)

                        Spacer()

                        Button("Delete", role: .destructive) {
                            folderPendingDelete = folder
                        }
                        .buttonStyle(.borderless)
                    }
                    .swipeActions {
                        Button("Delete", role: .destructive) {
                            folderPendingDelete = folder
                        }
                    }
                }
            }
        } header: {
            Text("Folders")
        }
    }

    private var editingQuizSetView: some View {
        Form {
            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                }
            }

            Section("Set") {
                TextField("Name", text: $editingQuizSetName)
            }

            Section {
                Button {
                    isEditorFolderPickerPresented = true
                } label: {
                    Label("Add Folder", systemImage: "folder.badge.plus")
                }

                if folders.isEmpty {
                    Text("No folders")
                } else {
                    ForEach(folders) { folder in
                        Button {
                            toggleEditing(folder)
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(folder.name)
                                        .foregroundStyle(.primary)
                                }

                                Spacer()

                                if editingSelectedFolderIds.contains(folder.id) {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(.blue)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            } header: {
                Text("Folders")
            }

            Section {
                Button {
                    Task { await saveEditingQuizSet() }
                } label: {
                    HStack {
                        Spacer()
                        if isSaving {
                            ProgressView()
                        } else {
                            Text(editingQuizSetId == nil ? "Create" : "Save")
                        }
                        Spacer()
                    }
                }
                .disabled(
                    isSaving
                    || editingSelectedFolderIds.isEmpty
                    || editingQuizSetName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                )
            }
        }
        .sheet(isPresented: $isEditorFolderPickerPresented) {
            FolderDocumentPicker { urls in
                Task { await addFolders(urls) }
            }
        }
    }

    private func loadAll() async {
        isLoading = true
        errorMessage = nil

        do {
            folders = try await appState.api.listDataSources().dataSources
            quizSets = try await appState.api.listQuizSets().quizSets
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    private func addFolders(_ urls: [URL]) async {
        errorMessage = nil

        do {
            let added = try await appState.api.addObsidianFolders(urls)
            await loadAll()

            if isQuizSetEditorPresented {
                for folder in added {
                    editingSelectedFolderIds.insert(folder.id)
                }

                if editingQuizSetName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                   let first = added.first {
                    editingQuizSetName = first.name
                }
            }

        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func beginCreate() {
        clearEditingDraft()
        errorMessage = nil
        isQuizSetEditorPresented = true
    }

    private func beginEdit(_ quizSet: QuizSetSummary) {
        editingQuizSetId = quizSet.id
        editingQuizSetName = quizSet.name
        editingSelectedFolderIds = Set(quizSet.sources.map(\.dataSourceId))
        errorMessage = nil
        isQuizSetEditorPresented = true
    }

    private func clearEditingDraft() {
        isQuizSetEditorPresented = false
        editingQuizSetId = nil
        editingQuizSetName = ""
        editingSelectedFolderIds = []
    }

    private func toggleEditing(_ folder: AccessibleDataSource) {
        if editingSelectedFolderIds.contains(folder.id) {
            editingSelectedFolderIds.remove(folder.id)
        } else {
            editingSelectedFolderIds.insert(folder.id)
            if editingQuizSetName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                editingQuizSetName = folder.name
            }
        }
    }

    private func saveEditingQuizSet() async {
        isSaving = true
        errorMessage = nil

        do {
            let trimmedName = editingQuizSetName.trimmingCharacters(in: .whitespacesAndNewlines)
            let sources = folders
                .filter { editingSelectedFolderIds.contains($0.id) }
                .map { folder in
                    QuizSourceConfig(
                        dataSourceId: folder.id,
                        dataSourceName: folder.name,
                        dataSourceUrl: folder.parentTitle,
                        mappings: [:]
                    )
                }

            let response: QuizSetResponse
            if let editingQuizSetId {
                response = try await appState.api.updateQuizSet(
                    id: editingQuizSetId,
                    name: trimmedName,
                    description: nil,
                    sources: sources
                )
            } else {
                response = try await appState.api.createQuizSet(
                    name: trimmedName,
                    description: nil,
                    sources: sources
                )
            }

            appState.preferences.lastQuizSetId = response.quizSet?.id
            clearEditingDraft()
            await loadAll()
        } catch {
            errorMessage = error.localizedDescription
        }

        isSaving = false
    }

    private func deleteQuizSet(_ quizSet: QuizSetSummary) async {
        deletingQuizSetId = quizSet.id
        errorMessage = nil

        do {
            try await appState.api.deleteQuizSet(id: quizSet.id)
            await loadAll()
            quizSetPendingDelete = nil

            if appState.preferences.lastQuizSetId == quizSet.id {
                appState.preferences.lastQuizSetId = nil
            }
        } catch {
            errorMessage = error.localizedDescription
        }

        deletingQuizSetId = nil
    }

    private func removeFolder(_ folder: AccessibleDataSource) async {
        errorMessage = nil

        do {
            try await appState.api.removeObsidianFolder(id: folder.id)
            await loadAll()
            folderPendingDelete = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct FolderDocumentPicker: UIViewControllerRepresentable {
    let onPick: ([URL]) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onPick: onPick)
    }

    func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.folder], asCopy: false)
        picker.allowsMultipleSelection = true
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIDocumentPickerViewController, context: Context) {}

    final class Coordinator: NSObject, UIDocumentPickerDelegate {
        let onPick: ([URL]) -> Void

        init(onPick: @escaping ([URL]) -> Void) {
            self.onPick = onPick
        }

        func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
            onPick(urls)
        }
    }
}
