/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { Coordinator } from './coordinator/coordinator';
import { SandboxAgent } from './sandbox/sandboxAgent';
import { ValidationAgent } from './validation/validationAgent';
import { ZapClient } from './clients/zapClient';
import { FalkorDbClient } from './clients/falkordbClient';
import { toSarif } from './sarif';
import { validateTargetUrl } from './config';
import { OwaspCategory, PenTestConfig, ScanSession, TestResult } from './types';

/**
 * HTTP server for the penetration testing service.
 * Exposes endpoints for running scans, checking status, and retrieving results.
 */
export class PenTestServer {
	private readonly config: PenTestConfig;
	private readonly coordinator: Coordinator;
	private readonly sandboxAgent: SandboxAgent;
	private readonly validationAgent: ValidationAgent;
	private readonly zapClient: ZapClient;
	private readonly falkorDb: FalkorDbClient;
	private readonly sessions = new Map<string, ScanSession>();
	private server: http.Server | null = null;

	constructor(
		config: PenTestConfig,
		coordinator: Coordinator,
		sandboxAgent: SandboxAgent,
		validationAgent: ValidationAgent,
		zapClient: ZapClient,
		falkorDb: FalkorDbClient,
	) {
		this.config = config;
		this.coordinator = coordinator;
		this.sandboxAgent = sandboxAgent;
		this.validationAgent = validationAgent;
		this.zapClient = zapClient;
		this.falkorDb = falkorDb;
	}

	/**
	 * Start the HTTP server.
	 */
	start(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.server = http.createServer((req, res) => {
				this.handleRequest(req, res).catch(err => {
					console.error('Request handler error:', err);
					this.sendJson(res, 500, { error: 'Internal server error' });
				});
			});

			this.server.listen(this.config.port, () => {
				console.log(`Penetration testing service listening on port ${this.config.port}`);
				resolve();
			});

			this.server.on('error', reject);
		});
	}

	/**
	 * Stop the HTTP server.
	 */
	stop(): Promise<void> {
		return new Promise(resolve => {
			if (this.server) {
				this.server.close(() => resolve());
			} else {
				resolve();
			}
		});
	}

	private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const url = new URL(req.url ?? '/', `http://localhost:${this.config.port}`);
		const method = req.method ?? 'GET';
		const path = url.pathname;

		// CORS headers for local development
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

		if (method === 'OPTIONS') {
			res.writeHead(204);
			res.end();
			return;
		}

		switch (true) {
			case method === 'GET' && path === '/health':
				await this.handleHealth(res);
				break;
			case method === 'POST' && path === '/scan/full':
				await this.handleFullScan(req, res);
				break;
			case method === 'POST' && path === '/scan/endpoint':
				await this.handleEndpointScan(req, res);
				break;
			case method === 'POST' && path === '/scan/owasp':
				await this.handleOwaspScan(req, res);
				break;
			case method === 'POST' && path === '/scan/baseline':
				await this.handleBaselineScan(req, res);
				break;
			case method === 'GET' && path.startsWith('/scan/'):
				await this.handleGetScan(path, res);
				break;
			case method === 'GET' && path.startsWith('/sarif/'):
				await this.handleGetSarif(path, res);
				break;
			case method === 'GET' && path === '/sessions':
				this.handleListSessions(res);
				break;
			default:
				this.sendJson(res, 404, { error: 'Not found' });
		}
	}

	private async handleHealth(res: http.ServerResponse): Promise<void> {
		const zapHealthy = await this.zapClient.isHealthy();
		const falkorHealthy = await this.falkorDb.isHealthy();

		this.sendJson(res, 200, {
			status: 'ok',
			service: 'penetration-tester',
			dependencies: {
				zap: zapHealthy ? 'healthy' : 'unavailable',
				falkordb: falkorHealthy ? 'healthy' : 'unavailable',
			},
			activeSessions: this.sessions.size,
		});
	}

	/**
	 * Full penetration test — analyses attack surface and runs all applicable tests.
	 */
	private async handleFullScan(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this.readBody(req);
		const targetUrl = body.targetUrl ?? this.config.targetBaseUrl;

		if (!validateTargetUrl(targetUrl)) {
			this.sendJson(res, 400, { error: 'Target URL must be localhost' });
			return;
		}

		const session = this.createSession(targetUrl);
		this.sendJson(res, 202, { sessionId: session.id, status: 'running' });

		// Run scan asynchronously
		this.runFullScan(session, targetUrl).catch(err => {
			console.error(`Scan ${session.id} failed:`, err);
			session.status = 'failed';
			session.completedAt = Date.now();
		});
	}

	/**
	 * Focused scan on a specific endpoint.
	 */
	private async handleEndpointScan(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this.readBody(req);
		const targetUrl = body.targetUrl ?? this.config.targetBaseUrl;
		const endpointPath = body.endpoint;

		if (!endpointPath) {
			this.sendJson(res, 400, { error: 'Missing endpoint parameter' });
			return;
		}

		if (!validateTargetUrl(targetUrl)) {
			this.sendJson(res, 400, { error: 'Target URL must be localhost' });
			return;
		}

		const session = this.createSession(targetUrl);
		this.sendJson(res, 202, { sessionId: session.id, status: 'running' });

		this.runEndpointScan(session, targetUrl, endpointPath).catch(err => {
			console.error(`Scan ${session.id} failed:`, err);
			session.status = 'failed';
			session.completedAt = Date.now();
		});
	}

	/**
	 * Scan focused on a specific OWASP category.
	 */
	private async handleOwaspScan(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this.readBody(req);
		const targetUrl = body.targetUrl ?? this.config.targetBaseUrl;
		const category = body.category as OwaspCategory;

		if (!category) {
			this.sendJson(res, 400, { error: 'Missing category parameter' });
			return;
		}

		if (!validateTargetUrl(targetUrl)) {
			this.sendJson(res, 400, { error: 'Target URL must be localhost' });
			return;
		}

		const session = this.createSession(targetUrl);
		this.sendJson(res, 202, { sessionId: session.id, status: 'running' });

		this.runOwaspScan(session, targetUrl, category).catch(err => {
			console.error(`Scan ${session.id} failed:`, err);
			session.status = 'failed';
			session.completedAt = Date.now();
		});
	}

	/**
	 * Baseline (passive) scan — safe to run automatically.
	 */
	private async handleBaselineScan(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this.readBody(req);
		const targetUrl = body.targetUrl ?? this.config.targetBaseUrl;

		if (!validateTargetUrl(targetUrl)) {
			this.sendJson(res, 400, { error: 'Target URL must be localhost' });
			return;
		}

		const session = this.createSession(targetUrl);
		this.sendJson(res, 202, { sessionId: session.id, status: 'running' });

		this.runBaselineScan(session, targetUrl).catch(err => {
			console.error(`Scan ${session.id} failed:`, err);
			session.status = 'failed';
			session.completedAt = Date.now();
		});
	}

	private async handleGetScan(path: string, res: http.ServerResponse): Promise<void> {
		const sessionId = path.replace('/scan/', '');
		const session = this.sessions.get(sessionId);

		if (!session) {
			this.sendJson(res, 404, { error: 'Session not found' });
			return;
		}

		this.sendJson(res, 200, {
			id: session.id,
			status: session.status,
			targetUrl: session.targetUrl,
			testCount: session.testResults.length,
			findingsCount: session.validatedFindings.length,
			findings: session.validatedFindings.map(f => ({
				id: f.id,
				severity: f.finding.severity,
				testType: f.finding.testType,
				owaspCategory: f.finding.owaspCategory,
				endpoint: f.finding.endpoint,
				evidence: f.finding.evidence,
				suggestedFix: f.finding.suggestedFix,
			})),
			requestCount: session.requestCount,
			startedAt: session.startedAt,
			completedAt: session.completedAt,
		});
	}

	private async handleGetSarif(path: string, res: http.ServerResponse): Promise<void> {
		const sessionId = path.replace('/sarif/', '');
		const session = this.sessions.get(sessionId);

		if (!session) {
			this.sendJson(res, 404, { error: 'Session not found' });
			return;
		}

		const sarif = toSarif(session.validatedFindings);
		this.sendJson(res, 200, sarif);
	}

	private handleListSessions(res: http.ServerResponse): void {
		const summaries = Array.from(this.sessions.values()).map(s => ({
			id: s.id,
			status: s.status,
			targetUrl: s.targetUrl,
			findingsCount: s.validatedFindings.length,
			startedAt: s.startedAt,
			completedAt: s.completedAt,
		}));

		this.sendJson(res, 200, { sessions: summaries });
	}

	// --- Scan execution ---

	private async runFullScan(session: ScanSession, targetUrl: string): Promise<void> {
		session.status = 'running';

		const testPlan = await this.coordinator.createTestPlan(targetUrl);
		session.testPlan = testPlan;

		await this.executeTestPlan(session, testPlan, targetUrl);
	}

	private async runEndpointScan(session: ScanSession, targetUrl: string, endpointPath: string): Promise<void> {
		session.status = 'running';

		const testPlan = await this.coordinator.createFocusedPlan(targetUrl, endpointPath);
		session.testPlan = testPlan;

		await this.executeTestPlan(session, testPlan, targetUrl);
	}

	private async runOwaspScan(session: ScanSession, targetUrl: string, category: OwaspCategory): Promise<void> {
		session.status = 'running';

		const testPlan = await this.coordinator.createCategoryPlan(targetUrl, category);
		session.testPlan = testPlan;

		await this.executeTestPlan(session, testPlan, targetUrl);
	}

	private async runBaselineScan(session: ScanSession, targetUrl: string): Promise<void> {
		session.status = 'running';

		const baselineTest = {
			id: randomUUID(),
			type: 'zap-baseline' as const,
			owaspCategory: 'A05-security-misconfiguration' as const,
			targetEndpoint: { method: 'GET', path: '/', parameters: [], authentication: false, dataFlows: [] },
			parameters: {},
			priority: 1,
		};

		const result = await this.sandboxAgent.executeTest(baselineTest, targetUrl);
		session.testResults.push(result);
		session.requestCount += result.requestCount;

		if (result.finding) {
			const validated = await this.validationAgent.validateFindings([result], targetUrl);
			session.validatedFindings.push(...validated);
		}

		session.status = 'completed';
		session.completedAt = Date.now();
	}

	private async executeTestPlan(
		session: ScanSession,
		testPlan: { tests: Array<{ id: string; type: string; owaspCategory: string; targetEndpoint: { method: string; path: string; parameters: Array<{ name: string; location: string; type: string; required: boolean }>; authentication: boolean; dataFlows: string[] }; parameters: Record<string, unknown>; priority: number }>; targetUrl: string },
		targetUrl: string,
	): Promise<void> {
		const results: TestResult[] = [];

		for (const test of testPlan.tests) {
			try {
				const result = await this.sandboxAgent.executeTest(test as Parameters<typeof this.sandboxAgent.executeTest>[0], targetUrl);
				results.push(result);
				session.testResults.push(result);
				session.requestCount += result.requestCount;
			} catch (err) {
				console.error(`Test ${test.id} failed:`, err);
			}
		}

		// Validate all findings
		const validated = await this.validationAgent.validateFindings(results, targetUrl);
		session.validatedFindings.push(...validated);

		session.status = 'completed';
		session.completedAt = Date.now();
	}

	private createSession(targetUrl: string): ScanSession {
		const session: ScanSession = {
			id: randomUUID(),
			targetUrl,
			status: 'pending',
			testPlan: null,
			testResults: [],
			validatedFindings: [],
			startedAt: Date.now(),
			completedAt: null,
			requestCount: 0,
		};

		this.sessions.set(session.id, session);
		return session;
	}

	// --- Utilities ---

	private async readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
		return new Promise((resolve, reject) => {
			let data = '';
			req.on('data', chunk => { data += chunk; });
			req.on('end', () => {
				try {
					resolve(data ? JSON.parse(data) : {});
				} catch {
					resolve({});
				}
			});
			req.on('error', reject);
		});
	}

	private sendJson(res: http.ServerResponse, statusCode: number, body: unknown): void {
		res.writeHead(statusCode, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(body, null, 2));
	}
}
