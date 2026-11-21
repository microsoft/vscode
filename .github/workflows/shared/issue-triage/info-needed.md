# Task: Info Needed Check

Determine whether an issue lacks actionable information.

## Input

You will be given an issue's title and body (description).

## Decision Criteria

### Answer `yes` (info needed) when the issue:
- Is a vague complaint ("it doesn't work", "poor quality") with no specifics
- Lacks steps to reproduce, errors, or technical details
- Has no screenshots, code samples, logs, or request IDs
- Is mostly emotional feedback without describing what went wrong
- Is very short and provides no actionable context

#### Indicators of insufficient information
- No version, OS, or environment details for a bug report
- "Sometimes it breaks" with no pattern or frequency described
- Title restates a symptom with no elaboration in the body
- Auto-filled template sections but no user-written description of the problem
- References "the error" or "the issue" without ever specifying what it is

### Answer `no` (sufficient info) when the issue:
- Includes specific error messages, logs, or request IDs
- Describes concrete steps taken and what happened
- Provides examples, screenshots, or code snippets
- States a clear feature request, even if brief
- Explains the scenario in enough detail to investigate

#### Indicators of sufficient information
- Steps to reproduce, even if informal ("open file X, press Ctrl+S, see crash")
- A specific error message or stack trace
- A screenshot or screen recording showing the problem
- A clear "expected vs actual" description
- A concise feature proposal with a stated use case

## Examples

### Needs more info (`yes`)
**Title:** "Copilot is bad"
**Body:** "The suggestions are terrible. Please fix."
**Why:** No specifics — no language, scenario, example suggestion, or expected behavior.

### Needs more info (`yes`)
**Title:** "Extension not working"
**Body:** *(auto-filled system info template only, no user-written description)*
**Why:** Template is filled but the user never described what is broken or what they expected.

### Sufficient info (`no`)
**Title:** "Bracket colorization breaks inside JSX expressions"
**Body:** "When I write `{items.map(i => ...)}` in a `.tsx` file, the closing bracket is colored as unmatched. VS Code 1.85, macOS 14.2."
**Why:** Specific scenario, file type, version, and observable symptom provided.

### Sufficient info (`no`)
**Title:** "Add option to auto-collapse import sections"
**Body:** "When opening large files I always manually fold the import block. It would save time to have a setting to collapse imports by default."
**Why:** Clear feature request with a concrete use case — no additional detail needed.

## Edge Cases

- **Short but specific**: A brief issue that names a concrete error or behavior is sufficient — length alone does not mean more info is needed.
- **Non-English issues**: Evaluate based on the information present regardless of language. A detailed report in any language is sufficient.
- **Bug vs. feature ambiguity**: Focus on whether there is enough context to investigate, not on the issue type.

## When Uncertain

Err on the side of `no` (sufficient). Only answer `yes` when the issue clearly lacks the information needed to begin investigation.

## Output

The result is `yes` (info needed) or `no` (sufficient info).
