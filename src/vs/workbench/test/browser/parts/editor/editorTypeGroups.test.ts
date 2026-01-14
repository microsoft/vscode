/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { EditorTypeGroupRegistry, EditorTypeGroupIds, IEditorTypeGroup, DEFAULT_TEXT_EDITORS_GROUP } from '../../../../browser/parts/editor/editorTypeGroups.js';
import { Codicon } from '../../../../../base/common/codicons.js';

suite('EditorTypeGroupRegistry', () => {

	const disposables = new DisposableStore();

	class TestTypedEditorInput extends EditorInput {
		readonly resource = undefined;

		constructor(
			public id: string,
			private _typeId: string,
			private _editorId?: string
		) {
			super();
		}

		override get typeId() { return this._typeId; }
		override get editorId() { return this._editorId; }
		override async resolve(): Promise<IDisposable> { return null!; }

		override matches(other: TestTypedEditorInput): boolean {
			return other && this.id === other.id && other instanceof TestTypedEditorInput;
		}
	}

	function createTypedInput(id: string, typeId: string, editorId?: string): TestTypedEditorInput {
		return disposables.add(new TestTypedEditorInput(id, typeId, editorId));
	}

	teardown(() => {
		disposables.clear();
	});

	test('Default type groups are registered on construction', () => {
		const registry = disposables.add(new EditorTypeGroupRegistry());

		const groups = registry.getTypeGroups();

		// Should have default groups
		assert.ok(groups.length >= 5);

		// Should have specific default groups
		assert.ok(registry.getTypeGroupById(EditorTypeGroupIds.TextEditors));
		assert.ok(registry.getTypeGroupById(EditorTypeGroupIds.Terminals));
		assert.ok(registry.getTypeGroupById(EditorTypeGroupIds.Browsers));
		assert.ok(registry.getTypeGroupById(EditorTypeGroupIds.Webviews));
		assert.ok(registry.getTypeGroupById(EditorTypeGroupIds.MultiDiff));
	});

	test('getTypeGroups() returns groups sorted by priority', () => {
		const registry = disposables.add(new EditorTypeGroupRegistry());

		const groups = registry.getTypeGroups();

		// Verify sorted by priority (ascending)
		for (let i = 1; i < groups.length; i++) {
			assert.ok(groups[i - 1].priority <= groups[i].priority,
				`Group ${groups[i - 1].id} (priority ${groups[i - 1].priority}) should come before ${groups[i].id} (priority ${groups[i].priority})`);
		}

		// TextEditors should be first (priority 0)
		assert.strictEqual(groups[0].id, EditorTypeGroupIds.TextEditors);
	});

	test('getTypeGroupById() returns correct group or undefined', () => {
		const registry = disposables.add(new EditorTypeGroupRegistry());

		const terminalsGroup = registry.getTypeGroupById(EditorTypeGroupIds.Terminals);
		assert.ok(terminalsGroup);
		assert.strictEqual(terminalsGroup.id, EditorTypeGroupIds.Terminals);
		assert.strictEqual(terminalsGroup.label, 'Terminals');

		const unknownGroup = registry.getTypeGroupById('nonExistent');
		assert.strictEqual(unknownGroup, undefined);
	});

	test('registerTypeGroup() adds new group and fires onDidChange', () => {
		const registry = disposables.add(new EditorTypeGroupRegistry());

		const customGroup: IEditorTypeGroup = {
			id: 'customGroup',
			label: 'Custom Group',
			icon: Codicon.beaker,
			priority: 100,
			typeIdPatterns: ['custom.editor.type']
		};

		let changeEventFired = false;
		disposables.add(registry.onDidChange(() => {
			changeEventFired = true;
		}));

		const disposable = registry.registerTypeGroup(customGroup);
		disposables.add(disposable);

		assert.strictEqual(changeEventFired, true);

		const registered = registry.getTypeGroupById('customGroup');
		assert.ok(registered);
		assert.strictEqual(registered.label, 'Custom Group');
		assert.strictEqual(registered.priority, 100);

		// Verify it's in the sorted list
		const groups = registry.getTypeGroups();
		assert.ok(groups.some(g => g.id === 'customGroup'));
	});

	test('registerTypeGroup() throws if duplicate ID', () => {
		const registry = disposables.add(new EditorTypeGroupRegistry());

		const duplicateGroup: IEditorTypeGroup = {
			id: EditorTypeGroupIds.Terminals, // Already exists
			label: 'Duplicate Terminals',
			icon: Codicon.terminal,
			priority: 50,
			typeIdPatterns: ['duplicate.terminal']
		};

		assert.throws(() => {
			registry.registerTypeGroup(duplicateGroup);
		}, /already registered/);
	});

	test('Unregistering via returned disposable removes group and fires onDidChange', () => {
		const registry = disposables.add(new EditorTypeGroupRegistry());

		const customGroup: IEditorTypeGroup = {
			id: 'tempGroup',
			label: 'Temporary Group',
			icon: Codicon.beaker,
			priority: 100,
			typeIdPatterns: ['temp.editor.type']
		};

		const disposable = registry.registerTypeGroup(customGroup);

		// Verify it's registered
		assert.ok(registry.getTypeGroupById('tempGroup'));

		let changeEventFired = false;
		disposables.add(registry.onDidChange(() => {
			changeEventFired = true;
		}));

		// Unregister
		disposable.dispose();

		assert.strictEqual(changeEventFired, true);
		assert.strictEqual(registry.getTypeGroupById('tempGroup'), undefined);

		// Verify it's not in the sorted list
		const groups = registry.getTypeGroups();
		assert.ok(!groups.some(g => g.id === 'tempGroup'));
	});

	test('getTypeGroupForEditor() exact match on typeId', () => {
		const registry = disposables.add(new EditorTypeGroupRegistry());

		const terminalEditor = createTypedInput('t1', 'workbench.editors.terminal');

		const group = registry.getTypeGroupForEditor(terminalEditor);

		assert.strictEqual(group.id, EditorTypeGroupIds.Terminals);
	});

	test('getTypeGroupForEditor() exact match on editorId', () => {
		const registry = disposables.add(new EditorTypeGroupRegistry());

		// Register a group that matches by editorId pattern
		const customGroup: IEditorTypeGroup = {
			id: 'editorIdMatched',
			label: 'Editor ID Matched',
			icon: Codicon.file,
			priority: 5,
			typeIdPatterns: ['my.special.editorId']
		};
		disposables.add(registry.registerTypeGroup(customGroup));

		const editor = createTypedInput('e1', 'someTypeId', 'my.special.editorId');

		const group = registry.getTypeGroupForEditor(editor);

		assert.strictEqual(group.id, 'editorIdMatched');
	});

	test('getTypeGroupForEditor() prefix match with * pattern', () => {
		const registry = disposables.add(new EditorTypeGroupRegistry());

		// Register a group with prefix pattern
		const prefixGroup: IEditorTypeGroup = {
			id: 'prefixMatched',
			label: 'Prefix Matched',
			icon: Codicon.folder,
			priority: 5,
			typeIdPatterns: ['vscode.notebook.*']
		};
		disposables.add(registry.registerTypeGroup(prefixGroup));

		const notebookEditor = createTypedInput('nb1', 'vscode.notebook.jupyter');

		const group = registry.getTypeGroupForEditor(notebookEditor);

		assert.strictEqual(group.id, 'prefixMatched');

		// Non-matching should not match
		const otherEditor = createTypedInput('o1', 'vscode.notebookXYZ');
		const otherGroup = registry.getTypeGroupForEditor(otherEditor);
		assert.notStrictEqual(otherGroup.id, 'prefixMatched');
	});

	test('getTypeGroupForEditor() returns TextEditors fallback for unmatched editors', () => {
		const registry = disposables.add(new EditorTypeGroupRegistry());

		const unknownEditor = createTypedInput('u1', 'some.unknown.editor.type');

		const group = registry.getTypeGroupForEditor(unknownEditor);

		assert.strictEqual(group.id, EditorTypeGroupIds.TextEditors);
	});

	test('getTypeGroupForEditor() with multiple patterns in a group', () => {
		const registry = disposables.add(new EditorTypeGroupRegistry());

		// Browsers group has multiple patterns
		const simpleBrowserEditor = createTypedInput('sb1', 'mainThreadWebview-simpleBrowser.view');
		const browserPreviewEditor = createTypedInput('bp1', 'mainThreadWebview-browserPreview');

		const simpleBrowserGroup = registry.getTypeGroupForEditor(simpleBrowserEditor);
		const browserPreviewGroup = registry.getTypeGroupForEditor(browserPreviewEditor);

		assert.strictEqual(simpleBrowserGroup.id, EditorTypeGroupIds.Browsers);
		assert.strictEqual(browserPreviewGroup.id, EditorTypeGroupIds.Browsers);
	});

	test('getTypeGroupForEditor() priority ordering affects matching', () => {
		const registry = disposables.add(new EditorTypeGroupRegistry());

		// Register two groups that could match the same editor
		const lowPriorityGroup: IEditorTypeGroup = {
			id: 'lowPriority',
			label: 'Low Priority',
			icon: Codicon.file,
			priority: 200,
			typeIdPatterns: ['test.editor.*']
		};
		const highPriorityGroup: IEditorTypeGroup = {
			id: 'highPriority',
			label: 'High Priority',
			icon: Codicon.file,
			priority: 1, // Lower number = higher priority
			typeIdPatterns: ['test.editor.specific']
		};

		disposables.add(registry.registerTypeGroup(lowPriorityGroup));
		disposables.add(registry.registerTypeGroup(highPriorityGroup));

		const editor = createTypedInput('te1', 'test.editor.specific');

		const group = registry.getTypeGroupForEditor(editor);

		// Should match high priority first due to exact match and lower priority number
		assert.strictEqual(group.id, 'highPriority');
	});

	test('DEFAULT_TEXT_EDITORS_GROUP has correct properties', () => {
		assert.strictEqual(DEFAULT_TEXT_EDITORS_GROUP.id, EditorTypeGroupIds.TextEditors);
		assert.strictEqual(DEFAULT_TEXT_EDITORS_GROUP.priority, 0);
		assert.ok(DEFAULT_TEXT_EDITORS_GROUP.typeIdPatterns.length === 0); // Fallback group
	});

	test('Multiple dispose calls are safe', () => {
		const registry = disposables.add(new EditorTypeGroupRegistry());

		const customGroup: IEditorTypeGroup = {
			id: 'multiDisposeTest',
			label: 'Multi Dispose Test',
			icon: Codicon.beaker,
			priority: 100,
			typeIdPatterns: ['multi.dispose.test']
		};

		const disposable = registry.registerTypeGroup(customGroup);

		// First dispose should work
		disposable.dispose();
		assert.strictEqual(registry.getTypeGroupById('multiDisposeTest'), undefined);

		// Second dispose should be safe (no-op)
		disposable.dispose();
		assert.strictEqual(registry.getTypeGroupById('multiDisposeTest'), undefined);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
