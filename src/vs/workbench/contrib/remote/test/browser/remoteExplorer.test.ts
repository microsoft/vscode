/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IRemoteAgentEnvironment } from '../../../../../platform/remote/common/remoteAgentEnvironment.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITunnelService, RemoteTunnel, TunnelPrivacyId } from '../../../../../platform/tunnel/common/tunnel.js';
import { IDebugService } from '../../../debug/common/debug.js';
import { IExternalUriOpenerService } from '../../../externalUriOpener/common/externalUriOpenerService.js';
import { ITerminalService } from '../../../terminal/browser/terminal.js';
import { IWorkbenchConfigurationService } from '../../../../services/configuration/common/configuration.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { NotificationService } from '../../../../services/notification/common/notificationService.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { IRemoteExplorerService, PortsEnablement } from '../../../../services/remote/common/remoteExplorerService.js';
import { Attributes, CandidatePort, OnPortForward, PortsAttributes, Tunnel, TunnelModel } from '../../../../services/remote/common/tunnelModel.js';
import { AutomaticPortForwarding, isCandidateRemappedTunnelLocalEndpoint, OnAutoForwardedAction } from '../../browser/remoteExplorer.js';
import { TunnelPanel } from '../../browser/tunnelView.js';

suite('AutomaticPortForwarding', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const { name, otherPortsAttributes, initiallyPresent, expected } of [
		{ name: 'skips initial process candidates when other port actions are unset', otherPortsAttributes: {}, initiallyPresent: true, expected: [] },
		{ name: 'forwards initial process candidates with an explicit other port action', otherPortsAttributes: { onAutoForward: OnPortForward.Notify }, initiallyPresent: true, expected: [3000] },
		{ name: 'forwards later process candidates when other port actions are unset', otherPortsAttributes: {}, initiallyPresent: false, expected: [3000] },
	]) {
		test(name, async () => {
			const candidate: CandidatePort = { host: 'localhost', port: 3000, detail: 'node server.js' };
			let candidates = initiallyPresent ? [candidate] : [];
			const configurationService = new TestConfigurationService({
				'remote.autoForwardPorts': true,
				'remote.autoForwardPortsSource': 'process',
				'remote.autoForwardPortsFallback': 0,
				'remote.portsAttributes': {},
				'remote.otherPortsAttributes': otherPortsAttributes,
			});
			store.add(configurationService.onDidChangeConfigurationEmitter);
			const attributes = store.add(new PortsAttributes(configurationService));
			const listening = new DeferredPromise<void>();
			let updateCandidates: (() => Promise<void>) | undefined;
			const model = new class extends mock<TunnelModel>() {
				override get environmentTunnelsSet() { return true; }
				override readonly forwarded = new Map<string, Tunnel>();
				override readonly detected = new Map<string, Tunnel>();
				override get candidatesOrUndefined() { return candidates; }
				override get candidates() { return candidates; }
				override readonly onCandidatesChanged: TunnelModel['onCandidatesChanged'] = (listener, thisArgs, disposables) => {
					// Await the async event handler so each assertion observes completed candidate processing.
					updateCandidates = async () => { await listener.call(thisArgs, new Map()); };
					const subscription = toDisposable(() => { updateCandidates = undefined; });
					if (Array.isArray(disposables)) {
						disposables.push(subscription);
					} else {
						disposables?.add(subscription);
					}
					listening.complete();
					return subscription;
				};
				override async getAttributes(ports: { host: string; port: number }[]) {
					const result = new Map<number, Attributes>();
					for (const port of ports) {
						const value = attributes.getAttributes(port.port, port.host);
						if (value) {
							result.set(port.port, value);
						}
					}
					return result;
				}
			};
			const forwarded: number[] = [];
			const forwarding = store.add(new AutomaticPortForwarding(
				upcastPartial<ITerminalService>({ instances: [], onDidCreateInstance: Event.None, onDidDisposeInstance: Event.None }),
				new class extends mock<INotificationService>() { },
				new class extends mock<IOpenerService>() { },
				new class extends mock<IExternalUriOpenerService>() { },
				new class extends mock<IRemoteExplorerService>() {
					override readonly tunnelModel = model;
					override readonly portsFeaturesEnabled = PortsEnablement.AdditionalFeatures;
					override readonly onEnabledPortsFeatures = Event.None;
					override async forward(properties: Parameters<IRemoteExplorerService['forward']>[0]) {
						forwarded.push(properties.remote.port);
						return undefined;
					}
				},
				upcastPartial<IWorkbenchEnvironmentService>({ remoteAuthority: 'test' }),
				store.add(new MockContextKeyService()),
				upcastPartial<IWorkbenchConfigurationService>(Object.assign(configurationService, { whenRemoteConfigurationLoaded: async () => { } })),
				upcastPartial<IDebugService>({ onDidNewSession: Event.None, onDidEndSession: Event.None }),
				new class extends mock<IRemoteAgentService>() {
					override async getEnvironment() { return upcastPartial<IRemoteAgentEnvironment>({ os: OperatingSystem.Linux }); }
				},
				new class extends mock<ITunnelService>() { },
				new class extends mock<IHostService>() { },
				new NullLogService(),
				store.add(new InMemoryStorageService()),
				new class extends mock<IPreferencesService>() { },
			));
			await listening.p;
			// The existing forwarders do not dispose their notification handlers.
			/* eslint-disable local/code-no-bracket-notation-for-identifiers -- Dispose private handlers without adding a test-only production API. */
			store.add(forwarding['procForwarder']!['notifier']);
			store.add(forwarding['outputForwarder']!['notifier']);
			/* eslint-enable local/code-no-bracket-notation-for-identifiers */
			candidates = [candidate];
			assert.ok(updateCandidates);
			await updateCandidates();

			assert.deepStrictEqual(forwarded, expected);
		});
	}

	test('preserves navigation links after elevating a port without interpreting its label', async () => {
		const label = '[Open](command:unexpected)';
		const tunnel: RemoteTunnel = {
			tunnelRemoteHost: 'localhost',
			tunnelRemotePort: 80,
			tunnelLocalPort: 8080,
			localAddress: 'localhost:8080',
			privacy: TunnelPrivacyId.Private,
			dispose: async () => { },
		};
		const elevatedTunnel: RemoteTunnel = { ...tunnel, tunnelLocalPort: 80, localAddress: 'localhost:80' };
		const prompts: Parameters<INotificationService['prompt']>[] = [];
		const notificationService = store.add(new class extends NotificationService {
			override prompt(...args: Parameters<INotificationService['prompt']>) {
				prompts.push(args);
				return super.prompt(...args);
			}
		}(store.add(new InMemoryStorageService())));
		store.add(toDisposable(() => {
			for (const notification of [...notificationService.model.notifications]) {
				notification.close();
			}
		}));
		const forwarded: Parameters<IRemoteExplorerService['forward']>[0][] = [];
		const action = store.add(new OnAutoForwardedAction(
			notificationService,
			new class extends mock<IRemoteExplorerService>() {
				override readonly tunnelModel = new class extends mock<TunnelModel>() {
					override async getAttributes() {
						return new Map([[80, { label, onAutoForward: undefined, elevateIfNeeded: undefined, requireLocalPort: undefined, protocol: undefined }]]);
					}
				};
				override async close(): Promise<void> { }
				override async forward(properties: Parameters<IRemoteExplorerService['forward']>[0]) {
					forwarded.push(properties);
					return elevatedTunnel;
				}
			},
			new class extends mock<IOpenerService>() { },
			new class extends mock<IExternalUriOpenerService>() { },
			new class extends mock<ITunnelService>() {
				override readonly canElevate = true;
				override isPortPrivileged(port: number): boolean { return port < 1024; }
			},
			new class extends mock<IHostService>() {
				override async hadLastFocus(): Promise<boolean> { return true; }
			},
			new NullLogService(),
			store.add(new MockContextKeyService()),
		));

		await action.doAction([tunnel]);
		const initial = notificationService.model.notifications[0].message;
		const elevateChoice = prompts[0][2].find(choice => choice.label === 'Use Port 80 as Sudo...');
		assert.ok(elevateChoice);
		await elevateChoice.run();
		const elevated = notificationService.model.notifications[0].message;

		assert.deepStrictEqual({
			notificationCount: notificationService.model.notifications.length,
			initialLinks: initial.linkedText.nodes.filter(node => typeof node !== 'string'),
			elevatedText: elevated.linkedText.toString(),
			elevatedLinks: elevated.linkedText.nodes.filter(node => typeof node !== 'string'),
			forwarded: forwarded.map(properties => ({ remote: properties.remote, local: properties.local, elevateIfNeeded: properties.elevateIfNeeded })),
		}, {
			notificationCount: 1,
			initialLinks: [{ label: 'See all forwarded ports', href: `command:${TunnelPanel.ID}.focus` }],
			elevatedText: `Your application (${label}) running on port 80 is available.  See all forwarded ports`,
			elevatedLinks: [{ label: 'See all forwarded ports', href: `command:${TunnelPanel.ID}.focus` }],
			forwarded: [{ remote: { host: 'localhost', port: 80 }, local: 80, elevateIfNeeded: true }],
		});
	});

	test('identifies remapped local tunnel ports', () => {
		const tunnels = [
			{ remotePort: 3000, localPort: 3001 },
			{ remotePort: 4000, localPort: 4000 },
			{ remotePort: 5000, localPort: undefined },
		];
		const candidates = [
			{ host: 'localhost', port: 3001 },
			{ host: '127.0.0.1', port: 3001 },
			{ host: '0.0.0.0', port: 3001 },
			{ host: 'example.com', port: 3001 },
			{ host: 'localhost', port: 3000 },
			{ host: 'localhost', port: 4000 },
			{ host: 'localhost', port: 5000 },
			{ host: 'localhost', port: 6000 },
		];

		assert.deepStrictEqual(candidates.map(candidate => isCandidateRemappedTunnelLocalEndpoint(candidate, tunnels)), [
			true,
			true,
			true,
			false,
			false,
			false,
			false,
			false,
		]);
	});
});
