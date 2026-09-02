/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IProgressService, IProgressOptions, ProgressLocation } from '../../../../../../platform/progress/common/progress.js';
import { IRemoteAgentHostLocationPreferenceService, RemoteAgentHostLocationPreference } from '../../../../../../platform/agentHost/common/remoteAgentHostLocationPreference.js';
import { IAgentHostSessionsProvider } from '../../../../../common/agentHostSessionsProvider.js';
import {
	buildRemoteHostOptionItems,
	changeRemoteAgentHostLocationPreference,
	getStatusHover,
	getStatusLabel,
	hasUpgradeReconnectStarted,
	supportsRemoteAgentHostLocationPreference,
	usesSSHConfigFile,
} from '../../browser/remoteHostOptions.js';

suite('remoteHostOptions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('getStatusLabel covers every connection status variant', () => {
		assert.ok(getStatusLabel(RemoteAgentHostConnectionStatus.connected).length > 0);
		assert.ok(getStatusLabel(RemoteAgentHostConnectionStatus.connecting).length > 0);
		assert.ok(getStatusLabel(RemoteAgentHostConnectionStatus.reconnecting).length > 0);
		assert.ok(getStatusLabel(RemoteAgentHostConnectionStatus.disconnected).length > 0);

		const incompatibleLabel = getStatusLabel(
			RemoteAgentHostConnectionStatus.incompatible('any reason', ['0.1.0']),
		);
		assert.ok(incompatibleLabel.length > 0);
		// Sanity-check that the incompatible label is distinct from the other
		// statuses so the workspace picker can visually call it out.
		assert.notStrictEqual(incompatibleLabel, getStatusLabel(RemoteAgentHostConnectionStatus.disconnected));
	});
	test('getStatusHover surfaces the host-supplied message for incompatible status', () => {
		const status = RemoteAgentHostConnectionStatus.incompatible(
			'Client offered protocol versions [0.1.0], but this server only supports 0.2.0.',
			['0.1.0'],
			['0.2.0'],
		);

		const hover = getStatusHover(status, 'host.example:1234');
		assert.ok(hover.includes('0.1.0'), 'hover should mention the offered version');
		assert.ok(hover.includes('only supports 0.2.0'), 'hover should include the host-supplied message');
		assert.ok(hover.includes('host.example:1234'), 'hover should include the address when provided');
	});

	test('getStatusHover omits the address line when address is undefined', () => {
		const status = RemoteAgentHostConnectionStatus.incompatible('Some reason', ['0.1.0']);
		const hover = getStatusHover(status);
		assert.ok(hover.includes('Some reason'));
		assert.ok(!hover.includes('Address'), 'hover should not include an address line when none is given');
	});

	test('upgrade reconnect status ignores a passive disconnect', () => {
		assert.strictEqual(hasUpgradeReconnectStarted(RemoteAgentHostConnectionStatus.disconnected), false);
		assert.strictEqual(hasUpgradeReconnectStarted(RemoteAgentHostConnectionStatus.incompatible('reason', ['0.1.0'])), false);
		assert.strictEqual(hasUpgradeReconnectStarted(RemoteAgentHostConnectionStatus.connecting), true);
		assert.strictEqual(hasUpgradeReconnectStarted(RemoteAgentHostConnectionStatus.reconnecting), true);
		assert.strictEqual(hasUpgradeReconnectStarted(RemoteAgentHostConnectionStatus.connected), true);
	});

	suite('supportsRemoteAgentHostLocationPreference', () => {
		test('desktop: recognizes stable SSH and tunnel address keys', () => {
			assert.strictEqual(supportsRemoteAgentHostLocationPreference('ssh:my-host-alias', false), true);
			assert.strictEqual(supportsRemoteAgentHostLocationPreference('tunnel:some-tunnel-id', false), true);
		});

		test('desktop: rejects unsupported WebSocket/WSL/cloud-sandbox addresses', () => {
			assert.strictEqual(supportsRemoteAgentHostLocationPreference('localhost:4321', false), false);
			assert.strictEqual(supportsRemoteAgentHostLocationPreference('wsl:Ubuntu', false), false);
			assert.strictEqual(supportsRemoteAgentHostLocationPreference('cloudsandbox:abc123', false), false);
			assert.strictEqual(supportsRemoteAgentHostLocationPreference('', false), false);
		});

		test('web: never supported, even for an otherwise-recognized tunnel address', () => {
			// The preference service and shared modal are desktop-only
			// (registered in sessions.desktop.main.ts) and the web tunnel
			// service does not consult a preference at all, so web must
			// report false regardless of address shape.
			assert.strictEqual(supportsRemoteAgentHostLocationPreference('tunnel:some-tunnel-id', true), false);
			assert.strictEqual(supportsRemoteAgentHostLocationPreference('ssh:my-host-alias', true), false);
			assert.strictEqual(supportsRemoteAgentHostLocationPreference('localhost:4321', true), false);
		});
	});

	suite('buildRemoteHostOptionItems', () => {
		test('desktop: includes the location preference item for a supported SSH preference key', () => {
			const items = buildRemoteHostOptionItems({ address: 'localhost:4321', preferenceKey: 'ssh:my-host-alias', isConnected: true, isWebPlatform: false });
			assert.ok(items.some(item => item.id === 'locationPreference'));
		});

		test('desktop: includes the location preference item for a supported tunnel address (no separate preferenceKey)', () => {
			const items = buildRemoteHostOptionItems({ address: 'tunnel:some-tunnel-id', isConnected: true, isWebPlatform: false });
			assert.ok(items.some(item => item.id === 'locationPreference'));
		});

		test('desktop: omits the location preference item for an unsupported address', () => {
			const items = buildRemoteHostOptionItems({ address: 'localhost:4321', isConnected: true, isWebPlatform: false });
			assert.ok(!items.some(item => item.id === 'locationPreference'));
		});

		test('desktop: a real SSH host\'s forwarded remoteAddress alone (no preferenceKey) never matches - regression guard for the ssh: prefix bug', () => {
			// Before the fix, supportsRemoteAgentHostLocationPreference() was
			// called with the SSH provider's live remoteAddress (a forwarded
			// localhost:<port> endpoint), which never starts with 'ssh:', so
			// the item was silently omitted for every real SSH host.
			const items = buildRemoteHostOptionItems({ address: 'localhost:4321', isConnected: true, isWebPlatform: false });
			assert.ok(!items.some(item => item.id === 'locationPreference'), 'a forwarded SSH address alone must not be mistaken for a stable preference key');
		});

		test('web: omits the location preference item for a tunnel address', () => {
			const items = buildRemoteHostOptionItems({ address: 'tunnel:some-tunnel-id', isConnected: true, isWebPlatform: true });
			assert.ok(!items.some(item => item.id === 'locationPreference'));
			// The other actions are unaffected by platform.
			assert.ok(items.some(item => item.id === 'remove'));
			assert.ok(items.some(item => item.id === 'copy'));
			assert.ok(items.some(item => item.id === 'settings'));
		});

		test('still includes reconnect/upgrade items alongside the location preference item', () => {
			const items = buildRemoteHostOptionItems({ address: 'localhost:4321', preferenceKey: 'ssh:my-host-alias', isConnected: false, upgradeMethod: 'cli', isWebPlatform: false });
			assert.ok(items.some(item => item.id === 'upgrade'));
			assert.ok(items.some(item => item.id === 'reconnect'));
			assert.ok(items.some(item => item.id === 'locationPreference'));
			// Always-present items remain regardless of preference support.
			assert.ok(items.some(item => item.id === 'remove'));
			assert.ok(items.some(item => item.id === 'copy'));
			// An aliased SSH host is authored in ~/.ssh/config, not settings.
			assert.ok(items.some(item => item.id === 'sshConfig'));
		});

		test('offers the SSH config file for an aliased SSH host, and settings for every other host', () => {
			const idsFor = (options: Parameters<typeof buildRemoteHostOptionItems>[0]) =>
				buildRemoteHostOptionItems(options).map(item => item.id);

			assert.deepStrictEqual({
				aliasedSSH: idsFor({ address: 'localhost:4321', preferenceKey: 'ssh:my-host-alias', isConnected: true, isWebPlatform: false }).filter(id => id === 'sshConfig' || id === 'settings'),
				// Explicit-credential SSH keys as user@host:port, so there is no file to open.
				credentialSSH: idsFor({ address: 'me@host.example:22', isConnected: true, isWebPlatform: false }).filter(id => id === 'sshConfig' || id === 'settings'),
				webSocket: idsFor({ address: 'host1:8080', isConnected: true, isWebPlatform: false }).filter(id => id === 'sshConfig' || id === 'settings'),
				tunnel: idsFor({ address: 'tunnel:some-tunnel-id', isConnected: true, isWebPlatform: false }).filter(id => id === 'sshConfig' || id === 'settings'),
			}, {
				aliasedSSH: ['sshConfig'],
				credentialSSH: ['settings'],
				webSocket: ['settings'],
				tunnel: ['settings'],
			});
		});
	});

	suite('usesSSHConfigFile', () => {
		test('only an ssh: aliased key on desktop resolves to the SSH config file', () => {
			assert.deepStrictEqual({
				aliasedDesktop: usesSSHConfigFile('ssh:my-host-alias', false),
				aliasedWeb: usesSSHConfigFile('ssh:my-host-alias', true),
				credentialKey: usesSSHConfigFile('me@host.example:22', false),
				forwardedAddress: usesSSHConfigFile('localhost:4321', false),
				tunnel: usesSSHConfigFile('tunnel:some-tunnel-id', false),
				empty: usesSSHConfigFile('', false),
			}, {
				aliasedDesktop: true,
				aliasedWeb: false,
				credentialKey: false,
				forwardedAddress: false,
				tunnel: false,
				empty: false,
			});
		});
	});

	suite('changeRemoteAgentHostLocationPreference', () => {
		function createLocationPreferenceService(initial?: RemoteAgentHostLocationPreference) {
			let stored = initial;
			const setCalls: Array<{ hostKey: string; preference: RemoteAgentHostLocationPreference }> = [];
			const service: Partial<IRemoteAgentHostLocationPreferenceService> = {
				getPreference: (hostKey: string) => stored,
				setPreference: (hostKey: string, preference: RemoteAgentHostLocationPreference) => {
					stored = preference;
					setCalls.push({ hostKey, preference });
				},
			};
			return { service: service as IRemoteAgentHostLocationPreferenceService, setCalls, getStored: () => stored };
		}

		function createNotificationService() {
			const infoMessages: string[] = [];
			const warnMessages: string[] = [];
			const errorMessages: string[] = [];
			const service: Partial<INotificationService> = {
				info: (message: string) => { infoMessages.push(message); },
				warn: (message: string) => { warnMessages.push(message); },
				error: (message: string) => { errorMessages.push(message); },
			};
			return { service: service as INotificationService, infoMessages, warnMessages, errorMessages };
		}

		function createProgressService() {
			const calls: IProgressOptions[] = [];
			const service: Partial<IProgressService> = {
				withProgress: (<R>(options: IProgressOptions, task: (progress: { report: () => void }) => Promise<R>) => {
					calls.push(options);
					return task({ report: () => { } });
				}) as IProgressService['withProgress'],
			};
			return { service: service as IProgressService, calls };
		}

		function createRemoteAgentHostService() {
			const reconnectCalls: string[] = [];
			const service: Partial<IRemoteAgentHostService> = {
				reconnect: (address: string) => { reconnectCalls.push(address); },
			};
			return { service: service as IRemoteAgentHostService, reconnectCalls };
		}

		function acceptDialogService(result: RemoteAgentHostLocationPreference | undefined): IDialogService {
			return { prompt: async () => ({ result }) } as unknown as IDialogService;
		}

		test('persists the chosen preference under the stable ssh: key while reconnecting via the live SSH provider, then confirms', async () => {
			const { service: locationPreferenceService, setCalls } = createLocationPreferenceService();
			const { service: notificationService, infoMessages } = createNotificationService();
			const { service: progressService } = createProgressService();
			const { service: remoteAgentHostService } = createRemoteAgentHostService();
			const dialogService = acceptDialogService('dedicated');

			const order: string[] = [];
			// Realistic SSH provider: its remoteAddress is the forwarded local
			// endpoint (never the ssh: preference key), and it reconnects via
			// its own connect() callback - not remoteAgentHostService.reconnect.
			const provider: Partial<IAgentHostSessionsProvider> = {
				label: 'my-host-alias',
				remoteAddress: 'localhost:4321',
				connect: async () => { order.push('reconnect'); },
			};
			const trackedLocationPreferenceService: IRemoteAgentHostLocationPreferenceService = {
				...locationPreferenceService,
				setPreference: (hostKey, preference) => {
					order.push('persist');
					locationPreferenceService.setPreference(hostKey, preference);
				},
			};

			await changeRemoteAgentHostLocationPreference({
				preferenceKey: 'ssh:my-host-alias',
				hostLabel: 'my-host-alias',
				productName: 'Code - OSS',
				provider: provider as IAgentHostSessionsProvider,
				dialogService,
				locationPreferenceService: trackedLocationPreferenceService,
				notificationService,
				remoteAgentHostService,
				progressService,
			});

			assert.deepStrictEqual(setCalls, [{ hostKey: 'ssh:my-host-alias', preference: 'dedicated' }], 'must persist under the stable ssh: preference key, not the live forwarded address');
			assert.deepStrictEqual(order, ['persist', 'reconnect'], 'must persist before reconnecting');
			assert.strictEqual(infoMessages.length, 1);
			assert.ok(infoMessages[0].includes('my-host-alias'));
		});

		test('reuses reconnectRemoteHost: calls the provider connect callback when present', async () => {
			const { service: locationPreferenceService } = createLocationPreferenceService();
			const { service: notificationService } = createNotificationService();
			const { service: progressService } = createProgressService();
			const { service: remoteAgentHostService, reconnectCalls } = createRemoteAgentHostService();
			const dialogService = acceptDialogService('editor');

			let connectCalls = 0;
			const provider: Partial<IAgentHostSessionsProvider> = {
				label: 'my-host-alias',
				remoteAddress: 'localhost:4321',
				connect: async () => { connectCalls++; },
			};

			await changeRemoteAgentHostLocationPreference({
				preferenceKey: 'ssh:my-host-alias',
				hostLabel: 'my-host-alias',
				productName: 'Code - OSS',
				provider: provider as IAgentHostSessionsProvider,
				dialogService,
				locationPreferenceService,
				notificationService,
				remoteAgentHostService,
				progressService,
			});

			assert.strictEqual(connectCalls, 1, 'provider.connect() must be used when present (SSH/tunnel-specific callback)');
			assert.strictEqual(reconnectCalls.length, 0, 'must not fall back to remoteAgentHostService.reconnect when provider.connect exists');
		});


		test('reuses reconnectRemoteHost: falls back to remoteAgentHostService.reconnect(address) when the provider has no connect callback', async () => {
			const { service: locationPreferenceService } = createLocationPreferenceService();
			const { service: notificationService } = createNotificationService();
			const { service: progressService } = createProgressService();
			const { service: remoteAgentHostService, reconnectCalls } = createRemoteAgentHostService();
			const dialogService = acceptDialogService('dedicated');

			const provider: Partial<IAgentHostSessionsProvider> = {
				label: 'My Tunnel',
				remoteAddress: 'tunnel:abc123',
			};

			await changeRemoteAgentHostLocationPreference({
				preferenceKey: 'tunnel:abc123',
				hostLabel: 'My Tunnel',
				productName: 'Code - OSS',
				provider: provider as IAgentHostSessionsProvider,
				dialogService,
				locationPreferenceService,
				notificationService,
				remoteAgentHostService,
				progressService,
			});

			assert.deepStrictEqual(reconnectCalls, ['tunnel:abc123']);
		});

		test('reports progress at ProgressLocation.Notification with a reconnecting title while awaiting reconnect', async () => {
			const { service: locationPreferenceService } = createLocationPreferenceService();
			const { service: notificationService } = createNotificationService();
			const { service: progressService, calls } = createProgressService();
			const { service: remoteAgentHostService } = createRemoteAgentHostService();
			const dialogService = acceptDialogService('dedicated');

			const provider: Partial<IAgentHostSessionsProvider> = {
				label: 'my-host-alias',
				remoteAddress: 'localhost:4321',
				connect: async () => { },
			};

			await changeRemoteAgentHostLocationPreference({
				preferenceKey: 'ssh:my-host-alias',
				hostLabel: 'my-host-alias',
				productName: 'Code - OSS',
				provider: provider as IAgentHostSessionsProvider,
				dialogService,
				locationPreferenceService,
				notificationService,
				remoteAgentHostService,
				progressService,
			});

			assert.strictEqual(calls.length, 1);
			assert.strictEqual(calls[0].location, ProgressLocation.Notification);
			assert.ok(String(calls[0].title).includes('my-host-alias'));
			assert.ok(String(calls[0].title).toLowerCase().includes('reconnecting'));
		});

		test('reconnect failure keeps the persisted preference and shows an error notification (progress still invoked)', async () => {
			const { service: locationPreferenceService, getStored } = createLocationPreferenceService();
			const { service: notificationService, infoMessages, errorMessages } = createNotificationService();
			const { service: progressService, calls } = createProgressService();
			const { service: remoteAgentHostService } = createRemoteAgentHostService();
			const dialogService = acceptDialogService('dedicated');

			const provider: Partial<IAgentHostSessionsProvider> = {
				label: 'my-host-alias',
				remoteAddress: 'localhost:4321',
				connect: async () => { throw new Error('boom'); },
			};

			await changeRemoteAgentHostLocationPreference({
				preferenceKey: 'ssh:my-host-alias',
				hostLabel: 'my-host-alias',
				productName: 'Code - OSS',
				provider: provider as IAgentHostSessionsProvider,
				dialogService,
				locationPreferenceService,
				notificationService,
				remoteAgentHostService,
				progressService,
			});

			assert.strictEqual(getStored(), 'dedicated', 'the persisted preference must be kept even though reconnection failed');
			assert.strictEqual(calls.length, 1, 'progress must still be shown for a failing reconnect');
			assert.strictEqual(infoMessages.length, 0);
			assert.strictEqual(errorMessages.length, 1);
			assert.ok(errorMessages[0].includes('my-host-alias'));
			assert.ok(errorMessages[0].includes('boom'));
		});

		test('no-provider fallback: persists the preference, shows a warning, and never reconnects', async () => {
			const { service: locationPreferenceService, setCalls } = createLocationPreferenceService();
			const { service: notificationService, infoMessages, warnMessages } = createNotificationService();
			const { service: progressService, calls } = createProgressService();
			const { service: remoteAgentHostService, reconnectCalls } = createRemoteAgentHostService();
			const dialogService = acceptDialogService('dedicated');

			await changeRemoteAgentHostLocationPreference({
				preferenceKey: 'ssh:my-host-alias',
				hostLabel: 'my-host-alias',
				productName: 'Code - OSS',
				provider: undefined,
				dialogService,
				locationPreferenceService,
				notificationService,
				remoteAgentHostService,
				progressService,
			});

			assert.deepStrictEqual(setCalls, [{ hostKey: 'ssh:my-host-alias', preference: 'dedicated' }]);
			assert.strictEqual(warnMessages.length, 1);
			assert.ok(warnMessages[0].includes('my-host-alias'));
			assert.strictEqual(infoMessages.length, 0, 'must not show the immediate-reconnect success confirmation');
			assert.strictEqual(calls.length, 0, 'must not show reconnect progress');
			assert.strictEqual(reconnectCalls.length, 0, 'must not reconnect');
		});

		test('does nothing when the user cancels the modal: no persistence, no reconnect, no notification', async () => {
			const { service: locationPreferenceService, setCalls } = createLocationPreferenceService('editor');
			const { service: notificationService, infoMessages, warnMessages, errorMessages } = createNotificationService();
			const { service: progressService, calls } = createProgressService();
			const { service: remoteAgentHostService, reconnectCalls } = createRemoteAgentHostService();
			const dialogService = acceptDialogService(undefined);

			let connectCalls = 0;
			const provider: Partial<IAgentHostSessionsProvider> = {
				label: 'some-tunnel-id',
				remoteAddress: 'tunnel:some-tunnel-id',
				connect: async () => { connectCalls++; },
			};

			await changeRemoteAgentHostLocationPreference({
				preferenceKey: 'tunnel:some-tunnel-id',
				hostLabel: 'some-tunnel-id',
				productName: 'Code - OSS',
				provider: provider as IAgentHostSessionsProvider,
				dialogService,
				locationPreferenceService,
				notificationService,
				remoteAgentHostService,
				progressService,
			});

			assert.strictEqual(setCalls.length, 0);
			assert.strictEqual(connectCalls, 0);
			assert.strictEqual(reconnectCalls.length, 0);
			assert.strictEqual(calls.length, 0, 'must not show reconnect progress');
			assert.strictEqual(infoMessages.length, 0);
			assert.strictEqual(warnMessages.length, 0);
			assert.strictEqual(errorMessages.length, 0);
		});

		test('forwards the current stored preference to the prompt', async () => {
			const { service: locationPreferenceService } = createLocationPreferenceService('dedicated');
			const { service: notificationService } = createNotificationService();
			const { service: progressService } = createProgressService();
			const { service: remoteAgentHostService } = createRemoteAgentHostService();
			let seenCurrentPreference: RemoteAgentHostLocationPreference | undefined;
			const dialogService = {
				prompt: async () => {
					seenCurrentPreference = locationPreferenceService.getPreference('ssh:my-host-alias');
					return { result: undefined };
				},
			} as unknown as IDialogService;

			await changeRemoteAgentHostLocationPreference({
				preferenceKey: 'ssh:my-host-alias',
				hostLabel: 'my-host-alias',
				productName: 'Code - OSS',
				provider: undefined,
				dialogService,
				locationPreferenceService,
				notificationService,
				remoteAgentHostService,
				progressService,
			});

			assert.strictEqual(seenCurrentPreference, 'dedicated');
		});
	});
});
