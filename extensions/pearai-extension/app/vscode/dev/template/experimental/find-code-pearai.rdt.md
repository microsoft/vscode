# Find code

## Template

### Configuration

```json conversation-template
{
  "id": "find-code-pearai",
  "engineVersion": 0,
  "label": "Find code",
  "description": "Find code in the PearAI codebase.",
  "header": {
    "title": "Find code",
    "useFirstMessageAsTitle": true,
    "icon": {
      "type": "codicon",
      "value": "search"
    }
  },
  "variables": [
    {
      "name": "lastMessage",
      "time": "message",
      "type": "message",
      "property": "content",
      "index": -1
    }
  ],
  "response": {
    "retrievalAugmentation": {
      "type": "similarity-search",
      "variableName": "searchResults",
      "query": "{{lastMessage}}",
      "source": "embedding-file",
      "file": "pearai-repository.json",
      "threshold": 0.7,
      "maxResults": 5
    },
    "maxTokens": 2048,
    "stop": ["Bot:", "Developer:"]
  }
}
```

### Response Prompt

```template-response
## Instructions
Look at the search result and summarize where the code that matches the query is located.

## Query
{{lastMessage}}

## Search Results
{{#each searchResults}}
#### {{file}}
\`\`\`
{{content}}
\`\`\`
{{/each}}

## Task
Summarize where the code that matches the query is located using the search results.

## Response
Bot:
```
