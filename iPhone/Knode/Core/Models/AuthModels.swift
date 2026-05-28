import Foundation

struct AuthUser: Codable, Equatable, Identifiable {
    let id: String
    let email: String?
    let displayName: String?
}

struct ObsidianConnection: Codable, Equatable {
    let workspaceId: String
    let workspaceName: String?
    let connected: Bool
}

struct MobileMeResponse: Decodable, Equatable {
    let user: AuthUser?
    let obsidianConnection: ObsidianConnection?
}

struct AuthResponse: Decodable, Equatable {
    let user: AuthUser
}

struct ObsidianConnectionResponse: Decodable, Equatable {
    let obsidianConnection: ObsidianConnection
}

struct SignInRequest: Encodable {
    let email: String
    let password: String
}

struct SignUpRequest: Encodable {
    let email: String
    let password: String
    let passwordConfirmation: String
    let displayName: String?
}

struct ConnectObsidianRequest: Encodable {
    let token: String
}
