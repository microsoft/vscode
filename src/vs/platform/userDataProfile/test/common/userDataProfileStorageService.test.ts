/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { InMemoryStorageDatabase, IStorageItemsChangeEvent, IUpdateRequest, Storage } from '../../../../base/parts/storage/common/storage.js';
import { AbstractUserDataProfileStorageService, IUserDataProfileStorageService } from '../../common/userDataProfileStorageService.js';
import { InMemoryStorageService, loadKeyTargets, StorageTarget, TARGET_KEY } from '../../../storage/common/storage.js';
import { IUserDataProfile, toUserDataProfile } from '../../common/userDataProfile.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

class TestStorageDatabase extends InMemoryStorageDatabase {

	private readonly _onDidChangeItemsExternal = new Emitter<IStorageItemsChangeEvent>();
	override readonly onDidChangeItemsExternal = this._onDidChangeItemsExternal.event;

	override async updateItems(request: IUpdateRequest): Promise<void> {
		await super.updateItems(request);
		if (request.insert || request.delete) {
			this._onDidChangeItemsExternal.fire({ changed: request.insert, deleted: request.delete });
		}
	}
}

export class TestUserDataProfileStorageService extends AbstractUserDataProfileStorageService implements IUserDataProfileStorageService {

	readonly onDidChange = Event.None;
	private databases = new Map<string, InMemoryStorageDatabase>();

	protected async createStorageDatabase(profile: IUserDataProfile): Promise<InMemoryStorageDatabase> {
		let database = this.databases.get(profile.id);
		if (!database) {
			this.databases.set(profile.id, database = new TestStorageDatabase());
		}
		return database;
	}

	setupStorageDatabase(profile: IUserDataProfile): Promise<InMemoryStorageDatabase> {
		return this.createStorageDatabase(profile);
	}

}

suite('ProfileStorageService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const profile = toUserDataProfile('test', 'test', URI.file('foo'), URI.file('cache'));
	let testObject: TestUserDataProfileStorageService;
	let storage: Storage;

	setup(async () => {
		testObject = disposables.add(new TestUserDataProfileStorageService(false, disposables.add(new InMemoryStorageService())));
		storage = disposables.add(new Storage(await testObject.setupStorageDatabase(profile)));
		await storage.init();
	});


	test('read empty storage', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const actual = await testObject.readStorageData(profile);

		assert.strictEqual(actual.size, 0);
	}));

	test('read storage with data', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		storage.set('foo', 'bar');
		storage.set(TARGET_KEY, JSON.stringify({ foo: StorageTarget.USER }));
		await storage.flush();

		const actual = await testObject.readStorageData(profile);

		assert.strictEqual(actual.size, 1);
		assert.deepStrictEqual(actual.get('foo'), { 'value': 'bar', 'target': StorageTarget.USER });
	}));

	test('write in empty storage', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const data = new Map<string, string>();
		data.set('foo', 'bar');
		await testObject.updateStorageData(profile, data, StorageTarget.USER);

		assert.strictEqual(storage.items.size, 2);
		assert.deepStrictEqual(loadKeyTargets(storage), { foo: StorageTarget.USER });
		assert.strictEqual(storage.get('foo'), 'bar');
	}));

	test('write in storage with data', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		storage.set('foo', 'bar');
		storage.set(TARGET_KEY, JSON.stringify({ foo: StorageTarget.USER }));
		await storage.flush();

		const data = new Map<string, string>();
		data.set('abc', 'xyz');
		await testObject.updateStorageData(profile, data, StorageTarget.MACHINE);

		assert.strictEqual(storage.items.size, 3);
		assert.deepStrictEqual(loadKeyTargets(storage), { foo: StorageTarget.USER, abc: StorageTarget.MACHINE });
		assert.strictEqual(storage.get('foo'), 'bar');
		assert.strictEqual(storage.get('abc'), 'xyz');
	}));

	test('write in storage with data (insert, update, remove)', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		storage.set('foo', 'bar');
		storage.set('abc', 'xyz');
		storage.set(TARGET_KEY, JSON.stringify({ foo: StorageTarget.USER, abc: StorageTarget.MACHINE }));
		await storage.flush();

		const data = new Map<string, string | undefined>();
		data.set('foo', undefined);
		data.set('abc', 'def');
		data.set('var', 'const');
		await testObject.updateStorageData(profile, data, StorageTarget.USER);

		assert.strictEqual(storage.items.size, 3);
		assert.deepStrictEqual(loadKeyTargets(storage), { abc: StorageTarget.USER, var: StorageTarget.USER });
		assert.strictEqual(storage.get('abc'), 'def');
		assert.strictEqual(storage.get('var'), 'const');
	}));

});
