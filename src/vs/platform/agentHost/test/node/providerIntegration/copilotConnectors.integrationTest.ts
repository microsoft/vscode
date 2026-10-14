/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CopilotClient } from '@github/copilot-sdk';
import assert from 'assert';
import { execFile } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import type { RequestListener, Server as HttpServer } from 'http';
import type { Server } from 'https';
import { tmpdir } from 'os';
import { promisify } from 'util';
import { join } from '../../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../log/common/log.js';
import { reconcileCopilotConnectors } from '../../../node/copilot/copilotConnectors.js';
import { getAncillaryStub } from '../e2e/harness/capiStubs.js';
import { preserveAgentHostE2ELogs } from '../e2e/harness/agentHostE2EDiagnostics.js';
import { createIsolatedProviderEnvironment } from '../providerTestEnvironment.js';

suite('Copilot SDK Connector reconciliation', function () {
	ensureNoDisposablesAreLeakedInTestSuite();
	this.timeout(60_000);

	let client: CopilotClient;
	let server: Server;
	let apiServer: HttpServer;
	let home: string;
	let baseUrl: string;
	let mcpUrl: string;
	let mailEndpoint: string;
	let mailConnected: boolean;
	let initializations: Record<string, number>;
	let unexpectedRequests: string[];
	let tlsErrors: string[];

	setup(async () => {
		home = await mkdtemp(join(tmpdir(), 'copilot-connectors-'));
		mailEndpoint = 'mail';
		mailConnected = true;
		initializations = {};
		unexpectedRequests = [];
		tlsErrors = [];
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
		const handler: RequestListener = async (request, response) => {
			const path = new URL(request.url ?? '/', 'https://localhost').pathname;
			const json = (value: object) => {
				response.writeHead(200, { 'content-type': 'application/json' });
				response.end(JSON.stringify(value));
			};
			if (path.startsWith('/mcp/')) {
				if (request.method !== 'POST') {
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
						initializations[name] = (initializations[name] ?? 0) + 1;
						json({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: message.params?.protocolVersion, capabilities: { tools: {} }, serverInfo: { name, version: '1' } } });
						break;
					case 'tools/list':
						json({ jsonrpc: '2.0', id: message.id, result: { tools: [{ name: `${name}_ping`, description: 'Local test tool', inputSchema: { type: 'object', properties: {} } }] } });
						break;
					case 'tools/call':
						json({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: name }] } });
						break;
					case 'ping':
						json({ jsonrpc: '2.0', id: message.id, result: {} });
						break;
					case 'server/discover':
						json({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Use initialize' } });
						break;
					default:
						unexpectedRequests.push(message.method);
						json({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Unexpected MCP method' } });
				}
			} else if (path === '/copilot_internal/user') {
				json({ login: 'connector-test', copilot_plan: 'individual_pro', is_mcp_enabled: true, endpoints: { api: baseUrl } });
			} else if (path === '/user') {
				json({ login: 'connector-test', id: 1 });
			} else if (path === '/copilot-connectors/api/v1/plugins') {
				json({
					plugins: ['mail', 'calendar'].map(name => ({
						name, metadata: { displayName: `Test ${name}`, tier: 'standard', releaseTag: 'preview' },
						connection: { status: name === 'mail' && !mailConnected ? 'available' : 'connected' },
						mcpServers: { mcpServers: { [name]: { type: 'http', url: `${mcpUrl}/mcp/${name === 'mail' ? mailEndpoint : name}` } } },
					})),
				});
			} else {
				const stub = getAncillaryStub(request.method ?? 'GET', path);
				if (stub) {
					response.writeHead(stub.status, stub.headers);
					response.end(stub.body.replaceAll('${capi}', baseUrl));
				} else {
					unexpectedRequests.push(`${request.method} ${path}`);
					response.writeHead(500, { 'x-should-retry': 'false' }).end('Unexpected test endpoint');
				}
			}
		};
		const { createServer } = await import('https');
		server = createServer({ cert: await readFile(certPath), key: await readFile(keyPath) }, handler);
		server.on('tlsClientError', error => tlsErrors.push(error.message));
		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
		const address = server.address();
		assert.ok(address && typeof address !== 'string');
		mcpUrl = `https://127.0.0.1:${address.port}`;
		const http = await import('http');
		apiServer = http.createServer(handler);
		await new Promise<void>(resolve => apiServer.listen(0, '127.0.0.1', resolve));
		const apiAddress = apiServer.address();
		assert.ok(apiAddress && typeof apiAddress !== 'string');
		baseUrl = `http://127.0.0.1:${apiAddress.port}`;
		client = new CopilotClient({
			workingDirectory: home,
			baseDirectory: join(home, '.copilot'),
			useLoggedInUser: false,
			logLevel: 'all',
			env: createIsolatedProviderEnvironment(home, {
				PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
				COPILOT_API_URL: baseUrl, COPILOT_DEBUG_GITHUB_API_URL: baseUrl,
				COPILOT_TELEMETRY_ENABLED: 'false',
				NODE_EXTRA_CA_CERTS: caPath, SSL_CERT_FILE: caPath, REQUESTS_CA_BUNDLE: caPath, CURL_CA_BUNDLE: caPath,
			}),
		});
	});

	teardown(async function () {
		try {
			assert.deepStrictEqual(await client?.stop() ?? [], []);
		} finally {
			if (home && this.currentTest?.state === 'failed') {
				preserveAgentHostE2ELogs(home, home, join(process.cwd(), '.build', 'logs', 'integration-tests', `connectors-${process.pid}`), this.currentTest.fullTitle());
			}
			for (const fixture of [server, apiServer]) {
				fixture?.closeAllConnections();
				if (fixture?.listening) {
					await new Promise<void>((resolve, reject) => fixture.close(error => error ? reject(error) : resolve()));
				}
			}
			if (home) {
				await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
			}
		}
	});

	test('keeps the backing and unrelated servers while refreshing membership and targeting a reconnect', async () => {
		const session = await client.createSession({
			workingDirectory: home,
			gitHubToken: 'ghu_connector_integration_test_only',
			enableConfigDiscovery: false,
			featureFlags: { CONNECTORS: true, MANAGED_MCP_SERVERS: true },
			disabledMcpServers: ['github-mcp-server'],
			mcpServers: { ordinary: { type: 'http', url: `${mcpUrl}/mcp/ordinary`, tools: ['*'] } },
			onPermissionRequest: async () => ({ kind: 'denied-interactively-by-user' }),
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

		mailEndpoint = 'mail-relocated';
		const targeted = await reconcileCopilotConnectors(session, log, { forceConnectorName: 'mail', preserveStoppedServers: true });
		const status = await session.rpc.connectors.getStatus();
		const mail = status.runtimeServers.find(server => server.connectorName === 'mail');
		const calendar = status.runtimeServers.find(server => server.connectorName === 'calendar');
		assert.ok(mail && calendar);
		assert.deepStrictEqual({
			reconciled: targeted.reconciled, initializations,
			name: targeted.displayNames?.get(mail.runtimeServerId),
			tools: (await session.rpc.mcp.listTools({ serverName: mail.runtimeServerId })).tools.map(tool => tool.name),
			sdkSessionId: session.sessionId,
		}, {
			reconciled: true, initializations: { mail: 1, calendar: 1, ordinary: 1, 'mail-relocated': 1 },
			name: 'Test mail', tools: ['mail-relocated_ping'], sdkSessionId,
		});

		mailConnected = false;
		assert.strictEqual((await reconcileCopilotConnectors(session, log, { preserveStoppedServers: true })).reconciled, true);
		assert.deepStrictEqual((await session.rpc.connectors.getStatus()).runtimeServers.map(server => server.connectorName), ['calendar']);
		mailConnected = true;
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
