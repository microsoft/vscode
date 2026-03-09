import express from 'express';
import { WalkthroughGenerator } from './walkthroughGenerator.js';
import { WalkthroughStorage } from './storage.js';
import { WalkthroughGenerateRequest, WalkthroughRenderOptions } from './types.js';

export function createServer(options?: {
	modelRouterUrl?: string;
	storagePath?: string;
}): express.Application {
	const app = express();
	app.use(express.json());

	const generator = new WalkthroughGenerator({
		modelRouterUrl: options?.modelRouterUrl ?? process.env.MODEL_ROUTER_URL ?? 'http://localhost:3100',
	});
	const storage = new WalkthroughStorage(options?.storagePath);

	app.get('/health', (_req, res) => {
		res.json({ status: 'ok', service: 'walkthrough' });
	});

	app.post('/walkthroughs/generate', async (req, res) => {
		try {
			const request = req.body as WalkthroughGenerateRequest;

			if (!request.taskId || !request.taskDescription || !request.specialist || !request.diff) {
				res.status(400).json({ error: 'Missing required fields: taskId, taskDescription, specialist, diff' });
				return;
			}

			const walkthrough = await generator.generate(request);
			await storage.save(walkthrough);
			res.json(walkthrough);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Unknown error';
			res.status(500).json({ error: message });
		}
	});

	app.get('/walkthroughs/search', async (req, res) => {
		try {
			const query = req.query.q as string;
			if (!query) {
				res.status(400).json({ error: 'Missing query parameter: q' });
				return;
			}
			const results = await storage.search(query);
			res.json(results);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Unknown error';
			res.status(500).json({ error: message });
		}
	});

	app.get('/walkthroughs/:taskId/render', async (req, res) => {
		try {
			const walkthrough = await storage.load(req.params.taskId);
			if (!walkthrough) {
				res.status(404).json({ error: 'Walkthrough not found' });
				return;
			}

			const format = (req.query.format as string) || 'text';
			if (format !== 'text' && format !== 'markdown' && format !== 'json') {
				res.status(400).json({ error: 'Invalid format. Use text, markdown, or json' });
				return;
			}

			const options: WalkthroughRenderOptions = {
				format,
				includeTraces: req.query.includeTraces === 'true',
			};

			const rendered = generator.render(walkthrough, options);

			if (format === 'json') {
				res.type('application/json').send(rendered);
			} else if (format === 'markdown') {
				res.type('text/markdown').send(rendered);
			} else {
				res.type('text/plain').send(rendered);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Unknown error';
			res.status(500).json({ error: message });
		}
	});

	app.get('/walkthroughs/:taskId', async (req, res) => {
		try {
			const walkthrough = await storage.load(req.params.taskId);
			if (!walkthrough) {
				res.status(404).json({ error: 'Walkthrough not found' });
				return;
			}
			res.json(walkthrough);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Unknown error';
			res.status(500).json({ error: message });
		}
	});

	app.get('/walkthroughs', async (_req, res) => {
		try {
			const taskIds = await storage.list();
			res.json(taskIds);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Unknown error';
			res.status(500).json({ error: message });
		}
	});

	app.delete('/walkthroughs/:taskId', async (req, res) => {
		try {
			await storage.delete(req.params.taskId);
			res.json({ deleted: true });
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Unknown error';
			res.status(500).json({ error: message });
		}
	});

	return app;
}

export function startServer(): void {
	const port = parseInt(process.env.WALKTHROUGH_PORT ?? '3202', 10);
	const app = createServer();

	app.listen(port, () => {
		console.log(`Walkthrough service listening on port ${port}`);
	});
}
