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
    let promptImageUrls: [String]
    let imageUrls: [String]

    enum CodingKeys: String, CodingKey {
        case id
        case questionItemId
        case pageId
        case dataSourceId
        case dataSourceName
        case prompt
        case correctAnswer
        case explanation
        case promptImageUrls
        case imageUrls
    }

    init(
        id: String,
        questionItemId: String,
        pageId: String,
        dataSourceId: String,
        dataSourceName: String,
        prompt: [QuizRichTextItem],
        correctAnswer: [QuizRichTextItem],
        explanation: [QuizRichTextItem],
        promptImageUrls: [String] = [],
        imageUrls: [String]
    ) {
        self.id = id
        self.questionItemId = questionItemId
        self.pageId = pageId
        self.dataSourceId = dataSourceId
        self.dataSourceName = dataSourceName
        self.prompt = prompt
        self.correctAnswer = correctAnswer
        self.explanation = explanation
        self.promptImageUrls = promptImageUrls
        self.imageUrls = imageUrls
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        questionItemId = try container.decode(String.self, forKey: .questionItemId)
        pageId = try container.decode(String.self, forKey: .pageId)
        dataSourceId = try container.decode(String.self, forKey: .dataSourceId)
        dataSourceName = try container.decode(String.self, forKey: .dataSourceName)
        prompt = try container.decode([QuizRichTextItem].self, forKey: .prompt)
        correctAnswer = try container.decode([QuizRichTextItem].self, forKey: .correctAnswer)
        explanation = try container.decode([QuizRichTextItem].self, forKey: .explanation)
        promptImageUrls = try container.decodeIfPresent([String].self, forKey: .promptImageUrls) ?? []
        imageUrls = try container.decode([String].self, forKey: .imageUrls)
    }
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
