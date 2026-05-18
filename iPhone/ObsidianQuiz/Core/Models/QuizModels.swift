import Foundation

struct QuizRichTextItem: Codable, Equatable {
    struct TextValue: Codable, Equatable {
        let content: String?
    }

    struct EquationValue: Codable, Equatable {
        let expression: String?
    }

    let plainText: String?
    let type: String?
    let text: TextValue?
    let equation: EquationValue?

    enum CodingKeys: String, CodingKey {
        case plainText = "plain_text"
        case type
        case text
        case equation
    }

    var displayText: String {
        if let plainText, !plainText.isEmpty {
            return plainText
        }

        if let content = text?.content, !content.isEmpty {
            return content
        }

        if let expression = equation?.expression, !expression.isEmpty {
            return expression
        }

        return ""
    }
}

struct QuizQuestion: Codable, Equatable, Identifiable {
    let id: String
    let questionItemId: String
    let pageId: String
    let dataSourceId: String
    let dataSourceName: String
    let prompt: [QuizRichTextItem]
    let correctAnswer: [QuizRichTextItem]
    let explanation: [QuizRichTextItem]
    let imageUrls: [String]
}

struct QuizSourceConfig: Codable, Equatable, Identifiable {
    let dataSourceId: String
    let dataSourceName: String
    let dataSourceUrl: String?
    let mappings: QuizMappings

    var id: String { dataSourceId }
}

struct QuizSetSummary: Codable, Equatable, Identifiable {
    let id: String
    let name: String
    let description: String?
    let updatedAt: String
    let sources: [QuizSourceConfig]
}

struct QuizSetsResponse: Decodable, Equatable {
    let quizSets: [QuizSetSummary]
}

struct QuizSetResponse: Decodable, Equatable {
    let quizSet: QuizSetSummary?
}

struct SaveQuizSetRequest: Encodable {
    let name: String
    let description: String?
    let sources: [QuizSourceConfig]
}

struct StartQuizRequest: Encodable {
    let questionCount: Int
    let sources: [QuizSourceConfig]
}

struct StartedQuizSession: Codable, Equatable {
    var sessionId: String?
    var quizSetId: String?
    var plannedQuestionCount: Int
    let totalCandidates: Int
    let sourceCount: Int
    var questions: [QuizQuestion]
}

struct NextQuizQuestionRequest: Encodable {
    let sessionId: String
}

struct NextQuizQuestionResponse: Decodable, Equatable {
    let question: QuizQuestion?
}

struct RecordAnswerRequest: Encodable {
    let pageId: String
    let questionItemId: String
    let sessionId: String?
    let isCorrect: Bool
    let questionPosition: Int
    let responseTimeMs: Int?
    let mappings: QuizMappings?
}

struct QuestionStatsSummary: Decodable, Equatable {
    let askedCount: Int
    let accuracy: Double
    let stage: String
    let nextDueAt: String?
}

struct RecordAnswerResponse: Decodable, Equatable {
    let stats: QuestionStatsSummary
}

struct EndQuizSessionRequest: Encodable {
    let sessionId: String
}

struct EndedQuizSession: Decodable, Equatable {
    let id: String?
    let endedAt: String?
}

struct EndQuizSessionResponse: Decodable, Equatable {
    let session: EndedQuizSession?
}
