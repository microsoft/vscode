/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { getWindow } from '../../../../../base/browser/dom.js';
import { createFastDomNode } from '../../../../../base/browser/fastDomNode.js';
import { PixelRatio } from '../../../../../base/browser/pixelRatio.js';
import { IThemeService, Themable } from '../../../../../platform/theme/common/themeService.js';
import { NotebookOverviewRulerLane } from '../notebookBrowser.js';
let NotebookOverviewRuler = class NotebookOverviewRuler extends Themable {
    constructor(notebookEditor, container, themeService) {
        super(themeService);
        this.notebookEditor = notebookEditor;
        this._lanes = 3;
        this._domNode = createFastDomNode(document.createElement('canvas'));
        this._domNode.setPosition('relative');
        this._domNode.setLayerHinting(true);
        this._domNode.setContain('strict');
        container.appendChild(this._domNode.domNode);
        this._register(notebookEditor.onDidChangeDecorations(() => {
            this.layout();
        }));
        this._register(PixelRatio.getInstance(getWindow(this._domNode.domNode)).onDidChange(() => {
            this.layout();
        }));
    }
    layout() {
        const width = 10;
        const layoutInfo = this.notebookEditor.getLayoutInfo();
        const scrollHeight = layoutInfo.scrollHeight;
        const height = layoutInfo.height;
        const ratio = PixelRatio.getInstance(getWindow(this._domNode.domNode)).value;
        this._domNode.setWidth(width);
        this._domNode.setHeight(height);
        this._domNode.domNode.width = width * ratio;
        this._domNode.domNode.height = height * ratio;
        const ctx = this._domNode.domNode.getContext('2d');
        ctx.clearRect(0, 0, width * ratio, height * ratio);
        this._render(ctx, width * ratio, height * ratio, scrollHeight * ratio, ratio);
    }
    _render(ctx, width, height, scrollHeight, ratio) {
        const viewModel = this.notebookEditor.getViewModel();
        const fontInfo = this.notebookEditor.getLayoutInfo().fontInfo;
        const laneWidth = width / this._lanes;
        let currentFrom = 0;
        if (viewModel) {
            for (let i = 0; i < viewModel.viewCells.length; i++) {
                const viewCell = viewModel.viewCells[i];
                const textBuffer = viewCell.textBuffer;
                const decorations = viewCell.getCellDecorations();
                const cellHeight = (viewCell.layoutInfo.totalHeight / scrollHeight) * ratio * height;
                decorations.filter(decoration => decoration.overviewRuler).forEach(decoration => {
                    const overviewRuler = decoration.overviewRuler;
                    const fillStyle = this.getColor(overviewRuler.color) ?? '#000000';
                    const lineHeight = Math.min(fontInfo.lineHeight, (viewCell.layoutInfo.editorHeight / scrollHeight / textBuffer.getLineCount()) * ratio * height);
                    const lineNumbers = overviewRuler.modelRanges.map(range => range.startLineNumber).reduce((previous, current) => {
                        if (previous.length === 0) {
                            previous.push(current);
                        }
                        else {
                            const last = previous[previous.length - 1];
                            if (last !== current) {
                                previous.push(current);
                            }
                        }
                        return previous;
                    }, []);
                    let x = 0;
                    switch (overviewRuler.position) {
                        case NotebookOverviewRulerLane.Left:
                            x = 0;
                            break;
                        case NotebookOverviewRulerLane.Center:
                            x = laneWidth;
                            break;
                        case NotebookOverviewRulerLane.Right:
                            x = laneWidth * 2;
                            break;
                        default:
                            break;
                    }
                    const width = overviewRuler.position === NotebookOverviewRulerLane.Full ? laneWidth * 3 : laneWidth;
                    for (let i = 0; i < lineNumbers.length; i++) {
                        ctx.fillStyle = fillStyle;
                        const lineNumber = lineNumbers[i];
                        const offset = (lineNumber - 1) * lineHeight;
                        ctx.fillRect(x, currentFrom + offset, width, lineHeight);
                    }
                    if (overviewRuler.includeOutput) {
                        ctx.fillStyle = fillStyle;
                        const outputOffset = (viewCell.layoutInfo.editorHeight / scrollHeight) * ratio * height;
                        const decorationHeight = (fontInfo.lineHeight / scrollHeight) * ratio * height;
                        ctx.fillRect(laneWidth, currentFrom + outputOffset, laneWidth, decorationHeight);
                    }
                });
                currentFrom += cellHeight;
            }
            const overviewRulerDecorations = viewModel.getOverviewRulerDecorations();
            for (let i = 0; i < overviewRulerDecorations.length; i++) {
                const decoration = overviewRulerDecorations[i];
                if (!decoration.options.overviewRuler) {
                    continue;
                }
                const viewZoneInfo = this.notebookEditor.getViewZoneLayoutInfo(decoration.viewZoneId);
                if (!viewZoneInfo) {
                    continue;
                }
                const fillStyle = this.getColor(decoration.options.overviewRuler.color) ?? '#000000';
                let x = 0;
                switch (decoration.options.overviewRuler.position) {
                    case NotebookOverviewRulerLane.Left:
                        x = 0;
                        break;
                    case NotebookOverviewRulerLane.Center:
                        x = laneWidth;
                        break;
                    case NotebookOverviewRulerLane.Right:
                        x = laneWidth * 2;
                        break;
                    default:
                        break;
                }
                const width = decoration.options.overviewRuler.position === NotebookOverviewRulerLane.Full ? laneWidth * 3 : laneWidth;
                ctx.fillStyle = fillStyle;
                const viewZoneHeight = (viewZoneInfo.height / scrollHeight) * ratio * height;
                const viewZoneTop = (viewZoneInfo.top / scrollHeight) * ratio * height;
                ctx.fillRect(x, viewZoneTop, width, viewZoneHeight);
            }
        }
    }
};
NotebookOverviewRuler = __decorate([
    __param(2, IThemeService)
], NotebookOverviewRuler);
export { NotebookOverviewRuler };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tPdmVydmlld1J1bGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci92aWV3UGFydHMvbm90ZWJvb2tPdmVydmlld1J1bGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUMvRCxPQUFPLEVBQUUsaUJBQWlCLEVBQWUsTUFBTSw0Q0FBNEMsQ0FBQztBQUM1RixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDdkUsT0FBTyxFQUFFLGFBQWEsRUFBRSxRQUFRLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMvRixPQUFPLEVBQTJCLHlCQUF5QixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFFcEYsSUFBTSxxQkFBcUIsR0FBM0IsTUFBTSxxQkFBc0IsU0FBUSxRQUFRO0lBSWxELFlBQXFCLGNBQXVDLEVBQUUsU0FBc0IsRUFBaUIsWUFBMkI7UUFDL0gsS0FBSyxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBREEsbUJBQWMsR0FBZCxjQUFjLENBQXlCO1FBRnBELFdBQU0sR0FBRyxDQUFDLENBQUM7UUFJbEIsSUFBSSxDQUFDLFFBQVEsR0FBRyxpQkFBaUIsQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7UUFDcEUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDdEMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDcEMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLENBQUM7UUFFbkMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENB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