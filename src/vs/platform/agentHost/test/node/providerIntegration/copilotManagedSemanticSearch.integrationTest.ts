/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdir, rm } from 'fs/promises';
import type { Server } from 'http';
import { tmpdir } from 'os';
import { join } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import type { IAgentHostManagedSettingsPermissions } from '../../../common/agentHostManagedSettings.js';
import { SEMANTIC_SEARCH_TOOL_NAME } from '../../../common/semanticSearchConstants.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { driveTurnWithModelToCompletion } from '../e2e/harness/agentHostE2ETestHarness.js';
import { getAncillaryStub } from '../e2e/harness/capiStubs.js';
import { createTestDirectory } from '../e2e/harness/testDirectories.js';
import { createProviderSession } from '../providerIntegrationTestHelpers.js';
import { getActionEnvelope, isActionNotification, startRealServer, stopServer, TestProtocolClient, type IServerHandle } from '../serverIntegrationTestHelpers.js';

interface IChatRequest {
	readonly model: string;
	readonly stream?: boolean;
	readonly messages: readonly unknown[];
	readonly tools?: readonly { readonly name?: string; readonly function?: { readonly name: string } }[];
}

/**
 * Checks, against the bundled runtime, whether the client's semantic search
 * reaches the model. Managed permission rules cannot be matched against a
 * search query, so the host must not offer the tool while any rule is active.
 */
suite('Agent Host Provider Integration — Copilot managed semantic search', function () {
	this.timeout(120_000);
	ensureNoDisposablesAreLeakedInTestSuite();

	let directory: string;
	let endpoint: string;
	let collector: Server | undefined;
	let host: IServerHandle | undefined;
	let client: TestProtocolClient | undefined;
	const requests: IChatRequest[] = [];
	const unexpectedRequests: string[] = [];
	const config = { provider: 'copilotcli', scheme: 'copilotcli', githubToken: 'synthetic-no-real-credential' };

	setup(async () => {
		directory = createTestDirectory(join(tmpdir(), 'copilot-managed-semantic-search-'));
		await mkdir(join(directory, 'workspace'));
		requests.length = 0;
		unexpectedRequests.length = 0;
		const { createServer } = await import('http');
		collector = createServer(async (request, response) => {
			const path = new URL(request.url ?? '/', 'http://localhost').pathname;
			let body = '';
			for await (const chunk of request) {
				body += chunk;
			}
			if (path === '/chat/completions' && request.method === 'POST') {
				const chat: IChatRequest = JSON.parse(body);
				requests.push(chat);
				const completion = {
					id: 'synthetic-semantic-search-completion', model: chat.model,
					usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
				};
				const message = { role: 'assistant', content: 'SEMANTIC_SEARCH_READY' };
				if (chat.stream) {
					response.writeHead(200, { 'content-type': 'text/event-stream' });
					response.end(`data: ${JSON.stringify({ ...completion, choices: [{ index: 0, delta: message, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`);
				} else {
					response.writeHead(200, { 'content-type': 'application/json' });
					response.end(JSON.stringify({ ...completion, choices: [{ index: 0, message, finish_reason: 'stop' }] }));
				}
				return;
			}
			const stub = getAncillaryStub(request.method ?? 'GET', path, body);
			if (stub) {
				response.writeHead(stub.status, stub.headers);
				response.end(stub.body.replaceAll('${capi}', endpoint));
				return;
			}
			unexpectedRequests.push(`${request.method} ${path}`);
			response.writeHead(500, { 'x-should-retry': 'false' });
			response.end('Unexpected synthetic endpoint');
		});
		await new Promise<void>(resolve => collector!.listen(0, '127.0.0.1', resolve));
		const address = collector.address();
		assert.ok(address && typeof address !== 'string');
		endpoint = `http://127.0.0.1:${address.port}`;
	});

	teardown(async function () {
		this.timeout(60_000);
		client?.close();
		client = undefined;
		try {
			await stopServer(host);
			host = undefined;
		} finally {
			try {
				if (collector) {
					collector.closeAllConnections();
					await new Promise<void>((resolve, reject) => collector!.close(error => error ? reject(error) : resolve()));
					collector = undefined;
				}
			} finally {
				await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
			}
		}
	});

	async function offersSemanticSearch(permissions: IAgentHostManagedSettingsPermissions): Promise<{ offered: boolean; response: string }> {
		host = await startRealServer({
			homeDir: directory, userDataDir: join(directory, 'user-data'),
			env: {
				COPILOT_API_URL: endpoint, COPILOT_DEBUG_GITHUB_API_URL: endpoint,
				VSCODE_AGENT_HOST_CAPI_URL_OVERRIDE: endpoint,
				COPILOT_MANAGED_SETTINGS_CACHE: '0', COPILOT_TELEMETRY_ENABLED: 'false',
			},
		});
		const connection = client = new TestProtocolClient(host.port);
		await connection.connect();
		const clientId = 'managed-semantic-search-client';
		// A local workbench bridges legacy VS Code policies to the host this way.
		const session = await createProviderSession(connection, config, clientId, [], URI.file(join(directory, 'workspace')), async () => {
			connection.notify('setClientManagedSettingsPermissions', { permissions });
		});
		connection.dispatch({
			channel: session,
			clientSeq: 1,
			action: {
				type: ActionType.SessionActiveClientSet,
				activeClient: {
					clientId,
					tools: [{
						name: SEMANTIC_SEARCH_TOOL_NAME,
						description: 'Semantically searches the workspace.',
						inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
					}],
				},
			},
		});
		await connection.waitForNotification(n => isActionNotification(n, ActionType.SessionActiveClientSet)
			&& getActionEnvelope(n).origin?.clientSeq === 1, 30_000);

		const prompt = 'Reply SEMANTIC_SEARCH_READY.';
		const completed = await driveTurnWithModelToCompletion(connection, session, 'semantic-search-turn', prompt, 'gpt-4o', 2);
		const matching = requests.filter(request => request.tools?.length && JSON.stringify(request.messages).includes(prompt));
		assert.ok(matching.length > 0, 'The real SDK must send the test turn to the local model');
		return {
			offered: matching.some(request => request.tools?.some(tool => (tool.name ?? tool.function?.name) === SEMANTIC_SEARCH_TOOL_NAME)),
			response: completed.responseText.trim(),
		};
	}

	test('offers semantic search without managed permission rules', async () => {
		assert.deepStrictEqual({ ...await offersSemanticSearch({}), unexpectedRequests }, {
			offered: true, response: 'SEMANTIC_SEARCH_READY', unexpectedRequests: [],
		});
	});

	test('withholds semantic search while a managed permission rule is active', async () => {
		assert.deepStrictEqual({ ...await offersSemanticSearch({ ask: ['Shell'] }), unexpectedRequests }, {
			offered: false, response: 'SEMANTIC_SEARCH_READY', unexpectedRequests: [],
		});
	});
});
