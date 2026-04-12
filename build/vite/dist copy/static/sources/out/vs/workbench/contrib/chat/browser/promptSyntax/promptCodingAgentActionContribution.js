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
import { Disposable, DisposableMap } from '../../../../../base/common/lifecycle.js';
import { registerEditorContribution } from '../../../../../editor/browser/editorExtensions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { PROMPT_LANGUAGE_ID } from '../../common/promptSyntax/promptTypes.js';
import { PromptCodingAgentActionOverlayWidget } from './promptCodingAgentActionOverlay.js';
let PromptCodingAgentActionContribution = class PromptCodingAgentActionContribution extends Disposable {
    static { this.ID = 'promptCodingAgentActionContribution'; }
    constructor(_editor, _instantiationService) {
        super();
        this._editor = _editor;
        this._instantiationService = _instantiationService;
        this._overlayWidgets = this._register(new DisposableMap());
        this._register(this._editor.onDidChangeModel(() => {
            this._updateOverlayWidget();
        }));
        this._updateOverlayWidget();
    }
    _updateOverlayWidget() {
        const model = this._editor.getModel();
        // Remove existing overlay if present
        this._overlayWidgets.deleteAndDispose(this._editor);
        // Add overlay if this is a prompt file
        if (model && model.getLanguageId() === PROMPT_LANGUAGE_ID) {
            const widget = this._instantiationService.createInstance(PromptCodingAgentActionOverlayWidget, this._editor);
            this._overlayWidgets.set(this._editor, widget);
        }
    }
};
PromptCodingAgentActionContribution = __decorate([
    __param(1, IInstantiationService)
], PromptCodingAgentActionContribution);
export { PromptCodingAgentActionContribution };
registerEditorContribution(PromptCodingAgentActionContribution.ID, PromptCodingAgentActionContribution, 1 /* EditorContributionInstantiation.AfterFirstRender */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0Q29kaW5nQWdlbnRBY3Rpb25Db250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvcHJvbXB0U3ludGF4L3Byb21wdENvZGluZ0FnZW50QWN0aW9uQ29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFcEYsT0FBTyxFQUFFLDBCQUEwQixFQUFtQyxNQUFNLG1EQUFtRCxDQUFDO0FBQ2hJLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxvQ0FBb0MsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRXBGLElBQU0sbUNBQW1DLEdBQXpDLE1BQU0sbUNBQW9DLFNBQVEsVUFBVTthQUNsRCxPQUFFLEdBQUcscUNBQXFDLEFBQXhDLENBQXlDO0lBSTNELFlBQ2tCLE9BQW9CLEVBQ2QscUJBQTZEO1FBRXBGLEtBQUssRUFBRSxDQUFDO1FBSFMsWUFBTyxHQUFQLE9BQU8sQ0FBYTtRQUNHLDBCQUFxQixHQUFyQixxQkFBcUIsQ0FBdUI7UUFKcEUsb0JBQWUsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksYUFBYSxFQUFxRCxDQUFDLENBQUM7UUFRekgsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLGdCQUFnQixDQUFDLEdBQUcsRUFBRTtZQUNqRCxJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztRQUM3QixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUM7SUFDN0IsQ0FBQztJQUNPLG9CQUFvQjtRQUMzQixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBRXRDLHFDQUFxQztRQUNyQyxJQUFJLENBQUMsZUFBZSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUVwRCx1Q0FBdUM7UUFDdkMsSUFBSSxLQUFLLElBQUksS0FBSyxDQUFDLGFBQWEsRUFBRSxLQUFLLGtCQUFrQixFQUFFLENBQUM7WUFDM0QsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLGNBQWMsQ0FBQyxvQ0FBb0MsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDN0csSUFBSSxDQUFDLGVBQWUsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxNQUFNLENBQUMsQ0FBQztRQUNoRCxDQUFDO0lBQ0YsQ0FBQzs7QUE1QlcsbUNBQW1DO0lBTzdDLFdBQUEscUJBQXFCLENBQUE7R0FQWCxtQ0FBbUMsQ0E2Qi9DOztBQUVELDBCQUEwQixDQUFDLG1DQUFtQyxDQUFDLEVBQUUsRUFBRSxtQ0FBbUMsMkRBQW1ELENBQUMifQ==