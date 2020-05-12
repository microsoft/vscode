/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ISyncExtension } from 'vs/platform/userDataSync/common/userDataSync';
import { merge } from 'vs/platform/userDataSync/common/extensionsMerge';

suite('ExtensionsMerge - No Conflicts', () => {

	test('merge returns local extension if remote does not exist', async () => {
		const localExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' } },
			{ identifier: { id: 'b', uuid: 'b' } },
			{ identifier: { id: 'c', uuid: 'c' } },
		];

		const actual = merge(localExtensions, null, null, [], []);

		assert.deepEqual(actual.added, []);
		assert.deepEqual(actual.removed, []);
		assert.deepEqual(actual.updated, []);
		assert.deepEqual(actual.remote, localExtensions);
	});

	test('merge returns local extension if remote does not exist with ignored extensions', async () => {
		const localExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' } },
			{ identifier: { id: 'b', uuid: 'b' } },
			{ identifier: { id: 'c', uuid: 'c' } },
		];
		const expected: ISyncExtension[] = [
			{ identifier: { id: 'b', uuid: 'b' } },
			{ identifier: { id: 'c', uuid: 'c' } },
		];

		const actual = merge(localExtensions, null, null, [], ['a']);

		assert.deepEqual(actual.added, []);
		assert.deepEqual(actual.removed, []);
		assert.deepEqual(actual.updated, []);
		assert.deepEqual(actual.remote, expected);
	});

	test('merge returns local extension if remote does not exist with ignored extensions (ignore case)', async () => {
		const localExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' } },
			{ identifier: { id: 'b', uuid: 'b' } },
			{ identifier: { id: 'c', uuid: 'c' } },
		];
		const expected: ISyncExtension[] = [
			{ identifier: { id: 'b', uuid: 'b' } },
			{ identifier: { id: 'c', uuid: 'c' } },
		];

		const actual = merge(localExtensions, null, null, [], ['A']);

		assert.deepEqual(actual.added, []);
		assert.deepEqual(actual.removed, []);
		assert.deepEqual(actual.updated, []);
		assert.deepEqual(actual.remote, expected);
	});

	test('merge returns local extension if remote does not exist with skipped extensions', async () => {
		const localExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' } },
			{ identifier: { id: 'b', uuid: 'b' } },
			{ identifier: { id: 'c', uuid: 'c' } },
		];
		const skippedExtension: ISyncExtension[] = [
			{ identifier: { id: 'b', uuid: 'b' } },
		];
		const expected: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' } },
			{ identifier: { id: 'b', uuid: 'b' } },
			{ identifier: { id: 'c', uuid: 'c' } },
		];

		const actual = merge(localExtensions, null, null, skippedExtension, []);

		assert.deepEqual(actual.added, []);
		assert.deepEqual(actual.removed, []);
		assert.deepEqual(actual.updated, []);
		assert.deepEqual(actual.remote, expected);
	});

	test('merge returns local extension if remote does not exist with skipped and ignored extensions', async () => {
		const localExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' } },
			{ identifier: { id: 'b', uuid: 'b' } },
			{ identifier: { id: 'c', uuid: 'c' } },
		];
		const skippedExtension: ISyncExtension[] = [
			{ identifier: { id: 'b', uuid: 'b' } },
		];
		const expected: ISyncExtension[] = [
			{ identifier: { id: 'b', uuid: 'b' } },
			{ identifier: { id: 'c', uuid: 'c' } },
		];

		const actual = merge(localExtensions, null, null, skippedExtension, ['a']);

		assert.deepEqual(actual.added, []);
		assert.deepEqual(actual.removed, []);
		assert.deepEqual(actual.updated, []);
		assert.deepEqual(actual.remote, expected);
	});

	test('merge local and remote extensions when there is no base', async () => {
		const localExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' } },
			{ identifier: { id: 'd', uuid: 'd' } },
		];
		const remoteExtensions: ISyncExtension[] = [
			{ identifier: { id: 'b', uuid: 'b' } },
			{ identifier: { id: 'c', uuid: 'c' } },
		];
		const expected: ISyncExtension[] = [
			{ identifier: { id: 'b', uuid: 'b' } },
			{ identifier: { id: 'c', uuid: 'c' } },
			{ identifier: { id: 'a', uuid: 'a' } },
			{ identifier: { id: 'd', uuid: 'd' } },
		];

		const actual = merge(localExtensions, remoteExtensions, null, [], []);

		assert.deepEqual(actual.added, [{ identifier: { id: 'b', uuid: 'b' } }, { identifier: { id: 'c', uuid: 'c' } }]);
		assert.deepEqual(actual.removed, []);
		assert.deepEqual(actual.updated, []);
		assert.deepEqual(actual.remote, expected);
	});

	test('merge local and remote extensions when there is no base and with ignored extensions', async () => {
		const localExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' } },
			{ identifier: { id: 'd', uuid: 'd' } },
		];
		const remoteExtensions: ISyncExtension[] = [
			{ identifier: { id: 'b', uuid: 'b' } },
			{ identifier: { id: 'c', uuid: 'c' } },
		];
		const expected: ISyncExtension[] = [
			{ identifier: { id: 'b', uuid: 'b' } },
			{ identifier: { id: 'c', uuid: 'c' } },
			{ identifier: { id: 'd', uuid: 'd' } },
		];

		const actual = merge(localExtensions, remoteExtensions, null, [], ['a']);

		assert.deepEqual(actual.added, [{ identifier: { id: 'b', uuid: 'b' } }, { identifier: { id: 'c', uuid: 'c' } }]);
		assert.deepEqual(actual.removed, []);
		assert.deepEqual(actual.updated, []);
		assert.deepEqual(actual.remote, expected);
	});

	test('merge local and remote extensions when remote is moved forwarded', async () => {
		const baseExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' } },
			{ identifier: { id: 'd', uuid: 'd' } },
		];
		const localExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' } },
			{ identifier: { id: 'd', uuid: 'd' } },
		];
		const remoteExtensions: ISyncExtension[] = [
			{ identifier: { id: 'b', uuid: 'b' } },
			{ identifier: { id: 'c', uuid: 'c' } },
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], []);

		assert.deepEqual(actual.added, [{ identifier: { id: 'b', uuid: 'b' } }, { identifier: { id: 'c', uuid: 'c' } }]);
		assert.deepEqual(actual.removed, [{ id: 'a', uuid: 'a' }, { id: 'd', uuid: 'd' }]);
		assert.deepEqual(actual.updated, []);
		assert.equal(actual.remote, null);
	});

	test('merge local and remote extensions when remote is moved forwarded with disabled extension', async () => {
		const baseExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' } },
			{ identifier: { id: 'd', uuid: 'd' } },
		];
		const localExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' } },
			{ identifier: { id: 'd', uuid: 'd' } },
		];
		const remoteExtensions: ISyncExtension[] = [
			{ identifier: { id: 'b', uuid: 'b' } },
			{ identifier: { id: 'c', uuid: 'c' } },
			{ identifier: { id: 'd', uuid: 'd' }, disabled: true },
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], []);

		assert.deepEqual(actual.added, [{ identifier: { id: 'b', uuid: 'b' } }, { identifier: { id: 'c', uuid: 'c' } }]);
		assert.deepEqual(actual.removed, [{ id: 'a', uuid: 'a' }]);
		assert.deepEqual(actual.updated, [{ identifier: { id: 'd', uuid: 'd' }, disabled: true }]);
		assert.equal(actual.remote, null);
	});

	test('merge local and remote extensions when remote moved forwarded with ignored extensions', async () => {
		const baseExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' } },
			{ identifier: { id: 'd', uuid: 'd' } },
		];
		const localExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' } },
			{ identifier: { id: 'd', uuid: 'd' } },
		];
		const remoteExtensions: ISyncExtension[] = [
			{ identifier: { id: 'b', uuid: 'b' } },
			{ identifier: { id: 'c', uuid: 'c' } },
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], ['a']);

		assert.deepEqual(actual.added, [{ identifier: { id: 'b', uuid: 'b' } }, { identifier: { id: 'c', uuid: 'c' } }]);
		assert.deepEqual(actual.removed, [{ id: 'd', uuid: 'd' }]);
		assert.deepEqual(actual.updated, []);
		assert.equal(actual.remote, null);
	});

	test('merge local and remote extensions when remote is moved forwarded with skipped extensions', async () => {
		const baseExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' } },
			{ identifier: { id: 'd', uuid: 'd' } },
		];
		const localExtensions: ISyncExtension[] = [
			{ identifier: { id: 'd', uuid: 'd' } },
		];
		const skippedExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' } },
		];
		const remoteExtensions: ISyncExtension[] = [
			{ identifier: { id: 'b', uuid: 'b' } },
			{ identifier: { id: 'c', uuid: 'c' } },
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, skippedExtensions, []);

		assert.deepEqual(actual.added, [{ identifier: { id: 'b', uuid: 'b' } }, { identifier: { id: 'c', uuid: 'c' } }]);
		assert.deepEqual(actual.removed, [{ id: 'd', uuid: 'd' }]);
		assert.deepEqual(actual.updated, []);
		assert.equal(actual.remote, null);
	});

	test('merge local and remote extensions when remote is moved forwarded with skipped and ignored extensions', async () => {
		const baseExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' } },
			{ identifier: { id: 'd', uuid: 'd' } },
		];
		const localExtensions: ISyncExtension[] = [
			{ identifier: { id: 'd', uuid: 'd' } },
		];
		const skippedExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' } },
		];
		const remoteExtensions: ISyncExtension[] = [
			{ identifier: { id: 'b', uuid: 'b' } },
			{ identifier: { id: 'c', uuid: 'c' } },
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, skippedExtensions, ['b']);

		assert.deepEqual(actual.added, [{ identifier: { id: 'c', uuid: 'c' } }]);
		assert.deepEqual(actual.removed, [{ id: 'd', uuid: 'd' }]);
		assert.deepEqual(actual.updated, []);
		assert.equal(actual.remote, null);
	});

	test('merge local and remote extensions when local is moved forwarded', async () => {
		const baseExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' } },
			{ identifier: { id: 'd', uuid: 'd' } },
		];
		const localExtensions: ISyncExtension[] = [
			{ identifier: { id: 'b', uuid: 'b' } },
			{ identifier: { id: 'c', uuid: 'c' } },
		];
		const remoteExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' } },
			{ identifier: { id: 'd', uuid: 'd' } },
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], []);

		assert.deepEqual(actual.added, []);
		assert.deepEqual(actual.removed, []);
		assert.deepEqual(actual.updated, []);
		assert.deepEqual(actual.remote, localExtensions);
	});

	test('merge local and remote extensions when local is moved forwarded with disabled extensions', async () => {
		const baseExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' } },
			{ identifier: { id: 'd', uuid: 'd' } },
		];
		const localExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' }, disabled: true },
			{ identifier: { id: 'b', uuid: 'b' } },
			{ identifier: { id: 'c', uuid: 'c' } },
		];
		const remoteExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' } },
			{ identifier: { id: 'd', uuid: 'd' } },
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], []);

		assert.deepEqual(actual.added, []);
		assert.deepEqual(actual.removed, []);
		assert.deepEqual(actual.updated, []);
		assert.deepEqual(actual.remote, localExtensions);
	});

	test('merge local and remote extensions when local is moved forwarded with ignored settings', async () => {
		const baseExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' } },
			{ identifier: { id: 'd', uuid: 'd' } },
		];
		const localExtensions: ISyncExtension[] = [
			{ identifier: { id: 'b', uuid: 'b' } },
			{ identifier: { id: 'c', uuid: 'c' } },
		];
		const remoteExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' } },
			{ identifier: { id: 'd', uuid: 'd' } },
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], ['b']);

		assert.deepEqual(actual.added, []);
		assert.deepEqual(actual.removed, []);
		assert.deepEqual(actual.updated, []);
		assert.deepEqual(actual.remote, [
			{ identifier: { id: 'c', uuid: 'c' } },
		]);
	});

	test('merge local and remote extensions when local is moved forwarded with skipped extensions', async () => {
		const baseExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' } },
			{ identifier: { id: 'd', uuid: 'd' } },
		];
		const skippedExtensions: ISyncExtension[] = [
			{ identifier: { id: 'd', uuid: 'd' } },
		];
		const localExtensions: ISyncExtension[] = [
			{ identifier: { id: 'b', uuid: 'b' } },
			{ identifier: { id: 'c', uuid: 'c' } },
		];
		const remoteExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' } },
			{ identifier: { id: 'd', uuid: 'd' } },
		];
		const expected: ISyncExtension[] = [
			{ identifier: { id: 'd', uuid: 'd' } },
			{ identifier: { id: 'b', uuid: 'b' } },
			{ identifier: { id: 'c', uuid: 'c' } },
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, skippedExtensions, []);

		assert.deepEqual(actual.added, []);
		assert.deepEqual(actual.removed, []);
		assert.deepEqual(actual.updated, []);
		assert.deepEqual(actual.remote, expected);
	});

	test('merge local and remote extensions when local is moved forwarded with skipped and ignored extensions', async () => {
		const baseExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' } },
			{ identifier: { id: 'd', uuid: 'd' } },
		];
		const skippedExtensions: ISyncExtension[] = [
			{ identifier: { id: 'd', uuid: 'd' } },
		];
		const localExtensions: ISyncExtension[] = [
			{ identifier: { id: 'b', uuid: 'b' } },
			{ identifier: { id: 'c', uuid: 'c' } },
		];
		const remoteExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' } },
			{ identifier: { id: 'd', uuid: 'd' } },
		];
		const expected: ISyncExtension[] = [
			{ identifier: { id: 'd', uuid: 'd' } },
			{ identifier: { id: 'b', uuid: 'b' } },
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, skippedExtensions, ['c']);

		assert.deepEqual(actual.added, []);
		assert.deepEqual(actual.removed, []);
		assert.deepEqual(actual.updated, []);
		assert.deepEqual(actual.remote, expected);
	});

	test('merge local and remote extensions when both moved forwarded', async () => {
		const baseExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' } },
			{ identifier: { id: 'd', uuid: 'd' } },
		];
		const localExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' } },
			{ identifier: { id: 'b', uuid: 'b' } },
			{ identifier: { id: 'c', uuid: 'c' } },
		];
		const remoteExtensions: ISyncExtension[] = [
			{ identifier: { id: 'd', uuid: 'd' } },
			{ identifier: { id: 'b', uuid: 'b' } },
			{ identifier: { id: 'e', uuid: 'e' } },
		];
		const expected: ISyncExtension[] = [
			{ identifier: { id: 'b', uuid: 'b' } },
			{ identifier: { id: 'e', uuid: 'e' } },
			{ identifier: { id: 'c', uuid: 'c' } },
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], []);

		assert.deepEqual(actual.added, [{ identifier: { id: 'e', uuid: 'e' } }]);
		assert.deepEqual(actual.removed, [{ id: 'a', uuid: 'a' }]);
		assert.deepEqual(actual.updated, []);
		assert.deepEqual(actual.remote, expected);
	});

	test('merge local and remote extensions when both moved forwarded with ignored extensions', async () => {
		const baseExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' } },
			{ identifier: { id: 'd', uuid: 'd' } },
		];
		const localExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' } },
			{ identifier: { id: 'b', uuid: 'b' } },
			{ identifier: { id: 'c', uuid: 'c' } },
		];
		const remoteExtensions: ISyncExtension[] = [
			{ identifier: { id: 'd', uuid: 'd' } },
			{ identifier: { id: 'b', uuid: 'b' } },
			{ identifier: { id: 'e', uuid: 'e' } },
		];
		const expected: ISyncExtension[] = [
			{ identifier: { id: 'b', uuid: 'b' } },
			{ identifier: { id: 'e', uuid: 'e' } },
			{ identifier: { id: 'c', uuid: 'c' } },
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], ['a', 'e']);

		assert.deepEqual(actual.added, []);
		assert.deepEqual(actual.removed, []);
		assert.deepEqual(actual.updated, []);
		assert.deepEqual(actual.remote, expected);
	});

	test('merge local and remote extensions when both moved forwarded with skipped extensions', async () => {
		const baseExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' } },
			{ identifier: { id: 'd', uuid: 'd' } },
		];
		const skippedExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' } },
		];
		const localExtensions: ISyncExtension[] = [
			{ identifier: { id: 'b', uuid: 'b' } },
			{ identifier: { id: 'c', uuid: 'c' } },
		];
		const remoteExtensions: ISyncExtension[] = [
			{ identifier: { id: 'd', uuid: 'd' } },
			{ identifier: { id: 'b', uuid: 'b' } },
			{ identifier: { id: 'e', uuid: 'e' } },
		];
		const expected: ISyncExtension[] = [
			{ identifier: { id: 'b', uuid: 'b' } },
			{ identifier: { id: 'e', uuid: 'e' } },
			{ identifier: { id: 'c', uuid: 'c' } },
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, skippedExtensions, []);

		assert.deepEqual(actual.added, [{ identifier: { id: 'e', uuid: 'e' } }]);
		assert.deepEqual(actual.removed, []);
		assert.deepEqual(actual.updated, []);
		assert.deepEqual(actual.remote, expected);
	});

	test('merge local and remote extensions when both moved forwarded with skipped and ignoredextensions', async () => {
		const baseExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' } },
			{ identifier: { id: 'd', uuid: 'd' } },
		];
		const skippedExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' } },
		];
		const localExtensions: ISyncExtension[] = [
			{ identifier: { id: 'b', uuid: 'b' } },
			{ identifier: { id: 'c', uuid: 'c' } },
		];
		const remoteExtensions: ISyncExtension[] = [
			{ identifier: { id: 'd', uuid: 'd' } },
			{ identifier: { id: 'b', uuid: 'b' } },
			{ identifier: { id: 'e', uuid: 'e' } },
		];
		const expected: ISyncExtension[] = [
			{ identifier: { id: 'b', uuid: 'b' } },
			{ identifier: { id: 'e', uuid: 'e' } },
			{ identifier: { id: 'c', uuid: 'c' } },
		];

		const actual = merge(localExtensions, remoteExtensions, baseExtensions, skippedExtensions, ['e']);

		assert.deepEqual(actual.added, []);
		assert.deepEqual(actual.removed, []);
		assert.deepEqual(actual.updated, []);
		assert.deepEqual(actual.remote, expected);
	});

	test('merge when remote extension has no uuid and different extension id case', async () => {
		const localExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' } },
			{ identifier: { id: 'b', uuid: 'b' } },
			{ identifier: { id: 'c', uuid: 'c' } },
		];
		const remoteExtensions: ISyncExtension[] = [
			{ identifier: { id: 'A' } },
			{ identifier: { id: 'd', uuid: 'd' } },
		];
		const expected: ISyncExtension[] = [
			{ identifier: { id: 'A', uuid: 'a' } },
			{ identifier: { id: 'd', uuid: 'd' } },
			{ identifier: { id: 'b', uuid: 'b' } },
			{ identifier: { id: 'c', uuid: 'c' } },
		];

		const actual = merge(localExtensions, remoteExtensions, null, [], []);

		assert.deepEqual(actual.added, [{ identifier: { id: 'd', uuid: 'd' } }]);
		assert.deepEqual(actual.removed, []);
		assert.deepEqual(actual.updated, []);
		assert.deepEqual(actual.remote, expected);
	});


});
