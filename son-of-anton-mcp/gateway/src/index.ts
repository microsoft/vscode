// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import http from 'http';
import fs from 'fs';
import path from 'path';

const PORT = parseInt(process.env.GATEWAY_PORT ?? '3200', 10);

interface ServerConfig {
	name: string;
	url: string;
	type: 'internal' | 'external';
	trusted: boolean;
	rateLimit: { requestsPerMinute: number };
}

interface GatewayConfig {
	servers: ServerConfig[];
	defaultPolicy: {
		allowExternal: boolean;
		requireAuthentication: boolean;
		logAllCalls: boolean;
	};
}

interface CallLog {
	timestamp: string;
	server: string;
	tool: string;
	inputSummary: string;
	outputLength: number;
	latencyMs: number;
	error?: string;
}

interface ServerMetrics {
	totalCalls: number;
	errorCount: number;
	latencies: number[];
}

// --- Rate limiter ---
class RateLimiter {
	private windows = new Map<string, number[]>();

	isAllowed(serverName: string, maxPerMinute: number): boolean {
		const now = Date.now();
		const windowStart = now - 60_000;
		const timestamps = this.windows.get(serverName) ?? [];
		const recent = timestamps.filter(t => t > windowStart);
		if (recent.length >= maxPerMinute) {
			return false;
		}
		recent.push(now);
		this.windows.set(serverName, recent);
		return true;
	}
}

// --- Gateway ---
class McpGateway {
	private config: GatewayConfig;
	private rateLimiter = new RateLimiter();
	private callLogs: CallLog[] = [];
	private metrics = new Map<string, ServerMetrics>();

	constructor(configPath: string) {
		const raw = fs.readFileSync(configPath, 'utf-8');
		this.config = JSON.parse(raw) as GatewayConfig;

		for (const server of this.config.servers) {
			this.metrics.set(server.name, { totalCalls: 0, errorCount: 0, latencies: [] });
		}
	}

	async checkHealth(): Promise<Record<string, unknown>> {
		const results: Record<string, unknown> = {};

		await Promise.all(
			this.config.servers.map(async (server) => {
				try {
					const controller = new AbortController();
					const timeout = setTimeout(() => controller.abort(), 5000);
					const response = await globalThis.fetch(`${server.url}/health`, {
						signal: controller.signal,
					});
					clearTimeout(timeout);
					results[server.name] = {
						status: response.ok ? 'healthy' : 'unhealthy',
						statusCode: response.status,
					};
				} catch (error) {
					results[server.name] = {
						status: 'unreachable',
						error: error instanceof Error ? error.message : String(error),
					};
				}
			})
		);

		return results;
	}

	async proxyToolCall(
		serverName: string,
		tool: string,
		input: Record<string, unknown>
	): Promise<{ result: unknown; latencyMs: number }> {
		const server = this.config.servers.find(s => s.name === serverName);
		if (!server) {
			throw new Error(`Unknown server: ${serverName}`);
		}

		// Trust policy: block external servers unless explicitly allowed
		if (server.type === 'external' && !this.config.defaultPolicy.allowExternal && !server.trusted) {
			throw new Error(`External server ${serverName} is not trusted. Enable it in config.json.`);
		}

		// Rate limiting
		if (!this.rateLimiter.isAllowed(serverName, server.rateLimit.requestsPerMinute)) {
			throw new Error(`Rate limit exceeded for ${serverName}. Max ${server.rateLimit.requestsPerMinute} requests/minute.`);
		}

		const start = Date.now();
		let error: string | undefined;

		try {
			// Forward to the appropriate MCP server
			// In a full implementation, this would use the MCP client SDK
			// For now, we log and pass through
			const latencyMs = Date.now() - start;

			this.recordCall(serverName, tool, input, 0, latencyMs);

			return { result: { forwarded: true, server: serverName, tool }, latencyMs };
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
			const latencyMs = Date.now() - start;
			this.recordCall(serverName, tool, input, 0, latencyMs, error);
			throw err;
		}
	}

	private recordCall(
		server: string,
		tool: string,
		input: Record<string, unknown>,
		outputLength: number,
		latencyMs: number,
		error?: string
	): void {
		// Sanitise input: remove anything that looks like a secret
		const sanitised = sanitiseInput(input);

		const logEntry: CallLog = {
			timestamp: new Date().toISOString(),
			server,
			tool,
			inputSummary: JSON.stringify(sanitised).slice(0, 500),
			outputLength,
			latencyMs,
			error,
		};

		this.callLogs.push(logEntry);

		// Keep only last 10000 entries
		if (this.callLogs.length > 10000) {
			this.callLogs = this.callLogs.slice(-10000);
		}

		// Update metrics
		const serverMetrics = this.metrics.get(server);
		if (serverMetrics) {
			serverMetrics.totalCalls++;
			if (error) {
				serverMetrics.errorCount++;
			}
			serverMetrics.latencies.push(latencyMs);
			// Keep only last 1000 latency samples
			if (serverMetrics.latencies.length > 1000) {
				serverMetrics.latencies = serverMetrics.latencies.slice(-1000);
			}
		}

		if (this.config.defaultPolicy.logAllCalls) {
			console.log(`[gateway] ${server}/${tool} ${latencyMs}ms${error ? ` ERROR: ${error}` : ''}`);
		}
	}

	getMetrics(): Record<string, unknown> {
		const result: Record<string, unknown> = {};

		for (const [name, m] of this.metrics) {
			const sorted = [...m.latencies].sort((a, b) => a - b);
			result[name] = {
				totalCalls: m.totalCalls,
				errorCount: m.errorCount,
				errorRate: m.totalCalls > 0 ? (m.errorCount / m.totalCalls * 100).toFixed(2) + '%' : '0%',
				latency: {
					p50: percentile(sorted, 50),
					p95: percentile(sorted, 95),
					p99: percentile(sorted, 99),
				},
			};
		}

		return result;
	}

	getRecentLogs(limit: number = 50): CallLog[] {
		return this.callLogs.slice(-limit);
	}
}

function sanitiseInput(input: Record<string, unknown>): Record<string, unknown> {
	const sanitised: Record<string, unknown> = {};
	const secretKeys = ['password', 'secret', 'token', 'key', 'credential', 'auth'];

	for (const [k, v] of Object.entries(input)) {
		if (secretKeys.some(s => k.toLowerCase().includes(s))) {
			sanitised[k] = '[REDACTED]';
		} else {
			sanitised[k] = v;
		}
	}

	return sanitised;
}

function percentile(sorted: number[], p: number): number {
	if (sorted.length === 0) {
		return 0;
	}
	const index = Math.ceil((p / 100) * sorted.length) - 1;
	return sorted[Math.max(0, index)];
}

// --- HTTP server ---
const configPath = process.env.GATEWAY_CONFIG
	?? path.join(__dirname, '..', '..', 'config.json');

const gateway = new McpGateway(configPath);

const httpServer = http.createServer(async (req, res) => {
	const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

	if (url.pathname === '/health') {
		const serverHealth = await gateway.checkHealth();
		const allHealthy = Object.values(serverHealth).every(
			(s) => (s as Record<string, string>).status === 'healthy'
		);

		res.writeHead(allHealthy ? 200 : 503, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({
			status: allHealthy ? 'ok' : 'degraded',
			service: 'mcp-gateway-proxy',
			servers: serverHealth,
		}, null, 2));
		return;
	}

	if (url.pathname === '/metrics') {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(gateway.getMetrics(), null, 2));
		return;
	}

	if (url.pathname === '/logs') {
		const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(gateway.getRecentLogs(limit), null, 2));
		return;
	}

	res.writeHead(404);
	res.end('Not found');
});

httpServer.listen(PORT, () => {
	console.log(`[mcp-gateway-proxy] Monitoring gateway on port ${PORT}`);
	console.log(`[mcp-gateway-proxy] Health: http://localhost:${PORT}/health`);
	console.log(`[mcp-gateway-proxy] Metrics: http://localhost:${PORT}/metrics`);
});
