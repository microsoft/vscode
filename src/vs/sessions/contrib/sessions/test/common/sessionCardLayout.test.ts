/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { layoutSessionCards, moveSessionCard, sessionCardDropIndex, sessionCardSpanForWidth, visibleSessionCards } from '../../common/sessionCardLayout.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('Session card layout', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const cards = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => ({ id, columnSpan: 1, height: 112 }));

	test('six compact cards occupy two rows of three, not six full-width rows', () => {
		const layout = layoutSessionCards(cards, 984);
		assert.deepStrictEqual({
			columns: layout.columns, height: layout.height,
			cards: layout.cards.map(({ left, top, width, height }) => ({ left, top, width, height })),
		}, {
			columns: 3, height: 236,
			cards: [0, 1, 2, 3, 4, 5].map(index => ({ left: index % 3 * 332, top: Math.floor(index / 3) * 124, width: 320, height: 112 })),
		});
	});

	test('a wider, taller card gives its neighbors the remaining column', () => {
		const layout = layoutSessionCards([{ ...cards[0], columnSpan: 2, height: 360 }, ...cards.slice(1)], 984);
		assert.deepStrictEqual(layout.cards.map(({ id, left, top, width }) => ({ id, left, top, width })), [
			{ id: 'a', left: 0, top: 0, width: 652 },
			{ id: 'b', left: 664, top: 0, width: 320 },
			{ id: 'c', left: 664, top: 124, width: 320 },
			{ id: 'd', left: 664, top: 248, width: 320 },
			{ id: 'e', left: 0, top: 372, width: 320 },
			{ id: 'f', left: 332, top: 372, width: 320 },
		]);
	});

	test('responsive spans clamp without overwriting the saved intent', () => {
		const items = [{ id: 'a', columnSpan: 3, height: 240 }];
		assert.deepStrictEqual([280, 652, 984].map(width => {
			const layout = layoutSessionCards(items, width);
			return { columns: layout.columns, span: layout.cards[0].columnSpan, width: layout.cards[0].width };
		}), [{ columns: 1, span: 1, width: 280 }, { columns: 2, span: 2, width: 652 }, { columns: 3, span: 3, width: 984 }]);
		assert.strictEqual(items[0].columnSpan, 3);
	});

	test('uneven heights preserve reading order and never overlap', () => {
		const layout = layoutSessionCards(cards.map((card, index) => ({ ...card, height: index % 2 ? 112 : 350 })), 984);
		assert.ok(layout.cards.every((card, index) => (index === 0 || card.top >= layout.cards[index - 1].top)
			&& layout.cards.slice(index + 1).every(other => card.left + card.width <= other.left || other.left + other.width <= card.left
				|| card.top + card.height <= other.top || other.top + other.height <= card.top)));
	});

	test('width previews snap to whole columns', () => {
		const layout = layoutSessionCards(cards, 984);
		assert.deepStrictEqual([200, 320, 520, 652, 950, 1400].map(width => sessionCardSpanForWidth(width, layout)), [1, 1, 2, 2, 3, 3]);
	});

	test('drop positions support before, after, another row, and the end', () => {
		const layout = layoutSessionCards(cards, 984);
		assert.deepStrictEqual([[350, 40], [600, 40], [0, 150], [400, 300]].map(([x, y]) => {
			const index = sessionCardDropIndex(layout, 'a', x, y);
			return moveSessionCard(cards.map(card => card.id), 'a', index);
		}), [
			['a', 'b', 'c', 'd', 'e', 'f'],
			['b', 'a', 'c', 'd', 'e', 'f'],
			['b', 'c', 'a', 'd', 'e', 'f'],
			['b', 'c', 'd', 'e', 'f', 'a'],
		]);
	});

	test('viewport selection excludes touching bounds and never mounts a hidden viewport', () => {
		const layout = layoutSessionCards(cards, 984);
		assert.deepStrictEqual({
			first: visibleSessionCards(layout, 0, 112),
			second: visibleSessionCards(layout, 124, 112),
			overscan: visibleSessionCards(layout, 0, 112, 16),
			hidden: visibleSessionCards(layout, 0, 0),
		}, { first: ['a', 'b', 'c'], second: ['d', 'e', 'f'], overscan: ['a', 'b', 'c', 'd', 'e', 'f'], hidden: [] });
	});

	test('invalid state is rejected rather than persisted as a plausible layout', () => {
		assert.throws(() => layoutSessionCards([...cards, cards[0]], 984));
		assert.throws(() => layoutSessionCards([{ ...cards[0], height: NaN }], 984));
		assert.throws(() => layoutSessionCards(cards, -1));
		assert.throws(() => moveSessionCard(['a', 'b'], 'missing', 1));
	});
});
