/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RuntimeConnection, CopilotClient } from '@microsoft/copilot-sdk';
import assert from 'assert';
import { execFile } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import type { IncomingMessage, RequestListener, Server as HttpServer, ServerResponse } from 'http';
import type { Server } from 'https';
import { tmpdir } from 'os';
import { promisify } from 'util';
import { join } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../log/common/log.js';
import { AgentHostMcpConnectorsEnabledConfigKey } from '../../../common/agentHostSchema.js';
import { readToolCallMeta } from '../../../common/meta/agentToolCallMeta.js';
import { SessionConfigKey } from '../../../common/sessionConfigKeys.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { ResponsePartKind, ROOT_STATE_URI, ToolCallStatus } from '../../../common/state/sessionState.js';
import { reconcileCopilotConnectors } from '../../../node/copilot/copilotConnectors.js';
import { getAncillaryStub } from '../e2e/harness/capiStubs.js';
import { preserveAgentHostE2ELogs } from '../e2e/harness/agentHostE2EDiagnostics.js';
import { createProviderSession, dispatchTurn, type IAgentHostProviderTestConfig } from '../providerIntegrationTestHelpers.js';
import { createIsolatedProviderEnvironment } from '../providerTestEnvironment.js';
import { fetchSessionWithChat, getActionEnvelope, isActionNotification, startRealServer, stopServer, TestProtocolClient, type IServerHandle } from '../serverIntegrationTestHelpers.js';

/**
 * A fake Copilot Connector backend: a Connector catalog and the HTTPS MCP servers it points at.
 * The runtime only connects Connector MCP servers over HTTPS, so they use a throwaway test CA.
 */
interface IConnectorFixture {
	readonly home: string;
	readonly caPath: string;
	readonly mcpUrl: string;
	readonly initializations: Record<string, number>;
	readonly unexpectedRequests: string[];
	readonly tlsErrors: string[];
	mailEndpoint: string;
	mailConnected: boolean;
	/** Serves the catalog and user endpoints the runtime fetches from its API origin; returns `true` when handled. */
	serveApi(request: IncomingMessage, response: ServerResponse, path: string, apiUrl: string): boolean;
	close(): Promise<void>;
}

async function startConnectorFixture(connectors: readonly string[]): Promise<IConnectorFixture> {
	const home = await mkdtemp(join(tmpdir(), 'copilot-connectors-'));
	const certPath = join(home, 'server-cert.pem');
	const caPath = join(home, 'ca-cert.pem');
	const caKeyPath = join(home, 'ca-key.pem');
	const keyPath = join(home, 'server-key.pem');
	const requestPath = join(home, 'server.csr');
	const configPath = join(home, 'tls.cnf');
	await writeFile(configPath, [
		'[req]', 'distinguished_name=dn', 'prompt=no', '[dn]', 'CN=localhost',
		'[ca]', 'basicConstraints=critical,CA:TRUE', 'keyUsage=critical,keyCertSign,cRLSign',
		'[server]', 'basicConstraints=critical,CA:FALSE', 'keyUsage=critical,digitalSignature,keyEncipherment',
		'extendedKeyUsage=serverAuth', 'subjectAltName=DNS:localhost,IP:127.0.0.1',
	].join('\n'));
	const openssl = promisify(execFile);
	await openssl('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-config', configPath, '-extensions', 'ca', '-keyout', caKeyPath, '-out', caPath], { windowsHide: true });
	await openssl('openssl', ['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-config', configPath, '-keyout', keyPath, '-out', requestPath], { windowsHide: true });
	await openssl('openssl', ['x509', '-req', '-in', requestPath, '-CA', caPath, '-CAkey', caKeyPath, '-set_serial', '1', '-days', '2', '-extfile', configPath, '-extensions', 'server', '-out', certPath], { windowsHide: true });

	const json = (response: ServerResponse, value: object) => {
		response.writeHead(200, { 'content-type': 'application/json' });
		response.end(JSON.stringify(value));
	};
	const mcpHandler: RequestListener = async (request, response) => {
		const path = new URL(request.url ?? '/', 'https://localhost').pathname;
		if (!path.startsWith('/mcp/') || request.method !== 'POST') {
			fixture.unexpectedRequests.push(`${request.method} ${path}`);
			response.writeHead(405).end();
			return;
		}
		let body = '';
		for await (const chunk of request) {
			body += chunk;
		}
		const message: { id?: number | string; method: string; params?: { protocolVersion?: string } } = JSON.parse(body);
		if (message.id === undefined) {
			response.writeHead(202).end();
			return;
		}
		const name = path.slice('/mcp/'.length);
		switch (message.method) {
			case 'initialize':
				fixture.initializations[name] = (fixture.initializations[name] ?? 0) + 1;
				json(response, { jsonrpc: '2.0', id: message.id, result: { protocolVersion: message.params?.protocolVersion, capabilities: { tools: {} }, serverInfo: { name, version: '1' } } });
				break;
			case 'tools/list':
				json(response, { jsonrpc: '2.0', id: message.id, result: { tools: [{ name: `${name}_ping`, description: 'Local test tool', inputSchema: { type: 'object', properties: {} } }] } });
				break;
			case 'tools/call':
				json(response, { jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: name }] } });
				break;
			case 'ping':
				json(response, { jsonrpc: '2.0', id: message.id, result: {} });
				break;
			case 'server/discover':
				json(response, { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Use initialize' } });
				break;
			default:
				fixture.unexpectedRequests.push(message.method);
				json(response, { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Unexpected MCP method' } });
		}
	};
	const { createServer } = await import('https');
	const mcpServer: Server = createServer({ cert: await readFile(certPath), key: await readFile(keyPath) }, mcpHandler);
	await new Promise<void>(resolve => mcpServer.listen(0, '127.0.0.1', resolve));
	const address = mcpServer.address();
	assert.ok(address && typeof address !== 'string');

	const fixture: IConnectorFixture = {
		home,
		caPath,
		mcpUrl: `https://127.0.0.1:${address.port}`,
		initializations: {},
		unexpectedRequests: [],
		tlsErrors: [],
		mailEndpoint: 'mail',
		mailConnected: true,
		serveApi(_request, response, path, apiUrl) {
			if (path === '/copilot_internal/user') {
				json(response, { login: 'connector-test', copilot_plan: 'individual_pro', is_mcp_enabled: true, endpoints: { api: apiUrl } });
			} else if (path === '/user') {
				json(response, { login: 'connector-test', id: 1 });
			} else if (path === '/copilot-connectors/api/v1/plugins') {
				json(response, {
					plugins: connectors.map(name => ({
						name, metadata: { displayName: `Test ${name}`, tier: 'standard', releaseTag: 'preview' },
						connection: { status: name === 'mail' && !fixture.mailConnected ? 'available' : 'connected' },
						mcpServers: { mcpServers: { [name]: { type: 'http', url: `${fixture.mcpUrl}/mcp/${name === 'mail' ? fixture.mailEndpoint : name}` } } },
					})),
				});
			} else {
				return false;
			}
			return true;
		},
		async close() {
			mcpServer.closeAllConnections();
			if (mcpServer.listening) {
				await new Promise<void>((resolve, reject) => mcpServer.close(error => error ? reject(error) : resolve()));
			}
			await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
		},
	};
	mcpServer.on('tlsClientError', error => fixture.tlsErrors.push(error.message));
	return fixture;
}

suite('Copilot SDK Connector reconciliation', function () {
	ensureNoDisposablesAreLeakedInTestSuite();
	this.timeout(60_000);

	let client: CopilotClient;
	let fixture: IConnectorFixture;
	let apiServer: HttpServer;
	let home: string;
	let baseUrl: string;
	let mcpUrl: string;
	let initializations: Record<string, number>;
	let unexpectedRequests: string[];
	let tlsErrors: string[];

	setup(async () => {
		fixture = await startConnectorFixture(['mail', 'calendar']);
		({ home, mcpUrl, initializations, unexpectedRequests, tlsErrors } = fixture);
		const http = await import('http');
		apiServer = http.createServer((request, response) => {
			const path = new URL(request.url ?? '/', 'http://localhost').pathname;
			if (fixture.serveApi(request, response, path, baseUrl)) {
				return;
			}
			const stub = getAncillaryStub(request.method ?? 'GET', path);
			if (stub) {
				response.writeHead(stub.status, stub.headers);
				response.end(stub.body.replaceAll('${capi}', baseUrl));
			} else {
				unexpectedRequests.push(`${request.method} ${path}`);
				response.writeHead(500, { 'x-should-retry': 'false' }).end('Unexpected test endpoint');
			}
		});
		await new Promise<void>(resolve => apiServer.listen(0, '127.0.0.1', resolve));
		const apiAddress = apiServer.address();
		assert.ok(apiAddress && typeof apiAddress !== 'string');
		baseUrl = `http://127.0.0.1:${apiAddress.port}`;
		client = new CopilotClient({
			mode: 'coding-agent',
			runtime: RuntimeConnection.forSpawnedStdio({
				workingDirectory: home,
				baseDirectory: join(home, '.copilot'),
				env: createIsolatedProviderEnvironment(home, {
					PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
					COPILOT_API_URL: baseUrl, COPILOT_DEBUG_GITHUB_API_URL: baseUrl,
					COPILOT_TELEMETRY_ENABLED: 'false',
					NODE_EXTRA_CA_CERTS: fixture.caPath, SSL_CERT_FILE: fixture.caPath, REQUESTS_CA_BUNDLE: fixture.caPath, CURL_CA_BUNDLE: fixture.caPath,
				}),
			}),
			github: {
				useLoggedInUser: false,
			},
			observability: {
				logLevel: 'all',
			},
		});
	});

	teardown(async function () {
		try {
			assert.deepStrictEqual(await client?.stop() ?? [], []);
		} finally {
			if (home && this.currentTest?.state === 'failed') {
				preserveAgentHostE2ELogs(home, home, join(process.cwd(), '.build', 'logs', 'integration-tests', `connectors-${process.pid}`), this.currentTest.fullTitle());
			}
			apiServer?.closeAllConnections();
			if (apiServer?.listening) {
				await new Promise<void>((resolve, reject) => apiServer.close(error => error ? reject(error) : resolve()));
			}
			await fixture?.close();
		}
	});

	test('keeps the backing and unrelated servers while refreshing membership and targeting a reconnect', async () => {
		const session = await client.createSession({
			workingDirectory: home,
			github: {
				token: 'ghu_connector_integration_test_only',
			},
			enableConfigDiscovery: false,
			experiments: {
				flags: { CONNECTORS: true, MANAGED_MCP_SERVERS: true },
			},
			mcp: {
				disabledServers: ['github-mcp-server'],
				servers: { ordinary: { type: 'http', url: `${mcpUrl}/mcp/ordinary`, tools: ['*'] } },
			},
			permissions: {
				onRequest: async () => ({ kind: 'denied-interactively-by-user' }),
			},
		});
		const sdkSessionId = session.sessionId;
		const warnings: string[] = [];
		const log = new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		}();
		assert.strictEqual((await reconcileCopilotConnectors(session, log)).reconciled, true, [...warnings, ...tlsErrors].join('\n'));
		assert.deepStrictEqual({ ...initializations }, { mail: 1, calendar: 1, ordinary: 1 });

		assert.strictEqual((await reconcileCopilotConnectors(session, log, { preserveStoppedServers: true })).reconciled, true);
		assert.deepStrictEqual({ ...initializations }, { mail: 1, calendar: 1, ordinary: 1 });

		fixture.mailEndpoint = 'mail-relocated';
		const targeted = await reconcileCopilotConnectors(session, log, { forceConnectorName: 'mail', preserveStoppedServers: true });
		const status = await session.rpc.connectors.getStatus();
		const mail = status.runtimeServers.find(server => server.connectorName === 'mail');
		const calendar = status.runtimeServers.find(server => server.connectorName === 'calendar');
		assert.ok(mail && calendar);
		assert.deepStrictEqual({
			reconciled: targeted.reconciled, initializations,
			name: targeted.connectorServers?.servers.get(mail.runtimeServerId)?.displayName,
			tools: (await session.rpc.mcp.listTools({ serverName: mail.runtimeServerId })).tools.map(tool => tool.name),
			sdkSessionId: session.sessionId,
		}, {
			reconciled: true, initializations: { mail: 1, calendar: 1, ordinary: 1, 'mail-relocated': 1 },
			name: 'Test mail', tools: ['mail-relocated_ping'], sdkSessionId,
		});

		fixture.mailConnected = false;
		assert.strictEqual((await reconcileCopilotConnectors(session, log, { preserveStoppedServers: true })).reconciled, true);
		assert.deepStrictEqual((await session.rpc.connectors.getStatus()).runtimeServers.map(server => server.connectorName), ['calendar']);
		fixture.mailConnected = true;
		assert.strictEqual((await reconcileCopilotConnectors(session, log, { preserveStoppedServers: true })).reconciled, true);

		await session.rpc.mcp.stopServer({ serverName: calendar.runtimeServerId });
		const beforeDeferred = { ...initializations };
		const deferred = await reconcileCopilotConnectors(session, log, { preserveStoppedServers: true });
		const unrelatedTarget = await reconcileCopilotConnectors(session, log, { forceConnectorName: 'mail', preserveStoppedServers: true });
		assert.deepStrictEqual({
			deferred: deferred.reconciled, unrelatedTarget: unrelatedTarget.reconciled,
			calendarStarts: initializations.calendar, ordinaryStarts: initializations.ordinary,
			mailStarts: initializations['mail-relocated'], unexpectedRequests,
		}, {
			deferred: false, unrelatedTarget: true,
			calendarStarts: beforeDeferred.calendar, ordinaryStarts: beforeDeferred.ordinary,
			mailStarts: beforeDeferred['mail-relocated'] + 1, unexpectedRequests: [],
		});
		await session.disconnect();
	});
});

suite('Agent Host Copilot Connector tool calls (mock LLM)', function () {
	this.timeout(180_000);

	const scenarioId = 'connector-tool-call';
	const config: IAgentHostProviderTestConfig = {
		provider: 'copilotcli',
		scheme: 'copilotcli',
		githubToken: 'not-a-real-token',
		sessionConfig: { [SessionConfigKey.AutoApprove]: 'autoApprove' },
	};
	let fixture: IConnectorFixture;
	let server: IServerHandle;
	let client: TestProtocolClient;
	const createdSessions: string[] = [];

	suiteSetup(async function () {
		fixture = await startConnectorFixture(['mail']);
		server = await startRealServer({
			mockLlm: true,
			homeDir: fixture.home,
			userDataDir: join(fixture.home, 'user-data'),
			env: { NODE_EXTRA_CA_CERTS: fixture.caPath, SSL_CERT_FILE: fixture.caPath, REQUESTS_CA_BUNDLE: fixture.caPath, CURL_CA_BUNDLE: fixture.caPath },
			mockRoutes: (request, response, path) => fixture.serveApi(request, response, path, `http://${request.headers.host}`),
			mockScenarios: [{
				id: scenarioId,
				definition: {
					type: 'multi-turn',
					turns: [
						// Connector server IDs embed a runtime-generated hash, so match the tool by its MCP tool name.
						{ kind: 'tool-calls', toolCalls: [{ toolNamePattern: /^github-copilot-connector-[0-9a-f]+-mail_ping$/, arguments: {} }] },
						{ kind: 'content', chunks: [{ content: 'CONNECTOR_TOOL_DONE', delayMs: 0 }] },
					],
				},
			}],
		});
	});

	suiteTeardown(async function () {
		await stopServer(server);
		await fixture?.close();
	});

	setup(async function () {
		client = new TestProtocolClient(server.port);
		await client.connect();
	});

	teardown(async function () {
		for (const session of createdSessions) {
			try {
				await client.call('disposeSession', { session }, 5000);
			} catch { /* best-effort */ }
		}
		createdSessions.length = 0;
		client.close();
	});

	test('publishes the Connector display name separately from the runtime server identity', async function () {
		const workspace = await mkdtemp(join(tmpdir(), 'connector-workspace-'));
		try {
			const sessionUri = await createProviderSession(client, config, 'connector-display-name', createdSessions, URI.file(workspace), undefined, async () => {
				// Enable Connectors before authenticating so the provider starts with them rather than restarting for them.
				await client.call('subscribe', { channel: ROOT_STATE_URI });
				client.dispatch({ channel: ROOT_STATE_URI, clientSeq: 1, action: { type: ActionType.RootConfigChanged, config: { [AgentHostMcpConnectorsEnabledConfigKey]: true } } });
				await client.waitForNotification(n => isActionNotification(n, ActionType.RootConfigChanged) && getActionEnvelope(n).origin?.clientSeq === 1);
			});
			dispatchTurn(client, sessionUri, 'turn-connector', `[scenario:${scenarioId}] Ping the mail Connector.`, 2);
			await client.waitForNotification(n => isActionNotification(n, 'chat/turnComplete'), 90_000);

			const turn = (await fetchSessionWithChat(client, sessionUri)).turns.find(turn => turn.id === 'turn-connector');
			const toolCall = turn?.responseParts.find(part => part.kind === ResponsePartKind.ToolCall && part.toolCall.toolName.endsWith('-mail_ping'));
			assert.ok(toolCall?.kind === ResponsePartKind.ToolCall, JSON.stringify(turn?.responseParts));
			const meta = readToolCallMeta(toolCall.toolCall);
			assert.deepStrictEqual({
				mcpServerName: meta.mcpServerName?.replace(/[0-9a-f]+$/, '<hash>'),
				mcpServerDisplayName: meta['vscode.mcpServerDisplayName'],
				mcpToolName: meta.mcpToolName,
				status: toolCall.toolCall.status,
				mailServerStarted: fixture.initializations.mail > 0,
				unexpectedRequests: fixture.unexpectedRequests,
			}, {
				mcpServerName: 'github-copilot-connector-<hash>',
				mcpServerDisplayName: 'Test mail',
				mcpToolName: 'mail_ping',
				status: ToolCallStatus.Completed,
				mailServerStarted: true,
				unexpectedRequests: [],
			});
		} finally {
			await rm(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
		}
	});
});
