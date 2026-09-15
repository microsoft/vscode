/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const SESSION_CARD_GAP = 12;
export const SESSION_CARD_MIN_WIDTH = 320;
export const SESSION_CARD_MAX_COLUMNS = 3;

export interface ISessionCardLayoutItem {
	readonly id: string;
	readonly columnSpan: number;
	readonly height: number;
}

export interface ISessionCardPlacement extends ISessionCardLayoutItem {
	readonly left: number;
	readonly top: number;
	readonly width: number;
}

export interface ISessionCardLayout {
	readonly width: number;
	readonly height: number;
	readonly columns: number;
	readonly columnWidth: number;
	readonly cards: readonly ISessionCardPlacement[];
}

/** Packs cards without putting a later item above an earlier item. */
export function layoutSessionCards(items: readonly ISessionCardLayoutItem[], width: number): ISessionCardLayout {
	if (!Number.isFinite(width) || width < 0) { throw new Error('Invalid session card board width'); }
	const columns = Math.max(1, Math.min(SESSION_CARD_MAX_COLUMNS, Math.floor((width + SESSION_CARD_GAP) / (SESSION_CARD_MIN_WIDTH + SESSION_CARD_GAP))));
	const columnWidth = Math.max(0, (width - (columns - 1) * SESSION_CARD_GAP) / columns);
	const bottoms = Array<number>(columns).fill(0);
	const ids = new Set<string>();
	let previousTop = 0;
	const cards = items.map(item => {
		if (!item.id || ids.has(item.id) || !Number.isInteger(item.columnSpan) || item.columnSpan < 1 || item.columnSpan > SESSION_CARD_MAX_COLUMNS
			|| !Number.isFinite(item.height) || item.height <= 0) {
			throw new Error('Invalid session card layout item');
		}
		ids.add(item.id);
		const columnSpan = Math.min(columns, item.columnSpan);
		let column = 0;
		let top = Infinity;
		for (let start = 0; start <= columns - columnSpan; start++) {
			const candidate = Math.max(previousTop, ...bottoms.slice(start, start + columnSpan));
			if (candidate < top) { column = start; top = candidate; }
		}
		for (let index = column; index < column + columnSpan; index++) { bottoms[index] = top + item.height + SESSION_CARD_GAP; }
		previousTop = top;
		return { ...item, columnSpan, left: column * (columnWidth + SESSION_CARD_GAP), top, width: columnSpan * columnWidth + (columnSpan - 1) * SESSION_CARD_GAP };
	});
	return { width, columns, columnWidth, height: Math.max(0, ...bottoms) - (cards.length ? SESSION_CARD_GAP : 0), cards };
}

export function sessionCardSpanForWidth(width: number, layout: ISessionCardLayout): number {
	if (!Number.isFinite(width)) { throw new Error('Invalid session card width'); }
	return Math.max(1, Math.min(layout.columns, Math.round((width + SESSION_CARD_GAP) / (layout.columnWidth + SESSION_CARD_GAP))));
}

/** Returns an insertion index after excluding the dragged card. */
export function sessionCardDropIndex(layout: ISessionCardLayout, draggedId: string, x: number, y: number): number {
	if (!Number.isFinite(x) || !Number.isFinite(y) || !layout.cards.some(card => card.id === draggedId)) {
		throw new Error('Invalid session card drop');
	}
	const cards = layout.cards.filter(card => card.id !== draggedId);
	if (!cards.length || y < 0) { return 0; }
	if (y >= layout.height) { return cards.length; }
	let nearest = 0;
	let distance = Infinity;
	for (const [index, card] of cards.entries()) {
		const dx = Math.max(card.left - x, 0, x - card.left - card.width);
		const dy = Math.max(card.top - y, 0, y - card.top - card.height);
		const candidate = dx * dx + dy * dy;
		if (candidate < distance) { nearest = index; distance = candidate; }
	}
	const target = cards[nearest];
	const after = y > target.top + target.height || y >= target.top && x >= target.left + target.width / 2;
	return nearest + (after ? 1 : 0);
}

export function moveSessionCard(order: readonly string[], id: string, index: number): readonly string[] {
	if (!order.includes(id) || !Number.isInteger(index) || index < 0 || index >= order.length || new Set(order).size !== order.length) {
		throw new Error('Invalid session card order');
	}
	const next = order.filter(candidate => candidate !== id);
	next.splice(index, 0, id);
	return next;
}

export function visibleSessionCards(layout: ISessionCardLayout, top: number, height: number, overscan = 0): readonly string[] {
	if (![top, height, overscan].every(Number.isFinite) || height < 0 || overscan < 0) { throw new Error('Invalid session card viewport'); }
	if (!layout.width || !height) { return []; }
	return layout.cards.filter(card => card.top < top + height + overscan && card.top + card.height > top - overscan).map(card => card.id);
}
