/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestColorTheme } from '../../../../platform/theme/test/common/testThemeService.js';
import { HorizontalPosition, IViewLines, RenderingContext } from '../../../browser/view/renderingContext.js';
import { WhitespaceOverlay } from '../../../browser/viewParts/whitespace/whitespace.js';
import { EditorOption, IEditorOptions } from '../../../common/config/editorOptions.js';
import { CursorColumns } from '../../../common/core/cursorColumns.js';
import { Selection } from '../../../common/core/selection.js';
import { CursorChangeReason } from '../../../common/cursorEvents.js';
import { ViewCursorStateChangedEvent } from '../../../common/viewEvents.js';
import { ViewportData } from '../../../common/viewLayout/viewLinesViewportData.js';
import { ViewContext } from '../../../common/viewModel/viewContext.js';
import { testViewModel } from '../viewModel/testViewModel.js';

suite('WhitespaceOverlay', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function renderWhitespace(text: string[], options: IEditorOptions = {}, selections: Selection[] = []): HTMLElement[] {
		const result: HTMLElement[] = [];
		testViewModel(text, {
			lineHeight: 19,
			renderWhitespace: 'all',
			experimentalWhitespaceRendering: 'svg',
			...options
		}, (viewModel, model, configuration) => {
			const overlay = store.add(new WhitespaceOverlay(new ViewContext(configuration, new TestColorTheme(), viewModel)));
			try {
				const lineCount = viewModel.getLineCount();
				const spaceWidth = configuration.options.get(EditorOption.fontInfo).spaceWidth;
				const lineHeight = configuration.options.get(EditorOption.lineHeight);
				const viewLines: IViewLines = {
					linesVisibleRangesForRange: () => null,
					visibleRangeForPosition: position => new HorizontalPosition(false, CursorColumns.visibleColumnFromColumn(
						viewModel.getLineContent(position.lineNumber), position.column, model.getOptions().tabSize
					) * spaceWidth)
				};
				const viewportData = new ViewportData(selections, {
					bigNumbersDelta: 0,
					startLineNumber: 1,
					endLineNumber: lineCount,
					relativeVerticalOffset: Array.from({ length: lineCount }, (_, i) => i * lineHeight),
					centeredLineNumber: 1,
					completelyVisibleStartLineNumber: 1,
					completelyVisibleEndLineNumber: lineCount,
					lineHeight
				}, [], viewModel);

				overlay.onCursorStateChanged(new ViewCursorStateChangedEvent(selections, selections, CursorChangeReason.NotSet));
				overlay.prepareRender(new RenderingContext(viewModel.viewLayout, viewportData, viewLines));
				for (let lineNumber = 1; lineNumber <= lineCount; lineNumber++) {
					const element = document.createElement('div');
					element.innerHTML = overlay.render(1, lineNumber);
					result.push(element);
				}
			} finally {
				overlay.dispose();
			}
		});
		return result;
	}

	function glyphCount(element: HTMLElement): number {
		return element.querySelector('path')?.getAttribute('d')?.match(/\bM\b/g)?.length ?? 0;
	}

	test('batches whitespace into one SVG path per line', () => {
		const [element] = renderWhitespace([' '.repeat(1000)]);
		assert.deepStrictEqual({
			svgs: element.querySelectorAll('svg').length,
			shapes: element.querySelectorAll('svg > *').length,
			paths: element.querySelectorAll('path').length,
			glyphs: glyphCount(element)
		}, { svgs: 1, shapes: 1, paths: 1, glyphs: 1000 });
	});

	test('leaves SVGs empty on lines without whitespace', () => {
		assert.deepStrictEqual(renderWhitespace(['', 'text']).map(element => element.querySelector('svg')?.innerHTML), ['', '']);
	});

	test('preserves circle and tab-arrow geometry in separate closed subpaths', () => {
		const [element] = renderWhitespace([' \t ']);
		assert.deepStrictEqual({
			viewBox: element.querySelector('svg')?.getAttribute('viewBox'),
			path: element.querySelector('path')?.getAttribute('d')?.trim()
		}, {
			viewBox: '0 0 50 19',
			path: 'M 3.57 9.50 a 1.43 1.43 0 1 0 2.86 0 a 1.43 1.43 0 1 0 -2.86 0 Z '
				+ 'M 10.00 10.21 L 18.00 10.21 L 16.40 11.81 L 17.20 12.61 L 20.00 9.81 L 20.00 9.19 L 17.20 6.39 L 16.40 7.19 L 18.00 8.79 L 10.00 8.79 Z '
				+ 'M 43.57 9.50 a 1.43 1.43 0 1 0 2.86 0 a 1.43 1.43 0 1 0 -2.86 0 Z'
		});
	});

	const text = ['a  b', '\ta\tb', 'a   ', '   ', 'a b'];
	for (const [mode, expected] of [
		['all', [2, 2, 3, 3, 1]],
		['boundary', [2, 2, 3, 3, 0]],
		['trailing', [0, 0, 3, 3, 0]],
		['none', [0, 0, 0, 0, 0]],
		['selection', [0, 0, 0, 0, 0]]
	] as const) {
		test(`respects ${mode} whitespace rendering`, () => {
			assert.deepStrictEqual(renderWhitespace(text, { renderWhitespace: mode }).map(element => ({
				glyphs: glyphCount(element),
				shapes: element.querySelectorAll('svg > *').length
			})), expected.map(glyphs => ({ glyphs, shapes: glyphs > 0 ? 1 : 0 })));
		});
	}

	test('renders only the selected spaces and tabs', () => {
		const selections = [new Selection(1, 2, 1, 3), new Selection(2, 1, 2, 2)];
		assert.deepStrictEqual(renderWhitespace(text, { renderWhitespace: 'selection' }, selections).map(glyphCount), [1, 1, 0, 0, 0]);
	});

	test('respects stopRenderingLineAfter', () => {
		assert.deepStrictEqual(renderWhitespace(['    text'], { stopRenderingLineAfter: 2 }).map(glyphCount), [2]);
	});

	test('leaves font rendering unchanged', () => {
		const [element] = renderWhitespace([' \t '], { experimentalWhitespaceRendering: 'font' });
		assert.deepStrictEqual({
			svgs: element.querySelectorAll('svg').length,
			markers: element.querySelectorAll('.mwh').length
		}, { svgs: 0, markers: 3 });
	});

	test('does not render an overlay when the legacy renderer is enabled', () => {
		assert.deepStrictEqual(renderWhitespace([' \t '], { experimentalWhitespaceRendering: 'off' }).map(element => element.innerHTML), ['']);
	});
});
