/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { EditorStacksModel, EditorGroup, GroupEvent } from 'vs/workbench/common/editor/editorStacksModel';
import { EditorInput, IFileEditorInput, IEditorIdentifier, IEditorGroup, IStacksModelChangeEvent, IEditorRegistry, Extensions as EditorExtensions, IEditorInputFactory } from 'vs/workbench/common/editor';
import URI from 'vs/base/common/uri';
import { TestStorageService, TestLifecycleService, TestContextService } from 'vs/workbench/test/workbenchTestServices';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { Registry } from 'vs/platform/platform';
import { Position, Direction } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import 'vs/workbench/browser/parts/editor/baseEditor';

function create(): EditorStacksModel {
	let inst = new TestInstantiationService();
	inst.stub(IStorageService, new TestStorageService());
	inst.stub(ILifecycleService, new TestLifecycleService());
	inst.stub(IWorkspaceContextService, new TestContextService());
	inst.stub(ITelemetryService, NullTelemetryService);

	const config = new TestConfigurationService();
	config.setUserConfiguration('workbench', { editor: { openPositioning: 'right' } });
	inst.stub(IConfigurationService, config);


	return inst.createInstance(EditorStacksModel, true);
}

interface ModelEvents {
	opened: IEditorGroup[];
	activated: IEditorGroup[];
	closed: IEditorGroup[];
	moved: IEditorGroup[];
	renamed: IEditorGroup[];
	disposed: IEditorIdentifier[];
	changed: IStacksModelChangeEvent[];
}

interface GroupEvents {
	opened: EditorInput[];
	activated: EditorInput[];
	closed: GroupEvent[];
	pinned: EditorInput[];
	unpinned: EditorInput[];
	moved: EditorInput[];
}

function modelListener(model: EditorStacksModel): ModelEvents {
	const modelEvents = {
		opened: [],
		activated: [],
		closed: [],
		moved: [],
		renamed: [],
		disposed: [],
		changed: []
	};

	model.onGroupOpened(g => modelEvents.opened.push(g));
	model.onGroupActivated(g => modelEvents.activated.push(g));
	model.onGroupClosed(g => modelEvents.closed.push(g));
	model.onGroupMoved(g => modelEvents.moved.push(g));
	model.onGroupRenamed(g => modelEvents.renamed.push(g));
	model.onEditorDisposed(e => modelEvents.disposed.push(e));
	model.onModelChanged(e => modelEvents.changed.push(e));

	return modelEvents;
}

function groupListener(group: EditorGroup): GroupEvents {
	const groupEvents = {
		opened: [],
		closed: [],
		activated: [],
		pinned: [],
		unpinned: [],
		moved: []
	};

	group.onEditorOpened(e => groupEvents.opened.push(e));
	group.onEditorClosed(e => groupEvents.closed.push(e));
	group.onEditorActivated(e => groupEvents.activated.push(e));
	group.onEditorPinned(e => groupEvents.pinned.push(e));
	group.onEditorUnpinned(e => groupEvents.unpinned.push(e));
	group.onEditorMoved(e => groupEvents.moved.push(e));

	return groupEvents;
}

let index = 0;
class TestEditorInput extends EditorInput {
	constructor(public id: string) {
		super();
	}
	public getTypeId() { return 'testEditorInput'; }
	public resolve() { return null; }

	public matches(other: TestEditorInput): boolean {
		return other && this.id === other.id && other instanceof TestEditorInput;
	}

	public setDirty(): void {
		this._onDidChangeDirty.fire();
	}

	public setLabel(): void {
		this._onDidChangeLabel.fire();
	}
}

class NonSerializableTestEditorInput extends EditorInput {
	constructor(public id: string) {
		super();
	}
	public getTypeId() { return 'testEditorInput-nonSerializable'; }
	public resolve() { return null; }

	public matches(other: TestEditorInput): boolean {
		return other && this.id === other.id && other instanceof NonSerializableTestEditorInput;
	}
}

class TestFileEditorInput extends EditorInput implements IFileEditorInput {

	constructor(public id: string, private resource: URI) {
		super();
	}
	public getTypeId() { return 'testFileEditorInput'; }
	public resolve() { return null; }

	public matches(other: TestEditorInput): boolean {
		return other && this.id === other.id && other instanceof TestFileEditorInput;
	}

	public setResource(r: URI): void {
	}

	public setEncoding(encoding: string) {
	}

	public getEncoding(): string {
		return null;
	}

	public setPreferredEncoding(encoding: string) {
	}

	public getResource(): URI {
		return this.resource;
	}
}

function input(id = String(index++), nonSerializable?: boolean, resource?: URI): EditorInput {
	if (resource) {
		return new TestFileEditorInput(id, resource);
	}

	return nonSerializable ? new NonSerializableTestEditorInput(id) : new TestEditorInput(id);
}

interface ISerializedTestInput {
	id: string;
}

class TestEditorInputFactory implements IEditorInputFactory {

	constructor() { }

	public serialize(editorInput: EditorInput): string {
		let testEditorInput = <TestEditorInput>editorInput;
		let testInput: ISerializedTestInput = {
			id: testEditorInput.id
		};

		return JSON.stringify(testInput);
	}

	public deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): EditorInput {
		let testInput: ISerializedTestInput = JSON.parse(serializedEditorInput);

		return new TestEditorInput(testInput.id);
	}
}

(<IEditorRegistry>Registry.as(EditorExtensions.Editors)).registerEditorInputFactory('testEditorInput', TestEditorInputFactory);

suite('Editor Stacks Model', () => {

	teardown(() => {
		index = 1;
	});

	test('Groups - Basic', function () {
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

		model.closeGroup(second);
		assert.equal(model.groups.length, 0);

		model.openGroup('first');
		model.openGroup('second');
		model.openGroup('third');
		model.openGroup('fourth');

		assert.equal(model.groups.length, 4);

		model.closeGroups();

		assert.equal(model.groups.length, 0);
	});

	test('Groups - Close Group sends move event for others to the right', function () {
		const model = create();
		const events = modelListener(model);

		const first = model.openGroup('first');
		model.openGroup('second');
		const third = model.openGroup('third');

		model.closeGroup(first);
		assert.equal(events.moved.length, 2);

		model.closeGroup(third);
		assert.equal(events.moved.length, 2);
	});

	test('Groups - Move Groups', function () {
		const model = create();
		const events = modelListener(model);

		model.openGroup('first');
		const group2 = model.openGroup('second');

		model.renameGroup(group2, 'renamed');

		assert.equal(group2.label, 'renamed');
		assert.equal(group2, events.renamed[0]);
	});

	test('Groups - Position of Group', function () {
		const model = create();

		const group1 = model.openGroup('first');
		const group2 = model.openGroup('second');
		const group3 = model.openGroup('third');

		assert.equal(Position.ONE, model.positionOfGroup(group1));
		assert.equal(Position.TWO, model.positionOfGroup(group2));
		assert.equal(Position.THREE, model.positionOfGroup(group3));
	});

	test('Groups - Rename Group', function () {
		const model = create();

		const group1 = model.openGroup('first');
		const group2 = model.openGroup('second');

		model.moveGroup(group1, 1);
		assert.equal(model.groups[0], group2);
		assert.equal(model.groups[1], group1);

		model.moveGroup(group1, 0);
		assert.equal(model.groups[0], group1);
		assert.equal(model.groups[1], group2);

		const group3 = model.openGroup('third');

		model.moveGroup(group1, 2);

		assert.equal(model.groups[0], group2);
		assert.equal(model.groups[1], group3);
		assert.equal(model.groups[2], group1);
	});

	test('Groups - Move Group sends move events for all moved groups', function () {
		const model = create();
		let events = modelListener(model);

		let group1 = model.openGroup('first');
		let group2 = model.openGroup('second');
		let group3 = model.openGroup('third');

		model.moveGroup(group1, 1);
		assert.equal(events.moved.length, 2);

		model.closeGroups();

		events = modelListener(model);
		group1 = model.openGroup('first');
		group2 = model.openGroup('second');
		group3 = model.openGroup('third');

		model.moveGroup(group1, 2);
		assert.equal(events.moved.length, 3);

		model.closeGroups();

		events = modelListener(model);
		group1 = model.openGroup('first');
		group2 = model.openGroup('second');
		group3 = model.openGroup('third');

		model.moveGroup(group3, 1);
		assert.equal(events.moved.length, 2);
	});

	test('Groups - Event Aggregation', function () {
		const model = create();

		let groupEvents: IStacksModelChangeEvent[] = [];
		let count = groupEvents.length;
		model.onModelChanged(group => {
			groupEvents.push(group);
		});

		const first = model.openGroup('first');
		assert.ok(groupEvents.length > count);
		count = groupEvents.length;

		const second = model.openGroup('second');
		assert.ok(groupEvents.length > count);
		count = groupEvents.length;

		model.renameGroup(second, 'renamed');
		assert.ok(groupEvents.length > count);
		count = groupEvents.length;

		const input1 = input();
		first.openEditor(input1);
		assert.ok(groupEvents.length > count);
		count = groupEvents.length;

		first.closeEditor(input1);
		assert.ok(groupEvents.length > count);
		count = groupEvents.length;

		model.closeGroup(second);
		assert.ok(groupEvents.length > count);
	});

	test('Groups - Open group but do not set active', function () {
		const model = create();
		const events = modelListener(model);

		const group1 = model.openGroup('first');
		model.openGroup('second', false);

		assert.equal(model.activeGroup, group1);
		assert.equal(events.activated.length, 1);
		assert.equal(events.activated[0], group1);
	});

	test('Groups - Group Identifiers', function () {
		const model = create();

		const group1 = model.openGroup('first');
		const group2 = model.openGroup('second');
		const group3 = model.openGroup('third');

		assert.equal(model.getGroup(group1.id), group1);
		assert.equal(model.getGroup(group2.id), group2);
		assert.equal(model.getGroup(group3.id), group3);

		model.closeGroup(group2);
		assert.equal(model.getGroup(group2.id), null);

		model.moveGroup(group1, 1);

		assert.equal(model.getGroup(group1.id), group1);
		assert.equal(model.getGroup(group3.id), group3);

		model.closeGroups();

		assert.equal(model.getGroup(group1.id), null);
		assert.equal(model.getGroup(group3.id), null);
	});

	test('Groups - Open Group at Index', function () {
		const model = create();

		const group1 = model.openGroup('first', false, 2);
		const group2 = model.openGroup('second', false, 1);
		const group3 = model.openGroup('third', false, 0);

		assert.equal(model.groups[0], group3);
		assert.equal(model.groups[1], group2);
		assert.equal(model.groups[2], group1);
	});

	test('Groups - Close All Groups except active', function () {
		const model = create();

		model.openGroup('first');
		model.openGroup('second');
		const group3 = model.openGroup('third');

		model.closeGroups(model.activeGroup);

		assert.equal(model.groups.length, 1);
		assert.equal(model.activeGroup, group3);
	});

	test('Groups - Close All Groups except inactive', function () {
		const model = create();

		model.openGroup('first');
		const group2 = model.openGroup('second');
		model.openGroup('third');

		model.closeGroups(group2);

		assert.equal(model.groups.length, 1);
		assert.equal(model.activeGroup, group2);
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
		assert.equal(group.isPinned(0), true);

		assert.equal(events.opened[0], input1);
		assert.equal(events.activated[0], input1);

		group.closeEditor(input1);
		assert.equal(group.count, 0);
		assert.equal(group.getEditors(true).length, 0);
		assert.equal(group.activeEditor, void 0);
		assert.equal(events.closed[0].editor, input1);
		assert.equal(events.closed[0].index, 0);
		assert.equal(events.closed[0].pinned, true);

		// Active && Preview
		const input2 = input();
		group.openEditor(input2, { active: true, pinned: false });

		assert.equal(group.count, 1);
		assert.equal(group.getEditors(true).length, 1);
		assert.equal(group.activeEditor, input2);
		assert.equal(group.isActive(input2), true);
		assert.equal(group.isPreview(input2), true);
		assert.equal(group.isPinned(input2), false);
		assert.equal(group.isPinned(0), false);

		assert.equal(events.opened[1], input2);
		assert.equal(events.activated[1], input2);

		group.closeEditor(input2);
		assert.equal(group.count, 0);
		assert.equal(group.getEditors(true).length, 0);
		assert.equal(group.activeEditor, void 0);
		assert.equal(events.closed[1].editor, input2);
		assert.equal(events.closed[1].index, 0);
		assert.equal(events.closed[1].pinned, false);

		group.closeEditor(input2);
		assert.equal(group.count, 0);
		assert.equal(group.getEditors(true).length, 0);
		assert.equal(group.activeEditor, void 0);
		assert.equal(events.closed[1].editor, input2);

		// Nonactive && Pinned => gets active because its first editor
		const input3 = input();
		group.openEditor(input3, { active: false, pinned: true });

		assert.equal(group.count, 1);
		assert.equal(group.getEditors(true).length, 1);
		assert.equal(group.activeEditor, input3);
		assert.equal(group.isActive(input3), true);
		assert.equal(group.isPreview(input3), false);
		assert.equal(group.isPinned(input3), true);
		assert.equal(group.isPinned(0), true);

		assert.equal(events.opened[2], input3);
		assert.equal(events.activated[2], input3);

		group.closeEditor(input3);
		assert.equal(group.count, 0);
		assert.equal(group.getEditors(true).length, 0);
		assert.equal(group.activeEditor, void 0);
		assert.equal(events.closed[2].editor, input3);

		assert.equal(events.opened[2], input3);
		assert.equal(events.activated[2], input3);

		group.closeEditor(input3);
		assert.equal(group.count, 0);
		assert.equal(group.getEditors(true).length, 0);
		assert.equal(group.activeEditor, void 0);
		assert.equal(events.closed[2].editor, input3);

		// Nonactive && Preview => gets active because its first editor
		const input4 = input();
		group.openEditor(input4);

		assert.equal(group.count, 1);
		assert.equal(group.getEditors(true).length, 1);
		assert.equal(group.activeEditor, input4);
		assert.equal(group.isActive(input4), true);
		assert.equal(group.isPreview(input4), true);
		assert.equal(group.isPinned(input4), false);
		assert.equal(group.isPinned(0), false);

		assert.equal(events.opened[3], input4);
		assert.equal(events.activated[3], input4);

		group.closeEditor(input4);
		assert.equal(group.count, 0);
		assert.equal(group.getEditors(true).length, 0);
		assert.equal(group.activeEditor, void 0);
		assert.equal(events.closed[3].editor, input4);
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

		group.closeAllEditors();

		assert.equal(events.closed.length, 3);
		assert.equal(group.count, 0);
	});

	test('Stack - Multiple Editors - Preview editor moves to the side of the active one', function () {
		const model = create();
		const group = model.openGroup('group');

		const input1 = input();
		const input2 = input();
		const input3 = input();

		group.openEditor(input1, { pinned: false, active: true });
		group.openEditor(input2, { pinned: true, active: true });
		group.openEditor(input3, { pinned: true, active: true });

		assert.equal(input3, group.getEditors()[2]);

		const input4 = input();
		group.openEditor(input4, { pinned: false, active: true }); // this should cause the preview editor to move after input3

		assert.equal(input4, group.getEditors()[2]);
	});

	test('Stack - Multiple Editors - Pinned and Active (DEFAULT_OPEN_EDITOR_DIRECTION = Direction.LEFT)', function () {
		let inst = new TestInstantiationService();
		inst.stub(IStorageService, new TestStorageService());
		inst.stub(ILifecycleService, new TestLifecycleService());
		inst.stub(IWorkspaceContextService, new TestContextService());
		inst.stub(ITelemetryService, NullTelemetryService);

		const config = new TestConfigurationService();
		inst.stub(IConfigurationService, config);
		config.setUserConfiguration('workbench', { editor: { openPositioning: 'left' } });


		const model = inst.createInstance(EditorStacksModel, true);

		const group = model.openGroup('group');
		const events = groupListener(group);

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

		model.closeGroups();

		assert.equal(events.closed.length, 3);
		assert.equal(group.count, 0);
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
		assert.equal(group.isPinned(0), true);
		assert.equal(group.isPreview(input1), false);
		assert.equal(group.isActive(input2), false);
		assert.equal(group.isPinned(input2), true);
		assert.equal(group.isPinned(1), true);
		assert.equal(group.isPreview(input2), false);
		assert.equal(group.isActive(input3), false);
		assert.equal(group.isPinned(input3), true);
		assert.equal(group.isPinned(2), true);
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
		assert.equal(events.closed[0].editor, input1);
		assert.equal(events.closed[1].editor, input2);

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
		assert.equal(events.closed[0].editor, input1);
		assert.equal(group.count, 2);

		group.unpin(input3);

		assert.equal(group.activeEditor, input3);
		assert.equal(group.count, 1); // pinning replaced the preview
		assert.equal(group.getEditors()[0], input3);
		assert.equal(events.closed[1].editor, input2);
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

	test('Stack - Multiple Editors - move editor', function () {
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

		group.moveEditor(input1, 1);

		assert.equal(events.moved[0], input1);
		assert.equal(group.getEditors()[0], input2);
		assert.equal(group.getEditors()[1], input1);

		group.setActive(input1);
		group.openEditor(input3, { pinned: true, active: true });
		group.openEditor(input4, { pinned: true, active: true });
		group.openEditor(input5, { pinned: true, active: true });

		group.moveEditor(input4, 0);

		assert.equal(events.moved[1], input4);
		assert.equal(group.getEditors()[0], input4);
		assert.equal(group.getEditors()[1], input2);
		assert.equal(group.getEditors()[2], input1);
		assert.equal(group.getEditors()[3], input3);
		assert.equal(group.getEditors()[4], input5);

		group.moveEditor(input4, 3);
		group.moveEditor(input2, 1);

		assert.equal(group.getEditors()[0], input1);
		assert.equal(group.getEditors()[1], input2);
		assert.equal(group.getEditors()[2], input3);
		assert.equal(group.getEditors()[3], input4);
		assert.equal(group.getEditors()[4], input5);
	});

	test('Stack - Multiple Editors - move editor across groups', function () {
		const model = create();

		const group1 = model.openGroup('group1');
		const group2 = model.openGroup('group1');

		const g1_input1 = input();
		const g1_input2 = input();
		const g2_input1 = input();

		group1.openEditor(g1_input1, { active: true, pinned: true });
		group1.openEditor(g1_input2, { active: true, pinned: true });
		group2.openEditor(g2_input1, { active: true, pinned: true });

		// A move across groups is a close in the one group and an open in the other group at a specific index
		group2.closeEditor(g2_input1);
		group1.openEditor(g2_input1, { active: true, pinned: true, index: 1 });

		assert.equal(group1.count, 3);
		assert.equal(group1.getEditors()[0], g1_input1);
		assert.equal(group1.getEditors()[1], g2_input1);
		assert.equal(group1.getEditors()[2], g1_input2);
	});

	test('Stack - Multiple Editors - move editor across groups (input already exists in group 1)', function () {
		const model = create();

		const group1 = model.openGroup('group1');
		const group2 = model.openGroup('group1');

		const g1_input1 = input();
		const g1_input2 = input();
		const g1_input3 = input();
		const g2_input1 = g1_input2;

		group1.openEditor(g1_input1, { active: true, pinned: true });
		group1.openEditor(g1_input2, { active: true, pinned: true });
		group1.openEditor(g1_input3, { active: true, pinned: true });
		group2.openEditor(g2_input1, { active: true, pinned: true });

		// A move across groups is a close in the one group and an open in the other group at a specific index
		group2.closeEditor(g2_input1);
		group1.openEditor(g2_input1, { active: true, pinned: true, index: 0 });

		assert.equal(group1.count, 3);
		assert.equal(group1.getEditors()[0], g1_input2);
		assert.equal(group1.getEditors()[1], g1_input1);
		assert.equal(group1.getEditors()[2], g1_input3);
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

	test('Stack - Multiple Editors - Close Others, Close Left, Close Right', function () {
		const model = create();
		const group = model.openGroup('group');

		const input1 = input();
		const input2 = input();
		const input3 = input();
		const input4 = input();
		const input5 = input();

		group.openEditor(input1, { active: true, pinned: true });
		group.openEditor(input2, { active: true, pinned: true });
		group.openEditor(input3, { active: true, pinned: true });
		group.openEditor(input4, { active: true, pinned: true });
		group.openEditor(input5, { active: true, pinned: true });

		// Close Others
		group.closeEditors(group.activeEditor);
		assert.equal(group.activeEditor, input5);
		assert.equal(group.count, 1);

		group.closeAllEditors();
		group.openEditor(input1, { active: true, pinned: true });
		group.openEditor(input2, { active: true, pinned: true });
		group.openEditor(input3, { active: true, pinned: true });
		group.openEditor(input4, { active: true, pinned: true });
		group.openEditor(input5, { active: true, pinned: true });
		group.setActive(input3);

		// Close Left
		assert.equal(group.activeEditor, input3);
		group.closeEditors(group.activeEditor, Direction.LEFT);
		assert.equal(group.activeEditor, input3);
		assert.equal(group.count, 3);
		assert.equal(group.getEditors()[0], input3);
		assert.equal(group.getEditors()[1], input4);
		assert.equal(group.getEditors()[2], input5);

		group.closeAllEditors();
		group.openEditor(input1, { active: true, pinned: true });
		group.openEditor(input2, { active: true, pinned: true });
		group.openEditor(input3, { active: true, pinned: true });
		group.openEditor(input4, { active: true, pinned: true });
		group.openEditor(input5, { active: true, pinned: true });
		group.setActive(input3);

		// Close Right
		assert.equal(group.activeEditor, input3);
		group.closeEditors(group.activeEditor, Direction.RIGHT);
		assert.equal(group.activeEditor, input3);
		assert.equal(group.count, 3);
		assert.equal(group.getEditors()[0], input1);
		assert.equal(group.getEditors()[1], input2);
		assert.equal(group.getEditors()[2], input3);
	});

	test('Stack - Multiple Editors - real user example', function () {
		const model = create();
		const group = model.openGroup('group');

		// [] -> /index.html/
		let indexHtml = input('index.html');
		group.openEditor(indexHtml);
		assert.equal(group.activeEditor, indexHtml);
		assert.equal(group.previewEditor, indexHtml);
		assert.equal(group.getEditors()[0], indexHtml);
		assert.equal(group.count, 1);

		// /index.html/ -> /style.css/
		let styleCss = input('style.css');
		group.openEditor(styleCss);
		assert.equal(group.activeEditor, styleCss);
		assert.equal(group.previewEditor, styleCss);
		assert.equal(group.getEditors()[0], styleCss);
		assert.equal(group.count, 1);

		// /style.css/ -> [/style.css/, test.js]
		let testJs = input('test.js');
		group.openEditor(testJs, { active: true, pinned: true });
		assert.equal(group.previewEditor, styleCss);
		assert.equal(group.activeEditor, testJs);
		assert.equal(group.isPreview(styleCss), true);
		assert.equal(group.isPinned(testJs), true);
		assert.equal(group.getEditors()[0], styleCss);
		assert.equal(group.getEditors()[1], testJs);
		assert.equal(group.count, 2);

		// [/style.css/, test.js] -> [test.js, /index.html/]
		indexHtml = input('index.html');
		group.openEditor(indexHtml, { active: true });
		assert.equal(group.activeEditor, indexHtml);
		assert.equal(group.previewEditor, indexHtml);
		assert.equal(group.isPreview(indexHtml), true);
		assert.equal(group.isPinned(testJs), true);
		assert.equal(group.getEditors()[0], testJs);
		assert.equal(group.getEditors()[1], indexHtml);
		assert.equal(group.count, 2);

		// make test.js active
		testJs = input('test.js');
		group.setActive(testJs);
		assert.equal(group.activeEditor, testJs);
		assert.equal(group.isActive(testJs), true);
		assert.equal(group.count, 2);

		// [test.js, /indexHtml/] -> [test.js, index.html]
		indexHtml = input('index.html');
		group.pin(indexHtml);
		assert.equal(group.isPinned(indexHtml), true);
		assert.equal(group.isPreview(indexHtml), false);
		assert.equal(group.activeEditor, testJs);

		// [test.js, index.html] -> [test.js, file.ts, index.html]
		const fileTs = input('file.ts');
		group.openEditor(fileTs, { active: true, pinned: true });
		assert.equal(group.isPinned(fileTs), true);
		assert.equal(group.isPreview(fileTs), false);
		assert.equal(group.count, 3);
		assert.equal(group.activeEditor, fileTs);

		// [test.js, index.html, file.ts] -> [test.js, /file.ts/, index.html]
		group.unpin(fileTs);
		assert.equal(group.count, 3);
		assert.equal(group.isPinned(fileTs), false);
		assert.equal(group.isPreview(fileTs), true);
		assert.equal(group.activeEditor, fileTs);

		// [test.js, /file.ts/, index.html] -> [test.js, /other.ts/, index.html]
		const otherTs = input('other.ts');
		group.openEditor(otherTs, { active: true });
		assert.equal(group.count, 3);
		assert.equal(group.activeEditor, otherTs);
		assert.ok(group.getEditors()[0].matches(testJs));
		assert.equal(group.getEditors()[1], otherTs);
		assert.ok(group.getEditors()[2].matches(indexHtml));

		// make index.html active
		indexHtml = input('index.html');
		group.setActive(indexHtml);
		assert.equal(group.activeEditor, indexHtml);

		// [test.js, /other.ts/, index.html] -> [test.js, /other.ts/]
		group.closeEditor(indexHtml);
		assert.equal(group.count, 2);
		assert.equal(group.activeEditor, otherTs);
		assert.ok(group.getEditors()[0].matches(testJs));
		assert.equal(group.getEditors()[1], otherTs);

		// [test.js, /other.ts/] -> [test.js]
		group.closeEditor(otherTs);
		assert.equal(group.count, 1);
		assert.equal(group.activeEditor, testJs);
		assert.ok(group.getEditors()[0].matches(testJs));

		// [test.js] -> /test.js/
		group.unpin(testJs);
		assert.equal(group.count, 1);
		assert.equal(group.activeEditor, testJs);
		assert.ok(group.getEditors()[0].matches(testJs));
		assert.equal(group.isPinned(testJs), false);
		assert.equal(group.isPreview(testJs), true);

		// /test.js/ -> []
		group.closeEditor(testJs);
		assert.equal(group.count, 0);
		assert.equal(group.activeEditor, null);
		assert.equal(group.previewEditor, null);
	});

	test('Stack - Single Group, Single Editor - persist', function () {
		let inst = new TestInstantiationService();

		inst.stub(IStorageService, new TestStorageService());
		inst.stub(IWorkspaceContextService, new TestContextService());
		const lifecycle = new TestLifecycleService();
		inst.stub(ILifecycleService, lifecycle);
		inst.stub(ITelemetryService, NullTelemetryService);

		const config = new TestConfigurationService();
		config.setUserConfiguration('workbench', { editor: { openPositioning: 'right' } });
		inst.stub(IConfigurationService, config);

		(<IEditorRegistry>Registry.as(EditorExtensions.Editors)).setInstantiationService(inst);

		let model: EditorStacksModel = inst.createInstance(EditorStacksModel, true);
		let group = model.openGroup('group');

		const input1 = input();
		group.openEditor(input1);

		assert.equal(model.groups.length, 1);
		assert.equal(group.count, 1);
		assert.equal(group.activeEditor.matches(input1), true);
		assert.equal(group.previewEditor.matches(input1), true);
		assert.equal(group.label, 'group');
		assert.equal(group.isActive(input1), true);

		lifecycle.fireShutdown();

		// Create model again - should load from storage
		model = inst.createInstance(EditorStacksModel, true);

		assert.equal(model.groups.length, 1);

		group = model.activeGroup;

		assert.equal(group.count, 1);
		assert.equal(group.activeEditor.matches(input1), true);
		assert.equal(group.previewEditor.matches(input1), true);
		assert.equal(group.label, 'group');
		assert.equal(group.isActive(input1), true);
	});

	test('Stack - Multiple Groups, Multiple editors - persist', function () {
		let inst = new TestInstantiationService();

		inst.stub(IStorageService, new TestStorageService());
		inst.stub(IWorkspaceContextService, new TestContextService());
		const lifecycle = new TestLifecycleService();
		inst.stub(ILifecycleService, lifecycle);
		inst.stub(ITelemetryService, NullTelemetryService);

		const config = new TestConfigurationService();
		config.setUserConfiguration('workbench', { editor: { openPositioning: 'right' } });
		inst.stub(IConfigurationService, config);


		(<IEditorRegistry>Registry.as(EditorExtensions.Editors)).setInstantiationService(inst);

		let model: EditorStacksModel = inst.createInstance(EditorStacksModel, true);

		let group1 = model.openGroup('group1');

		const g1_input1 = input();
		const g1_input2 = input();
		const g1_input3 = input();

		group1.openEditor(g1_input1, { active: true, pinned: true });
		group1.openEditor(g1_input2, { active: true, pinned: false });
		group1.openEditor(g1_input3, { active: false, pinned: true });

		let group2 = model.openGroup('group2');

		const g2_input1 = input();
		const g2_input2 = input();
		const g2_input3 = input();

		group2.openEditor(g2_input1, { active: true, pinned: true });
		group2.openEditor(g2_input2, { active: false, pinned: false });
		group2.openEditor(g2_input3, { active: false, pinned: true });

		assert.equal(model.groups.length, 2);
		assert.equal(group1.count, 3);
		assert.equal(group2.count, 3);
		assert.equal(group1.activeEditor.matches(g1_input2), true);
		assert.equal(group2.activeEditor.matches(g2_input1), true);
		assert.equal(group1.previewEditor.matches(g1_input2), true);
		assert.equal(group2.previewEditor.matches(g2_input2), true);
		assert.equal(group1.label, 'group1');
		assert.equal(group2.label, 'group2');

		assert.equal(group1.getEditors(true)[0].matches(g1_input2), true);
		assert.equal(group1.getEditors(true)[1].matches(g1_input1), true);
		assert.equal(group1.getEditors(true)[2].matches(g1_input3), true);

		assert.equal(group2.getEditors(true)[0].matches(g2_input1), true);
		assert.equal(group2.getEditors(true)[1].matches(g2_input2), true);
		assert.equal(group2.getEditors(true)[2].matches(g2_input3), true);

		lifecycle.fireShutdown();

		// Create model again - should load from storage
		model = inst.createInstance(EditorStacksModel, true);

		group1 = model.groups[0];
		group2 = model.groups[1];

		assert.equal(model.groups.length, 2);
		assert.equal(group1.count, 3);
		assert.equal(group2.count, 3);
		assert.equal(group1.activeEditor.matches(g1_input2), true);
		assert.equal(group2.activeEditor.matches(g2_input1), true);
		assert.equal(group1.previewEditor.matches(g1_input2), true);
		assert.equal(group2.previewEditor.matches(g2_input2), true);
		assert.equal(group1.label, 'group1');
		assert.equal(group2.label, 'group2');

		assert.equal(group1.getEditors(true)[0].matches(g1_input2), true);
		assert.equal(group1.getEditors(true)[1].matches(g1_input1), true);
		assert.equal(group1.getEditors(true)[2].matches(g1_input3), true);

		assert.equal(group2.getEditors(true)[0].matches(g2_input1), true);
		assert.equal(group2.getEditors(true)[1].matches(g2_input2), true);
		assert.equal(group2.getEditors(true)[2].matches(g2_input3), true);
	});

	test('Stack - Single group, multiple editors - persist (some not persistable)', function () {
		let inst = new TestInstantiationService();

		inst.stub(IStorageService, new TestStorageService());
		inst.stub(IWorkspaceContextService, new TestContextService());
		const lifecycle = new TestLifecycleService();
		inst.stub(ILifecycleService, lifecycle);
		inst.stub(ITelemetryService, NullTelemetryService);

		const config = new TestConfigurationService();
		config.setUserConfiguration('workbench', { editor: { openPositioning: 'right' } });
		inst.stub(IConfigurationService, config);


		(<IEditorRegistry>Registry.as(EditorExtensions.Editors)).setInstantiationService(inst);

		let model: EditorStacksModel = inst.createInstance(EditorStacksModel, true);

		let group = model.openGroup('group1');

		const serializableInput1 = input();
		const nonSerializableInput2 = input('3', true);
		const serializableInput2 = input();

		group.openEditor(serializableInput1, { active: true, pinned: true });
		group.openEditor(nonSerializableInput2, { active: true, pinned: false });
		group.openEditor(serializableInput2, { active: false, pinned: true });

		assert.equal(group.count, 3);
		assert.equal(group.activeEditor.matches(nonSerializableInput2), true);
		assert.equal(group.previewEditor.matches(nonSerializableInput2), true);

		assert.equal(group.getEditors(true)[0].matches(nonSerializableInput2), true);
		assert.equal(group.getEditors(true)[1].matches(serializableInput1), true);
		assert.equal(group.getEditors(true)[2].matches(serializableInput2), true);

		lifecycle.fireShutdown();

		// Create model again - should load from storage
		model = inst.createInstance(EditorStacksModel, true);

		group = model.groups[0];

		assert.equal(group.count, 2);
		assert.equal(group.activeEditor.matches(serializableInput1), true);
		assert.equal(group.previewEditor, null);

		assert.equal(group.getEditors(true)[0].matches(serializableInput1), true);
		assert.equal(group.getEditors(true)[1].matches(serializableInput2), true);
	});

	test('Stack - Multiple groups, multiple editors - persist (some not persistable, causes empty group)', function () {
		let inst = new TestInstantiationService();

		inst.stub(IStorageService, new TestStorageService());
		inst.stub(IWorkspaceContextService, new TestContextService());
		const lifecycle = new TestLifecycleService();
		inst.stub(ILifecycleService, lifecycle);
		inst.stub(ITelemetryService, NullTelemetryService);

		const config = new TestConfigurationService();
		config.setUserConfiguration('workbench', { editor: { openPositioning: 'right' } });
		inst.stub(IConfigurationService, config);


		(<IEditorRegistry>Registry.as(EditorExtensions.Editors)).setInstantiationService(inst);

		let model: EditorStacksModel = inst.createInstance(EditorStacksModel, true);

		let group1 = model.openGroup('group1');
		let group2 = model.openGroup('group1');

		const serializableInput1 = input();
		const serializableInput2 = input();
		const nonSerializableInput = input('2', true);

		group1.openEditor(serializableInput1, { pinned: true });
		group1.openEditor(serializableInput2);

		group2.openEditor(nonSerializableInput);

		lifecycle.fireShutdown();

		// Create model again - should load from storage
		model = inst.createInstance(EditorStacksModel, true);

		group1 = model.groups[0];

		assert.equal(model.groups.length, 1);
		assert.equal(group1.count, 2);
		assert.equal(group1.getEditors()[0].matches(serializableInput1), true);
		assert.equal(group1.getEditors()[1].matches(serializableInput2), true);
	});

	test('Stack - Multiple groups, multiple editors - persist (ignore persisted when editors to open on startup)', function () {
		let inst = new TestInstantiationService();

		inst.stub(IStorageService, new TestStorageService());
		const lifecycle = new TestLifecycleService();
		inst.stub(ILifecycleService, lifecycle);
		inst.stub(ITelemetryService, NullTelemetryService);

		const config = new TestConfigurationService();
		config.setUserConfiguration('workbench', { editor: { openPositioning: 'right' } });
		inst.stub(IConfigurationService, config);

		(<IEditorRegistry>Registry.as(EditorExtensions.Editors)).setInstantiationService(inst);

		let model: EditorStacksModel = inst.createInstance(EditorStacksModel, false);

		let group1 = model.openGroup('group1');
		let group2 = model.openGroup('group1');

		const serializableInput1 = input();
		const serializableInput2 = input();
		const nonSerializableInput = input('2', true);

		group1.openEditor(serializableInput1, { pinned: true });
		group1.openEditor(serializableInput2);

		group2.openEditor(nonSerializableInput);

		lifecycle.fireShutdown();

		// Create model again - should NOT load from storage
		model = inst.createInstance(EditorStacksModel, false);

		assert.equal(model.groups.length, 0);
	});

	test('Stack - Multiple Editors - Navigation (across groups)', function () {
		const model = create();

		const group1 = model.openGroup('group1');
		const group2 = model.openGroup('group2');

		const input1 = input();
		const input2 = input();
		const input3 = input();

		group1.openEditor(input1, { pinned: true, active: true });
		group1.openEditor(input2, { pinned: true, active: true });
		group1.openEditor(input3, { pinned: true, active: true });

		const input4 = input();
		const input5 = input();
		const input6 = input();

		group2.openEditor(input4, { pinned: true, active: true });
		group2.openEditor(input5, { pinned: true, active: true });
		group2.openEditor(input6, { pinned: true, active: true });

		model.setActive(group1);
		group1.setActive(input1);

		let previous = model.previous(true /* jump groups */);
		assert.equal(previous.group, group2);
		assert.equal(previous.editor, input6);

		model.setActive(<EditorGroup>previous.group);
		(<EditorGroup>previous.group).setActive(<EditorInput>previous.editor);

		let next = model.next(true /* jump groups */);
		assert.equal(next.group, group1);
		assert.equal(next.editor, input1);

		model.setActive(group1);
		group1.setActive(input3);

		next = model.next(true /* jump groups */);
		assert.equal(next.group, group2);
		assert.equal(next.editor, input4);

		model.setActive(<EditorGroup>next.group);
		(<EditorGroup>next.group).setActive(<EditorInput>next.editor);

		previous = model.previous(true /* jump groups */);
		assert.equal(previous.group, group1);
		assert.equal(previous.editor, input3);
	});

	test('Stack - Multiple Editors - Navigation (in group)', function () {
		const model = create();

		const group1 = model.openGroup('group1');
		const group2 = model.openGroup('group2');

		const input1 = input();
		const input2 = input();
		const input3 = input();

		group1.openEditor(input1, { pinned: true, active: true });
		group1.openEditor(input2, { pinned: true, active: true });
		group1.openEditor(input3, { pinned: true, active: true });

		const input4 = input();
		const input5 = input();
		const input6 = input();

		group2.openEditor(input4, { pinned: true, active: true });
		group2.openEditor(input5, { pinned: true, active: true });
		group2.openEditor(input6, { pinned: true, active: true });

		model.setActive(group1);
		group1.setActive(input1);

		let previous = model.previous(false /* do NOT jump groups */);
		assert.equal(previous.group, group1);
		assert.equal(previous.editor, input3);

		model.setActive(<EditorGroup>previous.group);
		(<EditorGroup>previous.group).setActive(<EditorInput>previous.editor);

		let next = model.next(false /* do NOT jump groups */);
		assert.equal(next.group, group1);
		assert.equal(next.editor, input1);

		model.setActive(group1);
		group1.setActive(input3);

		next = model.next(false /* do NOT jump groups */);
		assert.equal(next.group, group1);
		assert.equal(next.editor, input1);

		model.setActive(<EditorGroup>next.group);
		(<EditorGroup>next.group).setActive(<EditorInput>next.editor);

		previous = model.previous(false /* do NOT jump groups */);
		assert.equal(previous.group, group1);
		assert.equal(previous.editor, input3);
	});

	test('Stack - Multiple Editors - Resources', function () {
		const model = create();

		const group1 = model.openGroup('group1');
		const group2 = model.openGroup('group2');

		assert.ok(!model.isOpen(URI.file('/hello/world.txt')));

		const input1Resource = URI.file('/hello/world.txt');
		const input1 = input(void 0, false, input1Resource);
		group1.openEditor(input1);

		assert.ok(model.isOpen(input1Resource));
		assert.ok(group1.contains(input1Resource));
		assert.equal(model.count(input1Resource), 1);
		assert.equal(group1.getEditor(input1Resource), input1);

		group2.openEditor(input1);
		group1.closeEditor(input1);

		assert.ok(model.isOpen(input1Resource));
		assert.ok(!group1.contains(input1Resource));
		assert.ok(!group1.getEditor(input1Resource));
		assert.ok(group2.contains(input1Resource));
		assert.equal(group2.getEditor(input1Resource), input1);
		assert.equal(model.count(input1Resource), 1);

		const input1ResourceClone = URI.file('/hello/world.txt');
		const input1Clone = input(void 0, false, input1ResourceClone);
		group1.openEditor(input1Clone);

		assert.ok(group1.contains(input1Resource));

		group2.closeEditor(input1);

		assert.ok(model.isOpen(input1Resource));
		assert.ok(group1.contains(input1Resource));
		assert.equal(group1.getEditor(input1Resource), input1Clone);
		assert.ok(!group2.contains(input1Resource));

		group1.closeEditor(input1Clone);

		assert.ok(!model.isOpen(input1Resource));
		assert.ok(!group1.contains(input1Resource));

		group1.openEditor(input1);

		const input2Resource = URI.file('/hello/world_other.txt');
		const input2 = input(void 0, false, input2Resource);

		const input3Resource = URI.file('/hello/world_different.txt');
		const input3 = input(void 0, false, input3Resource);

		group1.openEditor(input2);

		assert.ok(model.isOpen(input2Resource));
		assert.ok(!model.isOpen(input1Resource));

		group1.openEditor(input3, { pinned: true });

		assert.ok(model.isOpen(input2Resource));
		assert.ok(model.isOpen(input3Resource));

		model.closeGroups();

		assert.ok(!model.isOpen(input2Resource));
		assert.ok(!model.isOpen(input3Resource));
	});

	test('Stack - Multiple Editors - Editor Dispose', function () {
		const model = create();
		const events = modelListener(model);

		const group1 = model.openGroup('group1');
		const group2 = model.openGroup('group2');

		const input1 = input();
		const input2 = input();
		const input3 = input();

		group1.openEditor(input1, { pinned: true, active: true });
		group1.openEditor(input2, { pinned: true, active: true });
		group1.openEditor(input3, { pinned: true, active: true });

		group2.openEditor(input1, { pinned: true, active: true });
		group2.openEditor(input2, { pinned: true, active: true });

		input1.dispose();

		assert.equal(events.disposed.length, 2);
		assert.ok(events.disposed[0].editor.matches(input1));
		assert.ok(events.disposed[1].editor.matches(input1));

		input3.dispose();
		assert.equal(events.disposed.length, 3);
		assert.ok(events.disposed[2].editor.matches(input3));

		const input4 = input();
		const input5 = input();

		group1.openEditor(input4, { pinned: false, active: true });
		group1.openEditor(input5, { pinned: false, active: true });

		input4.dispose();
		assert.equal(events.disposed.length, 3);

		model.closeGroup(group2);

		input2.dispose();
		assert.equal(events.disposed.length, 4);
	});

	test('Stack - Multiple Editors - Editor Disposed on Close', function () {
		const model = create();

		const group1 = model.openGroup('group1');
		const group2 = model.openGroup('group2');

		const input1 = input();
		const input2 = input();
		const input3 = input();
		const input4 = input();

		group1.openEditor(input1, { pinned: true, active: true });
		group1.openEditor(input2, { pinned: true, active: true });
		group1.openEditor(input3, { pinned: true, active: true });
		group1.openEditor(input4, { pinned: true, active: true });

		group1.closeEditor(input3);

		assert.equal(input3.isDisposed(), true);

		group2.openEditor(input2, { pinned: true, active: true });
		group2.openEditor(input3, { pinned: true, active: true });
		group2.openEditor(input4, { pinned: true, active: true });

		group1.closeEditor(input2);

		assert.equal(input2.isDisposed(), false);

		group2.closeEditor(input2);

		assert.equal(input2.isDisposed(), true);

		group1.closeAllEditors();

		assert.equal(input4.isDisposed(), false);

		model.closeGroups();

		assert.equal(input4.isDisposed(), true);
	});

	test('Stack - Multiple Editors - Editor Disposed on Close (Diff Editor)', function () {
		const model = create();

		const group1 = model.openGroup('group1');

		const input1 = input();
		const input2 = input();

		const diffInput = new DiffEditorInput('name', 'description', input1, input2);

		group1.openEditor(diffInput, { pinned: true, active: true });
		group1.openEditor(input1, { pinned: true, active: true });

		group1.closeEditor(diffInput);

		assert.equal(diffInput.isDisposed(), true);
		assert.equal(input2.isDisposed(), true);
		assert.equal(input1.isDisposed(), false);
	});

	test('Stack - Multiple Editors - Editor Emits Dirty and Label Changed', function () {
		const model = create();

		const group1 = model.openGroup('group1');
		const group2 = model.openGroup('group2');

		const input1 = input();
		const input2 = input();

		group1.openEditor(input1, { pinned: true, active: true });
		group2.openEditor(input2, { pinned: true, active: true });

		let dirtyCounter = 0;
		model.onEditorDirty(() => {
			dirtyCounter++;
		});

		let labelChangeCounter = 0;
		model.onEditorLabelChange(() => {
			labelChangeCounter++;
		});

		(<TestEditorInput>input1).setDirty();
		(<TestEditorInput>input1).setLabel();

		assert.equal(dirtyCounter, 1);
		assert.equal(labelChangeCounter, 1);

		(<TestEditorInput>input2).setDirty();
		(<TestEditorInput>input2).setLabel();

		assert.equal(dirtyCounter, 2);
		assert.equal(labelChangeCounter, 2);

		group2.closeAllEditors();

		(<TestEditorInput>input2).setDirty();
		(<TestEditorInput>input2).setLabel();

		assert.equal(dirtyCounter, 2);
		assert.equal(labelChangeCounter, 2);

		model.closeGroups();

		(<TestEditorInput>input1).setDirty();
		(<TestEditorInput>input1).setLabel();

		assert.equal(dirtyCounter, 2);
		assert.equal(labelChangeCounter, 2);
	});

	test('Groups - Model change events (structural vs state)', function () {
		const model = create();
		const events = modelListener(model);

		const group1 = model.openGroup('first');

		assert.equal(events.changed[0].group, group1);
		assert.equal(events.changed[0].structural, true); // open group

		assert.equal(events.changed[1].group, group1);
		assert.ok(!events.changed[1].structural); // set active

		const input1 = input();

		group1.openEditor(input1, { pinned: true, active: true });

		assert.equal(events.changed[2].group, group1);
		assert.equal(events.changed[2].structural, true); // open editor
		assert.equal(events.changed[2].editor, input1);

		assert.equal(events.changed[3].group, group1);
		assert.ok(!events.changed[3].structural); // set active
		assert.equal(events.changed[3].editor, input1);

		group1.unpin(input1);

		assert.equal(events.changed[4].group, group1);
		assert.ok(!events.changed[4].structural); // unpin
		assert.equal(events.changed[4].editor, input1);

		group1.closeAllEditors();

		assert.equal(events.changed[5].group, group1);
		assert.ok(events.changed[5].structural); // close
		assert.equal(events.changed[5].editor, input1);
	});

	test('Preview tab does not have a stable position (https://github.com/Microsoft/vscode/issues/8245)', function () {
		const model = create();

		const group1 = model.openGroup('first');

		const input1 = input();
		const input2 = input();
		const input3 = input();

		group1.openEditor(input1, { pinned: true, active: true });
		group1.openEditor(input2, { active: true });
		group1.setActive(input1);

		group1.openEditor(input3, { active: true });
		assert.equal(group1.indexOf(input3), 1);
	});
});