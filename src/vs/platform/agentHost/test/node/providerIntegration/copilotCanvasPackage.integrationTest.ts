/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdir, realpath, rm } from 'fs/promises';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { CopilotClient, RuntimeConnection } from '@github/copilot-sdk';
import { URI } from '../../../../../base/common/uri.js';
import { dirname, join } from '../../../../../base/common/path.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../log/common/log.js';
import type { IAgentPluginManager } from '../../../common/agentPluginManager.js';
import { AgentHostCanvasPackagesService } from '../../../node/agentHostCanvasPackagesService.js';
import { AgentHostStorageService } from '../../../node/agentHostStorageService.js';
import { CopilotCanvases } from '../../../node/copilot/copilotCanvases.js';
import { createCopilotCliEnvironment } from '../../../node/copilot/copilotCliEnvironment.js';
import { NoModelRequests, waitFor } from './copilotCanvasTestUtils.js';

suite('Agent Host Provider Integration - Canvas Package Snapshot', function () {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	this.timeout(120_000);

	test('public pluginDirectories loads a copied extension and keeps mutable data outside its approved code', async () => {
		let root = join(process.cwd(), '.build', `canvas-package-sdk-${generateUuid()}`);
		let client: CopilotClient | undefined;
		try {
			for (const directory of ['home/.config', 'copilot-home', 'workspace']) {
				await mkdir(join(root, directory), { recursive: true });
			}
			root = await realpath(root);
			const workspace = URI.file(join(root, 'workspace'));
			const log = store.add(new NullLogService());
			const storage = store.add(new AgentHostStorageService(undefined, log));
			const packages = store.add(new AgentHostCanvasPackagesService(
				upcastPartial<IAgentPluginManager>({ basePath: URI.file(join(root, 'plugins')) }),
				storage,
				log,
			));
			const source = URI.file(fileURLToPath(new URL('./fixtures/localCanvas/', import.meta.url)));
			const pkg = await packages.prepare(source);
			await packages.approve(pkg.id, pkg.revision, workspace);
			const [plugin] = await packages.getApprovedPluginDirectories(workspace);
			assert.ok(plugin);
			const extensionId = `plugin:canvas-${pkg.id.slice(0, 48)}:main`;
			const modulePath = URI.joinPath(plugin, 'com.github.copilot', 'extensions', 'main', 'extension.mjs').fsPath;
			const launch = await packages.resolveLaunch(extensionId, modulePath, workspace);
			assert.ok(launch);
			const requests = new NoModelRequests();
			const environment = createCopilotCliEnvironment({
				PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DO_NOT_TRACK: '1',
				HOME: join(root, 'home'), USERPROFILE: join(root, 'home'),
				COPILOT_HOME: join(root, 'copilot-home'),
				XDG_CONFIG_HOME: join(root, 'home', '.config'),
				XDG_DATA_HOME: join(root, 'home', '.local', 'share'),
				XDG_CACHE_HOME: join(root, 'home', '.cache'),
				GH_CONFIG_DIR: join(root, 'home', '.config', 'gh'),
				COPILOT_DISABLE_KEYTAR: '1',
			});
			environment.VSCODE_CANVAS_DATA_DIR = launch.dataDirectory.fsPath;
			const require = createRequire(import.meta.url);
			const cliPath = join(dirname(require.resolve(`@github/copilot-${process.platform}-${process.arch}`)), 'index.js');
			client = new CopilotClient({
				connection: RuntimeConnection.forStdio({ path: cliPath }),
				baseDirectory: join(root, 'copilot-home'),
				workingDirectory: workspace.fsPath,
				env: environment,
				useLoggedInUser: false,
				enableRemoteSessions: false,
				requestHandler: requests,
				logLevel: 'error',
			});
			await client.start();
			const session = await client.createSession({
				sessionId: 'canvas-package-snapshot',
				model: 'canvas-package-no-model',
				provider: { type: 'openai', wireApi: 'responses', baseUrl: 'http://127.0.0.1:1' },
				workingDirectory: workspace.fsPath,
				configDirectory: join(root, 'copilot-home'),
				pluginDirectories: [plugin.fsPath],
				requestExtensions: true,
				requestCanvasRenderer: true,
				enableConfigDiscovery: false,
				enableFileHooks: false,
				enableSessionTelemetry: false,
				enableSessionStore: false,
				availableTools: [],
				memory: { enabled: false },
				skipEmbeddingRetrieval: true,
				embeddingCacheStorage: 'in-memory',
				mcpServers: {},
				disabledMcpServers: ['github-mcp-server'],
				mcpOAuthTokenStorage: 'in-memory',
				remoteSession: 'off',
				onPermissionRequest: () => ({ kind: 'denied-no-approval-rule-and-could-not-request-from-user' }),
			});
			const canvases = store.add(new CopilotCanvases(session));
			const initial = await waitFor(() => canvases.getState(), state => state.catalog.some(type => type.extensionId === extensionId));
			const opened = await canvases.open({ extensionId, canvasId: 'counter', instanceId: 'document', input: { documentId: 'snapshot' } });
			const action = await canvases.invokeAction({ instanceId: 'document', actionName: 'increment', input: { amount: 2 } });
			await canvases.reload();
			const reloaded = await waitFor(() => canvases.getState(), state => state.instances[0]?.availability === 'ready' && state.instances[0].url !== opened.url);
			const stillApproved = await packages.getApprovedPluginDirectories(workspace);
			assert.deepStrictEqual({
				catalog: initial.catalog.map(type => type.extensionId),
				action,
				reloaded: reloaded.instances[0].availability,
				snapshotUnchanged: stillApproved.map(uri => uri.toString()),
				modelRequests: requests.requests,
			}, {
				catalog: [extensionId],
				action: { result: { documentId: 'snapshot', value: 2, actions: 1, interactions: 0 } },
				reloaded: 'ready',
				snapshotUnchanged: [plugin.toString()],
				modelRequests: [],
			});
			await canvases.close('document');
			canvases.dispose();
			assert.deepStrictEqual(await client.stop(), []);
			client = undefined;
		} finally {
			if (client) {
				await client.stop();
			}
			await rm(root, { recursive: true, force: true });
		}
	});
});
