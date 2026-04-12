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
import { ActionViewItem } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, debouncedObservable, observableFromEvent, observableValue } from '../../../../../../base/common/observable.js';
import { basename } from '../../../../../../base/common/resources.js';
import { assertType } from '../../../../../../base/common/types.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { LineRange } from '../../../../../../editor/common/core/ranges/lineRange.js';
import { nullDocumentDiff } from '../../../../../../editor/common/diff/documentDiffProvider.js';
import { PrefixSumComputer } from '../../../../../../editor/common/model/prefixSumComputer.js';
import { localize } from '../../../../../../nls.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { MenuId } from '../../../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { NotebookDeletedCellDecorator } from '../../../../notebook/browser/diff/inlineDiff/notebookDeletedCellDecorator.js';
import { NotebookInsertedCellDecorator } from '../../../../notebook/browser/diff/inlineDiff/notebookInsertedCellDecorator.js';
import { NotebookModifiedCellDecorator } from '../../../../notebook/browser/diff/inlineDiff/notebookModifiedCellDecorator.js';
import { CellEditState, getNotebookEditorFromEditorPane } from '../../../../notebook/browser/notebookBrowser.js';
import { INotebookEditorService } from '../../../../notebook/browser/services/notebookEditorService.js';
import { CellKind } from '../../../../notebook/common/notebookCommon.js';
import { ChatEditingCodeEditorIntegration } from '../chatEditingCodeEditorIntegration.js';
import { countChanges, sortCellChanges } from './notebookCellChanges.js';
import { OverlayToolbarDecorator } from './overlayToolbarDecorator.js';
let ChatEditingNotebookEditorIntegration = class ChatEditingNotebookEditorIntegration extends Disposable {
    constructor(_entry, editor, notebookModel, originalModel, cellChanges, instantiationService) {
        super();
        this.instantiationService = instantiationService;
        const notebookEditor = getNotebookEditorFromEditorPane(editor);
        assertType(notebookEditor);
        this.notebookEditor = notebookEditor;
        this.integration = this.instantiationService.createInstance(ChatEditingNotebookEditorWidgetIntegration, _entry, notebookEditor, notebookModel, originalModel, cellChanges);
        this._register(editor.onDidChangeControl(() => {
            const notebookEditor = getNotebookEditorFromEditorPane(editor);
            if (notebookEditor && notebookEditor !== this.notebookEditor) {
                this.notebookEditor = notebookEditor;
                this.integration.dispose();
                this.integration = this.instantiationService.createInstance(ChatEditingNotebookEditorWidgetIntegration, _entry, notebookEditor, notebookModel, originalModel, cellChanges);
            }
        }));
    }
    get currentIndex() {
        return this.integration.currentIndex;
    }
    reveal(firstOrLast) {
        return this.integration.reveal(firstOrLast);
    }
    next(wrap) {
        return this.integration.next(wrap);
    }
    previous(wrap) {
        return this.integration.previous(wrap);
    }
    enableAccessibleDiffView() {
        this.integration.enableAccessibleDiffView();
    }
    acceptNearestChange(change) {
        return this.integration.acceptNearestChange(change);
    }
    rejectNearestChange(change) {
        return this.integration.rejectNearestChange(change);
    }
    toggleDiff(change, show) {
        return this.integration.toggleDiff(change, show);
    }
    dispose() {
        this.integration.dispose();
        super.dispose();
    }
};
ChatEditingNotebookEditorIntegration = __decorate([
    __param(5, IInstantiationService)
], ChatEditingNotebookEditorIntegration);
export { ChatEditingNotebookEditorIntegration };
let ChatEditingNotebookEditorWidgetIntegration = class ChatEditingNotebookEditorWidgetIntegration extends Disposable {
    constructor(_entry, notebookEditor, notebookModel, originalModel, cellChanges, instantiationService, _editorService, notebookEditorService, accessibilitySignalService, logService) {
        super();
        this._entry = _entry;
        this.notebookEditor = notebookEditor;
        this.notebookModel = notebookModel;
        this.cellChanges = cellChanges;
        this.instantiationService = instantiationService;
        this._editorService = _editorService;
        this.accessibilitySignalService = accessibilitySignalService;
        this.logService = logService;
        this._currentIndex = observableValue(this, -1);
        this.currentIndex = this._currentIndex;
        this.cellEditorIntegrations = new Map();
        this.markdownEditState = observableValue(this, '');
        this.markupCellListeners = new Map();
        this.sortedCellChanges = [];
        this.changeIndexComputer = new PrefixSumComputer(new Uint32Array(0));
        const onDidChangeVisibleRanges = debouncedObservable(observableFromEvent(notebookEditor.onDidChangeVisibleRanges, () => notebookEditor.visibleRanges), 50);
        this._register(toDisposable(() => {
            this.markupCellListeners.forEach((v) => v.dispose());
        }));
        let originalReadonly = undefined;
        const shouldBeReadonly = _entry.isCurrentlyBeingModifiedBy.map(value => !!value);
        this._register(autorun(r => {
            const isReadOnly = shouldBeReadonly.read(r);
            const notebookEditor = notebookEditorService.retrieveExistingWidgetFromURI(_entry.modifiedURI)?.value;
            if (!notebookEditor) {
                return;
            }
            if (isReadOnly) {
                originalReadonly ??= notebookEditor.isReadOnly;
                notebookEditor.setOptions({ isReadOnly: true });
            }
            else if (originalReadonly === false) {
                notebookEditor.setOptions({ isReadOnly: false });
                // Ensure all cells area editable.
                // We make use of chatEditingCodeEditorIntegration to handle cell diffing and navigation.
                // However that also makes the cell read-only. We need to ensure that the cell is editable.
                // E.g. first we make notebook readonly (in here), then cells end up being readonly because notebook is readonly.
                // Then chatEditingCodeEditorIntegration makes cells readonly and keeps track of the original readonly state.
                // However the cell is already readonly because the notebook is readonly.
                // So when we restore the notebook to editable (in here), the cell is made editable again.
                // But when chatEditingCodeEditorIntegration attempts to restore, it will restore the original readonly state.
                // & from the perpspective of chatEditingCodeEditorIntegration, the cell was readonly & should continue to be readonly.
                // To get around this, we wait for a few ms before restoring the original readonly state for each cell.
                const timeout = setTimeout(() => {
                    notebookEditor.setOptions({ isReadOnly: true });
                    notebookEditor.setOptions({ isReadOnly: false });
                    disposable.dispose();
                }, 100);
                const disposable = toDisposable(() => clearTimeout(timeout));
                r.store.add(disposable);
            }
        }));
        // INIT when not streaming nor diffing the response anymore, once per request, and when having changes
        let lastModifyingRequestId;
        this._store.add(autorun(r => {
            if (!_entry.isCurrentlyBeingModifiedBy.read(r)
                && !_entry.isProcessingResponse.read(r)
                && lastModifyingRequestId !== _entry.lastModifyingRequestId
                && cellChanges.read(r).some(c => c.type !== 'unchanged' && !c.diff.read(r).identical)) {
                lastModifyingRequestId = _entry.lastModifyingRequestId;
                // Check if any of the changes are visible, if not, reveal the first change.
                const visibleChange = this.sortedCellChanges.find(c => {
                    if (c.type === 'unchanged') {
                        return false;
                    }
                    const index = c.modifiedCellIndex ?? c.originalCellIndex;
                    return this.notebookEditor.visibleRanges.some(range => index >= range.start && index < range.end);
                });
                if (!visibleChange) {
                    this.reveal(true);
                }
            }
        }));
        this._register(autorun(r => {
            this.sortedCellChanges = sortCellChanges(cellChanges.read(r));
            const indexes = [];
            for (const change of this.sortedCellChanges) {
                indexes.push(change.type === 'insert' || change.type === 'delete' ? 1
                    : change.type === 'modified' ? change.diff.read(r).changes.length
                        : 0);
            }
            this.changeIndexComputer = new PrefixSumComputer(new Uint32Array(indexes));
            if (this.changeIndexComputer.getTotalSum() === 0) {
                this.revertMarkupCellState();
            }
        }));
        // Build cell integrations (responsible for navigating changes within a cell and decorating cell text changes)
        this._register(autorun(r => {
            if (this.notebookEditor.textModel !== this.notebookModel) {
                return;
            }
            const sortedCellChanges = sortCellChanges(cellChanges.read(r));
            const changes = sortedCellChanges.filter(c => c.type !== 'delete');
            onDidChangeVisibleRanges.read(r);
            if (!changes.length) {
                this.cellEditorIntegrations.forEach(({ diff }) => {
                    diff.set({ ...diff.read(undefined), ...nullDocumentDiff }, undefined);
                });
                return;
            }
            this.markdownEditState.read(r);
            const validCells = new Set();
            changes.forEach((change) => {
                if (change.modifiedCellIndex === undefined || change.modifiedCellIndex >= notebookModel.cells.length) {
                    return;
                }
                const cell = notebookModel.cells[change.modifiedCellIndex];
                const editor = notebookEditor.codeEditors.find(([vm,]) => vm.handle === notebookModel.cells[change.modifiedCellIndex].handle)?.[1];
                const modifiedModel = change.modifiedModel.promiseResult.read(r)?.data;
                const originalModel = change.originalModel.promiseResult.read(r)?.data;
                if (!cell || !originalModel || !modifiedModel) {
                    return;
                }
                if (cell.cellKind === CellKind.Markup && !this.markupCellListeners.has(cell.handle)) {
                    const cellModel = this.notebookEditor.getViewModel()?.viewCells.find(c => c.handle === cell.handle);
                    if (cellModel) {
                        const listener = cellModel.onDidChangeState((e) => {
                            if (e.editStateChanged) {
                                setTimeout(() => this.markdownEditState.set(cellModel.handle + '-' + cellModel.getEditState(), undefined), 0);
                            }
                        });
                        this.markupCellListeners.set(cell.handle, listener);
                    }
                }
                if (!editor) {
                    return;
                }
                const diff = {
                    ...change.diff.read(r),
                    modifiedModel,
                    originalModel,
                    keep: change.keep,
                    undo: change.undo
                };
                validCells.add(cell);
                const currentDiff = this.cellEditorIntegrations.get(cell);
                if (currentDiff) {
                    // Do not unnecessarily trigger a change event
                    if (!areDocumentDiff2Equal(currentDiff.diff.read(undefined), diff)) {
                        currentDiff.diff.set(diff, undefined);
                    }
                }
                else {
                    const diff2 = observableValue(`diff${cell.handle}`, diff);
                    const integration = this.instantiationService.createInstance(ChatEditingCodeEditorIntegration, _entry, editor, diff2, true);
                    this.cellEditorIntegrations.set(cell, { integration, diff: diff2 });
                    this._register(integration);
                    this._register(editor.onDidDispose(() => {
                        this.cellEditorIntegrations.get(cell)?.integration.dispose();
                        this.cellEditorIntegrations.delete(cell);
                    }));
                    this._register(editor.onDidChangeModel(() => {
                        if (editor.getModel() !== cell.textModel) {
                            this.cellEditorIntegrations.get(cell)?.integration.dispose();
                            this.cellEditorIntegrations.delete(cell);
                        }
                    }));
                }
            });
            // Dispose old integrations as the editors are no longer valid.
            this.cellEditorIntegrations.forEach((v, cell) => {
                if (!validCells.has(cell)) {
                    v.integration.dispose();
                    this.cellEditorIntegrations.delete(cell);
                }
            });
        }));
        const cellsAreVisible = onDidChangeVisibleRanges.map(v => v.length > 0);
        const debouncedChanges = debouncedObservable(cellChanges, 10);
        this._register(autorun(r => {
            if (this.notebookEditor.textModel !== this.notebookModel || !cellsAreVisible.read(r) || !this.notebookEditor.getViewModel()) {
                return;
            }
            // We can have inserted cells that have been accepted, in those cases we do not want any decorators on them.
            const changes = debouncedChanges.read(r).filter(c => c.type === 'insert' ? !c.diff.read(r).identical : true);
            const modifiedChanges = changes.filter(c => c.type === 'modified');
            this.createDecorators();
            // If all cells are just inserts, then no need to show any decorations.
            if (changes.every(c => c.type === 'insert')) {
                this.insertedCellDecorator?.apply([]);
                this.modifiedCellDecorator?.apply([]);
                this.deletedCellDecorator?.apply([], originalModel);
                this.overlayToolbarDecorator?.decorate([]);
            }
            else {
                this.insertedCellDecorator?.apply(changes);
                this.modifiedCellDecorator?.apply(modifiedChanges);
                this.deletedCellDecorator?.apply(changes, originalModel);
                this.overlayToolbarDecorator?.decorate(changes.filter(c => c.type === 'insert' || c.type === 'modified'));
            }
        }));
    }
    getCurrentChange() {
        const currentIndex = Math.min(this._currentIndex.get(), this.changeIndexComputer.getTotalSum() - 1);
        const index = this.changeIndexComputer.getIndexOf(currentIndex);
        const change = this.sortedCellChanges[index.index];
        return change ? { change, index: index.remainder } : undefined;
    }
    updateCurrentIndex(change, indexInCell = 0) {
        const index = this.sortedCellChanges.indexOf(change);
        const changeIndex = this.changeIndexComputer.getPrefixSum(index - 1);
        const currentIndex = Math.min(changeIndex + indexInCell, this.changeIndexComputer.getTotalSum() - 1);
        this._currentIndex.set(currentIndex, undefined);
    }
    createDecorators() {
        const cellChanges = this.cellChanges.get();
        const accessibilitySignalService = this.accessibilitySignalService;
        this.insertedCellDecorator ??= this._register(this.instantiationService.createInstance(NotebookInsertedCellDecorator, this.notebookEditor));
        this.modifiedCellDecorator ??= this._register(this.instantiationService.createInstance(NotebookModifiedCellDecorator, this.notebookEditor));
        this.overlayToolbarDecorator ??= this._register(this.instantiationService.createInstance(OverlayToolbarDecorator, this.notebookEditor, this.notebookModel));
        if (this.deletedCellDecorator) {
            this._store.delete(this.deletedCellDecorator);
            this.deletedCellDecorator.dispose();
        }
        this.deletedCellDecorator = this._register(this.instantiationService.createInstance(NotebookDeletedCellDecorator, this.notebookEditor, {
            className: 'chat-diff-change-content-widget',
            telemetrySource: 'chatEditingNotebookHunk',
            menuId: MenuId.ChatEditingEditorHunk,
            actionViewItemProvider: (action, options) => {
                if (!action.class) {
                    return new class extends ActionViewItem {
                        constructor() {
                            super(undefined, action, { ...options, keybindingNotRenderedWithLabel: true /* hide keybinding for actions without icon */, icon: false, label: true });
                        }
                    };
                }
                return undefined;
            },
            argFactory: (deletedCellIndex) => {
                return {
                    accept() {
                        const entry = cellChanges.find(c => c.type === 'delete' && c.originalCellIndex === deletedCellIndex);
                        if (entry) {
                            return entry.keep(entry.diff.get().changes[0]);
                        }
                        accessibilitySignalService.playSignal(AccessibilitySignal.editsKept, { allowManyInParallel: true });
                        return Promise.resolve(true);
                    },
                    reject() {
                        const entry = cellChanges.find(c => c.type === 'delete' && c.originalCellIndex === deletedCellIndex);
                        if (entry) {
                            return entry.undo(entry.diff.get().changes[0]);
                        }
                        accessibilitySignalService.playSignal(AccessibilitySignal.editsUndone, { allowManyInParallel: true });
                        return Promise.resolve(true);
                    },
                };
            }
        }));
    }
    getCell(modifiedCellIndex) {
        const cell = this.notebookModel.cells[modifiedCellIndex];
        const integration = this.cellEditorIntegrations.get(cell)?.integration;
        return integration;
    }
    reveal(firstOrLast) {
        const changes = this.sortedCellChanges.filter(c => c.type !== 'unchanged');
        if (!changes.length) {
            return;
        }
        const change = firstOrLast ? changes[0] : changes[changes.length - 1];
        this._revealFirstOrLast(change, firstOrLast);
    }
    _revealFirstOrLast(change, firstOrLast = true) {
        switch (change.type) {
            case 'insert':
            case 'modified':
                {
                    this.blur(this.getCurrentChange()?.change);
                    const index = firstOrLast || change.type === 'insert' ? 0 : change.diff.get().changes.length - 1;
                    return this._revealChange(change, index);
                }
            case 'delete':
                this.blur(this.getCurrentChange()?.change);
                // reveal the deleted cell decorator
                this.deletedCellDecorator?.reveal(change.originalCellIndex);
                this.updateCurrentIndex(change);
                return true;
            default:
                break;
        }
        return false;
    }
    _revealChange(change, indexInCell) {
        switch (change.type) {
            case 'insert':
            case 'modified':
                {
                    const textChange = change.diff.get().changes[indexInCell];
                    const cellViewModel = this.getCellViewModel(change);
                    if (cellViewModel) {
                        this.updateCurrentIndex(change, indexInCell);
                        this.revealChangeInView(cellViewModel, textChange?.modified, change)
                            .catch(err => { this.logService.warn(`Error revealing change in view: ${err}`); });
                        return true;
                    }
                    break;
                }
            case 'delete':
                this.updateCurrentIndex(change);
                // reveal the deleted cell decorator
                this.deletedCellDecorator?.reveal(change.originalCellIndex);
                return true;
            default:
                break;
        }
        return false;
    }
    getCellViewModel(change) {
        if (change.type === 'delete' || change.modifiedCellIndex === undefined || change.modifiedCellIndex >= this.notebookModel.cells.length) {
            return undefined;
        }
        const cell = this.notebookModel.cells[change.modifiedCellIndex];
        const cellViewModel = this.notebookEditor.getViewModel()?.viewCells.find(c => c.handle === cell.handle);
        return cellViewModel;
    }
    async revealChangeInView(cell, lines, change) {
        const targetLines = lines ?? new LineRange(0, 0);
        if (change.type === 'modified' && cell.cellKind === CellKind.Markup && cell.getEditState() === CellEditState.Preview) {
            cell.updateEditState(CellEditState.Editing, 'chatEditNavigation');
        }
        const focusTarget = cell.cellKind === CellKind.Code || change.type === 'modified' ? 'editor' : 'container';
        await this.notebookEditor.focusNotebookCell(cell, focusTarget, { focusEditorLine: targetLines.startLineNumber });
        await this.notebookEditor.revealRangeInCenterAsync(cell, new Range(targetLines.startLineNumber, 0, targetLines.endLineNumberExclusive, 0));
    }
    revertMarkupCellState() {
        for (const change of this.sortedCellChanges) {
            const cellViewModel = this.getCellViewModel(change);
            if (cellViewModel?.cellKind === CellKind.Markup && cellViewModel.getEditState() === CellEditState.Editing &&
                (cellViewModel.editStateSource === 'chatEditNavigation' || cellViewModel.editStateSource === 'chatEdit')) {
                cellViewModel.updateEditState(CellEditState.Preview, 'chatEdit');
            }
        }
    }
    blur(change) {
        if (!change) {
            return;
        }
        const cellViewModel = this.getCellViewModel(change);
        if (cellViewModel?.cellKind === CellKind.Markup && cellViewModel.getEditState() === CellEditState.Editing && cellViewModel.editStateSource === 'chatEditNavigation') {
            cellViewModel.updateEditState(CellEditState.Preview, 'chatEditNavigation');
        }
    }
    next(wrap) {
        const changes = this.sortedCellChanges.filter(c => c.type !== 'unchanged');
        const currentChange = this.getCurrentChange();
        if (!currentChange) {
            const firstChange = changes[0];
            if (firstChange) {
                return this._revealFirstOrLast(firstChange);
            }
            return false;
        }
        // go to next
        // first check if we are at the end of the current change
        switch (currentChange.change.type) {
            case 'modified':
                {
                    const cellIntegration = this.getCell(currentChange.change.modifiedCellIndex);
                    if (cellIntegration) {
                        if (cellIntegration.next(false)) {
                            this.updateCurrentIndex(currentChange.change, cellIntegration.currentIndex.get());
                            return true;
                        }
                    }
                    const isLastChangeInCell = currentChange.index >= lastChangeIndex(currentChange.change);
                    const index = isLastChangeInCell ? 0 : currentChange.index + 1;
                    const change = isLastChangeInCell ? changes[changes.indexOf(currentChange.change) + 1] : currentChange.change;
                    if (change) {
                        if (isLastChangeInCell) {
                            this.blur(currentChange.change);
                        }
                        if (this._revealChange(change, index)) {
                            return true;
                        }
                    }
                }
                break;
            case 'insert':
            case 'delete':
                {
                    this.blur(currentChange.change);
                    // go to next change directly
                    const nextChange = changes[changes.indexOf(currentChange.change) + 1];
                    if (nextChange && this._revealFirstOrLast(nextChange, true)) {
                        return true;
                    }
                }
                break;
            default:
                break;
        }
        if (wrap) {
            const firstChange = changes[0];
            if (firstChange) {
                return this._revealFirstOrLast(firstChange, true);
            }
        }
        return false;
    }
    previous(wrap) {
        const changes = this.sortedCellChanges.filter(c => c.type !== 'unchanged');
        const currentChange = this.getCurrentChange();
        if (!currentChange) {
            const lastChange = changes[changes.length - 1];
            if (lastChange) {
                return this._revealFirstOrLast(lastChange, false);
            }
            return false;
        }
        // go to previous
        // first check if we are at the start of the current change
        switch (currentChange.change.type) {
            case 'modified':
                {
                    const cellIntegration = this.getCell(currentChange.change.modifiedCellIndex);
                    if (cellIntegration) {
                        if (cellIntegration.previous(false)) {
                            this.updateCurrentIndex(currentChange.change, cellIntegration.currentIndex.get());
                            return true;
                        }
                    }
                    const isFirstChangeInCell = currentChange.index <= 0;
                    const change = isFirstChangeInCell ? changes[changes.indexOf(currentChange.change) - 1] : currentChange.change;
                    if (change) {
                        const index = isFirstChangeInCell ? lastChangeIndex(change) : currentChange.index - 1;
                        if (isFirstChangeInCell) {
                            this.blur(currentChange.change);
                        }
                        if (this._revealChange(change, index)) {
                            return true;
                        }
                    }
                }
                break;
            case 'insert':
            case 'delete':
                {
                    this.blur(currentChange.change);
                    // go to previous change directly
                    const prevChange = changes[changes.indexOf(currentChange.change) - 1];
                    if (prevChange && this._revealFirstOrLast(prevChange, false)) {
                        return true;
                    }
                }
                break;
            default:
                break;
        }
        if (wrap) {
            const lastChange = changes[changes.length - 1];
            if (lastChange) {
                return this._revealFirstOrLast(lastChange, false);
            }
        }
        return false;
    }
    enableAccessibleDiffView() {
        const cell = this.notebookEditor.getActiveCell()?.model;
        if (cell) {
            const integration = this.cellEditorIntegrations.get(cell)?.integration;
            integration?.enableAccessibleDiffView();
        }
    }
    getfocusedIntegration() {
        const first = this.notebookEditor.getSelectionViewModels()[0];
        if (first) {
            return this.cellEditorIntegrations.get(first.model)?.integration;
        }
        return undefined;
    }
    async acceptNearestChange(hunk) {
        if (hunk) {
            await hunk.accept();
        }
        else {
            const current = this.getCurrentChange();
            const focused = this.getfocusedIntegration();
            // delete changes can't be focused
            if (current && !focused || current?.change.type === 'delete') {
                current.change.keep(current?.change.diff.get().changes[current.index]);
            }
            else if (focused) {
                await focused.acceptNearestChange();
            }
            this._currentIndex.set(this._currentIndex.get() - 1, undefined);
            this.next(true);
        }
    }
    async rejectNearestChange(hunk) {
        if (hunk) {
            await hunk.reject();
        }
        else {
            const current = this.getCurrentChange();
            const focused = this.getfocusedIntegration();
            // delete changes can't be focused
            if (current && !focused || current?.change.type === 'delete') {
                current.change.undo(current.change.diff.get().changes[current.index]);
            }
            else if (focused) {
                await focused.rejectNearestChange();
            }
            this._currentIndex.set(this._currentIndex.get() - 1, undefined);
            this.next(true);
        }
    }
    async toggleDiff(_change, _show) {
        const diffInput = {
            original: { resource: this._entry.originalURI },
            modified: { resource: this._entry.modifiedURI },
            label: localize('diff.generic', '{0} (changes from chat)', basename(this._entry.modifiedURI))
        };
        await this._editorService.openEditor(diffInput);
    }
};
ChatEditingNotebookEditorWidgetIntegration = __decorate([
    __param(5, IInstantiationService),
    __param(6, IEditorService),
    __param(7, INotebookEditorService),
    __param(8, IAccessibilitySignalService),
    __param(9, ILogService)
], ChatEditingNotebookEditorWidgetIntegration);
export class ChatEditingNotebookDiffEditorIntegration extends Disposable {
    constructor(notebookDiffEditor, cellChanges) {
        super();
        this.notebookDiffEditor = notebookDiffEditor;
        this.cellChanges = cellChanges;
        this._currentIndex = observableValue(this, -1);
        this.currentIndex = this._currentIndex;
        this._store.add(autorun(r => {
            const index = notebookDiffEditor.currentChangedIndex.read(r);
            const numberOfCellChanges = cellChanges.read(r).filter(c => !c.diff.read(r).identical);
            if (numberOfCellChanges.length && index >= 0 && index < numberOfCellChanges.length) {
                // Notebook Diff editor only supports navigating through changes to cells.
                // However in chat we take changes to lines in the cells into account.
                // So if we're on the second cell and first cell has 3 changes, then we're on the 4th change.
                const changesSoFar = countChanges(numberOfCellChanges.slice(0, index + 1));
                this._currentIndex.set(changesSoFar - 1, undefined);
            }
            else {
                this._currentIndex.set(-1, undefined);
            }
        }));
    }
    reveal(firstOrLast) {
        const changes = sortCellChanges(this.cellChanges.get().filter(c => c.type !== 'unchanged'));
        if (!changes.length) {
            return undefined;
        }
        if (firstOrLast) {
            this.notebookDiffEditor.firstChange();
        }
        else {
            this.notebookDiffEditor.lastChange();
        }
    }
    next(_wrap) {
        const changes = this.cellChanges.get().filter(c => !c.diff.get().identical).length;
        if (this.notebookDiffEditor.currentChangedIndex.get() === changes - 1) {
            return false;
        }
        this.notebookDiffEditor.nextChange();
        return true;
    }
    previous(_wrap) {
        const changes = this.cellChanges.get().filter(c => !c.diff.get().identical).length;
        if (this.notebookDiffEditor.currentChangedIndex.get() === changes - 1) {
            return false;
        }
        this.notebookDiffEditor.nextChange();
        return true;
    }
    enableAccessibleDiffView() {
        //
    }
    async acceptNearestChange(change) {
        await change.accept();
        this.next(true);
    }
    async rejectNearestChange(change) {
        await change.reject();
        this.next(true);
    }
    async toggleDiff(_change, _show) {
        //
    }
}
function areDocumentDiff2Equal(diff1, diff2) {
    if (diff1.changes !== diff2.changes) {
        return false;
    }
    if (diff1.identical !== diff2.identical) {
        return false;
    }
    if (diff1.moves !== diff2.moves) {
        return false;
    }
    if (diff1.originalModel !== diff2.originalModel) {
        return false;
    }
    if (diff1.modifiedModel !== diff2.modifiedModel) {
        return false;
    }
    if (diff1.keep !== diff2.keep) {
        return false;
    }
    if (diff1.undo !== diff2.undo) {
        return false;
    }
    if (diff1.quitEarly !== diff2.quitEarly) {
        return false;
    }
    return true;
}
function lastChangeIndex(change) {
    if (change.type === 'modified') {
        return change.diff.get().changes.length - 1;
    }
    return 0;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEVkaXRpbmdOb3RlYm9va0VkaXRvckludGVncmF0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXRFZGl0aW5nL25vdGVib29rL2NoYXRFZGl0aW5nTm90ZWJvb2tFZGl0b3JJbnRlZ3JhdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sZ0VBQWdFLENBQUM7QUFDaEcsT0FBTyxFQUFFLFVBQVUsRUFBZSxZQUFZLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsT0FBTyxFQUFFLG1CQUFtQixFQUFvQyxtQkFBbUIsRUFBRSxlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNuSyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDdEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUN0RSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDckYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sOERBQThELENBQUM7QUFDaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDL0YsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3BELE9BQU8sRUFBRSxtQkFBbUIsRUFBRSwyQkFBMkIsRUFBRSxNQUFNLHNGQUFzRixDQUFDO0FBQ3hKLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUM5RSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6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