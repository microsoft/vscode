# Explain Code

Diagnoses any errors or warnings the selected code.

## Template

### Configuration

```json conversation-template
{
  "id": "diagnose-errors",
  "engineVersion": 0,
  "label": "Diagnose Errors",
  "tags": ["debug"],
  "description": "Diagnose errors and warnings in the selected code.",
  "header": {
    "title": "Diagnose Errors ({{location}})",
    "icon": {
      "type": "codicon",
      "value": "search-fuzzy"
    }
  },
  "variables": [
    {
      "name": "selectedTextWithDiagnostics",
      "time": "conversation-start",
      "type": "selected-text-with-diagnostics",
      "severities": ["error", "warning"],
      "constraints": [{ "type": "text-length", "min": 1 }]
    },
    {
      "name": "location",
      "time": "conversation-start",
      "type": "selected-location-text"
    },
    {
      "name": "firstMessage",
      "time": "message",
      "type": "message",
      "property": "content",
      "index": 0
    },
    {
      "name": "lastMessage",
      "time": "message",
      "type": "message",
      "property": "content",
      "index": -1
    }
  ],
  "initialMessage": {
    "placeholder": "Diagnosing errors",
    "maxTokens": 512
  },
  "response": {
    "maxTokens": 1024,
    "stop": ["Bot:", "Developer:"]
  }
}
```

### Initial Message Prompt

```template-initial-message
## Instructions
Read through the errors and warnings in the code below.

## Selected Code
\`\`\`
{{selectedTextWithDiagnostics}}
\`\`\`

## Task
For each error or warning, write a paragraph that describes the most likely cause and a potential fix.
Include code snippets where appropriate.

## Answer

```

### Response Prompt

```template-response
## Instructions
Continue the conversation below.
Pay special attention to the current developer request.

## Current Request
Developer: {{lastMessage}}

{{#if selectedText}}
## Selected Code
\`\`\`
{{selectedTextWithDiagnostics}}
\`\`\`
{{/if}}

## Code Summary
{{firstMessage}}

## Conversation
{{#each messages}}
{{#if (neq @index 0)}}
{{#if (eq author "bot")}}
Bot: {{content}}
{{else}}
Developer: {{content}}
{{/if}}
{{/if}}
{{/each}}

## Task
Write a response that continues the conversation.
Stay focused on current developer request.
Consider the possibility that there might not be a solution.
Ask for clarification if the message does not make sense or more input is needed.
Use the style of a documentation article.
Omit any links.
Include code snippets (using Markdown) and examples where appropriate.

## Response
Bot:
```
