/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../base/common/path.js';
import { extUriBiasedIgnorePathCase } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FolderLocationExistence, FolderLocationMemory, statFolderLocation, validateStartupFolderLocation } from '../../electron-main/folderLocationMemory.js';

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

		const existing = async (path: string): Promise<FolderLocationExistence> => path === '/work/repo.wt/feature' ? 'exists' : 'missing';

		test('an existing local location is kept and remembered', async () => {
			const { memory } = create();
			memory.set(primary, location);

			assert.deepStrictEqual({ result: await validateStartupFolderLocation(primary, location, memory, existing), memory: memory.get(primary) }, { result: { folderLocation: location }, memory: location });
		});

		test('a missing location opens at the primary, is reported and forgotten', async () => {
			const { memory } = create();
			memory.set(primary, location);

			assert.deepStrictEqual({ result: await validateStartupFolderLocation(primary, location, memory, async () => 'missing'), memory: memory.get(primary) }, { result: { folderLocationMissing: { label: 'feature' } }, memory: undefined });
		});

		test('a remote location is not started at and is forgotten without a stat', async () => {
			const { memory } = create();
			memory.set(primary, location);
			let stats = 0;

			assert.deepStrictEqual(
				{ result: await validateStartupFolderLocation(primary, { ...location, uri: 'vscode-remote://host/work/repo.wt/feature' }, memory, async () => { stats++; return 'exists'; }), stats, memory: memory.get(primary) },
				{ result: { folderLocationMissing: { label: 'feature' } }, stats: 0, memory: undefined });
		});

		test('a location that cannot be determined is kept, remembered and not reported', async () => {
			const { memory } = create();
			memory.set(primary, location);

			assert.deepStrictEqual({ result: await validateStartupFolderLocation(primary, location, memory, async () => 'unknown'), memory: memory.get(primary) }, { result: { folderLocation: location }, memory: location });
		});

		test('without a location nothing is validated or cleared', async () => {
			const { memory } = create();
			memory.set(primary, location);

			assert.deepStrictEqual({ result: await validateStartupFolderLocation(primary, undefined, memory, async () => 'missing'), memory: memory.get(primary) }, { result: {}, memory: location });
		});
	});

	suite('statFolderLocation', () => {

		test('a directory exists, a file or a missing path is missing, other failures are unknown', async () => {
			const root = fs.mkdtempSync(join(tmpdir(), 'folderLocation'));
			try {
				const file = join(root, 'file');
				fs.writeFileSync(file, '');
				const unknownErrors: unknown[] = [];

				assert.deepStrictEqual(
					[
						await statFolderLocation(root),
						await statFolderLocation(file),
						await statFolderLocation(join(root, 'missing')),
						await statFolderLocation(join(file, 'child')),
						await statFolderLocation(join(root, 'invalid\0path'), error => unknownErrors.push(error))
					],
					['exists', 'missing', 'missing', 'missing', 'unknown']);
				assert.strictEqual(unknownErrors.length, 1);
			} finally {
				fs.rmSync(root, { recursive: true });
			}
		});
	});
});
