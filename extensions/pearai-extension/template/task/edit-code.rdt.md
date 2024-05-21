# Edit Code

Generate code using instructions.

## Template

### Configuration

````json conversation-template
{
  "id": "edit-code",
  "engineVersion": 0,
  "label": "Edit Code",
  "tags": ["edit"],
  "description": "Instruct PearAI to edit the code. Creates a diff that you can review.",
  "header": {
    "title": "Edit Code {{location}}",
    "icon": {
      "type": "codicon",
      "value": "edit"
    }
  },
  "chatInterface": "instruction-refinement",
  "variables": [
    {
      "name": "selectedText",
      "time": "conversation-start",
      "type": "selected-text",
      "constraints": [{ "type": "text-length", "min": 1 }]
    }
  ],
  "response": {
    "placeholder": "Generating edit",
    "maxTokens": 1536,
    "stop": ["```"],
    "completionHandler": {
      "type": "active-editor-diff",
      "botMessage": "Generated edit."
    }
  }
}
````

### Response Prompt

```template-response
## Instructions
Edit the code below as follows:
{{#each messages}}
{{#if (eq author "user")}}
{{content}}
{{/if}}
{{/each}}

## Code
\`\`\`
{{selectedText}}
\`\`\`

## Answer
\`\`\`

```
