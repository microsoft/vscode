/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createFastDomNode } from '../../../../base/browser/fastDomNode.js';
import { Color } from '../../../../base/common/color.js';
import { ViewPart } from '../../view/viewPart.js';
import { Position } from '../../../common/core/position.js';
import { TokenizationRegistry } from '../../../common/languages.js';
import { editorCursorForeground, editorOverviewRulerBorder, editorOverviewRulerBackground, editorMultiCursorSecondaryForeground, editorMultiCursorPrimaryForeground } from '../../../common/core/editorColorRegistry.js';
import { OverviewRulerDecorationsGroup } from '../../../common/viewModel.js';
import { equals } from '../../../../base/common/arrays.js';
class Settings {
    constructor(config, theme) {
        const options = config.options;
        this.lineHeight = options.get(75 /* EditorOption.lineHeight */);
        this.pixelRatio = options.get(163 /* EditorOption.pixelRatio */);
        this.overviewRulerLanes = options.get(95 /* EditorOption.overviewRulerLanes */);
        this.renderBorder = options.get(94 /* EditorOption.overviewRulerBorder */);
        const borderColor = theme.getColor(editorOverviewRulerBorder);
        this.borderColor = borderColor ? borderColor.toString() : null;
        this.hideCursor = options.get(68 /* EditorOption.hideCursorInOverviewRuler */);
        const cursorColorSingle = theme.getColor(editorCursorForeground);
        this.cursorColorSingle = cursorColorSingle ? cursorColorSingle.transparent(0.7).toString() : null;
        const cursorColorPrimary = theme.getColor(editorMultiCursorPrimaryForeground);
        this.cursorColorPrimary = cursorColorPrimary ? cursorColorPrimary.transparent(0.7).toString() : null;
        const cursorColorSecondary = theme.getColor(editorMultiCursorSecondaryForeground);
        this.cursorColorSecondary = cursorColorSecondary ? cursorColorSecondary.transparent(0.7).toString() : null;
        this.themeType = theme.type;
        const minimapOpts = options.get(81 /* EditorOption.minimap */);
        const minimapEnabled = minimapOpts.enabled;
        const minimapSide = minimapOpts.side;
        const themeColor = theme.getColor(editorOverviewRulerBackground);
        const defaultBackground = TokenizationRegistry.getDefaultBackground();
        if (themeColor) {
            this.backgroundColor = themeColor;
        }
        else if (minimapEnabled && minimapSide === 'right') {
            this.backgroundColor = defaultBackground;
        }
        else {
            this.backgroundColor = null;
        }
        const layoutInfo = options.get(165 /* EditorOption.layoutInfo */);
        const position = layoutInfo.overviewRuler;
        this.top = position.top;
        this.right = position.right;
        this.domWidth = position.width;
        this.domHeight = position.height;
        if (this.overviewRulerLanes === 0) {
            // overview ruler is off
            this.canvasWidth = 0;
            this.canvasHeight = 0;
        }
        else {
            this.canvasWidth = (this.domWidth * this.pixelRatio) | 0;
            this.canvasHeight = (this.domHeight * this.pixelRatio) | 0;
        }
        const [x, w] = this._initLanes(1, this.canvasWidth, this.overviewRulerLanes);
        this.x = x;
        this.w = w;
    }
    _initLanes(canvasLeftOffset, canvasWidth, laneCount) {
        const remainingWidth = canvasWidth - canvasLeftOffset;
        if (laneCount >= 3) {
            const leftWidth = Math.floor(remainingWidth / 3);
            const rightWidth = Math.floor(remainingWidth / 3);
            const centerWidth = remainingWidth - leftWidth - rightWidth;
            const leftOffset = canvasLeftOffset;
            const centerOffset = leftOffset + leftWidth;
            const rightOffset = leftOffset + leftWidth + centerWidth;
            return [
                [
                    0,
                    leftOffset, // Left
                    centerOffset, // Center
                    leftOffset, // Left | Center
                    rightOffset, // Right
                    leftOffset, // Left | Right
                    centerOffset, // Center | Right
                    leftOffset, // Left | Center | Right
                ], [
                    0,
                    leftWidth, // Left
                    centerWidth, // Center
                    leftWidth + centerWidth, // Left | Center
                    rightWidth, // Right
                    leftWidth + centerWidth + rightWidth, // Left | Right
                    centerWidth + rightWidth, // Center | Right
                    leftWidth + centerWidth + rightWidth, // Left | Center | Right
                ]
            ];
        }
        else if (laneCount === 2) {
            const leftWidth = Math.floor(remainingWidth / 2);
            const rightWidth = remainingWidth - leftWidth;
            const leftOffset = canvasLeftOffset;
            const rightOffset = leftOffset + leftWidth;
            return [
                [
                    0,
                    leftOffset, // Left
                    leftOffset, // Center
                    leftOffset, // Left | Center
                    rightOffset, // Right
                    leftOffset, // Left | Right
                    leftOffset, // Center | Right
                    leftOffset, // Left | Center | Right
                ], [
                    0,
                    leftWidth, // Left
                    leftWidth, // Center
                    leftWidth, // Left | Center
                    rightWidth, // Right
                    leftWidth + rightWidth, // Left | Right
                    leftWidth + rightWidth, // Center | Right
                    leftWidth + rightWidth, // Left | Center | Right
                ]
            ];
        }
        else {
            const offset = canvasLeftOffset;
            const width = remainingWidth;
            return [
                [
                    0,
                    offset, // Left
                    offset, // Center
                    offset, // Left | Center
                    offset, // Right
                    offset, // Left | Right
                    offset, // Center | Right
                    offset, // Left | Center | Right
                ], [
                    0,
                    width, // Left
                    width, // Center
                    width, // Left | Center
                    width, // Right
                    width, // Left | Right
                    width, // Center | Right
                    width, // Left | Center | Right
                ]
            ];
        }
    }
    equals(other) {
        return (this.lineHeight === other.lineHeight
            && this.pixelRatio === other.pixelRatio
            && this.overviewRulerLanes === other.overviewRulerLanes
            && this.renderBorder === other.renderBorder
            && this.borderColor === other.borderColor
            && this.hideCursor === other.hideCursor
            && this.cursorColorSingle === other.cursorColorSingle
            && this.cursorColorPrimary === other.cursorColorPrimary
            && this.cursorColorSecondary === other.cursorColorSecondary
            && this.themeType === other.themeType
            && Color.equals(this.backgroundColor, other.backgroundColor)
            && this.top === other.top
            && this.right === other.right
            && this.domWidth === other.domWidth
            && this.domHeight === other.domHeight
            && this.canvasWidth === other.canvasWidth
            && this.canvasHeight === other.canvasHeight);
    }
}
var Constants;
(function (Constants) {
    Constants[Constants["MIN_DECORATION_HEIGHT"] = 6] = "MIN_DECORATION_HEIGHT";
})(Constants || (Constants = {}));
var OverviewRulerLane;
(function (OverviewRulerLane) {
    OverviewRulerLane[OverviewRulerLane["Left"] = 1] = "Left";
    OverviewRulerLane[OverviewRulerLane["Center"] = 2] = "Center";
    OverviewRulerLane[OverviewRulerLane["Right"] = 4] = "Right";
    OverviewRulerLane[OverviewRulerLane["Full"] = 7] = "Full";
})(OverviewRulerLane || (OverviewRulerLane = {}));
var ShouldRenderValue;
(function (ShouldRenderValue) {
    ShouldRenderValue[ShouldRenderValue["NotNeeded"] = 0] = "NotNeeded";
    ShouldRenderValue[ShouldRenderValue["Maybe"] = 1] = "Maybe";
    ShouldRenderValue[ShouldRenderValue["Needed"] = 2] = "Needed";
})(ShouldRenderValue || (ShouldRenderValue = {}));
export class DecorationsOverviewRuler extends ViewPart {
    constructor(context) {
        super(context);
        this._actualShouldRender = 0 /* ShouldRenderValue.NotNeeded */;
        this._renderedDecorations = [];
        this._renderedCursorPositions = [];
        this._domNode = createFastDomNode(document.createElement('canvas'));
        this._domNode.setClassName('decorationsOverviewRuler');
        this._domNode.setPosition('absolute');
        this._domNode.setLayerHinting(true);
        this._domNode.setContain('strict');
        this._domNode.setAttribute('aria-hidden', 'true');
        this._updateSettings(false);
        this._tokensColorTrackerListener = TokenizationRegistry.onDidChange((e) => {
            if (e.changedColorMap) {
                this._updateSettings(true);
            }
        });
        this._cursorPositions = [{ position: new Position(1, 1), color: this._settings.cursorColorSingle }];
    }
    dispose() {
        super.dispose();
        this._tokensColorTrackerListener.dispose();
    }
    _updateSettings(renderNow) {
        const newSettings = new Settings(this._context.configuration, this._context.theme);
        if (this._settings && this._settings.equals(newSettings)) {
            // nothing to do
            return false;
        }
        this._settings = newSettings;
        this._domNode.setTop(this._settings.top);
        this._domNode.setRight(this._settings.right);
        this._domNode.setWidth(this._settings.domWidth);
        this._domNode.setHeight(this._settings.domHeight);
        this._domNode.domNode.width = this._settings.canvasWidth;
        this._domNode.domNode.height = this._settings.canvasHeight;
        if (renderNow) {
            this._render();
        }
        return true;
    }
    // ---- begin view event handlers
    _markRenderingIsNeeded() {
        this._actualShouldRender = 2 /* ShouldRenderValue.Needed */;
        return true;
    }
    _markRenderingIsMaybeNeeded() {
        this._actualShouldRender = 1 /* ShouldRenderValue.Maybe */;
        return true;
    }
    onConfigurationChanged(e) {
        return this._updateSettings(false) ? this._markRenderingIsNeeded() : false;
    }
    onCursorStateChanged(e) {
        this._cursorPositions = [];
        for (let i = 0, len = e.selections.length; i < len; i++) {
            let color = this._settings.cursorColorSingle;
            if (len > 1) {
                color = i === 0 ? this._settings.cursorColorPrimary : this._settings.cursorColorSecondary;
            }
            this._cursorPositions.push({ position: e.selections[i].getPosition(), color });
        }
        this._cursorPositions.sort((a, b) => Position.compare(a.position, b.position));
        return this._markRenderingIsMaybeNeeded();
    }
    onDecorationsChanged(e) {
        if (e.affectsOverviewRuler) {
            return this._markRenderingIsMaybeNeeded();
        }
        return false;
    }
    onFlushed(e) {
        return this._markRenderingIsNeeded();
    }
    onScrollChanged(e) {
        return e.scrollHeightChanged ? this._markRenderingIsNeeded() : false;
    }
    onZonesChanged(e) {
        return this._markRenderingIsNeeded();
    }
    onThemeChanged(e) {
        return this._updateSettings(false) ? this._markRenderingIsNeeded() : false;
    }
    // ---- end view event handlers
    getDomNode() {
        return this._domNode.domNode;
    }
    prepareRender(ctx) {
        // Nothing to read
    }
    render(editorCtx) {
        this._render();
        this._actualShouldRender = 0 /* ShouldRenderValue.NotNeeded */;
    }
    _render() {
        const backgroundColor = this._settings.backgroundColor;
        if (this._settings.overviewRulerLanes === 0) {
            // overview ruler is off
            this._domNode.setBackgroundColor(backgroundColor ? Color.Format.CSS.formatHexA(backgroundColor) : '');
            this._domNode.setDisplay('none');
            return;
        }
        const decorations = this._context.viewModel.getAllOverviewRulerDecorations(this._context.theme);
        decorations.sort(OverviewRulerDecorationsGroup.compareByRenderingProps);
        if (this._actualShouldRender === 1 /* ShouldRenderValue.Maybe */ && !OverviewRulerDecorationsGroup.equalsArr(this._renderedDecorations, decorations)) {
            this._actualShouldRender = 2 /* ShouldRenderValue.Needed */;
        }
        if (this._actualShouldRender === 1 /* ShouldRenderValue.Maybe */ && !equals(this._renderedCursorPositions, this._cursorPositions, (a, b) => a.position.lineNumber === b.position.lineNumber && a.color === b.color)) {
            this._actualShouldRender = 2 /* ShouldRenderValue.Needed */;
        }
        if (this._actualShouldRender === 1 /* ShouldRenderValue.Maybe */) {
            // both decorations and cursor positions are unchanged, nothing to do
            return;
        }
        this._renderedDecorations = decorations;
        this._renderedCursorPositions = this._cursorPositions;
        this._domNode.setDisplay('block');
        const canvasWidth = this._settings.canvasWidth;
        const canvasHeight = this._settings.canvasHeight;
        const lineHeight = this._settings.lineHeight;
        const viewLayout = this._context.viewLayout;
        const outerHeight = this._context.viewLayout.getScrollHeight();
        const heightRatio = canvasHeight / outerHeight;
        const minDecorationHeight = (6 /* Constants.MIN_DECORATION_HEIGHT */ * this._settings.pixelRatio) | 0;
        const halfMinDecorationHeight = (minDecorationHeight / 2) | 0;
        const canvasCtx = this._domNode.domNode.getContext('2d');
        if (backgroundColor) {
            if (backgroundColor.isOpaque()) {
                // We have a background color which is opaque, we can just paint the entire surface with it
                canvasCtx.fillStyle = Color.Format.CSS.formatHexA(backgroundColor);
                canvasCtx.fillRect(0, 0, canvasWidth, canvasHeight);
            }
            else {
                // We have a background color which is transparent, we need to first clear the surface and
                // then fill it
                canvasCtx.clearRect(0, 0, canvasWidth, canvasHeight);
                canvasCtx.fillStyle = Color.Format.CSS.formatHexA(backgroundColor);
                canvasCtx.fillRect(0, 0, canvasWidth, canvasHeight);
            }
        }
        else {
            // We don't have a background color
            canvasCtx.clearRect(0, 0, canvasWidth, canvasHeight);
        }
        const x = this._settings.x;
        const w = this._settings.w;
        for (const decorationGroup of decorations) {
            const color = decorationGroup.color;
            const decorationGroupData = decorationGroup.data;
            canvasCtx.fillStyle = color;
            let prevLane = 0;
            let prevY1 = 0;
            let prevY2 = 0;
            for (let i = 0, len = decorationGroupData.length / 3; i < len; i++) {
                const lane = decorationGroupData[3 * i];
                const startLineNumber = decorationGroupData[3 * i + 1];
                const endLineNumber = decorationGroupData[3 * i + 2];
                let y1 = (viewLayout.getVerticalOffsetForLineNumber(startLineNumber) * heightRatio) | 0;
                let y2 = ((viewLayout.getVerticalOffsetForLineNumber(endLineNumber) + lineHeight) * heightRatio) | 0;
                const height = y2 - y1;
                if (height < minDecorationHeight) {
                    let yCenter = ((y1 + y2) / 2) | 0;
                    if (yCenter < halfMinDecorationHeight) {
                        yCenter = halfMinDecorationHeight;
                    }
                    else if (yCenter + halfMinDecorationHeight > canvasHeight) {
                        yCenter = canvasHeight - halfMinDecorationHeight;
                    }
                    y1 = yCenter - halfMinDecorationHeight;
                    y2 = yCenter + halfMinDecorationHeight;
                }
                if (y1 > prevY2 + 1 || lane !== prevLane) {
                    // flush prev
                    if (i !== 0) {
                        canvasCtx.fillRect(x[prevLane], prevY1, w[prevLane], prevY2 - prevY1);
                    }
                    prevLane = lane;
                    prevY1 = y1;
                    prevY2 = y2;
                }
                else {
                    // merge into prev
                    if (y2 > prevY2) {
                        prevY2 = y2;
                    }
                }
            }
            canvasCtx.fillRect(x[prevLane], prevY1, w[prevLane], prevY2 - prevY1);
        }
        // Draw cursors
        if (!this._settings.hideCursor) {
            const cursorHeight = (2 * this._settings.pixelRatio) | 0;
            const halfCursorHeight = (cursorHeight / 2) | 0;
            const cursorX = this._settings.x[7 /* OverviewRulerLane.Full */];
            const cursorW = this._settings.w[7 /* OverviewRulerLane.Full */];
            let prevY1 = -100;
            let prevY2 = -100;
            let prevColor = null;
            for (let i = 0, len = this._cursorPositions.length; i < len; i++) {
                const color = this._cursorPositions[i].color;
                if (!color) {
                    continue;
                }
                const cursor = this._cursorPositions[i].position;
                let yCenter = (viewLayout.getVerticalOffsetForLineNumber(cursor.lineNumber) * heightRatio) | 0;
                if (yCenter < halfCursorHeight) {
                    yCenter = halfCursorHeight;
                }
                else if (yCenter + halfCursorHeight > canvasHeight) {
                    yCenter = canvasHeight - halfCursorHeight;
                }
                const y1 = yCenter - halfCursorHeight;
                const y2 = y1 + cursorHeight;
                if (y1 > prevY2 + 1 || color !== prevColor) {
                    // flush prev
                    if (i !== 0 && prevColor) {
                        canvasCtx.fillRect(cursorX, prevY1, cursorW, prevY2 - prevY1);
                    }
                    prevY1 = y1;
                    prevY2 = y2;
                }
                else {
                    // merge into prev
                    if (y2 > prevY2) {
                        prevY2 = y2;
                    }
                }
                prevColor = color;
                canvasCtx.fillStyle = color;
            }
            if (prevColor) {
                canvasCtx.fillRect(cursorX, prevY1, cursorW, prevY2 - prevY1);
            }
        }
        if (this._settings.renderBorder && this._settings.borderColor && this._settings.overviewRulerLanes > 0) {
            canvasCtx.beginPath();
            canvasCtx.lineWidth = 1;
            canvasCtx.strokeStyle = this._settings.borderColor;
            canvasCtx.moveTo(0, 0);
            canvasCtx.lineTo(0, canvasHeight);
            canvasCtx.moveTo(1, 0);
            canvasCtx.lineTo(canvasWidth, 0);
            canvasCtx.stroke();
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVjb3JhdGlvbnNPdmVydmlld1J1bGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2Jyb3dzZXIvdmlld1BhcnRzL292ZXJ2aWV3UnVsZXIvZGVjb3JhdGlvbnNPdmVydmlld1J1bGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBZSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUV6RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDbEQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRTVELE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3BFLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSx5QkFBeUIsRUFBRSw2QkFBNkIsRUFBRSxvQ0FBb0MsRUFBRSxrQ0FBa0MsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBTXpOLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQzdFLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUUzRCxNQUFNLFFBQVE7SUEyQmIsWUFBWSxNQUE0QixFQUFFLEtBQWtCO1FBQzNELE1BQU0sT0FBTyxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUM7UUFDL0IsSUFBSSxDQUFDLFVBQVUsR0FBRyxPQUFPLENBQUMsR0FBRyxrQ0FBeUIsQ0FBQztRQUN2RCxJQUFJLENBQUMsVUFBVSxHQUFHLE9BQU8sQ0FBQyxHQUFHLG1DQUF5QixDQUFDO1FBQ3ZELElBQUksQ0FBQyxrQkFBa0IsR0FBRyxPQUFPLENBQUMsR0FBRywwQ0FBaUMsQ0FBQztRQUV2RSxJQUFJLENBQUMsWUFBWSxHQUFHLE9BQU8sQ0FBQyxHQUFHLDJDQUFrQyxDQUFDO1FBQ2xFLE1BQU0sV0FBVyxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMseUJBQXlCLENBQUMsQ0FBQztRQUM5RCxJQUFJLENBQUMsV0FBVyxHQUFHLFdBQVcsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7UUFFL0QsSUFBSSxDQUFDLFVBQVUsR0FBRyxPQUFPLENBQUMsR0FBRyxpREFBd0MsQ0FBQztRQUN0RSxNQUFNLGlCQUFpQixHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsc0JBQXNCLENBQUMsQ0FBQztRQUNqRSxJQUFJLENBQUMsaUJBQWlCLEdBQUcsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO1FBQ2xHLE1BQU0sa0JBQWtCLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO1FBQzlFLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsa0JBQWtCLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7UUFDckcsTUFBTSxvQkFBb0IsR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDLG9DQUFvQyxDQUFDLENBQUM7UUFDbEYsSUFBSSxDQUFDLG9CQUFvQixHQUFHLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztRQUUzRyxJQUFJLENBQUMsU0FBUyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFFNUIsTUFBTSxXQUFXLEdBQUcsT0FBTyxDQUFDLEdBQUcsK0JBQXNCLENBQUM7UUFDdEQsTUFBTSxjQUFjLEdBQUcsV0FBVyxDQUFDLE9BQU8sQ0FBQztRQUMzQyxNQUFNLFdBQVcsR0FBRyxXQUFXLENBQUMsSUFBSSxDQUFDO1FBQ3JDLE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsNkJBQTZCLENBQUMsQ0FBQztRQUNqRSxNQUFNLGlCQUFpQixHQUFHLG9CQUFvQixDQUFDLG9CQUFvQixFQUFFLENBQUM7UUFFdEUsSUFBSSxVQUFVLEVBQUUsQ0FBQztZQUNoQixJQUFJLENBQUMsZUFBZSxHQUFHLFVBQVUsQ0FBQztRQUNuQyxDQUFDO2FBQU0sSUFBSSxjQUFjLElBQUksV0FBVyxLQUFLLE9BQU8sRUFBRSxDQUFDO1lBQ3RELElBQUksQ0FBQyxlQUFlLEdBQUcsaUJBQWlCLENBQUM7UUFDMUMsQ0FBQzthQUFNLENBQUM7WUFDUCxJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQztRQUM3QixDQUFDO1FBRUQsTUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDLEdBQUcsbUNBQXlCLENBQUM7UUFDeEQsTUFBTSxRQUFRLEdBQUcsVUFBVSxDQUFDLGFBQWEsQ0FBQztRQUMxQyxJQUFJLENBQUMsR0FBRyxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUM7UUFDeEIsSUFBSSxDQUFDLEtBQUssR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDO1FBQzVCLElBQUksQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQztRQUMvQixJQUFJLENBQUMsU0FBUyxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUM7UUFDakMsSUFBSSxJQUFJLENBQUMsa0JBQWtCLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDbkMsd0JBQXdCO1lBQ3hCLElBQUksQ0FBQyxXQUFXLEdBQUcsQ0FBQyxDQUFDO1lBQ3JCLElBQUksQ0FBQyxZQUFZLEdBQUcsQ0FBQyxDQUFDO1FBQ3ZCLENBQUM7YUFBTSxDQUFDO1lBQ1AsSUFBSSxDQUFDLFdBQVcsR0FBRyxDQUFDLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUN6RCxJQUFJLENBQUMsWUFBWSxHQUFHLENBQUMsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQzVELENBQUM7UUFFRCxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFDN0UsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDWCxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNaLENBQUM7SUFFTyxVQUFVLENBQUMsZ0JBQXdCLEVBQUUsV0FBbUIsRUFBRSxTQUFpQjtRQUNsRixNQUFNLGNBQWMsR0FBRyxXQUFXLEdBQUcsZ0JBQWdCLENBQUM7UUFFdEQsSUFBSSxTQUFTLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDcEIsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxjQUFjLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDakQsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxjQUFjLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDbEQsTUFBTSxXQUFXLEdBQUcsY0FBYyxHQUFHLFNBQVMsR0FBRyxVQUFVLENBQUM7WUFDNUQsTUFBTSxVQUFVLEdBQUcsZ0JBQWdCLENBQUM7WUFDcEMsTUFBTSxZQUFZLEdBQUcsVUFBVSxHQUFHLFNBQVMsQ0FBQztZQUM1QyxNQUFNLFdBQVcsR0FBRyxVQUFVLEdBQUcsU0FBUyxHQUFHLFdBQVcsQ0FBQztZQUV6RCxPQUFPO2dCQUNOO29CQUNDLENBQUM7b0JBQ0QsVUFBVSxFQUFFLE9BQU87b0JBQ25CLFlBQVksRUFBRSxTQUFTO29CQUN2QixVQUFVLEVBQUUsZ0JBQWdCO29CQUM1QixXQUFXLEVBQUUsUUFBUTtvQkFDckIsVUFBVSxFQUFFLGVBQWU7b0JBQzNCLFlBQVksRUFBRSxpQkFBaUI7b0JBQy9CLFVBQVUsRUFBRSx3QkFBd0I7aUJBQ3BDLEVBQUU7b0JBQ0YsQ0FBQztvQkFDRCxTQUFTLEVBQUUsT0FBTztvQkFDbEIsV0FBVyxFQUFFLFNBQVM7b0JBQ3RCLFNBQVMsR0FBRyxXQUFXLEVBQUUsZ0JBQWdCO29CQUN6QyxVQUFVLEVBQUUsUUFBUTtvQkFDcEIsU0FBUyxHQUFHLFdBQVcsR0FBRyxVQUFVLEVBQUUsZUFBZTtvQkFDckQsV0FBVyxHQUFHLFVBQVUsRUFBRSxpQkFBaUI7b0JBQzNDLFNBQVMsR0FBRyxXQUFXLEdBQUcsVUFBVSxFQUFFLHdCQUF3QjtpQkFDOUQ7YUFDRCxDQUFDO1FBQ0gsQ0FBQzthQUFNLElBQUksU0FBUyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQzVCLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsY0FBYyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQ2pELE1BQU0sVUFBVSxHQUFHLGNBQWMsR0FBRyxTQUFTLENBQUM7WUFDOUMsTUFBTSxVQUFVLEdBQUcsZ0JBQWdCLENBQUM7WUFDcEMsTUFBTSxXQUFXLEdBQUcsVUFBVSxHQUFHLFNBQVMsQ0FBQztZQUUzQyxPQUFPO2dCQUNOO29CQUNDLENBQUM7b0JBQ0QsVUFBVSxFQUFFLE9BQU87b0JBQ25CLFVBQVUsRUFBRSxTQUFTO29CQUNyQixVQUFVLEVBQUUsZ0JBQWdCO29CQUM1QixXQUFXLEVBQUUsUUFBUTtvQkFDckIsVUFBVSxFQUFFLGVBQWU7b0JBQzNCLFVBQVUsRUFBRSxpQkFBaUI7b0JBQzdCLFVBQVUsRUFBRSx3QkFBd0I7aUJBQ3BDLEVBQUU7b0JBQ0YsQ0FBQztvQkFDRCxTQUFTLEVBQUUsT0FBTztvQkFDbEIsU0FBUyxFQUFFLFNBQVM7b0JBQ3BCLFNBQVMsRUFBRSxnQkFBZ0I7b0JBQzNCLFVBQVUsRUFBRSxRQUFRO29CQUNwQixTQUFTLEdBQUcsVUFBVSxFQUFFLGVBQWU7b0JBQ3ZDLFNBQVMsR0FBRyxVQUFVLEVBQUUsaUJBQWlCO29CQUN6QyxTQUFTLEdBQUcsVUFBVSxFQUFFLHdCQUF3QjtpQkFDaEQ7YUFDRCxDQUFDO1FBQ0gsQ0FBQzthQUFNLENBQUM7WUFDUCxNQUFNLE1BQU0sR0FBRyxnQkFBZ0IsQ0FBQztZQUNoQyxNQUFNLEtBQUssR0FBRyxjQUFjLENBQUM7WUFFN0IsT0FBTztnQkFDTjtvQkFDQyxDQUFDO29CQUNELE1BQU0sRUFBRSxPQUFPO29CQUNmLE1BQU0sRUFBRSxTQUFTO29CQUNqQixNQUFNLEVBQUUsZ0JBQWdCO29CQUN4QixNQUFNLEVBQUUsUUFBUTtvQkFDaEIsTUFBTSxFQUFFLGVBQWU7b0JBQ3ZCLE1BQU0sRUFBRSxpQkFBaUI7b0JBQ3pCLE1BQU0sRUFBRSx3QkFBd0I7aUJBQ2hDLEVBQUU7b0JBQ0YsQ0FBQztvQkFDRCxLQUFLLEVBQUUsT0FBTztvQkFDZCxLQUFLLEVBQUUsU0FBUztvQkFDaEIsS0FBSyxFQUFFLGdCQUFnQjtvQkFDdkIsS0FBSyxFQUFFLFFBQVE7b0JBQ2YsS0FBSyxFQUFFLGVBQWU7b0JBQ3RCLEtBQUssRUFBRSxpQkFBaUI7b0JBQ3hCLEtBQUssRUFBRSx3QkFBd0I7aUJBQy9CO2FBQ0QsQ0FBQztRQUNILENBQUM7SUFDRixDQUFDO0lBRU0sTUFBTSxDQUFDLEtBQWU7UUFDNUIsT0FBTyxDQUNOLElBQUksQ0FBQyxVQUFVLEtBQUssS0FBSyxDQUFDLFVBQVU7ZUFDakMsSUFBSSxDQUFDLFVBQVUsS0FBSyxLQUFLLENBQUMsVUFBVTtlQUNwQyxJQUFJLENBQUMsa0JBQWtCLEtBQUssS0FBSyxDQUFDLGtCQUFrQjtlQUNwRCxJQUFJLENBQUMsWUFBWSxLQUFLLEtBQUssQ0FBQyxZQUFZO2VBQ3hDLElBQUksQ0FBQyxXQUFXLEtBQUssS0FBSyxDQUFDLFdBQVc7ZUFDdEMsSUFBSSxDQUFDLFVBQVUsS0FBSyxLQUFLLENBQUMsVUFBVTtlQUNwQyxJQUFJLENBQUMsaUJBQWlCLEtBQUssS0FBSyxDQUFDLGlCQUFpQjtlQUNsRCxJQUFJLENBQUMsa0JBQWtCLEtBQUssS0FBSyxDQUFDLGtCQUFrQjtlQUNwRCxJQUFJLENBQUMsb0JBQW9CLEtBQUssS0FBSyxDQUFDLG9CQUFvQjtlQUN4RCxJQUFJLENBQUMsU0FBUyxLQUFLLEtBQUssQ0FBQyxTQUFTO2VBQ2xDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxLQUFLLENBQUMsZUFBZSxDQUFDO2VBQ3pELElBQUksQ0FBQyxHQUFHLEtBQUssS0FBSyxDQUFDLEdBQUc7ZUFDdEIsSUFBSSxDQUFDLEtBQUssS0FBSyxLQUFLLENBQUMsS0FBSztlQUMxQixJQUFJLENBQUMsUUFBUSxLQUFLLEtBQUssQ0FBQyxRQUFRO2VBQ2hDLElBQUksQ0FBQyxTQUFTLEtBQUssS0FBSyxDQUFDLFNBQVM7ZUFDbEMsSUFBSSxDQUFDLFdBQVcsS0FBSyxLQUFLLENBQUMsV0FBVztlQUN0QyxJQUFJLENBQUMsWUFBWSxLQUFLLEtBQUssQ0FBQyxZQUFZLENBQzNDLENBQUM7SUFDSCxDQUFDO0NBQ0Q7QUFFRCxJQUFXLFNBRVY7QUFGRCxXQUFXLFNBQVM7SUFDbkIsMkVBQXlCLENBQUE7QUFDMUIsQ0FBQyxFQUZVLFNBQVMsS0FBVCxTQUFTLFFBRW5CO0FBRUQsSUFBVyxpQkFLVjtBQUxELFdBQVcsaUJBQWlCO0lBQzNCLHlEQUFRLENBQUE7SUFDUiw2REFBVSxDQUFBO0lBQ1YsMkRBQVMsQ0FBQTtJQUNULHlEQUFRLENBQUE7QUFDVCxDQUFDLEVBTFUsaUJBQWlCLEtBQWpCLGlCQUFpQixRQUszQjtBQU9ELElBQVcsaUJBSVY7QUFKRCxXQUFXLGlCQUFpQjtJQUMzQixtRUFBYSxDQUFBO0lBQ2IsMkRBQVMsQ0FBQTtJQUNULDZEQUFVLENBQUE7QUFDWCxDQUFDLEVBSlUsaUJBQWlCLEtBQWpCLGlCQUFpQixRQUkzQjtBQUVELE1BQU0sT0FBTyx3QkFBeUIsU0FBUSxRQUFRO0lBWXJELFlBQVksT0FBb0I7UUFDL0IsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBWFIsd0JBQW1CLHVDQUFrRDtRQU9yRSx5QkFBb0IsR0FBb0MsRUFBRSxDQUFDO1FBQzNELDZCQUF3QixHQUFhLEVBQUUsQ0FBQztRQUsvQyxJQUFJLENBQUMsUUFBUSxHQUFHLGlCQUFpQixDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztRQUNwRSxJQUFJLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1FBQ3ZELElBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3RDLElBQUksQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3BDLElBQUksQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ25DLElBQUksQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLGFBQWEsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUVsRCxJQUFJLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRTVCLElBQUksQ0FBQywyQkFBMkIsR0FBRyxvQkFBb0IsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRTtZQUN6RSxJQUFJLENBQUMsQ0FBQyxlQUFlLEVBQUUsQ0FBQztnQkFDdkIsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUM1QixDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsQ0FBQyxFQUFFLFFBQVEsRUFBRSxJQUFJLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxDQUFDO0lBQ3JHLENBQUM7SUFFZSxPQUFPO1FBQ3RCLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNoQixJQUFJLENBQUMsMkJBQTJCLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDNUMsQ0FBQztJQUVPLGVBQWUsQ0FBQyxTQUFrQjtRQUN6QyxNQUFNLFdBQVcsR0FBRyxJQUFJLFFBQVEsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLGFBQWEsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ25GLElBQUksSUFBSSxDQUFDLFNBQVMsSUFBSSxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDO1lBQzFELGdCQUFnQjtZQUNoQixPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7UUFFRCxJQUFJLENBQUMsU0FBUyxHQUFHLFdBQVcsQ0FBQztRQUU3QixJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3pDLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDN0MsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNoRCxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ2xELElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQztRQUN6RCxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxZQUFZLENBQUM7UUFFM0QsSUFBSSxTQUFTLEVBQUUsQ0FBQztZQUNmLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNoQixDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRUQsaUNBQWlDO0lBRXpCLHNCQUFzQjtRQUM3QixJQUFJLENBQUMsbUJBQW1CLG1DQUEyQixDQUFDO1FBQ3BELE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVPLDJCQUEyQjtRQUNsQyxJQUFJLENBQUMsbUJBQW1CLGtDQUEwQixDQUFDO1FBQ25ELE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVlLHNCQUFzQixDQUFDLENBQTJDO1FBQ2pGLE9BQU8sSUFBSSxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLHNCQUFzQixFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQztJQUM1RSxDQUFDO0lBQ2Usb0JBQW9CLENBQUMsQ0FBeUM7UUFDN0UsSUFBSSxDQUFDLGdCQUFnQixHQUFHLEVBQUUsQ0FBQztRQUMzQixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLEdBQUcsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ3pELElBQUksS0FBSyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsaUJBQWlCLENBQUM7WUFDN0MsSUFBSSxHQUFHLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ2IsS0FBSyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsb0JBQW9CLENBQUM7WUFDM0YsQ0FBQztZQUNELElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO1FBQ2hGLENBQUM7UUFDRCxJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1FBQy9FLE9BQU8sSUFBSSxDQUFDLDJCQUEyQixFQUFFLENBQUM7SUFDM0MsQ0FBQztJQUNlLG9CQUFvQixDQUFDLENBQXlDO1FBQzdFLElBQUksQ0FBQyxDQUFDLG9CQUFvQixFQUFFLENBQUM7WUFDNUIsT0FBTyxJQUFJLENBQUMsMkJBQTJCLEVBQUUsQ0FBQztRQUMzQyxDQUFDO1FBQ0QsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBQ2UsU0FBUyxDQUFDLENBQThCO1FBQ3ZELE9BQU8sSUFBSSxDQUFDLHNCQUFzQixFQUFFLENBQUM7SUFDdEMsQ0FBQztJQUNlLGVBQWUsQ0FBQyxDQUFvQztRQUNuRSxPQUFPLENBQUMsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLHNCQUFzQixFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQztJQUN0RSxDQUFDO0lBQ2UsY0FBYyxDQUFDLENBQW1DO1FBQ2pFLE9BQU8sSUFBSSxDQUFDLHNCQUFzQixFQUFFLENBQUM7SUFDdEMsQ0FBQztJQUNlLGNBQWMsQ0FBQyxDQUFtQztRQUNqRSxPQUFPLElBQUksQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxzQkFBc0IsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUM7SUFDNUUsQ0FBQztJQUVELCtCQUErQjtJQUV4QixVQUFVO1FBQ2hCLE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUM7SUFDOUIsQ0FBQztJQUVNLGFBQWEsQ0FBQyxHQUFxQjtRQUN6QyxrQkFBa0I7SUFDbkIsQ0FBQztJQUVNLE1BQU0sQ0FBQyxTQUFxQztRQUNsRCxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDZixJQUFJLENBQUMsbUJBQW1CLHNDQUE4QixDQUFDO0lBQ3hELENBQUM7SUFFTyxPQUFPO1FBQ2QsTUFBTSxlQUFlLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxlQUFlLENBQUM7UUFDdkQsSUFBSSxJQUFJLENBQUMsU0FBUyxDQUFDLGtCQUFrQixLQUFLLENBQUMsRUFBRSxDQUFDO1lBQzdDLHdCQUF3QjtZQUN4QixJQUFJLENBQUMsUUFBUSxDQUFDLGtCQUFrQixDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUN0RyxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNqQyxPQUFPO1FBQ1IsQ0FBQztRQUVELE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLDhCQUE4QixDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDaEcsV0FBVyxDQUFDLElBQUksQ0FBQyw2QkFBNkIsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1FBRXhFLElBQUksSUFBSSxDQUFDLG1CQUFtQixvQ0FBNEIsSUFBSSxDQUFDLDZCQUE2QixDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsV0FBVyxDQUFDLEVBQUUsQ0FBQztZQUM5SSxJQUFJLENBQUMsbUJBQW1CLG1DQUEyQixDQUFDO1FBQ3JELENBQUM7UUFDRCxJQUFJLElBQUksQ0FBQyxtQkFBbUIsb0NBQTRCLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLHdCQUF3QixFQUFFLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsVUFBVSxLQUFLLENBQUMsQ0FBQyxRQUFRLENBQUMsVUFBVSxJQUFJLENBQUMsQ0FBQyxLQUFLLEtBQUssQ0FBQyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDN00sSUFBSSxDQUFDLG1CQUFtQixtQ0FBMkIsQ0FBQztRQUNyRCxDQUFDO1FBQ0QsSUFBSSxJQUFJLENBQUMsbUJBQW1CLG9DQUE0QixFQUFFLENBQUM7WUFDMUQscUVBQXFFO1lBQ3JFLE9BQU87UUFDUixDQUFDO1FBQ0QsSUFBSSxDQUFDLG9CQUFvQixHQUFHLFdBQVcsQ0FBQztRQUN4QyxJQUFJLENBQUMsd0JBQXdCLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDO1FBRXRELElBQUksQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ2xDLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDO1FBQy9DLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsWUFBWSxDQUFDO1FBQ2pELE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDO1FBQzdDLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDO1FBQzVDLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLGVBQWUsRUFBRSxDQUFDO1FBQy9ELE1BQU0sV0FBVyxHQUFHLFlBQVksR0FBRyxXQUFXLENBQUM7UUFFL0MsTUFBTSxtQkFBbUIsR0FBRyxDQUFDLDBDQUFrQyxJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUM5RixNQUFNLHVCQUF1QixHQUFHLENBQUMsbUJBQW1CLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBRTlELE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUUsQ0FBQztRQUMxRCxJQUFJLGVBQWUsRUFBRSxDQUFDO1lBQ3JCLElBQUksZUFBZSxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUM7Z0JBQ2hDLDJGQUEyRjtnQkFDM0YsU0FBUyxDQUFDLFNBQVMsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsZUFBZSxDQUFDLENBQUM7Z0JBQ25FLFNBQVMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxXQUFXLEVBQUUsWUFBWSxDQUFDLENBQUM7WUFDckQsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLDBGQUEwRjtnQkFDMUYsZUFBZTtnQkFDZixTQUFTLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsV0FBVyxFQUFFLFlBQVksQ0FBQyxDQUFDO2dCQUNyRCxTQUFTLENBQUMsU0FBUyxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxlQUFlLENBQUMsQ0FBQztnQkFDbkUsU0FBUyxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLFdBQVcsRUFBRSxZQUFZLENBQUMsQ0FBQztZQUNyRCxDQUFDO1FBQ0YsQ0FBQzthQUFNLENBQUM7WUFDUCxtQ0FBbUM7WUFDbkMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLFdBQVcsRUFBRSxZQUFZLENBQUMsQ0FBQztRQUN0RCxDQUFDO1FBRUQsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7UUFDM0IsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7UUFJM0IsS0FBSyxNQUFNLGVBQWUsSUFBSSxXQUFXLEVBQUUsQ0FBQztZQUMzQyxNQUFNLEtBQUssR0FBRyxlQUFlLENBQUMsS0FBSyxDQUFDO1lBQ3BDLE1BQU0sbUJBQW1CLEdBQUcsZUFBZSxDQUFDLElBQUksQ0FBQztZQUVqRCxTQUFTLENBQUMsU0FBUyxHQUFHLEtBQUssQ0FBQztZQUU1QixJQUFJLFFBQVEsR0FBRyxDQUFDLENBQUM7WUFDakIsSUFBSSxNQUFNLEdBQUcsQ0FBQyxDQUFDO1lBQ2YsSUFBSSxNQUFNLEdBQUcsQ0FBQyxDQUFDO1lBQ2YsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxHQUFHLG1CQUFtQixDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO2dCQUNwRSxNQUFNLElBQUksR0FBRyxtQkFBbUIsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQ3hDLE1BQU0sZUFBZSxHQUFHLG1CQUFtQixDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQ3ZELE1BQU0sYUFBYSxHQUFHLG1CQUFtQixDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBRXJELElBQUksRUFBRSxHQUFHLENBQUMsVUFBVSxDQUFDLDhCQUE4QixDQUFDLGVBQWUsQ0FBQyxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDeEYsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDLFVBQVUsQ0FBQyw4QkFBOEIsQ0FBQyxhQUFhLENBQUMsR0FBRyxVQUFVLENBQUMsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ3JHLE1BQU0sTUFBTSxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUM7Z0JBQ3ZCLElBQUksTUFBTSxHQUFHLG1CQUFtQixFQUFFLENBQUM7b0JBQ2xDLElBQUksT0FBTyxHQUFHLENBQUMsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO29CQUNsQyxJQUFJLE9BQU8sR0FBRyx1QkFBdUIsRUFBRSxDQUFDO3dCQUN2QyxPQUFPLEdBQUcsdUJBQXVCLENBQUM7b0JBQ25DLENBQUM7eUJBQU0sSUFBSSxPQUFPLEdBQUcsdUJBQXVCLEdBQUcsWUFBWSxFQUFFLENBQUM7d0JBQzdELE9BQU8sR0FBRyxZQUFZLEdBQUcsdUJBQXVCLENBQUM7b0JBQ2xELENBQUM7b0JBQ0QsRUFBRSxHQUFHLE9BQU8sR0FBRyx1QkFBdUIsQ0FBQztvQkFDdkMsRUFBRSxHQUFHLE9BQU8sR0FBRyx1QkFBdUIsQ0FBQztnQkFDeEMsQ0FBQztnQkFFRCxJQUFJLEVBQUUsR0FBRyxNQUFNLEdBQUcsQ0FBQyxJQUFJLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztvQkFDMUMsYUFBYTtvQkFDYixJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQzt3QkFDYixTQUFTLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxFQUFFLE1BQU0sR0FBRyxNQUFNLENBQUMsQ0FBQztvQkFDdkUsQ0FBQztvQkFDRCxRQUFRLEdBQUcsSUFBSSxDQUFDO29CQUNoQixNQUFNLEdBQUcsRUFBRSxDQUFDO29CQUNaLE1BQU0sR0FBRyxFQUFFLENBQUM7Z0JBQ2IsQ0FBQztxQkFBTSxDQUFDO29CQUNQLGtCQUFrQjtvQkFDbEIsSUFBSSxFQUFFLEdBQUcsTUFBTSxFQUFFLENBQUM7d0JBQ2pCLE1BQU0sR0FBRyxFQUFFLENBQUM7b0JBQ2IsQ0FBQztnQkFDRixDQUFDO1lBQ0YsQ0FBQztZQUNELFNBQVMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLEVBQUUsTUFBTSxHQUFHLE1BQU0sQ0FBQyxDQUFDO1FBQ3ZFLENBQUM7UUFFRCxlQUFlO1FBQ2YsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDaEMsTUFBTSxZQUFZLEdBQUcsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDekQsTUFBTSxnQkFBZ0IsR0FBRyxDQUFDLFlBQVksR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDaEQsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLGdDQUF3QixDQUFDO1lBQ3pELE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxnQ0FBd0IsQ0FBQztZQUV6RCxJQUFJLE1BQU0sR0FBRyxDQUFDLEdBQUcsQ0FBQztZQUNsQixJQUFJLE1BQU0sR0FBRyxDQUFDLEdBQUcsQ0FBQztZQUNsQixJQUFJLFNBQVMsR0FBa0IsSUFBSSxDQUFDO1lBQ3BDLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztnQkFDbEUsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQztnQkFDN0MsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO29CQUNaLFNBQVM7Z0JBQ1YsQ0FBQztnQkFDRCxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDO2dCQUVqRCxJQUFJLE9BQU8sR0FBRyxDQUFDLFVBQVUsQ0FBQyw4QkFBOEIsQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUMvRixJQUFJLE9BQU8sR0FBRyxnQkFBZ0IsRUFBRSxDQUFDO29CQUNoQyxPQUFPLEdBQUcsZ0JBQWdCLENBQUM7Z0JBQzVCLENBQUM7cUJBQU0sSUFBSSxPQUFPLEdBQUcsZ0JBQWdCLEdBQUcsWUFBWSxFQUFFLENBQUM7b0JBQ3RELE9BQU8sR0FBRyxZQUFZLEdBQUcsZ0JBQWdCLENBQUM7Z0JBQzNDLENBQUM7Z0JBQ0QsTUFBTSxFQUFFLEdBQUcsT0FBTyxHQUFHLGdCQUFnQixDQUFDO2dCQUN0QyxNQUFNLEVBQUUsR0FBRyxFQUFFLEdBQUcsWUFBWSxDQUFDO2dCQUU3QixJQUFJLEVBQUUsR0FBRyxNQUFNLEdBQUcsQ0FBQyxJQUFJLEtBQUssS0FBSyxTQUFTLEVBQUUsQ0FBQztvQkFDNUMsYUFBYTtvQkFDYixJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksU0FBUyxFQUFFLENBQUM7d0JBQzFCLFNBQVMsQ0FBQyxRQUFRLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsTUFBTSxHQUFHLE1BQU0sQ0FBQyxDQUFDO29CQUMvRCxDQUFDO29CQUNELE1BQU0sR0FBRyxFQUFFLENBQUM7b0JBQ1osTUFBTSxHQUFHLEVBQUUsQ0FBQztnQkFDYixDQUFDO3FCQUFNLENBQUM7b0JBQ1Asa0JBQWtCO29CQUNsQixJQUFJLEVBQUUsR0FBRyxNQUFNLEVBQUUsQ0FBQzt3QkFDakIsTUFBTSxHQUFHLEVBQUUsQ0FBQztvQkFDYixDQUFDO2dCQUNGLENBQUM7Z0JBQ0QsU0FBUyxHQUFHLEtBQUssQ0FBQztnQkFDbEIsU0FBUyxDQUFDLFNBQVMsR0FBRyxLQUFLLENBQUM7WUFDN0IsQ0FBQztZQUNELElBQUksU0FBUyxFQUFFLENBQUM7Z0JBQ2YsU0FBUyxDQUFDLFFBQVEsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxNQUFNLEdBQUcsTUFBTSxDQUFDLENBQUM7WUFDL0QsQ0FBQztRQUNGLENBQUM7UUFFRCxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsWUFBWSxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsV0FBVyxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsa0JBQWtCLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDeEcsU0FBUyxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ3RCLFNBQVMsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDO1lBQ3hCLFNBQVMsQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUM7WUFDbkQsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDdkIsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsWUFBWSxDQUFDLENBQUM7WUFDbEMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDdkIsU0FBUyxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDakMsU0FBUyxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ3BCLENBQUM7SUFDRixDQUFDO0NBQ0QifQ==