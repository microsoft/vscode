// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import http from 'http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';

const PORT = parseInt(process.env.MCP_DEPLOYMENT_PORT ?? '3103', 10);

// CI/CD provider interface — swap implementation for GitHub Actions, GitLab CI, etc.
interface CIProvider {
	getPipelineStatus(branch?: string, pr?: number): Promise<PipelineStatus>;
	getRecentDeployments(environment?: string, limit?: number): Promise<Deployment[]>;
	getDeploymentLogs(deploymentId: string): Promise<string>;
	triggerPreview(branch: string): Promise<PreviewResult>;
}

interface PipelineStatus {
	branch: string;
	commitSha: string;
	status: 'running' | 'passed' | 'failed' | 'cancelled' | 'pending';
	stages: PipelineStage[];
	duration?: number;
	url?: string;
}

interface PipelineStage {
	name: string;
	status: string;
	duration?: number;
}

interface Deployment {
	id: string;
	environment: string;
	status: 'success' | 'failed' | 'in_progress' | 'cancelled';
	commitSha: string;
	timestamp: string;
	url?: string;
}

interface PreviewResult {
	deploymentId: string;
	url: string;
	status: string;
}

// GitHub Actions provider implementation
class GitHubActionsProvider implements CIProvider {
	private readonly apiBase: string;
	private readonly token: string;

	constructor() {
		const repo = process.env.GITHUB_REPOSITORY ?? 'CodeHalwell/Son-Of-Anton';
		this.apiBase = `https://api.github.com/repos/${repo}`;
		this.token = process.env.GITHUB_TOKEN ?? '';
	}

	private async fetch(path: string): Promise<unknown> {
		const response = await globalThis.fetch(`${this.apiBase}${path}`, {
			headers: {
				'Authorization': this.token ? `Bearer ${this.token}` : '',
				'Accept': 'application/vnd.github.v3+json',
			},
		});
		if (!response.ok) {
			throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
		}
		return response.json();
	}

	async getPipelineStatus(branch?: string, pr?: number): Promise<PipelineStatus> {
		if (pr) {
			const prData = await this.fetch(`/pulls/${pr}`) as Record<string, unknown>;
			const head = prData.head as Record<string, string>;
			branch = head.ref;
		}

		const runs = await this.fetch(
			`/actions/runs?branch=${encodeURIComponent(branch ?? 'main')}&per_page=1`
		) as Record<string, unknown>;
		const workflowRuns = (runs.workflow_runs as Record<string, unknown>[]) ?? [];

		if (workflowRuns.length === 0) {
			return {
				branch: branch ?? 'main',
				commitSha: '',
				status: 'pending',
				stages: [],
			};
		}

		const run = workflowRuns[0];
		const jobs = await this.fetch(`/actions/runs/${run.id}/jobs`) as Record<string, unknown>;
		const jobList = (jobs.jobs as Record<string, unknown>[]) ?? [];

		return {
			branch: branch ?? 'main',
			commitSha: String(run.head_sha ?? ''),
			status: mapStatus(String(run.conclusion ?? run.status ?? 'pending')),
			stages: jobList.map(job => ({
				name: String(job.name ?? ''),
				status: String(job.conclusion ?? job.status ?? 'pending'),
				duration: typeof job.duration === 'number' ? job.duration : undefined,
			})),
			duration: typeof run.run_duration_ms === 'number' ? run.run_duration_ms : undefined,
			url: String(run.html_url ?? ''),
		};
	}

	async getRecentDeployments(environment?: string, limit?: number): Promise<Deployment[]> {
		const envFilter = environment ? `&environment=${encodeURIComponent(environment)}` : '';
		const data = await this.fetch(
			`/deployments?per_page=${Math.min(limit ?? 10, 30)}${envFilter}`
		) as Record<string, unknown>[];

		return data.map(d => ({
			id: String(d.id ?? ''),
			environment: String(d.environment ?? ''),
			status: 'success' as const,
			commitSha: String(d.sha ?? ''),
			timestamp: String(d.created_at ?? ''),
			url: String(d.url ?? ''),
		}));
	}

	async getDeploymentLogs(deploymentId: string): Promise<string> {
		try {
			const statuses = await this.fetch(
				`/deployments/${deploymentId}/statuses`
			) as Record<string, unknown>[];

			return JSON.stringify(statuses, null, 2);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return `Failed to retrieve logs: ${message}`;
		}
	}

	async triggerPreview(branch: string): Promise<PreviewResult> {
		// Note: This is a write operation. In production, agent hooks
		// should gate this to require human confirmation before execution.
		const response = await globalThis.fetch(`${this.apiBase}/deployments`, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${this.token}`,
				'Accept': 'application/vnd.github.v3+json',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				ref: branch,
				environment: 'preview',
				auto_merge: false,
				description: `Preview deployment for ${branch}`,
			}),
		});

		if (!response.ok) {
			throw new Error(`Failed to trigger preview: ${response.status}`);
		}

		const data = await response.json() as Record<string, unknown>;
		return {
			deploymentId: String(data.id ?? ''),
			url: String(data.url ?? ''),
			status: 'in_progress',
		};
	}
}

function mapStatus(status: string): PipelineStatus['status'] {
	switch (status) {
		case 'success': return 'passed';
		case 'failure': return 'failed';
		case 'in_progress': case 'queued': return 'running';
		case 'cancelled': return 'cancelled';
		default: return 'pending';
	}
}

function createServer(provider: CIProvider): McpServer {
	const server = new McpServer({
		name: 'son-of-anton-deployment',
		version: '1.0.0',
	});

	server.tool(
		'pipeline_status',
		'Get current CI/CD pipeline status for a branch or PR.',
		{
			branch: z.string().optional().describe('Branch name'),
			pr: z.number().optional().describe('Pull request number'),
		},
		async ({ branch, pr }) => {
			try {
				const result = await provider.getPipelineStatus(branch, pr);
				return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
			} catch (error) {
				return errorResponse('pipeline_status', error);
			}
		}
	);

	server.tool(
		'recent_deployments',
		'List recent deployments, optionally filtered by environment.',
		{
			environment: z.string().optional().describe('Filter by environment (e.g. production, staging, preview)'),
			limit: z.number().min(1).max(30).optional().describe('Number of deployments to return (default 10)'),
		},
		async ({ environment, limit }) => {
			try {
				const result = await provider.getRecentDeployments(environment, limit);
				return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
			} catch (error) {
				return errorResponse('recent_deployments', error);
			}
		}
	);

	server.tool(
		'deployment_logs',
		'Retrieve logs for a specific deployment.',
		{
			deploymentId: z.string().describe('Deployment ID'),
		},
		async ({ deploymentId }) => {
			try {
				const logs = await provider.getDeploymentLogs(deploymentId);
				// Truncate to prevent excessive token usage
				const truncated = logs.length > 50_000 ? logs.slice(0, 50_000) + '\n... [truncated]' : logs;
				return { content: [{ type: 'text' as const, text: truncated }] };
			} catch (error) {
				return errorResponse('deployment_logs', error);
			}
		}
	);

	server.tool(
		'trigger_preview',
		'Trigger a preview/staging deployment for a branch. REQUIRES HUMAN CONFIRMATION via agent hook.',
		{
			branch: z.string().describe('Branch to deploy'),
		},
		async ({ branch }) => {
			try {
				const result = await provider.triggerPreview(branch);
				return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
			} catch (error) {
				return errorResponse('trigger_preview', error);
			}
		}
	);

	return server;
}

function errorResponse(tool: string, error: unknown) {
	const message = error instanceof Error ? error.message : String(error);
	return {
		content: [{ type: 'text' as const, text: JSON.stringify({ error: true, tool, message }, null, 2) }],
		isError: true,
	};
}

// --- HTTP server ---
const provider = new GitHubActionsProvider();
const mcpServer = createServer(provider);
const activeTransports = new Map<string, SSEServerTransport>();

const httpServer = http.createServer(async (req, res) => {
	const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

	if (url.pathname === '/health') {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ status: 'ok', service: 'mcp-deployment' }));
		return;
	}

	if (url.pathname === '/sse') {
		const transport = new SSEServerTransport('/messages', res);
		activeTransports.set(transport.sessionId, transport);
		res.on('close', () => activeTransports.delete(transport.sessionId));
		await mcpServer.connect(transport);
		return;
	}

	if (url.pathname === '/messages' && req.method === 'POST') {
		const sessionId = url.searchParams.get('sessionId');
		if (!sessionId || !activeTransports.has(sessionId)) {
			res.writeHead(400, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Invalid or missing sessionId' }));
			return;
		}
		await activeTransports.get(sessionId)!.handlePostMessage(req, res);
		return;
	}

	res.writeHead(404);
	res.end('Not found');
});

httpServer.listen(PORT, () => {
	console.log(`[mcp-deployment] Listening on port ${PORT}`);
});
