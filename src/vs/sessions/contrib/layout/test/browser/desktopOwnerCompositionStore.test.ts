/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestStorageService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { DesktopOwnerCompositionStore } from '../../browser/desktop/desktopOwnerCompositionStore.js';

suite('DesktopOwnerCompositionStore', () => {
	const store = new DisposableStore();

	teardown(() => store.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	function createCompositionStore(): DesktopOwnerCompositionStore {
		const storageService = store.add(new TestStorageService());
		return new DesktopOwnerCompositionStore(storageService);
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

		// Guards against a same-ID remap momentarily deleting what it just set:
		// a naive `set(newKey, state); delete(oldKey)` would destroy the entry
		// whenever oldKey === newKey.
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
});
