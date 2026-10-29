/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { URITransformer } from '../../../../base/common/uriIpc.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IProductService } from '../../../product/common/productService.js';
import { IExtensionManagementService, ILocalExtension, UninstallExtensionInfo } from '../../common/extensionManagement.js';
import { ExtensionManagementChannel, ExtensionManagementChannelClient } from '../../common/extensionManagementIpc.js';

suite('Coordinated uninstall IPC', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function client(channel: IChannel): ExtensionManagementChannelClient {
		return disposables.add(new ExtensionManagementChannelClient(channel, upcastPartial<IProductService>({ quality: 'stable' }), upcastPartial({})));
	}

	function backend(overrides: Partial<IExtensionManagementService> = {}): IExtensionManagementService {
		return upcastPartial<IExtensionManagementService>({
			onInstallExtension: Event.None, onDidInstallExtensions: Event.None,
			onUninstallExtension: Event.None, onDidUninstallExtension: Event.None,
			onDidUpdateExtensionMetadata: Event.None,
			reserveLocalUninstall: async () => [], releaseLocalUninstall: async () => { },
			prepareLocalUninstall: async () => { }, commitLocalUninstall: async () => { },
			abortLocalUninstall: async () => { }, getCoordinatedUninstallIdentity: async () => 'store',
			getPendingLocalUninstalls: async () => [], acknowledgeLocalUninstall: async () => { },
			...overrides,
		});
	}

	function wire(service: IExtensionManagementService): IChannel {
		const transformer = new URITransformer({
			transformIncoming: uri => uri.scheme === 'remote' ? { ...uri, scheme: 'file', authority: '' } : uri,
			transformOutgoing: uri => uri.scheme === 'file' ? { ...uri, scheme: 'remote', authority: 'host' } : uri,
			transformOutgoingScheme: scheme => scheme === 'file' ? 'remote' : scheme,
		});
		const server = new ExtensionManagementChannel(service, () => transformer);
		// Serialize both directions so the test cannot accidentally pass with live URI instances.
		return {
			listen: () => Event.None,
			call: async (command, args) => {
				const result = await server.call('test', command, args === undefined ? undefined : JSON.parse(JSON.stringify(args)));
				return result === undefined ? undefined : JSON.parse(JSON.stringify(result));
			},
		};
	}

	test('capability requires every protocol method', async () => {
		assert.strictEqual(await client(wire(backend())).supportsCoordinatedUninstall(), true);
		for (const method of ['reserveLocalUninstall', 'releaseLocalUninstall', 'prepareLocalUninstall', 'commitLocalUninstall', 'abortLocalUninstall', 'getCoordinatedUninstallIdentity', 'getPendingLocalUninstalls', 'acknowledgeLocalUninstall'] as const) {
			assert.strictEqual(await client(wire(backend({ [method]: undefined }))).supportsCoordinatedUninstall(), false, method);
		}
	});

	test('an older channel caches unsupported capability without issuing protocol calls', async () => {
		const commands: string[] = [];
		const service = client({ listen: () => Event.None, call: async command => { commands.push(command); throw new Error('Invalid call'); } });
		assert.deepStrictEqual(await Promise.all([service.supportsCoordinatedUninstall(), service.supportsCoordinatedUninstall()]), [false, false]);
		assert.strictEqual(await service.supportsCoordinatedUninstall(), false);
		assert.deepStrictEqual(commands, ['supportsCoordinatedUninstall']);
	});

	test('a transport failure is not cached as unsupported capability', async () => {
		let calls = 0;
		const service = client({ listen: () => Event.None, call: async <T>() => {
			if (++calls === 1) { throw new Error('disconnected'); }
			return true as T;
		} });
		await assert.rejects(service.supportsCoordinatedUninstall(), /disconnected/);
		assert.strictEqual(await service.supportsCoordinatedUninstall(), true);
		assert.strictEqual(calls, 2);
	});

	test('reserve transforms the profile and revives outgoing extension resources', async () => {
		const local = upcastPartial<ILocalExtension>({ identifier: { id: 'fixture.extension' }, manifest: { name: 'extension', publisher: 'fixture', version: '1.0.0', engines: { vscode: '*' } }, location: URI.file('/extensions/fixture'), readmeUrl: URI.file('/extensions/fixture/README.md') });
		const service = client(wire(backend({ reserveLocalUninstall: async (id, profile, identity) => {
			assert.deepStrictEqual([id, profile?.toString(), identity], ['operation', 'file:///profiles/extensions.json', 'expected-store']);
			assert.ok(profile instanceof URI);
			return [local];
		} })));
		const [result] = await service.reserveLocalUninstall('operation', URI.parse('remote://host/profiles/extensions.json'), 'expected-store');
		assert.ok(result.location instanceof URI && result.readmeUrl instanceof URI);
		assert.deepStrictEqual([result.location.toString(), result.readmeUrl.toString()], ['remote://host/extensions/fixture', 'remote://host/extensions/fixture/README.md']);
	});

	test('prepare transforms extension resources and options while preserving flags and recovery target', async () => {
		let received: UninstallExtensionInfo[] | undefined;
		let target: string | undefined;
		const service = client(wire(backend({ prepareLocalUninstall: async (id, batch, recoveryTarget) => {
			assert.strictEqual(id, 'operation'); received = batch; target = recoveryTarget;
		} })));
		const extension = upcastPartial<ILocalExtension>({ identifier: { id: 'fixture.extension' }, manifest: { name: 'extension', publisher: 'fixture', version: '1.0.0', engines: { vscode: '*' } }, location: URI.parse('remote://host/extensions/fixture'), changelogUrl: URI.parse('remote://host/extensions/fixture/CHANGELOG.md') });
		await service.prepareLocalUninstall('operation', [{ extension, options: { profileLocation: URI.parse('remote://host/profiles/extensions.json'), remove: true, donotIncludePack: true } }], 'opaque-recovery-target');
		assert.strictEqual(target, 'opaque-recovery-target');
		assert.ok(received![0].extension.location instanceof URI && received![0].extension.changelogUrl instanceof URI && received![0].options?.profileLocation instanceof URI);
		assert.deepStrictEqual([received![0].extension.location.toString(), received![0].extension.changelogUrl?.toString(), received![0].options?.profileLocation?.toString(), received![0].options?.remove, received![0].options?.donotIncludePack], ['file:///extensions/fixture', 'file:///extensions/fixture/CHANGELOG.md', 'file:///profiles/extensions.json', true, true]);
	});

	test('terminal protocol messages preserve operation and store identities', async () => {
		const calls: string[][] = [];
		const service = client(wire(backend({
			releaseLocalUninstall: async (id, identity) => { calls.push(['release', id, identity]); },
			commitLocalUninstall: async id => { calls.push(['commit', id]); },
			abortLocalUninstall: async id => { calls.push(['abort', id]); },
			acknowledgeLocalUninstall: async id => { calls.push(['ack', id]); },
			getPendingLocalUninstalls: async target => { calls.push(['pending', target]); return ['pending-id']; },
		})));
		assert.strictEqual(await service.getCoordinatedUninstallIdentity(), 'store');
		assert.deepStrictEqual(await service.getPendingLocalUninstalls('target'), ['pending-id']);
		await service.commitLocalUninstall('operation');
		await service.abortLocalUninstall('operation');
		await service.releaseLocalUninstall('operation', 'expected-store');
		await service.acknowledgeLocalUninstall('operation');
		assert.deepStrictEqual(calls, [['pending', 'target'], ['commit', 'operation'], ['abort', 'operation'], ['release', 'operation', 'expected-store'], ['ack', 'operation']]);
	});

	test('prepare rejects workspace extensions before sending a native operation', () => {
		const service = client({ listen: () => Event.None, call: async () => assert.fail('must not send a workspace extension') });
		assert.throws(() => service.prepareLocalUninstall('operation', [{ extension: upcastPartial<ILocalExtension>({ isWorkspaceScoped: true }) }], 'target'), /workspace extension/);
	});
});
