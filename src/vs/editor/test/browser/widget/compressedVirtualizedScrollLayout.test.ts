/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Dimension } from '../../../../base/browser/dom.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { constObservable, IObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { OffsetRange } from '../../../common/core/ranges/offsetRange.js';
import { computeCompressedVirtualizedScrollLayout } from '../../../browser/widget/multiDiffEditor/compressedVirtualizedScrollLayout.js';
import { CompressedVirtualizedScrollView, ICompressedVirtualizedScrollItem, ICompressedVirtualizedScrollItemVerticalState } from '../../../browser/widget/multiDiffEditor/compressedVirtualizedScrollView.js';
import { Random } from '../../common/core/random.js';

suite('CompressedVirtualizedScrollLayout', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('describes mixed-height content in complete and rendered coordinates', () => {
		const layout = computeCompressedVirtualizedScrollLayout({
			scrollTop: 500,
			viewportHeight: 400,
			itemGap: 10,
			itemHeights: [200, 900, 300],
		});

		assert.deepStrictEqual({
			scrollTop: layout.scrollTop,
			scrollHeight: layout.scrollHeight,
			renderedHeight: layout.renderedHeight,
			renderedScrollTop: layout.renderedViewport.start,
			hiddenContentHeightAboveViewport: layout.hiddenContentHeightAboveViewport,
			items: layout.items.map(item => ({
				content: item.contentRange.toString(),
				rendered: item.renderedRange.toString(),
				maxScrollOffset: item.maxScrollOffset,
				scrollOffset: item.scrollOffset,
				visibility: item.visibility,
			})),
		}, {
			scrollTop: 500,
			scrollHeight: 1420,
			renderedHeight: 920,
			renderedScrollTop: 210,
			hiddenContentHeightAboveViewport: 290,
			items: [
				{ content: '[0, 200)', rendered: '[0, 200)', maxScrollOffset: 0, scrollOffset: 0, visibility: 'before' },
				{ content: '[210, 1110)', rendered: '[210, 610)', maxScrollOffset: 500, scrollOffset: 290, visibility: 'visible' },
				{ content: '[1120, 1420)', rendered: '[620, 920)', maxScrollOffset: 0, scrollOffset: 0, visibility: 'after' },
			],
		});
	});

	test('conserves vertical displacement', () => {
		const random = Random.create(873245);
		const failures: string[] = [];

		for (let caseIndex = 0; caseIndex < 2000; caseIndex++) {
			const viewportHeight = random.nextIntRange(1, 1000);
			const itemGap = random.nextIntRange(0, 41);
			const itemHeights = Array.from(
				{ length: random.nextIntRange(0, 31) },
				() => random.nextIntRange(0, 2501),
			);
			const initial = computeCompressedVirtualizedScrollLayout({
				scrollTop: random.nextIntRange(0, 50001),
				viewportHeight,
				itemGap,
				itemHeights,
			});
			const next = computeCompressedVirtualizedScrollLayout({
				scrollTop: initial.scrollTop + random.nextIntRange(-2000, 2001),
				viewportHeight,
				itemGap,
				itemHeights,
			});

			const scrollDelta = next.scrollTop - initial.scrollTop;
			const renderedDelta = next.renderedViewport.start - initial.renderedViewport.start;
			const hiddenDelta = next.hiddenContentHeightAboveViewport - initial.hiddenContentHeightAboveViewport;
			const residual = scrollDelta - renderedDelta - hiddenDelta;
			const invalidItem = next.items.find(item =>
				item.scrollOffset < 0
				|| item.scrollOffset > item.maxScrollOffset
				|| item.maxScrollOffset !== Math.max(0, item.contentRange.length - item.renderedRange.length)
			);

			if (Math.abs(residual) > 0.0001 || invalidItem) {
				failures.push(`case ${caseIndex}: residual=${residual}, invalidItem=${!!invalidItem}`);
				if (failures.length === 10) {
					break;
				}
			}
		}

		assert.deepStrictEqual(failures, []);
	});

	test('keeps the rendered anchor stable when content grows above it', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));

		const itemA = new TestCompressedScrollItem(260);
		const itemB = new TestCompressedScrollItem(1100);
		const view = disposables.add(new CompressedVirtualizedScrollView(
			container,
			constObservable(new Dimension(800, 480)),
			constObservable(12),
			() => constObservable([itemA, itemB]),
		));
		container.appendChild(view.domNode);
		view.setScrollPosition({ scrollTop: 800 });

		const getState = () => {
			const layout = view.layout.get();
			return {
				scrollTop: view.getScrollPosition().scrollTop,
				itemBViewportOffset: itemB.verticalState.get().itemViewportOffset,
				itemBRenderedTop: layout.items[1].renderedRange.start - layout.renderedViewport.start,
			};
		};
		const before = getState();

		itemA.setVerticalState({ contentHeight: 360, itemViewportOffset: 0 });
		const afterPrecedingGrowth = getState();
		itemB.setVerticalState({ contentHeight: 1200, itemViewportOffset: 628 });
		const afterAnchorGrowth = getState();

		assert.deepStrictEqual({
			before,
			afterPrecedingGrowth,
			afterAnchorGrowth,
		}, {
			before: {
				scrollTop: 800,
				itemBViewportOffset: 528,
				itemBRenderedTop: 0,
			},
			afterPrecedingGrowth: {
				scrollTop: 900,
				itemBViewportOffset: 528,
				itemBRenderedTop: 0,
			},
			afterAnchorGrowth: {
				scrollTop: 1000,
				itemBViewportOffset: 628,
				itemBRenderedTop: 0,
			},
		});
	});
});

class TestCompressedScrollItem implements ICompressedVirtualizedScrollItem {
	readonly verticalState;
	readonly maxScroll: IObservable<{ readonly maxScroll: number }> = constObservable({ maxScroll: 0 });

	constructor(contentHeight: number) {
		this.verticalState = observableValue<ICompressedVirtualizedScrollItemVerticalState>(this, {
			contentHeight,
			itemViewportOffset: 0,
		});
	}

	setVerticalState(state: ICompressedVirtualizedScrollItemVerticalState): void {
		transaction(tx => this.verticalState.set(state, tx));
	}

	render(_renderedRange: OffsetRange, scrollOffset: number, _width: number, _renderedViewport: OffsetRange): void {
		const state = this.verticalState.get();
		if (state.itemViewportOffset !== scrollOffset) {
			this.setVerticalState({ ...state, itemViewportOffset: scrollOffset });
		}
	}

	hide(): void { }
}
