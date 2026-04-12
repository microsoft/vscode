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
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { computeDiff } from '../../../../notebook/common/notebookDiff.js';
import { INotebookEditorModelResolverService } from '../../../../notebook/common/notebookEditorModelResolverService.js';
import { INotebookLoggingService } from '../../../../notebook/common/notebookLoggingService.js';
import { INotebookEditorWorkerService } from '../../../../notebook/common/services/notebookWorkerService.js';
let ChatEditingModifiedNotebookDiff = class ChatEditingModifiedNotebookDiff {
    static { this.NewModelCounter = 0; }
    constructor(original, modified, notebookEditorWorkerService, notebookLoggingService, notebookEditorModelService) {
        this.original = original;
        this.modified = modified;
        this.notebookEditorWorkerService = notebookEditorWorkerService;
        this.notebookLoggingService = notebookLoggingService;
        this.notebookEditorModelService = notebookEditorModelService;
    }
    async computeDiff() {
        let added = 0;
        let removed = 0;
        const disposables = new DisposableStore();
        try {
            const [modifiedRef, originalRef] = await Promise.all([
                this.notebookEditorModelService.resolve(this.modified.snapshotUri),
                this.notebookEditorModelService.resolve(this.original.snapshotUri)
            ]);
            disposables.add(modifiedRef);
            disposables.add(originalRef);
            const notebookDiff = await this.notebookEditorWorkerService.computeDiff(this.original.snapshotUri, this.modified.snapshotUri);
            const result = computeDiff(originalRef.object.notebook, modifiedRef.object.notebook, notebookDiff);
            result.cellDiffInfo.forEach(diff => {
                switch (diff.type) {
                    case 'modified':
                    case 'insert':
                        added++;
                        break;
                    case 'delete':
                        removed++;
                        break;
                    default:
                        break;
                }
            });
        }
        catch (e) {
            this.notebookLoggingService.error('Notebook Chat', 'Error computing diff:\n' + e);
        }
        finally {
            disposables.dispose();
        }
        return {
            added,
            removed,
            identical: added === 0 && removed === 0,
            quitEarly: false,
            isFinal: true,
            modifiedURI: this.modified.snapshotUri,
            originalURI: this.original.snapshotUri,
            isBusy: false,
        };
    }
};
ChatEditingModifiedNotebookDiff = __decorate([
    __param(2, INotebookEditorWorkerService),
    __param(3, INotebookLoggingService),
    __param(4, INotebookEditorModelResolverService)
], ChatEditingModifiedNotebookDiff);
export { ChatEditingModifiedNotebookDiff };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEVkaXRpbmdNb2RpZmllZE5vdGVib29rRGlmZi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0RWRpdGluZy9ub3RlYm9vay9jaGF0RWRpdGluZ01vZGlmaWVkTm90ZWJvb2tEaWZmLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUM3RSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDMUUsT0FBTyxFQUFFLG1DQUFtQyxFQUFFLE1BQU0sbUVBQW1FLENBQUM7QUFDeEgsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDaEcsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFJdEcsSUFBTSwrQkFBK0IsR0FBckMsTUFBTSwrQkFBK0I7YUFDcEMsb0JBQWUsR0FBVyxDQUFDLEFBQVosQ0FBYTtJQUNuQyxZQUNrQixRQUF3QixFQUN4QixRQUF3QixFQUNNLDJCQUF5RCxFQUM5RCxzQkFBK0MsRUFDbkMsMEJBQStEO1FBSnBHLGFBQVEsR0FBUixRQUFRLENBQWdCO1FBQ3hCLGFBQVEsR0FBUixRQUFRLENBQWdCO1FBQ00sZ0NBQTJCLEdBQTNCLDJCQUEyQixDQUE4QjtRQUM5RCwyQkFBc0IsR0FBdEIsc0JBQXNCLENBQXlCO1FBQ25DLCtCQUEwQixHQUExQiwwQkFBMEIsQ0FBcUM7SUFHdEgsQ0FBQztJQUVELEtBQUssQ0FBQyxXQUFXO1FBRWhCLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztRQUNkLElBQUksT0FBTyxHQUFHLENBQUMsQ0FBQztRQUVoQixNQUFNLFdBQVcsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBQzFDLElBQUksQ0FBQztZQUNKLE1BQU0sQ0FBQyxXQUFXLEVBQUUsV0FBVyxDQUFDLEdBQUcsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFDO2dCQUNwRCxJQUFJLENBQUMsMEJBQTBCLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDO2dCQUNsRSxJQUFJLENBQUMsMEJBQTBCLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDO2FBQ2xFLENBQUMsQ0FBQztZQUNILFdBQVcsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDN0IsV0FBVyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUM3QixNQUFNLFlBQVksR0FBRyxNQUFNLElBQUksQ0FBQywyQkFBMkIsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUM5SCxNQUFNLE1BQU0sR0FBRyxXQUFXLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsV0FBVyxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsWUFBWSxDQUFDLENBQUM7WUFDbkcsTUFBTSxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUU7Z0JBQ2xDLFFBQVEsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO29CQUNuQixLQUFLLFVBQVUsQ0FBQztvQkFDaEIsS0FBSyxRQUFRO3dCQUNaLEtBQUssRUFBRSxDQUFDO3dCQUNSLE1BQU07b0JBQ1AsS0FBSyxRQUFRO3dCQUNaLE9BQU8sRUFBRSxDQUFDO3dCQUNWLE1BQU07b0JBQ1A7d0JBQ0MsTUFBTTtnQkFDUixDQUFDO1lBQ0YsQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDO1FBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUNaLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxLQUFLLENBQUMsZUFBZSxFQUFFLHlCQUF5QixHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ25GLENBQUM7Z0JBQVMsQ0FBQztZQUNWLFdBQVcsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUN2QixDQUFDO1FBRUQsT0FBTztZQUNOLEtBQUs7WUFDTCxPQUFPO1lBQ1AsU0FBUyxFQUFFLEtBQUssS0FBSyxDQUFDLElBQUksT0FBTyxLQUFLLENBQUM7WUFDdkMsU0FBUyxFQUFFLEtBQUs7WUFDaEIsT0FBTyxFQUFFLElBQUk7WUFDYixXQUFXLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXO1lBQ3RDLFdBQVcsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVc7WUFDdEMsTUFBTSxFQUFFLEtBQUs7U0FDYixDQUFDO0lBQ0gsQ0FBQzs7QUF4RFcsK0JBQStCO0lBS3pDLFdBQUEsNEJBQTRCLENBQUE7SUFDNUIsV0FBQSx1QkFBdUIsQ0FBQTtJQUN2QixXQUFBLG1DQUFtQyxDQUFBO0dBUHpCLCtCQUErQixDQXlEM0MifQ==