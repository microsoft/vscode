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
import { groupBy } from '../../../../base/common/arrays.js';
import { compare } from '../../../../base/common/strings.js';
import { isObject } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { ResourceEdit } from '../../../../editor/browser/services/bulkEditService.js';
import { getNotebookEditorFromEditorPane } from '../../notebook/browser/notebookBrowser.js';
import { CellUri, SelectionStateType } from '../../notebook/common/notebookCommon.js';
import { INotebookEditorModelResolverService } from '../../notebook/common/notebookEditorModelResolverService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
export class ResourceNotebookCellEdit extends ResourceEdit {
    static is(candidate) {
        if (candidate instanceof ResourceNotebookCellEdit) {
            return true;
        }
        return URI.isUri(candidate.resource)
            && isObject(candidate.cellEdit);
    }
    static lift(edit) {
        if (edit instanceof ResourceNotebookCellEdit) {
            return edit;
        }
        return new ResourceNotebookCellEdit(edit.resource, edit.cellEdit, edit.notebookVersionId, edit.metadata);
    }
    constructor(resource, cellEdit, notebookVersionId = undefined, metadata) {
        super(metadata);
        this.resource = resource;
        this.cellEdit = cellEdit;
        this.notebookVersionId = notebookVersionId;
    }
}
let BulkCellEdits = class BulkCellEdits {
    constructor(_undoRedoGroup, undoRedoSource, _progress, _token, _edits, _editorService, _notebookModelService) {
        this._undoRedoGroup = _undoRedoGroup;
        this._progress = _progress;
        this._token = _token;
        this._edits = _edits;
        this._editorService = _editorService;
        this._notebookModelService = _notebookModelService;
        this._edits = this._edits.map(e => {
            if (e.resource.scheme === CellUri.scheme) {
                const uri = CellUri.parse(e.resource)?.notebook;
                if (!uri) {
                    throw new Error(`Invalid notebook URI: ${e.resource}`);
                }
                return new ResourceNotebookCellEdit(uri, e.cellEdit, e.notebookVersionId, e.metadata);
            }
            else {
                return e;
            }
        });
    }
    async apply() {
        const resources = [];
        const editsByNotebook = groupBy(this._edits, (a, b) => compare(a.resource.toString(), b.resource.toString()));
        for (const group of editsByNotebook) {
            if (this._token.isCancellationRequested) {
                break;
            }
            const [first] = group;
            const ref = await this._notebookModelService.resolve(first.resource);
            // check state
            if (typeof first.notebookVersionId === 'number' && ref.object.notebook.versionId !== first.notebookVersionId) {
                ref.dispose();
                throw new Error(`Notebook '${first.resource}' has changed in the meantime`);
            }
            // apply edits
            const edits = group.map(entry => entry.cellEdit);
            const computeUndo = !ref.object.isReadonly();
            const editor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
            const initialSelectionState = editor?.textModel?.uri.toString() === ref.object.notebook.uri.toString() ? {
                kind: SelectionStateType.Index,
                focus: editor.getFocus(),
                selections: editor.getSelections()
            } : undefined;
            ref.object.notebook.applyEdits(edits, true, initialSelectionState, () => undefined, this._undoRedoGroup, computeUndo);
            ref.dispose();
            this._progress.report(undefined);
            resources.push(first.resource);
        }
        return resources;
    }
};
BulkCellEdits = __decorate([
    __param(5, IEditorService),
    __param(6, INotebookEditorModelResolverService)
], BulkCellEdits);
export { BulkCellEdits };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVsa0NlbGxFZGl0cy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2J1bGtFZGl0L2Jyb3dzZXIvYnVsa0NlbGxFZGl0cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFNUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBSXRGLE9BQU8sRUFBRSwrQkFBK0IsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQzVGLE9BQU8sRUFBRSxPQUFPLEVBQWtILGtCQUFrQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDdE0sT0FBTyxFQUFFLG1DQUFtQyxFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDbEgsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBRWxGLE1BQU0sT0FBTyx3QkFBeUIsU0FBUSxZQUFZO0lBRXpELE1BQU0sQ0FBQyxFQUFFLENBQUMsU0FBa0I7UUFDM0IsSUFBSSxTQUFTLFlBQVksd0JBQXdCLEVBQUUsQ0FBQztZQUNuRCxPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFDRCxPQUFPLEdBQUcsQ0FBQyxLQUFLLENBQThCLFNBQVUsQ0FBQyxRQUFRLENBQUM7ZUFDOUQsUUFBUSxDQUE4QixTQUFVLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDaEUsQ0FBQztJQUVELE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBZ0M7UUFDM0MsSUFBSSxJQUFJLFlB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