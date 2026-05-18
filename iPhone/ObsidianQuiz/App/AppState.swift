import Foundation

@MainActor
final class AppState: ObservableObject {
    enum Phase: Equatable {
        case checking
        case signedOut
        case obsidianRequired
        case ready
    }

    @Published private(set) var phase: Phase = .checking
    @Published private(set) var user: AuthUser?
    @Published private(set) var obsidianConnection: ObsidianConnection?
    @Published var globalError: String?

    let preferences: AppPreferences
    let api: APIClient

    init(preferences: AppPreferences = .shared, api: APIClient? = nil) {
        self.preferences = preferences
        self.api = api ?? APIClient(preferences: preferences)
    }

    func refreshSession() async {
        phase = .checking
        globalError = nil
        user = nil
        obsidianConnection = nil
        phase = .ready
    }

    func signIn(email: String, password: String) async {
        globalError = nil

        do {
            let response = try await api.signIn(email: email, password: password)
            user = response.user
            await refreshSession()
        } catch {
            globalError = error.localizedDescription
        }
    }

    func signUp(email: String, password: String, passwordConfirmation: String, displayName: String?) async {
        globalError = nil

        do {
            let response = try await api.signUp(
                email: email,
                password: password,
                passwordConfirmation: passwordConfirmation,
                displayName: displayName
            )
            user = response.user
            await refreshSession()
        } catch {
            globalError = error.localizedDescription
        }
    }

    func connectObsidian(token: String) async {
        globalError = nil
        obsidianConnection = nil
        phase = .ready
    }

    func disconnectObsidian() async {
        globalError = nil
        obsidianConnection = nil
        phase = .ready
    }

    func signOut() async {
        globalError = nil
        user = nil
        obsidianConnection = nil
        phase = .ready
    }

    func handleUnauthorized() {
        api.clearCookies()
        user = nil
        obsidianConnection = nil
        phase = .ready
    }

    private func applySession(_ response: MobileMeResponse) {
        user = response.user
        obsidianConnection = response.obsidianConnection

        if response.user == nil {
            phase = .signedOut
        } else if response.obsidianConnection?.connected == true {
            phase = .ready
        } else {
            phase = .obsidianRequired
        }
    }
}
