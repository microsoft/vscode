/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { merge } from 'vs/platform/userDataSync/common/extensionsMerge';
import { ILocalSyncExtension, ISyncExtension } from 'vs/platform/userDataSync/common/userDataSync';

suite('ExtensionsMerge', () => {

	test('merge returns local extension if remote does not exist', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
			aLocalSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			aLocalSyncExtension({ identifier: { id: 'c', uuid: 'c' } }),
		];

		const actual = merge(localExtensions, null, null, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote?.all, localExtensions);
	});

	test('merge returns local extension if remote does not exist with ignored extensions', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
			aLocalSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			aLocalSyncExtension({ identifier: { id: 'c', uuid: 'c' } }),
		];
		const expected = [
			localExtensions[1],
			localExtensions[2],
		];

		const actual = merge(localExtensions, null, null, [], ['a'], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote?.all, expected);
	});

	test('merge returns local extension if remote does not exist with ignored extensions (ignore case)', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
			aLocalSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			aLocalSyncExtension({ identifier: { id: 'c', uuid: 'c' } }),
		];
		const expected = [
			localExtensions[1],
			localExtensions[2],
		];

		const actual = merge(localExtensions, null, null, [], ['A'], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote?.all, expected);
	});

	test('merge returns local extension if remote does not exist with skipped extensions', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
			aLocalSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			aLocalSyncExtension({ identifier: { id: 'c', uuid: 'c' } }),
		];
		const skippedExtension = [
			aSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
		];
		const expected = [...localExtensions];

		const actual = merge(localExtensions, null, null, skippedExtension, [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote?.all, expected);
	});

	test('merge returns local extension if remote does not exist with skipped and ignored extensions', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
			aLocalSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			aLocalSyncExtension({ identifier: { id: 'c', uuid: 'c' } }),
		];
		const skippedExtension = [
			aSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
		];
		const expected = [localExtensions[1], localExtensions[2]];

		const actual = merge(localExtensions, null, null, skippedExtension, ['a'], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote?.all, expected);
	});

	test('merge local and remote extensions when there is no base', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
			aLocalSyncExtension({ identifier: { id: 'd', uuid: 'd' } }),
		];
		const remoteExtensions = [
			aSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			aSyncExtension({ identifier: { id: 'c', uuid: 'c' } }),
		];
		const expected = [
			anExpectedSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			anExpectedSyncExtension({ identifier: { id: 'c', uuid: 'c' } }),
			anExpectedSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
			anExpectedSyncExtension({ identifier: { id: 'd', uuid: 'd' } }),
		];

		const actual = merge(localExtensions, remoteExtensions, null, [], [], []);

		assert.deepStrictEqual(actual.local.added, [
			anExpectedSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			anExpectedSyncExtension({ identifier: { id: 'c', uuid: 'c' } }),
		]);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote?.all, expected);
	});

	test('merge local and remote extensions when there is no base and with ignored extensions', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
			aLocalSyncExtension({ identifier: { id: 'd', uuid: 'd' } }),
		];
		const remoteExtensions = [
			aSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			aSyncExtension({ identifier: { id: 'c', uuid: 'c' } }),
		];
		const expected = [
			anExpectedSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			anExpectedSyncExtension({ identifier: { id: 'c', uuid: 'c' } }),
			anExpectedSyncExtension({ identifier: { id: 'd', uuid: 'd' } }),
		];

		const actual = merge(localExtensions, remoteExtensions, null, [], ['a'], []);

		assert.deepStrictEqual(actual.local.added, [
			anExpectedSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			anExpectedSyncExtension({ identifier: { id: 'c', uuid: 'c' } }),
		]);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote?.all, expected);
	});

	test('merge local and remote extensions when remote is moved forwarded', () => {
		const baseExtensions = [
			aSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
			aSyncExtension({ identifier: { id: 'd', uuid: 'd' } }),
		];
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
			aLocalSyncExtension({ identifier: { id: 'd', uuid: 'd' } }),
		];
		const remoteExtensions = [
			aSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			aSyncExtension({ identifier: { id: 'c', uuid: 'c' } }),
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);

		assert.deepStrictEqual(actual.local.added, [
			anExpectedSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			anExpectedSyncExtension({ identifier: { id: 'c', uuid: 'c' } }),
		]);
		assert.deepStrictEqual(actual.local.removed, [{ id: 'a', uuid: 'a' }, { id: 'd', uuid: 'd' }]);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.strictEqual(actual.remote, null);
	});

	test('merge local and remote extensions when remote is moved forwarded with disabled extension', () => {
		const baseExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
			aRemoteSyncExtension({ identifier: { id: 'd', uuid: 'd' } }),
		];
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
			aLocalSyncExtension({ identifier: { id: 'd', uuid: 'd' } }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			aRemoteSyncExtension({ identifier: { id: 'c', uuid: 'c' } }),
			aRemoteSyncExtension({ identifier: { id: 'd', uuid: 'd' }, disabled: true }),
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);

		assert.deepStrictEqual(actual.local.added, [
			anExpectedSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			anExpectedSyncExtension({ identifier: { id: 'c', uuid: 'c' } }),
		]);
		assert.deepStrictEqual(actual.local.removed, [{ id: 'a', uuid: 'a' }]);
		assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: 'd', uuid: 'd' }, disabled: true })]);
		assert.strictEqual(actual.remote, null);
	});

	test('merge local and remote extensions when remote moved forwarded with ignored extensions', () => {
		const baseExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
			aRemoteSyncExtension({ identifier: { id: 'd', uuid: 'd' } }),
		];
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
			aLocalSyncExtension({ identifier: { id: 'd', uuid: 'd' } }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			aRemoteSyncExtension({ identifier: { id: 'c', uuid: 'c' } }),
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], ['a'], []);

		assert.deepStrictEqual(actual.local.added, [
			anExpectedSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			anExpectedSyncExtension({ identifier: { id: 'c', uuid: 'c' } }),
		]);
		assert.deepStrictEqual(actual.local.removed, [{ id: 'd', uuid: 'd' }]);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.strictEqual(actual.remote, null);
	});

	test('merge local and remote extensions when remote is moved forwarded with skipped extensions', () => {
		const baseExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
			aRemoteSyncExtension({ identifier: { id: 'd', uuid: 'd' } }),
		];
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'd', uuid: 'd' } }),
		];
		const skippedExtensions = [
			aSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			aRemoteSyncExtension({ identifier: { id: 'c', uuid: 'c' } }),
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, skippedExtensions, [], []);

		assert.deepStrictEqual(actual.local.added, [
			anExpectedSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			anExpectedSyncExtension({ identifier: { id: 'c', uuid: 'c' } }),
		]);
		assert.deepStrictEqual(actual.local.removed, [{ id: 'd', uuid: 'd' }]);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.strictEqual(actual.remote, null);
	});

	test('merge local and remote extensions when remote is moved forwarded with skipped and ignored extensions', () => {
		const baseExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
			aRemoteSyncExtension({ identifier: { id: 'd', uuid: 'd' } }),
		];
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'd', uuid: 'd' } }),
		];
		const skippedExtensions = [
			aSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			aRemoteSyncExtension({ identifier: { id: 'c', uuid: 'c' } }),
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, skippedExtensions, ['b'], []);

		assert.deepStrictEqual(actual.local.added, [anExpectedSyncExtension({ identifier: { id: 'c', uuid: 'c' } })]);
		assert.deepStrictEqual(actual.local.removed, [{ id: 'd', uuid: 'd' }]);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.strictEqual(actual.remote, null);
	});

	test('merge local and remote extensions when local is moved forwarded', () => {
		const baseExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
			aRemoteSyncExtension({ identifier: { id: 'd', uuid: 'd' } }),
		];
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			aLocalSyncExtension({ identifier: { id: 'c', uuid: 'c' } }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
			aRemoteSyncExtension({ identifier: { id: 'd', uuid: 'd' } }),
		];
		const expected = [
			anExpectedSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			anExpectedSyncExtension({ identifier: { id: 'c', uuid: 'c' } }),
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote?.all, expected);
	});

	test('merge local and remote extensions when local is moved forwarded with disabled extensions', () => {
		const baseExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
			aRemoteSyncExtension({ identifier: { id: 'd', uuid: 'd' } }),
		];
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' }, disabled: true }),
			aLocalSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			aLocalSyncExtension({ identifier: { id: 'c', uuid: 'c' } }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
			aRemoteSyncExtension({ identifier: { id: 'd', uuid: 'd' } }),
		];
		const expected = [
			anExpectedSyncExtension({ identifier: { id: 'a', uuid: 'a' }, disabled: true }),
			anExpectedSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			anExpectedSyncExtension({ identifier: { id: 'c', uuid: 'c' } }),
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote?.all, expected);
	});

	test('merge local and remote extensions when local is moved forwarded with ignored settings', () => {
		const baseExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
			aRemoteSyncExtension({ identifier: { id: 'd', uuid: 'd' } }),
		];
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			aLocalSyncExtension({ identifier: { id: 'c', uuid: 'c' } }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
			aRemoteSyncExtension({ identifier: { id: 'd', uuid: 'd' } }),
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], ['b'], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote?.all, [
			anExpectedSyncExtension({ identifier: { id: 'c', uuid: 'c' } }),
		]);
	});

	test('merge local and remote extensions when local is moved forwarded with skipped extensions', () => {
		const baseExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
			aRemoteSyncExtension({ identifier: { id: 'd', uuid: 'd' } }),
		];
		const skippedExtensions = [
			aSyncExtension({ identifier: { id: 'd', uuid: 'd' } }),
		];
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			aLocalSyncExtension({ identifier: { id: 'c', uuid: 'c' } }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
			aRemoteSyncExtension({ identifier: { id: 'd', uuid: 'd' } }),
		];
		const expected = [
			anExpectedSyncExtension({ identifier: { id: 'd', uuid: 'd' } }),
			anExpectedSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			anExpectedSyncExtension({ identifier: { id: 'c', uuid: 'c' } }),
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, skippedExtensions, [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote?.all, expected);
	});

	test('merge local and remote extensions when local is moved forwarded with skipped and ignored extensions', () => {
		const baseExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
			aRemoteSyncExtension({ identifier: { id: 'd', uuid: 'd' } }),
		];
		const skippedExtensions = [
			aSyncExtension({ identifier: { id: 'd', uuid: 'd' } }),
		];
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			aLocalSyncExtension({ identifier: { id: 'c', uuid: 'c' } }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
			aRemoteSyncExtension({ identifier: { id: 'd', uuid: 'd' } }),
		];
		const expected = [
			anExpectedSyncExtension({ identifier: { id: 'd', uuid: 'd' } }),
			anExpectedSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, skippedExtensions, ['c'], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote?.all, expected);
	});

	test('merge local and remote extensions when both moved forwarded', () => {
		const baseExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
			aRemoteSyncExtension({ identifier: { id: 'd', uuid: 'd' } }),
		];
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
			aLocalSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			aLocalSyncExtension({ identifier: { id: 'c', uuid: 'c' } }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'd', uuid: 'd' } }),
			aRemoteSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			aRemoteSyncExtension({ identifier: { id: 'e', uuid: 'e' } }),
		];
		const expected = [
			anExpectedSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			anExpectedSyncExtension({ identifier: { id: 'e', uuid: 'e' } }),
			anExpectedSyncExtension({ identifier: { id: 'c', uuid: 'c' } }),
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);

		assert.deepStrictEqual(actual.local.added, [anExpectedSyncExtension({ identifier: { id: 'e', uuid: 'e' } })]);
		assert.deepStrictEqual(actual.local.removed, [{ id: 'a', uuid: 'a' }]);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote?.all, expected);
	});

	test('merge local and remote extensions when both moved forwarded with ignored extensions', () => {
		const baseExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
			aRemoteSyncExtension({ identifier: { id: 'd', uuid: 'd' } }),
		];
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
			aLocalSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			aLocalSyncExtension({ identifier: { id: 'c', uuid: 'c' } }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'd', uuid: 'd' } }),
			aRemoteSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			aRemoteSyncExtension({ identifier: { id: 'e', uuid: 'e' } }),
		];
		const expected = [
			anExpectedSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			anExpectedSyncExtension({ identifier: { id: 'e', uuid: 'e' } }),
			anExpectedSyncExtension({ identifier: { id: 'c', uuid: 'c' } }),
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], ['a', 'e'], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote?.all, expected);
	});

	test('merge local and remote extensions when both moved forwarded with skipped extensions', () => {
		const baseExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
			aRemoteSyncExtension({ identifier: { id: 'd', uuid: 'd' } }),
		];
		const skippedExtensions = [
			aSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
		];
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			aLocalSyncExtension({ identifier: { id: 'c', uuid: 'c' } }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'd', uuid: 'd' } }),
			aRemoteSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			aRemoteSyncExtension({ identifier: { id: 'e', uuid: 'e' } }),
		];
		const expected = [
			anExpectedSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			anExpectedSyncExtension({ identifier: { id: 'e', uuid: 'e' } }),
			anExpectedSyncExtension({ identifier: { id: 'c', uuid: 'c' } }),
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, skippedExtensions, [], []);

		assert.deepStrictEqual(actual.local.added, [anExpectedSyncExtension({ identifier: { id: 'e', uuid: 'e' } })]);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote?.all, expected);
	});

	test('merge local and remote extensions when both moved forwarded with skipped and ignoredextensions', () => {
		const baseExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
			aRemoteSyncExtension({ identifier: { id: 'd', uuid: 'd' } }),
		];
		const skippedExtensions = [
			aSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
		];
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			aLocalSyncExtension({ identifier: { id: 'c', uuid: 'c' } }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'd', uuid: 'd' } }),
			aRemoteSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			aRemoteSyncExtension({ identifier: { id: 'e', uuid: 'e' } }),
		];
		const expected = [
			anExpectedSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			anExpectedSyncExtension({ identifier: { id: 'e', uuid: 'e' } }),
			anExpectedSyncExtension({ identifier: { id: 'c', uuid: 'c' } }),
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, skippedExtensions, ['e'], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote?.all, expected);
	});

	test('merge when remote extension has no uuid and different extension id case', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
			aLocalSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			aLocalSyncExtension({ identifier: { id: 'c', uuid: 'c' } }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'A' } }),
			aRemoteSyncExtension({ identifier: { id: 'd', uuid: 'd' } }),
		];
		const expected = [
			anExpectedSyncExtension({ identifier: { id: 'A', uuid: 'a' } }),
			anExpectedSyncExtension({ identifier: { id: 'd', uuid: 'd' } }),
			anExpectedSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			anExpectedSyncExtension({ identifier: { id: 'c', uuid: 'c' } }),
		];

		const actual = merge(localExtensions, remoteExtensions, null, [], [], []);

		assert.deepStrictEqual(actual.local.added, [anExpectedSyncExtension({ identifier: { id: 'd', uuid: 'd' } })]);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote?.all, expected);
	});

	test('merge when remote extension is not an installed extension', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
			aRemoteSyncExtension({ identifier: { id: 'b', uuid: 'b' }, installed: false }),
		];

		const actual = merge(localExtensions, remoteExtensions, null, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote, null);
	});

	test('merge when remote extension is not an installed extension but is an installed extension locally', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, installed: false }),
		];
		const expected = [
			anExpectedSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
		];

		const actual = merge(localExtensions, remoteExtensions, null, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote?.all, expected);
	});

	test('merge when an extension is not an installed extension remotely and does not exist locally', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' }, installed: false }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, installed: false }),
			aRemoteSyncExtension({ identifier: { id: 'b', uuid: 'b' }, installed: false }),
		];

		const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote, null);
	});

	test('merge when an extension is an installed extension remotely but not locally and updated locally', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' }, disabled: true }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
		];
		const expected = [
			anExpectedSyncExtension({ identifier: { id: 'a', uuid: 'a' }, disabled: true }),
		];

		const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote?.all, expected);
	});

	test('merge when an extension is an installed extension remotely but not locally and updated remotely', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, disabled: true }),
		];

		const actual = merge(localExtensions, remoteExtensions, localExtensions, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, [
			anExpectedSyncExtension({ identifier: { id: 'a', uuid: 'a' }, disabled: true }),
		]);
		assert.deepStrictEqual(actual.remote, null);
	});

	test('merge not installed extensions', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' }, installed: false }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'b', uuid: 'b' }, installed: false }),
		];
		const expected: ISyncExtension[] = [
			anExpectedBuiltinSyncExtension({ identifier: { id: 'b', uuid: 'b' } }),
			anExpectedBuiltinSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
		];

		const actual = merge(localExtensions, remoteExtensions, null, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote?.all, expected);
	});

	test('merge: remote extension with prerelease is added', () => {
		const localExtensions: ILocalSyncExtension[] = [];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, preRelease: true }),
		];

		const actual = merge(localExtensions, remoteExtensions, null, [], [], []);

		assert.deepStrictEqual(actual.local.added, [anExpectedSyncExtension({ identifier: { id: 'a', uuid: 'a' }, preRelease: true })]);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote, null);
	});

	test('merge: local extension with prerelease is added', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' }, preRelease: true }),
		];
		const remoteExtensions: ILocalSyncExtension[] = [];

		const actual = merge(localExtensions, remoteExtensions, null, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote?.all, [anExpectedSyncExtension({ identifier: { id: 'a', uuid: 'a' }, preRelease: true })]);
	});

	test('merge: remote extension with prerelease is added when local extension without prerelease is added', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, preRelease: true }),
		];

		const actual = merge(localExtensions, remoteExtensions, null, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: 'a', uuid: 'a' }, preRelease: true })]);
		assert.deepStrictEqual(actual.remote, null);
	});

	test('merge: remote extension without prerelease is added when local extension with prerelease is added', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' }, preRelease: true }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
		];

		const actual = merge(localExtensions, remoteExtensions, null, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: 'a', uuid: 'a' } })]);
		assert.deepStrictEqual(actual.remote, null);
	});

	test('merge: remote extension is changed to prerelease', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, preRelease: true }),
		];

		const actual = merge(localExtensions, remoteExtensions, localExtensions, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: 'a', uuid: 'a' }, preRelease: true })]);
		assert.deepStrictEqual(actual.remote, null);
	});

	test('merge: remote extension is changed to release', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' }, preRelease: true }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
		];

		const actual = merge(localExtensions, remoteExtensions, localExtensions, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: 'a', uuid: 'a' } })]);
		assert.deepStrictEqual(actual.remote, null);
	});

	test('merge: local extension is changed to prerelease', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' }, preRelease: true }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
		];

		const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote?.all, [anExpectedSyncExtension({ identifier: { id: 'a', uuid: 'a' }, preRelease: true })]);
	});

	test('merge: local extension is changed to release', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, preRelease: true }),
		];

		const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote?.all, [aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' } })]);
	});

	test('merge: local extension not an installed extension - remote preRelease property is taken precedence when there are no updates', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' }, installed: false }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, preRelease: true }),
		];

		const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote, null);
	});

	test('merge: local extension not an installed extension - remote preRelease property is taken precedence when there are updates locally', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' }, installed: false, disabled: true }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, preRelease: true }),
		];

		const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote?.all, [anExpectedSyncExtension({ identifier: { id: 'a', uuid: 'a' }, preRelease: true, disabled: true })]);
	});

	test('merge: local extension not an installed extension - remote preRelease property is taken precedence when there are updates remotely', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' }, installed: false }),
		];
		const baseExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, preRelease: true }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, preRelease: true, disabled: true }),
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: 'a', uuid: 'a' }, preRelease: true, disabled: true })]);
		assert.deepStrictEqual(actual.remote, null);
	});

	test('merge: local extension not an installed extension - remote version is taken precedence when there are no updates', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' }, installed: false }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, version: '1.1.0' }),
		];

		const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote, null);
	});

	test('merge: local extension not an installed extension - remote version is taken precedence when there are updates locally', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' }, installed: false, disabled: true }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, version: '1.1.0' }),
		];

		const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote?.all, [anExpectedSyncExtension({ identifier: { id: 'a', uuid: 'a' }, version: '1.1.0', disabled: true })]);
	});

	test('merge: local extension not an installed extension - remote version property is taken precedence when there are updates remotely', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' }, installed: false }),
		];
		const baseExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, version: '1.1.0' }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, version: '1.1.0', disabled: true }),
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: 'a', uuid: 'a' }, version: '1.1.0', disabled: true })]);
		assert.deepStrictEqual(actual.remote, null);
	});

	test('merge: base has builtin extension, local does not have extension, remote has extension installed', () => {
		const localExtensions: ILocalSyncExtension[] = [];
		const baseExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, version: '1.1.0', installed: false }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, version: '1.1.0' }),
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);

		assert.deepStrictEqual(actual.local.added, [anExpectedSyncExtension({ identifier: { id: 'a', uuid: 'a' }, version: '1.1.0' })]);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote, null);
	});

	test('merge: base has installed extension, local has installed extension, remote has extension builtin', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
		];
		const baseExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, installed: false }),
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, [{ id: 'a', uuid: 'a' }]);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote, null);
	});

	test('merge: base has installed extension, local has builtin extension, remote does not has extension', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' }, installed: false }),
		];
		const baseExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
		];
		const remoteExtensions: ILocalSyncExtension[] = [];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote?.all, [anExpectedBuiltinSyncExtension({ identifier: { id: 'a', uuid: 'a' } })]);
	});

	test('merge: base has builtin extension, local has installed extension, remote has builtin extension with updated state', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
		];
		const baseExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, installed: false }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, installed: false, state: { 'a': 1 } }),
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], [{ id: 'a', uuid: 'a' }]);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: 'a', uuid: 'a' }, state: { 'a': 1 } })]);
		assert.deepStrictEqual(actual.remote?.all, [anExpectedSyncExtension({ identifier: { id: 'a', uuid: 'a' }, state: { 'a': 1 } })]);
	});

	test('merge: base has installed extension, last time synced as builtin extension, local has installed extension, remote has builtin extension with updated state', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
		];
		const baseExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, installed: false, state: { 'a': 1 } }),
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], [{ id: 'a', uuid: 'a' }]);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: 'a', uuid: 'a' }, state: { 'a': 1 } })]);
		assert.deepStrictEqual(actual.remote?.all, [anExpectedSyncExtension({ identifier: { id: 'a', uuid: 'a' }, state: { 'a': 1 } })]);
	});

	test('merge: base has builtin extension, local does not have extension, remote has builtin extension', () => {
		const localExtensions: ILocalSyncExtension[] = [];
		const baseExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, version: '1.1.0', installed: false }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, version: '1.1.0', installed: false }),
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote, null);
	});

	test('merge: base has installed extension, last synced as builtin, local does not have extension, remote has installed extension', () => {
		const localExtensions: ILocalSyncExtension[] = [];
		const baseExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, version: '1.1.0' }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, version: '1.1.0' }),
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], [{ id: 'a', uuid: 'a' }]);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote, null);
	});

	test('merge: base has builtin extension, last synced as builtin, local does not have extension, remote has installed extension', () => {
		const localExtensions: ILocalSyncExtension[] = [];
		const baseExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, version: '1.1.0', installed: false }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, version: '1.1.0' }),
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], [{ id: 'a', uuid: 'a' }]);

		assert.deepStrictEqual(actual.local.added, [anExpectedSyncExtension({ identifier: { id: 'a', uuid: 'a' }, version: '1.1.0' })]);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote, null);
	});

	test('merge: remote extension with pinned is added', () => {
		const localExtensions: ILocalSyncExtension[] = [];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, pinned: true }),
		];

		const actual = merge(localExtensions, remoteExtensions, null, [], [], []);

		assert.deepStrictEqual(actual.local.added, [anExpectedSyncExtension({ identifier: { id: 'a', uuid: 'a' }, pinned: true })]);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote, null);
	});

	test('merge: local extension with pinned is added', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' }, pinned: true }),
		];
		const remoteExtensions: ILocalSyncExtension[] = [];

		const actual = merge(localExtensions, remoteExtensions, null, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote?.all, [anExpectedSyncExtension({ identifier: { id: 'a', uuid: 'a' }, pinned: true })]);
	});

	test('merge: remote extension with pinned is added when local extension without pinned is added', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, pinned: true }),
		];

		const actual = merge(localExtensions, remoteExtensions, null, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: 'a', uuid: 'a' }, pinned: true })]);
		assert.deepStrictEqual(actual.remote, null);
	});

	test('merge: remote extension without pinned is added when local extension with pinned is added', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' }, pinned: true }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
		];

		const actual = merge(localExtensions, remoteExtensions, null, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: 'a', uuid: 'a' } })]);
		assert.deepStrictEqual(actual.remote, null);
	});

	test('merge: remote extension is changed to pinned', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, pinned: true }),
		];

		const actual = merge(localExtensions, remoteExtensions, localExtensions, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: 'a', uuid: 'a' }, pinned: true })]);
		assert.deepStrictEqual(actual.remote, null);
	});

	test('merge: remote extension is changed to unpinned', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' }, pinned: true }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
		];

		const actual = merge(localExtensions, remoteExtensions, localExtensions, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: 'a', uuid: 'a' } })]);
		assert.deepStrictEqual(actual.remote, null);
	});

	test('merge: local extension is changed to pinned', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' }, pinned: true }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
		];

		const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote?.all, [anExpectedSyncExtension({ identifier: { id: 'a', uuid: 'a' }, pinned: true })]);
	});

	test('merge: local extension is changed to unpinned', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, pinned: true }),
		];

		const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote?.all, [aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' } })]);
	});

	test('merge: local extension not an installed extension - remote pinned property is taken precedence when there are no updates', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' }, installed: false }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, pinned: true }),
		];

		const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote, null);
	});

	test('merge: local extension not an installed extension - remote pinned property is taken precedence when there are updates locally', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' }, installed: false, disabled: true }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, pinned: true }),
		];

		const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote?.all, [anExpectedSyncExtension({ identifier: { id: 'a', uuid: 'a' }, pinned: true, disabled: true })]);
	});

	test('merge: local extension not an installed extension - remote pinned property is taken precedence when there are updates remotely', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' }, installed: false }),
		];
		const baseExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, pinned: true }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, pinned: true, disabled: true }),
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: 'a', uuid: 'a' }, pinned: true, disabled: true })]);
		assert.deepStrictEqual(actual.remote, null);
	});

	test('merge: local extension is changed to pinned and version changed', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' }, version: '0.0.1', pinned: true }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
		];

		const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote?.all, [anExpectedSyncExtension({ identifier: { id: 'a', uuid: 'a' }, version: '0.0.1', pinned: true })]);
	});

	test('merge: local extension is changed to unpinned and version changed', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, version: '0.0.1', pinned: true }),
		];

		const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote?.all, [anExpectedSyncExtension({ identifier: { id: 'a', uuid: 'a' } })]);
	});

	test('merge: remote extension is changed to pinned and version changed', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, version: '0.0.1', pinned: true }),
		];

		const actual = merge(localExtensions, remoteExtensions, localExtensions, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: 'a', uuid: 'a' }, version: '0.0.1', pinned: true })]);
		assert.deepStrictEqual(actual.remote, null);
	});

	test('merge: local extension is changed to pinned and version changed and remote extension is channged to pinned with different version', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' }, version: '0.0.1', pinned: true }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, version: '0.0.2', pinned: true }),
		];
		const baseExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: 'a', uuid: 'a' }, version: '0.0.2', pinned: true })]);
		assert.deepStrictEqual(actual.remote, null);
	});

	test('merge: remote extension is changed to unpinned and version changed', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' }, version: '0.0.1', pinned: true }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
		];

		const actual = merge(localExtensions, remoteExtensions, localExtensions, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: 'a', uuid: 'a' } })]);
		assert.deepStrictEqual(actual.remote, null);
	});

	test('merge: local extension is changed to unpinned and version changed and remote extension is channged to unpinned with different version', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' }, version: '0.0.1' }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, version: '0.0.2' }),
		];
		const baseExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, pinned: true }),
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote, null);
	});

	test('sync adding local application scoped extension', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' }, isApplicationScoped: true }),
		];

		const actual = merge(localExtensions, null, null, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote?.all, localExtensions);
	});

	test('sync merging local extension with isApplicationScoped property and remote does not has isApplicationScoped property', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' }, isApplicationScoped: false }),
		];

		const baseExtensions = [
			aSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
		];

		const actual = merge(localExtensions, baseExtensions, baseExtensions, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote?.all, [anExpectedSyncExtension({ identifier: { id: 'a', uuid: 'a' } })]);
	});

	test('sync merging when applicaiton scope is changed locally', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' }, isApplicationScoped: true }),
		];

		const baseExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, isApplicationScoped: false }),
		];

		const actual = merge(localExtensions, baseExtensions, baseExtensions, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote?.all, localExtensions);
	});

	test('sync merging when applicaiton scope is changed remotely', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' }, isApplicationScoped: false }),
		];

		const baseExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, isApplicationScoped: false }),
		];

		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' }, isApplicationScoped: true }),
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: 'a', uuid: 'a' }, isApplicationScoped: true })]);
		assert.deepStrictEqual(actual.remote, null);
	});

	test('merge does not remove remote extension when skipped extension has uuid but remote does not has', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
			aRemoteSyncExtension({ identifier: { id: 'b' } }),
		];

		const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [aRemoteSyncExtension({ identifier: { id: 'b', uuid: 'b' } })], [], []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote, null);
	});

	test('merge does not remove remote extension when last sync builtin extension has uuid but remote does not has', () => {
		const localExtensions = [
			aLocalSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
		];
		const remoteExtensions = [
			aRemoteSyncExtension({ identifier: { id: 'a', uuid: 'a' } }),
			aRemoteSyncExtension({ identifier: { id: 'b' } }),
		];

		const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], [{ id: 'b', uuid: 'b' }]);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote, null);
	});

	function anExpectedSyncExtension(extension: Partial<ISyncExtension>): ISyncExtension {
		return {
			identifier: { id: 'a', uuid: 'a' },
			version: '1.0.0',
			pinned: false,
			preRelease: false,
			installed: true,
			...extension
		};
	}

	function anExpectedBuiltinSyncExtension(extension: Partial<ISyncExtension>): ISyncExtension {
		return {
			identifier: { id: 'a', uuid: 'a' },
			version: '1.0.0',
			pinned: false,
			preRelease: false,
			...extension
		};
	}

	function aLocalSyncExtension(extension: Partial<ILocalSyncExtension>): ILocalSyncExtension {
		return {
			identifier: { id: 'a', uuid: 'a' },
			version: '1.0.0',
			pinned: false,
			preRelease: false,
			installed: true,
			...extension
		};
	}

	function aRemoteSyncExtension(extension: Partial<ILocalSyncExtension>): ILocalSyncExtension {
		return {
			identifier: { id: 'a', uuid: 'a' },
			version: '1.0.0',
			pinned: false,
			preRelease: false,
			installed: true,
			...extension
		};
	}

	function aSyncExtension(extension: Partial<ISyncExtension>): ISyncExtension {
		return {
			identifier: { id: 'a', uuid: 'a' },
			version: '1.0.0',
			installed: true,
			...extension
		};
	}

});
