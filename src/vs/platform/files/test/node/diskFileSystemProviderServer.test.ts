/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { restore, stub } from 'sinon';
import { DeferredPromise } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { DefaultURITransformer, IURITransformer } from '../../../../base/common/uriIpc.js';
import { joinPath } from '../../../../base/common/resources.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getRandomTestPath } from '../../../../base/test/node/testUtils.js';
import { NullLogService } from '../../../log/common/log.js';
import { DiskFileSystemProvider } from '../../node/diskFileSystemProvider.js';
import { AbstractDiskFileSystemProviderChannel, ISessionFileWatcher } from '../../node/diskFileSystemProviderServer.js';

class TestDiskChannel extends AbstractDiskFileSystemProviderChannel<void> {
	protected getUriTransformer(): IURITransformer { return DefaultURITransformer; }
	protected transformIncoming(_transformer: IURITransformer, resource: UriComponents): URI { return URI.revive(resource); }
	protected createSessionFileWatcher(): ISessionFileWatcher { throw new Error('Unexpected watcher'); }
}

suite('DiskFileSystemProvider synchronization', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let root: URI;
	let provider: DiskFileSystemProvider;
	let channel: TestDiskChannel;

	setup(async () => {
		root = URI.file(getRandomTestPath(tmpdir(), 'vsctests', 'storage-fence'));
		await fs.mkdir(root.fsPath, { recursive: true });
		provider = disposables.add(new DiskFileSystemProvider(new NullLogService()));
		channel = disposables.add(new TestDiskChannel(provider, new NullLogService()));
	});

	teardown(async () => {
		restore();
		await fs.rm(root.fsPath, { recursive: true, force: true });
	});

	for (const operation of ['writeFile', 'delete', 'copy'] as const) {
		test(`drains an admitted ${operation} and rejects delayed mutations using the old fence`, async () => {
			const file = joinPath(root, 'session.json');
			const source = joinPath(root, 'source.json');
			await fs.writeFile(file.fsPath, 'old');
			await fs.writeFile(source.fsPath, 'copied');
			const oldFence = await channel.call<string>(undefined, 'synchronize', [root]);
			const entered = new DeferredPromise<void>();
			const release = new DeferredPromise<void>();
			const pause = async () => { entered.complete(); await release.p; };
			if (operation === 'writeFile') {
				stub(provider, 'writeFile').callsFake(async (resource, bytes) => { await pause(); await fs.writeFile(resource.fsPath, bytes); });
			} else if (operation === 'delete') {
				stub(provider, 'delete').callsFake(async resource => { await pause(); await fs.unlink(resource.fsPath); });
			} else {
				stub(provider, 'copy').callsFake(async (from, to) => { await pause(); await fs.copyFile(from.fsPath, to.fsPath); });
			}
			const args = operation === 'writeFile'
				? [file, VSBuffer.fromString('written'), { create: true, overwrite: true, synchronization: [oldFence] }]
				: operation === 'delete' ? [file, { recursive: false, synchronization: [oldFence] }]
					: [source, file, { overwrite: true, synchronization: [oldFence] }];
			const pending = channel.call<void>(undefined, operation, args);
			await entered.p;
			let drained = false;
			const synchronization = channel.call<string>(undefined, 'synchronize', [root]).then(token => { drained = true; return token; });
			await Promise.resolve();
			assert.strictEqual(drained, false);
			release.complete();
			await pending;
			const newFence = await synchronization;
			await assert.rejects(async () => channel.call(undefined, operation, args), /superseded/);
			if (operation === 'delete') {
				await assert.rejects(channel.call(undefined, 'stat', [file]), /ENOENT|not found/i);
			}
			restore();
			await channel.call(undefined, 'writeFile', [file, VSBuffer.fromString('current'), { create: true, overwrite: true, synchronization: [newFence] }]);
			assert.strictEqual(await fs.readFile(file.fsPath, 'utf8'), 'current');
		});
	}

	test('fences subsequent writes on an already-open handle, while allowing close', async () => {
		const file = joinPath(root, 'open.json');
		const oldFence = await channel.call<string>(undefined, 'synchronize', [root]);
		const handle = await channel.call<number>(undefined, 'open', [file, { create: true, synchronization: [oldFence] }]);
		await channel.call(undefined, 'synchronize', [root]);
		try {
			await assert.rejects(async () => channel.call(undefined, 'write', [handle, 0, VSBuffer.fromString('stale'), 0, 5]), /superseded/);
		} finally {
			await channel.call(undefined, 'close', [handle]);
		}
		assert.strictEqual(await fs.readFile(file.fsPath, 'utf8'), '');
	});

	test('rejects delayed directory creation after a new writer takes ownership', async () => {
		const oldFence = await channel.call<string>(undefined, 'synchronize', [root]);
		await channel.call(undefined, 'synchronize', [root]);
		const directory = joinPath(root, 'orphan.resources');
		await assert.rejects(async () => channel.call(undefined, 'mkdir', [directory, { synchronization: [oldFence] }]), /superseded/);
		await assert.rejects(fs.stat(directory.fsPath), { code: 'ENOENT' });
	});
});
