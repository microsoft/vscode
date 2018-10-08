/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NullLogService } from 'vs/platform/log/common/log';
import { TestEnvironmentService } from 'vs/workbench/test/workbenchTestServices';
import { NextStorageServiceImpl } from 'vs/platform/storage2/node/nextStorageServiceImpl';
import { generateUuid } from 'vs/base/common/uuid';
import { join } from 'path';
import { tmpdir } from 'os';
import { equal, ok } from 'assert';
import { INextStorageService } from 'vs/platform/storage2/common/nextStorageService';
import { del, mkdirp } from 'vs/base/node/pfs';

suite('Workbench NextStorageService', () => {

	function uniqueStorageDir(): string {
		const id = generateUuid();

		return join(tmpdir(), 'vsctests', id, 'storage2', id);
	}

	function onDidChangeStorage(storageService: INextStorageService): Promise<Set<string>> {
		return new Promise(resolve => {
			storageService.onDidChangeStorage(changes => {
				resolve(changes);
			});
		});
	}

	test('basics', async () => {
		const storageDir = uniqueStorageDir();
		await mkdirp(storageDir);

		const storageService = new NextStorageServiceImpl(join(storageDir, 'storage.db'), new NullLogService(), TestEnvironmentService);

		await storageService.init();

		// Empty fallbacks
		equal(storageService.get('foo', 'bar'), 'bar');
		equal(storageService.getInteger('foo', 55), 55);
		equal(storageService.getBoolean('foo', true), true);

		// Simple updates
		const set1Promise = storageService.set('bar', 'foo');
		const set2Promise = storageService.set('barNumber', 55);
		const set3Promise = storageService.set('barBoolean', true);

		let setPromiseResolved = false;
		Promise.all([set1Promise, set2Promise, set3Promise]).then(() => setPromiseResolved = true);

		equal(storageService.get('bar'), 'foo');
		equal(storageService.getInteger('barNumber'), 55);
		equal(storageService.getBoolean('barBoolean'), true);

		let changes = await onDidChangeStorage(storageService);
		equal(changes.size, 3);
		ok(changes.has('bar'));
		ok(changes.has('barNumber'));
		ok(changes.has('barBoolean'));

		equal(setPromiseResolved, true);

		// Simple deletes
		const delete1Promise = storageService.delete('bar');
		const delete2Promise = storageService.delete('barNumber');
		const delete3Promise = storageService.delete('barBoolean');

		let deletePromiseResolved = false;
		Promise.all([delete1Promise, delete2Promise, delete3Promise]).then(() => deletePromiseResolved = true);

		ok(!storageService.get('bar'));
		ok(!storageService.getInteger('barNumber'));
		ok(!storageService.getBoolean('barBoolean'));

		changes = await onDidChangeStorage(storageService);
		equal(changes.size, 3);
		ok(changes.has('bar'));
		ok(changes.has('barNumber'));
		ok(changes.has('barBoolean'));

		equal(deletePromiseResolved, true);

		await storageService.close();
		await del(storageDir, tmpdir());
	});

	test('close flushes data', async () => {
		const storageDir = uniqueStorageDir();
		await mkdirp(storageDir);

		let storageService = new NextStorageServiceImpl(join(storageDir, 'storage.db'), new NullLogService(), TestEnvironmentService);
		await storageService.init();

		const set1Promise = storageService.set('foo', 'bar');
		const set2Promise = storageService.set('bar', 'foo');

		equal(storageService.get('foo'), 'bar');
		equal(storageService.get('bar'), 'foo');

		let setPromiseResolved = false;
		Promise.all([set1Promise, set2Promise]).then(() => setPromiseResolved = true);

		await storageService.close();

		equal(setPromiseResolved, true);

		storageService = new NextStorageServiceImpl(join(storageDir, 'storage.db'), new NullLogService(), TestEnvironmentService);
		await storageService.init();

		equal(storageService.get('foo'), 'bar');
		equal(storageService.get('bar'), 'foo');

		await storageService.close();

		storageService = new NextStorageServiceImpl(join(storageDir, 'storage.db'), new NullLogService(), TestEnvironmentService);
		await storageService.init();

		const delete1Promise = storageService.delete('foo');
		const delete2Promise = storageService.delete('bar');

		ok(!storageService.get('foo'));
		ok(!storageService.get('bar'));

		let deletePromiseResolved = false;
		Promise.all([delete1Promise, delete2Promise]).then(() => deletePromiseResolved = true);

		await storageService.close();

		equal(deletePromiseResolved, true);

		storageService = new NextStorageServiceImpl(join(storageDir, 'storage.db'), new NullLogService(), TestEnvironmentService);
		await storageService.init();

		ok(!storageService.get('foo'));
		ok(!storageService.get('bar'));

		await storageService.close();
		await del(storageDir, tmpdir());
	});

	test('conflicting updates', async () => {
		const storageDir = uniqueStorageDir();
		await mkdirp(storageDir);

		let storageService = new NextStorageServiceImpl(join(storageDir, 'storage.db'), new NullLogService(), TestEnvironmentService);
		await storageService.init();

		const set1Promise = storageService.set('foo', 'bar1');
		const set2Promise = storageService.set('foo', 'bar2');
		const set3Promise = storageService.set('foo', 'bar3');

		equal(storageService.get('foo'), 'bar3');

		let setPromiseResolved = false;
		Promise.all([set1Promise, set2Promise, set3Promise]).then(() => setPromiseResolved = true);

		let changes = await onDidChangeStorage(storageService);
		equal(changes.size, 1);
		ok(changes.has('foo'));

		ok(setPromiseResolved);

		const set4Promise = storageService.set('bar', 'foo');
		const delete1Promise = storageService.delete('bar');

		ok(!storageService.get('bar'));

		let setAndDeletePromiseResolved = false;
		Promise.all([set4Promise, delete1Promise]).then(() => setAndDeletePromiseResolved = true);

		changes = await onDidChangeStorage(storageService);
		equal(changes.size, 1);
		ok(changes.has('bar'));

		ok(setAndDeletePromiseResolved);

		await storageService.close();
		await del(storageDir, tmpdir());
	});
});