import Foundation

enum AppEnvironment {
    static let fallbackBaseURL = URL(string: "https://obsidian-quiz-maker.vercel.app")!
    static let localDevelopmentBaseURL = URL(string: "http://localhost:3000")!
}
