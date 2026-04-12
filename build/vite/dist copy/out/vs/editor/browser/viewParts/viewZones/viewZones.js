/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createFastDomNode } from '../../../../base/browser/fastDomNode.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { ViewPart } from '../../view/viewPart.js';
import { Position } from '../../../common/core/position.js';
const invalidFunc = () => { throw new Error(`Invalid change accessor`); };
/**
 * A view zone is a rectangle that is a section that is inserted into the editor
 * lines that can be used for various purposes such as showing a diffs, peeking
 * an implementation, etc.
 */
export class ViewZones extends ViewPart {
    constructor(context) {
        super(context);
        const options = this._context.configuration.options;
        const layoutInfo = options.get(165 /* EditorOption.layoutInfo */);
        this._lineHeight = options.get(75 /* EditorOption.lineHeight */);
        this._contentWidth = layoutInfo.contentWidth;
        this._contentLeft = layoutInfo.contentLeft;
        this.domNode = createFastDomNode(document.createElement('div'));
        this.domNode.setClassName('view-zones');
        this.domNode.setPosition('absolute');
        this.domNode.setAttribute('role', 'presentation');
        this.domNode.setAttribute('aria-hidden', 'true');
        this.marginDomNode = createFastDomNode(document.createElement('div'));
        this.marginDomNode.setClassName('margin-view-zones');
        this.marginDomNode.setPosition('absolute');
        this.marginDomNode.setAttribute('role', 'presentation');
        this.marginDomNode.setAttribute('aria-hidden', 'true');
        this._zones = {};
    }
    dispose() {
        super.dispose();
        this._zones = {};
    }
    // ---- begin view event handlers
    _recomputeWhitespacesProps() {
        const whitespaces = this._context.viewLayout.getWhitespaces();
        const oldWhitespaces = new Map();
        for (const whitespace of whitespaces) {
            oldWhitespaces.set(whitespace.id, whitespace);
        }
        let hadAChange = false;
        this._context.viewModel.changeWhitespace((whitespaceAccessor) => {
            const keys = Object.keys(this._zones);
            for (let i = 0, len = keys.length; i < len; i++) {
                const id = keys[i];
                const zone = this._zones[id];
                const props = this._computeWhitespaceProps(zone.delegate);
                zone.isInHiddenArea = props.isInHiddenArea;
                const oldWhitespace = oldWhitespaces.get(id);
                if (oldWhitespace && (oldWhitespace.afterLineNumber !== props.afterViewLineNumber || oldWhitespace.height !== props.heightInPx)) {
                    whitespaceAccessor.changeOneWhitespace(id, props.afterViewLineNumber, props.heightInPx);
                    this._safeCallOnComputedHeight(zone.delegate, props.heightInPx);
                    hadAChange = true;
                }
            }
        });
        return hadAChange;
    }
    onConfigurationChanged(e) {
        const options = this._context.configuration.options;
        const layoutInfo = options.get(165 /* EditorOption.layoutInfo */);
        this._lineHeight = options.get(75 /* EditorOption.lineHeight */);
        this._contentWidth = layoutInfo.contentWidth;
        this._contentLeft = layoutInfo.contentLeft;
        if (e.hasChanged(75 /* EditorOption.lineHeight */)) {
            this._recomputeWhitespacesProps();
        }
        return true;
    }
    onLineMappingChanged(e) {
        return this._recomputeWhitespacesProps();
    }
    onLinesDeleted(e) {
        return true;
    }
    onScrollChanged(e) {
        return e.scrollTopChanged || e.scrollWidthChanged;
    }
    onZonesChanged(e) {
        return true;
    }
    onLinesInserted(e) {
        return true;
    }
    // ---- end view event handlers
    _getZoneOrdinal(zone) {
        return zone.ordinal ?? zone.afterColumn ?? 10000;
    }
    _computeWhitespaceProps(zone) {
        if (zone.afterLineNumber === 0) {
            return {
                isInHiddenArea: false,
                afterViewLineNumber: 0,
                heightInPx: this._heightInPixels(zone),
                minWidthInPx: this._minWidthInPixels(zone)
            };
        }
        let zoneAfterModelPosition;
        if (typeof zone.afterColumn !== 'undefined') {
            zoneAfterModelPosition = this._context.viewModel.model.validatePosition({
                lineNumber: zone.afterLineNumber,
                column: zone.afterColumn
            });
        }
        else {
            const validAfterLineNumber = this._context.viewModel.model.validatePosition({
                lineNumber: zone.afterLineNumber,
                column: 1
            }).lineNumber;
            zoneAfterModelPosition = new Position(validAfterLineNumber, this._context.viewModel.model.getLineMaxColumn(validAfterLineNumber));
        }
        let zoneBeforeModelPosition;
        if (zoneAfterModelPosition.column === this._context.viewModel.model.getLineMaxColumn(zoneAfterModelPosition.lineNumber)) {
            zoneBeforeModelPosition = this._context.viewModel.model.validatePosition({
                lineNumber: zoneAfterModelPosition.lineNumber + 1,
                column: 1
            });
        }
        else {
            zoneBeforeModelPosition = this._context.viewModel.model.validatePosition({
                lineNumber: zoneAfterModelPosition.lineNumber,
                column: zoneAfterModelPosition.column + 1
            });
        }
        const viewPosition = this._context.viewModel.coordinatesConverter.convertModelPositionToViewPosition(zoneAfterModelPosition, zone.afterColumnAffinity, true);
        const isVisible = zone.showInHiddenAreas || this._context.viewModel.coordinatesConverter.modelPositionIsVisible(zoneBeforeModelPosition);
        return {
            isInHiddenArea: !isVisible,
            afterViewLineNumber: viewPosition.lineNumber,
            heightInPx: (isVisible ? this._heightInPixels(zone) : 0),
            minWidthInPx: this._minWidthInPixels(zone)
        };
    }
    changeViewZones(callback) {
        let zonesHaveChanged = false;
        this._context.viewModel.changeWhitespace((whitespaceAccessor) => {
            const changeAccessor = {
                addZone: (zone) => {
                    zonesHaveChanged = true;
                    return this._addZone(whitespaceAccessor, zone);
                },
                removeZone: (id) => {
                    if (!id) {
                        return;
                    }
                    zonesHaveChanged = this._removeZone(whitespaceAccessor, id) || zonesHaveChanged;
                },
                layoutZone: (id) => {
                    if (!id) {
                        return;
                    }
                    zonesHaveChanged = this._layoutZone(whitespaceAccessor, id) || zonesHaveChanged;
                }
            };
            safeInvoke1Arg(callback, changeAccessor);
            // Invalidate changeAccessor
            changeAccessor.addZone = invalidFunc;
            changeAccessor.removeZone = invalidFunc;
            changeAccessor.layoutZone = invalidFunc;
        });
        return zonesHaveChanged;
    }
    _addZone(whitespaceAccessor, zone) {
        const props = this._computeWhitespaceProps(zone);
        const whitespaceId = whitespaceAccessor.insertWhitespace(props.afterViewLineNumber, this._getZoneOrdinal(zone), props.heightInPx, props.minWidthInPx);
        const myZone = {
            whitespaceId: whitespaceId,
            delegate: zone,
            isInHiddenArea: props.isInHiddenArea,
            isVisible: false,
            domNode: createFastDomNode(zone.domNode),
            marginDomNode: zone.marginDomNode ? createFastDomNode(zone.marginDomNode) : null
        };
        this._safeCallOnComputedHeight(myZone.delegate, props.heightInPx);
        myZone.domNode.setPosition('absolute');
        myZone.domNode.domNode.style.width = '100%';
        myZone.domNode.setDisplay('none');
        myZone.domNode.setAttribute('monaco-view-zone', myZone.whitespaceId);
        this.domNode.appendChild(myZone.domNode);
        if (myZone.marginDomNode) {
            myZone.marginDomNode.setPosition('absolute');
            myZone.marginDomNode.domNode.style.width = '100%';
            myZone.marginDomNode.setDisplay('none');
            myZone.marginDomNode.setAttribute('monaco-view-zone', myZone.whitespaceId);
            this.marginDomNode.appendChild(myZone.marginDomNode);
        }
        this._zones[myZone.whitespaceId] = myZone;
        this.setShouldRender();
        return myZone.whitespaceId;
    }
    _removeZone(whitespaceAccessor, id) {
        if (this._zones.hasOwnProperty(id)) {
            const zone = this._zones[id];
            delete this._zones[id];
            whitespaceAccessor.removeWhitespace(zone.whitespaceId);
            zone.domNode.removeAttribute('monaco-visible-view-zone');
            zone.domNode.removeAttribute('monaco-view-zone');
            zone.domNode.domNode.remove();
            if (zone.marginDomNode) {
                zone.marginDomNode.removeAttribute('monaco-visible-view-zone');
                zone.marginDomNode.removeAttribute('monaco-view-zone');
                zone.marginDomNode.domNode.remove();
            }
            this.setShouldRender();
            return true;
        }
        return false;
    }
    _layoutZone(whitespaceAccessor, id) {
        if (this._zones.hasOwnProperty(id)) {
            const zone = this._zones[id];
            const props = this._computeWhitespaceProps(zone.delegate);
            zone.isInHiddenArea = props.isInHiddenArea;
            // const newOrdinal = this._getZoneOrdinal(zone.delegate);
            whitespaceAccessor.changeOneWhitespace(zone.whitespaceId, props.afterViewLineNumber, props.heightInPx);
            // TODO@Alex: change `newOrdinal` too
            this._safeCallOnComputedHeight(zone.delegate, props.heightInPx);
            this.setShouldRender();
            return true;
        }
        return false;
    }
    shouldSuppressMouseDownOnViewZone(id) {
        if (this._zones.hasOwnProperty(id)) {
            const zone = this._zones[id];
            return Boolean(zone.delegate.suppressMouseDown);
        }
        return false;
    }
    _heightInPixels(zone) {
        if (typeof zone.heightInPx === 'number') {
            return zone.heightInPx;
        }
        if (typeof zone.heightInLines === 'number') {
            return this._lineHeight * zone.heightInLines;
        }
        return this._lineHeight;
    }
    _minWidthInPixels(zone) {
        if (typeof zone.minWidthInPx === 'number') {
            return zone.minWidthInPx;
        }
        return 0;
    }
    _safeCallOnComputedHeight(zone, height) {
        if (typeof zone.onComputedHeight === 'function') {
            try {
                zone.onComputedHeight(height);
            }
            catch (e) {
                onUnexpectedError(e);
            }
        }
    }
    _safeCallOnDomNodeTop(zone, top) {
        if (typeof zone.onDomNodeTop === 'function') {
            try {
                zone.onDomNodeTop(top);
            }
            catch (e) {
                onUnexpectedError(e);
            }
        }
    }
    prepareRender(ctx) {
        // Nothing to read
    }
    render(ctx) {
        const visibleWhitespaces = ctx.viewportData.whitespaceViewportData;
        const visibleZones = {};
        let hasVisibleZone = false;
        for (const visibleWhitespace of visibleWhitespaces) {
            if (this._zones[visibleWhitespace.id].isInHiddenArea) {
                continue;
            }
            visibleZones[visibleWhitespace.id] = visibleWhitespace;
            hasVisibleZone = true;
        }
        const keys = Object.keys(this._zones);
        for (let i = 0, len = keys.length; i < len; i++) {
            const id = keys[i];
            const zone = this._zones[id];
            let newTop = 0;
            let newHeight = 0;
            let newDisplay = 'none';
            if (visibleZones.hasOwnProperty(id)) {
                newTop = visibleZones[id].verticalOffset - ctx.bigNumbersDelta;
                newHeight = visibleZones[id].height;
                newDisplay = 'block';
                // zone is visible
                if (!zone.isVisible) {
                    zone.domNode.setAttribute('monaco-visible-view-zone', 'true');
                    zone.isVisible = true;
                }
                this._safeCallOnDomNodeTop(zone.delegate, ctx.getScrolledTopFromAbsoluteTop(visibleZones[id].verticalOffset));
            }
            else {
                if (zone.isVisible) {
                    zone.domNode.removeAttribute('monaco-visible-view-zone');
                    zone.isVisible = false;
                }
                this._safeCallOnDomNodeTop(zone.delegate, ctx.getScrolledTopFromAbsoluteTop(-1000000));
            }
            zone.domNode.setTop(newTop);
            zone.domNode.setHeight(newHeight);
            zone.domNode.setDisplay(newDisplay);
            if (zone.marginDomNode) {
                zone.marginDomNode.setTop(newTop);
                zone.marginDomNode.setHeight(newHeight);
                zone.marginDomNode.setDisplay(newDisplay);
            }
        }
        if (hasVisibleZone) {
            this.domNode.setWidth(Math.max(ctx.scrollWidth, this._contentWidth));
            this.marginDomNode.setWidth(this._contentLeft);
        }
    }
}
function safeInvoke1Arg(func, arg1) {
    try {
        return func(arg1);
    }
    catch (e) {
        onUnexpectedError(e);
        return undefined;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlld1pvbmVzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2Jyb3dzZXIvdmlld1BhcnRzL3ZpZXdab25lcy92aWV3Wm9uZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFlLGlCQUFpQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDekYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFdEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQ2xELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQXVCNUQsTUFBTSxXQUFXLEdBQUcsR0FBRyxFQUFFLEdBQUcsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBRTFFOzs7O0dBSUc7QUFDSCxNQUFNLE9BQU8sU0FBVSxTQUFRLFFBQVE7SUFXdEMsWUFBWSxPQUFvQjtRQUMvQixLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDZixNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUM7UUFDcEQsTUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDLEdBQUcsbUNBQXlCLENBQUM7UUFFeEQsSUFBSSxDQUFDLFdBQVcsR0FBRyxPQUFPLENBQUMsR0FBRyxrQ0FBeUIsQ0FBQztRQUN4RCxJQUFJLENBQUMsYUFBYSxHQUFHLFVBQVUsQ0FBQyxZQUFZLENBQUM7UUFDN0MsSUFBSSxDQUFDLFlBQVksR0FBRyxVQUFVLENBQUMsV0FBVyxDQUFDO1FBRTNDLElBQUksQ0FBQyxPQUFPLEdBQUcsaUJBQWlCLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQ2hFLElBQUksQ0FBQyxPQUFP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