# AI Chat in German

This template lets you chat with PearAI in German.

## Template

### Configuration

```json conversation-template
{
  "id": "chat-de",
  "engineVersion": 0,
  "label": "Starte eine Unterhaltung",
  "description": "Starte eine Unterhaltung mit PearAI.",
  "header": {
    "title": "Neue Unterhaltung",
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
    "placeholder": "Antworte",
    "maxTokens": 1024,
    "stop": ["Roboter:", "Entwickler:"]
  }
}
```

### Response Prompt

```template-response
## Anweisungen
Setze die folgende Unterhaltung fort.
Achte besonders auf die aktuelle Entwickler-Nachricht.

## Aktuelle Nachricht
Entwickler: {{lastMessage}}

{{#if selectedText}}
## Selektierter Quelltext
\`\`\`
{{selectedText}}
\`\`\`
{{/if}}

## Unterhaltung
{{#each messages}}
{{#if (eq author "bot")}}
Roboter: {{content}}
{{else}}
Entwickler: {{content}}
{{/if}}
{{/each}}

## Aufgabe
Schreibe eine Antwort, welche die Unterhaltung fortsetzt.
Achte besonders auf die aktuelle Entwickler-Nachricht.
Ziehe die Möglichkeit in Betracht, dass es keine Lösung geben könnte.
Frage nach, wenn die Nachricht keinen Sinn ergibt oder mehr Informationen benötigt werden.
Benutze den Stil eines Dokumentationsartikels.
Binde Code-Schnipsel (mit Markdown) und Beispiele ein, wo es angebracht ist.

## Antwort
Roboter:
```
