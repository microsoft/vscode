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
import './media/sessionCompositeBar.css';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { Emitter } from '../../../base/common/event.js';
import { $, addDisposableListener, EventType, getWindow, reset } from '../../../base/browser/dom.js';
import { autorun } from '../../../base/common/observable.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { PANEL_ACTIVE_TITLE_BORDER, PANEL_ACTIVE_TITLE_FOREGROUND, PANEL_INACTIVE_TITLE_FOREGROUND, SIDE_BAR_BACKGROUND } from '../../../workbench/common/theme.js';
import { Action } from '../../../base/common/actions.js';
import { IContextMenuService } from '../../../platform/contextview/browser/contextView.js';
import { StandardMouseEvent } from '../../../base/browser/mouseEvent.js';
import { localize } from '../../../nls.js';
import { IQuickInputService } from '../../../platform/quickinput/common/quickInput.js';
// TODO: we should move the sessions management service to a more core location so that we don't have to depend on the entire sessions contrib in this common/browser component
// eslint-disable-next-line local/code-import-patterns
import { ISessionsManagementService } from '../../contrib/sessions/browser/sessionsManagementService.js';
/**
 * A composite bar that displays chats within the active agent session as tabs.
 * Selecting a tab loads that chat in the chat view pane instead of switching view containers.
 *
 * The bar auto-hides when there is only one chat in the active session and shows when there are multiple.
 */
let SessionCompositeBar = class SessionCompositeBar extends Disposable {
    get element() {
        return this._container;
    }
    get visible() {
        return this._visible;
    }
    constructor(_themeService, _sessionsManagementService, _contextMenuService, _quickInputService) {
        super();
        this._themeService = _themeService;
        this._sessionsManagementService = _sessionsManagementService;
        this._contextMenuService = _contextMenuService;
        this._quickInputService = _quickInputService;
        this._tabs = [];
        this._tabDisposables = this._register(new DisposableStore());
        this._onDidChangeVisibility = this._register(new Emitter());
        this.onDidChangeVisibility = this._onDidChangeVisibility.event;
        this._visible = false;
        this._container = $('.session-composite-bar');
        this._tabsContainer = $('.session-composite-bar-tabs');
        this._container.appendChild(this._tabsContainer);
        // Track active session changes
        this._register(autorun(reader => {
            const activeSession = this._sessionsManagementService.activeSession.read(reader);
            if (!activeSession) {
                this._rebuildTabs([], '', undefined);
                return;
            }
            const chats = activeSession.chats.read(reader);
            const activeChatUri = activeSession.activeChat.read(reader)?.resource.toString() ?? '';
            const mainChatUri = activeSession.mainChat.resource.toString();
            this._rebuildTabs(chats, activeChatUri, mainChatUri);
        }));
        this._updateStyles();
        this._register(this._themeService.onDidColorThemeChange(() => this._updateStyles()));
    }
    _rebuildTabs(chats, activeChatId, mainChatId) {
        this._tabDisposables.clear();
        this._tabs.length = 0;
        reset(this._tabsContainer);
        for (const chat of chats) {
            this._createTab(chat, chat.resource.toString() === mainChatId);
        }
        this._updateActiveTab(activeChatId);
        this._updateVisibility();
    }
    _createTab(chat, isMainChat) {
        const tab = $('.session-composite-bar-tab');
        tab.tabIndex = 0;
        tab.setAttribute('role', 'tab');
        const labelEl = $('.session-composite-bar-tab-label');
        this._tabDisposables.add(autorun(reader => {
            const title = chat.title.read(reader);
            labelEl.textContent = title;
        }));
        tab.appendChild(labelEl);
        const indicator = $('.session-composite-bar-tab-indicator');
        tab.appendChild(indicator);
        this._tabsContainer.appendChild(tab);
        this._tabDisposables.add(addDisposableListener(tab, EventType.CLICK, () => {
            this._onTabClicked(chat);
        }));
        this._tabDisposables.add(addDisposableListener(tab, EventType.KEY_DOWN, (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this._onTabClicked(chat);
            }
        }));
        const renameAction = this._tabDisposables.add(new Action('sessionCompositeBar.renameChat', localize('renameChat', "Rename"), undefined, true, async () => {
            const newTitle = await this._quickInputService.input({
                value: chat.title.get(),
                prompt: localize('renameChat.prompt', "Rename Chat"),
            });
            if (newTitle) {
                const session = this._sessionsManagementService.activeSession.get();
                if (session) {
                    await this._sessionsManagementService.renameChat(session, chat.resource, newTitle);
                }
            }
        }));
        const deleteAction = this._tabDisposables.add(new Action('sessionCompositeBar.deleteChat', localize('deleteChat', "Delete"), undefined, !isMainChat, async () => {
            const session = this._sessionsManagementService.activeSession.get();
            if (session) {
                await this._sessionsManagementService.deleteChat(session, chat.resource);
            }
        }));
        this._tabDisposables.add(addDisposableListener(tab, EventType.CONTEXT_MENU, (e) => {
            e.preventDefault();
            e.stopPropagation();
            const event = new StandardMouseEvent(getWindow(tab), e);
            this._contextMenuService.showContextMenu({
                getAnchor: () => event,
                getActions: () => [
                    renameAction,
                    deleteAction,
                ]
            });
        }));
        this._tabs.push({ chat: chat, element: tab });
    }
    _onTabClicked(chat) {
        const session = this._sessionsManagementService.activeSession.get();
        if (session) {
            this._sessionsManagementService.openChat(session, chat.resource);
        }
    }
    _updateActiveTab(activeChatId) {
        for (const tab of this._tabs) {
            const isActive = tab.chat.resource.toString() === activeChatId;
            tab.element.classList.toggle('active', isActive);
            tab.element.setAttribute('aria-selected', String(isActive));
        }
    }
    _updateVisibility() {
        // Show when there are multiple sessions, hide when there is only one (or none)
        const wasVisible = this._visible;
        this._visible = this._tabs.length > 1;
        this._container.style.display = this._visible ? '' : 'none';
        if (wasVisible !== this._visible) {
            this._onDidChangeVisibility.fire(this._visible);
        }
    }
    _updateStyles() {
        const theme = this._themeService.getColorTheme();
        const bg = theme.getColor(SIDE_BAR_BACKGROUND);
        const activeFg = theme.getColor(PANEL_ACTIVE_TITLE_FOREGROUND);
        const inactiveFg = theme.getColor(PANEL_INACTIVE_TITLE_FOREGROUND);
        const activeBorder = theme.getColor(PANEL_ACTIVE_TITLE_BORDER);
        this._container.style.setProperty('--session-bar-background', bg?.toString() ?? '');
        this._container.style.setProperty('--session-tab-active-foreground', activeFg?.toString() ?? '');
        this._container.style.setProperty('--session-tab-inactive-foreground', inactiveFg?.toString() ?? '');
        this._container.style.setProperty('--session-tab-active-border', activeBorder?.toString() ?? '');
    }
};
SessionCompositeBar = __decorate([
    __param(0, IThemeService),
    __param(1, ISessionsManagementService),
    __param(2, IContextMenuService),
    __param(3, IQuickInputService)
], SessionCompositeBar);
export { SessionCompositeBar };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbkNvbXBvc2l0ZUJhci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2Jyb3dzZXIvcGFydHMvc2Vzc2lvbkNvbXBvc2l0ZUJhci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLGlDQUFpQyxDQUFDO0FBQ3pDLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDaEYsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxDQUFDLEVBQUUscUJBQXFCLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNyRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0QsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSw2QkFBNkIsRUFBRSwrQkFBK0IsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3BLLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUN6RCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMzRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDM0MsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDdkYsK0tBQStLO0FBQy9LLHNEQUFzRDtBQUN0RCxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQVN6Rzs7Ozs7R0FLRztBQUNJLElBQU0sbUJB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