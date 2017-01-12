/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Position } from 'vs/editor/common/core/position';
import { Range as EditorRange } from 'vs/editor/common/core/range';
import { EditorLayoutInfo, MouseTargetType } from 'vs/editor/common/editorCommon';
import { ClassNames, IMouseTarget, IViewZoneData } from 'vs/editor/browser/editorBrowser';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { IPointerHandlerHelper } from 'vs/editor/browser/controller/mouseHandler';
import { EditorMouseEvent, PageCoordinates, ClientCoordinates, EditorPagePosition } from 'vs/editor/browser/editorDom';
import * as browser from 'vs/base/browser/browser';
import { IViewCursorRenderData } from 'vs/editor/browser/viewParts/viewCursors/viewCursor';
import { PartFingerprint, PartFingerprints } from 'vs/editor/browser/view/viewPart';
import { IViewModel } from 'vs/editor/common/viewModel/viewModel';
import { VisibleRange } from 'vs/editor/common/view/renderingContext';

interface IETextRange {
	boundingHeight: number;
	boundingLeft: number;
	boundingTop: number;
	boundingWidth: number;
	htmlText: string;
	offsetLeft: number;
	offsetTop: number;
	text: string;
	collapse(start?: boolean): void;
	compareEndPoints(how: string, sourceRange: IETextRange): number;
	duplicate(): IETextRange;
	execCommand(cmdID: string, showUI?: boolean, value?: any): boolean;
	execCommandShowHelp(cmdID: string): boolean;
	expand(Unit: string): boolean;
	findText(string: string, count?: number, flags?: number): boolean;
	getBookmark(): string;
	getBoundingClientRect(): ClientRect;
	getClientRects(): ClientRectList;
	inRange(range: IETextRange): boolean;
	isEqual(range: IETextRange): boolean;
	move(unit: string, count?: number): number;
	moveEnd(unit: string, count?: number): number;
	moveStart(unit: string, count?: number): number;
	moveToBookmark(bookmark: string): boolean;
	moveToElementText(element: Element): void;
	moveToPoint(x: number, y: number): void;
	parentElement(): Element;
	pasteHTML(html: string): void;
	queryCommandEnabled(cmdID: string): boolean;
	queryCommandIndeterm(cmdID: string): boolean;
	queryCommandState(cmdID: string): boolean;
	queryCommandSupported(cmdID: string): boolean;
	queryCommandText(cmdID: string): string;
	queryCommandValue(cmdID: string): any;
	scrollIntoView(fStart?: boolean): void;
	select(): void;
	setEndPoint(how: string, SourceRange: IETextRange): void;
}

declare var IETextRange: {
	prototype: IETextRange;
	new (): IETextRange;
};

interface IHitTestResult {
	position: Position;
	hitTarget: Element;
}

class MouseTarget implements IMouseTarget {

	public readonly element: Element;
	public readonly type: MouseTargetType;
	public readonly mouseColumn: number;
	public readonly position: Position;
	public readonly range: EditorRange;
	public readonly detail: any;

	constructor(element: Element, type: MouseTargetType, mouseColumn: number = 0, position: Position = null, range: EditorRange = null, detail: any = null) {
		this.element = element;
		this.type = type;
		this.mouseColumn = mouseColumn;
		this.position = position;
		if (!range && position) {
			range = new EditorRange(position.lineNumber, position.column, position.lineNumber, position.column);
		}
		this.range = range;
		this.detail = detail;
	}

	private _typeToString(): string {
		if (this.type === MouseTargetType.TEXTAREA) {
			return 'TEXTAREA';
		}
		if (this.type === MouseTargetType.GUTTER_GLYPH_MARGIN) {
			return 'GUTTER_GLYPH_MARGIN';
		}
		if (this.type === MouseTargetType.GUTTER_LINE_NUMBERS) {
			return 'GUTTER_LINE_NUMBERS';
		}
		if (this.type === MouseTargetType.GUTTER_LINE_DECORATIONS) {
			return 'GUTTER_LINE_DECORATIONS';
		}
		if (this.type === MouseTargetType.GUTTER_VIEW_ZONE) {
			return 'GUTTER_VIEW_ZONE';
		}
		if (this.type === MouseTargetType.CONTENT_TEXT) {
			return 'CONTENT_TEXT';
		}
		if (this.type === MouseTargetType.CONTENT_EMPTY) {
			return 'CONTENT_EMPTY';
		}
		if (this.type === MouseTargetType.CONTENT_VIEW_ZONE) {
			return 'CONTENT_VIEW_ZONE';
		}
		if (this.type === MouseTargetType.CONTENT_WIDGET) {
			return 'CONTENT_WIDGET';
		}
		if (this.type === MouseTargetType.OVERVIEW_RULER) {
			return 'OVERVIEW_RULER';
		}
		if (this.type === MouseTargetType.SCROLLBAR) {
			return 'SCROLLBAR';
		}
		if (this.type === MouseTargetType.OVERLAY_WIDGET) {
			return 'OVERLAY_WIDGET';
		}
		return 'UNKNOWN';
	}

	public toString(): string {
		return this._typeToString() + ': ' + this.position + ' - ' + this.range + ' - ' + this.detail;
	}
}

class ElementPath {
	public static isTextAreaCover(path: Uint8Array): boolean {
		return (
			path.length === 2
			&& path[0] === PartFingerprint.OverflowGuard
			&& path[1] === PartFingerprint.TextAreaCover
		);
	}

	public static isTextArea(path: Uint8Array): boolean {
		return (
			path.length === 2
			&& path[0] === PartFingerprint.OverflowGuard
			&& path[1] === PartFingerprint.TextArea
		);
	}

	public static isViewLines(path: Uint8Array): boolean {
		return (
			path.length === 4
			&& path[0] === PartFingerprint.OverflowGuard
			&& path[3] === PartFingerprint.ViewLines
		);
	}

	public static isChildOfViewLines(path: Uint8Array): boolean {
		return (
			path.length >= 4
			&& path[0] === PartFingerprint.OverflowGuard
			&& path[3] === PartFingerprint.ViewLines
		);
	}

	public static isCursorsLayer(path: Uint8Array): boolean {
		return (
			path.length === 4
			&& path[0] === PartFingerprint.OverflowGuard
			&& path[3] === PartFingerprint.ViewCursorsLayer
		);
	}

	public static isChildOfScrollableElement(path: Uint8Array): boolean {
		return (
			path.length >= 2
			&& path[0] === PartFingerprint.OverflowGuard
			&& path[1] === PartFingerprint.ScrollableElement
		);
	}

	public static isChildOfContentWidgets(path: Uint8Array): boolean {
		return (
			path.length >= 4
			&& path[0] === PartFingerprint.OverflowGuard
			&& path[3] === PartFingerprint.ContentWidgets
		);
	}

	public static isChildOfOverflowingContentWidgets(path: Uint8Array): boolean {
		return (
			path.length >= 1
			&& path[0] === PartFingerprint.OverflowingContentWidgets
		);
	}

	public static isChildOfOverlayWidgets(path: Uint8Array): boolean {
		return (
			path.length >= 2
			&& path[0] === PartFingerprint.OverflowGuard
			&& path[1] === PartFingerprint.OverlayWidgets
		);
	}

	public static isChildOfMargin(path: Uint8Array): boolean {
		return (
			path.length >= 2
			&& path[0] === PartFingerprint.OverflowGuard
			&& path[1] === PartFingerprint.Margin
		);
	}

	public static isChildOfViewZones(path: Uint8Array): boolean {
		return (
			path.length >= 4
			&& path[0] === PartFingerprint.OverflowGuard
			&& path[3] === PartFingerprint.ViewZones
		);
	}

	public static isOverviewRuler(path: Uint8Array): boolean {
		return (
			path.length === 3
			&& path[0] === PartFingerprint.OverflowGuard
			&& path[2] === PartFingerprint.OverviewRuler
		);
	}
}

class HitTestContext {

	public readonly model: IViewModel;
	public readonly layoutInfo: EditorLayoutInfo;
	public readonly viewDomNode: HTMLElement;
	public readonly lineHeight: number;

	private readonly _context: ViewContext;
	private readonly _viewHelper: IPointerHandlerHelper;

	constructor(context: ViewContext, viewHelper: IPointerHandlerHelper, layoutInfo: EditorLayoutInfo) {
		this.model = context.model;
		this.layoutInfo = layoutInfo;
		this.viewDomNode = viewHelper.viewDomNode;
		this.lineHeight = context.configuration.editor.lineHeight;
		this._context = context;
		this._viewHelper = viewHelper;
	}

	public getZoneAtCoord(mouseVerticalOffset: number): IViewZoneData {
		// The target is either a view zone or the empty space after the last view-line
		let viewZoneWhitespace = this._viewHelper.getWhitespaceAtVerticalOffset(mouseVerticalOffset);

		if (viewZoneWhitespace) {
			let viewZoneMiddle = viewZoneWhitespace.verticalOffset + viewZoneWhitespace.height / 2,
				lineCount = this._context.model.getLineCount(),
				positionBefore: Position = null,
				position: Position,
				positionAfter: Position = null;

			if (viewZoneWhitespace.afterLineNumber !== lineCount) {
				// There are more lines after this view zone
				positionAfter = new Position(viewZoneWhitespace.afterLineNumber + 1, 1);
			}
			if (viewZoneWhitespace.afterLineNumber > 0) {
				// There are more lines above this view zone
				positionBefore = new Position(viewZoneWhitespace.afterLineNumber, this._context.model.getLineMaxColumn(viewZoneWhitespace.afterLineNumber));
			}

			if (positionAfter === null) {
				position = positionBefore;
			} else if (positionBefore === null) {
				position = positionAfter;
			} else if (mouseVerticalOffset < viewZoneMiddle) {
				position = positionBefore;
			} else {
				position = positionAfter;
			}

			return {
				viewZoneId: viewZoneWhitespace.id,
				afterLineNumber: viewZoneWhitespace.afterLineNumber,
				positionBefore: positionBefore,
				positionAfter: positionAfter,
				position: position
			};
		}
		return null;
	}

	public getFullLineRangeAtCoord(mouseVerticalOffset: number): { range: EditorRange; isAfterLines: boolean; } {
		if (this._viewHelper.isAfterLines(mouseVerticalOffset)) {
			// Below the last line
			let lineNumber = this._context.model.getLineCount();
			let maxLineColumn = this._context.model.getLineMaxColumn(lineNumber);
			return {
				range: new EditorRange(lineNumber, maxLineColumn, lineNumber, maxLineColumn),
				isAfterLines: true
			};
		}

		let lineNumber = this._viewHelper.getLineNumberAtVerticalOffset(mouseVerticalOffset);
		let maxLineColumn = this._context.model.getLineMaxColumn(lineNumber);
		return {
			range: new EditorRange(lineNumber, 1, lineNumber, maxLineColumn),
			isAfterLines: false
		};
	}

	public getLineNumberAtVerticalOffset(mouseVerticalOffset: number): number {
		return this._viewHelper.getLineNumberAtVerticalOffset(mouseVerticalOffset);
	}

	public getVerticalOffsetForLineNumber(lineNumber: number): number {
		return this._viewHelper.getVerticalOffsetForLineNumber(lineNumber);
	}

	public findAttribute(element: Element, attr: string): string {
		return HitTestContext._findAttribute(element, attr, this._viewHelper.viewDomNode);
	}

	private static _findAttribute(element: Element, attr: string, stopAt: Element): string {
		while (element && element !== document.body) {
			if (element.hasAttribute && element.hasAttribute(attr)) {
				return element.getAttribute(attr);
			}
			if (element === stopAt) {
				return null;
			}
			element = <Element>element.parentNode;
		}
		return null;
	}

	public getLineWidth(lineNumber: number): number {
		return this._viewHelper.getLineWidth(lineNumber);
	}

	public visibleRangeForPosition2(lineNumber: number, column: number) {
		return this._viewHelper.visibleRangeForPosition2(lineNumber, column);
	}

	public getPositionFromDOMInfo(spanNode: HTMLElement, offset: number): Position {
		return this._viewHelper.getPositionFromDOMInfo(spanNode, offset);
	}
}

export interface ISimplifiedEditorMouseEvent {
	readonly page: PageCoordinates;
	readonly editorPos: EditorPagePosition;
	readonly target: HTMLElement;
}

export class MouseTargetFactory {

	private _context: ViewContext;
	private _viewHelper: IPointerHandlerHelper;

	constructor(context: ViewContext, viewHelper: IPointerHandlerHelper) {
		this._context = context;
		this._viewHelper = viewHelper;
	}

	public mouseTargetIsWidget(e: EditorMouseEvent): boolean {
		let t = <Element>e.target;
		let path = PartFingerprints.collect(t, this._viewHelper.viewDomNode);

		// Is it a content widget?
		if (ElementPath.isChildOfContentWidgets(path) || ElementPath.isChildOfOverflowingContentWidgets(path)) {
			return true;
		}

		// Is it an overlay widget?
		if (ElementPath.isChildOfOverlayWidgets(path)) {
			return true;
		}

		return false;
	}

	public createMouseTarget(layoutInfo: EditorLayoutInfo, lastViewCursorsRenderData: IViewCursorRenderData[], e: ISimplifiedEditorMouseEvent, testEventTarget: boolean): IMouseTarget {
		const ctx = new HitTestContext(this._context, this._viewHelper, layoutInfo);
		try {
			let r = this._unsafeCreateMouseTarget(ctx, layoutInfo, lastViewCursorsRenderData, e, testEventTarget);
			// console.log(r.toString());
			return r;
		} catch (e) {
			return MouseTargetFactory.createMouseTargetFromUnknownTarget(ctx, e.target);
		}
	}

	private _unsafeCreateMouseTarget(ctx: HitTestContext, layoutInfo: EditorLayoutInfo, lastViewCursorsRenderData: IViewCursorRenderData[], e: ISimplifiedEditorMouseEvent, testEventTarget: boolean): IMouseTarget {

		let mouseVerticalOffset = Math.max(0, this._viewHelper.getScrollTop() + e.page.y - e.editorPos.y);
		let mouseContentHorizontalOffset = this._viewHelper.getScrollLeft() + e.page.x - e.editorPos.x - layoutInfo.contentLeft;
		let mouseColumn = this._getMouseColumn(mouseContentHorizontalOffset);

		let t = <Element>e.target;

		// Edge has a bug when hit-testing the exact position of a cursor,
		// instead of returning the correct dom node, it returns the
		// first or last rendered view line dom node, therefore help it out
		// and first check if we are on top of a cursor
		for (let i = 0, len = lastViewCursorsRenderData.length; i < len; i++) {
			let d = lastViewCursorsRenderData[i];

			if (
				d.contentLeft <= mouseContentHorizontalOffset
				&& mouseContentHorizontalOffset <= d.contentLeft + d.width
				&& d.contentTop <= mouseVerticalOffset
				&& mouseVerticalOffset <= d.contentTop + d.height
			) {
				return MouseTargetFactory.createMouseTargetFromViewCursor(t, d.position.lineNumber, d.position.column, mouseColumn);
			}
		}

		let path = PartFingerprints.collect(t, this._viewHelper.viewDomNode);

		// Is it a content widget?
		if (ElementPath.isChildOfContentWidgets(path) || ElementPath.isChildOfOverflowingContentWidgets(path)) {
			return MouseTargetFactory.createMouseTargetFromContentWidgetsChild(ctx, t, mouseColumn);
		}

		// Is it an overlay widget?
		if (ElementPath.isChildOfOverlayWidgets(path)) {
			return MouseTargetFactory.createMouseTargetFromOverlayWidgetsChild(ctx, t, mouseColumn);
		}

		// Is it a cursor ?
		let lineNumberAttribute = t.hasAttribute && t.hasAttribute('lineNumber') ? t.getAttribute('lineNumber') : null;
		let columnAttribute = t.hasAttribute && t.hasAttribute('column') ? t.getAttribute('column') : null;
		if (lineNumberAttribute && columnAttribute) {
			return MouseTargetFactory.createMouseTargetFromViewCursor(t, parseInt(lineNumberAttribute, 10), parseInt(columnAttribute, 10), mouseColumn);
		}

		// Is it the textarea cover?
		if (ElementPath.isTextAreaCover(path)) {
			if (this._context.configuration.editor.viewInfo.glyphMargin) {
				return MouseTargetFactory.createMouseTargetFromGlyphMargin(ctx, t, mouseVerticalOffset, mouseColumn);
			} else if (this._context.configuration.editor.viewInfo.renderLineNumbers) {
				return MouseTargetFactory.createMouseTargetFromLineNumbers(ctx, t, mouseVerticalOffset, mouseColumn);
			} else {
				return MouseTargetFactory.createMouseTargetFromLinesDecorationsChild(ctx, t, mouseVerticalOffset, mouseColumn);
			}
		}

		// Is it the textarea?
		if (ElementPath.isTextArea(path)) {
			return new MouseTarget(t, MouseTargetType.TEXTAREA);
		}

		// Is it a view zone?
		if (ElementPath.isChildOfViewZones(path)) {
			// Check if it is at a view zone
			let viewZoneData = ctx.getZoneAtCoord(mouseVerticalOffset);
			if (viewZoneData) {
				return new MouseTarget(t, MouseTargetType.CONTENT_VIEW_ZONE, mouseColumn, viewZoneData.position, null, viewZoneData);
			}
			return MouseTargetFactory.createMouseTargetFromUnknownTarget(ctx, t);
		}

		// Is it the view lines container?
		if (ElementPath.isViewLines(path)) {
			// Sometimes, IE returns this target when right clicking on top of text
			// -> See Bug #12990: [F12] Context menu shows incorrect position while doing a resize

			// Check if it is below any lines and any view zones
			if (this._viewHelper.isAfterLines(mouseVerticalOffset)) {
				return MouseTargetFactory.createMouseTargetFromViewLines(ctx, t, mouseVerticalOffset, mouseColumn);
			}

			// Check if it is at a view zone
			let viewZoneData = ctx.getZoneAtCoord(mouseVerticalOffset);
			if (viewZoneData) {
				return new MouseTarget(t, MouseTargetType.CONTENT_VIEW_ZONE, mouseColumn, viewZoneData.position, null, viewZoneData);
			}

			// Check if it hits a position
			let hitTestResult = MouseTargetFactory._doHitTest(ctx, e, mouseVerticalOffset);
			if (hitTestResult.position) {
				return MouseTargetFactory.createMouseTargetFromHitTestPosition(ctx, t, hitTestResult.position.lineNumber, hitTestResult.position.column, mouseContentHorizontalOffset, mouseColumn);
			}

			// Fall back to view lines
			return MouseTargetFactory.createMouseTargetFromViewLines(ctx, t, mouseVerticalOffset, mouseColumn);
		}

		// Is it a child of the view lines container?
		if (!testEventTarget || ElementPath.isChildOfViewLines(path)) {
			let hitTestResult = MouseTargetFactory._doHitTest(ctx, e, mouseVerticalOffset);
			if (hitTestResult.position) {
				return MouseTargetFactory.createMouseTargetFromHitTestPosition(ctx, t, hitTestResult.position.lineNumber, hitTestResult.position.column, mouseContentHorizontalOffset, mouseColumn);
			} else if (hitTestResult.hitTarget) {
				t = hitTestResult.hitTarget;
				path = PartFingerprints.collect(t, this._viewHelper.viewDomNode);

				// TODO@Alex: try again with this different target, but guard against recursion.
				// Is it a cursor ?
				let lineNumberAttribute = t.hasAttribute && t.hasAttribute('lineNumber') ? t.getAttribute('lineNumber') : null;
				let columnAttribute = t.hasAttribute && t.hasAttribute('column') ? t.getAttribute('column') : null;
				if (lineNumberAttribute && columnAttribute) {
					return MouseTargetFactory.createMouseTargetFromViewCursor(t, parseInt(lineNumberAttribute, 10), parseInt(columnAttribute, 10), mouseColumn);
				}
			} else {
				// Hit testing completely failed...
				let possibleLineNumber = this._viewHelper.getLineNumberAtVerticalOffset(mouseVerticalOffset);
				let maxColumn = this._context.model.getLineMaxColumn(possibleLineNumber);
				return new MouseTarget(t, MouseTargetType.CONTENT_EMPTY, mouseColumn, new Position(possibleLineNumber, maxColumn));
			}
		}

		// Is it the cursors layer?
		if (ElementPath.isCursorsLayer(path)) {
			return new MouseTarget(t, MouseTargetType.UNKNOWN);
		}

		// Is it a child of the scrollable element?
		if (ElementPath.isChildOfScrollableElement(path)) {
			return MouseTargetFactory.createMouseTargetFromScrollbar(ctx, t, mouseVerticalOffset, mouseColumn);
		}

		if (ElementPath.isChildOfMargin(path)) {
			let offset = Math.abs(e.page.x - e.editorPos.x);

			if (offset <= ctx.layoutInfo.glyphMarginWidth) {
				// On the glyph margin
				return MouseTargetFactory.createMouseTargetFromGlyphMargin(ctx, t, mouseVerticalOffset, mouseColumn);
			}
			offset -= ctx.layoutInfo.glyphMarginWidth;

			if (offset <= ctx.layoutInfo.lineNumbersWidth) {
				// On the line numbers
				return MouseTargetFactory.createMouseTargetFromLineNumbers(ctx, t, mouseVerticalOffset, mouseColumn);
			}
			offset -= ctx.layoutInfo.lineNumbersWidth;

			// On the line decorations
			return MouseTargetFactory.createMouseTargetFromLinesDecorationsChild(ctx, t, mouseVerticalOffset, mouseColumn);
		}

		if (ElementPath.isOverviewRuler(path)) {
			return MouseTargetFactory.createMouseTargetFromScrollbar(ctx, t, mouseVerticalOffset, mouseColumn);
		}

		return MouseTargetFactory.createMouseTargetFromUnknownTarget(ctx, t);
	}

	/**
	 * Most probably WebKit browsers and Edge
	 */
	private static _doHitTestWithCaretRangeFromPoint(ctx: HitTestContext, e: ISimplifiedEditorMouseEvent, mouseVerticalOffset: number): IHitTestResult {

		// In Chrome, especially on Linux it is possible to click between lines,
		// so try to adjust the `hity` below so that it lands in the center of a line
		let lineNumber = ctx.getLineNumberAtVerticalOffset(mouseVerticalOffset);
		let lineVerticalOffset = ctx.getVerticalOffsetForLineNumber(lineNumber);
		let lineCenteredVerticalOffset = lineVerticalOffset + Math.floor(ctx.lineHeight / 2);
		let adjustedPageY = e.page.y + (lineCenteredVerticalOffset - mouseVerticalOffset);

		if (adjustedPageY <= e.editorPos.y) {
			adjustedPageY = e.editorPos.y + 1;
		}
		if (adjustedPageY >= e.editorPos.y + ctx.layoutInfo.height) {
			adjustedPageY = e.editorPos.y + ctx.layoutInfo.height - 1;
		}

		let adjustedPage = new PageCoordinates(e.page.x, adjustedPageY);

		let r = this._actualDoHitTestWithCaretRangeFromPoint(ctx, adjustedPage.toClientCoordinates());
		if (r.position) {
			return r;
		}

		// Also try to hit test without the adjustment (for the edge cases that we are near the top or bottom)
		return this._actualDoHitTestWithCaretRangeFromPoint(ctx, e.page.toClientCoordinates());
	}

	private static _actualDoHitTestWithCaretRangeFromPoint(ctx: HitTestContext, coords: ClientCoordinates): IHitTestResult {

		let range: Range = document.caretRangeFromPoint(coords.clientX, coords.clientY);

		if (!range || !range.startContainer) {
			return {
				position: null,
				hitTarget: null
			};
		}

		// Chrome always hits a TEXT_NODE, while Edge sometimes hits a token span
		let startContainer = range.startContainer;
		let hitTarget: HTMLElement;

		if (startContainer.nodeType === startContainer.TEXT_NODE) {
			// startContainer is expected to be the token text
			let parent1 = startContainer.parentNode; // expected to be the token span
			let parent2 = parent1 ? parent1.parentNode : null; // expected to be the view line container span
			let parent3 = parent2 ? parent2.parentNode : null; // expected to be the view line div
			let parent3ClassName = parent3 && parent3.nodeType === parent3.ELEMENT_NODE ? (<HTMLElement>parent3).className : null;

			if (parent3ClassName === ClassNames.VIEW_LINE) {
				let p = ctx.getPositionFromDOMInfo(<HTMLElement>parent1, range.startOffset);
				return {
					position: p,
					hitTarget: null
				};
			} else {
				hitTarget = <HTMLElement>startContainer.parentNode;
			}
		} else if (startContainer.nodeType === startContainer.ELEMENT_NODE) {
			// startContainer is expected to be the token span
			let parent1 = startContainer.parentNode; // expected to be the view line container span
			let parent2 = parent1 ? parent1.parentNode : null; // expected to be the view line div
			let parent2ClassName = parent2 && parent2.nodeType === parent2.ELEMENT_NODE ? (<HTMLElement>parent2).className : null;

			if (parent2ClassName === ClassNames.VIEW_LINE) {
				let p = ctx.getPositionFromDOMInfo(<HTMLElement>startContainer, (<HTMLElement>startContainer).textContent.length);
				return {
					position: p,
					hitTarget: null
				};
			} else {
				hitTarget = <HTMLElement>startContainer;
			}
		}

		return {
			position: null,
			hitTarget: hitTarget
		};
	}

	/**
	 * Most probably Gecko
	 */
	private static _doHitTestWithCaretPositionFromPoint(ctx: HitTestContext, coords: ClientCoordinates): IHitTestResult {
		let hitResult: { offsetNode: Node; offset: number; } = (<any>document).caretPositionFromPoint(coords.clientX, coords.clientY);

		let range = document.createRange();
		range.setStart(hitResult.offsetNode, hitResult.offset);
		range.collapse(true);
		let resultPosition = ctx.getPositionFromDOMInfo(<HTMLElement>range.startContainer.parentNode, range.startOffset);
		range.detach();

		return {
			position: resultPosition,
			hitTarget: null
		};
	}

	/**
	 * Most probably IE
	 */
	private static _doHitTestWithMoveToPoint(ctx: HitTestContext, coords: ClientCoordinates): IHitTestResult {
		let resultPosition: Position = null;
		let resultHitTarget: Element = null;

		let textRange: IETextRange = (<any>document.body).createTextRange();
		try {
			textRange.moveToPoint(coords.clientX, coords.clientY);
		} catch (err) {
			return {
				position: null,
				hitTarget: null
			};
		}

		textRange.collapse(true);

		// Now, let's do our best to figure out what we hit :)
		let parentElement = textRange ? textRange.parentElement() : null;
		let parent1 = parentElement ? parentElement.parentNode : null;
		let parent2 = parent1 ? parent1.parentNode : null;

		let parent2ClassName = parent2 && parent2.nodeType === parent2.ELEMENT_NODE ? (<HTMLElement>parent2).className : '';

		if (parent2ClassName === ClassNames.VIEW_LINE) {
			let rangeToContainEntireSpan = textRange.duplicate();
			rangeToContainEntireSpan.moveToElementText(parentElement);
			rangeToContainEntireSpan.setEndPoint('EndToStart', textRange);

			resultPosition = ctx.getPositionFromDOMInfo(<HTMLElement>parentElement, rangeToContainEntireSpan.text.length);
			// Move range out of the span node, IE doesn't like having many ranges in
			// the same spot and will act badly for lines containing dashes ('-')
			rangeToContainEntireSpan.moveToElementText(ctx.viewDomNode);
		} else {
			// Looks like we've hit the hover or something foreign
			resultHitTarget = parentElement;
		}

		// Move range out of the span node, IE doesn't like having many ranges in
		// the same spot and will act badly for lines containing dashes ('-')
		textRange.moveToElementText(ctx.viewDomNode);

		return {
			position: resultPosition,
			hitTarget: resultHitTarget
		};
	}

	private static _doHitTest(ctx: HitTestContext, e: ISimplifiedEditorMouseEvent, mouseVerticalOffset: number): IHitTestResult {
		// State of the art (18.10.2012):
		// The spec says browsers should support document.caretPositionFromPoint, but nobody implemented it (http://dev.w3.org/csswg/cssom-view/)
		// Gecko:
		//    - they tried to implement it once, but failed: https://bugzilla.mozilla.org/show_bug.cgi?id=654352
		//    - however, they do give out rangeParent/rangeOffset properties on mouse events
		// Webkit:
		//    - they have implemented a previous version of the spec which was using document.caretRangeFromPoint
		// IE:
		//    - they have a proprietary method on ranges, moveToPoint: https://msdn.microsoft.com/en-us/library/ie/ms536632(v=vs.85).aspx

		// 24.08.2016: Edge has added WebKit's document.caretRangeFromPoint, but it is quite buggy
		//    - when hit testing the cursor it returns the first or the last line in the viewport
		//    - it inconsistently hits text nodes or span nodes, while WebKit only hits text nodes
		//    - when toggling render whitespace on, and hit testing in the empty content after a line, it always hits offset 0 of the first span of the line

		// Thank you browsers for making this so 'easy' :)

		if (document.caretRangeFromPoint) {

			return this._doHitTestWithCaretRangeFromPoint(ctx, e, mouseVerticalOffset);

		} else if ((<any>document).caretPositionFromPoint) {

			return this._doHitTestWithCaretPositionFromPoint(ctx, e.page.toClientCoordinates());

		} else if ((<any>document.body).createTextRange) {

			return this._doHitTestWithMoveToPoint(ctx, e.page.toClientCoordinates());

		}

		return {
			position: null,
			hitTarget: null
		};
	}

	public getMouseColumn(layoutInfo: EditorLayoutInfo, e: ISimplifiedEditorMouseEvent): number {
		let mouseContentHorizontalOffset = this._viewHelper.getScrollLeft() + e.page.x - e.editorPos.x - layoutInfo.contentLeft;
		return this._getMouseColumn(mouseContentHorizontalOffset);
	}

	private _getMouseColumn(mouseContentHorizontalOffset: number): number {
		if (mouseContentHorizontalOffset < 0) {
			return 1;
		}
		let charWidth = this._context.configuration.editor.fontInfo.typicalHalfwidthCharacterWidth;
		let chars = Math.round(mouseContentHorizontalOffset / charWidth);
		return (chars + 1);
	}

	private static createMouseTargetFromViewCursor(target: Element, lineNumber: number, column: number, mouseColumn: number): MouseTarget {
		return new MouseTarget(target, MouseTargetType.CONTENT_TEXT, mouseColumn, new Position(lineNumber, column));
	}

	private static createMouseTargetFromViewLines(ctx: HitTestContext, target: Element, mouseVerticalOffset: number, mouseColumn: number): MouseTarget {
		// This most likely indicates it happened after the last view-line
		let lineCount = ctx.model.getLineCount();
		let maxLineColumn = ctx.model.getLineMaxColumn(lineCount);
		return new MouseTarget(target, MouseTargetType.CONTENT_EMPTY, mouseColumn, new Position(lineCount, maxLineColumn));
	}

	private static createMouseTargetFromHitTestPosition(ctx: HitTestContext, target: Element, lineNumber: number, column: number, mouseHorizontalOffset: number, mouseColumn: number): MouseTarget {
		let pos = new Position(lineNumber, column);

		let lineWidth = ctx.getLineWidth(lineNumber);

		if (mouseHorizontalOffset > lineWidth) {
			if (browser.isEdge && pos.column === 1) {
				// See https://github.com/Microsoft/vscode/issues/10875
				return new MouseTarget(target, MouseTargetType.CONTENT_EMPTY, mouseColumn, new Position(lineNumber, ctx.model.getLineMaxColumn(lineNumber)));
			}
			return new MouseTarget(target, MouseTargetType.CONTENT_EMPTY, mouseColumn, pos);
		}

		let visibleRange = ctx.visibleRangeForPosition2(lineNumber, column);

		if (!visibleRange) {
			return new MouseTarget(target, MouseTargetType.UNKNOWN, mouseColumn, pos);
		}

		let columnHorizontalOffset = visibleRange.left;

		if (mouseHorizontalOffset === columnHorizontalOffset) {
			return new MouseTarget(target, MouseTargetType.CONTENT_TEXT, mouseColumn, pos);
		}

		let mouseIsBetween: boolean;
		if (column > 1) {
			let prevColumnHorizontalOffset = visibleRange.left;
			mouseIsBetween = false;
			mouseIsBetween = mouseIsBetween || (prevColumnHorizontalOffset < mouseHorizontalOffset && mouseHorizontalOffset < columnHorizontalOffset); // LTR case
			mouseIsBetween = mouseIsBetween || (columnHorizontalOffset < mouseHorizontalOffset && mouseHorizontalOffset < prevColumnHorizontalOffset); // RTL case
			if (mouseIsBetween) {
				let rng = new EditorRange(lineNumber, column, lineNumber, column - 1);
				return new MouseTarget(target, MouseTargetType.CONTENT_TEXT, mouseColumn, pos, rng);
			}
		}

		let lineMaxColumn = ctx.model.getLineMaxColumn(lineNumber);
		if (column < lineMaxColumn) {
			let nextColumnVisibleRange = ctx.visibleRangeForPosition2(lineNumber, column + 1);
			if (nextColumnVisibleRange) {
				let nextColumnHorizontalOffset = nextColumnVisibleRange.left;
				mouseIsBetween = false;
				mouseIsBetween = mouseIsBetween || (columnHorizontalOffset < mouseHorizontalOffset && mouseHorizontalOffset < nextColumnHorizontalOffset); // LTR case
				mouseIsBetween = mouseIsBetween || (nextColumnHorizontalOffset < mouseHorizontalOffset && mouseHorizontalOffset < columnHorizontalOffset); // RTL case
				if (mouseIsBetween) {
					let rng = new EditorRange(lineNumber, column, lineNumber, column + 1);
					return new MouseTarget(target, MouseTargetType.CONTENT_TEXT, mouseColumn, pos, rng);
				}
			}
		}

		return new MouseTarget(target, MouseTargetType.CONTENT_TEXT, mouseColumn, pos);
	}

	private static createMouseTargetFromContentWidgetsChild(ctx: HitTestContext, target: Element, mouseColumn: number): MouseTarget {
		let widgetId = ctx.findAttribute(target, 'widgetId');

		if (widgetId) {
			return new MouseTarget(target, MouseTargetType.CONTENT_WIDGET, mouseColumn, null, null, widgetId);
		} else {
			return new MouseTarget(target, MouseTargetType.UNKNOWN);
		}
	}

	private static createMouseTargetFromOverlayWidgetsChild(ctx: HitTestContext, target: Element, mouseColumn: number): MouseTarget {
		let widgetId = ctx.findAttribute(target, 'widgetId');

		if (widgetId) {
			return new MouseTarget(target, MouseTargetType.OVERLAY_WIDGET, mouseColumn, null, null, widgetId);
		} else {
			return new MouseTarget(target, MouseTargetType.UNKNOWN);
		}
	}

	private static createMouseTargetFromLinesDecorationsChild(ctx: HitTestContext, target: Element, mouseVerticalOffset: number, mouseColumn: number): MouseTarget {
		let viewZoneData = ctx.getZoneAtCoord(mouseVerticalOffset);
		if (viewZoneData) {
			return new MouseTarget(target, MouseTargetType.GUTTER_VIEW_ZONE, mouseColumn, viewZoneData.position, null, viewZoneData);
		}

		let res = ctx.getFullLineRangeAtCoord(mouseVerticalOffset);
		return new MouseTarget(target, MouseTargetType.GUTTER_LINE_DECORATIONS, mouseColumn, new Position(res.range.startLineNumber, res.range.startColumn), res.range, res.isAfterLines);
	}

	private static createMouseTargetFromLineNumbers(ctx: HitTestContext, target: Element, mouseVerticalOffset: number, mouseColumn: number): MouseTarget {
		let viewZoneData = ctx.getZoneAtCoord(mouseVerticalOffset);
		if (viewZoneData) {
			return new MouseTarget(target, MouseTargetType.GUTTER_VIEW_ZONE, mouseColumn, viewZoneData.position, null, viewZoneData);
		}

		let res = ctx.getFullLineRangeAtCoord(mouseVerticalOffset);
		return new MouseTarget(target, MouseTargetType.GUTTER_LINE_NUMBERS, mouseColumn, new Position(res.range.startLineNumber, res.range.startColumn), res.range, res.isAfterLines);
	}

	private static createMouseTargetFromGlyphMargin(ctx: HitTestContext, target: Element, mouseVerticalOffset: number, mouseColumn: number): MouseTarget {
		let viewZoneData = ctx.getZoneAtCoord(mouseVerticalOffset);
		if (viewZoneData) {
			return new MouseTarget(target, MouseTargetType.GUTTER_VIEW_ZONE, mouseColumn, viewZoneData.position, null, viewZoneData);
		}

		let res = ctx.getFullLineRangeAtCoord(mouseVerticalOffset);
		return new MouseTarget(target, MouseTargetType.GUTTER_GLYPH_MARGIN, mouseColumn, new Position(res.range.startLineNumber, res.range.startColumn), res.range, res.isAfterLines);
	}

	private static createMouseTargetFromScrollbar(ctx: HitTestContext, target: Element, mouseVerticalOffset: number, mouseColumn: number): MouseTarget {
		let possibleLineNumber = ctx.getLineNumberAtVerticalOffset(mouseVerticalOffset);
		let maxColumn = ctx.model.getLineMaxColumn(possibleLineNumber);
		return new MouseTarget(target, MouseTargetType.SCROLLBAR, mouseColumn, new Position(possibleLineNumber, maxColumn));
	}

	private static createMouseTargetFromUnknownTarget(ctx: HitTestContext, target: Element): MouseTarget {
		let widgetId = ctx.findAttribute(target, 'widgetId');

		if (widgetId) {
			return new MouseTarget(target, MouseTargetType.OVERLAY_WIDGET, 0, null, null, widgetId);
		} else {
			return new MouseTarget(target, MouseTargetType.UNKNOWN);
		}
	}
}