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
import * as dom from '../../../../../../../base/browser/dom.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { localize } from '../../../../../../../nls.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../../platform/keybinding/common/keybinding.js';
import { ILanguageModelToolsService } from '../../../../common/tools/languageModelToolsService.js';
import { AcceptToolConfirmationActionId, SkipToolConfirmationActionId } from '../../../actions/chatToolActions.js';
import { IChatWidgetService } from '../../../chat.js';
import { AbstractToolConfirmationSubPart } from './abstractToolConfirmationSubPart.js';
let ChatMissingSandboxDepsConfirmationSubPart = class ChatMissingSandboxDepsConfirmationSubPart extends AbstractToolConfirmationSubPart {
    constructor(toolInvocation, _terminalData, context, renderer, instantiationService, keybindingService, contextKeyService, chatWidgetService, languageModelToolsService) {
        super(toolInvocation, context, instantiationService, keybindingService, contextKeyService, chatWidgetService, languageModelToolsService);
        this.renderer = renderer;
        this.codeblocks = [];
        this.render({
            allowActionId: AcceptToolConfirmationActionId,
            skipActionId: SkipToolConfirmationActionId,
            allowLabel: localize('missingDeps.install', "Install"),
            skipLabel: localize('missingDeps.cancel', "Cancel"),
            partType: 'chatMissingSandboxDepsConfirmation',
        });
    }
    createContentElement() {
        const state = this.toolInvocation.state.get();
        const message = state.type === 1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */
            ? state.confirmationMessages?.message
            : undefined;
        const container = dom.$('.chat-missing-sandbox-deps-confirmation');
        if (message) {
            const mdMessage = typeof message === 'string' ? new MarkdownString(message) : message;
            const rendered = this.renderer.render(mdMessage);
            this._register(rendered);
            container.appendChild(rendered.element);
        }
        return container;
    }
    getTitle() {
        const state = this.toolInvocation.state.get();
        if (state.type === 1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */ && state.confirmationMessages?.title) {
            return typeof state.confirmationMessages.title === 'string'
                ? state.confirmationMessages.title
                : state.confirmationMessages.title.value;
        }
        return '';
    }
};
ChatMissingSandboxDepsConfirmationSubPart = __decorate([
    __param(4, IInstantiationService),
    __param(5, IKeybindingService),
    __param(6, IContextKeyService),
    __param(7, IChatWidgetService),
    __param(8, ILanguageModelToolsService)
], ChatMissingSandboxDepsConfirmationSubPart);
export { ChatMissingSandboxDepsConfirmationSubPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdE1pc3NpbmdTYW5kYm94RGVwc0NvbmZpcm1hdGlvblN1YlBhcnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvdG9vbEludm9jYXRpb25QYXJ0cy9jaGF0TWlzc2luZ1NhbmRib3hEZXBzQ29uZmlybWF0aW9uU3ViUGFydC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLDBDQUEwQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNqRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDdkQsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDbkcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFDNUcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFHbkcsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDbkcsT0FBTyxFQUFFLDhCQUE4QixFQUFFLDRCQUE0QixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDbkgsT0FBTyxFQUFzQixrQkFBa0IsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBRTFFLE9BQU8sRUFBRSwrQkFBK0IsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRWhGLElBQU0seUNBQXlDLEdBQS9DLE1BQU0seUNBQTBDLFNBQVEsK0JBQStCO0lBRzdGLFlBQ0MsY0FBbUMsRUFDbkMsYUFBOEMsRUFDOUMsT0FBc0MsRUFDckIsUUFBMkIsRUFDckIsb0JBQTJDLEVBQzlDLGlCQUFxQyxFQUNyQyxpQkFBcUMsRUFDckMsaUJBQXFDLEVBQzdCLHlCQUFxRDtRQUVqRixLQUFLLENBQUMsY0FBYyxFQUFFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxpQkFBaUIsRUFBRSxpQkFBaUIsRUFBRSxpQkFBaUIsRUFBRSx5QkFBeUIsQ0FBQyxDQUFDO1FBUHhILGFBQVEsR0FBUixRQUFRLENBQW1CO1FBTjdCLGVBQVUsR0FBeUIsRUFBRSxDQUFDO1FBZXJELElBQUksQ0FBQyxNQUFNLENBQUM7WUFDWCxhQUFhLEVBQUUsOEJBQThCO1lBQzdDLFlBQVksRUFBRSw0QkFBNEI7WUFDMUMsVUFBVSxFQUFFLFFBQVEsQ0FBQyxxQkFBcUIsRUFBRSxTQUFTLENBQUM7WUFDdEQsU0FBUyxFQUFFLFFBQVEsQ0FBQyxvQkFBb0IsRUFBRSxRQUFRLENBQUM7WUFDbkQsUUFBUSxFQUFFLG9DQUFvQztTQUM5QyxDQUFDLENBQUM7SUFDSixDQUFDO0lBRWtCLG9CQUFvQjtRQUN0QyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUM5QyxNQUFNLE9BQU8sR0FBRyxLQUFLLENBQUMsSUFBSSxpRUFBeUQ7WUFDbEYsQ0FBQyxDQUFDLEtBQUssQ0FBQyxvQkFBb0IsRUFBRSxPQUFPO1lBQ3JDLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFFYixNQUFNLFNBQVMsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLHlDQUF5QyxDQUFDLENBQUM7UUFDbkUsSUFBSSxPQUFPLEVBQUUsQ0FBQztZQUNiLE1BQU0sU0FBUyxHQUFHLE9BQU8sT0FBTyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsSUFBSSxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQztZQUN0RixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUNqRCxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ3pCLFNBQVMsQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3pDLENBQUM7UUFDRCxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRWtCLFFBQVE7UUFDMUIsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDOUMsSUFBSSxLQUFLLENBQUMsSUFBSSxpRUFBeUQsSUFBSSxLQUFLLENBQUMsb0JBQW9CLEVBQUUsS0FBSyxFQUFFLENBQUM7WUFDOUcsT0FBTyxPQUFPLEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxLQUFLLEtBQUssUUFBUTtnQkFDMUQsQ0FBQyxDQUFDLEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxLQUFLO2dCQUNsQyxDQUFDLENBQUMsS0FBSyxDQUFDLG9CQUFvQixDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUM7UUFDM0MsQ0FBQztRQUNELE9BQU8sRUFBRSxDQUFDO0lBQ1gsQ0FBQztDQUNELENBQUE7QUFsRFkseUNBQXlDO0lBUW5ELFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxrQkFBa0IsQ0FBQTtJQUNsQixXQUFBLGtCQUFrQixDQUFBO0lBQ2xCLFdBQUEsa0JBQWtCLENBQUE7SUFDbEIsV0FBQSwwQkFBMEIsQ0FBQTtHQVpoQix5Q0FBeUMsQ0FrRHJEIn0=