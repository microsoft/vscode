/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { EditorGroup, ISerializedEditorGroup, EditorCloseEvent } from 'vs/workbench/common/editor/editorGroup';
import { Extensions as EditorExtensions, IEditorInputFactoryRegistry, EditorInput, IFileEditorInput, IEditorInputFactory, CloseDirection } from 'vs/workbench/common/editor';
import { URI } from 'vs/base/common/uri';
import { TestLifecycleService, TestContextService, TestStorageService } from 'vs/workbench/test/workbenchTestServices';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { Registry } from 'vs/platform/registry/common/platform';
import { IEditorModel } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { IStorageService } from 'vs/platform/storage/common/storage';

function inst(): IInstantiationService {
	let inst = new TestInstantiationService();
	inst.stub(IStorageService, new TestStorageService());
	inst.stub(ILifecycleService, new TestLifecycleService());
	inst.stub(IWorkspaceContextService, new TestContextService());
	inst.stub(ITelemetryService, NullTelemetryService);

	const config = new TestConfigurationService();
	config.setUserConfiguration('workbench', { editor: { openPositioning: 'right', focusRecentEditorAfterClose: true } });
	inst.stub(IConfigurationService, config);

	return inst;
}

function createGroup(serialized?: ISerializedEditorGroup): EditorGroup {
	return inst().createInstance(EditorGroup, serialized);
}

interface GroupEvents {
	opened: EditorInput[];
	activated: EditorInput[];
	closed: EditorCloseEvent[];
	pinned: EditorInput[];
	unpinned: EditorInput[];
	moved: EditorInput[];
	disposed: EditorInput[];
}

function groupListener(group: EditorGroup): GroupEvents {
	const groupEvents: GroupEvents = {
		opened: [],
		closed: [],
		activated: [],
		pinned: [],
		unpinned: [],
		moved: [],
		disposed: []
	};

	group.onDidEditorOpen(e => groupEvents.opened.push(e));
	group.onDidEditorClose(e => groupEvents.closed.push(e));
	group.onDidEditorActivate(e => groupEvents.activated.push(e));
	group.onDidEditorPin(e => groupEvents.pinned.push(e));
	group.onDidEditorUnpin(e => groupEvents.unpinned.push(e));
	group.onDidEditorMove(e => groupEvents.moved.push(e));
	group.onDidEditorDispose(e => groupEvents.disposed.push(e));

	return groupEvents;
}

let index = 0;
class TestEditorInput extends EditorInput {
	constructor(public id: string) {
		super();
	}
	getTypeId() { return 'testEditorInputForGroups'; }
	resolve(): Promise<IEditorModel> { return Promise.resolve(null!); }

	matches(other: TestEditorInput): boolean {
		return other && this.id === other.id && other instanceof TestEditorInput;
	}

	setDirty(): void {
		this._onDidChangeDirty.fire();
	}

	setLabel(): void {
		this._onDidChangeLabel.fire();
	}
}

class NonSerializableTestEditorInput extends EditorInput {
	constructor(public id: string) {
		super();
	}
	getTypeId() { return 'testEditorInputForGroups-nonSerializable'; }
	resolve(): Promise<IEditorModel> { return Promise.resolve(null!); }

	matches(other: NonSerializableTestEditorInput): boolean {
		return other && this.id === other.id && other instanceof NonSerializableTestEditorInput;
	}
}

class TestFileEditorInput extends EditorInput implements IFileEditorInput {

	constructor(public id: string, private resource: URI) {
		super();
	}
	getTypeId() { return 'testFileEditorInputForGroups'; }
	resolve(): Promise<IEditorModel> { return Promise.resolve(null!); }
	setEncoding(encoding: string) { }
	getEncoding(): string { return null!; }
	setPreferredEncoding(encoding: string) { }
	getResource(): URI { return this.resource; }
	setForceOpenAsBinary(): void { }
	setMode(mode: string) { }
	setPreferredMode(mode: string) { }

	matches(other: TestFileEditorInput): boolean {
		return other && this.id === other.id && other instanceof TestFileEditorInput;
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

	serialize(editorInput: EditorInput): string {
		let testEditorInput = <TestEditorInput>editorInput;
		let testInput: ISerializedTestInput = {
			id: testEditorInput.id
		};

		return JSON.stringify(testInput);
	}

	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): EditorInput {
		let testInput: ISerializedTestInput = JSON.parse(serializedEditorInput);

		return new TestEditorInput(testInput.id);
	}
}

suite('Workbench editor groups', () => {

	function registerEditorInputFactory() {
		Registry.as<IEditorInputFactoryRegistry>(EditorExtensions.EditorInputFactories).registerEditorInputFactory('testEditorInputForGroups', TestEditorInputFactory);
	}

	registerEditorInputFactory();

	teardown(() => {
		index = 1;
	});

	test('Clone Group', function () {
		const group = createGroup();

		const input1 = input();
		const input2 = input();
		const input3 = input();

		// Pinned and Active
		group.openEditor(input1, { pinned: true, active: true });
		group.openEditor(input2, { pinned: true, active: true });
		group.openEditor(input3, { pinned: false, active: true });

		const clone = group.clone();
		assert.notEqual(group.id, clone.id);
		assert.equal(clone.count, 3);
		assert.equal(clone.isPinned(input1), true);
		assert.equal(clone.isPinned(input2), true);
		assert.equal(clone.isPinned(input3), false);
		assert.equal(clone.isActive(input3), true);
	});

	test('contains() with diff editor support', function () {
		const group = createGroup();

		const input1 = input();
		const input2 = input();

		const diffInput = new DiffEditorInput('name', 'description', input1, input2);

		group.openEditor(input2, { pinned: true, active: true });

		assert.equal(group.contains(input2), true);
		assert.equal(group.contains(diffInput), false);
		assert.equal(group.contains(diffInput, true), true);
	});

	test('group serialization', function () {
		inst().invokeFunction(accessor => Registry.as<IEditorInputFactoryRegistry>(EditorExtensions.EditorInputFactories).start(accessor));
		const group = createGroup();

		const input1 = input();
		const input2 = input();
		const input3 = input();

		// Pinned and Active
		group.openEditor(input1, { pinned: true, active: true });
		group.openEditor(input2, { pinned: true, active: true });
		group.openEditor(input3, { pinned: false, active: true });

		const deserialized = createGroup(group.serialize());
		assert.equal(group.id, deserialized.id);
		assert.equal(deserialized.count, 3);
		assert.equal(deserialized.isPinned(input1), true);
		assert.equal(deserialized.isPinned(input2), true);
		assert.equal(deserialized.isPinned(input3), false);
		assert.equal(deserialized.isActive(input3), true);
	});

	test('One Editor', function () {
		const group = createGroup();
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

		let index = group.closeEditor(input1);
		assert.equal(index, 0);
		assert.equal(group.count, 0);
		assert.equal(group.getEditors(true).length, 0);
		assert.equal(group.activeEditor, undefined);
		assert.equal(events.closed[0].editor, input1);
		assert.equal(events.closed[0].index, 0);
		assert.equal(events.closed[0].replaced, false);

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
		assert.equal(group.activeEditor, undefined);
		assert.equal(events.closed[1].editor, input2);
		assert.equal(events.closed[1].index, 0);
		assert.equal(events.closed[1].replaced, false);

		index = group.closeEditor(input2);
		assert.ok(typeof index !== 'number');
		assert.equal(group.count, 0);
		assert.equal(group.getEditors(true).length, 0);
		assert.equal(group.activeEditor, undefined);
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
		assert.equal(group.activeEditor, undefined);
		assert.equal(events.closed[2].editor, input3);

		assert.equal(events.opened[2], input3);
		assert.equal(events.activated[2], input3);

		group.closeEditor(input3);
		assert.equal(group.count, 0);
		assert.equal(group.getEditors(true).length, 0);
		assert.equal(group.activeEditor, undefined);
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
		assert.equal(group.activeEditor, undefined);
		assert.equal(events.closed[3].editor, input4);
	});

	test('Multiple Editors - Pinned and Active', function () {
		const group = createGroup();
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

	test('Multiple Editors - Preview editor moves to the side of the active one', function () {
		const group = createGroup();

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

	test('Multiple Editors - Pinned and Active (DEFAULT_OPEN_EDITOR_DIRECTION = Direction.LEFT)', function () {
		let inst = new TestInstantiationService();
		inst.stub(IStorageService, new TestStorageService());
		inst.stub(ILifecycleService, new TestLifecycleService());
		inst.stub(IWorkspaceContextService, new TestContextService());
		inst.stub(ITelemetryService, NullTelemetryService);

		const config = new TestConfigurationService();
		inst.stub(IConfigurationService, config);
		config.setUserConfiguration('workbench', { editor: { openPositioning: 'left' } });

		const group: EditorGroup = inst.createInstance(EditorGroup, undefined);

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

		group.closeAllEditors();

		assert.equal(events.closed.length, 3);
		assert.equal(group.count, 0);
	});

	test('Multiple Editors - Pinned and Not Active', function () {
		const group = createGroup();

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

	test('Multiple Editors - Preview gets overwritten', function () {
		const group = createGroup();
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
		assert.equal(events.closed[0].replaced, true);
		assert.equal(events.closed[1].replaced, true);

		const mru = group.getEditors(true);
		assert.equal(mru[0], input3);
		assert.equal(mru.length, 1);
	});

	test('Multiple Editors - set active', function () {
		const group = createGroup();
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

	test('Multiple Editors - pin and unpin', function () {
		const group = createGroup();
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

	test('Multiple Editors - closing picks next from MRU list', function () {
		const group = createGroup();
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

	test('Multiple Editors - closing picks next to the right', function () {
		let inst = new TestInstantiationService();
		inst.stub(IStorageService, new TestStorageService());
		inst.stub(ILifecycleService, new TestLifecycleService());
		inst.stub(IWorkspaceContextService, new TestContextService());
		inst.stub(ITelemetryService, NullTelemetryService);

		const config = new TestConfigurationService();
		config.setUserConfiguration('workbench', { editor: { focusRecentEditorAfterClose: false } });
		inst.stub(IConfigurationService, config);

		const group = inst.createInstance(EditorGroup, undefined);
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
		group.closeEditor(input1);

		assert.equal(group.activeEditor, input2);
		assert.equal(group.count, 3);

		group.setActive(input3);
		group.closeEditor(input3);

		assert.equal(group.activeEditor, input4);
		assert.equal(group.count, 2);

		group.closeEditor(input4);

		assert.equal(group.activeEditor, input2);
		assert.equal(group.count, 1);

		group.closeEditor(input2);

		assert.ok(!group.activeEditor);
		assert.equal(group.count, 0);
	});

	test('Multiple Editors - move editor', function () {
		const group = createGroup();
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

	test('Multiple Editors - move editor across groups', function () {
		const group1 = createGroup();
		const group2 = createGroup();

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

	test('Multiple Editors - move editor across groups (input already exists in group 1)', function () {
		const group1 = createGroup();
		const group2 = createGroup();

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

	test('Multiple Editors - Pinned & Non Active', function () {
		const group = createGroup();

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

	test('Multiple Editors - Close Others, Close Left, Close Right', function () {
		const group = createGroup();

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
		group.closeEditors(group.activeEditor!);
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
		group.closeEditors(group.activeEditor!, CloseDirection.LEFT);
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
		group.closeEditors(group.activeEditor!, CloseDirection.RIGHT);
		assert.equal(group.activeEditor, input3);
		assert.equal(group.count, 3);
		assert.equal(group.getEditors()[0], input1);
		assert.equal(group.getEditors()[1], input2);
		assert.equal(group.getEditors()[2], input3);
	});

	test('Multiple Editors - real user example', function () {
		const group = createGroup();

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

	test('Single Group, Single Editor - persist', function () {
		let inst = new TestInstantiationService();

		inst.stub(IStorageService, new TestStorageService());
		inst.stub(IWorkspaceContextService, new TestContextService());
		const lifecycle = new TestLifecycleService();
		inst.stub(ILifecycleService, lifecycle);
		inst.stub(ITelemetryService, NullTelemetryService);

		const config = new TestConfigurationService();
		config.setUserConfiguration('workbench', { editor: { openPositioning: 'right' } });
		inst.stub(IConfigurationService, config);

		inst.invokeFunction(accessor => Registry.as<IEditorInputFactoryRegistry>(EditorExtensions.EditorInputFactories).start(accessor));

		let group = createGroup();

		const input1 = input();
		group.openEditor(input1);

		assert.equal(group.count, 1);
		assert.equal(group.activeEditor!.matches(input1), true);
		assert.equal(group.previewEditor!.matches(input1), true);
		assert.equal(group.isActive(input1), true);

		// Create model again - should load from storage
		group = inst.createInstance(EditorGroup, group.serialize());

		assert.equal(group.count, 1);
		assert.equal(group.activeEditor!.matches(input1), true);
		assert.equal(group.previewEditor!.matches(input1), true);
		assert.equal(group.isActive(input1), true);
	});

	test('Multiple Groups, Multiple editors - persist', function () {
		let inst = new TestInstantiationService();

		inst.stub(IStorageService, new TestStorageService());
		inst.stub(IWorkspaceContextService, new TestContextService());
		const lifecycle = new TestLifecycleService();
		inst.stub(ILifecycleService, lifecycle);
		inst.stub(ITelemetryService, NullTelemetryService);

		const config = new TestConfigurationService();
		config.setUserConfiguration('workbench', { editor: { openPositioning: 'right' } });
		inst.stub(IConfigurationService, config);

		inst.invokeFunction(accessor => Registry.as<IEditorInputFactoryRegistry>(EditorExtensions.EditorInputFactories).start(accessor));

		let group1 = createGroup();

		const g1_input1 = input();
		const g1_input2 = input();
		const g1_input3 = input();

		group1.openEditor(g1_input1, { active: true, pinned: true });
		group1.openEditor(g1_input2, { active: true, pinned: false });
		group1.openEditor(g1_input3, { active: false, pinned: true });

		let group2 = createGroup();

		const g2_input1 = input();
		const g2_input2 = input();
		const g2_input3 = input();

		group2.openEditor(g2_input1, { active: true, pinned: true });
		group2.openEditor(g2_input2, { active: false, pinned: false });
		group2.openEditor(g2_input3, { active: false, pinned: true });

		assert.equal(group1.count, 3);
		assert.equal(group2.count, 3);
		assert.equal(group1.activeEditor!.matches(g1_input2), true);
		assert.equal(group2.activeEditor!.matches(g2_input1), true);
		assert.equal(group1.previewEditor!.matches(g1_input2), true);
		assert.equal(group2.previewEditor!.matches(g2_input2), true);

		assert.equal(group1.getEditors(true)[0].matches(g1_input2), true);
		assert.equal(group1.getEditors(true)[1].matches(g1_input1), true);
		assert.equal(group1.getEditors(true)[2].matches(g1_input3), true);

		assert.equal(group2.getEditors(true)[0].matches(g2_input1), true);
		assert.equal(group2.getEditors(true)[1].matches(g2_input2), true);
		assert.equal(group2.getEditors(true)[2].matches(g2_input3), true);

		// Create model again - should load from storage
		group1 = inst.createInstance(EditorGroup, group1.serialize());
		group2 = inst.createInstance(EditorGroup, group2.serialize());

		assert.equal(group1.count, 3);
		assert.equal(group2.count, 3);
		assert.equal(group1.activeEditor!.matches(g1_input2), true);
		assert.equal(group2.activeEditor!.matches(g2_input1), true);
		assert.equal(group1.previewEditor!.matches(g1_input2), true);
		assert.equal(group2.previewEditor!.matches(g2_input2), true);

		assert.equal(group1.getEditors(true)[0].matches(g1_input2), true);
		assert.equal(group1.getEditors(true)[1].matches(g1_input1), true);
		assert.equal(group1.getEditors(true)[2].matches(g1_input3), true);

		assert.equal(group2.getEditors(true)[0].matches(g2_input1), true);
		assert.equal(group2.getEditors(true)[1].matches(g2_input2), true);
		assert.equal(group2.getEditors(true)[2].matches(g2_input3), true);
	});

	test('Single group, multiple editors - persist (some not persistable)', function () {
		let inst = new TestInstantiationService();

		inst.stub(IStorageService, new TestStorageService());
		inst.stub(IWorkspaceContextService, new TestContextService());
		const lifecycle = new TestLifecycleService();
		inst.stub(ILifecycleService, lifecycle);
		inst.stub(ITelemetryService, NullTelemetryService);

		const config = new TestConfigurationService();
		config.setUserConfiguration('workbench', { editor: { openPositioning: 'right' } });
		inst.stub(IConfigurationService, config);

		inst.invokeFunction(accessor => Registry.as<IEditorInputFactoryRegistry>(EditorExtensions.EditorInputFactories).start(accessor));

		let group = createGroup();

		const serializableInput1 = input();
		const nonSerializableInput2 = input('3', true);
		const serializableInput2 = input();

		group.openEditor(serializableInput1, { active: true, pinned: true });
		group.openEditor(nonSerializableInput2, { active: true, pinned: false });
		group.openEditor(serializableInput2, { active: false, pinned: true });

		assert.equal(group.count, 3);
		assert.equal(group.activeEditor!.matches(nonSerializableInput2), true);
		assert.equal(group.previewEditor!.matches(nonSerializableInput2), true);

		assert.equal(group.getEditors(true)[0].matches(nonSerializableInput2), true);
		assert.equal(group.getEditors(true)[1].matches(serializableInput1), true);
		assert.equal(group.getEditors(true)[2].matches(serializableInput2), true);

		// Create model again - should load from storage
		group = inst.createInstance(EditorGroup, group.serialize());

		assert.equal(group.count, 2);
		assert.equal(group.activeEditor!.matches(serializableInput1), true);
		assert.equal(group.previewEditor, null);

		assert.equal(group.getEditors(true)[0].matches(serializableInput1), true);
		assert.equal(group.getEditors(true)[1].matches(serializableInput2), true);
	});

	test('Multiple groups, multiple editors - persist (some not persistable, causes empty group)', function () {
		let inst = new TestInstantiationService();

		inst.stub(IStorageService, new TestStorageService());
		inst.stub(IWorkspaceContextService, new TestContextService());
		const lifecycle = new TestLifecycleService();
		inst.stub(ILifecycleService, lifecycle);
		inst.stub(ITelemetryService, NullTelemetryService);

		const config = new TestConfigurationService();
		config.setUserConfiguration('workbench', { editor: { openPositioning: 'right' } });
		inst.stub(IConfigurationService, config);

		inst.invokeFunction(accessor => Registry.as<IEditorInputFactoryRegistry>(EditorExtensions.EditorInputFactories).start(accessor));

		let group1 = createGroup();
		let group2 = createGroup();

		const serializableInput1 = input();
		const serializableInput2 = input();
		const nonSerializableInput = input('2', true);

		group1.openEditor(serializableInput1, { pinned: true });
		group1.openEditor(serializableInput2);

		group2.openEditor(nonSerializableInput);

		// Create model again - should load from storage
		group1 = inst.createInstance(EditorGroup, group1.serialize());
		group2 = inst.createInstance(EditorGroup, group2.serialize());

		assert.equal(group1.count, 2);
		assert.equal(group1.getEditors()[0].matches(serializableInput1), true);
		assert.equal(group1.getEditors()[1].matches(serializableInput2), true);
	});

	test('Multiple Editors - Resources', function () {
		const group1 = createGroup();
		const group2 = createGroup();

		const input1Resource = URI.file('/hello/world.txt');
		const input1ResourceUpper = URI.file('/hello/WORLD.txt');
		const input1 = input(undefined, false, input1Resource);
		group1.openEditor(input1);

		assert.ok(group1.contains(input1Resource));
		assert.equal(group1.getEditor(input1Resource), input1);

		assert.ok(!group1.getEditor(input1ResourceUpper));
		assert.ok(!group1.contains(input1ResourceUpper));

		group2.openEditor(input1);
		group1.closeEditor(input1);

		assert.ok(!group1.contains(input1Resource));
		assert.ok(!group1.getEditor(input1Resource));
		assert.ok(!group1.getEditor(input1ResourceUpper));
		assert.ok(group2.contains(input1Resource));
		assert.equal(group2.getEditor(input1Resource), input1);

		const input1ResourceClone = URI.file('/hello/world.txt');
		const input1Clone = input(undefined, false, input1ResourceClone);
		group1.openEditor(input1Clone);

		assert.ok(group1.contains(input1Resource));

		group2.closeEditor(input1);

		assert.ok(group1.contains(input1Resource));
		assert.equal(group1.getEditor(input1Resource), input1Clone);
		assert.ok(!group2.contains(input1Resource));

		group1.closeEditor(input1Clone);

		assert.ok(!group1.contains(input1Resource));
	});

	test('Multiple Editors - Editor Dispose', function () {
		const group1 = createGroup();
		const group2 = createGroup();

		const group1Listener = groupListener(group1);
		const group2Listener = groupListener(group2);

		const input1 = input();
		const input2 = input();
		const input3 = input();

		group1.openEditor(input1, { pinned: true, active: true });
		group1.openEditor(input2, { pinned: true, active: true });
		group1.openEditor(input3, { pinned: true, active: true });

		group2.openEditor(input1, { pinned: true, active: true });
		group2.openEditor(input2, { pinned: true, active: true });

		input1.dispose();

		assert.equal(group1Listener.disposed.length, 1);
		assert.equal(group2Listener.disposed.length, 1);
		assert.ok(group1Listener.disposed[0].matches(input1));
		assert.ok(group2Listener.disposed[0].matches(input1));

		input3.dispose();
		assert.equal(group1Listener.disposed.length, 2);
		assert.equal(group2Listener.disposed.length, 1);
		assert.ok(group1Listener.disposed[1].matches(input3));
	});

	test('Preview tab does not have a stable position (https://github.com/Microsoft/vscode/issues/8245)', function () {
		const group1 = createGroup();

		const input1 = input();
		const input2 = input();
		const input3 = input();

		group1.openEditor(input1, { pinned: true, active: true });
		group1.openEditor(input2, { active: true });
		group1.setActive(input1);

		group1.openEditor(input3, { active: true });
		assert.equal(group1.indexOf(input3), 1);
	});

	test('Multiple Editors - Editor Emits Dirty and Label Changed', function () {
		const group1 = createGroup();
		const group2 = createGroup();

		const input1 = input();
		const input2 = input();

		group1.openEditor(input1, { pinned: true, active: true });
		group2.openEditor(input2, { pinned: true, active: true });

		let dirty1Counter = 0;
		group1.onDidEditorBecomeDirty(() => {
			dirty1Counter++;
		});

		let dirty2Counter = 0;
		group2.onDidEditorBecomeDirty(() => {
			dirty2Counter++;
		});

		let label1ChangeCounter = 0;
		group1.onDidEditorLabelChange(() => {
			label1ChangeCounter++;
		});

		let label2ChangeCounter = 0;
		group2.onDidEditorLabelChange(() => {
			label2ChangeCounter++;
		});

		(<TestEditorInput>input1).setDirty();
		(<TestEditorInput>input1).setLabel();

		assert.equal(dirty1Counter, 1);
		assert.equal(label1ChangeCounter, 1);

		(<TestEditorInput>input2).setDirty();
		(<TestEditorInput>input2).setLabel();

		assert.equal(dirty2Counter, 1);
		assert.equal(label2ChangeCounter, 1);

		group2.closeAllEditors();

		(<TestEditorInput>input2).setDirty();
		(<TestEditorInput>input2).setLabel();

		assert.equal(dirty2Counter, 1);
		assert.equal(label2ChangeCounter, 1);
		assert.equal(dirty1Counter, 1);
		assert.equal(label1ChangeCounter, 1);
	});
});