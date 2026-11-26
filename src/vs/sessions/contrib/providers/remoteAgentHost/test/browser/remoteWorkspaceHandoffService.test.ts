/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { encodeHex, VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../../base/common/errors.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { ISettableObservable, observableValue } from '../../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { agentHostAuthority, fromAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { getEntryAddress, IRemoteAgentHostEntry, IRemoteAgentHostService, readSSHRemoteAgentHostEntries, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IRemoteAgentHostLocationPreferenceService } from '../../../../../../platform/agentHost/common/remoteAgentHostLocationPreference.js';
import { RemoteAgentHostLocationPreferenceService } from '../../../../../../platform/agentHost/browser/remoteAgentHostLocationPreferenceService.js';
import { ISSHAgentHostConnection, ISSHRemoteAgentHostService, ISSHResolvedConfig } from '../../../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { ICachedTunnel, ITunnelAgentHostService, ITunnelInfo, TunnelAuthenticationRequiredError, TunnelGatewayServerType } from '../../../../../../platform/agentHost/common/tunnelAgentHost.js';
import { IWSLCachedDistro, IWSLRemoteAgentHostService } from '../../../../../../platform/agentHost/common/wslRemoteAgentHost.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfirmation, IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IProgressService } from '../../../../../../platform/progress/common/progress.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IAgentHostSessionsProvider } from '../../../../../../workbench/contrib/sessions/common/agentHostSessionsProvider.js';
import { RemoteWorkspaceHandoffResult } from '../../../../../common/remoteWorkspaceHandoff.js';
import { ISessionsProvidersChangeEvent, ISessionsProvidersService } from '../../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { ISessionsProvider } from '../../../../../../workbench/contrib/sessions/common/sessionsProvider.js';
import { parseRemoteMachine, RemoteWorkspaceHandoffService } from '../../browser/remoteWorkspaceHandoffService.js';
import { resolveRemoteAgentHostEntryAuthority } from '../../../../../../workbench/contrib/sessions/browser/openInVSCodeUtils.js';

suite('RemoteWorkspaceHandoffService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const tunnel = (name: string, tunnelId = `${name}-id`): ITunnelInfo => ({ tunnelId, clusterId: 'usw2', name, tags: [], protocolVersion: 6, hostConnectionCount: 1 });

	function createHarness(options: {
		readonly entries?: readonly IRemoteAgentHostEntry[];
		readonly sshConnections?: readonly ISSHAgentHostConnection[];
		readonly enabled?: boolean;
		readonly distros?: readonly string[];
		readonly defaultDistro?: string;
		readonly cachedTunnels?: readonly ICachedTunnel[];
		readonly listTunnels?: (authProvider: 'github' | 'microsoft' | undefined) => Promise<ITunnelInfo[]>;
		readonly signIn?: (authProvider: 'github' | 'microsoft') => Promise<void>;
		readonly confirmSignIn?: boolean;
		/** Whether any account is signed in to tunnels; signed in with GitHub by default. */
		readonly signedIn?: boolean;
		/** Holds SSH config, WSL and tunnel lookups until it settles. */
		readonly lookupGate?: Promise<void>;
		readonly dismissedTunnels?: readonly string[];
		/** The agent host type each tunnel gateway selected, by tunnel address. */
		readonly selectedServerTypes?: Readonly<Record<string, TunnelGatewayServerType | 'unknown'>>;
	} = {}) {
		const instantiationService = disposables.add(new TestInstantiationService());
		const storage = disposables.add(new InMemoryStorageService());
		const providersChanged = disposables.add(new Emitter<ISessionsProvidersChangeEvent>());
		const providers: ISessionsProvider[] = [];
		const calls: string[] = [];
		const errors: string[] = [];
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: options.enabled ?? true }));
		instantiationService.stub(IRemoteAgentHostService, upcastPartial<IRemoteAgentHostService>({ configuredEntries: options.entries ?? [] }));
		instantiationService.stub(ISSHRemoteAgentHostService, upcastPartial<ISSHRemoteAgentHostService>({
			connections: options.sshConnections ?? [],
			resolveSSHConfig: async host => {
				await options.lookupGate;
				return upcastPartial<ISSHResolvedConfig>({ hostname: `${host}.example.com`, user: 'resolved-user', port: 2222 });
			},
		}));
		instantiationService.stub(IWSLRemoteAgentHostService, upcastPartial<IWSLRemoteAgentHostService>({
			listDistros: async () => {
				await options.lookupGate;
				return (options.distros ?? []).map(name => ({ name, isDefault: name === options.defaultDistro, isRunning: true, version: 2 as const }));
			},
			cacheDistro: (distro: IWSLCachedDistro) => { calls.push(`cacheDistro:${distro.distro}`); },
		}));
		instantiationService.stub(ITunnelAgentHostService, upcastPartial<ITunnelAgentHostService>({
			getCachedTunnels: () => [...(options.cachedTunnels ?? [])],
			isTunnelDismissed: tunnelId => !!options.dismissedTunnels?.includes(tunnelId),
			clearTunnelDismissal: tunnelId => { calls.push(`clearTunnelDismissal:${tunnelId}`); },
			getAuthProvider: async () => options.signedIn === false ? undefined : 'github',
			listTunnels: async discovery => {
				await options.lookupGate;
				return options.listTunnels ? options.listTunnels(discovery?.authProvider) : [];
			},
			cacheTunnel: (info, authProvider) => { calls.push(`cacheTunnel:${info.tunnelId}:${authProvider}`); },
			getSelectedServerType: address => options.selectedServerTypes?.[address],
			signIn: options.signIn && (async authProvider => {
				calls.push(`signIn:${authProvider}`);
				await options.signIn?.(authProvider);
			}),
		}));
		instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({
			getProviders: () => providers,
			onDidChangeProviders: providersChanged.event,
		}));
		const locationPreferences = disposables.add(new RemoteAgentHostLocationPreferenceService(storage));
		instantiationService.stub(IRemoteAgentHostLocationPreferenceService, locationPreferences);
		instantiationService.stub(IStorageService, storage);
		instantiationService.stub(IProgressService, upcastPartial<IProgressService>({ withProgress: (_options, task) => task(upcastPartial({ report: () => { } })) }));
		instantiationService.stub(INotificationService, upcastPartial<INotificationService>({ error: message => { errors.push(String(message)); } }));
		const dialogs: IConfirmation[] = [];
		instantiationService.stub(IDialogService, upcastPartial<IDialogService>({
			confirm: async confirmation => {
				calls.push('confirm');
				dialogs.push(confirmation);
				return { confirmed: options.confirmSignIn ?? true };
			},
		}));
		instantiationService.stub(ILogService, new NullLogService());
		const service = disposables.add(instantiationService.createInstance(RemoteWorkspaceHandoffService));
		return {
			service, storage, calls, errors, dialogs, locationPreferences,
			addProvider: (address: string, connect: (status: ISettableObservable<RemoteAgentHostConnectionStatus>) => Promise<void>, initialStatus: RemoteAgentHostConnectionStatus = RemoteAgentHostConnectionStatus.disconnected) => {
				const status = observableValue<RemoteAgentHostConnectionStatus>('status', initialStatus);
				const provider = upcastPartial<IAgentHostSessionsProvider>({
					id: `agenthost-${agentHostAuthority(address)}`,
					label: address,
					remoteAddress: address,
					connectionStatus: status,
					connect: () => {
						calls.push(`connect:${address}`);
						return connect(status);
					},
					showInEnvironmentPicker: () => { calls.push(`show:${address}`); },
				});
				providers.push(provider);
				providersChanged.fire({ added: [provider], removed: [] });
			},
		};
	}

	const describe = (result: RemoteWorkspaceHandoffResult) => result.folderUri
		? { authority: result.folderUri.authority, folder: fromAgentHostUri(result.folderUri).toString() }
		: { unavailableReason: result.unavailableReason };

	test('parses SSH, WSL and Tunnel remote authorities as their extensions do', () => {
		const encode = (value: object) => encodeHex(VSBuffer.fromString(JSON.stringify(value)));
		assert.deepStrictEqual([
			'ssh-remote+myhost',
			`ssh-remote+${encode({ hostName: 'MyHost' })}`,
			`ssh-remote+${encode({ hostName: 'host.example.com', user: 'me', port: 2222 })}`,
			'ssh-remote+me@host.example.com:2200',
			'ssh-remote+host.example.com:2200',
			'ssh-remote+me@fe80::1',
			'ssh-remote+[fe80::1]:2222',
			'wsl+Ubuntu-24.04',
			'wsl+default',
			'wsl+ubuntu@tunnel+surface',
			'wsl+ubuntu%40tunnel+surface',
			'tunnel+my-tunnel',
			'dev-container+2f736f75726365',
			'codespaces+name',
			'ssh-remote+',
		].map(parseRemoteMachine), [
			{ kind: 'ssh', sshConfigHost: 'myhost' },
			{ kind: 'ssh', sshConfigHost: 'MyHost' },
			{ kind: 'ssh', hostName: 'host.example.com', user: 'me', port: 2222 },
			{ kind: 'ssh', hostName: 'host.example.com', user: 'me', port: 2200 },
			{ kind: 'ssh', hostName: 'host.example.com', user: undefined, port: 2200 },
			{ kind: 'ssh', hostName: 'fe80::1', user: 'me', port: undefined },
			{ kind: 'ssh', hostName: 'fe80::1', user: undefined, port: 2222 },
			{ kind: 'wsl', distro: 'Ubuntu-24.04' },
			{ kind: 'wsl', distro: undefined },
			undefined,
			undefined,
			{ kind: 'tunnel', name: 'my-tunnel' },
			undefined,
			undefined,
			undefined,
		]);
	});

	test('maps the authorities of editor windows opened from the Agents Window back to their hosts', async () => {
		const entries: IRemoteAgentHostEntry[] = [
			{ name: 'myhost', connection: { type: RemoteAgentHostEntryType.SSH, address: 'ssh:myhost', sshConfigHost: 'myhost', hostName: 'myhost.example.com' } },
			{ name: 'MyAlias', connection: { type: RemoteAgentHostEntryType.SSH, address: 'ssh:MyAlias', sshConfigHost: 'MyAlias', hostName: 'alias.example.com' } },
			{ name: 'me@host', connection: { type: RemoteAgentHostEntryType.SSH, address: 'me@host.example.com:2200', hostName: 'host.example.com', user: 'me', port: 2200 } },
			{ name: 'Ubuntu', connection: { type: RemoteAgentHostEntryType.WSL, address: 'wsl:Ubuntu', distro: 'Ubuntu' } },
			{ name: 'my-tunnel', connection: { type: RemoteAgentHostEntryType.Tunnel, tunnelId: 'tunnel-id', clusterId: 'usw2', label: 'my-tunnel' } },
		];
		const harness = createHarness({ entries });
		const results = [];
		for (const entry of entries) {
			results.push(describe(await harness.service.resolveFolder({ remoteAuthority: resolveRemoteAgentHostEntryAuthority(entry)!, path: '/project' }, CancellationToken.None)));
		}
		assert.deepStrictEqual({ results, calls: harness.calls, stored: readSSHRemoteAgentHostEntries(harness.storage) }, {
			results: entries.map(entry => ({ authority: agentHostAuthority(getEntryAddress(entry)), folder: 'file:///project' })),
			calls: [],
			stored: [],
		});
	});

	test('resolves folders of hosts the Agents Window already knows', async () => {
		const ssh: IRemoteAgentHostEntry = { name: 'myhost', connection: { type: RemoteAgentHostEntryType.SSH, address: 'ssh:myhost', sshConfigHost: 'myhost', hostName: 'myhost.example.com' } };
		const wsl: IRemoteAgentHostEntry = { name: 'Ubuntu', connection: { type: RemoteAgentHostEntryType.WSL, address: 'wsl:Ubuntu', distro: 'Ubuntu' } };
		const tunnelEntry: IRemoteAgentHostEntry = { name: 'my-tunnel', connection: { type: RemoteAgentHostEntryType.Tunnel, tunnelId: 'tunnel-id', clusterId: 'usw2', label: 'my-tunnel' } };
		const harness = createHarness({ entries: [ssh, wsl, tunnelEntry], dismissedTunnels: ['tunnel-id'] });
		const results = await Promise.all([
			harness.service.resolveFolder({ remoteAuthority: 'ssh-remote+myhost', path: '/home/me/project' }, CancellationToken.None),
			harness.service.resolveFolder({ remoteAuthority: 'wsl+ubuntu', path: '/home/me/project' }, CancellationToken.None),
			harness.service.resolveFolder({ remoteAuthority: 'tunnel+my-tunnel', path: '/c:/remote/project' }, CancellationToken.None),
		]);
		assert.deepStrictEqual({ results: results.map(describe), calls: harness.calls, stored: readSSHRemoteAgentHostEntries(harness.storage) }, {
			results: [
				{ authority: agentHostAuthority('ssh:myhost'), folder: 'file:///home/me/project' },
				{ authority: agentHostAuthority('wsl:Ubuntu'), folder: 'file:///home/me/project' },
				{ authority: agentHostAuthority(getEntryAddress(tunnelEntry)), folder: 'file:///c%3A/remote/project' },
			],
			calls: ['clearTunnelDismissal:tunnel-id'],
			stored: [],
		});
	});

	test('adds hosts the Agents Window does not know yet', async () => {
		const harness = createHarness({
			distros: ['Ubuntu-24.04', 'Debian'],
			defaultDistro: 'Debian',
			cachedTunnels: [{ tunnelId: 'cached-id', clusterId: 'usw2', name: 'cached-tunnel', authProvider: 'microsoft' }],
			// The tunnel of the other account is found after the most recently used account.
			listTunnels: async authProvider => authProvider === 'microsoft' ? [tunnel('other-account-tunnel', 'other-id')] : [tunnel('listed-tunnel')],
		});
		const encoded = encodeHex(VSBuffer.fromString(JSON.stringify({ hostName: 'host.example.com', user: 'me', port: 2200 })));
		const results = [];
		for (const remoteAuthority of [
			'ssh-remote+myhost', `ssh-remote+${encoded}`, 'ssh-remote+admin@plain.example.com:2201',
			'wsl+ubuntu-24.04', 'wsl+default',
			'tunnel+cached-tunnel', 'tunnel+listed-tunnel', 'tunnel+other-id.usw2',
		]) {
			results.push(describe(await harness.service.resolveFolder({ remoteAuthority, path: '/project' }, CancellationToken.None)));
		}
		assert.deepStrictEqual({ results, calls: harness.calls, stored: readSSHRemoteAgentHostEntries(harness.storage).map(entry => entry.connection) }, {
			results: [
				{ authority: agentHostAuthority('ssh:myhost'), folder: 'file:///project' },
				{ authority: agentHostAuthority('me@host.example.com:2200'), folder: 'file:///project' },
				{ authority: agentHostAuthority('admin@plain.example.com:2201'), folder: 'file:///project' },
				{ authority: agentHostAuthority('wsl:Ubuntu-24.04'), folder: 'file:///project' },
				{ authority: agentHostAuthority('wsl:Debian'), folder: 'file:///project' },
				{ authority: agentHostAuthority('tunnel:cached-id'), folder: 'file:///project' },
				{ authority: agentHostAuthority('tunnel:listed-tunnel-id'), folder: 'file:///project' },
				{ authority: agentHostAuthority('tunnel:other-id'), folder: 'file:///project' },
			],
			calls: [
				'cacheDistro:Ubuntu-24.04', 'cacheDistro:Debian', 'clearTunnelDismissal:cached-id',
				'clearTunnelDismissal:listed-tunnel-id', 'cacheTunnel:listed-tunnel-id:github',
				'clearTunnelDismissal:other-id', 'cacheTunnel:other-id:microsoft',
			],
			stored: [
				{ type: RemoteAgentHostEntryType.SSH, address: 'ssh:myhost', sshConfigHost: 'myhost', hostName: 'myhost.example.com', user: 'resolved-user', port: 2222 },
				{ type: RemoteAgentHostEntryType.SSH, address: 'me@host.example.com:2200', sshConfigHost: undefined, hostName: 'host.example.com', user: 'me', port: 2200 },
				{ type: RemoteAgentHostEntryType.SSH, address: 'admin@plain.example.com:2201', sshConfigHost: undefined, hostName: 'plain.example.com', user: 'admin', port: 2201 },
			],
		});
	});

	test('explains why a remote cannot provide its folder', async () => {
		const resolve = async (remoteAuthority: string, options?: Parameters<typeof createHarness>[0]) => describe(await createHarness(options).service.resolveFolder({ remoteAuthority, path: '/project' }, CancellationToken.None));
		const signedOut = async (): Promise<ITunnelInfo[]> => { throw new TunnelAuthenticationRequiredError('github'); };
		assert.deepStrictEqual([
			await resolve('codespaces+name'),
			await resolve('wsl+ubuntu@tunnel+surface'),
			await resolve('ssh-remote+myhost', { enabled: false }),
			await resolve('wsl+Missing', { distros: ['Ubuntu'] }),
			await resolve('wsl+default', { distros: ['Ubuntu'] }),
			await resolve('tunnel+missing', { listTunnels: async () => [tunnel('other')] }),
			await resolve('tunnel+signed-out', { listTunnels: signedOut }),
			// An account without tunnel configuration fails to list, which must not hide the sign-in.
			await resolve('tunnel+unconfigured', { listTunnels: async authProvider => authProvider === 'github' ? signedOut() : Promise.reject(new Error('No authentication is available to enumerate tunnels.')) }),
			await resolve('tunnel+sign-in-cancelled', { listTunnels: signedOut, signIn: async () => { throw new CancellationError(); } }),
			await resolve('tunnel+sign-in-declined', { listTunnels: signedOut, signIn: async () => { throw new Error('Declining must not sign in.'); }, confirmSignIn: false }),
		], [
			{ unavailableReason: 'The Agents Window cannot connect to this kind of remote.' },
			{ unavailableReason: 'The Agents Window cannot connect to this kind of remote.' },
			{ unavailableReason: 'Remote agent hosts are disabled.' },
			{ unavailableReason: 'WSL distribution \'Missing\' was not found. Remote agent hosts require WSL 2.' },
			{ unavailableReason: 'No default WSL distribution was found. Remote agent hosts require WSL 2.' },
			{ unavailableReason: 'Tunnel \'missing\' was not found for the signed-in accounts.' },
			{ unavailableReason: 'Sign in to find tunnel \'signed-out\'.' },
			{ unavailableReason: 'Sign in to find tunnel \'unconfigured\'.' },
			{ unavailableReason: 'Sign in to find tunnel \'sign-in-cancelled\'.' },
			{ unavailableReason: 'Sign in to find tunnel \'sign-in-declined\'.' },
		]);
	});

	test('explains and confirms signing in to find the tunnel of an account that is not signed in yet', async () => {
		let signedIn = false;
		const harness = createHarness({
			listTunnels: async authProvider => {
				if (authProvider === 'microsoft') {
					throw new Error('No authentication is available to enumerate tunnels.');
				}
				if (!signedIn) {
					throw new TunnelAuthenticationRequiredError('github');
				}
				return [tunnel('signed-out-tunnel')];
			},
			signIn: async () => { signedIn = true; },
		});
		const result = describe(await harness.service.resolveFolder({ remoteAuthority: 'tunnel+signed-out-tunnel', path: '/project' }, CancellationToken.None));
		assert.deepStrictEqual({ result, calls: harness.calls, dialogs: harness.dialogs }, {
			result: { authority: agentHostAuthority('tunnel:signed-out-tunnel-id'), folder: 'file:///project' },
			calls: ['confirm', 'signIn:github', 'clearTunnelDismissal:signed-out-tunnel-id', 'cacheTunnel:signed-out-tunnel-id:github'],
			dialogs: [{
				type: 'info',
				message: 'Sign in to open your folder from tunnel \'signed-out-tunnel\'?',
				detail: 'Your editor window is connected to tunnel \'signed-out-tunnel\'. To open the same folder here, the Agents Window needs to sign in with your GitHub account to find the tunnel and connect to its agent host.',
				primaryButton: '&&Sign In',
			}],
		});
	});

	test('matches SSH hosts by the user and port that SSH config supplies', async () => {
		// SSH config supplies user 'resolved-user' and port 2222 for every host.
		const root: IRemoteAgentHostEntry = { name: 'root@server', connection: { type: RemoteAgentHostEntryType.SSH, address: 'root@server:2222', hostName: 'server', user: 'root', port: 2222 } };
		const withoutPort: IRemoteAgentHostEntry = { name: 'resolved-user@server', connection: { type: RemoteAgentHostEntryType.SSH, address: 'resolved-user@server:22', hostName: 'server', user: 'resolved-user' } };
		const harness = createHarness({ entries: [root, withoutPort] });
		const results = [];
		for (const remoteAuthority of ['ssh-remote+server:2222', 'ssh-remote+resolved-user@server', 'ssh-remote+resolved-user@server:2200', 'ssh-remote+me@other']) {
			results.push(describe(await harness.service.resolveFolder({ remoteAuthority, path: '/project' }, CancellationToken.None)));
		}
		assert.deepStrictEqual({ results, stored: readSSHRemoteAgentHostEntries(harness.storage).map(entry => entry.connection) }, {
			results: [
				// Not root's connection: the authority omits the user, so SSH config's user connects.
				{ authority: agentHostAuthority('resolved-user@server:22'), folder: 'file:///project' },
				// The entry without a port connects on SSH config's port, unlike an explicit other port.
				{ authority: agentHostAuthority('resolved-user@server:22'), folder: 'file:///project' },
				{ authority: agentHostAuthority('resolved-user@server:2200'), folder: 'file:///project' },
				{ authority: agentHostAuthority('me@other:2222'), folder: 'file:///project' },
			],
			stored: [
				{ type: RemoteAgentHostEntryType.SSH, address: 'resolved-user@server:2200', sshConfigHost: undefined, hostName: 'server', user: 'resolved-user', port: 2200 },
				{ type: RemoteAgentHostEntryType.SSH, address: 'me@other:2222', sshConfigHost: undefined, hostName: 'other', user: 'me', port: 2222 },
			],
		});
	});

	test('stops a cancelled handoff before it stores or caches anything or asks to sign in', async () => {
		const gate = new DeferredPromise<void>();
		const harness = createHarness({
			distros: ['Ubuntu'],
			lookupGate: gate.p,
			listTunnels: async () => { throw new TunnelAuthenticationRequiredError('github'); },
			signIn: async () => { },
		});
		const cancellation = new CancellationTokenSource();
		const pending = ['ssh-remote+myhost', 'ssh-remote+me@host', 'wsl+ubuntu', 'tunnel+signed-out'].map(remoteAuthority =>
			harness.service.resolveFolder({ remoteAuthority, path: '/project' }, cancellation.token).then(describe, error => isCancellationError(error) ? 'cancelled' : String(error)));
		cancellation.cancel();
		await gate.complete();
		const results = await Promise.all(pending);
		await timeout(0);
		assert.deepStrictEqual({ results, calls: harness.calls, stored: readSSHRemoteAgentHostEntries(harness.storage) }, {
			results: ['cancelled', 'cancelled', 'cancelled', 'cancelled'],
			calls: [],
			stored: [],
		});
		cancellation.dispose();
	});

	test('offers to sign in before connecting a known tunnel whose account is signed out', async () => {
		// Connecting without a token would fail, or start a sign-in that does not explain why.
		const known: IRemoteAgentHostEntry = { name: 'my-tunnel', connection: { type: RemoteAgentHostEntryType.Tunnel, tunnelId: 'tunnel-id', clusterId: 'usw2', label: 'my-tunnel', authProvider: 'github' } };
		const resolve = async (confirmSignIn: boolean) => {
			let signedIn = false;
			const harness = createHarness({
				entries: [known],
				signedIn: false,
				confirmSignIn,
				listTunnels: async () => {
					if (!signedIn) {
						throw new TunnelAuthenticationRequiredError('github');
					}
					return [];
				},
				signIn: async () => { signedIn = true; },
			});
			const result = describe(await harness.service.resolveFolder({ remoteAuthority: 'tunnel+my-tunnel', path: '/project' }, CancellationToken.None));
			return { result, calls: harness.calls, dialogs: harness.dialogs.map(dialog => dialog.message) };
		};
		assert.deepStrictEqual([await resolve(true), await resolve(false)], [
			{ result: { authority: agentHostAuthority('tunnel:tunnel-id'), folder: 'file:///project' }, calls: ['confirm', 'signIn:github'], dialogs: ['Sign in to open your folder from tunnel \'my-tunnel\'?'] },
			{ result: { unavailableReason: 'Sign in to connect to tunnel \'my-tunnel\'.' }, calls: ['confirm'], dialogs: ['Sign in to open your folder from tunnel \'my-tunnel\'?'] },
		]);
	});

	test('reveals and connects the host once its provider registers, reporting failures', async () => {
		const ssh: IRemoteAgentHostEntry = { name: 'myhost', connection: { type: RemoteAgentHostEntryType.SSH, address: 'ssh:myhost', sshConfigHost: 'myhost', hostName: 'myhost.example.com' } };
		const wsl: IRemoteAgentHostEntry = { name: 'Ubuntu', connection: { type: RemoteAgentHostEntryType.WSL, address: 'wsl:Ubuntu', distro: 'Ubuntu' } };
		const connected: IRemoteAgentHostEntry = { name: 'Debian', connection: { type: RemoteAgentHostEntryType.WSL, address: 'wsl:Debian', distro: 'Debian' } };
		const harness = createHarness({ entries: [ssh, wsl, connected] });
		const hosts = [
			await harness.service.resolveHost('ssh-remote+myhost', CancellationToken.None),
			await harness.service.resolveHost('wsl+Ubuntu', CancellationToken.None),
			await harness.service.resolveHost('wsl+Debian', CancellationToken.None),
		];
		harness.addProvider('ssh:myhost', async status => status.set(RemoteAgentHostConnectionStatus.connected, undefined));
		harness.addProvider('wsl:Ubuntu', async () => { throw new Error('WSL is not running'); });
		harness.addProvider('wsl:Debian', () => assert.fail('A connected host must not reconnect'), RemoteAgentHostConnectionStatus.connected);
		assert.deepStrictEqual({
			hosts: await Promise.all(hosts.map(async host => ({ authority: host.connectionAuthority, connected: await host.connected }))),
			calls: harness.calls,
			errors: harness.errors,
		}, {
			hosts: [
				{ authority: agentHostAuthority('ssh:myhost'), connected: true },
				{ authority: agentHostAuthority('wsl:Ubuntu'), connected: false },
				{ authority: agentHostAuthority('wsl:Debian'), connected: true },
			],
			calls: ['show:ssh:myhost', 'connect:ssh:myhost', 'show:wsl:Ubuntu', 'connect:wsl:Ubuntu', 'show:wsl:Debian'],
			errors: ['Failed to connect to wsl:Ubuntu: WSL is not running'],
		});
	});

	test('shares remote editor hosts unless an editor-owned endpoint lacks a matching preference', async () => {
		const tunnelEntry = (label: string): IRemoteAgentHostEntry => ({ name: label, connection: { type: RemoteAgentHostEntryType.Tunnel, tunnelId: `${label}-id`, clusterId: 'usw2', label } });
		const sshEntry = (host: string): IRemoteAgentHostEntry => ({ name: host, connection: { type: RemoteAgentHostEntryType.SSH, address: `ssh:${host}`, sshConfigHost: host, hostName: `${host}.example.com` } });
		const [sshStandalone, sshEditor, sshLegacy] = ['standalone', 'editor', 'legacy'].map(sshEntry);
		const wsl: IRemoteAgentHostEntry = { name: 'Ubuntu', connection: { type: RemoteAgentHostEntryType.WSL, address: 'wsl:Ubuntu', distro: 'Ubuntu' } };
		const [standalone, editor, protocolV5, unselected] = ['standalone', 'editor', 'v5', 'unselected'].map(tunnelEntry);
		const entries = [sshStandalone, sshEditor, sshLegacy, wsl, standalone, editor, protocolV5, unselected];
		const sshConnections: ISSHAgentHostConnection[] = [];
		const harness = createHarness({
			entries,
			sshConnections,
			selectedServerTypes: { [getEntryAddress(standalone)]: 'standalone', [getEntryAddress(editor)]: 'editor', [getEntryAddress(protocolV5)]: 'unknown' },
		});
		const hosts = [];
		for (const remoteAuthority of ['ssh-remote+standalone', 'ssh-remote+editor', 'ssh-remote+legacy', 'wsl+Ubuntu', 'tunnel+standalone', 'tunnel+editor', 'tunnel+v5', 'tunnel+unselected']) {
			hosts.push(await harness.service.resolveHost(remoteAuthority, CancellationToken.None));
		}
		// SSH endpoint selection arrives during connect, after resolving the host.
		sshConnections.push(
			upcastPartial<ISSHAgentHostConnection>({ localAddress: getEntryAddress(sshEditor), serverType: 'editor' }),
			upcastPartial<ISSHAgentHostConnection>({ localAddress: getEntryAddress(sshStandalone), serverType: 'standalone' }),
			upcastPartial<ISSHAgentHostConnection>({ localAddress: getEntryAddress(sshLegacy) }),
		);
		for (const entry of entries) {
			harness.addProvider(getEntryAddress(entry), () => assert.fail('A connected host must not reconnect'), RemoteAgentHostConnectionStatus.connected);
		}
		assert.deepStrictEqual(await Promise.all(hosts.map(async host => ({ connected: await host.connected, shares: host.sharesEditorWindowAgentHost?.() }))), [
			{ connected: true, shares: true },
			{ connected: true, shares: false },
			{ connected: true, shares: true },
			{ connected: true, shares: true },
			{ connected: true, shares: true },
			{ connected: true, shares: false },
			{ connected: true, shares: true },
			{ connected: true, shares: true },
		]);
		harness.locationPreferences.setPreference(getEntryAddress(sshEditor), 'editor');
		harness.locationPreferences.setPreference(getEntryAddress(editor), 'editor');
		// Tunnel editor windows are named by label, so they cannot follow the stored preference.
		assert.deepStrictEqual([hosts[1].sharesEditorWindowAgentHost?.(), hosts[5].sharesEditorWindowAgentHost?.()], [true, false]);
	});
});
