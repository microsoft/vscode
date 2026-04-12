/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createFastDomNode } from '../../../../base/browser/fastDomNode.js';
import { OverviewZoneManager } from '../../../common/viewModel/overviewZoneManager.js';
import { ViewEventHandler } from '../../../common/viewEventHandler.js';
/**
 * The overview ruler appears underneath the editor scroll bar and shows things
 * like the cursor, various decorations, etc.
 */
export class OverviewRuler extends ViewEventHandler {
    constructor(context, cssClassName) {
        super();
        this._context = context;
        const options = this._context.configuration.options;
        this._domNode = createFastDomNode(document.createElement('canvas'));
        this._domNode.setClassName(cssClassName);
        this._domNode.setPosition('absolute');
        this._domNode.setLayerHinting(true);
        this._domNode.setContain('strict');
        this._zoneManager = new OverviewZoneManager((lineNumber) => this._context.viewLayout.getVerticalOffsetForLineNumber(lineNumber));
        this._zoneManager.setDOMWidth(0);
        this._zoneManager.setDOMHeight(0);
        this._zoneManager.setOuterHeight(this._context.viewLayout.getScrollHeight());
        this._zoneManager.setLineHeight(options.get(75 /* EditorOption.lineHeight */));
        this._zoneManager.setPixelRatio(options.get(163 /* EditorOption.pixelRatio */));
        this._context.addEventHandler(this);
    }
    dispose() {
        this._context.removeEventHandler(this);
        super.dispose();
    }
    // ---- begin view event handlers
    onConfigurationChanged(e) {
        const options = this._context.configuration.options;
        if (e.hasChanged(75 /* EditorOption.lineHeight */)) {
            this._zoneManager.setLineHeight(options.get(75 /* EditorOption.lineHeight */));
            this._render();
        }
        if (e.hasChanged(163 /* EditorOption.pixelRatio */)) {
            this._zoneManager.setPixelRatio(options.get(163 /* EditorOption.pixelRatio */));
            this._domNode.setWidth(this._zoneManager.getDOMWidth());
            this._domNode.setHeight(this._zoneManager.getDOMHeight());
            this._domNode.domNode.width = this._zoneManager.getCanvasWidth();
            this._domNode.domNode.height = this._zoneManager.getCanvasHeight();
            this._render();
        }
        return true;
    }
    onFlushed(e) {
        this._render();
        return true;
    }
    onScrollChanged(e) {
        if (e.scrollHeightChanged) {
            this._zoneManager.setOuterHeight(e.scrollHeight);
            this._render();
        }
        return true;
    }
    onZonesChanged(e) {
        this._render();
        return true;
    }
    // ---- end view event handlers
    getDomNode() {
        return this._domNode.domNode;
    }
    setLayout(position) {
        this._domNode.setTop(position.top);
        this._domNode.setRight(position.right);
        let hasChanged = false;
        hasChanged = this._zoneManager.setDOMWidth(position.width) || hasChanged;
        hasChanged = this._zoneManager.setDOMHeight(position.height) || hasChanged;
        if (hasChanged) {
            this._domNode.setWidth(this._zoneManager.getDOMWidth());
            this._domNode.setHeight(this._zoneManager.getDOMHeight());
            this._domNode.domNode.width = this._zoneManager.getCanvasWidth();
            this._domNode.domNode.height = this._zoneManager.getCanvasHeight();
            this._render();
        }
    }
    setZones(zones) {
        this._zoneManager.setZones(zones);
        this._render();
    }
    _render() {
        if (this._zoneManager.getOuterHeight() === 0) {
            return false;
        }
        const width = this._zoneManager.getCanvasWidth();
        const height = this._zoneManager.getCanvasHeight();
        const colorZones = this._zoneManager.resolveColorZones();
        const id2Color = this._zoneManager.getId2Color();
        const ctx = this._domNode.domNode.getContext('2d');
        ctx.clearRect(0, 0, width, height);
        if (colorZones.length > 0) {
            this._renderOneLane(ctx, colorZones, id2Color, width);
        }
        return true;
    }
    _renderOneLane(ctx, colorZones, id2Color, width) {
        let currentColorId = 0; // will never match a real color id which is > 0
        let currentFrom = 0;
        let currentTo = 0;
        for (const zone of colorZones) {
            const zoneColorId = zone.colorId;
            const zoneFrom = zone.from;
            const zoneTo = zone.to;
            if (zoneColorId !== currentColorId) {
                if (currentColorId !== 0) {
                    ctx.fillRect(0, currentFrom, width, currentTo - currentFrom);
                }
                currentColorId = zoneColorId;
                ctx.fillStyle = id2Color[currentColorId];
                currentFrom = zoneFrom;
                currentTo = zoneTo;
            }
            else {
                if (currentTo >= zoneFrom) {
                    currentTo = Math.max(currentTo, zoneTo);
                }
                else {
                    ctx.fillRect(0, currentFrom, width, currentTo - currentFrom);
                    currentFrom = zoneFrom;
                    currentTo = zoneTo;
                }
            }
        }
        ctx.fillRect(0, currentFrom, width, currentTo - currentFrom);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3ZlcnZpZXdSdWxlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9icm93c2VyL3ZpZXdQYXJ0cy9vdmVydmlld1J1bGVyL292ZXJ2aWV3UnVsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFlLGlCQUFpQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFHekYsT0FBTyxFQUFnQyxtQkFBbUIsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBR3JILE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRXZFOzs7R0FHRztBQUNILE1BQU0sT0FBTyxhQUFjLFNBQVEsZ0JBQWdCO0lBTWxELFlBQVksT0FBb0IsRUFBRSxZQUFvQjtRQUNyRCxLQUFLLEVBQUUsQ0FBQztRQUNSLElBQUksQ0FBQyxRQUFRLEdBQUcsT0FBTyxDQUFDO1FBQ3hCLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQztRQUVwRCxJQUFJLENBQUMsUUFBUSxHQUFHLGlCQUFpQixDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztRQUNwRSxJQUFJLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUN6QyxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUN0QyxJQUFJLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNwQyxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUVuQyxJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksbUJBQW1CLENBQUMsQ0FBQyxVQUFrQixFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFD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