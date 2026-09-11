/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NativeEnvironmentService } from '../../../environment/node/environmentService.js';
import { OPTIONS, parseArgs } from '../../../environment/node/argv.js';
import { DiskFileSystemProvider } from '../../../files/node/diskFileSystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import product from '../../../product/common/product.js';
import { IAgentHostCanvasPackagesService } from '../../common/agentHostCanvasPackages.js';
import { AgentHostLocalCanvasesConfigKey } from '../../common/agentHostSchema.js';
import { AgentHostLaunchKind } from '../../common/agentHostTelemetry.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { buildDefaultChatUri, MessageKind } from '../../common/state/sessionState.js';
import { createAgentHostRuntime, type IAgentHostRuntime } from '../../node/agentHostBootstrap.js';
import { IAgentHostProviderService } from '../../node/agentHostProviderService.js';
import { IAgentHostStorageService } from '../../node/agentHostStorageService.js';
import { NullByokLmBridgeRegistry } from '../../node/byokLmBridgeRegistry.js';
import { CopilotCanvasLaunchAuthority } from '../../node/copilot/copilotCanvasLaunchAuthority.js';
import { MockAgent } from './mockAgent.js';

class UnwatchedDiskFileSystemProvider extends DiskFileSystemProvider {
	override watch() { return Disposable.None; }
}

suite('AgentHostCanvasPackages production graph', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	for (const previewEnabled of [false, true]) {
		for (const invalid of [
			{ name: 'malformed optional package records', text: JSON.stringify({ 'canvasPackages.v1': [{ id: '../invalid', approval: { revision: 42 } }] }) },
			{ name: 'unreadable host storage', text: '{"canvasPackages.v1": [truncated' },
		]) {
			test(`${invalid.name} isolates canvas failures with preview ${previewEnabled ? 'on' : 'off'}`, async () => {
				const owned = disposables.add(new DisposableStore());
				const root = join(process.cwd(), '.build', `canvas-package-graph-${generateUuid()}`);
				const storagePath = join(root, 'User', 'globalStorage', 'agent-host-storage.json');
				await mkdir(join(root, 'User', 'globalStorage'), { recursive: true });
				await writeFile(storagePath, invalid.text);
				await writeFile(join(root, 'User', 'globalStorage', 'agent-host-config.json'), JSON.stringify({
					[AgentHostLocalCanvasesConfigKey]: previewEnabled,
				}));
				const productService = { _serviceBrand: undefined, ...product };
				const environmentService = new NativeEnvironmentService(parseArgs(['--user-data-dir', root, '--force-disable-user-env'], OPTIONS), productService);
				const logService = owned.add(new NullLogService());
				let runtime: IAgentHostRuntime | undefined;
				let sessionData: ISessionDataService | undefined;
				try {
					runtime = owned.add(await createAgentHostRuntime({
						environmentService, productService, logService, loggerService: undefined,
						disableTelemetry: true, transientProxyConfiguration: true,
						hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess, providerConfigurations: [],
						fileSystemProvider: new UnwatchedDiskFileSystemProvider(logService),
						byok: { kind: 'renderer', bridgeRegistry: new NullByokLmBridgeRegistry() },
					}));
					const { packages, storage, providers } = runtime.instantiationService.invokeFunction(accessor => ({
						packages: accessor.get(IAgentHostCanvasPackagesService),
						storage: accessor.get(IAgentHostStorageService),
						providers: accessor.get(IAgentHostProviderService),
					}));
					sessionData = runtime.instantiationService.invokeFunction(accessor => accessor.get(ISessionDataService));
					const authority = owned.add(runtime.instantiationService.createInstance(CopilotCanvasLaunchAuthority, () => true));
					const error = packages.unavailableError;
					assert.ok(error);
					assert.strictEqual(runtime.agentService.canvasPackages, packages);
					assert.strictEqual(runtime.agentService.canvasPackagesEnabled, previewEnabled);

					const workspace = URI.file(root);
					for (const operation of [
						() => packages.list(),
						() => packages.prepare(workspace),
						() => packages.approve('a'.repeat(64), 'b'.repeat(64), workspace),
						() => packages.approve('a'.repeat(64), 'b'.repeat(64)),
						() => packages.revoke('a'.repeat(64)),
						() => packages.remove('a'.repeat(64)),
						() => packages.getApprovedSnapshots(workspace),
						() => packages.getApprovedPluginDirectories(workspace),
						() => packages.resolveLaunch('extension', join(root, 'extension.mjs'), workspace),
					]) {
						await assert.rejects(async () => operation(), thrown => thrown === error);
					}
					assert.deepStrictEqual({
						supported: packages.supported,
						launchEnabled: authority.enabled,
						approved: packages.isApproved('a'.repeat(64), 'b'.repeat(64), workspace),
						preserved: await readFile(storagePath, 'utf8'),
					}, { supported: false, launchEnabled: false, approved: false, preserved: invalid.text });

					const prompts: string[] = [];
					for (const id of ['ordinary-first', 'ordinary-second']) {
						const provider = new MockAgent(id);
						providers.registerProvider(provider);
						const sent = new DeferredPromise<void>();
						owned.add(provider.onDidSendMessage(call => {
							prompts.push(call.prompt);
							void sent.complete();
						}));
						const session = await runtime.agentService.createSession({ provider: id });
						runtime.agentService.dispatchAction(buildDefaultChatUri(session.toString()), {
							type: ActionType.ChatTurnStarted, turnId: 'ordinary-turn', startedAt: '2026-09-10T00:00:00.000Z',
							message: { text: id, origin: { kind: MessageKind.User } },
						}, 'test-client', 1);
						await sent.p;
						await runtime.agentService.disposeSession(session);
					}
					assert.deepStrictEqual(prompts, ['ordinary-first', 'ordinary-second']);
					if (storage.loadError) {
						assert.strictEqual(await readFile(storagePath, 'utf8'), invalid.text);
					} else {
						await storage.whenIdle();
						assert.deepStrictEqual(storage.get('canvasPackages.v1'), [{ id: '../invalid', approval: { revision: 42 } }]);
					}
				} finally {
					await runtime?.agentService.shutdown();
					await sessionData?.whenIdle();
					owned.dispose();
					await rm(root, { recursive: true, force: true });
				}
			});
		}
	}
});
