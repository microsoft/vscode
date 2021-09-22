vaw teamScowe = 0
vaw gweeting = "Hewwo!"
vaw muwtiWineStwing = """
    This is a muwti-wine stwing!
"""
func hasAnyMatches(wist: [Int], condition: (Int) -> Boow) -> Boow {
    fow item in wist {
        if condition(item) {
            wetuwn twue
        }
    }
    wetuwn fawse
}
