/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { addSetting, merge, updateIgnoredSettings } from '../../common/settingsMerge.js';
const formattingOptions = { eol: '\n', insertSpaces: false, tabSize: 4 };
suite('SettingsMerge - Merge', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('merge when local and remote are same with one entry', async () => {
        const localContent = stringify({ 'a': 1 });
        const remoteContent = stringify({ 'a': 1 });
        const actual = merge(localContent, remoteContent, null, [], [], formattingOptions);
        assert.strictEqual(actual.localContent, null);
        assert.strictEqual(actual.remoteContent, null);
        assert.strictEqual(actual.conflictsSettings.length, 0);
        assert.ok(!actual.hasConflicts);
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
        assert.strictEqual(actual.localContent, null);
        assert.strictEqual(actual.remoteContent, null);
        assert.strictEqual(actual.conflictsSettings.length, 0);
        assert.ok(!actual.hasConflicts);
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
        assert.strictEqual(actual.localContent, localContent);
        assert.strictEqual(actual.remoteContent, remoteContent);
        assert.ok(actual.hasConflicts);
        assert.strictEqual(actual.conflictsSettings.length, 0);
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
        assert.strictEqual(actual.localContent, localContent);
        assert.strictEqual(actual.remoteContent, remoteContent);
        assert.strictEqual(actual.conflictsSettings.length, 0);
        assert.ok(actual.hasConflicts);
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
        assert.strictEqual(actual.localContent, remoteContent);
        assert.strictEqual(actual.remoteContent, null);
        assert.strictEqual(actual.conflictsSettings.length, 0);
        assert.ok(!actual.hasConflicts);
    });
    test('merge when multiple new entries are added to remote', async () => {
        const localContent = stringify({
            'a': 1,
        });
        const remoteContent = stringify({
            'a': 1,
            'b': 2,
            'c': 3,
        });
        const actual = merge(localContent, remoteContent, null, [], [], formattingOptions);
        assert.strictEqual(actual.localContent, remoteContent);
        assert.strictEqual(actual.remoteContent, null);
        assert.strictEqual(actual.conflictsSettings.length, 0);
        assert.ok(!actual.hasConflicts);
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
        const actual = merge(localContent, remoteContent, localContent, [], [], formattingOptions);
        assert.strictEqual(actual.localContent, remoteContent);
        assert.strictEqual(actual.remoteContent, null);
        assert.strictEqual(actual.conflictsSettings.length, 0);
        assert.ok(!actual.hasConflicts);
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
        assert.strictEqual(actual.localContent, remoteContent);
        assert.strictEqual(actual.remoteContent, null);
        assert.strictEqual(actual.conflictsSettings.length, 0);
        assert.ok(!actual.hasConflicts);
    });
    test('merge when all entries are removed from base and local has not changed', async () => {
        const localContent = stringify({
            'a': 1,
        });
        const remoteContent = stringify({});
        const actual = merge(localContent, remoteContent, localContent, [], [], formattingOptions);
        assert.strictEqual(actual.localContent, remoteContent);
        assert.strictEqual(actual.remoteContent, null);
        assert.strictEqual(actual.conflictsSettings.length, 0);
        assert.ok(!actual.hasConflicts);
    });
    test('merge when an entry is updated in remote from base and local has not changed', async () => {
        const localContent = stringify({
            'a': 1,
        });
        const remoteContent = stringify({
            'a': 2
        });
        const actual = merge(localContent, remoteContent, localContent, [], [], formattingOptions);
        assert.strictEqual(actual.localContent, remoteContent);
        assert.strictEqual(actual.remoteContent, null);
        assert.strictEqual(actual.conflictsSettings.length, 0);
        assert.ok(!actual.hasConflicts);
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
        assert.strictEqual(actual.localContent, remoteContent);
        assert.strictEqual(actual.remoteContent, null);
        assert.strictEqual(actual.conflictsSettings.length, 0);
        assert.ok(!actual.hasConflicts);
    });
    test('merge when remote has moved forwareded with order changes and local stays with base', async () => {
        const localContent = stringify({
            'a': 1,
            'b': 2,
            'c': 3,
        });
        const remoteContent = stringify({
            'a': 2,
            'd': 4,
            'c': 3,
            'b': 2,
        });
        const actual = merge(localContent, remoteContent, localContent, [], [], formattingOptions);
        assert.strictEqual(actual.localContent, remoteContent);
        assert.strictEqual(actual.remoteContent, null);
        assert.strictEqual(actual.conflictsSettings.length, 0);
        assert.ok(!actual.hasConflicts);
    });
    test('merge when remote has moved forwareded with comment changes and local stays with base', async () => {
        const localContent = `
{
	// this is comment for b
	"b": 2,
	// this is comment for c
	"c": 1,
}`;
        const remoteContent = stringify `
{
	// comment b has changed
	"b": 2,
	// this is comment for c
	"c": 1,
}`;
        const actual = merge(localContent, remoteContent, localContent, [], [], formattingOptions);
        assert.strictEqual(actual.localContent, remoteContent);
        assert.strictEqual(actual.remoteContent, null);
        assert.strictEqual(actual.conflictsSettings.length, 0);
        assert.ok(!actual.hasConflicts);
    });
    test('merge when remote has moved forwareded with comment and order changes and local stays with base', async () => {
        const localContent = `
{
	// this is comment for b
	"b": 2,
	// this is comment for c
	"c": 1,
}`;
        const remoteContent = stringify `
{
	// this is comment for c
	"c": 1,
	// comment b has changed
	"b": 2,
}`;
        const actual = merge(localContent, remoteContent, localContent, [], [], formattingOptions);
        assert.strictEqual(actual.localContent, remoteContent);
        assert.strictEqual(actual.remoteContent, null);
        assert.strictEqual(actual.conflictsSettings.length, 0);
        assert.ok(!actual.hasConflicts);
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
        assert.strictEqual(actual.localContent, null);
        assert.strictEqual(actual.remoteContent, localContent);
        assert.strictEqual(actual.conflictsSettings.length, 0);
        assert.ok(!actual.hasConflicts);
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
        assert.strictEqual(actual.localContent, null);
        assert.strictEqual(actual.remoteContent, localContent);
        assert.strictEqual(actual.conflictsSettings.length, 0);
        assert.ok(!actual.hasConflicts);
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
        assert.strictEqual(actual.localContent, null);
        assert.strictEqual(actual.remoteContent, localContent);
        assert.strictEqual(actual.conflictsSettings.length, 0);
        assert.ok(!actual.hasConflicts);
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
        assert.strictEqual(actual.localContent, null);
        assert.strictEqual(actual.remoteContent, localContent);
        assert.strictEqual(actual.conflictsSettings.length, 0);
        assert.ok(!actual.hasConflicts);
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
        assert.strictEqual(actual.localContent, null);
        assert.strictEqual(actual.remoteContent, localContent);
        assert.strictEqual(actual.conflictsSettings.length, 0);
        assert.ok(!actual.hasConflicts);
    });
    test('merge when local has moved forwarded with order changes and remote stays with base', async () => {
        const localContent = `
{
	"b": 2,
	"c": 1,
}`;
        const remoteContent = stringify `
{
	"c": 1,
	"b": 2,
}`;
        const actual = merge(localContent, remoteContent, remoteContent, [], [], formattingOptions);
        assert.strictEqual(actual.localContent, null);
        assert.strictEqual(actual.remoteContent, localContent);
        assert.strictEqual(actual.conflictsSettings.length, 0);
        assert.ok(!actual.hasConflicts);
    });
    test('merge when local has moved forwarded with comment changes and remote stays with base', async () => {
        const localContent = `
{
	// comment for b has changed
	"b": 2,
	// comment for c
	"c": 1,
}`;
        const remoteContent = stringify `
{
	// comment for b
	"b": 2,
	// comment for c
	"c": 1,
}`;
        const actual = merge(localContent, remoteContent, remoteContent, [], [], formattingOptions);
        assert.strictEqual(actual.localContent, null);
        assert.strictEqual(actual.remoteContent, localContent);
        assert.strictEqual(actual.conflictsSettings.length, 0);
        assert.ok(!actual.hasConflicts);
    });
    test('merge when local has moved forwarded with comment and order changes and remote stays with base', async () => {
        const localContent = `
{
	// comment for c
	"c": 1,
	// comment for b has changed
	"b": 2,
}`;
        const remoteContent = stringify `
{
	// comment for b
	"b": 2,
	// comment for c
	"c": 1,
}`;
        const actual = merge(localContent, remoteContent, remoteContent, [], [], formattingOptions);
        assert.strictEqual(actual.localContent, null);
        assert.strictEqual(actual.remoteContent, localContent);
        assert.strictEqual(actual.conflictsSettings.length, 0);
        assert.ok(!actual.hasConflicts);
    });
    test('merge when local and remote with one entry but different value', async () => {
        const localContent = stringify({
            'a': 1
        });
        const remoteContent = stringify({
            'a': 2
        });
        const expectedConflicts = [{ key: 'a', localValue: 1, remoteValue: 2 }];
        const actual = merge(localContent, remoteContent, null, [], [], formattingOptions);
        assert.strictEqual(actual.localContent, localContent);
        assert.strictEqual(actual.remoteContent, remoteContent);
        assert.ok(actual.hasConflicts);
        assert.deepStrictEqual(actual.conflictsSettings, expectedConflicts);
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
        const expectedConflicts = [{ key: 'a', localValue: 2, remoteValue: undefined }];
        const actual = merge(localContent, remoteContent, baseContent, [], [], formattingOptions);
        assert.strictEqual(actual.localContent, stringify({
            'a': 2,
            'b': 2
        }));
        assert.strictEqual(actual.remoteContent, remoteContent);
        assert.ok(actual.hasConflicts);
        assert.deepStrictEqual(actual.conflictsSettings, expectedConflicts);
    });
    test('merge with single entry and local is empty', async () => {
        const baseContent = stringify({
            'a': 1
        });
        const localContent = stringify({});
        const remoteContent = stringify({
            'a': 2
        });
        const expectedConflicts = [{ key: 'a', localValue: undefined, remoteValue: 2 }];
        const actual = merge(localContent, remoteContent, baseContent, [], [], formattingOptions);
        assert.strictEqual(actual.localContent, localContent);
        assert.strictEqual(actual.remoteContent, remoteContent);
        assert.ok(actual.hasConflicts);
        assert.deepStrictEqual(actual.conflictsSettings, expectedConflicts);
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
        const expectedConflicts = [
            { key: 'b', localValue: undefined, remoteValue: 3 },
            { key: 'a', localValue: 2, remoteValue: undefined },
            { key: 'd', localValue: 5, remoteValue: 6 },
            { key: 'e', localValue: 4, remoteValue: 5 },
        ];
        const actual = merge(localContent, remoteContent, baseContent, [], [], formattingOptions);
        assert.strictEqual(actual.localContent, stringify({
            'a': 2,
            'c': 3,
            'd': 5,
            'e': 4,
            'f': 1,
        }));
        assert.strictEqual(actual.remoteContent, stringify({
            'b': 3,
            'c': 3,
            'd': 6,
            'e': 5,
            'f': 1,
        }));
        assert.ok(actual.hasConflicts);
        assert.deepStrictEqual(actual.conflictsSettings, expectedConflicts);
    });
    test('merge when local and remote has moved forwareded with change in order', async () => {
        const baseContent = stringify({
            'a': 1,
            'b': 2,
            'c': 3,
            'd': 4,
        });
        const localContent = stringify({
            'a': 2,
            'c': 3,
            'b': 2,
            'd': 4,
            'e': 5,
        });
        const remoteContent = stringify({
            'a': 1,
            'b': 2,
            'c': 4,
        });
        const actual = merge(localContent, remoteContent, baseContent, [], [], formattingOptions);
        assert.strictEqual(actual.localContent, stringify({
            'a': 2,
            'c': 4,
            'b': 2,
            'e': 5,
        }));
        assert.strictEqual(actual.remoteContent, stringify({
            'a': 2,
            'b': 2,
            'e': 5,
            'c': 4,
        }));
        assert.ok(actual.hasConflicts);
        assert.deepStrictEqual(actual.conflictsSettings, []);
    });
    test('merge when local and remote has moved forwareded with comment changes', async () => {
        const baseContent = `
{
	// this is comment for b
	"b": 2,
	// this is comment for c
	"c": 1
}`;
        const localContent = `
{
	// comment b has changed in local
	"b": 2,
	// this is comment for c
	"c": 1
}`;
        const remoteContent = `
{
	// comment b has changed in remote
	"b": 2,
	// this is comment for c
	"c": 1
}`;
        const actual = merge(localContent, remoteContent, baseContent, [], [], formattingOptions);
        assert.strictEqual(actual.localContent, localContent);
        assert.strictEqual(actual.remoteContent, remoteContent);
        assert.ok(actual.hasConflicts);
        assert.deepStrictEqual(actual.conflictsSettings, []);
    });
    test('resolve when local and remote has moved forwareded with resolved conflicts', async () => {
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
        const expectedConflicts = [
            { key: 'd', localValue: 5, remoteValue: 6 },
        ];
        const actual = merge(localContent, remoteContent, baseContent, [], [{ key: 'a', value: 2 }, { key: 'b', value: undefined }, { key: 'e', value: 5 }], formattingOptions);
        assert.strictEqual(actual.localContent, stringify({
            'a': 2,
            'c': 3,
            'd': 5,
            'e': 5,
            'f': 1,
        }));
        assert.strictEqual(actual.remoteContent, stringify({
            'c': 3,
            'd': 6,
            'e': 5,
            'f': 1,
            'a': 2,
        }));
        assert.ok(actual.hasConflicts);
        assert.deepStrictEqual(actual.conflictsSettings, expectedConflicts);
    });
    test('ignored setting is not merged when changed in local and remote', async () => {
        const localContent = stringify({ 'a': 1 });
        const remoteContent = stringify({ 'a': 2 });
        const actual = merge(localContent, remoteContent, null, ['a'], [], formattingOptions);
        assert.strictEqual(actual.localContent, null);
        assert.strictEqual(actual.remoteContent, null);
        assert.strictEqual(actual.conflictsSettings.length, 0);
        assert.ok(!actual.hasConflicts);
    });
    test('ignored setting is not merged when changed in local and remote from base', async () => {
        const baseContent = stringify({ 'a': 0 });
        const localContent = stringify({ 'a': 1 });
        const remoteContent = stringify({ 'a': 2 });
        const actual = merge(localContent, remoteContent, baseContent, ['a'], [], formattingOptions);
        assert.strictEqual(actual.localContent, null);
        assert.strictEqual(actual.remoteContent, null);
        assert.strictEqual(actual.conflictsSettings.length, 0);
        assert.ok(!actual.hasConflicts);
    });
    test('ignored setting is not merged when added in remote', async () => {
        const localContent = stringify({});
        const remoteContent = stringify({ 'a': 1 });
        const actual = merge(localContent, remoteContent, null, ['a'], [], formattingOptions);
        assert.strictEqual(actual.localContent, null);
        assert.strictEqual(actual.remoteContent, null);
        assert.strictEqual(actual.conflictsSettings.length, 0);
        assert.ok(!actual.hasConflicts);
    });
    test('ignored setting is not merged when added in remote from base', async () => {
        const localContent = stringify({ 'b': 2 });
        const remoteContent = stringify({ 'a': 1, 'b': 2 });
        const actual = merge(localContent, remoteContent, localContent, ['a'], [], formattingOptions);
        assert.strictEqual(actual.localContent, null);
        assert.strictEqual(actual.remoteContent, null);
        assert.strictEqual(actual.conflictsSettings.length, 0);
        assert.ok(!actual.hasConflicts);
    });
    test('ignored setting is not merged when removed in remote', async () => {
        const localContent = stringify({ 'a': 1 });
        const remoteContent = stringify({});
        const actual = merge(localContent, remoteContent, null, ['a'], [], formattingOptions);
        assert.strictEqual(actual.localContent, null);
        assert.strictEqual(actual.remoteContent, null);
        assert.strictEqual(actual.conflictsSettings.length, 0);
        assert.ok(!actual.hasConflicts);
    });
    test('ignored setting is not merged when removed in remote from base', async () => {
        const localContent = stringify({ 'a': 2 });
        const remoteContent = stringify({});
        const actual = merge(localContent, remoteContent, localContent, ['a'], [], formattingOptions);
        assert.strictEqual(actual.localContent, null);
        assert.strictEqual(actual.remoteContent, null);
        assert.strictEqual(actual.conflictsSettings.length, 0);
        assert.ok(!actual.hasConflicts);
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
        const actual = merge(localContent, remoteContent, baseContent, ['a', 'e'], [], formattingOptions);
        assert.strictEqual(actual.localContent, stringify({
            'a': 1,
            'b': 3,
        }));
        assert.strictEqual(actual.remoteContent, stringify({
            'a': 3,
            'b': 3,
            'e': 6,
        }));
        assert.strictEqual(actual.conflictsSettings.length, 0);
        assert.ok(!actual.hasConflicts);
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
        const expectedConflicts = [
            { key: 'd', localValue: 5, remoteValue: undefined },
            { key: 'b', localValue: 4, remoteValue: 3 },
        ];
        const actual = merge(localContent, remoteContent, baseContent, ['a', 'e'], [], formattingOptions);
        assert.strictEqual(actual.localContent, stringify({
            'a': 1,
            'b': 4,
            'd': 5,
        }));
        assert.strictEqual(actual.remoteContent, stringify({
            'a': 3,
            'b': 3,
            'e': 6,
        }));
        assert.deepStrictEqual(actual.conflictsSettings, expectedConflicts);
        assert.ok(actual.hasConflicts);
    });
    test('merge when remote has comments and local is empty', async () => {
        const localContent = `
{

}`;
        const remoteContent = stringify `
{
	// this is a comment
	"a": 1,
}`;
        const actual = merge(localContent, remoteContent, null, [], [], formattingOptions);
        assert.strictEqual(actual.localContent, remoteContent);
        assert.strictEqual(actual.remoteContent, null);
        assert.strictEqual(actual.conflictsSettings.length, 0);
        assert.ok(!actual.hasConflicts);
    });
});
suite('SettingsMerge - Compute Remote Content', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
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
        const actual = updateIgnoredSettings(localContent, remoteContent, [], formattingOptions);
        assert.strictEqual(actual, localContent);
    });
    test('when target content is empty', async () => {
        const remoteContent = stringify({
            'a': 3,
        });
        const actual = updateIgnoredSettings('', remoteContent, ['a'], formattingOptions);
        assert.strictEqual(actual, '');
    });
    test('when source content is empty', async () => {
        const localContent = stringify({
            'a': 3,
            'b': 3,
        });
        const expected = stringify({
            'b': 3,
        });
        const actual = updateIgnoredSettings(localContent, '', ['a'], formattingOptions);
        assert.strictEqual(actual, expected);
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
        const actual = updateIgnoredSettings(localContent, remoteContent, ['a'], formattingOptions);
        assert.strictEqual(actual, expected);
    });
});
suite('SettingsMerge - Add Setting', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('Insert after a setting without comments', () => {
        const sourceContent = `
{
	"a": 1,
	"b": 2,
	"c": 3
}`;
        const targetContent = `
{
	"a": 2,
	"d": 3
}`;
        const expected = `
{
	"a": 2,
	"b": 2,
	"d": 3
}`;
        const actual = addSetting('b', sourceContent, targetContent, formattingOptions);
        assert.strictEqual(actual, expected);
    });
    test('Insert after a setting without comments at the end', () => {
        const sourceContent = `
{
	"a": 1,
	"b": 2,
	"c": 3
}`;
        const targetContent = `
{
	"a": 2
}`;
        const expected = `
{
	"a": 2,
	"b": 2
}`;
        const actual = addSetting('b', sourceContent, targetContent, formattingOptions);
        assert.strictEqual(actual, expected);
    });
    test('Insert between settings without comment', () => {
        const sourceContent = `
{
	"a": 1,
	"b": 2,
	"c": 3
}`;
        const targetContent = `
{
	"a": 1,
	"c": 3
}`;
        const expected = `
{
	"a": 1,
	"b": 2,
	"c": 3
}`;
        const actual = addSetting('b', sourceContent, targetContent, formattingOptions);
        assert.strictEqual(actual, expected);
    });
    test('Insert between settings and there is a comment in between in source', () => {
        const sourceContent = `
{
	"a": 1,
	// this is comment for b
	"b": 2,
	"c": 3
}`;
        const targetContent = `
{
	"a": 1,
	"c": 3
}`;
        const expected = `
{
	"a": 1,
	"b": 2,
	"c": 3
}`;
        const actual = addSetting('b', sourceContent, targetContent, formattingOptions);
        assert.strictEqual(actual, expected);
    });
    test('Insert after a setting and after a comment at the end', () => {
        const sourceContent = `
{
	"a": 1,
	// this is comment for b
	"b": 2
}`;
        const targetContent = `
{
	"a": 1
	// this is comment for b
}`;
        const expected = `
{
	"a": 1,
	// this is comment for b
	"b": 2
}`;
        const actual = addSetting('b', sourceContent, targetContent, formattingOptions);
        assert.strictEqual(actual, expected);
    });
    test('Insert after a setting ending with comma and after a comment at the end', () => {
        const sourceContent = `
{
	"a": 1,
	// this is comment for b
	"b": 2
}`;
        const targetContent = `
{
	"a": 1,
	// this is comment for b
}`;
        const expected = `
{
	"a": 1,
	// this is comment for b
	"b": 2
}`;
        const actual = addSetting('b', sourceContent, targetContent, formattingOptions);
        assert.strictEqual(actual, expected);
    });
    test('Insert after a comment and there are no settings', () => {
        const sourceContent = `
{
	// this is comment for b
	"b": 2
}`;
        const targetContent = `
{
	// this is comment for b
}`;
        const expected = `
{
	// this is comment for b
	"b": 2
}`;
        const actual = addSetting('b', sourceContent, targetContent, formattingOptions);
        assert.strictEqual(actual, expected);
    });
    test('Insert after a setting and between a comment and setting', () => {
        const sourceContent = `
{
	"a": 1,
	// this is comment for b
	"b": 2,
	"c": 3
}`;
        const targetContent = `
{
	"a": 1,
	// this is comment for b
	"c": 3
}`;
        const expected = `
{
	"a": 1,
	// this is comment for b
	"b": 2,
	"c": 3
}`;
        const actual = addSetting('b', sourceContent, targetContent, formattingOptions);
        assert.strictEqual(actual, expected);
    });
    test('Insert after a setting between two comments and there is a setting after', () => {
        const sourceContent = `
{
	"a": 1,
	// this is comment for b
	"b": 2,
	// this is comment for c
	"c": 3
}`;
        const targetContent = `
{
	"a": 1,
	// this is comment for b
	// this is comment for c
	"c": 3
}`;
        const expected = `
{
	"a": 1,
	// this is comment for b
	"b": 2,
	// this is comment for c
	"c": 3
}`;
        const actual = addSetting('b', sourceContent, targetContent, formattingOptions);
        assert.strictEqual(actual, expected);
    });
    test('Insert after a setting between two comments on the same line and there is a setting after', () => {
        const sourceContent = `
{
	"a": 1,
	/* this is comment for b */
	"b": 2,
	// this is comment for c
	"c": 3
}`;
        const targetContent = `
{
	"a": 1,
	/* this is comment for b */ // this is comment for c
	"c": 3
}`;
        const expected = `
{
	"a": 1,
	/* this is comment for b */
	"b": 2, // this is comment for c
	"c": 3
}`;
        const actual = addSetting('b', sourceContent, targetContent, formattingOptions);
        assert.strictEqual(actual, expected);
    });
    test('Insert after a setting between two line comments on the same line and there is a setting after', () => {
        const sourceContent = `
{
	"a": 1,
	/* this is comment for b */
	"b": 2,
	// this is comment for c
	"c": 3
}`;
        const targetContent = `
{
	"a": 1,
	// this is comment for b // this is comment for c
	"c": 3
}`;
        const expected = `
{
	"a": 1,
	// this is comment for b // this is comment for c
	"b": 2,
	"c": 3
}`;
        const actual = addSetting('b', sourceContent, targetContent, formattingOptions);
        assert.strictEqual(actual, expected);
    });
    test('Insert after a setting between two comments and there is no setting after', () => {
        const sourceContent = `
{
	"a": 1,
	// this is comment for b
	"b": 2
	// this is a comment
}`;
        const targetContent = `
{
	"a": 1
	// this is comment for b
	// this is a comment
}`;
        const expected = `
{
	"a": 1,
	// this is comment for b
	"b": 2
	// this is a comment
}`;
        const actual = addSetting('b', sourceContent, targetContent, formattingOptions);
        assert.strictEqual(actual, expected);
    });
    test('Insert after a setting with comma and between two comments and there is no setting after', () => {
        const sourceContent = `
{
	"a": 1,
	// this is comment for b
	"b": 2
	// this is a comment
}`;
        const targetContent = `
{
	"a": 1,
	// this is comment for b
	// this is a comment
}`;
        const expected = `
{
	"a": 1,
	// this is comment for b
	"b": 2
	// this is a comment
}`;
        const actual = addSetting('b', sourceContent, targetContent, formattingOptions);
        assert.strictEqual(actual, expected);
    });
    test('Insert before a setting without comments', () => {
        const sourceContent = `
{
	"a": 1,
	"b": 2,
	"c": 3
}`;
        const targetContent = `
{
	"d": 2,
	"c": 3
}`;
        const expected = `
{
	"d": 2,
	"b": 2,
	"c": 3
}`;
        const actual = addSetting('b', sourceContent, targetContent, formattingOptions);
        assert.strictEqual(actual, expected);
    });
    test('Insert before a setting without comments at the end', () => {
        const sourceContent = `
{
	"a": 1,
	"b": 2,
	"c": 3
}`;
        const targetContent = `
{
	"c": 3
}`;
        const expected = `
{
	"b": 2,
	"c": 3
}`;
        const actual = addSetting('b', sourceContent, targetContent, formattingOptions);
        assert.strictEqual(actual, expected);
    });
    test('Insert before a setting with comment', () => {
        const sourceContent = `
{
	"a": 1,
	"b": 2,
	// this is comment for c
	"c": 3
}`;
        const targetContent = `
{
	// this is comment for c
	"c": 3
}`;
        const expected = `
{
	"b": 2,
	// this is comment for c
	"c": 3
}`;
        const actual = addSetting('b', sourceContent, targetContent, formattingOptions);
        assert.strictEqual(actual, expected);
    });
    test('Insert before a setting and before a comment at the beginning', () => {
        const sourceContent = `
{
	// this is comment for b
	"b": 2,
	"c": 3,
}`;
        const targetContent = `
{
	// this is comment for b
	"c": 3
}`;
        const expected = `
{
	// this is comment for b
	"b": 2,
	"c": 3
}`;
        const actual = addSetting('b', sourceContent, targetContent, formattingOptions);
        assert.strictEqual(actual, expected);
    });
    test('Insert before a setting ending with comma and before a comment at the begninning', () => {
        const sourceContent = `
{
	// this is comment for b
	"b": 2,
	"c": 3,
}`;
        const targetContent = `
{
	// this is comment for b
	"c": 3,
}`;
        const expected = `
{
	// this is comment for b
	"b": 2,
	"c": 3,
}`;
        const actual = addSetting('b', sourceContent, targetContent, formattingOptions);
        assert.strictEqual(actual, expected);
    });
    test('Insert before a setting and between a setting and comment', () => {
        const sourceContent = `
{
	"a": 1,
	// this is comment for b
	"b": 2,
	"c": 3
}`;
        const targetContent = `
{
	"d": 1,
	// this is comment for b
	"c": 3
}`;
        const expected = `
{
	"d": 1,
	// this is comment for b
	"b": 2,
	"c": 3
}`;
        const actual = addSetting('b', sourceContent, targetContent, formattingOptions);
        assert.strictEqual(actual, expected);
    });
    test('Insert before a setting between two comments and there is a setting before', () => {
        const sourceContent = `
{
	"a": 1,
	// this is comment for b
	"b": 2,
	// this is comment for c
	"c": 3
}`;
        const targetContent = `
{
	"d": 1,
	// this is comment for b
	// this is comment for c
	"c": 3
}`;
        const expected = `
{
	"d": 1,
	// this is comment for b
	"b": 2,
	// this is comment for c
	"c": 3
}`;
        const actual = addSetting('b', sourceContent, targetContent, formattingOptions);
        assert.strictEqual(actual, expected);
    });
    test('Insert before a setting between two comments on the same line and there is a setting before', () => {
        const sourceContent = `
{
	"a": 1,
	/* this is comment for b */
	"b": 2,
	// this is comment for c
	"c": 3
}`;
        const targetContent = `
{
	"d": 1,
	/* this is comment for b */ // this is comment for c
	"c": 3
}`;
        const expected = `
{
	"d": 1,
	/* this is comment for b */
	"b": 2,
	// this is comment for c
	"c": 3
}`;
        const actual = addSetting('b', sourceContent, targetContent, formattingOptions);
        assert.strictEqual(actual, expected);
    });
    test('Insert before a setting between two line comments on the same line and there is a setting before', () => {
        const sourceContent = `
{
	"a": 1,
	/* this is comment for b */
	"b": 2,
	// this is comment for c
	"c": 3
}`;
        const targetContent = `
{
	"d": 1,
	// this is comment for b // this is comment for c
	"c": 3
}`;
        const expected = `
{
	"d": 1,
	"b": 2,
	// this is comment for b // this is comment for c
	"c": 3
}`;
        const actual = addSetting('b', sourceContent, targetContent, formattingOptions);
        assert.strictEqual(actual, expected);
    });
    test('Insert before a setting between two comments and there is no setting before', () => {
        const sourceContent = `
{
	// this is comment for b
	"b": 2,
	// this is comment for c
	"c": 1
}`;
        const targetContent = `
{
	// this is comment for b
	// this is comment for c
	"c": 1
}`;
        const expected = `
{
	// this is comment for b
	"b": 2,
	// this is comment for c
	"c": 1
}`;
        const actual = addSetting('b', sourceContent, targetContent, formattingOptions);
        assert.strictEqual(actual, expected);
    });
    test('Insert before a setting with comma and between two comments and there is no setting before', () => {
        const sourceContent = `
{
	// this is comment for b
	"b": 2,
	// this is comment for c
	"c": 1
}`;
        const targetContent = `
{
	// this is comment for b
	// this is comment for c
	"c": 1,
}`;
        const expected = `
{
	// this is comment for b
	"b": 2,
	// this is comment for c
	"c": 1,
}`;
        const actual = addSetting('b', sourceContent, targetContent, formattingOptions);
        assert.strictEqual(actual, expected);
    });
    test('Insert after a setting that is of object type', () => {
        const sourceContent = `
{
	"b": {
		"d": 1
	},
	"a": 2,
	"c": 1
}`;
        const targetContent = `
{
	"b": {
		"d": 1
	},
	"c": 1
}`;
        const actual = addSetting('a', sourceContent, targetContent, formattingOptions);
        assert.strictEqual(actual, sourceContent);
    });
    test('Insert after a setting that is of array type', () => {
        const sourceContent = `
{
	"b": [
		1
	],
	"a": 2,
	"c": 1
}`;
        const targetContent = `
{
	"b": [
		1
	],
	"c": 1
}`;
        const actual = addSetting('a', sourceContent, targetContent, formattingOptions);
        assert.strictEqual(actual, sourceContent);
    });
    test('Insert after a comment with comma separator of previous setting and no next nodes ', () => {
        const sourceContent = `
{
	"a": 1
	// this is comment for a
	,
	"b": 2
}`;
        const targetContent = `
{
	"a": 1
	// this is comment for a
	,
}`;
        const expected = `
{
	"a": 1
	// this is comment for a
	,
	"b": 2
}`;
        const actual = addSetting('b', sourceContent, targetContent, formattingOptions);
        assert.strictEqual(actual, expected);
    });
    test('Insert after a comment with comma separator of previous setting and there is a setting after ', () => {
        const sourceContent = `
{
	"a": 1
	// this is comment for a
	,
	"b": 2,
	"c": 3
}`;
        const targetContent = `
{
	"a": 1
	// this is comment for a
	,
	"c": 3
}`;
        const expected = `
{
	"a": 1
	// this is comment for a
	,
	"b": 2,
	"c": 3
}`;
        const actual = addSetting('b', sourceContent, targetContent, formattingOptions);
        assert.strictEqual(actual, expected);
    });
    test('Insert after a comment with comma separator of previous setting and there is a comment after ', () => {
        const sourceContent = `
{
	"a": 1
	// this is comment for a
	,
	"b": 2
	// this is a comment
}`;
        const targetContent = `
{
	"a": 1
	// this is comment for a
	,
	// this is a comment
}`;
        const expected = `
{
	"a": 1
	// this is comment for a
	,
	"b": 2
	// this is a comment
}`;
        const actual = addSetting('b', sourceContent, targetContent, formattingOptions);
        assert.strictEqual(actual, expected);
    });
});
function stringify(value) {
    return JSON.stringify(value, null, '\t');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0dGluZ3NNZXJnZS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vdXNlckRhdGFTeW5jL3Rlc3QvY29tbW9uL3NldHRpbmdzTWVyZ2UudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUd6RixNQUFNLGlCQUFpQixHQUFHLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxZQUFZLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxDQUFDLEVBQUUsQ0FBQztBQUV6RSxLQUFLLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxFQUFFO0lBRW5DLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsSUFBSSxDQUFDLHFEQUFxRCxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ3RFLE1BQU0sWUFBWSxHQUFHLFNBQVMsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzNDLE1BQU0sYUFBYSxHQUFHLFNBQVMsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzVDLE1BQU0sTUFBTSxHQUFHLEtBQUssQ0FBQyxZQUFZLEVBQUUsYUFBYSxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLGlCQUFpQixDQUFDLENBQUM7UUFDbkYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzlDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLGFBQWEsRUFBRSxJQUFJLENBQUMsQ0FBQztR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