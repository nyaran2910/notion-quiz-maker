import Foundation

enum QuizRequirementKey: String, Codable, CaseIterable, Identifiable {
    case question
    case answer
    case explanation
    case image

    var id: String { rawValue }

    var label: String {
        switch self {
        case .question:
            return "Question"
        case .answer:
            return "Answer"
        case .explanation:
            return "Notes"
        case .image:
            return "Image"
        }
    }

    var suggestedName: String {
        switch self {
        case .question:
            return "Question"
        case .answer:
            return "Answer"
        case .explanation:
            return "Description"
        case .image:
            return "Image"
        }
    }

    var required: Bool {
        switch self {
        case .question, .answer:
            return true
        case .explanation, .image:
            return false
        }
    }

    var acceptedTypes: Set<String> {
        switch self {
        case .question, .answer:
            return ["title", "rich_text"]
        case .explanation:
            return ["rich_text"]
        case .image:
            return ["files"]
        }
    }
}

typealias QuizMappings = [String: String]

struct AccessibleDataSource: Codable, Equatable, Identifiable {
    let id: String
    let name: String
    let databaseId: String?
    let parentTitle: String?
    let url: String?
}

struct DataSourceProperty: Codable, Equatable, Identifiable {
    let id: String
    let name: String
    let type: String
}

struct DataSourceSchema: Codable, Equatable, Identifiable {
    let id: String
    let title: String
    let properties: [DataSourceProperty]

    func properties(for requirement: QuizRequirementKey) -> [DataSourceProperty] {
        properties.filter { requirement.acceptedTypes.contains($0.type) }
    }
}

struct DataSourcesResponse: Decodable, Equatable {
    let dataSources: [AccessibleDataSource]
}

struct DataSourceSchemaResponse: Decodable, Equatable {
    let schema: DataSourceSchema
}

struct CreateQuizPropertyRequest: Encodable {
    let requirementKey: QuizRequirementKey
}

struct SyncQuizSourcesRequest: Encodable {
    let sources: [QuizSourceConfig]
}

struct SyncQuizSourcesResponse: Decodable, Equatable {
    let sourceCount: Int
    let questionCount: Int
}
