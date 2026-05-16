import express from 'express';
import cors from 'cors';
import { aiRouter } from './routes/ai.js';
import { authRouter } from './routes/auth.js';
import { projectsRouter } from './routes/projects.js';
import { settingsRouter } from './routes/settings.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0', timestamp: Date.now() });
});

// API routes
app.use('/api/ai', aiRouter);
app.use('/api/auth', authRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/settings', settingsRouter);

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Server error:', err.message);
  res.status(500).json({ error: err.message });
});

export function startServer(): void {
  app.listen(PORT, () => {
    console.log(`AI Studio backend running on port ${PORT}`);
  });
}

// Start if run directly
if (process.argv[1]?.includes('server')) {
  startServer();
}

export default app;
