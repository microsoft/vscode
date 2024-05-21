# AI Chat in French

This template lets you chat with PearAI in French.

## Template

### Configuration

```json conversation-template
{
  "id": "chat-fr",
  "engineVersion": 0,
  "label": "Commencer une discussion",
  "description": "Commencer une discussion avec PearAI.",
  "header": {
    "title": "Nouvelle discussion",
    "useFirstMessageAsTitle": true,
    "icon": {
      "type": "codicon",
      "value": "comment-discussion"
    }
  },
  "variables": [
    {
      "name": "selectedText",
      "time": "conversation-start",
      "type": "selected-text"
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
    "maxTokens": 1024,
    "stop": ["Robot:", "Développeur:"]
  }
}
```

### Response Prompt

```template-response
## Instructions
Continue la conversation ci-dessous.
Fais particulièrement attention aux requêtes en cours du développeur.

## Requête en cours
Développeur: {{lastMessage}}

{{#if selectedText}}
## Code Sélectionné
\`\`\`
{{selectedText}}
\`\`\`
{{/if}}

## Conversation
{{#each messages}}
{{#if (eq author "bot")}}
Robot: {{content}}
{{else}}
Développeur: {{content}}
{{/if}}
{{/each}}

## Tâche
Écris une réponse qui poursuit la conversation.
Fais particulièrement attention à la requête en cours du développeur.
Considère la possibilité qu’il n’y ait pas de solution possible.
Demande des clarifications si le message n’a pas de sens ou que plus de données sont nécessaires pour répondre.
N’inclus aucun lien.
Inclus des snippets de code (en Markdown) et des exemples lorsque c’est approprié.

## Réponse
Robot:
```
