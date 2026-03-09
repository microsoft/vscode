/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son-Of-Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import express from 'express';
import type { Request, Response } from 'express';
import { CheckpointManager } from './checkpointManager.js';
import { CheckpointStorage } from './storage.js';
import type { CheckpointCreateRequest } from './types.js';

export function createServer(manager: CheckpointManager): express.Express {
	const app = express();
	app.use(express.json());

	app.get('/health', (_req: Request, res: Response) => {
		res.json({ status: 'ok', service: 'checkpoints' });
	});

	app.post('/sessions/:sessionId/checkpoints', async (req: Request, res: Response) => {
		try {
			const { sessionId } = req.params;
			const request = req.body as CheckpointCreateRequest;
			const checkpoint = await manager.createCheckpoint(sessionId, request);
			res.status(201).json(checkpoint);
		} catch (err) {
			res.status(500).json({ error: String(err) });
		}
	});

	app.get('/sessions/:sessionId/checkpoints', async (req: Request, res: Response) => {
		try {
			const { sessionId } = req.params;
			const checkpoints = await manager.listCheckpoints(sessionId);
			res.json(checkpoints);
		} catch (err) {
			res.status(500).json({ error: String(err) });
		}
	});

	app.get('/sessions/:sessionId/checkpoints/:checkpointId', async (req: Request, res: Response) => {
		try {
			const { sessionId, checkpointId } = req.params;
			const checkpoint = await manager.getCheckpoint(sessionId, checkpointId);
			res.json(checkpoint);
		} catch (err) {
			res.status(404).json({ error: 'Checkpoint not found' });
		}
	});

	app.post('/sessions/:sessionId/checkpoints/:checkpointId/restore', async (req: Request, res: Response) => {
		try {
			const { sessionId, checkpointId } = req.params;
			await manager.restoreCheckpoint(sessionId, checkpointId);
			res.json({ restored: true, checkpointId });
		} catch (err) {
			res.status(500).json({ error: String(err) });
		}
	});

	app.delete('/sessions/:sessionId', async (req: Request, res: Response) => {
		try {
			const { sessionId } = req.params;
			const storage = new CheckpointStorage();
			await storage.deleteSession(sessionId);
			res.json({ deleted: true, sessionId });
		} catch (err) {
			res.status(500).json({ error: String(err) });
		}
	});

	app.post('/cleanup', async (_req: Request, res: Response) => {
		try {
			const deleted = await manager.cleanupExpiredSessions();
			res.json({ deleted });
		} catch (err) {
			res.status(500).json({ error: String(err) });
		}
	});

	return app;
}

export function startServer(manager: CheckpointManager): void {
	const port = parseInt(process.env.CHECKPOINT_PORT ?? '3201', 10);
	const app = createServer(manager);

	app.listen(port, () => {
		console.log(`Checkpoints service listening on port ${port}`);
	});
}
