import SwiftUI

struct RootView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        Group {
            switch appState.phase {
            case .checking:
                ProgressView("Loading...")
            case .signedOut:
                AuthView()
            case .obsidianRequired:
                NavigationStack {
                    ObsidianConnectionView()
                }
            case .ready:
                MainTabView()
            }
        }
        .task {
            await appState.refreshSession()
        }
        .alert("Error", isPresented: Binding(
            get: { appState.globalError != nil && appState.phase != .signedOut },
            set: { if !$0 { appState.globalError = nil } }
        )) {
            Button("Close", role: .cancel) {}
        } message: {
            Text(appState.globalError ?? "")
        }
    }
}

struct MainTabView: View {
    var body: some View {
        TabView {
            NavigationStack {
                QuizSetListView()
            }
            .tabItem {
                Label("Quiz", systemImage: "rectangle.stack")
            }

            NavigationStack {
                ObsidianSetupView()
            }
            .tabItem {
                Label("Settings", systemImage: "slider.horizontal.3")
            }

            NavigationStack {
                AccountView()
            }
            .tabItem {
                Label("Info", systemImage: "info.circle")
            }
        }
    }
}
