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
import type { IAgentHostRepositoryPluginReconcileRequest, IAgentHostRepositoryPluginReconcileResult } from '../../../../../../platform/agentHost/common/repositoryPluginReconciliation.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceTrustManagementService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { testWorkspace } from '../../../../../../platform/workspace/test/common/testWorkspace.js';
import { TestContextService } from '../../../../../test/common/workbenchTestServices.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IExtensionsWorkbenchService } from '../../../../extensions/common/extensions.js';
import { RuntimeRepositoryPluginReconciliationService } from '../../../browser/runtimeRepositoryPluginReconciliation.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { RuntimeRepositoryPluginService } from '../../../common/plugins/runtimeRepositoryPluginService.js';
import { IWorkspacePluginSettingsService } from '../../../common/plugins/workspacePluginSettingsService.js';

suite('RuntimeRepositoryPluginReconciliation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const workspace = URI.file('/workspace');
	const result: IAgentHostRepositoryPluginReconcileResult = {
		repositoryEnabledPlugins: { 'demo@market': true },
		repositoryPlugins: [],
		installResults: [{ spec: 'demo@market', action: 'installed' }],
		updateResults: [],
		warnings: [],
	};

	function createHarness() {
		const requests: IAgentHostRepositoryPluginReconcileRequest[] = [];
		let failure: Error | undefined;
		const initializeResult = observableValue('initializeResult', {
			protocolVersion: '1.0.0',
			serverSeq: 0,
			snapshots: [],
			_meta: getAgentHostExtensionInitializeResultMeta(),
		});
		const connection = new class extends mock<IAgentConnection>() {
			override readonly initializeResult = initializeResult;
			override async reconcileRepositoryPlugins(request: IAgentHostRepositoryPluginReconcileRequest): Promise<IAgentHostRepositoryPluginReconcileResult> {
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
		const reconciliationService = store.add(new RuntimeRepositoryPluginReconciliationService(
			new class extends mock<IAgentHostConnectionsService>() {
				override readonly ambientConnection = connection;
				override readonly onDidChangeConnections = Event.None;
			}(),
			new TestContextService(testWorkspace(workspace)),
			{
				isWorkspaceTrusted: () => true,
				onDidChangeTrust: Event.None,
			} as Partial<IWorkspaceTrustManagementService> as IWorkspaceTrustManagementService,
			{
				enabledPlugins: observableValue('enabledPlugins', new Map([['demo@market', true]])),
				extraMarketplaces: observableValue('extraMarketplaces', []),
			} as Partial<IWorkspacePluginSettingsService> as IWorkspacePluginSettingsService,
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
			reconciliationService,
			failWith: (error: Error | undefined) => failure = error,
			setCapability: (supported: boolean) => initializeResult.set({
				protocolVersion: '1.0.0',
				serverSeq: 0,
				snapshots: [],
				_meta: supported ? getAgentHostExtensionInitializeResultMeta() : {},
			}, undefined),
		};
	}

	test('reconciles trusted workspace plugins through Agent Host with user update authorization', async () => {
		const harness = createHarness();
		await timeout(150);
		assert.deepStrictEqual({
			requests: harness.requests,
			snapshots: harness.runtimeService.snapshots.get().map(snapshot => snapshot.workingDirectory.toString()),
		}, {
			requests: [{
				workingDirectory: workspace.toString(),
				trusted: true,
				automaticUpdatesAllowed: true,
				managedSettings: undefined,
			}],
			snapshots: [workspace.toString()],
		});
	});

	test('clears stale workspace enablement when reconciliation fails', async () => {
		const harness = createHarness();
		await timeout(150);
		harness.failWith(new Error('reconciliation failed'));

		await assert.rejects(harness.reconciliationService.reconcile([workspace]), /reconciliation failed/);

		assert.deepStrictEqual(harness.runtimeService.snapshots.get(), []);
	});

	test('clears stale workspace enablement when the host capability is unavailable', async () => {
		const harness = createHarness();
		await timeout(150);
		harness.setCapability(false);

		await harness.reconciliationService.reconcile([workspace]);

		assert.deepStrictEqual(harness.runtimeService.snapshots.get(), []);
	});

	test('retains active session roots while pruning inactive snapshots', async () => {
		const harness = createHarness();
		const detached = URI.file('/workspace.worktrees/detached');
		const retention = store.add(harness.reconciliationService.retainWorkingDirectories([detached]));
		await harness.reconciliationService.reconcile();
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
