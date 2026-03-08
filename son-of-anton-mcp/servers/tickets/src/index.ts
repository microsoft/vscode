// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import http from 'http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';

const PORT = parseInt(process.env.MCP_TICKETS_PORT ?? '3104', 10);

// Ticketing provider interface — swap for GitHub Issues, Jira, Linear, etc.
interface TicketingProvider {
	searchTickets(params: TicketSearchParams): Promise<TicketSummary[]>;
	getTicket(id: string): Promise<TicketDetail>;
	createTicket(params: CreateTicketParams): Promise<CreatedTicket>;
	updateTicketStatus(id: string, status: string): Promise<TicketDetail>;
	linkPrToTicket(ticketId: string, prUrl: string): Promise<void>;
}

interface TicketSearchParams {
	query?: string;
	status?: string;
	assignee?: string;
	label?: string;
	limit?: number;
}

interface TicketSummary {
	id: string;
	title: string;
	status: string;
	assignee?: string;
	labels: string[];
	updatedAt: string;
}

interface TicketDetail extends TicketSummary {
	description: string;
	comments: TicketComment[];
	linkedPrs: string[];
}

interface TicketComment {
	author: string;
	body: string;
	createdAt: string;
}

interface CreateTicketParams {
	title: string;
	description: string;
	labels?: string[];
	assignee?: string;
}

interface CreatedTicket {
	id: string;
	url: string;
}

// GitHub Issues provider implementation
class GitHubIssuesProvider implements TicketingProvider {
	private readonly apiBase: string;
	private readonly token: string;

	constructor() {
		const repo = process.env.GITHUB_REPOSITORY ?? 'CodeHalwell/Son-Of-Anton';
		this.apiBase = `https://api.github.com/repos/${repo}`;
		this.token = process.env.GITHUB_TOKEN ?? '';
	}

	private async apiFetch(path: string, options?: RequestInit): Promise<unknown> {
		const response = await globalThis.fetch(`${this.apiBase}${path}`, {
			...options,
			headers: {
				'Authorization': this.token ? `Bearer ${this.token}` : '',
				'Accept': 'application/vnd.github.v3+json',
				...(options?.headers ?? {}),
			},
		});
		if (!response.ok) {
			throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
		}
		return response.json();
	}

	async searchTickets(params: TicketSearchParams): Promise<TicketSummary[]> {
		const queryParts: string[] = [];
		if (params.query) {
			queryParts.push(params.query);
		}
		if (params.status) {
			queryParts.push(`state:${params.status}`);
		}
		if (params.assignee) {
			queryParts.push(`assignee:${params.assignee}`);
		}
		if (params.label) {
			queryParts.push(`label:"${params.label}"`);
		}

		const limit = Math.min(params.limit ?? 20, 50);

		const data = await this.apiFetch(
			`/issues?state=${params.status ?? 'all'}&per_page=${limit}`
		) as Record<string, unknown>[];

		return data.map(issue => ({
			id: String(issue.number ?? ''),
			title: String(issue.title ?? ''),
			status: String(issue.state ?? ''),
			assignee: issue.assignee ? String((issue.assignee as Record<string, unknown>).login ?? '') : undefined,
			labels: Array.isArray(issue.labels)
				? issue.labels.map((l: Record<string, unknown>) => String(l.name ?? ''))
				: [],
			updatedAt: String(issue.updated_at ?? ''),
		}));
	}

	async getTicket(id: string): Promise<TicketDetail> {
		const [issue, comments] = await Promise.all([
			this.apiFetch(`/issues/${id}`) as Promise<Record<string, unknown>>,
			this.apiFetch(`/issues/${id}/comments`) as Promise<Record<string, unknown>[]>,
		]);

		// Find linked PRs in the timeline
		let linkedPrs: string[] = [];
		try {
			const events = await this.apiFetch(`/issues/${id}/timeline`) as Record<string, unknown>[];
			linkedPrs = events
				.filter(e => e.event === 'cross-referenced' && e.source)
				.map(e => {
					const source = e.source as Record<string, Record<string, string>>;
					return source.issue?.html_url ?? '';
				})
				.filter(url => url.includes('/pull/'));
		} catch (error) {
			// Timeline API may not be available, log for debugging
			console.warn(`[mcp-tickets] Failed to fetch timeline for issue ${id}:`, error);
		}

		return {
			id: String(issue.number ?? ''),
			title: String(issue.title ?? ''),
			status: String(issue.state ?? ''),
			assignee: issue.assignee ? String((issue.assignee as Record<string, unknown>).login ?? '') : undefined,
			labels: Array.isArray(issue.labels)
				? issue.labels.map((l: Record<string, unknown>) => String(l.name ?? ''))
				: [],
			updatedAt: String(issue.updated_at ?? ''),
			description: String(issue.body ?? ''),
			comments: comments.map(c => ({
				author: String((c.user as Record<string, unknown>)?.login ?? ''),
				body: String(c.body ?? ''),
				createdAt: String(c.created_at ?? ''),
			})),
			linkedPrs,
		};
	}

	async createTicket(params: CreateTicketParams): Promise<CreatedTicket> {
		// GATED: Requires human confirmation via agent hook
		const data = await this.apiFetch('/issues', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				title: params.title,
				body: params.description,
				labels: params.labels ?? [],
				...(params.assignee ? { assignees: [params.assignee] } : {}),
			}),
		}) as Record<string, unknown>;

		return {
			id: String(data.number ?? ''),
			url: String(data.html_url ?? ''),
		};
	}

	async updateTicketStatus(id: string, status: string): Promise<TicketDetail> {
		// GATED: Requires human confirmation via agent hook
		await this.apiFetch(`/issues/${id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ state: status }),
		});

		return this.getTicket(id);
	}

	async linkPrToTicket(ticketId: string, prUrl: string): Promise<void> {
		// Add a comment linking the PR to the ticket
		await this.apiFetch(`/issues/${ticketId}/comments`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				body: `Linked PR: ${prUrl}`,
			}),
		});
	}
}

function createServer(provider: TicketingProvider): McpServer {
	const server = new McpServer({
		name: 'son-of-anton-tickets',
		version: '1.0.0',
	});

	server.tool(
		'search_tickets',
		'Search tickets by keyword, status, assignee, or label.',
		{
			query: z.string().optional().describe('Search query keyword'),
			status: z.string().optional().describe('Filter by status (e.g. open, closed)'),
			assignee: z.string().optional().describe('Filter by assignee username'),
			label: z.string().optional().describe('Filter by label'),
			limit: z.number().min(1).max(50).optional().describe('Max results (default 20)'),
		},
		async (params) => {
			try {
				const results = await provider.searchTickets(params);
				return { content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }] };
			} catch (error) {
				return errorResponse('search_tickets', error);
			}
		}
	);

	server.tool(
		'get_ticket',
		'Get full ticket details including description, comments, and linked PRs.',
		{
			id: z.string().describe('Ticket ID'),
		},
		async ({ id }) => {
			try {
				const result = await provider.getTicket(id);
				return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
			} catch (error) {
				return errorResponse('get_ticket', error);
			}
		}
	);

	server.tool(
		'create_ticket',
		'Create a new ticket. REQUIRES HUMAN CONFIRMATION via agent hook.',
		{
			title: z.string().describe('Ticket title'),
			description: z.string().describe('Ticket description (Markdown supported)'),
			labels: z.array(z.string()).optional().describe('Labels to apply'),
			assignee: z.string().optional().describe('Username to assign'),
		},
		async (params) => {
			try {
				const result = await provider.createTicket(params);
				return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
			} catch (error) {
				return errorResponse('create_ticket', error);
			}
		}
	);

	server.tool(
		'update_ticket_status',
		'Update a ticket\'s status. REQUIRES HUMAN CONFIRMATION via agent hook.',
		{
			id: z.string().describe('Ticket ID'),
			status: z.string().describe('New status (e.g. open, closed)'),
		},
		async ({ id, status }) => {
			try {
				const result = await provider.updateTicketStatus(id, status);
				return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
			} catch (error) {
				return errorResponse('update_ticket_status', error);
			}
		}
	);

	server.tool(
		'link_pr_to_ticket',
		'Associate a pull request with a ticket.',
		{
			ticketId: z.string().describe('Ticket ID'),
			prUrl: z.string().describe('Pull request URL'),
		},
		async ({ ticketId, prUrl }) => {
			try {
				await provider.linkPrToTicket(ticketId, prUrl);
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({ success: true, ticketId, prUrl }, null, 2),
					}],
				};
			} catch (error) {
				return errorResponse('link_pr_to_ticket', error);
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
const provider = new GitHubIssuesProvider();
const mcpServer = createServer(provider);
const activeTransports = new Map<string, SSEServerTransport>();

const httpServer = http.createServer(async (req, res) => {
	const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

	if (url.pathname === '/health') {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ status: 'ok', service: 'mcp-tickets' }));
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
	console.log(`[mcp-tickets] Listening on port ${PORT}`);
});
