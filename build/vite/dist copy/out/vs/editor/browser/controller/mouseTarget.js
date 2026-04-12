/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { PageCoordinates } from '../editorDom.js';
import { PartFingerprints } from '../view/viewPart.js';
import { ViewLine } from '../viewParts/viewLines/viewLine.js';
import { Position } from '../../common/core/position.js';
import { Range as EditorRange } from '../../common/core/range.js';
import { CursorColumns } from '../../common/core/cursorColumns.js';
import * as dom from '../../../base/browser/dom.js';
import { AtomicTabMoveOperations } from '../../common/cursor/cursorAtomicMoveOperations.js';
import { TextDirection } from '../../common/model.js';
import { Lazy } from '../../../base/common/lazy.js';
var HitTestResultType;
(function (HitTestResultType) {
    HitTestResultType[HitTestResultType["Unknown"] = 0] = "Unknown";
    HitTestResultType[HitTestResultType["Content"] = 1] = "Content";
})(HitTestResultType || (HitTestResultType = {}));
class UnknownHitTestResult {
    constructor(hitTarget = null) {
        this.hitTarget = hitTarget;
        this.type = 0 /* HitTestResultType.Unknown */;
    }
}
class ContentHitTestResult {
    get hitTarget() { return this.spanNode; }
    constructor(position, spanNode, injectedText) {
        this.position = position;
        this.spanNode = spanNode;
        this.injectedText = injectedText;
        this.type = 1 /* HitTestResultType.Content */;
    }
}
var HitTestResult;
(function (HitTestResult) {
    function createFromDOMInfo(ctx, spanNode, offset) {
        const position = ctx.getPositionFromDOMInfo(spanNode, offset);
        if (position) {
            return new ContentHitTestResult(position, spanNode, null);
        }
        return new UnknownHitTestResult(spanNode);
    }
    HitTestResult.createFromDOMInfo = createFromDOMInfo;
})(HitTestResult || (HitTestResult = {}));
export class PointerHandlerLastRenderData {
    constructor(lastViewCursorsRenderData, lastTextareaPosition) {
        this.lastViewCursorsRenderData = lastViewCursorsRenderData;
        this.lastTextareaPosition = lastTextareaPosition;
    }
}
export class MouseTarget {
    static _deduceRage(position, range = null) {
        if (!range && position) {
            return new EditorRange(position.lineNumber, position.column, position.lineNumber, position.column);
        }
        return range ?? null;
    }
    static createUnknown(element, mouseColumn, position) {
        return { type: 0 /* MouseTargetType.UNKNOWN */, element, mouseColumn, position, range: this._deduceRage(position) };
    }
    static createTextarea(element, mouseColumn) {
        return { type: 1 /* MouseTargetType.TEXTAREA */, element, mouseColumn, position: null, range: null };
    }
    static createMargin(type, element, mouseColumn, position, range, detail) {
        return { type, element, mouseColumn, position, range, detail };
    }
    static createViewZone(type, element, mouseColumn, position, detail) {
        return { type, element, mouseColumn, position, range: this._deduceRage(position), detail };
    }
    static createContentText(element, mouseColumn, position, range, detail) {
        return { type: 6 /* MouseTargetType.CONTENT_TEXT */, element, mouseColumn, position, range: this._deduceRage(position, range), detail };
    }
    static createContentEmpty(element, mouseColumn, position, detail) {
        return { type: 7 /* MouseTargetType.CONTENT_EMPTY */, element, mouseColumn, position, range: this._deduceRage(position), detail };
    }
    static createContentWidget(element, mouseColumn, detail) {
        return { type: 9 /* MouseTargetType.CONTENT_WIDGET */, element, mouseColumn, position: null, range: null, detail };
    }
    static createScrollbar(element, mouseColumn, position) {
        return { type: 11 /* MouseTargetType.SCROLLBAR */, element, mouseColumn, position, range: this._deduceRage(position) };
    }
    static createOverlayWidget(element, mouseColumn, detail) {
        return { type: 12 /* MouseTargetType.OVERLAY_WIDGET */, element, mouseColumn, position: null, range: null, detail };
    }
    static createOutsideEditor(mouseColumn, position, outsidePosition, outsideDistance) {
        return { type: 13 /* MouseTargetType.OUTSIDE_EDITOR */, element: null, mouseColumn, position, range: this._deduceRage(position), outsidePosition, outsideDistance };
    }
    static _typeToString(type) {
        if (type === 1 /* MouseTargetType.TEXTAREA */) {
            return 'TEXTAREA';
        }
        if (type === 2 /* MouseTargetType.GUTTER_GLYPH_MARGIN */) {
            return 'GUTTER_GLYPH_MARGIN';
        }
        if (type === 3 /* MouseTargetType.GUTTER_LINE_NUMBERS */) {
            return 'GUTTER_LINE_NUMBERS';
        }
        if (type === 4 /* MouseTargetType.GUTTER_LINE_DECORATIONS */) {
            return 'GUTTER_LINE_DECORATIONS';
        }
        if (type === 5 /* MouseTargetType.GUTTER_VIEW_ZONE */) {
            return 'GUTTER_VIEW_ZONE';
        }
        if (type === 6 /* MouseTargetType.CONTENT_TEXT */) {
            return 'CONTENT_TEXT';
        }
        if (type === 7 /* MouseTargetType.CONTENT_EMPTY */) {
            return 'CONTENT_EMPTY';
        }
        if (type === 8 /* MouseTargetType.CONTENT_VIEW_ZONE */) {
            return 'CONTENT_VIEW_ZONE';
        }
        if (type === 9 /* MouseTargetType.CONTENT_WIDGET */) {
            return 'CONTENT_WIDGET';
        }
        if (type === 10 /* MouseTargetType.OVERVIEW_RULER */) {
            return 'OVERVIEW_RULER';
        }
        if (type === 11 /* MouseTargetType.SCROLLBAR */) {
            return 'SCROLLBAR';
        }
        if (type === 12 /* MouseTargetType.OVERLAY_WIDGET */) {
            return 'OVERLAY_WIDGET';
        }
        return 'UNKNOWN';
    }
    static toString(target) {
        return this._typeToString(target.type) + ': ' + target.position + ' - ' + target.range + ' - ' + JSON.stringify(target.detail);
    }
}
class ElementPath {
    static isTextArea(path) {
        return (path.length === 2
            && path[0] === 3 /* PartFingerprint.OverflowGuard */
            && path[1] === 7 /* PartFingerprint.TextArea */);
    }
    static isChildOfViewLines(path) {
        return (path.length >= 4
            && path[0] === 3 /* PartFingerprint.OverflowGuard */
            && path[3] === 8 /* PartFingerprint.ViewLines */);
    }
    static isStrictChildOfViewLines(path) {
        return (path.length > 4
            && path[0] === 3 /* PartFingerprint.OverflowGuard */
            && path[3] === 8 /* PartFingerprint.ViewLines */);
    }
    static isChildOfScrollableElement(path) {
        return (path.length >= 2
            && path[0] === 3 /* PartFingerprint.OverflowGuard */
            && path[1] === 6 /* PartFingerprint.ScrollableElement */);
    }
    static isChildOfMinimap(path) {
        return (path.length >= 2
            && path[0] === 3 /* PartFingerprint.OverflowGuard */
            && path[1] === 9 /* PartFingerprint.Minimap */);
    }
    static isChildOfContentWidgets(path) {
        return (path.length >= 4
            && path[0] === 3 /* PartFingerprint.OverflowGuard */
            && path[3] === 1 /* PartFingerprint.ContentWidgets */);
    }
    static isChildOfOverflowGuard(path) {
        return (path.length >= 1
            && path[0] === 3 /* PartFingerprint.OverflowGuard */);
    }
    static isChildOfOverflowingContentWidgets(path) {
        return (path.length >= 1
            && path[0] === 2 /* PartFingerprint.OverflowingContentWidgets */);
    }
    static isChildOfOverlayWidgets(path) {
        return (path.length >= 2
            && path[0] === 3 /* PartFingerprint.OverflowGuard */
            && path[1] === 4 /* PartFingerprint.OverlayWidgets */);
    }
    static isChildOfOverflowingOverlayWidgets(path) {
        return (path.length >= 1
            && path[0] === 5 /* PartFingerprint.OverflowingOverlayWidgets */);
    }
}
export class HitTestContext {
    constructor(context, viewHelper, lastRenderData) {
        this.viewModel = context.viewModel;
        const options = context.configuration.options;
        this.layoutInfo = options.get(165 /* EditorOption.layoutInfo */);
        this.viewDomNode = viewHelper.viewDomNode;
        this.viewLinesGpu = viewHelper.viewLinesGpu;
        this.lineHeight = options.get(75 /* EditorOption.lineHeight */);
        this.stickyTabStops = options.get(132 /* EditorOption.stickyTabStops */);
        this.typicalHalfwidthCharacterWidth = options.get(59 /* EditorOption.fontInfo */).typicalHalfwidthCharacterWidth;
        this.lastRenderData = lastRenderData;
        this._context = context;
        this._viewHelper = viewHelper;
    }
    getZoneAtCoord(mouseVerticalOffset) {
        return HitTestContext.getZoneAtCoord(this._context, mouseVerticalOffset);
    }
    static getZoneAtCoord(context, mouseVerticalOffset) {
        // The target is either a view zone or the empty space after the last view-line
        const viewZoneWhitespace = context.viewLayout.getWhitespaceAtVerticalOffset(mouseVerticalOffset);
        if (viewZoneWhitespace) {
            const viewZoneMiddle = viewZoneWhitespace.verticalOffset + viewZoneWhitespace.height / 2;
            const lineCount = context.viewModel.getLineCount();
            let positionBefore = null;
            let position;
            let positionAfter = null;
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
            }
            else if (positionBefore === null) {
                position = positionAfter;
            }
            else if (mouseVerticalOffset < viewZoneMiddle) {
                position = positionBefore;
            }
            else {
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
    getFullLineRangeAtCoord(mouseVerticalOffset) {
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
    getLineNumberAtVerticalOffset(mouseVerticalOffset) {
        return this._context.viewLayout.getLineNumberAtVerticalOffset(mouseVerticalOffset);
    }
    isAfterLines(mouseVerticalOffset) {
        return this._context.viewLayout.isAfterLines(mouseVerticalOffset);
    }
    isInTopPadding(mouseVerticalOffset) {
        return this._context.viewLayout.isInTopPadding(mouseVerticalOffset);
    }
    isInBottomPadding(mouseVerticalOffset) {
        return this._context.viewLayout.isInBottomPadding(mouseVerticalOffset);
    }
    getVerticalOffsetForLineNumber(lineNumber) {
        return this._context.viewLayout.getVerticalOffsetForLineNumber(lineNumber);
    }
    findAttribute(element, attr) {
        return HitTestContext._findAttribute(element, attr, this._viewHelper.viewDomNode);
    }
    static _findAttribute(element, attr, stopAt) {
        while (element && element !== element.ownerDocument.body) {
            if (element.hasAttribute && element.hasAttribute(attr)) {
                return element.getAttribute(attr);
            }
            if (element === stopAt) {
                return null;
            }
            element = element.parentNode;
        }
        return null;
    }
    getLineWidth(lineNumber) {
        return this._viewHelper.getLineWidth(lineNumber);
    }
    isRtl(lineNumber) {
        return this.viewModel.getTextDirection(lineNumber) === TextDirection.RTL;
    }
    visibleRangeForPosition(lineNumber, column) {
        return this._viewHelper.visibleRangeForPosition(lineNumber, column);
    }
    getPositionFromDOMInfo(spanNode, offset) {
        return this._viewHelper.getPositionFromDOMInfo(spanNode, offset);
    }
    getCurrentScrollTop() {
        return this._context.viewLayout.getCurrentScrollTop();
    }
    getCurrentScrollLeft() {
        return this._context.viewLayout.getCurrentScrollLeft();
    }
}
class BareHitTestRequest {
    constructor(ctx, editorPos, pos, relativePos) {
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
    get target() {
        if (this._useHitTestTarget) {
            return this.hitTestResult.value.hitTarget;
        }
        return this._eventTarget;
    }
    get targetPath() {
        if (this._targetPathCacheElement !== this.target) {
            this._targetPathCacheElement = this.target;
            this._targetPathCacheValue = PartFingerprints.collect(this.target, this._ctx.viewDomNode);
        }
        return this._targetPathCacheValue;
    }
    constructor(ctx, editorPos, pos, relativePos, eventTarget) {
        super(ctx, editorPos, pos, relativePos);
        this.hitTestResult = new Lazy(() => MouseTargetFactory.doHitTest(this._ctx, this));
        this._targetPathCacheElement = null;
        this._targetPathCacheValue = new Uint8Array(0);
        this._ctx = ctx;
        this._eventTarget = eventTarget;
        // If no event target is passed in, we will use the hit test target
        const hasEventTarget = Boolean(this._eventTarget);
        this._useHitTestTarget = !hasEventTarget;
    }
    toString() {
        return `pos(${this.pos.x},${this.pos.y}), editorPos(${this.editorPos.x},${this.editorPos.y}), relativePos(${this.relativePos.x},${this.relativePos.y}), mouseVerticalOffset: ${this.mouseVerticalOffset}, mouseContentHorizontalOffset: ${this.mouseContentHorizontalOffset}\n\ttarget: ${this.target ? this.target.outerHTML : null}`;
    }
    get wouldBenefitFromHitTestTargetSwitch() {
        return (!this._useHitTestTarget
            && this.hitTestResult.value.hitTarget !== null
            && this.target !== this.hitTestResult.value.hitTarget);
    }
    switchToHitTestTarget() {
        this._useHitTestTarget = true;
    }
    _getMouseColumn(position = null) {
        if (position && position.column < this._ctx.viewModel.getLineMaxColumn(position.lineNumber)) {
            // Most likely, the line contains foreign decorations...
            return CursorColumns.visibleColumnFromColumn(this._ctx.viewModel.getLineContent(position.lineNumber), position.column, this._ctx.viewModel.model.getOptions().tabSize) + 1;
        }
        return this.mouseColumn;
    }
    fulfillUnknown(position = null) {
        return MouseTarget.createUnknown(this.target, this._getMouseColumn(position), position);
    }
    fulfillTextarea() {
        return MouseTarget.createTextarea(this.target, this._getMouseColumn());
    }
    fulfillMargin(type, position, range, detail) {
        return MouseTarget.createMargin(type, this.target, this._getMouseColumn(position), position, range, detail);
    }
    fulfillViewZone(type, position, detail) {
        // Always return the usual mouse column for a view zone.
        return MouseTarget.createViewZone(type, this.target, this._getMouseColumn(), position, detail);
    }
    fulfillContentText(position, range, detail) {
        return MouseTarget.createContentText(this.target, this._getMouseColumn(position), position, range, detail);
    }
    fulfillContentEmpty(position, detail) {
        return MouseTarget.createContentEmpty(this.target, this._getMouseColumn(position), position, detail);
    }
    fulfillContentWidget(detail) {
        return MouseTarget.createContentWidget(this.target, this._getMouseColumn(), detail);
    }
    fulfillScrollbar(position) {
        return MouseTarget.createScrollbar(this.target, this._getMouseColumn(position), position);
    }
    fulfillOverlayWidget(detail) {
        return MouseTarget.createOverlayWidget(this.target, this._getMouseColumn(), detail);
    }
}
const EMPTY_CONTENT_AFTER_LINES = { isAfterLines: true };
function createEmptyContentDataInLines(horizontalDistanceToText) {
    return {
        isAfterLines: false,
        horizontalDistanceToText: horizontalDistanceToText
    };
}
export class MouseTargetFactory {
    constructor(context, viewHelper) {
        this._context = context;
        this._viewHelper = viewHelper;
    }
    mouseTargetIsWidget(e) {
        const t = e.target;
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
    createMouseTarget(lastRenderData, editorPos, pos, relativePos, target) {
        const ctx = new HitTestContext(this._context, this._viewHelper, lastRenderData);
        const request = new HitTestRequest(ctx, editorPos, pos, relativePos, target);
        try {
            const r = MouseTargetFactory._createMouseTarget(ctx, request);
            if (r.type === 6 /* MouseTargetType.CONTENT_TEXT */) {
                // Snap to the nearest soft tab boundary if atomic soft tabs are enabled.
                if (ctx.stickyTabStops && r.position !== null) {
                    const position = MouseTargetFactory._snapToSoftTabBoundary(r.position, ctx.viewModel);
                    const range = EditorRange.fromPositions(position, position).plusRange(r.range);
                    return request.fulfillContentText(position, range, r.detail);
                }
            }
            // console.log(MouseTarget.toString(r));
            return r;
        }
        catch (err) {
            // console.log(err);
            return request.fulfillUnknown();
        }
    }
    static _createMouseTarget(ctx, request) {
        // console.log(`${domHitTestExecuted ? '=>' : ''}CAME IN REQUEST: ${request}`);
        if (request.target === null) {
            // No target
            return request.fulfillUnknown();
        }
        // we know for a fact that request.target is not null
        const resolvedRequest = request;
        let result = null;
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
    static _hitTestContentWidget(ctx, request) {
        // Is it a content widget?
        if (ElementPath.isChildOfContentWidgets(request.targetPath) || ElementPath.isChildOfOverflowingContentWidgets(request.targetPath)) {
            const widgetId = ctx.findAttribute(request.target, 'widgetId');
            if (widgetId) {
                return request.fulfillContentWidget(widgetId);
            }
            else {
                return request.fulfillUnknown();
            }
        }
        return null;
    }
    static _hitTestOverlayWidget(ctx, request) {
        // Is it an overlay widget?
        if (ElementPath.isChildOfOverlayWidgets(request.targetPath) || ElementPath.isChildOfOverflowingOverlayWidgets(request.targetPath)) {
            const widgetId = ctx.findAttribute(request.target, 'widgetId');
            if (widgetId) {
                return request.fulfillOverlayWidget(widgetId);
            }
            else {
                return request.fulfillUnknown();
            }
        }
        return null;
    }
    static _hitTestViewCursor(ctx, request) {
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
                if (cursorVerticalOffset <= mouseVerticalOffset
                    && mouseVerticalOffset <= cursorVerticalOffset + d.height) {
                    return request.fulfillContentText(d.position, null, { mightBeForeignElement: false, injectedText: null });
                }
            }
        }
        return null;
    }
    static _hitTestViewZone(ctx, request) {
        const viewZoneData = ctx.getZoneAtCoord(request.mouseVerticalOffset);
        if (viewZoneData) {
            const mouseTargetType = (request.isInContentArea ? 8 /* MouseTargetType.CONTENT_VIEW_ZONE */ : 5 /* MouseTargetType.GUTTER_VIEW_ZONE */);
            return request.fulfillViewZone(mouseTargetType, viewZoneData.position, viewZoneData);
        }
        return null;
    }
    static _hitTestTextArea(ctx, request) {
        // Is it the textarea?
        if (ElementPath.isTextArea(request.targetPath)) {
            if (ctx.lastRenderData.lastTextareaPosition) {
                return request.fulfillContentText(ctx.lastRenderData.lastTextareaPosition, null, { mightBeForeignElement: false, injectedText: null });
            }
            return request.fulfillTextarea();
        }
        return null;
    }
    static _hitTestMargin(ctx, request) {
        if (request.isInMarginArea) {
            const res = ctx.getFullLineRangeAtCoord(request.mouseVerticalOffset);
            const pos = res.range.getStartPosition();
            let offset = Math.abs(request.relativePos.x);
            const detail = {
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
                return request.fulfillMargin(2 /* MouseTargetType.GUTTER_GLYPH_MARGIN */, pos, res.range, detail);
            }
            offset -= ctx.layoutInfo.glyphMarginWidth;
            if (offset <= ctx.layoutInfo.lineNumbersWidth) {
                // On the line numbers
                return request.fulfillMargin(3 /* MouseTargetType.GUTTER_LINE_NUMBERS */, pos, res.range, detail);
            }
            offset -= ctx.layoutInfo.lineNumbersWidth;
            // On the line decorations
            return request.fulfillMargin(4 /* MouseTargetType.GUTTER_LINE_DECORATIONS */, pos, res.range, detail);
        }
        return null;
    }
    static _hitTestViewLines(ctx, request) {
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
            const lineLength = ctx.viewModel.getLineLength(lineNumber);
            const lineWidth = ctx.getLineWidth(lineNumber);
            if (lineLength === 0) {
                const detail = createEmptyContentDataInLines(request.mouseContentHorizontalOffset - lineWidth);
                return request.fulfillContentEmpty(new Position(lineNumber, 1), detail);
            }
            const isRtl = ctx.isRtl(lineNumber);
            if (isRtl) {
                if (request.mouseContentHorizontalOffset + lineWidth <= ctx.layoutInfo.contentWidth - ctx.layoutInfo.verticalScrollbarWidth) {
                    const detail = createEmptyContentDataInLines(request.mouseContentHorizontalOffset - lineWidth);
                    const pos = new Position(lineNumber, ctx.viewModel.getLineMaxColumn(lineNumber));
                    return request.fulfillContentEmpty(pos, detail);
                }
            }
            else if (request.mouseContentHorizontalOffset >= lineWidth) {
                const detail = createEmptyContentDataInLines(request.mouseContentHorizontalOffset - lineWidth);
                const pos = new Position(lineNumber, ctx.viewModel.getLineMaxColumn(lineNumber));
                return request.fulfillContentEmpty(pos, detail);
            }
        }
        else {
            if (ctx.viewLinesGpu) {
                const lineNumber = ctx.getLineNumberAtVerticalOffset(request.mouseVerticalOffset);
                if (ctx.viewModel.getLineLength(lineNumber) === 0) {
                    const lineWidth = ctx.getLineWidth(lineNumber);
                    const detail = createEmptyContentDataInLines(request.mouseContentHorizontalOffset - lineWidth);
                    return request.fulfillContentEmpty(new Position(lineNumber, 1), detail);
                }
                const lineWidth = ctx.getLineWidth(lineNumber);
                const isRtl = ctx.isRtl(lineNumber);
                if (isRtl) {
                    if (request.mouseContentHorizontalOffset + lineWidth <= ctx.layoutInfo.contentWidth - ctx.layoutInfo.verticalScrollbarWidth) {
                        const detail = createEmptyContentDataInLines(request.mouseContentHorizontalOffset - lineWidth);
                        const pos = new Position(lineNumber, ctx.viewModel.getLineMaxColumn(lineNumber));
                        return request.fulfillContentEmpty(pos, detail);
                    }
                }
                else if (request.mouseContentHorizontalOffset >= lineWidth) {
                    const detail = createEmptyContentDataInLines(request.mouseContentHorizontalOffset - lineWidth);
                    const pos = new Position(lineNumber, ctx.viewModel.getLineMaxColumn(lineNumber));
                    return request.fulfillContentEmpty(pos, detail);
                }
                const position = ctx.viewLinesGpu.getPositionAtCoordinate(lineNumber, request.mouseContentHorizontalOffset);
                if (position) {
                    const detail = {
                        injectedText: null,
                        mightBeForeignElement: false
                    };
                    return request.fulfillContentText(position, EditorRange.fromPositions(position, position), detail);
                }
            }
        }
        // Do the hit test (if not already done)
        const hitTestResult = request.hitTestResult.value;
        if (hitTestResult.type === 1 /* HitTestResultType.Content */) {
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
    static _hitTestMinimap(ctx, request) {
        if (ElementPath.isChildOfMinimap(request.targetPath)) {
            const possibleLineNumber = ctx.getLineNumberAtVerticalOffset(request.mouseVerticalOffset);
            const maxColumn = ctx.viewModel.getLineMaxColumn(possibleLineNumber);
            return request.fulfillScrollbar(new Position(possibleLineNumber, maxColumn));
        }
        return null;
    }
    static _hitTestScrollbarSlider(ctx, request) {
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
    static _hitTestScrollbar(ctx, request) {
        // Is it the overview ruler?
        // Is it a child of the scrollable element?
        if (ElementPath.isChildOfScrollableElement(request.targetPath)) {
            const possibleLineNumber = ctx.getLineNumberAtVerticalOffset(request.mouseVerticalOffset);
            const maxColumn = ctx.viewModel.getLineMaxColumn(possibleLineNumber);
            return request.fulfillScrollbar(new Position(possibleLineNumber, maxColumn));
        }
        return null;
    }
    getMouseColumn(relativePos) {
        const options = this._context.configuration.options;
        const layoutInfo = options.get(165 /* EditorOption.layoutInfo */);
        const mouseContentHorizontalOffset = this._context.viewLayout.getCurrentScrollLeft() + relativePos.x - layoutInfo.contentLeft;
        return MouseTargetFactory._getMouseColumn(mouseContentHorizontalOffset, options.get(59 /* EditorOption.fontInfo */).typicalHalfwidthCharacterWidth);
    }
    static _getMouseColumn(mouseContentHorizontalOffset, typicalHalfwidthCharacterWidth) {
        if (mouseContentHorizontalOffset < 0) {
            return 1;
        }
        const chars = Math.round(mouseContentHorizontalOffset / typicalHalfwidthCharacterWidth);
        return (chars + 1);
    }
    static createMouseTargetFromHitTestPosition(ctx, request, spanNode, pos, injectedText) {
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
        const points = [];
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
        let rng = null;
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
                pos = (prevDelta < nextDelta
                    ? new Position(lineNumber, prev.column)
                    : new Position(lineNumber, curr.column));
                break;
            }
        }
        return request.fulfillContentText(pos, rng, { mightBeForeignElement: !mouseIsOverSpanNode || !!injectedText, injectedText });
    }
    /**
     * Most probably WebKit browsers and Edge
     */
    static _doHitTestWithCaretRangeFromPoint(ctx, request) {
        // In Chrome, especially on Linux it is possible to click between lines,
        // so try to adjust the `hity` below so that it lands in the center of a line
        const lineNumber = ctx.getLineNumberAtVerticalOffset(request.mouseVerticalOffset);
        const lineStartVerticalOffset = ctx.getVerticalOffsetForLineNumber(lineNumber);
        const lineEndVerticalOffset = lineStartVerticalOffset + ctx.lineHeight;
        const isBelowLastLine = (lineNumber === ctx.viewModel.getLineCount()
            && request.mouseVerticalOffset > lineEndVerticalOffset);
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
            if (r.type === 1 /* HitTestResultType.Content */) {
                return r;
            }
        }
        // Also try to hit test without the adjustment (for the edge cases that we are near the top or bottom)
        return this._actualDoHitTestWithCaretRangeFromPoint(ctx, request.pos.toClientCoordinates(dom.getWindow(ctx.viewDomNode)));
    }
    static _actualDoHitTestWithCaretRangeFromPoint(ctx, coords) {
        const shadowRoot = dom.getShadowRoot(ctx.viewDomNode);
        let range;
        if (shadowRoot) {
            // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
            if (typeof shadowRoot.caretRangeFromPoint === 'undefined') {
                range = shadowCaretRangeFromPoint(shadowRoot, coords.clientX, coords.clientY);
            }
            else {
                // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
                range = shadowRoot.caretRangeFromPoint(coords.clientX, coords.clientY);
            }
        }
        else {
            // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
            range = ctx.viewDomNode.ownerDocument.caretRangeFromPoint(coords.clientX, coords.clientY);
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
            const parent3ClassName = parent3 && parent3.nodeType === parent3.ELEMENT_NODE ? parent3.className : null;
            if (parent3ClassName === ViewLine.CLASS_NAME) {
                return HitTestResult.createFromDOMInfo(ctx, parent1, range.startOffset);
            }
            else {
                return new UnknownHitTestResult(startContainer.parentNode);
            }
        }
        else if (startContainer.nodeType === startContainer.ELEMENT_NODE) {
            // startContainer is expected to be the token span
            const parent1 = startContainer.parentNode; // expected to be the view line container span
            const parent2 = parent1 ? parent1.parentNode : null; // expected to be the view line div
            const parent2ClassName = parent2 && parent2.nodeType === parent2.ELEMENT_NODE ? parent2.className : null;
            if (parent2ClassName === ViewLine.CLASS_NAME) {
                return HitTestResult.createFromDOMInfo(ctx, startContainer, startContainer.textContent.length);
            }
            else {
                return new UnknownHitTestResult(startContainer);
            }
        }
        return new UnknownHitTestResult();
    }
    /**
     * Most probably Gecko
     */
    static _doHitTestWithCaretPositionFromPoint(ctx, coords) {
        // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
        const hitResult = ctx.viewDomNode.ownerDocument.caretPositionFromPoint(coords.clientX, coords.clientY);
        if (hitResult.offsetNode.nodeType === hitResult.offsetNode.TEXT_NODE) {
            // offsetNode is expected to be the token text
            const parent1 = hitResult.offsetNode.parentNode; // expected to be the token span
            const parent2 = parent1 ? parent1.parentNode : null; // expected to be the view line container span
            const parent3 = parent2 ? parent2.parentNode : null; // expected to be the view line div
            const parent3ClassName = parent3 && parent3.nodeType === parent3.ELEMENT_NODE ? parent3.className : null;
            if (parent3ClassName === ViewLine.CLASS_NAME) {
                return HitTestResult.createFromDOMInfo(ctx, hitResult.offsetNode.parentNode, hitResult.offset);
            }
            else {
                return new UnknownHitTestResult(hitResult.offsetNode.parentNode);
            }
        }
        // For inline decorations, Gecko sometimes returns the `<span>` of the line and the offset is the `<span>` with the inline decoration
        // Some other times, it returns the `<span>` with the inline decoration
        if (hitResult.offsetNode.nodeType === hitResult.offsetNode.ELEMENT_NODE) {
            const parent1 = hitResult.offsetNode.parentNode;
            const parent1ClassName = parent1 && parent1.nodeType === parent1.ELEMENT_NODE ? parent1.className : null;
            const parent2 = parent1 ? parent1.parentNode : null;
            const parent2ClassName = parent2 && parent2.nodeType === parent2.ELEMENT_NODE ? parent2.className : null;
            if (parent1ClassName === ViewLine.CLASS_NAME) {
                // it returned the `<span>` of the line and the offset is the `<span>` with the inline decoration
                const tokenSpan = hitResult.offsetNode.childNodes[Math.min(hitResult.offset, hitResult.offsetNode.childNodes.length - 1)];
                if (tokenSpan) {
                    return HitTestResult.createFromDOMInfo(ctx, tokenSpan, 0);
                }
            }
            else if (parent2ClassName === ViewLine.CLASS_NAME) {
                // it returned the `<span>` with the inline decoration
                return HitTestResult.createFromDOMInfo(ctx, hitResult.offsetNode, 0);
            }
        }
        return new UnknownHitTestResult(hitResult.offsetNode);
    }
    static _snapToSoftTabBoundary(position, viewModel) {
        const lineContent = viewModel.getLineContent(position.lineNumber);
        const { tabSize } = viewModel.model.getOptions();
        const newPosition = AtomicTabMoveOperations.atomicPosition(lineContent, position.column - 1, tabSize, 2 /* Direction.Nearest */);
        if (newPosition !== -1) {
            return new Position(position.lineNumber, newPosition + 1);
        }
        return position;
    }
    static doHitTest(ctx, request) {
        let result = new UnknownHitTestResult();
        // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
        if (typeof ctx.viewDomNode.ownerDocument.caretRangeFromPoint === 'function') {
            result = this._doHitTestWithCaretRangeFromPoint(ctx, request);
            // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
        }
        else if (ctx.viewDomNode.ownerDocument.caretPositionFromPoint) {
            result = this._doHitTestWithCaretPositionFromPoint(ctx, request.pos.toClientCoordinates(dom.getWindow(ctx.viewDomNode)));
        }
        if (result.type === 1 /* HitTestResultType.Content */) {
            const injectedText = ctx.viewModel.getInjectedTextAt(result.position);
            const normalizedPosition = ctx.viewModel.normalizePosition(result.position, 2 /* PositionAffinity.None */);
            if (injectedText || !normalizedPosition.equals(result.position)) {
                result = new ContentHitTestResult(normalizedPosition, result.spanNode, injectedText);
            }
        }
        return result;
    }
}
function shadowCaretRangeFromPoint(shadowRoot, x, y) {
    const range = document.createRange();
    // Get the element under the point
    // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
    let el = shadowRoot.elementFromPoint(x, y);
    // When el is not null, it may be div.monaco-mouse-cursor-text Element, which has not childNodes, we don't need to handle it.
    if (el?.hasChildNodes()) {
        // Get the last child of the element until its firstChild is a text node
        // This assumes that the pointer is on the right of the line, out of the tokens
        // and that we want to get the offset of the last token of the line
        while (el && el.firstChild && el.firstChild.nodeType !== el.firstChild.TEXT_NODE && el.lastChild && el.lastChild.firstChild) {
            el = el.lastChild;
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
        const text = el.innerText;
        // Position the pixel cursor at the left of the element
        let pixelCursor = rect.left;
        let offset = 0;
        let step;
        // If the point is on the right of the box put the cursor after the last character
        if (x > rect.left + rect.width) {
            offset = text.length;
        }
        else {
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
        range.setStart(el.firstChild, offset);
        range.setEnd(el.firstChild, offset);
    }
    return range;
}
class CharWidthReader {
    static { this._INSTANCE = null; }
    static getInstance() {
        if (!CharWidthReader._INSTANCE) {
            CharWidthReader._INSTANCE = new CharWidthReader();
        }
        return CharWidthReader._INSTANCE;
    }
    constructor() {
        this._cache = {};
        this._canvas = document.createElement('canvas');
    }
    getCharWidth(char, font) {
        const cacheKey = char + font;
        if (this._cache[cacheKey]) {
            return this._cache[cacheKey];
        }
        const context = this._canvas.getContext('2d');
        context.font = font;
        const metrics = context.measureText(char);
        const width = metrics.width;
        this._cache[cacheKey] = width;
        return width;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW91c2VUYXJnZXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvYnJvd3Nlci9jb250cm9sbGVyL21vdXNlVGFyZ2V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBSWhHLE9BQU8sRUFBMkQsZUFBZSxFQUErQixNQUFNLGlCQUFpQixDQUFDO0FBQ3hJLE9BQU8sRUFBbUIsZ0JBQWdCLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUN4RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFHOUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3pELE9BQU8sRUFBRSxLQUFLLElBQUksV0FBVyxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFJbEUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ25FLE9BQU8sS0FBSyxHQUFHLE1BQU0sOEJBQThCLENBQUM7QUFDcEQsT0FBTyxFQUFFLHVCQUF1QixFQUFhLE1BQU0sbURBQW1ELENBQUM7QUFDdkcsT0FBTyxFQUFvQixhQUFhLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUd4RSxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFHcEQsSUFBVyxpQkFHVjtBQUhELFdBQVcsaUJBQWlCO0lBQzNCLCtEQUFPLENBQUE7SUFDUCwrREFBTyxDQUFBO0FBQ1IsQ0FBQyxFQUhVLGlCQUFpQixLQUFqQixpQkFBaUIsUUFHM0I7QUFFRCxNQUFNLG9CQUFvQjtJQUV6QixZQUNVLFlBQWdDLElBQUk7UUFBcEMsY0FBUyxHQUFULFNBQVMsQ0FBMkI7UUFGckMsU0FBSSxxQ0FBNkI7SUFHdEMsQ0FBQztDQUNMO0FBRUQsTUFBTSxvQkFBb0I7SUFHekIsSUFBSSxTQUFTLEtBQWtCLE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FB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