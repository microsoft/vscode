/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {TestConfigurationService, TestContextService, TestStorageService, TestEventService, TestEditorService, TestQuickOpenService} from 'vs/workbench/test/browser/servicesTestUtils';
import {MockKeybindingService} from 'vs/platform/keybinding/test/common/mockKeybindingService';
import {Registry} from 'vs/platform/platform';
import {EditorHistoryModel, EditorHistoryEntry} from 'vs/workbench/browser/parts/quickopen/editorHistoryModel';
import {QuickOpenHandlerDescriptor, IQuickOpenRegistry, Extensions as QuickOpenExtensions} from 'vs/workbench/browser/quickopen';
import {QuickOpenController} from 'vs/workbench/browser/parts/quickopen/quickOpenController';
import {Mode} from 'vs/base/parts/quickopen/common/quickOpen';
import {QuickOpenAction} from 'vs/workbench/browser/actions/quickOpenAction';
import {StringEditorInput} from 'vs/workbench/common/editor/stringEditorInput';
import {EditorInput} from 'vs/workbench/common/editor';
import {isEmptyObject} from 'vs/base/common/types';
import {join} from 'vs/base/common/paths';
import {BaseEditor, EditorInputAction, EditorInputActionContributor, EditorDescriptor, Extensions, IEditorRegistry, IEditorInputFactory} from 'vs/workbench/browser/parts/editor/baseEditor';
import URI from 'vs/base/common/uri';
import {createInstantiationService} from 'vs/platform/instantiation/common/instantiationService';
import {EventType, EditorEvent} from 'vs/workbench/common/events';
import {Promise, TPromise} from 'vs/base/common/winjs.base';
import {IEditorInput, IEditorModel, IEditorOptions, Position, IEditor, IResourceInput, ITextEditorModel} from 'vs/platform/editor/common/editor';

function toResource(path) {
	return URI.file(join('C:\\', path));
}

let EditorRegistry: IEditorRegistry = Registry.as(Extensions.Editors);
let fileInputAsyncDescriptor = EditorRegistry.getDefaultFileInput();
let fileInputModule = require(fileInputAsyncDescriptor.moduleName);
let fileInputCtor = fileInputModule[fileInputAsyncDescriptor.ctorName];

suite('Workbench QuickOpen', () => {

	test('EditorHistoryEntry', () => {
		let editorService = new TestEditorService();
		let contextService = new TestContextService();
		let inst = createInstantiationService({});

		let model = new EditorHistoryModel(editorService, null, contextService);

		let input1 = inst.createInstance(StringEditorInput, "name1", 'description', "value1", "text/plain", false);
		let entry1 = new EditorHistoryEntry(editorService, contextService, input1, null, null, model);

		assert.equal(input1.getName(), entry1.getLabel());
		assert.equal(input1.getDescription(), entry1.getDescription());
		assert.equal(null, entry1.getResource());
		assert.equal(input1, entry1.getInput());

		let match = [
			{
				start: 1,
				end: 5
			}
		];
		let clone1 = entry1.clone(match);
		assert.equal(clone1.getLabel(), entry1.getLabel());
		assert(clone1.getInput() === input1);
		assert.equal(1, clone1.getHighlights()[0].length);

		let input2 = inst.createInstance(StringEditorInput, "name2", 'description', "value2", "text/plain", false);
		(<any>input2).getResource = () => "path";
		let entry2 = new EditorHistoryEntry(editorService, contextService, input2, null, null, model);
		assert.ok(!entry2.getResource()); // inputs with getResource are not taken as resource for entry, only files and untitled

		assert(!entry1.matches(entry2.getInput()));
		assert(entry1.matches(entry1.getInput()));

		assert(entry1.run(Mode.OPEN, { event: null, quickNavigateConfiguration: null }));
		assert(!entry2.run(Mode.PREVIEW, { event: null, quickNavigateConfiguration: null }));
	});

	test('EditorHistoryEntry is removed when open fails', () => {
		let editorService = new TestEditorService();
		let contextService = new TestContextService();
		let inst = createInstantiationService({});

		let model = new EditorHistoryModel(editorService, null, contextService);

		let input1 = inst.createInstance(StringEditorInput, "name1", 'description', "value1", "text/plain", false);

		model.add(input1);

		assert.equal(1, model.getEntries().length);

		assert(model.getEntries()[0].run(Mode.OPEN, { event: null, quickNavigateConfiguration: null }));

		assert.equal(0, model.getEntries().length);
	});

	test('EditorHistoryModel', () => {
		Registry.as('workbench.contributions.editors').setInstantiationService(createInstantiationService({}));

		let editorService = new TestEditorService();
		let contextService = new TestContextService();

		let inst = createInstantiationService({ editorService: editorService });

		let model = new EditorHistoryModel(editorService, inst, contextService);

		let input1 = inst.createInstance(StringEditorInput, "name1", 'description', "value1", "text/plain", false);
		let input2 = inst.createInstance(StringEditorInput, "name2", 'description', "value2", "text/plain", false);
		let input3 = inst.createInstance(StringEditorInput, "name3", 'description', "value3", "text/plain", false);

		assert.equal(0, model.getEntries().length);

		model.add(input1);
		model.add(input2);

		assert.equal(2, model.getEntries().length);

		model.add(input1);
		assert.equal(2, model.getEntries().length);

		model.add(input3);
		assert(model.getEntries()[0].matches(input3));

		model.remove(input3);
		assert.equal(2, model.getEntries().length);

		let memento = {};
		model.saveTo(memento);
		assert(isEmptyObject(memento));

		let saveInput1 = <EditorInput>inst.createInstance(fileInputCtor, toResource("path1"), "text/plain", void 0);
		let saveInput2 = <EditorInput>inst.createInstance(fileInputCtor, toResource("path2"), "text/plain", void 0);

		model.add(saveInput1);
		model.add(saveInput2);

		model.saveTo(memento);
		assert(!isEmptyObject(memento));

		model = new EditorHistoryModel(editorService, inst, contextService);
		model.loadFrom(memento);

		assert.equal(2, model.getEntries().length);
		assert(model.getEntries()[0].matches(saveInput2));
		assert(model.getEntries()[1].matches(saveInput1));

		model = new EditorHistoryModel(editorService, inst, contextService);

		let cinput1 = <EditorInput>inst.createInstance(fileInputCtor, toResource("Hello World"), "text/plain", void 0);
		let cinput2 = <EditorInput>inst.createInstance(fileInputCtor, toResource("Yes World"), "text/plain", void 0);
		let cinput3 = <EditorInput>inst.createInstance(fileInputCtor, toResource("No Hello"), "text/plain", void 0);

		model.add(cinput1);
		model.add(cinput2);
		model.add(cinput3);

		assert.equal(3, model.getResults("*").length);
		assert.equal(1, model.getResults("HW").length);
		assert.equal(2, model.getResults("World").length);

		assert.equal(1, model.getResults("*")[0].getHighlights()[0].length);

		model = new EditorHistoryModel(editorService, inst, contextService);

		let cinput4 = <EditorInput>inst.createInstance(fileInputCtor, toResource("foo.ts"), "text/plain", void 0);
		let cinput5 = <EditorInput>inst.createInstance(fileInputCtor, toResource("bar.js"), "text/plain", void 0);
		let cinput6 = <EditorInput>inst.createInstance(fileInputCtor, toResource("foo.js"), "text/plain", void 0);

		model.add(cinput4);
		model.add(cinput5);
		model.add(cinput6);

		let sortedResults = model.getResults("*");
		assert.equal(3, model.getResults("*").length);
		assert.equal("c:/bar.js", sortedResults[0].getResource().fsPath.replace(/\\/g, '/'));
		assert.equal("c:/foo.js", sortedResults[1].getResource().fsPath.replace(/\\/g, '/'));
		assert.equal("c:/foo.ts", sortedResults[2].getResource().fsPath.replace(/\\/g, '/'));
	});

	test('QuickOpen Handler and Registry', () => {
		let registry = (<IQuickOpenRegistry>Registry.as(QuickOpenExtensions.Quickopen));
		let handler = new QuickOpenHandlerDescriptor(
			'test',
			'TestHandler',
			",",
			"Handler"
		);

		registry.registerQuickOpenHandler(handler);

		assert(registry.getQuickOpenHandler(",") === handler);

		let handlers = registry.getQuickOpenHandlers();
		assert(handlers.some((handler: QuickOpenHandlerDescriptor) => handler.prefix === ","));
	});

	test('QuickOpen Action', () => {
		let defaultAction = new QuickOpenAction("id", "label", void 0, new TestQuickOpenService((prefix: string) => assert(!prefix)));
		let prefixAction = new QuickOpenAction("id", "label", ",", new TestQuickOpenService((prefix: string) => assert(!!prefix)));

		defaultAction.run();
		prefixAction.run();
	});

	test('QuickOpenController adds to history on editor input change and removes on dispose', () => {
		let editorService = new TestEditorService();

		let eventService = new TestEventService();
		let storageService = new TestStorageService();
		let contextService = new TestContextService();

		let inst = createInstantiationService({ editorService: editorService });

		let controller = new QuickOpenController(
			eventService,
			storageService,
			editorService,
			null,
			null,
			null,
			contextService,
			new MockKeybindingService()
		);

		controller.create();

		assert.equal(0, controller.getEditorHistoryModel().getEntries().length);

		let cinput1 = <EditorInput>inst.createInstance(fileInputCtor, toResource("Hello World"), "text/plain", void 0);
		let event = new EditorEvent(null, "", cinput1, null, Position.LEFT);
		eventService.emit(EventType.EDITOR_INPUT_CHANGING, event);

		assert.equal(1, controller.getEditorHistoryModel().getEntries().length);

		cinput1.dispose();

		assert.equal(0, controller.getEditorHistoryModel().getEntries().length);
	});
});