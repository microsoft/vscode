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
import { isObject } from '../../../../base/common/types.js';
import { ResourceEdit } from '../../../../editor/browser/services/bulkEditService.js';
import { IUndoRedoService } from '../../../../platform/undoRedo/common/undoRedo.js';
export class ResourceAttachmentEdit extends ResourceEdit {
    static is(candidate) {
        if (candidate instanceof ResourceAttachmentEdit) {
            return true;
        }
        else {
            return isObject(candidate)
                && (Boolean(candidate.undo && candidate.redo));
        }
    }
    static lift(edit) {
        if (edit instanceof ResourceAttachmentEdit) {
            return edit;
        }
        else {
            return new ResourceAttachmentEdit(edit.resource, edit.undo, edit.redo, edit.metadata);
        }
    }
    constructor(resource, undo, redo, metadata) {
        super(metadata);
        this.resource = resource;
        this.undo = undo;
        this.redo = redo;
    }
}
let OpaqueEdits = class OpaqueEdits {
    constructor(_undoRedoGroup, _undoRedoSource, _progress, _token, _edits, _undoRedoService) {
        this._undoRedoGroup = _undoRedoGroup;
        this._undoRedoSource = _undoRedoSource;
        this._progress = _progress;
        this._token = _token;
        this._edits = _edits;
        this._undoRedoService = _undoRedoService;
    }
    async apply() {
        const resources = [];
        for (const edit of this._edits) {
            if (this._token.isCancellationRequested) {
                break;
            }
            await edit.redo();
            this._undoRedoService.pushElement({
                type: 0 /* UndoRedoElementType.Resource */,
                resource: edit.resource,
                label: edit.metadata?.label || 'Custom Edit',
                code: 'paste',
                undo: edit.undo,
                redo: edit.redo,
            }, this._undoRedoGroup, this._undoRedoSource);
            this._progress.report(undefined);
            resources.push(edit.resource);
        }
        return resources;
    }
};
OpaqueEdits = __decorate([
    __param(5, IUndoRedoService)
], OpaqueEdits);
export { OpaqueEdits };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3BhcXVlRWRpdHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9idWxrRWRpdC9icm93c2VyL29wYXF1ZUVkaXRzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUU1RCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFHdEYsT0FBTyxFQUFFLGdCQUFnQixFQUFzRCxNQUFNLGtEQUFrRCxDQUFDO0FBRXhJLE1BQU0sT0FBTyxzQkFBdUIsU0FBUSxZQUFZO0lBRXZELE1BQU0sQ0FBQyxFQUFFLENBQUMsU0FBa0I7UUFDM0IsSUFBSSxTQUFTLFlBQVksc0JBQXNCLEVBQUUsQ0FBQztZQUNqRCxPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7YUFBTSxDQUFDO1lBQ1AsT0FBTyxRQUFRLENBQUMsU0FBUyxDQUFDO21CQUN0QixDQUFDLE9BQU8sQ0FBZSxTQUFVLENBQUMsSUFBSSxJQUFrQixTQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUMvRSxDQUFDO0lBQ0YsQ0FBQztJQUVELE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBaUI7UUFDNUIsSUFBSSxJQUFJLFlBQVksc0JBQXNCLEVBQUUsQ0FBQztZQUM1QyxPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7YUFBTSxDQUFDO1lBQ1AsT0FBTyxJQUFJLHNCQUFzQixDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUN2RixDQUFDO0lBQ0YsQ0FBQztJQUVELFlBQ1UsUUFBYSxFQUNiLElBQWdDLEVBQ2hDLElBQWdDLEVBQ3pDLFFBQWdDO1FBRWhDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUxQLGFBQVEsR0FBUixRQUFRLENBQUs7UUFDYixTQUFJLEdBQUosSUFBSSxDQUE0QjtRQUNoQyxTQUFJLEdBQUosSUFBSSxDQUE0QjtJQUkxQyxDQUFDO0NBQ0Q7QUFFTSxJQUFNLFdBQVcsR0FBakIsTUFBTSxXQUFXO0lBRXZCLFlBQ2tCLGNBQTZCLEVBQzdCLGVBQTJDLEVBQzNDLFNBQTBCLEVBQzFCLE1BQXlCLEVBQ3pCLE1BQWdDLEVBQ2QsZ0JBQWtDO1FBTHBELG1CQUFjLEdBQWQsY0FBYyxDQUFlO1FBQzdCLG9CQUFlLEdBQWYsZUFBZSxDQUE0QjtRQUMzQyxjQUFTLEdBQVQsU0FBUyxDQUFpQjtRQUMxQixXQUFNLEdBQU4sTUFBTSxDQUFtQjtRQUN6QixXQUFNLEdBQU4sTUFBTSxDQUEwQjtRQUNkLHFCQUFnQixHQUFoQixnQkFBZ0IsQ0FBa0I7SUFDbEUsQ0FBQztJQUVMLEtBQUssQ0FBQyxLQUFLO1FBQ1YsTUFBTSxTQUFTLEdBQVUsRUFBRSxDQUFDO1FBRTVCLEtBQUssTUFBTSxJQUFJLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2hDLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO2dCQUN6QyxNQUFNO1lBQ1AsQ0FBQztZQUVELE1BQU0sSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1lBRWxCLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxXQUFXLENBQUM7Z0JBQ2pDLElBQUksc0NBQThCO2dCQUNsQyxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVE7Z0JBQ3ZCLEtBQUssRUFBRSxJQUFJLENBQUMsUUFBUSxFQUFFLEtBQUssSUFBSSxhQUFhO2dCQUM1QyxJQUFJLEVBQUUsT0FBTztnQkFDYixJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUk7Z0JBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJO2FBQ2YsRUFBRSxJQUFJLENBQUMsY0FBYyxFQUFFLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUU5QyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUNqQyxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUMvQixDQUFDO1FBRUQsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztDQUNELENBQUE7QUFwQ1ksV0FBVztJQVFyQixXQUFBLGdCQUFnQixDQUFBO0dBUk4sV0FBVyxDQW9DdkIifQ==