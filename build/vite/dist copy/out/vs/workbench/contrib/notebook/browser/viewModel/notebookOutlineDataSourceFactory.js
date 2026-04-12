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
import { ReferenceCollection } from '../../../../../base/common/lifecycle.js';
import { IInstantiationService, createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { NotebookCellOutlineDataSource } from './notebookOutlineDataSource.js';
let NotebookCellOutlineDataSourceReferenceCollection = class NotebookCellOutlineDataSourceReferenceCollection extends ReferenceCollection {
    constructor(instantiationService) {
        super();
        this.instantiationService = instantiationService;
    }
    createReferencedObject(_key, editor) {
        return this.instantiationService.createInstance(NotebookCellOutlineDataSource, editor);
    }
    destroyReferencedObject(_key, object) {
        object.dispose();
    }
};
NotebookCellOutlineDataSourceReferenceCollection = __decorate([
    __param(0, IInstantiationService)
], NotebookCellOutlineDataSourceReferenceCollection);
export const INotebookCellOutlineDataSourceFactory = createDecorator('INotebookCellOutlineDataSourceFactory');
let NotebookCellOutlineDataSourceFactory = class NotebookCellOutlineDataSourceFactory {
    constructor(instantiationService) {
        this._data = instantiationService.createInstance(NotebookCellOutlineDataSourceReferenceCollection);
    }
    getOrCreate(editor) {
        return this._data.acquire(editor.getId(), editor);
    }
};
NotebookCellOutlineDataSourceFactory = __decorate([
    __param(0, IInstantiationService)
], NotebookCellOutlineDataSourceFactory);
export { NotebookCellOutlineDataSourceFactory };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tPdXRsaW5lRGF0YVNvdXJjZUZhY3RvcnkuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL3ZpZXdNb2RlbC9ub3RlYm9va091dGxpbmVEYXRhU291cmNlRmFjdG9yeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsbUJBQW1CLEVBQW1CLE1BQU0seUNBQXlDLENBQUM7QUFDL0YsT0FBTyxFQUFFLHFCQUFxQixFQUFFLGVBQWUsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBRXZILE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRS9FLElBQU0sZ0RBQWdELEdBQXRELE1BQU0sZ0RBQWlELFNBQVEsbUJBQWtEO0lBQ2hILFlBQW9ELG9CQUEyQztRQUM5RixLQUFLLEVBQUUsQ0FBQztRQUQyQyx5QkFBb0IsR0FBcEIsb0JBQW9CLENBQXVCO0lBRS9GLENBQUM7SUFDa0Isc0JBQXNCLENBQUMsSUFBWSxFQUFFLE1BQXVCO1FBQzlFLE9BQU8sSUFBSSxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyw2QkFBNkIsRUFBRSxNQUFNLENBQUMsQ0FBQztJQUN4RixDQUFDO0lBQ2tCLHVCQUF1QixDQUFDLElBQVksRUFBRSxNQUFxQztRQUM3RixNQUFNLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDbEIsQ0FBQztDQUNELENBQUE7QUFWSyxnREFBZ0Q7SUFDeEMsV0FBQSxxQkFBcUIsQ0FBQTtHQUQ3QixnREFBZ0QsQ0FVckQ7QUFFRCxNQUFNLENBQUMsTUFBTSxxQ0FBcUMsR0FBRyxlQUFlLENBQXdDLHVDQUF1QyxDQUFDLENBQUM7QUFNOUksSUFBTSxvQ0FBb0MsR0FBMUMsTUFBTSxvQ0FBb0M7SUFFaEQsWUFBbUMsb0JBQTJDO1FBQzdFLElBQUksQ0FBQyxLQUFLLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLGdEQUFnRCxDQUFDLENBQUM7SUFDcEcsQ0FBQztJQUVELFdBQVcsQ0FBQyxNQUF1QjtRQUNsQyxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsRUFBRSxNQUFNLENBQUMsQ0FBQztJQUNuRCxDQUFDO0NBQ0QsQ0FBQTtBQVRZLG9DQUFvQztJQUVuQyxXQUFBLHFCQUFxQixDQUFBO0dBRnRCLG9DQUFvQyxDQVNoRCJ9