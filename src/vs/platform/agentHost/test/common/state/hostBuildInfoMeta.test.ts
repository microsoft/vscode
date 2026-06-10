/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ROOT_META_HOST_BUILD_KEY, formatHostBuildInfo, readHostBuildInfo, withHostBuildInfo, type IHostBuildInfo } from '../../../common/state/sessionState.js';

suite('Host build info _meta helpers', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const full: IHostBuildInfo = { version: '1.96.0', commit: 'abc1234', date: '2024-01-02T03:04:05Z', quality: 'insider' };

	test('round-trips through withHostBuildInfo / readHostBuildInfo', () => {
		const meta = withHostBuildInfo(undefined, full);
		assert.deepStrictEqual(readHostBuildInfo(meta), full);
	});

	test('readHostBuildInfo rejects malformed payloads', () => {
		assert.strictEqual(readHostBuildInfo(undefined), undefined);
		assert.strictEqual(readHostBuildInfo({}), undefined);
		assert.strictEqual(readHostBuildInfo({ [ROOT_META_HOST_BUILD_KEY]: 'nope' }), undefined);
		assert.strictEqual(readHostBuildInfo({ [ROOT_META_HOST_BUILD_KEY]: [] }), undefined);
		// Missing required `version`.
		assert.strictEqual(readHostBuildInfo({ [ROOT_META_HOST_BUILD_KEY]: { commit: 'x' } }), undefined);
	});

	test('readHostBuildInfo drops fields with wrong types but keeps version', () => {
		const meta = { [ROOT_META_HOST_BUILD_KEY]: { version: '1.0.0', commit: 42, date: '2024', quality: true } };
		assert.deepStrictEqual(readHostBuildInfo(meta), { version: '1.0.0', date: '2024' });
	});

	test('withHostBuildInfo preserves other keys and removes on undefined', () => {
		const withOther = withHostBuildInfo({ other: 1 }, full);
		assert.strictEqual(withOther?.['other'], 1);
		const removed = withHostBuildInfo(withOther, undefined);
		assert.strictEqual(removed?.[ROOT_META_HOST_BUILD_KEY], undefined);
		assert.strictEqual(removed?.['other'], 1);
		// Removing the only key yields undefined.
		assert.strictEqual(withHostBuildInfo({ [ROOT_META_HOST_BUILD_KEY]: full }, undefined), undefined);
	});

	test('formatHostBuildInfo renders details and falls back to version', () => {
		assert.strictEqual(formatHostBuildInfo(full), '1.96.0 (commit abc1234, 2024-01-02T03:04:05Z, insider)');
		assert.strictEqual(formatHostBuildInfo({ version: '2.0.0' }), '2.0.0');
	});
});
