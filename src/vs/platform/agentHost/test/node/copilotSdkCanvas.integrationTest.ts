/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { CopilotClient, RuntimeConnection, approveAll, type CopilotSession, type SessionConfig } from '@github/copilot-sdk';
import { retry } from '../../../../base/common/async.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { join } from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { getAppNodeModulesUri } from '../../node/appNodeModules.js';
import { createCopilotCliEnvironment } from '../../node/copilot/copilotCliEnvironment.js';
import { resolveCopilotRuntimePaths } from '../../node/copilot/copilotRuntimePaths.js';
import { CopilotSessionExtensionLaunchAdmission } from '../../node/copilot/copilotSessionExtensionLaunchAdmission.js';
import { createIsolatedProviderEnvironment } from './providerTestEnvironment.js';

suite('Copilot SDK - canvases', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('discovers session extensions for the exact owner on create, reload, and cold resume', async function () {
		this.timeout(180_000);
		const { runtimePath, extensionSdkPath, extensionBootstrapPath } = await resolveCopilotRuntimePaths(getAppNodeModulesUri());
		assert.ok(extensionSdkPath && extensionBootstrapPath);
		const root = await mkdtemp(join(tmpdir(), 'ahp-session-canvas-'));
		const workDirectory = join(root, 'work');
		const ownerId = 'canvas-owner';
		const peerId = 'canvas-peer';
		const requests: { id: string; source: string; admitted: boolean }[] = [];
		const createClient = () => {
			const admission = disposables.add(new CopilotSessionExtensionLaunchAdmission(root, new NullLogService()));
			disposables.add(admission.acquire(ownerId));
			disposables.add(admission.acquire(peerId));
			return new CopilotClient({
				mode: 'empty',
				connection: RuntimeConnection.forStdio({ path: runtimePath }),
				baseDirectory: root,
				useLoggedInUser: false,
				logLevel: 'error',
				env: createCopilotCliEnvironment(createIsolatedProviderEnvironment(root)),
				extensionLaunchProvider: {
					resolve: async request => {
						const modulePath = await admission.resolve(request);
						requests.push({ id: request.id, source: request.source, admitted: modulePath !== undefined });
						return modulePath ? {
							launch: {
								executable: process.execPath,
								args: [extensionBootstrapPath],
								env: { EXTENSION_PATH: modulePath, ELECTRON_RUN_AS_NODE: '1' },
							},
						} : {};
					},
				},
			});
		};
		const config: SessionConfig = {
			workingDirectory: workDirectory,
			availableTools: [],
			disabledMcpServers: ['github-mcp-server'],
			enableConfigDiscovery: true,
			infiniteSessions: { enabled: true },
			requestExtensions: true,
			requestCanvasRenderer: true,
			extensionSdkPath,
			onPermissionRequest: approveAll,
		};
		const writeExtension = async (sessionId: string, name: string) => {
			const directory = join(root, 'session-state', sessionId, 'extensions', name);
			await mkdir(directory, { recursive: true });
			await writeFile(join(directory, 'extension.mjs'), `
import { createCanvas, joinSession } from '@github/copilot-sdk/extension';
await joinSession({
	canvases: [createCanvas({
		id: '${name}',
		displayName: 'Session canvas',
		description: 'Model-free session discovery test.',
		open: () => ({ url: 'http://127.0.0.1:43119/${sessionId}/${name}' }),
	})],
});
`, 'utf8');
		};
		const canvasIds = async (session: CopilotSession) => (await session.rpc.canvas.list()).canvases.map(canvas => canvas.canvasId).sort();
		const waitForCanvases = async (session: CopilotSession, expected: string[]) => {
			await retry(async () => assert.deepStrictEqual(await canvasIds(session), expected), 100, 300);
		};
		let client = createClient();
		let owner: CopilotSession | undefined;
		let peer: CopilotSession | undefined;
		try {
			await mkdir(workDirectory, { recursive: true });
			await writeExtension(ownerId, 'preview');
			await writeExtension(peerId, 'peer-only');
			await client.start();
			owner = await client.createSession({ ...config, sessionId: ownerId });
			peer = await client.createSession({ ...config, sessionId: peerId });
			await waitForCanvases(owner, ['preview']);
			await waitForCanvases(peer, ['peer-only']);
			await writeExtension(ownerId, 'added');
			await owner.rpc.extensions.reload();
			await waitForCanvases(owner, ['added', 'preview']);
			await waitForCanvases(peer, ['peer-only']);
			await owner.rpc.canvas.open({ canvasId: 'preview', instanceId: 'persist-owner' });
			await owner.rpc.canvas.close({ instanceId: 'persist-owner' });
			await owner.disconnect();
			owner = undefined;
			await peer.disconnect();
			peer = undefined;
			assert.deepStrictEqual(await client.stop(), []);
			client = createClient();
			await client.start();
			owner = await client.resumeSession(ownerId, config);
			await waitForCanvases(owner, ['added', 'preview']);
			const opened = await owner.rpc.canvas.open({ canvasId: 'preview', instanceId: 'resumed-owner' });
			assert.deepStrictEqual({
				url: opened.url,
				extensions: [...new Set(requests.map(request => request.id))].sort(),
				onlyAdmittedSessionSources: requests.every(request => request.source === 'session' && request.admitted),
			}, {
				url: `http://127.0.0.1:43119/${ownerId}/preview`,
				extensions: [`session:${ownerId}:added`, `session:${ownerId}:preview`, `session:${peerId}:peer-only`],
				onlyAdmittedSessionSources: true,
			});
		} finally {
			try {
				await owner?.disconnect();
				await peer?.disconnect();
			} finally {
				try {
					await client.stop();
				} finally {
					await rm(root, { recursive: true, force: true });
				}
			}
		}
	});

	test('records first opens but not repeat opens, provider reload, or cold resume', async function () {
		this.timeout(180_000);
		const { runtimePath, extensionSdkPath, extensionBootstrapPath } = await resolveCopilotRuntimePaths(getAppNodeModulesUri());
		assert.ok(extensionSdkPath && extensionBootstrapPath, 'Bundled canvas extension assets must be available');
		const root = await mkdtemp(join(tmpdir(), 'ahp-canvas-contract-'));
		const workDirectory = join(root, 'work');
		const extensionDirectory = join(workDirectory, '.github', 'extensions', 'canvas-contract');
		const listeners = disposables.add(new DisposableStore());
		const createClient = () => new CopilotClient({
			mode: 'empty',
			connection: RuntimeConnection.forStdio({ path: runtimePath }),
			baseDirectory: root,
			useLoggedInUser: false,
			logLevel: 'error',
			env: createCopilotCliEnvironment(createIsolatedProviderEnvironment(root)),
			extensionLaunchProvider: {
				resolve: async request => ({
					launch: {
						executable: process.execPath,
						args: [extensionBootstrapPath],
						env: { EXTENSION_PATH: request.modulePath, ELECTRON_RUN_AS_NODE: '1' },
					},
				}),
			},
		});
		const config: SessionConfig = {
			workingDirectory: workDirectory,
			availableTools: [],
			disabledMcpServers: ['github-mcp-server'],
			enableConfigDiscovery: true,
			requestExtensions: true,
			requestCanvasRenderer: true,
			extensionSdkPath,
			onPermissionRequest: approveAll,
		};
		const instanceId = 'contract-instance';
		let liveRecords = 0;
		const observations: { phase: string; live: number; history: number }[] = [];
		const observe = (session: CopilotSession) => {
			listeners.add(toDisposable(session.on('session.canvas.recorded', () => liveRecords++)));
		};
		const capture = async (session: CopilotSession, phase: string) => {
			const history = await session.getEvents();
			const records = history.filter(event => event.type === 'session.canvas.recorded').length;
			await retry(async () => assert.strictEqual(liveRecords, records, `${phase}: live events must match history`), 50, 100);
			observations.push({ phase, live: liveRecords, history: records });
		};
		const waitForOpen = (session: CopilotSession, previousUrl: string | undefined) => retry(async () => {
			const { openCanvases } = await session.rpc.canvas.listOpen();
			const canvas = openCanvases.find(canvas => canvas.instanceId === instanceId);
			assert.ok(canvas?.url && canvas.url !== previousUrl, 'Canvas must be ready in a new provider process');
			return canvas.url;
		}, 100, 300);
		let client = createClient();
		let session: CopilotSession | undefined;

		try {
			await mkdir(extensionDirectory, { recursive: true });
			await writeFile(join(extensionDirectory, 'extension.mjs'), `
import { randomUUID } from 'node:crypto';
import { createCanvas, joinSession } from '@github/copilot-sdk/extension';
const generation = randomUUID();
await joinSession({
	canvases: [createCanvas({
		id: 'contract',
		displayName: 'Contract canvas',
		description: 'Model-free canvas lifecycle test.',
		open: ({ instanceId }) => ({ url: \`http://127.0.0.1:43119/\${generation}/\${instanceId}\` }),
	})],
});
`, 'utf8');
			await client.start();
			session = await client.createSession(config);
			observe(session);
			const created = session;
			await retry(async () => {
				const { canvases } = await created.rpc.canvas.list();
				assert.ok(canvases.some(canvas => canvas.canvasId === 'contract'), 'Test provider must register its canvas');
			}, 100, 300);

			const first = await session.rpc.canvas.open({ canvasId: 'contract', instanceId });
			const firstUrl = await waitForOpen(session, undefined);
			assert.strictEqual(first.url, firstUrl);
			await capture(session, 'first open');

			const repeated = await session.rpc.canvas.open({ canvasId: 'contract', instanceId });
			assert.strictEqual(repeated.url, firstUrl);
			await capture(session, 'repeat open');

			await session.rpc.extensions.reload();
			const reloadedUrl = await waitForOpen(session, firstUrl);
			await capture(session, 'provider reload');

			// Closing persists this model-free session before the cold-resume check.
			await session.rpc.canvas.close({ instanceId });
			assert.deepStrictEqual((await session.rpc.canvas.listOpen()).openCanvases, []);
			const reopened = await session.rpc.canvas.open({ canvasId: 'contract', instanceId });
			assert.strictEqual(reopened.url, reloadedUrl);
			await capture(session, 'close and reopen');

			const sessionId = session.sessionId;
			await session.disconnect();
			session = undefined;
			assert.deepStrictEqual(await client.stop(), [], 'The original runtime must stop before cold resume');
			listeners.clear();
			client = createClient();
			await client.start();
			session = await client.resumeSession(sessionId, config);
			observe(session);
			await waitForOpen(session, reloadedUrl);
			await capture(session, 'cold resume');

			assert.deepStrictEqual(observations, [
				{ phase: 'first open', live: 1, history: 1 },
				{ phase: 'repeat open', live: 1, history: 1 },
				{ phase: 'provider reload', live: 1, history: 1 },
				{ phase: 'close and reopen', live: 2, history: 2 },
				{ phase: 'cold resume', live: 2, history: 2 },
			]);
		} finally {
			listeners.dispose();
			try {
				await session?.disconnect();
			} finally {
				try {
					await client.stop();
				} finally {
					await rm(root, { recursive: true, force: true });
				}
			}
		}
	});
});
