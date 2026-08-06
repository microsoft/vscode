/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { getMediaResourceFallbackVersion, getMediaResourceVersion, getMediaResourceVersionFromStat } from '../mediaResourceVersion';

suite('mediaResourceVersion', () => {
	test('uses a stable version while the resource stat is unchanged', () => {
		const stat = { mtime: 123, size: 456 };

		assert.strictEqual(getMediaResourceVersion(stat, 'fallback'), getMediaResourceVersion(stat, 'fallback'));
	});

	test('changes the version when the resource stat changes', () => {
		assert.notStrictEqual(
			getMediaResourceVersion({ mtime: 123, size: 456 }, 'fallback'),
			getMediaResourceVersion({ mtime: 124, size: 456 }, 'fallback'),
		);
		assert.notStrictEqual(
			getMediaResourceVersion({ mtime: 123, size: 456 }, 'fallback'),
			getMediaResourceVersion({ mtime: 123, size: 457 }, 'fallback'),
		);
	});

	test('uses the provided fallback version when the resource stat is unavailable', () => {
		assert.strictEqual(getMediaResourceVersion(undefined, 'fallback-1'), 'fallback-1');
		assert.strictEqual(getMediaResourceVersion(undefined, 'fallback-2'), 'fallback-2');
	});

	test('creates a stable URL-safe fallback version from the resource identity', () => {
		const resource = 'file:///folder/image name.png?query=value#fragment';
		const fallbackVersion = getMediaResourceFallbackVersion(resource);

		assert.strictEqual(fallbackVersion, getMediaResourceFallbackVersion(resource));
		assert.notStrictEqual(fallbackVersion, getMediaResourceFallbackVersion('file:///folder/other image.png'));
		assert.match(fallbackVersion, /^resource-[a-z0-9]+$/);
	});

	test('resolves the version from a resource stat provider', async () => {
		let fallbackCalls = 0;
		const version = await getMediaResourceVersionFromStat(
			async () => ({ mtime: 123, size: 456 }),
			() => {
				fallbackCalls++;
				return 'fallback';
			},
			() => true,
		);

		assert.strictEqual(version, '123-456');
		assert.strictEqual(fallbackCalls, 0);
	});

	test('uses the fallback version when the stat provider fails with an expected error', async () => {
		const version = await getMediaResourceVersionFromStat(
			async () => { throw new Error('stat unavailable'); },
			() => 'fallback',
			() => true,
		);

		assert.strictEqual(version, 'fallback');
	});

	test('throws unexpected stat provider errors', async () => {
		const error = new Error('unexpected failure');

		await assert.rejects(
			getMediaResourceVersionFromStat(
				async () => { throw error; },
				() => 'fallback',
				() => false,
			),
			error,
		);
	});
});
