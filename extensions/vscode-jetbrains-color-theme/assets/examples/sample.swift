// Single-line comment
/* Multi-line
   comment */

import Foundation

@MainActor
class ViewModel: ObservableObject {
    @Published var count: Int = 0

    func fetch() async throws {
        let (data, _) = try await URLSession.shared.data(from: url)
        let decoded = try JSONDecoder().decode(Response.self, from: data)
        await MainActor.run {
            self.results = decoded
        }
    }
}

struct Calculator {
    subscript(index: Int) -> Int {
        return index * 2
    }
}

let closure = { [weak self] (num: Int) -> String in
    return "Number: \(num)"
}
