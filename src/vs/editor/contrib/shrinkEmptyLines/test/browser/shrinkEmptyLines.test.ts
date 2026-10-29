/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spy } from 'sinon';
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

	function getShrinkingDecorations(model: ITextModel) {
		return model.getAllDecorations().filter(decoration => decoration.options.description.startsWith('shrink-empty-line-'));
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

	test('reuses classified ranges when the multiplier changes', () => {
		const { editor, model } = createEditor(Array.from({ length: 1000 }, () => '{}').join('\n'), { shrinkEmptyLines: 0.5 });
		const decorationIds = getShrinkingDecorations(model).map(decoration => decoration.id);
		const getLineContent = spy(model, 'getLineContent');
		disposables.add(toDisposable(() => getLineContent.restore()));

		editor.updateOptions({ shrinkEmptyLines: 0.25 });

		assert.deepStrictEqual({
			scannedLastLine: getLineContent.calledWith(model.getLineCount()),
			decorationIds: getShrinkingDecorations(model).map(decoration => decoration.id),
			lineHeights: [1, 500, 1000].map(lineNumber => editor.getViewModel()!.viewLayout.getLineHeightForLineNumber(lineNumber)),
			fontSize: editor.getFontSizeAtPosition({ lineNumber: 1000, column: 1 }),
		}, {
			scannedLastLine: false,
			decorationIds,
			lineHeights: [5, 5, 5],
			fontSize: '3.5px',
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
		let heightChanges = 0;
		disposables.add(model.onDidChangeLineHeight(event => heightChanges += event.changes.length));

		function getRenderedSizes() {
			editor.render(true);
			const fontSizes = Array.from(container.querySelectorAll('.view-lines .view-line'), line => {
				const token = line.querySelector('span span');
				assert.ok(token);
				return getWindow(container).getComputedStyle(token).fontSize;
			});
			const result = {
				fontSizes,
				punctuationHeight: editor.getTopForLineNumber(3) - editor.getTopForLineNumber(2),
				heightChanges,
			};
			heightChanges = 0;
			return result;
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
			{ fontSizes: ['20px', '10px', '20px'], punctuationHeight: 15, heightChanges: 0 },
			{ fontSizes: ['20px', '5px', '20px'], punctuationHeight: 8, heightChanges: 1 },
			{ fontSizes: ['24px', '6px', '24px'], punctuationHeight: 8, heightChanges: 0 },
			{ fontSizes: ['24px', '18px', '24px'], punctuationHeight: 30, heightChanges: 1 },
			{ fontSizes: ['24px', '24px', '24px'], punctuationHeight: 40, heightChanges: 1 },
			{ fontSizes: ['24px', '18px', '24px'], punctuationHeight: 30, heightChanges: 1 },
			{ fontSizes: ['24px', '24px', '24px'], punctuationHeight: 40, heightChanges: 1 },
			{ fontSizes: ['24px', '6px', '24px'], punctuationHeight: 10, heightChanges: 1 },
			{ fontSizes: ['24px', '12px', '24px'], punctuationHeight: 20, heightChanges: 1 },
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

	test('uses a numeric setting constrained to 0.25 through 1', () => {
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
			minimum: 0.25,
			maximum: 1,
			invalidValues: [1, 1, 1, 1],
		});
	});

	test('clamps multipliers to 0.25 through 1 and preserves regular height at 1', () => {
		const { editor } = createEditor('a\n{\n}', { shrinkEmptyLines: 0.4 });
		const results = [];
		for (const multiplier of [0.4, 1, 0.5, 0, 0.02, 0.249, -0.5, 1.5, 0.25]) {
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
			{ multiplier: 0.25, lineHeights: [19, 5, 5] },
			{ multiplier: 0.25, lineHeights: [19, 5, 5] },
			{ multiplier: 0.25, lineHeights: [19, 5, 5] },
			{ multiplier: 0.25, lineHeights: [19, 5, 5] },
			{ multiplier: 1, lineHeights: [19, 19, 19] },
			{ multiplier: 0.25, lineHeights: [19, 5, 5] },
		]);
	});

	test('clamps initial multipliers below 0.25', () => {
		const multipliers = [-0.5, 0, 0.02, 0.249, 0.25];
		const results = multipliers.map(shrinkEmptyLines => {
			const { editor } = createEditor('a\n\n{}', { shrinkEmptyLines });
			return {
				multiplier: editor.getOption(EditorOption.shrinkEmptyLines),
				lineHeights: getLineHeights(editor),
				fontSizes: getLineFontSizes(editor),
			};
		});

		assert.deepStrictEqual(results, multipliers.map(() => ({
			multiplier: 0.25,
			lineHeights: [19, 5, 5],
			fontSizes: ['14px', '14px', '3.5px'],
		})));
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

	test('retains the line height when punctuation is appended', () => {
		const { editor, model } = createEditor('a\n{ }\n0', { shrinkEmptyLines: 0.5 });
		const heightIds = getShrinkingDecorations(model).filter(decoration => typeof decoration.options.lineHeight === 'number').map(decoration => decoration.id);
		let heightChanges = 0;
		disposables.add(model.onDidChangeLineHeight(event => heightChanges += event.changes.length));

		model.applyEdits([{ range: new Range(2, 4, 2, 4), text: ';' }]);

		assert.deepStrictEqual({
			heightIds: getShrinkingDecorations(model).filter(decoration => typeof decoration.options.lineHeight === 'number').map(decoration => decoration.id),
			heightChanges,
			lineHeights: getLineHeights(editor),
			fontRanges: getShrinkingDecorations(model).filter(decoration => decoration.options.fontSize !== null).map(decoration => [decoration.range.startColumn, decoration.range.endColumn]),
		}, {
			heightIds,
			heightChanges: 0,
			lineHeights: [19, 10, 19],
			fontRanges: [[1, 2], [3, 5]],
		});
	});

	test('keeps retained height ranges correct when an edit adds wrapped lines', () => {
		const { editor, model } = createEditor('{}\na', {
			shrinkEmptyLines: 0.5,
			wordWrap: 'wordWrapColumn',
			wordWrapColumn: 2,
			wrappingIndent: 'none',
		});
		const heightIds = getShrinkingDecorations(model).filter(decoration => typeof decoration.options.lineHeight === 'number').map(decoration => decoration.id);

		model.applyEdits([{ range: new Range(1, 3, 1, 3), text: ';;' }]);

		assert.deepStrictEqual({
			heightIds: getShrinkingDecorations(model).filter(decoration => typeof decoration.options.lineHeight === 'number').map(decoration => decoration.id),
			lineHeights: getLineHeights(editor),
		}, {
			heightIds,
			lineHeights: [10, 10, 19],
		});
	});

	test('merges edits on the same line without creating duplicate decorations', () => {
		const { editor, model } = createEditor('a\n{}\n0', { shrinkEmptyLines: 0.5 });

		model.applyEdits([
			{ range: new Range(2, 1, 2, 1), text: ' ' },
			{ range: new Range(2, 3, 2, 3), text: ';' },
		]);

		assert.deepStrictEqual({
			text: model.getLineContent(2),
			decorations: getShrinkingDecorations(model).map(decoration => ({
				kind: typeof decoration.options.lineHeight === 'number' ? 'height' : 'font',
				range: decoration.range.toString(),
			})),
			lineHeights: getLineHeights(editor),
		}, {
			text: ' {};',
			decorations: [
				{ kind: 'height', range: '[2,1 -> 2,5]' },
				{ kind: 'font', range: '[2,2 -> 2,5]' },
			],
			lineHeights: [19, 10, 19],
		});
	});

	test('shrinks blank lines inserted at multiple positions', () => {
		const { editor, model } = createEditor('a\nb', { shrinkEmptyLines: 0.5 });

		model.applyEdits([
			{ range: new Range(1, 2, 1, 2), text: '\n' },
			{ range: new Range(2, 2, 2, 2), text: '\n' },
		]);

		assert.deepStrictEqual({
			lines: model.getLinesContent(),
			lineHeights: getLineHeights(editor),
		}, {
			lines: ['a', '', 'b', ''],
			lineHeights: [19, 10, 19, 10],
		});
	});

	test('does not leave code lines shrunk after deleting multiple lines', () => {
		const { editor, model } = createEditor('x\n\ny\n}\nz', { shrinkEmptyLines: 0.5 });

		model.applyEdits([
			{ range: new Range(2, 1, 3, 1), text: '' },
			{ range: new Range(4, 1, 5, 1), text: '' },
		]);

		assert.deepStrictEqual({
			lines: model.getLinesContent(),
			lineHeights: getLineHeights(editor),
		}, {
			lines: ['x', 'y', 'z'],
			lineHeights: [19, 19, 19],
		});
	});

	test('shrinks punctuation shifted by an earlier multiline replacement', () => {
		const { editor, model } = createEditor('a\nb\nx\nc', { shrinkEmptyLines: 0.5 });

		model.applyEdits([
			{ range: new Range(1, 1, 1, 2), text: 'a\n\n' },
			{ range: new Range(3, 1, 3, 2), text: '}' },
		]);

		assert.deepStrictEqual({
			lines: model.getLinesContent(),
			lineHeights: getLineHeights(editor),
			fontSizes: getLineFontSizes(editor),
		}, {
			lines: ['a', '', '', 'b', '}', 'c'],
			lineHeights: [19, 10, 10, 19, 10, 19],
			fontSizes: ['14px', '14px', '14px', '14px', '7px', '14px'],
		});
	});

	test('restores regular height and font size for code shifted by an earlier deletion', () => {
		const { editor, model } = createEditor('a\n\nb\n}\nz', { shrinkEmptyLines: 0.5 });

		model.applyEdits([
			{ range: new Range(2, 1, 3, 1), text: '' },
			{ range: new Range(4, 2, 4, 2), text: 'x' },
		]);

		assert.deepStrictEqual({
			lines: model.getLinesContent(),
			lineHeights: getLineHeights(editor),
			fontSizes: getLineFontSizes(editor),
		}, {
			lines: ['a', 'b', '}x', 'z'],
			lineHeights: [19, 19, 19, 19],
			fontSizes: ['14px', '14px', '14px', '14px'],
		});
	});

	test('accounts for intermediate line shifts when the total line count is unchanged', () => {
		const { editor, model } = createEditor('a\nb\nx\nc\n\nz', { shrinkEmptyLines: 0.5 });

		model.applyEdits([
			{ range: new Range(1, 2, 1, 2), text: '\n' },
			{ range: new Range(3, 1, 3, 2), text: '}' },
			{ range: new Range(5, 1, 6, 1), text: '' },
		]);

		assert.deepStrictEqual({
			lines: model.getLinesContent(),
			lineHeights: getLineHeights(editor),
			fontSizes: getLineFontSizes(editor),
		}, {
			lines: ['a', '', 'b', '}', 'c', 'z'],
			lineHeights: [19, 10, 19, 10, 19, 19],
			fontSizes: ['14px', '14px', '14px', '7px', '14px', '14px'],
		});
	});

	const multiCursorLines = [
		'const first = 1;',
		'const second = 2;',
		'const third = 3;',
		'const fourth = 4;',
		'const fifth = 5;',
		'const sixth = 6;',
	];

	function createEditorWithMultiCursorLineBreaks() {
		const { editor, model } = createEditor(multiCursorLines.join('\n'), { shrinkEmptyLines: 0.5 });

		model.pushEditOperations([], multiCursorLines.map((line, index) => ({
			range: new Range(index + 1, line.length + 1, index + 1, line.length + 1),
			text: '\n',
		})), () => null);

		return { editor, model };
	}

	test('updates all line heights after a multi-cursor edit', () => {
		const { editor, model } = createEditorWithMultiCursorLineBreaks();

		assert.deepStrictEqual({
			lines: model.getLinesContent(),
			lineHeights: getLineHeights(editor),
		}, {
			lines: multiCursorLines.flatMap(line => [line, '']),
			lineHeights: [19, 10, 19, 10, 19, 10, 19, 10, 19, 10, 19, 10],
		});
	});

	test('updates all line heights after a multi-cursor undo', async () => {
		const { editor, model } = createEditorWithMultiCursorLineBreaks();

		await model.undo();

		assert.deepStrictEqual({
			lines: model.getLinesContent(),
			lineHeights: getLineHeights(editor),
		}, {
			lines: multiCursorLines,
			lineHeights: [19, 19, 19, 19, 19, 19],
		});
	});

	test('updates all line heights after a multi-cursor redo', async () => {
		const { editor, model } = createEditorWithMultiCursorLineBreaks();

		await model.undo();
		await model.redo();

		assert.deepStrictEqual({
			lines: model.getLinesContent(),
			lineHeights: getLineHeights(editor),
		}, {
			lines: multiCursorLines.flatMap(line => [line, '']),
			lineHeights: [19, 10, 19, 10, 19, 10, 19, 10, 19, 10, 19, 10],
		});
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

	test('respects variable-font settings outside accessibility mode', () => {
		const { editor } = createEditor('a\n}', {
			shrinkEmptyLines: 0.5,
			allowVariableFonts: false,
			envConfig: { accessibilitySupport: AccessibilitySupport.Disabled },
		});
		const results = [getLineHeights(editor)];

		editor.updateOptions({ allowVariableFonts: true });
		results.push(getLineHeights(editor));
		editor.updateOptions({ allowVariableFonts: false, allowVariableFontsInAccessibilityMode: true });
		results.push(getLineHeights(editor));
		editor.updateOptions({ allowVariableFonts: true, allowVariableFontsInAccessibilityMode: false });
		results.push(getLineHeights(editor));

		assert.deepStrictEqual(results, [
			[19, 19],
			[19, 10],
			[19, 19],
			[19, 10],
		]);
	});

	test('respects the variable-font override in accessibility mode', () => {
		const { editor } = createEditor('a\n}', {
			shrinkEmptyLines: 0.5,
			allowVariableFonts: true,
			allowVariableFontsInAccessibilityMode: false,
			envConfig: { accessibilitySupport: AccessibilitySupport.Enabled },
		});
		const results = [getLineHeights(editor)];

		editor.updateOptions({ allowVariableFontsInAccessibilityMode: true });
		results.push(getLineHeights(editor));
		editor.updateOptions({ allowVariableFonts: false });
		results.push(getLineHeights(editor));
		editor.updateOptions({ allowVariableFontsInAccessibilityMode: false });
		results.push(getLineHeights(editor));

		assert.deepStrictEqual(results, [
			[19, 19],
			[19, 10],
			[19, 10],
			[19, 19],
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

	test('retains shrinking decorations when folding and unfolding', () => {
		const { editor, model } = createEditor('header\n{\n}\nfooter', { shrinkEmptyLines: 0.5 });
		const getDecorationIds = () => model.getAllDecorations()
			.filter(decoration => decoration.options.description.startsWith('shrink-empty-line-'))
			.map(decoration => decoration.id)
			.sort();
		const decorationIds = getDecorationIds();
		const results = [];
		for (const hiddenAreas of [[new Range(2, 1, 3, 2)], [], [new Range(2, 1, 3, 2)], []]) {
			editor.setHiddenAreas(hiddenAreas);
			results.push({ decorationIds: getDecorationIds(), lineHeights: getLineHeights(editor) });
		}

		assert.deepStrictEqual(results, [
			{ decorationIds, lineHeights: [19, 19] },
			{ decorationIds, lineHeights: [19, 10, 10, 19] },
			{ decorationIds, lineHeights: [19, 19] },
			{ decorationIds, lineHeights: [19, 10, 10, 19] },
		]);
	});

	test('updates folded lines without shrinking the fold header', () => {
		const { editor, model } = createEditor('header\n{\n}', { shrinkEmptyLines: 0.5 });
		const results = [];
		editor.setHiddenAreas([new Range(2, 1, 3, 2)]);
		editor.updateOptions({ shrinkEmptyLines: 0.25 });
		results.push(getLineHeights(editor));
		model.applyEdits([{ range: new Range(2, 1, 2, 2), text: 'body' }]);
		results.push(getLineHeights(editor));
		editor.setHiddenAreas([]);
		results.push(getLineHeights(editor));
		editor.setHiddenAreas([new Range(2, 1, 3, 2)]);
		model.applyEdits([{ range: new Range(2, 1, 2, 5), text: '{' }]);
		results.push(getLineHeights(editor));
		editor.setHiddenAreas([]);
		results.push(getLineHeights(editor));

		assert.deepStrictEqual(results, [[19], [19], [19, 19, 5], [19], [19, 5, 5]]);
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

		editor.updateOptions({ shrinkEmptyLines: 1 });
		assert.deepStrictEqual(getLineHeights(editor), [19, 19]);
	});
});
