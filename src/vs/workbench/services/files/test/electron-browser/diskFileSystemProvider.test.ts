/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Event } from '../../../../../base/common/event.js';
import { dirname, joinPath } from '../../../../../base/common/resources.js';
import { URI, UriComponents } from '../../../../../base/common/uri.js';
import { DefaultURITransformer, IURITransformer } from '../../../../../base/common/uriIpc.js';
import { IChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { createFileSystemProviderError, FileSystemProviderErrorCode, FileType, IFileWriteOptions } from '../../../../../platform/files/common/files.js';
// This Electron contract test intentionally connects the production renderer adapter to its main-process channel.
// eslint-disable-next-line local/code-layering, local/code-import-patterns
import { DiskFileSystemProvider as NativeDiskFileSystemProvider } from '../../../../../platform/files/node/diskFileSystemProvider.js';
// eslint-disable-next-line local/code-layering, local/code-import-patterns
import { AbstractDiskFileSystemProviderChannel, ISessionFileWatcher } from '../../../../../platform/files/node/diskFileSystemProviderServer.js';
import { IMainProcessService } from '../../../../../platform/ipc/common/mainProcessService.js';
import { ILoggerService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IUtilityProcessWorkerWorkbenchService } from '../../../utilityProcess/electron-browser/utilityProcessWorkerWorkbenchService.js';
import { DiskFileSystemProvider } from '../../electron-browser/diskFileSystemProvider.js';

class TestDiskChannel extends AbstractDiskFileSystemProviderChannel<void> {
	protected getUriTransformer(): IURITransformer { return DefaultURITransformer; }
	protected transformIncoming(_transformer: IURITransformer, resource: UriComponents): URI { return URI.revive(resource); }
	protected createSessionFileWatcher(): ISessionFileWatcher { throw new Error('Unexpected watcher'); }
}

suite('Workbench disk provider synchronization', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('FileService forwards synchronization and fenced directory creation through the production adapter', async () => {
		const directories = new Set(['/']);
		const contents = new Map<string, Uint8Array>();
		const writes: IFileWriteOptions[] = [];
		const backend = new class extends mock<NativeDiskFileSystemProvider>() {
			override async stat(resource: URI) {
				if (directories.has(resource.path)) {
					return { type: FileType.Directory, size: 0, ctime: 0, mtime: 0 };
				}
				const value = contents.get(resource.path);
				if (!value) {
					throw createFileSystemProviderError('Missing', FileSystemProviderErrorCode.FileNotFound);
				}
				return { type: FileType.File, size: value.byteLength, ctime: 0, mtime: 0 };
			}
			override async mkdir(resource: URI): Promise<void> {
				assert.ok(directories.has(dirname(resource).path));
				directories.add(resource.path);
			}
			override async writeFile(resource: URI, value: Uint8Array, options: IFileWriteOptions): Promise<void> {
				writes.push(options);
				contents.set(resource.path, value.slice());
			}
		}();
		const server = disposables.add(new TestDiskChannel(backend, new NullLogService()));
		const channel: IChannel = {
			call: async (command, args) => {
				assert.ok(Array.isArray(args));
				return server.call(undefined, command, args);
			},
			listen: () => Event.None,
		};
		const provider = disposables.add(new DiskFileSystemProvider(
			upcastPartial<IMainProcessService>({ getChannel: () => channel }),
			upcastPartial<IUtilityProcessWorkerWorkbenchService>({}),
			new NullLogService(),
			upcastPartial<ILoggerService>({}),
		));
		const files = disposables.add(new FileService(new NullLogService()));
		disposables.add(files.registerProvider('file', provider));
		const root = URI.file('/chat-storage');
		const fence = await files.synchronize(root);
		assert.ok(fence);
		const resource = joinPath(root, 'session.resources', 'image');
		await files.writeFile(resource, VSBuffer.fromString('data'), { synchronization: [fence] });
		await files.synchronize(root);
		await assert.rejects(files.writeFile(joinPath(root, 'stale.resources', 'image'), VSBuffer.fromString('stale'), { synchronization: [fence] }), /superseded/);
		assert.deepStrictEqual({
			content: VSBuffer.wrap(contents.get(resource.path)!).toString(),
			writeFence: writes[0].synchronization,
			staleDirectoryCreated: directories.has(joinPath(root, 'stale.resources').path),
		}, { content: 'data', writeFence: [fence], staleDirectoryCreated: false });
	});
});
