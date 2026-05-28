import SwiftUI

struct ErrorStateView: View {
    let message: String
    let retry: (() -> Void)?

    var body: some View {
        ContentUnavailableView {
            Label("Failed to Load", systemImage: "exclamationmark.triangle")
        } description: {
            Text(message)
        } actions: {
            if let retry {
                Button(action: retry) {
                    Label("Retry", systemImage: "arrow.clockwise")
                }
                    .buttonStyle(.borderedProminent)
            }
        }
    }
}
