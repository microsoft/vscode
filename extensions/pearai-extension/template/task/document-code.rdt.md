# Document Code

Document the selected code.

## Template

### Configuration

````json conversation-template
{
  "id": "document-code",
  "engineVersion": 0,
  "label": "Document Code",
  "tags": ["generate", "document"],
  "description": "Document the selected code.",
  "header": {
    "title": "Document Code {{location}}",
    "icon": {
      "type": "codicon",
      "value": "output"
    }
  },
  "variables": [
    {
      "name": "selectedText",
      "time": "conversation-start",
      "type": "selected-text",
      "constraints": [{ "type": "text-length", "min": 1 }]
    },
    {
      "name": "language",
      "time": "conversation-start",
      "type": "language",
      "constraints": [{ "type": "text-length", "min": 1 }]
    }
  ],
  "chatInterface": "instruction-refinement",
  "initialMessage": {
    "placeholder": "Documenting selection",
    "maxTokens": 2048,
    "stop": ["```"],
    "completionHandler": {
      "type": "active-editor-diff",
      "botMessage": "Generated documentation."
    }
  },
  "response": {
    "placeholder": "Documenting selection",
    "maxTokens": 2048,
    "stop": ["```"],
    "completionHandler": {
      "type": "active-editor-diff",
      "botMessage": "Generated documentation."
    }
  }
}
````

### Initial Message Prompt

```template-initial-message
## Instructions
Document the code on function/method/class level.
Avoid line comments.
The programming language is {{language}}.

## Code
\`\`\`
{{selectedText}}
\`\`\`

## Documented Code
\`\`\`

```

### Response Prompt

```template-response
## Instructions
Document the code on function/method/class level.
Avoid line comments.
The programming language is {{language}}.

Consider the following instructions:
{{#each messages}}
{{#if (eq author "user")}}
{{content}}
{{/if}}
{{/each}}

## Code
\`\`\`
{{selectedText}}
\`\`\`

## Documented Code
\`\`\`

```
