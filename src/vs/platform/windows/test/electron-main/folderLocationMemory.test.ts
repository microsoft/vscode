/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { extUriBiasedIgnorePathCase } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FolderLocationMemory, validateStartupFolderLocation } from '../../electron-main/folderLocationMemory.js';

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

	test('case variants of the primary share one entry on case-insensitive paths', () => {
		const { memory, items } = create();
		const variant = URI.file('/Work/Repo');
		const sameEntry = extUriBiasedIgnorePathCase.getComparisonKey(primary) === extUriBiasedIgnorePathCase.getComparisonKey(variant);
		memory.set(primary, location);
		const restored = memory.get(variant);
		memory.set(variant, undefined);

		assert.deepStrictEqual([restored, memory.get(primary), Object.keys(items.get('folderLocations') as object).length], sameEntry ? [location, undefined, 0] : [undefined, location, 1]);
	});

	test('malformed entries are ignored', () => {
		const { memory } = create({ [extUriBiasedIgnorePathCase.getComparisonKey(primary)]: { uri: 1 } });

		assert.strictEqual(memory.get(primary), undefined);
	});

	test('the oldest entries age out', () => {
		const { memory } = create();
		for (let i = 0; i < 105; i++) {
			memory.set(URI.file(`/work/repo${i}`), location);
		}

		assert.deepStrictEqual([memory.get(URI.file('/work/repo0')), memory.get(URI.file('/work/repo104'))], [undefined, location]);
	});

	suite('validateStartupFolderLocation', () => {

		const existing = async (path: string) => path === '/work/repo.wt/feature';

		test('an existing local location is kept and remembered', async () => {
			const { memory } = create();
			memory.set(primary, location);

			assert.deepStrictEqual({ result: await validateStartupFolderLocation(primary, location, memory, existing), memory: memory.get(primary) }, { result: { folderLocation: location }, memory: location });
		});

		test('a missing location opens at the primary, is reported and forgotten', async () => {
			const { memory } = create();
			memory.set(primary, location);

			assert.deepStrictEqual({ result: await validateStartupFolderLocation(primary, location, memory, async () => false), memory: memory.get(primary) }, { result: { folderLocationMissing: { label: 'feature' } }, memory: undefined });
		});

		test('a remote location is not started at and is forgotten without a stat', async () => {
			const { memory } = create();
			memory.set(primary, location);
			let stats = 0;

			assert.deepStrictEqual(
				{ result: await validateStartupFolderLocation(primary, { ...location, uri: 'vscode-remote://host/work/repo.wt/feature' }, memory, async () => { stats++; return true; }), stats, memory: memory.get(primary) },
				{ result: { folderLocationMissing: { label: 'feature' } }, stats: 0, memory: undefined });
		});

		test('without a location nothing is validated or cleared', async () => {
			const { memory } = create();
			memory.set(primary, location);

			assert.deepStrictEqual({ result: await validateStartupFolderLocation(primary, undefined, memory, async () => false), memory: memory.get(primary) }, { result: {}, memory: location });
		});
	});
});
