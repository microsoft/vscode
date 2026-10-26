/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DefaultConfiguration } from '../../../../../platform/configuration/common/configurations.js';
import { Extensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IRemoteAuthorityResolverService } from '../../../../../platform/remote/common/remoteAuthorityResolver.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITunnelService, ProvidedOnAutoForward, TunnelPrivacyId } from '../../../../../platform/tunnel/common/tunnel.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { Attributes, OnPortForward, PortsAttributes, TunnelModel } from '../../../../services/remote/common/tunnelModel.js';
import '../../common/remote.contribution.js';

suite('OtherPortsAttributes', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function createConfiguration(overrides: Record<string, object> = {}) {
		const defaults = await store.add(new DefaultConfiguration(new NullLogService())).initialize();
		const configuration = new TestConfigurationService({ ...defaults.contents, ...overrides });
		store.add(configuration.onDidChangeConfigurationEmitter);
		return configuration;
	}

	function createModel(configuration: TestConfigurationService) {
		const model = store.add(new TunnelModel(
			new class extends mock<ITunnelService>() {
				override readonly tunnels = Promise.resolve([]);
				override readonly onTunnelOpened = Event.None;
				override readonly onTunnelClosed = Event.None;
				override async openTunnel(_addressProvider: Parameters<ITunnelService['openTunnel']>[0], host: string, port: number) {
					return { tunnelRemoteHost: host, tunnelRemotePort: port, tunnelLocalPort: port, localAddress: `localhost:${port}`, privacy: TunnelPrivacyId.Private, dispose: async () => { } };
				}
			},
			store.add(new InMemoryStorageService()),
			configuration,
			new class extends mock<IWorkbenchEnvironmentService>() {
				override readonly remoteAuthority = undefined;
			},
			new class extends mock<IRemoteAuthorityResolverService>() { },
			new class extends mock<IWorkspaceContextService>() {
				override getWorkspace() { return { id: 'test', folders: [] }; }
			},
			new NullLogService(),
			new class extends mock<IDialogService>() { },
			new class extends mock<IExtensionService>() {
				override readonly extensions = [];
				override readonly onDidRegisterExtensions = Event.None;
				override async activateByEvent() { }
			},
			store.add(new MockContextKeyService()),
		));
		store.add(model.configPortsAttributes);
		return model;
	}

	test('keeps property suggestions out of the effective fallback default', async () => {
		const configuration = await createConfiguration();
		const schema = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties()['remote.otherPortsAttributes'];
		const attributes = store.add(new PortsAttributes(configuration));

		assert.deepStrictEqual({
			effectiveDefault: configuration.getValue('remote.otherPortsAttributes'),
			suggestions: Object.fromEntries(Object.entries(schema.properties!).filter(([, property]) => property.default !== undefined).map(([key, property]) => [key, property.default])),
			applied: attributes.getAttributes(3000, 'localhost'),
		}, {
			effectiveDefault: {},
			suggestions: { onAutoForward: 'notify', elevateIfNeeded: false, label: 'Application', requireLocalPort: false },
			applied: { onAutoForward: undefined, elevateIfNeeded: undefined, label: undefined, requireLocalPort: undefined, protocol: undefined },
		});
	});

	for (const { name, key, host, commandLine } of [
		{ name: 'exact port', key: '3000', host: 'localhost', commandLine: undefined },
		{ name: 'range', key: '3000-4000', host: 'localhost', commandLine: undefined },
		{ name: 'regex', key: 'server\\.js', host: 'localhost', commandLine: 'node server.js' },
		{ name: 'host and port', key: 'db:3000', host: 'db', commandLine: undefined },
	]) {
		test(`uses the fallback only without effective matching ${name} attributes`, async () => {
			const fallback = { label: 'Fallback', onAutoForward: OnPortForward.Notify };
			const actual = [];
			for (const rule of [{ label: 'Matched' }, {}]) {
				const configuration = await createConfiguration({ 'remote.portsAttributes': { [key]: rule }, 'remote.otherPortsAttributes': fallback });
				const attributes = store.add(new PortsAttributes(configuration));
				actual.push(attributes.getAttributes(3000, host, commandLine));
				actual.push(attributes.getAttributes(5000, 'localhost', 'node client.js'));
			}
			const other: Attributes = { ...fallback, elevateIfNeeded: undefined, requireLocalPort: undefined, protocol: undefined };
			assert.deepStrictEqual(actual, [
				{ label: 'Matched', onAutoForward: undefined, elevateIfNeeded: undefined, requireLocalPort: undefined, protocol: undefined },
				other, other, other,
			]);
		});
	}

	test('preserves the requested tunnel name unless a fallback label is configured', async () => {
		const names = [];
		for (const fallback of [undefined, { label: 'Fallback' }]) {
			const configuration = await createConfiguration(fallback ? { 'remote.otherPortsAttributes': fallback } : {});
			const model = createModel(configuration);
			await model.forward({ remote: { host: 'localhost', port: 3000 }, name: 'Requested' });
			names.push(model.forwarded.get('localhost:3000')?.name);
		}
		assert.deepStrictEqual(names, ['Requested', 'Fallback']);
	});

	test('preserves the provider action unless a fallback action is configured', async () => {
		const actions = [];
		for (const fallback of [undefined, { label: 'Fallback' }, { onAutoForward: OnPortForward.Notify }]) {
			const configuration = await createConfiguration(fallback ? { 'remote.otherPortsAttributes': fallback } : {});
			const model = createModel(configuration);
			model.addAttributesProvider({ providePortAttributes: async ports => ports.map(port => ({ port, autoForwardAction: ProvidedOnAutoForward.OpenBrowser })) });
			actions.push((await model.getAttributes([{ host: 'localhost', port: 3000 }]))?.get(3000)?.onAutoForward);
		}
		assert.deepStrictEqual(actions, [OnPortForward.OpenBrowser, OnPortForward.OpenBrowser, OnPortForward.Notify]);
	});
});
