/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createFastDomNode } from '../../../../base/browser/fastDomNode.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestColorTheme } from '../../../../platform/theme/test/common/testThemeService.js';
import { HorizontalPosition, HorizontalRange, ILinesVisibleRangesRequest, LineVisibleRanges } from '../../../browser/view/renderingContext.js';
import { IViewLinesTextRenderer, ViewLines } from '../../../browser/viewParts/viewLines/viewLines.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { Selection } from '../../../common/core/selection.js';
import { ViewportData } from '../../../common/viewLayout/viewLinesViewportData.js';
import { ViewContext } from '../../../common/viewModel/viewContext.js';
import { ViewModel } from '../../../common/viewModel/viewModelImpl.js';
import { testViewModel } from '../viewModel/testViewModel.js';

suite('ViewLines', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	/** Paints the text instead of `ViewLines`, and measures column `c` at `10 × c`. */
	class TestTextRenderer implements IViewLinesTextRenderer {
		public readonly calls: string[] = [];
		public lineWidth: number | undefined = 42;

		public visibleRangeForPosition(position: Position): HorizontalPosition | null {
			this.calls.push('visibleRangeForPosition');
			return new HorizontalPosition(false, position.column * 10);
		}
		public linesVisibleRangesForRange(range: Range): LineVisibleRanges[] | null {
			this.calls.push('linesVisibleRangesForRange');
			return [this._measure(range)];
		}
		public linesVisibleRangesForRanges(requests: readonly ILinesVisibleRangesRequest[]): (LineVisibleRanges[] | null)[] {
			this.calls.push('linesVisibleRangesForRanges');
			return requests.map(request => [this._measure(request.range)]);
		}
		public getLineWidth(): number | undefined {
			this.calls.push('getLineWidth');
			return this.lineWidth;
		}
		public getMaxLineWidth(): number | undefined {
			return undefined;
		}
		public getColumnOffset(): number | undefined {
			return undefined;
		}
		private _measure(range: Range): LineVisibleRanges {
			return new LineVisibleRanges(false, range.startLineNumber, [new HorizontalRange(range.startColumn * 10, 10)], false);
		}
	}

	function withViewLines(callback: (viewLines: ViewLines, viewModel: ViewModel) => void): void {
		testViewModel(['hello', 'world'], {}, (viewModel, model, configuration) => {
			const viewLines = new ViewLines(new ViewContext(configuration, new TestColorTheme(), viewModel), createFastDomNode(document.createElement('div')));
			try {
				callback(viewLines, viewModel);
			} finally {
				viewLines.dispose();
			}
		});
	}

	/** Renders both lines, and returns how many line DOM nodes there are. */
	function renderLines(viewLines: ViewLines, viewModel: ViewModel): number {
		viewLines.renderText(new ViewportData(
			[new Selection(1, 1, 1, 1)],
			{
				bigNumbersDelta: 0,
				startLineNumber: 1,
				endLineNumber: 2,
				relativeVerticalOffset: [0, 19],
				centeredLineNumber: 1,
				completelyVisibleStartLineNumber: 1,
				completelyVisibleEndLineNumber: 2,
				lineHeight: 19
			},
			[],
			viewModel
		));
		return viewLines.getDomNode().domNode.childElementCount;
	}

	test('measures the text through the text renderer', () => {
		withViewLines(viewLines => {
			const renderer = new TestTextRenderer();
			viewLines.setTextRenderer(renderer);
			const requests = [new Range(1, 2, 1, 3), new Range(2, 4, 2, 5)].map(range => ({ range, includeNewLines: false }));
			const position = viewLines.visibleRangeForPosition(new Position(1, 3))?.left;
			const range = viewLines.linesVisibleRangesForRange(new Range(2, 2, 2, 3), false)?.map(line => line.ranges[0].left);
			const ranges = viewLines.linesVisibleRangesForRanges(requests).map(lines => lines?.[0].ranges[0].left);
			const lineWidth = viewLines.getLineWidth(1);
			renderer.lineWidth = undefined;
			// -1 is what ViewLines returns for a line it hasn't rendered.
			const lineWidthBeforeItCanMeasure = viewLines.getLineWidth(1);
			assert.deepStrictEqual(
				{ position, range, ranges, lineWidth, lineWidthBeforeItCanMeasure, calls: renderer.calls },
				{
					position: 30,
					range: [20],
					ranges: [20, 40],
					lineWidth: 42,
					lineWidthBeforeItCanMeasure: -1,
					calls: ['visibleRangeForPosition', 'linesVisibleRangesForRange', 'linesVisibleRangesForRanges', 'getLineWidth', 'getLineWidth'],
				}
			);
		});
	});

	test('renders no DOM lines while the text renderer paints, and renders them again without it', () => {
		withViewLines((viewLines, viewModel) => {
			const renderer = new TestTextRenderer();
			const domLines = renderLines(viewLines, viewModel);
			viewLines.setTextRenderer(renderer);
			const discarded = viewLines.getDomNode().domNode.childElementCount;
			const withRenderer = renderLines(viewLines, viewModel);
			viewLines.setTextRenderer(undefined);
			const withoutRenderer = renderLines(viewLines, viewModel);
			viewLines.getLineWidth(1);
			assert.deepStrictEqual(
				{ domLines, discarded, withRenderer, withoutRenderer, rendererCalls: renderer.calls },
				{ domLines: 2, discarded: 0, withRenderer: 0, withoutRenderer: 2, rendererCalls: [] }
			);
		});
	});
});
