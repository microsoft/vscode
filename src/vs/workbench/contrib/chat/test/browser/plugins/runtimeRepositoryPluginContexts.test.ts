/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { extUriBiasedIgnorePathCase } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { getAgentHostExtensionInitializeResultMeta } from '../../../../../../platform/agentHost/common/agentHostExtensionProtocol.js';
import type { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import type { IAgentHostRepositoryPluginContext, IAgentHostRepositoryPluginContextResult, IAgentHostRepositoryPluginContexts, IAgentHostRepositoryPluginContextsSnapshot } from '../../../../../../platform/agentHost/common/repositoryPluginContexts.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceTrustManagementService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { testWorkspace } from '../../../../../../platform/workspace/test/common/testWorkspace.js';
import { TestContextService } from '../../../../../test/common/workbenchTestServices.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IExtensionsWorkbenchService } from '../../../../extensions/common/extensions.js';
import { RuntimeRepositoryPluginContextService } from '../../../browser/runtimeRepositoryPluginContexts.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { RuntimeRepositoryPluginService } from '../../../common/plugins/runtimeRepositoryPluginService.js';

suite('RuntimeRepositoryPluginContexts', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const workspace = URI.file('/workspace');
	const result: IAgentHostRepositoryPluginContextResult = {
		repositoryEnabledPlugins: { 'demo@market': true },
		repositoryPlugins: [],
		installResults: [{ spec: 'demo@market', action: 'installed' }],
		updateResults: [],
		warnings: [],
	};

	function createHarness() {
		const requests: (readonly IAgentHostRepositoryPluginContext[])[] = [];
		const onDidChange = store.add(new Emitter<IAgentHostRepositoryPluginContextsSnapshot>());
		let failure: Error | undefined;
		let supported = true;
		let revision = 0;
		let snapshot: IAgentHostRepositoryPluginContextsSnapshot | undefined;
		const contexts: IAgentHostRepositoryPluginContexts = {
			onDidChange: onDidChange.event,
			getSnapshot: () => snapshot,
			set: async request => {
				requests.push(request);
				if (failure) {
					throw failure;
				}
				snapshot = {
					revision: ++revision,
					contexts: request.map(context => ({
						id: context.id,
						workingDirectory: context.workingDirectory,
						state: 'ready',
						result,
					})),
				};
				return snapshot;
			},
		};
		const initializeResult = observableValue('initializeResult', {
			protocolVersion: '1.0.0',
			serverSeq: 0,
			snapshots: [],
			_meta: getAgentHostExtensionInitializeResultMeta(),
		});
		const connection = new class extends mock<IAgentConnection>() {
			override readonly initializeResult = initializeResult;
			override get repositoryPluginContexts() { return supported ? contexts : undefined; }
		}();
		const runtimeService = store.add(new RuntimeRepositoryPluginService(new class extends mock<IUriIdentityService>() {
			override readonly extUri = extUriBiasedIgnorePathCase;
		}()));
		const contextService = store.add(new RuntimeRepositoryPluginContextService(
			new class extends mock<IAgentHostConnectionsService>() {
				override readonly ambientConnection = connection;
				override readonly onDidChangeConnections = Event.None;
			}(),
			new TestContextService(testWorkspace(workspace)),
			{
				isWorkspaceTrusted: () => true,
				onDidChangeTrust: Event.None,
			} as Partial<IWorkspaceTrustManagementService> as IWorkspaceTrustManagementService,
			new TestConfigurationService({ [ChatConfiguration.PluginsEnabled]: true }),
			new class extends mock<IExtensionsWorkbenchService>() {
				override getAutoUpdateValue() { return 'on' as const; }
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
			runtimeService,
			contextService,
			failWith: (error: Error | undefined) => failure = error,
			setCapability: (value: boolean) => {
				supported = value;
				initializeResult.set({
					protocolVersion: '1.0.0',
					serverSeq: 0,
					snapshots: [],
					_meta: value ? getAgentHostExtensionInitializeResultMeta() : {},
				}, undefined);
			},
			fireSnapshot: (value: IAgentHostRepositoryPluginContextsSnapshot) => {
				snapshot = value;
				onDidChange.fire(value);
			},
		};
	}

	test('publishes trusted workspace contexts with user update authorization', async () => {
		const harness = createHarness();
		await timeout(150);

		assert.deepStrictEqual({
			requests: harness.requests,
			snapshots: harness.runtimeService.snapshots.get().map(snapshot => snapshot.workingDirectory.toString()),
		}, {
			requests: [[{
				id: workspace.toString(),
				workingDirectory: workspace.toString(),
				trusted: true,
				automaticUpdatesAllowed: true,
				managedSettings: undefined,
			}]],
			snapshots: [workspace.toString()],
		});
	});

	test('applies automatic runtime snapshots without republishing contexts', async () => {
		const harness = createHarness();
		await timeout(150);
		const requestCount = harness.requests.length;

		harness.fireSnapshot({ revision: 2, contexts: [] });

		assert.deepStrictEqual({
			requestCount: harness.requests.length,
			snapshots: harness.runtimeService.snapshots.get(),
		}, {
			requestCount,
			snapshots: [],
		});
	});

	test('clears stale workspace enablement when publication fails', async () => {
		const harness = createHarness();
		await timeout(150);
		harness.failWith(new Error('publication failed'));

		await assert.rejects(harness.contextService.publish(), /publication failed/);

		assert.deepStrictEqual(harness.runtimeService.snapshots.get(), []);
	});

	test('clears stale workspace enablement when the host capability is unavailable', async () => {
		const harness = createHarness();
		await timeout(150);
		harness.setCapability(false);

		await harness.contextService.publish();

		assert.deepStrictEqual(harness.runtimeService.snapshots.get(), []);
	});

	test('retains active session roots in the replacement context set', async () => {
		const harness = createHarness();
		const detached = URI.file('/workspace.worktrees/detached');
		const retention = store.add(harness.contextService.retainWorkingDirectories([detached]));
		await harness.contextService.publish();
		const published = harness.requests.at(-1)?.map(context => context.id).sort();

		retention.dispose();
		await timeout(150);

		assert.deepStrictEqual({
			published,
			afterRelease: harness.requests.at(-1)?.map(context => context.id),
		}, {
			published: [workspace.toString(), detached.toString()].sort(),
			afterRelease: [workspace.toString()],
		});
	});
});
