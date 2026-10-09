/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { Range } from '../../../../common/core/range.js';
import { ITextModel } from '../../../../common/model.js';
import { createCodeEditorServices, instantiateTestCodeEditor, ITestCodeEditor, TestCodeEditorCreationOptions } from '../../../../test/browser/testCodeEditor.js';
import { instantiateTextModel } from '../../../../test/common/testTextModel.js';
import { ShrinkEmptyLinesController } from '../../browser/shrinkEmptyLines.js';

suite('Shrink Empty Lines', () => {
	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;

	setup(() => {
		disposables = new DisposableStore();
		instantiationService = createCodeEditorServices(disposables);
	});

	teardown(() => disposables.dispose());

	ensureNoDisposablesAreLeakedInTestSuite();

	function createEditor(text: string, options: TestCodeEditorCreationOptions = {}): { editor: ITestCodeEditor; model: ITextModel } {
		const model = disposables.add(instantiateTextModel(instantiationService, text));
		const editor = disposables.add(instantiateTestCodeEditor(instantiationService, model, {
			lineHeight: 20,
			...options,
		}));
		assert.ok(editor.getContribution<ShrinkEmptyLinesController>(ShrinkEmptyLinesController.ID));
		return { editor, model };
	}

	function getLineHeights(editor: ITestCodeEditor): number[] {
		const viewModel = editor.getViewModel();
		assert.ok(viewModel);
		const result: number[] = [];
		for (let lineNumber = 1; lineNumber <= viewModel.getLineCount(); lineNumber++) {
			result.push(viewModel.viewLayout.getLineHeightForLineNumber(lineNumber));
		}
		return result;
	}

	test('is disabled by default', () => {
		const { editor } = createEditor('a\n\n ');

		assert.deepStrictEqual(getLineHeights(editor), [20, 20, 20]);
	});

	test('shrinks whitespace-only lines using presets', () => {
		const { editor } = createEditor('a\n\n \n{}', {
			shrinkEmptyLines: 'compact',
		});

		assert.deepStrictEqual(getLineHeights(editor), [20, 10, 10, 20]);

		editor.updateOptions({ shrinkEmptyLines: 'veryCompact' });

		assert.deepStrictEqual(getLineHeights(editor), [20, 5, 5, 20]);
	});

	test('updates only lines affected by content changes', () => {
		const { editor, model } = createEditor('a\n\nb', {
			shrinkEmptyLines: 'compact',
		});

		model.applyEdits([{ range: new Range(2, 1, 2, 1), text: 'x' }]);
		assert.deepStrictEqual(getLineHeights(editor), [20, 20, 20]);

		model.applyEdits([{ range: new Range(2, 1, 2, 2), text: '' }]);
		assert.deepStrictEqual(getLineHeights(editor), [20, 10, 20]);

		model.applyEdits([{ range: new Range(1, 2, 1, 2), text: '\n' }]);
		assert.deepStrictEqual(getLineHeights(editor), [20, 10, 10, 20]);
	});

	test('reacts to variable line height and base line height changes', () => {
		const { editor } = createEditor('a\n', {
			shrinkEmptyLines: 'compact',
		});

		assert.deepStrictEqual(getLineHeights(editor), [20, 10]);

		editor.updateOptions({ lineHeight: 24 });
		assert.deepStrictEqual(getLineHeights(editor), [24, 12]);

		editor.updateOptions({ allowVariableLineHeights: false });
		assert.deepStrictEqual(getLineHeights(editor), [24, 24]);

		editor.updateOptions({ allowVariableLineHeights: true });
		assert.deepStrictEqual(getLineHeights(editor), [24, 12]);

		editor.updateOptions({ shrinkEmptyLines: 'off' });
		assert.deepStrictEqual(getLineHeights(editor), [24, 24]);
	});
});
