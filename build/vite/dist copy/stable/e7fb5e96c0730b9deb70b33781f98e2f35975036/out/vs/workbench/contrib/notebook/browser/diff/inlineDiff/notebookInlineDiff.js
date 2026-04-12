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
import { Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { INotebookEditorWorkerService } from '../../../common/services/notebookWorkerService.js';
import { registerNotebookContribution } from '../../notebookEditorExtensions.js';
import { NotebookCellDiffDecorator } from './notebookCellDiffDecorator.js';
import { NotebookDeletedCellDecorator } from './notebookDeletedCellDecorator.js';
import { NotebookInsertedCellDecorator } from './notebookInsertedCellDecorator.js';
import { INotebookLoggingService } from '../../../common/notebookLoggingService.js';
import { computeDiff } from '../../../common/notebookDiff.js';
import { registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { INotebookOriginalModelReferenceFactory, NotebookOriginalModelReferenceFactory } from './notebookOriginalModelRefFactory.js';
import { INotebookOriginalCellModelFactory, OriginalNotebookCellModelFactory } from './notebookOriginalCellModelFactory.js';
let NotebookInlineDiffDecorationContribution = class NotebookInlineDiffDecorationContribution extends Disposable {
    static { this.ID = 'workbench.notebook.inlineDiffDecoration'; }
    constructor(notebookEditor, notebookEditorWorkerService, instantiationService, logService) {
        super();
        this.notebookEditor = notebookEditor;
        this.notebookEditorWorkerService = notebookEditorWorkerService;
        this.instantiationService = instantiationService;
        this.logService = logService;
        this.cellDecorators = new Map();
        this.listeners = [];
        this.logService.debug('inlineDiff', 'Watching for previous model');
        this._register(autorun((reader) => {
            this.previous = this.notebookEditor.notebookOptions.previousModelToCompare.read(reader);
            if (this.previous) {
                this.logService.debug('inlineDiff', 'Previous model set');
                if (this.notebookEditor.hasModel()) {
                    this.initialize();
                }
                else {
                    this.logService.debug('inlineDiff', 'Waiting for model to attach');
                    this.listeners.push(Event.once(this.notebookEditor.onDidAttachViewModel)(() => this.initialize()));
                }
            }
        }));
    }
    clear() {
        this.listeners.forEach(l => l.dispose());
        this.cellDecorators.forEach((v, cell) => {
            v.dispose();
            this.cellDecorators.delete(cell);
        });
        this.insertedCellDecorator?.dispose();
        this.deletedCellDecorator?.dispose();
        this.cachedNotebookDiff = undefined;
        this.listeners = [];
        this.logService.debug('inlineDiff', 'Cleared decorations and listeners');
    }
    dispose() {
        this.logService.debug('inlineDiff', 'Disposing');
        this.clear();
        super.dispose();
    }
    initialize() {
        this.clear();
        if (!this.previous) {
            return;
        }
        this.insertedCellDecorator = this.instantiationService.createInstance(NotebookInsertedCellDecorator, this.notebookEditor);
        this.deletedCellDecorator = this.instantiationService.createInstance(NotebookDeletedCellDecorator, this.notebookEditor, undefined);
        this._update();
        const onVisibleChange = Event.debounce(this.notebookEditor.onDidChangeVisibleRanges, (e) => e, 100, undefined, undefined, undefined, this._store);
        this.listeners.push(onVisibleChange(() => this._update()));
        this.listeners.push(this.notebookEditor.onDidChangeModel(() => this._update()));
        if (this.notebookEditor.textModel) {
            const onContentChange = Event.debounce(this.notebookEditor.textModel.onDidChangeContent, (_, event) => event, 100, undefined, undefined, undefined, this._store);
            const onOriginalContentChange = Event.debounce(this.previous.onDidChangeContent, (_, event) => event, 100, undefined, undefined, undefined, this._store);
            this.listeners.push(onContentChange(() => this._update()));
            this.listeners.push(onOriginalContentChange(() => this._update()));
        }
        this.logService.debug('inlineDiff', 'Initialized');
    }
    async _update() {
        const current = this.notebookEditor.getViewModel()?.notebookDocument;
        if (!this.previous || !current) {
            this.logService.debug('inlineDiff', 'Update skipped - no original or current document');
            return;
        }
        if (!this.cachedNotebookDiff ||
            this.cachedNotebookDiff.originalVersion !== this.previous.versionId ||
            this.cachedNotebookDiff.version !== current.versionId) {
            let diffInfo = { cellDiffInfo: [] };
            try {
                const notebookDiff = await this.notebookEditorWorkerService.computeDiff(this.previous.uri, current.uri);
                diffInfo = computeDiff(this.previous, current, notebookDiff);
            }
            catch (e) {
                this.logService.error('inlineDiff', 'Error computing diff:\n' + e);
                return;
            }
            this.cachedNotebookDiff = { cellDiffInfo: diffInfo.cellDiffInfo, originalVersion: this.previous.versionId, version: current.versionId };
            this.insertedCellDecorator?.apply(diffInfo.cellDiffInfo);
            this.deletedCellDecorator?.apply(diffInfo.cellDiffInfo, this.previous);
        }
        await this.updateCells(this.previous, current, this.cachedNotebookDiff.cellDiffInfo);
    }
    async updateCells(original, modified, cellDiffs) {
        const validDiffDecorators = new Set();
        cellDiffs.forEach((diff) => {
            if (diff.type === 'modified') {
                const modifiedCell = modified.cells[diff.modifiedCellIndex];
                const originalCell = original.cells[diff.originalCellIndex];
                const editor = this.notebookEditor.codeEditors.find(([vm,]) => vm.handle === modifiedCell.handle)?.[1];
                if (editor) {
                    const currentDecorator = this.cellDecorators.get(modifiedCell);
                    if ((currentDecorator?.modifiedCell !== modifiedCell || currentDecorator?.originalCell !== originalCell)) {
                        currentDecorator?.dispose();
                        const decorator = this.instantiationService.createInstance(NotebookCellDiffDecorator, this.notebookEditor, modifiedCell, originalCell, editor);
                        this.cellDecorators.set(modifiedCell, decorator);
                        validDiffDecorators.add(decorator);
                        this._register(editor.onDidDispose(() => {
                            decorator.dispose();
                            if (this.cellDecorators.get(modifiedCell) === decorator) {
                                this.cellDecorators.delete(modifiedCell);
                            }
                        }));
                    }
                    else if (currentDecorator) {
                        validDiffDecorators.add(currentDecorator);
                    }
                }
            }
        });
        // Dispose old decorators
        this.cellDecorators.forEach((v, cell) => {
            if (!validDiffDecorators.has(v)) {
                v.dispose();
                this.cellDecorators.delete(cell);
            }
        });
    }
};
NotebookInlineDiffDecorationContribution = __decorate([
    __param(1, INotebookEditorWorkerService),
    __param(2, IInstantiationService),
    __param(3, INotebookLoggingService)
], NotebookInlineDiffDecorationContribution);
export { NotebookInlineDiffDecorationContribution };
registerNotebookContribution(NotebookInlineDiffDecorationContribution.ID, NotebookInlineDiffDecorationContribution);
registerSingleton(INotebookOriginalModelReferenceFactory, NotebookOriginalModelReferenceFactory, 1 /* InstantiationType.Delayed */);
registerSingleton(INotebookOriginalCellModelFactory, OriginalNotebookCellModelFactory, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tJbmxpbmVEaWZmLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci9kaWZmL2lubGluZURpZmYvbm90ZWJvb2tJbmxpbmVEaWZmLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUMvRCxPQUFPLEVBQUUsVUFBVSxFQUFlLE1BQU0sNENBQTRDLENBQUM7QUFDckYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBR3pHLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBR2pHLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ2pGLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ2pGLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ25GLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUM5RCxPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDckgsT0FBTyxFQUFFLHNDQUFzQyxFQUFFLHFDQUFxQyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDckksT0FBTyxFQUFFLGlDQUFpQyxFQUFFLGdDQUFnQyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFckgsSUFBTSx3Q0FBd0Ms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