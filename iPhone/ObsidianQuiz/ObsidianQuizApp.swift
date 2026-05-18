import SwiftUI

@main
struct ObsidianQuizApp: App {
    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(appState)
                .environmentObject(appState.preferences)
        }
    }
}
