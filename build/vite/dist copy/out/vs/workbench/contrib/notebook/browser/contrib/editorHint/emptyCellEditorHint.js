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
import { Schemas } from '../../../../../../base/common/network.js';
import { registerEditorContribution } from '../../../../../../editor/browser/editorExtensions.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IChatAgentService } from '../../../../chat/common/participants/chatAgents.js';
import { EmptyTextEditorHintContribution } from '../../../../codeEditor/browser/emptyTextEditorHint/emptyTextEditorHint.js';
import { IInlineChatSessionService } from '../../../../inlineChat/browser/inlineChatSessionService.js';
import { getNotebookEditorFromEditorPane } from '../../notebookBrowser.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
let EmptyCellEditorHintContribution = class EmptyCellEditorHintContribution extends EmptyTextEditorHintContribution {
    static { this.CONTRIB_ID = 'notebook.editor.contrib.emptyCellEditorHint'; }
    constructor(editor, _editorService, configurationService, inlineChatSessionService, chatAgentService, instantiationService) {
        super(editor, configurationService, inlineChatSessionService, chatAgentService, instantiationService);
        this._editorService = _editorService;
        const activeEditor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
        if (!activeEditor) {
            return;
        }
        this._register(activeEditor.onDidChangeActiveCell(() => this.update()));
    }
    shouldRenderHint() {
        const model = this.editor.getModel();
        if (!model) {
            return false;
        }
        const isNotebookCell = model?.uri.scheme === Schemas.vscodeNotebookCell;
        if (!isNotebookCell) {
            return false;
        }
        const activeEditor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
        if (!activeEditor || !activeEditor.isDisposed) {
            return false;
        }
        const shouldRenderHint = super.shouldRenderHint();
        if (!shouldRenderHint) {
            return false;
        }
        const activeCell = activeEditor.getActiveCell();
        if (activeCell?.uri.fragment !== model.uri.fragment) {
            return false;
        }
        return true;
    }
};
EmptyCellEditorHintContribution = __decorate([
    __param(1, IEditorService),
    __param(2, IConfigurationService),
    __param(3, IInlineChatSessionService),
    __param(4, IChatAgentService),
    __param(5, IInstantiationService)
], EmptyCellEditorHintContribution);
export { EmptyCellEditorHintContribution };
registerEditorContribution(EmptyCellEditorHintContribution.CONTRIB_ID, EmptyCellEditorHintContribution, 0 /* EditorContributionInstantiation.Eager */); // eager because it needs to render a help message
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW1wdHlDZWxsRWRpdG9ySGludC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvY29udHJpYi9lZGl0b3JIaW50L2VtcHR5Q2VsbEVkaXRvckhpbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRW5FLE9BQU8sRUFBbUMsMEJBQTBCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUNuSSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUN2RixPQUFPLEVBQUUsK0JBQStCLEVBQUUsTUFBTSwyRUFBMkUsQ0FBQztBQUM1SCxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUN2RyxPQUFPLEVBQUUsK0JBQStCLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUMzRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDeEYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFFbEcsSUFBTSwrQkFBK0IsR0FBckMsTUFBTSwrQkFBZ0MsU0FBUSwrQkFBK0I7YUFDNUQsZUFBVSxHQUFHLDZDQUE2QyxBQUFoRCxDQUFpRDtJQUNsRixZQUNDLE1BQW1CLEVBQ2MsY0FBOEIsRUFDeEMsb0JBQTJDLEVBQ3ZDLHdCQUFtRCxFQUMzRCxnQkFBbUMsRUFDL0Isb0JBQTJDO1FBRWxFLEtBQUssQ0FDSixNQUFNLEVBQ04sb0JBQW9CLEVBQ3BCLHdCQUF3QixFQUN4QixnQkFBZ0IsRUFDaEIsb0JBQW9CLENBQ3BCLENBQUM7UUFaK0IsbUJBQWMsR0FBZCxjQUFjLENBQWdCO1FBYy9ELE1BQU0sWUFBWSxHQUFHLCtCQUErQixDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUMzRixJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDbkIsT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLENBQUMsU0FBUyxDQUFDLFlBQVksQ0FBQyxxQkFBcUIsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ3pFLENBQUM7SUFFa0IsZ0JBQWdCO1FBQ2xDLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDckMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ1osT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO1FBRUQsTUFBTSxjQUFjLEdBQUcsS0FBSyxFQUFFLEdBQUcsQ0FBQyxNQUFNLEtBQUssT0FBTyxDQUFDLGtCQUFrQixDQUFDO1FBQ3hFLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUNyQixPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7UUFFRCxNQUFNLFlBQVksR0FBRywrQkFBK0IsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDM0YsSUFBSSxDQUFDLFlBQVksSUFBSSxDQUFDLFlBQVksQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUMvQyxPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7UUFFRCxNQUFNLGdCQUFnQixHQUFHLEtBQUssQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1FBQ2xELElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1lBQ3ZCLE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUVELE1BQU0sVUFBVSxHQUFHLFlBQVksQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUVoRCxJQUFJLFVBQVUsRUFBRSxHQUFHLENBQUMsUUFBUSxLQUFLLEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDckQsT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDOztBQXREVywrQkFBK0I7SUFJekMsV0FBQSxjQUFjLENBQUE7SUFDZCxXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFdBQUEseUJBQXlCLENBQUE7SUFDekIsV0FBQSxpQkFBaUIsQ0FBQTtJQUNqQixXQUFBLHFCQUFxQixDQUFBO0dBUlgsK0JBQStCLENBdUQzQzs7QUFFRCwwQkFBMEIsQ0FBQywrQkFBK0IsQ0FBQyxVQUFVLEVBQUUsK0JBQStCLGdEQUF3QyxDQUFDLENBQUMsa0RBQWtEIn0=