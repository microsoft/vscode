/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Dimension } from '../../../../base/browser/dom.js';
import { timeout } from '../../../../base/common/async.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { constObservable, IObservable, ITransaction, observableValue, transaction } from '../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { OffsetRange } from '../../../common/core/ranges/offsetRange.js';
import { asLayoutRevision, computeCompressedVirtualizedScrollLayout, createAnchoredSizeEditBatch, mapLogicalPosition } from '../../../browser/widget/multiDiffEditor/compressedVirtualizedScrollLayout.js';
import { CompressedVirtualizedScrollView, ICompressedVirtualizedScrollItem, ICompressedVirtualizedScrollItemContext } from '../../../browser/widget/multiDiffEditor/compressedVirtualizedScrollView.js';
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

	test('keeps transient scroll slack outside logical item ranges', () => {
		const layout = computeCompressedVirtualizedScrollLayout({
			revision: asLayoutRevision(7),
			scrollTop: 0,
			viewportHeight: 400,
			itemGap: 10,
			itemHeights: [200, 300],
			leadingScrollSlack: 100,
			trailingScrollSlack: 150,
		});

		assert.deepStrictEqual({
			revision: layout.revision,
			logicalScrollHeight: layout.logicalScrollHeight,
			scrollHeight: layout.scrollHeight,
			renderedHeight: layout.renderedHeight,
			contentViewport: layout.contentViewport.toString(),
			itemRanges: layout.items.map(item => item.contentRange.toString()),
			renderedRanges: layout.items.map(item => item.renderedRange.toString()),
		}, {
			revision: 7,
			logicalScrollHeight: 510,
			scrollHeight: 760,
			renderedHeight: 760,
			contentViewport: '[-100, 300)',
			itemRanges: ['[0, 200)', '[210, 510)'],
			renderedRanges: ['[100, 300)', '[310, 610)'],
		});
	});

	test('maps a revisioned viewport anchor through simultaneous size edits', () => {
		const edit = createAnchoredSizeEditBatch(
			asLayoutRevision(3),
			asLayoutRevision(4),
			[200, 900, 300],
			[300, 40, 500],
			10,
			10,
			750,
		);

		assert.deepStrictEqual({
			edits: edit.edits.map(e => ({ oldRange: e.oldRange.toString(), newRange: e.newRange.toString() })),
			anchor: edit.anchor,
			mappedAnchor: mapLogicalPosition(edit.anchor, edit),
			positionAfterAllItems: mapLogicalPosition({ revision: asLayoutRevision(3), offset: 1420 }, edit),
		}, {
			edits: [
				{ oldRange: '[0, 200)', newRange: '[0, 300)' },
				{ oldRange: '[210, 1110)', newRange: '[310, 350)' },
				{ oldRange: '[1120, 1420)', newRange: '[360, 860)' },
			],
			anchor: { revision: 3, offset: 750 },
			mappedAnchor: { revision: 4, offset: 310 },
			positionAfterAllItems: { revision: 4, offset: 860 },
		});
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
				itemBViewportOffset: layout.items[1].scrollOffset,
				itemBRenderedTop: layout.items[1].renderedRange.start - layout.renderedViewport.start,
			};
		};
		const before = getState();

		itemA.setSize(360);
		const afterPrecedingGrowth = getState();
		itemB.setSize(1200);
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
				scrollTop: 900,
				itemBViewportOffset: 528,
				itemBRenderedTop: 0,
			},
		});
	});

	test('does not treat item-local scrolling as anchor movement', () => {
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

		const requestedScrollTops = [400, 800, 700, 200, 850];
		const appliedScrollTops = requestedScrollTops.map(scrollTop => {
			view.setScrollPosition({ scrollTop });
			return view.getScrollPosition().scrollTop;
		});

		assert.deepStrictEqual(appliedScrollTops, requestedScrollTops);
	});

	test('preserves geometry compensation during outer scrolling', () => {
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

		transaction(tx => {
			itemA.setSize(360, tx);
			view.setScrollPosition({ scrollTop: 700 });
		});

		assert.deepStrictEqual({
			scrollTop: view.getScrollPosition().scrollTop,
			itemBViewportOffset: view.layout.get().items[1].scrollOffset,
		}, {
			scrollTop: 800,
			itemBViewportOffset: 428,
		});
	});

	test('uses trailing slack to preserve a near-bottom anchor and consumes it when scrolling up', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));

		const itemA = new TestCompressedScrollItem(500);
		const itemB = new TestCompressedScrollItem(500);
		const view = disposables.add(new CompressedVirtualizedScrollView(
			container,
			constObservable(new Dimension(800, 400)),
			constObservable(12),
			() => constObservable([itemA, itemB]),
		));
		container.appendChild(view.domNode);
		view.setScrollPosition({ scrollTop: 600 });

		itemB.setSize(100);
		const afterShrink = view.layout.get();
		view.setScrollPosition({ scrollTop: 500 });
		const afterScrollUp = view.layout.get();

		assert.deepStrictEqual({
			afterShrink: {
				scrollTop: afterShrink.scrollTop,
				logicalScrollHeight: afterShrink.logicalScrollHeight,
				scrollHeight: afterShrink.scrollHeight,
				trailingScrollSlack: afterShrink.trailingScrollSlack,
			},
			afterScrollUp: {
				scrollTop: afterScrollUp.scrollTop,
				scrollHeight: afterScrollUp.scrollHeight,
				trailingScrollSlack: afterScrollUp.trailingScrollSlack,
			},
		}, {
			afterShrink: {
				scrollTop: 600,
				logicalScrollHeight: 612,
				scrollHeight: 1000,
				trailingScrollSlack: 388,
			},
			afterScrollUp: {
				scrollTop: 500,
				scrollHeight: 900,
				trailingScrollSlack: 288,
			},
		});
	});

	test('uses leading slack for an operation anchor and consumes it when scrolling down', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));

		const itemA = new TestCompressedScrollItem(100);
		const itemB = new TestCompressedScrollItem(500);
		const view = disposables.add(new CompressedVirtualizedScrollView(
			container,
			constObservable(new Dimension(800, 400)),
			constObservable(12),
			() => constObservable([itemA, itemB]),
		));
		container.appendChild(view.domNode);
		const revision = view.layout.get().revision;

		view.runWithScrollAnchor({ revision, offset: 100 }, tx => itemA.setSize(50, tx));
		const afterShrink = view.layout.get();
		view.setScrollPosition({ scrollTop: 100 });
		const afterScrollDown = view.layout.get();

		assert.deepStrictEqual({
			afterShrink: {
				scrollTop: afterShrink.scrollTop,
				contentViewport: afterShrink.contentViewport.toString(),
				leadingScrollSlack: afterShrink.leadingScrollSlack,
			},
			afterScrollDown: {
				scrollTop: afterScrollDown.scrollTop,
				contentViewport: afterScrollDown.contentViewport.toString(),
				leadingScrollSlack: afterScrollDown.leadingScrollSlack,
			},
		}, {
			afterShrink: {
				scrollTop: 0,
				contentViewport: '[-50, 350)',
				leadingScrollSlack: 50,
			},
			afterScrollDown: {
				scrollTop: 50,
				contentViewport: '[50, 450)',
				leadingScrollSlack: 0,
			},
		});
	});

	test('resets transient scroll state when equal-height items are replaced', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));

		const itemA = new TestCompressedScrollItem(100);
		const itemB = new TestCompressedScrollItem(500);
		const items = observableValue<readonly TestCompressedScrollItem[]>('items', [itemA, itemB]);
		const view = disposables.add(new CompressedVirtualizedScrollView(
			container,
			constObservable(new Dimension(800, 400)),
			constObservable(12),
			() => items,
		));
		container.appendChild(view.domNode);
		view.runWithScrollAnchor({ revision: view.layout.get().revision, offset: 100 }, tx => itemA.setSize(50, tx));
		const beforeReplacement = view.layout.get();
		const beforeReplacementEdit = view.lastGeometryEdit.get();

		transaction(tx => items.set([new TestCompressedScrollItem(50), new TestCompressedScrollItem(500)], tx));
		const afterReplacement = view.layout.get();
		const afterReplacementEdit = view.lastGeometryEdit.get();

		assert.deepStrictEqual({
			beforeReplacement: {
				revision: beforeReplacement.revision,
				leadingScrollSlack: beforeReplacement.leadingScrollSlack,
				geometryEditKind: beforeReplacementEdit?.anchorKind,
			},
			afterReplacement: {
				revision: afterReplacement.revision,
				leadingScrollSlack: afterReplacement.leadingScrollSlack,
				trailingScrollSlack: afterReplacement.trailingScrollSlack,
				contentViewport: afterReplacement.contentViewport.toString(),
				geometryEdit: afterReplacementEdit,
			},
		}, {
			beforeReplacement: {
				revision: 1,
				leadingScrollSlack: 50,
				geometryEditKind: 'logical',
			},
			afterReplacement: {
				revision: 1,
				leadingScrollSlack: 0,
				trailingScrollSlack: 0,
				contentViewport: '[0, 400)',
				geometryEdit: undefined,
			},
		});
	});

	test('converts logical reveal positions after leading slack', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));

		const itemA = new TestCompressedScrollItem(100);
		const itemB = new TestCompressedScrollItem(500);
		const view = disposables.add(new CompressedVirtualizedScrollView(
			container,
			constObservable(new Dimension(800, 400)),
			constObservable(12),
			() => constObservable([itemA, itemB]),
		));
		container.appendChild(view.domNode);
		view.runWithScrollAnchor({ revision: view.layout.get().revision, offset: 100 }, tx => itemA.setSize(50, tx));

		view.setLogicalScrollPosition(112);
		const layout = view.layout.get();

		assert.deepStrictEqual({
			scrollTop: layout.scrollTop,
			contentViewport: layout.contentViewport.toString(),
			leadingScrollSlack: layout.leadingScrollSlack,
		}, {
			scrollTop: 112,
			contentViewport: '[112, 512)',
			leadingScrollSlack: 0,
		});
	});

	test('keeps an item-local semantic anchor stable when its offset and item size change', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));

		const item = new TestCompressedScrollItem(1000);
		let itemAnchorOffset = 300;
		let nextItemAnchorOffset = 500;
		const nextItemSize = 1200;
		const view = disposables.add(new CompressedVirtualizedScrollView(
			container,
			constObservable(new Dimension(800, 400)),
			constObservable(0),
			() => constObservable([item]),
		));
		container.appendChild(view.domNode);
		view.setScrollPosition({ scrollTop: 250 });
		const runWithItemScrollAnchor = () => item.renderContext!.runWithScrollAnchor(() => itemAnchorOffset, tx => {
			itemAnchorOffset = nextItemAnchorOffset;
			item.setSize(nextItemSize, tx);
		});

		const beforeViewportOffset = itemAnchorOffset - view.layout.get().contentViewport.start;
		runWithItemScrollAnchor();
		const afterLayout = view.layout.get();
		const afterViewportOffset = itemAnchorOffset - afterLayout.contentViewport.start;
		nextItemAnchorOffset = 550;
		runWithItemScrollAnchor();
		const afterInternalEditLayout = view.layout.get();
		const afterInternalEdit = view.lastGeometryEdit.get();
		const beforeNoOpLayout = view.layout.get();
		const beforeNoOpEdit = view.lastGeometryEdit.get();
		runWithItemScrollAnchor();

		assert.deepStrictEqual({
			beforeViewportOffset,
			afterRevision: afterLayout.revision,
			afterScrollTop: afterLayout.scrollTop,
			afterViewportOffset,
			anchorKind: view.lastGeometryEdit.get()?.anchorKind,
			afterInternalEditRevision: afterInternalEditLayout.revision,
			afterInternalEditScrollTop: afterInternalEditLayout.scrollTop,
			afterInternalEditViewportOffset: itemAnchorOffset - afterInternalEditLayout.contentViewport.start,
			afterInternalEditRevisions: {
				from: afterInternalEdit?.fromRevision,
				to: afterInternalEdit?.toRevision,
			},
			afterInternalEditEditCount: afterInternalEdit?.edits.length,
			noOpPreservedLayout: view.layout.get() === beforeNoOpLayout,
			noOpPreservedEdit: view.lastGeometryEdit.get() === beforeNoOpEdit,
		}, {
			beforeViewportOffset: 50,
			afterRevision: 1,
			afterScrollTop: 450,
			afterViewportOffset: 50,
			anchorKind: 'item',
			afterInternalEditRevision: 1,
			afterInternalEditScrollTop: 500,
			afterInternalEditViewportOffset: 50,
			afterInternalEditRevisions: {
				from: 1,
				to: 1,
			},
			afterInternalEditEditCount: 0,
			noOpPreservedLayout: true,
			noOpPreservedEdit: true,
		});
	});

	test('anchors geometry edits based on recent scroll direction', async () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));

		const itemA = new TestCompressedScrollItem(500);
		const itemB = new TestCompressedScrollItem(1000);
		const view = disposables.add(new CompressedVirtualizedScrollView(
			container,
			constObservable(new Dimension(800, 400)),
			constObservable(0),
			() => constObservable([itemA, itemB]),
		));
		container.appendChild(view.domNode);
		view.setScrollPosition({ scrollTop: 600 });
		itemA.onNextRender = () => itemA.setSize(40);
		view.setScrollPosition({ scrollTop: 499 });

		const afterShrinkWhileScrollingUp = view.layout.get();
		const afterShrinkEdit = view.lastGeometryEdit.get();
		itemA.setSize(500);
		const afterRestoreWhileScrollingUp = view.layout.get();
		const afterRestoreEdit = view.lastGeometryEdit.get();
		await timeout(60);
		view.setScrollPosition({ scrollTop: 498 });
		await timeout(60);
		itemA.setSize(600);
		const afterGrowthWithinRetentionPeriod = view.layout.get();
		const afterGrowthWithinRetentionPeriodEdit = view.lastGeometryEdit.get();
		await timeout(50);
		itemB.setSize(900);
		const afterChangeAfterScrollingEnded = view.layout.get();
		const afterChangeAfterScrollingEndedEdit = view.lastGeometryEdit.get();

		assert.deepStrictEqual({
			afterShrinkWhileScrollingUp: {
				scrollTop: afterShrinkWhileScrollingUp.scrollTop,
				itemBOffsetAtViewportBottom: afterShrinkWhileScrollingUp.contentViewport.endExclusive - afterShrinkWhileScrollingUp.items[1].contentRange.start,
				anchorKind: afterShrinkEdit?.anchorKind,
			},
			afterRestoreWhileScrollingUp: {
				scrollTop: afterRestoreWhileScrollingUp.scrollTop,
				itemBOffsetAtViewportBottom: afterRestoreWhileScrollingUp.contentViewport.endExclusive - afterRestoreWhileScrollingUp.items[1].contentRange.start,
				anchorKind: afterRestoreEdit?.anchorKind,
			},
			afterGrowthWithinRetentionPeriod: {
				scrollTop: afterGrowthWithinRetentionPeriod.scrollTop,
				itemBOffsetAtViewportBottom: afterGrowthWithinRetentionPeriod.contentViewport.endExclusive - afterGrowthWithinRetentionPeriod.items[1].contentRange.start,
				anchorKind: afterGrowthWithinRetentionPeriodEdit?.anchorKind,
			},
			afterChangeAfterScrollingEnded: {
				scrollTop: afterChangeAfterScrollingEnded.scrollTop,
				itemBOffsetAtViewportTop: afterChangeAfterScrollingEnded.contentViewport.start - afterChangeAfterScrollingEnded.items[1].contentRange.start,
				anchorKind: afterChangeAfterScrollingEndedEdit?.anchorKind,
			},
		}, {
			afterShrinkWhileScrollingUp: {
				scrollTop: 39,
				itemBOffsetAtViewportBottom: 399,
				anchorKind: 'viewportBottom',
			},
			afterRestoreWhileScrollingUp: {
				scrollTop: 499,
				itemBOffsetAtViewportBottom: 399,
				anchorKind: 'viewportBottom',
			},
			afterGrowthWithinRetentionPeriod: {
				scrollTop: 598,
				itemBOffsetAtViewportBottom: 398,
				anchorKind: 'viewportBottom',
			},
			afterChangeAfterScrollingEnded: {
				scrollTop: 598,
				itemBOffsetAtViewportTop: -2,
				anchorKind: 'viewportTop',
			},
		});
	});
});

class TestCompressedScrollItem implements ICompressedVirtualizedScrollItem {
	readonly size;
	readonly maxScroll: IObservable<{ readonly maxScroll: number }> = constObservable({ maxScroll: 0 });
	renderContext: ICompressedVirtualizedScrollItemContext | undefined;
	onNextRender: (() => void) | undefined;

	constructor(contentHeight: number) {
		this.size = observableValue(this, contentHeight);
	}

	setSize(size: number, tx?: ITransaction): void {
		if (tx) {
			this.size.set(size, tx);
		} else {
			transaction(tx => this.size.set(size, tx));
		}
	}

	render(_renderedRange: OffsetRange, _scrollOffset: number, _width: number, _renderedViewport: OffsetRange, context: ICompressedVirtualizedScrollItemContext): void {
		this.renderContext = context;
		const onNextRender = this.onNextRender;
		this.onNextRender = undefined;
		onNextRender?.();
	}

	hide(): void { }
}
