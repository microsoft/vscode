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
var OverviewRulerFeature_1;
import { EventType, addDisposableListener, addStandardDisposableListener, h } from '../../../../../base/browser/dom.js';
import { createFastDomNode } from '../../../../../base/browser/fastDomNode.js';
import { ScrollbarState } from '../../../../../base/browser/ui/scrollbar/scrollbarState.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, autorunWithStore, derived, observableFromEvent, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { appendRemoveOnDispose } from '../utils.js';
import { Position } from '../../../../common/core/position.js';
import { OverviewRulerZone } from '../../../../common/viewModel/overviewZoneManager.js';
import { defaultInsertColor, defaultRemoveColor, diffInserted, diffOverviewRulerInserted, diffOverviewRulerRemoved, diffRemoved } from '../../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
let OverviewRulerFeature = class OverviewRulerFeature extends Disposable {
    static { OverviewRulerFeature_1 = this; }
    static { this.ONE_OVERVIEW_WIDTH = 15; }
    static { this.ENTIRE_DIFF_OVERVIEW_WIDTH = this.ONE_OVERVIEW_WIDTH * 2; }
    constructor(_editors, _rootElement, _diffModel, _rootWidth, _rootHeight, _modifiedEditorLayoutInfo, _themeService) {
        super();
        this._editors = _editors;
        this._rootElement = _rootElement;
        this._diffModel = _diffModel;
        this._rootWidth = _rootWidth;
        this._rootHeight = _rootHeight;
        this._modifiedEditorLayoutInfo = _modifiedEditorLayoutInfo;
        this._themeService = _themeService;
        this.width = OverviewRulerFeature_1.ENTIRE_DIFF_OVERVIEW_WIDTH;
        const currentColorTheme = observableFromEvent(this._themeService.onDidColorThemeChange, () => this._themeService.getColorTheme());
        const currentColors = derived(reader => {
            /** @description colors */
            const theme = currentColorTheme.read(reader);
            const insertColor = theme.getColor(diffOverviewRulerInserted) || (theme.getColor(diffInserted) || defaultInsertColor).transparent(2);
            const removeColor = theme.getColor(diffOverviewRulerRemoved) || (theme.getColor(diffRemoved) || defaultRemoveColor).transparent(2);
            return { insertColor, removeColor };
        });
        const viewportDomElement = createFastDomNode(document.createElement('div'));
        viewportDomElement.setClassName('diffViewport');
        viewportDomElement.setPosition('absolute');
        const diffOverviewRoot = h('div.diffOverview', {
            style: { position: 'absolute', top: '0px', width: OverviewRulerFeature_1.ENTIRE_DIFF_OVERVIEW_WIDTH + 'px' }
        }).root;
        this._register(appendRemoveOnDispose(diffOverviewRoot, viewportDomElement.domNode));
        this._register(addStandardDisposableListener(diffOverviewRoot, EventType.POINTER_DOWN, (e) => {
            this._editors.modified.delegateVerticalScrollbarPointerDown(e);
        }));
        this._register(addDisposableListener(diffOverviewRoot, EventType.MOUSE_WHEEL, (e) => {
            this._editors.modified.delegateScrollFromMouseWheelEvent(e);
        }, { passive: false }));
        this._register(appendRemoveOnDispose(this._rootElement, diffOverviewRoot));
        this._register(autorunWithStore((reader, store) => {
            /** @description recreate overview rules when model changes */
            const m = this._diffModel.read(reader);
            const originalOverviewRuler = this._editors.original.createOverviewRuler('original diffOverviewRuler');
            if (originalOverviewRuler) {
                store.add(originalOverviewRuler);
                store.add(appendRemoveOnDispose(diffOverviewRoot, originalOverviewRuler.getDomNode()));
            }
            const modifiedOverviewRuler = this._editors.modified.createOverviewRuler('modified diffOverviewRuler');
            if (modifiedOverviewRuler) {
                store.add(modifiedOverviewRuler);
                store.add(appendRemoveOnDispose(diffOverviewRoot, modifiedOverviewRuler.getDomNode()));
            }
            if (!originalOverviewRuler || !modifiedOverviewRuler) {
                // probably no model
                return;
            }
            const origViewZonesChanged = observableSignalFromEvent('viewZoneChanged', this._editors.original.onDidChangeViewZones);
            const modViewZonesChanged = observableSignalFromEvent('viewZoneChanged', this._editors.modified.onDidChangeViewZones);
            const origHiddenRangesChanged = observableSignalFromEvent('hiddenRangesChanged', this._editors.original.onDidChangeHiddenAreas);
            const modHiddenRangesChanged = observableSignalFromEvent('hiddenRangesChanged', this._editors.modified.onDidChangeHiddenAreas);
            store.add(autorun(reader => {
                /** @description set overview ruler zones */
                origViewZonesChanged.read(reader);
                modViewZonesChanged.read(reader);
                origHiddenRangesChanged.read(reader);
                modHiddenRangesChanged.read(reader);
                const colors = currentColors.read(reader);
                const diff = m?.diff.read(reader)?.mappings;
                function createZones(ranges, color, editor) {
                    const vm = editor._getViewModel();
                    if (!vm) {
                        return [];
                    }
                    return ranges
                        .filter(d => d.length > 0)
                        .map(r => {
                        const start = vm.coordinatesConverter.convertModelPositionToViewPosition(new Position(r.startLineNumber, 1));
                        const end = vm.coordinatesConverter.convertModelPositionToViewPosition(new Position(r.endLineNumberExclusive, 1));
                        // By computing the lineCount, we won't ask the view model later for the bottom vertical position.
                        // (The view model will take into account the alignment viewzones, which will give
                        // modifications and deletetions always the same height.)
                        const lineCount = end.lineNumber - start.lineNumber;
                        return new OverviewRulerZone(start.lineNumber, end.lineNumber, lineCount, color.toString());
                    });
                }
                const originalZones = createZones((diff || []).map(d => d.lineRangeMapping.original), colors.removeColor, this._editors.original);
                const modifiedZones = createZones((diff || []).map(d => d.lineRangeMapping.modified), colors.insertColor, this._editors.modified);
                originalOverviewRuler?.setZones(originalZones);
                modifiedOverviewRuler?.setZones(modifiedZones);
            }));
            store.add(autorun(reader => {
                /** @description layout overview ruler */
                const height = this._rootHeight.read(reader);
                const width = this._rootWidth.read(reader);
                const layoutInfo = this._modifiedEditorLayoutInfo.read(reader);
                if (layoutInfo) {
                    const freeSpace = OverviewRulerFeature_1.ENTIRE_DIFF_OVERVIEW_WIDTH - 2 * OverviewRulerFeature_1.ONE_OVERVIEW_WIDTH;
                    originalOverviewRuler.setLayout({
                        top: 0,
                        height: height,
                        right: freeSpace + OverviewRulerFeature_1.ONE_OVERVIEW_WIDTH,
                        width: OverviewRulerFeature_1.ONE_OVERVIEW_WIDTH,
                    });
                    modifiedOverviewRuler.setLayout({
                        top: 0,
                        height: height,
                        right: 0,
                        width: OverviewRulerFeature_1.ONE_OVERVIEW_WIDTH,
                    });
                    const scrollTop = this._editors.modifiedScrollTop.read(reader);
                    const scrollHeight = this._editors.modifiedScrollHeight.read(reader);
                    const scrollBarOptions = this._editors.modified.getOption(117 /* EditorOption.scrollbar */);
                    const state = new ScrollbarState(scrollBarOptions.verticalHasArrows ? scrollBarOptions.arrowSize : 0, scrollBarOptions.verticalScrollbarSize, 0, layoutInfo.height, scrollHeight, scrollTop);
                    viewportDomElement.setTop(state.getSliderPosition());
                    viewportDomElement.setHeight(state.getSliderSize());
                }
                else {
                    viewportDomElement.setTop(0);
                    viewportDomElement.setHeight(0);
                }
                diffOverviewRoot.style.height = height + 'px';
                diffOverviewRoot.style.left = (width - OverviewRulerFeature_1.ENTIRE_DIFF_OVERVIEW_WIDTH) + 'px';
                viewportDomElement.setWidth(OverviewRulerFeature_1.ENTIRE_DIFF_OVERVIEW_WIDTH);
            }));
        }));
    }
};
OverviewRulerFeature = OverviewRulerFeature_1 = __decorate([
    __param(6, IThemeService)
], OverviewRulerFeature);
export { OverviewRulerFeature };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3ZlcnZpZXdSdWxlckZlYXR1cmUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvYnJvd3Nlci93aWRnZXQvZGlmZkVkaXRvci9mZWF0dXJlcy9vdmVydmlld1J1bGVyRmVhdHVyZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFNBQVMsRUFBRSxxQkFBcUIsRUFBRSw2QkFBNkIsRUFBRSxDQUFDLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUN4SCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUUvRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFFNUYsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3JFLE9BQU8sRUFBZSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLHlCQUF5QixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFJM0osT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sYUFBYSxDQUFDO0FBR3BELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUN4RixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsa0JBQWtCLEVBQUUsWUFBWSxFQUFFLHlCQUF5QixFQUFFLHdCQUF3QixFQUFFLFdBQVcsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQy9MLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUU5RSxJQUFNLG9CQUFvQixHQUExQixNQUFNLG9CQUFxQixTQUFRLFVBQVU7O2FBQzNCLHVCQUFrQixHQUFHLEVBQUUsQUFBTCxDQUFNO2FBQ3pCLCtCQUEwQixHQUFH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