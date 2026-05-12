// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.
//
// SECURITY NOTES (do not remove without re-evaluating the full threat model):
//
// This service mounts /var/run/docker.sock and creates containers on behalf of
// callers. That means anyone who can reach the HTTP port effectively owns the
// Docker daemon on the host. To mitigate that:
//
//   1. The service refuses to start unless BACKGROUND_TASK_API_TOKEN is set.
//      All write endpoints (POST /tasks, POST /tasks/:id/cancel) require an
//      Authorization: Bearer <token> header matching that env var.
//   2. The `image` field on incoming task configs is matched against a strict
//      allowlist (built-in `soa-background-agent:latest` plus anything in
//      BACKGROUND_TASK_ALLOWED_IMAGES). Unknown images are rejected with 400.
//   3. The `projectPath` bind-mount source is resolved and must live inside
//      BACKGROUND_TASK_WORKSPACE_ROOT (default /workspace). Path traversal is
//      rejected with 400.
//   4. The docker-compose.yml entry for this service does NOT publish a port
//      to the host by default. Other in-stack services reach it through
//      sandbox-net.

import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import Docker from 'dockerode';
import { BackgroundTask, TaskConfig, TaskState, TaskStatus, ResourceLimits } from './types';

const PORT = parseInt(process.env.BACKGROUND_TASKS_PORT ?? '8093', 10);
const STATE_DIR = process.env.STATE_DIR ?? '/data/background';
const STATE_FILE = path.join(STATE_DIR, 'tasks.json');

const API_TOKEN = process.env.BACKGROUND_TASK_API_TOKEN ?? '';

const BUILTIN_ALLOWED_IMAGE = 'soa-background-agent:latest';
const ALLOWED_IMAGES = new Set<string>([
	BUILTIN_ALLOWED_IMAGE,
	...(process.env.BACKGROUND_TASK_ALLOWED_IMAGES ?? '')
		.split(',')
		.map(s => s.trim())
		.filter(Boolean),
]);

const WORKSPACE_ROOT = path.resolve(process.env.BACKGROUND_TASK_WORKSPACE_ROOT ?? '/workspace');

const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
	memoryMb: 4096,
	cpuCores: 2,
	timeoutMs: 2 * 60 * 60 * 1000, // 2 hours
	maxTokenBudgetUsd: 10,
};

/**
 * Validation error thrown by request handlers. Surfaces as HTTP 400.
 */
class BadRequestError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'BadRequestError';
	}
}

/**
 * Validate that `image` is in the configured allowlist.
 */
function assertImageAllowed(image: string): void {
	if (!ALLOWED_IMAGES.has(image)) {
		throw new BadRequestError(
			`Image "${image}" is not in the allowlist. Add it to BACKGROUND_TASK_ALLOWED_IMAGES to permit it.`
		);
	}
}

/**
 * Validate that `projectPath` resolves inside the configured workspace root.
 * Returns the resolved absolute path.
 */
function assertProjectPathAllowed(projectPath: string): string {
	const resolved = path.resolve(projectPath);
	if (resolved !== WORKSPACE_ROOT && !resolved.startsWith(WORKSPACE_ROOT + path.sep)) {
		throw new BadRequestError(
			`projectPath "${projectPath}" must be inside BACKGROUND_TASK_WORKSPACE_ROOT (${WORKSPACE_ROOT}).`
		);
	}
	return resolved;
}

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
	 *
	 * Validates `image` and `projectPath` against the configured allowlists
	 * before any Docker operation is attempted.
	 */
	async createTask(config: TaskConfig): Promise<BackgroundTask> {
		// Validate up-front so we never even materialise state for a rejected request.
		const requestedImage = config.image ?? BUILTIN_ALLOWED_IMAGE;
		assertImageAllowed(requestedImage);

		const requestedProjectPath = config.projectPath ?? WORKSPACE_ROOT;
		const resolvedProjectPath = assertProjectPathAllowed(requestedProjectPath);

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

		// Start the container with the validated values.
		await this.startTask(task, { ...config, image: requestedImage, projectPath: resolvedProjectPath });

		return task;
	}

	private async startTask(task: BackgroundTask, config: TaskConfig): Promise<void> {
		try {
			const container = await this.docker.createContainer({
				Image: config.image ?? BUILTIN_ALLOWED_IMAGE,
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
						`${config.projectPath ?? WORKSPACE_ROOT}:/workspace:rw`,
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

/**
 * Constant-time-ish comparison for the bearer token. The token is short and we
 * only check it once per request, so the worst-case timing leak is negligible —
 * but we still avoid early-return so a no-op leak is one less thing to worry about.
 */
function tokenMatches(provided: string): boolean {
	if (!API_TOKEN || provided.length !== API_TOKEN.length) {
		return false;
	}
	let mismatch = 0;
	for (let i = 0; i < API_TOKEN.length; i++) {
		mismatch |= API_TOKEN.charCodeAt(i) ^ provided.charCodeAt(i);
	}
	return mismatch === 0;
}

/**
 * Return true if the request carries a valid Authorization: Bearer <token> header.
 */
function isAuthorized(req: http.IncomingMessage): boolean {
	const header = req.headers['authorization'];
	if (typeof header !== 'string') {
		return false;
	}
	const match = header.match(/^Bearer\s+(.+)$/i);
	if (!match) {
		return false;
	}
	return tokenMatches(match[1].trim());
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
	const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

	// Health check (anonymous — readiness probes need this).
	if (url.pathname === '/health') {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ status: 'ok', service: 'background-tasks' }));
		return;
	}

	// All non-health endpoints require an authenticated bearer token.
	if (!isAuthorized(req)) {
		res.writeHead(401, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Unauthorized — missing or invalid bearer token' }));
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
		let config: TaskConfig;
		try {
			config = JSON.parse(body) as TaskConfig;
		} catch {
			res.writeHead(400, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Request body must be valid JSON' }));
			return;
		}

		try {
			const task = await taskManager.createTask(config);
			res.writeHead(201, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(task, null, 2));
		} catch (err) {
			if (err instanceof BadRequestError) {
				res.writeHead(400, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: err.message }));
				return;
			}
			throw err;
		}
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

if (!API_TOKEN) {
	// Refuse to start unauthenticated — this service controls the Docker daemon.
	console.error(
		'[background-tasks] BACKGROUND_TASK_API_TOKEN must be set to run background-tasks; ' +
		'refusing to start with anonymous Docker control.'
	);
	process.exit(1);
}

taskManager.initialize().then(() => {
	httpServer.listen(PORT, () => {
		console.log(`[background-tasks] Listening on port ${PORT}`);
		console.log(
			`[background-tasks] Allowed images: ${[...ALLOWED_IMAGES].join(', ')}; ` +
			`workspace root: ${WORKSPACE_ROOT}`
		);
	});
});
