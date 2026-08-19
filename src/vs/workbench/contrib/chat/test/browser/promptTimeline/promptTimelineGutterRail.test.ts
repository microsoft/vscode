/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { PromptTimelineGutterRail, restDotCount } from '../../../browser/promptTimeline/promptTimelineGutterRail.js';
import { PromptTick } from '../../../browser/promptTimeline/promptTimelineModel.js';

suite('PromptTimelineGutterRail', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function tick(index: number, stat?: PromptTick['stat']): PromptTick {
		const requestId = String(index);
		return { requestId, allRequestIds: [requestId], text: requestId, timestamp: index, count: 1, ariaLabel: requestId, stat };
	}

	/** Mounts a rail with `ticks` in the document, so focus and keyboard navigation behave for real. */
	function createRail(ticks: readonly PromptTick[]): PromptTimelineGutterRail {
		const rail = store.add(new PromptTimelineGutterRail());
		document.body.appendChild(rail.domNode);
		store.add(toDisposable(() => rail.domNode.remove()));
		rail.setTicks(ticks);
		return rail;
	}

	function rowParts(rail: PromptTimelineGutterRail) {
		return Array.from(rail.domNode.querySelectorAll<HTMLElement>('.prompt-timeline-gutter-row')).map(row => ({
			row,
			jump: row.querySelector<HTMLButtonElement>('.prompt-timeline-gutter-row-jump')!,
			diff: row.querySelector<HTMLButtonElement>('.prompt-timeline-gutter-row-diff')!,
		}));
	}

	function keydown(target: HTMLElement, key: string, keyCode: number): void {
		target.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, bubbles: true, cancelable: true }));
	}

	test('highlights a row previewed from a dot, but leaves a row under the pointer to its own halves', () => {
		const rail = createRail(Array.from({ length: 3 }, (_, index) => tick(index)));

		const rows = Array.from(rail.domNode.querySelectorAll<HTMLElement>('.prompt-timeline-gutter-row'));
		const dots = Array.from(rail.domNode.querySelectorAll<HTMLElement>('.prompt-timeline-gutter-dot'));

		rows[1].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		const rowHover = {
			rows: rows.map(row => row.classList.contains('preview')),
			dots: dots.map(dot => dot.classList.contains('preview')),
		};

		dots[2].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		const dotHover = {
			rows: rows.map(row => row.classList.contains('preview')),
			dots: dots.map(dot => dot.classList.contains('preview')),
		};

		assert.deepStrictEqual({ rowHover, dotHover }, {
			rowHover: {
				// The pointer is on the row, so its own half lights up instead. The dot still pairs.
				rows: [false, false, false],
				dots: [false, true, false],
			},
			dotHover: {
				// The pointer is over on the dot column, so the row itself highlights to point it out.
				rows: [false, false, true],
				dots: [false, false, true],
			},
		});
	});

	test('maps row hover to the nearest sampled dot when capped', () => {
		const rail = store.add(new PromptTimelineGutterRail());
		rail.setTicks(Array.from({ length: 51 }, (_, index) => tick(index)));

		const rows = Array.from(rail.domNode.querySelectorAll<HTMLElement>('.prompt-timeline-gutter-row'));
		const dots = Array.from(rail.domNode.querySelectorAll<HTMLElement>('.prompt-timeline-gutter-dot'));
		rows[25].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

		assert.deepStrictEqual({
			dotCount: dots.length,
			previewDot: dots.findIndex(dot => dot.classList.contains('preview')),
		}, {
			dotCount: 50,
			previewDot: 24,
		});
	});

	test('splits a row into jump and review targets, hiding review when the prompt changed nothing', () => {
		const edited = tick(1, { added: 3, removed: 1, fileCount: 2 });
		const rail = createRail([tick(0), edited]);
		const selected: string[] = [];
		const reviewed: string[] = [];
		store.add(rail.onDidSelect(id => selected.push(id)));
		store.add(rail.onDidReview(t => reviewed.push(t.requestId)));

		const rows = rowParts(rail);
		rows[1].jump.click();
		rows[1].diff.click();

		assert.deepStrictEqual({
			reviewable: rows.map(row => row.row.classList.contains('reviewable')),
			selected,
			reviewed,
		}, {
			// Only the prompt that edited files offers the review target.
			reviewable: [false, true],
			selected: ['1'],
			reviewed: ['1'],
		});
	});

	test('moves between rows with Up/Down and between a row\'s targets with Left/Right', () => {
		const stat = { added: 1, removed: 0, fileCount: 1 };
		// Row 1 has no changes, so it has no review target to land on.
		const rail = createRail([tick(0, stat), tick(1), tick(2, stat)]);
		const rows = rowParts(rail);
		const list = rail.domNode.querySelector<HTMLElement>('.prompt-timeline-gutter-panel')!;

		/** Where focus sits, as `row:column`. */
		const focus = () => {
			const index = rows.findIndex(r => r.jump === document.activeElement || r.diff === document.activeElement);
			return index < 0 ? 'none' : `${index}:${rows[index].diff === document.activeElement ? 'diff' : 'jump'}`;
		};

		rows[0].jump.focus();
		const path = [focus()];
		keydown(list, 'ArrowRight', 39); path.push(focus());
		keydown(list, 'ArrowDown', 40); path.push(focus());  // row 1 has no diff: falls back to the label
		keydown(list, 'ArrowDown', 40); path.push(focus());  // row 2 has one: Down keeps the label column
		keydown(list, 'ArrowRight', 39); path.push(focus());
		keydown(list, 'ArrowLeft', 37); path.push(focus());
		keydown(list, 'Home', 36); path.push(focus());
		keydown(list, 'End', 35); path.push(focus());

		assert.deepStrictEqual({
			path,
			// Exactly one target across the whole flyout stays tabbable, so it is a single Tab stop.
			tabbable: rows.flatMap(r => [r.jump, r.diff]).filter(b => b.tabIndex === 0).length,
		}, {
			path: ['0:jump', '0:diff', '1:jump', '2:jump', '2:diff', '2:jump', '0:jump', '2:jump'],
			tabbable: 1,
		});
	});

	test('keeps focus in the flyout when a streaming update removes the focused review target', () => {
		const stat = { added: 1, removed: 0, fileCount: 1 };
		const rail = createRail([tick(0, stat)]);
		const rows = rowParts(rail);
		rows[0].diff.focus();

		// The prompt's edits net back to zero mid-stream, so its review target goes away under focus.
		rail.setTicks([tick(0)]);

		assert.deepStrictEqual({
			focused: document.activeElement === rows[0].jump ? 'jump' : document.activeElement === rows[0].diff ? 'diff' : 'lost',
			reviewable: rows[0].row.classList.contains('reviewable'),
			tabbable: [rows[0].jump, rows[0].diff].filter(b => b.tabIndex === 0).length,
		}, {
			focused: 'jump',
			reviewable: false,
			tabbable: 1,
		});
	});
});

suite('restDotCount', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	/** Height (px) the drawn column needs: dots (4px) separated by gaps (4px), plus the handle's 8px padding and, when sampled, the 8px marker and its gap. */
	function drawnHeight(dots: number, sampled: boolean): number {
		return 16 + dots * 4 + (dots - 1) * 4 + (sampled ? 12 : 0);
	}

	/** The column must fit the rail with the 12px-per-edge clearance the handle keeps from the transcript. */
	function fits(dots: number, railHeight: number, sampled = true): boolean {
		return drawnHeight(dots, sampled) <= railHeight - 24;
	}

	test('draws one dot per prompt while they fit, sampling only past the fixed cap', () => {
		assert.deepStrictEqual([
			restDotCount(0, 800),
			restDotCount(1, 800),
			restDotCount(12, 800),
			restDotCount(50, 800),
			restDotCount(400, 800),
		], [0, 1, 12, 50, 50]);
	});

	test('samples down to what a short rail can hold, and stays inside it', () => {
		const counts = [restDotCount(40, 200), restDotCount(40, 120), restDotCount(40, 60)];
		assert.deepStrictEqual({
			counts,
			fits: counts.map((dots, i) => fits(dots, [200, 120, 60][i])),
		}, {
			counts: [19, 9, 2],
			// A rail too short for even the two-dot minimum is degenerate; the handle clips there (CSS).
			fits: [true, true, false],
		});
	});

	test('reserves room for the marker when the fixed cap forces sampling', () => {
		// 51 prompts in a 444px rail: all 51 dots would fit on their own, but MAX_REST_DOTS caps them at
		// 50, which makes the trailing marker appear — and 50 dots plus it need 424px of the 420px CSS
		// allows. The count must drop to leave the marker room.
		const dots = restDotCount(51, 444);
		assert.deepStrictEqual({
			dots,
			fits: fits(dots, 444),
			// A rail with room for all 50 plus the marker still draws all 50.
			roomy: restDotCount(51, 448),
		}, {
			dots: 49,
			fits: true,
			roomy: 50,
		});
	});

	test('falls back to the fixed cap when the rail has not been measured yet', () => {
		assert.deepStrictEqual([restDotCount(30, 0), restDotCount(400, 0)], [30, 50]);
	});
});
