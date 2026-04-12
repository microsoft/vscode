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
import { dispose } from '../../../../base/common/lifecycle.js';
import { EditOperation } from '../../../../editor/common/core/editOperation.js';
import { Range } from '../../../../editor/common/core/range.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { IEditorWorkerService } from '../../../../editor/common/services/editorWorker.js';
import { IUndoRedoService } from '../../../../platform/undoRedo/common/undoRedo.js';
import { SingleModelEditStackElement, MultiModelEditStackElement } from '../../../../editor/common/model/editStack.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ResourceTextEdit } from '../../../../editor/browser/services/bulkEditService.js';
import { SnippetController2 } from '../../../../editor/contrib/snippet/browser/snippetController2.js';
import { SnippetParser } from '../../../../editor/contrib/snippet/browser/snippetParser.js';
class ModelEditTask {
    constructor(_modelReference) {
        this._modelReference = _modelReference;
        this.model = this._modelReference.object.textEditorModel;
        this._edits = [];
    }
    dispose() {
        this._modelReference.dispose();
    }
    isNoOp() {
        if (this._edits.length > 0) {
            // contains textual edits
            return false;
        }
        if (this._newEol !== undefined && this._newEol !== this.model.getEndOfLineSequence()) {
            // contains an eol change that is a real change
            return false;
        }
        return true;
    }
    addEdit(resourceEdit) {
        this._expectedModelVersionId = resourceEdit.versionId;
        const { textEdit } = resourceEdit;
        if (typeof textEdit.eol === 'number') {
            // honor eol-change
            this._newEol = textEdit.eol;
        }
        if (!textEdit.range && !textEdit.text) {
            // lacks both a range and the text
            return;
        }
        if (Range.isEmpty(textEdit.range) && !textEdit.text) {
            // no-op edit (replace empty range with empty text)
            return;
        }
        // create edit operation
        let range;
        if (!textEdit.range) {
            range = this.model.getFullModelRange();
        }
        else {
            range = Range.lift(textEdit.range);
        }
        this._edits.push({ ...EditOperation.replaceMove(range, textEdit.text), insertAsSnippet: textEdit.insertAsSnippet, keepWhitespace: textEdit.keepWhitespace });
    }
    validate() {
        if (typeof this._expectedModelVersionId === 'undefined' || this.model.getVersionId() === this._expectedModelVersionId) {
            return { canApply: true };
        }
        return { canApply: false, reason: this.model.uri };
    }
    getBeforeCursorState() {
        return null;
    }
    apply(reason) {
        if (this._edits.length > 0) {
            this._edits = this._edits
                .map(this._transformSnippetStringToInsertText, this) // no editor -> no snippet mode
                .sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range));
            this.model.pushEditOperations(null, this._edits, () => null, undefined, reason);
        }
        if (this._newEol !== undefined) {
            this.model.pushEOL(this._newEol);
        }
    }
    _transformSnippetStringToInsertText(edit) {
        // transform a snippet edit (and only those) into a normal text edit
        // for that we need to parse the snippet and get its actual text, e.g without placeholder
        // or variable syntaxes
        if (!edit.insertAsSnippet) {
            return edit;
        }
        if (!edit.text) {
            return edit;
        }
        const text = SnippetParser.asInsertText(edit.text);
        return { ...edit, insertAsSnippet: false, text };
    }
}
class EditorEditTask extends ModelEditTask {
    constructor(modelReference, editor) {
        super(modelReference);
        this._editor = editor;
    }
    getBeforeCursorState() {
        return this._canUseEditor() ? this._editor.getSelections() : null;
    }
    apply(reason) {
        // Check that the editor is still for the wanted model. It might have changed in the
        // meantime and that means we cannot use the editor anymore (instead we perform the edit through the model)
        if (!this._canUseEditor()) {
            super.apply();
            return;
        }
        if (this._edits.length > 0) {
            const snippetCtrl = SnippetController2.get(this._editor);
            if (snippetCtrl && this._edits.some(edit => edit.insertAsSnippet)) {
                // some edit is a snippet edit -> use snippet controller and ISnippetEdits
                const snippetEdits = [];
                for (const edit of this._edits) {
                    if (edit.range && edit.text !== null) {
                        snippetEdits.push({
                            range: Range.lift(edit.range),
                            template: edit.insertAsSnippet ? edit.text : SnippetParser.escape(edit.text),
                            keepWhitespace: edit.keepWhitespace
                        });
                    }
                }
                snippetCtrl.apply(snippetEdits, { undoStopBefore: false, undoStopAfter: false });
            }
            else {
                // normal edit
                this._edits = this._edits
                    .map(this._transformSnippetStringToInsertText, this) // mixed edits (snippet and normal) -> no snippet mode
                    .sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range));
                this._editor.executeEdits(reason, this._edits);
            }
        }
        if (this._newEol !== undefined) {
            if (this._editor.hasModel()) {
                this._editor.getModel().pushEOL(this._newEol);
            }
        }
    }
    _canUseEditor() {
        return this._editor?.getModel()?.uri.toString() === this.model.uri.toString();
    }
}
let BulkTextEdits = class BulkTextEdits {
    constructor(_label, _code, _editor, _undoRedoGroup, _undoRedoSource, _progress, _token, edits, _editorWorker, _modelService, _textModelResolverService, _undoRedoService) {
        this._label = _label;
        this._code = _code;
        this._editor = _editor;
        this._undoRedoGroup = _undoRedoGroup;
        this._undoRedoSource = _undoRedoSource;
        this._progress = _progress;
        this._token = _token;
        this._editorWorker = _editorWorker;
        this._modelService = _modelService;
        this._textModelResolverService = _textModelResolverService;
        this._undoRedoService = _undoRedoService;
        this._edits = new ResourceMap();
        for (const edit of edits) {
            let array = this._edits.get(edit.resource);
            if (!array) {
                array = [];
                this._edits.set(edit.resource, array);
            }
            array.push(edit);
        }
    }
    _validateBeforePrepare() {
        // First check if loaded models were not changed in the meantime
        for (const array of this._edits.values()) {
            for (const edit of array) {
                if (typeof edit.versionId === 'number') {
                    const model = this._modelService.getModel(edit.resource);
                    if (model && model.getVersionId() !== edit.versionId) {
                        // model changed in the meantime
                        throw new Error(`${model.uri.toString()} has changed in the meantime`);
                    }
                }
            }
        }
    }
    async _createEditsTasks() {
        const tasks = [];
        const promises = [];
        for (const [key, edits] of this._edits) {
            const promise = this._textModelResolverService.createModelReference(key).then(async (ref) => {
                let task;
                let makeMinimal = false;
                if (this._editor?.getModel()?.uri.toString() === ref.object.textEditorModel.uri.toString()) {
                    task = new EditorEditTask(ref, this._editor);
                    makeMinimal = true;
                }
                else {
                    task = new ModelEditTask(ref);
                }
                tasks.push(task);
                if (!makeMinimal) {
                    edits.forEach(task.addEdit, task);
                    return;
                }
                // group edits by type (snippet, metadata, or simple) and make simple groups more minimal
                const makeGroupMoreMinimal = async (start, end) => {
                    const oldEdits = edits.slice(start, end);
                    const newEdits = await this._editorWorker.computeMoreMinimalEdits(ref.object.textEditorModel.uri, oldEdits.map(e => e.textEdit), false);
                    if (!newEdits) {
                        oldEdits.forEach(task.addEdit, task);
                    }
                    else {
                        newEdits.forEach(edit => task.addEdit(new ResourceTextEdit(ref.object.textEditorModel.uri, edit, undefined, undefined)));
                    }
                };
                let start = 0;
                let i = 0;
                for (; i < edits.length; i++) {
                    if (edits[i].textEdit.insertAsSnippet || edits[i].metadata) {
                        await makeGroupMoreMinimal(start, i); // grouped edits until now
                        task.addEdit(edits[i]); // this edit
                        start = i + 1;
                    }
                }
                await makeGroupMoreMinimal(start, i);
            });
            promises.push(promise);
        }
        await Promise.all(promises);
        return tasks;
    }
    _validateTasks(tasks) {
        for (const task of tasks) {
            const result = task.validate();
            if (!result.canApply) {
                return result;
            }
        }
        return { canApply: true };
    }
    async apply(reason) {
        this._validateBeforePrepare();
        const tasks = await this._createEditsTasks();
        try {
            if (this._token.isCancellationRequested) {
                return [];
            }
            const resources = [];
            const validation = this._validateTasks(tasks);
            if (!validation.canApply) {
                throw new Error(`${validation.reason.toString()} has changed in the meantime`);
            }
            if (tasks.length === 1) {
                // This edit touches a single model => keep things simple
                const task = tasks[0];
                if (!task.isNoOp()) {
                    const singleModelEditStackElement = new SingleModelEditStackElement(this._label, this._code, task.model, task.getBeforeCursorState());
                    this._undoRedoService.pushElement(singleModelEditStackElement, this._undoRedoGroup, this._undoRedoSource);
                    task.apply(reason);
                    singleModelEditStackElement.close();
                    resources.push(task.model.uri);
                }
                this._progress.report(undefined);
            }
            else {
                // prepare multi model undo element
                const multiModelEditStackElement = new MultiModelEditStackElement(this._label, this._code, tasks.map(t => new SingleModelEditStackElement(this._label, this._code, t.model, t.getBeforeCursorState())));
                this._undoRedoService.pushElement(multiModelEditStackElement, this._undoRedoGroup, this._undoRedoSource);
                for (const task of tasks) {
                    task.apply();
                    this._progress.report(undefined);
                    resources.push(task.model.uri);
                }
                multiModelEditStackElement.close();
            }
            return resources;
        }
        finally {
            dispose(tasks);
        }
    }
};
BulkTextEdits = __decorate([
    __param(8, IEditorWorkerService),
    __param(9, IModelService),
    __param(10, ITextModelService),
    __param(11, IUndoRedoService)
], BulkTextEdits);
export { BulkTextEdits };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVsa1RleHRFZGl0cy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2J1bGtFZGl0L2Jyb3dzZXIvYnVsa1RleHRFZGl0cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUEyQixNQUFNLHNDQUFzQyxDQUFDO0FBR3hGLE9BQU8sRUFBRSxhQUFhLEVBQXdCLE1BQU0saURBQWlELENBQUM7QUFDdEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBR2hFLE9BQU8sRUFBRSxpQkFBaUIsRUFBNEIsTUFBTSx1REFBdUQsQ0FBQztBQUVwSCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUMxRixPQUFPLEVBQUUsZ0JBQWdCLEVBQWlDLE1BQU0sa0RBQWtELENBQUM7QUFDbkgsT0FBTyxFQUFFLDJCQUEyQixFQUFFLDBCQUEwQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDdkgsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUUxRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN0RyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFRNUYsTUFBTSxhQUFhO0lBUWxCLFlBQTZCLGVBQXFEO1FBQXJELG9CQUFlLEdBQWYsZUFBZSxDQUFzQztRQUNqRixJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLGVBQWUsQ0FBQztRQUN6RCxJQUFJLENBQUMsTUFBTSxHQUFHLEVBQUUsQ0FBQztJQUNsQixDQUFDO0lBRUQsT0FBTztRQUNOLElBQUksQ0FBQyxlQUFlLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDaEMsQ0FBQztJQUVELE1BQU07UUFDTCxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQzVCLHlCQUF5QjtZQUN6QixPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7UUFDRCxJQUFJLElBQUksQ0FBQyxPQUFPLEtBQUssU0FBUyxJQUFJLElBQUksQ0FBQyxPQUFPLEtBQUssSUFBSSxDQUFDLEtBQUssQ0FBQyxvQkFBb0IsRUFBRSxFQUFFLENBQUM7WUFDdEYsK0NBQStDO1lBQy9DLE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVELE9BQU8sQ0FBQyxZQUE4QjtRQUNyQyxJQUFJLENBQUMsdUJBQXVCLEdBQUcsWUFBWSxDQUFDLFNBQVMsQ0FBQztRQUN0RCxNQUFNLEVBQUUsUUFBUSxFQUFFLEdBQUcsWUFBWSxDQUFDO1FBRWxDLElBQUksT0FBTyxRQUFRLENBQUMsR0FBRyxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQ3RDLG1CQUFtQjtZQUNuQixJQUFJLENBQUMsT0FBTyxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUM7UUFDN0IsQ0FBQztRQUNELElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ3ZDLGtDQUFrQztZQUNsQyxPQUFPO1FBQ1IsQ0FBQztRQUNELElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDckQsbURBQW1EO1lBQ25ELE9BQU87UUFDUixDQUFDO1FBRUQsd0JBQXdCO1FBQ3hCLElBQUksS0FBWSxDQUFDO1FBQ2pCLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDckIsS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztRQUN4QyxDQUFDO2FBQU0sQ0FBQztZQUNQLEtBQUssR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNwQyxDQUFDO1FBQ0QsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxHQUFHLGFBQWEsQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxlQUFlLEVBQUUsUUFBUSxDQUFDLGVBQWUsRUFBRSxjQUFjLEVBQUUsUUFBUSxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUM7SUFDOUosQ0FBQztJQUVELFFBQVE7UUFDUCxJQUFJLE9BQU8sSUFBSSxDQUFDLHVCQUF1QixLQUFLLFdBQVcsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLFlBQVksRUFBRSxLQUFLLElBQUksQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO1lBQ3ZILE9BQU8sRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLENBQUM7UUFDM0IsQ0FBQztRQUNELE9BQU8sRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxDQUFDO0lBQ3BELENBQUM7SUFFRCxvQkFBb0I7UUFDbkIsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRUQsS0FBSyxDQUFDLE1BQTRCO1FBQ2pDLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDNUIsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsTUFBTTtpQkFDdkIsR0FBRyxDQUFDLElBQUksQ0FBQyxtQ0FBbUMsRUFBRSxJQUFJLENBQUMsQ0FBQywrQkFBK0I7aUJBQ25GLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEtBQUssQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ25FLElBQUksQ0FBQyxLQUFLLENBQUMsa0JBQWtCLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxNQUFNLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUNqRixDQUFDO1FBQ0QsSUFBSSxJQUFJLENBQUMsT0FBTyxLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQ2hDLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNsQyxDQUFDO0lBQ0YsQ0FBQztJQUVTLG1DQUFtQyxDQUFDLElBQWlDO1FBQzlFLG9FQUFvRTtRQUNwRSx5RkFBeUY7UUFDekYsdUJBQXVCO1FBQ3ZCLElBQUksQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7WUFDM0IsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBQ0QsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNoQixPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFDRCxNQUFNLElBQUksR0FBRyxhQUFhLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNuRCxPQUFPLEVBQUUsR0FBRyxJQUFJLEVBQUUsZUFBZSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsQ0FBQztJQUNsRCxDQUFDO0NBQ0Q7QUFFRCxNQUFNLGNBQWUsU0FBUSxhQUFhO0lBSXpDLFlBQVksY0FBb0QsRUFBRSxNQUFtQjtRQUNwRixLQUFLLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDdEIsSUFBSSxDQUFDLE9BQU8sR0FBRyxNQUFNLENBQUM7SUFDdkIsQ0FBQztJQUVRLG9CQUFvQjtRQUM1QixPQUFPLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxhQUFhLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO0lBQ25FLENBQUM7SUFFUSxLQUFLLENBQUMsTUFBNEI7UUFFMUMsb0ZBQW9GO1FBQ3BGLDJHQUEyRztRQUMzRyxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRSxFQUFFLENBQUM7WUFDM0IsS0FBSyxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ2QsT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQzVCLE1BQU0sV0FBVyxHQUFHLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDekQsSUFBSSxXQUFXLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQztnQkFDbkUsMEVBQTBFO2dCQUMxRSxNQUFNLFlBQVksR0FBbUIsRUFBRSxDQUFDO2dCQUN4QyxLQUFLLE1BQU0sSUFBSSxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztvQkFDaEMsSUFBSSxJQUFJLENBQUMsS0FBSyxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssSUFBSSxFQUFFLENBQUM7d0JBQ3RDLFlBQVksQ0FBQyxJQUFJLENBQUM7NEJBQ2pCLEtBQUssRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUM7NEJBQzdCLFFBQVEsRUFBRSxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7NEJBQzVFLGNBQWMsRUFBRSxJQUFJLENBQUMsY0FBYzt5QkFDbkMsQ0FBQyxDQUFDO29CQUNKLENBQUM7Z0JBQ0YsQ0FBQztnQkFDRCxXQUFXLENBQUMsS0FBSyxDQUFDLFlBQVksRUFBRSxFQUFFLGNBQWMsRUFBRSxLQUFLLEVBQUUsYUFBYSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7WUFFbEYsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLGNBQWM7Z0JBQ2QsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsTUFBTTtxQkFDdkIsR0FBRyxDQUFDLElBQUksQ0FBQyxtQ0FBbUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxzREFBc0Q7cUJBQzFHLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEtBQUssQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO2dCQUNuRSxJQUFJLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ2hELENBQUM7UUFDRixDQUFDO1FBQ0QsSUFBSSxJQUFJLENBQUMsT0FBTyxLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQ2hDLElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDO2dCQUM3QixJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDL0MsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBRU8sYUFBYTtRQUNwQixPQUFPLElBQUksQ0FBQyxPQUFPLEVBQUUsUUFBUSxFQUFFLEVBQUUsR0FBRyxDQUFDLFFBQVEsRUFBRSxLQUFLLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDO0lBQy9FLENBQUM7Q0FDRDtBQUVNLElBQU0sYUFBYSxHQUFuQixNQUFNLGFBQWE7SUFJekIsWUFDa0IsTUFBYyxFQUNkLEtBQWEsRUFDYixPQUFnQyxFQUNoQyxjQUE2QixFQUM3QixlQUEyQyxFQUMzQyxTQUEwQixFQUMxQixNQUF5QixFQUMxQyxLQUF5QixFQUNILGFBQW9ELEVBQzNELGFBQTZDLEVBQ3pDLHlCQUE2RCxFQUM5RCxnQkFBbUQ7UUFYcEQsV0FBTSxHQUFOLE1BQU0sQ0FBUTtRQUNkLFVBQUssR0FBTCxLQUFLLENBQVE7UUFDYixZQUFPLEdBQVAsT0FBTyxDQUF5QjtRQUNoQyxtQkFBYyxHQUFkLGNBQWMsQ0FBZTtRQUM3QixvQkFBZSxHQUFmLGVBQWUsQ0FBNEI7UUFDM0MsY0FBUyxHQUFULFNBQVMsQ0FBaUI7UUFDMUIsV0FBTSxHQUFOLE1BQU0sQ0FBbUI7UUFFSCxrQkFBYSxHQUFiLGFBQWEsQ0FBc0I7UUFDMUMsa0JBQWEsR0FBYixhQUFhLENBQWU7UUFDeEIsOEJBQXlCLEdBQXpCLHlCQUF5QixDQUFtQjtRQUM3QyxxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQWtCO1FBZHJELFdBQU0sR0FBRyxJQUFJLFdBQVcsRUFBc0IsQ0FBQztRQWlCL0QsS0FBSyxNQUFNLElBQUksSUFBSSxLQUFLLEVBQUUsQ0FBQztZQUMxQixJQUFJLEtBQUssR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDM0MsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUNaLEtBQUssR0FBRyxFQUFFLENBQUM7Z0JBQ1gsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUN2QyxDQUFDO1lBQ0QsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNsQixDQUFDO0lBQ0YsQ0FBQztJQUVPLHNCQUFzQjtRQUM3QixnRUFBZ0U7UUFDaEUsS0FBSyxNQUFNLEtBQUssSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUM7WUFDMUMsS0FBSyxNQUFNLElBQUksSUFBSSxLQUFLLEVBQUUsQ0FBQztnQkFDMUIsSUFBSSxPQUFPLElBQUksQ0FBQyxTQUFTLEtBQUssUUFBUSxFQUFFLENBQUM7b0JBQ3hDLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztvQkFDekQsSUFBSSxLQUFLLElBQUksS0FBSyxDQUFDLFlBQVksRUFBRSxLQUFLLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQzt3QkFDdEQsZ0NBQWdDO3dCQUNoQyxNQUFNLElBQUksS0FBSyxDQUFDLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsOEJBQThCLENBQUMsQ0FBQztvQkFDeEUsQ0FBQztnQkFDRixDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBRU8sS0FBSyxDQUFDLGlCQUFpQjtRQUU5QixNQUFNLEtBQUssR0FBb0IsRUFBRSxDQUFDO1FBQ2xDLE1BQU0sUUFBUSxHQUFtQixFQUFFLENBQUM7UUFFcEMsS0FBSyxNQUFNLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUN4QyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMseUJBQXlCLENBQUMsb0JBQW9CLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBQyxHQUFHLEVBQUMsRUFBRTtnQkFDekYsSUFBSSxJQUFtQixDQUFDO2dCQUN4QixJQUFJLFdBQVcsR0FBRyxLQUFLLENBQUM7Z0JBQ3hCLElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRSxRQUFRLEVBQUUsRUFBRSxHQUFHLENBQUMsUUFBUSxFQUFFLEtBQUssR0FBRyxDQUFDLE1BQU0sQ0FBQyxlQUFlLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUM7b0JBQzVGLElBQUksR0FBRyxJQUFJLGNBQWMsQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO29CQUM3QyxXQUFXLEdBQUcsSUFBSSxDQUFDO2dCQUNwQixDQUFDO3FCQUFNLENBQUM7b0JBQ1AsSUFBSSxHQUFHLElBQUksYUFBYSxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUMvQixDQUFDO2dCQUNELEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBR2pCLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztvQkFDbEIsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO29CQUNsQyxPQUFPO2dCQUNSLENBQUM7Z0JBRUQseUZBQXlGO2dCQUV6RixNQUFNLG9CQUFvQixHQUFHLEtBQUssRUFBRSxLQUFhLEVBQUUsR0FBVyxFQUFFLEVBQUU7b0JBQ2pFLE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxDQUFDO29CQUN6QyxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUksQ0FBQyxhQUFhLENBQUMsdUJBQXVCLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxlQUFlLENBQUMsR0FBRyxFQUFFLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7b0JBQ3hJLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQzt3QkFDZixRQUFRLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLENBQUM7b0JBQ3RDLENBQUM7eUJBQU0sQ0FBQzt3QkFDUCxRQUFRLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsZUFBZSxDQUFDLEdBQUcsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDMUgsQ0FBQztnQkFDRixDQUFDLENBQUM7Z0JBRUYsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDO2dCQUNkLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDVixPQUFPLENBQUMsR0FBRyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7b0JBQzlCLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxlQUFlLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDO3dCQUM1RCxNQUFNLG9CQUFvQixDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLDBCQUEwQjt3QkFDaEUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFlBQVk7d0JBQ3BDLEtBQUssR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO29CQUNmLENBQUM7Z0JBQ0YsQ0FBQztnQkFDRCxNQUFNLG9CQUFvQixDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztZQUV0QyxDQUFDLENBQUMsQ0FBQztZQUNILFFBQVEsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDeEIsQ0FBQztRQUVELE1BQU0sT0FBTyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUM1QixPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFFTyxjQUFjLENBQUMsS0FBc0I7UUFDNUMsS0FBSyxNQUFNLElBQUksSUFBSSxLQUFLLEVBQUUsQ0FBQztZQUMxQixNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDL0IsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFDdEIsT0FBTyxNQUFNLENBQUM7WUFDZixDQUFDO1FBQ0YsQ0FBQztRQUNELE9BQU8sRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLENBQUM7SUFDM0IsQ0FBQztJQUVELEtBQUssQ0FBQyxLQUFLLENBQUMsTUFBNEI7UUFFdkMsSUFBSSxDQUFDLHNCQUFzQixFQUFFLENBQUM7UUFDOUIsTUFBTSxLQUFLLEdBQUcsTUFBTSxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztRQUU3QyxJQUFJLENBQUM7WUFDSixJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztnQkFDekMsT0FBTyxFQUFFLENBQUM7WUFDWCxDQUFDO1lBRUQsTUFBTSxTQUFTLEdBQVUsRUFBRSxDQUFDO1lBQzVCLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDOUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFDMUIsTUFBTSxJQUFJLEtBQUssQ0FBQyxHQUFHLFVBQVUsQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLDhCQUE4QixDQUFDLENBQUM7WUFDaEYsQ0FBQztZQUNELElBQUksS0FBSyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDeEIseURBQXlEO2dCQUN6RCxNQUFNLElBQUksR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3RCLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQztvQkFDcEIsTUFBTSwyQkFBMkIsR0FBRyxJQUFJLDJCQUEyQixDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxDQUFDLENBQUM7b0JBQ3RJLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxXQUFXLENBQUMsMkJBQTJCLEVBQUUsSUFBSSxDQUFDLGNBQWMsRUFBRSxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7b0JBQzFHLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7b0JBQ25CLDJCQUEyQixDQUFDLEtBQUssRUFBRSxDQUFDO29CQUNwQyxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ2hDLENBQUM7Z0JBQ0QsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDbEMsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLG1DQUFtQztnQkFDbkMsTUFBTSwwQkFBMEIsR0FBRyxJQUFJLDBCQUEwQixDQUNoRSxJQUFJLENBQUMsTUFBTSxFQUNYLElBQUksQ0FBQyxLQUFLLEVBQ1YsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksMkJBQTJCLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLG9CQUFvQixFQUFFLENBQUMsQ0FBQyxDQUMzRyxDQUFDO2dCQUNGLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxXQUFXLENBQUMsMEJBQTBCLEVBQUUsSUFBSSxDQUFDLGNBQWMsRUFBRSxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7Z0JBQ3pHLEtBQUssTUFBTSxJQUFJLElBQUksS0FBSyxFQUFFLENBQUM7b0JBQzFCLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztvQkFDYixJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQztvQkFDakMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUNoQyxDQUFDO2dCQUNELDBCQUEwQixDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ3BDLENBQUM7WUFFRCxPQUFPLFNBQVMsQ0FBQztRQUVsQixDQUFDO2dCQUFTLENBQUM7WUFDVixPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDaEIsQ0FBQztJQUNGLENBQUM7Q0FDRCxDQUFBO0FBNUpZLGFBQWE7SUFhdkIsV0FBQSxvQkFBb0IsQ0FBQTtJQUNwQixXQUFBLGFBQWEsQ0FBQTtJQUNiLFlBQUEsaUJBQWlCLENBQUE7SUFDakIsWUFBQSxnQkFBZ0IsQ0FBQTtHQWhCTixhQUFhLENBNEp6QiJ9