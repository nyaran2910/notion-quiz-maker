import Foundation

@MainActor
final class AppPreferences: ObservableObject {
    static let shared = AppPreferences()

    private enum Keys {
        static let baseURLString = "baseURLString"
        static let lastQuizSetId = "lastQuizSetId"
    }

    private let defaults: UserDefaults

    @Published var baseURLString: String {
        didSet {
            defaults.set(baseURLString, forKey: Keys.baseURLString)
        }
    }

    @Published var lastQuizSetId: String? {
        didSet {
            defaults.set(lastQuizSetId, forKey: Keys.lastQuizSetId)
        }
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        let savedBaseURLString = defaults.string(forKey: Keys.baseURLString)
        if savedBaseURLString == nil || Self.shouldMigrateDevelopmentBaseURL(savedBaseURLString) {
            self.baseURLString = AppEnvironment.fallbackBaseURL.absoluteString
        } else {
            self.baseURLString = savedBaseURLString ?? AppEnvironment.fallbackBaseURL.absoluteString
        }
        self.lastQuizSetId = defaults.string(forKey: Keys.lastQuizSetId)
    }

    var baseURL: URL {
        let trimmed = baseURLString.trimmingCharacters(in: .whitespacesAndNewlines)
        return URL(string: trimmed).flatMap { $0.scheme == nil ? nil : $0 } ?? AppEnvironment.fallbackBaseURL
    }

    var storageDefaults: UserDefaults {
        defaults
    }

    func resetBaseURL() {
        baseURLString = AppEnvironment.fallbackBaseURL.absoluteString
    }

    private static func shouldMigrateDevelopmentBaseURL(_ value: String?) -> Bool {
        guard
            let value,
            let url = URL(string: value.trimmingCharacters(in: .whitespacesAndNewlines)),
            url.scheme == "http",
            url.port == 3000,
            let host = url.host()
        else {
            return false
        }

        return host == "localhost"
            || host == "127.0.0.1"
            || host.hasPrefix("192.168.")
            || host.hasPrefix("10.")
            || host.range(of: #"^172\.(1[6-9]|2[0-9]|3[0-1])\."#, options: .regularExpression) != nil
    }
}
