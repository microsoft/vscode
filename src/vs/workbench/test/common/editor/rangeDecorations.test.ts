/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import URI from 'vs/base/common/uri';
import { TestEditorService, workbenchInstantiationService } from 'vs/workbench/test/workbenchTestServices';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ModeServiceImpl } from 'vs/editor/common/services/modeServiceImpl';
import WorkbenchEditorService = require('vs/workbench/services/editor/common/editorService');
import { RangeHighlightDecorations } from 'vs/workbench/common/editor/rangeDecorations';
import { Model } from 'vs/editor/common/model/model';
import { mockCodeEditor, MockCodeEditor } from 'vs/editor/test/common/mocks/mockCodeEditor';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { IEditorInput } from 'vs/platform/editor/common/editor';
import { FileEditorInput } from 'vs/workbench/parts/files/common/editors/fileEditorInput';
import { TextModel } from 'vs/editor/common/model/textModel';
import { Range } from 'vs/editor/common/core/range';
import { Position } from 'vs/editor/common/core/position';
import { Cursor } from 'vs/editor/common/controller/cursor';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';

suite('Editor - Range decorations', () => {

	let instantiationService: TestInstantiationService;
	let editorService: WorkbenchEditorService.IWorkbenchEditorService;
	let modelService: IModelService;
	let modeService: IModeService;
	let codeEditor: editorCommon.ICommonCodeEditor;
	let cursor: Cursor;
	let model: Model;
	let text: string;
	let testObject: RangeHighlightDecorations;
	let modelsToDispose: Model[] = [];

	setup(() => {
		instantiationService = <TestInstantiationService>workbenchInstantiationService();
		editorService = <WorkbenchEditorService.IWorkbenchEditorService>instantiationService.stub(WorkbenchEditorService.IWorkbenchEditorService, new TestEditorService(function () { }));
		modeService = instantiationService.stub(IModeService, ModeServiceImpl);
		modelService = <IModelService>instantiationService.stub(IModelService, stubModelService(instantiationService));
		text = 'LINE1' + '\n' + 'LINE2' + '\n' + 'LINE3' + '\n' + 'LINE4' + '\r\n' + 'LINE5';
		model = aModel(URI.file('some_file'));
		codeEditor = mockCodeEditor([], { model });
		cursor = (<MockCodeEditor>codeEditor).getCursor();
		mockEditorService(codeEditor.getModel().uri);

		instantiationService.stub(WorkbenchEditorService.IWorkbenchEditorService, 'getActiveEditor', { getControl: () => { return codeEditor; } });

		testObject = instantiationService.createInstance(RangeHighlightDecorations);
	});

	teardown(() => {
		codeEditor.dispose();
		modelsToDispose.forEach(model => model.dispose());
	});

	test('highlight range for the resource if it is an active editor', function () {
		let range: editorCommon.IRange = { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 };
		testObject.highlightRange({ resource: model.uri, range });

		let actuals = rangeHighlightDecorations(model);

		assert.deepEqual([range], actuals);
	});

	test('remove highlight range', function () {
		testObject.highlightRange({ resource: model.uri, range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 } });
		testObject.removeHighlightRange();

		let actuals = rangeHighlightDecorations(model);

		assert.deepEqual([], actuals);
	});

	test('highlight range for the resource removes previous highlight', function () {
		testObject.highlightRange({ resource: model.uri, range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 } });
		let range: editorCommon.IRange = { startLineNumber: 2, startColumn: 2, endLineNumber: 4, endColumn: 3 };
		testObject.highlightRange({ resource: model.uri, range });

		let actuals = rangeHighlightDecorations(model);

		assert.deepEqual([range], actuals);
	});

	test('highlight range for a new resource removes highlight of previous resource', function () {
		testObject.highlightRange({ resource: model.uri, range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 } });

		let anotherModel = prepareActiveEditor('anotherModel');
		let range: editorCommon.IRange = { startLineNumber: 2, startColumn: 2, endLineNumber: 4, endColumn: 3 };
		testObject.highlightRange({ resource: anotherModel.uri, range });

		let actuals = rangeHighlightDecorations(model);
		assert.deepEqual([], actuals);
		actuals = rangeHighlightDecorations(anotherModel);
		assert.deepEqual([range], actuals);
	});

	test('highlight is removed on model change', function () {
		testObject.highlightRange({ resource: model.uri, range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 } });
		prepareActiveEditor('anotherModel');

		let actuals = rangeHighlightDecorations(model);
		assert.deepEqual([], actuals);
	});

	test('highlight is removed on cursor position change', function () {
		testObject.highlightRange({ resource: model.uri, range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 } });
		cursor.trigger('mouse', editorCommon.Handler.MoveTo, {
			position: new Position(2, 1)
		});

		let actuals = rangeHighlightDecorations(model);
		assert.deepEqual([], actuals);
	});

	test('range is not highlight if not active editor', function () {
		let model = aModel(URI.file('some model'));
		testObject.highlightRange({ resource: model.uri, range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 } });

		let actuals = rangeHighlightDecorations(model);
		assert.deepEqual([], actuals);
	});

	test('previous highlight is not removed if not active editor', function () {
		let range: editorCommon.IRange = { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 };
		testObject.highlightRange({ resource: model.uri, range });

		let model1 = aModel(URI.file('some model'));
		testObject.highlightRange({ resource: model1.uri, range: { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 1 } });

		let actuals = rangeHighlightDecorations(model);
		assert.deepEqual([range], actuals);
	});

	function prepareActiveEditor(resource: string): Model {
		let model = aModel(URI.file(resource));
		codeEditor.setModel(model);
		mockEditorService(model.uri);
		return model;
	}

	function aModel(resource: URI, content: string = text): Model {
		let model = Model.createFromString(content, TextModel.DEFAULT_CREATION_OPTIONS, null, resource);
		modelsToDispose.push(model);
		return model;
	}

	function mockEditorService(editorInput: IEditorInput);
	function mockEditorService(resource: URI);
	function mockEditorService(arg: any) {
		let editorInput: IEditorInput = arg instanceof URI ? instantiationService.createInstance(FileEditorInput, arg, void 0) : arg;
		instantiationService.stub(WorkbenchEditorService.IWorkbenchEditorService, 'getActiveEditorInput', editorInput);
	}

	function rangeHighlightDecorations(m: Model): editorCommon.IRange[] {
		let rangeHighlights: editorCommon.IRange[] = [];

		for (let dec of m.getAllDecorations()) {
			if (dec.options.className === 'rangeHighlight') {
				rangeHighlights.push(dec.range);
			}
		}

		rangeHighlights.sort(Range.compareRangesUsingStarts);
		return rangeHighlights;
	}

	function stubModelService(instantiationService: TestInstantiationService): IModelService {
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		return instantiationService.createInstance(ModelServiceImpl);
	}
});