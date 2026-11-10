/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { clamp } from '../../../../base/common/numbers.js';

/** Room kept between an automatically placed widget and the edges of the editor or other widgets. */
export const EDGE_MARGIN = 8;
/** Room kept between the commented code and a widget that is placed next to it. */
const CODE_GAP = 24;
export const MIN_WIDTH = 240;
export const MIN_HEIGHT = 64;
/** How much of the comments stays visible when the widget is as short as it can be. */
const MIN_COMMENTS_HEIGHT = 40;
const DEFAULT_MIN_WIDTH = 320;
const DEFAULT_MAX_WIDTH = 560;
const DEFAULT_WIDTH_RATIO = 0.4;
/**
 * How many of the lines next to a widget placed right after them may leave it no room after them, and so run under it,
 * so that a couple of long lines don't keep it from its code.
 */
const COVERABLE_LINES = 2;
/** The widest that a widget placed after the ends of the lines next to it is shown, so that its comments stay readable. */
const MAX_WIDTH_BESIDE_LINES = 640;
/** Portion of the editor height that a widget sizing itself to its content may take up. */
const AUTO_HEIGHT_RATIO = 0.6;

export interface IRect {
	readonly top: number;
	readonly left: number;
	readonly width: number;
	readonly height: number;
}

export interface IPoint {
	readonly x: number;
	readonly y: number;
}

export interface ISize {
	readonly width: number;
	readonly height: number;
}

export interface ISizeRange {
	readonly min: number;
	readonly max: number;
}

/**
 * Where a floating comment thread widget is placed and how large it is.
 */
export interface ICommentThreadFloatingWidgetLayout {
	/**
	 * Distance from the top of the first commented line to the top of the widget, or `undefined` when the
	 * widget is vertically centered on the commented code.
	 */
	readonly offsetTop: number | undefined;
	/** Distance from the left edge of the editor to the left edge of the widget. */
	readonly left: number;
	readonly width: number;
	/** The height chosen by the user, or `undefined` when the widget sizes itself to its content. */
	readonly height: number | undefined;
}

/**
 * Computes the line connecting the commented code to the anchor point of a widget. The code is given as the
 * areas of its lines. The line starts at the point of the code's outline that is closest to the anchor, and is
 * `undefined` when the anchor lies within the outline.
 */
export function getConnectorPoints(codeLines: readonly IRect[], anchor: IPoint): { from: IPoint; to: IPoint } | undefined {
	let from: IPoint | undefined;
	let fromDistance = Number.POSITIVE_INFINITY;
	for (const line of codeLines) {
		const point: IPoint = {
			x: clamp(anchor.x, line.left, line.left + line.width),
			y: clamp(anchor.y, line.top, line.top + line.height)
		};
		const distance = Math.hypot(anchor.x - point.x, anchor.y - point.y);
		if (distance < fromDistance) {
			from = point;
			fromDistance = distance;
		}
	}
	if (!from || fromDistance === 0) {
		return undefined;
	}
	return { from, to: anchor };
}

function roundCoordinate(value: number): number {
	return Math.round(value * 100) / 100;
}

function pointsEqual(a: IPoint, b: IPoint): boolean {
	return a.x === b.x && a.y === b.y;
}

/**
 * Computes an SVG path that outlines a stack of rows, such as the lines of some code, with rounded corners.
 * Each row must start where the previous one ends.
 */
export function getRowsOutlinePath(rows: readonly IRect[], cornerRadius: number): string {
	if (rows.length === 0) {
		return '';
	}

	// Go down the right side of the rows, then back up their left side.
	let corners: IPoint[] = [];
	for (const row of rows) {
		corners.push({ x: row.left + row.width, y: row.top }, { x: row.left + row.width, y: row.top + row.height });
	}
	for (let i = rows.length - 1; i >= 0; i--) {
		const row = rows[i];
		corners.push({ x: row.left, y: row.top + row.height }, { x: row.left, y: row.top });
	}
	corners = corners.map(point => ({ x: roundCoordinate(point.x), y: roundCoordinate(point.y) }));

	// Rows of the same width produce repeated points and points in the middle of straight edges.
	let removed = true;
	while (removed && corners.length > 2) {
		removed = false;
		for (let i = 0; i < corners.length && corners.length > 2; i++) {
			const previous = corners[(i + corners.length - 1) % corners.length];
			const current = corners[i];
			const next = corners[(i + 1) % corners.length];
			if (pointsEqual(current, next) || (previous.x === current.x && current.x === next.x) || (previous.y === current.y && current.y === next.y)) {
				corners.splice(i, 1);
				removed = true;
				i--;
			}
		}
	}

	const commands: string[] = [];
	for (let i = 0; i < corners.length; i++) {
		const previous = corners[(i + corners.length - 1) % corners.length];
		const current = corners[i];
		const next = corners[(i + 1) % corners.length];
		const radius = Math.min(cornerRadius, Math.hypot(current.x - previous.x, current.y - previous.y) / 2, Math.hypot(next.x - current.x, next.y - current.y) / 2);
		const command = i === 0 ? 'M' : 'L';
		if (radius <= 0) {
			commands.push(`${command} ${current.x} ${current.y}`);
			continue;
		}
		const towards = (target: IPoint): IPoint => {
			const length = Math.hypot(target.x - current.x, target.y - current.y);
			return {
				x: roundCoordinate(current.x + (target.x - current.x) / length * radius),
				y: roundCoordinate(current.y + (target.y - current.y) / length * radius)
			};
		};
		const start = towards(previous);
		const end = towards(next);
		commands.push(`${command} ${start.x} ${start.y} Q ${current.x} ${current.y} ${end.x} ${end.y}`);
	}
	commands.push('Z');
	return commands.join(' ');
}

/**
 * The top of a widget of the given height that is vertically centered on the given code, without going
 * above the start of the document.
 */
export function getCenteredTop(codeTop: number, codeBottom: number, height: number): number {
	return Math.max(0, (codeTop + codeBottom - height) / 2);
}

/**
 * The width a widget starts out with in an editor whose code area has the given width.
 */
export function getDefaultFloatingWidgetWidth(editorContentWidth: number, availableWidth: number): number {
	return Math.min(clamp(Math.round(editorContentWidth * DEFAULT_WIDTH_RATIO), DEFAULT_MIN_WIDTH, DEFAULT_MAX_WIDTH), availableWidth);
}

/**
 * The width of a widget that is placed right after the end of the code, level with its top, such as a new comment: the
 * preferred width, or as much of it as there is room for before the edge of the editor and the obstacles there.
 * `undefined` when there isn't room for a reasonably wide widget, or for the width that its content needs.
 * @param code The commented code, in document coordinates.
 * @param height The height of the widget.
 * @param maxRight The rightmost position the right edge of the widget may take.
 * @param obstacles The areas, in document coordinates, that the widget should not cover.
 */
export function getWidthBesideCode(code: IRect, height: number, preferredWidth: number, minWidth: number, maxRight: number, obstacles: readonly IRect[]): number | undefined {
	const left = code.left + code.width + CODE_GAP;
	let right = maxRight - EDGE_MARGIN;
	for (const obstacle of obstacles) {
		if (obstacle.left + obstacle.width > left && obstacle.top < code.top + height && code.top < obstacle.top + obstacle.height) {
			right = Math.min(right, obstacle.left - EDGE_MARGIN);
		}
	}
	const availableWidth = Math.floor(right - left);
	const neededWidth = Math.max(minWidth, Math.min(preferredWidth, DEFAULT_MIN_WIDTH));
	return availableWidth >= neededWidth ? Math.min(preferredWidth, availableWidth) : undefined;
}

/**
 * Where a widget goes right after the end of the lines next to it, and how wide it is.
 */
export interface IBesideLinesPlacement {
	/** Where the lines that the widget goes after end. */
	readonly linesRight: number;
	readonly width: number;
}

/**
 * Where a widget goes right after the end of the lines next to it, such as an existing comment, and how wide it is: as
 * wide as its content fills, up to a readable width and the room there is, and no narrower than its default width.
 * The widget goes after every line that leaves it room for its default width, rather than hiding it. It only hides a
 * couple of lines that leave it no room after them, and then keeps its default width, so that it hides no more of
 * them. `undefined` when more lines leave it no room, or when the code does.
 * @param lines Lines of the editor, of which those between `top` and `bottom` are next to the widget.
 * @param codeRight Where the commented code ends, which the widget never hides.
 * @param maxRight The rightmost position the right edge of the widget may take.
 */
export function getPlacementBesideLines(lines: readonly IRect[], top: number, bottom: number, codeRight: number, maxRight: number, defaultWidth: number, naturalWidth: number): IBesideLinesPlacement | undefined {
	// The widget has room for its default width after lines that end up to here.
	const maxLinesRight = maxRight - EDGE_MARGIN - CODE_GAP - defaultWidth;
	let linesRight = codeRight;
	let hiddenLines = 0;
	for (const line of lines) {
		if (line.top < bottom && top < line.top + line.height) {
			const right = line.left + line.width;
			if (right > maxLinesRight) {
				hiddenLines++;
			} else {
				linesRight = Math.max(linesRight, right);
			}
		}
	}
	if (hiddenLines > COVERABLE_LINES || linesRight > maxLinesRight) {
		return undefined;
	}
	const availableWidth = Math.floor(maxRight - EDGE_MARGIN - (linesRight + CODE_GAP));
	return { linesRight, width: hiddenLines ? defaultWidth : Math.max(defaultWidth, Math.min(naturalWidth, MAX_WIDTH_BESIDE_LINES, availableWidth)) };
}

/**
 * The scroll position that shows the commented code and the widget, all in document coordinates, or `undefined` when
 * no scrolling is needed. When they don't fit in the viewport together, the widget is shown in full, with as much of
 * the start of the code as fits.
 */
export function getRevealScrollTop(code: { top: number; bottom: number }, widget: { top: number; bottom: number }, scrollTop: number, viewportHeight: number): number | undefined {
	const top = Math.min(code.top, widget.top);
	const bottom = Math.max(code.bottom, widget.bottom);
	if (bottom - top <= viewportHeight) {
		const isInView = top >= scrollTop && bottom <= scrollTop + viewportHeight;
		return isInView ? undefined : Math.max(0, (top + bottom - viewportHeight) / 2);
	}
	if (widget.top >= scrollTop && widget.bottom <= scrollTop + viewportHeight) {
		return undefined;
	}
	// A widget that is taller than the viewport is shown from its top.
	return Math.max(0, clamp(code.top - EDGE_MARGIN, widget.bottom + EDGE_MARGIN - viewportHeight, widget.top - EDGE_MARGIN));
}

function rectsIntersect(a: IRect, b: IRect): boolean {
	return a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
}

export interface IFloatingWidgetPlacementRequest {
	/** The leftmost position the widget may take. */
	readonly minLeft: number;
	/** The rightmost position the right edge of the widget may take. */
	readonly maxRight: number;
	readonly width: number;
	readonly height: number;
	/** The commented code, in document coordinates, or `undefined` for comments on the whole file. */
	readonly code: IRect | undefined;
	/** The areas, in document coordinates, that the widget should not cover. */
	readonly obstacles: readonly IRect[];
	/** The height of the area that the editor can scroll through, which the widget is kept within. */
	readonly scrollableHeight: number;
	/**
	 * Places the widget right after the end of the code, level with its top, when there is room for it there, such as
	 * for a new comment. See {@link getWidthBesideCode}.
	 */
	readonly besideCode?: boolean;
	/**
	 * Where the lines next to the code end. The widget is placed right after them, vertically centered on the code,
	 * when there is room, rather than at the right edge of the editor. See {@link getPlacementBesideLines}.
	 */
	readonly linesRight?: number;
}

export interface IFloatingWidgetPlacement {
	readonly top: number;
	readonly left: number;
	/** Whether the widget is vertically centered on the code. */
	readonly centered: boolean;
}

/**
 * Places a widget at the right edge of the editor, vertically centered on the commented code. When requested and there
 * is room, the widget goes right after the end of the code, level with its top, or right after the end of the lines
 * next to the code instead. When the code leaves no room for the widget at the right edge, the widget goes below the
 * code, so that it doesn't cover it. When the widget would cover the code or one of the obstacles, it moves to the
 * closest position above or below them that is free, within the area that the editor can scroll through.
 */
export function computeFloatingWidgetPlacement(request: IFloatingWidgetPlacementRequest): IFloatingWidgetPlacement {
	const { minLeft, width, height, code } = request;
	const maxLeft = Math.max(minLeft, request.maxRight - EDGE_MARGIN - width);
	let left = maxLeft;
	let preferredTop = code ? getCenteredTop(code.top, code.top + code.height, height) : 0;
	let centered = true;
	const codeRight = code ? code.left + code.width : 0;
	if (code && request.besideCode && codeRight + CODE_GAP <= maxLeft) {
		left = Math.max(minLeft, codeRight + CODE_GAP);
		preferredTop = code.top;
		centered = false;
	} else if (code && codeRight + CODE_GAP > maxLeft) {
		left = clamp(code.left, minLeft, maxLeft);
		preferredTop = code.top + code.height + EDGE_MARGIN;
		centered = false;
	} else if (code && request.linesRight !== undefined) {
		left = clamp(Math.max(codeRight, request.linesRight) + CODE_GAP, minLeft, maxLeft);
	}

	// The free position closest to the preferred one is the preferred position, an edge of the scrollable area, or
	// just next to one of the areas to keep clear of.
	const maxTop = Math.max(0, request.scrollableHeight - EDGE_MARGIN - height);
	const areas = code ? [...request.obstacles, code] : request.obstacles;
	const candidates = [preferredTop, 0, maxTop];
	for (const area of areas) {
		candidates.push(area.top + area.height + EDGE_MARGIN, area.top - EDGE_MARGIN - height);
	}
	// When no position is free, the widget stays as close to the preferred position as it can.
	let top = clamp(preferredTop, 0, maxTop);
	let topDistance = Number.POSITIVE_INFINITY;
	for (const candidate of candidates) {
		const candidateTop = clamp(candidate, 0, maxTop);
		const distance = Math.abs(candidateTop - preferredTop);
		if (distance < topDistance && !areas.some(area => rectsIntersect({ top: candidateTop, left, width, height }, area))) {
			top = candidateTop;
			topDistance = distance;
		}
	}
	return { top, left, centered: centered && top === preferredTop };
}

/**
 * The widths that the content of a widget needs, which don't depend on the widget's width.
 */
export interface IFloatingWidgetContentWidths {
	/** The width that shows the thread's title actions, reply and additional actions in full. */
	readonly minimum: number;
	/** The width at which none of the content wraps or is cut off. */
	readonly natural: number;
}

/**
 * The heights of the content of a widget at its current width.
 */
export interface IFloatingWidgetContentHeights {
	/** The height of everything but the comments: the frame, title, reply and additional actions. */
	readonly fixed: number;
	/** The height of all of the comments. */
	readonly comments: number;
}

/**
 * Sizes a floating comment thread widget to its content, the size chosen by the user, and the size of the editor.
 *
 * The editor size is captured when the widget is shown, reset or resized by the user, so that resizing the editor
 * doesn't resize a widget that is shown. When the reply or additional actions below the comments grow, such as when
 * a reply is expanded, the widget grows down by as much, so that the reply stays in place. When that would take the
 * widget past the bottom of the editor, the widget moves up instead.
 */
export class FloatingWidgetSizeModel {

	private _editorSize: ISize = { width: 0, height: 0 };
	/** The fixed height of the content when the widget's size and placement were chosen. */
	private _fixedHeightBase: number | undefined;
	private _growth = 0;
	private _upwardShift = 0;

	/** The size of the editor that limits the widget's size. */
	get editorSize(): ISize {
		return this._editorSize;
	}

	/** How much the reply and additional actions have grown since the widget's size and placement were chosen. */
	get growthBelowComments(): number {
		return this._growth;
	}

	/** How far the widget is moved up to keep its grown reply and additional actions within the editor. */
	get upwardShift(): number {
		return this._upwardShift;
	}

	captureEditorSize(editorSize: ISize): void {
		this._editorSize = editorSize;
	}

	/**
	 * Lets the widget take up the editor's current size, without first shrinking to an editor that became smaller
	 * after the size was captured.
	 */
	growEditorSize(editorSize: ISize): void {
		this._editorSize = { width: Math.max(this._editorSize.width, editorSize.width), height: Math.max(this._editorSize.height, editorSize.height) };
	}

	/**
	 * Takes the reply and additional actions, as they are when the content is next measured, as the ones that the
	 * widget's size and placement are for.
	 */
	resetGrowth(): void {
		this._fixedHeightBase = undefined;
		this._growth = 0;
		this._upwardShift = 0;
	}

	/**
	 * Stops moving the widget up, such as when the user moves the widget, which includes the upward shift.
	 */
	clearUpwardShift(): void {
		this._upwardShift = 0;
	}

	/**
	 * Measures how much the reply and additional actions have grown, and returns whether that changed.
	 */
	updateGrowth(content: IFloatingWidgetContentHeights): boolean {
		this._fixedHeightBase ??= content.fixed;
		const growth = content.fixed - this._fixedHeightBase;
		const changed = growth !== this._growth;
		this._growth = growth;
		return changed;
	}

	/**
	 * The widths the widget can have: wide enough to show its title actions, reply and additional actions, and no
	 * wider than the editor.
	 */
	getWidthRange(content: IFloatingWidgetContentWidths): ISizeRange {
		const editorWidth = this._editorSize.width;
		return { min: Math.min(Math.max(MIN_WIDTH, content.minimum), editorWidth), max: editorWidth };
	}

	/**
	 * The width that the widget is shown at: the preferred width, but, unless a reply or comment is being written, no
	 * wider than its content can fill. The user can still make the widget wider.
	 */
	getDefaultWidth(content: IFloatingWidgetContentWidths, preferredWidth: number, isEditing: boolean): number {
		const range = this.getWidthRange(content);
		return clamp(isEditing ? preferredWidth : Math.min(preferredWidth, content.natural), range.min, range.max);
	}

	/**
	 * The heights the widget can have: tall enough to show its title, reply and additional actions with some of the
	 * comments, and no taller than its content or the editor.
	 */
	getHeightRange(content: IFloatingWidgetContentHeights): ISizeRange {
		const max = Math.min(content.fixed + content.comments, Math.max(MIN_HEIGHT, this._editorSize.height - 2 * EDGE_MARGIN));
		return { min: Math.min(content.fixed + Math.min(content.comments, MIN_COMMENTS_HEIGHT), max), max };
	}

	/**
	 * The tallest that the widget sizes itself to its content when the user didn't choose a height, unless its title,
	 * reply and additional actions alone are taller, and before they grow.
	 */
	get maxAutoHeight(): number {
		return Math.max(MIN_HEIGHT, Math.floor(this._editorSize.height * AUTO_HEIGHT_RATIO));
	}

	/**
	 * The height of the widget for the height chosen by the user, or for its content when the user didn't choose one.
	 * Growth of the reply and additional actions is added, rather than taken from the comments.
	 */
	getHeight(content: IFloatingWidgetContentHeights, chosenHeight: number | undefined): number {
		const range = this.getHeightRange(content);
		const height = chosenHeight !== undefined ? chosenHeight + this._growth : Math.min(range.max, this.maxAutoHeight + this._growth);
		return clamp(height, range.min, range.max);
	}

	/**
	 * The height that the comments get in a widget of the given height: the space that the rest of the content leaves.
	 * A widget that is too short for the rest of its content, such as in a short editor, scrolls as a whole, and still
	 * shows some of the comments.
	 */
	getCommentsHeight(content: IFloatingWidgetContentHeights, height: number): number {
		return Math.max(Math.min(content.comments, MIN_COMMENTS_HEIGHT), height - content.fixed);
	}

	/**
	 * The top of the widget in document coordinates. A centered widget stays centered as it was before its reply and
	 * additional actions grew, so that it grows down. The widget is kept within the area that the editor can scroll
	 * through, which the widget doesn't extend, so that the editor can always scroll to all of it.
	 * @param offsetTop The widget's distance from the top of the code, or `undefined` when it's centered on the code.
	 * @param code The vertical extent of the commented code in document coordinates.
	 * @param scrollableHeight The height of the area that the editor can scroll through.
	 */
	getTop(offsetTop: number | undefined, code: { top: number; bottom: number }, height: number, scrollableHeight: number): number {
		return clamp(this._getUnshiftedTop(offsetTop, code, height) - this._upwardShift, 0, Math.max(0, scrollableHeight - EDGE_MARGIN - height));
	}

	/**
	 * Moves the widget up as far as needed to show its grown reply and additional actions above the bottom of the
	 * viewport, without moving its top out of view. The widget isn't moved back down while they are grown, such as
	 * while a reply is being typed.
	 * @param scrollTop The document coordinate at the top of the viewport.
	 */
	updateUpwardShift(offsetTop: number | undefined, code: { top: number; bottom: number }, height: number, scrollTop: number, viewportHeight: number): void {
		if (this._growth <= 0) {
			this._upwardShift = 0;
			return;
		}
		const top = this._getUnshiftedTop(offsetTop, code, height) - scrollTop;
		if (top >= viewportHeight) {
			// The widget is out of view, so its reply isn't being shown.
			return;
		}
		const overflow = top + height - (viewportHeight - EDGE_MARGIN);
		const roomAbove = Math.max(0, top - EDGE_MARGIN);
		this._upwardShift = Math.max(this._upwardShift, clamp(overflow, 0, roomAbove));
	}

	private _getUnshiftedTop(offsetTop: number | undefined, code: { top: number; bottom: number }, height: number): number {
		return offsetTop !== undefined ? code.top + offsetTop : getCenteredTop(code.top, code.bottom, height - this._growth);
	}
}
