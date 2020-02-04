/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { EditorOptions, EditorInput, IEditorInputFactoryRegistry, Extensions as EditorExtensions, IEditorInputFactory, IFileEditorInput } from 'vs/workbench/common/editor';
import { URI } from 'vs/base/common/uri';
import { workbenchInstantiationService, TestStorageService } from 'vs/workbench/test/browser/workbenchTestServices';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorPart } from 'vs/workbench/browser/parts/editor/editorPart';
import { IEditorRegistry, EditorDescriptor, Extensions } from 'vs/workbench/browser/editor';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IEditorGroupsService, GroupDirection } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorModel } from 'vs/platform/editor/common/editor';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { CancellationToken } from 'vs/base/common/cancellation';
import { HistoryService } from 'vs/workbench/services/history/browser/history';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { EditorService } from 'vs/workbench/services/editor/browser/editorService';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { timeout } from 'vs/base/common/async';

const TEST_EDITOR_ID = 'MyTestEditorForEditorHistory';
const TEST_EDITOR_INPUT_ID = 'testEditorInputForHistoyService';
const TEST_SERIALIZABLE_EDITOR_INPUT_ID = 'testSerializableEditorInputForHistoyService';

class TestEditorControl extends BaseEditor {

	constructor() { super(TEST_EDITOR_ID, NullTelemetryService, new TestThemeService(), new TestStorageService()); }

	async setInput(input: EditorInput, options: EditorOptions | undefined, token: CancellationToken): Promise<void> {
		super.setInput(input, options, token);

		await input.resolve();
	}

	getId(): string { return TEST_EDITOR_ID; }
	layout(): void { }
	createEditor(): any { }
}

class TestEditorInput extends EditorInput implements IFileEditorInput {

	constructor(public resource: URI) { super(); }

	getTypeId() { return TEST_EDITOR_INPUT_ID; }
	resolve(): Promise<IEditorModel | null> { return Promise.resolve(null); }
	matches(other: TestEditorInput): boolean { return other && this.resource.toString() === other.resource.toString() && other instanceof TestEditorInput; }
	setEncoding(encoding: string) { }
	getEncoding() { return undefined; }
	setPreferredEncoding(encoding: string) { }
	setMode(mode: string) { }
	setPreferredMode(mode: string) { }
	getResource(): URI { return this.resource; }
	setForceOpenAsBinary(): void { }
}

class HistoryTestEditorInput extends TestEditorInput {
	getTypeId() { return TEST_SERIALIZABLE_EDITOR_INPUT_ID; }
}

interface ISerializedTestInput {
	resource: string;
}

class HistoryTestEditorInputFactory implements IEditorInputFactory {

	canSerialize(editorInput: EditorInput): boolean {
		return true;
	}

	serialize(editorInput: EditorInput): string {
		let testEditorInput = <HistoryTestEditorInput>editorInput;
		let testInput: ISerializedTestInput = {
			resource: testEditorInput.resource.toString()
		};

		return JSON.stringify(testInput);
	}

	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): EditorInput {
		let testInput: ISerializedTestInput = JSON.parse(serializedEditorInput);

		return new HistoryTestEditorInput(URI.parse(testInput.resource));
	}
}

async function createServices(): Promise<[EditorPart, HistoryService, EditorService]> {
	const instantiationService = workbenchInstantiationService();

	const part = instantiationService.createInstance(EditorPart);
	part.create(document.createElement('div'));
	part.layout(400, 300);

	await part.whenRestored;

	instantiationService.stub(IEditorGroupsService, part);

	const editorService = instantiationService.createInstance(EditorService);
	instantiationService.stub(IEditorService, editorService);

	const historyService = instantiationService.createInstance(HistoryService);
	instantiationService.stub(IHistoryService, historyService);

	return [part, historyService, editorService];
}

suite('HistoryService', function () {

	let disposables: IDisposable[] = [];

	setup(() => {
		disposables.push(Registry.as<IEditorInputFactoryRegistry>(EditorExtensions.EditorInputFactories).registerEditorInputFactory(TEST_SERIALIZABLE_EDITOR_INPUT_ID, HistoryTestEditorInputFactory));
		disposables.push(Registry.as<IEditorRegistry>(Extensions.Editors).registerEditor(EditorDescriptor.create(TestEditorControl, TEST_EDITOR_ID, 'My Test Editor For History Editor Service'), [new SyncDescriptor(TestEditorInput), new SyncDescriptor(HistoryTestEditorInput)]));
	});

	teardown(() => {
		dispose(disposables);
		disposables = [];
	});

	test('back / forward', async () => {
		const [part, historyService] = await createServices();

		const input1 = new TestEditorInput(URI.parse('foo://bar1'));
		await part.activeGroup.openEditor(input1, EditorOptions.create({ pinned: true }));
		assert.equal(part.activeGroup.activeEditor, input1);

		const input2 = new TestEditorInput(URI.parse('foo://bar2'));
		await part.activeGroup.openEditor(input2, EditorOptions.create({ pinned: true }));
		assert.equal(part.activeGroup.activeEditor, input2);

		historyService.back();
		assert.equal(part.activeGroup.activeEditor, input1);

		historyService.forward();
		assert.equal(part.activeGroup.activeEditor, input2);

		part.dispose();
	});

	test('getHistory', async () => {
		const [part, historyService] = await createServices();

		let history = historyService.getHistory();
		assert.equal(history.length, 0);

		const input1 = new TestEditorInput(URI.parse('foo://bar1'));
		await part.activeGroup.openEditor(input1, EditorOptions.create({ pinned: true }));

		const input2 = new TestEditorInput(URI.parse('foo://bar2'));
		await part.activeGroup.openEditor(input2, EditorOptions.create({ pinned: true }));

		history = historyService.getHistory();
		assert.equal(history.length, 2);

		historyService.remove(input2);
		history = historyService.getHistory();
		assert.equal(history.length, 1);
		assert.equal(history[0], input1);

		part.dispose();
	});

	test('getLastActiveFile', async () => {
		const [part, historyService] = await createServices();

		assert.ok(!historyService.getLastActiveFile('foo'));

		const input1 = new TestEditorInput(URI.parse('foo://bar1'));
		await part.activeGroup.openEditor(input1, EditorOptions.create({ pinned: true }));

		assert.equal(historyService.getLastActiveFile('foo')?.toString(), input1.getResource().toString());

		part.dispose();
	});

	test('open next/previous recently used editor (single group)', async () => {
		const [part, historyService] = await createServices();

		const input1 = new TestEditorInput(URI.parse('foo://bar1'));
		const input2 = new TestEditorInput(URI.parse('foo://bar2'));

		await part.activeGroup.openEditor(input1, EditorOptions.create({ pinned: true }));
		assert.equal(part.activeGroup.activeEditor, input1);

		await part.activeGroup.openEditor(input2, EditorOptions.create({ pinned: true }));
		assert.equal(part.activeGroup.activeEditor, input2);

		historyService.openPreviouslyUsedEditor();
		assert.equal(part.activeGroup.activeEditor, input1);

		historyService.openNextRecentlyUsedEditor();
		assert.equal(part.activeGroup.activeEditor, input2);

		historyService.openPreviouslyUsedEditor(part.activeGroup.id);
		assert.equal(part.activeGroup.activeEditor, input1);

		historyService.openNextRecentlyUsedEditor(part.activeGroup.id);
		assert.equal(part.activeGroup.activeEditor, input2);

		part.dispose();
	});

	test('open next/previous recently used editor (multi group)', async () => {
		const [part, historyService] = await createServices();
		const rootGroup = part.activeGroup;

		const input1 = new TestEditorInput(URI.parse('foo://bar1'));
		const input2 = new TestEditorInput(URI.parse('foo://bar2'));

		const sideGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);

		await rootGroup.openEditor(input1, EditorOptions.create({ pinned: true }));
		await sideGroup.openEditor(input2, EditorOptions.create({ pinned: true }));

		historyService.openPreviouslyUsedEditor();
		assert.equal(part.activeGroup, rootGroup);
		assert.equal(rootGroup.activeEditor, input1);

		historyService.openNextRecentlyUsedEditor();
		assert.equal(part.activeGroup, sideGroup);
		assert.equal(sideGroup.activeEditor, input2);

		part.dispose();
	});

	test('open next/previous recently is reset when other input opens', async () => {
		const [part, historyService] = await createServices();

		const input1 = new TestEditorInput(URI.parse('foo://bar1'));
		const input2 = new TestEditorInput(URI.parse('foo://bar2'));
		const input3 = new TestEditorInput(URI.parse('foo://bar3'));
		const input4 = new TestEditorInput(URI.parse('foo://bar4'));

		await part.activeGroup.openEditor(input1, EditorOptions.create({ pinned: true }));
		await part.activeGroup.openEditor(input2, EditorOptions.create({ pinned: true }));
		await part.activeGroup.openEditor(input3, EditorOptions.create({ pinned: true }));

		historyService.openPreviouslyUsedEditor();
		assert.equal(part.activeGroup.activeEditor, input2);

		await timeout(0);
		await part.activeGroup.openEditor(input4, EditorOptions.create({ pinned: true }));

		historyService.openPreviouslyUsedEditor();
		assert.equal(part.activeGroup.activeEditor, input2);

		historyService.openNextRecentlyUsedEditor();
		assert.equal(part.activeGroup.activeEditor, input4);

		part.dispose();
	});
});


