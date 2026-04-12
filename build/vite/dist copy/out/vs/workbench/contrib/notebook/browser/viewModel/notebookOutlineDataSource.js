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
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IMarkerService } from '../../../../../platform/markers/common/markers.js';
import { CellKind } from '../../common/notebookCommon.js';
import { INotebookOutlineEntryFactory } from './notebookOutlineEntryFactory.js';
let NotebookCellOutlineDataSource = class NotebookCellOutlineDataSource {
    constructor(_editor, _markerService, _configurationService, _outlineEntryFactory) {
        this._editor = _editor;
        this._markerService = _markerService;
        this._configurationService = _configurationService;
        this._outlineEntryFactory = _outlineEntryFactory;
        this._disposables = new DisposableStore();
        this._onDidChange = new Emitter();
        this.onDidChange = this._onDidChange.event;
        this._entries = [];
        this.recomputeState();
    }
    get activeElement() {
        return this._activeEntry;
    }
    get entries() {
        return this._entries;
    }
    get isEmpty() {
        return this._entries.length === 0;
    }
    get uri() {
        return this._uri;
    }
    async computeFullSymbols(cancelToken) {
        try {
            const notebookEditorWidget = this._editor;
            const notebookCells = notebookEditorWidget?.getViewModel()?.viewCells.filter((cell) => cell.cellKind === CellKind.Code);
            if (notebookCells) {
                const promises = [];
                // limit the number of cells so that we don't resolve an excessive amount of text models
                for (const cell of notebookCells.slice(0, 50)) {
                    // gather all symbols asynchronously
                    promises.push(this._outlineEntryFactory.cacheSymbols(cell, cancelToken));
                }
                await Promise.allSettled(promises);
            }
            this.recomputeState();
        }
        catch (err) {
            console.error('Failed to compute notebook outline symbols:', err);
            // Still recompute state with whatever symbols we have
            this.recomputeState();
        }
    }
    recomputeState() {
        this._disposables.clear();
        this._activeEntry = undefined;
        this._uri = undefined;
        if (!this._editor.hasModel()) {
            return;
        }
        this._uri = this._editor.textModel.uri;
        const notebookEditorWidget = this._editor;
        if (notebookEditorWidget.getLength() === 0) {
            return;
        }
        const notebookCells = notebookEditorWidget.getViewModel().viewCells;
        const entries = [];
        for (const cell of notebookCells) {
            entries.push(...this._outlineEntryFactory.getOutlineEntries(cell, entries.length));
        }
        // build a tree from the list of entries
        if (entries.length > 0) {
            const result = [entries[0]];
            const parentStack = [entries[0]];
            for (let i = 1; i < entries.length; i++) {
                const entry = entries[i];
                while (true) {
                    const len = parentStack.length;
                    if (len === 0) {
                        // root node
                        result.push(entry);
                        parentStack.push(entry);
                        break;
                    }
                    else {
                        const parentCandidate = parentStack[len - 1];
                        if (parentCandidate.level < entry.level) {
                            parentCandidate.addChild(entry);
                            parentStack.push(entry);
                            break;
                        }
                        else {
                            parentStack.pop();
                        }
                    }
                }
            }
            this._entries = result;
        }
        // feature: show markers with each cell
        const markerServiceListener = new MutableDisposable();
        this._disposables.add(markerServiceListener);
        const updateMarkerUpdater = () => {
            if (notebookEditorWidget.isDisposed) {
                return;
            }
            const doUpdateMarker = (clear) => {
                for (const entry of this._entries) {
                    if (clear) {
                        entry.clearMarkers();
                    }
                    else {
                        entry.updateMarkers(this._markerService);
                    }
                }
            };
            const problem = this._configurationService.getValue('problems.visibility');
            if (problem === undefined) {
                return;
            }
            const config = this._configurationService.getValue("outline.problems.enabled" /* OutlineConfigKeys.problemsEnabled */);
            if (problem && config) {
                markerServiceListener.value = this._markerService.onMarkerChanged(e => {
                    if (notebookEditorWidget.isDisposed) {
                        console.error('notebook editor is disposed');
                        return;
                    }
                    if (e.some(uri => notebookEditorWidget.getCellsInRange().some(cell => isEqual(cell.uri, uri)))) {
                        doUpdateMarker(false);
                        this._onDidChange.fire({});
                    }
                });
                doUpdateMarker(false);
            }
            else {
                markerServiceListener.clear();
                doUpdateMarker(true);
            }
        };
        updateMarkerUpdater();
        this._disposables.add(this._configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('problems.visibility') || e.affectsConfiguration("outline.problems.enabled" /* OutlineConfigKeys.problemsEnabled */)) {
                updateMarkerUpdater();
                this._onDidChange.fire({});
            }
        }));
        const { changeEventTriggered } = this.recomputeActive();
        if (!changeEventTriggered) {
            this._onDidChange.fire({});
        }
    }
    recomputeActive() {
        let newActive;
        const notebookEditorWidget = this._editor;
        if (notebookEditorWidget) { //TODO don't check for widget, only here if we do have
            if (notebookEditorWidget.hasModel() && notebookEditorWidget.getLength() > 0) {
                const cell = notebookEditorWidget.cellAt(notebookEditorWidget.getFocus().start);
                if (cell) {
                    for (const entry of this._entries) {
                        newActive = entry.find(cell, []);
                        if (newActive) {
                            break;
                        }
                    }
                }
            }
        }
        if (newActive !== this._activeEntry) {
            this._activeEntry = newActive;
            this._onDidChange.fire({ affectOnlyActiveElement: true });
            return { changeEventTriggered: true };
        }
        return { changeEventTriggered: false };
    }
    dispose() {
        this._entries.length = 0;
        this._activeEntry = undefined;
        this._disposables.dispose();
        this._onDidChange.dispose();
    }
};
NotebookCellOutlineDataSource = __decorate([
    __param(1, IMarkerService),
    __param(2, IConfigurationService),
    __param(3, INotebookOutlineEntryFactory)
], NotebookCellOutlineDataSource);
export { NotebookCellOutlineDataSource };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tPdXRsaW5lRGF0YVNvdXJjZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvdmlld01vZGVsL25vdGVib29rT3V0bGluZURhdGFTb3VyY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLHFDQUFxQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxlQUFlLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM3RixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFbEUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBRW5GLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUkxRCxPQUFPLEVBQUUsNEJBQTRCLEVBQStCLE1BQU0sa0NBQWtDLENBQUM7QUFPdEcsSUFBTSw2QkFBNkIsR0FBbkMsTUFBTSw2QkFBNkI7SUFXekMsWUFDa0IsT0FBd0IsRUFDekIsY0FBK0MsRUFDeEMscUJBQTZELEVBQ3RELG9CQUFrRTtRQUgvRSxZQUFPLEdBQVAsT0FBTyxDQUFpQjtRQUNSLG1CQUFjLEdBQWQsY0FBYyxDQUFnQjtRQUN2QiwwQkFBcUIsR0FBckIscUJBQXFCLENBQXVCO1FBQ3JDLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBNkI7UUFiaEYsaUJBQVksR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBRXJDLGlCQUFZLEdBQUcsSUFBSSxPQUFPLEVBQXNCLENBQUM7UUFDekQsZ0JBQVcsR0FBOEIsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUM7UUFHbEUs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