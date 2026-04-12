/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, dispose } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { MultiDiffEditorItem } from '../../../multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { DiffElementPlaceholderViewModel, NotebookDocumentMetadataViewModel, SideBySideDiffElementViewModel, SingleSideDiffElementViewModel } from './diffElementViewModel.js';
import { NOTEBOOK_DIFF_ITEM_DIFF_STATE, NOTEBOOK_DIFF_ITEM_KIND } from './notebookDiffEditorBrowser.js';
import { CellUri } from '../../common/notebookCommon.js';
import { raceCancellation } from '../../../../../base/common/async.js';
import { computeDiff } from '../../common/notebookDiff.js';
export class NotebookDiffViewModel extends Disposable {
    get items() {
        return this._items;
    }
    get value() {
        return this.diffEditorItems
            .filter(item => item.type !== 'placeholder')
            .filter(item => {
            if (this._includeUnchanged) {
                return true;
            }
            if (item instanceof NotebookMultiDiffEditorCellItem) {
                return item.type === 'unchanged' && item.containerType === 'unchanged' ? false : true;
            }
            if (item instanceof NotebookMultiDiffEditorMetadataItem) {
                return item.type === 'unchanged' && item.containerType === 'unchanged' ? false : true;
            }
            if (item instanceof NotebookMultiDiffEditorOutputItem) {
                return item.type === 'unchanged' && item.containerType === 'unchanged' ? false : true;
            }
            return true;
        })
            .filter(item => item instanceof NotebookMultiDiffEditorOutputItem ? !this.hideOutput : true)
            .filter(item => item instanceof NotebookMultiDiffEditorMetadataItem ? !this.ignoreMetadata : true);
    }
    get hasUnchangedCells() {
        return this._hasUnchangedCells === true;
    }
    get includeUnchanged() {
        return this._includeUnchanged === true;
    }
    set includeUnchanged(value) {
        this._includeUnchanged = value;
        this._onDidChange.fire();
    }
    constructor(model, notebookEditorWorkerService, configurationService, eventDispatcher, notebookService, diffEditorHeightCalculator, fontInfo, excludeUnchangedPlaceholder) {
        super();
        this.model = model;
        this.notebookEditorWorkerService = notebookEditorWorkerService;
        this.configurationService = configurationService;
        this.eventDispatcher = eventDispatcher;
        this.notebookService = notebookService;
        this.diffEditorHeightCalculator = diffEditorHeightCalculator;
        this.fontInfo = fontInfo;
        this.excludeUnchangedPlaceholder = excludeUnchangedPlaceholder;
        this.placeholderAndRelatedCells = new Map();
        this._items = [];
        this._onDidChangeItems = this._register(new Emitter());
        this.onDidChangeItems = this._onDidChangeItems.event;
        this.disposables = this._register(new DisposableStore());
        this._onDidChange = this._register(new Emitter());
        this.diffEditorItems = [];
        this.onDidChange = this._onDidChange.event;
        this.originalCellViewModels = [];
        this.hideOutput = this.model.modified.notebook.transientOptions.transientOutputs || this.configurationService.getValue('notebook.diff.ignoreOutputs');
        this.ignoreMetadata = this.configurationService.getValue('notebook.diff.ignoreMetadata');
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            let triggerChange = false;
            let metadataChanged = false;
            if (e.affectsConfiguration('notebook.diff.ignoreMetadata')) {
                const newValue = this.configurationService.getValue('notebook.diff.ignoreMetadata');
                if (newValue !== undefined && this.ignoreMetadata !== newValue) {
                    this.ignoreMetadata = newValue;
                    triggerChange = true;
                    metadataChanged = true;
                }
            }
            if (e.affectsConfiguration('notebook.diff.ignoreOutputs')) {
                const newValue = this.configurationService.getValue('notebook.diff.ignoreOutputs');
                if (newValue !== undefined && this.hideOutput !== (newValue || this.model.modified.notebook.transientOptions.transientOutputs)) {
                    this.hideOutput = newValue || !!(this.model.modified.notebook.transientOptions.transientOutputs);
                    triggerChange = true;
                }
            }
            if (metadataChanged) {
                this.toggleNotebookMetadata();
            }
            if (triggerChange) {
                this._onDidChange.fire();
            }
        }));
    }
    dispose() {
        this.clear();
        super.dispose();
    }
    clear() {
        this.disposables.clear();
        dispose(Array.from(this.placeholderAndRelatedCells.keys()));
        this.placeholderAndRelatedCells.clear();
        dispose(this.originalCellViewModels);
        this.originalCellViewModels = [];
        dispose(this._items);
        this._items.splice(0, this._items.length);
    }
    async computeDiff(token) {
        const diffResult = await raceCancellation(this.notebookEditorWorkerService.computeDiff(this.model.original.resource, this.model.modified.resource), token);
        if (!diffResult || token.isCancellationRequested) {
            // after await the editor might be disposed.
            return;
        }
        prettyChanges(this.model.original.notebook, this.model.modified.notebook, diffResult.cellsDiff);
        const { cellDiffInfo, firstChangeIndex } = computeDiff(this.model.original.notebook, this.model.modified.notebook, diffResult);
        if (isEqual(cellDiffInfo, this.originalCellViewModels, this.model)) {
            return;
        }
        else {
            await raceCancellation(this.updateViewModels(cellDiffInfo, diffResult.metadataChanged, firstChangeIndex), token);
            if (token.isCancellationRequested) {
                return;
            }
            this.updateDiffEditorItems();
        }
    }
    toggleNotebookMetadata() {
        if (!this.notebookMetadataViewModel) {
            return;
        }
        if (this.ignoreMetadata) {
            if (this._items.length && this._items[0] === this.notebookMetadataViewModel) {
                this._items.splice(0, 1);
                this._onDidChangeItems.fire({ start: 0, deleteCount: 1, elements: [] });
            }
        }
        else {
            if (!this._items.length || this._items[0] !== this.notebookMetadataViewModel) {
                this._items.splice(0, 0, this.notebookMetadataViewModel);
                this._onDidChangeItems.fire({ start: 0, deleteCount: 0, elements: [this.notebookMetadataViewModel] });
            }
        }
    }
    updateDiffEditorItems() {
        this.diffEditorItems = [];
        const originalSourceUri = this.model.original.resource;
        const modifiedSourceUri = this.model.modified.resource;
        this._hasUnchangedCells = false;
        this.items.forEach(item => {
            switch (item.type) {
                case 'delete': {
                    this.diffEditorItems.push(new NotebookMultiDiffEditorCellItem(item.original.uri, undefined, item.type, item.type));
                    const originalMetadata = CellUri.generateCellPropertyUri(originalSourceUri, item.original.handle, Schemas.vscodeNotebookCellMetadata);
                    this.diffEditorItems.push(new NotebookMultiDiffEditorMetadataItem(originalMetadata, undefined, item.type, item.type));
                    const originalOutput = CellUri.generateCellPropertyUri(originalSourceUri, item.original.handle, Schemas.vscodeNotebookCellOutput);
                    this.diffEditorItems.push(new NotebookMultiDiffEditorOutputItem(originalOutput, undefined, item.type, item.type));
                    break;
                }
                case 'insert': {
                    this.diffEditorItems.push(new NotebookMultiDiffEditorCellItem(undefined, item.modified.uri, item.type, item.type));
                    const modifiedMetadata = CellUri.generateCellPropertyUri(modifiedSourceUri, item.modified.handle, Schemas.vscodeNotebookCellMetadata);
                    this.diffEditorItems.push(new NotebookMultiDiffEditorMetadataItem(undefined, modifiedMetadata, item.type, item.type));
                    const modifiedOutput = CellUri.generateCellPropertyUri(modifiedSourceUri, item.modified.handle, Schemas.vscodeNotebookCellOutput);
                    this.diffEditorItems.push(new NotebookMultiDiffEditorOutputItem(undefined, modifiedOutput, item.type, item.type));
                    break;
                }
                case 'modified': {
                    const cellType = item.checkIfInputModified() ? item.type : 'unchanged';
                    const containerChanged = (item.checkIfInputModified() || item.checkMetadataIfModified() || item.checkIfOutputsModified()) ? item.type : 'unchanged';
                    this.diffEditorItems.push(new NotebookMultiDiffEditorCellItem(item.original.uri, item.modified.uri, cellType, containerChanged));
                    const originalMetadata = CellUri.generateCellPropertyUri(originalSourceUri, item.original.handle, Schemas.vscodeNotebookCellMetadata);
                    const modifiedMetadata = CellUri.generateCellPropertyUri(modifiedSourceUri, item.modified.handle, Schemas.vscodeNotebookCellMetadata);
                    this.diffEditorItems.push(new NotebookMultiDiffEditorMetadataItem(originalMetadata, modifiedMetadata, item.checkMetadataIfModified() ? item.type : 'unchanged', containerChanged));
                    const originalOutput = CellUri.generateCellPropertyUri(originalSourceUri, item.original.handle, Schemas.vscodeNotebookCellOutput);
                    const modifiedOutput = CellUri.generateCellPropertyUri(modifiedSourceUri, item.modified.handle, Schemas.vscodeNotebookCellOutput);
                    this.diffEditorItems.push(new NotebookMultiDiffEditorOutputItem(originalOutput, modifiedOutput, item.checkIfOutputsModified() ? item.type : 'unchanged', containerChanged));
                    break;
                }
                case 'unchanged': {
                    this._hasUnchangedCells = true;
                    this.diffEditorItems.push(new NotebookMultiDiffEditorCellItem(item.original.uri, item.modified.uri, item.type, item.type));
                    const originalMetadata = CellUri.generateCellPropertyUri(originalSourceUri, item.original.handle, Schemas.vscodeNotebookCellMetadata);
                    const modifiedMetadata = CellUri.generateCellPropertyUri(modifiedSourceUri, item.modified.handle, Schemas.vscodeNotebookCellMetadata);
                    this.diffEditorItems.push(new NotebookMultiDiffEditorMetadataItem(originalMetadata, modifiedMetadata, item.type, item.type));
                    const originalOutput = CellUri.generateCellPropertyUri(originalSourceUri, item.original.handle, Schemas.vscodeNotebookCellOutput);
                    const modifiedOutput = CellUri.generateCellPropertyUri(modifiedSourceUri, item.modified.handle, Schemas.vscodeNotebookCellOutput);
                    this.diffEditorItems.push(new NotebookMultiDiffEditorOutputItem(originalOutput, modifiedOutput, item.type, item.type));
                    break;
                }
            }
        });
        this._onDidChange.fire();
    }
    async updateViewModels(cellDiffInfo, metadataChanged, firstChangeIndex) {
        const cellViewModels = await this.createDiffViewModels(cellDiffInfo, metadataChanged);
        const oldLength = this._items.length;
        this.clear();
        this._items.splice(0, oldLength);
        let placeholder = undefined;
        this.originalCellViewModels = cellViewModels;
        cellViewModels.forEach((vm, index) => {
            if (vm.type === 'unchanged' && !this.excludeUnchangedPlaceholder) {
                if (!placeholder) {
                    vm.displayIconToHideUnmodifiedCells = true;
                    placeholder = new DiffElementPlaceholderViewModel(vm.mainDocumentTextModel, vm.editorEventDispatcher, vm.initData);
                    this._items.push(placeholder);
                    const placeholderItem = placeholder;
                    this.disposables.add(placeholderItem.onUnfoldHiddenCells(() => {
                        const hiddenCellViewModels = this.placeholderAndRelatedCells.get(placeholderItem);
                        if (!Array.isArray(hiddenCellViewModels)) {
                            return;
                        }
                        const start = this._items.indexOf(placeholderItem);
                        this._items.splice(start, 1, ...hiddenCellViewModels);
                        this._onDidChangeItems.fire({ start, deleteCount: 1, elements: hiddenCellViewModels });
                    }));
                    this.disposables.add(vm.onHideUnchangedCells(() => {
                        const hiddenCellViewModels = this.placeholderAndRelatedCells.get(placeholderItem);
                        if (!Array.isArray(hiddenCellViewModels)) {
                            return;
                        }
                        const start = this._items.indexOf(vm);
                        this._items.splice(start, hiddenCellViewModels.length, placeholderItem);
                        this._onDidChangeItems.fire({ start, deleteCount: hiddenCellViewModels.length, elements: [placeholderItem] });
                    }));
                }
                const hiddenCellViewModels = this.placeholderAndRelatedCells.get(placeholder) || [];
                hiddenCellViewModels.push(vm);
                this.placeholderAndRelatedCells.set(placeholder, hiddenCellViewModels);
                placeholder.hiddenCells.push(vm);
            }
            else {
                placeholder = undefined;
                this._items.push(vm);
            }
        });
        // Note, ensure all of the height calculations are done before firing the event.
        // This is to ensure that the diff editor is not resized multiple times, thereby avoiding flickering.
        this._onDidChangeItems.fire({ start: 0, deleteCount: oldLength, elements: this._items, firstChangeIndex });
    }
    async createDiffViewModels(computedCellDiffs, metadataChanged) {
        const originalModel = this.model.original.notebook;
        const modifiedModel = this.model.modified.notebook;
        const initData = {
            metadataStatusHeight: this.configurationService.getValue('notebook.diff.ignoreMetadata') ? 0 : 25,
            outputStatusHeight: this.configurationService.getValue('notebook.diff.ignoreOutputs') || !!(modifiedModel.transientOptions.transientOutputs) ? 0 : 25,
            fontInfo: this.fontInfo
        };
        const viewModels = [];
        this.notebookMetadataViewModel = this._register(new NotebookDocumentMetadataViewModel(this.model.original.notebook, this.model.modified.notebook, metadataChanged ? 'modifiedMetadata' : 'unchangedMetadata', this.eventDispatcher, initData, this.notebookService, this.diffEditorHeightCalculator));
        if (!this.ignoreMetadata) {
            if (metadataChanged) {
                await this.notebookMetadataViewModel.computeHeights();
            }
            viewModels.push(this.notebookMetadataViewModel);
        }
        const cellViewModels = await Promise.all(computedCellDiffs.map(async (diff) => {
            switch (diff.type) {
                case 'delete': {
                    return new SingleSideDiffElementViewModel(originalModel, modifiedModel, originalModel.cells[diff.originalCellIndex], undefined, 'delete', this.eventDispatcher, initData, this.notebookService, this.configurationService, this.diffEditorHeightCalculator, diff.originalCellIndex);
                }
                case 'insert': {
                    return new SingleSideDiffElementViewModel(modifiedModel, originalModel, undefined, modifiedModel.cells[diff.modifiedCellIndex], 'insert', this.eventDispatcher, initData, this.notebookService, this.configurationService, this.diffEditorHeightCalculator, diff.modifiedCellIndex);
                }
                case 'modified': {
                    const viewModel = new SideBySideDiffElementViewModel(this.model.modified.notebook, this.model.original.notebook, originalModel.cells[diff.originalCellIndex], modifiedModel.cells[diff.modifiedCellIndex], 'modified', this.eventDispatcher, initData, this.notebookService, this.configurationService, diff.originalCellIndex, this.diffEditorHeightCalculator);
                    // Reduces flicker (compute this before setting the model)
                    // Else when the model is set, the height of the editor will be x, after diff is computed, then height will be y.
                    // & that results in flicker.
                    await viewModel.computeEditorHeights();
                    return viewModel;
                }
                case 'unchanged': {
                    return new SideBySideDiffElementViewModel(this.model.modified.notebook, this.model.original.notebook, originalModel.cells[diff.originalCellIndex], modifiedModel.cells[diff.modifiedCellIndex], 'unchanged', this.eventDispatcher, initData, this.notebookService, this.configurationService, diff.originalCellIndex, this.diffEditorHeightCalculator);
                }
            }
        }));
        cellViewModels.forEach(vm => viewModels.push(vm));
        return viewModels;
    }
}
/**
 * making sure that swapping cells are always translated to `insert+delete`.
 */
export function prettyChanges(original, modified, diffResult) {
    const changes = diffResult.changes;
    for (let i = 0; i < diffResult.changes.length - 1; i++) {
        // then we know there is another change after current one
        const curr = changes[i];
        const next = changes[i + 1];
        const x = curr.originalStart;
        const y = curr.modifiedStart;
        if (curr.originalLength === 1
            && curr.modifiedLength === 0
            && next.originalStart === x + 2
            && next.originalLength === 0
            && next.modifiedStart === y + 1
            && next.modifiedLength === 1
            && original.cells[x].getHashValue() === modified.cells[y + 1].getHashValue()
            && original.cells[x + 1].getHashValue() === modified.cells[y].getHashValue()) {
            // this is a swap
            curr.originalStart = x;
            curr.originalLength = 0;
            curr.modifiedStart = y;
            curr.modifiedLength = 1;
            next.originalStart = x + 1;
            next.originalLength = 1;
            next.modifiedStart = y + 2;
            next.modifiedLength = 0;
            i++;
        }
    }
}
function isEqual(cellDiffInfo, viewModels, model) {
    if (cellDiffInfo.length !== viewModels.length) {
        return false;
    }
    const originalModel = model.original.notebook;
    const modifiedModel = model.modified.notebook;
    for (let i = 0; i < viewModels.length; i++) {
        const a = cellDiffInfo[i];
        const b = viewModels[i];
        if (a.type !== b.type) {
            return false;
        }
        switch (a.type) {
            case 'delete': {
                if (originalModel.cells[a.originalCellIndex].handle !== b.original?.handle) {
                    return false;
                }
                continue;
            }
            case 'insert': {
                if (modifiedModel.cells[a.modifiedCellIndex].handle !== b.modified?.handle) {
                    return false;
                }
                continue;
            }
            default: {
                if (originalModel.cells[a.originalCellIndex].handle !== b.original?.handle) {
                    return false;
                }
                if (modifiedModel.cells[a.modifiedCellIndex].handle !== b.modified?.handle) {
                    return false;
                }
                continue;
            }
        }
    }
    return true;
}
export class NotebookMultiDiffEditorItem extends MultiDiffEditorItem {
    constructor(originalUri, modifiedUri, goToFileUri, type, containerType, kind, contextKeys) {
        super(originalUri, modifiedUri, goToFileUri, undefined, contextKeys);
        this.type = type;
        this.containerType = containerType;
        this.kind = kind;
    }
}
class NotebookMultiDiffEditorCellItem extends NotebookMultiDiffEditorItem {
    constructor(originalUri, modifiedUri, type, containerType) {
        super(originalUri, modifiedUri, modifiedUri || originalUri, type, containerType, 'Cell', {
            [NOTEBOOK_DIFF_ITEM_KIND.key]: 'Cell',
            [NOTEBOOK_DIFF_ITEM_DIFF_STATE.key]: type
        });
    }
}
class NotebookMultiDiffEditorMetadataItem extends NotebookMultiDiffEditorItem {
    constructor(originalUri, modifiedUri, type, containerType) {
        super(originalUri, modifiedUri, modifiedUri || originalUri, type, containerType, 'Metadata', {
            [NOTEBOOK_DIFF_ITEM_KIND.key]: 'Metadata',
            [NOTEBOOK_DIFF_ITEM_DIFF_STATE.key]: type
        });
    }
}
class NotebookMultiDiffEditorOutputItem extends NotebookMultiDiffEditorItem {
    constructor(originalUri, modifiedUri, type, containerType) {
        super(originalUri, modifiedUri, modifiedUri || originalUri, type, containerType, 'Output', {
            [NOTEBOOK_DIFF_ITEM_KIND.key]: 'Output',
            [NOTEBOOK_DIFF_ITEM_DIFF_STATE.key]: type
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tEaWZmVmlld01vZGVsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci9kaWZmL25vdGVib29rRGlmZlZpZXdNb2RlbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUloRyxPQUFPLEVBQUUsT0FBTyxFQUE4QixNQUFNLHFDQUFxQyxDQUFDO0FBQzFGLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQy9GLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUtoRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxvRUFBb0UsQ0FBQztBQUN6RyxPQUFPLEVBQWdDLCtCQUErQixFQUE2QixpQ0FBaUMsRUFBRSw4QkFBOEIsRUFBRSw4QkFBOEIsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBRXhPLE9BQU8sRUFBNkQsNkJBQTZCLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUVuSyxPQUFPLEVBQUUsT0FBTyxFQUE0QixNQUFNLGdDQUFnQyxDQUFDO0FBSW5GLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUUzRCxNQUFNLE9BQU8scUJBQXNCLFNBQVEsVUFBVTtJQUdwRCxJQUFJLEtBQUs7UUFDUixPQUFPLElBQUksQ0FBQyxNQUFNLENBQUM7SUFDcEIsQ0FBQztJQVFELElBQUksS0FBSztRQUNSLE9BQU8sSUFBSSxDQUFDLGVBQWU7YUFDekIsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksS0FBSyxhQUFhLENBQUM7YUFDM0MsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFO1lBQ2QsSUFBSSxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztnQkFDNUIsT0FBTyxJQUFJLENBQUM7WUFDYixDQUFDO1lBQ0QsSUFBSSxJQUFJLFlBQVksK0JBQStCLEVBQUUsQ0FBQztnQkFDckQsT0FBTyxJQUFJLENBQUMsSUFBSSxLQUFLLFdBQVcsSUFBSSxJQUFJLENBQUMsYUFBYSxLQUFLLFdBQVcsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7WUFDdkYsQ0FBQztZQUNELElBQUksSUFBSSxZQUFZLG1DQUFtQyxFQUFFLENBQUM7Z0JBQ3pELE9BQU8sSUFBSSxDQUFDLElBQUksS0FBSyxXQUFXLElBQUksSUFBSSxDQUFDLGFBQWEsS0FBSyxXQUFXLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO1lBQ3ZGLENBQUM7WUFDRCxJQUFJLElBQUksWUFBWSxpQ0FBaUMsRUFBRSxDQUFDO2dCQUN2RCxPQUFPLElBQUksQ0FBQyxJQUFJLEtBQUssV0FBVyxJQUFJLElBQUksQ0FBQyxhQUFhLEtBQUssV0FBVyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztZQUN2RixDQUFDO1lBQ0QsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDLENBQUM7YUFDRCxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLFlBQVksaUNBQWlDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO2FBQzNGLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksWUFBWSxtQ0FBbUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNyRyxDQUFDO0lBR0QsSUFBVyxpQkFBaUI7UUFDM0IsT0FBTyxJQUFJLENBQUMsa0JBQWtCLEtBQUssSUFBSSxDQUFDO0lBQ3pDLENBQUM7SUFFRCxJQUFXLGdCQUFnQjtRQUMxQixPQUFPLElBQUksQ0FBQyxpQkFBaUIsS0FBSyxJQUFJLENBQUM7SUFDeEMsQ0FBQztJQUNELElBQVcsZ0JBQWdCLENBQUMsS0FBSztRQUNoQyxJQUFJLENBQUMsaUJBQWlCLEdBQUcsS0FBSyxDQUFDO1FBQy9CLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDMUIsQ0FBQztJQUtELFlBQTZCLEtBQStCLEVBQzFDLDJCQUF5RCxFQUN6RCxvQkFBMkMsRUFDM0MsZUFBa0QsRUFDbEQsZUFBaUMsRUFDakMsMEJBQThELEVBQzlELFFBQW1CLEVBQ25CLDJCQUFxQztRQUV0RCxLQUFLLEVBQUUsQ0FBQztRQVRvQixVQUFLLEdBQUwsS0FBSyxDQUEwQjtRQUMxQyxnQ0FBMkIsR0FBM0IsMkJBQTJCLENBQThCO1FBQ3pELHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBdUI7UUFDM0Msb0JBQWUsR0FBZixlQUFlLENBQW1DO1FBQ2xELG9CQUFlLEdBQWYsZUFBZSxDQUFrQjtRQUNqQywrQkFBMEIsR0FBMUIsMEJBQTBCLENBQW9DO1FBQzlELGFBQVEsR0FBUixRQUFRLENBQVc7UUFDbkIsZ0NBQTJCLEdBQTNCLDJCQUEyQixDQUFVO1FBekR0QywrQkFBMEIsR0FBRyxJQUFJLEdBQUcsRUFBbUUsQ0FBQztRQUN4RyxXQUFNLEdBQWdDLEVBQUUsQ0FBQztRQUl6QyxzQkFBaUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFxQyxDQUFDLENBQUM7UUFDdEYscUJBQWdCLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEtBQUssQ0FBQztRQUMvQyxnQkFBVyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxlQUFlLEVBQUUsQ0FBQyxDQUFDO1FBQzdELGlCQUFZLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBUSxDQUFDLENBQUM7UUFDbkQsb0JBQWUsR0FBa0MsRUFBRSxDQUFDO1FBQ3JELGdCQUFXLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUM7UUF1Q3JDLDJCQUFzQixHQUFnQyxFQUFFLENBQUM7UUFXaEUsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsZ0JBQWdCLElBQUksSUFBSSxDQUFDLG9CQUFvQixDQUFDLFFBQVEsQ0FBVSw2QkFBNkIsQ0FBQyxDQUFDO1FBQy9KLElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFFBQVEsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDO1FBRXpGLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLHdCQUF3QixDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQ3JFLElBQUksYUFBYSxHQUFHLEtBQUssQ0FBQztZQUMxQixJQUFJLGVBQWUsR0FBRyxLQUFLLENBQUM7WUFDNUIsSUFBSSxDQUFDLENBQUMsb0JBQW9CLENBQUMsOEJBQThCLENBQUMsRUFBRSxDQUFDO2dCQUM1RCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsUUFBUSxDQUFVLDhCQUE4QixDQUFDLENBQUM7Z0JBRTdGLElBQUksUUFBUSxLQUFLLFNBQVMsSUFBSSxJQUFJLENBQUMsY0FBYyxLQUFLLFFBQVEsRUFBRSxDQUFDO29CQUNoRSxJQUFJLENBQUMsY0FBYyxHQUFHLFFBQVEsQ0FBQztvQkFDL0IsYUFBYSxHQUFHLElBQUksQ0FBQztvQkFDckIsZUFBZSxHQUFHLElBQUksQ0FBQztnQkFDeEIsQ0FBQztZQUNGLENBQUM7WUFFRCxJQUFJLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQyw2QkFBNkIsQ0FBQyxFQUFFLENBQUM7Z0JBQzNELE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRLENBQVUsNkJBQTZCLENBQUMsQ0FBQztnQkFFNUYsSUFBSSxRQUFRLEtBQUssU0FBUyxJQUFJLElBQUksQ0FBQyxVQUFVLEtBQUssQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLGdCQUFnQixDQUFDLEVBQUUsQ0FBQztvQkFDaEksSUFBSSxDQUFDLFVBQVUsR0FBRyxRQUFRLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLGdCQUFnQixDQUFDLENBQUM7b0JBQ2pHLGFBQWEsR0FBRyxJQUFJLENBQUM7Z0JBQ3RCLENBQUM7WUFDRixDQUFDO1lBRUQsSUFBSSxlQUFlLEVBQUUsQ0FBQztnQkFDckIsSUFBSSxDQUFDLHNCQUFzQixFQUFFLENBQUM7WUFDL0IsQ0FBQztZQUNELElBQUksYUFBYSxFQUFFLENBQUM7Z0JBQ25CLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDMUIsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBQ1EsT0FBTztRQUNmLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNiLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUNqQixDQUFDO0lBQ08sS0FBSztRQUNaLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDekIsT0FBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM1RCxJQUFJLENBQUMsMEJBQTBCLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDeEMsT0FBTyxDQUFDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO1FBQ3JDLElBQUksQ0FBQyxzQkFBc0IsR0FBRyxFQUFFLENBQUM7UUFDakMsT0FBTyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNyQixJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUMzQyxDQUFDO0lBRUQsS0FBSyxDQUFDLFdBQVcsQ0FBQyxLQUF3QjtRQUN6QyxNQUFNLFVBQVUsR0FBRyxNQUFNLGdCQUFnQixDQUFDLElBQUksQ0FBQywyQkFBMkIsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzNKLElBQUksQ0FBQyxVQUFVLElBQUksS0FBSyxDQUFDLHVCQUF1QixFQUFFLENBQUM7WUFDbEQsNENBQTRDO1lBQzVDLE9BQU87UUFDUixDQUFDO1FBRUQsYUFBYSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBRWhHLE1BQU0sRUFBRSxZQUFZLEVBQUUsZ0JBQWdCLEVBQUUsR0FBRyxXQUFXLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUMvSCxJQUFJLE9BQU8sQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLHNCQUFzQixFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3BFLE9BQU87UUFDUixDQUFDO2FBQU0sQ0FBQztZQUNQLE1BQU0sZ0JBQWdCLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFlBQVksRUFBRSxVQUFVLENBQUMsZUFBZSxFQUFFLGdCQUFnQixDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDakgsSUFBSSxLQUFLLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztnQkFDbkMsT0FBTztZQUNSLENBQUM7WUFDRCxJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQztRQUM5QixDQUFDO0lBQ0YsQ0FBQztJQUVPLHNCQUFzQjtRQUM3QixJQUFJLENBQUMsSUFBSSxDQUFDLHlCQUF5QixFQUFFLENBQUM7WUFDckMsT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUN6QixJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssSUFBSSxDQUFDLHlCQUF5QixFQUFFLENBQUM7Z0JBQzdFLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDekIsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsV0FBVyxFQUFFLENBQUMsRUFBRSxRQUFRLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUN6RSxDQUFDO1FBQ0YsQ0FBQzthQUFNLENBQUM7WUFDUCxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsS0FBSyxJQUFJLENBQUMseUJBQXlCLEVBQUUsQ0FBQztnQkFDOUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxJQUFJLENBQUMseUJBQXlCLENBQUMsQ0FBQztnQkFDekQsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsV0FBVyxFQUFFLENBQUMsRUFBRSxRQUFRLEVBQUUsQ0FBQyxJQUFJLENBQUMseUJBQXlCLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDdkcsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBQ08scUJBQXFCO1FBQzVCLElBQUksQ0FBQyxlQUFlLEdBQUcsRUFBRSxDQUFDO1FBQzFCLE1BQU0saUJBQWlCLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsUUFBUyxDQUFDO1FBQ3hELE1BQU0saUJBQWlCLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsUUFBUyxDQUFDO1FBQ3hELElBQUksQ0FBQyxrQkFBa0IsR0FBRyxLQUFLLENBQUM7UUFDaEMsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUU7WUFDekIsUUFBUSxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ25CLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQztvQkFDZixJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxJQUFJLCtCQUErQixDQUFDLElBQUksQ0FBQyxRQUFTLENBQUMsR0FBRyxFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUNwSCxNQUFNLGdCQUFnQixHQUFHLE9BQU8sQ0FBQyx1QkFBdUIsQ0FBQyxpQkFBaUIsRUFBRSxJQUFJLENBQUMsUUFBUyxDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUMsMEJBQTBCLENBQUMsQ0FBQztvQkFDdkksSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsSUFBSSxtQ0FBbUMsQ0FBQyxnQkFBZ0IsRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDdEgsTUFBTSxjQUFjLEdBQUcsT0FBTyxDQUFDLHVCQUF1QixDQUFDLGlCQUFpQixFQUFFLElBQUksQ0FBQyxRQUFTLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO29CQUNuSSxJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxJQUFJLGlDQUFpQyxDQUFDLGNBQWMsRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDbEgsTUFBTTtnQkFDUCxDQUFDO2dCQUNELEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQztvQkFDZixJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxJQUFJLCtCQUErQixDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsUUFBUyxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUNwSCxNQUFNLGdCQUFnQixHQUFHLE9BQU8sQ0FBQyx1QkFBdUIsQ0FBQyxpQkFBaUIsRUFBRSxJQUFJLENBQUMsUUFBUyxDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUMsMEJBQTBCLENBQUMsQ0FBQztvQkFDdkksSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsSUFBSSxtQ0FBbUMsQ0FBQyxTQUFTLEVBQUUsZ0JBQWdCLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDdEgsTUFBTSxjQUFjLEdBQUcsT0FBTyxDQUFDLHVCQUF1QixDQUFDLGlCQUFpQixFQUFFLElBQUksQ0FBQyxRQUFTLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO29CQUNuSSxJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxJQUFJLGlDQUFpQyxDQUFDLFNBQVMsRUFBRSxjQUFjLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDbEgsTUFBTTtnQkFDUCxDQUFDO2dCQUNELEtBQUssVUFBVSxDQUFDLENBQUMsQ0FBQztvQkFDakIsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQztvQkFDdkUsTUFBTSxnQkFBZ0IsR0FBRyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxJQUFJLElBQUksQ0FBQyx1QkFBdUIsRUFBRSxJQUFJLElBQUksQ0FBQyxzQkFBc0IsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQztvQkFDcEosSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsSUFBSSwrQkFBK0IsQ0FBQyxJQUFJLENBQUMsUUFBUyxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsUUFBUyxDQUFDLEdBQUcsRUFBRSxRQUFRLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDO29CQUNuSSxNQUFNLGdCQUFnQixHQUFHLE9BQU8sQ0FBQyx1QkFBdUIsQ0FBQyxpQkFBaUIsRUFBRSxJQUFJLENBQUMsUUFBUyxDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUMsMEJBQTBCLENBQUMsQ0FBQztvQkFDdkksTUFBTSxnQkFBZ0IsR0FBRyxPQUFPLENBQUMsdUJBQXVCLENBQUMsaUJBQWlCLEVBQUUsSUFBSSxDQUFDLFFBQVMsQ0FBQyxNQUFNLEVBQUUsT0FBTyxDQUFDLDBCQUEwQixDQUFDLENBQUM7b0JBQ3ZJLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLElBQUksbUNBQW1DLENBQUMsZ0JBQWdCLEVBQUUsZ0JBQWdCLEVBQUUsSUFBSSxDQUFDLHVCQUF1QixFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7b0JBQ25MLE1BQU0sY0FBYyxHQUFHLE9BQU8sQ0FBQyx1QkFBdUIsQ0FBQyxpQkFBaUIsRUFBRSxJQUFJLENBQUMsUUFBUyxDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUMsd0JBQXdCLENBQUMsQ0FBQztvQkFDbkksTUFBTSxjQUFjLEdBQUcsT0FBTyxDQUFDLHVCQUF1QixDQUFDLGlCQUFpQixFQUFFLElBQUksQ0FBQyxRQUFTLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO29CQUNuSSxJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxJQUFJLGlDQUFpQyxDQUFDLGNBQWMsRUFBRSxjQUFjLEVBQUUsSUFBSSxDQUFDLHNCQUFzQixFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7b0JBQzVLLE1BQU07Z0JBQ1AsQ0FBQztnQkFDRCxLQUFLLFdBQVcsQ0FBQyxDQUFDLENBQUM7b0JBQ2xCLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxJQUFJLENBQUM7b0JBQy9CLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLElBQUksK0JBQStCLENBQUMsSUFBSSxDQUFDLFFBQVMsQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLFFBQVMsQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDN0gsTUFBTSxnQkFBZ0IsR0FBRyxPQUFPLENBQUMsdUJBQXVCLENBQUMsaUJBQWlCLEVBQUUsSUFBSSxDQUFDLFFBQVMsQ0FBQyxNQUFNLEVBQUUsT0FBTyxDQUFDLDBCQUEwQixDQUFDLENBQUM7b0JBQ3ZJLE1BQU0sZ0JBQWdCLEdBQUcsT0FBTyxDQUFDLHVCQUF1QixDQUFDLGlCQUFpQixFQUFFLElBQUksQ0FBQyxRQUFTLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO29CQUN2SSxJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxJQUFJLG1DQUFtQyxDQUFDLGdCQUFnQixFQUFFLGdCQUFnQixFQUFFLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7b0JBQzdILE1BQU0sY0FBYyxHQUFHLE9BQU8sQ0FBQyx1QkFBdUIsQ0FBQyxpQkFBaUIsRUFBRSxJQUFJLENBQUMsUUFBUyxDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUMsd0JBQXdCLENBQUMsQ0FBQztvQkFDbkksTUFBTSxjQUFjLEdBQUcsT0FBTyxDQUFDLHVCQUF1QixDQUFDLGlCQUFpQixFQUFFLElBQUksQ0FBQyxRQUFTLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO29CQUNuSSxJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxJQUFJLGlDQUFpQyxDQUFDLGNBQWMsRUFBRSxjQUFjLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDdkgsTUFBTTtnQkFDUCxDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUMxQixDQUFDO0lBRU8sS0FBSyxDQUFDLGdCQUFnQixDQUFDLFlBQTRCLEVBQUUsZUFBd0IsRUFBRSxnQkFBd0I7UUFDOUcsTUFBTSxjQUFjLEdBQUcsTUFBTSxJQUFJLENBQUMsb0JBQW9CLENBQUMsWUFBWSxFQUFFLGVBQWUsQ0FBQyxDQUFDO1FBQ3RGLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDO1FBQ3JDLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNiLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUVqQyxJQUFJLFdBQVcsR0FBZ0QsU0FBUyxDQUFDO1FBQ3pFLElBQUksQ0FBQyxzQkFBc0IsR0FBRyxjQUFjLENBQUM7UUFDN0MsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEVBQUUsRUFBRSxLQUFLLEVBQUUsRUFBRTtZQUNwQyxJQUFJLEVBQUUsQ0FBQyxJQUFJLEtBQUssV0FBVyxJQUFJLENBQUMsSUFBSSxDQUFDLDJCQUEyQixFQUFFLENBQUM7Z0JBQ2xFLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztvQkFDbEIsRUFBRSxDQUFDLGdDQUFnQyxHQUFHLElBQUksQ0FBQztvQkFDM0MsV0FBVyxHQUFHLElBQUksK0JBQStCLENBQUMsRUFBRSxDQUFDLHFCQUFxQixFQUFFLEVBQUUsQ0FBQyxxQkFBcUIsRUFBRSxFQUFFLENBQUMsUUFBUSxDQUFDLENBQUM7b0JBQ25ILElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO29CQUM5QixNQUFNLGVBQWUsR0FBRyxXQUFXLENBQUM7b0JBRXBDLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLEVBQUU7d0JBQzdELE1BQU0sb0JBQW9CLEdBQUcsSUFBSSxDQUFDLDBCQUEwQixDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsQ0FBQzt3QkFDbEYsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsb0JBQW9CLENBQUMsRUFBRSxDQUFDOzRCQUMxQyxPQUFPO3dCQUNSLENBQUM7d0JBQ0QsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsZUFBZSxDQUFDLENBQUM7d0JBQ25ELElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFDLEVBQUUsR0FBRyxvQkFBb0IsQ0FBQyxDQUFDO3dCQUN0RCxJQUFJLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSxDQUFDLEVBQUUsUUFBUSxFQUFFLG9CQUFvQixFQUFFLENBQUMsQ0FBQztvQkFDeEYsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDSixJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsb0JBQW9CLENBQUMsR0FBRyxFQUFFO3dCQUNqRCxNQUFNLG9CQUFvQixHQUFHLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLENBQUM7d0JBQ2xGLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLG9CQUFvQixDQUFDLEVBQUUsQ0FBQzs0QkFDMUMsT0FBTzt3QkFDUixDQUFDO3dCQUNELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDO3dCQUN0QyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsb0JBQW9CLENBQUMsTUFBTSxFQUFFLGVBQWUsQ0FBQyxDQUFDO3dCQUN4RSxJQUFJLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSxvQkFBb0IsQ0FBQyxNQUFNLEVBQUUsUUFBUSxFQUFFLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQyxDQUFDO29CQUMvRyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNMLENBQUM7Z0JBQ0QsTUFBTSxvQkFBb0IsR0FBRyxJQUFJLENBQUMsMEJBQTBCLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDcEYsb0JBQW9CLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUM5QixJQUFJLENBQUMsMEJBQTBCLENBQUMsR0FBRyxDQUFDLFdBQVcsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO2dCQUN2RSxXQUFXLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNsQyxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsV0FBVyxHQUFHLFNBQVMsQ0FBQztnQkFDeEIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDdEIsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDO1FBRUgsZ0ZBQWdGO1FBQ2hGLHFHQUFxRztRQUNyRyxJQUFJLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxXQUFXLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxJQUFJLENBQUMsTUFBTSxFQUFFLGdCQUFnQixFQUFFLENBQUMsQ0FBQztJQUM1RyxDQUFDO0lBQ08sS0FBSyxDQUFDLG9CQUFvQixDQUFDLGlCQUFpQyxFQUFFLGVBQXdCO1FBQzdGLE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQztRQUNuRCxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUM7UUFDbkQsTUFBTSxRQUFRLEdBQUc7WUFDaEIsb0JBQW9CLEVBQUUsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFFBQVEsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDakcsa0JBQWtCLEVBQUUsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFFBQVEsQ0FBVSw2QkFBNkIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxnQkFBZ0IsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDOUosUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRO1NBQ3ZCLENBQUM7UUFFRixNQUFNLFVBQVUsR0FBNEcsRUFBRSxDQUFDO1FBQy9ILElBQUksQ0FBQyx5QkFBeUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksaUNBQWlDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxlQUFlLENBQUMsQ0FBQyxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxtQkFBbUIsRUFBRSxJQUFJLENBQUMsZUFBZSxFQUFFLFFBQVEsRUFBRSxJQUFJLENBQUMsZUFBZSxFQUFFLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxDQUFDLENBQUM7UUFDdFMsSUFBSSxDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUMxQixJQUFJLGVBQWUsRUFBRSxDQUFDO2dCQUNyQixNQUFNLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUN2RCxDQUFDO1lBQ0QsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMseUJBQXlCLENBQUMsQ0FBQztRQUNqRCxDQUFDO1FBQ0QsTUFBTSxjQUFjLEdBQUcsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLEVBQUU7WUFDN0UsUUFBUSxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ25CLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQztvQkFDZixPQUFPLElBQUksOEJBQThCLENBQ3hDLGFBQWEsRUFDYixhQUFhLEVBQ2IsYUFBYSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsRUFDM0MsU0FBUyxFQUNULFFBQVEsRUFDUixJQUFJLENBQUMsZUFBZSxFQUNwQixRQUFRLEVBQ1IsSUFBSSxDQUFDLGVBQWUsRUFDcEIsSUFBSSxDQUFDLG9CQUFvQixFQUN6QixJQUFJLENBQUMsMEJBQTBCLEVBQy9CLElBQUksQ0FBQyxpQkFBaUIsQ0FDdEIsQ0FBQztnQkFDSCxDQUFDO2dCQUNELEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQztvQkFDZixPQUFPLElBQUksOEJBQThCLENBQ3hDLGFBQWEsRUFDYixhQUFhLEVBQ2IsU0FBUyxFQUNULGFBQWEsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEVBQzNDLFFBQVEsRUFDUixJQUFJLENBQUMsZUFBZSxFQUNwQixRQUFRLEVBQ1IsSUFBSSxDQUFDLGVBQWUsRUFDcEIsSUFBSSxDQUFDLG9CQUFvQixFQUN6QixJQUFJLENBQUMsMEJBQTBCLEVBQy9CLElBQUksQ0FBQyxpQkFBaUIsQ0FDdEIsQ0FBQztnQkFDSCxDQUFDO2dCQUNELEtBQUssVUFBVSxDQUFDLENBQUMsQ0FBQztvQkFDakIsTUFBTSxTQUFTLEdBQUcsSUFBSSw4QkFBOEIsQ0FDbkQsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUM1QixJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQzVCLGFBQWEsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEVBQzNDLGFBQWEsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEVBQzNDLFVBQVUsRUFDVixJQUFJLENBQUMsZUFBZSxFQUNwQixRQUFRLEVBQ1IsSUFBSSxDQUFDLGVBQWUsRUFDcEIsSUFBSSxDQUFDLG9CQUFvQixFQUN6QixJQUFJLENBQUMsaUJBQWlCLEVBQ3RCLElBQUksQ0FBQywwQkFBMEIsQ0FDL0IsQ0FBQztvQkFDRiwwREFBMEQ7b0JBQzFELGlIQUFpSDtvQkFDakgsNkJBQTZCO29CQUM3QixNQUFNLFNBQVMsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO29CQUN2QyxPQUFPLFNBQVMsQ0FBQztnQkFDbEIsQ0FBQztnQkFDRCxLQUFLLFdBQVcsQ0FBQyxDQUFDLENBQUM7b0JBQ2xCLE9BQU8sSUFBSSw4QkFBOEIsQ0FDeEMsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUM1QixJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQzVCLGFBQWEsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEVBQzNDLGFBQWEsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEVBQzNDLFdBQVcsRUFBRSxJQUFJLENBQUMsZUFBZSxFQUNqQyxRQUFRLEVBQ1IsSUFBSSxDQUFDLGVBQWUsRUFDcEIsSUFBSSxDQUFDLG9CQUFvQixFQUN6QixJQUFJLENBQUMsaUJBQWlCLEVBQ3RCLElBQUksQ0FBQywwQkFBMEIsQ0FDL0IsQ0FBQztnQkFDSCxDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixjQUFjLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRWxELE9BQU8sVUFBVSxDQUFDO0lBQ25CLENBQUM7Q0FFRDtBQUdEOztHQUVHO0FBQ0gsTUFBTSxVQUFVLGFBQWEsQ0FBQyxRQUEyQixFQUFFLFFBQTJCLEVBQUUsVUFBdUI7SUFDOUcsTUFBTSxPQUFPLEdBQUcsVUFBVSxDQUFDLE9BQU8sQ0FBQztJQUNuQyxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsVUFBVSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDeEQseURBQXlEO1FBQ3pELE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN4QixNQUFNLElBQUksR0FBRyxPQUFPLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQzVCLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUM7UUFDN0IsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQztRQUU3QixJQUNDLElBQUksQ0FBQyxjQUFjLEtBQUssQ0FBQztlQUN0QixJQUFJLENBQUMsY0FBYyxLQUFLLENBQUM7ZUFDekIsSUFBSSxDQUFDLGFBQWEsS0FBSyxDQUFDLEdBQUcsQ0FBQztlQUM1QixJQUFJLENBQUMsY0FBYyxLQUFLLENBQUM7ZUFDekIsSUFBSSxDQUFDLGFBQWEsS0FBSyxDQUFDLEdBQUcsQ0FBQztlQUM1QixJQUFJLENBQUMsY0FBYyxLQUFLLENBQUM7ZUFDekIsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxZQUFZLEVBQUUsS0FBSyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxZQUFZLEVBQUU7ZUFDekUsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsWUFBWSxFQUFFLEtBQUssUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxZQUFZLEVBQUUsRUFDM0UsQ0FBQztZQUNGLGlCQUFpQjtZQUNqQixJQUFJLENBQUMsYUFBYSxHQUFHLENBQUMsQ0FBQztZQUN2QixJQUFJLENBQUMsY0FBYyxHQUFHLENBQUMsQ0FBQztZQUN4QixJQUFJLENBQUMsYUFBYSxHQUFHLENBQUMsQ0FBQztZQUN2QixJQUFJLENBQUMsY0FBYyxHQUFHLENBQUMsQ0FBQztZQUV4QixJQUFJLENBQUMsYUFBYSxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDM0IsSUFBSSxDQUFDLGNBQWMsR0FBRyxDQUFDLENBQUM7WUFDeEIsSUFBSSxDQUFDLGFBQWEsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQzNCLElBQUksQ0FBQyxjQUFjLEdBQUcsQ0FBQyxDQUFDO1lBRXhCLENBQUMsRUFBRSxDQUFDO1FBQ0wsQ0FBQztJQUNGLENBQUM7QUFDRixDQUFDO0FBZ0JELFNBQVMsT0FBTyxDQUFDLFlBQTRCLEVBQUUsVUFBdUMsRUFBRSxLQUErQjtJQUN0SCxJQUFJLFlBQVksQ0FBQyxNQUFNLEtBQUssVUFBVSxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQy9DLE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUNELE1BQU0sYUFBYSxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDO0lBQzlDLE1BQU0sYUFBYSxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDO0lBQzlDLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxVQUFVLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDNUMsTUFBTSxDQUFDLEdBQUcsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzFCLE1BQU0sQ0FBQyxHQUFHLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN4QixJQUFJLENBQUMsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ3ZCLE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUNELFFBQVEsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ2hCLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQztnQkFDZixJQUFJLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLENBQUMsTUFBTSxLQUFLLENBQUMsQ0FBQyxRQUFRLEVBQUUsTUFBTSxFQUFFLENBQUM7b0JBQzVFLE9BQU8sS0FBSyxDQUFDO2dCQUNkLENBQUM7Z0JBQ0QsU0FBUztZQUNWLENBQUM7WUFDRCxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUM7Z0JBQ2YsSUFBSSxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLE1BQU0sS0FBSyxDQUFDLENBQUMsUUFBUSxFQUFFLE1BQU0sRUFBRSxDQUFDO29CQUM1RSxPQUFPLEtBQUssQ0FBQztnQkFDZCxDQUFDO2dCQUNELFNBQVM7WUFDVixDQUFDO1lBQ0QsT0FBTyxDQUFDLENBQUMsQ0FBQztnQkFDVCxJQUFJLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLENBQUMsTUFBTSxLQUFLLENBQUMsQ0FBQyxRQUFRLEVBQUUsTUFBTSxFQUFFLENBQUM7b0JBQzVFLE9BQU8sS0FBSyxDQUFDO2dCQUNkLENBQUM7Z0JBQ0QsSUFBSSxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLE1BQU0sS0FBSyxDQUFDLENBQUMsUUFBUSxFQUFFLE1BQU0sRUFBRSxDQUFDO29CQUM1RSxPQUFPLEtBQUssQ0FBQztnQkFDZCxDQUFDO2dCQUNELFNBQVM7WUFDVixDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFRCxPQUFPLElBQUksQ0FBQztBQUNiLENBQUM7QUFDRCxNQUFNLE9BQWdCLDJCQUE0QixTQUFRLG1CQUFtQjtJQUM1RSxZQUNDLFdBQTRCLEVBQzVCLFdBQTRCLEVBQzVCLFdBQTRCLEVBQ1osSUFBdUMsRUFDdkMsYUFBZ0QsRUFDekQsSUFBb0MsRUFDM0MsV0FBNkM7UUFFN0MsS0FBSyxDQUFDLFdBQVcsRUFBRSxXQUFXLEVBQUUsV0FBVyxFQUFFLFNBQVMsRUFBRSxXQUFXLENBQUMsQ0FBQztRQUxyRCxTQUFJLEdBQUosSUFBSSxDQUFtQztRQUN2QyxrQkFBYSxHQUFiLGFBQWEsQ0FBbUM7UUFDekQsU0FBSSxHQUFKLElBQUksQ0FBZ0M7SUFJNUMsQ0FBQztDQUNEO0FBRUQsTUFBTSwrQkFBZ0MsU0FBUSwyQkFBMkI7SUFDeEUsWUFDQyxXQUE0QixFQUM1QixXQUE0QixFQUM1QixJQUF1QyxFQUN2QyxhQUFnRDtRQUVoRCxLQUFLLENBQUMsV0FBVyxFQUFFLFdBQVcsRUFBRSxXQUFXLElBQUksV0FBVyxFQUFFLElBQUksRUFBRSxhQUFhLEVBQUUsTUFBTSxFQUFFO1lBQ3hGLENBQUMsdUJBQXVCLENBQUMsR0FBRyxDQUFDLEVBQUUsTUFBTTtZQUNyQyxDQUFDLDZCQUE2QixDQUFDLEdBQUcsQ0FBQyxFQUFFLElBQUk7U0FDekMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztDQUNEO0FBRUQsTUFBTSxtQ0FBb0MsU0FBUSwyQkFBMkI7SUFDNUUsWUFDQyxXQUE0QixFQUM1QixXQUE0QixFQUM1QixJQUF1QyxFQUN2QyxhQUFnRDtRQUVoRCxLQUFLLENBQUMsV0FBVyxFQUFFLFdBQVcsRUFBRSxXQUFXLElBQUksV0FBVyxFQUFFLElBQUksRUFBRSxhQUFhLEVBQUUsVUFBVSxFQUFFO1lBQzVGLENBQUMsdUJBQXVCLENBQUMsR0FBRyxDQUFDLEVBQUUsVUFBVTtZQUN6QyxDQUFDLDZCQUE2QixDQUFDLEdBQUcsQ0FBQyxFQUFFLElBQUk7U0FDekMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztDQUNEO0FBRUQsTUFBTSxpQ0FBa0MsU0FBUSwyQkFBMkI7SUFDMUUsWUFDQyxXQUE0QixFQUM1QixXQUE0QixFQUM1QixJQUF1QyxFQUN2QyxhQUFnRDtRQUVoRCxLQUFLLENBQUMsV0FBVyxFQUFFLFdBQVcsRUFBRSxXQUFXLElBQUksV0FBVyxFQUFFLElBQUksRUFBRSxhQUFhLEVBQUUsUUFBUSxFQUFFO1lBQzFGLENBQUMsdUJBQXVCLENBQUMsR0FBRyxDQUFDLEVBQUUsUUFBUTtZQUN2QyxDQUFDLDZCQUE2QixDQUFDLEdBQUcsQ0FBQyxFQUFFLElBQUk7U0FDekMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztDQUNEIn0=