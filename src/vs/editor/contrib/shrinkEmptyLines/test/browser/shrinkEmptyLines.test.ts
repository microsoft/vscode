/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getWindow } from '../../../../../base/browser/dom.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AccessibilitySupport } from '../../../../../platform/accessibility/common/accessibility.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { CodeEditorWidget } from '../../../../browser/widget/codeEditor/codeEditorWidget.js';
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

	function getLineFontSizes(editor: ITestCodeEditor): (string | null)[] {
		return Array.from({ length: editor.getModel().getLineCount() }, (_, index) =>
			editor.getFontSizeAtPosition({ lineNumber: index + 1, column: 1 }));
	}

	test('uses regular line height by default', () => {
		const { editor } = createEditor('a\n\n \n{\n}');

		assert.deepStrictEqual(getLineHeights(editor), [19, 19, 19, 19, 19]);
	});

	test('shrinks lines without letters or numbers using arbitrary multipliers', () => {
		const { editor } = createEditor('a\n\n \n{}', {
			shrinkEmptyLines: 0.5,
		});

		assert.deepStrictEqual(getLineHeights(editor), [19, 10, 10, 10]);

		editor.updateOptions({ shrinkEmptyLines: 0.25 });

		assert.deepStrictEqual(getLineHeights(editor), [19, 5, 5, 5]);

		editor.updateOptions({ shrinkEmptyLines: 0.7 });

		assert.deepStrictEqual(getLineHeights(editor), [19, 13, 13, 13]);
	});

	test('scales punctuation fonts and uses variable-font measurements only on compressed lines', () => {
		const { editor } = createEditor('a\n{}\n//\n0', { shrinkEmptyLines: 0.5 });
		const viewModel = editor.getViewModel();
		assert.ok(viewModel);

		assert.deepStrictEqual({
			fontSizes: getLineFontSizes(editor),
			variableFonts: [1, 2, 3, 4].map(lineNumber => viewModel.getViewLineRenderingData(lineNumber).hasVariableFonts),
		}, {
			fontSizes: ['14px', '7px', '7px', '14px'],
			variableFonts: [false, true, true, false],
		});
	});

	test('renders proportional punctuation fonts after font and multiplier changes', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));
		const editor = disposables.add(instantiationService.createInstance(CodeEditorWidget, container, {
			fontSize: 20,
			lineHeight: 30,
			shrinkEmptyLines: 0.5,
			minimap: { enabled: false },
		}, { contributions: [] }));
		const model = disposables.add(instantiateTextModel(instantiationService, 'a\n{}\n0'));
		editor.setModel(model);
		disposables.add(new ShrinkEmptyLinesController(editor));
		editor.layout({ width: 400, height: 200 });

		function getRenderedSizes() {
			editor.render(true);
			const fontSizes = Array.from(container.querySelectorAll('.view-lines .view-line'), line => {
				const token = line.querySelector('span span');
				assert.ok(token);
				return getWindow(container).getComputedStyle(token).fontSize;
			});
			return {
				fontSizes,
				punctuationHeight: editor.getTopForLineNumber(3) - editor.getTopForLineNumber(2),
			};
		}

		const results = [getRenderedSizes()];
		editor.updateOptions({ shrinkEmptyLines: 0.25 });
		results.push(getRenderedSizes());
		editor.updateOptions({ fontSize: 24 });
		results.push(getRenderedSizes());
		editor.updateOptions({ shrinkEmptyLines: 0.75, lineHeight: 40 });
		results.push(getRenderedSizes());
		editor.updateOptions({ allowVariableFonts: false });
		results.push(getRenderedSizes());
		editor.updateOptions({ allowVariableFonts: true });
		results.push(getRenderedSizes());
		editor.updateOptions({ shrinkEmptyLines: 1 });
		results.push(getRenderedSizes());
		editor.updateOptions({ shrinkEmptyLines: 0 });
		results.push(getRenderedSizes());
		editor.updateOptions({ shrinkEmptyLines: 0.5 });
		results.push(getRenderedSizes());

		assert.deepStrictEqual(results, [
			{ fontSizes: ['20px', '10px', '20px'], punctuationHeight: 15 },
			{ fontSizes: ['20px', '5px', '20px'], punctuationHeight: 8 },
			{ fontSizes: ['24px', '6px', '24px'], punctuationHeight: 8 },
			{ fontSizes: ['24px', '18px', '24px'], punctuationHeight: 30 },
			{ fontSizes: ['24px', '24px', '24px'], punctuationHeight: 40 },
			{ fontSizes: ['24px', '18px', '24px'], punctuationHeight: 30 },
			{ fontSizes: ['24px', '24px', '24px'], punctuationHeight: 40 },
			{ fontSizes: ['24px', '24px', '24px'], punctuationHeight: 40 },
			{ fontSizes: ['24px', '12px', '24px'], punctuationHeight: 20 },
		]);
	});

	test('preserves whitespace font sizes and indentation alignment when shrinking punctuation', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));
		const editor = disposables.add(instantiationService.createInstance(CodeEditorWidget, container, {
			fontSize: 20,
			lineHeight: 30,
			shrinkEmptyLines: 0.5,
			renderWhitespace: 'none',
			minimap: { enabled: false },
		}, { contributions: [] }));
		const model = disposables.add(instantiateTextModel(instantiationService, '    x\n    { }  \n\tx\n\t{ }\t\n    '));
		editor.setModel(model);
		disposables.add(new ShrinkEmptyLinesController(editor));
		editor.layout({ width: 400, height: 200 });

		const results = [];
		for (const multiplier of [0.5, 0.25, 1, 0.5]) {
			editor.updateOptions({ shrinkEmptyLines: multiplier });
			editor.render(true);
			const whitespaceFontSizes = new Set<string>();
			const punctuationFontSizes = new Set<string>();
			for (const token of container.querySelectorAll('.view-lines .view-line > span > span')) {
				const fontSize = getWindow(container).getComputedStyle(token).fontSize;
				if (/[{}]/.test(token.textContent ?? '')) {
					punctuationFontSizes.add(fontSize);
				} else if (token.textContent) {
					whitespaceFontSizes.add(fontSize);
				}
			}
			const positions = [1, 2, 3, 4].map(lineNumber =>
				editor.getScrolledVisiblePosition({ lineNumber, column: lineNumber <= 2 ? 5 : 2 }));
			assert.ok(positions.every(position => position !== null));
			results.push({
				whitespaceFontSizes: [...whitespaceFontSizes],
				punctuationFontSizes: [...punctuationFontSizes],
				spacesAligned: positions[0]?.left === positions[1]?.left,
				tabsAligned: positions[2]?.left === positions[3]?.left,
				punctuationHeight: editor.getTopForLineNumber(3) - editor.getTopForLineNumber(2),
			});
		}

		assert.deepStrictEqual(results, [
			{ whitespaceFontSizes: ['20px'], punctuationFontSizes: ['10px'], spacesAligned: true, tabsAligned: true, punctuationHeight: 15 },
			{ whitespaceFontSizes: ['20px'], punctuationFontSizes: ['5px'], spacesAligned: true, tabsAligned: true, punctuationHeight: 8 },
			{ whitespaceFontSizes: ['20px'], punctuationFontSizes: ['20px'], spacesAligned: true, tabsAligned: true, punctuationHeight: 30 },
			{ whitespaceFontSizes: ['20px'], punctuationFontSizes: ['10px'], spacesAligned: true, tabsAligned: true, punctuationHeight: 15 },
		]);
	});

	test('compresses braces and empty lines in the C# example from #66468', () => {
		const { editor } = createEditor([
			'internal class TestDbAsyncEnumerator<T> : IDbAsyncEnumerator<T>',
			'{',
			'    private readonly IEnumerator<T> _inner;',
			'',
			'    public TestDbAsyncEnumerator(IEnumerator<T> inner)',
			'    {',
			'        this._inner = inner;',
			'    }',
			'',
			'    public void Dispose()',
			'    {',
			'        this._inner.Dispose();',
			'    }',
			'',
			'    public Task<bool> MoveNextAsync(CancellationToken cancellationToken)',
			'    {',
			'        return Task.FromResult(_inner.MoveNext());',
			'    }',
			'',
			'    public T Current',
			'    {',
			'        get { return this._inner.Current; }',
			'    }',
			'',
			'    object IDbAsyncEnumerator.Current',
			'    {',
			'        get { return this.Current; }',
			'    }',
			'}',
		].join('\n'), { shrinkEmptyLines: 0.5 });

		assert.deepStrictEqual(getLineHeights(editor), [
			19, 10, 19, 10, 19, 10, 19, 10, 10, 19,
			10, 19, 10, 10, 19, 10, 19, 10, 10, 19,
			10, 19, 10, 10, 19, 10, 19, 10, 10,
		]);
	});

	test('preserves Unicode letters and numbers but shrinks punctuation and symbols', () => {
		const { editor } = createEditor([
			'',
			' \t ',
			'{',
			'    }',
			');',
			'//',
			'/**/',
			'+-=<>',
			'_',
			'// comment',
			'{ value }',
			'0',
			'\u00e9',
			'\u4e2d',
			'\u{10400}',
			'\u0661',
			'\u2163',
			'\u00b2',
			'\u{1d7d8}',
		].join('\n'), { shrinkEmptyLines: 0.5 });

		assert.deepStrictEqual(getLineHeights(editor), [
			10, 10, 10, 10, 10, 10, 10, 10, 10,
			19, 19, 19, 19, 19, 19, 19, 19, 19, 19,
		]);
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
			default: 1,
			minimum: 0,
			maximum: 1,
			invalidValues: [1, 1, 1, 1],
		});
	});

	test('clamps multipliers and preserves regular height at zero and one', () => {
		const { editor } = createEditor('a\n{\n}', { shrinkEmptyLines: 0.4 });
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

	test('updates punctuation-only lines after edits, undo and redo', async () => {
		const { editor, model } = createEditor('{\n}\n// comment', { shrinkEmptyLines: 0.5 });
		const results = [{ lineHeights: getLineHeights(editor), fontSizes: getLineFontSizes(editor) }];

		model.pushEditOperations([], [
			{ range: new Range(1, 2, 1, 2), text: 'x' },
			{ range: new Range(2, 2, 2, 2), text: '7' },
			{ range: new Range(3, 3, 3, 11), text: '' },
		], () => null);
		results.push({ lineHeights: getLineHeights(editor), fontSizes: getLineFontSizes(editor) });

		await model.undo();
		results.push({ lineHeights: getLineHeights(editor), fontSizes: getLineFontSizes(editor) });

		await model.redo();
		results.push({ lineHeights: getLineHeights(editor), fontSizes: getLineFontSizes(editor) });

		assert.deepStrictEqual(results, [
			{ lineHeights: [10, 10, 19], fontSizes: ['7px', '7px', '14px'] },
			{ lineHeights: [19, 19, 10], fontSizes: ['14px', '14px', '7px'] },
			{ lineHeights: [10, 10, 19], fontSizes: ['7px', '7px', '14px'] },
			{ lineHeights: [19, 19, 10], fontSizes: ['14px', '14px', '7px'] },
		]);
	});

	test('respects variable-font settings and their accessibility-mode override', () => {
		const { editor } = createEditor('a\n}', {
			shrinkEmptyLines: 0.5,
			allowVariableFonts: false,
		});
		const results = [getLineHeights(editor)];
		const accessibilityEnabledOptions: TestCodeEditorCreationOptions = {
			envConfig: { accessibilitySupport: AccessibilitySupport.Enabled },
		};
		const accessibilityDisabledOptions: TestCodeEditorCreationOptions = {
			envConfig: { accessibilitySupport: AccessibilitySupport.Disabled },
		};

		editor.updateOptions({ allowVariableFonts: true });
		results.push(getLineHeights(editor));
		editor.updateOptions(accessibilityEnabledOptions);
		results.push(getLineHeights(editor));
		editor.updateOptions({ allowVariableFontsInAccessibilityMode: true });
		results.push(getLineHeights(editor));
		editor.updateOptions({ allowVariableFontsInAccessibilityMode: false });
		results.push(getLineHeights(editor));
		editor.updateOptions(accessibilityDisabledOptions);
		results.push(getLineHeights(editor));

		assert.deepStrictEqual(results, [
			[19, 19],
			[19, 10],
			[19, 19],
			[19, 10],
			[19, 19],
			[19, 10],
		]);
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

	test('does not shrink fold headers for hidden punctuation-only lines', () => {
		const { editor } = createEditor('header\n{\n}', {
			shrinkEmptyLines: 0.5,
		});

		assert.deepStrictEqual(getLineHeights(editor), [19, 10, 10]);

		editor.setHiddenAreas([new Range(2, 1, 3, 1)]);
		assert.deepStrictEqual(getLineHeights(editor), [19]);

		editor.setHiddenAreas([]);
		assert.deepStrictEqual(getLineHeights(editor), [19, 10, 10]);
	});

	test('reacts to variable line height setting changes', () => {
		const { editor } = createEditor('a\n}', {
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
