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
var NotebookMultiDiffEditorWidgetInput_1;
import { URI } from '../../../../../base/common/uri.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { ITextResourceConfigurationService } from '../../../../../editor/common/services/textResourceConfiguration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { MultiDiffEditorInput } from '../../../multiDiffEditor/browser/multiDiffEditorInput.js';
import { IMultiDiffSourceResolverService } from '../../../multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { NotebookDiffEditorInput } from '../../common/notebookDiffEditorInput.js';
import { NotebookEditorInput } from '../../common/notebookEditorInput.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
export const NotebookMultiDiffEditorScheme = 'multi-cell-notebook-diff-editor';
export class NotebookMultiDiffEditorInput extends NotebookDiffEditorInput {
    static { this.ID = 'workbench.input.multiDiffNotebookInput'; }
    static create(instantiationService, resource, name, description, originalResource, viewType) {
        const original = NotebookEditorInput.getOrCreate(instantiationService, originalResource, undefined, viewType);
        const modified = NotebookEditorInput.getOrCreate(instantiationService, resource, undefined, viewType);
        return instantiationService.createInstance(NotebookMultiDiffEditorInput, name, description, original, modified, viewType);
    }
}
let NotebookMultiDiffEditorWidgetInput = NotebookMultiDiffEditorWidgetInput_1 = class NotebookMultiDiffEditorWidgetInput extends MultiDiffEditorInput {
    static createInput(notebookDiffViewModel, instantiationService) {
        const multiDiffSource = URI.parse(`${NotebookMultiDiffEditorScheme}:${new Date().getMilliseconds().toString() + Math.random().toString()}`);
        return instantiationService.createInstance(NotebookMultiDiffEditorWidgetInput_1, multiDiffSource, notebookDiffViewModel);
    }
    constructor(multiDiffSource, notebookDiffViewModel, _textModelService, _textResourceConfigurationService, _instantiationService, _multiDiffSourceResolverService, _textFileService) {
        super(multiDiffSource, undefined, undefined, true, _textModelService, _textResourceConfigurationService, _instantiationService, _multiDiffSourceResolverService, _textFileService);
        this.notebookDiffViewModel = notebookDiffViewModel;
        this._register(_multiDiffSourceResolverService.registerResolver(this));
    }
    canHandleUri(uri) {
        return uri.toString() === this.multiDiffSource.toString();
    }
    async resolveDiffSource(_) {
        return { resources: this.notebookDiffViewModel };
    }
};
NotebookMultiDiffEditorWidgetInput = NotebookMultiDiffEditorWidgetInput_1 = __decorate([
    __param(2, ITextModelService),
    __param(3, ITextResourceConfigurationService),
    __param(4, IInstantiationService),
    __param(5, IMultiDiffSourceResolverService),
    __param(6, ITextFileService)
], NotebookMultiDiffEditorWidgetInput);
export { NotebookMultiDiffEditorWidgetInput };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tNdWx0aURpZmZFZGl0b3JJbnB1dC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvZGlmZi9ub3RlYm9va011bHRpRGlmZkVkaXRvcklucHV0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDN0YsT0FBTyxFQUFFLGlDQUFpQyxFQUFFLE1BQU0sb0VBQW9FLENBQUM7QUFDdkgsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDaEcsT0FBTyxFQUFFLCtCQUErQixFQUEyRCxNQUFNLG9FQUFvRSxDQUFDO0FBRTlLLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBRXJGLE1BQU0sQ0FBQyxNQUFNLDZCQUE2QixHQUFHLGlDQUFpQyxDQUFDO0FBRS9FLE1BQU0sT0FBTyw0QkFBNkIsU0FBUSx1QkFBdUI7YUFDL0MsT0FBRSxHQUFXLHdDQUF3QyxDQUFDO0lBQy9FLE1BQU0sQ0FBVSxNQUFNLENBQUMsb0JBQTJDLEVBQUUsUUFBYSxFQUFFLElBQXdCLEVBQUUsV0FBK0IsRUFBRSxnQkFBcUIsRUFBRSxRQUFnQjtRQUNwTCxNQUFNLFFBQVEsR0FBRyxtQkFBbUIsQ0FBQyxXQUFXLENBQUMsb0JBQW9CLEVBQUUsZ0JBQWdCLEVBQUUsU0FBUyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQzlHLE1BQU0sUUFBUSxHQUFHLG1CQUFtQixDQUFDLFdBQVcsQ0FBQyxvQkFBb0IsRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQ3RHLE9BQU8sb0JBQW9CLENBQUMsY0FBYyxDQUFDLDRCQUE0QixFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxRQUFRLENBQUMsQ0FBQztJQUMzSCxDQUFDOztBQUdLLElBQU0sa0NBQWtDLDBDQUF4QyxNQUFNLGtDQUFtQyxTQUFRLG9CQUFvQjtJQUNwRSxNQUFNLENBQUMsV0FBVyxDQUFDLHFCQUE0QyxFQUFFLG9CQUEyQztRQUNsSCxNQUFNLGVBQWUsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsNkJBQTZCLElBQUksSUFBSSxJQUFJLEVBQUUsQ0FBQyxlQUFlLEVBQUUsQ0FBQyxRQUFRLEVBQUUsR0FBRyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzVJLE9BQU8sb0JBQW9CLENBQUMsY0FBYyxDQUN6QyxvQ0FBa0MsRUFDbEMsZUFBZSxFQUNmLHFCQUFxQixDQUNyQixDQUFDO0lBQ0gsQ0FBQztJQUNELFlBQ0MsZUFBb0IsRUFDSCxxQkFBNEMsRUFDMUMsaUJBQW9DLEVBQ3BCLGlDQUFvRSxFQUNoRixxQkFBNEMsRUFDbEMsK0JBQWdFLEVBQy9FLGdCQUFrQztRQUVwRCxLQUFLLENBQUMsZUFBZSxFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLGlCQUFpQixFQUFFLGlDQUFpQyxFQUFFLHFCQUFxQixFQUFFLCtCQUErQixFQUFFLGdCQUFnQixDQUFDLENBQUM7UUFQbEssMEJBQXFCLEdBQXJCLHFCQUFxQixDQUF1QjtRQVE3RCxJQUFJLENBQUMsU0FBUyxDQUFDLCtCQUErQixDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDeEUsQ0FBQztJQUVELFlBQVksQ0FBQyxHQUFRO1FBQ3BCLE9BQU8sR0FBRyxDQUFDLFFBQVEsRUFBRSxLQUFLLElBQUksQ0FBQyxlQUFlLENBQUMsUUFBUSxFQUFFLENBQUM7SUFDM0QsQ0FBQztJQUVELEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxDQUFNO1FBQzdCLE9BQU8sRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDLHFCQUFxQixFQUFFLENBQUM7SUFDbEQsQ0FBQztDQUNELENBQUE7QUE3Qlksa0NBQWtDO0lBWTVDLFdBQUEsaUJBQWlCLENBQUE7SUFDakIsV0FBQSxpQ0FBaUMsQ0FBQTtJQUNqQyxXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFdBQUEsK0JBQStCLENBQUE7SUFDL0IsV0FBQSxnQkFBZ0IsQ0FBQTtHQWhCTixrQ0FBa0MsQ0E2QjlDIn0=