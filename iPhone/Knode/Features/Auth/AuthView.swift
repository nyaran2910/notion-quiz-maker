import SwiftUI

struct AuthView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var preferences: AppPreferences

    @State private var mode: AuthMode = .signIn
    @State private var email = ""
    @State private var displayName = ""
    @State private var password = ""
    @State private var passwordConfirmation = ""
    @State private var baseURLDraft = ""
    @State private var isSubmitting = false

    enum AuthMode: String, CaseIterable, Identifiable {
        case signIn = "Sign In"
        case signUp = "Sign Up"

        var id: String { rawValue }

        var iconName: String {
            switch self {
            case .signIn:
                return "person.crop.circle.badge.checkmark"
            case .signUp:
                return "person.crop.circle.badge.plus"
            }
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Mode", selection: $mode) {
                        ForEach(AuthMode.allCases) { mode in
                            Text(mode.rawValue).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                Section {
                    if mode == .signUp {
                        TextField("Display Name", text: $displayName)
                            .textContentType(.nickname)
                    }

                    TextField("Email", text: $email)
                        .textContentType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)

                    SecureField("Password", text: $password)
                        .textContentType(mode == .signIn ? .password : .newPassword)

                    if mode == .signUp {
                        SecureField("Confirm Password", text: $passwordConfirmation)
                            .textContentType(.newPassword)
                    }
                }

                if let error = appState.globalError {
                    Section {
                        Text(error)
                            .foregroundStyle(.red)
                    }
                }

                Section {
                    TextField("Base URL", text: $baseURLDraft)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()

                    Button {
                        preferences.baseURLString = baseURLDraft
                    } label: {
                        Label("Save Base URL", systemImage: "checkmark.circle")
                    }

                    Button {
                        preferences.resetBaseURL()
                        baseURLDraft = preferences.baseURLString
                    } label: {
                        Label("Reset Base URL", systemImage: "arrow.counterclockwise")
                    }
                } header: {
                    Text("API Settings")
                }

                Section {
                    Button {
                        submit()
                    } label: {
                        HStack {
                            Spacer()
                            if isSubmitting {
                                ProgressView()
                            } else {
                                Label(mode.rawValue, systemImage: mode.iconName)
                            }
                            Spacer()
                        }
                    }
                    .disabled(isSubmitting || email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || password.isEmpty)
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                }
            }
            .navigationTitle("Knode")
            .onAppear {
                baseURLDraft = preferences.baseURLString
            }
        }
    }

    private func submit() {
        isSubmitting = true

        Task {
            switch mode {
            case .signIn:
                await appState.signIn(email: email, password: password)
            case .signUp:
                await appState.signUp(
                    email: email,
                    password: password,
                    passwordConfirmation: passwordConfirmation,
                    displayName: displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : displayName
                )
            }

            isSubmitting = false
        }
    }
}
