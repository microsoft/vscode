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
import { getAppNodeModulesUri } from '../../node/appNodeModules.js';
import { createCopilotCliEnvironment } from '../../node/copilot/copilotCliEnvironment.js';
import { resolveCopilotRuntimePaths } from '../../node/copilot/copilotRuntimePaths.js';
import { createIsolatedProviderEnvironment } from './providerTestEnvironment.js';

suite('Copilot SDK - canvas first-open events', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

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
