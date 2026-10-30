/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ChannelClient, ChannelServer, IMessagePassingProtocol } from '../../../../base/parts/ipc/common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ISharedProcessService } from '../../../ipc/electron-browser/services.js';
import { IExtension } from '../../../extensions/common/extensions.js';
import { createExtensionsProfileScannerChannel } from '../../common/extensionManagementIpc.js';
import { Metadata } from '../../common/extensionManagement.js';
import { DidAddProfileExtensionsEvent, DidRemoveProfileExtensionsEvent, ExtensionsProfileScanningError, ExtensionsProfileScanningErrorCode, IExtensionsProfileScannerService, IProfileExtensionsScanOptions, IScannedProfileExtension, ProfileExtensionsEvent } from '../../common/extensionsProfileScannerService.js';
import { ExtensionsProfileScannerService } from '../../electron-browser/extensionsProfileScannerService.js';

class QueuedProtocol extends Disposable implements IMessagePassingProtocol {
	private readonly messages = this._register(new Emitter<VSBuffer>());
	readonly onMessage = this.messages.event;
	readonly pending: VSBuffer[] = [];
	peer!: QueuedProtocol;

	send(buffer: VSBuffer): void {
		this.peer.pending.push(buffer);
		queueMicrotask(() => this.peer.flush());
	}

	flush(): void {
		while (this.pending.length) {
			this.messages.fire(this.pending.shift()!);
		}
	}
}

class ScannerService extends Disposable implements IExtensionsProfileScannerService {
	declare readonly _serviceBrand: undefined;
	private readonly add = this._register(new Emitter<ProfileExtensionsEvent>());
	private readonly didAdd = this._register(new Emitter<DidAddProfileExtensionsEvent>());
	private readonly remove = this._register(new Emitter<ProfileExtensionsEvent>());
	private readonly didRemove = this._register(new Emitter<DidRemoveProfileExtensionsEvent>());
	readonly onAddExtensions = this.add.event;
	readonly onDidAddExtensions = this.didAdd.event;
	readonly onRemoveExtensions = this.remove.event;
	readonly onDidRemoveExtensions = this.didRemove.event;
	readonly calls: unknown[][] = [];

	scanResult: IScannedProfileExtension[] | Error = [];

	async scanProfileExtensions(profileLocation: URI, options?: IProfileExtensionsScanOptions): Promise<IScannedProfileExtension[]> {
		this.calls.push(['scan', profileLocation, options]);
		if (this.scanResult instanceof Error) {
			throw this.scanResult;
		}
		return this.scanResult;
	}

	async addExtensionsToProfile(extensions: [IExtension, Metadata | undefined][], profileLocation: URI, keepExistingVersions?: boolean): Promise<IScannedProfileExtension[]> {
		this.calls.push(['add', extensions, profileLocation, keepExistingVersions]);
		return this.scanResult instanceof Error ? [] : this.scanResult;
	}

	async updateMetadata(extensions: [IExtension, Metadata | undefined][], profileLocation: URI): Promise<IScannedProfileExtension[]> {
		this.calls.push(['update', extensions, profileLocation]);
		return this.scanResult instanceof Error ? [] : this.scanResult;
	}

	async removeExtensionsFromProfile(extensions: IExtension['identifier'][], profileLocation: URI): Promise<void> {
		this.calls.push(['remove', extensions, profileLocation]);
	}

	emitAdd(event: ProfileExtensionsEvent): void { this.add.fire(event); }
	emitDidAdd(event: DidAddProfileExtensionsEvent): void { this.didAdd.fire(event); }
	emitRemove(event: ProfileExtensionsEvent): void { this.remove.fire(event); }
	emitDidRemove(event: DidRemoveProfileExtensionsEvent): void { this.didRemove.fire(event); }
}

suite('ExtensionsProfileScannerService IPC proxy', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function connect(source: ScannerService) {
		const renderer = disposables.add(new QueuedProtocol());
		const main = disposables.add(new QueuedProtocol());
		renderer.peer = main;
		main.peer = renderer;
		const server = disposables.add(new ChannelServer(main, 'shared-process'));
		server.registerChannel('extensionsProfileScanner', createExtensionsProfileScannerChannel(source, disposables.add(new DisposableStore())));
		const client = disposables.add(new ChannelClient(renderer));
		const sharedProcessService = { getChannel: (name: string) => client.getChannel(name) };
		const service = new ExtensionsProfileScannerService(sharedProcessService as ISharedProcessService);
		return { renderer, main, service };
	}

	function extension(location: URI): IExtension {
		return {
			identifier: { id: 'publisher.extension', uuid: 'extension-uuid' },
			manifest: { version: '1.2.3' },
			location,
		} as IExtension;
	}

	function scanned(location: URI): IScannedProfileExtension {
		return { identifier: { id: 'publisher.extension', uuid: 'extension-uuid' }, version: '1.2.3', location, metadata: { id: 'metadata-id' } };
	}

	test('revives URI arguments and results for scan and profile mutations', async () => {
		const source = disposables.add(new ScannerService());
		const { service } = connect(source);
		const profile = URI.from({ scheme: 'vscode-userdata', authority: 'profile', path: '/profiles/work/extensions.json' });
		const location = URI.from({ scheme: 'vscode-remote', authority: 'ssh-remote+host', path: '/extensions/publisher.extension-1.2.3' });
		const item = extension(location);
		const result = scanned(location);
		const options: IProfileExtensionsScanOptions = { bailOutWhenFileNotFound: true };
		const metadata: Metadata = { id: 'metadata-id', installedTimestamp: 42 };
		source.scanResult = [result];

		const scan = await service.scanProfileExtensions(profile, options);
		assert.deepStrictEqual(source.calls[0], ['scan', profile, options]);
		assert.ok(source.calls[0][1] instanceof URI);
		assert.ok(scan[0].location instanceof URI);
		assert.deepStrictEqual(scan, [result]);

		const added = await service.addExtensionsToProfile([[item, metadata]], profile, true);
		const updated = await service.updateMetadata([[item, metadata]], profile);
		await service.removeExtensionsFromProfile([item.identifier], profile);
		assert.ok(added[0].location instanceof URI);
		assert.ok(updated[0].location instanceof URI);

		assert.deepStrictEqual(source.calls.slice(1), [
			['add', [[item, metadata]], profile, true],
			['update', [[item, metadata]], profile],
			['remove', [item.identifier], profile],
		]);
		for (const call of source.calls.slice(1)) {
			assert.ok(call[2] instanceof URI);
		}
		assert.ok((source.calls[1][1] as [IExtension, Metadata | undefined][])[0][0].location instanceof URI);
		assert.ok((source.calls[2][1] as [IExtension, Metadata | undefined][])[0][0].location instanceof URI);
	});

	test('revives all scanner events and preserves optional operation errors', async () => {
		const source = disposables.add(new ScannerService());
		const { service } = connect(source);
		const profileLocation = URI.from({ scheme: 'vscode-userdata', authority: 'profile', path: '/profiles/work/extensions.json' });
		const value = scanned(URI.from({ scheme: 'vscode-remote', authority: 'ssh-remote+host', path: '/extensions/a' }));
		const received: unknown[] = [];
		const allEventsReceived = new DeferredPromise<void>();
		const receive = (kind: string, event: ProfileExtensionsEvent) => {
			received.push([kind, event]);
			if (received.length === 4) {
				void allEventsReceived.complete();
			}
		};
		const subscriptions = [
			disposables.add(service.onAddExtensions(event => receive('add', event))),
			disposables.add(service.onDidAddExtensions(event => receive('didAdd', event))),
			disposables.add(service.onRemoveExtensions(event => receive('remove', event))),
			disposables.add(service.onDidRemoveExtensions(event => receive('didRemove', event))),
		];
		await service.scanProfileExtensions(profileLocation);

		source.emitAdd({ extensions: [value], profileLocation });
		source.emitDidAdd({ extensions: [value], profileLocation, error: new Error('add failed') });
		source.emitRemove({ extensions: [value], profileLocation });
		source.emitDidRemove({ extensions: [value], profileLocation, error: new Error('remove failed') });
		await allEventsReceived.p;

		assert.strictEqual(received.length, 4);
		for (const [, event] of received as [string, ProfileExtensionsEvent][]) {
			assert.ok(event.profileLocation instanceof URI);
			assert.ok(event.extensions[0].location instanceof URI);
		}
		const addError = (received[1] as [string, DidAddProfileExtensionsEvent])[1].error;
		const removeError = (received[3] as [string, DidRemoveProfileExtensionsEvent])[1].error;
		assert.ok(addError instanceof Error);
		assert.strictEqual(addError.message, 'add failed');
		assert.ok(removeError instanceof Error);
		assert.strictEqual(removeError.message, 'remove failed');
		subscriptions.forEach(subscription => subscription.dispose());
		await service.scanProfileExtensions(profileLocation);
		source.emitAdd({ extensions: [value], profileLocation });
		await service.scanProfileExtensions(profileLocation);
		assert.strictEqual(received.length, 4);
	});

	test('reconstructs typed profile scanning errors after IPC serialization', async () => {
		const source = disposables.add(new ScannerService());
		const { service } = connect(source);
		const profile = URI.file('/profiles/missing/extensions.json');
		source.scanResult = new ExtensionsProfileScanningError('Profile file is missing', ExtensionsProfileScanningErrorCode.ERROR_PROFILE_NOT_FOUND);

		const result = service.scanProfileExtensions(profile);
		const error = await result.then(() => undefined, err => err);
		assert.ok(error instanceof ExtensionsProfileScanningError);
		assert.strictEqual(error.message, 'Profile file is missing');
		assert.strictEqual(error.code, ExtensionsProfileScanningErrorCode.ERROR_PROFILE_NOT_FOUND);
	});

	test('preserves ordinary scan failures without translating them to profile errors', async () => {
		const source = disposables.add(new ScannerService());
		const { service } = connect(source);
		source.scanResult = new Error('Unexpected scanner failure');

		const error = await service.scanProfileExtensions(URI.file('/profiles/extensions.json')).then(() => undefined, err => err);
		assert.ok(error instanceof Error);
		assert.strictEqual(error.message, 'Unexpected scanner failure');
		assert.ok(!(error instanceof ExtensionsProfileScanningError));
	});
});
