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
import * as dom from '../../../../../../base/browser/dom.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { defaultButtonStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { assertIsResponseVM } from '../../../common/model/chatViewModel.js';
import { IChatAccessibilityService, IChatWidgetService } from '../../chat.js';
import { ChatErrorWidget } from './chatErrorContentPart.js';
const $ = dom.$;
let ChatErrorConfirmationContentPart = class ChatErrorConfirmationContentPart extends Disposable {
    constructor(kind, content, errorDetails, confirmationButtons, renderer, context, instantiationService, chatWidgetService, chatService, chatAccessibilityService) {
        super();
        this.errorDetails = errorDetails;
        this.chatAccessibilityService = chatAccessibilityService;
        const element = context.element;
        assertIsResponseVM(element);
        this.domNode = $('.chat-error-confirmation');
        this.domNode.append(this._register(new ChatErrorWidget(kind, content, renderer)).domNode);
        const buttonOptions = { ...defaultButtonStyles };
        const buttonContainer = dom.append(this.domNode, $('.chat-buttons-container'));
        confirmationButtons.forEach(buttonData => {
            const button = this._register(new Button(buttonContainer, buttonOptions));
            button.label = buttonData.label;
            this._register(button.onDidClick(async () => {
                const prompt = buttonData.label;
                const options = buttonData.isSecondary ?
                    { rejectedConfirmationData: [buttonData.data] } :
                    { acceptedConfirmationData: [buttonData.data] };
                options.agentId = element.agent?.id;
                options.slashCommand = element.slashCommand?.name;
                options.confirmation = buttonData.label;
                const widget = chatWidgetService.getWidgetBySessionResource(element.sessionResource);
                options.userSelectedModelId = widget?.input.currentLanguageModel;
                Object.assign(options, widget?.getModeRequestOptions());
                this.chatAccessibilityService.acceptRequest(element.sessionResource);
                await chatService.sendRequest(element.sessionResource, prompt, options);
            }));
        });
    }
    hasSameContent(other) {
        return other.kind === this.errorDetails.kind && other.isLast === this.errorDetails.isLast;
    }
    addDisposable(disposable) {
        this._register(disposable);
    }
};
ChatErrorConfirmationContentPart = __decorate([
    __param(6, IInstantiationService),
    __param(7, IChatWidgetService),
    __param(8, IChatService),
    __param(9, IChatAccessibilityService)
], ChatErrorConfirmationContentPart);
export { ChatErrorConfirmationContentPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEVycm9yQ29uZmlybWF0aW9uUGFydC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0RXJyb3JDb25maXJtYXRpb25QYXJ0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sdUNBQXVDLENBQUM7QUFDN0QsT0FBTyxFQUFFLE1BQU0sRUFBa0IsTUFBTSxvREFBb0QsQ0FBQztBQUU1RixPQUFPLEVBQUUsVUFBVSxFQUFlLE1BQU0sNENBQTRDLENBQUM7QUFFckYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDekcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDaEcsT0FBTyxFQUF3RixZQUFZLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNoSyxPQUFPLEVBQUUsa0JBQWtCLEVBQStDLE1BQU0sd0NBQXdDLENBQUM7QUFDekgsT0FBTyxFQUFFLHlCQUF5QixFQUFFLGtCQUFrQixFQUFFLE1BQU0sZUFBZSxDQUFDO0FBRTlFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUU1RCxNQUFNLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBRVQsSUFBTSxnQ0FBZ0MsR0FBdEMsTUFBTSxnQ0FBaUMsU0FBUSxVQUFVO0lBRy9ELFlBQ0MsSUFBb0IsRUFDcEIsT0FBd0IsRUFDUCxZQUFtQyxFQUNwRCxtQkFBa0UsRUFDbEUsUUFBMkIsRUFDM0IsT0FBc0MsRUFDZixvQkFBMkMsRUFDOUMsaUJBQXFDLEVBQzNDLFdBQXlCLEVBQ0ssd0JBQW1EO1FBRS9GLEtBQUssRUFBRSxDQUFDO1FBVFMsaUJBQVks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