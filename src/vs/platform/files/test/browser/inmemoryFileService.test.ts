/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { streamToBuffer, VSBuffer } from '../../../../base/common/buffer.js';
import { Schemas } from '../../../../base/common/network.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileChangeType, FileOperation, FileOperationEvent, FileSystemProviderCapabilities, IFileStat } from '../../common/files.js';
import { FileService } from '../../common/fileService.js';
import { InMemoryFileSystemProvider } from '../../common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';

function getByName(root: IFileStat, name: string): IFileStat | undefined {
	if (root.children === undefined) {
		return undefined;
	}

	return root.children.find(child => child.name === name);
}

function createLargeBuffer(size: number, seed: number): VSBuffer {
	const data = new Uint8Array(size);
	for (let i = 0; i < data.length; i++) {
		data[i] = (seed + i) % 256;
	}

	return VSBuffer.wrap(data);
}

type Fixture = {
	root: URI;
	indexHtml: URI;
	siteCss: URI;
	smallTxt: URI;
	smallUmlautTxt: URI;
	deepDir: URI;
	otherDeepDir: URI;
};

suite('InMemory File Service', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let service: FileService;
	let provider: InMemoryFileSystemProvider;
	let fixture: Fixture;

	setup(async () => {
		service = disposables.add(new FileService(new NullLogService()));
		provider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(service.registerProvider(Schemas.inMemory, provider));

		fixture = await createFixture(service);
	});

	test('createFolder', async () => {
		let event: FileOperationEvent | undefined;
		disposables.add(service.onDidRunOperation(e => event = e));

		const newFolderResource = joinPath(fixture.root, 'newFolder');
		const newFolder = await service.createFolder(newFolderResource);

		assert.strictEqual(newFolder.name, 'newFolder');
		assert.strictEqual(await service.exists(newFolderResource), true);

		assert.ok(event);
		assert.strictEqual(event.resource.toString(), newFolderResource.toString());
		assert.strictEqual(event.operation, FileOperation.CREATE);
		assert.strictEqual(event.target?.resource.toString(), newFolderResource.toString());
		assert.strictEqual(event.target?.isDirectory, true);
	});

	test('createFolder: creating multiple folders at once', async () => {
		let event: FileOperationEvent | undefined;
		disposables.add(service.onDidRunOperation(e => event = e));

		const multiFolderPaths = ['a', 'couple', 'of', 'folders'];
		const newFolderResource = joinPath(fixture.root, ...multiFolderPaths);

		const newFolder = await service.createFolder(newFolderResource);
		assert.strictEqual(newFolder.name, multiFolderPaths[multiFolderPaths.length - 1]);
		assert.strictEqual(await service.exists(newFolderResource), true);

		assert.ok(event);
		assert.strictEqual(event.resource.toString(), newFolderResource.toString());
		assert.strictEqual(event.operation, FileOperation.CREATE);
		assert.strictEqual(event.target?.resource.toString(), newFolderResource.toString());
		assert.strictEqual(event.target?.isDirectory, true);
	});

	test('exists', async () => {
		let exists = await service.exists(fixture.root);
		assert.strictEqual(exists, true);

		exists = await service.exists(joinPath(fixture.root, 'does-not-exist'));
		assert.strictEqual(exists, false);
	});

	test('resolve - file', async () => {
		const resolved = await service.resolve(fixture.indexHtml);

		assert.strictEqual(resolved.name, 'index.html');
		assert.strictEqual(resolved.isFile, true);
		assert.strictEqual(resolved.isDirectory, false);
	});

	test('resolve - directory', async () => {
		const resolved = await service.resolve(fixture.root);
		assert.strictEqual(resolved.isDirectory, true);
		assert.ok(resolved.children);

		const names = resolved.children.map(c => c.name).sort();
		assert.deepStrictEqual(names, ['examples', 'index.html', 'other', 'site.css', 'deep', 'small.txt', 'small_umlaut.txt'].sort());
	});

	test('resolve - directory with resolveTo', async () => {
		const resolved = await service.resolve(fixture.root, { resolveTo: [fixture.deepDir] });

		const deep = getByName(resolved, 'deep');
		assert.ok(deep);
		assert.ok(deep.children);
		assert.strictEqual(deep.children.length, 4);
	});

	test('readFile', async () => {
		const content = await service.readFile(fixture.smallTxt);
		assert.strictEqual(content.value.toString(), 'Small File');
	});

	test('readFile - from position (ASCII)', async () => {
		const content = await service.readFile(fixture.smallTxt, { position: 6 });
		assert.strictEqual(content.value.toString(), 'File');
	});

	test('readFile - from position (with umlaut)', async () => {
		const pos = VSBuffer.fromString('Small File with Ü').byteLength;
		const content = await service.readFile(fixture.smallUmlautTxt, { position: pos });
		assert.strictEqual(content.value.toString(), 'mlaut');
	});

	test('readFileStream', async () => {
		const content = await service.readFileStream(fixture.smallTxt);
		assert.strictEqual((await streamToBuffer(content.value)).toString(), 'Small File');
	});

	test('writeFile', async () => {
		await service.writeFile(fixture.smallTxt, VSBuffer.fromString('Updated'));

		const content = await service.readFile(fixture.smallTxt);
		assert.strictEqual(content.value.toString(), 'Updated');
	});

	test('provider open/write - append', async () => {
		const resource = joinPath(fixture.root, 'append.txt');
		await service.writeFile(resource, VSBuffer.fromString('Hello'));

		const fd = await provider.open(resource, { create: true, unlock: false, append: true });
		try {
			const data = VSBuffer.fromString(' World').buffer;
			await provider.write(fd, 0, data, 0, data.byteLength);
		} finally {
			await provider.close(fd);
		}

		const content = await service.readFile(resource);
		assert.strictEqual(content.value.toString(), 'Hello World');
	});

	test('provider open/write - append (large)', async () => {
		const resource = joinPath(fixture.root, 'append-large-open.txt');
		const prefix = createLargeBuffer(256 * 1024, 1);
		const suffix = createLargeBuffer(256 * 1024, 2);

		await service.writeFile(resource, prefix);

		const fd = await provider.open(resource, { create: true, unlock: false, append: true });
		try {
			await provider.write(fd, 123 /* ignored in append mode */, suffix.buffer, 0, suffix.byteLength);
		} finally {
			await provider.close(fd);
		}

		const content = await service.readFile(resource);
		assert.strictEqual(content.value.byteLength, prefix.byteLength + suffix.byteLength);

		assert.deepStrictEqual(content.value.slice(0, 64).buffer, prefix.slice(0, 64).buffer);
		assert.deepStrictEqual(content.value.slice(prefix.byteLength, prefix.byteLength + 64).buffer, suffix.slice(0, 64).buffer);
		assert.deepStrictEqual(content.value.slice(content.value.byteLength - 64, content.value.byteLength).buffer, suffix.slice(suffix.byteLength - 64, suffix.byteLength).buffer);
	});

	test('writeFile - append', async () => {
		const resource = joinPath(fixture.root, 'append-via-writeFile.txt');
		await service.writeFile(resource, VSBuffer.fromString('Hello'));

		await service.writeFile(resource, VSBuffer.fromString(' World'), { append: true });

		const content = await service.readFile(resource);
		assert.strictEqual(content.value.toString(), 'Hello World');
	});

	test('writeFile - append (large)', async () => {
		const resource = joinPath(fixture.root, 'append-large-writeFile.txt');
		const prefix = createLargeBuffer(256 * 1024, 3);
		const suffix = createLargeBuffer(256 * 1024, 4);

		await service.writeFile(resource, prefix);
		await service.writeFile(resource, suffix, { append: true });

		const content = await service.readFile(resource);
		assert.strictEqual(content.value.byteLength, prefix.byteLength + suffix.byteLength);

		assert.deepStrictEqual(content.value.slice(0, 64).buffer, prefix.slice(0, 64).buffer);
		assert.deepStrictEqual(content.value.slice(prefix.byteLength, prefix.byteLength + 64).buffer, suffix.slice(0, 64).buffer);
		assert.deepStrictEqual(content.value.slice(content.value.byteLength - 64, content.value.byteLength).buffer, suffix.slice(suffix.byteLength - 64, suffix.byteLength).buffer);
	});

	test('rename', async () => {
		const source = joinPath(fixture.root, 'site.css');
		const target = joinPath(fixture.root, 'SITE.css');

		await service.move(source, target, true);

		assert.strictEqual(await service.exists(source), false);
		assert.strictEqual(await service.exists(target), true);
	});

	test('copy', async () => {
		const source = fixture.indexHtml;
		const target = joinPath(fixture.root, 'index-copy.html');

		await service.copy(source, target, true);

		const copied = await service.readFile(target);
		assert.strictEqual(copied.value.toString(), 'Index');
	});

	test('deleteFile', async () => {
		const resource = joinPath(fixture.root, 'to-delete.txt');
		await service.writeFile(resource, VSBuffer.fromString('delete me'));
		assert.strictEqual(await service.exists(resource), true);

		await service.del(resource);
		assert.strictEqual(await service.exists(resource), false);
	});

	test('provider events bubble through file service', async () => {
		let changeCount = 0;
		const resource = joinPath(fixture.root, 'events.txt');
		disposables.add(service.onDidFilesChange(e => {
			if (e.contains(resource, FileChangeType.UPDATED) || e.contains(resource, FileChangeType.ADDED) || e.contains(resource, FileChangeType.DELETED)) {
				changeCount++;
			}
		}));

		await service.writeFile(resource, VSBuffer.fromString('1'));
		await service.writeFile(resource, VSBuffer.fromString('2'));
		await service.del(resource);

		await timeout(20); // provider fires changes async
		assert.ok(changeCount > 0);
	});

	test('setReadOnly toggles provider capabilities', async () => {
		provider.setReadOnly(true);
		assert.ok(provider.capabilities & FileSystemProviderCapabilities.Readonly);

		let error: unknown;
		try {
			await service.writeFile(joinPath(fixture.root, 'readonly.txt'), VSBuffer.fromString('fail'));
		} catch (e) {
			error = e;
		}

		assert.ok(error);

		provider.setReadOnly(false);
		await service.writeFile(joinPath(fixture.root, 'readonly.txt'), VSBuffer.fromString('ok'));
	});
});

async function createFixture(service: FileService): Promise<Fixture> {
	const root = URI.from({ scheme: Schemas.inMemory, path: '/' });

	await service.createFolder(joinPath(root, 'examples'));
	await service.createFolder(joinPath(root, 'other'));
	await service.writeFile(joinPath(root, 'index.html'), VSBuffer.fromString('Index'));
	await service.writeFile(joinPath(root, 'site.css'), VSBuffer.fromString('body { }'));

	await service.writeFile(joinPath(root, 'small.txt'), VSBuffer.fromString('Small File'));
	await service.writeFile(joinPath(root, 'small_umlaut.txt'), VSBuffer.fromString('Small File with Ümlaut'));

	await service.createFolder(joinPath(root, 'deep'));
	await service.writeFile(joinPath(root, 'deep', 'conway.js'), VSBuffer.fromString('console.log("conway");'));
	await service.writeFile(joinPath(root, 'deep', 'a.txt'), VSBuffer.fromString('A'));
	await service.writeFile(joinPath(root, 'deep', 'b.txt'), VSBuffer.fromString('B'));
	await service.writeFile(joinPath(root, 'deep', 'c.txt'), VSBuffer.fromString('C'));

	await service.createFolder(joinPath(root, 'other', 'deep'));
	await service.writeFile(joinPath(root, 'other', 'deep', '1.txt'), VSBuffer.fromString('1'));
	await service.writeFile(joinPath(root, 'other', 'deep', '2.txt'), VSBuffer.fromString('2'));
	await service.writeFile(joinPath(root, 'other', 'deep', '3.txt'), VSBuffer.fromString('3'));
	await service.writeFile(joinPath(root, 'other', 'deep', '4.txt'), VSBuffer.fromString('4'));

	return {
		root,
		indexHtml: joinPath(root, 'index.html'),
		siteCss: joinPath(root, 'site.css'),
		smallTxt: joinPath(root, 'small.txt'),
		smallUmlautTxt: joinPath(root, 'small_umlaut.txt'),
		deepDir: joinPath(root, 'deep'),
		otherDeepDir: joinPath(root, 'other', 'deep')
	};
}
