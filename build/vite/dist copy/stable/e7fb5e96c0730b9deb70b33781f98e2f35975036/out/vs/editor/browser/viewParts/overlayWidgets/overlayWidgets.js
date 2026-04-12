/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import './overlayWidgets.css';
import { createFastDomNode } from '../../../../base/browser/fastDomNode.js';
import { PartFingerprints, ViewPart } from '../../view/viewPart.js';
import * as dom from '../../../../base/browser/dom.js';
/*
 * This view part for rendering the overlay widgets, which are
 * floating widgets positioned based on the editor's viewport,
 * such as the find widget.
 */
export class ViewOverlayWidgets extends ViewPart {
    constructor(context, viewDomNode) {
        super(context);
        this._viewDomNode = viewDomNode;
        const options = this._context.configuration.options;
        const layoutInfo = options.get(165 /* EditorOption.layoutInfo */);
        this._widgets = {};
        this._verticalScrollbarWidth = layoutInfo.verticalScrollbarWidth;
        this._minimapWidth = layoutInfo.minimap.minimapWidth;
        this._horizontalScrollbarHeight = layoutInfo.horizontalScrollbarHeight;
        this._editorHeight = layoutInfo.height;
        this._editorWidth = layoutInfo.width;
        this._viewDomNodeRect = { top: 0, left: 0, width: 0, height: 0 };
        this._domNode = createFastDomNode(document.createElement('div'));
        PartFingerprints.write(this._domNode, 4 /* PartFingerprint.OverlayWidgets */);
        this._domNode.setClassName('overlayWidgets');
        this.overflowingOverlayWidgetsDomNode = createFastDomNode(document.createElement('div'));
        PartFingerprints.write(this.overflowingOverlayWidgetsDomNode, 5 /* PartFingerprint.OverflowingOverlayWidgets */);
        this.overflowingOverlayWidgetsDomNode.setClassName('overflowingOverlayWidgets');
    }
    dispose() {
        super.dispose();
        this._widgets = {};
    }
    getDomNode() {
        return this._domNode;
    }
    // ---- begin view event handlers
    onConfigurationChanged(e) {
        const options = this._context.configuration.options;
        const layoutInfo = options.get(165 /* EditorOption.layoutInfo */);
        this._verticalScrollbarWidth = layoutInfo.verticalScrollbarWidth;
        this._minimapWidth = layoutInfo.minimap.minimapWidth;
        this._horizontalScrollbarHeight = layoutInfo.horizontalScrollbarHeight;
        this._editorHeight = layoutInfo.height;
        this._editorWidth = layoutInfo.width;
        return true;
    }
    // ---- end view event handlers
    _widgetCanOverflow(widget) {
        const options = this._context.configuration.options;
        const allowOverflow = options.get(4 /* EditorOption.allowOverflow */);
        return (widget.allowEditorOverflow || false) && allowOverflow;
    }
    addWidget(widget) {
        const domNode = createFastDomNode(widget.getDomNode());
        this._widgets[widget.getId()] = {
            widget: widget,
            preference: null,
            domNode: domNode
        };
        // This is sync because a widget wants to be in the dom
        domNode.setPosition('absolute');
        domNode.setAttribute('widgetId', widget.getId());
        if (this._widgetCanOverflow(widget)) {
            this.overflowingOverlayWidgetsDomNode.appendChild(domNode);
        }
        else {
            this._domNode.appendChild(domNode);
        }
        this.setShouldRender();
        this._updateMaxMinWidth();
    }
    setWidgetPosition(widget, position) {
        const widgetData = this._widgets[widget.getId()];
        const preference = position ? position.preference : null;
        const stack = position?.stackOrdinal;
        if (widgetData.preference === preference && widgetData.stack === stack) {
            this._updateMaxMinWidth();
            return false;
        }
        widgetData.preference = preference;
        widgetData.stack = stack;
        this.setShouldRender();
        this._updateMaxMinWidth();
        return true;
    }
    removeWidget(widget) {
        const widgetId = widget.getId();
        if (this._widgets.hasOwnProperty(widgetId)) {
            const widgetData = this._widgets[widgetId];
            const domNode = widgetData.domNode.domNode;
            delete this._widgets[widgetId];
            domNode.remove();
            this.setShouldRender();
            this._updateMaxMinWidth();
        }
    }
    _updateMaxMinWidth() {
        let maxMinWidth = 0;
        const keys = Object.keys(this._widgets);
        for (let i = 0, len = keys.length; i < len; i++) {
            const widgetId = keys[i];
            const widget = this._widgets[widgetId];
            const widgetMinWidthInPx = widget.widget.getMinContentWidthInPx?.();
            if (typeof widgetMinWidthInPx !== 'undefined') {
                maxMinWidth = Math.max(maxMinWidth, widgetMinWidthInPx);
            }
        }
        this._context.viewLayout.setOverlayWidgetsMinWidth(maxMinWidth);
    }
    _renderWidget(widgetData, stackCoordinates) {
        const domNode = widgetData.domNode;
        if (widgetData.preference === null) {
            domNode.setTop('');
            return;
        }
        const maxRight = (2 * this._verticalScrollbarWidth) + this._minimapWidth;
        if (widgetData.preference === 0 /* OverlayWidgetPositionPreference.TOP_RIGHT_CORNER */ || widgetData.preference === 1 /* OverlayWidgetPositionPreference.BOTTOM_RIGHT_CORNER */) {
            if (widgetData.preference === 1 /* OverlayWidgetPositionPreference.BOTTOM_RIGHT_CORNER */) {
                const widgetHeight = domNode.domNode.clientHeight;
                domNode.setTop((this._editorHeight - widgetHeight - 2 * this._horizontalScrollbarHeight));
            }
            else {
                domNode.setTop(0);
            }
            if (widgetData.stack !== undefined) {
                domNode.setTop(stackCoordinates[widgetData.preference]);
                stackCoordinates[widgetData.preference] += domNode.domNode.clientWidth;
            }
            else {
                domNode.setRight(maxRight);
            }
        }
        else if (widgetData.preference === 2 /* OverlayWidgetPositionPreference.TOP_CENTER */) {
            domNode.domNode.style.right = '50%';
            if (widgetData.stack !== undefined) {
                domNode.setTop(stackCoordinates[2 /* OverlayWidgetPositionPreference.TOP_CENTER */]);
                stackCoordinates[2 /* OverlayWidgetPositionPreference.TOP_CENTER */] += domNode.domNode.clientHeight;
            }
            else {
                domNode.setTop(0);
            }
        }
        else {
            const { top, left } = widgetData.preference;
            const fixedOverflowWidgets = this._context.configuration.options.get(51 /* EditorOption.fixedOverflowWidgets */);
            if (fixedOverflowWidgets && this._widgetCanOverflow(widgetData.widget)) {
                // top, left are computed relative to the editor and we need them relative to the page
                const editorBoundingBox = this._viewDomNodeRect;
                domNode.setTop(top + editorBoundingBox.top);
                domNode.setLeft(left + editorBoundingBox.left);
                domNode.setPosition('fixed');
            }
            else {
                domNode.setTop(top);
                domNode.setLeft(left);
                domNode.setPosition('absolute');
            }
        }
    }
    prepareRender(ctx) {
        this._viewDomNodeRect = dom.getDomNodePagePosition(this._viewDomNode.domNode);
    }
    render(ctx) {
        this._domNode.setWidth(this._editorWidth);
        const keys = Object.keys(this._widgets);
        const stackCoordinates = Array.from({ length: 2 /* OverlayWidgetPositionPreference.TOP_CENTER */ + 1 }, () => 0);
        keys.sort((a, b) => (this._widgets[a].stack || 0) - (this._widgets[b].stack || 0));
        for (let i = 0, len = keys.length; i < len; i++) {
            const widgetId = keys[i];
            this._renderWidget(this._widgets[widgetId], stackCoordinates);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3ZlcmxheVdpZGdldHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvYnJvd3Nlci92aWV3UGFydHMvb3ZlcmxheVdpZGdldHMvb3ZlcmxheVdpZGdldHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxzQkFBc0IsQ0FBQztBQUM5QixPQUFPLEVBQWUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUV6RixPQUFPLEVBQW1CLGdCQUFnQixFQUFFLFFBQVEsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBS3JGLE9BQU8sS0FBSyxHQUFHLE1BQU0saUNBQWlDLENBQUM7QUFjdkQ7Ozs7R0FJRztBQUNILE1BQU0sT0FBTyxrQkFBbUIsU0FBUSxRQUFRO0lBYS9DLFlBQVksT0FBb0IsRUFBRSxXQUFxQztRQUN0RSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDZixJQUFJLENBQUMsWUFBWSxHQUFHLFdBQVcsQ0FBQztRQUVoQyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUM7UUFDcEQsTUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDLEdBQUcsbUNBQXlCLENBQUM7UUFFeEQsSUFBSSxDQUFDLFFBQVEsR0FBRyxFQUFFLENBQUM7UUFDbkIsSUFBSSxDQUFDLHVCQUF1QixHQUFHLFVBQVUsQ0FBQyxzQkFBc0IsQ0FBQztRQUNqRSxJQUFJLENBQUMsYUFBYSxHQUFHLFVBQVUsQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDO1FBQ3JELElBQUksQ0FBQywwQkFBMEIsR0FBRyxVQUFVLENBQUMseUJBQXlCLENBQUM7UUFDdkUsSUFBSSxDQUFDLGFBQWEsR0FBRyxVQUFVLENBQUMsTUFBTSxDQUFDO1FBQ3ZDLElBQUksQ0FBQyxZQUFZLEdBQUcsVUFBVSxDQUFDLEtBQUssQ0FB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