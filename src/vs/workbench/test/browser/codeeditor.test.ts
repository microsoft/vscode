/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { TestInstantiationService } from '../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { URI } from '../../../base/common/uri.js';
import { workbenchInstantiationService, TestEditorService } from './workbenchTestServices.js';
import { IModelService } from '../../../editor/common/services/model.js';
import { ILanguageService } from '../../../editor/common/languages/language.js';
import { LanguageService } from '../../../editor/common/services/languageService.js';
import { RangeHighlightDecorations } from '../../browser/codeeditor.js';
import { TextModel } from '../../../editor/common/model/textModel.js';
import { createTestCodeEditor } from '../../../editor/test/browser/testCodeEditor.js';
import { Range, IRange } from '../../../editor/common/core/range.js';
import { Position } from '../../../editor/common/core/position.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { ModelService } from '../../../editor/common/services/modelService.js';
import { CoreNavigationCommands } from '../../../editor/browser/coreCommands.js';
import { ICodeEditor } from '../../../editor/browser/editorBrowser.js';
import { IEditorService } from '../../services/editor/common/editorService.js';
import { createTextModel } from '../../../editor/test/common/testTextModel.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../platform/theme/test/common/testThemeService.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';

suite('Editor - Range decorations', () => {

	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;
	let codeEditor: ICodeEditor;
	let model: TextModel;
	let text: string;
	let testObject: RangeHighlightDecorations;
	const modelsToDispose: TextModel[] = [];

	setup(() => {
		disposables = new DisposableStore();
		instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IEditorService, new TestEditorService());
		instantiationService.stub(ILanguageService, LanguageService);
		instantiationService.stub(IModelService, stubModelService(instantiationService));
		text = 'LINE1' + '\n' + 'LINE2' + '\n' + 'LINE3' + '\n' + 'LINE4' + '\r\n' + 'LINE5';
		model = disposables.add(aModel(URI.file('some_file')));
		codeEditor = disposables.add(createTestCodeEditor(model));

		instantiationService.stub(IEditorService, 'activeEditor', { get resource() { return codeEditor.getModel()!.uri; } });
		instantiationService.stub(IEditorService, 'activeTextEditorControl', codeEditor);

		testObject = disposables.add(instantiationService.createInstance(RangeHighlightDecorations));
	});

	teardown(() => {
		codeEditor.dispose();
		modelsToDispose.forEach(model => model.dispose());
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('highlight range for the resource if it is an active editor', function () {
		const range: IRange = new Range(1, 1, 1, 1);
		testObject.highlightRange({ resource: model.uri, range });

		const actuals = rangeHighlightDecorations(model);

		assert.deepStrictEqual(actuals, [range]);
	});

	test('remove highlight range', function () {
		testObject.highlightRange({ resource: model.uri, range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 } });
		testObject.removeHighlightRange();

		const actuals = rangeHighlightDecorations(model);

		assert.deepStrictEqual(actuals, []);
	});

	test('highlight range for the resource removes previous highlight', function () {
		testObject.highlightRange({ resource: model.uri, range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 } });
		const range: IRange = new Range(2, 2, 4, 3);
		testObject.highlightRange({ resource: model.uri, range });

		const actuals = rangeHighlightDecorations(model);

		assert.deepStrictEqual(actuals, [range]);
	});

	test('highlight range for a new resource removes highlight of previous resource', function () {
		testObject.highlightRange({ resource: model.uri, range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 } });

		const anotherModel = prepareActiveEditor('anotherModel');
		const range: IRange = new Range(2, 2, 4, 3);
		testObject.highlightRange({ resource: anotherModel.uri, range });

		let actuals = rangeHighlightDecorations(model);
		assert.deepStrictEqual(actuals, []);
		actuals = rangeHighlightDecorations(anotherModel);
		assert.deepStrictEqual(actuals, [range]);
	});

	test('highlight is removed on model change', function () {
		testObject.highlightRange({ resource: model.uri, range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 } });
		prepareActiveEditor('anotherModel');

		const actuals = rangeHighlightDecorations(model);
		assert.deepStrictEqual(actuals, []);
	});

	test('highlight is removed on cursor position change', function () {
		testObject.highlightRange({ resource: model.uri, range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 } });
		codeEditor.trigger('mouse', CoreNavigationCommands.MoveTo.id, {
			position: new Position(2, 1)
		});

		const actuals = rangeHighlightDecorations(model);
		assert.deepStrictEqual(actuals, []);
	});

	test('range is not highlight if not active editor', function () {
		const model = aModel(URI.file('some model'));
		testObject.highlightRange({ resource: model.uri, range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 } });

		const actuals = rangeHighlightDecorations(model);
		assert.deepStrictEqual(actuals, []);
	});

	test('previous highlight is not removed if not active editor', function () {
		const range = new Range(1, 1, 1, 1);
		testObject.highlightRange({ resource: model.uri, range });

		const model1 = aModel(URI.file('some model'));
		testObject.highlightRange({ resource: model1.uri, range: { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 1 } });

		const actuals = rangeHighlightDecorations(model);
		assert.deepStrictEqual(actuals, [range]);
	});

	function prepareActiveEditor(resource: string): TextModel {
		const model = aModel(URI.file(resource));
		codeEditor.setModel(model);
		return model;
	}

	function aModel(resource: URI, content: string = text): TextModel {
		const model = createTextModel(content, undefined, undefined, resource);
		modelsToDispose.push(model);
		return model;
	}

	function rangeHighlightDecorations(m: TextModel): IRange[] {
		const rangeHighlights: IRange[] = [];

		for (const dec of m.getAllDecorations()) {
			if (dec.options.className === 'rangeHighlight') {
				rangeHighlights.push(dec.range);
			}
		}

		rangeHighlights.sort(Range.compareRangesUsingStarts);
		return rangeHighlights;
	}

	function stubModelService(instantiationService: TestInstantiationService): IModelService {
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IThemeService, new TestThemeService());
		return instantiationService.createInstance(ModelService);
	}
});
