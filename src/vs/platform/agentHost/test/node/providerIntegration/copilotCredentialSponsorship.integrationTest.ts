/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CopilotClient, type CopilotSession, type SessionConfig } from '@github/copilot-sdk';
import assert from 'assert';
import { mkdtemp, rm } from 'fs/promises';
import type { Server } from 'http';
import { tmpdir } from 'os';
import { join } from '../../../../../base/common/path.js';
import { captureCredentialSource } from '../../../common/agentHostCredentials.js';
import { AgentHostAuthenticationScope } from '../../../node/agentHostAuthenticationScope.js';
import { CopilotGitHubSessionCredentials } from '../../../node/copilot/copilotGitHubCredentials.js';
import { getAncillaryStub } from '../e2e/harness/capiStubs.js';
import { createIsolatedProviderEnvironment } from '../providerTestEnvironment.js';

suite('Copilot SDK credential sponsorship', function () {
	this.timeout(90_000);

	let server: Server;
	let home: string;
	let endpoint: string;
	const clients: CopilotClient[] = [];
	const scopes: AgentHostAuthenticationScope[] = [];
	let githubTokens: string[];
	let modelTokens: string[];
	let unexpectedRequests: string[];

	setup(async () => {
		home = await mkdtemp(join(tmpdir(), 'copilot-sponsorship-'));
		githubTokens = [];
		modelTokens = [];
		unexpectedRequests = [];
		const { createServer } = await import('http');
		server = createServer(async (request, response) => {
			const path = new URL(request.url ?? '/', 'http://localhost').pathname;
			let body = '';
			for await (const chunk of request) {
				body += chunk;
			}
			const authorization = request.headers.authorization?.replace(/^Bearer /i, '') ?? '';
			const json = (value: object) => {
				response.writeHead(200, { 'content-type': 'application/json' });
				response.end(JSON.stringify(value));
			};
			if (path === '/user') {
				githubTokens.push(authorization);
				json({ login: 'replay-user', id: 1, type: 'User' });
			} else if (path === '/copilot_internal/managed_settings') {
				githubTokens.push(authorization);
				json({});
			} else if (path.includes('/copilot_internal/') && (path.includes('/token') || path.includes('/nltoken'))) {
				githubTokens.push(authorization);
				json({
					token: `capi-${authorization}`,
					expires_at: Math.floor(Date.now() / 1000) + 3600,
					refresh_in: 1800,
					endpoints: { api: endpoint, proxy: endpoint, telemetry: endpoint },
				});
			} else if (path === '/chat/completions' && request.method === 'POST') {
				modelTokens.push(authorization);
				json({
					id: 'sponsorship-completion',
					choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
					usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
				});
			} else {
				const stub = getAncillaryStub(request.method ?? 'GET', path, body);
				if (stub) {
					response.writeHead(stub.status, stub.headers);
					response.end(stub.body.replaceAll('${capi}', endpoint));
				} else {
					unexpectedRequests.push(`${request.method} ${path}`);
					response.writeHead(500, { 'x-should-retry': 'false' });
					response.end('Unexpected credential-sponsorship endpoint');
				}
			}
		});
		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
		const address = server.address();
		assert.ok(address && typeof address !== 'string');
		endpoint = `http://127.0.0.1:${address.port}`;
	});

	teardown(async () => {
		try {
			const results = await Promise.all(clients.splice(0).map(client => client.stop()));
			assert.deepStrictEqual(results.flat(), []);
		} finally {
			for (const scope of scopes.splice(0)) {
				scope.dispose();
			}
			server?.closeAllConnections();
			if (server?.listening) {
				await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
			}
			if (home) {
				await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
			}
		}
	});

	const resource = 'https://api.github.com';
	const metadata = [{ resource }];

	async function createScope(token: string, expiresIn?: number): Promise<AgentHostAuthenticationScope> {
		const scope = new AgentHostAuthenticationScope(async params => params, () => { }, { apiOrigin: resource, userId: '1' });
		scopes.push(scope);
		await scope.authenticate({ resource, token, expiresIn }, [resource]);
		return scope;
	}

	function sessionOptions(scope: AgentHostAuthenticationScope): SessionConfig {
		const source = captureCredentialSource(scope, metadata);
		const credential = source.getCredential({ resource });
		assert.ok(credential);
		return {
			...CopilotGitHubSessionCredentials.fromCredential(credential).sdkSessionOptions,
			model: 'gpt-4o',
			workingDirectory: home,
			availableTools: [],
			enableManagedSettings: true,
			enableConfigDiscovery: false,
			onPermissionRequest: async () => ({ kind: 'denied-interactively-by-user' }),
		};
	}

	function createClient(token: string, name: string): CopilotClient {
		const client = new CopilotClient({
			mode: 'empty',
			baseDirectory: join(home, name),
			workingDirectory: home,
			useLoggedInUser: false,
			gitHubToken: token,
			env: createIsolatedProviderEnvironment(home, {
				PATH: process.env.PATH,
				SystemRoot: process.env.SystemRoot,
				COPILOT_API_URL: endpoint,
				COPILOT_DEBUG_GITHUB_API_URL: endpoint,
				COPILOT_MANAGED_SETTINGS_CACHE: '0',
				COPILOT_TELEMETRY_ENABLED: 'false',
			}),
		});
		clients.push(client);
		return client;
	}

	async function send(session: CopilotSession): Promise<void> {
		const response = await session.sendAndWait({ prompt: 'Reply only OK' }, 20_000);
		assert.strictEqual(response?.data.content, 'OK');
	}

	test('distinct captured credentials reach the bundled runtime and remain stable across rotation until resume', async () => {
		const firstScope = await createScope('scope-a', 7200);
		const secondScope = await createScope('scope-b');
		const firstClient = createClient('scope-a', 'first');
		const secondClient = createClient('scope-b', 'second');
		const [first, second] = await Promise.all([
			firstClient.createSession(sessionOptions(firstScope)),
			secondClient.createSession(sessionOptions(secondScope)),
		]);
		await Promise.all([send(first), send(second)]);
		const initialModelTokens = [...modelTokens].sort();
		modelTokens.length = 0;
		await firstScope.authenticate({ resource, token: 'scope-a-rotated', expiresIn: 7200 }, [resource]);
		await send(first);
		const inFlightCaptureTokens = [...modelTokens];
		const sessionId = first.sessionId;
		await first.disconnect();
		modelTokens.length = 0;
		const resumed = await firstClient.resumeSession(sessionId, sessionOptions(firstScope));
		await send(resumed);
		const resumedTokens = [...modelTokens];
		await Promise.all([resumed.disconnect(), second.disconnect()]);
		assert.deepStrictEqual({
			initialModelTokens,
			inFlightCaptureTokens,
			resumedTokens,
			githubTokenKinds: [...new Set(githubTokens)].sort(),
			unexpectedRequests,
		}, {
			initialModelTokens: ['scope-a', 'scope-b'],
			inFlightCaptureTokens: ['scope-a'],
			resumedTokens: ['scope-a-rotated'],
			githubTokenKinds: ['scope-a', 'scope-a-rotated', 'scope-b'],
			unexpectedRequests: [],
		});
	});
});
