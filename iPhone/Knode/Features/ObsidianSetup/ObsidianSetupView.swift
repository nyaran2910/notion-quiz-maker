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
    @State private var isDBEditorFolderPickerPresented = false
    @State private var isLoading = false
    @State private var isSaving = false
    @State private var deletingQuizSetId: String?
    @State private var quizSetPendingDelete: QuizSetSummary?
    @State private var folderPendingDelete: AccessibleDataSource?
    @State private var editingFolder: AccessibleDataSource?
    @State private var editingFolderName = ""
    @State private var editingFolderReplacementURL: URL?
    @State private var isSavingFolder = false
    @State private var errorMessage: String?

    var body: some View {
        Form {
            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                    Button {
                        Task { await loadAll() }
                    } label: {
                        Label("Reload", systemImage: "arrow.clockwise")
                    }
                }
            }

            quizSetsSection
            foldersSection
        }
        .navigationTitle("Settings")
        .sheet(isPresented: $isFolderPickerPresented) {
            FolderDocumentPicker { urls in
                Task { await addFolders(urls) }
            }
        }
        .sheet(item: $editingFolder, onDismiss: {
            editingFolderName = ""
            editingFolderReplacementURL = nil
            isSavingFolder = false
            isDBEditorFolderPickerPresented = false
        }) { folder in
            NavigationStack {
                editingFolderView(folder)
                    .navigationTitle("Edit DB")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Close") {
                                editingFolder = nil
                            }
                        }

                        ToolbarItem(placement: .confirmationAction) {
                            Button {
                                Task { await saveEditingFolder(folder) }
                            } label: {
                                if isSavingFolder {
                                    ProgressView()
                                } else {
                                    Label("Save", systemImage: "checkmark.circle")
                                }
                            }
                            .disabled(
                                isSavingFolder
                                || editingFolderName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            )
                        }
                    }
            }
        }
        .sheet(isPresented: Binding(
            get: { isQuizSetEditorPresented },
            set: { if !$0 { clearEditingDraft() } }
        )) {
            NavigationStack {
                editingQuizSetView
                    .navigationTitle(editingQuizSetId == nil ? "Create Set" : "Edit Set")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Close") {
                                clearEditingDraft()
                            }
                        }

                        ToolbarItem(placement: .confirmationAction) {
                            Button {
                                Task { await saveEditingQuizSet() }
                            } label: {
                                if isSaving {
                                    ProgressView()
                                } else {
                                    Label(
                                        editingQuizSetId == nil ? "Create" : "Save",
                                        systemImage: editingQuizSetId == nil ? "plus.circle" : "checkmark.circle"
                                    )
                                }
                            }
                            .disabled(
                                isSaving
                                || editingSelectedFolderIds.isEmpty
                                || editingQuizSetName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            )
                        }
                    }
            }
        }
        .confirmationDialog(
            "Delete this quiz set?",
            isPresented: Binding(
                get: { quizSetPendingDelete != nil },
                set: { if !$0 { quizSetPendingDelete = nil } }
            ),
            titleVisibility: .visible
        ) {
            if let quizSet = quizSetPendingDelete {
                Button(role: .destructive) {
                    Task { await deleteQuizSet(quizSet) }
                } label: {
                    Label("Delete", systemImage: "trash")
                }
            }
            Button("Cancel", role: .cancel) {}
        }
        .confirmationDialog(
            "Delete this DB?",
            isPresented: Binding(
                get: { folderPendingDelete != nil },
                set: { if !$0 { folderPendingDelete = nil } }
            ),
            titleVisibility: .visible
        ) {
            if let folder = folderPendingDelete {
                Button(role: .destructive) {
                    Task { await removeFolder(folder) }
                } label: {
                    Label("Delete", systemImage: "trash")
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
                Label("No Sets", systemImage: "rectangle.stack")
                    .foregroundStyle(.secondary)
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
                Label("Add DB", systemImage: "folder.badge.plus")
            }

            if folders.isEmpty {
                Label("No DBs", systemImage: "folder")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(folders) { folder in
                    VStack(alignment: .leading, spacing: 8) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(folder.name)
                                .font(.headline)
                        }

                        HStack {
                            Button {
                                beginEdit(folder)
                            } label: {
                                Label("Edit", systemImage: "square.and.pencil")
                            }
                            .font(.caption)
                            .buttonStyle(.borderless)

                            Spacer()

                            Button(role: .destructive) {
                                folderPendingDelete = folder
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                            .font(.caption)
                            .buttonStyle(.borderless)
                        }
                    }
                    .padding(.vertical, 4)
                    .swipeActions {
                        Button(role: .destructive) {
                            folderPendingDelete = folder
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }

                        Button {
                            beginEdit(folder)
                        } label: {
                            Label("Edit", systemImage: "square.and.pencil")
                        }
                    }
                }
            }
        } header: {
            Text("DB")
        }
    }

    private func editingFolderView(_ folder: AccessibleDataSource) -> some View {
        Form {
            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                }
            }

            Section("DB") {
                TextField("DB Name", text: $editingFolderName)
                    .textInputAutocapitalization(.words)
                    .submitLabel(.done)
                    .onSubmit {
                        Task { await saveEditingFolder(folder) }
                    }

                LabeledContent("Folder Path") {
                    Text(editingFolderReplacementURL?.path ?? folder.parentTitle ?? "Unknown")
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.trailing)
                        .lineLimit(2)
                        .truncationMode(.middle)
                }

                Button {
                    isDBEditorFolderPickerPresented = true
                } label: {
                    Label("Change Folder", systemImage: "folder")
                }
            }
        }
        .sheet(isPresented: $isDBEditorFolderPickerPresented) {
            FolderDocumentPicker(allowsMultipleSelection: false) { urls in
                editingFolderReplacementURL = urls.first
            }
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
                TextField("Set Name", text: $editingQuizSetName)
            }

            Section {
                Button {
                    isEditorFolderPickerPresented = true
                } label: {
                    Label("Add DB", systemImage: "folder.badge.plus")
                }

                if folders.isEmpty {
                    Label("No DBs", systemImage: "folder")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(folders) { folder in
                        Button {
                            toggleEditing(folder)
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(folder.name)
                                        .foregroundStyle(.primary)

                                    if let path = folder.parentTitle, !path.isEmpty {
                                        Text(path)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                            .lineLimit(1)
                                            .truncationMode(.middle)
                                    }
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
                Text("DB")
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

    private func beginEdit(_ folder: AccessibleDataSource) {
        editingFolder = folder
        editingFolderName = folder.name
        editingFolderReplacementURL = nil
        errorMessage = nil
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

    private func saveEditingFolder(_ folder: AccessibleDataSource) async {
        guard !isSavingFolder else {
            return
        }

        isSavingFolder = true
        errorMessage = nil

        do {
            _ = try await appState.api.updateObsidianFolder(
                id: folder.id,
                name: editingFolderName,
                url: editingFolderReplacementURL
            )
            await loadAll()
            editingFolder = nil
        } catch {
            errorMessage = error.localizedDescription
        }

        isSavingFolder = false
    }
}

private struct FolderDocumentPicker: UIViewControllerRepresentable {
    var allowsMultipleSelection = true
    let onPick: ([URL]) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onPick: onPick)
    }

    func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.folder], asCopy: false)
        picker.allowsMultipleSelection = allowsMultipleSelection
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
