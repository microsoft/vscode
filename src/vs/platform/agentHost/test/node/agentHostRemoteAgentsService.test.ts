/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { type IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentHostRemoteAgentsEnabledConfigKey, AgentHostRemoteAgentsTunnelDiscoveryEnabledConfigKey } from '../../common/agentHostSchema.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostManagedSettingsService } from '../../node/agentHostManagedSettingsService.js';
import { AgentHostRemoteAgentsService, type IAgentHostRemoteAgentsActivationContext } from '../../node/agentHostRemoteAgentsService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentHostStorageService } from '../../node/agentHostStorageService.js';

suite('AgentHostRemoteAgentsService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createService() {
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
		const managedSettingsService = disposables.add(new AgentHostManagedSettingsService());
		const storageService = disposables.add(new AgentHostStorageService(undefined, logService));
		const service = disposables.add(new AgentHostRemoteAgentsService(configurationService, managedSettingsService, storageService, logService));
		return { configurationService, managedSettingsService, service };
	}

	async function flushMicrotasks(): Promise<void> {
		await Promise.resolve();
		await Promise.resolve();
	}

	test('activates only with the master control and exposes tunnel discovery without restarting', async () => {
		const { configurationService, managedSettingsService, service } = createService();
		const contexts: IAgentHostRemoteAgentsActivationContext[] = [];
		let disposalCount = 0;
		disposables.add(service.registerContribution({
			activate: context => {
				contexts.push(context);
				return toDisposable(() => disposalCount++);
			},
		}));
		disposables.add(service.activate());

		configurationService.updateRootConfig({ [AgentHostRemoteAgentsTunnelDiscoveryEnabledConfigKey]: true });
		await flushMicrotasks();
		const beforeMaster = {
			enabled: service.enabled.get(),
			tunnelDiscoveryEnabled: service.tunnelDiscoveryEnabled.get(),
			activationCount: contexts.length,
		};

		configurationService.updateRootConfig({ [AgentHostRemoteAgentsEnabledConfigKey]: true });
		await flushMicrotasks();
		const beforePolicy = {
			enabled: service.enabled.get(),
			tunnelDiscoveryEnabled: service.tunnelDiscoveryEnabled.get(),
			activationCount: contexts.length,
		};

		managedSettingsService.setClientRemoteAgentHostsEnabled('client', true);
		await flushMicrotasks();
		const enabled = {
			enabled: service.enabled.get(),
			tunnelDiscoveryEnabled: service.tunnelDiscoveryEnabled.get(),
			activationCount: contexts.length,
			contextTunnelDiscoveryEnabled: contexts[0]?.tunnelDiscoveryEnabled.get(),
		};

		configurationService.updateRootConfig({ unrelated: true });
		configurationService.updateRootConfig({ [AgentHostRemoteAgentsTunnelDiscoveryEnabledConfigKey]: false });
		await flushMicrotasks();
		const discoveryDisabled = {
			activationCount: contexts.length,
			tunnelDiscoveryEnabled: contexts[0]?.tunnelDiscoveryEnabled.get(),
			disposalCount,
		};

		configurationService.updateRootConfig({ [AgentHostRemoteAgentsEnabledConfigKey]: false });
		await flushMicrotasks();

		assert.deepStrictEqual({
			beforeMaster,
			beforePolicy,
			enabled,
			discoveryDisabled,
			afterMasterDisabled: {
				enabled: service.enabled.get(),
				tunnelDiscoveryEnabled: service.tunnelDiscoveryEnabled.get(),
				disposalCount,
			},
		}, {
			beforeMaster: {
				enabled: false,
				tunnelDiscoveryEnabled: false,
				activationCount: 0,
			},
			beforePolicy: {
				enabled: false,
				tunnelDiscoveryEnabled: false,
				activationCount: 0,
			},
			enabled: {
				enabled: true,
				tunnelDiscoveryEnabled: true,
				activationCount: 1,
				contextTunnelDiscoveryEnabled: true,
			},
			discoveryDisabled: {
				activationCount: 1,
				tunnelDiscoveryEnabled: false,
				disposalCount: 0,
			},
			afterMasterDisabled: {
				enabled: false,
				tunnelDiscoveryEnabled: false,
				disposalCount: 1,
			},
		});
	});

	test('managed false wins and re-enable creates exactly one new activation', async () => {
		const { configurationService, managedSettingsService, service } = createService();
		let activationCount = 0;
		let disposalCount = 0;
		disposables.add(service.registerContribution({
			activate: () => {
				activationCount++;
				return toDisposable(() => disposalCount++);
			},
		}));
		disposables.add(service.activate());
		managedSettingsService.setClientRemoteAgentHostsEnabled('allowing-client', true);
		configurationService.updateRootConfig({ [AgentHostRemoteAgentsEnabledConfigKey]: true });
		await flushMicrotasks();

		managedSettingsService.setClientRemoteAgentHostsEnabled('restricting-client', false);
		await flushMicrotasks();
		const restricted = {
			enabled: service.enabled.get(),
			activationCount,
			disposalCount,
		};

		managedSettingsService.setClientRemoteAgentHostsEnabled('restricting-client', true);
		configurationService.updateRootConfig({ unrelated: false });
		await flushMicrotasks();

		assert.deepStrictEqual({
			restricted,
			reEnabled: {
				enabled: service.enabled.get(),
				activationCount,
				disposalCount,
			},
		}, {
			restricted: {
				enabled: false,
				activationCount: 1,
				disposalCount: 1,
			},
			reEnabled: {
				enabled: true,
				activationCount: 2,
				disposalCount: 1,
			},
		});
	});

	test('cancels disabled activation and disposes its late result', async () => {
		const { configurationService, managedSettingsService, service } = createService();
		const activations: Array<{
			readonly context: IAgentHostRemoteAgentsActivationContext;
			readonly result: DeferredPromise<IDisposable>;
		}> = [];
		disposables.add(service.registerContribution({
			activate: context => {
				const result = new DeferredPromise<IDisposable>();
				activations.push({ context, result });
				return result.p;
			},
		}));
		const activation = disposables.add(service.activate());
		managedSettingsService.setClientRemoteAgentHostsEnabled('client', true);
		configurationService.updateRootConfig({ [AgentHostRemoteAgentsEnabledConfigKey]: true });
		await flushMicrotasks();

		configurationService.updateRootConfig({ [AgentHostRemoteAgentsEnabledConfigKey]: false });
		configurationService.updateRootConfig({ [AgentHostRemoteAgentsEnabledConfigKey]: true });
		await flushMicrotasks();

		let staleDisposalCount = 0;
		let currentDisposalCount = 0;
		activations[0].result.complete(toDisposable(() => staleDisposalCount++));
		activations[1].result.complete(toDisposable(() => currentDisposalCount++));
		await flushMicrotasks();
		const beforeActivationDisposal = {
			activationCount: activations.length,
			firstCancelled: activations[0].context.cancellationToken.isCancellationRequested,
			secondCancelled: activations[1].context.cancellationToken.isCancellationRequested,
			staleDisposalCount,
			currentDisposalCount,
		};

		activation.dispose();

		assert.deepStrictEqual({
			beforeActivationDisposal,
			afterActivationDisposal: {
				secondCancelled: activations[1].context.cancellationToken.isCancellationRequested,
				staleDisposalCount,
				currentDisposalCount,
			},
		}, {
			beforeActivationDisposal: {
				activationCount: 2,
				firstCancelled: true,
				secondCancelled: false,
				staleDisposalCount: 1,
				currentDisposalCount: 0,
			},
			afterActivationDisposal: {
				secondCancelled: true,
				staleDisposalCount: 1,
				currentDisposalCount: 1,
			},
		});
	});

	test('rolls back connectors registered by a contribution that fails activation', async () => {
		const { configurationService, managedSettingsService, service } = createService();
		disposables.add(service.registerContribution({
			activate: context => {
				context.registerTargetConnector({
					connectorId: 'failing-contribution',
					targets: constObservable([{ internalKey: 'target', targetId: 'failing:target', label: 'Failing' }]),
					async createConnection() {
						throw new Error('Connection should be rolled back');
					},
				});
				throw new Error('Contribution activation failed');
			},
		}));
		disposables.add(service.activate());
		managedSettingsService.setClientRemoteAgentHostsEnabled('client', true);
		configurationService.updateRootConfig({ [AgentHostRemoteAgentsEnabledConfigKey]: true });
		await flushMicrotasks();
		await flushMicrotasks();

		assert.deepStrictEqual({
			targets: service.targets.get(),
			active: service.enabled.get(),
		}, {
			targets: [],
			active: true,
		});
	});
});
