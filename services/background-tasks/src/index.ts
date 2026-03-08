// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import Docker from 'dockerode';
import { BackgroundTask, TaskConfig, TaskState, TaskStatus, ResourceLimits } from './types';

const PORT = parseInt(process.env.BACKGROUND_TASKS_PORT ?? '8093', 10);
const STATE_DIR = process.env.STATE_DIR ?? '/data/background';
const STATE_FILE = path.join(STATE_DIR, 'tasks.json');

const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
	memoryMb: 4096,
	cpuCores: 2,
	timeoutMs: 2 * 60 * 60 * 1000, // 2 hours
	maxTokenBudgetUsd: 10,
};

/**
 * Manages background agent tasks that run in Docker containers.
 * Tasks continue running after the IDE is closed and report status on reconnect.
 */
class BackgroundTaskManager {
	private readonly docker: Docker;
	private readonly tasks: Map<string, BackgroundTask> = new Map();
	private readonly stateDir: string;

	constructor(stateDir: string) {
		this.docker = new Docker();
		this.stateDir = stateDir;
	}

	async initialize(): Promise<void> {
		await fs.mkdir(this.stateDir, { recursive: true });
		await fs.mkdir(path.join(this.stateDir, 'results'), { recursive: true });

		try {
			const data = await fs.readFile(STATE_FILE, 'utf-8');
			const persisted = JSON.parse(data) as BackgroundTask[];
			for (const task of persisted) {
				this.tasks.set(task.id, task);
			}
		} catch {
			// No existing state file
		}

		// Check status of any running tasks
		await this.reconcileRunningTasks();
	}

	/**
	 * Create and start a new background task.
	 */
	async createTask(config: TaskConfig): Promise<BackgroundTask> {
		const id = `bg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		const limits = { ...DEFAULT_RESOURCE_LIMITS, ...config.resourceLimits };

		const task: BackgroundTask = {
			id,
			name: config.name,
			description: config.description,
			status: 'pending',
			createdAt: Date.now(),
			startedAt: null,
			completedAt: null,
			containerId: null,
			progress: { percentage: 0, message: 'Queued' },
			resultDir: path.join(this.stateDir, 'results', id),
			resourceLimits: limits,
			tokenUsage: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 },
			branch: config.branch ?? null,
			error: null,
		};

		this.tasks.set(id, task);
		await fs.mkdir(task.resultDir, { recursive: true });

		// Write task-specific CLAUDE.md
		if (config.instructions) {
			await fs.writeFile(path.join(task.resultDir, 'CLAUDE.md'), config.instructions);
		}

		await this.persistState();

		// Start the container
		await this.startTask(task, config);

		return task;
	}

	private async startTask(task: BackgroundTask, config: TaskConfig): Promise<void> {
		try {
			const container = await this.docker.createContainer({
				Image: config.image ?? 'soa-background-agent:latest',
				name: `soa-bg-${task.id}`,
				Env: [
					`TASK_ID=${task.id}`,
					`TASK_NAME=${task.name}`,
					`TASK_DESCRIPTION=${task.description}`,
					`ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY ?? ''}`,
					`MCP_GATEWAY_URL=${process.env.MCP_GATEWAY_URL ?? 'http://mcp-gateway:3100'}`,
					`MAX_TOKEN_BUDGET_USD=${task.resourceLimits.maxTokenBudgetUsd}`,
					`TIMEOUT_MS=${task.resourceLimits.timeoutMs}`,
					...(config.env ?? []),
				],
				HostConfig: {
					Binds: [
						`${config.projectPath ?? '/workspace'}:/workspace:rw`,
						`${task.resultDir}:/results:rw`,
					],
					Memory: task.resourceLimits.memoryMb * 1024 * 1024,
					NanoCpus: task.resourceLimits.cpuCores * 1e9,
					NetworkMode: 'son-of-anton_default',
				},
				Labels: {
					'soa.task.id': task.id,
					'soa.task.name': task.name,
					'soa.service': 'background-tasks',
				},
			});

			await container.start();

			task.containerId = container.id;
			task.status = 'running';
			task.startedAt = Date.now();
			task.progress = { percentage: 0, message: 'Container started' };

			await this.persistState();

			// Monitor the container
			this.monitorTask(task);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			task.status = 'failed';
			task.error = `Failed to start container: ${message}`;
			task.completedAt = Date.now();
			await this.persistState();
		}
	}

	private async monitorTask(task: BackgroundTask): Promise<void> {
		if (!task.containerId) {
			return;
		}

		const container = this.docker.getContainer(task.containerId);

		// Set up timeout
		const timeoutHandle = setTimeout(async () => {
			try {
				await container.stop({ t: 10 });
				task.status = 'timeout';
				task.error = `Task exceeded timeout of ${task.resourceLimits.timeoutMs}ms`;
				task.completedAt = Date.now();
				await this.persistState();
			} catch {
				// Container may have already stopped
			}
		}, task.resourceLimits.timeoutMs);

		try {
			// Wait for container to finish
			const result = await container.wait();

			clearTimeout(timeoutHandle);

			if (result.StatusCode === 0) {
				task.status = 'completed';
				task.progress = { percentage: 100, message: 'Task completed successfully' };
			} else {
				task.status = 'failed';
				task.error = `Container exited with code ${result.StatusCode}`;
			}

			task.completedAt = Date.now();

			// Read progress file if it exists
			await this.readTaskProgress(task);

			await this.persistState();

			// Clean up container
			try {
				await container.remove();
			} catch {
				// Best effort cleanup
			}
		} catch (err) {
			clearTimeout(timeoutHandle);
			const message = err instanceof Error ? err.message : String(err);
			task.status = 'failed';
			task.error = message;
			task.completedAt = Date.now();
			await this.persistState();
		}
	}

	private async readTaskProgress(task: BackgroundTask): Promise<void> {
		try {
			const progressFile = path.join(task.resultDir, 'progress.json');
			const data = await fs.readFile(progressFile, 'utf-8');
			const progress = JSON.parse(data);
			task.progress = progress;
			if (progress.tokenUsage) {
				task.tokenUsage = progress.tokenUsage;
			}
			if (progress.branch) {
				task.branch = progress.branch;
			}
		} catch {
			// No progress file
		}
	}

	/**
	 * Reconcile tasks that were marked as running against actual Docker state.
	 */
	private async reconcileRunningTasks(): Promise<void> {
		for (const task of this.tasks.values()) {
			if (task.status === 'running' && task.containerId) {
				try {
					const container = this.docker.getContainer(task.containerId);
					const info = await container.inspect();

					if (!info.State.Running) {
						task.status = info.State.ExitCode === 0 ? 'completed' : 'failed';
						task.completedAt = Date.now();
						if (info.State.ExitCode !== 0) {
							task.error = `Container exited with code ${info.State.ExitCode}`;
						}
						await this.readTaskProgress(task);
					} else {
						// Still running, re-attach monitor
						this.monitorTask(task);
					}
				} catch {
					// Container no longer exists
					task.status = 'failed';
					task.error = 'Container not found on startup — may have been removed';
					task.completedAt = Date.now();
				}
			}
		}
		await this.persistState();
	}

	/**
	 * Cancel a running task.
	 */
	async cancelTask(taskId: string): Promise<boolean> {
		const task = this.tasks.get(taskId);
		if (!task || task.status !== 'running' || !task.containerId) {
			return false;
		}

		try {
			const container = this.docker.getContainer(task.containerId);
			await container.stop({ t: 10 });
			task.status = 'cancelled';
			task.completedAt = Date.now();
			await this.persistState();
			return true;
		} catch {
			return false;
		}
	}

	getTask(taskId: string): BackgroundTask | undefined {
		return this.tasks.get(taskId);
	}

	getAllTasks(): BackgroundTask[] {
		return [...this.tasks.values()].sort((a, b) => b.createdAt - a.createdAt);
	}

	getActiveTasks(): BackgroundTask[] {
		return this.getAllTasks().filter(t => t.status === 'running' || t.status === 'pending');
	}

	getCompletedTasks(): BackgroundTask[] {
		return this.getAllTasks().filter(t =>
			t.status === 'completed' || t.status === 'failed' ||
			t.status === 'cancelled' || t.status === 'timeout'
		);
	}

	private async persistState(): Promise<void> {
		const data = JSON.stringify([...this.tasks.values()], null, '\t');
		await fs.writeFile(STATE_FILE, data);
	}
}

// --- HTTP API ---
const taskManager = new BackgroundTaskManager(STATE_DIR);

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
	const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

	// Health check
	if (url.pathname === '/health') {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ status: 'ok', service: 'background-tasks' }));
		return;
	}

	// List all tasks
	if (url.pathname === '/tasks' && req.method === 'GET') {
		const filter = url.searchParams.get('filter');
		let tasks: BackgroundTask[];

		switch (filter) {
			case 'active':
				tasks = taskManager.getActiveTasks();
				break;
			case 'completed':
				tasks = taskManager.getCompletedTasks();
				break;
			default:
				tasks = taskManager.getAllTasks();
		}

		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(tasks, null, 2));
		return;
	}

	// Create a new task
	if (url.pathname === '/tasks' && req.method === 'POST') {
		const body = await readBody(req);
		const config = JSON.parse(body) as TaskConfig;
		const task = await taskManager.createTask(config);

		res.writeHead(201, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(task, null, 2));
		return;
	}

	// Get a specific task
	const taskMatch = url.pathname.match(/^\/tasks\/([^/]+)$/);
	if (taskMatch && req.method === 'GET') {
		const task = taskManager.getTask(taskMatch[1]);
		if (!task) {
			res.writeHead(404, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Task not found' }));
			return;
		}
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(task, null, 2));
		return;
	}

	// Cancel a task
	const cancelMatch = url.pathname.match(/^\/tasks\/([^/]+)\/cancel$/);
	if (cancelMatch && req.method === 'POST') {
		const cancelled = await taskManager.cancelTask(cancelMatch[1]);
		res.writeHead(cancelled ? 200 : 400, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ cancelled }));
		return;
	}

	// Get task results
	const resultsMatch = url.pathname.match(/^\/tasks\/([^/]+)\/results$/);
	if (resultsMatch && req.method === 'GET') {
		const task = taskManager.getTask(resultsMatch[1]);
		if (!task) {
			res.writeHead(404, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Task not found' }));
			return;
		}

		try {
			const files = await fs.readdir(task.resultDir);
			const results: Record<string, string> = {};
			for (const file of files) {
				const content = await fs.readFile(path.join(task.resultDir, file), 'utf-8');
				results[file] = content;
			}
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(results, null, 2));
		} catch {
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({}));
		}
		return;
	}

	res.writeHead(404);
	res.end('Not found');
}

function readBody(req: http.IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		req.on('data', (chunk: Buffer) => chunks.push(chunk));
		req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
		req.on('error', reject);
	});
}

const httpServer = http.createServer(async (req, res) => {
	try {
		await handleRequest(req, res);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		res.writeHead(500, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: message }));
	}
});

taskManager.initialize().then(() => {
	httpServer.listen(PORT, () => {
		console.log(`[background-tasks] Listening on port ${PORT}`);
	});
});
