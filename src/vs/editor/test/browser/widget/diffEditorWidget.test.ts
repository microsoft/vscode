/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable, observableValue } from '../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestAccessibilityService } from '../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { SashLayout } from '../../../browser/widget/diffEditor/components/diffEditorSash.js';
import { DiffEditorOptions } from '../../../browser/widget/diffEditor/diffEditorOptions.js';
import { UnchangedRegion } from '../../../browser/widget/diffEditor/diffEditorViewModel.js';
import { LineRange } from '../../../common/core/ranges/lineRange.js';
import { DetailedLineRangeMapping } from '../../../common/diff/rangeMapping.js';

suite('DiffEditorWidget2', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('width based layout', () => {
		test('commits temporary inline when smoothly enlarging from automatic inline', () => {
			const options = new DiffEditorOptions({
				renderSideBySide: true,
				renderSideBySideInlineBreakpoint: 900,
				useInlineViewWhenSpaceIsLimited: true,
			}, new TestAccessibilityService());

			options.setWidth(1000);
			const initiallySideBySide = options.renderSideBySide.get();
			options.setWidth(800, 1000);
			const inlineDuringResize = options.renderSideBySide.get();
			const temporaryInlineAfterShrinking = options.temporaryInlineMode.get();
			options.setWidth(1000, 1000);
			const restoredDuringResize = options.renderSideBySide.get();
			options.setWidth(800, 1000);
			const temporaryInlineAfterEndingNarrow = options.temporaryInlineMode.get();
			options.setWidth(1000, 800);
			const wideAfterInlineWasCommitted = options.renderSideBySide.get();
			const temporaryInlineMode = options.temporaryInlineMode.get();
			options.setWidth(800);
			const temporaryInlineAfterBecomingNarrow = options.temporaryInlineMode.get();
			options.setWidth(1000, 800);
			options.resetWidthBasedLayout();
			const wideAfterResettingAutomatic = options.renderSideBySide.get();
			options.setWidth(800);
			const automaticInlineResult = options.renderSideBySideInAutomaticMode.get();
			options.setWidth(1000);
			const automaticSideBySideResult = options.renderSideBySideInAutomaticMode.get();
			options.updateOptions({ renderSideBySide: false });
			options.updateOptions({ renderSideBySide: true });

			assert.deepStrictEqual({
				initiallySideBySide,
				inlineDuringResize,
				temporaryInlineAfterShrinking,
				restoredDuringResize,
				temporaryInlineAfterEndingNarrow,
				wideAfterInlineWasCommitted,
				temporaryInlineMode,
				temporaryInlineAfterBecomingNarrow,
				wideAfterResettingAutomatic,
				automaticInlineResult,
				automaticSideBySideResult,
				wideAfterExplicitlyRestoringAuto: options.renderSideBySide.get(),
			}, {
				initiallySideBySide: true,
				inlineDuringResize: false,
				temporaryInlineAfterShrinking: false,
				restoredDuringResize: true,
				temporaryInlineAfterEndingNarrow: false,
				wideAfterInlineWasCommitted: false,
				temporaryInlineMode: true,
				temporaryInlineAfterBecomingNarrow: false,
				wideAfterResettingAutomatic: true,
				automaticInlineResult: false,
				automaticSideBySideResult: true,
				wideAfterExplicitlyRestoringAuto: true,
			});
		});

		test('keeps auto layout after a non-resize layout change', () => {
			const options = new DiffEditorOptions({
				renderSideBySide: true,
				renderSideBySideInlineBreakpoint: 900,
				useInlineViewWhenSpaceIsLimited: true,
			}, new TestAccessibilityService());

			options.setWidth(800);
			const narrow = options.renderSideBySide.get();
			options.setWidth(1000);

			assert.deepStrictEqual({
				narrow,
				wideAfterLayoutChange: options.renderSideBySide.get(),
			}, {
				narrow: false,
				wideAfterLayoutChange: true,
			});
		});
	});

	suite('gutter layout', () => {
		const gutterWidth = 35;

		function createSashLayout() {
			const contentWidth = observableValue<number>('contentWidth', 0);
			const options = new DiffEditorOptions({ renderSideBySide: true }, new TestAccessibilityService());
			const sashLayout = new SashLayout(options, { width: contentWidth, height: constObservable(0) });
			return {
				edges(width: number, gutter: number) {
					contentWidth.set(width, undefined);
					const { left, right } = sashLayout.getGutterEdges(gutter, undefined);
					return { original: left, modified: width - right, gutter: right - left };
				},
				dragSashTo(position: number) {
					sashLayout.sashLeft.set(position, undefined);
				},
			};
		}

		test('takes the gutter from both sides equally', () => {
			const { edges } = createSashLayout();
			assert.deepStrictEqual({
				evenWidth: edges(1000, gutterWidth),
				oddWidth: edges(1001, gutterWidth),
				evenWidthAndGutter: edges(1000, gutterWidth + 1),
				oddWidthEvenGutter: edges(1001, gutterWidth + 1),
				withoutGutter: edges(1000, 0),
				oddWidthWithoutGutter: edges(1001, 0),
			}, {
				evenWidth: { original: 482, modified: 482, gutter: 36 },
				oddWidth: { original: 483, modified: 483, gutter: 35 },
				evenWidthAndGutter: { original: 482, modified: 482, gutter: 36 },
				oddWidthEvenGutter: { original: 482, modified: 482, gutter: 37 },
				withoutGutter: { original: 500, modified: 500, gutter: 0 },
				oddWidthWithoutGutter: { original: 500, modified: 500, gutter: 1 },
			});
		});

		test('keeps both editors at their minimum width when the sash is dragged to a limit', () => {
			const { edges, dragSashTo } = createSashLayout();
			edges(1000, gutterWidth);
			dragSashTo(20);
			const atTheLeftLimit = edges(1000, gutterWidth);
			dragSashTo(980);
			assert.deepStrictEqual({
				atTheLeftLimit,
				atTheRightLimit: edges(1000, gutterWidth),
			}, {
				atTheLeftLimit: { original: 100, modified: 865, gutter: 35 },
				atTheRightLimit: { original: 865, modified: 100, gutter: 35 },
			});
		});

		test('keeps whole pixels when a dragged sash is resized to a fractional position', () => {
			const { edges, dragSashTo } = createSashLayout();
			edges(1000, gutterWidth);
			dragSashTo(321);
			assert.deepStrictEqual({
				atTheWidthItWasDraggedAt: edges(1000, gutterWidth),
				afterResizingByOnePixel: edges(1001, gutterWidth),
			}, {
				atTheWidthItWasDraggedAt: { original: 303, modified: 661, gutter: 36 },
				afterResizingByOnePixel: { original: 303, modified: 662, gutter: 36 },
			});
		});
	});

	suite('UnchangedRegion', () => {
		function serialize(regions: UnchangedRegion[]): unknown {
			return regions.map(r => `${r.originalUnchangedRange} - ${r.modifiedUnchangedRange}`);
		}

		test('Everything changed', () => {
			assert.deepStrictEqual(serialize(UnchangedRegion.fromDiffs(
				[new DetailedLineRangeMapping(new LineRange(1, 10), new LineRange(1, 10), [])],
				10,
				10,
				3,
				3,
			)), []);
		});

		test('Nothing changed', () => {
			assert.deepStrictEqual(serialize(UnchangedRegion.fromDiffs(
				[],
				10,
				10,
				3,
				3,
			)), [
				'[1,11) - [1,11)'
			]);
		});

		test('Change in the middle', () => {
			assert.deepStrictEqual(serialize(UnchangedRegion.fromDiffs(
				[new DetailedLineRangeMapping(new LineRange(50, 60), new LineRange(50, 60), [])],
				100,
				100,
				3,
				3,
			)), ([
				'[1,47) - [1,47)',
				'[63,101) - [63,101)'
			]));
		});

		test('Change at the end', () => {
			assert.deepStrictEqual(serialize(UnchangedRegion.fromDiffs(
				[new DetailedLineRangeMapping(new LineRange(99, 100), new LineRange(100, 100), [])],
				100,
				100,
				3,
				3,
			)), (['[1,96) - [1,96)']));
		});
	});
});
