/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { HorizontalPosition, HorizontalRange, ILinesVisibleRangesRequest, IViewLines, LineVisibleRanges, RenderingContext } from '../../../browser/view/renderingContext.js';
import { Range } from '../../../common/core/range.js';
import { ViewportData } from '../../../common/viewLayout/viewLinesViewportData.js';
import { IViewLayout, Viewport } from '../../../common/viewModel.js';

suite('RenderingContext', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const viewLayout = new class extends mock<IViewLayout>() {
		override getScrollWidth() { return 0; }
		override getScrollHeight() { return 0; }
		override getCurrentViewport() { return new Viewport(0, 0, 0, 0); }
	};
	const viewportData = new class extends mock<ViewportData>() {
		override readonly visibleRange = new Range(1, 1, 3, 1);
		override readonly bigNumbersDelta = 0;
	};

	/** Measures a range on its first line, at `left`, unless that line is `missing`. */
	class TestLines implements IViewLines {
		public calls = 0;
		constructor(private readonly _left: number, private readonly _missing: readonly number[]) { }
		public linesVisibleRangesForRange(range: Range): LineVisibleRanges[] | null {
			this.calls++;
			return this._missing.includes(range.startLineNumber) ? null : [new LineVisibleRanges(false, range.startLineNumber, [new HorizontalRange(this._left, 1)], false)];
		}
		public visibleRangeForPosition(): HorizontalPosition | null {
			return null;
		}
	}

	class BatchTestLines extends TestLines {
		public batches = 0;
		public linesVisibleRangesForRanges(requests: readonly ILinesVisibleRangesRequest[]): (LineVisibleRanges[] | null)[] {
			this.batches++;
			return requests.map(request => this.linesVisibleRangesForRange(request.range));
		}
	}

	const requests: ILinesVisibleRangesRequest[] = [1, 2, 3].map(lineNumber => ({ range: new Range(lineNumber, 1, lineNumber, 2), includeNewLines: false }));
	const summarize = (result: (LineVisibleRanges[] | null)[]) => result.map(lines => lines?.map(line => `${line.lineNumber}@${line.ranges[0].left}`) ?? null);

	test('linesVisibleRangesForRanges merges the DOM lines\' ranges with what GPU lines measure in one call', () => {
		const domLines = new TestLines(10, [2, 3]);
		const gpuLines = new BatchTestLines(20, [3]);
		const ctx = new RenderingContext(viewLayout, viewportData, domLines, gpuLines);
		assert.deepStrictEqual({
			ranges: summarize(ctx.linesVisibleRangesForRanges(requests)),
			domCalls: domLines.calls,
			gpuBatches: gpuLines.batches,
			gpuCalls: gpuLines.calls,
		}, {
			ranges: [['1@10', '1@20'], ['2@20'], null],
			domCalls: 3,
			gpuBatches: 1,
			gpuCalls: 3,
		});
	});

	test('linesVisibleRangesForRanges measures one range at a time for lines that cannot measure several', () => {
		const ctx = new RenderingContext(viewLayout, viewportData, new TestLines(10, [2, 3]), new TestLines(20, [3]));
		const domOnly = new RenderingContext(viewLayout, viewportData, new TestLines(10, [2]));
		assert.deepStrictEqual({
			withGpuLines: summarize(ctx.linesVisibleRangesForRanges(requests)),
			domOnly: summarize(domOnly.linesVisibleRangesForRanges(requests)),
		}, {
			withGpuLines: summarize(requests.map(request => ctx.linesVisibleRangesForRange(request.range, request.includeNewLines))),
			domOnly: [['1@10'], null, ['3@10']],
		});
	});

	test('linesVisibleRangesForRanges asks ViewLines for every range in one call when it can', () => {
		// ViewLines can while another renderer paints the text.
		const viewLines = new BatchTestLines(10, [2]);
		const ctx = new RenderingContext(viewLayout, viewportData, viewLines);
		assert.deepStrictEqual({
			ranges: summarize(ctx.linesVisibleRangesForRanges(requests)),
			batches: viewLines.batches,
		}, {
			ranges: [['1@10'], null, ['3@10']],
			batches: 1,
		});
	});
});
