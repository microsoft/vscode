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
			{ identifier: { id: 'a', uuid: 'a' }, enabled: true },
			{ identifier: { id: 'b', uuid: 'b' }, enabled: true },
			{ identifier: { id: 'c', uuid: 'c' }, enabled: true },
		];

		const actual = merge(localExtensions, null, null, [], []);

		assert.deepEqual(actual.added, []);
		assert.deepEqual(actual.removed, []);
		assert.deepEqual(actual.updated, []);
		assert.deepEqual(actual.remote, localExtensions);
	});

	test('merge returns local extension if remote does not exist with ignored extensions', async () => {
		const localExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' }, enabled: true },
			{ identifier: { id: 'b', uuid: 'b' }, enabled: true },
			{ identifier: { id: 'c', uuid: 'c' }, enabled: true },
		];
		const expected: ISyncExtension[] = [
			{ identifier: { id: 'b', uuid: 'b' }, enabled: true },
			{ identifier: { id: 'c', uuid: 'c' }, enabled: true },
		];

		const actual = merge(localExtensions, null, null, [], ['a']);

		assert.deepEqual(actual.added, []);
		assert.deepEqual(actual.removed, []);
		assert.deepEqual(actual.updated, []);
		assert.deepEqual(actual.remote, expected);
	});

	test('merge returns local extension if remote does not exist with ignored extensions (ignore case)', async () => {
		const localExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' }, enabled: true },
			{ identifier: { id: 'b', uuid: 'b' }, enabled: true },
			{ identifier: { id: 'c', uuid: 'c' }, enabled: true },
		];
		const expected: ISyncExtension[] = [
			{ identifier: { id: 'b', uuid: 'b' }, enabled: true },
			{ identifier: { id: 'c', uuid: 'c' }, enabled: true },
		];

		const actual = merge(localExtensions, null, null, [], ['A']);

		assert.deepEqual(actual.added, []);
		assert.deepEqual(actual.removed, []);
		assert.deepEqual(actual.updated, []);
		assert.deepEqual(actual.remote, expected);
	});

	test('merge local and remote extensions when there is no base', async () => {
		const localExtensions: ISyncExtension[] = [
			{ identifier: { id: 'a', uuid: 'a' }, enabled: true },
			{ identifier: { id: 'd', uuid: 'd' }, enabled: true },
		];
		const remoteExtensions: ISyncExtension[] = [
			{ identifier: { id: 'b', uuid: 'b' }, enabled: true },
			{ identifier: { id: 'c', uuid: 'c' }, enabled: true },
		];
		const expected: ISyncExtension[] = [
			{ identifier: { id: 'b', uuid: 'b' }, enabled: true },
			{ identifier: { id: 'c', uuid: 'c' }, enabled: true },
			{ identifier: { id: 'a', uuid: 'a' }, enabled: true },
			{ identifier: { id: 'd', uuid: 'd' }, enabled: true },
		];

		const actual = merge(localExtensions, remoteExtensions, null, [], ['A']);

		assert.deepEqual(actual.added, [{ identifier: { id: 'b', uuid: 'b' }, enabled: true }, { identifier: { id: 'c', uuid: 'c' }, enabled: true }]);
		assert.deepEqual(actual.removed, []);
		assert.deepEqual(actual.updated, []);
		assert.deepEqual(actual.remote, expected);
	});


});
