import { Router, Request, Response } from 'express';

export const aiRouter = Router();

aiRouter.post('/chat', async (req: Request, res: Response) => {
  try {
    const { messages, model, apiKey, baseUrl } = req.body;

    if (!apiKey) {
      res.status(400).json({ error: 'API key is required' });
      return;
    }

    const response = await fetch(`${baseUrl || 'https://api.openai.com/v1'}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        messages,
        temperature: 0.7,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      res.status(response.status).json({ error: errorText });
      return;
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'AI request failed' });
  }
});

aiRouter.post('/stream', async (req: Request, res: Response) => {
  try {
    const { messages, model, apiKey, baseUrl } = req.body;

    if (!apiKey) {
      res.status(400).json({ error: 'API key is required' });
      return;
    }

    const response = await fetch(`${baseUrl || 'https://api.openai.com/v1'}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        messages,
        temperature: 0.7,
        max_tokens: 4096,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      res.status(response.status).json({ error: errorText });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body?.getReader();
    if (!reader) {
      res.status(500).json({ error: 'Failed to get response stream' });
      return;
    }

    const decoder = new TextDecoder();
    let running = true;

    while (running) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }

    res.end();
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Stream failed' });
  }
});
