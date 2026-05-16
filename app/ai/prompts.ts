import type { AIChatRequest, AICompletionRequest } from '../shared/types.js';

export function getSystemPrompt(action?: string): string {
  const base = `You are AI Studio, an intelligent coding assistant built into a desktop IDE. You help developers write, understand, debug, and improve code.

Guidelines:
- Be concise and practical
- Provide working code examples when relevant
- Use markdown formatting for code blocks with language tags
- When suggesting fixes, explain what was wrong briefly
- When generating code, follow modern best practices
- Be friendly but professional`;

  switch (action) {
    case 'explain':
      return `${base}\n\nThe user wants you to explain selected code. Break down what the code does clearly and concisely.`;
    case 'fix':
      return `${base}\n\nThe user wants you to fix code errors. Identify the issues and provide corrected code with brief explanations.`;
    case 'generate':
      return `${base}\n\nThe user wants you to generate code. Create clean, well-structured code based on their description.`;
    case 'suggest-terminal':
      return `${base}\n\nThe user wants terminal command suggestions. Provide the appropriate shell commands for their task. Use code blocks for commands.`;
    default:
      return base;
  }
}

export function getCompletionPrompt(request: AICompletionRequest): string {
  return `Complete the following ${request.language} code. Continue from where the cursor is (marked with |).

Context:
\`\`\`${request.language}
${request.context}
\`\`\`

Current line and cursor position:
\`\`\`
${request.prompt}|
\`\`\`

Provide only the completion text, no explanation.`;
}

export function buildContextMessages(
  request: AIChatRequest
): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: getSystemPrompt(request.action) },
  ];

  if (request.selectedCode) {
    const codeContext = `The user has selected the following code:\n\`\`\`\n${request.selectedCode}\n\`\`\`\n`;
    messages.push({ role: 'system', content: codeContext });
  }

  if (request.context) {
    messages.push({
      role: 'system',
      content: `Current file context:\n${request.context}`,
    });
  }

  for (const msg of request.messages) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  return messages;
}
