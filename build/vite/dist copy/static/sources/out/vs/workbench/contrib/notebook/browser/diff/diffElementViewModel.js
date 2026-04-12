/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../../base/common/event.js';
import { hash } from '../../../../../base/common/hash.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { DiffEditorWidget } from '../../../../../editor/browser/widget/diffEditor/diffEditorWidget.js';
import { getEditorPadding } from './diffCellEditorOptions.js';
import { DiffNestedCellViewModel } from './diffNestedCellViewModel.js';
import { NotebookDiffViewEventType } from './eventDispatcher.js';
import { DIFF_CELL_MARGIN, DiffSide } from './notebookDiffEditorBrowser.js';
import { CellLayoutState } from '../notebookBrowser.js';
import { getFormattedMetadataJSON } from '../../common/model/notebookCellTextModel.js';
import { CellUri } from '../../common/notebookCommon.js';
import { Schemas } from '../../../../../base/common/network.js';
import { NotebookDocumentMetadataTextModel } from '../../common/model/notebookMetadataTextModel.js';
const PropertyHeaderHeight = 25;
// From `.monaco-editor .diff-hidden-lines .center` in src/vs/editor/browser/widget/diffEditor/style.css
export const HeightOfHiddenLinesRegionInDiffEditor = 24;
export const DefaultLineHeight = 17;
export var PropertyFoldingState;
(function (PropertyFoldingState) {
    PropertyFoldingState[PropertyFoldingState["Expanded"] = 0] = "Expanded";
    PropertyFoldingState[PropertyFoldingState["Collapsed"] = 1] = "Collapsed";
})(PropertyFoldingState || (PropertyFoldingState = {}));
export const OUTPUT_EDITOR_HEIGHT_MAGIC = 1440;
export class DiffElementViewModelBase extends Disposable {
    constructor(mainDocumentTextModel, editorEventDispatcher, initData) {
        super();
        this.mainDocumentTextModel = mainDocumentTextModel;
        this.editorEventDispatcher = editorEventDispatcher;
        this.initData = initData;
        this._layoutInfoEmitter = this._register(new Emitter());
        this.onDidLayoutChange = this._layoutInfoEmitter.event;
        this._register(this.editorEventDispatcher.onDidChangeLayout(e => this._layoutInfoEmitter.fire({ outerWidth: true })));
    }
}
export class DiffElementPlaceholderViewModel extends DiffElementViewModelBase {
    constructor(mainDocumentTextModel, editorEventDispatcher, initData) {
        super(mainDocumentTextModel, editorEventDispatcher, initData);
        this.type = 'placeholder';
        this.hiddenCells = [];
        this._unfoldHiddenCells = this._register(new Emitter());
        this.onUnfoldHiddenCells = this._unfoldHiddenCells.event;
        this.renderOutput = false;
    }
    get totalHeight() {
        return 24 + (2 * DIFF_CELL_MARGIN);
    }
    getHeight(_) {
        return this.totalHeight;
    }
    layoutChange() {
        //
    }
    showHiddenCells() {
        this._unfoldHiddenCells.fire();
    }
}
export class NotebookDocumentMetadataViewModel extends DiffElementViewModelBase {
    set editorHeight(height) {
        this._layout({ editorHeight: height });
    }
    get editorHeight() {
        throw new Error('Use Cell.layoutInfo.editorHeight');
    }
    set editorMargin(margin) {
        this._layout({ editorMargin: margin });
    }
    get editorMargin() {
        throw new Error('Use Cell.layoutInfo.editorMargin');
    }
    get layoutInfo() {
        return this._layoutInfo;
    }
    get totalHeight() {
        return this.layoutInfo.totalHeight;
    }
    constructor(originalDocumentTextModel, modifiedDocumentTextModel, type, editorEventDispatcher, initData, notebookService, editorHeightCalculator) {
        super(originalDocumentTextModel, editorEventDispatcher, initData);
        this.originalDocumentTextModel = originalDocumentTextModel;
        this.modifiedDocumentTextModel = modifiedDocumentTextModel;
        this.type = type;
        this.editorHeightCalculator = editorHeightCalculator;
        this.renderOutput = false;
        this._sourceEditorViewState = null;
        const cellStatusHeight = PropertyHeaderHeight;
        this._layoutInfo = {
            width: 0,
            editorHeight: 0,
            editorMargin: 0,
            metadataHeight: 0,
            cellStatusHeight,
            metadataStatusHeight: 0,
            rawOutputHeight: 0,
            outputTotalHeight: 0,
            outputStatusHeight: 0,
            outputMetadataHeight: 0,
            bodyMargin: 32,
            totalHeight: 82 + cellStatusHeight + 0,
            layoutState: CellLayoutState.Uninitialized
        };
        this.cellFoldingState = type === 'modifiedMetadata' ? PropertyFoldingState.Expanded : PropertyFoldingState.Collapsed;
        this.originalMetadata = this._register(new NotebookDocumentMetadataTextModel(originalDocumentTextModel));
        this.modifiedMetadata = this._register(new NotebookDocumentMetadataTextModel(modifiedDocumentTextModel));
    }
    async computeHeights() {
        if (this.type === 'unchangedMetadata') {
            this.editorHeight = this.editorHeightCalculator.computeHeightFromLines(this.originalMetadata.textBuffer.getLineCount());
        }
        else {
            const original = this.originalMetadata.uri;
            const modified = this.modifiedMetadata.uri;
            this.editorHeight = await this.editorHeightCalculator.diffAndComputeHeight(original, modified);
        }
    }
    layoutChange() {
        this._layout({ recomputeOutput: true });
    }
    _layout(delta) {
        const width = delta.width !== undefined ? delta.width : this._layoutInfo.width;
        const editorHeight = delta.editorHeight !== undefined ? delta.editorHeight : this._layoutInfo.editorHeight;
        const editorMargin = delta.editorMargin !== undefined ? delta.editorMargin : this._layoutInfo.editorMargin;
        const cellStatusHeight = delta.cellStatusHeight !== undefined ? delta.cellStatusHeight : this._layoutInfo.cellStatusHeight;
        const bodyMargin = delta.bodyMargin !== undefined ? delta.bodyMargin : this._layoutInfo.bodyMargin;
        const totalHeight = editorHeight
            + editorMargin
            + cellStatusHeight
            + bodyMargin;
        const newLayout = {
            width: width,
            editorHeight: editorHeight,
            editorMargin: editorMargin,
            metadataHeight: 0,
            cellStatusHeight,
            metadataStatusHeight: 0,
            outputTotalHeight: 0,
            outputStatusHeight: 0,
            bodyMargin: bodyMargin,
            rawOutputHeight: 0,
            outputMetadataHeight: 0,
            totalHeight: totalHeight,
            layoutState: CellLayoutState.Measured
        };
        let somethingChanged = false;
        const changeEvent = {};
        if (newLayout.width !== this._layoutInfo.width) {
            changeEvent.width = true;
            somethingChanged = true;
        }
        if (newLayout.editorHeight !== this._layoutInfo.editorHeight) {
            changeEvent.editorHeight = true;
            somethingChanged = true;
        }
        if (newLayout.editorMargin !== this._layoutInfo.editorMargin) {
            changeEvent.editorMargin = true;
            somethingChanged = true;
        }
        if (newLayout.cellStatusHeight !== this._layoutInfo.cellStatusHeight) {
            changeEvent.cellStatusHeight = true;
            somethingChanged = true;
        }
        if (newLayout.bodyMargin !== this._layoutInfo.bodyMargin) {
            changeEvent.bodyMargin = true;
            somethingChanged = true;
        }
        if (newLayout.totalHeight !== this._layoutInfo.totalHeight) {
            changeEvent.totalHeight = true;
            somethingChanged = true;
        }
        if (somethingChanged) {
            this._layoutInfo = newLayout;
            this._fireLayoutChangeEvent(changeEvent);
        }
    }
    getHeight(lineHeight) {
        if (this._layoutInfo.layoutState === CellLayoutState.Uninitialized) {
            const editorHeight = this.cellFoldingState === PropertyFoldingState.Collapsed ? 0 : this.computeInputEditorHeight(lineHeight);
            return this._computeTotalHeight(editorHeight);
        }
        else {
            return this._layoutInfo.totalHeight;
        }
    }
    _computeTotalHeight(editorHeight) {
        const totalHeight = editorHeight
            + this._layoutInfo.editorMargin
            + this._layoutInfo.metadataHeight
            + this._layoutInfo.cellStatusHeight
            + this._layoutInfo.metadataStatusHeight
            + this._layoutInfo.outputTotalHeight
            + this._layoutInfo.outputStatusHeight
            + this._layoutInfo.outputMetadataHeight
            + this._layoutInfo.bodyMargin;
        return totalHeight;
    }
    computeInputEditorHeight(_lineHeight) {
        return this.editorHeightCalculator.computeHeightFromLines(Math.max(this.originalMetadata.textBuffer.getLineCount(), this.modifiedMetadata.textBuffer.getLineCount()));
    }
    _fireLayoutChangeEvent(state) {
        this._layoutInfoEmitter.fire(state);
        this.editorEventDispatcher.emit([{ type: NotebookDiffViewEventType.CellLayoutChanged, source: this._layoutInfo }]);
    }
    getComputedCellContainerWidth(layoutInfo, diffEditor, fullWidth) {
        if (fullWidth) {
            return layoutInfo.width - 2 * DIFF_CELL_MARGIN + (diffEditor ? DiffEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH : 0) - 2;
        }
        return (layoutInfo.width - 2 * DIFF_CELL_MARGIN + (diffEditor ? DiffEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH : 0)) / 2 - 18 - 2;
    }
    getSourceEditorViewState() {
        return this._sourceEditorViewState;
    }
    saveSpirceEditorViewState(viewState) {
        this._sourceEditorViewState = viewState;
    }
}
export class DiffElementCellViewModelBase extends DiffElementViewModelBase {
    hideUnchangedCells() {
        this._hideUnchangedCells.fire();
    }
    set rawOutputHeight(height) {
        this._layout({ rawOutputHeight: Math.min(OUTPUT_EDITOR_HEIGHT_MAGIC, height) });
    }
    get rawOutputHeight() {
        throw new Error('Use Cell.layoutInfo.rawOutputHeight');
    }
    set outputStatusHeight(height) {
        this._layout({ outputStatusHeight: height });
    }
    get outputStatusHeight() {
        throw new Error('Use Cell.layoutInfo.outputStatusHeight');
    }
    set outputMetadataHeight(height) {
        this._layout({ outputMetadataHeight: height });
    }
    get outputMetadataHeight() {
        throw new Error('Use Cell.layoutInfo.outputStatusHeight');
    }
    set editorHeight(height) {
        this._layout({ editorHeight: height });
    }
    get editorHeight() {
        throw new Error('Use Cell.layoutInfo.editorHeight');
    }
    set editorMargin(margin) {
        this._layout({ editorMargin: margin });
    }
    get editorMargin() {
        throw new Error('Use Cell.layoutInfo.editorMargin');
    }
    set metadataStatusHeight(height) {
        this._layout({ metadataStatusHeight: height });
    }
    get metadataStatusHeight() {
        throw new Error('Use Cell.layoutInfo.outputStatusHeight');
    }
    set metadataHeight(height) {
        this._layout({ metadataHeight: height });
    }
    get metadataHeight() {
        throw new Error('Use Cell.layoutInfo.metadataHeight');
    }
    set renderOutput(value) {
        this._renderOutput = value;
        this._layout({ recomputeOutput: true });
        this._stateChangeEmitter.fire({ renderOutput: this._renderOutput });
    }
    get renderOutput() {
        return this._renderOutput;
    }
    get layoutInfo() {
        return this._layoutInfo;
    }
    get totalHeight() {
        return this.layoutInfo.totalHeight;
    }
    get ignoreOutputs() {
        return this.configurationService.getValue('notebook.diff.ignoreOutputs') || !!(this.mainDocumentTextModel?.transientOptions.transientOutputs);
    }
    get ignoreMetadata() {
        return this.configurationService.getValue('notebook.diff.ignoreMetadata');
    }
    constructor(mainDocumentTextModel, original, modified, type, editorEventDispatcher, initData, notebookService, index, configurationService, diffEditorHeightCalculator) {
        super(mainDocumentTextModel, editorEventDispatcher, initData);
        this.type = type;
        this.index = index;
        this.configurationService = configurationService;
        this.diffEditorHeightCalculator = diffEditorHeightCalculator;
        this._stateChangeEmitter = this._register(new Emitter());
        this.onDidStateChange = this._stateChangeEmitter.event;
        this._hideUnchangedCells = this._register(new Emitter());
        this.onHideUnchangedCells = this._hideUnchangedCells.event;
        this._renderOutput = true;
        this._sourceEditorViewState = null;
        this._outputEditorViewState = null;
        this._metadataEditorViewState = null;
        this.original = original ? this._register(new DiffNestedCellViewModel(original, notebookService)) : undefined;
        this.modified = modified ? this._register(new DiffNestedCellViewModel(modified, notebookService)) : undefined;
        const editorHeight = this._estimateEditorHeight(initData.fontInfo);
        const cellStatusHeight = PropertyHeaderHeight;
        this._layoutInfo = {
            width: 0,
            editorHeight: editorHeight,
            editorMargin: 0,
            metadataHeight: 0,
            cellStatusHeight,
            metadataStatusHeight: this.ignoreMetadata ? 0 : PropertyHeaderHeight,
            rawOutputHeight: 0,
            outputTotalHeight: 0,
            outputStatusHeight: this.ignoreOutputs ? 0 : PropertyHeaderHeight,
            outputMetadataHeight: 0,
            bodyMargin: 32,
            totalHeight: 82 + cellStatusHeight + editorHeight,
            layoutState: CellLayoutState.Uninitialized
        };
        this.cellFoldingState = modified?.getTextBufferHash() !== original?.getTextBufferHash() ? PropertyFoldingState.Expanded : PropertyFoldingState.Collapsed;
        this.metadataFoldingState = PropertyFoldingState.Collapsed;
        this.outputFoldingState = PropertyFoldingState.Collapsed;
    }
    layoutChange() {
        this._layout({ recomputeOutput: true });
    }
    _estimateEditorHeight(fontInfo) {
        const lineHeight = fontInfo?.lineHeight ?? 17;
        switch (this.type) {
            case 'unchanged':
            case 'insert':
                {
                    const lineCount = this.modified.textModel.textBuffer.getLineCount();
                    const editorHeight = lineCount * lineHeight + getEditorPadding(lineCount).top + getEditorPadding(lineCount).bottom;
                    return editorHeight;
                }
            case 'delete':
            case 'modified':
                {
                    const lineCount = this.original.textModel.textBuffer.getLineCount();
                    const editorHeight = lineCount * lineHeight + getEditorPadding(lineCount).top + getEditorPadding(lineCount).bottom;
                    return editorHeight;
                }
        }
    }
    _layout(delta) {
        const width = delta.width !== undefined ? delta.width : this._layoutInfo.width;
        const editorHeight = delta.editorHeight !== undefined ? delta.editorHeight : this._layoutInfo.editorHeight;
        const editorMargin = delta.editorMargin !== undefined ? delta.editorMargin : this._layoutInfo.editorMargin;
        const metadataHeight = delta.metadataHeight !== undefined ? delta.metadataHeight : this._layoutInfo.metadataHeight;
        const cellStatusHeight = delta.cellStatusHeight !== undefined ? delta.cellStatusHeight : this._layoutInfo.cellStatusHeight;
        const metadataStatusHeight = delta.metadataStatusHeight !== undefined ? delta.metadataStatusHeight : this._layoutInfo.metadataStatusHeight;
        const rawOutputHeight = delta.rawOutputHeight !== undefined ? delta.rawOutputHeight : this._layoutInfo.rawOutputHeight;
        const outputStatusHeight = delta.outputStatusHeight !== undefined ? delta.outputStatusHeight : this._layoutInfo.outputStatusHeight;
        const bodyMargin = delta.bodyMargin !== undefined ? delta.bodyMargin : this._layoutInfo.bodyMargin;
        const outputMetadataHeight = delta.outputMetadataHeight !== undefined ? delta.outputMetadataHeight : this._layoutInfo.outputMetadataHeight;
        const outputHeight = this.ignoreOutputs ? 0 : (delta.recomputeOutput || delta.rawOutputHeight !== undefined || delta.outputMetadataHeight !== undefined) ? this._getOutputTotalHeight(rawOutputHeight, outputMetadataHeight) : this._layoutInfo.outputTotalHeight;
        const totalHeight = editorHeight
            + editorMargin
            + cellStatusHeight
            + metadataHeight
            + metadataStatusHeight
            + outputHeight
            + outputStatusHeight
            + bodyMargin;
        const newLayout = {
            width: width,
            editorHeight: editorHeight,
            editorMargin: editorMargin,
            metadataHeight: metadataHeight,
            cellStatusHeight,
            metadataStatusHeight: metadataStatusHeight,
            outputTotalHeight: outputHeight,
            outputStatusHeight: outputStatusHeight,
            bodyMargin: bodyMargin,
            rawOutputHeight: rawOutputHeight,
            outputMetadataHeight: outputMetadataHeight,
            totalHeight: totalHeight,
            layoutState: CellLayoutState.Measured
        };
        let somethingChanged = false;
        const changeEvent = {};
        if (newLayout.width !== this._layoutInfo.width) {
            changeEvent.width = true;
            somethingChanged = true;
        }
        if (newLayout.editorHeight !== this._layoutInfo.editorHeight) {
            changeEvent.editorHeight = true;
            somethingChanged = true;
        }
        if (newLayout.editorMargin !== this._layoutInfo.editorMargin) {
            changeEvent.editorMargin = true;
            somethingChanged = true;
        }
        if (newLayout.metadataHeight !== this._layoutInfo.metadataHeight) {
            changeEvent.metadataHeight = true;
            somethingChanged = true;
        }
        if (newLayout.cellStatusHeight !== this._layoutInfo.cellStatusHeight) {
            changeEvent.cellStatusHeight = true;
            somethingChanged = true;
        }
        if (newLayout.metadataStatusHeight !== this._layoutInfo.metadataStatusHeight) {
            changeEvent.metadataStatusHeight = true;
            somethingChanged = true;
        }
        if (newLayout.outputTotalHeight !== this._layoutInfo.outputTotalHeight) {
            changeEvent.outputTotalHeight = true;
            somethingChanged = true;
        }
        if (newLayout.outputStatusHeight !== this._layoutInfo.outputStatusHeight) {
            changeEvent.outputStatusHeight = true;
            somethingChanged = true;
        }
        if (newLayout.bodyMargin !== this._layoutInfo.bodyMargin) {
            changeEvent.bodyMargin = true;
            somethingChanged = true;
        }
        if (newLayout.outputMetadataHeight !== this._layoutInfo.outputMetadataHeight) {
            changeEvent.outputMetadataHeight = true;
            somethingChanged = true;
        }
        if (newLayout.totalHeight !== this._layoutInfo.totalHeight) {
            changeEvent.totalHeight = true;
            somethingChanged = true;
        }
        if (somethingChanged) {
            this._layoutInfo = newLayout;
            this._fireLayoutChangeEvent(changeEvent);
        }
    }
    getHeight(lineHeight) {
        if (this._layoutInfo.layoutState === CellLayoutState.Uninitialized) {
            const editorHeight = this.cellFoldingState === PropertyFoldingState.Collapsed ? 0 : this.computeInputEditorHeight(lineHeight);
            return this._computeTotalHeight(editorHeight);
        }
        else {
            return this._layoutInfo.totalHeight;
        }
    }
    _computeTotalHeight(editorHeight) {
        const totalHeight = editorHeight
            + this._layoutInfo.editorMargin
            + this._layoutInfo.metadataHeight
            + this._layoutInfo.cellStatusHeight
            + this._layoutInfo.metadataStatusHeight
            + this._layoutInfo.outputTotalHeight
            + this._layoutInfo.outputStatusHeight
            + this._layoutInfo.outputMetadataHeight
            + this._layoutInfo.bodyMargin;
        return totalHeight;
    }
    computeInputEditorHeight(lineHeight) {
        const lineCount = Math.max(this.original?.textModel.textBuffer.getLineCount() ?? 1, this.modified?.textModel.textBuffer.getLineCount() ?? 1);
        return this.diffEditorHeightCalculator.computeHeightFromLines(lineCount);
    }
    _getOutputTotalHeight(rawOutputHeight, metadataHeight) {
        if (this.outputFoldingState === PropertyFoldingState.Collapsed) {
            return 0;
        }
        if (this.renderOutput) {
            if (this.isOutputEmpty()) {
                // single line;
                return 24;
            }
            return this.getRichOutputTotalHeight() + metadataHeight;
        }
        else {
            return rawOutputHeight;
        }
    }
    _fireLayoutChangeEvent(state) {
        this._layoutInfoEmitter.fire(state);
        this.editorEventDispatcher.emit([{ type: NotebookDiffViewEventType.CellLayoutChanged, source: this._layoutInfo }]);
    }
    getComputedCellContainerWidth(layoutInfo, diffEditor, fullWidth) {
        if (fullWidth) {
            return layoutInfo.width - 2 * DIFF_CELL_MARGIN + (diffEditor ? DiffEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH : 0) - 2;
        }
        return (layoutInfo.width - 2 * DIFF_CELL_MARGIN + (diffEditor ? DiffEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH : 0)) / 2 - 18 - 2;
    }
    getOutputEditorViewState() {
        return this._outputEditorViewState;
    }
    saveOutputEditorViewState(viewState) {
        this._outputEditorViewState = viewState;
    }
    getMetadataEditorViewState() {
        return this._metadataEditorViewState;
    }
    saveMetadataEditorViewState(viewState) {
        this._metadataEditorViewState = viewState;
    }
    getSourceEditorViewState() {
        return this._sourceEditorViewState;
    }
    saveSpirceEditorViewState(viewState) {
        this._sourceEditorViewState = viewState;
    }
}
export class SideBySideDiffElementViewModel extends DiffElementCellViewModelBase {
    get originalDocument() {
        return this.otherDocumentTextModel;
    }
    get modifiedDocument() {
        return this.mainDocumentTextModel;
    }
    constructor(mainDocumentTextModel, otherDocumentTextModel, original, modified, type, editorEventDispatcher, initData, notebookService, configurationService, index, diffEditorHeightCalculator) {
        super(mainDocumentTextModel, original, modified, type, editorEventDispatcher, initData, notebookService, index, configurationService, diffEditorHeightCalculator);
        this.otherDocumentTextModel = otherDocumentTextModel;
        this.type = type;
        this.cellFoldingState = this.modified.textModel.getValue() !== this.original.textModel.getValue() ? PropertyFoldingState.Expanded : PropertyFoldingState.Collapsed;
        this.metadataFoldingState = PropertyFoldingState.Collapsed;
        this.outputFoldingState = PropertyFoldingState.Collapsed;
        if (this.checkMetadataIfModified()) {
            this.metadataFoldingState = PropertyFoldingState.Expanded;
        }
        if (this.checkIfOutputsModified()) {
            this.outputFoldingState = PropertyFoldingState.Expanded;
        }
        this._register(this.original.onDidChangeOutputLayout(() => {
            this._layout({ recomputeOutput: true });
        }));
        this._register(this.modified.onDidChangeOutputLayout(() => {
            this._layout({ recomputeOutput: true });
        }));
        this._register(this.modified.textModel.onDidChangeContent(() => {
            if (mainDocumentTextModel.transientOptions.cellContentMetadata) {
                const cellMetadataKeys = [...Object.keys(mainDocumentTextModel.transientOptions.cellContentMetadata)];
                const modifiedMedataRaw = Object.assign({}, this.modified.metadata);
                const originalCellMetadata = this.original.metadata;
                for (const key of cellMetadataKeys) {
                    if (Object.hasOwn(originalCellMetadata, key)) {
                        modifiedMedataRaw[key] = originalCellMetadata[key];
                    }
                }
                this.modified.textModel.metadata = modifiedMedataRaw;
            }
        }));
    }
    checkIfInputModified() {
        if (this.original.textModel.getTextBufferHash() === this.modified.textModel.getTextBufferHash()) {
            return false;
        }
        return {
            reason: 'Cell content has changed',
        };
    }
    checkIfOutputsModified() {
        if (this.mainDocumentTextModel.transientOptions.transientOutputs || this.ignoreOutputs) {
            return false;
        }
        const ret = outputsEqual(this.original?.outputs ?? [], this.modified?.outputs ?? []);
        if (ret === 0 /* OutputComparison.Unchanged */) {
            return false;
        }
        return {
            reason: ret === 1 /* OutputComparison.Metadata */ ? 'Output metadata has changed' : undefined,
            kind: ret
        };
    }
    checkMetadataIfModified() {
        if (this.ignoreMetadata) {
            return false;
        }
        const modified = hash(getFormattedMetadataJSON(this.mainDocumentTextModel.transientOptions.transientCellMetadata, this.original?.metadata || {}, this.original?.language)) !== hash(getFormattedMetadataJSON(this.mainDocumentTextModel.transientOptions.transientCellMetadata, this.modified?.metadata ?? {}, this.modified?.language));
        if (modified) {
            return { reason: undefined };
        }
        else {
            return false;
        }
    }
    updateOutputHeight(diffSide, index, height) {
        if (diffSide === DiffSide.Original) {
            this.original.updateOutputHeight(index, height);
        }
        else {
            this.modified.updateOutputHeight(index, height);
        }
    }
    getOutputOffsetInContainer(diffSide, index) {
        if (diffSide === DiffSide.Original) {
            return this.original.getOutputOffset(index);
        }
        else {
            return this.modified.getOutputOffset(index);
        }
    }
    getOutputOffsetInCell(diffSide, index) {
        const offsetInOutputsContainer = this.getOutputOffsetInContainer(diffSide, index);
        return this._layoutInfo.editorHeight
            + this._layoutInfo.editorMargin
            + this._layoutInfo.metadataHeight
            + this._layoutInfo.cellStatusHeight
            + this._layoutInfo.metadataStatusHeight
            + this._layoutInfo.outputStatusHeight
            + this._layoutInfo.bodyMargin / 2
            + offsetInOutputsContainer;
    }
    isOutputEmpty() {
        if (this.mainDocumentTextModel.transientOptions.transientOutputs) {
            return true;
        }
        if (this.checkIfOutputsModified()) {
            return false;
        }
        // outputs are not changed
        return (this.original?.outputs || []).length === 0;
    }
    getRichOutputTotalHeight() {
        return Math.max(this.original.getOutputTotalHeight(), this.modified.getOutputTotalHeight());
    }
    getNestedCellViewModel(diffSide) {
        return diffSide === DiffSide.Original ? this.original : this.modified;
    }
    getCellByUri(cellUri) {
        if (cellUri.toString() === this.original.uri.toString()) {
            return this.original;
        }
        else {
            return this.modified;
        }
    }
    computeInputEditorHeight(lineHeight) {
        if (this.type === 'modified' &&
            typeof this.editorHeightWithUnchangedLinesCollapsed === 'number' &&
            this.checkIfInputModified()) {
            return this.editorHeightWithUnchangedLinesCollapsed;
        }
        return super.computeInputEditorHeight(lineHeight);
    }
    async computeModifiedInputEditorHeight() {
        if (this.checkIfInputModified()) {
            this.editorHeightWithUnchangedLinesCollapsed = this._layoutInfo.editorHeight = await this.diffEditorHeightCalculator.diffAndComputeHeight(this.original.uri, this.modified.uri);
        }
    }
    async computeModifiedMetadataEditorHeight() {
        if (this.checkMetadataIfModified()) {
            const originalMetadataUri = CellUri.generateCellPropertyUri(this.originalDocument.uri, this.original.handle, Schemas.vscodeNotebookCellMetadata);
            const modifiedMetadataUri = CellUri.generateCellPropertyUri(this.modifiedDocument.uri, this.modified.handle, Schemas.vscodeNotebookCellMetadata);
            this._layoutInfo.metadataHeight = await this.diffEditorHeightCalculator.diffAndComputeHeight(originalMetadataUri, modifiedMetadataUri);
        }
    }
    async computeEditorHeights() {
        if (this.type === 'unchanged') {
            return;
        }
        await Promise.all([this.computeModifiedInputEditorHeight(), this.computeModifiedMetadataEditorHeight()]);
    }
}
export class SingleSideDiffElementViewModel extends DiffElementCellViewModelBase {
    get cellViewModel() {
        return this.type === 'insert' ? this.modified : this.original;
    }
    get originalDocument() {
        if (this.type === 'insert') {
            return this.otherDocumentTextModel;
        }
        else {
            return this.mainDocumentTextModel;
        }
    }
    get modifiedDocument() {
        if (this.type === 'insert') {
            return this.mainDocumentTextModel;
        }
        else {
            return this.otherDocumentTextModel;
        }
    }
    constructor(mainDocumentTextModel, otherDocumentTextModel, original, modified, type, editorEventDispatcher, initData, notebookService, configurationService, diffEditorHeightCalculator, index) {
        super(mainDocumentTextModel, original, modified, type, editorEventDispatcher, initData, notebookService, index, configurationService, diffEditorHeightCalculator);
        this.otherDocumentTextModel = otherDocumentTextModel;
        this.type = type;
        this._register(this.cellViewModel.onDidChangeOutputLayout(() => {
            this._layout({ recomputeOutput: true });
        }));
    }
    checkIfInputModified() {
        return {
            reason: 'Cell content has changed',
        };
    }
    getNestedCellViewModel(diffSide) {
        return this.type === 'insert' ? this.modified : this.original;
    }
    checkIfOutputsModified() {
        return false;
    }
    checkMetadataIfModified() {
        return false;
    }
    updateOutputHeight(diffSide, index, height) {
        this.cellViewModel?.updateOutputHeight(index, height);
    }
    getOutputOffsetInContainer(diffSide, index) {
        return this.cellViewModel.getOutputOffset(index);
    }
    getOutputOffsetInCell(diffSide, index) {
        const offsetInOutputsContainer = this.cellViewModel.getOutputOffset(index);
        return this._layoutInfo.editorHeight
            + this._layoutInfo.editorMargin
            + this._layoutInfo.metadataHeight
            + this._layoutInfo.cellStatusHeight
            + this._layoutInfo.metadataStatusHeight
            + this._layoutInfo.outputStatusHeight
            + this._layoutInfo.bodyMargin / 2
            + offsetInOutputsContainer;
    }
    isOutputEmpty() {
        if (this.mainDocumentTextModel.transientOptions.transientOutputs) {
            return true;
        }
        // outputs are not changed
        return (this.original?.outputs || this.modified?.outputs || []).length === 0;
    }
    getRichOutputTotalHeight() {
        return this.cellViewModel?.getOutputTotalHeight() ?? 0;
    }
    getCellByUri(cellUri) {
        return this.cellViewModel;
    }
}
export var OutputComparison;
(function (OutputComparison) {
    OutputComparison[OutputComparison["Unchanged"] = 0] = "Unchanged";
    OutputComparison[OutputComparison["Metadata"] = 1] = "Metadata";
    OutputComparison[OutputComparison["Other"] = 2] = "Other";
})(OutputComparison || (OutputComparison = {}));
export function outputEqual(a, b) {
    if (hash(a.metadata) === hash(b.metadata)) {
        return 2 /* OutputComparison.Other */;
    }
    // metadata not equal
    for (let j = 0; j < a.outputs.length; j++) {
        const aOutputItem = a.outputs[j];
        const bOutputItem = b.outputs[j];
        if (aOutputItem.mime !== bOutputItem.mime) {
            return 2 /* OutputComparison.Other */;
        }
        if (aOutputItem.data.buffer.length !== bOutputItem.data.buffer.length) {
            return 2 /* OutputComparison.Other */;
        }
        for (let k = 0; k < aOutputItem.data.buffer.length; k++) {
            if (aOutputItem.data.buffer[k] !== bOutputItem.data.buffer[k]) {
                return 2 /* OutputComparison.Other */;
            }
        }
    }
    return 1 /* OutputComparison.Metadata */;
}
function outputsEqual(original, modified) {
    if (original.length !== modified.length) {
        return 2 /* OutputComparison.Other */;
    }
    const len = original.length;
    for (let i = 0; i < len; i++) {
        const a = original[i];
        const b = modified[i];
        if (hash(a.metadata) !== hash(b.metadata)) {
            return 1 /* OutputComparison.Metadata */;
        }
        if (a.outputs.length !== b.outputs.length) {
            return 2 /* OutputComparison.Other */;
        }
        for (let j = 0; j < a.outputs.length; j++) {
            const aOutputItem = a.outputs[j];
            const bOutputItem = b.outputs[j];
            if (aOutputItem.mime !== bOutputItem.mime) {
                return 2 /* OutputComparison.Other */;
            }
            if (aOutputItem.data.buffer.length !== bOutputItem.data.buffer.length) {
                return 2 /* OutputComparison.Other */;
            }
            for (let k = 0; k < aOutputItem.data.buffer.length; k++) {
                if (aOutputItem.data.buffer[k] !== bOutputItem.data.buffer[k]) {
                    return 2 /* OutputComparison.Other */;
                }
            }
        }
    }
    return 0 /* OutputComparison.Unchanged */;
}
export function getStreamOutputData(outputs) {
    if (!outputs.length) {
        return null;
    }
    const first = outputs[0];
    const mime = first.mime;
    const sameStream = !outputs.find(op => op.mime !== mime);
    if (sameStream) {
        return outputs.map(opit => opit.data.toString()).join('');
    }
    else {
        return null;
    }
}
export function getFormattedOutputJSON(outputs) {
    if (outputs.length === 1) {
        const streamOutputData = getStreamOutputData(outputs[0].outputs);
        if (streamOutputData) {
            return streamOutputData;
        }
    }
    return JSON.stringify(outputs.map(output => {
        return ({
            metadata: output.metadata,
            outputItems: output.outputs.map(opit => ({
                mimeType: opit.mime,
                data: opit.data.toString()
            }))
        });
    }), undefined, '\t');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlmZkVsZW1lbnRWaWV3TW9kZWwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL2RpZmYvZGlmZkVsZW1lbnRWaWV3TW9kZWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFckUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFHdkcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDOUQsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDdkUsT0FBTyxFQUFxQyx5QkFBeUIsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQ3BHLE9BQU8sRUFBc0MsZ0JBQWdCLEVBQUUsUUFBUSxFQUEwQixNQUFNLGdDQUFnQyxDQUFDO0FBQ3hJLE9BQU8sRUFBRSxlQUFlLEVBQXlCLE1BQU0sdUJBQXVCLENBQUM7QUFFL0UsT0FBTyxFQUFFLHdCQUF3QixFQUF5QixNQUFNLDZDQUE2QyxDQUFDO0FBRTlHLE9BQU8sRUFBRSxPQUFPLEVBQStELE1BQU0sZ0NBQWdDLENBQUM7QUFHdEgsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRWhFLE9BQU8sRUFBRSxpQ0FBaUMsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBRXBHLE1BQU0sb0JBQW9CLEdBQUcsRUFBRSxDQUFDO0FBRWhDLHdHQUF3RztBQUN4RyxNQUFNLENBQUMsTUFBTSxxQ0FBcUMsR0FBRyxFQUFFLENBQUM7QUFFeEQsTUFBTSxDQUFDLE1BQU0saUJBQWlCLEdBQUcsRUFBRSxDQUFDO0FBRXBDLE1BQU0sQ0FBTixJQUFZLG9CQUdYO0FBSEQsV0FBWSxvQkFBb0I7SUFDL0IsdUVBQVEsQ0FBQTtJQUNSLHlFQUFTLENBQUE7QUFDVixDQUFDLEVBSFcsb0JBQW9CLEtBQXBCLG9CQUFvQixRQUcvQjtBQUVELE1BQU0sQ0FBQyxNQUFNLDBCQUEwQixHQUFHLElBQUksQ0FBQztBQVUvQyxNQUFNLE9BQWdCLHdCQUF5QixTQUFRLFVBQVU7SUFJaEUsWUFDaUIscUJBQXlDLEVBQ3pDLHFCQUF3RCxFQUN4RCxRQUlmO1FBRUQsS0FBSyxFQUFFLENBQUM7UUFSUSwwQkFBcUIsR0FBckIscUJBQXFCLENBQW9CO1FBQ3pDLDBCQUFxQixHQUFyQixxQkFBcUIsQ0FBbUM7UUFDeEQsYUFBUSxHQUFSLFFBQVEsQ0FJdkI7UUFWUSx1QkFBa0IsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFzQyxDQUFDLENBQUM7UUFDakcsc0JBQWlCLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEtBQUssQ0FBQztRQWFqRCxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDdkgsQ0FBQztDQUtEO0FBRUQsTUFBTSxPQUFPLCtCQUFnQyxTQUFRLHdCQUF3QjtJQU81RSxZQUNDLHFCQUF5QyxFQUN6QyxxQkFBd0QsRUFDeEQsUUFJQztRQUVELEtBQUssQ0FBQyxxQkFBcUIsRUFBRSxxQkFBcUIsRUFBRSxRQUFRLENBQUMsQ0FBQztRQWZ0RCxTQUFJLEdBQWtCLGFBQWEsQ0FBQztRQUN0QyxnQkFBVyxHQUFtQyxFQUFFLENBQUM7UUFDOUMsdUJBQWtCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBUSxDQUFDLENBQUM7UUFDbkUsd0JBQW1CLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEtBQUssQ0FBQztRQUU3QyxpQkFBWSxHQUFZLEtBQUssQ0FBQztJQVlyQyxDQUFDO0lBQ0QsSUFBSSxXQUFXO1FBQ2QsT0FBTyxFQUFFLEdBQUcsQ0FBQyxDQUFDLEdBQUcsZ0JBQWdCLENBQUMsQ0FBQztJQUNwQyxDQUFDO0lBQ0QsU0FBUyxDQUFDLENBQVM7UUFDbEIsT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDO0lBQ3pCLENBQUM7SUFDUSxZQUFZO1FBQ3BCLEVBQUU7SUFDSCxDQUFDO0lBQ0QsZUFBZTtRQUNkLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUNoQyxDQUFDO0NBQ0Q7QUFHRCxNQUFNLE9BQU8saUNBQWtDLFNBQVEsd0JBQXdCO0lBTTlFLElBQUksWUFBWSxDQUFDLE1BQWM7UUFDOUIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLFlBQVksRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBQ3hDLENBQUM7SUFFRCxJQUFJLFlBQVk7UUFDZixNQUFNLElBQUksS0FBSyxDQUFDLGtDQUFrQyxDQUFDLENBQUM7SUFDckQsQ0FBQztJQUVELElBQUksWUFBWSxDQUFDLE1BQWM7UUFDOUIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLFlBQVksRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBQ3hDLENBQUM7SUFFRCxJQUFJLFlBQVk7UUFDZixNQUFNLElBQUksS0FBSyxDQUFDLGtDQUFrQyxDQUFDLENBQUM7SUFDckQsQ0FBQztJQUNELElBQUksVUFBVTtRQUNiLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQztJQUN6QixDQUFDO0lBRUQsSUFBSSxXQUFXO1FBQ2QsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQztJQUNwQyxDQUFDO0lBR0QsWUFDaUIseUJBQTZDLEVBQzdDLHlCQUE2QyxFQUM3QyxJQUE4QyxFQUM5RCxxQkFBd0QsRUFDeEQsUUFJQyxFQUNELGVBQWlDLEVBQ2hCLHNCQUEwRDtRQUUzRSxLQUFLLENBQUMseUJBQXlCLEVBQUUscUJBQXFCLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFabEQsOEJBQXlCLEdBQXpCLHlCQUF5QixDQUFvQjtRQUM3Qyw4QkFBeUIsR0FBekIseUJBQXlCLENBQW9CO1FBQzdDLFNBQUksR0FBSixJQUFJLENBQTBDO1FBUTdDLDJCQUFzQixHQUF0QixzQkFBc0IsQ0FBb0M7UUFwQ3JFLGlCQUFZLEdBQVksS0FBSyxDQUFDO1FBd0I3QiwyQkFBc0IsR0FBaUYsSUFBSSxDQUFDO1FBZ0JuSCxNQUFNLGdCQUFnQixHQUFHLG9CQUFvQixDQUFDO1FBQzlDLElBQUksQ0FBQyxXQUFXLEdBQUc7WUFDbEIsS0FBSyxFQUFFLENBQUM7WUFDUixZQUFZLEVBQUUsQ0FBQztZQUNmLFlBQVksRUFBRSxDQUFDO1lBQ2YsY0FBYyxFQUFFLENBQUM7WUFDakIsZ0JBQWdCO1lBQ2hCLG9CQUFvQixFQUFFLENBQUM7WUFDdkIsZUFBZSxFQUFFLENBQUM7WUFDbEIsaUJBQWlCLEVBQUUsQ0FBQztZQUNwQixrQkFBa0IsRUFBRSxDQUFDO1lBQ3JCLG9CQUFvQixFQUFFLENBQUM7WUFDdkIsVUFBVSxFQUFFLEVBQUU7WUFDZCxXQUFXLEVBQUUsRUFBRSxHQUFHLGdCQUFnQixHQUFHLENBQUM7WUFDdEMsV0FBVyxFQUFFLGVBQWUsQ0FBQyxhQUFhO1NBQzFDLENBQUM7UUFFRixJQUFJLENBQUMsZ0JBQWdCLEdBQUcsSUFBSSxLQUFLLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLG9CQUFvQixDQUFDLFNBQVMsQ0FBQztRQUNySCxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGlDQUFpQyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQztRQUN6RyxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGlDQUFpQyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQztJQUMxRyxDQUFDO0lBRU0sS0FBSyxDQUFDLGNBQWM7UUFDMUIsSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLG1CQUFtQixFQUFFLENBQUM7WUFDdkMsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLENBQUMsc0JBQXNCLENBQUMsc0JBQXNCLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxZQUFZLEVBQUUsQ0FBQyxDQUFDO1FBQ3pILENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQztZQUMzQyxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxDQUFDO1lBQzNDLElBQUksQ0FBQyxZQUFZLEdBQUcsTUFBTSxJQUFJLENBQUMsc0JBQXNCLENBQUMsb0JBQW9CLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQ2hHLENBQUM7SUFDRixDQUFDO0lBRUQsWUFBWTtRQUNYLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxlQUFlLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUN6QyxDQUFDO0lBRVMsT0FBTyxDQUFDLEtBQXVCO1FBQ3hDLE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxLQUFLLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQztRQUMvRSxNQUFNLFlBQVksR0FBRyxLQUFLLENBQUMsWUFBWSxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxZQUFZLENBQUM7UUFDM0csTUFBTSxZQUFZLEdBQUcsS0FBSyxDQUFDLFlBQVksS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsWUFBWSxDQUFDO1FBQzNHLE1BQU0sZ0JBQWdCLEdBQUcsS0FBSyxDQUFDLGdCQUFnQixLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLGdCQUFnQixDQUFDO1FBQzNILE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyxVQUFVLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQztRQUVuRyxNQUFNLFdBQVcsR0FBRyxZQUFZO2NBQzdCLFlBQVk7Y0FDWixnQkFBZ0I7Y0FDaEIsVUFBVSxDQUFDO1FBRWQsTUFBTSxTQUFTLEdBQTJCO1lBQ3pDLEtBQUssRUFBRSxLQUFLO1lBQ1osWUFBWSxFQUFFLFlBQVk7WUFDMUIsWUFBWSxFQUFFLFlBQVk7WUFDMUIsY0FBYyxFQUFFLENBQUM7WUFDakIsZ0JBQWdCO1lBQ2hCLG9CQUFvQixFQUFFLENBQUM7WUFDdkIsaUJBQWlCLEVBQUUsQ0FBQztZQUNwQixrQkFBa0IsRUFBRSxDQUFDO1lBQ3JCLFVBQVUsRUFBRSxVQUFVO1lBQ3RCLGVBQWUsRUFBRSxDQUFDO1lBQ2xCLG9CQUFvQixFQUFFLENBQUM7WUFDdkIsV0FBVyxFQUFFLFdBQVc7WUFDeEIsV0FBVyxFQUFFLGVBQWUsQ0FBQyxRQUFRO1NBQ3JDLENBQUM7UUFFRixJQUFJLGdCQUFnQixHQUFHLEtBQUssQ0FBQztRQUU3QixNQUFNLFdBQVcsR0FBdUMsRUFBRSxDQUFDO1FBRTNELElBQUksU0FBUyxDQUFDLEtBQUssS0FBSyxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ2hELFdBQVcsQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDO1lBQ3pCLGdCQUFnQixHQUFHLElBQUksQ0FBQztRQUN6QixDQUFDO1FBRUQsSUFBSSxTQUFTLENBQUMsWUFBWSxLQUFLLElBQUksQ0FBQyxXQUFXLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDOUQsV0FBVyxDQUFDLFlBQVksR0FBRyxJQUFJLENBQUM7WUFDaEMsZ0JBQWdCLEdBQUcsSUFBSSxDQUFDO1FBQ3pCLENBQUM7UUFFRCxJQUFJLFNBQVMsQ0FBQyxZQUFZLEtBQUssSUFBSSxDQUFDLFdBQVcsQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUM5RCxXQUFXLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQztZQUNoQyxnQkFBZ0IsR0FBRyxJQUFJLENBQUM7UUFDekIsQ0FBQztRQUVELElBQUksU0FBUyxDQUFDLGdCQUFnQixLQUFLLElBQUksQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztZQUN0RSxXQUFXLENBQUMsZ0JBQWdCLEdBQUcsSUFBSSxDQUFDO1lBQ3BDLGdCQUFnQixHQUFHLElBQUksQ0FBQztRQUN6QixDQUFDO1FBRUQsSUFBSSxTQUFTLENBQUMsVUFBVSxLQUFLLElBQUksQ0FBQyxXQUFXLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDMUQsV0FBVyxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUM7WUFDOUIsZ0JBQWdCLEdBQUcsSUFBSSxDQUFDO1FBQ3pCLENBQUM7UUFFRCxJQUFJLFNBQVMsQ0FBQyxXQUFXLEtBQUssSUFBSSxDQUFDLFdBQVcsQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUM1RCxXQUFXLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQztZQUMvQixnQkFBZ0IsR0FBRyxJQUFJLENBQUM7UUFDekIsQ0FBQztRQUVELElBQUksZ0JBQWdCLEVBQUUsQ0FBQztZQUN0QixJQUFJLENBQUMsV0FBVyxHQUFHLFNBQVMsQ0FBQztZQUM3QixJQUFJLENBQUMsc0JBQXNCLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDMUMsQ0FBQztJQUNGLENBQUM7SUFFRCxTQUFTLENBQUMsVUFBa0I7UUFDM0IsSUFBSSxJQUFJLENBQUMsV0FBVyxDQUFDLFdBQVcsS0FBSyxlQUFlLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDcEUsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixLQUFLLG9CQUFvQixDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDOUgsT0FBTyxJQUFJLENBQUMsbUJBQW1CLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDL0MsQ0FBQzthQUFNLENBQUM7WUFDUCxPQUFPLElBQUksQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDO1FBQ3JDLENBQUM7SUFDRixDQUFDO0lBRU8sbUJBQW1CLENBQUMsWUFBb0I7UUFDL0MsTUFBTSxXQUFXLEdBQUcsWUFBWTtjQUM3QixJQUFJLENBQUMsV0FBVyxDQUFDLFlBQVk7Y0FDN0IsSUFBSSxDQUFDLFdBQVcsQ0FBQyxjQUFjO2NBQy9CLElBQUksQ0FBQyxXQUFXLENBQUMsZ0JBQWdCO2NBQ2pDLElBQUksQ0FBQyxXQUFXLENBQUMsb0JBQW9CO2NBQ3JDLElBQUksQ0FBQyxXQUFXLENBQUMsaUJBQWlCO2NBQ2xDLElBQUksQ0FBQyxXQUFXLENBQUMsa0JBQWtCO2NBQ25DLElBQUksQ0FBQyxXQUFXLENBQUMsb0JBQW9CO2NBQ3JDLElBQUksQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDO1FBRS9CLE9BQU8sV0FBVyxDQUFDO0lBQ3BCLENBQUM7SUFFTSx3QkFBd0IsQ0FBQyxXQUFtQjtRQUNsRCxPQUFPLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsWUFBWSxFQUFFLEVBQUUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxZQUFZLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDdkssQ0FBQztJQUVPLHNCQUFzQixDQUFDLEtBQXlDO1FBQ3ZFLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDcEMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLHlCQUF5QixDQUFDLGlCQUFpQixFQUFFLE1BQU0sRUFBRSxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ3BILENBQUM7SUFFRCw2QkFBNkIsQ0FBQyxVQUE4QixFQUFFLFVBQW1CLEVBQUUsU0FBa0I7UUFDcEcsSUFBSSxTQUFTLEVBQUUsQ0FBQztZQUNmLE9BQU8sVUFBVSxDQUFDLEtBQUssR0FBRyxDQUFDLEdBQUcsZ0JBQWdCLEdBQUcsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLDBCQUEwQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDckgsQ0FBQztRQUVELE9BQU8sQ0FBQyxVQUFVLENBQUMsS0FBSyxHQUFHLENBQUMsR0FBRyxnQkFBZ0IsR0FBRyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsZ0JBQWdCLENBQUMsMEJBQTBCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDaEksQ0FBQztJQUVELHdCQUF3QjtRQUN2QixPQUFPLElBQUksQ0FBQyxzQkFBc0IsQ0FBQztJQUNwQyxDQUFDO0lBRUQseUJBQXlCLENBQUMsU0FBdUY7UUFDaEgsSUFBSSxDQUFDLHNCQUFzQixHQUFHLFNBQVMsQ0FBQztJQUN6QyxDQUFDO0NBQ0Q7QUFHRCxNQUFNLE9BQWdCLDRCQUE2QixTQUFRLHdCQUF3QjtJQVlsRixrQkFBa0I7UUFDakIsSUFBSSxDQUFDLG1CQUFtQixDQUFDLElBQUksRUFBRSxDQUFDO0lBQ2pDLENBQUM7SUFDRCxJQUFJLGVBQWUsQ0FBQyxNQUFjO1FBQ2pDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxlQUFlLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQywwQkFBMEIsRUFBRSxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDakYsQ0FBQztJQUVELElBQUksZUFBZTtRQUNsQixNQUFNLElBQUksS0FBSyxDQUFDLHFDQUFxQyxDQUFDLENBQUM7SUFDeEQsQ0FBQztJQUVELElBQUksa0JBQWtCLENBQUMsTUFBYztRQUNwQyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUM5QyxDQUFDO0lBRUQsSUFBSSxrQkFBa0I7UUFDckIsTUFBTSxJQUFJLEtBQUssQ0FBQyx3Q0FBd0MsQ0FBQyxDQUFDO0lBQzNELENBQUM7SUFFRCxJQUFJLG9CQUFvQixDQUFDLE1BQWM7UUFDdEMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7SUFDaEQsQ0FBQztJQUVELElBQUksb0JBQW9CO1FBQ3ZCLE1BQU0sSUFBSSxLQUFLLENBQUMsd0NBQXdDLENBQUMsQ0FBQztJQUMzRCxDQUFDO0lBRUQsSUFBSSxZQUFZLENBQUMsTUFBYztRQUM5QixJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsWUFBWSxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7SUFDeEMsQ0FBQztJQUVELElBQUksWUFBWTtRQUNmLE1BQU0sSUFBSSxLQUFLLENBQUMsa0NBQWtDLENBQUMsQ0FBQztJQUNyRCxDQUFDO0lBRUQsSUFBSSxZQUFZLENBQUMsTUFBYztRQUM5QixJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsWUFBWSxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7SUFDeEMsQ0FBQztJQUVELElBQUksWUFBWTtRQUNmLE1BQU0sSUFBSSxLQUFLLENBQUMsa0NBQWtDLENBQUMsQ0FBQztJQUNyRCxDQUFDO0lBRUQsSUFBSSxvQkFBb0IsQ0FBQyxNQUFjO1FBQ3RDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBQ2hELENBQUM7SUFFRCxJQUFJLG9CQUFvQjtRQUN2QixNQUFNLElBQUksS0FBSyxDQUFDLHdDQUF3QyxDQUFDLENBQUM7SUFDM0QsQ0FBQztJQUVELElBQUksY0FBYyxDQUFDLE1BQWM7UUFDaEMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLGNBQWMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBQzFDLENBQUM7SUFFRCxJQUFJLGNBQWM7UUFDakIsTUFBTSxJQUFJLEtBQUssQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFDO0lBQ3ZELENBQUM7SUFJRCxJQUFJLFlBQVksQ0FBQyxLQUFjO1FBQzlCLElBQUksQ0FBQyxhQUFhLEdBQUcsS0FBSyxDQUFDO1FBQzNCLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxlQUFlLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUN4QyxJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLEVBQUUsWUFBWSxFQUFFLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQyxDQUFDO0lBQ3JFLENBQUM7SUFFRCxJQUFJLFlBQVk7UUFDZixPQUFPLElBQUksQ0FBQyxhQUFhLENBQUM7SUFDM0IsQ0FBQztJQUVELElBQUksVUFBVTtRQUNiLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQztJQUN6QixDQUFDO0lBRUQsSUFBSSxXQUFXO1FBQ2QsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQztJQUNwQyxDQUFDO0lBRUQsSUFBYyxhQUFhO1FBQzFCLE9BQU8sSUFBSSxDQUFDLG9CQUFvQixDQUFDLFFBQVEsQ0FBVSw2QkFBNkIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxnQkFBZ0IsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO0lBQ3hKLENBQUM7SUFFRCxJQUFjLGNBQWM7UUFDM0IsT0FBTyxJQUFJLENBQUMsb0JBQW9CLENBQUMsUUFBUSxDQUFVLDhCQUE4QixDQUFDLENBQUM7SUFDcEYsQ0FBQztJQVFELFlBQ0MscUJBQXlDLEVBQ3pDLFFBQTJDLEVBQzNDLFFBQTJDLEVBQ2xDLElBQW9ELEVBQzdELHFCQUF3RCxFQUN4RCxRQUlDLEVBQ0QsZUFBaUMsRUFDakIsS0FBYSxFQUNaLG9CQUEyQyxFQUM1QywwQkFBOEQ7UUFFOUUsS0FBSyxDQUFDLHFCQUFxQixFQUFFLHFCQUFxQixFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBWnJELFNBQUksR0FBSixJQUFJLENBQWdEO1FBUTdDLFVBQUssR0FBTCxLQUFLLENBQVE7UUFDWix5QkFBb0IsR0FBcEIsb0JBQW9CLENBQXVCO1FBQzVDLCtCQUEwQixHQUExQiwwQkFBMEIsQ0FBb0M7UUFuSHJFLHdCQUFtQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQTZCLENBQUMsQ0FBQztRQUN6RixxQkFBZ0IsR0FBRyxJQUFJLENBQUMsbUJBQW1CLENBQUMsS0FBSyxDQUFDO1FBSTFDLHdCQUFtQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQVEsQ0FBQyxDQUFDO1FBQzNELHlCQUFvQixHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLENBQUM7UUE2RHJELGtCQUFhLEdBQUcsSUFBSSxDQUFDO1FBNEJyQiwyQkFBc0IsR0FBaUYsSUFBSSxDQUFDO1FBQzVHLDJCQUFzQixHQUFpRixJQUFJLENBQUM7UUFDNUcsNkJBQXdCLEdBQWlGLElBQUksQ0FBQztRQXFCckgsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSx1QkFBdUIsQ0FBQyxRQUFRLEVBQUUsZUFBZSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO1FBQzlHLElBQUksQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksdUJBQXVCLENBQUMsUUFBUSxFQUFFLGVBQWUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUM5RyxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ25FLE1BQU0sZ0JBQWdCLEdBQUcsb0JBQW9CLENBQUM7UUFDOUMsSUFBSSxDQUFDLFdBQVcsR0FBRztZQUNsQixLQUFLLEVBQUUsQ0FBQztZQUNSLFlBQVksRUFBRSxZQUFZO1lBQzFCLFlBQVksRUFBRSxDQUFDO1lBQ2YsY0FBYyxFQUFFLENBQUM7WUFDakIsZ0JBQWdCO1lBQ2hCLG9CQUFvQixFQUFFLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsb0JBQW9CO1lBQ3BFLGVBQWUsRUFBRSxDQUFDO1lBQ2xCLGlCQUFpQixFQUFFLENBQUM7WUFDcEIsa0JBQWtCLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxvQkFBb0I7WUFDakUsb0JBQW9CLEVBQUUsQ0FBQztZQUN2QixVQUFVLEVBQUUsRUFBRTtZQUNkLFdBQVcsRUFBRSxFQUFFLEdBQUcsZ0JBQWdCLEdBQUcsWUFBWTtZQUNqRCxXQUFXLEVBQUUsZUFBZSxDQUFDLGFBQWE7U0FDMUMsQ0FBQztRQUVGLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxRQUFRLEVBQUUsaUJBQWlCLEVBQUUsS0FBSyxRQUFRLEVBQUUsaUJBQWlCLEVBQUUsQ0FBQyxDQUFDLENBQUMsb0JBQW9CLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQyxTQUFTLENBQUM7UUFDekosSUFBSSxDQUFDLG9CQUFvQixHQUFHLG9CQUFvQixDQUFDLFNBQVMsQ0FBQztRQUMzRCxJQUFJLENBQUMsa0JBQWtCLEdBQUcsb0JBQW9CLENBQUMsU0FBUyxDQUFDO0lBQzFELENBQUM7SUFFRCxZQUFZO1FBQ1gsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLGVBQWUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0lBQ3pDLENBQUM7SUFFTyxxQkFBcUIsQ0FBQyxRQUE4QjtRQUMzRCxNQUFNLFVBQVUsR0FBRyxRQUFRLEVBQUUsVUFBVSxJQUFJLEVBQUUsQ0FBQztRQUU5QyxRQUFRLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNuQixLQUFLLFdBQVcsQ0FBQztZQUNqQixLQUFLLFFBQVE7Z0JBQ1osQ0FBQztvQkFDQSxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsUUFBUyxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsWUFBWSxFQUFFLENBQUM7b0JBQ3JFLE1BQU0sWUFBWSxHQUFHLFNBQVMsR0FBRyxVQUFVLEdBQUcsZ0JBQWdCLENBQUMsU0FBUyxDQUFDLENBQUMsR0FBRyxHQUFHLGdCQUFnQixDQUFDLFNBQVMsQ0FBQyxDQUFDLE1BQU0sQ0FBQztvQkFDbkgsT0FBTyxZQUFZLENBQUM7Z0JBQ3JCLENBQUM7WUFDRixLQUFLLFFBQVEsQ0FBQztZQUNkLEtBQUssVUFBVTtnQkFDZCxDQUFDO29CQUNBLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxRQUFTLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxZQUFZLEVBQUUsQ0FBQztvQkFDckUsTUFBTSxZQUFZLEdBQUcsU0FBUyxHQUFHLFVBQVUsR0FBRyxnQkFBZ0IsQ0FBQyxTQUFTLENBQUMsQ0FBQyxHQUFHLEdBQUcsZ0JBQWdCLENBQUMsU0FBUyxDQUFDLENBQUMsTUFBTSxDQUFDO29CQUNuSCxPQUFPLFlBQVksQ0FBQztnQkFDckIsQ0FBQztRQUNILENBQUM7SUFDRixDQUFDO0lBRVMsT0FBTyxDQUFDLEtBQXVCO1FBQ3hDLE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxLQUFLLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQztRQUMvRSxNQUFNLFlBQVksR0FBRyxLQUFLLENBQUMsWUFBWSxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxZQUFZLENBQUM7UUFDM0csTUFBTSxZQUFZLEdBQUcsS0FBSyxDQUFDLFlBQVksS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsWUFBWSxDQUFDO1FBQzNHLE1BQU0sY0FBYyxHQUFHLEtBQUssQ0FBQyxjQUFjLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLGNBQWMsQ0FBQztRQUNuSCxNQUFNLGdCQUFnQixHQUFHLEtBQUssQ0FBQyxnQkFBZ0IsS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQztRQUMzSCxNQUFNLG9CQUFvQixHQUFHLEtBQUssQ0FBQyxvQkFBb0IsS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxvQkFBb0IsQ0FBQztRQUMzSSxNQUFNLGVBQWUsR0FBRyxLQUFLLENBQUMsZUFBZSxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxlQUFlLENBQUM7UUFDdkgsTUFBTSxrQkFBa0IsR0FBRyxLQUFLLENBQUMsa0JBQWtCLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUM7UUFDbkksTUFBTSxVQUFVLEdBQUcsS0FBSyxDQUFDLFVBQVUsS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDO1FBQ25HLE1BQU0sb0JBQW9CLEdBQUcsS0FBSyxDQUFDLG9CQUFvQixLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLG9CQUFvQixDQUFDO1FBQzNJLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsZUFBZSxJQUFJLEtBQUssQ0FBQyxlQUFlLEtBQUssU0FBUyxJQUFJLEtBQUssQ0FBQyxvQkFBb0IsS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLGVBQWUsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDO1FBRWxRLE1BQU0sV0FBVyxHQUFHLFlBQVk7Y0FDN0IsWUFBWTtjQUNaLGdCQUFnQjtjQUNoQixjQUFjO2NBQ2Qsb0JBQW9CO2NBQ3BCLFlBQVk7Y0FDWixrQkFBa0I7Y0FDbEIsVUFBVSxDQUFDO1FBRWQsTUFBTSxTQUFTLEdBQTJCO1lBQ3pDLEtBQUssRUFBRSxLQUFLO1lBQ1osWUFBWSxFQUFFLFlBQVk7WUFDMUIsWUFBWSxFQUFFLFlBQVk7WUFDMUIsY0FBYyxFQUFFLGNBQWM7WUFDOUIsZ0JBQWdCO1lBQ2hCLG9CQUFvQixFQUFFLG9CQUFvQjtZQUMxQyxpQkFBaUIsRUFBRSxZQUFZO1lBQy9CLGtCQUFrQixFQUFFLGtCQUFrQjtZQUN0QyxVQUFVLEVBQUUsVUFBVTtZQUN0QixlQUFlLEVBQUUsZUFBZTtZQUNoQyxvQkFBb0IsRUFBRSxvQkFBb0I7WUFDMUMsV0FBVyxFQUFFLFdBQVc7WUFDeEIsV0FBVyxFQUFFLGVBQWUsQ0FBQyxRQUFRO1NBQ3JDLENBQUM7UUFFRixJQUFJLGdCQUFnQixHQUFHLEtBQUssQ0FBQztRQUU3QixNQUFNLFdBQVcsR0FBdUMsRUFBRSxDQUFDO1FBRTNELElBQUksU0FBUyxDQUFDLEtBQUssS0FBSyxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ2hELFdBQVcsQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDO1lBQ3pCLGdCQUFnQixHQUFHLElBQUksQ0FBQztRQUN6QixDQUFDO1FBRUQsSUFBSSxTQUFTLENBQUMsWUFBWSxLQUFLLElBQUksQ0FBQyxXQUFXLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDOUQsV0FBVyxDQUFDLFlBQVksR0FBRyxJQUFJLENBQUM7WUFDaEMsZ0JBQWdCLEdBQUcsSUFBSSxDQUFDO1FBQ3pCLENBQUM7UUFFRCxJQUFJLFNBQVMsQ0FBQyxZQUFZLEtBQUssSUFBSSxDQUFDLFdBQVcsQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUM5RCxXQUFXLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQztZQUNoQyxnQkFBZ0IsR0FBRyxJQUFJLENBQUM7UUFDekIsQ0FBQztRQUVELElBQUksU0FBUyxDQUFDLGNBQWMsS0FBSyxJQUFJLENBQUMsV0FBVyxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQ2xFLFdBQVcsQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDO1lBQ2xDLGdCQUFnQixHQUFHLElBQUksQ0FBQztRQUN6QixDQUFDO1FBRUQsSUFBSSxTQUFTLENBQUMsZ0JBQWdCLEtBQUssSUFBSSxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1lBQ3RFLFdBQVcsQ0FBQyxnQkFBZ0IsR0FBRyxJQUFJLENBQUM7WUFDcEMsZ0JBQWdCLEdBQUcsSUFBSSxDQUFDO1FBQ3pCLENBQUM7UUFFRCxJQUFJLFNBQVMsQ0FBQyxvQkFBb0IsS0FBSyxJQUFJLENBQUMsV0FBVyxDQUFDLG9CQUFvQixFQUFFLENBQUM7WUFDOUUsV0FBVyxDQUFDLG9CQUFvQixHQUFHLElBQUksQ0FBQztZQUN4QyxnQkFBZ0IsR0FBRyxJQUFJLENBQUM7UUFDekIsQ0FBQztRQUVELElBQUksU0FBUyxDQUFDLGlCQUFpQixLQUFLLElBQUksQ0FBQyxXQUFXLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztZQUN4RSxXQUFXLENBQUMsaUJBQWlCLEdBQUcsSUFBSSxDQUFDO1lBQ3JDLGdCQUFnQixHQUFHLElBQUksQ0FBQztRQUN6QixDQUFDO1FBRUQsSUFBSSxTQUFTLENBQUMsa0JBQWtCLEtBQUssSUFBSSxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1lBQzFFLFdBQVcsQ0FBQyxrQkFBa0IsR0FBRyxJQUFJLENBQUM7WUFDdEMsZ0JBQWdCLEdBQUcsSUFBSSxDQUFDO1FBQ3pCLENBQUM7UUFFRCxJQUFJLFNBQVMsQ0FBQyxVQUFVLEtBQUssSUFBSSxDQUFDLFdBQVcsQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUMxRCxXQUFXLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQztZQUM5QixnQkFBZ0IsR0FBRyxJQUFJLENBQUM7UUFDekIsQ0FBQztRQUVELElBQUksU0FBUyxDQUFDLG9CQUFvQixLQUFLLElBQUksQ0FBQyxXQUFXLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztZQUM5RSxXQUFXLENBQUMsb0JBQW9CLEdBQUcsSUFBSSxDQUFDO1lBQ3hDLGdCQUFnQixHQUFHLElBQUksQ0FBQztRQUN6QixDQUFDO1FBRUQsSUFBSSxTQUFTLENBQUMsV0FBVyxLQUFLLElBQUksQ0FBQyxXQUFXLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDNUQsV0FBVyxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUM7WUFDL0IsZ0JBQWdCLEdBQUcsSUFBSSxDQUFDO1FBQ3pCLENBQUM7UUFFRCxJQUFJLGdCQUFnQixFQUFFLENBQUM7WUFDdEIsSUFBSSxDQUFDLFdBQVcsR0FBRyxTQUFTLENBQUM7WUFDN0IsSUFBSSxDQUFDLHNCQUFzQixDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQzFDLENBQUM7SUFDRixDQUFDO0lBRUQsU0FBUyxDQUFDLFVBQWtCO1FBQzNCLElBQUksSUFBSSxDQUFDLFdBQVcsQ0FBQyxXQUFXLEtBQUssZUFBZSxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQ3BFLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsS0FBSyxvQkFBb0IsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLHdCQUF3QixDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQzlILE9BQU8sSUFBSSxDQUFDLG1CQUFtQixDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQy9DLENBQUM7YUFBTSxDQUFDO1lBQ1AsT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQztRQUNyQyxDQUFDO0lBQ0YsQ0FBQztJQUVPLG1CQUFtQixDQUFDLFlBQW9CO1FBQy9DLE1BQU0sV0FBVyxHQUFHLFlBQVk7Y0FDN0IsSUFBSSxDQUFDLFdBQVcsQ0FBQyxZQUFZO2NBQzdCLElBQUksQ0FBQyxXQUFXLENBQUMsY0FBYztjQUMvQixJQUFJLENBQUMsV0FBVyxDQUFDLGdCQUFnQjtjQUNqQyxJQUFJLENBQUMsV0FBVyxDQUFDLG9CQUFvQjtjQUNyQyxJQUFJLENBQUMsV0FBVyxDQUFDLGlCQUFpQjtjQUNsQyxJQUFJLENBQUMsV0FBVyxDQUFDLGtCQUFrQjtjQUNuQyxJQUFJLENBQUMsV0FBVyxDQUFDLG9CQUFvQjtjQUNyQyxJQUFJLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQztRQUUvQixPQUFPLFdBQVcsQ0FBQztJQUNwQixDQUFDO0lBRU0sd0JBQXdCLENBQUMsVUFBa0I7UUFDakQsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLFNBQVMsQ0FBQyxVQUFVLENBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyxFQUFFLElBQUksQ0FBQyxRQUFRLEVBQUUsU0FBUyxDQUFDLFVBQVUsQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUM3SSxPQUFPLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxzQkFBc0IsQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUMxRSxDQUFDO0lBRU8scUJBQXFCLENBQUMsZUFBdUIsRUFBRSxjQUFzQjtRQUM1RSxJQUFJLElBQUksQ0FBQyxrQkFBa0IsS0FBSyxvQkFBb0IsQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNoRSxPQUFPLENBQUMsQ0FBQztRQUNWLENBQUM7UUFFRCxJQUFJLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUN2QixJQUFJLElBQUksQ0FBQyxhQUFhLEVBQUUsRUFBRSxDQUFDO2dCQUMxQixlQUFlO2dCQUNmLE9BQU8sRUFBRSxDQUFDO1lBQ1gsQ0FBQztZQUNELE9BQU8sSUFBSSxDQUFDLHdCQUF3QixFQUFFLEdBQUcsY0FBYyxDQUFDO1FBQ3pELENBQUM7YUFBTSxDQUFDO1lBQ1AsT0FBTyxlQUFlLENBQUM7UUFDeEIsQ0FBQztJQUNGLENBQUM7SUFFTyxzQkFBc0IsQ0FBQyxLQUF5QztRQUN2RSxJQUFJLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3BDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSx5QkFBeUIsQ0FBQyxpQkFBaUIsRUFBRSxNQUFNLEVBQUUsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUNwSCxDQUFDO0lBYUQsNkJBQTZCLENBQUMsVUFBOEIsRUFBRSxVQUFtQixFQUFFLFNBQWtCO1FBQ3BHLElBQUksU0FBUyxFQUFFLENBQUM7WUFDZixPQUFPLFVBQVUsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxHQUFHLGdCQUFnQixHQUFHLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3JILENBQUM7UUFFRCxPQUFPLENBQUMsVUFBVSxDQUFDLEtBQUssR0FBRyxDQUFDLEdBQUcsZ0JBQWdCLEdBQUcsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLDBCQUEwQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQ2hJLENBQUM7SUFFRCx3QkFBd0I7UUFDdkIsT0FBTyxJQUFJLENBQUMsc0JBQXNCLENBQUM7SUFDcEMsQ0FBQztJQUVELHlCQUF5QixDQUFDLFNBQXVGO1FBQ2hILElBQUksQ0FBQyxzQkFBc0IsR0FBRyxTQUFTLENBQUM7SUFDekMsQ0FBQztJQUVELDBCQUEwQjtRQUN6QixPQUFPLElBQUksQ0FBQyx3QkFBd0IsQ0FBQztJQUN0QyxDQUFDO0lBRUQsMkJBQTJCLENBQUMsU0FBdUY7UUFDbEgsSUFBSSxDQUFDLHdCQUF3QixHQUFHLFNBQVMsQ0FBQztJQUMzQyxDQUFDO0lBRUQsd0JBQXdCO1FBQ3ZCLE9BQU8sSUFBSSxDQUFDLHNCQUFzQixDQUFDO0lBQ3BDLENBQUM7SUFFRCx5QkFBeUIsQ0FBQyxTQUF1RjtRQUNoSCxJQUFJLENBQUMsc0JBQXNCLEdBQUcsU0FBUyxDQUFDO0lBQ3pDLENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTyw4QkFBK0IsU0FBUSw0QkFBNEI7SUFDL0UsSUFBSSxnQkFBZ0I7UUFDbkIsT0FBTyxJQUFJLENBQUMsc0JBQXNCLENBQUM7SUFDcEMsQ0FBQztJQUVELElBQUksZ0JBQWdCO1FBQ25CLE9BQU8sSUFBSSxDQUFDLHFCQUFxQixDQUFDO0lBQ25DLENBQUM7SUFVRCxZQUNDLHFCQUF3QyxFQUMvQixzQkFBeUMsRUFDbEQsUUFBK0IsRUFDL0IsUUFBK0IsRUFDL0IsSUFBOEIsRUFDOUIscUJBQXdELEVBQ3hELFFBSUMsRUFDRCxlQUFpQyxFQUNqQyxvQkFBMkMsRUFDM0MsS0FBYSxFQUNiLDBCQUE4RDtRQUU5RCxLQUFLLENBQ0oscUJBQXFCLEVBQ3JCLFFBQVEsRUFDUixRQUFRLEVBQ1IsSUFBSSxFQUNKLHFCQUFxQixFQUNyQixRQUFRLEVBQ1IsZUFBZSxFQUNmLEtBQUssRUFDTCxvQkFBb0IsRUFDcEIsMEJBQTBCLENBQUMsQ0FBQztRQXpCcEIsMkJBQXNCLEdBQXRCLHNCQUFzQixDQUFtQjtRQTJCbEQsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFFakIsSUFBSSxDQUFDLGdCQUFnQixHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBRSxLQUFLLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLG9CQUFvQixDQUFDLFNBQVMsQ0FBQztRQUNuSyxJQUFJLENBQUMsb0JBQW9CLEdBQUcsb0JBQW9CLENBQUMsU0FBUyxDQUFDO1FBQzNELElBQUksQ0FBQyxrQkFBa0IsR0FBRyxvQkFBb0IsQ0FBQyxTQUFTLENBQUM7UUFFekQsSUFBSSxJQUFJLENBQUMsdUJBQXVCLEVBQUUsRUFBRSxDQUFDO1lBQ3BDLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxvQkFBb0IsQ0FBQyxRQUFRLENBQUM7UUFDM0QsQ0FBQztRQUVELElBQUksSUFBSSxDQUFDLHNCQUFzQixFQUFFLEVBQUUsQ0FBQztZQUNuQyxJQUFJLENBQUMsa0JBQWtCLEdBQUcsb0JBQW9CLENBQUMsUUFBUSxDQUFDO1FBQ3pELENBQUM7UUFFRCxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsdUJBQXVCLENBQUMsR0FBRyxFQUFFO1lBQ3pELElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxlQUFlLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUN6QyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLHVCQUF1QixDQUFDLEdBQUcsRUFBRTtZQUN6RCxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsZUFBZSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7UUFDekMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFO1lBQzlELElBQUkscUJBQXFCLENBQUMsZ0JBQWdCLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztnQkFDaEUsTUFBTSxnQkFBZ0IsR0FBRyxDQUFDLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxnQkFBZ0IsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUM7Z0JBQ3RHLE1BQU0saUJBQWlCLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxFQUFFLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDcEUsTUFBTSxvQkFBb0IsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQztnQkFDcEQsS0FBSyxNQUFNLEdBQUcsSUFBSSxnQkFBZ0IsRUFBRSxDQUFDO29CQUNwQyxJQUFJLE1BQU0sQ0FBQyxNQUFNLENBQUMsb0JBQW9CLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQzt3QkFDOUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLEdBQUcsb0JBQW9CLENBQUMsR0FBRyxDQUFDLENBQUM7b0JBQ3BELENBQUM7Z0JBQ0YsQ0FBQztnQkFFRCxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxRQUFRLEdBQUcsaUJBQWlCLENBQUM7WUFDdEQsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRVEsb0JBQW9CO1FBQzVCLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsaUJBQWlCLEVBQUUsS0FBSyxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxpQkFBaUIsRUFBRSxFQUFFLENBQUM7WUFDakcsT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO1FBQ0QsT0FBTztZQUNOLE1BQU0sRUFBRSwwQkFBMEI7U0FDbEMsQ0FBQztJQUNILENBQUM7SUFDRCxzQkFBc0I7UUFDckIsSUFBSSxJQUFJLENBQUMscUJBQXFCLENBQUMsZ0JBQWdCLENBQUMsZ0JBQWdCLElBQUksSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQ3hGLE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUVELE1BQU0sR0FBRyxHQUFHLFlBQVksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLE9BQU8sSUFBSSxFQUFFLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBRSxPQUFPLElBQUksRUFBRSxDQUFDLENBQUM7UUFFckYsSUFBSSxHQUFHLHVDQUErQixFQUFFLENBQUM7WUFDeEMsT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO1FBRUQsT0FBTztZQUNOLE1BQU0sRUFBRSxHQUFHLHNDQUE4QixDQUFDLENBQUMsQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDLENBQUMsU0FBUztZQUNyRixJQUFJLEVBQUUsR0FBRztTQUNULENBQUM7SUFDSCxDQUFDO0lBRUQsdUJBQXVCO1FBQ3RCLElBQUksSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQ3pCLE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUNELE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLENBQUMscUJBQXFCLENBQUMsZ0JBQWdCLENBQUMscUJBQXFCLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBRSxRQUFRLElBQUksRUFBRSxFQUFFLElBQUksQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUMsS0FBSyxJQUFJLENBQUMsd0JBQXdCLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLGdCQUFnQixDQUFDLHFCQUFxQixFQUFFLElBQUksQ0FBQyxRQUFRLEVBQUUsUUFBUSxJQUFJLEVBQUUsRUFBRSxJQUFJLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUM7UUFDelUsSUFBSSxRQUFRLEVBQUUsQ0FBQztZQUNkLE9BQU8sRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLENBQUM7UUFDOUIsQ0FBQzthQUFNLENBQUM7WUFDUCxPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7SUFDRixDQUFDO0lBRUQsa0JBQWtCLENBQUMsUUFBa0IsRUFBRSxLQUFhLEVBQUUsTUFBYztRQUNuRSxJQUFJLFFBQVEsS0FBSyxRQUFRLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDcEMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDakQsQ0FBQzthQUFNLENBQUM7WUFDUCxJQUFJLENBQUMsUUFBUSxDQUFDLGtCQUFrQixDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQztRQUNqRCxDQUFDO0lBQ0YsQ0FBQztJQUVELDBCQUEwQixDQUFDLFFBQWtCLEVBQUUsS0FBYTtRQUMzRCxJQUFJLFFBQVEsS0FBSyxRQUFRLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDcEMsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUM3QyxDQUFDO2FBQU0sQ0FBQztZQUNQLE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDN0MsQ0FBQztJQUNGLENBQUM7SUFFRCxxQkFBcUIsQ0FBQyxRQUFrQixFQUFFLEtBQWE7UUFDdEQsTUFBTSx3QkFBd0IsR0FBRyxJQUFJLENBQUMsMEJBQTBCLENBQUMsUUFBUSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRWxGLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxZQUFZO2NBQ2pDLElBQUksQ0FBQyxXQUFXLENBQUMsWUFBWTtjQUM3QixJQUFJLENBQUMsV0FBVyxDQUFDLGNBQWM7Y0FDL0IsSUFBSSxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0I7Y0FDakMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxvQkFBb0I7Y0FDckMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxrQkFBa0I7Y0FDbkMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxVQUFVLEdBQUcsQ0FBQztjQUMvQix3QkFBd0IsQ0FBQztJQUM3QixDQUFDO0lBRUQsYUFBYTtRQUNaLElBQUksSUFBSSxDQUFDLHFCQUFxQixDQUFDLGdCQUFnQixDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFDbEUsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBRUQsSUFBSSxJQUFJLENBQUMsc0JBQXNCLEVBQUUsRUFBRSxDQUFDO1lBQ25DLE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUVELDBCQUEwQjtRQUUxQixPQUFPLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxPQUFPLElBQUksRUFBRSxDQUFDLENBQUMsTUFBTSxLQUFLLENBQUMsQ0FBQztJQUNwRCxDQUFDO0lBRUQsd0JBQXdCO1FBQ3ZCLE9BQU8sSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLG9CQUFvQixFQUFFLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDLENBQUM7SUFDN0YsQ0FBQztJQUVELHNCQUFzQixDQUFDLFFBQWtCO1FBQ3hDLE9BQU8sUUFBUSxLQUFLLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUM7SUFDdkUsQ0FBQztJQUVELFlBQVksQ0FBQyxPQUFZO1FBQ3hCLElBQUksT0FBTyxDQUFDLFFBQVEsRUFBRSxLQUFLLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUM7WUFDekQsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDO1FBQ3RCLENBQUM7YUFBTSxDQUFDO1lBQ1AsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDO1FBQ3RCLENBQUM7SUFDRixDQUFDO0lBRWUsd0JBQXdCLENBQUMsVUFBa0I7UUFDMUQsSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLFVBQVU7WUFDM0IsT0FBTyxJQUFJLENBQUMsdUNBQXVDLEtBQUssUUFBUTtZQUNoRSxJQUFJLENBQUMsb0JBQW9CLEVBQUUsRUFBRSxDQUFDO1lBQzlCLE9BQU8sSUFBSSxDQUFDLHVDQUF1QyxDQUFDO1FBQ3JELENBQUM7UUFFRCxPQUFPLEtBQUssQ0FBQyx3QkFBd0IsQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUNuRCxDQUFDO0lBRU8sS0FBSyxDQUFDLGdDQUFnQztRQUM3QyxJQUFJLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxFQUFFLENBQUM7WUFDakMsSUFBSSxDQUFDLHVDQUF1QyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsWUFBWSxHQUFHLE1BQU0sSUFBSSxDQUFDLDBCQUEwQixDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDakwsQ0FBQztJQUNGLENBQUM7SUFFTyxLQUFLLENBQUMsbUNBQW1DO1FBQ2hELElBQUksSUFBSSxDQUFDLHVCQUF1QixFQUFFLEVBQUUsQ0FBQztZQUNwQyxNQUFNLG1CQUFtQixHQUFHLE9BQU8sQ0FBQyx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1lBQ2pKLE1BQU0sbUJBQW1CLEdBQUcsT0FBTyxDQUFDLHVCQUF1QixDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsT0FBTyxDQUFDLDBCQUEwQixDQUFDLENBQUM7WUFDakosSUFBSSxDQUFDLFdBQVcsQ0FBQyxjQUFjLEdBQUcsTUFBTSxJQUFJLENBQUMsMEJBQTBCLENBQUMsb0JBQW9CLENBQUMsbUJBQW1CLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztRQUN4SSxDQUFDO0lBQ0YsQ0FBQztJQUVNLEtBQUssQ0FBQyxvQkFBb0I7UUFDaEMsSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLFdBQVcsRUFBRSxDQUFDO1lBQy9CLE9BQU87UUFDUixDQUFDO1FBRUQsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLGdDQUFnQyxFQUFFLEVBQUUsSUFBSSxDQUFDLG1DQUFtQyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQzFHLENBQUM7Q0FFRDtBQUVELE1BQU0sT0FBTyw4QkFBK0IsU0FBUSw0QkFBNEI7SUFDL0UsSUFBSSxhQUFhO1FBQ2hCLE9BQU8sSUFBSSxDQUFDLElBQUksS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFTLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFTLENBQUM7SUFDakUsQ0FBQztJQUVELElBQUksZ0JBQWdCO1FBQ25CLElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUM1QixPQUFPLElBQUksQ0FBQyxzQkFBc0IsQ0FBQztRQUNwQyxDQUFDO2FBQU0sQ0FBQztZQUNQLE9BQU8sSUFBSSxDQUFDLHFCQUFxQixDQUFDO1FBQ25DLENBQUM7SUFDRixDQUFDO0lBRUQsSUFBSSxnQkFBZ0I7UUFDbkIsSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQzVCLE9BQU8sSUFBSSxDQUFDLHFCQUFxQixDQUFDO1FBQ25DLENBQUM7YUFBTSxDQUFDO1lBQ1AsT0FBTyxJQUFJLENBQUMsc0JBQXNCLENBQUM7UUFDcEMsQ0FBQztJQUNGLENBQUM7SUFJRCxZQUNDLHFCQUF3QyxFQUMvQixzQkFBeUMsRUFDbEQsUUFBMkMsRUFDM0MsUUFBMkMsRUFDM0MsSUFBeUIsRUFDekIscUJBQXdELEVBQ3hELFFBSUMsRUFDRCxlQUFpQyxFQUNqQyxvQkFBMkMsRUFDM0MsMEJBQThELEVBQzlELEtBQWE7UUFFYixLQUFLLENBQUMscUJBQXFCLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUscUJBQXFCLEVBQUUsUUFBUSxFQUFFLGVBQWUsRUFBRSxLQUFLLEVBQUUsb0JBQW9CLEVBQUUsMEJBQTBCLENBQUMsQ0FBQztRQWZ6SiwyQkFBc0IsR0FBdEIsc0JBQXNCLENBQW1CO1FBZ0JsRCxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUVqQixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsdUJBQXVCLENBQUMsR0FBRyxFQUFFO1lBQzlELElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxlQUFlLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUN6QyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVRLG9CQUFvQjtRQUM1QixPQUFPO1lBQ04sTUFBTSxFQUFFLDBCQUEwQjtTQUNsQyxDQUFDO0lBQ0gsQ0FBQztJQUVELHNCQUFzQixDQUFDLFFBQWtCO1FBQ3hDLE9BQU8sSUFBSSxDQUFDLElBQUksS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFTLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFTLENBQUM7SUFDakUsQ0FBQztJQUdELHNCQUFzQjtRQUNyQixPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFFRCx1QkFBdUI7UUFDdEIsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBRUQsa0JBQWtCLENBQUMsUUFBa0IsRUFBRSxLQUFhLEVBQUUsTUFBYztRQUNuRSxJQUFJLENBQUMsYUFBYSxFQUFFLGtCQUFrQixDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQztJQUN2RCxDQUFDO0lBRUQsMEJBQTBCLENBQUMsUUFBa0IsRUFBRSxLQUFhO1FBQzNELE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDbEQsQ0FBQztJQUVELHFCQUFxQixDQUFDLFFBQWtCLEVBQUUsS0FBYTtRQUN0RCxNQUFNLHdCQUF3QixHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRTNFLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxZQUFZO2NBQ2pDLElBQUksQ0FBQyxXQUFXLENBQUMsWUFBWTtjQUM3QixJQUFJLENBQUMsV0FBVyxDQUFDLGNBQWM7Y0FDL0IsSUFBSSxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0I7Y0FDakMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxvQkFBb0I7Y0FDckMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxrQkFBa0I7Y0FDbkMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxVQUFVLEdBQUcsQ0FBQztjQUMvQix3QkFBd0IsQ0FBQztJQUM3QixDQUFDO0lBRUQsYUFBYTtRQUNaLElBQUksSUFBSSxDQUFDLHFCQUFxQixDQUFDLGdCQUFnQixDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFDbEUsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBRUQsMEJBQTBCO1FBRTFCLE9BQU8sQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLE9BQU8sSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFLE9BQU8sSUFBSSxFQUFFLENBQUMsQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDO0lBQzlFLENBQUM7SUFFRCx3QkFBd0I7UUFDdkIsT0FBTyxJQUFJLENBQUMsYUFBYSxFQUFFLG9CQUFvQixFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ3hELENBQUM7SUFFRCxZQUFZLENBQUMsT0FBWTtRQUN4QixPQUFPLElBQUksQ0FBQyxhQUFhLENBQUM7SUFDM0IsQ0FBQztDQUNEO0FBRUQsTUFBTSxDQUFOLElBQWtCLGdCQUlqQjtBQUpELFdBQWtCLGdCQUFnQjtJQUNqQyxpRUFBYSxDQUFBO0lBQ2IsK0RBQVksQ0FBQTtJQUNaLHlEQUFTLENBQUE7QUFDVixDQUFDLEVBSmlCLGdCQUFnQixLQUFoQixnQkFBZ0IsUUFJakM7QUFFRCxNQUFNLFVBQVUsV0FBVyxDQUFDLENBQWMsRUFBRSxDQUFjO0lBQ3pELElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7UUFDM0Msc0NBQThCO0lBQy9CLENBQUM7SUFFRCxxQkFBcUI7SUFDckIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDM0MsTUFBTSxXQUFXLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNqQyxNQUFNLFdBQVcsR0FBRyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRWpDLElBQUksV0FBVyxDQUFDLElBQUksS0FBSyxXQUFXLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDM0Msc0NBQThCO1FBQy9CLENBQUM7UUFFRCxJQUFJLFdBQVcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sS0FBSyxXQUFXLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUN2RSxzQ0FBOEI7UUFDL0IsQ0FBQztRQUVELEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxXQUFXLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUN6RCxJQUFJLFdBQVcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxLQUFLLFdBQVcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7Z0JBQy9ELHNDQUE4QjtZQUMvQixDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFRCx5Q0FBaUM7QUFDbEMsQ0FBQztBQUVELFNBQVMsWUFBWSxDQUFDLFFBQXVCLEVBQUUsUUFBdUI7SUFDckUsSUFBSSxRQUFRLENBQUMsTUFBTSxLQUFLLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUN6QyxzQ0FBOEI7SUFDL0IsQ0FBQztJQUVELE1BQU0sR0FBRyxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUM7SUFDNUIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQzlCLE1BQU0sQ0FBQyxHQUFHLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN0QixNQUFNLENBQUMsR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFdEIsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztZQUMzQyx5Q0FBaUM7UUFDbEMsQ0FBQztRQUVELElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUMzQyxzQ0FBOEI7UUFDL0IsQ0FBQztRQUVELEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQzNDLE1BQU0sV0FBVyxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDakMsTUFBTSxXQUFXLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUVqQyxJQUFJLFdBQVcsQ0FBQyxJQUFJLEtBQUssV0FBVyxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUMzQyxzQ0FBOEI7WUFDL0IsQ0FBQztZQUVELElBQUksV0FBVyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxLQUFLLFdBQVcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDO2dCQUN2RSxzQ0FBOEI7WUFDL0IsQ0FBQztZQUVELEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxXQUFXLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztnQkFDekQsSUFBSSxXQUFXLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsS0FBSyxXQUFXLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO29CQUMvRCxzQ0FBOEI7Z0JBQy9CLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFRCwwQ0FBa0M7QUFDbkMsQ0FBQztBQUVELE1BQU0sVUFBVSxtQkFBbUIsQ0FBQyxPQUF5QjtJQUM1RCxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ3JCLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVELE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN6QixNQUFNLElBQUksR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO0lBQ3hCLE1BQU0sVUFBVSxHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLENBQUM7SUFFekQsSUFBSSxVQUFVLEVBQUUsQ0FBQztRQUNoQixPQUFPLE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQzNELENBQUM7U0FBTSxDQUFDO1FBQ1AsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0FBQ0YsQ0FBQztBQUVELE1BQU0sVUFBVSxzQkFBc0IsQ0FBQyxPQUFxQjtJQUMzRCxJQUFJLE9BQU8sQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDMUIsTUFBTSxnQkFBZ0IsR0FBRyxtQkFBbUIsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDakUsSUFBSSxnQkFBZ0IsRUFBRSxDQUFDO1lBQ3RCLE9BQU8sZ0JBQWdCLENBQUM7UUFDekIsQ0FBQztJQUNGLENBQUM7SUFFRCxPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRTtRQUMxQyxPQUFPLENBQUM7WUFDUCxRQUFRLEVBQUUsTUFBTSxDQUFDLFFBQVE7WUFDekIsV0FBVyxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDeEMsUUFBUSxFQUFFLElBQUksQ0FBQyxJQUFJO2dCQUNuQixJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUU7YUFDMUIsQ0FBQyxDQUFDO1NBQ0gsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDO0FBQ3RCLENBQUMifQ==