/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import type { IAgentHostGitHubEnvironmentStatus } from '../../../../../../platform/agentHost/common/meta/agentHostGitHubEnvironmentMeta.js';
import { GitHubEnvironmentsEnabledSettingId, IMissionControlAvailabilityService, IMissionControlEnvironmentService } from '../../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { IRemoteAgentHostConnectionInfo, IRemoteAgentHostEntry, IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import type { InitializeResult } from '../../../../../../platform/agentHost/common/state/protocol/common/commands.js';
import { IConfigurationChangeEvent } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IDialogService, IPrompt } from '../../../../../../platform/dialogs/common/dialogs.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { AuthenticationSession, AuthenticationSessionsChangeEvent, IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { RemoteGitHubEnvironmentSharingService } from '../../../browser/remoteAgentHost/remoteGitHubEnvironmentSharingService.js';

function initializeResult(): InitializeResult {
	return { protocolVersion: '1.0.0', serverSeq: 0, snapshots: [] };
}

const sharesStorageKey = 'agentHost.remoteGitHubEnvironments.shared';
const pendingUnregistrationsStorageKey = 'agentHost.remoteGitHubEnvironments.pendingUnregister';

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
		let signedIn = true;
		let enabled = true;
		// Label of the button the user picks when asked, `undefined` to cancel.
		let promptAnswer: string | undefined;

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
			new class extends mock<IMissionControlEnvironmentService>() {
				override get enabled() { return enabled; }
				override async refresh() { calls.push('refresh environments'); }
			}(),
			new class extends mock<IMissionControlAvailabilityService>() { override readonly available = observableValue('available', true); }(),
			configuration,
			new class extends mock<IChatEntitlementService>() { override readonly onDidChangeSentiment = Event.None; }(),
			new class extends mock<IAuthenticationService>() {
				override readonly onDidChangeSessions = sessionsChanged.event;
				override async getSessions() { return signedIn ? [session] : []; }
			}(),
			new class extends mock<IDefaultAccountService>() {
				override readonly onDidChangeDefaultAccount = Event.None;
				override async getDefaultAccount() { return null; }
			}(),
			new class extends mock<IProductService>() { }(),
			storage,
			new NullLogService(),
			new class extends mock<IDialogService>() {
				override async prompt<T>(prompt: IPrompt<T>) {
					calls.push(`prompt: ${prompt.message}`);
					const button = prompt.buttons?.find(button => button.label.replace('&&', '') === promptAnswer);
					return { result: await button?.run({ checkboxChecked: false }) };
				}
			}(),
		));

		return {
			service, calls, storage,
			setPromptAnswer(answer: string | undefined) { promptAnswer = answer; },
			addRemote(address: string, capable = true) {
				let instance = 0;
				let unregisterFails = false;
				let held: { readonly started: DeferredPromise<void>; readonly released: DeferredPromise<void> } | undefined;
				const initialize = observableValue<InitializeResult | undefined>('initializeResult', initializeResult());
				const status = observableValue<IAgentHostGitHubEnvironmentStatus | undefined>('gitHubEnvironment', capable ? { instanceId: `${address}#0` } : undefined);
				// Mirrors the agent host, which reports its new status before it responds.
				const setStatus = (registration?: IAgentHostGitHubEnvironmentStatus['registration'], registeredByHost?: boolean) => status.set({
					instanceId: `${address}#${instance}`,
					...(registration ? { registration } : {}),
					...(registeredByHost ? { registeredByHost } : {}),
				}, undefined);
				const connection = new class extends mock<IAgentConnection>() {
					override readonly initializeResult = initialize;
					override readonly gitHubEnvironment = status;
					override async registerGitHubEnvironment(accountId: string, credential: string) {
						calls.push(`register ${address} ${accountId} ${credential}`);
						const current = held;
						held = undefined;
						if (current) {
							current.started.complete();
							await current.released.p;
						}
						const registration = { accountId, environmentId: `environment-${address}`, name: address };
						setStatus(registration);
						return { environmentId: registration.environmentId, name: registration.name };
					}
					override async unregisterGitHubEnvironment(accountId: string) {
						calls.push(`unregister ${address} ${accountId}${unregisterFails ? ' (failed)' : ''}`);
						if (unregisterFails) {
							throw new Error('Connection lost');
						}
						if (status.get()?.registration?.accountId === accountId) {
							setStatus();
						}
					}
				}();
				remotes.set(address, { configured: true, connected: true, connection });
				connectionsChanged.fire();
				entriesChanged.fire();
				return {
					reconnect: () => initialize.set(initializeResult(), undefined),
					restart: () => {
						instance++;
						setStatus();
						initialize.set(initializeResult(), undefined);
					},
					/** Simulates another client registering or unregistering the remote. */
					setRegistration: (accountId: string | undefined) => setStatus(accountId ? { accountId, environmentId: `environment-${address}-${accountId}`, name: address } : undefined),
					setRegisteredByHost: () => setStatus(undefined, true),
					setConnected: (connected: boolean) => { remotes.get(address)!.connected = connected; connectionsChanged.fire(); },
					setConfigured: (configured: boolean) => { remotes.get(address)!.configured = configured; entriesChanged.fire(); },
					/** Holds the next registration request until it is released. */
					holdRegistration: () => {
						held = { started: new DeferredPromise<void>(), released: new DeferredPromise<void>() };
						return held;
					},
					setUnregisterFails: (fails: boolean) => { unregisterFails = fails; },
				};
			},
			changeAccount(accountId: string) {
				session = { ...session, accessToken: `token-${accountId}`, account: { id: accountId, label: accountId } };
				sessionsChanged.fire({ providerId: 'github', label: 'GitHub', event: { added: [session], removed: undefined, changed: undefined } });
			},
			signOut() {
				signedIn = false;
				sessionsChanged.fire({ providerId: 'github', label: 'GitHub', event: { added: undefined, removed: [session], changed: undefined } });
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
			stored(key = sharesStorageKey): unknown {
				return JSON.parse(storage.get(key, StorageScope.APPLICATION, '{}'));
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

	test('asks whether to keep sharing a shared remote before disconnecting it', async () => {
		const context = fixture();
		store.add(context.service.registerKeepSharingHandler((address, environmentId) => context.calls.push(`keep ${address} ${environmentId}`)));
		context.addRemote('wsl:Ubuntu');
		const debian = context.addRemote('wsl:Debian');
		await context.flush();
		const notShared = await context.service.confirmDisconnect('wsl:Ubuntu', 'Ubuntu');
		await context.service.setShared('wsl:Ubuntu', true);
		debian.setRegistration('other');
		await context.flush();
		const otherAccount = await context.service.confirmDisconnect('wsl:Debian', 'Debian');
		const answers: { answer: string; disconnect: boolean; share: string | undefined }[] = [];
		for (const answer of [undefined, 'Keep Sharing', 'Stop Sharing']) {
			context.setPromptAnswer(answer);
			const disconnect = await context.service.confirmDisconnect('wsl:Ubuntu', 'Ubuntu');
			answers.push({ answer: answer ?? 'Cancel', disconnect, share: context.snapshot().shares['wsl:Ubuntu']?.state });
		}

		assert.deepStrictEqual({ notShared, otherAccount, answers, calls: context.calls }, {
			notShared: true,
			otherAccount: true,
			answers: [
				{ answer: 'Cancel', disconnect: false, share: 'enabled' },
				{ answer: 'Keep Sharing', disconnect: true, share: 'enabled' },
				{ answer: 'Stop Sharing', disconnect: true, share: undefined },
			],
			calls: [
				'register wsl:Ubuntu account token-1',
				'prompt: Keep sharing \'Ubuntu\' as a GitHub environment?',
				'prompt: Keep sharing \'Ubuntu\' as a GitHub environment?',
				'refresh environments',
				'keep wsl:Ubuntu environment-wsl:Ubuntu',
				'prompt: Keep sharing \'Ubuntu\' as a GitHub environment?',
				'unregister wsl:Ubuntu account',
			],
		});
	});

	test('shows a kept environment once its remote is disconnected and does not ask while sharing is disabled', async () => {
		const context = fixture();
		store.add(context.service.registerKeepSharingHandler((address, environmentId) => context.calls.push(`keep ${address} ${environmentId}`)));
		const ubuntu = context.addRemote('wsl:Ubuntu');
		await context.flush();
		await context.service.setShared('wsl:Ubuntu', true);
		context.setEnabled(false);
		await context.flush();
		const disabled = await context.service.confirmDisconnect('wsl:Ubuntu', 'Ubuntu');
		context.setEnabled(true);
		await context.flush();

		context.setPromptAnswer('Keep Sharing');
		const kept = await context.service.confirmDisconnect('wsl:Ubuntu', 'Ubuntu');
		// Disconnecting removes the remote's entry.
		ubuntu.setConnected(false);
		ubuntu.setConfigured(false);
		await context.flush();

		assert.deepStrictEqual({ disabled, kept, disconnected: context.snapshot(), calls: context.calls }, {
			disabled: true,
			kept: true,
			disconnected: { shareable: [], shares: { 'wsl:Ubuntu': { state: 'enabled', environmentId: 'environment-wsl:Ubuntu' } }, environmentIds: [] },
			calls: [
				'register wsl:Ubuntu account token-1',
				'unregister wsl:Ubuntu account',
				'register wsl:Ubuntu account token-1',
				'prompt: Keep sharing \'Ubuntu\' as a GitHub environment?',
				'refresh environments',
				'keep wsl:Ubuntu environment-wsl:Ubuntu',
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

	test('follows the registration the agent host reports', async () => {
		const context = fixture();
		const ubuntu = context.addRemote('wsl:Ubuntu');
		await context.flush();
		await context.service.setShared('wsl:Ubuntu', true);

		ubuntu.restart();
		await context.flush();
		const restarted = context.snapshot().shares;

		ubuntu.setRegistration(undefined);
		await context.flush();
		const unsharedElsewhere = { shares: context.snapshot().shares, stored: context.stored() };

		ubuntu.setRegistration('account');
		await context.flush();
		const sharedElsewhere = context.snapshot();
		await context.service.setShared('wsl:Ubuntu', false);
		const stopped = context.snapshot().shares;

		await context.service.setShared('wsl:Ubuntu', true);
		ubuntu.setRegistration('other');
		await context.flush();
		const otherAccount = { shares: context.snapshot().shares, stored: context.stored() };
		ubuntu.setRegisteredByHost();
		const byHost = context.snapshot().shares;

		assert.deepStrictEqual({ restarted, unsharedElsewhere, sharedElsewhere, stopped, otherAccount, byHost, calls: context.calls }, {
			restarted: { 'wsl:Ubuntu': { state: 'enabled', environmentId: 'environment-wsl:Ubuntu' } },
			unsharedElsewhere: { shares: {}, stored: {} },
			sharedElsewhere: { shareable: ['wsl:Ubuntu'], shares: { 'wsl:Ubuntu': { state: 'enabled', environmentId: 'environment-wsl:Ubuntu-account' } }, environmentIds: ['environment-wsl:Ubuntu-account'] },
			stopped: {},
			otherAccount: { shares: { 'wsl:Ubuntu': { state: 'unavailable', unavailableReason: 'account' } }, stored: {} },
			byHost: { 'wsl:Ubuntu': { state: 'unavailable', unavailableReason: 'host' } },
			calls: [
				'register wsl:Ubuntu account token-1',
				'register wsl:Ubuntu account token-1',
				'unregister wsl:Ubuntu account',
				'register wsl:Ubuntu account token-1',
			],
		});
	});

	test('adopts a share another window added before the registration is reported', async () => {
		const context = fixture();
		const ubuntu = context.addRemote('wsl:Ubuntu');
		const otherWindow = fixture();
		otherWindow.addRemote('wsl:Ubuntu');
		await context.flush();
		await otherWindow.flush();
		await otherWindow.service.setShared('wsl:Ubuntu', true);

		context.storage.store(sharesStorageKey, otherWindow.storage.get(sharesStorageKey, StorageScope.APPLICATION)!, StorageScope.APPLICATION, StorageTarget.MACHINE, true);
		await context.flush();
		ubuntu.setRegistration('account');
		await context.flush();

		assert.deepStrictEqual({ shares: context.snapshot().shares, stored: context.stored(), calls: context.calls }, {
			shares: { 'wsl:Ubuntu': { state: 'enabled', environmentId: 'environment-wsl:Ubuntu-account' } },
			stored: { 'wsl:Ubuntu': { accountId: 'account', environmentId: 'environment-wsl:Ubuntu-account', instanceId: 'wsl:Ubuntu#0' } },
			calls: [],
		});
	});

	test('withdraws a share another window added while this window is disabled', async () => {
		const context = fixture();
		const ubuntu = context.addRemote('wsl:Ubuntu');
		context.setEnabled(false);
		await context.flush();

		ubuntu.setRegistration('account');
		context.storage.store(sharesStorageKey, JSON.stringify({ 'wsl:Ubuntu': { accountId: 'account', environmentId: 'environment-wsl:Ubuntu-account', instanceId: 'wsl:Ubuntu#0' } }), StorageScope.APPLICATION, StorageTarget.MACHINE, true);
		await context.flush();

		assert.deepStrictEqual({ stored: context.stored(), calls: context.calls }, {
			stored: { 'wsl:Ubuntu': { accountId: 'account', environmentId: 'environment-wsl:Ubuntu-account' } },
			calls: ['unregister wsl:Ubuntu account'],
		});
	});

	test('registers again after a protocol reconnect and withdraws a registration the gate closed meanwhile', async () => {
		const context = fixture();
		const ubuntu = context.addRemote('wsl:Ubuntu');
		await context.flush();
		await context.service.setShared('wsl:Ubuntu', true);

		// A protocol reconnect keeps the handshake object.
		ubuntu.setConnected(false);
		ubuntu.setConnected(true);
		await context.flush();

		const held = ubuntu.holdRegistration();
		ubuntu.reconnect();
		await held.started.p;
		context.setEnabled(false);
		held.released.complete();
		// The completed registration schedules the withdrawal behind the first flush.
		await context.flush();
		await context.flush();

		assert.deepStrictEqual({ stored: context.stored(), calls: context.calls }, {
			stored: { 'wsl:Ubuntu': { accountId: 'account', environmentId: 'environment-wsl:Ubuntu' } },
			calls: [
				'register wsl:Ubuntu account token-1',
				'register wsl:Ubuntu account token-1',
				'register wsl:Ubuntu account token-1',
				'unregister wsl:Ubuntu account',
			],
		});
	});

	test('stops sharing after signing out and withdraws from disconnected remotes on their next connection', async () => {
		const context = fixture();
		context.addRemote('wsl:Ubuntu');
		const debian = context.addRemote('wsl:Debian');
		await context.flush();
		await context.service.setShared('wsl:Ubuntu', true);
		await context.service.setShared('wsl:Debian', true);
		debian.setConnected(false);

		context.signOut();
		await context.flush();
		const signedOut = { shares: context.snapshot().shares, stored: context.stored(), pending: context.stored(pendingUnregistrationsStorageKey) };

		debian.setConnected(true);
		await context.flush();

		assert.deepStrictEqual({ signedOut, pending: context.stored(pendingUnregistrationsStorageKey), calls: context.calls }, {
			signedOut: { shares: {}, stored: {}, pending: { 'wsl:Debian': 'account' } },
			pending: {},
			calls: [
				'register wsl:Ubuntu account token-1',
				'register wsl:Debian account token-1',
				'unregister wsl:Ubuntu account',
				'unregister wsl:Debian account',
			],
		});
	});

	test('retries stopping a share from another computer after the next connection', async () => {
		const context = fixture();
		const ubuntu = context.addRemote('wsl:Ubuntu');
		await context.flush();
		ubuntu.setRegistration('account');
		await context.flush();

		ubuntu.setUnregisterFails(true);
		await context.service.setShared('wsl:Ubuntu', false);
		const failed = context.stored(pendingUnregistrationsStorageKey);

		ubuntu.setUnregisterFails(false);
		ubuntu.setConnected(false);
		ubuntu.setConnected(true);
		await context.flush();

		assert.deepStrictEqual({ failed, shares: context.snapshot().shares, pending: context.stored(pendingUnregistrationsStorageKey), calls: context.calls }, {
			failed: { 'wsl:Ubuntu': 'account' },
			shares: {},
			pending: {},
			calls: ['unregister wsl:Ubuntu account (failed)', 'unregister wsl:Ubuntu account'],
		});
	});

	test('follows sharing changes other windows make during a registration', async () => {
		const context = fixture();
		const ubuntu = context.addRemote('wsl:Ubuntu');
		const debian = context.addRemote('wsl:Debian');
		await context.flush();
		await context.service.setShared('wsl:Ubuntu', true);

		const held = ubuntu.holdRegistration();
		ubuntu.reconnect();
		await held.started.p;
		// Another window stops sharing Ubuntu and defers withdrawing its Debian registration.
		context.storage.remove(sharesStorageKey, StorageScope.APPLICATION, true);
		debian.setRegistration('account');
		context.storage.store(pendingUnregistrationsStorageKey, JSON.stringify({ 'wsl:Debian': 'account' }), StorageScope.APPLICATION, StorageTarget.MACHINE, true);
		held.released.complete();
		await context.flush();
		await context.flush();

		assert.deepStrictEqual({ shares: context.snapshot().shares, stored: context.stored(), pending: context.stored(pendingUnregistrationsStorageKey), calls: context.calls }, {
			shares: {},
			stored: {},
			pending: {},
			calls: [
				'register wsl:Ubuntu account token-1',
				'register wsl:Ubuntu account token-1',
				'unregister wsl:Ubuntu account',
				'unregister wsl:Debian account',
			],
		});
	});
});
