/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FolderLocationMemory } from '../../electron-main/folderLocationMemory.js';

suite('FolderLocationMemory', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function create(initial?: Record<string, unknown>) {
		const items = new Map<string, unknown>();
		if (initial) {
			items.set('folderLocations', initial);
		}
		const state = {
			getItem: <T>(key: string) => items.get(key) as T | undefined,
			setItem: (key: string, data: object | string | number | boolean | undefined | null) => { items.set(key, data); }
		};
		return { memory: new FolderLocationMemory(state), items };
	}

	const primary = URI.file('/work/repo');
	const location = { uri: 'file:///work/repo.wt/feature', label: 'feature', providerId: 'p' };

	test('a remembered location is returned for a fresh open of its primary only', () => {
		const { memory } = create();
		memory.set(primary, location);

		assert.deepStrictEqual([memory.get(primary), memory.get(URI.file('/work/repo.wt/feature')), memory.get(URI.file('/work/other'))], [location, undefined, undefined]);
	});

	test('returning to the primary clears the memory', () => {
		const { memory } = create();
		memory.set(primary, location);
		memory.set(primary, undefined);

		assert.strictEqual(memory.get(primary), undefined);
	});

	test('malformed entries are ignored', () => {
		const { memory } = create({ [primary.toString()]: { uri: 1 } });

		assert.strictEqual(memory.get(primary), undefined);
	});

	test('the oldest entries age out', () => {
		const { memory } = create();
		for (let i = 0; i < 105; i++) {
			memory.set(URI.file(`/work/repo${i}`), location);
		}

		assert.deepStrictEqual([memory.get(URI.file('/work/repo0')), memory.get(URI.file('/work/repo104'))], [undefined, location]);
	});
});
