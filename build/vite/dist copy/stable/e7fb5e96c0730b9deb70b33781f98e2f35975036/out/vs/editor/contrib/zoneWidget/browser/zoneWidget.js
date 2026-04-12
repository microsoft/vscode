/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as dom from '../../../../base/browser/dom.js';
import * as domStylesheetsJs from '../../../../base/browser/domStylesheets.js';
import { Sash } from '../../../../base/browser/ui/sash/sash.js';
import { Color, RGBA } from '../../../../base/common/color.js';
import { IdGenerator } from '../../../../base/common/idGenerator.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import * as objects from '../../../../base/common/objects.js';
import './zoneWidget.css';
import { Range } from '../../../common/core/range.js';
import { ModelDecorationOptions } from '../../../common/model/textModel.js';
const defaultColor = new Color(new RGBA(0, 122, 204));
const defaultOptions = {
    showArrow: true,
    showFrame: true,
    className: '',
    frameColor: defaultColor,
    arrowColor: defaultColor,
    keepEditorSelection: false
};
const WIDGET_ID = 'vs.editor.contrib.zoneWidget';
class ViewZoneDelegate {
    constructor(domNode, afterLineNumber, afterColumn, heightInLines, onDomNodeTop, onComputedHeight, showInHiddenAreas, ordinal) {
        this.id = ''; // A valid zone id should be greater than 0
        this.domNode = domNode;
        this.afterLineNumber = afterLineNumber;
        this.afterColumn = afterColumn;
        this.heightInLines = heightInLines;
        this.showInHiddenAreas = showInHiddenAreas;
        this.ordinal = ordinal;
        this._onDomNodeTop = onDomNodeTop;
        this._onComputedHeight = onComputedHeight;
    }
    onDomNodeTop(top) {
        this._onDomNodeTop(top);
    }
    onComputedHeight(height) {
        this._onComputedHeight(height);
    }
}
export class OverlayWidgetDelegate {
    constructor(id, domNode) {
        this._id = id;
        this._domNode = domNode;
    }
    getId() {
        return this._id;
    }
    getDomNode() {
        return this._domNode;
    }
    getPosition() {
        return null;
    }
}
class Arrow {
    static { this._IdGenerator = new IdGenerator('.arrow-decoration-'); }
    constructor(_editor) {
        this._editor = _editor;
        this._ruleName = Arrow._IdGenerator.nextId();
        this._color = null;
        this._height = -1;
        this._decorations = this._editor.createDecorationsCollection();
    }
    dispose() {
        this.hide();
        domStylesheetsJs.removeCSSRulesContainingSelector(this._ruleName);
    }
    set color(value) {
        if (this._color !== value) {
            this._color = value;
            this._updateStyle();
        }
    }
    set height(value) {
        if (this._height !== value) {
            this._height = value;
            this._updateStyle();
        }
    }
    _updateStyle() {
        domStylesheetsJs.removeCSSRulesContainingSelector(this._ruleName);
        domStylesheetsJs.createCSSRule(`.monaco-editor ${this._ruleName}`, `border-style: solid; border-color: transparent; border-bottom-color: ${this._color}; border-width: ${this._height}px; bottom: -${this._height}px !important; margin-left: -${this._height}px; `);
    }
    show(where) {
        if (where.column === 1) {
            // the arrow isn't pretty at column 1 and we need to push it out a little
            where = { lineNumber: where.lineNumber, column: 2 };
        }
        this._decorations.set([{
                range: Range.fromPositions(where),
                options: {
                    description: 'zone-widget-arrow',
                    className: this._ruleName,
                    stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */
                }
            }]);
    }
    hide() {
        this._decorations.clear();
    }
}
export class ZoneWidget {
    constructor(editor, options = {}) {
        this._arrow = null;
        this._overlayWidget = null;
        this._resizeSash = null;
        this._isSashResizeHeight = false;
        this._viewZone = null;
        this._disposables = new DisposableStore();
        this.container = null;
        this._isShowing = false;
        this.editor = editor;
        this._positionMarkerId = this.editor.createDecorationsCollection();
        this.options = objects.deepClone(options);
        objects.mixin(this.options, defaultOptions, false);
        this.domNode = document.createElement('div');
        if (!this.options.isAccessible) {
            this.domNode.setAttribute('aria-hidden', 'true');
            this.domNode.setAttribute('role', 'presentation');
        }
        this._disposables.add(this.editor.onDidLayoutChange((info) => {
            const width = this._getWidth(info);
            this.domNode.style.width = width + 'px';
            this.domNode.style.left = this._getLeft(info) + 'px';
            this._onWidth(width);
        }));
    }
    dispose() {
        if (this._overlayWidget) {
            this.editor.removeOverlayWidget(this._overlayWidget);
            this._overlayWidget = null;
        }
        if (this._viewZone) {
            this.editor.changeViewZones(accessor => {
                if (this._viewZone) {
                    accessor.removeZone(this._viewZone.id);
                }
                this._viewZone = null;
            });
        }
        this._positionMarkerId.clear();
        this._disposables.dispose();
    }
    create() {
        this.domNode.classList.add('zone-widget');
        if (this.options.className) {
            this.domNode.classList.add(this.options.className);
        }
        this.container = document.createElement('div');
        this.container.classList.add('zone-widget-container');
        this.domNode.appendChild(this.container);
        if (this.options.showArrow) {
            this._arrow = new Arrow(this.editor);
            this._disposables.add(this._arrow);
        }
        this._fillContainer(this.container);
        this._initSash();
        this._applyStyles();
    }
    style(styles) {
        if (styles.frameColor) {
            this.options.frameColor = styles.frameColor;
        }
        if (styles.arrowColor) {
            this.options.arrowColor = styles.arrowColor;
        }
        this._applyStyles();
    }
    _applyStyles() {
        if (this.container && this.options.frameColor) {
            const frameColor = this.options.frameColor.toString();
            this.container.style.borderTopColor = frameColor;
            this.container.style.borderBottomColor = frameColor;
        }
        if (this._arrow && this.options.arrowColor) {
            const arrowColor = this.options.arrowColor.toString();
            this._arrow.color = arrowColor;
        }
    }
    _getWidth(info) {
        return info.width - info.minimap.minimapWidth - info.verticalScrollbarWidth;
    }
    _getLeft(info) {
        // If minimap is to the left, we move beyond it
        if (info.minimap.minimapWidth > 0 && info.minimap.minimapLeft === 0) {
            return info.minimap.minimapWidth;
        }
        return 0;
    }
    _onViewZoneTop(top) {
        this.domNode.style.top = top + 'px';
    }
    _onViewZoneHeight(height) {
        this.domNode.style.height = `${height}px`;
        if (this.container) {
            const containerHeight = height - this._decoratingElementsHeight();
            this.container.style.height = `${containerHeight}px`;
            const layoutInfo = this.editor.getLayoutInfo();
            this._doLayout(containerHeight, this._getWidth(layoutInfo));
        }
        this._resizeSash?.layout();
    }
    get position() {
        const range = this._positionMarkerId.getRange(0);
        if (!range) {
            return undefined;
        }
        return range.getStartPosition();
    }
    hasFocus() {
        return this.domNode.contains(dom.getActiveElement());
    }
    show(rangeOrPos, heightInLines) {
        const range = Range.isIRange(rangeOrPos) ? Range.lift(rangeOrPos) : Range.fromPositions(rangeOrPos);
        this._isShowing = true;
        this._showImpl(range, heightInLines);
        this._isShowing = false;
        this._positionMarkerId.set([{ range, options: ModelDecorationOptions.EMPTY }]);
    }
    updatePositionAndHeight(rangeOrPos, heightInLines) {
        if (this._viewZone) {
            rangeOrPos = Range.isIRange(rangeOrPos) ? Range.getStartPosition(rangeOrPos) : rangeOrPos;
            this._viewZone.afterLineNumber = rangeOrPos.lineNumber;
            this._viewZone.afterColumn = rangeOrPos.column;
            this._viewZone.heightInLines = heightInLines ?? this._viewZone.heightInLines;
            this.editor.changeViewZones(accessor => {
                accessor.layoutZone(this._viewZone.id);
            });
            this._positionMarkerId.set([{
                    range: Range.isIRange(rangeOrPos) ? rangeOrPos : Range.fromPositions(rangeOrPos),
                    options: ModelDecorationOptions.EMPTY
                }]);
            this._updateSashEnablement();
        }
    }
    hide() {
        if (this._viewZone) {
            this.editor.changeViewZones(accessor => {
                if (this._viewZone) {
                    accessor.removeZone(this._viewZone.id);
                }
            });
            this._viewZone = null;
        }
        if (this._overlayWidget) {
            this.editor.removeOverlayWidget(this._overlayWidget);
            this._overlayWidget = null;
        }
        this._arrow?.hide();
        this._positionMarkerId.clear();
        this._isSashResizeHeight = false;
    }
    _decoratingElementsHeight() {
        const lineHeight = this.editor.getOption(75 /* EditorOption.lineHeight */);
        let result = 0;
        if (this.options.showArrow) {
            const arrowHeight = Math.round(lineHeight / 3);
            result += 2 * arrowHeight;
        }
        if (this.options.showFrame) {
            const frameThickness = this.options.frameWidth ?? Math.round(lineHeight / 9);
            result += 2 * frameThickness;
        }
        return result;
    }
    /** Gets the maximum widget height in lines. */
    _getMaximumHeightInLines() {
        return Math.max(12, (this.editor.getLayoutInfo().height / this.editor.getOption(75 /* EditorOption.lineHeight */)) * 0.8);
    }
    _showImpl(where, heightInLines) {
        const position = where.getStartPosition();
        const layoutInfo = this.editor.getLayoutInfo();
        const width = this._getWidth(layoutInfo);
        this.domNode.style.width = `${width}px`;
        this.domNode.style.left = this._getLeft(layoutInfo) + 'px';
        // Render the widget as zone (rendering) and widget (lifecycle)
        const viewZoneDomNode = document.createElement('div');
        viewZoneDomNode.style.overflow = 'hidden';
        const lineHeight = this.editor.getOption(75 /* EditorOption.lineHeight */);
        // adjust heightInLines to viewport
        const maxHeightInLines = this._getMaximumHeightInLines();
        if (maxHeightInLines !== undefined) {
            heightInLines = Math.min(heightInLines, maxHeightInLines);
        }
        let arrowHeight = 0;
        let frameThickness = 0;
        // Render the arrow one 1/3 of an editor line height
        if (this._arrow && this.options.showArrow) {
            arrowHeight = Math.round(lineHeight / 3);
            this._arrow.height = arrowHeight;
            this._arrow.show(position);
        }
        // Render the frame as 1/9 of an editor line height
        if (this.options.showFrame) {
            frameThickness = Math.round(lineHeight / 9);
        }
        // insert zone widget
        this.editor.changeViewZones((accessor) => {
            if (this._viewZone) {
                accessor.removeZone(this._viewZone.id);
            }
            if (this._overlayWidget) {
                this.editor.removeOverlayWidget(this._overlayWidget);
                this._overlayWidget = null;
            }
            this.domNode.style.top = '-1000px';
            this._viewZone = new ViewZoneDelegate(viewZoneDomNode, position.lineNumber, position.column, heightInLines, (top) => this._onViewZoneTop(top), (height) => this._onViewZoneHeight(height), this.options.showInHiddenAreas, this.options.ordinal);
            this._viewZone.id = accessor.addZone(this._viewZone);
            this._overlayWidget = new OverlayWidgetDelegate(WIDGET_ID + this._viewZone.id, this.domNode);
            this.editor.addOverlayWidget(this._overlayWidget);
        });
        this._updateSashEnablement();
        if (this.container && this.options.showFrame) {
            const width = this.options.frameWidth ? this.options.frameWidth : frameThickness;
            this.container.style.borderTopWidth = width + 'px';
            this.container.style.borderBottomWidth = width + 'px';
        }
        const containerHeight = heightInLines * lineHeight - this._decoratingElementsHeight();
        if (this.container) {
            this.container.style.top = arrowHeight + 'px';
            this.container.style.height = containerHeight + 'px';
            this.container.style.overflow = 'hidden';
        }
        this._doLayout(containerHeight, width);
        if (!this.options.keepEditorSelection) {
            this.editor.setSelection(where);
        }
        const model = this.editor.getModel();
        if (model) {
            const range = model.validateRange(new Range(where.startLineNumber, 1, where.endLineNumber + 1, 1));
            this.revealRange(range, range.startLineNumber === model.getLineCount());
        }
    }
    revealRange(range, isLastLine) {
        if (isLastLine) {
            this.editor.revealLineNearTop(range.endLineNumber, 0 /* ScrollType.Smooth */);
        }
        else {
            this.editor.revealRange(range, 0 /* ScrollType.Smooth */);
        }
    }
    setCssClass(className, classToReplace) {
        if (!this.container) {
            return;
        }
        if (classToReplace) {
            this.container.classList.remove(classToReplace);
        }
        this.container.classList.add(className);
    }
    _onWidth(widthInPixel) {
        // implement in subclass
    }
    _doLayout(heightInPixel, widthInPixel) {
        // implement in subclass
    }
    _relayout(_newHeightInLines, useMax) {
        const maxHeightInLines = this._getMaximumHeightInLines();
        const newHeightInLines = (useMax && (maxHeightInLines !== undefined)) ? Math.min(maxHeightInLines, _newHeightInLines) : _newHeightInLines;
        if (this._viewZone && this._viewZone.heightInLines !== newHeightInLines) {
            this.editor.changeViewZones(accessor => {
                if (this._viewZone) {
                    this._viewZone.heightInLines = newHeightInLines;
                    accessor.layoutZone(this._viewZone.id);
                }
            });
            this._updateSashEnablement();
        }
    }
    // --- sash
    _initSash() {
        if (this._resizeSash) {
            return;
        }
        this._resizeSash = this._disposables.add(new Sash(this.domNode, this, { orientation: 1 /* Orientation.HORIZONTAL */ }));
        if (!this.options.isResizeable) {
            this._resizeSash.state = 0 /* SashState.Disabled */;
        }
        let data;
        this._disposables.add(this._resizeSash.onDidStart((e) => {
            if (this._viewZone) {
                data = {
                    startY: e.startY,
                    heightInLines: this._viewZone.heightInLines,
                    ...this._getResizeBounds()
                };
            }
        }));
        this._disposables.add(this._resizeSash.onDidEnd(() => {
            data = undefined;
        }));
        this._disposables.add(this._resizeSash.onDidChange((evt) => {
            if (data) {
                const lineDelta = (evt.currentY - data.startY) / this.editor.getOption(75 /* EditorOption.lineHeight */);
                const roundedLineDelta = lineDelta < 0 ? Math.ceil(lineDelta) : Math.floor(lineDelta);
                const newHeightInLines = data.heightInLines + roundedLineDelta;
                if (newHeightInLines > data.minLines && newHeightInLines < data.maxLines) {
                    this._isSashResizeHeight = true;
                    this._relayout(newHeightInLines);
                }
            }
        }));
    }
    _updateSashEnablement() {
        if (this._resizeSash) {
            const { minLines, maxLines } = this._getResizeBounds();
            this._resizeSash.state = minLines === maxLines ? 0 /* SashState.Disabled */ : 3 /* SashState.Enabled */;
        }
    }
    get _usesResizeHeight() {
        return this._isSashResizeHeight;
    }
    _getResizeBounds() {
        return { minLines: 5, maxLines: 35 };
    }
    getHorizontalSashLeft() {
        return 0;
    }
    getHorizontalSashTop() {
        return (this.domNode.style.height === null ? 0 : parseInt(this.domNode.style.height)) - (this._decoratingElementsHeight() / 2);
    }
    getHorizontalSashWidth() {
        const layoutInfo = this.editor.getLayoutInfo();
        return layoutInfo.width - layoutInfo.minimap.minimapWidth;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiem9uZVdpZGdldC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL3pvbmVXaWRnZXQvYnJvd3Nlci96b25lV2lkZ2V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0saUNBQWlDLENBQUM7QUFDdkQsT0FBTyxLQUFLLGdCQUFnQixNQUFNLDRDQUE0QyxDQUFDO0FBQy9FLE9BQU8sRUFBMEQsSUFBSSxFQUFhLE1BQU0sMENBQTBDLENBQUM7QUFDbkksT0FBTyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMvRCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDckUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3ZFLE9BQU8sS0FBSyxPQUFPLE1BQU0sb0NBQW9DLENBQUM7QUFDOUQsT0FBTyxrQkFBa0IsQ0FBQztBQUkxQixPQUFPLEVBQVUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFHOUQsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFxQjVFLE1BQU0sWUFBWSxHQUFHLElBQUksS0FBSyxDQUFDLElBQUksSUFBSSxDQUFDLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUV0RCxNQUFNLGNBQWMsR0FBYTtJQUNoQyxTQUFTLEVBQUUsSUFBSTtJQUNmLFNBQVMsRUFBRSxJQUFJO0lBQ2YsU0FBUyxFQUFFLEVBQUU7SUFDYixVQUFVLEVBQUUsWUFBWTtJQUN4QixVQUFVLEVBQUUsWUFBWTtJQUN4QixtQkFBbUIsRUFBRSxLQUFLO0NBQzFCLENBQUM7QUFFRixNQUFNLFNBQVMsR0FBRyw4QkFBOEIsQ0FBQztBQUVqRCxNQUFNLGdCQUFn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