/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, throws } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { createObjectCollectionBuffer } from 'vs/editor/browser/view/gpu/objectCollectionBuffer';

suite('ObjectCollectionBuffer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('createEntry', () => {
		const buffer = store.add(createObjectCollectionBuffer([
			{ name: 'a' },
			{ name: 'b' },
		], 5));
		deepStrictEqual(Array.from(buffer.view), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

		store.add(buffer.createEntry({ a: 1, b: 2 }));
		store.add(buffer.createEntry({ a: 3, b: 4 }));
		store.add(buffer.createEntry({ a: 5, b: 6 }));
		store.add(buffer.createEntry({ a: 7, b: 8 }));
		store.add(buffer.createEntry({ a: 9, b: 10 }));
		deepStrictEqual(Array.from(buffer.view), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
	});

	test('createEntry beyond capacity', () => {
		const buffer = store.add(createObjectCollectionBuffer([
			{ name: 'a' },
			{ name: 'b' },
		], 1));
		store.add(buffer.createEntry({ a: 1, b: 2 }));
		throws(() => buffer.createEntry({ a: 3, b: 4 }));
	});

	test('dispose entry', () => {
		const buffer = store.add(createObjectCollectionBuffer([
			{ name: 'a' },
			{ name: 'b' },
		], 5));
		deepStrictEqual(Array.from(buffer.view), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

		store.add(buffer.createEntry({ a: 1, b: 2 }));
		const entry1 = buffer.createEntry({ a: 3, b: 4 });
		store.add(buffer.createEntry({ a: 5, b: 6 }));
		const entry2 = buffer.createEntry({ a: 7, b: 8 });
		store.add(buffer.createEntry({ a: 9, b: 10 }));
		entry1.dispose();
		entry2.dispose();
		deepStrictEqual(Array.from(buffer.view).slice(0, 6), [1, 2, 5, 6, 9, 10]);
	});
});
