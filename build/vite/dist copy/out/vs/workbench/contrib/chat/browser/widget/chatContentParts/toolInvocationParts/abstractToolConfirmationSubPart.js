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
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../../nls.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../../platform/keybinding/common/keybinding.js';
import { ChatContextKeys } from '../../../../common/actions/chatContextKeys.js';
import { IChatToolInvocation } from '../../../../common/chatService/chatService.js';
import { ILanguageModelToolsService } from '../../../../common/tools/languageModelToolsService.js';
import { IChatWidgetService } from '../../../chat.js';
import { ChatCustomConfirmationWidget } from '../chatConfirmationWidget.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';
/**
 * Base class for a tool confirmation.
 *
 * note that implementors MUST call render() after they construct.
 */
let AbstractToolConfirmationSubPart = class AbstractToolConfirmationSubPart extends BaseChatToolInvocationSubPart {
    constructor(toolInvocation, context, instantiationService, keybindingService, contextKeyService, chatWidgetService, languageModelToolsService) {
        super(toolInvocation);
        this.toolInvocation = toolInvocation;
        this.context = context;
        this.instantiationService = instantiationService;
        this.keybindingService = keybindingService;
        this.contextKeyService = contextKeyService;
        this.chatWidgetService = chatWidgetService;
        this.languageModelToolsService = languageModelToolsService;
        if (toolInvocation.kind !== 'toolInvocation') {
            throw new Error('Confirmation only works with live tool invocations');
        }
    }
    render(config) {
        const { keybindingService, languageModelToolsService, toolInvocation } = this;
        const state = toolInvocation.state.get();
        const customButtons = state.type === 1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */
            ? state.confirmationMessages?.customButtons
            : undefined;
        let buttons;
        if (customButtons && customButtons.length > 0) {
            buttons = customButtons.map((label, index) => ({
                label,
                data: () => {
                    this.confirmWith(toolInvocation, { type: 4 /* ToolConfirmKind.UserAction */, selectedButton: label });
                },
                isSecondary: index > 0,
            }));
        }
        else {
            const allowTooltip = keybindingService.appendKeybinding(config.allowLabel, config.allowActionId);
            const skipTooltip = keybindingService.appendKeybinding(config.skipLabel, config.skipActionId);
            const additionalActions = this.additionalPrimaryActions();
            // find session scoped action
            const sessionAction = this.useAllowOnceAsPrimary() ? undefined : additionalActions.find((action) => 'scope' in action && action.scope === 'session');
            // regular allow action
            const allowAction = {
                label: config.allowLabel,
                tooltip: allowTooltip,
                data: () => { this.confirmWith(toolInvocation, { type: 4 /* ToolConfirmKind.UserAction */ }); },
            };
            const primaryAction = sessionAction ?? allowAction;
            // rebuild additional list with allow action
            const moreActions = sessionAction
                ? [allowAction, ...additionalActions.filter(a => a !== sessionAction)]
                : additionalActions;
            buttons = [
                {
                    label: primaryAction.label,
                    tooltip: primaryAction.tooltip,
                    data: primaryAction.data,
                    moreActions: moreActions.length > 0 ? moreActions : undefined,
                },
                {
                    label: localize('skip', "Skip"),
                    tooltip: skipTooltip,
                    data: () => {
                        this.confirmWith(toolInvocation, { type: 5 /* ToolConfirmKind.Skipped */ });
                    },
                    isSecondary: true,
                }
            ];
        }
        const contentElement = this.createContentElement();
        const tool = languageModelToolsService.getTool(toolInvocation.toolId);
        const confirmWidget = this._register(this.instantiationService.createInstance((ChatCustomConfirmationWidget), this.context, {
            title: this.getTitle(),
            icon: tool?.icon && 'id' in tool.icon ? tool.icon : Codicon.tools,
            subtitle: config.subtitle,
            buttons,
            message: contentElement,
            toolbarData: {
                arg: toolInvocation,
                partType: config.partType,
                partSource: toolInvocation.source.type
            }
        }));
        const hasToolConfirmation = ChatContextKeys.Editing.hasToolConfirmation.bindTo(this.contextKeyService);
        hasToolConfirmation.set(true);
        this._register(confirmWidget.onDidClick(button => {
            button.data();
            this.chatWidgetService.getWidgetBySessionResource(this.context.element.sessionResource)?.focusInput();
        }));
        this._register(toDisposable(() => hasToolConfirmation.reset()));
        this.domNode = confirmWidget.domNode;
    }
    confirmWith(toolInvocation, reason) {
        IChatToolInvocation.confirmWith(toolInvocation, reason);
    }
    additionalPrimaryActions() {
        return [];
    }
    /**
     * When true, "Allow Once" stays the primary button even when a
     * session-scoped action is available. Subclasses override this
     * to keep the simple allow-once default (e.g. when combination
     * approval options are present).
     */
    useAllowOnceAsPrimary() {
        return false;
    }
};
AbstractToolConfirmationSubPart = __decorate([
    __param(2, IInstantiationService),
    __param(3, IKeybindingService),
    __param(4, IContextKeyService),
    __param(5, IChatWidgetService),
    __param(6, ILanguageModelToolsService)
], AbstractToolConfirmationSubPart);
export { AbstractToolConfirmationSubPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWJzdHJhY3RUb29sQ29uZmlybWF0aW9uU3ViUGFydC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy90b29sSW52b2NhdGlvblBhcnRzL2Fic3RyYWN0VG9vbENvbmZpcm1hdGlvblN1YlBhcnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUM3RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDdkQsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDbkcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFDNUcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDbkcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ2hGLE9BQU8sRUFBbUIsbUJBQW1CLEVBQW1CLE1BQU0sK0NBQStDLENBQUM7QUFDdEgsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDbkcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFDdEQsT0FBTyxFQUFFLDRCQUE0QixFQUEyQixNQUFNLDhCQUE4QixDQUFDO0FBRXJHLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBaUIvRTs7OztHQUlHO0FBQ0ksSUFBZSwrQkFBK0IsR0FBOUMsTUFBZSwrQkFBZ0MsU0FBUSw2QkFBNkI7SUFHMUYsWUFDNkIsY0FBbUMs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