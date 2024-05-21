# Generate Unit Test

Generate unit test cases for the selected code.

## Template

### Configuration

````json conversation-template
{
  "id": "generate-unit-test",
  "engineVersion": 0,
  "label": "Generate Unit Test",
  "tags": ["generate", "test"],
  "description": "Generate a unit test for the selected code.",
  "header": {
    "title": "Generate Unit Test ({{location}})",
    "icon": {
      "type": "codicon",
      "value": "beaker"
    }
  },
  "chatInterface": "instruction-refinement",
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
  "initialMessage": {
    "placeholder": "Generating Test",
    "maxTokens": 1536,
    "stop": ["```"],
    "completionHandler": {
      "type": "update-temporary-editor",
      "botMessage": "Generated unit test.",
      "language": "{{language}}"
    }
  },
  "response": {
    "placeholder": "Updating Test",
    "maxTokens": 1536,
    "stop": ["```"],
    "completionHandler": {
      "type": "update-temporary-editor",
      "botMessage": "Updated unit test.",
      "language": "{{language}}"
    }
  }
}
````

### Initial Message Prompt

```template-initial-message
## Instructions
Write a unit test for the code below.

## Selected Code
\`\`\`
{{selectedText}}
\`\`\`

## Task
Write a unit test that contains test cases for the happy path and for all edge cases.
The programming language is {{language}}.

## Unit Test
\`\`\`

```

### Response Prompt

```template-response
## Instructions
Rewrite the code below as follows: "{{lastMessage}}"

## Code
\`\`\`
{{temporaryEditorContent}}
\`\`\`

## Task
Rewrite the code below as follows: "{{lastMessage}}"

## Answer
\`\`\`

```
