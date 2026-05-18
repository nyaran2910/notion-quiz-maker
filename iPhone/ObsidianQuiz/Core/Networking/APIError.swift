import Foundation

enum APIError: LocalizedError, Equatable {
    case invalidURL
    case invalidResponse
    case server(statusCode: Int, message: String)
    case decoding(message: String)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid API URL."
        case .invalidResponse:
            return "Invalid server response."
        case .server(_, let message):
            return message
        case .decoding(let message):
            return "Failed to read response: \(message)"
        }
    }
}
