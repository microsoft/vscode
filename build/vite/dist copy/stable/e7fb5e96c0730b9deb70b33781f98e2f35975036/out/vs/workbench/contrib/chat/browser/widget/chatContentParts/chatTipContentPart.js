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
import './media/chatTipContent.css';
import * as dom from '../../../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../../../base/browser/mouseEvent.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { onUnexpectedError } from '../../../../../../base/common/errors.js';
import { Disposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../../../nls.js';
import { getFlatContextMenuActions } from '../../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuWorkbenchToolBar } from '../../../../../../platform/actions/browser/toolbar.js';
import { Action2, IMenuService, MenuId, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { openLinkFromMarkdown } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { CHAT_SETUP_ACTION_ID } from '../../actions/chatActions.js';
import { IChatTipService } from '../../chatTipService.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
const $ = dom.$;
let ChatTipContentPart = class ChatTipContentPart extends Disposable {
    constructor(tip, _renderer, _chatTipService, _contextMenuService, _menuService, _contextKeyService, _instantiationService, _openerService, _commandService, _chatEntitlementService) {
        super();
        this._renderer = _renderer;
        this._chatTipService = _chatTipService;
        this._contextMenuService = _contextMenuService;
        this._menuService = _menuService;
        this._contextKeyService = _contextKeyService;
        this._instantiationService = _instantiationService;
        this._openerService = _openerService;
        this._commandService = _commandService;
        this._chatEntitlementService = _chatEntitlementService;
        this._onDidHide = this._register(new Emitter());
        this.onDidHide = this._onDidHide.event;
        this._renderedContent = this._register(new MutableDisposable());
        this._toolbar = this._register(new MutableDisposable());
        this.domNode = $('.chat-tip-widget');
        this.domNode.tabIndex = 0;
        this.domNode.setAttribute('role', 'region');
        this.domNode.setAttribute('aria-roledescription', localize('chatTipRoleDescription', "tip"));
        this._inChatTipContextKey = ChatContextKeys.inChatTip.bindTo(this._contextKeyService);
        this._multipleChatTipsContextKey = ChatContextKeys.multipleChatTips.bindTo(this._contextKeyService);
        const focusTracker = this._register(dom.trackFocus(this.domNode));
        this._register(focusTracker.onDidFocus(() => this._inChatTipContextKey.set(true)));
        this._register(focusTracker.onDidBlur(() => this._inChatTipContextKey.set(false)));
        this._register({
            dispose: () => {
                this._inChatTipContextKey.reset();
                this._multipleChatTipsContextKey.reset();
            }
        });
        this._renderTip(tip);
        this._register(this._chatTipService.onDidDismissTip(() => {
            this._onDidHide.fire();
        }));
        this._register(this._chatTipService.onDidNavigateTip(tip => {
            this._renderTip(tip);
            dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(this.domNode), () => this.focus());
        }));
        this._register(this._chatTipService.onDidHideTip(() => {
            this._onDidHide.fire();
        }));
        this._register(this._chatTipService.onDidDisableTips(() => {
            this._onDidHide.fire();
        }));
        this._register(dom.addDisposableListener(this.domNode, dom.EventType.CONTEXT_MENU, (e) => {
            dom.EventHelper.stop(e, true);
            const event = new StandardMouseEvent(dom.getWindow(this.domNode), e);
            this._contextMenuService.showContextMenu({
                getAnchor: () => event,
                getActions: () => {
                    const menu = this._menuService.getMenuActions(MenuId.ChatTipContext, this._contextKeyService);
                    return getFlatContextMenuActions(menu);
                },
            });
        }));
    }
    hasFocus() {
        return dom.isAncestorOfActiveElement(this.domNode);
    }
    focus() {
        this.domNode.focus();
    }
    _renderTip(tip) {
        dom.clearNode(this.domNode);
        this._toolbar.clear();
        this._multipleChatTipsContextKey.set(this._chatTipService.hasMultipleTips());
        const markdownContent = this._renderer.render(tip.content, {
            actionHandler: (link, md) => { this._handleTipAction(link, md).catch(onUnexpectedError); }
        });
        this._renderedContent.value = markdownContent;
        this.domNode.appendChild(markdownContent.element);
        // Toolbar with previous, next, and dismiss actions via MenuWorkbenchToolBar
        const toolbarContainer = $('.chat-tip-toolbar');
        this._toolbar.value = this._instantiationService.createInstance(MenuWorkbenchToolBar, toolbarContainer, MenuId.ChatTipToolbar, {
            menuOptions: {
                shouldForwardArgs: true,
            },
        });
        this.domNode.appendChild(toolbarContainer);
        const textContent = markdownContent.element.textContent ?? localize('chatTip', "Chat tip");
        const hasLink = /\[.*?\]\(.*?\)/.test(tip.content.value);
        const ariaLabel = hasLink
            ? localize('chatTipWithAction', "{0} Tab to reach the action.", textContent)
            : textContent;
        this.domNode.setAttribute('aria-label', ariaLabel);
    }
    async _handleTipAction(link, mdStr) {
        if (link.startsWith('command:') && this._shouldTriggerSetup()) {
            const setupSucceeded = await this._commandService.executeCommand(CHAT_SETUP_ACTION_ID);
            if (!setupSucceeded) {
                return;
            }
        }
        await openLinkFromMarkdown(this._openerService, link, mdStr.isTrusted);
    }
    _shouldTriggerSetup() {
        const sentiment = this._chatEntitlementService.sentiment;
        if (!sentiment?.completed) {
            return true;
        }
        return this._chatEntitlementService.entitlement === ChatEntitlement.Unknown;
    }
};
ChatTipContentPart = __decorate([
    __param(2, IChatTipService),
    __param(3, IContextMenuService),
    __param(4, IMenuService),
    __param(5, IContextKeyService),
    __param(6, IInstantiationService),
    __param(7, IOpenerService),
    __param(8, ICommandService),
    __param(9, IChatEntitlementService)
], ChatTipContentPart);
export { ChatTipContentPart };
//#region Tip toolbar actions
registerAction2(class PreviousTipAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.chat.previousTip',
            title: localize2('chatTip.previous', "Previous tip"),
            icon: Codicon.chevronLeft,
            precondition: ChatContextKeys.multipleChatTips,
            f1: false,
            menu: [{
                    id: MenuId.ChatTipToolbar,
                    group: 'navigation',
                    order: 1,
                }]
        });
    }
    async run(accessor) {
        const chatTipService = accessor.get(IChatTipService);
        chatTipService.navigateToPreviousTip();
    }
});
registerAction2(class NextTipAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.chat.nextTip',
            title: localize2('chatTip.next', "Next tip"),
            icon: Codicon.chevronRight,
            precondition: ChatContextKeys.multipleChatTips,
            f1: false,
            menu: [{
                    id: MenuId.ChatTipToolbar,
                    group: 'navigation',
                    order: 2,
                }]
        });
    }
    async run(accessor) {
        const chatTipService = accessor.get(IChatTipService);
        chatTipService.navigateToNextTip();
    }
});
registerAction2(class DismissTipToolbarAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.chat.dismissTipToolbar',
            title: localize2('chatTip.dismissButton', "Dismiss tip"),
            icon: Codicon.check,
            f1: false,
            menu: [{
                    id: MenuId.ChatTipToolbar,
                    group: 'navigation',
                    order: 3,
                }]
        });
    }
    async run(accessor) {
        accessor.get(IChatTipService).dismissTipForSession();
    }
});
//#endregion
//#region Tip context menu actions
registerAction2(class DismissTipAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.chat.dismissTip',
            title: localize2('chatTip.dismiss', "Dismiss this tip"),
            f1: false,
            menu: [{
                    id: MenuId.ChatTipContext,
                    group: 'chatTip',
                    order: 1,
                }]
        });
    }
    async run(accessor) {
        accessor.get(IChatTipService).dismissTipForSession();
    }
});
registerAction2(class DisableTipsAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.chat.disableTips',
            title: localize2('chatTip.disableTips', "Disable tips"),
            icon: Codicon.bellSlash,
            f1: false,
            menu: [{
                    id: MenuId.ChatTipContext,
                    group: 'chatTip',
                    order: 2,
                }, {
                    id: MenuId.ChatTipToolbar,
                    group: 'navigation',
                    order: 5,
                }]
        });
    }
    async run(accessor) {
        const chatTipService = accessor.get(IChatTipService);
        const commandService = accessor.get(ICommandService);
        await chatTipService.disableTips();
        await commandService.executeCommand('workbench.action.openSettings', 'chat.tips.enabled');
    }
});
registerAction2(class ResetDismissedTipsAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.chat.resetDismissedTips',
            title: localize2('chatTip.resetDismissedTips', "Reset Dismissed Tips"),
            f1: true,
            precondition: ChatContextKeys.enabled,
        });
    }
    async run(accessor) {
        accessor.get(IChatTipService).clearDismissedTips();
    }
});
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFRpcENvbnRlbnRQYXJ0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRUaXBDb250ZW50UGFydC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLDRCQUE0QixDQUFDO0FBQ3BDLE9BQU8sS0FBSyxHQUFHLE1BQU0sdUNBQXVDLENBQUM7QUFDN0QsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDbEYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsVUFBVSxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFFM0YsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUMvRCxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSx1RUFBdUUsQ0FBQztBQUNsSCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUM3RixPQUFPLEVBQUUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDdEgsT0FBTyxFQUFlLGtCQUFrQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDN0csT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDcEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxxQkFB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