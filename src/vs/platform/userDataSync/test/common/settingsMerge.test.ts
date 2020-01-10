/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { merge, computeRemoteContent } from 'vs/platform/userDataSync/common/settingsMerge';
import { IConflictSetting } from 'vs/platform/userDataSync/common/userDataSync';

const formattingOptions = { eol: '\n', insertSpaces: false, tabSize: 4 };

suite('SettingsMerge - No Conflicts', () => {

	test('merge when local and remote are same with one entry', async () => {
		const localContent = stringify({ 'a': 1 });
		const remoteContent = stringify({ 'a': 1 });
		const actual = merge(localContent, remoteContent, null, [], [], formattingOptions);
		assert.ok(!actual.hasChanges);
		assert.equal(actual.conflicts.length, 0);
		assert.equal(actual.mergeContent, localContent);
	});

	test('merge when local and remote are same with multiple entries', async () => {
		const localContent = stringify({
			'a': 1,
			'b': 2
		});
		const remoteContent = stringify({
			'a': 1,
			'b': 2
		});
		const actual = merge(localContent, remoteContent, null, [], [], formattingOptions);
		assert.ok(!actual.hasChanges);
		assert.equal(actual.conflicts.length, 0);
		assert.equal(actual.mergeContent, localContent);
	});

	test('merge when local and remote are same with multiple entries in different order', async () => {
		const localContent = stringify({
			'b': 2,
			'a': 1,
		});
		const remoteContent = stringify({
			'a': 1,
			'b': 2
		});
		const actual = merge(localContent, remoteContent, null, [], [], formattingOptions);
		assert.ok(!actual.hasChanges);
		assert.equal(actual.conflicts.length, 0);
		assert.equal(actual.mergeContent, localContent);
	});

	test('merge when local and remote are same with different base content', async () => {
		const localContent = stringify({
			'b': 2,
			'a': 1,
		});
		const baseContent = stringify({
			'a': 2,
			'b': 1
		});
		const remoteContent = stringify({
			'a': 1,
			'b': 2
		});
		const actual = merge(localContent, remoteContent, baseContent, [], [], formattingOptions);
		assert.ok(!actual.hasChanges);
		assert.equal(actual.conflicts.length, 0);
		assert.equal(actual.mergeContent, localContent);
	});

	test('merge when a new entry is added to remote', async () => {
		const localContent = stringify({
			'a': 1,
		});
		const remoteContent = stringify({
			'a': 1,
			'b': 2
		});
		const actual = merge(localContent, remoteContent, null, [], [], formattingOptions);
		assert.ok(actual.hasChanges);
		assert.equal(actual.conflicts.length, 0);
		assert.equal(actual.mergeContent, remoteContent);
	});

	test('merge when multiple new entries are added to remote', async () => {
		const localContent = stringify({
			'a': 1,
		});
		const remoteContent = stringify({
			'b': 2,
			'a': 1,
			'c': 3,
		});
		const expected = stringify({
			'a': 1,
			'b': 2,
			'c': 3,
		});
		const actual = merge(localContent, remoteContent, null, [], [], formattingOptions);
		assert.ok(actual.hasChanges);
		assert.equal(actual.conflicts.length, 0);
		assert.equal(actual.mergeContent, expected);
	});

	test('merge when multiple new entries are added to remote from base and local has not changed', async () => {
		const localContent = stringify({
			'a': 1,
		});
		const remoteContent = stringify({
			'b': 2,
			'a': 1,
			'c': 3,
		});
		const expected = stringify({
			'a': 1,
			'b': 2,
			'c': 3,
		});
		const actual = merge(localContent, remoteContent, localContent, [], [], formattingOptions);
		assert.ok(actual.hasChanges);
		assert.equal(actual.conflicts.length, 0);
		assert.equal(actual.mergeContent, expected);
	});

	test('merge when an entry is removed from remote from base and local has not changed', async () => {
		const localContent = stringify({
			'a': 1,
			'b': 2,
		});
		const remoteContent = stringify({
			'a': 1,
		});
		const actual = merge(localContent, remoteContent, localContent, [], [], formattingOptions);
		assert.ok(actual.hasChanges);
		assert.equal(actual.conflicts.length, 0);
		assert.equal(actual.mergeContent, remoteContent);
	});

	test('merge when all entries are removed from base and local has not changed', async () => {
		const localContent = stringify({
			'a': 1,
		});
		const remoteContent = stringify({});
		const actual = merge(localContent, remoteContent, localContent, [], [], formattingOptions);
		assert.ok(actual.hasChanges);
		assert.equal(actual.conflicts.length, 0);
		assert.deepEqual(JSON.parse(actual.mergeContent), {});
	});

	test('merge when an entry is updated in remote from base and local has not changed', async () => {
		const localContent = stringify({
			'a': 1,
		});
		const remoteContent = stringify({
			'a': 2
		});
		const actual = merge(localContent, remoteContent, localContent, [], [], formattingOptions);
		assert.ok(actual.hasChanges);
		assert.equal(actual.conflicts.length, 0);
		assert.equal(actual.mergeContent, remoteContent);
	});

	test('merge when remote has moved forwareded with multiple changes and local stays with base', async () => {
		const localContent = stringify({
			'a': 1,
		});
		const remoteContent = stringify({
			'a': 2,
			'b': 1,
			'c': 3,
			'd': 4,
		});
		const actual = merge(localContent, remoteContent, localContent, [], [], formattingOptions);
		assert.ok(actual.hasChanges);
		assert.equal(actual.conflicts.length, 0);
		assert.equal(actual.mergeContent, remoteContent);
	});

	test('merge when a new entries are added to local', async () => {
		const localContent = stringify({
			'a': 1,
			'b': 2,
			'c': 3,
			'd': 4,
		});
		const remoteContent = stringify({
			'a': 1,
		});
		const actual = merge(localContent, remoteContent, null, [], [], formattingOptions);
		assert.ok(actual.hasChanges);
		assert.equal(actual.conflicts.length, 0);
		assert.equal(actual.mergeContent, localContent);
	});

	test('merge when multiple new entries are added to local from base and remote is not changed', async () => {
		const localContent = stringify({
			'a': 2,
			'b': 1,
			'c': 3,
			'd': 4,
		});
		const remoteContent = stringify({
			'a': 1,
		});
		const actual = merge(localContent, remoteContent, remoteContent, [], [], formattingOptions);
		assert.ok(actual.hasChanges);
		assert.equal(actual.conflicts.length, 0);
		assert.equal(actual.mergeContent, localContent);
	});

	test('merge when an entry is removed from local from base and remote has not changed', async () => {
		const localContent = stringify({
			'a': 1,
			'c': 2
		});
		const remoteContent = stringify({
			'a': 2,
			'b': 1,
			'c': 3,
			'd': 4,
		});
		const actual = merge(localContent, remoteContent, remoteContent, [], [], formattingOptions);
		assert.ok(actual.hasChanges);
		assert.equal(actual.conflicts.length, 0);
		assert.equal(actual.mergeContent, localContent);
	});

	test('merge when an entry is updated in local from base and remote has not changed', async () => {
		const localContent = stringify({
			'a': 1,
			'c': 2
		});
		const remoteContent = stringify({
			'a': 2,
			'c': 2,
		});
		const actual = merge(localContent, remoteContent, remoteContent, [], [], formattingOptions);
		assert.ok(actual.hasChanges);
		assert.equal(actual.conflicts.length, 0);
		assert.equal(actual.mergeContent, localContent);
	});

	test('merge when local has moved forwarded with multiple changes and remote stays with base', async () => {
		const localContent = stringify({
			'a': 2,
			'b': 1,
			'c': 3,
			'd': 4,
		});
		const remoteContent = stringify({
			'a': 1,
		});
		const actual = merge(localContent, remoteContent, remoteContent, [], [], formattingOptions);
		assert.ok(actual.hasChanges);
		assert.equal(actual.conflicts.length, 0);
		assert.equal(actual.mergeContent, localContent);
	});

});

suite('SettingsMerge - Conflicts', () => {

	test('merge when local and remote with one entry but different value', async () => {
		const localContent = stringify({
			'a': 1
		});
		const remoteContent = stringify({
			'a': 2
		});
		const expectedConflicts: IConflictSetting[] = [{ key: 'a', localValue: 1, remoteValue: 2 }];
		const actual = merge(localContent, remoteContent, null, [], [], formattingOptions);
		assert.ok(actual.hasChanges);
		assert.deepEqual(actual.conflicts, expectedConflicts);
		assert.equal(actual.mergeContent,
			`{
<<<<<<< local
	"a": 1
=======
	"a": 2,
>>>>>>> remote
}`);
	});

	test('merge when the entry is removed in remote but updated in local and a new entry is added in remote', async () => {
		const baseContent = stringify({
			'a': 1
		});
		const localContent = stringify({
			'a': 2
		});
		const remoteContent = stringify({
			'b': 2
		});
		const expectedConflicts: IConflictSetting[] = [{ key: 'a', localValue: 2, remoteValue: undefined }];
		const actual = merge(localContent, remoteContent, baseContent, [], [], formattingOptions);
		assert.ok(actual.hasChanges);
		assert.deepEqual(actual.conflicts, expectedConflicts);
		assert.equal(actual.mergeContent,
			`{
<<<<<<< local
	"a": 2,
=======
>>>>>>> remote
	"b": 2
}`);
	});

	test('merge with single entry and local is empty', async () => {
		const baseContent = stringify({
			'a': 1
		});
		const localContent = stringify({});
		const remoteContent = stringify({
			'a': 2
		});
		const expectedConflicts: IConflictSetting[] = [{ key: 'a', localValue: undefined, remoteValue: 2 }];
		const actual = merge(localContent, remoteContent, baseContent, [], [], formattingOptions);
		assert.ok(actual.hasChanges);
		assert.deepEqual(actual.conflicts, expectedConflicts);
		assert.equal(actual.mergeContent,
			`{
<<<<<<< local
=======
	"a": 2,
>>>>>>> remote
}`);
	});

	test('merge when local and remote has moved forwareded with conflicts', async () => {
		const baseContent = stringify({
			'a': 1,
			'b': 2,
			'c': 3,
			'd': 4,
		});
		const localContent = stringify({
			'a': 2,
			'c': 3,
			'd': 5,
			'e': 4,
			'f': 1,
		});
		const remoteContent = stringify({
			'b': 3,
			'c': 3,
			'd': 6,
			'e': 5,
		});
		const expectedConflicts: IConflictSetting[] = [
			{ key: 'b', localValue: undefined, remoteValue: 3 },
			{ key: 'a', localValue: 2, remoteValue: undefined },
			{ key: 'e', localValue: 4, remoteValue: 5 },
			{ key: 'd', localValue: 5, remoteValue: 6 },
		];
		const actual = merge(localContent, remoteContent, baseContent, [], [], formattingOptions);
		assert.ok(actual.hasChanges);
		assert.deepEqual(actual.conflicts, expectedConflicts);
		assert.equal(actual.mergeContent,
			`{
<<<<<<< local
	"a": 2,
=======
>>>>>>> remote
	"c": 3,
<<<<<<< local
	"d": 5,
=======
	"d": 6,
>>>>>>> remote
<<<<<<< local
	"e": 4,
=======
	"e": 5,
>>>>>>> remote
	"f": 1
<<<<<<< local
=======
	"b": 3,
>>>>>>> remote
}`);
	});

	test('resolve when local and remote has moved forwareded with conflicts', async () => {
		const baseContent = stringify({
			'a': 1,
			'b': 2,
			'c': 3,
			'd': 4,
		});
		const localContent = stringify({
			'a': 2,
			'c': 3,
			'd': 5,
			'e': 4,
			'f': 1,
		});
		const remoteContent = stringify({
			'b': 3,
			'c': 3,
			'd': 6,
			'e': 5,
		});
		const expectedConflicts: IConflictSetting[] = [
			{ key: 'd', localValue: 5, remoteValue: 6 },
		];
		const actual = merge(localContent, remoteContent, baseContent, [], [{ key: 'a', value: 2 }, { key: 'b', value: undefined }, { key: 'e', value: 5 }], formattingOptions);
		assert.ok(actual.hasChanges);
		assert.deepEqual(actual.conflicts, expectedConflicts);
		assert.equal(actual.mergeContent,
			`{
	"a": 2,
	"c": 3,
<<<<<<< local
	"d": 5,
=======
	"d": 6,
>>>>>>> remote
	"e": 5,
	"f": 1
}`);
	});

});

suite('SettingsMerge - Ignored Settings', () => {

	test('ignored setting is not merged when changed in local and remote', async () => {
		const localContent = stringify({ 'a': 1 });
		const remoteContent = stringify({ 'a': 2 });
		const actual = merge(localContent, remoteContent, null, ['a'], [], formattingOptions);
		assert.ok(!actual.hasChanges);
		assert.equal(actual.conflicts.length, 0);
		assert.equal(actual.mergeContent, localContent);
	});

	test('ignored setting is not merged when changed in local and remote from base', async () => {
		const baseContent = stringify({ 'a': 0 });
		const localContent = stringify({ 'a': 1 });
		const remoteContent = stringify({ 'a': 2 });
		const actual = merge(localContent, remoteContent, baseContent, ['a'], [], formattingOptions);
		assert.ok(!actual.hasChanges);
		assert.equal(actual.conflicts.length, 0);
		assert.equal(actual.mergeContent, localContent);
	});

	test('ignored setting is not merged when added in remote', async () => {
		const localContent = stringify({});
		const remoteContent = stringify({ 'a': 1 });
		const actual = merge(localContent, remoteContent, null, ['a'], [], formattingOptions);
		assert.ok(!actual.hasChanges);
		assert.equal(actual.conflicts.length, 0);
		assert.equal(actual.mergeContent, localContent);
	});

	test('ignored setting is not merged when added in remote from base', async () => {
		const localContent = stringify({ 'b': 2 });
		const remoteContent = stringify({ 'a': 1, 'b': 2 });
		const actual = merge(localContent, remoteContent, localContent, ['a'], [], formattingOptions);
		assert.ok(!actual.hasChanges);
		assert.equal(actual.conflicts.length, 0);
		assert.equal(actual.mergeContent, localContent);
	});

	test('ignored setting is not merged when removed in remote', async () => {
		const localContent = stringify({ 'a': 1 });
		const remoteContent = stringify({});
		const actual = merge(localContent, remoteContent, null, ['a'], [], formattingOptions);
		assert.ok(!actual.hasChanges);
		assert.equal(actual.conflicts.length, 0);
		assert.equal(actual.mergeContent, localContent);
	});

	test('ignored setting is not merged when removed in remote from base', async () => {
		const localContent = stringify({ 'a': 2 });
		const remoteContent = stringify({});
		const actual = merge(localContent, remoteContent, localContent, ['a'], [], formattingOptions);
		assert.ok(!actual.hasChanges);
		assert.equal(actual.conflicts.length, 0);
		assert.equal(actual.mergeContent, localContent);
	});

	test('ignored setting is not merged with other changes without conflicts', async () => {
		const baseContent = stringify({
			'a': 2,
			'b': 2,
			'c': 3,
			'd': 4,
			'e': 5,
		});
		const localContent = stringify({
			'a': 1,
			'b': 2,
			'c': 3,
		});
		const remoteContent = stringify({
			'a': 3,
			'b': 3,
			'd': 4,
			'e': 6,
		});
		const expectedContent = stringify({
			'a': 1,
			'b': 3,
		});
		const actual = merge(localContent, remoteContent, baseContent, ['a', 'e'], [], formattingOptions);
		assert.ok(actual.hasChanges);
		assert.equal(actual.conflicts.length, 0);
		assert.equal(actual.mergeContent, expectedContent);
	});

	test('ignored setting is not merged with other changes conflicts', async () => {
		const baseContent = stringify({
			'a': 2,
			'b': 2,
			'c': 3,
			'd': 4,
			'e': 5,
		});
		const localContent = stringify({
			'a': 1,
			'b': 4,
			'c': 3,
			'd': 5,
		});
		const remoteContent = stringify({
			'a': 3,
			'b': 3,
			'e': 6,
		});
		const expectedConflicts: IConflictSetting[] = [
			{ key: 'd', localValue: 5, remoteValue: undefined },
			{ key: 'b', localValue: 4, remoteValue: 3 },
		];
		const actual = merge(localContent, remoteContent, baseContent, ['a', 'e'], [], formattingOptions);
		assert.ok(actual.hasChanges);
		assert.ok(actual.hasChanges);
		assert.deepEqual(actual.conflicts, expectedConflicts);
		assert.equal(actual.mergeContent,
			`{
	"a": 1,
<<<<<<< local
	"b": 4,
=======
	"b": 3,
>>>>>>> remote
<<<<<<< local
	"d": 5
=======
>>>>>>> remote
}`);
	});

});

suite('SettingsMerge - Compute Remote Content', () => {

	test('local content is returned when there are no ignored settings', async () => {
		const localContent = stringify({
			'a': 1,
			'b': 2,
			'c': 3,
		});
		const remoteContent = stringify({
			'a': 3,
			'b': 3,
			'd': 4,
			'e': 6,
		});
		const actual = computeRemoteContent(localContent, remoteContent, [], formattingOptions);
		assert.equal(actual, localContent);
	});

	test('ignored settings are not updated from remote content', async () => {
		const localContent = stringify({
			'a': 1,
			'b': 2,
			'c': 3,
		});
		const remoteContent = stringify({
			'a': 3,
			'b': 3,
			'd': 4,
			'e': 6,
		});
		const expected = stringify({
			'a': 3,
			'b': 2,
			'c': 3,
		});
		const actual = computeRemoteContent(localContent, remoteContent, ['a'], formattingOptions);
		assert.equal(actual, expected);
	});

});

function stringify(value: any): string {
	return JSON.stringify(value, null, '\t');
}
