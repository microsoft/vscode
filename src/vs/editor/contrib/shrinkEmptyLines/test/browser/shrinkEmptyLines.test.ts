/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { EditorOption, EditorOptions } from '../../../../common/config/editorOptions.js';
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
			lineHeight: 19,
			...options,
		}));
		editor.registerAndInstantiateContribution(ShrinkEmptyLinesController.ID, ShrinkEmptyLinesController);
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

		assert.deepStrictEqual(getLineHeights(editor), [19, 19, 19]);
	});

	test('shrinks whitespace-only lines using arbitrary multipliers', () => {
		const { editor } = createEditor('a\n\n \n{}', {
			shrinkEmptyLines: 0.5,
		});

		assert.deepStrictEqual(getLineHeights(editor), [19, 10, 10, 19]);

		editor.updateOptions({ shrinkEmptyLines: 0.25 });

		assert.deepStrictEqual(getLineHeights(editor), [19, 5, 5, 19]);

		editor.updateOptions({ shrinkEmptyLines: 0.7 });

		assert.deepStrictEqual(getLineHeights(editor), [19, 13, 13, 19]);
	});

	test('uses a numeric setting constrained to zero through one', () => {
		const option = EditorOptions.shrinkEmptyLines;
		assert.deepStrictEqual({
			type: option.schema?.type,
			default: option.defaultValue,
			minimum: option.schema?.minimum,
			maximum: option.schema?.maximum,
			invalidValues: [undefined, null, NaN, 'invalid'].map(value => option.validate(value)),
		}, {
			type: 'number',
			default: 0,
			minimum: 0,
			maximum: 1,
			invalidValues: [0, 0, 0, 0],
		});
	});

	test('clamps multipliers and preserves regular height at zero and one', () => {
		const { editor } = createEditor('a\n\n ', { shrinkEmptyLines: 0.4 });
		const results = [];
		for (const multiplier of [0.4, 1, 0.5, 0, -0.5, 1.5, 0.25]) {
			editor.updateOptions({ shrinkEmptyLines: multiplier });
			results.push({
				multiplier: editor.getOption(EditorOption.shrinkEmptyLines),
				lineHeights: getLineHeights(editor),
			});
		}
		assert.deepStrictEqual(results, [
			{ multiplier: 0.4, lineHeights: [19, 8, 8] },
			{ multiplier: 1, lineHeights: [19, 19, 19] },
			{ multiplier: 0.5, lineHeights: [19, 10, 10] },
			{ multiplier: 0, lineHeights: [19, 19, 19] },
			{ multiplier: 0, lineHeights: [19, 19, 19] },
			{ multiplier: 1, lineHeights: [19, 19, 19] },
			{ multiplier: 0.25, lineHeights: [19, 5, 5] },
		]);
	});

	test('scales with changes to the regular line height', () => {
		const { editor } = createEditor('a\n\n ', {
			shrinkEmptyLines: 0.3,
			useLineHeightFromSettings: true,
		});

		editor.updateOptions({ lineHeight: 30 });

		assert.deepStrictEqual(getLineHeights(editor), [30, 9, 9]);
	});

	test('updates only lines affected by content changes', () => {
		const { editor, model } = createEditor('a\n\nb', {
			shrinkEmptyLines: 0.5,
		});

		model.applyEdits([{ range: new Range(2, 1, 2, 1), text: 'x' }]);
		assert.deepStrictEqual(getLineHeights(editor), [19, 19, 19]);

		model.applyEdits([{ range: new Range(2, 1, 2, 2), text: '' }]);
		assert.deepStrictEqual(getLineHeights(editor), [19, 10, 19]);

		model.applyEdits([{ range: new Range(1, 2, 1, 2), text: '\n' }]);
		assert.deepStrictEqual(getLineHeights(editor), [19, 10, 10, 19]);
	});

	test('resets decoration bookkeeping when the model value is replaced', () => {
		const { editor, model } = createEditor('a\n\nb', {
			shrinkEmptyLines: 0.5,
		});

		model.setValue('c\n\nd');
		model.setValue('e\n\nf');

		const controller = editor.getContribution<ShrinkEmptyLinesController>(ShrinkEmptyLinesController.ID);
		assert.ok(controller);
		const decorationIds = Reflect.get(controller, '_decorationIds') as Set<string>;
		assert.strictEqual(decorationIds.size, 1);
	});

	test('does not shrink fold headers for hidden empty lines', () => {
		const { editor } = createEditor('header\n\nbody', {
			shrinkEmptyLines: 0.5,
		});

		assert.deepStrictEqual(getLineHeights(editor), [19, 10, 19]);

		editor.setHiddenAreas([new Range(2, 1, 3, 1)]);
		assert.deepStrictEqual(getLineHeights(editor), [19]);

		editor.setHiddenAreas([]);
		assert.deepStrictEqual(getLineHeights(editor), [19, 10, 19]);
	});

	test('reacts to variable line height setting changes', () => {
		const { editor } = createEditor('a\n', {
			shrinkEmptyLines: 0.5,
		});

		assert.deepStrictEqual(getLineHeights(editor), [19, 10]);

		editor.updateOptions({ allowVariableLineHeights: false });
		assert.deepStrictEqual(getLineHeights(editor), [19, 19]);

		editor.updateOptions({ allowVariableLineHeights: true });
		assert.deepStrictEqual(getLineHeights(editor), [19, 10]);

		editor.updateOptions({ shrinkEmptyLines: 0 });
		assert.deepStrictEqual(getLineHeights(editor), [19, 19]);
	});
});
