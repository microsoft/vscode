export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

/**
 * Send chat messages to OpenAI's Chat Completions API using the
 * environment variable `OPENAI_API_KEY` for authentication. The
 * response is streamed and yielded chunk by chunk.
 */
export async function* sendChat(messages: ChatMessage[]): AsyncGenerator<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('OPENAI_API_KEY is not set');
    }

    console.debug('[chat] calling OpenAI with', messages.length, 'messages');
    const start = Date.now();

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            stream: true,
            messages
        })
    });

    console.debug('[chat] OpenAI response status', response.status);

    if (!response.ok || !response.body) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let message = '';
    let usage: any;
    while (true) {
        const { value, done } = await reader.read();
        if (done) {
            break;
        }
        buffer += decoder.decode(value, { stream: true });
        let lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) {
                continue;
            }
            const data = trimmed.replace(/^data:\s*/, '');
            if (data === '[DONE]') {
                const duration = Date.now() - start;
                if (process.env.DEBUG_CHAT === '1') {
                    const promptTokens = estimateTokens(messages.map(m => m.content).join('\n'));
                    const completionTokens = usage?.completion_tokens ?? estimateTokens(message);
                    const totalTokens = usage?.total_tokens ?? promptTokens + completionTokens;
                    console.debug(`[chat] tokens prompt=${promptTokens} completion=${completionTokens} total=${totalTokens} duration=${duration}ms`);
                }
                return;
            }
            try {
                const json = JSON.parse(data);
                if (json.usage) {
                    usage = json.usage;
                }
                const text = json.choices?.[0]?.delta?.content;
                if (text) {
                    message += text;
                    yield text;
                }
            } catch {
                // ignore malformed JSON chunks
            }
        }
    }
}

function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}
