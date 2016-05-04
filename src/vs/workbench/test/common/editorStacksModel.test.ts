/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {EditorStacksModel, IEditorStacksModel, IEditorGroup} from 'vs/workbench/common/editor/editorStacksModel';
import {EditorInput} from 'vs/workbench/common/editor';

function create(): IEditorStacksModel {
	return new EditorStacksModel();
}

interface ModelEvents {
	opened: IEditorGroup[];
	activated: IEditorGroup[];
	closed: IEditorGroup[];
}

interface GroupEvents {
	opened: EditorInput[];
	activated: EditorInput[];
	closed: EditorInput[];
	pinned: EditorInput[];
	unpinned: EditorInput[];
}

function modelListener(model: IEditorStacksModel): ModelEvents {
	const modelEvents = {
		opened: [],
		activated: [],
		closed: []
	};

	model.onGroupOpened(g => modelEvents.opened.push(g));
	model.onGroupActivated(g => modelEvents.activated.push(g));
	model.onGroupClosed(g => modelEvents.closed.push(g));

	return modelEvents;
}

function groupListener(group: IEditorGroup): GroupEvents {
	const groupEvents = {
		opened: [],
		closed: [],
		activated: [],
		pinned: [],
		unpinned: []
	};

	group.onEditorOpened(e => groupEvents.opened.push(e));
	group.onEditorClosed(e => groupEvents.closed.push(e));
	group.onEditorActivated(e => groupEvents.activated.push(e));
	group.onEditorPinned(e => groupEvents.pinned.push(e));
	group.onEditorUnpinned(e => groupEvents.unpinned.push(e));

	return groupEvents;
}

let index = 0;
class TestEditorInput extends EditorInput {
	public id = index++;
	public getId() { return 'id'; }
	public resolve() { return null; }
}

function input(): EditorInput {
	return new TestEditorInput();
}

suite('Editor Stacks Model', () => {

	teardown(() => {
		index = 0;
	});

	test('Groups', function () {
		const model = create();
		const events = modelListener(model);

		assert.equal(model.groups.length, 0);
		assert.ok(!model.activeGroup);

		const first = model.openGroup('first');
		assert.equal(events.opened[0], first);
		assert.equal(events.activated[0], first);
		assert.equal(model.activeGroup, first);
		assert.equal(model.groups.length, 1);
		assert.equal(model.groups[0], first);

		const second = model.openGroup('second');
		assert.equal(events.opened[1], second);
		assert.equal(events.activated[1], second);
		assert.equal(model.activeGroup, second);
		assert.equal(model.groups.length, 2);
		assert.equal(model.groups[1], second);

		const third = model.openGroup('third');
		assert.equal(events.opened[2], third);
		assert.equal(events.activated[2], third);
		assert.equal(model.activeGroup, third);
		assert.equal(model.groups.length, 3);
		assert.equal(model.groups[2], third);

		model.closeGroup(first);
		assert.equal(events.closed[0], first);
		assert.equal(model.groups.length, 2);
		assert.equal(model.activeGroup, third);
		assert.equal(model.groups[0], second);
		assert.equal(model.groups[1], third);

		model.closeGroup(third);
		assert.equal(events.closed[1], third);
		assert.equal(events.activated[3], second);
		assert.equal(model.activeGroup, second);
		assert.equal(model.groups.length, 1);
		assert.equal(model.groups[0], second);

		const fourth = model.openGroup('fourth');
		assert.equal(fourth, model.activeGroup);
		model.closeGroup(fourth);
		assert.equal(second, model.activeGroup);
	});

	test('Stack - One Editor', function () {
		const model = create();
		const group = model.openGroup('group');
		const events = groupListener(group);

		assert.equal(group.getEditors().length, 0);
		assert.equal(group.getEditors(true).length, 0);

		// Active && Pinned
		const input1 = input();
		group.openEditor(input1, { active: true, pinned: true });

		assert.equal(group.getEditors().length, 1);
		assert.equal(group.getEditors(true).length, 1);
		assert.equal(group.activeEditor, input1);
		assert.equal(group.isActive(input1), true);
		assert.equal(group.isPreview(input1), false);
		assert.equal(group.isPinned(input1), true);

		assert.equal(events.opened[0], input1);
		assert.equal(events.activated[0], input1);

		group.closeEditor(input1);
		assert.equal(group.getEditors().length, 0);
		assert.equal(group.getEditors(true).length, 0);
		assert.equal(group.activeEditor, void 0);
		assert.equal(events.closed[0], input1);

		// Active && Preview
		const input2 = input();
		group.openEditor(input2, { active: true, pinned: false });

		assert.equal(group.getEditors().length, 1);
		assert.equal(group.getEditors(true).length, 1);
		assert.equal(group.activeEditor, input2);
		assert.equal(group.isActive(input2), true);
		assert.equal(group.isPreview(input2), true);
		assert.equal(group.isPinned(input2), false);

		assert.equal(events.opened[1], input2);
		assert.equal(events.activated[1], input2);

		group.closeEditor(input2);
		assert.equal(group.getEditors().length, 0);
		assert.equal(group.getEditors(true).length, 0);
		assert.equal(group.activeEditor, void 0);
		assert.equal(events.closed[1], input2);

		group.closeEditor(input2);
		assert.equal(group.getEditors().length, 0);
		assert.equal(group.getEditors(true).length, 0);
		assert.equal(group.activeEditor, void 0);
		assert.equal(events.closed[1], input2);

		// Nonactive && Pinned => gets active because its first editor
		const input3 = input();
		group.openEditor(input3, { active: false, pinned: true });

		assert.equal(group.getEditors().length, 1);
		assert.equal(group.getEditors(true).length, 1);
		assert.equal(group.activeEditor, input3);
		assert.equal(group.isActive(input3), true);
		assert.equal(group.isPreview(input3), false);
		assert.equal(group.isPinned(input3), true);

		assert.equal(events.opened[2], input3);
		assert.equal(events.activated[2], input3);

		group.closeEditor(input3);
		assert.equal(group.getEditors().length, 0);
		assert.equal(group.getEditors(true).length, 0);
		assert.equal(group.activeEditor, void 0);
		assert.equal(events.closed[2], input3);

		assert.equal(events.opened[2], input3);
		assert.equal(events.activated[2], input3);

		group.closeEditor(input3);
		assert.equal(group.getEditors().length, 0);
		assert.equal(group.getEditors(true).length, 0);
		assert.equal(group.activeEditor, void 0);
		assert.equal(events.closed[2], input3);

		// Nonactive && Preview => gets active because its first editor
		const input4 = input();
		group.openEditor(input4);

		assert.equal(group.getEditors().length, 1);
		assert.equal(group.getEditors(true).length, 1);
		assert.equal(group.activeEditor, input4);
		assert.equal(group.isActive(input4), true);
		assert.equal(group.isPreview(input4), true);
		assert.equal(group.isPinned(input4), false);

		assert.equal(events.opened[3], input4);
		assert.equal(events.activated[3], input4);

		group.closeEditor(input4);
		assert.equal(group.getEditors().length, 0);
		assert.equal(group.getEditors(true).length, 0);
		assert.equal(group.activeEditor, void 0);
		assert.equal(events.closed[3], input4);
	});

	test('Stack - Multiple Editors - Pinned and Active', function () {
		const model = create();
		const group = model.openGroup('group');
		const events = groupListener(group);

		const input1 = input();
		const input2 = input();
		const input3 = input();

		// Pinned and Active
		group.openEditor(input1, { pinned: true, active: true });
		group.openEditor(input2, { pinned: true, active: true });
		group.openEditor(input3, { pinned: true, active: true });

		assert.equal(group.getEditors().length, 3);
		assert.equal(group.getEditors(true).length, 3);
		assert.equal(group.activeEditor, input3);
		assert.equal(group.isActive(input1), false);
		assert.equal(group.isPinned(input1), true);
		assert.equal(group.isPreview(input1), false);
		assert.equal(group.isActive(input2), false);
		assert.equal(group.isPinned(input2), true);
		assert.equal(group.isPreview(input2), false);
		assert.equal(group.isActive(input3), true);
		assert.equal(group.isPinned(input3), true);
		assert.equal(group.isPreview(input3), false);

		assert.equal(events.opened[0], input1);
		assert.equal(events.opened[1], input2);
		assert.equal(events.opened[2], input3);

		const mru = group.getEditors(true);
		assert.equal(mru[0], input3);
		assert.equal(mru[1], input2);
		assert.equal(mru[2], input1);
	});

	test('Stack - Multiple Editors - Pinned and Not Active', function () {
		const model = create();
		const group = model.openGroup('group');

		const input1 = input();
		const input2 = input();
		const input3 = input();

		// Pinned and Active
		group.openEditor(input1, { pinned: true });
		group.openEditor(input2, { pinned: true });
		group.openEditor(input3, { pinned: true });

		assert.equal(group.getEditors().length, 3);
		assert.equal(group.getEditors(true).length, 3);
		assert.equal(group.activeEditor, input1);
		assert.equal(group.isActive(input1), true);
		assert.equal(group.isPinned(input1), true);
		assert.equal(group.isPreview(input1), false);
		assert.equal(group.isActive(input2), false);
		assert.equal(group.isPinned(input2), true);
		assert.equal(group.isPreview(input2), false);
		assert.equal(group.isActive(input3), false);
		assert.equal(group.isPinned(input3), true);
		assert.equal(group.isPreview(input3), false);

		const mru = group.getEditors(true);
		assert.equal(mru[0], input1);
		assert.equal(mru[1], input2);
		assert.equal(mru[2], input3);
	});

	test('Stack - Multiple Editors - Preview gets overwritten', function () {
		const model = create();
		const group = model.openGroup('group');
		const events = groupListener(group);

		const input1 = input();
		const input2 = input();
		const input3 = input();

		// Non active, preview
		group.openEditor(input1); // becomes active, preview
		group.openEditor(input2); // overwrites preview
		group.openEditor(input3); // overwrites preview

		assert.equal(group.getEditors().length, 1);
		assert.equal(group.getEditors(true).length, 1);
		assert.equal(group.activeEditor, input3);
		assert.equal(group.isActive(input3), true);
		assert.equal(group.isPinned(input3), false);
		assert.equal(group.isPreview(input3), true);

		assert.equal(events.opened[0], input1);
		assert.equal(events.opened[1], input2);
		assert.equal(events.opened[2], input3);
		assert.equal(events.closed[0], input1);
		assert.equal(events.closed[1], input2);

		const mru = group.getEditors(true);
		assert.equal(mru[0], input3);
		assert.equal(mru.length, 1);
	});

	test('Stack - Multiple Editors - set active', function () {
		const model = create();
		const group = model.openGroup('group');
		const events = groupListener(group);

		const input1 = input();
		const input2 = input();
		const input3 = input();

		group.openEditor(input1, { pinned: true, active: true });
		group.openEditor(input2, { pinned: true, active: true });
		group.openEditor(input3, { pinned: false, active: true });

		assert.equal(group.activeEditor, input3);

		let mru = group.getEditors(true);
		assert.equal(mru[0], input3);
		assert.equal(mru[1], input2);
		assert.equal(mru[2], input1);

		group.setActive(input3);
		assert.equal(events.activated.length, 3);

		group.setActive(input1);
		assert.equal(events.activated[3], input1);
		assert.equal(group.activeEditor, input1);
		assert.equal(group.isActive(input1), true);
		assert.equal(group.isActive(input2), false);
		assert.equal(group.isActive(input3), false);

		mru = group.getEditors(true);
		assert.equal(mru[0], input1);
		assert.equal(mru[1], input3);
		assert.equal(mru[2], input2);
	});

	test('Stack - Multiple Editors - pin and unpin', function () {
		const model = create();
		const group = model.openGroup('group');
		const events = groupListener(group);

		const input1 = input();
		const input2 = input();
		const input3 = input();

		group.openEditor(input1, { pinned: true, active: true });
		group.openEditor(input2, { pinned: true, active: true });
		group.openEditor(input3, { pinned: false, active: true });

		assert.equal(group.activeEditor, input3);

		group.pin(input3);

		assert.equal(group.activeEditor, input3);
		assert.equal(group.isPinned(input3), true);
		assert.equal(group.isPreview(input3), false);
		assert.equal(group.isActive(input3), true);
		assert.equal(events.pinned[0], input3);

		group.unpin(input1);

		assert.equal(group.activeEditor, input3);
		assert.equal(group.isPinned(input1), false);
		assert.equal(group.isPreview(input1), true);
		assert.equal(group.isActive(input1), false);
		assert.equal(events.unpinned[0], input1);

		group.unpin(input2);

		assert.equal(group.activeEditor, input3);
		assert.equal(group.getEditors().length, 2); // 2 previews got merged into one
		assert.equal(group.getEditors()[0], input2);
		assert.equal(group.getEditors()[1], input3);
		assert.equal(events.closed[0], input1);

		group.unpin(input3);

		assert.equal(group.activeEditor, input3);
		assert.equal(group.getEditors().length, 1); // pinning replaced the preview
		assert.equal(group.getEditors()[0], input3);
		assert.equal(events.closed[1], input2);
	});

	test('Stack - Multiple Editors - closing picks next from MRU list', function () {
		const model = create();
		const group = model.openGroup('group');
		const events = groupListener(group);

		const input1 = input();
		const input2 = input();
		const input3 = input();
		const input4 = input();
		const input5 = input();

		group.openEditor(input1, { pinned: true, active: true });
		group.openEditor(input2, { pinned: true, active: true });
		group.openEditor(input3, { pinned: true, active: true });
		group.openEditor(input4, { pinned: true, active: true });
		group.openEditor(input5, { pinned: true, active: true });

		assert.equal(group.activeEditor, input5);
		assert.equal(group.getEditors(true)[0], input5);

		group.closeEditor(input5);
		assert.equal(group.activeEditor, input4);
		assert.equal(events.activated[5], input4);

		group.setActive(input1);
		group.setActive(input4);
		group.closeEditor(input4);

		assert.equal(group.activeEditor, input1);

		group.closeEditor(input1);

		assert.equal(group.activeEditor, input3);

		group.setActive(input2);
		group.closeEditor(input2);

		assert.equal(group.activeEditor, input3);

		group.closeEditor(input3);

		assert.ok(!group.activeEditor);
	});



// TODO Open to the left (set DEFAULT_OPEN_EDITOR_DIRECTION)
// TODO complex working sample covering all with comments


});