import { Router, Request, Response } from 'express';

export const settingsRouter = Router();

// In-memory settings for the REST API layer
const settings: Record<string, unknown> = {
  theme: 'dark',
  fontSize: 14,
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
  tabSize: 2,
  wordWrap: 'off',
  minimap: true,
  autoSave: true,
  autoSaveDelay: 1000,
  terminalFontSize: 13,
  aiProvider: 'openai',
  aiApiKey: '',
  aiModel: 'gpt-4o-mini',
  aiBaseUrl: 'https://api.openai.com/v1',
};

settingsRouter.get('/', (_req: Request, res: Response) => {
  res.json(settings);
});

settingsRouter.put('/', (req: Request, res: Response) => {
  const updates = req.body;
  Object.assign(settings, updates);
  res.json(settings);
});

settingsRouter.post('/reset', (_req: Request, res: Response) => {
  Object.keys(settings).forEach((key) => delete settings[key]);
  Object.assign(settings, {
    theme: 'dark',
    fontSize: 14,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
    tabSize: 2,
    wordWrap: 'off',
    minimap: true,
    autoSave: true,
    autoSaveDelay: 1000,
    terminalFontSize: 13,
    aiProvider: 'openai',
    aiApiKey: '',
    aiModel: 'gpt-4o-mini',
    aiBaseUrl: 'https://api.openai.com/v1',
  });
  res.json(settings);
});
