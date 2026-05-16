import type { AIChatRequest, AIChatResponse, AICompletionRequest, AICompletionResponse, AIMessage } from '../shared/types.js';
import { generateId } from '../shared/utils.js';
import { getSystemPrompt, getCompletionPrompt, buildContextMessages } from './prompts.js';

export interface AIConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export async function chatWithAI(
  request: AIChatRequest,
  config: AIConfig
): Promise<AIChatResponse> {
  if (!config.apiKey) {
    return {
      message: {
        id: generateId(),
        role: 'assistant',
        content: 'Please configure your AI API key in Settings (Ctrl+,) to use AI features.',
        timestamp: Date.now(),
      },
    };
  }

  const messages = buildContextMessages(request);

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0.7,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || 'No response from AI.';

  return {
    message: {
      id: generateId(),
      role: 'assistant',
      content,
      timestamp: Date.now(),
    },
    usage: data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : undefined,
  };
}

export async function completeWithAI(
  request: AICompletionRequest,
  config: AIConfig
): Promise<AICompletionResponse> {
  if (!config.apiKey) {
    return { suggestion: '', confidence: 0 };
  }

  const prompt = getCompletionPrompt(request);

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: 'You are a code completion assistant. Respond with ONLY the code completion, no explanations.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 256,
      stop: ['\n\n'],
    }),
  });

  if (!response.ok) {
    return { suggestion: '', confidence: 0 };
  }

  const data = await response.json();
  const suggestion = data.choices?.[0]?.message?.content || '';

  return {
    suggestion: suggestion.trim(),
    confidence: 0.8,
  };
}

export async function streamChatWithAI(
  request: AIChatRequest,
  config: AIConfig,
  onChunk: (chunk: string) => void,
  onDone: () => void,
  onError: (error: string) => void
): Promise<void> {
  if (!config.apiKey) {
    onChunk('Please configure your AI API key in Settings (Ctrl+,) to use AI features.');
    onDone();
    return;
  }

  const messages = buildContextMessages(request);

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.7,
        max_tokens: 4096,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      onError(`AI API error (${response.status}): ${errorText}`);
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      onError('Failed to get response stream');
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        if (data === '[DONE]') {
          onDone();
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            onChunk(content);
          }
        } catch {
          // skip unparseable chunks
        }
      }
    }

    onDone();
  } catch (err) {
    onError(err instanceof Error ? err.message : 'Unknown error');
  }
}
