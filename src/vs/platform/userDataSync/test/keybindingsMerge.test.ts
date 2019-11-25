/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { mergeKeybindings } from 'vs/platform/userDataSync/common/keybindingsMerge';

suite('KeybindingsMerge - No Conflicts', () => {

	test('merge when local and remote are same with one entry', () => {
		const localContent = stringify([{ key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' }]);
		const remoteContent = stringify([{ key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' }]);
		const actual = mergeKeybindings(localContent, remoteContent, null);
		assert.ok(!actual.hasChanges);
		assert.ok(!actual.hasConflicts);
		assert.equal(actual.mergeContent, localContent);
	});

	test('merge when local and remote are same with similar when contexts', () => {
		const localContent = stringify([{ key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' }]);
		const remoteContent = stringify([{ key: 'alt+c', command: 'a', when: '!editorReadonly && editorTextFocus' }]);
		const actual = mergeKeybindings(localContent, remoteContent, null);
		assert.ok(!actual.hasChanges);
		assert.ok(!actual.hasConflicts);
		assert.equal(actual.mergeContent, localContent);
	});

	test('merge when local and remote are same with multiple entries', () => {
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
		const actual = mergeKeybindings(localContent, remoteContent, null);
		assert.ok(!actual.hasChanges);
		assert.ok(!actual.hasConflicts);
		assert.equal(actual.mergeContent, localContent);
	});

	test('merge when local and remote are same with different base content', () => {
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
		const actual = mergeKeybindings(localContent, remoteContent, baseContent);
		assert.ok(!actual.hasChanges);
		assert.ok(!actual.hasConflicts);
		assert.equal(actual.mergeContent, localContent);
	});

	test('merge when local and remote are same with multiple entries in different order', () => {
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
		const actual = mergeKeybindings(localContent, remoteContent, null);
		assert.ok(!actual.hasChanges);
		assert.ok(!actual.hasConflicts);
		assert.equal(actual.mergeContent, localContent);
	});

	test('merge when local and remote are same when remove entry is in different order', () => {
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
		const actual = mergeKeybindings(localContent, remoteContent, null);
		assert.ok(!actual.hasChanges);
		assert.ok(!actual.hasConflicts);
		assert.equal(actual.mergeContent, localContent);
	});

	test('merge when a new entry is added to remote', () => {
		const localContent = stringify([
			{ key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
			{ key: 'alt+d', command: '-a' },
		]);
		const remoteContent = stringify([
			{ key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
			{ key: 'alt+d', command: '-a' },
			{ key: 'cmd+c', command: 'b', args: { text: '`' } },
		]);
		const actual = mergeKeybindings(localContent, remoteContent, null);
		assert.ok(actual.hasChanges);
		assert.ok(!actual.hasConflicts);
		assert.equal(actual.mergeContent, remoteContent);
	});

	test('merge when multiple new entries are added to remote', () => {
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
		const actual = mergeKeybindings(localContent, remoteContent, null);
		assert.ok(actual.hasChanges);
		assert.ok(!actual.hasConflicts);
		assert.equal(actual.mergeContent, remoteContent);
	});

	test('merge when multiple new entries are added to remote from base and local has not changed', () => {
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
		const actual = mergeKeybindings(localContent, remoteContent, localContent);
		assert.ok(actual.hasChanges);
		assert.ok(!actual.hasConflicts);
		assert.equal(actual.mergeContent, remoteContent);
	});

	test('merge when an entry is removed from remote from base and local has not changed', () => {
		const localContent = stringify([
			{ key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
			{ key: 'alt+d', command: '-a' },
			{ key: 'cmd+c', command: 'b', args: { text: '`' } },
		]);
		const remoteContent = stringify([
			{ key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
			{ key: 'alt+d', command: '-a' },
		]);
		const actual = mergeKeybindings(localContent, remoteContent, localContent);
		assert.ok(actual.hasChanges);
		assert.ok(!actual.hasConflicts);
		assert.equal(actual.mergeContent, remoteContent);
	});

	test('merge when an entry (same command) is removed from remote from base and local has not changed', () => {
		const localContent = stringify([
			{ key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
			{ key: 'alt+d', command: '-a' },
		]);
		const remoteContent = stringify([
			{ key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
		]);
		const actual = mergeKeybindings(localContent, remoteContent, localContent);
		assert.ok(actual.hasChanges);
		assert.ok(!actual.hasConflicts);
		assert.equal(actual.mergeContent, remoteContent);
	});

	test('merge when an entry is updated in remote from base and local has not changed', () => {
		const localContent = stringify([
			{ key: 'alt+d', command: 'a', when: 'editorTextFocus && !editorReadonly' },
		]);
		const remoteContent = stringify([
			{ key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
		]);
		const actual = mergeKeybindings(localContent, remoteContent, localContent);
		assert.ok(actual.hasChanges);
		assert.ok(!actual.hasConflicts);
		assert.equal(actual.mergeContent, remoteContent);
	});

	test('merge when a command with multiple entries is updated from remote from base and local has not changed', () => {
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
		const expected = stringify([
			{ key: 'shift+c', command: 'c' },
			{ key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
			{ key: 'cmd+d', command: 'a' },
			{ key: 'alt+d', command: 'b' },
		]);
		const actual = mergeKeybindings(localContent, remoteContent, localContent);
		assert.ok(actual.hasChanges);
		assert.ok(!actual.hasConflicts);
		assert.equal(actual.mergeContent, expected);
	});

	test('merge when remote has moved forwareded with multiple changes and local stays with base', () => {
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
		const expected = stringify([
			{ key: 'alt+d', command: 'a', when: 'editorTextFocus && !editorReadonly' },
			{ key: 'alt+d', command: '-a' },
			{ key: 'cmd+e', command: 'd' },
			{ key: 'cmd+d', command: 'c', when: 'context1' },
			{ key: 'cmd+c', command: '-c' },
			{ key: 'alt+f', command: 'f' },
			{ key: 'alt+d', command: '-f' },
		]);
		const actual = mergeKeybindings(localContent, remoteContent, localContent);
		assert.ok(actual.hasChanges);
		assert.ok(!actual.hasConflicts);
		assert.equal(actual.mergeContent, expected);
	});

	test('merge when a new entry is added to local', () => {
		const localContent = stringify([
			{ key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
			{ key: 'alt+d', command: '-a' },
			{ key: 'cmd+c', command: 'b', args: { text: '`' } },
		]);
		const remoteContent = stringify([
			{ key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
			{ key: 'alt+d', command: '-a' },
		]);
		const actual = mergeKeybindings(localContent, remoteContent, null);
		assert.ok(actual.hasChanges);
		assert.ok(!actual.hasConflicts);
		assert.equal(actual.mergeContent, localContent);
	});

	test('merge when multiple new entries are added to local', () => {
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
		const actual = mergeKeybindings(localContent, remoteContent, null);
		assert.ok(actual.hasChanges);
		assert.ok(!actual.hasConflicts);
		assert.equal(actual.mergeContent, localContent);
	});

	test('merge when multiple new entries are added to local from base and remote is not changed', () => {
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
		const actual = mergeKeybindings(localContent, remoteContent, remoteContent);
		assert.ok(actual.hasChanges);
		assert.ok(!actual.hasConflicts);
		assert.equal(actual.mergeContent, localContent);
	});

	test('merge when an entry is removed from local from base and remote has not changed', () => {
		const localContent = stringify([
			{ key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
			{ key: 'alt+d', command: '-a' },
		]);
		const remoteContent = stringify([
			{ key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
			{ key: 'alt+d', command: '-a' },
			{ key: 'cmd+c', command: 'b', args: { text: '`' } },
		]);
		const actual = mergeKeybindings(localContent, remoteContent, remoteContent);
		assert.ok(actual.hasChanges);
		assert.ok(!actual.hasConflicts);
		assert.equal(actual.mergeContent, localContent);
	});

	test('merge when an entry (with same command) is removed from local from base and remote has not changed', () => {
		const localContent = stringify([
			{ key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
		]);
		const remoteContent = stringify([
			{ key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
			{ key: 'alt+d', command: '-a' },
		]);
		const actual = mergeKeybindings(localContent, remoteContent, remoteContent);
		assert.ok(actual.hasChanges);
		assert.ok(!actual.hasConflicts);
		assert.equal(actual.mergeContent, localContent);
	});

	test('merge when an entry is updated in local from base and remote has not changed', () => {
		const localContent = stringify([
			{ key: 'alt+d', command: 'a', when: 'editorTextFocus' },
		]);
		const remoteContent = stringify([
			{ key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
		]);
		const actual = mergeKeybindings(localContent, remoteContent, remoteContent);
		assert.ok(actual.hasChanges);
		assert.ok(!actual.hasConflicts);
		assert.equal(actual.mergeContent, localContent);
	});

	test('merge when a command with multiple entries is updated from local from base and remote has not changed', () => {
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
		const actual = mergeKeybindings(localContent, remoteContent, remoteContent);
		assert.ok(actual.hasChanges);
		assert.ok(!actual.hasConflicts);
		assert.equal(actual.mergeContent, localContent);
	});

	test('merge when local has moved forwareded with multiple changes and remote stays with base', () => {
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
		const actual = mergeKeybindings(localContent, remoteContent, remoteContent);
		assert.ok(actual.hasChanges);
		assert.ok(!actual.hasConflicts);
		assert.equal(actual.mergeContent, expected);
	});

	test('merge when local and remote has moved forwareded with no conflicts', () => {
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
		const expected = stringify([
			{ key: 'alt+d', command: '-f' },
			{ key: 'cmd+d', command: 'd' },
			{ key: 'cmd+c', command: '-c' },
			{ key: 'alt+c', command: 'c', when: 'context1' },
			{ key: 'alt+a', command: 'f' },
			{ key: 'alt+e', command: 'e' },
			{ key: 'alt+g', command: 'g', when: 'context2' },
		]);
		const actual = mergeKeybindings(localContent, remoteContent, baseContent);
		assert.ok(actual.hasChanges);
		assert.ok(!actual.hasConflicts);
		assert.equal(actual.mergeContent, expected);
	});

});

suite('KeybindingsMerge - Conflicts', () => {

	test('merge when local and remote with one entry but different value', () => {
		const localContent = stringify([{ key: 'alt+d', command: 'a', when: 'editorTextFocus && !editorReadonly' }]);
		const remoteContent = stringify([{ key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' }]);
		const actual = mergeKeybindings(localContent, remoteContent, null);
		assert.ok(actual.hasChanges);
		assert.ok(actual.hasConflicts);
		assert.equal(actual.mergeContent,
			`[
<<<<<<< local
	{
		"key": "alt+d",
		"command": "a",
		"when": "editorTextFocus && !editorReadonly"
	},
=======
	{
		"key": "alt+c",
		"command": "a",
		"when": "editorTextFocus && !editorReadonly"
	}
>>>>>>> remote
]`);
	});

	test('merge when local and remote with different keybinding', () => {
		const localContent = stringify([
			{ key: 'alt+d', command: 'a', when: 'editorTextFocus && !editorReadonly' },
			{ key: 'alt+a', command: '-a', when: 'editorTextFocus && !editorReadonly' }
		]);
		const remoteContent = stringify([
			{ key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' },
			{ key: 'alt+a', command: '-a', when: 'editorTextFocus && !editorReadonly' }
		]);
		const actual = mergeKeybindings(localContent, remoteContent, null);
		assert.ok(actual.hasChanges);
		assert.ok(actual.hasConflicts);
		assert.equal(actual.mergeContent,
			`[
<<<<<<< local
	{
		"key": "alt+d",
		"command": "a",
		"when": "editorTextFocus && !editorReadonly"
	},
	{
		"key": "alt+a",
		"command": "-a",
		"when": "editorTextFocus && !editorReadonly"
	},
=======
	{
		"key": "alt+c",
		"command": "a",
		"when": "editorTextFocus && !editorReadonly"
	},
	{
		"key": "alt+a",
		"command": "-a",
		"when": "editorTextFocus && !editorReadonly"
	}
>>>>>>> remote
]`);
	});

	test('merge when local and remote has entries in different order', () => {
		const localContent = stringify([
			{ key: 'alt+d', command: 'a', when: 'editorTextFocus && !editorReadonly' },
			{ key: 'alt+a', command: 'a', when: 'editorTextFocus' }
		]);
		const remoteContent = stringify([
			{ key: 'alt+a', command: 'a', when: 'editorTextFocus' },
			{ key: 'alt+d', command: 'a', when: 'editorTextFocus && !editorReadonly' }
		]);
		const actual = mergeKeybindings(localContent, remoteContent, null);
		assert.ok(actual.hasChanges);
		assert.ok(actual.hasConflicts);
		assert.equal(actual.mergeContent,
			`[
<<<<<<< local
	{
		"key": "alt+d",
		"command": "a",
		"when": "editorTextFocus && !editorReadonly"
	},
	{
		"key": "alt+a",
		"command": "a",
		"when": "editorTextFocus"
	},
=======
	{
		"key": "alt+a",
		"command": "a",
		"when": "editorTextFocus"
	},
	{
		"key": "alt+d",
		"command": "a",
		"when": "editorTextFocus && !editorReadonly"
	}
>>>>>>> remote
]`);
	});

	test('merge when the entry is removed in local but updated in remote', () => {
		const baseContent = stringify([{ key: 'alt+d', command: 'a', when: 'editorTextFocus && !editorReadonly' }]);
		const localContent = stringify([]);
		const remoteContent = stringify([{ key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' }]);
		const actual = mergeKeybindings(localContent, remoteContent, baseContent);
		//'[\n<<<<<<< local\n\n=======\t{\n\t\t"key": "alt+c",\n\t\t"command": "a",\n\t\t"when": "editorTextFocus && !editorReadonly"\n\t}\n>>>>>>> remote\n]'
		//'[\n<<<<<<< local\n=======\n\t{\n\t\t"key": "alt+c",\n\t\t"command": "a",\n\t\t"when": "editorTextFocus && !editorReadonly"\n\t}\n>>>>>>> remote\n]'
		assert.ok(actual.hasChanges);
		assert.ok(actual.hasConflicts);
		assert.equal(actual.mergeContent,
			`[
<<<<<<< local
=======
	{
		"key": "alt+c",
		"command": "a",
		"when": "editorTextFocus && !editorReadonly"
	}
>>>>>>> remote
]`);
	});

	test('merge when the entry is removed in local but updated in remote and a new entry is added in local', () => {
		const baseContent = stringify([{ key: 'alt+d', command: 'a', when: 'editorTextFocus && !editorReadonly' }]);
		const localContent = stringify([{ key: 'alt+b', command: 'b' }]);
		const remoteContent = stringify([{ key: 'alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' }]);
		const actual = mergeKeybindings(localContent, remoteContent, baseContent);
		assert.ok(actual.hasChanges);
		assert.ok(actual.hasConflicts);
		assert.equal(actual.mergeContent,
			`[
	{
		"key": "alt+b",
		"command": "b"
	},
<<<<<<< local
=======
	{
		"key": "alt+c",
		"command": "a",
		"when": "editorTextFocus && !editorReadonly"
	}
>>>>>>> remote
]`);
	});

});

function stringify(value: any): any {
	return JSON.stringify(value, null, '\t');
}
