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
import * as dom from '../../base/browser/dom.js';
import { createFastDomNode } from '../../base/browser/fastDomNode.js';
import { inputLatency } from '../../base/browser/performance.js';
import { BugIndicatingError, onUnexpectedError } from '../../base/common/errors.js';
import { Disposable, DisposableStore } from '../../base/common/lifecycle.js';
import { PointerHandlerLastRenderData } from './controller/mouseTarget.js';
import { PointerHandler } from './controller/pointerHandler.js';
import { RenderingContext } from './view/renderingContext.js';
import { ViewController } from './view/viewController.js';
import { ContentViewOverlays, MarginViewOverlays } from './view/viewOverlays.js';
import { PartFingerprints } from './view/viewPart.js';
import { ViewUserInputEvents } from './view/viewUserInputEvents.js';
import { BlockDecorations } from './viewParts/blockDecorations/blockDecorations.js';
import { ViewContentWidgets } from './viewParts/contentWidgets/contentWidgets.js';
import { CurrentLineHighlightOverlay, CurrentLineMarginHighlightOverlay } from './viewParts/currentLineHighlight/currentLineHighlight.js';
import { DecorationsOverlay } from './viewParts/decorations/decorations.js';
import { EditorScrollbar } from './viewParts/editorScrollbar/editorScrollbar.js';
import { GlyphMarginWidgets } from './viewParts/glyphMargin/glyphMargin.js';
import { IndentGuidesOverlay } from './viewParts/indentGuides/indentGuides.js';
import { LineNumbersOverlay } from './viewParts/lineNumbers/lineNumbers.js';
import { ViewLines } from './viewParts/viewLines/viewLines.js';
import { LinesDecorationsOverlay } from './viewParts/linesDecorations/linesDecorations.js';
import { Margin } from './viewParts/margin/margin.js';
import { MarginViewLineDecorationsOverlay } from './viewParts/marginDecorations/marginDecorations.js';
import { Minimap } from './viewParts/minimap/minimap.js';
import { ViewOverlayWidgets } from './viewParts/overlayWidgets/overlayWidgets.js';
import { DecorationsOverviewRuler } from './viewParts/overviewRuler/decorationsOverviewRuler.js';
import { OverviewRuler } from './viewParts/overviewRuler/overviewRuler.js';
import { Rulers } from './viewParts/rulers/rulers.js';
import { ScrollDecorationViewPart } from './viewParts/scrollDecoration/scrollDecoration.js';
import { SelectionsOverlay } from './viewParts/selections/selections.js';
import { ViewCursors } from './viewParts/viewCursors/viewCursors.js';
import { ViewZones } from './viewParts/viewZones/viewZones.js';
import { WhitespaceOverlay } from './viewParts/whitespace/whitespace.js';
import { Position } from '../common/core/position.js';
import { Range } from '../common/core/range.js';
import { Selection } from '../common/core/selection.js';
import { GlyphMarginLane } from '../common/model.js';
import { ViewEventHandler } from '../common/viewEventHandler.js';
import { ViewportData } from '../common/viewLayout/viewLinesViewportData.js';
import { ViewContext } from '../common/viewModel/viewContext.js';
import { IInstantiationService } from '../../platform/instantiation/common/instantiation.js';
import { getThemeTypeSelector } from '../../platform/theme/common/themeService.js';
import { ViewGpuContext } from './gpu/viewGpuContext.js';
import { ViewLinesGpu } from './viewParts/viewLinesGpu/viewLinesGpu.js';
import { TextAreaEditContext } from './controller/editContext/textArea/textAreaEditContext.js';
import { NativeEditContext } from './controller/editContext/native/nativeEditContext.js';
import { RulersGpu } from './viewParts/rulersGpu/rulersGpu.js';
import { GpuMarkOverlay } from './viewParts/gpuMark/gpuMark.js';
import { Emitter } from '../../base/common/event.js';
import { IUserInteractionService } from '../../platform/userInteraction/browser/userInteractionService.js';
let View = class View extends ViewEventHandler {
    constructor(editorContainer, ownerID, commandDelegate, configuration, colorTheme, model, userInputEvents, overflowWidgetsDomNode, _instantiationService, _userInteractionService) {
        super();
        this._instantiationService = _instantiationService;
        this._userInteractionService = _userInteractionService;
        this._editContextClipboardListeners = new DisposableStore();
        // Clipboard events relayed from editContext
        this._onWillCopy = this._register(new Emitter());
        this.onWillCopy = this._onWillCopy.event;
        this._onWillCut = this._register(new Emitter());
        this.onWillCut = this._onWillCut.event;
        this._onWillPaste = this._register(new Emitter());
        this.onWillPaste = this._onWillPaste.event;
        // Actual mutable state
        this._shouldRecomputeGlyphMarginLanes = false;
        this._ownerID = ownerID;
        this._widgetFocusTracker = this._register(new CodeEditorWidgetFocusTracker(editorContainer, overflowWidgetsDomNode, this._userInteractionService));
        this._register(this._widgetFocusTracker.onChange(() => {
            this._context.viewModel.setHasWidgetFocus(this._widgetFocusTracker.hasFocus());
        }));
        this._selections = [new Selection(1, 1, 1, 1)];
        this._renderAnimationFrame = null;
        this._overflowGuardContainer = createFastDomNode(document.createElement('div'));
        PartFingerprints.write(this._overflowGuardContainer, 3 /* PartFingerprint.OverflowGuard */);
        this._overflowGuardContainer.setClassName('overflow-guard');
        this._viewController = new ViewController(configuration, model, userInputEvents, commandDelegate);
        // The view context is passed on to most classes (basically to reduce param. counts in ctors)
        this._context = new ViewContext(configuration, colorTheme, model);
        // Ensure the view is the first event handler in order to update the layout
        this._context.addEventHandler(this);
        this._viewParts = [];
        // Keyboard handler
        this._editContextEnabled = this._context.configuration.options.get(170 /* EditorOption.effectiveEditContext */);
        this._accessibilitySupport = this._context.configuration.options.get(2 /* EditorOption.accessibilitySupport */);
        this._editContext = this._instantiateEditContext();
        this._connectEditContextClipboardEvents();
        this._viewParts.push(this._editContext);
        // These two dom nodes must be constructed up front, since references are needed in the layout provider (scrolling & co.)
        this._linesContent = createFastDomNode(document.createElement('div'));
        this._linesContent.setClassName('lines-content' + ' monaco-editor-background');
        this._linesContent.setPosition('absolute');
        this.domNode = createFastDomNode(document.createElement('div'));
        this.domNode.setClassName(this._getEditorClassName());
        // Set role 'code' for better screen reader support https://github.com/microsoft/vscode/issues/93438
        this.domNode.setAttribute('role', 'code');
        if (this._context.configuration.options.get(46 /* EditorOption.experimentalGpuAcceleration */) === 'on') {
            this._viewGpuContext = this._instantiationService.createInstance(ViewGpuContext, this._context);
        }
        this._scrollbar = new EditorScrollbar(this._context, this._linesContent, this.domNode, this._overflowGuardContainer);
        this._viewParts.push(this._scrollbar);
        // View Lines
        this._viewLines = new ViewLines(this._context, this._viewGpuContext, this._linesContent);
        if (this._viewGpuContext) {
            this._viewLinesGpu = this._instantiationService.createInstance(ViewLinesGpu, this._context, this._viewGpuContext);
        }
        // View Zones
        this._viewZones = new ViewZones(this._context);
        this._viewParts.push(this._viewZones);
        // Decorations overview ruler
        const decorationsOverviewRuler = new DecorationsOverviewRuler(this._context);
        this._viewParts.push(decorationsOverviewRuler);
        const scrollDecoration = new ScrollDecorationViewPart(this._context);
        this._viewParts.push(scrollDecoration);
        const contentViewOverlays = new ContentViewOverlays(this._context);
        this._viewParts.push(contentViewOverlays);
        contentViewOverlays.addDynamicOverlay(new CurrentLineHighlightOverlay(this._context));
        contentViewOverlays.addDynamicOverlay(new SelectionsOverlay(this._context));
        contentViewOverlays.addDynamicOverlay(new IndentGuidesOverlay(this._context));
        contentViewOverlays.addDynamicOverlay(new DecorationsOverlay(this._context));
        contentViewOverlays.addDynamicOverlay(new WhitespaceOverlay(this._context));
        const marginViewOverlays = new MarginViewOverlays(this._context);
        this._viewParts.push(marginViewOverlays);
        marginViewOverlays.addDynamicOverlay(new CurrentLineMarginHighlightOverlay(this._context));
        marginViewOverlays.addDynamicOverlay(new MarginViewLineDecorationsOverlay(this._context));
        marginViewOverlays.addDynamicOverlay(new LinesDecorationsOverlay(this._context));
        marginViewOverlays.addDynamicOverlay(new LineNumbersOverlay(this._context));
        if (this._viewGpuContext) {
            marginViewOverlays.addDynamicOverlay(new GpuMarkOverlay(this._context, this._viewGpuContext));
        }
        // Glyph margin widgets
        this._glyphMarginWidgets = new GlyphMarginWidgets(this._context);
        this._viewParts.push(this._glyphMarginWidgets);
        const margin = new Margin(this._context);
        margin.getDomNode().appendChild(this._viewZones.marginDomNode);
        margin.getDomNode().appendChild(marginViewOverlays.getDomNode());
        margin.getDomNode().appendChild(this._glyphMarginWidgets.domNode);
        this._viewParts.push(margin);
        // Content widgets
        this._contentWidgets = new ViewContentWidgets(this._context, this.domNode);
        this._viewParts.push(this._contentWidgets);
        this._viewCursors = new ViewCursors(this._context);
        this._viewParts.push(this._viewCursors);
        // Overlay widgets
        this._overlayWidgets = new ViewOverlayWidgets(this._context, this.domNode);
        this._viewParts.push(this._overlayWidgets);
        const rulers = this._viewGpuContext
            ? new RulersGpu(this._context, this._viewGpuContext)
            : new Rulers(this._context);
        this._viewParts.push(rulers);
        const blockOutline = new BlockDecorations(this._context);
        this._viewParts.push(blockOutline);
        const minimap = new Minimap(this._context);
        this._viewParts.push(minimap);
        // -------------- Wire dom nodes up
        if (decorationsOverviewRuler) {
            const overviewRulerData = this._scrollbar.getOverviewRulerLayoutInfo();
            overviewRulerData.parent.insertBefore(decorationsOverviewRuler.getDomNode(), overviewRulerData.insertBefore);
        }
        this._linesContent.appendChild(contentViewOverlays.getDomNode());
        if ('domNode' in rulers) {
            this._linesContent.appendChild(rulers.domNode);
        }
        this._linesContent.appendChild(this._viewZones.domNode);
        this._linesContent.appendChild(this._viewLines.getDomNode());
        this._linesContent.appendChild(this._contentWidgets.domNode);
        this._linesContent.appendChild(this._viewCursors.getDomNode());
        this._overflowGuardContainer.appendChild(margin.getDomNode());
        this._overflowGuardContainer.appendChild(this._scrollbar.getDomNode());
        if (this._viewGpuContext) {
            this._overflowGuardContainer.appendChild(this._viewGpuContext.canvas);
        }
        this._overflowGuardContainer.appendChild(scrollDecoration.getDomNode());
        this._overflowGuardContainer.appendChild(this._overlayWidgets.getDomNode());
        this._overflowGuardContainer.appendChild(minimap.getDomNode());
        this._overflowGuardContainer.appendChild(blockOutline.domNode);
        this.domNode.appendChild(this._overflowGuardContainer);
        if (overflowWidgetsDomNode) {
            overflowWidgetsDomNode.appendChild(this._contentWidgets.overflowingContentWidgetsDomNode.domNode);
            overflowWidgetsDomNode.appendChild(this._overlayWidgets.overflowingOverlayWidgetsDomNode.domNode);
        }
        else {
            this.domNode.appendChild(this._contentWidgets.overflowingContentWidgetsDomNode);
            this.domNode.appendChild(this._overlayWidgets.overflowingOverlayWidgetsDomNode);
        }
        this._applyLayout();
        // Pointer handler
        this._pointerHandler = this._register(new PointerHandler(this._context, this._viewController, this._createPointerHandlerHelper()));
    }
    _instantiateEditContext() {
        const usingExperimentalEditContext = this._context.configuration.options.get(170 /* EditorOption.effectiveEditContext */);
        if (usingExperimentalEditContext) {
            return this._instantiationService.createInstance(NativeEditContext, this._ownerID, this._context, this._overflowGuardContainer, this._viewController, this._createTextAreaHandlerHelper());
        }
        else {
            return this._instantiationService.createInstance(TextAreaEditContext, this._ownerID, this._context, this._overflowGuardContainer, this._viewController, this._createTextAreaHandlerHelper());
        }
    }
    _updateEditContext() {
        const editContextEnabled = this._context.configuration.options.get(170 /* EditorOption.effectiveEditContext */);
        const accessibilitySupport = this._context.configuration.options.get(2 /* EditorOption.accessibilitySupport */);
        if (this._editContextEnabled === editContextEnabled && this._accessibilitySupport === accessibilitySupport) {
            return;
        }
        this._editContextEnabled = editContextEnabled;
        this._accessibilitySupport = accessibilitySupport;
        const isEditContextFocused = this._editContext.isFocused();
        const indexOfEditContext = this._viewParts.indexOf(this._editContext);
        this._editContext.dispose();
        this._editContext = this._instantiateEditContext();
        this._connectEditContextClipboardEvents();
        if (isEditContextFocused) {
            this._editContext.focus();
        }
        if (indexOfEditContext !== -1) {
            this._viewParts.splice(indexOfEditContext, 1, this._editContext);
        }
    }
    _connectEditContextClipboardEvents() {
        // Dispose old listeners
        this._editContextClipboardListeners.clear();
        // Connect to current edit context's clipboard events
        this._editContextClipboardListeners.add(this._editContext.onWillCopy(e => this._onWillCopy.fire(e)));
        this._editContextClipboardListeners.add(this._editContext.onWillCut(e => this._onWillCut.fire(e)));
        this._editContextClipboardListeners.add(this._editContext.onWillPaste(e => this._onWillPaste.fire(e)));
    }
    _computeGlyphMarginLanes() {
        const model = this._context.viewModel.model;
        const laneModel = this._context.viewModel.glyphLanes;
        let glyphs = [];
        let maxLineNumber = 0;
        // Add all margin decorations
        glyphs = glyphs.concat(model.getAllMarginDecorations().map((decoration) => {
            const lane = decoration.options.glyphMargin?.position ?? GlyphMarginLane.Center;
            maxLineNumber = Math.max(maxLineNumber, decoration.range.endLineNumber);
            return { range: decoration.range, lane, persist: decoration.options.glyphMargin?.persistLane };
        }));
        // Add all glyph margin widgets
        glyphs = glyphs.concat(this._glyphMarginWidgets.getWidgets().map((widget) => {
            const range = model.validateRange(widget.preference.range);
            maxLineNumber = Math.max(maxLineNumber, range.endLineNumber);
            return { range, lane: widget.preference.lane };
        }));
        // Sorted by their start position
        glyphs.sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range));
        laneModel.reset(maxLineNumber);
        for (const glyph of glyphs) {
            laneModel.push(glyph.lane, glyph.range, glyph.persist);
        }
        return laneModel;
    }
    _createPointerHandlerHelper() {
        return {
            viewDomNode: this.domNode.domNode,
            linesContentDomNode: this._linesContent.domNode,
            viewLinesDomNode: this._viewLines.getDomNode().domNode,
            viewLinesGpu: this._viewLinesGpu,
            focusTextArea: () => {
                this.focus();
            },
            dispatchTextAreaEvent: (event) => {
                this._editContext.domNode.domNode.dispatchEvent(event);
            },
            getLastRenderData: () => {
                const lastViewCursorsRenderData = this._viewCursors.getLastRenderData() || [];
                const lastTextareaPosition = this._editContext.getLastRenderData();
                return new PointerHandlerLastRenderData(lastViewCursorsRenderData, lastTextareaPosition);
            },
            renderNow: () => {
                this.render(true, false);
            },
            shouldSuppressMouseDownOnViewZone: (viewZoneId) => {
                return this._viewZones.shouldSuppressMouseDownOnViewZone(viewZoneId);
            },
            shouldSuppressMouseDownOnWidget: (widgetId) => {
                return this._contentWidgets.shouldSuppressMouseDownOnWidget(widgetId);
            },
            getPositionFromDOMInfo: (spanNode, offset) => {
                this._flushAccumulatedAndRenderNow();
                return this._viewLines.getPositionFromDOMInfo(spanNode, offset);
            },
            visibleRangeForPosition: (lineNumber, column) => {
                this._flushAccumulatedAndRenderNow();
                const position = new Position(lineNumber, column);
                return this._viewLines.visibleRangeForPosition(position) ?? this._viewLinesGpu?.visibleRangeForPosition(position) ?? null;
            },
            getLineWidth: (lineNumber) => {
                this._flushAccumulatedAndRenderNow();
                if (this._viewLinesGpu) {
                    const result = this._viewLinesGpu.getLineWidth(lineNumber);
                    if (result !== undefined) {
                        return result;
                    }
                }
                return this._viewLines.getLineWidth(lineNumber);
            }
        };
    }
    _createTextAreaHandlerHelper() {
        return {
            visibleRangeForPosition: (position) => {
                this._flushAccumulatedAndRenderNow();
                return this._viewLines.visibleRangeForPosition(position);
            },
            linesVisibleRangesForRange: (range, includeNewLines) => {
                this._flushAccumulatedAndRenderNow();
                return this._viewLines.linesVisibleRangesForRange(range, includeNewLines);
            }
        };
    }
    _applyLayout() {
        const options = this._context.configuration.options;
        const layoutInfo = options.get(165 /* EditorOption.layoutInfo */);
        this.domNode.setWidth(layoutInfo.width);
        this.domNode.setHeight(layoutInfo.height);
        this._overflowGuardContainer.setWidth(layoutInfo.width);
        this._overflowGuardContainer.setHeight(layoutInfo.height);
        // https://stackoverflow.com/questions/38905916/content-in-google-chrome-larger-than-16777216-px-not-being-rendered
        this._linesContent.setWidth(16777216);
        this._linesContent.setHeight(16777216);
    }
    _getEditorClassName() {
        const focused = this._editContext.isFocused() ? ' focused' : '';
        return this._context.configuration.options.get(162 /* EditorOption.editorClassName */) + ' ' + getThemeTypeSelector(this._context.theme.type) + focused;
    }
    // --- begin event handlers
    handleEvents(events) {
        super.handleEvents(events);
        this._scheduleRender();
    }
    onConfigurationChanged(e) {
        this.domNode.setClassName(this._getEditorClassName());
        this._updateEditContext();
        this._applyLayout();
        return false;
    }
    onCursorStateChanged(e) {
        this._selections = e.selections;
        return false;
    }
    onDecorationsChanged(e) {
        if (e.affectsGlyphMargin) {
            this._shouldRecomputeGlyphMarginLanes = true;
        }
        return false;
    }
    onFocusChanged(e) {
        this.domNode.setClassName(this._getEditorClassName());
        return false;
    }
    onThemeChanged(e) {
        this._context.theme.update(e.theme);
        this.domNode.setClassName(this._getEditorClassName());
        return false;
    }
    // --- end event handlers
    dispose() {
        if (this._renderAnimationFrame !== null) {
            this._renderAnimationFrame.dispose();
            this._renderAnimationFrame = null;
        }
        // Dispose clipboard event listeners
        this._editContextClipboardListeners.dispose();
        this._contentWidgets.overflowingContentWidgetsDomNode.domNode.remove();
        this._overlayWidgets.overflowingOverlayWidgetsDomNode.domNode.remove();
        this._context.removeEventHandler(this);
        this._viewGpuContext?.dispose();
        this._viewLines.dispose();
        this._viewLinesGpu?.dispose();
        // Destroy view parts
        for (const viewPart of this._viewParts) {
            viewPart.dispose();
        }
        super.dispose();
    }
    _scheduleRender() {
        if (this._store.isDisposed) {
            throw new BugIndicatingError();
        }
        if (this._renderAnimationFrame === null) {
            // TODO: workaround fix for https://github.com/microsoft/vscode/issues/229825
            if (this._editContext instanceof NativeEditContext) {
                this._editContext.setEditContextOnDomNode();
            }
            const rendering = this._createCoordinatedRendering();
            this._renderAnimationFrame = EditorRenderingCoordinator.INSTANCE.scheduleCoordinatedRendering({
                window: dom.getWindow(this.domNode?.domNode),
                prepareRenderText: () => {
                    if (this._store.isDisposed) {
                        throw new BugIndicatingError();
                    }
                    try {
                        return rendering.prepareRenderText();
                    }
                    finally {
                        this._renderAnimationFrame = null;
                    }
                },
                renderText: (viewportData) => {
                    if (this._store.isDisposed) {
                        throw new BugIndicatingError();
                    }
                    return rendering.renderText(viewportData);
                },
                prepareRender: (viewParts, ctx) => {
                    if (this._store.isDisposed) {
                        throw new BugIndicatingError();
                    }
                    return rendering.prepareRender(viewParts, ctx);
                },
                render: (viewParts, ctx) => {
                    if (this._store.isDisposed) {
                        throw new BugIndicatingError();
                    }
                    return rendering.render(viewParts, ctx);
                }
            });
        }
    }
    _flushAccumulatedAndRenderNow() {
        const rendering = this._createCoordinatedRendering();
        const viewportData = safeInvokeNoArg(() => rendering.prepareRenderText());
        if (!viewportData) {
            return;
        }
        const data = safeInvokeNoArg(() => rendering.renderText(viewportData));
        if (!data) {
            return;
        }
        const [viewParts, ctx] = data;
        safeInvokeNoArg(() => rendering.prepareRender(viewParts, ctx));
        safeInvokeNoArg(() => rendering.render(viewParts, ctx));
    }
    _getViewPartsToRender() {
        const result = [];
        let resultLen = 0;
        for (const viewPart of this._viewParts) {
            if (viewPart.shouldRender()) {
                result[resultLen++] = viewPart;
            }
        }
        return result;
    }
    _createCoordinatedRendering() {
        return {
            prepareRenderText: () => {
                if (this._shouldRecomputeGlyphMarginLanes) {
                    this._shouldRecomputeGlyphMarginLanes = false;
                    const model = this._computeGlyphMarginLanes();
                    this._context.configuration.setGlyphMarginDecorationLaneCount(model.requiredLanes);
                }
                inputLatency.onRenderStart();
                if (!this.domNode.domNode.isConnected) {
                    return null;
                }
                const viewPartsToRender = this._getViewPartsToRender();
                if (!this._viewLines.shouldRender() && viewPartsToRender.length === 0) {
                    // Nothing to render
                    return null;
                }
                const partialViewportData = this._context.viewLayout.getLinesViewportData();
                this._context.viewModel.setViewport(partialViewportData.startLineNumber, partialViewportData.endLineNumber, partialViewportData.centeredLineNumber);
                const viewportData = new ViewportData(this._selections, partialViewportData, this._context.viewLayout.getWhitespaceViewportData(), this._context.viewModel);
                for (const viewPart of this._viewParts) {
                    if (viewPart.shouldRender()) {
                        viewPart.onBeforeRender(viewportData);
                    }
                }
                return viewportData;
            },
            renderText: (viewportData) => {
                if (this._viewLines.shouldRender()) {
                    this._viewLines.renderText(viewportData);
                    this._viewLines.onDidRender();
                }
                if (this._viewLinesGpu?.shouldRender()) {
                    this._viewLinesGpu.renderText(viewportData);
                    this._viewLinesGpu.onDidRender();
                }
                // Rendering of viewLines might cause scroll events to occur, so collect view parts to render again
                const viewPartsToRender = this._getViewPartsToRender();
                return [viewPartsToRender, new RenderingContext(this._context.viewLayout, viewportData, this._viewLines, this._viewLinesGpu)];
            },
            prepareRender: (viewPartsToRender, ctx) => {
                for (const viewPart of viewPartsToRender) {
                    viewPart.prepareRender(ctx);
                }
            },
            render: (viewPartsToRender, ctx) => {
                for (const viewPart of viewPartsToRender) {
                    viewPart.render(ctx);
                    viewPart.onDidRender();
                }
            }
        };
    }
    // --- BEGIN CodeEditor helpers
    delegateVerticalScrollbarPointerDown(browserEvent) {
        this._scrollbar.delegateVerticalScrollbarPointerDown(browserEvent);
    }
    delegateScrollFromMouseWheelEvent(browserEvent) {
        this._scrollbar.delegateScrollFromMouseWheelEvent(browserEvent);
    }
    restoreState(scrollPosition) {
        this._context.viewModel.viewLayout.setScrollPosition({
            scrollTop: scrollPosition.scrollTop,
            scrollLeft: scrollPosition.scrollLeft
        }, 1 /* ScrollType.Immediate */);
        this._context.viewModel.visibleLinesStabilized();
    }
    getOffsetForColumn(modelLineNumber, modelColumn) {
        const modelPosition = this._context.viewModel.model.validatePosition({
            lineNumber: modelLineNumber,
            column: modelColumn
        });
        const viewPosition = this._context.viewModel.coordinatesConverter.convertModelPositionToViewPosition(modelPosition);
        this._flushAccumulatedAndRenderNow();
        const visibleRange = this._viewLines.visibleRangeForPosition(new Position(viewPosition.lineNumber, viewPosition.column));
        if (!visibleRange) {
            return -1;
        }
        return visibleRange.left;
    }
    getLineWidth(modelLineNumber) {
        const model = this._context.viewModel.model;
        const viewLine = this._context.viewModel.coordinatesConverter.convertModelPositionToViewPosition(new Position(modelLineNumber, model.getLineMaxColumn(modelLineNumber))).lineNumber;
        this._flushAccumulatedAndRenderNow();
        const width = this._viewLines.getLineWidth(viewLine);
        return width;
    }
    resetLineWidthCaches() {
        this._viewLines.resetLineWidthCaches();
    }
    getTargetAtClientPoint(clientX, clientY) {
        const mouseTarget = this._pointerHandler.getTargetAtClientPoint(clientX, clientY);
        if (!mouseTarget) {
            return null;
        }
        return ViewUserInputEvents.convertViewToModelMouseTarget(mouseTarget, this._context.viewModel.coordinatesConverter);
    }
    createOverviewRuler(cssClassName) {
        return new OverviewRuler(this._context, cssClassName);
    }
    change(callback) {
        this._viewZones.changeViewZones(callback);
        this._scheduleRender();
    }
    render(now, everything) {
        if (everything) {
            // Force everything to render...
            this._viewLines.forceShouldRender();
            for (const viewPart of this._viewParts) {
                viewPart.forceShouldRender();
            }
        }
        if (now) {
            this._flushAccumulatedAndRenderNow();
        }
        else {
            this._scheduleRender();
        }
    }
    writeScreenReaderContent(reason) {
        this._editContext.writeScreenReaderContent(reason);
    }
    focus() {
        this._editContext.focus();
    }
    isFocused() {
        return this._editContext.isFocused();
    }
    isWidgetFocused() {
        return this._widgetFocusTracker.hasFocus();
    }
    refreshFocusState() {
        this._editContext.refreshFocusState();
        this._widgetFocusTracker.refreshState();
    }
    setAriaOptions(options) {
        this._editContext.setAriaOptions(options);
    }
    addContentWidget(widgetData) {
        this._contentWidgets.addWidget(widgetData.widget);
        this.layoutContentWidget(widgetData);
        this._scheduleRender();
    }
    layoutContentWidget(widgetData) {
        this._contentWidgets.setWidgetPosition(widgetData.widget, widgetData.position?.position ?? null, widgetData.position?.secondaryPosition ?? null, widgetData.position?.preference ?? null, widgetData.position?.positionAffinity ?? null);
        if (this._contentWidgets.shouldRender()) {
            this._scheduleRender();
        }
    }
    removeContentWidget(widgetData) {
        this._contentWidgets.removeWidget(widgetData.widget);
        this._scheduleRender();
    }
    addOverlayWidget(widgetData) {
        this._overlayWidgets.addWidget(widgetData.widget);
        this.layoutOverlayWidget(widgetData);
        this._scheduleRender();
    }
    layoutOverlayWidget(widgetData) {
        const shouldRender = this._overlayWidgets.setWidgetPosition(widgetData.widget, widgetData.position);
        if (shouldRender) {
            this._scheduleRender();
        }
    }
    removeOverlayWidget(widgetData) {
        this._overlayWidgets.removeWidget(widgetData.widget);
        this._scheduleRender();
    }
    addGlyphMarginWidget(widgetData) {
        this._glyphMarginWidgets.addWidget(widgetData.widget);
        this._shouldRecomputeGlyphMarginLanes = true;
        this._scheduleRender();
    }
    layoutGlyphMarginWidget(widgetData) {
        const newPreference = widgetData.position;
        const shouldRender = this._glyphMarginWidgets.setWidgetPosition(widgetData.widget, newPreference);
        if (shouldRender) {
            this._shouldRecomputeGlyphMarginLanes = true;
            this._scheduleRender();
        }
    }
    removeGlyphMarginWidget(widgetData) {
        this._glyphMarginWidgets.removeWidget(widgetData.widget);
        this._shouldRecomputeGlyphMarginLanes = true;
        this._scheduleRender();
    }
};
View = __decorate([
    __param(8, IInstantiationService),
    __param(9, IUserInteractionService)
], View);
export { View };
function safeInvokeNoArg(func) {
    try {
        return func();
    }
    catch (e) {
        onUnexpectedError(e);
        return null;
    }
}
class EditorRenderingCoordinator {
    static { this.INSTANCE = new EditorRenderingCoordinator(); }
    constructor() {
        this._coordinatedRenderings = [];
        this._animationFrameRunners = new Map();
    }
    scheduleCoordinatedRendering(rendering) {
        this._coordinatedRenderings.push(rendering);
        this._scheduleRender(rendering.window);
        return {
            dispose: () => {
                const renderingIndex = this._coordinatedRenderings.indexOf(rendering);
                if (renderingIndex === -1) {
                    return;
                }
                this._coordinatedRenderings.splice(renderingIndex, 1);
                if (this._coordinatedRenderings.length === 0) {
                    // There are no more renderings to coordinate => cancel animation frames
                    for (const [_, disposable] of this._animationFrameRunners) {
                        disposable.dispose();
                    }
                    this._animationFrameRunners.clear();
                }
            }
        };
    }
    _scheduleRender(window) {
        if (!this._animationFrameRunners.has(window)) {
            const runner = () => {
                this._animationFrameRunners.delete(window);
                this._onRenderScheduled();
            };
            this._animationFrameRunners.set(window, dom.runAtThisOrScheduleAtNextAnimationFrame(window, runner, 100));
        }
    }
    _onRenderScheduled() {
        const coordinatedRenderings = this._coordinatedRenderings.slice(0);
        this._coordinatedRenderings = [];
        const viewportDatas = [];
        for (let i = 0, len = coordinatedRenderings.length; i < len; i++) {
            const rendering = coordinatedRenderings[i];
            viewportDatas[i] = safeInvokeNoArg(() => rendering.prepareRenderText());
        }
        const datas = [];
        for (let i = 0, len = coordinatedRenderings.length; i < len; i++) {
            const rendering = coordinatedRenderings[i];
            const viewportData = viewportDatas[i];
            if (!viewportData) {
                datas[i] = null;
                continue;
            }
            datas[i] = safeInvokeNoArg(() => rendering.renderText(viewportData));
        }
        for (let i = 0, len = coordinatedRenderings.length; i < len; i++) {
            const rendering = coordinatedRenderings[i];
            const data = datas[i];
            if (!data) {
                continue;
            }
            const [viewParts, ctx] = data;
            safeInvokeNoArg(() => rendering.prepareRender(viewParts, ctx));
        }
        for (let i = 0, len = coordinatedRenderings.length; i < len; i++) {
            const rendering = coordinatedRenderings[i];
            const data = datas[i];
            if (!data) {
                continue;
            }
            const [viewParts, ctx] = data;
            safeInvokeNoArg(() => rendering.render(viewParts, ctx));
        }
    }
}
class CodeEditorWidgetFocusTracker extends Disposable {
    constructor(domElement, overflowWidgetsDomNode, userInteractionService) {
        super();
        this._onChange = this._register(new Emitter());
        this.onChange = this._onChange.event;
        this._hadFocus = undefined;
        this._hasDomElementFocus = false;
        this._domFocusTracker = this._register(userInteractionService.createDomFocusTracker(domElement));
        this._overflowWidgetsDomNodeHasFocus = false;
        this._register(this._domFocusTracker.onDidFocus(() => {
            this._hasDomElementFocus = true;
            this._update();
        }));
        this._register(this._domFocusTracker.onDidBlur(() => {
            this._hasDomElementFocus = false;
            this._update();
        }));
        if (overflowWidgetsDomNode) {
            this._overflowWidgetsDomNode = this._register(userInteractionService.createDomFocusTracker(overflowWidgetsDomNode));
            this._register(this._overflowWidgetsDomNode.onDidFocus(() => {
                this._overflowWidgetsDomNodeHasFocus = true;
                this._update();
            }));
            this._register(this._overflowWidgetsDomNode.onDidBlur(() => {
                this._overflowWidgetsDomNodeHasFocus = false;
                this._update();
            }));
        }
    }
    _update() {
        const focused = this._hasDomElementFocus || this._overflowWidgetsDomNodeHasFocus;
        if (this._hadFocus !== focused) {
            this._hadFocus = focused;
            this._onChange.fire(undefined);
        }
    }
    hasFocus() {
        return this._hadFocus ?? false;
    }
    refreshState() {
        this._domFocusTracker.refreshState();
        this._overflowWidgetsDomNode?.refreshState?.();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlldy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9icm93c2VyL3ZpZXcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSwyQkFBMkIsQ0FBQztBQUNqRCxPQUFPLEVBQWUsaUJBQWlCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUVuRixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFakUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLGlCQUFpQixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDcEYsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQWUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUUxRixPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUMzRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFFaEUsT0FBTyxFQUFxQixnQkFBZ0IsRUFBOEIsTUFBTSw0QkFBNEIsQ0FBQztBQUM3RyxPQUFPLEVBQW9CLGNBQWMsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQzVFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQ2pGLE9BQU8sRUFBbUIsZ0JBQWdCLEVBQVksTUFBTSxvQkFBb0IsQ0FBQztBQUNqRixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNwRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNwRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUNsRixPQUFPLEVBQUUsMkJBQTJCLEVBQUUsaUNBQWlDLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUMxSSxPQUFPLEVBQUUsa0JB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