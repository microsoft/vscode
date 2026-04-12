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
var NotebookDiffEditorInput_1;
import { isResourceDiffEditorInput } from '../../../common/editor.js';
import { EditorModel } from '../../../common/editor/editorModel.js';
import { DiffEditorInput } from '../../../common/editor/diffEditorInput.js';
import { NotebookEditorInput } from './notebookEditorInput.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
class NotebookDiffEditorModel extends EditorModel {
    constructor(original, modified) {
        super();
        this.original = original;
        this.modified = modified;
    }
}
let NotebookDiffEditorInput = class NotebookDiffEditorInput extends DiffEditorInput {
    static { NotebookDiffEditorInput_1 = this; }
    static create(instantiationService, resource, name, description, originalResource, viewType) {
        const original = NotebookEditorInput.getOrCreate(instantiationService, originalResource, undefined, viewType);
        const modified = NotebookEditorInput.getOrCreate(instantiationService, resource, undefined, viewType);
        return instantiationService.createInstance(NotebookDiffEditorInput_1, name, description, original, modified, viewType);
    }
    static { this.ID = 'workbench.input.diffNotebookInput'; }
    get resource() {
        return this.modified.resource;
    }
    get editorId() {
        return this.viewType;
    }
    constructor(name, description, original, modified, viewType, editorService) {
        super(name, description, original, modified, undefined, editorService);
        this.original = original;
        this.modified = modified;
        this.viewType = viewType;
        this._modifiedTextModel = null;
        this._originalTextModel = null;
        this._cachedModel = undefined;
    }
    get typeId() {
        return NotebookDiffEditorInput_1.ID;
    }
    async resolve() {
        const [originalEditorModel, modifiedEditorModel] = await Promise.all([
            this.original.resolve(),
            this.modified.resolve(),
        ]);
        this._cachedModel?.dispose();
        // TODO@rebornix check how we restore the editor in text diff editor
        if (!modifiedEditorModel) {
            throw new Error(`Fail to resolve modified editor model for resource ${this.modified.resource} with notebookType ${this.viewType}`);
        }
        if (!originalEditorModel) {
            throw new Error(`Fail to resolve original editor model for resource ${this.original.resource} with notebookType ${this.viewType}`);
        }
        this._originalTextModel = originalEditorModel;
        this._modifiedTextModel = modifiedEditorModel;
        this._cachedModel = new NotebookDiffEditorModel(this._originalTextModel, this._modifiedTextModel);
        return this._cachedModel;
    }
    toUntyped() {
        const original = { resource: this.original.resource };
        const modified = { resource: this.resource };
        return {
            original,
            modified,
            primary: modified,
            secondary: original,
            options: {
                override: this.viewType
            }
        };
    }
    matches(otherInput) {
        if (this === otherInput) {
            return true;
        }
        if (otherInput instanceof NotebookDiffEditorInput_1) {
            return this.modified.matches(otherInput.modified)
                && this.original.matches(otherInput.original)
                && this.viewType === otherInput.viewType;
        }
        if (isResourceDiffEditorInput(otherInput)) {
            return this.modified.matches(otherInput.modified)
                && this.original.matches(otherInput.original)
                && this.editorId !== undefined
                && (this.editorId === otherInput.options?.override || otherInput.options?.override === undefined);
        }
        return false;
    }
    dispose() {
        super.dispose();
        this._cachedModel?.dispose();
        this._cachedModel = undefined;
        this.original.dispose();
        this.modified.dispose();
        this._originalTextModel = null;
        this._modifiedTextModel = null;
    }
};
NotebookDiffEditorInput = NotebookDiffEditorInput_1 = __decorate([
    __param(5, IEditorService)
], NotebookDiffEditorInput);
export { NotebookDiffEditorInput };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tEaWZmRWRpdG9ySW5wdXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tEaWZmRWRpdG9ySW5wdXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBNEQseUJBQXlCLEVBQXVCLE1BQU0sMkJBQTJCLENBQUM7QUFFckosT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBSXBFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUMvRCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFFbEYsTUFBTSx1QkFBd0IsU0FBUSxXQUFXO0lBQ2hELFlBQ1UsUUFBc0MsRUFDdEMsUUFBc0M7UUFFL0MsS0FBSyxFQUFFLENBQUM7UUFIQyxhQUFRLEdBQVIsUUFBUSxDQUE4QjtRQUN0QyxhQUFRLEdBQVIsUUFBUSxDQUE4QjtJQUdoRCxDQUFDO0NBQ0Q7QUFFTSxJQUFNLHVCQUF1QixHQUE3QixNQUFNLHVCQUF3QixTQUFRLGVBQWU7O0lBQzNELE1BQU0sQ0FBQyxNQUFNLENBQUMsb0JBQTJDLEVBQUUsUUFBYSxFQUFFLElBQXdCLEVBQUUsV0FBK0IsRUFBRSxnQkFBcUIsRUFBRSxRQUFnQjtRQUMzSyxNQUFNLFFBQVEsR0FBRyxtQkFBbUIsQ0FBQyxXQUFXLENBQUMsb0JBQW9CLEVBQUUsZ0JBQWdCLEVBQUUsU0FBUyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQzlHLE1BQU0sUUFBUSxHQUFHLG1CQUFtQixDQUFDLFdBQVcsQ0FBQyxvQkFBb0IsRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLFFB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