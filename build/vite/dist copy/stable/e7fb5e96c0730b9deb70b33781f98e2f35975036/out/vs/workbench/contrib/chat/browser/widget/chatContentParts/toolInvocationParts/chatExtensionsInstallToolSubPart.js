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
import { Emitter } from '../../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../../nls.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { IExtensionManagementService } from '../../../../../../../platform/extensionManagement/common/extensionManagement.js';
import { areSameExtensions } from '../../../../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../../platform/keybinding/common/keybinding.js';
import { ChatContextKeys } from '../../../../common/actions/chatContextKeys.js';
import { IChatToolInvocation } from '../../../../common/chatService/chatService.js';
import { CancelChatActionId } from '../../../actions/chatExecuteActions.js';
import { AcceptToolConfirmationActionId } from '../../../actions/chatToolActions.js';
import { IChatWidgetService } from '../../../chat.js';
import { ChatConfirmationWidget } from '../chatConfirmationWidget.js';
import { ChatExtensionsContentPart } from '../chatExtensionsContentPart.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';
let ExtensionsInstallConfirmationWidgetSubPart = class ExtensionsInstallConfirmationWidgetSubPart extends BaseChatToolInvocationSubPart {
    get codeblocks() {
        return this._confirmWidget?.codeblocks || [];
    }
    get codeblocksPartId() {
        return this._confirmWidget?.codeblocksPartId || '<none>';
    }
    constructor(toolInvocation, context, keybindingService, contextKeyService, chatWidgetService, extensionManagementService, instantiationService) {
        super(toolInvocation);
        if (toolInvocation.toolSpecificData?.kind !== 'extensions') {
            throw new Error('Tool specific data is missing or not of kind extensions');
        }
        const extensionsContent = toolInvocation.toolSpecificData;
        this.domNode = dom.$('');
        const chatExtensionsContentPart = this._register(instantiationService.createInstance(ChatExtensionsContentPart, extensionsContent));
        dom.append(this.domNode, chatExtensionsContentPart.domNode);
        const state = toolInvocation.state.get();
        if (state.type === 1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */) {
            const allowLabel = localize('allow', "Allow");
            const allowTooltip = keybindingService.appendKeybinding(allowLabel, AcceptToolConfirmationActionId);
            const cancelLabel = localize('cancel', "Cancel");
            const cancelTooltip = keybindingService.appendKeybinding(cancelLabel, CancelChatActionId);
            const enableAllowButtonEvent = this._register(new Emitter());
            const buttons = [
                {
                    label: allowLabel,
                    data: { type: 4 /* ToolConfirmKind.UserAction */ },
                    tooltip: allowTooltip,
                    disabled: true,
                    onDidChangeDisablement: enableAllowButtonEvent.event
                },
                {
                    label: cancelLabel,
                    data: { type: 0 /* ToolConfirmKind.Denied */ },
                    isSecondary: true,
                    tooltip: cancelTooltip
                }
            ];
            const confirmWidget = this._register(instantiationService.createInstance((ChatConfirmationWidget), context, {
                title: state.confirmationMessages?.title ?? localize('installExtensions', "Install Extensions"),
                message: state.confirmationMessages?.message ?? localize('installExtensionsConfirmation', "Click the Install button on the extension and then press Allow when finished."),
                buttons,
            }));
            this._confirmWidget = confirmWidget;
            dom.append(this.domNode, confirmWidget.domNode);
            this._register(confirmWidget.onDidClick(button => {
                IChatToolInvocation.confirmWith(toolInvocation, button.data);
                chatWidgetService.getWidgetBySessionResource(context.element.sessionResource)?.focusInput();
            }));
            const hasToolConfirmationKey = ChatContextKeys.Editing.hasToolConfirmation.bindTo(contextKeyService);
            hasToolConfirmationKey.set(true);
            this._register(toDisposable(() => hasToolConfirmationKey.reset()));
            const disposable = this._register(extensionManagementService.onInstallExtension(e => {
                if (extensionsContent.extensions.some(id => areSameExtensions({ id }, e.identifier))) {
                    disposable.dispose();
                    enableAllowButtonEvent.fire(false);
                }
            }));
        }
    }
};
ExtensionsInstallConfirmationWidgetSubPart = __decorate([
    __param(2, IKeybindingService),
    __param(3, IContextKeyService),
    __param(4, IChatWidgetService),
    __param(5, IExtensionManagementService),
    __param(6, IInstantiationService)
], ExtensionsInstallConfirmationWidgetSubPart);
export { ExtensionsInstallConfirmationWidgetSubPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEV4dGVuc2lvbnNJbnN0YWxsVG9vbFN1YlBhcnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvdG9vbEludm9jYXRpb25QYXJ0cy9jaGF0RXh0ZW5zaW9uc0luc3RhbGxUb29sU3ViUGFydC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLDBDQUEwQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDN0UsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ3ZELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ25HLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLGlGQUFpRixDQUFDO0FBQzlILE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHFGQUFxRixDQUFDO0FBQ3hILE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHFFQUFxRSxDQUFDO0FBQzVHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUNoRixPQUFPLEVBQW1CLG1CQUFtQixFQUFtQixNQUFNLCtDQUErQyxDQUFDO0FBQ3RILE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGtCQUFrQixD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