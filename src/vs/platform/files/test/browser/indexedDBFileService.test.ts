/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { FileService } from 'vs/platform/files/common/fileService';
import { Schemas } from 'vs/base/common/network';
import { posix } from 'vs/base/common/path';
import { URI } from 'vs/base/common/uri';
import { FileOperation, FileOperationEvent } from 'vs/platform/files/common/files';
import { NullLogService } from 'vs/platform/log/common/log';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IIndexedDBFileSystemProvider, IndexedDB, INDEXEDDB_LOGS_OBJECT_STORE, INDEXEDDB_USERDATA_OBJECT_STORE } from 'vs/platform/files/browser/indexedDBFileSystemProvider';
import { assertIsDefined } from 'vs/base/common/types';

// FileService doesn't work with \ leading a path. Windows join swaps /'s for \'s,
// making /-style absolute paths fail isAbsolute checks.
const join = posix.join;

suite('IndexedDB File Service', function () {

	const logSchema = 'logs';

	let service: FileService;
	let logFileProvider: IIndexedDBFileSystemProvider;
	let userdataFileProvider: IIndexedDBFileSystemProvider;
	const testDir = '/';

	const makeLogfileURI = (path: string) => URI.from({ scheme: logSchema, path });
	const makeUserdataURI = (path: string) => URI.from({ scheme: Schemas.userData, path });

	const disposables = new DisposableStore();

	setup(async () => {
		const logService = new NullLogService();

		service = new FileService(logService);
		disposables.add(service);

		logFileProvider = assertIsDefined(await new IndexedDB().createFileSystemProvider(Schemas.file, INDEXEDDB_LOGS_OBJECT_STORE));
		disposables.add(service.registerProvider(logSchema, logFileProvider));
		disposables.add(logFileProvider);

		userdataFileProvider = assertIsDefined(await new IndexedDB().createFileSystemProvider(logSchema, INDEXEDDB_USERDATA_OBJECT_STORE));
		disposables.add(service.registerProvider(Schemas.userData, userdataFileProvider));
		disposables.add(userdataFileProvider);
	});

	teardown(async () => {
		disposables.clear();

		await logFileProvider.delete(makeLogfileURI(testDir), { recursive: true, useTrash: false });
		await userdataFileProvider.delete(makeUserdataURI(testDir), { recursive: true, useTrash: false });
	});

	test('createFolder', async () => {
		let event: FileOperationEvent | undefined;
		disposables.add(service.onDidRunOperation(e => event = e));

		const parent = await service.resolve(makeUserdataURI(testDir));

		const newFolderResource = makeUserdataURI(join(parent.resource.path, 'newFolder'));

		assert.equal((await userdataFileProvider.readdir(parent.resource)).length, 0);
		const newFolder = await service.createFolder(newFolderResource);
		assert.equal(newFolder.name, 'newFolder');
		// Invalid.. dirs dont exist in our IDBFSB.
		// assert.equal((await userdataFileProvider.readdir(parent.resource)).length, 1);

		assert.ok(event);
		assert.equal(event!.resource.path, newFolderResource.path);
		assert.equal(event!.operation, FileOperation.CREATE);
		assert.equal(event!.target!.resource.path, newFolderResource.path);
		assert.equal(event!.target!.isDirectory, true);
	});
});
