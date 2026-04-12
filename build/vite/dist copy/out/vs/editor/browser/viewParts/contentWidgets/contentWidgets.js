/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as dom from '../../../../base/browser/dom.js';
import { createFastDomNode } from '../../../../base/browser/fastDomNode.js';
import { PartFingerprints, ViewPart } from '../../view/viewPart.js';
/**
 * This view part is responsible for rendering the content widgets, which are
 * used for rendering elements that are associated to an editor position,
 * such as suggestions or the parameter hints.
 */
export class ViewContentWidgets extends ViewPart {
    constructor(context, viewDomNode) {
        super(context);
        this._viewDomNode = viewDomNode;
        this._widgets = {};
        this.domNode = createFastDomNode(document.createElement('div'));
        PartFingerprints.write(this.domNode, 1 /* PartFingerprint.ContentWidgets */);
        this.domNode.setClassName('contentWidgets');
        this.domNode.setPosition('absolute');
        this.domNode.setTop(0);
        this.overflowingContentWidgetsDomNode = createFastDomNode(document.createElement('div'));
        PartFingerprints.write(this.overflowingContentWidgetsDomNode, 2 /* PartFingerprint.OverflowingContentWidgets */);
        this.overflowingContentWidgetsDomNode.setClassName('overflowingContentWidgets');
    }
    dispose() {
        super.dispose();
        this._widgets = {};
    }
    // --- begin event handlers
    onConfigurationChanged(e) {
        const keys = Object.keys(this._widgets);
        for (const widgetId of keys) {
            this._widgets[widgetId].onConfigurationChanged(e);
        }
        return true;
    }
    onDecorationsChanged(e) {
        // true for inline decorations that can end up relayouting text
        return true;
    }
    onFlushed(e) {
        return true;
    }
    onLineMappingChanged(e) {
        this._updateAnchorsViewPositions();
        return true;
    }
    onLinesChanged(e) {
        this._updateAnchorsViewPositions();
        return true;
    }
    onLinesDeleted(e) {
        this._updateAnchorsViewPositions();
        return true;
    }
    onLinesInserted(e) {
        this._updateAnchorsViewPositions();
        return true;
    }
    onScrollChanged(e) {
        return true;
    }
    onZonesChanged(e) {
        return true;
    }
    // ---- end view event handlers
    _updateAnchorsViewPositions() {
        const keys = Object.keys(this._widgets);
        for (const widgetId of keys) {
            this._widgets[widgetId].updateAnchorViewPosition();
        }
    }
    addWidget(_widget) {
        const myWidget = new Widget(this._context, this._viewDomNode, _widget);
        this._widgets[myWidget.id] = myWidget;
        if (myWidget.allowEditorOverflow) {
            this.overflowingContentWidgetsDomNode.appendChild(myWidget.domNode);
        }
        else {
            this.domNode.appendChild(myWidget.domNode);
        }
        this.setShouldRender();
    }
    setWidgetPosition(widget, primaryAnchor, secondaryAnchor, preference, affinity) {
        const myWidget = this._widgets[widget.getId()];
        myWidget.setPosition(primaryAnchor, secondaryAnchor, preference, affinity);
        if (!myWidget.useDisplayNone) {
            this.setShouldRender();
        }
    }
    removeWidget(widget) {
        const widgetId = widget.getId();
        if (this._widgets.hasOwnProperty(widgetId)) {
            const myWidget = this._widgets[widgetId];
            delete this._widgets[widgetId];
            const domNode = myWidget.domNode.domNode;
            domNode.remove();
            domNode.removeAttribute('monaco-visible-content-widget');
            this.setShouldRender();
        }
    }
    shouldSuppressMouseDownOnWidget(widgetId) {
        if (this._widgets.hasOwnProperty(widgetId)) {
            return this._widgets[widgetId].suppressMouseDown;
        }
        return false;
    }
    onBeforeRender(viewportData) {
        const keys = Object.keys(this._widgets);
        for (const widgetId of keys) {
            this._widgets[widgetId].onBeforeRender(viewportData);
        }
    }
    prepareRender(ctx) {
        const keys = Object.keys(this._widgets);
        for (const widgetId of keys) {
            this._widgets[widgetId].prepareRender(ctx);
        }
    }
    render(ctx) {
        const keys = Object.keys(this._widgets);
        for (const widgetId of keys) {
            this._widgets[widgetId].render(ctx);
        }
    }
}
class Widget {
    constructor(context, viewDomNode, actual) {
        this._primaryAnchor = new PositionPair(null, null);
        this._secondaryAnchor = new PositionPair(null, null);
        this._context = context;
        this._viewDomNode = viewDomNode;
        this._actual = actual;
        const options = this._context.configuration.options;
        const layoutInfo = options.get(165 /* EditorOption.layoutInfo */);
        const allowOverflow = options.get(4 /* EditorOption.allowOverflow */);
        this.domNode = createFastDomNode(this._actual.getDomNode());
        this.id = this._actual.getId();
        this.allowEditorOverflow = (this._actual.allowEditorOverflow || false) && allowOverflow;
        this.suppressMouseDown = this._actual.suppressMouseDown || false;
        this.useDisplayNone = this._actual.useDisplayNone || false;
        this._fixedOverflowWidgets = options.get(51 /* EditorOption.fixedOverflowWidgets */);
        this._contentWidth = layoutInfo.contentWidth;
        this._contentLeft = layoutInfo.contentLeft;
        this._affinity = null;
        this._preference = [];
        this._cachedDomNodeOffsetWidth = -1;
        this._cachedDomNodeOffsetHeight = -1;
        this._maxWidth = this._getMaxWidth();
        this._isVisible = false;
        this._renderData = null;
        this.domNode.setPosition((this._fixedOverflowWidgets && this.allowEditorOverflow) ? 'fixed' : 'absolute');
        this.domNode.setDisplay('none');
        this.domNode.setVisibility('hidden');
        this.domNode.setAttribute('widgetId', this.id);
        this.domNode.setMaxWidth(this._maxWidth);
    }
    onConfigurationChanged(e) {
        const options = this._context.configuration.options;
        if (e.hasChanged(165 /* EditorOption.layoutInfo */)) {
            const layoutInfo = options.get(165 /* EditorOption.layoutInfo */);
            this._contentLeft = layoutInfo.contentLeft;
            this._contentWidth = layoutInfo.contentWidth;
            this._maxWidth = this._getMaxWidth();
        }
    }
    updateAnchorViewPosition() {
        this._setPosition(this._affinity, this._primaryAnchor.modelPosition, this._secondaryAnchor.modelPosition);
    }
    _setPosition(affinity, primaryAnchor, secondaryAnchor) {
        this._affinity = affinity;
        this._primaryAnchor = getValidPositionPair(primaryAnchor, this._context.viewModel, this._affinity);
        this._secondaryAnchor = getValidPositionPair(secondaryAnchor, this._context.viewModel, this._affinity);
        function getValidPositionPair(position, viewModel, affinity) {
            if (!position) {
                return new PositionPair(null, null);
            }
            // Do not trust that widgets give a valid position
            const validModelPosition = viewModel.model.validatePosition(position);
            if (viewModel.coordinatesConverter.modelPositionIsVisible(validModelPosition)) {
                const viewPosition = viewModel.coordinatesConverter.convertModelPositionToViewPosition(validModelPosition, affinity ?? undefined);
                return new PositionPair(position, viewPosition);
            }
            return new PositionPair(position, null);
        }
    }
    _getMaxWidth() {
        const elDocument = this.domNode.domNode.ownerDocument;
        const elWindow = elDocument.defaultView;
        return (this.allowEditorOverflow
            ? elWindow?.innerWidth || elDocument.documentElement.offsetWidth || elDocument.body.offsetWidth
            : this._contentWidth);
    }
    setPosition(primaryAnchor, secondaryAnchor, preference, affinity) {
        this._setPosition(affinity, primaryAnchor, secondaryAnchor);
        this._preference = preference;
        if (!this.useDisplayNone && this._primaryAnchor.viewPosition && this._preference && this._preference.length > 0) {
            // this content widget would like to be visible if possible
            // we change it from `display:none` to `display:block` even if it
            // might be outside the viewport such that we can measure its size
            // in `prepareRender`
            this.domNode.setDisplay('block');
        }
        else {
            this.domNode.setDisplay('none');
        }
        this._cachedDomNodeOffsetWidth = -1;
        this._cachedDomNodeOffsetHeight = -1;
    }
    _layoutBoxInViewport(anchor, width, height, ctx) {
        // Our visible box is split horizontally by the current line => 2 boxes
        // a) the box above the line
        const aboveLineTop = anchor.top;
        const heightAvailableAboveLine = aboveLineTop;
        // b) the box under the line
        const underLineTop = anchor.top + anchor.height;
        const heightAvailableUnderLine = ctx.viewportHeight - underLineTop;
        const aboveTop = aboveLineTop - height;
        const fitsAbove = (heightAvailableAboveLine >= height);
        const belowTop = underLineTop;
        const fitsBelow = (heightAvailableUnderLine >= height);
        // And its left
        let left = anchor.left;
        if (left + width > ctx.scrollLeft + ctx.viewportWidth) {
            left = ctx.scrollLeft + ctx.viewportWidth - width;
        }
        if (left < ctx.scrollLeft) {
            left = ctx.scrollLeft;
        }
        return { fitsAbove, aboveTop, fitsBelow, belowTop, left };
    }
    _layoutHorizontalSegmentInPage(windowSize, domNodePosition, left, width) {
        // Leave some clearance to the left/right
        const LEFT_PADDING = 15;
        const RIGHT_PADDING = 15;
        // Initially, the limits are defined as the dom node limits
        const MIN_LIMIT = Math.max(LEFT_PADDING, domNodePosition.left - width);
        const MAX_LIMIT = Math.min(domNodePosition.left + domNodePosition.width + width, windowSize.width - RIGHT_PADDING);
        const elDocument = this._viewDomNode.domNode.ownerDocument;
        const elWindow = elDocument.defaultView;
        let absoluteLeft = domNodePosition.left + left - (elWindow?.scrollX ?? 0);
        if (absoluteLeft + width > MAX_LIMIT) {
            const delta = absoluteLeft - (MAX_LIMIT - width);
            absoluteLeft -= delta;
            left -= delta;
        }
        if (absoluteLeft < MIN_LIMIT) {
            const delta = absoluteLeft - MIN_LIMIT;
            absoluteLeft -= delta;
            left -= delta;
        }
        return [left, absoluteLeft];
    }
    _layoutBoxInPage(anchor, width, height, ctx) {
        const aboveTop = anchor.top - height;
        const belowTop = anchor.top + anchor.height;
        const domNodePosition = dom.getDomNodePagePosition(this._viewDomNode.domNode);
        const elDocument = this._viewDomNode.domNode.ownerDocument;
        const elWindow = elDocument.defaultView;
        const absoluteAboveTop = domNodePosition.top + aboveTop - (elWindow?.scrollY ?? 0);
        const absoluteBelowTop = domNodePosition.top + belowTop - (elWindow?.scrollY ?? 0);
        const windowSize = dom.getClientArea(elDocument.body);
        const [left, absoluteAboveLeft] = this._layoutHorizontalSegmentInPage(windowSize, domNodePosition, anchor.left - ctx.scrollLeft + this._contentLeft, width);
        // Leave some clearance to the top/bottom
        const TOP_PADDING = 22;
        const BOTTOM_PADDING = 22;
        const fitsAbove = (absoluteAboveTop >= TOP_PADDING);
        const fitsBelow = (absoluteBelowTop + height <= windowSize.height - BOTTOM_PADDING);
        if (this._fixedOverflowWidgets) {
            return {
                fitsAbove,
                aboveTop: Math.max(absoluteAboveTop, TOP_PADDING),
                fitsBelow,
                belowTop: absoluteBelowTop,
                left: absoluteAboveLeft
            };
        }
        return { fitsAbove, aboveTop, fitsBelow, belowTop, left };
    }
    _prepareRenderWidgetAtExactPositionOverflowing(topLeft) {
        return new Coordinate(topLeft.top, topLeft.left + this._contentLeft);
    }
    /**
     * Compute the coordinates above and below the primary and secondary anchors.
     * The content widget *must* touch the primary anchor.
     * The content widget should touch if possible the secondary anchor.
     */
    _getAnchorsCoordinates(ctx) {
        const primary = getCoordinates(this._primaryAnchor.viewPosition, this._affinity);
        const secondaryViewPosition = (this._secondaryAnchor.viewPosition?.lineNumber === this._primaryAnchor.viewPosition?.lineNumber ? this._secondaryAnchor.viewPosition : null);
        const secondary = getCoordinates(secondaryViewPosition, this._affinity);
        return { primary, secondary };
        function getCoordinates(position, affinity) {
            if (!position) {
                return null;
            }
            const horizontalPosition = ctx.visibleRangeForPosition(position);
            if (!horizontalPosition) {
                return null;
            }
            // Left-align widgets that should appear :before content
            const left = (position.column === 1 && affinity === 3 /* PositionAffinity.LeftOfInjectedText */ ? 0 : horizontalPosition.left);
            const top = ctx.getVerticalOffsetForLineNumber(position.lineNumber) - ctx.scrollTop;
            const lineHeight = ctx.getLineHeightForLineNumber(position.lineNumber);
            return new AnchorCoordinate(top, left, lineHeight);
        }
    }
    _reduceAnchorCoordinates(primary, secondary, width) {
        if (!secondary) {
            return primary;
        }
        const fontInfo = this._context.configuration.options.get(59 /* EditorOption.fontInfo */);
        let left = secondary.left;
        if (left < primary.left) {
            left = Math.max(left, primary.left - width + fontInfo.typicalFullwidthCharacterWidth);
        }
        else {
            left = Math.min(left, primary.left + width - fontInfo.typicalFullwidthCharacterWidth);
        }
        return new AnchorCoordinate(primary.top, left, primary.height);
    }
    _prepareRenderWidget(ctx) {
        if (!this._preference || this._preference.length === 0) {
            return null;
        }
        const { primary, secondary } = this._getAnchorsCoordinates(ctx);
        if (!primary) {
            return {
                kind: 'offViewport',
                preserveFocus: this.domNode.domNode.contains(this.domNode.domNode.ownerDocument.activeElement)
            };
            // return null;
        }
        if (this._cachedDomNodeOffsetWidth === -1 || this._cachedDomNodeOffsetHeight === -1) {
            let preferredDimensions = null;
            if (typeof this._actual.beforeRender === 'function') {
                preferredDimensions = safeInvoke(this._actual.beforeRender, this._actual);
            }
            if (preferredDimensions) {
                this._cachedDomNodeOffsetWidth = preferredDimensions.width;
                this._cachedDomNodeOffsetHeight = preferredDimensions.height;
            }
            else {
                const domNode = this.domNode.domNode;
                const clientRect = domNode.getBoundingClientRect();
                this._cachedDomNodeOffsetWidth = Math.round(clientRect.width);
                this._cachedDomNodeOffsetHeight = Math.round(clientRect.height);
            }
        }
        const anchor = this._reduceAnchorCoordinates(primary, secondary, this._cachedDomNodeOffsetWidth);
        let placement;
        if (this.allowEditorOverflow) {
            placement = this._layoutBoxInPage(anchor, this._cachedDomNodeOffsetWidth, this._cachedDomNodeOffsetHeight, ctx);
        }
        else {
            placement = this._layoutBoxInViewport(anchor, this._cachedDomNodeOffsetWidth, this._cachedDomNodeOffsetHeight, ctx);
        }
        // Do two passes, first for perfect fit, second picks first option
        for (let pass = 1; pass <= 2; pass++) {
            for (const pref of this._preference) {
                // placement
                if (pref === 1 /* ContentWidgetPositionPreference.ABOVE */) {
                    if (!placement) {
                        // Widget outside of viewport
                        return null;
                    }
                    if (pass === 2 || placement.fitsAbove) {
                        return {
                            kind: 'inViewport',
                            coordinate: new Coordinate(placement.aboveTop, placement.left),
                            position: 1 /* ContentWidgetPositionPreference.ABOVE */
                        };
                    }
                }
                else if (pref === 2 /* ContentWidgetPositionPreference.BELOW */) {
                    if (!placement) {
                        // Widget outside of viewport
                        return null;
                    }
                    if (pass === 2 || placement.fitsBelow) {
                        return {
                            kind: 'inViewport',
                            coordinate: new Coordinate(placement.belowTop, placement.left),
                            position: 2 /* ContentWidgetPositionPreference.BELOW */
                        };
                    }
                }
                else {
                    if (this.allowEditorOverflow) {
                        return {
                            kind: 'inViewport',
                            coordinate: this._prepareRenderWidgetAtExactPositionOverflowing(new Coordinate(anchor.top, anchor.left)),
                            position: 0 /* ContentWidgetPositionPreference.EXACT */
                        };
                    }
                    else {
                        return {
                            kind: 'inViewport',
                            coordinate: new Coordinate(anchor.top, anchor.left),
                            position: 0 /* ContentWidgetPositionPreference.EXACT */
                        };
                    }
                }
            }
        }
        return null;
    }
    /**
     * On this first pass, we ensure that the content widget (if it is in the viewport) has the max width set correctly.
     */
    onBeforeRender(viewportData) {
        if (!this._primaryAnchor.viewPosition || !this._preference) {
            return;
        }
        if (this._primaryAnchor.viewPosition.lineNumber < viewportData.startLineNumber || this._primaryAnchor.viewPosition.lineNumber > viewportData.endLineNumber) {
            // Outside of viewport
            return;
        }
        this.domNode.setMaxWidth(this._maxWidth);
    }
    prepareRender(ctx) {
        this._renderData = this._prepareRenderWidget(ctx);
    }
    render(ctx) {
        if (!this._renderData || this._renderData.kind === 'offViewport') {
            // This widget should be invisible
            if (this._isVisible) {
                this.domNode.removeAttribute('monaco-visible-content-widget');
                this._isVisible = false;
                if (this._renderData?.kind === 'offViewport' && this._renderData.preserveFocus) {
                    // widget wants to be shown, but it is outside of the viewport and it
                    // has focus which we need to preserve
                    this.domNode.setTop(-1000);
                }
                else {
                    this.domNode.setVisibility('hidden');
                }
            }
            if (typeof this._actual.afterRender === 'function') {
                safeInvoke(this._actual.afterRender, this._actual, null, null);
            }
            return;
        }
        // This widget should be visible
        if (this.allowEditorOverflow) {
            this.domNode.setTop(this._renderData.coordinate.top);
            this.domNode.setLeft(this._renderData.coordinate.left);
        }
        else {
            this.domNode.setTop(this._renderData.coordinate.top + ctx.scrollTop - ctx.bigNumbersDelta);
            this.domNode.setLeft(this._renderData.coordinate.left);
        }
        if (!this._isVisible) {
            this.domNode.setVisibility('inherit');
            this.domNode.setAttribute('monaco-visible-content-widget', 'true');
            this._isVisible = true;
        }
        if (typeof this._actual.afterRender === 'function') {
            safeInvoke(this._actual.afterRender, this._actual, this._renderData.position, this._renderData.coordinate);
        }
    }
}
class PositionPair {
    constructor(modelPosition, viewPosition) {
        this.modelPosition = modelPosition;
        this.viewPosition = viewPosition;
    }
}
class Coordinate {
    constructor(top, left) {
        this.top = top;
        this.left = left;
        this._coordinateBrand = undefined;
    }
}
class AnchorCoordinate {
    constructor(top, left, height) {
        this.top = top;
        this.left = left;
        this.height = height;
        this._anchorCoordinateBrand = undefined;
    }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeInvoke(fn, thisArg, ...args) {
    try {
        return fn.call(thisArg, ...args);
    }
    catch {
        // ignore
        return null;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGVudFdpZGdldHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvYnJvd3Nlci92aWV3UGFydHMvY29udGVudFdpZGdldHMvY29udGVudFdpZGdldHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RCxPQUFPLEVBQWUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUV6RixPQUFPLEVBQW1CLGdCQUFnQixFQUFFLFFBQVEsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBV3JGOzs7O0dBSUc7QUFDSCxNQUFNLE9BQU8sa0JBQW1CLFNBQVEsUUFBUTtJQVEvQyxZQUFZLE9BQW9CLEVBQUUsV0FBcUM7UUFDdEUsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ2YsSUFBSSxDQUFDLFlBQVksR0FBRyxXQUFXLENBQUM7UUFDaEMsSUFBSSxDQUFDLFFBQVEsR0FBRyxFQUFFLENBQUM7UUFFbkIsSUFBSSxDQUFDLE9BQU8sR0FBRyxpQkFBaUIsQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDaEUsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxPQUFPLHlDQUFpQyxDQUFDO1FBQ3JFLElBQUksQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDNUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDckMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFdkIsSUFBSSxDQUFDLGdDQUFnQyxHQUFHLGlCQUFpQixDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUN6RixnQkFB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