/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { AgentHostGitHubEnvironmentCapabilityMetaKey } from '../../../../../../platform/agentHost/common/meta/agentHostGitHubEnvironmentMeta.js';
import { GitHubEnvironmentsEnabledSettingId, IMissionControlAvailabilityService, IMissionControlEnvironmentService } from '../../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { IRemoteAgentHostConnectionInfo, IRemoteAgentHostEntry, IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import type { InitializeResult } from '../../../../../../platform/agentHost/common/state/protocol/common/commands.js';
import { IConfigurationChangeEvent } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { AuthenticationSession, AuthenticationSessionsChangeEvent, IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { RemoteGitHubEnvironmentSharingService } from '../../../browser/remoteAgentHost/remoteGitHubEnvironmentSharingService.js';

function initializeResult(capable: boolean): InitializeResult {
	return { protocolVersion: '1.0.0', serverSeq: 0, snapshots: [], ...(capable ? { _meta: { [AgentHostGitHubEnvironmentCapabilityMetaKey]: true } } : {}) };
}

suite('RemoteGitHubEnvironmentSharingService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function fixture(storage = store.add(new InMemoryStorageService())) {
		const calls: string[] = [];
		const connectionsChanged = store.add(new Emitter<void>());
		const entriesChanged = store.add(new Emitter<void>());
		const sessionsChanged = store.add(new Emitter<{ providerId: string; label: string; event: AuthenticationSessionsChangeEvent }>());
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		const remotes = new Map<string, { configured: boolean; connected: boolean; connection: IAgentConnection }>();
		let session: AuthenticationSession = { id: 'session', accessToken: 'token-1', account: { id: 'account', label: 'Account' }, scopes: [] };
		let enabled = true;

		const remoteAgentHostService = new class extends mock<IRemoteAgentHostService>() {
			override readonly onDidChangeConnections = connectionsChanged.event;
			override readonly onDidChangeConfiguredEntries = entriesChanged.event;
			override get connections(): readonly IRemoteAgentHostConnectionInfo[] {
				return [...remotes].map(([address, remote]) => ({ address, name: address, status: remote.connected ? RemoteAgentHostConnectionStatus.connected : RemoteAgentHostConnectionStatus.disconnected }));
			}
			override getConnection(address: string) { return remotes.get(address)?.connection; }
			override getEntryByAddress(address: string): IRemoteAgentHostEntry | undefined {
				return remotes.get(address)?.configured ? { name: address, connection: { type: RemoteAgentHostEntryType.WSL, address, distro: address } } : undefined;
			}
		}();
		const service = store.add(new RemoteGitHubEnvironmentSharingService(
			remoteAgentHostService,
			new class extends mock<IMissionControlEnvironmentService>() { override get enabled() { return enabled; } }(),
			new class extends mock<IMissionControlAvailabilityService>() { override readonly available = observableValue('available', true); }(),
			configuration,
			new class extends mock<IChatEntitlementService>() { override readonly onDidChangeSentiment = Event.None; }(),
			new class extends mock<IAuthenticationService>() {
				override readonly onDidChangeSessions = sessionsChanged.event;
				override async getSessions() { return [session]; }
			}(),
			new class extends mock<IDefaultAccountService>() {
				override readonly onDidChangeDefaultAccount = Event.None;
				override async getDefaultAccount() { return null; }
			}(),
			new class extends mock<IProductService>() { }(),
			storage,
			new NullLogService(),
		));

		return {
			service, calls, storage,
			addRemote(address: string, capable = true) {
				const initialize = observableValue<InitializeResult | undefined>('initializeResult', initializeResult(capable));
				const connection = new class extends mock<IAgentConnection>() {
					override readonly initializeResult = initialize;
					override async registerGitHubEnvironment(accountId: string, credential: string) {
						calls.push(`register ${address} ${accountId} ${credential}`);
						return { environmentId: `environment-${address}`, name: address };
					}
					override async unregisterGitHubEnvironment(accountId: string) {
						calls.push(`unregister ${address} ${accountId}`);
					}
				}();
				remotes.set(address, { configured: true, connected: true, connection });
				connectionsChanged.fire();
				entriesChanged.fire();
				return {
					reconnect: () => initialize.set(initializeResult(capable), undefined),
					setConnected: (connected: boolean) => { remotes.get(address)!.connected = connected; connectionsChanged.fire(); },
					setConfigured: (configured: boolean) => { remotes.get(address)!.configured = configured; entriesChanged.fire(); },
				};
			},
			changeAccount(accountId: string) {
				session = { ...session, accessToken: `token-${accountId}`, account: { id: accountId, label: accountId } };
				sessionsChanged.fire({ providerId: 'github', label: 'GitHub', event: { added: [session], removed: undefined, changed: undefined } });
			},
			setEnabled(value: boolean) {
				enabled = value;
				configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
					override affectsConfiguration(section: string) { return section === GitHubEnvironmentsEnabledSettingId; }
				}());
			},
			async flush() {
				await timeout(0);
				// Queued behind any scheduled synchronization.
				await service.setShared('flush', false);
			},
			snapshot() {
				return {
					shareable: [...service.shareable.get()],
					shares: Object.fromEntries(service.shares.get()),
					environmentIds: [...service.environmentIds.get()],
				};
			},
		};
	}

	test('shares connected remotes that support it, registers again after reconnecting and gating, and stops after an account change', async () => {
		const context = fixture();
		const ubuntu = context.addRemote('wsl:Ubuntu');
		context.addRemote('wsl:Debian', false);
		await context.flush();
		const initial = context.snapshot();

		await context.service.setShared('wsl:Ubuntu', true);
		const shared = context.snapshot();
		const restored = fixture(context.storage).snapshot();

		ubuntu.reconnect();
		await context.flush();
		context.setEnabled(false);
		await context.flush();
		const gated = context.snapshot();
		context.setEnabled(true);
		await context.flush();

		context.changeAccount('other');
		await context.flush();

		assert.deepStrictEqual({ initial, shared, restored, gated, final: context.snapshot(), calls: context.calls }, {
			initial: { shareable: ['wsl:Ubuntu'], shares: {}, environmentIds: [] },
			shared: { shareable: ['wsl:Ubuntu'], shares: { 'wsl:Ubuntu': { state: 'enabled', environmentId: 'environment-wsl:Ubuntu' } }, environmentIds: ['environment-wsl:Ubuntu'] },
			restored: { shareable: [], shares: { 'wsl:Ubuntu': { state: 'enabled', environmentId: 'environment-wsl:Ubuntu' } }, environmentIds: [] },
			gated: { shareable: [], shares: { 'wsl:Ubuntu': { state: 'enabled', environmentId: 'environment-wsl:Ubuntu' } }, environmentIds: ['environment-wsl:Ubuntu'] },
			final: { shareable: ['wsl:Ubuntu'], shares: {}, environmentIds: [] },
			calls: [
				'register wsl:Ubuntu account token-1',
				'register wsl:Ubuntu account token-1',
				'unregister wsl:Ubuntu account',
				'register wsl:Ubuntu account token-1',
				'unregister wsl:Ubuntu account',
			],
		});
	});

	test('rejects sharing unavailable remotes and retries unsharing after the next connection', async () => {
		const context = fixture();
		const ubuntu = context.addRemote('wsl:Ubuntu');
		await context.flush();
		await context.service.setShared('wsl:Ubuntu', true);

		ubuntu.setConfigured(false);
		const removedElsewhere = context.snapshot().environmentIds;
		ubuntu.setConfigured(true);
		ubuntu.setConnected(false);
		const rejected = await context.service.setShared('wsl:Debian', true).then(() => 'shared', error => error.message);
		await context.service.setShared('wsl:Ubuntu', false);
		const unshared = context.snapshot();
		const callsWhileDisconnected = [...context.calls];

		ubuntu.setConnected(true);
		await context.flush();

		assert.deepStrictEqual({ removedElsewhere, rejected, unshared, callsWhileDisconnected, calls: context.calls }, {
			removedElsewhere: [],
			rejected: 'Connect to this remote to share it as a GitHub environment.',
			unshared: { shareable: [], shares: {}, environmentIds: [] },
			callsWhileDisconnected: ['register wsl:Ubuntu account token-1'],
			calls: ['register wsl:Ubuntu account token-1', 'unregister wsl:Ubuntu account'],
		});
	});
});
