/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {EditorStacksModel, IEditorStacksModel, IEditorGroup, setOpenEditorDirection, Direction} from 'vs/workbench/common/editor/editorStacksModel';
import {EditorInput} from 'vs/workbench/common/editor';
import {TestStorageService} from 'vs/workbench/test/common/servicesTestUtils';
import {InstantiationService} from 'vs/platform/instantiation/common/instantiationService';
import {ServiceCollection} from 'vs/platform/instantiation/common/serviceCollection';
import {IStorageService} from 'vs/platform/storage/common/storage';
import {ILifecycleService, NullLifecycleService} from 'vs/platform/lifecycle/common/lifecycle';

function create(): IEditorStacksModel {
	let services = new ServiceCollection();
	services.set(IStorageService, new TestStorageService());
	services.set(ILifecycleService, NullLifecycleService);

	let inst = new InstantiationService(services);

	return inst.createInstance(EditorStacksModel);
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
	constructor(public id: string) {
		super();
	}
	public getId() { return 'id'; }
	public resolve() { return null; }
}

function input(id = String(index++)): EditorInput {
	return new TestEditorInput(id);
}

suite('Editor Stacks Model', () => {

	teardown(() => {
		index = 1;
		setOpenEditorDirection(Direction.RIGHT);
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

		assert.equal(group.count, 0);
		assert.equal(group.getEditors(true).length, 0);

		// Active && Pinned
		const input1 = input();
		group.openEditor(input1, { active: true, pinned: true });

		assert.equal(group.count, 1);
		assert.equal(group.getEditors(true).length, 1);
		assert.equal(group.activeEditor, input1);
		assert.equal(group.isActive(input1), true);
		assert.equal(group.isPreview(input1), false);
		assert.equal(group.isPinned(input1), true);

		assert.equal(events.opened[0], input1);
		assert.equal(events.activated[0], input1);

		group.closeEditor(input1);
		assert.equal(group.count, 0);
		assert.equal(group.getEditors(true).length, 0);
		assert.equal(group.activeEditor, void 0);
		assert.equal(events.closed[0], input1);

		// Active && Preview
		const input2 = input();
		group.openEditor(input2, { active: true, pinned: false });

		assert.equal(group.count, 1);
		assert.equal(group.getEditors(true).length, 1);
		assert.equal(group.activeEditor, input2);
		assert.equal(group.isActive(input2), true);
		assert.equal(group.isPreview(input2), true);
		assert.equal(group.isPinned(input2), false);

		assert.equal(events.opened[1], input2);
		assert.equal(events.activated[1], input2);

		group.closeEditor(input2);
		assert.equal(group.count, 0);
		assert.equal(group.getEditors(true).length, 0);
		assert.equal(group.activeEditor, void 0);
		assert.equal(events.closed[1], input2);

		group.closeEditor(input2);
		assert.equal(group.count, 0);
		assert.equal(group.getEditors(true).length, 0);
		assert.equal(group.activeEditor, void 0);
		assert.equal(events.closed[1], input2);

		// Nonactive && Pinned => gets active because its first editor
		const input3 = input();
		group.openEditor(input3, { active: false, pinned: true });

		assert.equal(group.count, 1);
		assert.equal(group.getEditors(true).length, 1);
		assert.equal(group.activeEditor, input3);
		assert.equal(group.isActive(input3), true);
		assert.equal(group.isPreview(input3), false);
		assert.equal(group.isPinned(input3), true);

		assert.equal(events.opened[2], input3);
		assert.equal(events.activated[2], input3);

		group.closeEditor(input3);
		assert.equal(group.count, 0);
		assert.equal(group.getEditors(true).length, 0);
		assert.equal(group.activeEditor, void 0);
		assert.equal(events.closed[2], input3);

		assert.equal(events.opened[2], input3);
		assert.equal(events.activated[2], input3);

		group.closeEditor(input3);
		assert.equal(group.count, 0);
		assert.equal(group.getEditors(true).length, 0);
		assert.equal(group.activeEditor, void 0);
		assert.equal(events.closed[2], input3);

		// Nonactive && Preview => gets active because its first editor
		const input4 = input();
		group.openEditor(input4);

		assert.equal(group.count, 1);
		assert.equal(group.getEditors(true).length, 1);
		assert.equal(group.activeEditor, input4);
		assert.equal(group.isActive(input4), true);
		assert.equal(group.isPreview(input4), true);
		assert.equal(group.isPinned(input4), false);

		assert.equal(events.opened[3], input4);
		assert.equal(events.activated[3], input4);

		group.closeEditor(input4);
		assert.equal(group.count, 0);
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

		assert.equal(group.count, 3);
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

	test('Stack - Multiple Editors - Pinned and Active (DEFAULT_OPEN_EDITOR_DIRECTION = Direction.LEFT)', function () {
		setOpenEditorDirection(Direction.LEFT);

		const model = create();
		const group = model.openGroup('group');

		const input1 = input();
		const input2 = input();
		const input3 = input();

		// Pinned and Active
		group.openEditor(input1, { pinned: true, active: true });
		group.openEditor(input2, { pinned: true, active: true });
		group.openEditor(input3, { pinned: true, active: true });

		assert.equal(group.getEditors()[0], input3);
		assert.equal(group.getEditors()[1], input2);
		assert.equal(group.getEditors()[2], input1);
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

		assert.equal(group.count, 3);
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

		assert.equal(group.count, 1);
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
		assert.equal(group.count, 3);

		group.pin(input3);

		assert.equal(group.activeEditor, input3);
		assert.equal(group.isPinned(input3), true);
		assert.equal(group.isPreview(input3), false);
		assert.equal(group.isActive(input3), true);
		assert.equal(events.pinned[0], input3);
		assert.equal(group.count, 3);

		group.unpin(input1);

		assert.equal(group.activeEditor, input3);
		assert.equal(group.isPinned(input1), false);
		assert.equal(group.isPreview(input1), true);
		assert.equal(group.isActive(input1), false);
		assert.equal(events.unpinned[0], input1);
		assert.equal(group.count, 3);

		group.unpin(input2);

		assert.equal(group.activeEditor, input3);
		assert.equal(group.count, 2); // 2 previews got merged into one
		assert.equal(group.getEditors()[0], input2);
		assert.equal(group.getEditors()[1], input3);
		assert.equal(events.closed[0], input1);
		assert.equal(group.count, 2);

		group.unpin(input3);

		assert.equal(group.activeEditor, input3);
		assert.equal(group.count, 1); // pinning replaced the preview
		assert.equal(group.getEditors()[0], input3);
		assert.equal(events.closed[1], input2);
		assert.equal(group.count, 1);
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
		assert.equal(group.count, 5);

		group.closeEditor(input5);
		assert.equal(group.activeEditor, input4);
		assert.equal(events.activated[5], input4);
		assert.equal(group.count, 4);

		group.setActive(input1);
		group.setActive(input4);
		group.closeEditor(input4);

		assert.equal(group.activeEditor, input1);
		assert.equal(group.count, 3);

		group.closeEditor(input1);

		assert.equal(group.activeEditor, input3);
		assert.equal(group.count, 2);

		group.setActive(input2);
		group.closeEditor(input2);

		assert.equal(group.activeEditor, input3);
		assert.equal(group.count, 1);

		group.closeEditor(input3);

		assert.ok(!group.activeEditor);
		assert.equal(group.count, 0);
	});

	test('Stack - Multiple Editors - Pinned & Non Active', function () {
		const model = create();
		const group = model.openGroup('group');


		const input1 = input();
		group.openEditor(input1);
		assert.equal(group.activeEditor, input1);
		assert.equal(group.previewEditor, input1);
		assert.equal(group.getEditors()[0], input1);
		assert.equal(group.count, 1);

		const input2 = input();
		group.openEditor(input2, { pinned: true, active: false });
		assert.equal(group.activeEditor, input1);
		assert.equal(group.previewEditor, input1);
		assert.equal(group.getEditors()[0], input1);
		assert.equal(group.getEditors()[1], input2);
		assert.equal(group.count, 2);

		const input3 = input();
		group.openEditor(input3, { pinned: true, active: false });
		assert.equal(group.activeEditor, input1);
		assert.equal(group.previewEditor, input1);
		assert.equal(group.getEditors()[0], input1);
		assert.equal(group.getEditors()[1], input3);
		assert.equal(group.getEditors()[2], input2);
		assert.equal(group.isPinned(input1), false);
		assert.equal(group.isPinned(input2), true);
		assert.equal(group.isPinned(input3), true);
		assert.equal(group.count, 3);
	});

	test('Stack - Multiple Editors - real user example', function () {
		const model = create();
		const group = model.openGroup('group');

		// [] -> /index.html/
		const indexHtml = input('index.html');
		group.openEditor(indexHtml);
		assert.equal(group.activeEditor, indexHtml);
		assert.equal(group.previewEditor, indexHtml);
		assert.equal(group.getEditors()[0], indexHtml);
		assert.equal(group.count, 1);

		// /index.html/ -> /style.css/
		const styleCss = input('style.css');
		group.openEditor(styleCss);
		assert.equal(group.activeEditor, styleCss);
		assert.equal(group.previewEditor, styleCss);
		assert.equal(group.getEditors()[0], styleCss);
		assert.equal(group.count, 1);

		// /style.css/ -> [/style.css/, test.js]
		const testJs = input('test.js');
		group.openEditor(testJs, { active: true, pinned: true });
		assert.equal(group.previewEditor, styleCss);
		assert.equal(group.activeEditor, testJs);
		assert.equal(group.isPreview(styleCss), true);
		assert.equal(group.isPinned(testJs), true);
		assert.equal(group.getEditors()[0], styleCss);
		assert.equal(group.getEditors()[1], testJs);
		assert.equal(group.count, 2);

		// [/style.css/, test.js] -> [/indexHtml/, test.js]
		group.openEditor(indexHtml, { active: true });
		assert.equal(group.activeEditor, indexHtml);
		assert.equal(group.previewEditor, indexHtml);
		assert.equal(group.isPreview(indexHtml), true);
		assert.equal(group.isPinned(testJs), true);
		assert.equal(group.getEditors()[0], indexHtml);
		assert.equal(group.getEditors()[1], testJs);
		assert.equal(group.count, 2);

		// make test.js active
		group.setActive(testJs);
		assert.equal(group.activeEditor, testJs);
		assert.equal(group.isActive(testJs), true);
		assert.equal(group.count, 2);

		// [/indexHtml/, test.js] -> [indexHtml, test.js]
		group.pin(indexHtml);
		assert.equal(group.isPinned(indexHtml), true);
		assert.equal(group.isPreview(indexHtml), false);
		assert.equal(group.activeEditor, testJs);

		// [indexHtml, test.js] -> [indexHtml, test.js, file.ts]
		const fileTs = input('file.ts');
		group.openEditor(fileTs, { active: true, pinned: true });
		assert.equal(group.isPinned(fileTs), true);
		assert.equal(group.isPreview(fileTs), false);
		assert.equal(group.count, 3);
		assert.equal(group.activeEditor, fileTs);

		// [indexHtml, test.js, file.ts] -> [indexHtml, test.js, /file.ts/]
		group.unpin(fileTs);
		assert.equal(group.count, 3);
		assert.equal(group.isPinned(fileTs), false);
		assert.equal(group.isPreview(fileTs), true);
		assert.equal(group.activeEditor, fileTs);

		// [indexHtml, test.js, /file.ts/] -> [indexHtml, test.js, /other.ts/]
		const otherTs = input('other.ts');
		group.openEditor(otherTs, { active: true });
		assert.equal(group.count, 3);
		assert.equal(group.activeEditor, otherTs);
		assert.equal(group.getEditors()[0], indexHtml);
		assert.equal(group.getEditors()[1], testJs);
		assert.equal(group.getEditors()[2], otherTs);

		// make index.html active
		group.setActive(indexHtml);
		assert.equal(group.activeEditor, indexHtml);

		// [indexHtml, test.js, /file.ts/] -> [test.js, /other.ts/]
		group.closeEditor(indexHtml);
		assert.equal(group.count, 2);
		assert.equal(group.activeEditor, otherTs);
		assert.equal(group.getEditors()[0], testJs);
		assert.equal(group.getEditors()[1], otherTs);

		// [test.js, /other.ts/] -> [test.js]
		group.closeEditor(otherTs);
		assert.equal(group.count, 1);
		assert.equal(group.activeEditor, testJs);
		assert.equal(group.getEditors()[0], testJs);

		// [test.js] -> /test.js/
		group.unpin(testJs);
		assert.equal(group.count, 1);
		assert.equal(group.activeEditor, testJs);
		assert.equal(group.getEditors()[0], testJs);
		assert.equal(group.isPinned(testJs), false);
		assert.equal(group.isPreview(testJs), true);

		// /test.js/ -> []
		group.closeEditor(testJs);
		assert.equal(group.count, 0);
		assert.equal(group.activeEditor, null);
		assert.equal(group.previewEditor, null);
	});
});