import Foundation
import XCTest
@testable import ObsidianQuiz

private final class URLProtocolMock: URLProtocol {
    nonisolated(unsafe) static var requestHandler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        guard let handler = Self.requestHandler else {
            client?.urlProtocol(self, didFailWithError: APIError.invalidResponse)
            return
        }

        do {
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

@MainActor
final class APIClientTests: XCTestCase {
    override func tearDown() {
        URLProtocolMock.requestHandler = nil
        super.tearDown()
    }

    func testGetMeDecodesResponse() async throws {
        let client = makeClient()
        URLProtocolMock.requestHandler = { request in
            XCTAssertEqual(request.url?.path, "/api/mobile/me")
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            let data = """
            {
              "user": {
                "id": "user-1",
                "email": "user@example.com",
                "displayName": "User"
              },
              "obsidianConnection": {
                "workspaceId": "workspace-1",
                "workspaceName": "Workspace",
                "connected": true
              }
            }
            """.data(using: .utf8)!
            return (response, data)
        }

        let result = try await client.getMe()

        XCTAssertEqual(result.user?.id, "user-1")
        XCTAssertEqual(result.obsidianConnection?.connected, true)
    }

    func testServerErrorUsesErrorMessage() async throws {
        let client = makeClient()
        URLProtocolMock.requestHandler = { request in
            let response = HTTPURLResponse(url: request.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!
            let data = #"{"error":"ログインし直してください。"}"#.data(using: .utf8)!
            return (response, data)
        }

        do {
            _ = try await client.getMe() as MobileMeResponse
            XCTFail("Expected APIError.server")
        } catch let error as APIError {
            XCTAssertEqual(error, .server(statusCode: 401, message: "ログインし直してください。"))
        }
    }

    private func makeClient() -> APIClient {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [URLProtocolMock.self]
        configuration.httpCookieStorage = HTTPCookieStorage()
        let session = URLSession(configuration: configuration)
        let defaults = UserDefaults(suiteName: "ObsidianQuizTests-\(UUID().uuidString)")!
        let preferences = AppPreferences(defaults: defaults)
        preferences.baseURLString = "https://example.test"
        return APIClient(preferences: preferences, session: session)
    }
}
