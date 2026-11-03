/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileChangesEvent, FileChangeType, IFileChange, IWatchOptions } from '../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { FileOnDiskFileSystemProvider } from '../../common/fileOnDiskFileSystemProvider.js';

/**
 * Like the disk file system provider, reports changes only to the watch request they belong to.
 */
class CorrelatingFileSystemProvider extends InMemoryFileSystemProvider {

	private readonly correlatedChanges = this._register(new Emitter<readonly IFileChange[]>());
	override readonly onDidChangeFile = this.correlatedChanges.event;

	private readonly _onDidWatch = this._register(new Emitter<void>());
	readonly onDidWatch = this._onDidWatch.event;

	private correlationId: number | undefined;
	disposedWatches = 0;

	override watch(resource: URI, opts: IWatchOptions): IDisposable {
		this.correlationId = opts.correlationId;
		this._onDidWatch.fire();

		return toDisposable(() => this.disposedWatches++);
	}

	fireChange(resource: URI, type: FileChangeType): void {
		this.correlatedChanges.fire([{ resource, type, cId: this.correlationId }]);
	}
}

suite('FileOnDiskFileSystemProvider', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('serves the file on disk readonly', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));
		disposables.add(fileService.registerProvider(FileOnDiskFileSystemProvider.SCHEME, disposables.add(new FileOnDiskFileSystemProvider(fileService))));

		const resource = URI.file('/workspace/notebook.ipynb');
		await fileService.writeFile(resource, VSBuffer.fromString('content on disk'));

		const fileOnDisk = FileOnDiskFileSystemProvider.toFileOnDisk(resource);
		const stat = await fileService.stat(fileOnDisk);

		assert.deepStrictEqual({
			name: basename(fileOnDisk),
			resource: FileOnDiskFileSystemProvider.fromFileOnDisk(fileOnDisk).toString(),
			content: (await fileService.readFile(fileOnDisk)).value.toString(),
			size: stat.size,
			readonly: stat.readonly
		}, {
			name: 'notebook.ipynb',
			resource: resource.toString(),
			content: 'content on disk',
			size: 'content on disk'.length,
			readonly: true
		});

		await assert.rejects(() => fileService.writeFile(fileOnDisk, VSBuffer.fromString('changed')));
		assert.strictEqual((await fileService.readFile(resource)).value.toString(), 'content on disk');
	});

	test('reports changes of the file on disk while it is watched', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		const diskProvider = disposables.add(new CorrelatingFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.file, diskProvider));
		disposables.add(fileService.registerProvider(FileOnDiskFileSystemProvider.SCHEME, disposables.add(new FileOnDiskFileSystemProvider(fileService))));

		const resource = URI.file('/workspace/notebook.ipynb');
		const fileOnDisk = FileOnDiskFileSystemProvider.toFileOnDisk(resource);

		const events: FileChangesEvent[] = [];
		disposables.add(fileService.onDidFilesChange(e => events.push(e)));

		const didWatch = Event.toPromise(diskProvider.onDidWatch);
		const watch = fileService.watch(fileOnDisk);
		await didWatch;

		diskProvider.fireChange(resource, FileChangeType.UPDATED);
		diskProvider.fireChange(resource, FileChangeType.DELETED);

		watch.dispose();
		await timeout(0);

		assert.deepStrictEqual(events.map(e => ({
			fileOnDiskUpdated: e.contains(fileOnDisk, FileChangeType.UPDATED),
			fileOnDiskDeleted: e.contains(fileOnDisk, FileChangeType.DELETED),
			file: e.contains(resource)
		})), [
			{ fileOnDiskUpdated: true, fileOnDiskDeleted: false, file: false },
			{ fileOnDiskUpdated: false, fileOnDiskDeleted: true, file: false }
		]);
		assert.strictEqual(diskProvider.disposedWatches, 1);
	});
});
