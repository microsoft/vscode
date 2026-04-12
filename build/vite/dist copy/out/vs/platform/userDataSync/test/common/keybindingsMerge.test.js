/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { merge } from '../../common/keybindingsMerge.js';
import { TestUserDataSyncUtilService } from './userDataSyncClient.js';
suite('KeybindingsMerge - No Conflicts', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('merge when local and remote are same with one entry', async () => {
        const localContent = stringify([{ key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' }]);
        const remoteContent = stringify([{ key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' }]);
        const actual = await mergeKeybindings(localContent, remoteContent, null);
        assert.ok(!actual.hasChanges);
        assert.ok(!actual.hasConflicts);
        assert.strictEqual(actual.mergeContent, localContent);
    });
    test('merge when local and remote are same with similar when contexts', async () => {
        const localContent = stringify([{ key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' }]);
        const remoteContent = stringify([{ key: 'alt+c', command: 'a', when: '!editorReadonly && editorTextFocus' }]);
        const actual = await mergeKeybindings(localContent, remoteContent, null);
        assert.ok(!actual.hasChanges);
        assert.ok(!actual.hasConflicts);
        assert.strictEqual(actual.mergeContent, localContent);
    });
    test('merge when local and remote has entries in different order', async () => {
        const localContent = stringify([
            { key: 'alt+d', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'alt+a', command: 'a', when: 'editorTextFocus' }
        ]);
        const remoteContent = stringify([
            { key: 'alt+a', command: 'a', when: 'editorTextFocus' },
            { key: 'alt+d', command: 'a', when: 'editorTextFocus && !editorReadonly' }
        ]);
        const actual = await mergeKeybindings(localContent, remoteContent, null);
        assert.ok(!actual.hasChanges);
        assert.ok(!actual.hasConflicts);
        assert.strictEqual(actual.mergeContent, localContent);
    });
    test('merge when local and remote are same with multiple entries', async () => {
        const localContent = stringify([
            { key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'alt+d', command: '-a' },
            { key: 'cmd+c', command: 'b', args: { text: '`' } }
        ]);
        const remoteContent = stringify([
            { key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'alt+d', command: '-a' },
            { key: 'cmd+c', command: 'b', args: { text: '`' } }
        ]);
        const actual = await mergeKeybindings(localContent, remoteContent, null);
        assert.ok(!actual.hasChanges);
        assert.ok(!actual.hasConflicts);
        assert.strictEqual(actual.mergeContent, localContent);
    });
    test('merge when local and remote are same with different base content', async () => {
        const localContent = stringify([
            { key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'alt+d', command: '-a' },
            { key: 'cmd+c', command: 'b', args: { text: '`' } }
        ]);
        const baseContent = stringify([
            { key: 'ctrl+c', command: 'e' },
            { key: 'shift+d', command: 'd', args: { text: '`' } }
        ]);
        const remoteContent = stringify([
            { key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'alt+d', command: '-a' },
            { key: 'cmd+c', command: 'b', args: { text: '`' } }
        ]);
        const actual = await mergeKeybindings(localContent, remoteContent, baseContent);
        assert.ok(!actual.hasChanges);
        assert.ok(!actual.hasConflicts);
        assert.strictEqual(actual.mergeContent, localContent);
    });
    test('merge when local and remote are same with multiple entries in different order', async () => {
        const localContent = stringify([
            { key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'alt+d', command: '-a' },
            { key: 'cmd+c', command: 'b', args: { text: '`' } }
        ]);
        const remoteContent = stringify([
            { key: 'cmd+c', command: 'b', args: { text: '`' } },
            { key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'alt+d', command: '-a' },
        ]);
        const actual = await mergeKeybindings(localContent, remoteContent, null);
        assert.ok(!actual.hasChanges);
        assert.ok(!actual.hasConflicts);
        assert.strictEqual(actual.mergeContent, localContent);
    });
    test('merge when local and remote are same when remove entry is in different order', async () => {
        const localContent = stringify([
            { key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'alt+d', command: '-a' },
            { key: 'cmd+c', command: 'b', args: { text: '`' } }
        ]);
        const remoteContent = stringify([
            { key: 'alt+d', command: '-a' },
            { key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'cmd+c', command: 'b', args: { text: '`' } },
        ]);
        const actual = await mergeKeybindings(localContent, remoteContent, null);
        assert.ok(!actual.hasChanges);
        assert.ok(!actual.hasConflicts);
        assert.strictEqual(actual.mergeContent, localContent);
    });
    test('merge when a new entry is added to remote', async () => {
        const localContent = stringify([
            { key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'alt+d', command: '-a' },
        ]);
        const remoteContent = stringify([
            { key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'alt+d', command: '-a' },
            { key: 'cmd+c', command: 'b', args: { text: '`' } },
        ]);
        const actual = await mergeKeybindings(localContent, remoteContent, null);
        assert.ok(actual.hasChanges);
        assert.ok(!actual.hasConflicts);
        assert.strictEqual(actual.mergeContent, remoteContent);
    });
    test('merge when multiple new entries are added to remote', async () => {
        const localContent = stringify([
            { key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'alt+d', command: '-a' },
        ]);
        const remoteContent = stringify([
            { key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'alt+d', command: '-a' },
            { key: 'cmd+c', command: 'b', args: { text: '`' } },
            { key: 'cmd+d', command: 'c' },
        ]);
        const actual = await mergeKeybindings(localContent, remoteContent, null);
        assert.ok(actual.hasChanges);
        assert.ok(!actual.hasConflicts);
        assert.strictEqual(actual.mergeContent, remoteContent);
    });
    test('merge when multiple new entries are added to remote from base and local has not changed', async () => {
        const localContent = stringify([
            { key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'alt+d', command: '-a' },
        ]);
        const remoteContent = stringify([
            { key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'alt+d', command: '-a' },
            { key: 'cmd+c', command: 'b', args: { text: '`' } },
            { key: 'cmd+d', command: 'c' },
        ]);
        const actual = await mergeKeybindings(localContent, remoteContent, localContent);
        assert.ok(actual.hasChanges);
        assert.ok(!actual.hasConflicts);
        assert.strictEqual(actual.mergeContent, remoteContent);
    });
    test('merge when an entry is removed from remote from base and local has not changed', async () => {
        const localContent = stringify([
            { key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'alt+d', command: '-a' },
            { key: 'cmd+c', command: 'b', args: { text: '`' } },
        ]);
        const remoteContent = stringify([
            { key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'alt+d', command: '-a' },
        ]);
        const actual = await mergeKeybindings(localContent, remoteContent, localContent);
        assert.ok(actual.hasChanges);
        assert.ok(!actual.hasConflicts);
        assert.strictEqual(actual.mergeContent, remoteContent);
    });
    test('merge when an entry (same command) is removed from remote from base and local has not changed', async () => {
        const localContent = stringify([
            { key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'alt+d', command: '-a' },
        ]);
        const remoteContent = stringify([
            { key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
        ]);
        const actual = await mergeKeybindings(localContent, remoteContent, localContent);
        assert.ok(actual.hasChanges);
        assert.ok(!actual.hasConflicts);
        assert.strictEqual(actual.mergeContent, remoteContent);
    });
    test('merge when an entry is updated in remote from base and local has not changed', async () => {
        const localContent = stringify([
            { key: 'alt+d', command: 'a', when: 'editorTextFocus && !editorReadonly' },
        ]);
        const remoteContent = stringify([
            { key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
        ]);
        const actual = await mergeKeybindings(localContent, remoteContent, localContent);
        assert.ok(actual.hasChanges);
        assert.ok(!actual.hasConflicts);
        assert.strictEqual(actual.mergeContent, remoteContent);
    });
    test('merge when a command with multiple entries is updated from remote from base and local has not changed', async () => {
        const localContent = stringify([
            { key: 'shift+c', command: 'c' },
            { key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'alt+d', command: 'b' },
            { key: 'cmd+c', command: 'a' },
        ]);
        const remoteContent = stringify([
            { key: 'shift+c', command: 'c' },
            { key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'alt+d', command: 'b' },
            { key: 'cmd+d', command: 'a' },
        ]);
        const actual = await mergeKeybindings(localContent, remoteContent, localContent);
        assert.ok(actual.hasChanges);
        assert.ok(!actual.hasConflicts);
        assert.strictEqual(actual.mergeContent, remoteContent);
    });
    test('merge when remote has moved forwareded with multiple changes and local stays with base', async () => {
        const localContent = stringify([
            { key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'cmd+c', command: 'b', args: { text: '`' } },
            { key: 'alt+d', command: '-a' },
            { key: 'cmd+e', command: 'd' },
            { key: 'cmd+d', command: 'c', when: 'context1' },
        ]);
        const remoteContent = stringify([
            { key: 'alt+d', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'cmd+e', command: 'd' },
            { key: 'alt+d', command: '-a' },
            { key: 'alt+f', command: 'f' },
            { key: 'alt+d', command: '-f' },
            { key: 'cmd+d', command: 'c', when: 'context1' },
            { key: 'cmd+c', command: '-c' },
        ]);
        const actual = await mergeKeybindings(localContent, remoteContent, localContent);
        assert.ok(actual.hasChanges);
        assert.ok(!actual.hasConflicts);
        assert.strictEqual(actual.mergeContent, remoteContent);
    });
    test('merge when a new entry is added to local', async () => {
        const localContent = stringify([
            { key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'alt+d', command: '-a' },
            { key: 'cmd+c', command: 'b', args: { text: '`' } },
        ]);
        const remoteContent = stringify([
            { key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'alt+d', command: '-a' },
        ]);
        const actual = await mergeKeybindings(localContent, remoteContent, null);
        assert.ok(actual.hasChanges);
        assert.ok(!actual.hasConflicts);
        assert.strictEqual(actual.mergeContent, localContent);
    });
    test('merge when multiple new entries are added to local', async () => {
        const localContent = stringify([
            { key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'alt+d', command: '-a' },
            { key: 'cmd+c', command: 'b', args: { text: '`' } },
            { key: 'cmd+d', command: 'c' },
        ]);
        const remoteContent = stringify([
            { key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'alt+d', command: '-a' },
        ]);
        const actual = await mergeKeybindings(localContent, remoteContent, null);
        assert.ok(actual.hasChanges);
        assert.ok(!actual.hasConflicts);
        assert.strictEqual(actual.mergeContent, localContent);
    });
    test('merge when multiple new entries are added to local from base and remote is not changed', async () => {
        const localContent = stringify([
            { key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'alt+d', command: '-a' },
            { key: 'cmd+c', command: 'b', args: { text: '`' } },
            { key: 'cmd+d', command: 'c' },
        ]);
        const remoteContent = stringify([
            { key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'alt+d', command: '-a' },
        ]);
        const actual = await mergeKeybindings(localContent, remoteContent, remoteContent);
        assert.ok(actual.hasChanges);
        assert.ok(!actual.hasConflicts);
        assert.strictEqual(actual.mergeContent, localContent);
    });
    test('merge when an entry is removed from local from base and remote has not changed', async () => {
        const localContent = stringify([
            { key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'alt+d', command: '-a' },
        ]);
        const remoteContent = stringify([
            { key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'alt+d', command: '-a' },
            { key: 'cmd+c', command: 'b', args: { text: '`' } },
        ]);
        const actual = await mergeKeybindings(localContent, remoteContent, remoteContent);
        assert.ok(actual.hasChanges);
        assert.ok(!actual.hasConflicts);
        assert.strictEqual(actual.mergeContent, localContent);
    });
    test('merge when an entry (with same command) is removed from local from base and remote has not changed', async () => {
        const localContent = stringify([
            { key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
        ]);
        const remoteContent = stringify([
            { key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'alt+d', command: '-a' },
        ]);
        const actual = await mergeKeybindings(localContent, remoteContent, remoteContent);
        assert.ok(actual.hasChanges);
        assert.ok(!actual.hasConflicts);
        assert.strictEqual(actual.mergeContent, localContent);
    });
    test('merge when an entry is updated in local from base and remote has not changed', async () => {
        const localContent = stringify([
            { key: 'alt+d', command: 'a', when: 'editorTextFocus' },
        ]);
        const remoteContent = stringify([
            { key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
        ]);
        const actual = await mergeKeybindings(localContent, remoteContent, remoteContent);
        assert.ok(actual.hasChanges);
        assert.ok(!actual.hasConflicts);
        assert.strictEqual(actual.mergeContent, localContent);
    });
    test('merge when a command with multiple entries is updated from local from base and remote has not changed', async () => {
        const localContent = stringify([
            { key: 'shift+c', command: 'c' },
            { key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'alt+d', command: 'b' },
            { key: 'cmd+c', command: 'a' },
        ]);
        const remoteContent = stringify([
            { key: 'shift+c', command: 'c' },
            { key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'alt+d', command: 'b' },
            { key: 'cmd+d', command: 'a' },
        ]);
        const actual = await mergeKeybindings(localContent, remoteContent, remoteContent);
        assert.ok(actual.hasChanges);
        assert.ok(!actual.hasConflicts);
        assert.strictEqual(actual.mergeContent, localContent);
    });
    test('merge when local has moved forwareded with multiple changes and remote stays with base', async () => {
        const localContent = stringify([
            { key: 'alt+d', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'cmd+e', command: 'd' },
            { key: 'alt+d', command: '-a' },
            { key: 'alt+f', command: 'f' },
            { key: 'alt+d', command: '-f' },
            { key: 'cmd+d', command: 'c', when: 'context1' },
            { key: 'cmd+c', command: '-c' },
        ]);
        const remoteContent = stringify([
            { key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'cmd+c', command: 'b', args: { text: '`' } },
            { key: 'alt+d', command: '-a' },
            { key: 'cmd+e', command: 'd' },
            { key: 'cmd+d', command: 'c', when: 'context1' },
        ]);
        const expected = stringify([
            { key: 'alt+d', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'cmd+e', command: 'd' },
            { key: 'alt+d', command: '-a' },
            { key: 'alt+f', command: 'f' },
            { key: 'alt+d', command: '-f' },
            { key: 'cmd+d', command: 'c', when: 'context1' },
            { key: 'cmd+c', command: '-c' },
        ]);
        const actual = await mergeKeybindings(localContent, remoteContent, remoteContent);
        assert.ok(actual.hasChanges);
        assert.ok(!actual.hasConflicts);
        assert.strictEqual(actual.mergeContent, expected);
    });
    test('merge when local and remote has moved forwareded with conflicts', async () => {
        const baseContent = stringify([
            { key: 'alt+d', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'ctrl+c', command: '-a' },
            { key: 'cmd+e', command: 'd' },
            { key: 'alt+a', command: 'f' },
            { key: 'alt+d', command: '-f' },
            { key: 'cmd+d', command: 'c', when: 'context1' },
            { key: 'cmd+c', command: '-c' },
        ]);
        const localContent = stringify([
            { key: 'alt+d', command: '-f' },
            { key: 'cmd+e', command: 'd' },
            { key: 'cmd+c', command: '-c' },
            { key: 'cmd+d', command: 'c', when: 'context1' },
            { key: 'alt+a', command: 'f' },
            { key: 'alt+e', command: 'e' },
        ]);
        const remoteContent = stringify([
            { key: 'alt+a', command: 'f' },
            { key: 'cmd+c', command: '-c' },
            { key: 'cmd+d', command: 'd' },
            { key: 'alt+d', command: '-f' },
            { key: 'alt+c', command: 'c', when: 'context1' },
            { key: 'alt+g', command: 'g', when: 'context2' },
        ]);
        const expected = stringify([
            { key: 'alt+d', command: '-f' },
            { key: 'cmd+d', command: 'd' },
            { key: 'cmd+c', command: '-c' },
            { key: 'alt+c', command: 'c', when: 'context1' },
            { key: 'alt+a', command: 'f' },
            { key: 'alt+e', command: 'e' },
            { key: 'alt+g', command: 'g', when: 'context2' },
        ]);
        const actual = await mergeKeybindings(localContent, remoteContent, baseContent);
        assert.ok(actual.hasChanges);
        assert.ok(!actual.hasConflicts);
        assert.strictEqual(actual.mergeContent, expected);
    });
    test('merge when local and remote with one entry but different value', async () => {
        const localContent = stringify([{ key: 'alt+d', command: 'a', when: 'editorTextFocus && !editorReadonly' }]);
        const remoteContent = stringify([{ key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' }]);
        const actual = await mergeKeybindings(localContent, remoteContent, null);
        assert.ok(actual.hasChanges);
        assert.ok(actual.hasConflicts);
        assert.strictEqual(actual.mergeContent, `[
	{
		"key": "alt+d",
		"command": "a",
		"when": "editorTextFocus && !editorReadonly"
	}
]`);
    });
    test('merge when local and remote with different keybinding', async () => {
        const localContent = stringify([
            { key: 'alt+d', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'alt+a', command: '-a', when: 'editorTextFocus && !editorReadonly' }
        ]);
        const remoteContent = stringify([
            { key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'alt+a', command: '-a', when: 'editorTextFocus && !editorReadonly' }
        ]);
        const actual = await mergeKeybindings(localContent, remoteContent, null);
        assert.ok(actual.hasChanges);
        assert.ok(actual.hasConflicts);
        assert.strictEqual(actual.mergeContent, `[
	{
		"key": "alt+d",
		"command": "a",
		"when": "editorTextFocus && !editorReadonly"
	},
	{
		"key": "alt+a",
		"command": "-a",
		"when": "editorTextFocus && !editorReadonly"
	}
]`);
    });
    test('merge when the entry is removed in local but updated in remote', async () => {
        const baseContent = stringify([{ key: 'alt+d', command: 'a', when: 'editorTextFocus && !editorReadonly' }]);
        const localContent = stringify([]);
        const remoteContent = stringify([{ key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' }]);
        const actual = await mergeKeybindings(localContent, remoteContent, baseContent);
        assert.ok(actual.hasChanges);
        assert.ok(actual.hasConflicts);
        assert.strictEqual(actual.mergeContent, `[]`);
    });
    test('merge when the entry is removed in local but updated in remote and a new entry is added in local', async () => {
        const baseContent = stringify([{ key: 'alt+d', command: 'a', when: 'editorTextFocus && !editorReadonly' }]);
        const localContent = stringify([{ key: 'alt+b', command: 'b' }]);
        const remoteContent = stringify([{ key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' }]);
        const actual = await mergeKeybindings(localContent, remoteContent, baseContent);
        assert.ok(actual.hasChanges);
        assert.ok(actual.hasConflicts);
        assert.strictEqual(actual.mergeContent, `[
	{
		"key": "alt+b",
		"command": "b"
	}
]`);
    });
    test('merge when the entry is removed in remote but updated in local', async () => {
        const baseContent = stringify([{ key: 'alt+d', command: 'a', when: 'editorTextFocus && !editorReadonly' }]);
        const localContent = stringify([{ key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' }]);
        const remoteContent = stringify([]);
        const actual = await mergeKeybindings(localContent, remoteContent, baseContent);
        assert.ok(actual.hasChanges);
        assert.ok(actual.hasConflicts);
        assert.strictEqual(actual.mergeContent, `[
	{
		"key": "alt+c",
		"command": "a",
		"when": "editorTextFocus && !editorReadonly"
	}
]`);
    });
    test('merge when the entry is removed in remote but updated in local and a new entry is added in remote', async () => {
        const baseContent = stringify([{ key: 'alt+d', command: 'a', when: 'editorTextFocus && !editorReadonly' }]);
        const localContent = stringify([{ key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' }]);
        const remoteContent = stringify([{ key: 'alt+b', command: 'b' }]);
        const actual = await mergeKeybindings(localContent, remoteContent, baseContent);
        assert.ok(actual.hasChanges);
        assert.ok(actual.hasConflicts);
        assert.strictEqual(actual.mergeContent, `[
	{
		"key": "alt+c",
		"command": "a",
		"when": "editorTextFocus && !editorReadonly"
	},
	{
		"key": "alt+b",
		"command": "b"
	}
]`);
    });
    test('merge when local and remote has moved forwareded with conflicts (2)', async () => {
        const baseContent = stringify([
            { key: 'alt+d', command: 'a', when: 'editorTextFocus && !editorReadonly' },
            { key: 'alt+c', command: '-a' },
            { key: 'cmd+e', command: 'd' },
            { key: 'alt+a', command: 'f' },
            { key: 'alt+d', command: '-f' },
            { key: 'cmd+d', command: 'c', when: 'context1' },
            { key: 'cmd+c', command: '-c' },
        ]);
        const localContent = stringify([
            { key: 'alt+d', command: '-f' },
            { key: 'cmd+e', command: 'd' },
            { key: 'cmd+c', command: '-c' },
            { key: 'cmd+d', command: 'c', when: 'context1' },
            { key: 'alt+a', command: 'f' },
            { key: 'alt+e', command: 'e' },
        ]);
        const remoteContent = stringify([
            { key: 'alt+a', command: 'f' },
            { key: 'cmd+c', command: '-c' },
            { key: 'cmd+d', command: 'd' },
            { key: 'alt+d', command: '-f' },
            { key: 'alt+c', command: 'c', when: 'context1' },
            { key: 'alt+g', command: 'g', when: 'context2' },
        ]);
        const actual = await mergeKeybindings(localContent, remoteContent, baseContent);
        assert.ok(actual.hasChanges);
        assert.ok(actual.hasConflicts);
        assert.strictEqual(actual.mergeContent, `[
	{
		"key": "alt+d",
		"command": "-f"
	},
	{
		"key": "cmd+d",
		"command": "d"
	},
	{
		"key": "cmd+c",
		"command": "-c"
	},
	{
		"key": "cmd+d",
		"command": "c",
		"when": "context1"
	},
	{
		"key": "alt+a",
		"command": "f"
	},
	{
		"key": "alt+e",
		"command": "e"
	},
	{
		"key": "alt+g",
		"command": "g",
		"when": "context2"
	}
]`);
    });
});
async function mergeKeybindings(localContent, remoteContent, baseContent) {
    const userDataSyncUtilService = new TestUserDataSyncUtilService();
    const formattingOptions = await userDataSyncUtilService.resolveFormattingOptions();
    return merge(localContent, remoteContent, baseContent, formattingOptions, userDataSyncUtilService);
}
function stringify(value) {
    return JSON.stringify(value, null, '\t');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoia2V5YmluZGluZ3NNZXJnZS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vdXNlckRhdGFTeW5jL3Rlc3QvY29tbW9uL2tleWJpbmRpbmdzTWVyZ2UudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBRXRFLEtBQUssQ0FBQyxpQ0FBaUMsRUFBRSxHQUFHLEVBQUU7SUFFN0MsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxJQUFJLENBQUMscURBQXFELEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDdEUsTUFBTSxZQUFZLEdBQUcsU0FBUyxDQUFDLENBQUMsRUFBRSxHQUFHLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFFLG9DQUFvQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzdHLE1BQU0sYUFBYSxHQUFHLFNBQVMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxvQ0FBb0MsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM5RyxNQUFNLE1BQU0sR0FBRyxNQUFNLGdCQUFnQixDQUFDLFlBQVksRUFBRSxhQUFhLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDekUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUM5QixNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxD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QUUsT0FBTyxFQUFFLElBQUksRUFBRTtZQUMvQixFQUFFLEdBQUcsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEdBQUcsRUFBRTtZQUM5QixFQUFFLEdBQUcsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEdBQUcsRUFBRTtZQUM5QixFQUFFLEdBQUcsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRTtZQUMvQixFQUFFLEdBQUcsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFO1lBQ2hELEVBQUUsR0FBRyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFO1NBQy9CLENBQUMsQ0FBQztRQUNILE1BQU0sWUFBWSxHQUFHLFNBQVMsQ0FBQztZQUM5QixFQUFFLEdBQUcsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRTtZQUMvQixFQUFFLEdBQUcsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEdBQUcsRUFBRTtZQUM5QixFQUFFLEdBQUcsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRTtZQUMvQixFQUFFLEdBQUcsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFO1lBQ2hELEVBQUUsR0FBRyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFO1lBQzlCLEVBQUUsR0FBRyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFO1NBQzlCLENBQUMsQ0FBQztRQUNILE1BQU0sYUFBYSxHQUFHLFNBQVMsQ0FBQztZQUMvQixFQUFFLEdBQUcsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEdBQUcsRUFBRTtZQUM5QixFQUFFLEdBQUcsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRTtZQUMvQixFQUFFLEdBQUcsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEdBQUcsRUFBRTtZQUM5QixFQUFFLEdBQUcsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRTtZQUMvQixFQUFFLEdBQUcsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFO1lBQ2hELEVBQUUsR0FBRyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxVQUFVLEVBQUU7U0FDaEQsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxNQUFNLEdBQUcsTUFBTSxnQkFBZ0IsQ0FBQyxZQUFZLEVBQUUsYUFBYSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQ2hGLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQzdCLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQy9CLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFlBQVksRUFDckM7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7RUErQkQsQ0FBQyxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7QUFFSixDQUFDLENBQUMsQ0FBQztBQUVILEtBQUssVUFBVSxnQkFBZ0IsQ0FBQyxZQUFvQixFQUFFLGFBQXFCLEVBQUUsV0FBMEI7SUFDdEcsTUFBTSx1QkFBdUIsR0FBRyxJQUFJLDJCQUEyQixFQUFFLENBQUM7SUFDbEUsTUFBTSxpQkFBaUIsR0FBRyxNQUFNLHVCQUF1QixDQUFDLHdCQUF3QixFQUFFLENBQUM7SUFDbkYsT0FBTyxLQUFLLENBQUMsWUFBWSxFQUFFLGFBQWEsRUFBRSxXQUFXLEVBQUUsaUJBQWlCLEVBQUUsdUJBQXVCLENBQUMsQ0FBQztBQUNwRyxDQUFDO0FBRUQsU0FBUyxTQUFTLENBQUMsS0FBVTtJQUM1QixPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztBQUMxQyxDQUFDIn0=