var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { n } from '../../../../../../../../base/browser/dom.js';
import { Event } from '../../../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../../../base/common/lifecycle.js';
import { autorun, constObservable, debouncedObservable2, derived, derivedDisposable, observableFromEvent } from '../../../../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../../../../platform/instantiation/common/instantiation.js';
import { observableCodeEditor } from '../../../../../../../browser/observableCodeEditor.js';
import { Rect } from '../../../../../../../common/core/2d/rect.js';
import { Position } from '../../../../../../../common/core/position.js';
import { InlineEditTabAction } from '../../inlineEditsViewInterface.js';
import { getContentSizeOfLines, rectToProps } from '../../utils/utils.js';
import { OffsetRange } from '../../../../../../../common/core/ranges/offsetRange.js';
import { LineRange } from '../../../../../../../common/core/ranges/lineRange.js';
import { HideUnchangedRegionsFeature } from '../../../../../../../browser/widget/diffEditor/features/hideUnchangedRegionsFeature.js';
import { Codicon } from '../../../../../../../../base/common/codicons.js';
import { renderIcon } from '../../../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { SymbolKinds } from '../../../../../../../common/languages.js';
import { debugLogHorizontalOffsetRanges, debugLogRects, debugView } from '../debugVisualization.js';
import { distributeFlexBoxLayout } from '../../utils/flexBoxLayout.js';
import { Point } from '../../../../../../../common/core/2d/point.js';
import { IThemeService } from '../../../../../../../../platform/theme/common/themeService.js';
import { IKeybindingService } from '../../../../../../../../platform/keybinding/common/keybinding.js';
import { getEditorBackgroundColor, getEditorBlendedColor, inlineEditIndicatorPrimaryBackground, inlineEditIndicatorSecondaryBackground, inlineEditIndicatorSuccessfulBackground, observeColor } from '../../theme.js';
import { asCssVariable, descriptionForeground, editorWidgetBackground } from '../../../../../../../../platform/theme/common/colorRegistry.js';
import { editorWidgetBorder } from '../../../../../../../../platform/theme/common/colors/editorColors.js';
import { LongDistancePreviewEditor } from './longDistancePreviewEditor.js';
import { jumpToNextInlineEditId } from '../../../../controller/commandIds.js';
import { splitIntoContinuousLineRanges, WidgetPlacementContext } from './longDistnaceWidgetPlacement.js';
import { InlineCompletionEditorType } from '../../../../model/provideInlineCompletions.js';
import { basename } from '../../../../../../../../base/common/resources.js';
import { IModelService } from '../../../../../../../common/services/model.js';
import { ILanguageService } from '../../../../../../../common/languages/language.js';
import { getIconClasses } from '../../../../../../../common/services/getIconClasses.js';
import { FileKind } from '../../../../../../../../platform/files/common/files.js';
const BORDER_RADIUS = 6;
const MAX_WIDGET_WIDTH = { EMPTY_SPACE: 425, OVERLAY: 375 };
const MIN_WIDGET_WIDTH = 250;
const DEFAULT_WIDGET_LAYOUT_CONSTANTS = {
    previewEditorMargin: 2,
    widgetPadding: 2,
    widgetBorder: 1,
    lowerBarHeight: 20,
    minWidgetWidth: MIN_WIDGET_WIDTH,
};
let InlineEditsLongDistanceHint = class InlineEditsLongDistanceHint extends Disposable {
    constructor(_editor, _viewState, _previewTextModel, _tabAction, _instantiationService, _themeService, _keybindingService, _modelService, _languageService) {
        super();
        this._editor = _editor;
        this._viewState = _viewState;
        this._previewTextModel = _previewTextModel;
        this._tabAction = _tabAction;
        this._instantiationService = _instantiationService;
        this._themeService = _themeService;
        this._keybindingService = _keybindingService;
        this._modelService = _modelService;
        this._languageService = _languageService;
        this.onDidClick = Event.None;
        this._viewWithElement = undefined;
        this._hintTextPosition = derived(this, (reader) => {
            const viewState = this._viewState.read(reader);
            return viewState ? new Position(viewState.hint.lineNumber, Number.MAX_SAFE_INTEGER) : null;
        });
        this._lineSizesAroundHintPosition = derived(this, (reader) => {
            const viewState = this._viewState.read(reader);
            const p = this._hintTextPosition.read(reader);
            if (!viewState || !p) {
                return [];
            }
            const model = this._editorObs.model.read(reader);
            if (!model) {
                return [];
            }
            const range = LineRange.ofLength(p.lineNumber, 1).addMargin(5, 5).intersect(LineRange.ofLength(1, model.getLineCount()));
            if (!range) {
                return [];
            }
            const sizes = getContentSizeOfLines(this._editorObs, range, reader);
            const top = this._editorObs.observeTopForLineNumber(range.startLineNumber).read(reader);
            return splitIntoContinuousLineRanges(range, sizes, top, this._editorObs, reader);
        });
        this._isVisibleDelayed = debouncedObservable2(derived(this, reader => this._viewState.read(reader)?.hint.isVisible), (lastValue, newValue) => lastValue === true && newValue === false ? 200 : 0);
        this._previewEditorLayoutInfo = derived(this, (reader) => {
            const viewState = this._viewState.read(reader);
            if (!viewState || !this._isVisibleDelayed.read(reader)) {
                return undefined;
            }
            const continousLineRanges = this._lineSizesAroundHintPosition.read(reader);
            if (continousLineRanges.length === 0) {
                return undefined;
            }
            const editorScrollTop = this._editorObs.scrollTop.read(reader);
            const editorScrollLeft = this._editorObs.scrollLeft.read(reader);
            const editorLayout = this._editorObs.layoutInfo.read(reader);
            const previewContentHeight = this._previewEditor.contentHeight.read(reader);
            const previewEditorContentLayout = this._previewEditor.horizontalContentRangeInPreviewEditorToShow.read(reader);
            if (!previewContentHeight || !previewEditorContentLayout) {
                return undefined;
            }
            // const debugRects = stackSizesDown(new Point(editorLayout.contentLeft, lineSizes.top - scrollTop), lineSizes.sizes);
            const editorTrueContentWidth = editorLayout.contentWidth - editorLayout.verticalScrollbarWidth;
            const editorTrueContentRight = editorLayout.contentLeft + editorTrueContentWidth;
            // drawEditorWidths(this._editor, reader);
            const c = this._editorObs.cursorLineNumber.read(reader);
            if (!c) {
                return undefined;
            }
            const layoutConstants = DEFAULT_WIDGET_LAYOUT_CONSTANTS;
            const extraGutterMarginToAvoidScrollBar = 2;
            const previewEditorHeight = previewContentHeight + extraGutterMarginToAvoidScrollBar;
            // Try to find widget placement in available empty space
            let possibleWidgetOutline;
            let lastPlacementContext;
            const endOfLinePadding = (lineNumber) => lineNumber === viewState.hint.lineNumber ? 40 : 20;
            for (const continousLineRange of continousLineRanges) {
                const placementContext = new WidgetPlacementContext(continousLineRange, editorTrueContentWidth, endOfLinePadding);
                lastPlacementContext = placementContext;
                const showRects = false;
                if (showRects) {
                    const rects2 = stackSizesDown(new Point(editorTrueContentRight, continousLineRange.top - editorScrollTop), placementContext.availableSpaceSizes, 'right');
                    debugView(debugLogRects({ ...rects2 }, this._editor.getDomNode()), reader);
                }
                possibleWidgetOutline = placementContext.tryFindWidgetOutline(viewState.hint.lineNumber, previewEditorHeight, editorTrueContentRight, layoutConstants);
                if (possibleWidgetOutline) {
                    break;
                }
            }
            // Fallback to overlay position if no empty space was found
            let position = 'empty-space';
            if (!possibleWidgetOutline) {
                position = 'overlay';
                const maxAvailableWidth = Math.min(editorLayout.width - editorLayout.contentLeft, MAX_WIDGET_WIDTH.OVERLAY);
                // Create a fallback placement context for computing overlay vertical position
                const fallbackPlacementContext = lastPlacementContext ?? new WidgetPlacementContext(continousLineRanges[0], editorTrueContentWidth, endOfLinePadding);
                possibleWidgetOutline = {
                    horizontalWidgetRange: OffsetRange.ofStartAndLength(editorTrueContentRight - maxAvailableWidth, maxAvailableWidth),
                    verticalWidgetRange: fallbackPlacementContext.getWidgetVerticalOutline(viewState.hint.lineNumber + 2, previewEditorHeight, layoutConstants).delta(10),
                };
            }
            if (!possibleWidgetOutline) {
                return undefined;
            }
            const rectAvailableSpace = Rect.fromRanges(possibleWidgetOutline.horizontalWidgetRange, possibleWidgetOutline.verticalWidgetRange).translateX(-editorScrollLeft).translateY(-editorScrollTop);
            const showAvailableSpace = false;
            if (showAvailableSpace) {
                debugView(debugLogRects({ rectAvailableSpace }, this._editor.getDomNode()), reader);
            }
            const { previewEditorMargin, widgetPadding, widgetBorder, lowerBarHeight } = layoutConstants;
            const maxWidgetWidth = Math.min(position === 'overlay' ? MAX_WIDGET_WIDTH.OVERLAY : MAX_WIDGET_WIDTH.EMPTY_SPACE, previewEditorContentLayout.maxEditorWidth + previewEditorMargin + widgetPadding);
            const layout = distributeFlexBoxLayout(rectAvailableSpace.width, {
                spaceBefore: { min: 0, max: 10, priority: 1 },
                content: { min: 50, rules: [{ max: 150, priority: 2 }, { max: maxWidgetWidth, priority: 1 }] },
                spaceAfter: { min: 10 },
            });
            if (!layout) {
                return null;
            }
            const ranges = lengthsToOffsetRanges([layout.spaceBefore, layout.content, layout.spaceAfter], rectAvailableSpace.left);
            const spaceBeforeRect = rectAvailableSpace.withHorizontalRange(ranges[0]);
            const widgetRect = rectAvailableSpace.withHorizontalRange(ranges[1]);
            const spaceAfterRect = rectAvailableSpace.withHorizontalRange(ranges[2]);
            const showRects2 = false;
            if (showRects2) {
                debugView(debugLogRects({ spaceBeforeRect, widgetRect, spaceAfterRect }, this._editor.getDomNode()), reader);
            }
            const previewEditorRect = widgetRect.withMargin(-widgetPadding - widgetBorder - previewEditorMargin).withMargin(0, 0, -lowerBarHeight, 0);
            const showEditorRect = false;
            if (showEditorRect) {
                debugView(debugLogRects({ previewEditorRect }, this._editor.getDomNode()), reader);
            }
            const previewEditorContentWidth = previewEditorRect.width - previewEditorContentLayout.nonContentWidth;
            const maxPrefferedRangeLength = previewEditorContentWidth * 0.8;
            const preferredRangeToReveal = previewEditorContentLayout.preferredRangeToReveal.intersect(OffsetRange.ofStartAndLength(previewEditorContentLayout.preferredRangeToReveal.start, maxPrefferedRangeLength)) ?? previewEditorContentLayout.preferredRangeToReveal;
            const desiredPreviewEditorScrollLeft = scrollToReveal(previewEditorContentLayout.indentationEnd, previewEditorContentWidth, preferredRangeToReveal);
            return {
                codeEditorSize: previewEditorRect.getSize(),
                codeScrollLeft: editorScrollLeft,
                contentLeft: editorLayout.contentLeft,
                widgetRect,
                previewEditorMargin,
                widgetPadding,
                widgetBorder,
                lowerBarHeight,
                desiredPreviewEditorScrollLeft: desiredPreviewEditorScrollLeft.newScrollPosition,
            };
        });
        this._view = n.div({
            class: 'inline-edits-view',
            style: {
                position: 'absolute',
                overflow: 'visible',
                top: '0px',
                left: '0px',
                display: derived(this, reader => !!this._previewEditorLayoutInfo.read(reader) ? 'block' : 'none'),
            },
        }, [
            derived(this, _reader => [this._widgetContent]),
        ]);
        this._widgetContent = derived(this, reader => // TODO@hediet: remove when n.div lazily creates previewEditor.element node
         n.div({
            class: ['inline-edits-long-distance-hint-widget', 'show-file-icons'],
            style: {
                position: 'absolute',
                overflow: 'hidden',
                cursor: 'pointer',
                background: asCssVariable(editorWidgetBackground),
                padding: this._previewEditorLayoutInfo.map(i => i?.widgetPadding),
                boxSizing: 'border-box',
                borderRadius: BORDER_RADIUS,
                border: derived(reader => `${this._previewEditorLayoutInfo.read(reader)?.widgetBorder}px solid ${this._styles.read(reader).border}`),
                display: 'flex',
                flexDirection: 'column',
                opacity: derived(reader => this._viewState.read(reader)?.hint.isVisible ? '1' : '0'),
                transition: 'opacity 200ms ease-in-out',
                ...rectToProps(reader => this._previewEditorLayoutInfo.read(reader)?.widgetRect)
            },
            onmousedown: e => {
                e.preventDefault(); // This prevents that the editor loses focus
            },
            onclick: () => {
                this._viewState.read(undefined)?.model.jump();
            }
        }, [
            n.div({
                class: ['editorContainer'],
                style: {
                    overflow: 'hidden',
                    padding: this._previewEditorLayoutInfo.map(i => i?.previewEditorMargin),
                    background: this._styles.map(s => s.background),
                    pointerEvents: 'none',
                },
            }, [
                derived(this, r => this._previewEditor.element), // --
            ]),
            n.div({ class: 'bar', style: { color: asCssVariable(descriptionForeground), pointerEvents: 'none', margin: '0 4px', height: this._previewEditorLayoutInfo.map(i => i?.lowerBarHeight), display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
                derived(this, reader => {
                    const children = [];
                    const viewState = this._viewState.read(reader);
                    if (!viewState) {
                        return children;
                    }
                    // Check if this is a cross-file edit
                    const currentUri = this._editorObs.model.read(reader)?.uri;
                    const targetUri = viewState.target.uri;
                    const isCrossFileEdit = targetUri && (!currentUri || targetUri.toString() !== currentUri.toString());
                    if (isCrossFileEdit) {
                        // For cross-file edits, show target filename instead of outline
                        const fileName = basename(targetUri);
                        const iconClasses = getIconClasses(this._modelService, this._languageService, targetUri, FileKind.FILE);
                        children.push(n.div({
                            class: 'target-file',
                            style: { display: 'flex', alignItems: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
                        }, [
                            n.elem('span', { class: iconClasses, style: { flexShrink: '0', marginRight: '4px' } }),
                            fileName,
                        ]));
                    }
                    else {
                        // Outline Element
                        const source = this._originalOutlineSource.read(reader);
                        const originalTargetLineNumber = this._originalTargetLineNumber.read(reader);
                        const outlineItems = source?.getAt(originalTargetLineNumber, reader).slice(0, 1) ?? [];
                        const outlineElements = [];
                        if (outlineItems.length > 0) {
                            for (let i = 0; i < outlineItems.length; i++) {
                                const item = outlineItems[i];
                                const icon = SymbolKinds.toIcon(item.kind);
                                outlineElements.push(n.div({
                                    class: 'breadcrumb-item',
                                    style: { display: 'flex', alignItems: 'center', flex: '1 1 auto', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
                                }, [
                                    renderIcon(icon),
                                    '\u00a0',
                                    item.name,
                                    ...(i === outlineItems.length - 1
                                        ? []
                                        : [renderIcon(Codicon.chevronRight)])
                                ]));
                            }
                        }
                        children.push(n.div({ class: 'outline-elements', style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, outlineElements));
                    }
                    // Show Edit Direction
                    const originalTargetLineNumber = this._originalTargetLineNumber.read(reader);
                    const arrowIcon = isCrossFileEdit ? Codicon.arrowRight : (viewState.hint.lineNumber < originalTargetLineNumber ? Codicon.arrowDown : Codicon.arrowUp);
                    const keybinding = this._keybindingService.lookupKeybinding(jumpToNextInlineEditId);
                    let label = isCrossFileEdit ? 'Go to file' : 'Go to suggestion';
                    if (keybinding && keybinding.getLabel() === 'Tab') {
                        label = isCrossFileEdit ? 'Tab to open' : 'Tab to jump';
                    }
                    children.push(n.div({
                        class: 'go-to-label',
                        style: { position: 'relative', display: 'flex', alignItems: 'center', flex: '0 0 auto', paddingLeft: '6px' },
                    }, [
                        label,
                        '\u00a0',
                        renderIcon(arrowIcon),
                    ]));
                    return children;
                })
            ]),
        ]));
        // Drives breadcrumbs and symbol icon
        this._originalTargetLineNumber = derived(this, (reader) => {
            const viewState = this._viewState.read(reader);
            if (!viewState) {
                return -1;
            }
            if (viewState.edit.action?.kind === 'jumpTo') {
                return viewState.edit.action.position.lineNumber;
            }
            return viewState.diff[0]?.original.startLineNumber ?? -1;
        });
        this._originalOutlineSource = derivedDisposable(this, (reader) => {
            const m = this._editorObs.model.read(reader);
            const factory = HideUnchangedRegionsFeature._breadcrumbsSourceFactory.read(reader);
            return (!m || !factory) ? undefined : factory(m, this._instantiationService);
        });
        this._styles = derived(reader => {
            const v = this._tabAction.read(reader);
            // Check theme type by observing a color - this ensures we react to theme changes
            const widgetBorderColor = observeColor(editorWidgetBorder, this._themeService).read(reader);
            const isHighContrast = observableFromEvent(this._themeService.onDidColorThemeChange, () => {
                const theme = this._themeService.getColorTheme();
                return theme.type === 'hcDark' || theme.type === 'hcLight';
            }).read(reader);
            let borderColor;
            if (isHighContrast) {
                // Use editorWidgetBorder in high contrast mode for better visibility
                borderColor = widgetBorderColor;
            }
            else {
                let border;
                switch (v) {
                    case InlineEditTabAction.Inactive:
                        border = inlineEditIndicatorSecondaryBackground;
                        break;
                    case InlineEditTabAction.Jump:
                        border = inlineEditIndicatorPrimaryBackground;
                        break;
                    case InlineEditTabAction.Accept:
                        border = inlineEditIndicatorSuccessfulBackground;
                        break;
                }
                borderColor = getEditorBlendedColor(border, this._themeService).read(reader);
            }
            return {
                border: borderColor.toString(),
                background: getEditorBackgroundColor(this._viewState.map(s => s?.editorType ?? InlineCompletionEditorType.TextEditor).read(reader)),
            };
        });
        this._editorObs = observableCodeEditor(this._editor);
        this._previewEditor = this._register(this._instantiationService.createInstance(LongDistancePreviewEditor, this._previewTextModel, derived(reader => {
            const viewState = this._viewState.read(reader);
            if (!viewState) {
                return undefined;
            }
            return {
                diff: viewState.diff,
                model: viewState.model,
                inlineSuggestInfo: viewState.inlineSuggestInfo,
                nextCursorPosition: viewState.nextCursorPosition,
                target: viewState.target,
            };
        }), this._editor, this._tabAction));
        this._viewWithElement = this._view.keepUpdated(this._store);
        this._register(this._editorObs.createOverlayWidget({
            domNode: this._viewWithElement.element,
            position: constObservable(null),
            allowEditorOverflow: false,
            minContentWidthInPx: constObservable(0),
        }));
        this._widgetContent.get().keepUpdated(this._store);
        this._register(autorun(reader => {
            const layoutInfo = this._previewEditorLayoutInfo.read(reader);
            if (!layoutInfo) {
                return;
            }
            this._previewEditor.layout(layoutInfo.codeEditorSize.toDimension(), layoutInfo.desiredPreviewEditorScrollLeft);
        }));
        this._isVisibleDelayed.recomputeInitiallyAndOnChange(this._store);
    }
    get isHovered() { return this._widgetContent.get().didMouseMoveDuringHover; }
};
InlineEditsLongDistanceHint = __decorate([
    __param(4, IInstantiationService),
    __param(5, IThemeService),
    __param(6, IKeybindingService),
    __param(7, IModelService),
    __param(8, ILanguageService)
], InlineEditsLongDistanceHint);
export { InlineEditsLongDistanceHint };
function lengthsToOffsetRanges(lengths, initialOffset = 0) {
    const result = [];
    let offset = initialOffset;
    for (const length of lengths) {
        result.push(new OffsetRange(offset, offset + length));
        offset += length;
    }
    return result;
}
function stackSizesDown(at, sizes, alignment = 'left') {
    const rects = [];
    let offset = 0;
    for (const s of sizes) {
        rects.push(Rect.fromLeftTopWidthHeight(at.x + (alignment === 'left' ? 0 : -s.width), at.y + offset, s.width, s.height));
        offset += s.height;
    }
    return rects;
}
export function drawEditorWidths(e, reader) {
    const layoutInfo = e.getLayoutInfo();
    const contentLeft = new OffsetRange(0, layoutInfo.contentLeft);
    const trueContent = OffsetRange.ofStartAndLength(layoutInfo.contentLeft, layoutInfo.contentWidth - layoutInfo.verticalScrollbarWidth);
    const minimap = OffsetRange.ofStartAndLength(trueContent.endExclusive, layoutInfo.minimap.minimapWidth);
    const verticalScrollbar = OffsetRange.ofStartAndLength(minimap.endExclusive, layoutInfo.verticalScrollbarWidth);
    const r = new OffsetRange(0, 200);
    debugView(debugLogHorizontalOffsetRanges({
        contentLeft: Rect.fromRanges(contentLeft, r),
        trueContent: Rect.fromRanges(trueContent, r),
        minimap: Rect.fromRanges(minimap, r),
        verticalScrollbar: Rect.fromRanges(verticalScrollbar, r),
    }, e.getDomNode()), reader);
}
/**
 * Changes the scroll position as little as possible just to reveal the given range in the window.
*/
export function scrollToReveal(currentScrollPosition, windowWidth, contentRangeToReveal) {
    const visibleRange = new OffsetRange(currentScrollPosition, currentScrollPosition + windowWidth);
    if (visibleRange.containsRange(contentRangeToReveal)) {
        return { newScrollPosition: currentScrollPosition };
    }
    if (contentRangeToReveal.length > windowWidth) {
        return { newScrollPosition: contentRangeToReveal.start };
    }
    if (contentRangeToReveal.endExclusive > visibleRange.endExclusive) {
        return { newScrollPosition: contentRangeToReveal.endExclusive - windowWidth };
    }
    if (contentRangeToReveal.start < visibleRange.start) {
        return { newScrollPosition: contentRangeToReveal.start };
    }
    return { newScrollPosition: currentScrollPosition };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lRWRpdHNMb25nRGlzdGFuY2VIaW50LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvaW5saW5lQ29tcGxldGlvbnMvYnJvd3Nlci92aWV3L2lubGluZUVkaXRzL2lubGluZUVkaXRzVmlld3MvbG9uZ0Rpc3RhbmNlSGludC9pbmxpbmVFZGl0c0xvbmdEaXN0YW5jZUhpbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7O0FBQUE7OztnR0FHZ0c7QUFDaEcsT0FBTyxFQUFhLENBQUMsRUFBeUMsTUFBTSw2Q0FBNkMsQ0FBQztBQUNsSCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDckUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzlFLE9BQU8sRUFBd0IsT0FBTyxFQUFFLGVBQWUsRUFBRSxvQkFBb0IsRUFBRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUMxTCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx3RUFBd0UsQ0FBQztBQUUvRyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUM1RixPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDbkUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBRXhFLE9BQU8sRUFBb0IsbUJBQW1CLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUUxRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsV0FBVyxFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFFMUUsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUNqRixPQUFPLEVB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