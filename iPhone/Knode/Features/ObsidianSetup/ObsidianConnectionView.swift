import SwiftUI

struct ObsidianConnectionView: View {
    @EnvironmentObject private var appState: AppState

    @State private var token = ""
    @State private var isConnecting = false

    var body: some View {
        Form {
            Section {
                SecureField("Connection Key", text: $token)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            } header: {
                Text("Connection")
            }

            if let error = appState.globalError {
                Section {
                    Text(error)
                        .foregroundStyle(.red)
                }
            }

            Section {
                Button {
                    connect()
                } label: {
                    HStack {
                        Spacer()
                        if isConnecting {
                            ProgressView()
                        } else {
                            Label("Connect", systemImage: "link")
                        }
                        Spacer()
                    }
                }
                .disabled(isConnecting || token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .buttonStyle(.borderedProminent)
                .controlSize(.large)

                Button(role: .destructive) {
                    Task { await appState.signOut() }
                } label: {
                    Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                }
            }
        }
        .navigationTitle("Connection")
    }

    private func connect() {
        isConnecting = true

        Task {
            await appState.connectObsidian(token: token)
            isConnecting = false
        }
    }
}
