# Task: Area Label Classification

Identify 3-5 relevant area labels for a VS Code issue based on content analysis.

## Workflow

1. Read the Area Label Examples below for classification patterns
2. Use the Area Labels table below for the available labels
3. Analyze the issue's core problem domain, affected components, and features
4. Select 3-5 labels using matching patterns below

## Matching Patterns

When selecting labels, apply this prioritization:

1. **Direct semantic match** - Label descriptions directly match the issue's domain
2. **Multi-token relevance** - Labels with multiple matching concepts score higher
3. **Specific over generic** - Prefer `chat-agents-view` over `chat` when both apply
4. **Context-based** - Include related labels when context strongly suggests involvement

**Priority Ranking**:
- Exact phrase match (e.g., "chat agents view" → `chat-agents-view`) - **Highest**
- Multi-token match (multiple relevant terms) - **High**
- Single token match (one relevant term) - **Medium**
- Generic fallback - **Use sparingly**

## Output

Up to 5 labels, one per line, ordered by relevance (most relevant first).

{{#runtime-import .github/workflows/shared/issue-triage/area-label-examples.md}}

{{#runtime-import .github/workflows/shared/issue-triage/area-label-list.md}}
