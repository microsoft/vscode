/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { existsSync } from 'fs';
import { cp, mkdir, realpath, rm } from 'fs/promises';
import { createRequire } from 'module';
import { CopilotClient, RuntimeConnection, type SessionConfig } from '@github/copilot-sdk';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { dirname, join } from '../../../../../base/common/path.js';
import { hasKey } from '../../../../../base/common/types.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AgentHostLaunchKind, AgentHostLaunchKindEnvVar } from '../../../common/agentHostTelemetry.js';
import { CopilotCanvases } from '../../../node/copilot/copilotCanvases.js';
import { createCopilotCliEnvironment } from '../../../node/copilot/copilotCliEnvironment.js';
import { createLocalCanvasPocHostEnvironment, LocalCanvasPoc, LocalCanvasPocRootEnvVar } from '../../../node/copilot/localCanvasPoc.js';
import { NoModelRequests, readCanvasFixtureAudit, waitFor } from './copilotCanvasTestUtils.js';

function hasHomeFields(value: unknown): value is { home: unknown; copilotHome: unknown } {
	return typeof value === 'object' && value !== null && hasKey(value, { home: true, copilotHome: true });
}

suite('Agent Host Provider Integration - Local Canvas Adapter', function () {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	this.timeout(120_000);

	test('production stdio entrypoint supports isolated canvases, peer identities, reload and cold restore without model calls', async () => {
		let root = join(process.cwd(), '.build', `canvas-adapter-${generateUuid()}`);
		const clients: CopilotClient[] = [];
		const controllers = store.add(new DisposableStore());
		const requests = new NoModelRequests();
		const permissionRequests: string[] = [];
		try {
			for (const directory of ['home/.config', 'copilot-home/extensions', 'workspace']) {
				await mkdir(join(root, directory), { recursive: true });
			}
			root = await realpath(root);
			const extensionId = 'user:local-canvas-adapter';
			const extensionDirectory = join(root, 'copilot-home', 'extensions', 'local-canvas-adapter');
			await cp(new URL('./fixtures/localCanvas/', import.meta.url), extensionDirectory, { recursive: true });
			const poc = LocalCanvasPoc.read(false, { [LocalCanvasPocRootEnvVar]: root, [AgentHostLaunchKindEnvVar]: AgentHostLaunchKind.VSCodeMainProcess });
			assert.ok(poc);
			const mainEnvironment = {
				PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DO_NOT_TRACK: '1',
				HOME: join(root, 'ui-home'), USERPROFILE: join(root, 'ui-home'), COPILOT_HOME: join(root, 'ui-home', '.copilot'),
				[LocalCanvasPocRootEnvVar]: root, [AgentHostLaunchKindEnvVar]: AgentHostLaunchKind.VSCodeMainProcess,
			};
			const environment = createCopilotCliEnvironment(createLocalCanvasPocHostEnvironment(false, mainEnvironment));
			poc.applyEnvironment(environment);
			const require = createRequire(import.meta.url);
			const cliPath = join(dirname(require.resolve(`@github/copilot-${process.platform}-${process.arch}`)), 'index.js');
			const start = async () => {
				const client = new CopilotClient({
					connection: RuntimeConnection.forStdio({ path: cliPath }),
					...poc.clientOptions,
					env: environment,
					useLoggedInUser: false,
					enableRemoteSessions: false,
					requestHandler: requests,
					logLevel: 'error',
				});
				clients.push(client);
				await client.start();
				return client;
			};
			const config: SessionConfig = {
				model: 'canvas-adapter-no-model',
				provider: { type: 'openai', wireApi: 'responses', baseUrl: 'http://127.0.0.1:1' },
				workingDirectory: poc.workspace.fsPath,
				configDirectory: poc.copilotHome,
				availableTools: [],
				excludedTools: ['extensions_manage', 'extensions_reload'],
				requestExtensions: true,
				requestCanvasRenderer: true,
				enableConfigDiscovery: true,
				enableFileHooks: true,
				enableSessionTelemetry: false,
				enableSessionStore: false,
				memory: { enabled: false },
				skipEmbeddingRetrieval: true,
				embeddingCacheStorage: 'in-memory',
				mcpServers: {},
				disabledMcpServers: ['github-mcp-server'],
				mcpOAuthTokenStorage: 'in-memory',
				pluginDirectories: [],
				remoteSession: 'off',
				onPermissionRequest: request => {
					permissionRequests.push(request.kind);
					return { kind: 'denied-no-approval-rule-and-could-not-request-from-user' };
				},
			};
			const client = await start();
			assert.deepStrictEqual({
				sessions: await client.listSessions(),
				discovered: (await client.rpc.sessions.list({})).sessions,
			}, { sessions: [], discovered: [] });
			const firstSession = await client.createSession({ ...config, sessionId: 'canvas-adapter-first' });
			await firstSession.rpc.name.set({ name: 'Local Canvas Adapter' });
			const first = controllers.add(new CopilotCanvases(firstSession));
			const initial = await first.getState();
			assert.deepStrictEqual(initial.catalog.map(canvas => canvas.extensionId), [extensionId]);
			const open = { extensionId, canvasId: 'counter', instanceId: 'same-id', input: { documentId: 'first-document' } };
			const original = await first.open(open);

			const peerSession = await client.createSession({ ...config, sessionId: 'canvas-adapter-peer' });
			const peer = controllers.add(new CopilotCanvases(peerSession));
			await peer.open({ ...open, input: { documentId: 'peer-document' } });
			const firstAction = await first.invokeAction({ instanceId: 'same-id', actionName: 'increment', input: { amount: 2 } });
			const peerAction = await peer.invokeAction({ instanceId: 'same-id', actionName: 'increment', input: { amount: 3 } });
			await assert.rejects(first.invokeAction({ instanceId: 'same-id', actionName: 'increment', input: { amount: 0 } }));
			await first.open({ ...open, instanceId: 'closed-before-resume' });
			await first.close('closed-before-resume');
			await peer.close('same-id');

			const availability: string[] = [];
			controllers.add(first.onDidChange(state => {
				const instance = state.instances.find(instance => instance.instanceId === 'same-id');
				if (instance) {
					availability.push(instance.availability);
				}
			}));
			await first.reload();
			const reloaded = await waitFor(() => first.getState(), state => state.instances[0]?.availability === 'ready' && state.instances[0].url !== original.url);
			const beforeRestore = reloaded.instances[0];
			const retiredOnReload = availability.includes('unavailable');
			const metadata = await client.getSessionMetadata(firstSession.sessionId);
			assert.deepStrictEqual({
				metadataId: metadata?.sessionId,
				workingDirectory: metadata?.context?.workingDirectory,
				journalInIsolatedHome: existsSync(join(poc.copilotHome, 'session-state', firstSession.sessionId, 'events.jsonl')),
				foreignSessions: (await client.listSessions()).filter(session => ![firstSession.sessionId, peerSession.sessionId].includes(session.sessionId)),
			}, {
				metadataId: firstSession.sessionId,
				workingDirectory: poc.workspace.fsPath,
				journalInIsolatedHome: true,
				foreignSessions: [],
			});
			controllers.clear();
			assert.deepStrictEqual(await client.stop(), []);

			const restoredClient = await start();
			const restoredSession = await restoredClient.resumeSession(firstSession.sessionId, config);
			const restored = controllers.add(new CopilotCanvases(restoredSession));
			const resumed = await waitFor(() => restored.getState(), state => state.instances[0]?.availability === 'ready');
			const instance = resumed.instances[0];
			assert.ok(instance.availability === 'ready');
			const url = new URL(instance.url);
			url.pathname = '/document';
			const document = await (await fetch(url, { signal: AbortSignal.timeout(5000) })).json();
			url.pathname = '/health';
			const health: unknown = await (await fetch(url, { signal: AbortSignal.timeout(5000) })).json();
			assert.ok(hasHomeFields(health));
			assert.deepStrictEqual({
				firstAction, peerAction, document,
				home: health.home, copilotHome: health.copilotHome,
				mainHome: mainEnvironment.HOME,
				retiredOnReload,
				freshOnRestore: instance.url !== beforeRestore.url,
				instances: resumed.instances.map(instance => ({ instanceId: instance.instanceId, input: instance.input })),
				actionCount: (await readCanvasFixtureAudit(extensionDirectory, 'action')).length,
				permissionRequests, modelRequests: requests.requests,
			}, {
				firstAction: { result: { documentId: 'first-document', value: 2, actions: 1, interactions: 0 } },
				peerAction: { result: { documentId: 'peer-document', value: 3, actions: 1, interactions: 0 } },
				document: { documentId: 'first-document', value: 2, actions: 1, interactions: 0 },
				home: poc.home, copilotHome: poc.copilotHome,
				mainHome: join(root, 'ui-home'),
				retiredOnReload: true, freshOnRestore: true,
				instances: [{ instanceId: 'same-id', input: { documentId: 'first-document' } }],
				actionCount: 2, permissionRequests: [], modelRequests: [],
			});
		} finally {
			controllers.dispose();
			for (const client of clients.reverse()) {
				await client.stop();
			}
			await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
		}
	});
});
