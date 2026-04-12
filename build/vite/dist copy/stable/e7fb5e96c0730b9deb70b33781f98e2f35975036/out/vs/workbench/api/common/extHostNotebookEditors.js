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
import { Emitter } from '../../../base/common/event.js';
import { ILogService } from '../../../platform/log/common/log.js';
import * as typeConverters from './extHostTypeConverters.js';
let ExtHostNotebookEditors = class ExtHostNotebookEditors {
    constructor(_logService, _notebooksAndEditors) {
        this._logService = _logService;
        this._notebooksAndEditors = _notebooksAndEditors;
        this._onDidChangeNotebookEditorSelection = new Emitter();
        this._onDidChangeNotebookEditorVisibleRanges = new Emitter();
        this.onDidChangeNotebookEditorSelection = this._onDidChangeNotebookEditorSelection.event;
        this.onDidChangeNotebookEditorVisibleRanges = this._onDidChangeNotebookEditorVisibleRanges.event;
    }
    $acceptEditorPropertiesChanged(id, data) {
        this._logService.debug('ExtHostNotebook#$acceptEditorPropertiesChanged', id, data);
        const editor = this._notebooksAndEditors.getEditorById(id);
        // ONE: make all state updates
        if (data.visibleRanges) {
            editor._acceptVisibleRanges(data.visibleRanges.ranges.map(typeConverters.NotebookRange.to));
        }
        if (data.selections) {
            editor._acceptSelections(data.selections.selections.map(typeConverters.NotebookRange.to));
        }
        // TWO: send all events after states have been updated
        if (data.visibleRanges) {
            this._onDidChangeNotebookEditorVisibleRanges.fire({
                notebookEditor: editor.apiEditor,
                visibleRanges: editor.apiEditor.visibleRanges
            });
        }
        if (data.selections) {
            this._onDidChangeNotebookEditorSelection.fire(Object.freeze({
                notebookEditor: editor.apiEditor,
                selections: editor.apiEditor.selections
            }));
        }
    }
    $acceptEditorViewColumns(data) {
        for (const id in data) {
            const editor = this._notebooksAndEditors.getEditorById(id);
            editor._acceptViewColumn(typeConverters.ViewColumn.to(data[id]));
        }
    }
};
ExtHostNotebookEditors = __decorate([
    __param(0, ILogService)
], ExtHostNotebookEditors);
export { ExtHostNotebookEditors };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdE5vdGVib29rRWRpdG9ycy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3ROb3RlYm9va0VkaXRvcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3hELE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUdsRSxPQUFPLEtBQUssY0FBYyxNQUFNLDRCQUE0QixDQUFDO0FBSXRELElBQU0sc0JBQXNCLEdBQTVCLE1BQU0sc0JBQXNCO0lBUWxDLFlBQ2MsV0FBeUMsRUFDckMsb0JBQStDO1FBRGxDLGdCQUFXLEdBQVgsV0FBVyxDQUFhO1FBQ3JDLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBMkI7UUFSaEQsd0NBQW1DLEdBQUcsSUFBSSxPQUFPLEVBQTZDLENBQUM7UUFDL0YsNENBQXVDLEdBQUcsSUFBSSxPQUFPLEVBQWlELENBQUM7UUFFL0csdUNBQWtDLEdBQUcsSUFBSSxDQUFDLG1DQUFtQyxDQUFDLEtBQUssQ0FBQztRQUNwRiwyQ0FBc0MsR0FBRyxJQUFJLENBQUMsdUNBQXVDLENBQUMsS0FBSyxDQUFDO0lBS2pHLENBQUM7SUFFTCw4QkFBOEIsQ0FBQyxFQUFVLEVBQUUsSUFBeUM7UUFDbkYsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsZ0RBQWdELEVBQUUsRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ25GLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDM0QsOEJBQThCO1FBQzlCLElBQUksSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQ3hCLE1BQU0sQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzdGLENBQUM7UUFDRCxJQUFJLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUNyQixNQUFNLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMzRixDQUFDO1FBRUQsc0RBQXNEO1FBQ3RELElBQUksSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQ3hCLElBQUksQ0FBQyx1Q0FBdUMsQ0FBQyxJQUFJLENBQUM7Z0JBQ2pELGNBQWMsRUFBRSxNQUFNLENBQUMsU0FBUztnQkFDaEMsYUFBYSxFQUFFLE1BQU0sQ0FBQyxTQUFTLENBQUMsYUFBYTthQUM3QyxDQUFDLENBQUM7UUFDSixDQUFDO1FBQ0QsSUFBSSxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDckIsSUFBSSxDQUFDLG1DQUFtQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDO2dCQUMzRCxjQUFjLEVBQUUsTUFBTSxDQUFDLFNBQVM7Z0JBQ2hDLFVBQVUsRUFBRSxNQUFNLENBQUMsU0FBUyxDQUFDLFVBQVU7YUFDdkMsQ0FBQyxDQUFDLENBQUM7UUFDTCxDQUFDO0lBQ0YsQ0FBQztJQUVELHdCQUF3QixDQUFDLElBQW1DO1FBQzNELEtBQUssTUFBTSxFQUFFLElBQUksSUFBSSxFQUFFLENBQUM7WUFDdkIsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUMzRCxNQUFNLENBQUMsaUJBQWlCLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNsRSxDQUFDO0lBQ0YsQ0FBQztDQUNELENBQUE7QUE3Q1ksc0JBQXNCO0lBU2hDLFdBQUEsV0FBVyxDQUFBO0dBVEQsc0JBQXNCLENBNkNsQyJ9