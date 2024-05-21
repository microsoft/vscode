# Generate Code

Generate code using instructions.

## Template

### Configuration

````json conversation-template
{
  "id": "generate-code",
  "engineVersion": 0,
  "label": "Generate Code",
  "tags": ["generate"],
  "description": "Generate code using instructions.",
  "header": {
    "title": "Generate Code",
    "icon": {
      "type": "codicon",
      "value": "wand"
    }
  },
  "chatInterface": "instruction-refinement",
  "variables": [],
  "response": {
    "placeholder": "Generating code",
    "maxTokens": 2048,
    "stop": ["```"],
    "completionHandler": {
      "type": "update-temporary-editor",
      "botMessage": "Generated code."
    }
  }
}
````

### Response Prompt

```template-response
## Instructions
Generate code for the following specification.

## Specification
{{#each messages}}
{{#if (eq author "user")}}
{{content}}
{{/if}}
{{/each}}

## Instructions
Generate code for the specification.

## Code
\`\`\`

```
