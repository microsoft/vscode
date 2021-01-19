var teamScore = 0
var greeting = "Hello!"
var multiLineString = """
    This is a multi-line string!
"""
func hasAnyMatches(list: [Int], condition: (Int) -> Bool) -> Bool {
    for item in list {
        if condition(item) {
            return true
        }
    }
    return false
}
