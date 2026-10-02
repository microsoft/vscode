/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { extUriBiasedIgnorePathCase } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { getAgentHostExtensionInitializeResultMeta } from '../../../../../../platform/agentHost/common/agentHostExtensionProtocol.js';
import { createAgentHostResourceUriMapper, identityAgentHostResourceUriMapper } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import type { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import type { IAgentHostEnsureRequiredPluginsRequest, IAgentHostEnsureRequiredPluginsResult } from '../../../../../../platform/agentHost/common/requiredPlugins.js';
import type { IConfigurationOverrides, IConfigurationValue } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceTrustManagementService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { testWorkspace } from '../../../../../../platform/workspace/test/common/testWorkspace.js';
import { TestContextService } from '../../../../../test/common/workbenchTestServices.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { RuntimeRequiredPluginService } from '../../../browser/runtimeRequiredPlugins.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { RuntimeRepositoryPluginService } from '../../../common/plugins/runtimeRepositoryPluginService.js';
import { IWorkspacePluginSettingsService } from '../../../common/plugins/workspacePluginSettingsService.js';

suite('RuntimeRequiredPlugins', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const workspace = URI.file('/workspace');
	const result: IAgentHostEnsureRequiredPluginsResult = {
		fingerprint: 'test',
		plugins: [],
		warnings: [],
	};

	function createHarness(trusted = true, managedRequired = false, pluginsEnabled = true, capabilitySupported = true) {
		const requests: IAgentHostEnsureRequiredPluginsRequest[] = [];
		const remoteRequests: IAgentHostEnsureRequiredPluginsRequest[] = [];
		let failure: Error | undefined;
		let ensureHandler: ((request: IAgentHostEnsureRequiredPluginsRequest) => Promise<IAgentHostEnsureRequiredPluginsResult>) | undefined;
		let remoteResult = result;
		const initializeResult = observableValue('initializeResult', {
			protocolVersion: '1.0.0',
			serverSeq: 0,
			snapshots: [],
			_meta: capabilitySupported ? getAgentHostExtensionInitializeResultMeta() : {},
		});
		const connection = new class extends mock<IAgentConnection>() {
			override readonly initializeResult = initializeResult;
			override readonly resourceUris = identityAgentHostResourceUriMapper;
			override async ensureRequiredPlugins(request: IAgentHostEnsureRequiredPluginsRequest): Promise<IAgentHostEnsureRequiredPluginsResult> {
				requests.push(request);
				if (failure) {
					throw failure;
				}
				return ensureHandler ? ensureHandler(request) : result;
			}
		}();
		const remoteInitializeResult = observableValue('remoteInitializeResult', {
			protocolVersion: '1.0.0',
			serverSeq: 0,
			snapshots: [],
			_meta: getAgentHostExtensionInitializeResultMeta(),
		});
		const remoteConnection = new class extends mock<IAgentConnection>() {
			override readonly initializeResult = remoteInitializeResult;
			override readonly resourceUris = createAgentHostResourceUriMapper('remote');
			override async ensureRequiredPlugins(request: IAgentHostEnsureRequiredPluginsRequest): Promise<IAgentHostEnsureRequiredPluginsResult> {
				remoteRequests.push(request);
				return remoteResult;
			}
		}();
		const runtimeService = store.add(new RuntimeRepositoryPluginService(new class extends mock<IUriIdentityService>() {
			override readonly extUri = extUriBiasedIgnorePathCase;
		}()));
		const requiredPluginService = store.add(new RuntimeRequiredPluginService(
			new class extends mock<IAgentHostConnectionsService>() {
				override readonly ambientConnection = connection;
				override readonly onDidChangeConnections = Event.None;
				override readonly connections = [
					{ authority: 'local', address: undefined, name: 'Local', isAmbient: true, connection },
					{ authority: 'remote', address: 'remote', name: 'Remote', isAmbient: false, connection: remoteConnection },
				];
				override getConnectionByAuthority(authority: string): IAgentConnection | undefined {
					return authority === 'local' ? connection : authority === 'remote' ? remoteConnection : undefined;
				}
			}(),
			new TestContextService(testWorkspace(workspace)),
			{
				isWorkspaceTrusted: () => trusted,
				onDidChangeTrust: Event.None,
			} as Partial<IWorkspaceTrustManagementService> as IWorkspaceTrustManagementService,
			{
				enabledPlugins: observableValue('enabledPlugins', new Map([['demo@market', true]])),
				extraMarketplaces: observableValue('extraMarketplaces', []),
			} as Partial<IWorkspacePluginSettingsService> as IWorkspacePluginSettingsService,
			new class extends TestConfigurationService {
				constructor() {
					super({ [ChatConfiguration.PluginsEnabled]: pluginsEnabled });
				}
				override inspect<T>(key: string, overrides?: IConfigurationOverrides): IConfigurationValue<T> {
					const inspected = super.inspect<T>(key, overrides);
					return key === ChatConfiguration.EnabledPlugins && managedRequired
						? { ...inspected, policyValue: { 'managed@market': true } as T }
						: inspected;
				}
			}(),
			runtimeService,
			new class extends mock<IChatEntitlementService>() {
				override readonly sentiment = { hidden: false };
				override readonly onDidChangeSentiment = Event.None;
			}(),
			new class extends mock<IUriIdentityService>() {
				override readonly extUri = extUriBiasedIgnorePathCase;
			}(),
			new NullLogService(),
		));
		return {
			requests,
			remoteRequests,
			remoteConnection,
			runtimeService,
			requiredPluginService,
			failWith: (error: Error | undefined) => failure = error,
			setEnsureHandler: (handler: typeof ensureHandler) => ensureHandler = handler,
			setRemoteResult: (value: IAgentHostEnsureRequiredPluginsResult) => remoteResult = value,
			setCapability: (supported: boolean) => initializeResult.set({
				protocolVersion: '1.0.0',
				serverSeq: 0,
				snapshots: [],
				_meta: supported ? getAgentHostExtensionInitializeResultMeta() : {},
			}, undefined),
		};
	}

	test('ensures plugins only after the workspace is trusted', async () => {
		const harness = createHarness();
		await timeout(150);
		assert.deepStrictEqual({
			requests: harness.requests,
			snapshots: harness.runtimeService.snapshots.get().map(snapshot => snapshot.workingDirectory?.toString() ?? 'managed'),
		}, {
			requests: [
				{ managedSettings: undefined },
				{ workingDirectory: workspace.toString(), repositoryTrusted: true, managedSettings: undefined },
			],
			snapshots: ['managed', workspace.toString()],
		});
	});

	test('routes remote scopes through their owning connection and mapper', async () => {
		const harness = createHarness();
		await timeout(150);
		harness.requests.length = 0;
		const remoteWorkspace = harness.remoteConnection.resourceUris.fromAgentHost(URI.file('/remote/workspace'));
		const remotePlugin = '/remote/plugins/demo';
		harness.setRemoteResult({
			fingerprint: 'remote',
			plugins: [{
				plugin: {
					name: 'demo',
					marketplace: 'market',
					enabled: false,
					installed_at: '2026-10-02T00:00:00Z',
					cache_path: remotePlugin,
				},
				enabled: true,
				managed: false,
			}],
			warnings: [],
		});

		await harness.requiredPluginService.ensure([remoteWorkspace], 'remote-remote-copilot');
		const snapshot = harness.runtimeService.snapshots.get().find(candidate => candidate.workingDirectory?.toString() === remoteWorkspace.toString());

		assert.deepStrictEqual({
			ambientRequests: harness.requests,
			remoteRequests: harness.remoteRequests,
			connectionAuthority: snapshot?.sourceContext.connectionAuthority,
			pluginUri: snapshot?.sourceContext.resourceUris.fromAgentHost(URI.file(remotePlugin)).toString(),
		}, {
			ambientRequests: [],
			remoteRequests: [
				{ managedSettings: undefined },
				{
					workingDirectory: URI.file('/remote/workspace').toString(),
					repositoryTrusted: true,
					managedSettings: undefined,
				},
			],
			connectionAuthority: 'remote',
			pluginUri: harness.remoteConnection.resourceUris.fromAgentHost(URI.file(remotePlugin)).toString(),
		});
	});

	test('does not restore a snapshot after capability invalidation', async () => {
		const harness = createHarness();
		await timeout(150);
		const deferred = new DeferredPromise<IAgentHostEnsureRequiredPluginsResult>();
		harness.setEnsureHandler(request => request.workingDirectory ? deferred.p : Promise.resolve(result));

		const pending = harness.requiredPluginService.ensure([workspace]);
		while (!harness.requests.some(request => request.workingDirectory)) {
			await timeout(0);
		}
		harness.setCapability(false);
		await harness.requiredPluginService.ensure([workspace]);
		deferred.complete(result);
		await pending;

		assert.deepStrictEqual(harness.runtimeService.snapshots.get(), []);
	});

	test('enforces managed requirements without sending an untrusted repository', async () => {
		const harness = createHarness(false, true);
		await timeout(150);

		assert.deepStrictEqual({
			requests: harness.requests,
			snapshots: harness.runtimeService.snapshots.get().map(snapshot => snapshot.workingDirectory?.toString() ?? 'managed'),
		}, {
			requests: [{ managedSettings: { enabledPlugins: { 'managed@market': true } } }],
			snapshots: ['managed'],
		});
	});

	test('enforces managed requirements when repository plugin integration is disabled', async () => {
		const harness = createHarness(true, true, false);
		await timeout(150);

		assert.deepStrictEqual({
			requests: harness.requests,
			snapshots: harness.runtimeService.snapshots.get().map(snapshot => snapshot.workingDirectory?.toString() ?? 'managed'),
		}, {
			requests: [{ managedSettings: { enabledPlugins: { 'managed@market': true } } }],
			snapshots: ['managed'],
		});
	});

	test('clears stale workspace enablement when required plugin enforcement fails', async () => {
		const harness = createHarness();
		await timeout(150);
		harness.failWith(new Error('required plugin enforcement failed'));

		await assert.rejects(harness.requiredPluginService.ensure([workspace]), /required plugin enforcement failed/);

		assert.deepStrictEqual(harness.runtimeService.snapshots.get(), []);
	});

	test('does not block repository auto-install when the host capability is unavailable', async () => {
		const harness = createHarness();
		await timeout(150);
		harness.setCapability(false);

		await harness.requiredPluginService.ensure([workspace]);

		assert.deepStrictEqual(harness.runtimeService.snapshots.get(), []);
	});

	test('rejects managed requirements when the host capability is unavailable', async () => {
		const harness = createHarness(true, true);
		await timeout(150);
		harness.setCapability(false);

		await assert.rejects(
			harness.requiredPluginService.ensure([workspace]),
			/does not support required plugin enforcement/,
		);
	});

	test('preserves pre-feature behavior when the host never advertised required plugins', async () => {
		const harness = createHarness(true, true, true, false);
		await timeout(150);

		assert.deepStrictEqual({
			requests: harness.requests,
			snapshots: harness.runtimeService.snapshots.get(),
		}, {
			requests: [],
			snapshots: [],
		});
	});

	test('retains active session roots while pruning inactive snapshots', async () => {
		const harness = createHarness();
		const detached = URI.file('/workspace.worktrees/detached');
		const retention = store.add(harness.requiredPluginService.retainWorkingDirectories([detached]));
		await harness.requiredPluginService.ensure();
		const retained = harness.runtimeService.snapshots.get().map(snapshot => snapshot.workingDirectory?.toString() ?? 'managed').sort();

		retention.dispose();

		assert.deepStrictEqual({
			retained,
			afterRelease: harness.runtimeService.snapshots.get().map(snapshot => snapshot.workingDirectory?.toString() ?? 'managed'),
		}, {
			retained: ['managed', workspace.toString(), detached.toString()].sort(),
			afterRelease: ['managed', workspace.toString()],
		});
	});
});
