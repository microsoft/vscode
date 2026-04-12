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
var NotebookOutputEditorInput_1;
import * as nls from '../../../../../nls.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { INotebookEditorModelResolverService } from '../../common/notebookEditorModelResolverService.js';
import { isEqual } from '../../../../../base/common/resources.js';
class ResolvedNotebookOutputEditorInputModel {
    constructor(resolvedNotebookEditorModel, notebookUri, cell, outputId) {
        this.resolvedNotebookEditorModel = resolvedNotebookEditorModel;
        this.notebookUri = notebookUri;
        this.cell = cell;
        this.outputId = outputId;
    }
    dispose() {
        this.resolvedNotebookEditorModel.dispose();
    }
}
// TODO @Yoyokrazy -- future feat. for viewing static outputs -- encode mime + data
// export class NotebookOutputViewerInput extends EditorInput {
// 	static readonly ID: string = 'workbench.input.notebookOutputViewerInput';
// }
let NotebookOutputEditorInput = class NotebookOutputEditorInput extends EditorInput {
    static { NotebookOutputEditorInput_1 = this; }
    static { this.ID = 'workbench.input.notebookOutputEditorInput'; }
    constructor(notebookUri, cellIndex, outputId, outputIndex, notebookEditorModelResolverService) {
        super();
        this.notebookEditorModelResolverService = notebookEditorModelResolverService;
        this._notebookUri = notebookUri;
        this.cellUri = undefined;
        this.cellIndex = cellIndex;
        this.outputId = outputId;
        this.outputIndex = outputIndex;
    }
    get typeId() {
        return NotebookOutputEditorInput_1.ID;
    }
    async resolve() {
        if (!this._notebookRef) {
            this._notebookRef = await this.notebookEditorModelResolverService.resolve(this._notebookUri);
        }
        const cell = this._notebookRef.object.notebook.cells[this.cellIndex];
        if (!cell) {
            throw new Error('Cell not found');
        }
        this.cellUri = cell.uri;
        const resolvedOutputId = cell.outputs[this.outputIndex]?.outputId;
        if (!resolvedOutputId) {
            throw new Error('Output not found');
        }
        if (!this.outputId) {
            this.outputId = resolvedOutputId;
        }
        return new ResolvedNotebookOutputEditorInputModel(this._notebookRef.object, this._notebookUri, cell, resolvedOutputId);
    }
    getSerializedData() {
        // need to translate from uris -> current indexes
        // uris aren't deterministic across reloads, so indices are best option
        if (!this._notebookRef) {
            return;
        }
        const cellIndex = this._notebookRef.object.notebook.cells.findIndex(c => isEqual(c.uri, this.cellUri));
        const cell = this._notebookRef.object.notebook.cells[cellIndex];
        if (!cell) {
            return;
        }
        const outputIndex = cell.outputs.findIndex(o => o.outputId === this.outputId);
        if (outputIndex === -1) {
            return;
        }
        return {
            notebookUri: this._notebookUri,
            cellIndex: cellIndex,
            outputIndex: outputIndex,
        };
    }
    getName() {
        return nls.localize('notebookOutputEditorInput', "Notebook Output Preview");
    }
    get editorId() {
        return 'notebookOutputEditor';
    }
    get resource() {
        return;
    }
    get capabilities() {
        return 2 /* EditorInputCapabilities.Readonly */;
    }
    dispose() {
        super.dispose();
    }
};
NotebookOutputEditorInput = NotebookOutputEditorInput_1 = __decorate([
    __param(4, INotebookEditorModelResolverService)
], NotebookOutputEditorInput);
export { NotebookOutputEditorInput };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tPdXRwdXRFZGl0b3JJbnB1dC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvb3V0cHV0RWRpdG9yL25vdGVib29rT3V0cHV0RWRpdG9ySW5wdXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sdUJBQXVCLENBQUM7QUFJN0MsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRXZFLE9BQU8sRUFBRSxtQ0FBbUMsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUlsRSxNQUFNLHNDQUFzQztJQUMzQyxZQUNVLDJCQUF5RCxFQUN6RCxXQUFnQixFQUNoQixJQUEyQixFQUMzQixRQUFnQjtRQUhoQixnQ0FBMkIsR0FBM0IsMkJBQTJCLENBQThCO1FBQ3pELGdCQUFXLEdBQVgsV0FBVyxDQUFLO1FBQ2hCLFNBQUksR0FBSixJQUFJLENBQXVCO1FBQzNCLGFBQVEsR0FBUixRQUFRLENBQVE7SUFDdEIsQ0FBQztJQUVMLE9BQU87UUFDTixJQUFJLENBQUMsMkJBQTJCLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDNUMsQ0FBQztDQUNEO0FBRUQsbUZBQW1GO0FBQ25GLCtEQUErRDtBQUMvRCw2RUFBNkU7QUFDN0UsSUFBSTtBQUVHLElBQU0seUJBQXlCLEdBQS9CLE1BQU0seUJBQTBCLFNBQVEsV0FBVzs7YUFDekMsT0FBRSxHQUFXLDJDQUEyQyxBQUF0RCxDQUF1RDtJQVl6RSxZQUNDLFdBQWdCLEVBQ2hCLFNBQWlCLEVBQ2pCLFFBQTRCLEVBQzVCLFdBQW1CLEVBQ21DLGtDQUF1RTtRQUU3SCxLQUFLLEVBQUUsQ0FBQztRQUY4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