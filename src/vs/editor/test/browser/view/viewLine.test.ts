/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../base/browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ColorScheme } from '../../../../platform/theme/common/theme.js';
import { DomReadingContext } from '../../../browser/viewParts/viewLines/domReadingContext.js';
import { ViewLine } from '../../../browser/viewParts/viewLines/viewLine.js';
import { ViewLineOptions } from '../../../browser/viewParts/viewLines/viewLineOptions.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { Range } from '../../../common/core/range.js';
import { StringBuilder } from '../../../common/core/stringBuilder.js';
import { IModelDeltaDecoration } from '../../../common/model.js';
import { ViewportData } from '../../../common/viewLayout/viewLinesViewportData.js';
import { testViewModel } from '../viewModel/testViewModel.js';

suite('ViewLine', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	interface IRenderedEmptyLine {
		readonly cursorLeft: number;
		readonly decorationEdges: { readonly className: string; readonly left: number; readonly right: number }[];
	}

	/**
	 * Renders the first (empty) line with the given decorations into the document
	 * and reads where the cursor at column 1 would be painted.
	 */
	function renderEmptyLineWithDecorations(decorations: IModelDeltaDecoration[]): IRenderedEmptyLine {
		const style = mainWindow.document.createElement('style');
		style.textContent = [
			'.viewLineTest-before, .viewLineTest-before2, .viewLineTest-after { display: inline-block; }',
			'.viewLineTest-before { width: 40px; }',
			'.viewLineTest-before2 { width: 25px; }',
			'.viewLineTest-after { width: 30px; }',
		].join('\n');
		const container = mainWindow.document.createElement('div');
		container.style.position = 'absolute';
		container.style.left = '0';
		container.style.top = '0';
		container.style.width = '500px';
		mainWindow.document.head.appendChild(style);
		mainWindow.document.body.appendChild(container);

		let result: IRenderedEmptyLine | undefined;
		try {
			testViewModel([''], { lineHeight: 19 }, (viewModel, model, configuration) => {
				model.deltaDecorations([], decorations);

				const lineHeight = configuration.options.get(EditorOption.lineHeight);
				const viewportData = new ViewportData([], {
					bigNumbersDelta: 0,
					startLineNumber: 1,
					endLineNumber: 1,
					relativeVerticalOffset: [0],
					centeredLineNumber: 1,
					completelyVisibleStartLineNumber: 1,
					completelyVisibleEndLineNumber: 1,
					lineHeight
				}, [], viewModel);

				const viewLine = new ViewLine(undefined, new ViewLineOptions(configuration, ColorScheme.LIGHT));
				const sb = new StringBuilder(1000);
				viewLine.renderLine(1, 0, lineHeight, viewportData, sb);
				container.innerHTML = sb.build();
				const lineDomNode = container.firstChild as HTMLElement;
				lineDomNode.style.position = 'absolute';
				viewLine.setDomNode(lineDomNode);

				const visibleRanges = viewLine.getVisibleRangesForRange(1, 1, 1, new DomReadingContext(container, container));
				const containerLeft = container.getBoundingClientRect().left;
				result = {
					cursorLeft: visibleRanges!.ranges[0].left,
					decorationEdges: Array.from(lineDomNode.querySelectorAll('span > span'), span => {
						const rect = span.getBoundingClientRect();
						return { className: span.className, left: rect.left - containerLeft, right: rect.right - containerLeft };
					})
				};
			});
		} finally {
			container.remove();
			style.remove();
		}
		return result!;
	}

	function decoration(options: { beforeContentClassName?: string; afterContentClassName?: string }): IModelDeltaDecoration {
		return { range: new Range(1, 1, 1, 1), options: { description: 'test', ...options } };
	}

	test('cursor is painted after a before decoration on an empty line (#215390)', () => {
		const rendered = renderEmptyLineWithDecorations([
			decoration({ beforeContentClassName: 'viewLineTest-before' })
		]);
		assert.deepStrictEqual(rendered, {
			cursorLeft: 40,
			decorationEdges: [{ className: 'viewLineTest-before', left: 0, right: 40 }]
		});
	});

	test('cursor is painted after all before decorations on an empty line (#215390)', () => {
		const rendered = renderEmptyLineWithDecorations([
			decoration({ beforeContentClassName: 'viewLineTest-before' }),
			decoration({ beforeContentClassName: 'viewLineTest-before2' })
		]);
		assert.deepStrictEqual(rendered, {
			cursorLeft: 65,
			decorationEdges: [
				{ className: 'viewLineTest-before', left: 0, right: 40 },
				{ className: 'viewLineTest-before2', left: 40, right: 65 }
			]
		});
	});

	test('cursor is painted between before and after decorations on an empty line', () => {
		const rendered = renderEmptyLineWithDecorations([
			decoration({ beforeContentClassName: 'viewLineTest-before', afterContentClassName: 'viewLineTest-after' })
		]);
		assert.deepStrictEqual(rendered, {
			cursorLeft: 40,
			decorationEdges: [
				{ className: 'viewLineTest-before', left: 0, right: 40 },
				{ className: 'viewLineTest-after', left: 40, right: 70 }
			]
		});
	});

	test('cursor is painted before an after decoration on an empty line', () => {
		const rendered = renderEmptyLineWithDecorations([
			decoration({ afterContentClassName: 'viewLineTest-after' })
		]);
		assert.deepStrictEqual(rendered, {
			cursorLeft: 0,
			decorationEdges: [{ className: 'viewLineTest-after', left: 0, right: 30 }]
		});
	});
});
