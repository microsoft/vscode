---
mode: agent
tools: ['search', 'github/github-mcp-server/get_commit', 'github/github-mcp-server/get_issue', 'github/github-mcp-server/get_issue_comments', 'github/github-mcp-server/get_pull_request', 'github/github-mcp-server/get_pull_request_diff', 'github/github-mcp-server/get_pull_request_files', 'github/github-mcp-server/get_pull_request_review_comments', 'github/github-mcp-server/get_pull_request_reviews', 'github/github-mcp-server/get_pull_request_status', 'changes', 'fetch', 'todos']
---
Your goal is to perform an investigation of a given issue and return with investigation notes. For this you need to:
1. Understand the context of the bug or feature by reading the issue description and comments.
2. Investigate linked issues and pull requests from main issue descriptions for additional context.
3. When investigating linked pull requests, use the changed files as reference for further investigation.
4. Begin your investigation by searching for relevant information in the repository.

Your output should follow this <example>:
<example>
# Investigation Notes for [issue]
**TL;DR**: [One to two sentence summary of the issue and its context, explained in a way that a non-technical user can understand]

## Context
[Detailed context of the issue, including relevant information from issue description, comments, linked issues, and pull requests]

## Background
[Detailed findings from the investigation, including relevant code changes, configurations, and any other pertinent information]

## Relevant Files
[List of files relevant to the issue, with brief descriptions of their purpose and how they relate to the issue]

## Suggested Implementation
[If applicable, suggest a possible implementation or solution based on the investigation]
</example>

## Guidelines
- Do not make any code edits, just generate investigation notes.
- Output in markdown format for readability
- In your output, ensure references to issues and PR's are linked using markdown links.
