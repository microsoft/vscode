/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPointerHandlerHelper } from 'vs/editor/browser/controller/mouseHandler';
import { IMouseTargetContentEmptyData, IMouseTargetMarginData, IMouseTarget, IMouseTargetContentEmpty, IMouseTargetContentText, IMouseTargetContentWidget, IMouseTargetMargin, IMouseTargetOutsideEditor, IMouseTargetOverlayWidget, IMouseTargetScrollbar, IMouseTargetTextarea, IMouseTargetUnknown, IMouseTargetViewZone, IMouseTargetContentTextData, IMouseTargetViewZoneData, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { ClientCoordinates, EditorMouseEvent, EditorPagePosition, PageCoordinates, CoordinatesRelativeToEditor } from 'vs/editor/browser/editorDom';
import { PartFingerprint, PartFingerprints } from 'vs/editor/browser/view/viewPart';
import { ViewLine } from 'vs/editor/browser/viewParts/lines/viewLine';
import { IViewCursorRenderData } from 'vs/editor/browser/viewParts/viewCursors/viewCursor';
import { EditorLayoutInfo, EditorOption } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { Range as EditorRange } from 'vs/editor/common/core/range';
import { HorizontalPosition } from 'vs/editor/browser/view/renderingContext';
import { ViewContext } from 'vs/editor/common/viewModel/viewContext';
import { IViewModel } from 'vs/editor/common/viewModel';
import { CursorColumns } from 'vs/editor/common/core/cursorColumns';
import * as dom from 'vs/base/browser/dom';
import { AtomicTabMoveOperations, Direction } from 'vs/editor/common/cursor/cursorAtomicMoveOperations';
import { PositionAffinity } from 'vs/editor/common/model';
import { InjectedText } from 'vs/editor/common/modelLineProjectionData';
import { Mutable } from 'vs/base/common/types';
import { Lazy } from 'vs/base/common/lazy';

const enum HitTestResultType {
	Unknown,
	Content,
}

class UnknownHitTestResult {
	readonly type = HitTestResultType.Unknown;
	constructor(
		readonly hitTarget: HTMLElement | null = null
	) { }
}

class ContentHitTestResult {
	readonly type = HitTestResultType.Content;

	get hitTarget(): HTMLElement { return this.spanNode; }

	constructor(
		readonly position: Position,
		readonly spanNode: HTMLElement,
		readonly injectedText: InjectedText | null,
	) { }
}

type HitTestResult = UnknownHitTestResult | ContentHitTestResult;

namespace HitTestResult {
	export function createFromDOMInfo(ctx: HitTestContext, spanNode: HTMLElement, offset: number): HitTestResult {
		const position = ctx.getPositionFromDOMInfo(spanNode, offset);
		if (position) {
			return new ContentHitTestResult(position, spanNode, null);
		}
		return new UnknownHitTestResult(spanNode);
	}
}

export class PointerHandlerLastRenderData {
	constructor(
		public readonly lastViewCursorsRenderData: IViewCursorRenderData[],
		public readonly lastTextareaPosition: Position | null
	) { }
}

export class MouseTarget {

	private static _deduceRage(position: Position): EditorRange;
	private static _deduceRage(position: Position, range: EditorRange | null): EditorRange;
	private static _deduceRage(position: Position | null): EditorRange | null;
	private static _deduceRage(position: Position | null, range: EditorRange | null = null): EditorRange | null {
		if (!range && position) {
			return new EditorRange(position.lineNumber, position.column, position.lineNumber, position.column);
		}
		return range ?? null;
	}
	public static createUnknown(element: HTMLElement | null, mouseColumn: number, position: Position | null): IMouseTargetUnknown {
		return { type: MouseTargetType.UNKNOWN, element, mouseColumn, position, range: this._deduceRage(position) };
	}
	public static createTextarea(element: HTMLElement | null, mouseColumn: number): IMouseTargetTextarea {
		return { type: MouseTargetType.TEXTAREA, element, mouseColumn, position: null, range: null };
	}
	public static createMargin(type: MouseTargetType.GUTTER_GLYPH_MARGIN | MouseTargetType.GUTTER_LINE_NUMBERS | MouseTargetType.GUTTER_LINE_DECORATIONS, element: HTMLElement | null, mouseColumn: number, position: Position, range: EditorRange, detail: IMouseTargetMarginData): IMouseTargetMargin {
		return { type, element, mouseColumn, position, range, detail };
	}
	public static createViewZone(type: MouseTargetType.GUTTER_VIEW_ZONE | MouseTargetType.CONTENT_VIEW_ZONE, element: HTMLElement | null, mouseColumn: number, position: Position, detail: IMouseTargetViewZoneData): IMouseTargetViewZone {
		return { type, element, mouseColumn, position, range: this._deduceRage(position), detail };
	}
	public static createContentText(element: HTMLElement | null, mouseColumn: number, position: Position, range: EditorRange | null, detail: IMouseTargetContentTextData): IMouseTargetContentText {
		return { type: MouseTargetType.CONTENT_TEXT, element, mouseColumn, position, range: this._deduceRage(position, range), detail };
	}
	public static createContentEmpty(element: HTMLElement | null, mouseColumn: number, position: Position, detail: IMouseTargetContentEmptyData): IMouseTargetContentEmpty {
		return { type: MouseTargetType.CONTENT_EMPTY, element, mouseColumn, position, range: this._deduceRage(position), detail };
	}
	public static createContentWidget(element: HTMLElement | null, mouseColumn: number, detail: string): IMouseTargetContentWidget {
		return { type: MouseTargetType.CONTENT_WIDGET, element, mouseColumn, position: null, range: null, detail };
	}
	public static createScrollbar(element: HTMLElement | null, mouseColumn: number, position: Position): IMouseTargetScrollbar {
		return { type: MouseTargetType.SCROLLBAR, element, mouseColumn, position, range: this._deduceRage(position) };
	}
	public static createOverlayWidget(element: HTMLElement | null, mouseColumn: number, detail: string): IMouseTargetOverlayWidget {
		return { type: MouseTargetType.OVERLAY_WIDGET, element, mouseColumn, position: null, range: null, detail };
	}
	public static createOutsideEditor(mouseColumn: number, position: Position, outsidePosition: 'above' | 'below' | 'left' | 'right', outsideDistance: number): IMouseTargetOutsideEditor {
		return { type: MouseTargetType.OUTSIDE_EDITOR, element: null, mouseColumn, position, range: this._deduceRage(position), outsidePosition, outsideDistance };
	}

	private static _typeToString(type: MouseTargetType): string {
		if (type === MouseTargetType.TEXTAREA) {
			return 'TEXTAREA';
		}
		if (type === MouseTargetType.GUTTER_GLYPH_MARGIN) {
			return 'GUTTER_GLYPH_MARGIN';
		}
		if (type === MouseTargetType.GUTTER_LINE_NUMBERS) {
			return 'GUTTER_LINE_NUMBERS';
		}
		if (type === MouseTargetType.GUTTER_LINE_DECORATIONS) {
			return 'GUTTER_LINE_DECORATIONS';
		}
		if (type === MouseTargetType.GUTTER_VIEW_ZONE) {
			return 'GUTTER_VIEW_ZONE';
		}
		if (type === MouseTargetType.CONTENT_TEXT) {
			return 'CONTENT_TEXT';
		}
		if (type === MouseTargetType.CONTENT_EMPTY) {
			return 'CONTENT_EMPTY';
		}
		if (type === MouseTargetType.CONTENT_VIEW_ZONE) {
			return 'CONTENT_VIEW_ZONE';
		}
		if (type === MouseTargetType.CONTENT_WIDGET) {
			return 'CONTENT_WIDGET';
		}
		if (type === MouseTargetType.OVERVIEW_RULER) {
			return 'OVERVIEW_RULER';
		}
		if (type === MouseTargetType.SCROLLBAR) {
			return 'SCROLLBAR';
		}
		if (type === MouseTargetType.OVERLAY_WIDGET) {
			return 'OVERLAY_WIDGET';
		}
		return 'UNKNOWN';
	}

	public static toString(target: IMouseTarget): string {
		return this._typeToString(target.type) + ': ' + target.position + ' - ' + target.range + ' - ' + JSON.stringify((<any>target).detail);
	}
}

class ElementPath {

	public static isTextArea(path: Uint8Array): boolean {
		return (
			path.length === 2
			&& path[0] === PartFingerprint.OverflowGuard
			&& path[1] === PartFingerprint.TextArea
		);
	}

	public static isChildOfViewLines(path: Uint8Array): boolean {
		return (
			path.length >= 4
			&& path[0] === PartFingerprint.OverflowGuard
			&& path[3] === PartFingerprint.ViewLines
		);
	}

	public static isStrictChildOfViewLines(path: Uint8Array): boolean {
		return (
			path.length > 4
			&& path[0] === PartFingerprint.OverflowGuard
			&& path[3] === PartFingerprint.ViewLines
		);
	}

	public static isChildOfScrollableElement(path: Uint8Array): boolean {
		return (
			path.length >= 2
			&& path[0] === PartFingerprint.OverflowGuard
			&& path[1] === PartFingerprint.ScrollableElement
		);
	}

	public static isChildOfMinimap(path: Uint8Array): boolean {
		return (
			path.length >= 2
			&& path[0] === PartFingerprint.OverflowGuard
			&& path[1] === PartFingerprint.Minimap
		);
	}

	public static isChildOfContentWidgets(path: Uint8Array): boolean {
		return (
			path.length >= 4
			&& path[0] === PartFingerprint.OverflowGuard
			&& path[3] === PartFingerprint.ContentWidgets
		);
	}

	public static isChildOfOverflowGuard(path: Uint8Array): boolean {
		return (
			path.length >= 1
			&& path[0] === PartFingerprint.OverflowGuard
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

	public static isChildOfOverflowingOverlayWidgets(path: Uint8Array): boolean {
		return (
			path.length >= 1
			&& path[0] === PartFingerprint.OverflowingOverlayWidgets
		);
	}
}

export class HitTestContext {

	public readonly viewModel: IViewModel;
	public readonly layoutInfo: EditorLayoutInfo;
	public readonly viewDomNode: HTMLElement;
	public readonly overflowWidgetsDomNode: HTMLElement | null;
	public readonly lineHeight: number;
	public readonly stickyTabStops: boolean;
	public readonly typicalHalfwidthCharacterWidth: number;
	public readonly lastRenderData: PointerHandlerLastRenderData;

	private readonly _context: ViewContext;
	private readonly _viewHelper: IPointerHandlerHelper;

	constructor(context: ViewContext, viewHelper: IPointerHandlerHelper, lastRenderData: PointerHandlerLastRenderData) {
		this.viewModel = context.viewModel;
		const options = context.configuration.options;
		this.layoutInfo = options.get(EditorOption.layoutInfo);
		this.viewDomNode = viewHelper.viewDomNode;
		this.overflowWidgetsDomNode = viewHelper.overflowWidgetsDomNode ?? null;
		this.lineHeight = options.get(EditorOption.lineHeight);
		this.stickyTabStops = options.get(EditorOption.stickyTabStops);
		this.typicalHalfwidthCharacterWidth = options.get(EditorOption.fontInfo).typicalHalfwidthCharacterWidth;
		this.lastRenderData = lastRenderData;
		this._context = context;
		this._viewHelper = viewHelper;
	}

	public getZoneAtCoord(mouseVerticalOffset: number): IMouseTargetViewZoneData | null {
		return HitTestContext.getZoneAtCoord(this._context, mouseVerticalOffset);
	}

	public static getZoneAtCoord(context: ViewContext, mouseVerticalOffset: number): IMouseTargetViewZoneData | null {
		// The target is either a view zone or the empty space after the last view-line
		const viewZoneWhitespace = context.viewLayout.getWhitespaceAtVerticalOffset(mouseVerticalOffset);

		if (viewZoneWhitespace) {
			const viewZoneMiddle = viewZoneWhitespace.verticalOffset + viewZoneWhitespace.height / 2;
			const lineCount = context.viewModel.getLineCount();
			let positionBefore: Position | null = null;
			let position: Position | null;
			let positionAfter: Position | null = null;

			if (viewZoneWhitespace.afterLineNumber !== lineCount) {
				// There are more lines after this view zone
				positionAfter = new Position(viewZoneWhitespace.afterLineNumber + 1, 1);
			}
			if (viewZoneWhitespace.afterLineNumber > 0) {
				// There are more lines above this view zone
				positionBefore = new Position(viewZoneWhitespace.afterLineNumber, context.viewModel.getLineMaxColumn(viewZoneWhitespace.afterLineNumber));
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
				position: position!
			};
		}
		return null;
	}

	public getFullLineRangeAtCoord(mouseVerticalOffset: number): { range: EditorRange; isAfterLines: boolean } {
		if (this._context.viewLayout.isAfterLines(mouseVerticalOffset)) {
			// Below the last line
			const lineNumber = this._context.viewModel.getLineCount();
			const maxLineColumn = this._context.viewModel.getLineMaxColumn(lineNumber);
			return {
				range: new EditorRange(lineNumber, maxLineColumn, lineNumber, maxLineColumn),
				isAfterLines: true
			};
		}

		const lineNumber = this._context.viewLayout.getLineNumberAtVerticalOffset(mouseVerticalOffset);
		const maxLineColumn = this._context.viewModel.getLineMaxColumn(lineNumber);
		return {
			range: new EditorRange(lineNumber, 1, lineNumber, maxLineColumn),
			isAfterLines: false
		};
	}

	public getLineNumberAtVerticalOffset(mouseVerticalOffset: number): number {
		return this._context.viewLayout.getLineNumberAtVerticalOffset(mouseVerticalOffset);
	}

	public isAfterLines(mouseVerticalOffset: number): boolean {
		return this._context.viewLayout.isAfterLines(mouseVerticalOffset);
	}

	public isInTopPadding(mouseVerticalOffset: number): boolean {
		return this._context.viewLayout.isInTopPadding(mouseVerticalOffset);
	}

	public isInBottomPadding(mouseVerticalOffset: number): boolean {
		return this._context.viewLayout.isInBottomPadding(mouseVerticalOffset);
	}

	public getVerticalOffsetForLineNumber(lineNumber: number): number {
		return this._context.viewLayout.getVerticalOffsetForLineNumber(lineNumber);
	}

	public findAttribute(element: Element, attr: string): string | null {
		return HitTestContext._findAttribute(element, attr, this._viewHelper.viewDomNode);
	}

	private static _findAttribute(element: Element, attr: string, stopAt: Element): string | null {
		while (element && element !== element.ownerDocument.body) {
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

	public visibleRangeForPosition(lineNumber: number, column: number): HorizontalPosition | null {
		return this._viewHelper.visibleRangeForPosition(lineNumber, column);
	}

	public getPositionFromDOMInfo(spanNode: HTMLElement, offset: number): Position | null {
		return this._viewHelper.getPositionFromDOMInfo(spanNode, offset);
	}

	public getCurrentScrollTop(): number {
		return this._context.viewLayout.getCurrentScrollTop();
	}

	public getCurrentScrollLeft(): number {
		return this._context.viewLayout.getCurrentScrollLeft();
	}
}

abstract class BareHitTestRequest {

	public readonly editorPos: EditorPagePosition;
	public readonly pos: PageCoordinates;
	public readonly relativePos: CoordinatesRelativeToEditor;
	public readonly mouseVerticalOffset: number;
	public readonly isInMarginArea: boolean;
	public readonly isInContentArea: boolean;
	public readonly mouseContentHorizontalOffset: number;

	protected readonly mouseColumn: number;

	constructor(ctx: HitTestContext, editorPos: EditorPagePosition, pos: PageCoordinates, relativePos: CoordinatesRelativeToEditor) {
		this.editorPos = editorPos;
		this.pos = pos;
		this.relativePos = relativePos;

		this.mouseVerticalOffset = Math.max(0, ctx.getCurrentScrollTop() + this.relativePos.y);
		this.mouseContentHorizontalOffset = ctx.getCurrentScrollLeft() + this.relativePos.x - ctx.layoutInfo.contentLeft;
		this.isInMarginArea = (this.relativePos.x < ctx.layoutInfo.contentLeft && this.relativePos.x >= ctx.layoutInfo.glyphMarginLeft);
		this.isInContentArea = !this.isInMarginArea;
		this.mouseColumn = Math.max(0, MouseTargetFactory._getMouseColumn(this.mouseContentHorizontalOffset, ctx.typicalHalfwidthCharacterWidth));
	}
}

class HitTestRequest extends BareHitTestRequest {
	private readonly _ctx: HitTestContext;
	private readonly _eventTarget: HTMLElement | null;
	public readonly hitTestResult = new Lazy(() => MouseTargetFactory.doHitTest(this._ctx, this));
	private _useHitTestTarget: boolean;
	private _targetPathCacheElement: HTMLElement | null = null;
	private _targetPathCacheValue: Uint8Array = new Uint8Array(0);
	private _targetElement: HTMLElement | null = null;

	public get target(): HTMLElement | null {
		if (this._useHitTestTarget) {
			return this.hitTestResult.value.hitTarget;
		}
		return this._eventTarget;
	}

	public get targetPath(): Uint8Array {
		if (this._targetPathCacheElement !== this.target && this._targetElement) {
			this._targetPathCacheElement = this.target;
			this._targetPathCacheValue = PartFingerprints.collect(this.target, this._targetElement);
		}
		return this._targetPathCacheValue;
	}

	constructor(ctx: HitTestContext, editorPos: EditorPagePosition, pos: PageCoordinates, relativePos: CoordinatesRelativeToEditor, eventTarget: HTMLElement | null, targetElement: HTMLElement | null = null) {
		super(ctx, editorPos, pos, relativePos);
		this._ctx = ctx;
		this._eventTarget = eventTarget;
		this._targetElement = targetElement;

		// If no event target is passed in, we will use the hit test target
		const hasEventTarget = Boolean(this._eventTarget);
		this._useHitTestTarget = !hasEventTarget;
	}

	public override toString(): string {
		return `pos(${this.pos.x},${this.pos.y}), editorPos(${this.editorPos.x},${this.editorPos.y}), relativePos(${this.relativePos.x},${this.relativePos.y}), mouseVerticalOffset: ${this.mouseVerticalOffset}, mouseContentHorizontalOffset: ${this.mouseContentHorizontalOffset}\n\ttarget: ${this.target ? (<HTMLElement>this.target).outerHTML : null}`;
	}

	public get wouldBenefitFromHitTestTargetSwitch(): boolean {
		return (
			!this._useHitTestTarget
			&& this.hitTestResult.value.hitTarget !== null
			&& this.target !== this.hitTestResult.value.hitTarget
		);
	}

	public switchToHitTestTarget(): void {
		this._useHitTestTarget = true;
	}

	private _getMouseColumn(position: Position | null = null): number {
		if (position && position.column < this._ctx.viewModel.getLineMaxColumn(position.lineNumber)) {
			// Most likely, the line contains foreign decorations...
			return CursorColumns.visibleColumnFromColumn(this._ctx.viewModel.getLineContent(position.lineNumber), position.column, this._ctx.viewModel.model.getOptions().tabSize) + 1;
		}
		return this.mouseColumn;
	}

	public fulfillUnknown(position: Position | null = null): IMouseTargetUnknown {
		return MouseTarget.createUnknown(this.target, this._getMouseColumn(position), position);
	}
	public fulfillTextarea(): IMouseTargetTextarea {
		return MouseTarget.createTextarea(this.target, this._getMouseColumn());
	}
	public fulfillMargin(type: MouseTargetType.GUTTER_GLYPH_MARGIN | MouseTargetType.GUTTER_LINE_NUMBERS | MouseTargetType.GUTTER_LINE_DECORATIONS, position: Position, range: EditorRange, detail: IMouseTargetMarginData): IMouseTargetMargin {
		return MouseTarget.createMargin(type, this.target, this._getMouseColumn(position), position, range, detail);
	}
	public fulfillViewZone(type: MouseTargetType.GUTTER_VIEW_ZONE | MouseTargetType.CONTENT_VIEW_ZONE, position: Position, detail: IMouseTargetViewZoneData): IMouseTargetViewZone {
		return MouseTarget.createViewZone(type, this.target, this._getMouseColumn(position), position, detail);
	}
	public fulfillContentText(position: Position, range: EditorRange | null, detail: IMouseTargetContentTextData): IMouseTargetContentText {
		return MouseTarget.createContentText(this.target, this._getMouseColumn(position), position, range, detail);
	}
	public fulfillContentEmpty(position: Position, detail: IMouseTargetContentEmptyData): IMouseTargetContentEmpty {
		return MouseTarget.createContentEmpty(this.target, this._getMouseColumn(position), position, detail);
	}
	public fulfillContentWidget(detail: string): IMouseTargetContentWidget {
		return MouseTarget.createContentWidget(this.target, this._getMouseColumn(), detail);
	}
	public fulfillScrollbar(position: Position): IMouseTargetScrollbar {
		return MouseTarget.createScrollbar(this.target, this._getMouseColumn(position), position);
	}
	public fulfillOverlayWidget(detail: string): IMouseTargetOverlayWidget {
		return MouseTarget.createOverlayWidget(this.target, this._getMouseColumn(), detail);
	}
}

interface ResolvedHitTestRequest extends HitTestRequest {
	readonly target: HTMLElement;
}

const EMPTY_CONTENT_AFTER_LINES: IMouseTargetContentEmptyData = { isAfterLines: true };

function createEmptyContentDataInLines(horizontalDistanceToText: number): IMouseTargetContentEmptyData {
	return {
		isAfterLines: false,
		horizontalDistanceToText: horizontalDistanceToText
	};
}

export class MouseTargetFactory {

	private readonly _context: ViewContext;
	private readonly _viewHelper: IPointerHandlerHelper;

	constructor(context: ViewContext, viewHelper: IPointerHandlerHelper) {
		this._context = context;
		this._viewHelper = viewHelper;
	}

	public mouseTargetIsWidget(e: EditorMouseEvent): boolean {
		const t = <Element>e.target;
		const path = PartFingerprints.collect(t, this._viewHelper.viewDomNode);

		// Is it a content widget?
		if (ElementPath.isChildOfContentWidgets(path) || ElementPath.isChildOfOverflowingContentWidgets(path)) {
			return true;
		}

		// Is it an overlay widget?
		if (ElementPath.isChildOfOverlayWidgets(path) || ElementPath.isChildOfOverflowingOverlayWidgets(path)) {
			return true;
		}

		return false;
	}

	public createMouseTargetForView(lastRenderData: PointerHandlerLastRenderData, editorPos: EditorPagePosition, pos: PageCoordinates, relativePos: CoordinatesRelativeToEditor, target: HTMLElement | null): IMouseTarget {
		const ctx = new HitTestContext(this._context, this._viewHelper, lastRenderData);
		const request = new HitTestRequest(ctx, editorPos, pos, relativePos, target, ctx.viewDomNode);
		try {
			const r = MouseTargetFactory._createMouseTarget(ctx, request);

			if (r.type === MouseTargetType.CONTENT_TEXT) {
				// Snap to the nearest soft tab boundary if atomic soft tabs are enabled.
				if (ctx.stickyTabStops && r.position !== null) {
					const position = MouseTargetFactory._snapToSoftTabBoundary(r.position, ctx.viewModel);
					const range = EditorRange.fromPositions(position, position).plusRange(r.range);
					return request.fulfillContentText(position, range, r.detail);
				}
			}

			// console.log(MouseTarget.toString(r));
			return r;
		} catch (err) {
			// console.log(err);
			return request.fulfillUnknown();
		}
	}

	public createMouseTargetForOverflowWidgetsDomNode(lastRenderData: PointerHandlerLastRenderData, editorPos: EditorPagePosition, pos: PageCoordinates, relativePos: CoordinatesRelativeToEditor, target: HTMLElement | null) {
		const ctx = new HitTestContext(this._context, this._viewHelper, lastRenderData);
		const request = new HitTestRequest(ctx, editorPos, pos, relativePos, target, ctx.overflowWidgetsDomNode);
		try {
			return MouseTargetFactory._createMouseTarget(ctx, request);
		} catch (err) {
			return request.fulfillUnknown();
		}
	}

	private static _createMouseTarget(ctx: HitTestContext, request: HitTestRequest): IMouseTarget {

		// console.log(`${domHitTestExecuted ? '=>' : ''}CAME IN REQUEST: ${request}`);

		if (request.target === null) {
			// No target
			return request.fulfillUnknown();
		}

		// we know for a fact that request.target is not null
		const resolvedRequest = <ResolvedHitTestRequest>request;

		let result: IMouseTarget | null = null;

		if (!ElementPath.isChildOfOverflowGuard(request.targetPath) && !ElementPath.isChildOfOverflowingContentWidgets(request.targetPath) && !ElementPath.isChildOfOverflowingOverlayWidgets(request.targetPath)) {
			// We only render dom nodes inside the overflow guard or in the overflowing content widgets
			result = result || request.fulfillUnknown();
		}

		result = result || MouseTargetFactory._hitTestContentWidget(ctx, resolvedRequest);
		result = result || MouseTargetFactory._hitTestOverlayWidget(ctx, resolvedRequest);
		result = result || MouseTargetFactory._hitTestMinimap(ctx, resolvedRequest);
		result = result || MouseTargetFactory._hitTestScrollbarSlider(ctx, resolvedRequest);
		result = result || MouseTargetFactory._hitTestViewZone(ctx, resolvedRequest);
		result = result || MouseTargetFactory._hitTestMargin(ctx, resolvedRequest);
		result = result || MouseTargetFactory._hitTestViewCursor(ctx, resolvedRequest);
		result = result || MouseTargetFactory._hitTestTextArea(ctx, resolvedRequest);
		result = result || MouseTargetFactory._hitTestViewLines(ctx, resolvedRequest);
		result = result || MouseTargetFactory._hitTestScrollbar(ctx, resolvedRequest);

		return (result || request.fulfillUnknown());
	}

	private static _hitTestContentWidget(ctx: HitTestContext, request: ResolvedHitTestRequest): IMouseTarget | null {
		// Is it a content widget?
		if (ElementPath.isChildOfContentWidgets(request.targetPath) || ElementPath.isChildOfOverflowingContentWidgets(request.targetPath)) {
			const widgetId = ctx.findAttribute(request.target, 'widgetId');
			if (widgetId) {
				return request.fulfillContentWidget(widgetId);
			} else {
				return request.fulfillUnknown();
			}
		}
		return null;
	}

	private static _hitTestOverlayWidget(ctx: HitTestContext, request: ResolvedHitTestRequest): IMouseTarget | null {
		// Is it an overlay widget?
		if (ElementPath.isChildOfOverlayWidgets(request.targetPath) || ElementPath.isChildOfOverflowingOverlayWidgets(request.targetPath)) {
			const widgetId = ctx.findAttribute(request.target, 'widgetId');
			if (widgetId) {
				return request.fulfillOverlayWidget(widgetId);
			} else {
				return request.fulfillUnknown();
			}
		}
		return null;
	}

	private static _hitTestViewCursor(ctx: HitTestContext, request: ResolvedHitTestRequest): IMouseTarget | null {

		if (request.target) {
			// Check if we've hit a painted cursor
			const lastViewCursorsRenderData = ctx.lastRenderData.lastViewCursorsRenderData;

			for (const d of lastViewCursorsRenderData) {

				if (request.target === d.domNode) {
					return request.fulfillContentText(d.position, null, { mightBeForeignElement: false, injectedText: null });
				}
			}
		}

		if (request.isInContentArea) {
			// Edge has a bug when hit-testing the exact position of a cursor,
			// instead of returning the correct dom node, it returns the
			// first or last rendered view line dom node, therefore help it out
			// and first check if we are on top of a cursor

			const lastViewCursorsRenderData = ctx.lastRenderData.lastViewCursorsRenderData;
			const mouseContentHorizontalOffset = request.mouseContentHorizontalOffset;
			const mouseVerticalOffset = request.mouseVerticalOffset;

			for (const d of lastViewCursorsRenderData) {

				if (mouseContentHorizontalOffset < d.contentLeft) {
					// mouse position is to the left of the cursor
					continue;
				}
				if (mouseContentHorizontalOffset > d.contentLeft + d.width) {
					// mouse position is to the right of the cursor
					continue;
				}

				const cursorVerticalOffset = ctx.getVerticalOffsetForLineNumber(d.position.lineNumber);

				if (
					cursorVerticalOffset <= mouseVerticalOffset
					&& mouseVerticalOffset <= cursorVerticalOffset + d.height
				) {
					return request.fulfillContentText(d.position, null, { mightBeForeignElement: false, injectedText: null });
				}
			}
		}

		return null;
	}

	private static _hitTestViewZone(ctx: HitTestContext, request: ResolvedHitTestRequest): IMouseTarget | null {
		const viewZoneData = ctx.getZoneAtCoord(request.mouseVerticalOffset);
		if (viewZoneData) {
			const mouseTargetType = (request.isInContentArea ? MouseTargetType.CONTENT_VIEW_ZONE : MouseTargetType.GUTTER_VIEW_ZONE);
			return request.fulfillViewZone(mouseTargetType, viewZoneData.position, viewZoneData);
		}

		return null;
	}

	private static _hitTestTextArea(ctx: HitTestContext, request: ResolvedHitTestRequest): IMouseTarget | null {
		// Is it the textarea?
		if (ElementPath.isTextArea(request.targetPath)) {
			if (ctx.lastRenderData.lastTextareaPosition) {
				return request.fulfillContentText(ctx.lastRenderData.lastTextareaPosition, null, { mightBeForeignElement: false, injectedText: null });
			}
			return request.fulfillTextarea();
		}
		return null;
	}

	private static _hitTestMargin(ctx: HitTestContext, request: ResolvedHitTestRequest): IMouseTarget | null {
		if (request.isInMarginArea) {
			const res = ctx.getFullLineRangeAtCoord(request.mouseVerticalOffset);
			const pos = res.range.getStartPosition();
			let offset = Math.abs(request.relativePos.x);
			const detail: Mutable<IMouseTargetMarginData> = {
				isAfterLines: res.isAfterLines,
				glyphMarginLeft: ctx.layoutInfo.glyphMarginLeft,
				glyphMarginWidth: ctx.layoutInfo.glyphMarginWidth,
				lineNumbersWidth: ctx.layoutInfo.lineNumbersWidth,
				offsetX: offset
			};

			offset -= ctx.layoutInfo.glyphMarginLeft;

			if (offset <= ctx.layoutInfo.glyphMarginWidth) {
				// On the glyph margin
				const modelCoordinate = ctx.viewModel.coordinatesConverter.convertViewPositionToModelPosition(res.range.getStartPosition());
				const lanes = ctx.viewModel.glyphLanes.getLanesAtLine(modelCoordinate.lineNumber);
				detail.glyphMarginLane = lanes[Math.floor(offset / ctx.lineHeight)];
				return request.fulfillMargin(MouseTargetType.GUTTER_GLYPH_MARGIN, pos, res.range, detail);
			}
			offset -= ctx.layoutInfo.glyphMarginWidth;

			if (offset <= ctx.layoutInfo.lineNumbersWidth) {
				// On the line numbers
				return request.fulfillMargin(MouseTargetType.GUTTER_LINE_NUMBERS, pos, res.range, detail);
			}
			offset -= ctx.layoutInfo.lineNumbersWidth;

			// On the line decorations
			return request.fulfillMargin(MouseTargetType.GUTTER_LINE_DECORATIONS, pos, res.range, detail);
		}
		return null;
	}

	private static _hitTestViewLines(ctx: HitTestContext, request: ResolvedHitTestRequest): IMouseTarget | null {
		if (!ElementPath.isChildOfViewLines(request.targetPath)) {
			return null;
		}

		if (ctx.isInTopPadding(request.mouseVerticalOffset)) {
			return request.fulfillContentEmpty(new Position(1, 1), EMPTY_CONTENT_AFTER_LINES);
		}

		// Check if it is below any lines and any view zones
		if (ctx.isAfterLines(request.mouseVerticalOffset) || ctx.isInBottomPadding(request.mouseVerticalOffset)) {
			// This most likely indicates it happened after the last view-line
			const lineCount = ctx.viewModel.getLineCount();
			const maxLineColumn = ctx.viewModel.getLineMaxColumn(lineCount);
			return request.fulfillContentEmpty(new Position(lineCount, maxLineColumn), EMPTY_CONTENT_AFTER_LINES);
		}

		// Check if we are hitting a view-line (can happen in the case of inline decorations on empty lines)
		// See https://github.com/microsoft/vscode/issues/46942
		if (ElementPath.isStrictChildOfViewLines(request.targetPath)) {
			const lineNumber = ctx.getLineNumberAtVerticalOffset(request.mouseVerticalOffset);
			if (ctx.viewModel.getLineLength(lineNumber) === 0) {
				const lineWidth = ctx.getLineWidth(lineNumber);
				const detail = createEmptyContentDataInLines(request.mouseContentHorizontalOffset - lineWidth);
				return request.fulfillContentEmpty(new Position(lineNumber, 1), detail);
			}

			const lineWidth = ctx.getLineWidth(lineNumber);
			if (request.mouseContentHorizontalOffset >= lineWidth) {
				// TODO: This is wrong for RTL
				const detail = createEmptyContentDataInLines(request.mouseContentHorizontalOffset - lineWidth);
				const pos = new Position(lineNumber, ctx.viewModel.getLineMaxColumn(lineNumber));
				return request.fulfillContentEmpty(pos, detail);
			}
		}

		// Do the hit test (if not already done)
		const hitTestResult = request.hitTestResult.value;

		if (hitTestResult.type === HitTestResultType.Content) {
			return MouseTargetFactory.createMouseTargetFromHitTestPosition(ctx, request, hitTestResult.spanNode, hitTestResult.position, hitTestResult.injectedText);
		}

		// We didn't hit content...
		if (request.wouldBenefitFromHitTestTargetSwitch) {
			// We actually hit something different... Give it one last change by trying again with this new target
			request.switchToHitTestTarget();
			return this._createMouseTarget(ctx, request);
		}

		// We have tried everything...
		return request.fulfillUnknown();
	}

	private static _hitTestMinimap(ctx: HitTestContext, request: ResolvedHitTestRequest): IMouseTarget | null {
		if (ElementPath.isChildOfMinimap(request.targetPath)) {
			const possibleLineNumber = ctx.getLineNumberAtVerticalOffset(request.mouseVerticalOffset);
			const maxColumn = ctx.viewModel.getLineMaxColumn(possibleLineNumber);
			return request.fulfillScrollbar(new Position(possibleLineNumber, maxColumn));
		}
		return null;
	}

	private static _hitTestScrollbarSlider(ctx: HitTestContext, request: ResolvedHitTestRequest): IMouseTarget | null {
		if (ElementPath.isChildOfScrollableElement(request.targetPath)) {
			if (request.target && request.target.nodeType === 1) {
				const className = request.target.className;
				if (className && /\b(slider|scrollbar)\b/.test(className)) {
					const possibleLineNumber = ctx.getLineNumberAtVerticalOffset(request.mouseVerticalOffset);
					const maxColumn = ctx.viewModel.getLineMaxColumn(possibleLineNumber);
					return request.fulfillScrollbar(new Position(possibleLineNumber, maxColumn));
				}
			}
		}
		return null;
	}

	private static _hitTestScrollbar(ctx: HitTestContext, request: ResolvedHitTestRequest): IMouseTarget | null {
		// Is it the overview ruler?
		// Is it a child of the scrollable element?
		if (ElementPath.isChildOfScrollableElement(request.targetPath)) {
			const possibleLineNumber = ctx.getLineNumberAtVerticalOffset(request.mouseVerticalOffset);
			const maxColumn = ctx.viewModel.getLineMaxColumn(possibleLineNumber);
			return request.fulfillScrollbar(new Position(possibleLineNumber, maxColumn));
		}

		return null;
	}

	public getMouseColumn(relativePos: CoordinatesRelativeToEditor): number {
		const options = this._context.configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);
		const mouseContentHorizontalOffset = this._context.viewLayout.getCurrentScrollLeft() + relativePos.x - layoutInfo.contentLeft;
		return MouseTargetFactory._getMouseColumn(mouseContentHorizontalOffset, options.get(EditorOption.fontInfo).typicalHalfwidthCharacterWidth);
	}

	public static _getMouseColumn(mouseContentHorizontalOffset: number, typicalHalfwidthCharacterWidth: number): number {
		if (mouseContentHorizontalOffset < 0) {
			return 1;
		}
		const chars = Math.round(mouseContentHorizontalOffset / typicalHalfwidthCharacterWidth);
		return (chars + 1);
	}

	private static createMouseTargetFromHitTestPosition(ctx: HitTestContext, request: HitTestRequest, spanNode: HTMLElement, pos: Position, injectedText: InjectedText | null): IMouseTarget {
		const lineNumber = pos.lineNumber;
		const column = pos.column;

		const lineWidth = ctx.getLineWidth(lineNumber);

		if (request.mouseContentHorizontalOffset > lineWidth) {
			const detail = createEmptyContentDataInLines(request.mouseContentHorizontalOffset - lineWidth);
			return request.fulfillContentEmpty(pos, detail);
		}

		const visibleRange = ctx.visibleRangeForPosition(lineNumber, column);

		if (!visibleRange) {
			return request.fulfillUnknown(pos);
		}

		const columnHorizontalOffset = visibleRange.left;

		if (Math.abs(request.mouseContentHorizontalOffset - columnHorizontalOffset) < 1) {
			return request.fulfillContentText(pos, null, { mightBeForeignElement: !!injectedText, injectedText });
		}

		// Let's define a, b, c and check if the offset is in between them...
		interface OffsetColumn { offset: number; column: number }

		const points: OffsetColumn[] = [];
		points.push({ offset: visibleRange.left, column: column });
		if (column > 1) {
			const visibleRange = ctx.visibleRangeForPosition(lineNumber, column - 1);
			if (visibleRange) {
				points.push({ offset: visibleRange.left, column: column - 1 });
			}
		}
		const lineMaxColumn = ctx.viewModel.getLineMaxColumn(lineNumber);
		if (column < lineMaxColumn) {
			const visibleRange = ctx.visibleRangeForPosition(lineNumber, column + 1);
			if (visibleRange) {
				points.push({ offset: visibleRange.left, column: column + 1 });
			}
		}

		points.sort((a, b) => a.offset - b.offset);

		const mouseCoordinates = request.pos.toClientCoordinates(dom.getWindow(ctx.viewDomNode));
		const spanNodeClientRect = spanNode.getBoundingClientRect();
		const mouseIsOverSpanNode = (spanNodeClientRect.left <= mouseCoordinates.clientX && mouseCoordinates.clientX <= spanNodeClientRect.right);

		let rng: EditorRange | null = null;

		for (let i = 1; i < points.length; i++) {
			const prev = points[i - 1];
			const curr = points[i];
			if (prev.offset <= request.mouseContentHorizontalOffset && request.mouseContentHorizontalOffset <= curr.offset) {
				rng = new EditorRange(lineNumber, prev.column, lineNumber, curr.column);

				// See https://github.com/microsoft/vscode/issues/152819
				// Due to the use of zwj, the browser's hit test result is skewed towards the left
				// Here we try to correct that if the mouse horizontal offset is closer to the right than the left

				const prevDelta = Math.abs(prev.offset - request.mouseContentHorizontalOffset);
				const nextDelta = Math.abs(curr.offset - request.mouseContentHorizontalOffset);

				pos = (
					prevDelta < nextDelta
						? new Position(lineNumber, prev.column)
						: new Position(lineNumber, curr.column)
				);

				break;
			}
		}

		return request.fulfillContentText(pos, rng, { mightBeForeignElement: !mouseIsOverSpanNode || !!injectedText, injectedText });
	}

	/**
	 * Most probably WebKit browsers and Edge
	 */
	private static _doHitTestWithCaretRangeFromPoint(ctx: HitTestContext, request: BareHitTestRequest): HitTestResult {

		// In Chrome, especially on Linux it is possible to click between lines,
		// so try to adjust the `hity` below so that it lands in the center of a line
		const lineNumber = ctx.getLineNumberAtVerticalOffset(request.mouseVerticalOffset);
		const lineStartVerticalOffset = ctx.getVerticalOffsetForLineNumber(lineNumber);
		const lineEndVerticalOffset = lineStartVerticalOffset + ctx.lineHeight;

		const isBelowLastLine = (
			lineNumber === ctx.viewModel.getLineCount()
			&& request.mouseVerticalOffset > lineEndVerticalOffset
		);

		if (!isBelowLastLine) {
			const lineCenteredVerticalOffset = Math.floor((lineStartVerticalOffset + lineEndVerticalOffset) / 2);
			let adjustedPageY = request.pos.y + (lineCenteredVerticalOffset - request.mouseVerticalOffset);

			if (adjustedPageY <= request.editorPos.y) {
				adjustedPageY = request.editorPos.y + 1;
			}
			if (adjustedPageY >= request.editorPos.y + request.editorPos.height) {
				adjustedPageY = request.editorPos.y + request.editorPos.height - 1;
			}

			const adjustedPage = new PageCoordinates(request.pos.x, adjustedPageY);

			const r = this._actualDoHitTestWithCaretRangeFromPoint(ctx, adjustedPage.toClientCoordinates(dom.getWindow(ctx.viewDomNode)));
			if (r.type === HitTestResultType.Content) {
				return r;
			}
		}

		// Also try to hit test without the adjustment (for the edge cases that we are near the top or bottom)
		return this._actualDoHitTestWithCaretRangeFromPoint(ctx, request.pos.toClientCoordinates(dom.getWindow(ctx.viewDomNode)));
	}

	private static _actualDoHitTestWithCaretRangeFromPoint(ctx: HitTestContext, coords: ClientCoordinates): HitTestResult {
		const shadowRoot = dom.getShadowRoot(ctx.viewDomNode);
		let range: Range;
		if (shadowRoot) {
			if (typeof (<any>shadowRoot).caretRangeFromPoint === 'undefined') {
				range = shadowCaretRangeFromPoint(shadowRoot, coords.clientX, coords.clientY);
			} else {
				range = (<any>shadowRoot).caretRangeFromPoint(coords.clientX, coords.clientY);
			}
		} else {
			range = (<any>ctx.viewDomNode.ownerDocument).caretRangeFromPoint(coords.clientX, coords.clientY);
		}

		if (!range || !range.startContainer) {
			return new UnknownHitTestResult();
		}

		// Chrome always hits a TEXT_NODE, while Edge sometimes hits a token span
		const startContainer = range.startContainer;

		if (startContainer.nodeType === startContainer.TEXT_NODE) {
			// startContainer is expected to be the token text
			const parent1 = startContainer.parentNode; // expected to be the token span
			const parent2 = parent1 ? parent1.parentNode : null; // expected to be the view line container span
			const parent3 = parent2 ? parent2.parentNode : null; // expected to be the view line div
			const parent3ClassName = parent3 && parent3.nodeType === parent3.ELEMENT_NODE ? (<HTMLElement>parent3).className : null;

			if (parent3ClassName === ViewLine.CLASS_NAME) {
				return HitTestResult.createFromDOMInfo(ctx, <HTMLElement>parent1, range.startOffset);
			} else {
				return new UnknownHitTestResult(<HTMLElement>startContainer.parentNode);
			}
		} else if (startContainer.nodeType === startContainer.ELEMENT_NODE) {
			// startContainer is expected to be the token span
			const parent1 = startContainer.parentNode; // expected to be the view line container span
			const parent2 = parent1 ? parent1.parentNode : null; // expected to be the view line div
			const parent2ClassName = parent2 && parent2.nodeType === parent2.ELEMENT_NODE ? (<HTMLElement>parent2).className : null;

			if (parent2ClassName === ViewLine.CLASS_NAME) {
				return HitTestResult.createFromDOMInfo(ctx, <HTMLElement>startContainer, (<HTMLElement>startContainer).textContent!.length);
			} else {
				return new UnknownHitTestResult(<HTMLElement>startContainer);
			}
		}

		return new UnknownHitTestResult();
	}

	/**
	 * Most probably Gecko
	 */
	private static _doHitTestWithCaretPositionFromPoint(ctx: HitTestContext, coords: ClientCoordinates): HitTestResult {
		const hitResult: { offsetNode: Node; offset: number } = (<any>ctx.viewDomNode.ownerDocument).caretPositionFromPoint(coords.clientX, coords.clientY);

		if (hitResult.offsetNode.nodeType === hitResult.offsetNode.TEXT_NODE) {
			// offsetNode is expected to be the token text
			const parent1 = hitResult.offsetNode.parentNode; // expected to be the token span
			const parent2 = parent1 ? parent1.parentNode : null; // expected to be the view line container span
			const parent3 = parent2 ? parent2.parentNode : null; // expected to be the view line div
			const parent3ClassName = parent3 && parent3.nodeType === parent3.ELEMENT_NODE ? (<HTMLElement>parent3).className : null;

			if (parent3ClassName === ViewLine.CLASS_NAME) {
				return HitTestResult.createFromDOMInfo(ctx, <HTMLElement>hitResult.offsetNode.parentNode, hitResult.offset);
			} else {
				return new UnknownHitTestResult(<HTMLElement>hitResult.offsetNode.parentNode);
			}
		}

		// For inline decorations, Gecko sometimes returns the `<span>` of the line and the offset is the `<span>` with the inline decoration
		// Some other times, it returns the `<span>` with the inline decoration
		if (hitResult.offsetNode.nodeType === hitResult.offsetNode.ELEMENT_NODE) {
			const parent1 = hitResult.offsetNode.parentNode;
			const parent1ClassName = parent1 && parent1.nodeType === parent1.ELEMENT_NODE ? (<HTMLElement>parent1).className : null;
			const parent2 = parent1 ? parent1.parentNode : null;
			const parent2ClassName = parent2 && parent2.nodeType === parent2.ELEMENT_NODE ? (<HTMLElement>parent2).className : null;

			if (parent1ClassName === ViewLine.CLASS_NAME) {
				// it returned the `<span>` of the line and the offset is the `<span>` with the inline decoration
				const tokenSpan = hitResult.offsetNode.childNodes[Math.min(hitResult.offset, hitResult.offsetNode.childNodes.length - 1)];
				if (tokenSpan) {
					return HitTestResult.createFromDOMInfo(ctx, <HTMLElement>tokenSpan, 0);
				}
			} else if (parent2ClassName === ViewLine.CLASS_NAME) {
				// it returned the `<span>` with the inline decoration
				return HitTestResult.createFromDOMInfo(ctx, <HTMLElement>hitResult.offsetNode, 0);
			}
		}

		return new UnknownHitTestResult(<HTMLElement>hitResult.offsetNode);
	}

	private static _snapToSoftTabBoundary(position: Position, viewModel: IViewModel): Position {
		const lineContent = viewModel.getLineContent(position.lineNumber);
		const { tabSize } = viewModel.model.getOptions();
		const newPosition = AtomicTabMoveOperations.atomicPosition(lineContent, position.column - 1, tabSize, Direction.Nearest);
		if (newPosition !== -1) {
			return new Position(position.lineNumber, newPosition + 1);
		}
		return position;
	}

	public static doHitTest(ctx: HitTestContext, request: BareHitTestRequest): HitTestResult {

		let result: HitTestResult = new UnknownHitTestResult();
		if (typeof (<any>ctx.viewDomNode.ownerDocument).caretRangeFromPoint === 'function') {
			result = this._doHitTestWithCaretRangeFromPoint(ctx, request);
		} else if ((<any>ctx.viewDomNode.ownerDocument).caretPositionFromPoint) {
			result = this._doHitTestWithCaretPositionFromPoint(ctx, request.pos.toClientCoordinates(dom.getWindow(ctx.viewDomNode)));
		}
		if (result.type === HitTestResultType.Content) {
			const injectedText = ctx.viewModel.getInjectedTextAt(result.position);

			const normalizedPosition = ctx.viewModel.normalizePosition(result.position, PositionAffinity.None);
			if (injectedText || !normalizedPosition.equals(result.position)) {
				result = new ContentHitTestResult(normalizedPosition, result.spanNode, injectedText);
			}
		}
		return result;
	}
}

function shadowCaretRangeFromPoint(shadowRoot: ShadowRoot, x: number, y: number): Range {
	const range = document.createRange();

	// Get the element under the point
	let el: Element | null = (<any>shadowRoot).elementFromPoint(x, y);

	if (el !== null) {
		// Get the last child of the element until its firstChild is a text node
		// This assumes that the pointer is on the right of the line, out of the tokens
		// and that we want to get the offset of the last token of the line
		while (el && el.firstChild && el.firstChild.nodeType !== el.firstChild.TEXT_NODE && el.lastChild && el.lastChild.firstChild) {
			el = <Element>el.lastChild;
		}

		// Grab its rect
		const rect = el.getBoundingClientRect();

		// And its font (the computed shorthand font property might be empty, see #3217)
		const elWindow = dom.getWindow(el);
		const fontStyle = elWindow.getComputedStyle(el, null).getPropertyValue('font-style');
		const fontVariant = elWindow.getComputedStyle(el, null).getPropertyValue('font-variant');
		const fontWeight = elWindow.getComputedStyle(el, null).getPropertyValue('font-weight');
		const fontSize = elWindow.getComputedStyle(el, null).getPropertyValue('font-size');
		const lineHeight = elWindow.getComputedStyle(el, null).getPropertyValue('line-height');
		const fontFamily = elWindow.getComputedStyle(el, null).getPropertyValue('font-family');
		const font = `${fontStyle} ${fontVariant} ${fontWeight} ${fontSize}/${lineHeight} ${fontFamily}`;

		// And also its txt content
		const text = (el as any).innerText;

		// Position the pixel cursor at the left of the element
		let pixelCursor = rect.left;
		let offset = 0;
		let step: number;

		// If the point is on the right of the box put the cursor after the last character
		if (x > rect.left + rect.width) {
			offset = text.length;
		} else {
			const charWidthReader = CharWidthReader.getInstance();
			// Goes through all the characters of the innerText, and checks if the x of the point
			// belongs to the character.
			for (let i = 0; i < text.length + 1; i++) {
				// The step is half the width of the character
				step = charWidthReader.getCharWidth(text.charAt(i), font) / 2;
				// Move to the center of the character
				pixelCursor += step;
				// If the x of the point is smaller that the position of the cursor, the point is over that character
				if (x < pixelCursor) {
					offset = i;
					break;
				}
				// Move between the current character and the next
				pixelCursor += step;
			}
		}

		// Creates a range with the text node of the element and set the offset found
		range.setStart(el.firstChild!, offset);
		range.setEnd(el.firstChild!, offset);
	}

	return range;
}

class CharWidthReader {
	private static _INSTANCE: CharWidthReader | null = null;

	public static getInstance(): CharWidthReader {
		if (!CharWidthReader._INSTANCE) {
			CharWidthReader._INSTANCE = new CharWidthReader();
		}
		return CharWidthReader._INSTANCE;
	}

	private readonly _cache: { [cacheKey: string]: number };
	private readonly _canvas: HTMLCanvasElement;

	private constructor() {
		this._cache = {};
		this._canvas = document.createElement('canvas');
	}

	public getCharWidth(char: string, font: string): number {
		const cacheKey = char + font;
		if (this._cache[cacheKey]) {
			return this._cache[cacheKey];
		}

		const context = this._canvas.getContext('2d')!;
		context.font = font;
		const metrics = context.measureText(char);
		const width = metrics.width;
		this._cache[cacheKey] = width;
		return width;
	}
}
