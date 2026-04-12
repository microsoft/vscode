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
import { Emitter, PauseableEmitter } from '../../../../../base/common/event.js';
import { dispose } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import * as UUID from '../../../../../base/common/uuid.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { PrefixSumComputer } from '../../../../../editor/common/model/prefixSumComputer.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IUndoRedoService } from '../../../../../platform/undoRedo/common/undoRedo.js';
import { CellEditState, CellLayoutState } from '../notebookBrowser.js';
import { CellOutputViewModel } from './cellOutputViewModel.js';
import { CellKind } from '../../common/notebookCommon.js';
import { INotebookService } from '../../common/notebookService.js';
import { BaseCellViewModel } from './baseCellViewModel.js';
import { IInlineChatSessionService } from '../../../inlineChat/browser/inlineChatSessionService.js';
export const outputDisplayLimit = 500;
let CodeCellViewModel = class CodeCellViewModel extends BaseCellViewModel {
    set editorHeight(height) {
        if (this._editorHeight === height) {
            return;
        }
        this._editorHeight = height;
        this.layoutChange({ editorHeight: true }, 'CodeCellViewModel#editorHeight');
    }
    get editorHeight() {
        throw new Error('editorHeight is write-only');
    }
    set chatHeight(height) {
        if (this._chatHeight === height) {
            return;
        }
        this._chatHeight = height;
        this.layoutChange({ chatHeight: true }, 'CodeCellViewModel#chatHeight');
    }
    get chatHeight() {
        return this._chatHeight;
    }
    get outputIsHovered() {
        return this._hoveringOutput;
    }
    set outputIsHovered(v) {
        this._hoveringOutput = v;
        this._onDidChangeState.fire({ outputIsHoveredChanged: true });
    }
    get outputIsFocused() {
        return this._focusOnOutput;
    }
    set outputIsFocused(v) {
        this._focusOnOutput = v;
        this._onDidChangeState.fire({ outputIsFocusedChanged: true });
    }
    get inputInOutputIsFocused() {
        return this._focusInputInOutput;
    }
    set inputInOutputIsFocused(v) {
        this._focusInputInOutput = v;
    }
    get outputMinHeight() {
        return this._outputMinHeight;
    }
    /**
     * The minimum height of the output region. It's only set to non-zero temporarily when replacing an output with a new one.
     * It's reset to 0 when the new output is rendered, or in one second.
     */
    set outputMinHeight(newMin) {
        this._outputMinHeight = newMin;
    }
    get layoutInfo() {
        return this._layoutInfo;
    }
    get outputsViewModels() {
        return this._outputViewModels;
    }
    constructor(viewType, model, initialNotebookLayoutInfo, viewContext, configurationService, _notebookService, modelService, undoRedoService, codeEditorService, inlineChatSessionService) {
        super(viewType, model, UUID.generateUuid(), viewContext, configurationService, modelService, undoRedoService, codeEditorService, inlineChatSessionService);
        this.viewContext = viewContext;
        this._notebookService = _notebookService;
        this.cellKind = CellKind.Code;
        this._onLayoutInfoRead = this._register(new Emitter());
        this.onLayoutInfoRead = this._onLayoutInfoRead.event;
        this._onDidStartExecution = this._register(new Emitter());
        this.onDidStartExecution = this._onDidStartExecution.event;
        this._onDidStopExecution = this._register(new Emitter());
        this.onDidStopExecution = this._onDidStopExecution.event;
        this._onDidChangeOutputs = this._register(new Emitter());
        this.onDidChangeOutputs = this._onDidChangeOutputs.event;
        this._onDidRemoveOutputs = this._register(new Emitter());
        this.onDidRemoveOutputs = this._onDidRemoveOutputs.event;
        this._outputCollection = [];
        this._outputsTop = null;
        this._pauseableEmitter = this._register(new PauseableEmitter());
        this.onDidChangeLayout = this._pauseableEmitter.event;
        this._editorHeight = 0;
        this._chatHeight = 0;
        this._hoveringOutput = false;
        this._focusOnOutput = false;
        this._focusInputInOutput = false;
        this._outputMinHeight = 0;
        this.executionErrorDiagnostic = observableValue('excecutionError', undefined);
        this._hasFindResult = this._register(new Emitter());
        this.hasFindResult = this._hasFindResult.event;
        this._outputViewModels = this.model.outputs.map(output => new CellOutputViewModel(this, output, this._notebookService));
        this._register(this.model.onDidChangeOutputs((splice) => {
            const removedOutputs = [];
            let outputLayoutChange = false;
            for (let i = splice.start; i < splice.start + splice.deleteCount; i++) {
                if (this._outputCollection[i] !== undefined && this._outputCollection[i] !== 0) {
                    outputLayoutChange = true;
                }
            }
            this._outputCollection.splice(splice.start, splice.deleteCount, ...splice.newOutputs.map(() => 0));
            removedOutputs.push(...this._outputViewModels.splice(splice.start, splice.deleteCount, ...splice.newOutputs.map(output => new CellOutputViewModel(this, output, this._notebookService))));
            this._outputsTop = null;
            this._onDidChangeOutputs.fire(splice);
            this._onDidRemoveOutputs.fire(removedOutputs);
            if (outputLayoutChange) {
                this.layoutChange({ outputHeight: true }, 'CodeCellViewModel#model.onDidChangeOutputs');
            }
            if (!this._outputCollection.length) {
                this.executionErrorDiagnostic.set(undefined, undefined);
            }
            dispose(removedOutputs);
        }));
        this._outputCollection = new Array(this.model.outputs.length);
        const layoutConfiguration = this.viewContext.notebookOptions.getLayoutConfiguration();
        this._layoutInfo = {
            fontInfo: initialNotebookLayoutInfo?.fontInfo || null,
            editorHeight: 0,
            editorWidth: initialNotebookLayoutInfo
                ? this.viewContext.notebookOptions.computeCodeCellEditorWidth(initialNotebookLayoutInfo.width)
                : 0,
            chatHeight: 0,
            statusBarHeight: 0,
            commentOffset: 0,
            commentHeight: 0,
            outputContainerOffset: 0,
            outputTotalHeight: 0,
            outputShowMoreContainerHeight: 0,
            outputShowMoreContainerOffset: 0,
            totalHeight: this.computeTotalHeight(17, 0, 0, 0),
            codeIndicatorHeight: 0,
            outputIndicatorHeight: 0,
            bottomToolbarOffset: 0,
            layoutState: CellLayoutState.Uninitialized,
            estimatedHasHorizontalScrolling: false,
            outlineWidth: 1,
            topMargin: layoutConfiguration.cellTopMargin,
            bottomMargin: layoutConfiguration.cellBottomMargin,
        };
    }
    updateExecutionState(e) {
        if (e.changed) {
            this.executionErrorDiagnostic.set(undefined, undefined);
            this._onDidStartExecution.fire(e);
        }
        else {
            this._onDidStopExecution.fire(e);
        }
    }
    updateOptions(e) {
        super.updateOptions(e);
        if (e.cellStatusBarVisibility || e.insertToolbarPosition || e.cellToolbarLocation) {
            this.layoutChange({});
        }
    }
    pauseLayout() {
        this._pauseableEmitter.pause();
    }
    resumeLayout() {
        this._pauseableEmitter.resume();
    }
    layoutChange(state, source) {
        // recompute
        this._ensureOutputsTop();
        const notebookLayoutConfiguration = this.viewContext.notebookOptions.getLayoutConfiguration();
        const bottomToolbarDimensions = this.viewContext.notebookOptions.computeBottomToolbarDimensions(this.viewType);
        const outputShowMoreContainerHeight = state.outputShowMoreContainerHeight ? state.outputShowMoreContainerHeight : this._layoutInfo.outputShowMoreContainerHeight;
        const outputTotalHeight = Math.max(this._outputMinHeight, this.isOutputCollapsed ? notebookLayoutConfiguration.collapsedIndicatorHeight : this._outputsTop.getTotalSum());
        const commentHeight = state.commentHeight ? this._commentHeight : this._layoutInfo.commentHeight;
        const originalLayout = this.layoutInfo;
        if (!this.isInputCollapsed) {
            let newState;
            let editorHeight;
            let totalHeight;
            let hasHorizontalScrolling = false;
            const chatHeight = state.chatHeight ? this._chatHeight : this._layoutInfo.chatHeight;
            if (!state.editorHeight && this._layoutInfo.layoutState === CellLayoutState.FromCache && !state.outputHeight) {
                // No new editorHeight info - keep cached totalHeight and estimate editorHeight
                const estimate = this.estimateEditorHeight(state.font?.lineHeight ?? this._layoutInfo.fontInfo?.lineHeight);
                editorHeight = estimate.editorHeight;
                hasHorizontalScrolling = estimate.hasHorizontalScrolling;
                totalHeight = this._layoutInfo.totalHeight;
                newState = CellLayoutState.FromCache;
            }
            else if (state.editorHeight || this._layoutInfo.layoutState === CellLayoutState.Measured) {
                // Editor has been measured
                editorHeight = this._editorHeight;
                totalHeight = this.computeTotalHeight(this._editorHeight, outputTotalHeight, outputShowMoreContainerHeight, chatHeight);
                newState = CellLayoutState.Measured;
                hasHorizontalScrolling = this._layoutInfo.estimatedHasHorizontalScrolling;
            }
            else {
                const estimate = this.estimateEditorHeight(state.font?.lineHeight ?? this._layoutInfo.fontInfo?.lineHeight);
                editorHeight = estimate.editorHeight;
                hasHorizontalScrolling = estimate.hasHorizontalScrolling;
                totalHeight = this.computeTotalHeight(editorHeight, outputTotalHeight, outputShowMoreContainerHeight, chatHeight);
                newState = CellLayoutState.Estimated;
            }
            const statusBarHeight = this.viewContext.notebookOptions.computeEditorStatusbarHeight(this.internalMetadata, this.uri);
            const codeIndicatorHeight = editorHeight + statusBarHeight;
            const outputIndicatorHeight = outputTotalHeight + outputShowMoreContainerHeight;
            const outputContainerOffset = notebookLayoutConfiguration.editorToolbarHeight
                + notebookLayoutConfiguration.cellTopMargin // CELL_TOP_MARGIN
                + chatHeight
                + editorHeight
                + statusBarHeight;
            const outputShowMoreContainerOffset = totalHeight
                - bottomToolbarDimensions.bottomToolbarGap
                - bottomToolbarDimensions.bottomToolbarHeight / 2
                - outputShowMoreContainerHeight;
            const bottomToolbarOffset = this.viewContext.notebookOptions.computeBottomToolbarOffset(totalHeight, this.viewType);
            const editorWidth = state.outerWidth !== undefined
                ? this.viewContext.notebookOptions.computeCodeCellEditorWidth(state.outerWidth)
                : this._layoutInfo?.editorWidth;
            this._layoutInfo = {
                fontInfo: state.font ?? this._layoutInfo.fontInfo ?? null,
                chatHeight,
                editorHeight,
                editorWidth,
                statusBarHeight,
                outputContainerOffset,
                outputTotalHeight,
                outputShowMoreContainerHeight,
                outputShowMoreContainerOffset,
                commentOffset: outputContainerOffset + outputTotalHeight,
                commentHeight,
                totalHeight,
                codeIndicatorHeight,
                outputIndicatorHeight,
                bottomToolbarOffset,
                layoutState: newState,
                estimatedHasHorizontalScrolling: hasHorizontalScrolling,
                topMargin: notebookLayoutConfiguration.cellTopMargin,
                bottomMargin: notebookLayoutConfiguration.cellBottomMargin,
                outlineWidth: 1
            };
        }
        else {
            const codeIndicatorHeight = notebookLayoutConfiguration.collapsedIndicatorHeight;
            const outputIndicatorHeight = outputTotalHeight + outputShowMoreContainerHeight;
            const chatHeight = state.chatHeight ? this._chatHeight : this._layoutInfo.chatHeight;
            const outputContainerOffset = notebookLayoutConfiguration.cellTopMargin + notebookLayoutConfiguration.collapsedIndicatorHeight;
            const totalHeight = notebookLayoutConfiguration.cellTopMargin
                + notebookLayoutConfiguration.collapsedIndicatorHeight
                + notebookLayoutConfiguration.cellBottomMargin //CELL_BOTTOM_MARGIN
                + bottomToolbarDimensions.bottomToolbarGap //BOTTOM_CELL_TOOLBAR_GAP
                + chatHeight
                + commentHeight
                + outputTotalHeight + outputShowMoreContainerHeight;
            const outputShowMoreContainerOffset = totalHeight
                - bottomToolbarDimensions.bottomToolbarGap
                - bottomToolbarDimensions.bottomToolbarHeight / 2
                - outputShowMoreContainerHeight;
            const bottomToolbarOffset = this.viewContext.notebookOptions.computeBottomToolbarOffset(totalHeight, this.viewType);
            const editorWidth = state.outerWidth !== undefined
                ? this.viewContext.notebookOptions.computeCodeCellEditorWidth(state.outerWidth)
                : this._layoutInfo?.editorWidth;
            this._layoutInfo = {
                fontInfo: state.font ?? this._layoutInfo.fontInfo ?? null,
                editorHeight: this._layoutInfo.editorHeight,
                editorWidth,
                chatHeight: chatHeight,
                statusBarHeight: 0,
                outputContainerOffset,
                outputTotalHeight,
                outputShowMoreContainerHeight,
                outputShowMoreContainerOffset,
                commentOffset: outputContainerOffset + outputTotalHeight,
                commentHeight,
                totalHeight,
                codeIndicatorHeight,
                outputIndicatorHeight,
                bottomToolbarOffset,
                layoutState: this._layoutInfo.layoutState,
                estimatedHasHorizontalScrolling: false,
                outlineWidth: 1,
                topMargin: notebookLayoutConfiguration.cellTopMargin,
                bottomMargin: notebookLayoutConfiguration.cellBottomMargin,
            };
        }
        this._fireOnDidChangeLayout({
            ...state,
            totalHeight: this.layoutInfo.totalHeight !== originalLayout.totalHeight,
            source,
        });
    }
    _fireOnDidChangeLayout(state) {
        this._pauseableEmitter.fire(state);
    }
    restoreEditorViewState(editorViewStates, totalHeight) {
        super.restoreEditorViewState(editorViewStates);
        if (totalHeight !== undefined && this._layoutInfo.layoutState !== CellLayoutState.Measured) {
            this._layoutInfo = {
                ...this._layoutInfo,
                totalHeight: totalHeight,
                layoutState: CellLayoutState.FromCache,
            };
        }
    }
    getDynamicHeight() {
        this._onLayoutInfoRead.fire();
        return this._layoutInfo.totalHeight;
    }
    getHeight(lineHeight) {
        if (this._layoutInfo.layoutState === CellLayoutState.Uninitialized) {
            const estimate = this.estimateEditorHeight(lineHeight);
            return this.computeTotalHeight(estimate.editorHeight, 0, 0, 0);
        }
        else {
            return this._layoutInfo.totalHeight;
        }
    }
    estimateEditorHeight(lineHeight = 20) {
        let hasHorizontalScrolling = false;
        const cellEditorOptions = this.viewContext.getBaseCellEditorOptions(this.language);
        if (this.layoutInfo.fontInfo && cellEditorOptions.value.wordWrap === 'off') {
            for (let i = 0; i < this.lineCount; i++) {
                const max = this.textBuffer.getLineLastNonWhitespaceColumn(i + 1);
                const estimatedWidth = max * (this.layoutInfo.fontInfo.typicalHalfwidthCharacterWidth + this.layoutInfo.fontInfo.letterSpacing);
                if (estimatedWidth > this.layoutInfo.editorWidth) {
                    hasHorizontalScrolling = true;
                    break;
                }
            }
        }
        const verticalScrollbarHeight = hasHorizontalScrolling ? 12 : 0; // take zoom level into account
        const editorPadding = this.viewContext.notebookOptions.computeEditorPadding(this.internalMetadata, this.uri);
        const editorHeight = this.lineCount * lineHeight
            + editorPadding.top
            + editorPadding.bottom // EDITOR_BOTTOM_PADDING
            + verticalScrollbarHeight;
        return {
            editorHeight,
            hasHorizontalScrolling
        };
    }
    computeTotalHeight(editorHeight, outputsTotalHeight, outputShowMoreContainerHeight, chatHeight) {
        const layoutConfiguration = this.viewContext.notebookOptions.getLayoutConfiguration();
        const { bottomToolbarGap } = this.viewContext.notebookOptions.computeBottomToolbarDimensions(this.viewType);
        return layoutConfiguration.editorToolbarHeight
            + layoutConfiguration.cellTopMargin
            + chatHeight
            + editorHeight
            + this.viewContext.notebookOptions.computeEditorStatusbarHeight(this.internalMetadata, this.uri)
            + this._commentHeight
            + outputsTotalHeight
            + outputShowMoreContainerHeight
            + bottomToolbarGap
            + layoutConfiguration.cellBottomMargin;
    }
    onDidChangeTextModelContent() {
        if (this.getEditState() !== CellEditState.Editing) {
            this.updateEditState(CellEditState.Editing, 'onDidChangeTextModelContent');
            this._onDidChangeState.fire({ contentChanged: true });
        }
    }
    onDeselect() {
        this.updateEditState(CellEditState.Preview, 'onDeselect');
    }
    updateOutputShowMoreContainerHeight(height) {
        this.layoutChange({ outputShowMoreContainerHeight: height }, 'CodeCellViewModel#updateOutputShowMoreContainerHeight');
    }
    updateOutputMinHeight(height) {
        this.outputMinHeight = height;
    }
    unlockOutputHeight() {
        this.outputMinHeight = 0;
        this.layoutChange({ outputHeight: true });
    }
    updateOutputHeight(index, height, source) {
        if (index >= this._outputCollection.length) {
            throw new Error('Output index out of range!');
        }
        this._ensureOutputsTop();
        try {
            if (index === 0 || height > 0) {
                this._outputViewModels[index].setVisible(true);
            }
            else if (height === 0) {
                this._outputViewModels[index].setVisible(false);
            }
        }
        catch (e) {
            const errorMessage = `Failed to update output height for cell ${this.handle}, output ${index}. `
                + `this.outputCollection.length: ${this._outputCollection.length}, this._outputViewModels.length: ${this._outputViewModels.length}`;
            throw new Error(`${errorMessage}.\n Error: ${e.message}`);
        }
        if (this._outputViewModels[index].visible.get() && height < 28) {
            height = 28;
        }
        this._outputCollection[index] = height;
        if (this._outputsTop.setValue(index, height)) {
            this.layoutChange({ outputHeight: true }, source);
        }
    }
    getOutputOffsetInContainer(index) {
        this._ensureOutputsTop();
        if (index >= this._outputCollection.length) {
            throw new Error('Output index out of range!');
        }
        return this._outputsTop.getPrefixSum(index - 1);
    }
    getOutputOffset(index) {
        return this.layoutInfo.outputContainerOffset + this.getOutputOffsetInContainer(index);
    }
    spliceOutputHeights(start, deleteCnt, heights) {
        this._ensureOutputsTop();
        this._outputsTop.removeValues(start, deleteCnt);
        if (heights.length) {
            const values = new Uint32Array(heights.length);
            for (let i = 0; i < heights.length; i++) {
                values[i] = heights[i];
            }
            this._outputsTop.insertValues(start, values);
        }
        this.layoutChange({ outputHeight: true }, 'CodeCellViewModel#spliceOutputs');
    }
    _ensureOutputsTop() {
        if (!this._outputsTop) {
            const values = new Uint32Array(this._outputCollection.length);
            for (let i = 0; i < this._outputCollection.length; i++) {
                values[i] = this._outputCollection[i];
            }
            this._outputsTop = new PrefixSumComputer(values);
        }
    }
    startFind(value, options) {
        const matches = super.cellStartFind(value, options);
        if (matches === null) {
            return null;
        }
        return {
            cell: this,
            contentMatches: matches
        };
    }
    dispose() {
        super.dispose();
        this._outputCollection = [];
        this._outputsTop = null;
        dispose(this._outputViewModels);
    }
};
CodeCellViewModel = __decorate([
    __param(4, IConfigurationService),
    __param(5, INotebookService),
    __param(6, ITextModelService),
    __param(7, IUndoRedoService),
    __param(8, ICodeEditorService),
    __param(9, IInlineChatSessionService)
], CodeCellViewModel);
export { CodeCellViewModel };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kZUNlbGxWaWV3TW9kZWwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL3ZpZXdNb2RlbC9jb2RlQ2VsbFZpZXdNb2RlbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFTLGdCQUFnQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDdkYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUMzRSxPQUFPLEtBQUssSUFBSSxNQUFNLG9DQUFvQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBRWpHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzVGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxhQUFhLEVBQWlCLGVBQWUsRUFBdUYsTUFBTSx1QkFBdUIsQ0FBQztBQUczSyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUcvRCxPQUFPLEVBQUUsUUFBUSxFQUFtRCxNQUFNLGdDQUFnQyxDQUFDO0FBRTNHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQzNELE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLHlE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