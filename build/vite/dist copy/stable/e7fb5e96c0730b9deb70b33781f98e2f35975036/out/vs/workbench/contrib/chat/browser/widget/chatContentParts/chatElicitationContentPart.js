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
import { isMarkdownString, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { IChatAccessibilityService } from '../../chat.js';
import { AcceptElicitationRequestActionId } from '../../actions/chatElicitationActions.js';
import { ChatConfirmationWidget } from './chatConfirmationWidget.js';
let ChatElicitationContentPart = class ChatElicitationContentPart extends Disposable {
    get codeblocks() {
        return this._confirmWidget.codeblocks;
    }
    get codeblocksPartId() {
        return this._confirmWidget.codeblocksPartId;
    }
    constructor(elicitation, context, instantiationService, chatAccessibilityService, contextKeyService, keybindingService) {
        super();
        this.elicitation = elicitation;
        this.instantiationService = instantiationService;
        this.chatAccessibilityService = chatAccessibilityService;
        this.contextKeyService = contextKeyService;
        this.keybindingService = keybindingService;
        const buttons = [];
        if (elicitation.kind === 'elicitation2') {
            const acceptTooltip = this.keybindingService.appendKeybinding(elicitation.acceptButtonLabel, AcceptElicitationRequestActionId);
            buttons.push({
                label: elicitation.acceptButtonLabel,
                tooltip: acceptTooltip,
                data: true,
                moreActions: elicitation.moreActions?.map((action) => ({
                    label: action.label,
                    data: action,
                    run: action.run
                }))
            });
            if (elicitation.rejectButtonLabel && elicitation.reject) {
                buttons.push({ label: elicitation.rejectButtonLabel, data: false, isSecondary: true });
            }
            this._register(autorun(reader => {
                if (elicitation.isHidden?.read(reader)) {
                    this.domNode.remove();
                }
            }));
            const hasElicitationKey = ChatContextKeys.Editing.hasElicitationRequest.bindTo(this.contextKeyService);
            this._register(autorun(reader => {
                hasElicitationKey.set(elicitation.state.read(reader) === "pending" /* ElicitationState.Pending */);
            }));
            this._register(toDisposable(() => hasElicitationKey.reset()));
            this.chatAccessibilityService.acceptElicitation(elicitation);
        }
        const confirmationWidget = this._register(this.instantiationService.createInstance(ChatConfirmationWidget, context, {
            title: elicitation.title,
            subtitle: elicitation.subtitle,
            buttons,
            message: this.getMessageToRender(elicitation),
            toolbarData: { partType: 'elicitation', partSource: elicitation.source?.type, arg: elicitation },
        }));
        this._confirmWidget = confirmationWidget;
        confirmationWidget.setShowButtons(elicitation.kind === 'elicitation2' && elicitation.state.get() === "pending" /* ElicitationState.Pending */);
        this._register(confirmationWidget.onDidClick(async (e) => {
            if (elicitation.kind !== 'elicitation2') {
                return;
            }
            let result;
            if (typeof e.data === 'boolean' && e.data === true) {
                result = e.data;
            }
            else if (e.data && typeof e.data === 'object' && 'run' in e.data && 'label' in e.data) {
                result = e.data;
            }
            else {
                result = undefined;
            }
            if (result !== undefined) {
                await elicitation.accept(result);
            }
            else if (elicitation.reject) {
                await elicitation.reject();
            }
            confirmationWidget.setShowButtons(false);
            confirmationWidget.updateMessage(this.getMessageToRender(elicitation));
        }));
        this.domNode = confirmationWidget.domNode;
        this.domNode.tabIndex = 0;
        const messageToRender = this.getMessageToRender(elicitation);
        this.domNode.ariaLabel = elicitation.title + ' ' + (typeof messageToRender === 'string' ? messageToRender : messageToRender.value || '');
    }
    getMessageToRender(elicitation) {
        if (!elicitation.acceptedResult) {
            return elicitation.message;
        }
        const messageMd = isMarkdownString(elicitation.message) ? MarkdownString.lift(elicitation.message) : new MarkdownString(elicitation.message);
        messageMd.appendCodeblock('json', JSON.stringify(elicitation.acceptedResult, null, 2));
        return messageMd;
    }
    hasSameContent(other) {
        // No other change allowed for this content type
        return other === this.elicitation;
    }
    addDisposable(disposable) {
        this._register(disposable);
    }
};
ChatElicitationContentPart = __decorate([
    __param(2, IInstantiationService),
    __param(3, IChatAccessibilityService),
    __param(4, IContextKeyService),
    __param(5, IKeybindingService)
], ChatElicitationContentPart);
export { ChatElicitationContentPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEVsaWNpdGF0aW9uQ29udGVudFBhcnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdEVsaWNpdGF0aW9uQ29udGVudFBhcnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFtQixnQkFBZ0IsRUFBRSxjQUFjLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUNqSCxPQUFPLEVBQUUsVUFBVSxFQUFlLFlBQVksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUVoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFFN0UsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sZUFBZSxDQUFDO0FBQzFELE9BQU8sRUFBRSxnQ0FBZ0MsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzNGLE9BQU8sRUFBRSxzQkFBc0IsRUFBMkIsTUFBTSw2QkFBNkIsQ0FBQztBQUl2RixJQUFNLDBCQUEwQixHQUFoQyxNQUFNLDBCQUEyQixTQUFRLFVBQVU7SUFLekQsSUFBVyxVQUFVO1FBQ3BCLE9BQU8sSUFBSSxDQUFDLGNBQWMsQ0FBQyxVQUFVLENBQUM7SUFDdkMsQ0FBQztJQUVELElBQVcsZ0JBQWdCO1FBQzFCLE9BQU8sSUFBSSxDQUFDLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQztJQUM3QyxD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