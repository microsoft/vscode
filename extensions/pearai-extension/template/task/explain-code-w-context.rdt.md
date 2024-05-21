# Explain Code

Explain the selected code.

## Template

### Configuration

```json conversation-template
{
  "id": "explain-code-with-context",
  "engineVersion": 0,
  "label": "Explain Code with Context",
  "description": "Explain the selected code in context of all the open files.",
  "tags": ["debug", "understand"],
  "header": {
    "title": "Explain Code ({{location}}) in context",
    "icon": {
      "type": "codicon",
      "value": "book"
    }
  },
  "variables": [
    {
      "name": "openFiles",
      "time": "conversation-start",
      "type": "context"
    },
    {
      "name": "selectedText",
      "time": "conversation-start",
      "type": "selected-text",
      "constraints": [{ "type": "text-length", "min": 1 }]
    },
    {
      "name": "location",
      "time": "conversation-start",
      "type": "selected-location-text"
    },
    {
      "name": "lastMessage",
      "time": "message",
      "type": "message",
      "property": "content",
      "index": -1
    }
  ],
  "response": {
    "maxTokens": 2048,
    "stop": ["Bot:", "Developer:"]
  }
}
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
\`\`\`{{language}}
{{selectedText}}
\`\`\`
{{/if}}

## Code Summary
## Open Files
{{#each openFiles}}
### File: {{name}}
\`\`\`{{language}}
{{content}}
\`\`\`
{{/each}}

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
