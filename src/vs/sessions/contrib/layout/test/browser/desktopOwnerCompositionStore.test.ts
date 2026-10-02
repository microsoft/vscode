/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { TestStorageService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { DesktopOwnerCompositionStore } from '../../browser/desktop/desktopOwnerCompositionStore.js';

suite('DesktopOwnerCompositionStore', () => {
	const store = new DisposableStore();

	teardown(() => store.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	class RecordingLogService extends NullLogService {
		readonly errors: unknown[] = [];
		override error(message: unknown): void {
			this.errors.push(message);
		}
	}

	function createCompositionStore(storageService: IStorageService = store.add(new TestStorageService()), logService = new RecordingLogService()): DesktopOwnerCompositionStore {
		return new DesktopOwnerCompositionStore(storageService, logService);
	}

	test('remembers and reloads a composition by owner key', () => {
		const composition = createCompositionStore();
		const owner = URI.parse('session:a');
		composition.set(owner, { editor: true, auxiliaryBar: false });

		assert.deepStrictEqual(composition.get(owner), { editor: true, auxiliaryBar: false });
		assert.strictEqual(composition.get(URI.parse('session:other')), undefined);
	});

	test('[R8] remap carries a composition from the old owner key to the new one', () => {
		const composition = createCompositionStore();
		const oldKey = URI.parse('session:draft');
		const newKey = URI.parse('session:committed');
		composition.set(oldKey, { editor: true, auxiliaryBar: true });

		composition.remap(oldKey, newKey);

		assert.deepStrictEqual(composition.get(newKey), { editor: true, auxiliaryBar: true });
		assert.strictEqual(composition.get(oldKey), undefined, 'the old key must no longer resolve once remapped');
	});

	test('remap is a no-op (not a data loss) when the old and new keys are identical', () => {
		const composition = createCompositionStore();
		const owner = URI.parse('session:same');
		composition.set(owner, { editor: false, auxiliaryBar: true });

		composition.remap(owner, owner);

		assert.deepStrictEqual(composition.get(owner), { editor: false, auxiliaryBar: true }, 'a same-ID remap must not lose the owner\'s composition');
	});

	test('forget drops only the requested owners', () => {
		const composition = createCompositionStore();
		const a = URI.parse('session:a');
		const b = URI.parse('session:b');
		composition.set(a, { editor: true, auxiliaryBar: false });
		composition.set(b, { editor: false, auxiliaryBar: true });

		composition.forget([a]);

		assert.strictEqual(composition.get(a), undefined);
		assert.deepStrictEqual(composition.get(b), { editor: false, auxiliaryBar: true });
	});

	test('persists and reloads a versioned schema, not a bare array', () => {
		const storageService = store.add(new TestStorageService());
		const composition = createCompositionStore(storageService);
		const owner = URI.parse('session:a');
		composition.set(owner, { editor: true, auxiliaryBar: false });
		composition.setPreHide(owner, { editor: false, auxiliaryBar: true });

		const rawCurrent = storageService.get('sessions.chatLayout.sidePaneComposition', StorageScope.WORKSPACE);
		const rawPreHide = storageService.get('sessions.chatLayout.sidePanePreHideComposition', StorageScope.WORKSPACE);
		assert.deepStrictEqual(JSON.parse(rawCurrent!), { version: 1, entries: [['session:a', { editor: true, auxiliaryBar: false }]] });
		assert.deepStrictEqual(JSON.parse(rawPreHide!), { version: 1, entries: [['session:a', { editor: false, auxiliaryBar: true }]] });

		const reloaded = createCompositionStore(storageService);
		assert.deepStrictEqual(reloaded.get(owner), { editor: true, auxiliaryBar: false });
		assert.deepStrictEqual(reloaded.getPreHide(owner), { editor: false, auxiliaryBar: true });
	});

	test('logs and discards an unsupported schema version instead of silently misreading it', () => {
		const storageService = store.add(new TestStorageService());
		storageService.store('sessions.chatLayout.sidePaneComposition', JSON.stringify({ version: 2, entries: [['session:a', { editor: true, auxiliaryBar: true }]] }), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		const logService = new RecordingLogService();

		const composition = createCompositionStore(storageService, logService);

		assert.strictEqual(composition.get(URI.parse('session:a')), undefined, 'an unsupported schema version must not be interpreted as valid data');
		assert.strictEqual(logService.errors.length, 1, 'an unsupported schema version must be reported, not silently swallowed');
		assert.strictEqual(storageService.get('sessions.chatLayout.sidePaneComposition', StorageScope.WORKSPACE), undefined, 'the unreadable entry must be cleared so it does not keep failing to load');
	});

	test('logs and discards a pre-versioned bare array instead of silently misreading it', () => {
		const storageService = store.add(new TestStorageService());
		storageService.store('sessions.chatLayout.sidePaneComposition', JSON.stringify([['session:a', { editor: true, auxiliaryBar: true }]]), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		const logService = new RecordingLogService();

		const composition = createCompositionStore(storageService, logService);

		assert.strictEqual(composition.get(URI.parse('session:a')), undefined, 'a pre-versioned bare array must not be interpreted as valid data');
		assert.strictEqual(logService.errors.length, 1, 'a pre-versioned bare array must be reported, not silently swallowed');
	});
});
