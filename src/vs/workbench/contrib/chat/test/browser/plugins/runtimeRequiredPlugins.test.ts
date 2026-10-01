/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { extUriBiasedIgnorePathCase } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { getAgentHostExtensionInitializeResultMeta } from '../../../../../../platform/agentHost/common/agentHostExtensionProtocol.js';
import type { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import type { IAgentHostEnsureRequiredPluginsRequest, IAgentHostEnsureRequiredPluginsResult } from '../../../../../../platform/agentHost/common/requiredPlugins.js';
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

	function createHarness(trusted = true) {
		const requests: IAgentHostEnsureRequiredPluginsRequest[] = [];
		let failure: Error | undefined;
		const initializeResult = observableValue('initializeResult', {
			protocolVersion: '1.0.0',
			serverSeq: 0,
			snapshots: [],
			_meta: getAgentHostExtensionInitializeResultMeta(),
		});
		const connection = new class extends mock<IAgentConnection>() {
			override readonly initializeResult = initializeResult;
			override async ensureRequiredPlugins(request: IAgentHostEnsureRequiredPluginsRequest): Promise<IAgentHostEnsureRequiredPluginsResult> {
				requests.push(request);
				if (failure) {
					throw failure;
				}
				return result;
			}
		}();
		const runtimeService = store.add(new RuntimeRepositoryPluginService(new class extends mock<IUriIdentityService>() {
			override readonly extUri = extUriBiasedIgnorePathCase;
		}()));
		const requiredPluginService = store.add(new RuntimeRequiredPluginService(
			new class extends mock<IAgentHostConnectionsService>() {
				override readonly ambientConnection = connection;
				override readonly onDidChangeConnections = Event.None;
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
			new TestConfigurationService({ [ChatConfiguration.PluginsEnabled]: true }),
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
			requiredPluginService,
			failWith: (error: Error | undefined) => failure = error,
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
			snapshots: harness.runtimeService.snapshots.get().map(snapshot => snapshot.workingDirectory.toString()),
		}, {
			requests: [{
				workingDirectory: workspace.toString(),
				managedSettings: undefined,
			}],
			snapshots: [workspace.toString()],
		});
	});

	test('does not send repository configuration from an untrusted workspace', async () => {
		const harness = createHarness(false);
		await timeout(150);

		assert.deepStrictEqual({
			requests: harness.requests,
			snapshots: harness.runtimeService.snapshots.get(),
		}, {
			requests: [],
			snapshots: [],
		});
	});

	test('clears stale workspace enablement when required plugin enforcement fails', async () => {
		const harness = createHarness();
		await timeout(150);
		harness.failWith(new Error('required plugin enforcement failed'));

		await assert.rejects(harness.requiredPluginService.ensure([workspace]), /required plugin enforcement failed/);

		assert.deepStrictEqual(harness.runtimeService.snapshots.get(), []);
	});

	test('rejects required plugins when the host capability is unavailable', async () => {
		const harness = createHarness();
		await timeout(150);
		harness.setCapability(false);

		await assert.rejects(
			harness.requiredPluginService.ensure([workspace]),
			/does not support required plugin enforcement/,
		);

		assert.deepStrictEqual(harness.runtimeService.snapshots.get(), []);
	});

	test('retains active session roots while pruning inactive snapshots', async () => {
		const harness = createHarness();
		const detached = URI.file('/workspace.worktrees/detached');
		const retention = store.add(harness.requiredPluginService.retainWorkingDirectories([detached]));
		await harness.requiredPluginService.ensure();
		const retained = harness.runtimeService.snapshots.get().map(snapshot => snapshot.workingDirectory.toString()).sort();

		retention.dispose();

		assert.deepStrictEqual({
			retained,
			afterRelease: harness.runtimeService.snapshots.get().map(snapshot => snapshot.workingDirectory.toString()),
		}, {
			retained: [workspace.toString(), detached.toString()].sort(),
			afterRelease: [workspace.toString()],
		});
	});
});
