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
import * as DOM from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { isUUID } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IChatDebugService } from '../../common/chatDebugService.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { AGENT_DEBUG_LOG_ENABLED_SETTING } from '../../common/promptSyntax/promptTypes.js';
import { getChatSessionType, isUntitledChatSession, LocalChatSessionUri } from '../../common/model/chatUri.js';
import { IChatWidgetService } from '../chat.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
const $ = DOM.$;
let ChatDebugHomeView = class ChatDebugHomeView extends Disposable {
    constructor(parent, chatService, chatDebugService, chatWidgetService, configurationService, preferencesService) {
        super();
        this.chatService = chatService;
        this.chatDebugService = chatDebugService;
        this.chatWidgetService = chatWidgetService;
        this.configurationService = configurationService;
        this.preferencesService = preferencesService;
        this._onNavigateToSession = this._register(new Emitter());
        this.onNavigateToSession = this._onNavigateToSession.event;
        this.renderDisposables = this._register(new DisposableStore());
        this.container = DOM.append(parent, $('.chat-debug-home'));
        this.scrollContent = DOM.append(this.container, $('div.chat-debug-home-content'));
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(AGENT_DEBUG_LOG_ENABLED_SETTING)) {
                this.render();
            }
        }));
    }
    show() {
        this.container.style.display = '';
        this.render();
    }
    hide() {
        this.container.style.display = 'none';
    }
    render() {
        DOM.clearNode(this.scrollContent);
        this.renderDisposables.clear();
        DOM.append(this.scrollContent, $('h2.chat-debug-home-title', undefined, localize('chatDebug.title', "Agent Debug Logs")));
        const isEnabled = this.configurationService.getValue(AGENT_DEBUG_LOG_ENABLED_SETTING);
        if (!isEnabled) {
            DOM.append(this.scrollContent, $('p.chat-debug-home-subtitle', undefined, localize('chatDebug.disabled', "Enable to view debug logs and investigate chat issues with /troubleshoot.")));
            const enableButton = this.renderDisposables.add(new Button(this.scrollContent, { ...defaultButtonStyles, secondary: true }));
            enableButton.element.style.width = 'auto';
            enableButton.label = localize('chatDebug.openSetting', "Enable in Settings");
            this.renderDisposables.add(enableButton.onDidClick(() => {
                this.preferencesService.openSettings({ jsonEditor: false, query: AGENT_DEBUG_LOG_ENABLED_SETTING });
            }));
            return;
        }
        // Determine the active session resource
        const activeWidget = this.chatWidgetService.lastFocusedWidget;
        const activeSessionResource = activeWidget?.viewModel?.sessionResource;
        // List sessions that have debug event data.
        // Use the debug service as the source of truth — it includes sessions
        // whose chat models may have been archived (e.g. when a new chat was started).
        const cliSessionTypes = new Set(['copilotcli', 'claude-code']);
        const sessionResources = [...this.chatDebugService.getSessionResources()].reverse()
            // Hide untitled bootstrap sessions for CLI session types (e.g. copilotcli, claude-code).
            // These are transient sessions created during async session setup that only contain
            // a single "Load Hooks" event and would confuse users.
            .filter(r => !cliSessionTypes.has(getChatSessionType(r)) || !isUntitledChatSession(r));
        // Sort: active session first
        if (activeSessionResource) {
            const activeIndex = sessionResources.findIndex(r => r.toString() === activeSessionResource.toString());
            if (activeIndex > 0) {
                sessionResources.splice(activeIndex, 1);
                sessionResources.unshift(activeSessionResource);
            }
        }
        DOM.append(this.scrollContent, $('p.chat-debug-home-subtitle', undefined, sessionResources.length > 0
            ? localize('chatDebug.homeSubtitle', "Select a chat session to debug")
            : localize('chatDebug.noSessions', "Send a chat message to get started")));
        if (sessionResources.length > 0) {
            const sessionList = DOM.append(this.scrollContent, $('.chat-debug-home-session-list'));
            sessionList.setAttribute('role', 'list');
            sessionList.setAttribute('aria-label', localize('chatDebug.sessionList', "Chat sessions"));
            const items = [];
            for (const sessionResource of sessionResources) {
                const rawTitle = this.chatService.getSessionTitle(sessionResource);
                const importedTitle = this.chatDebugService.getImportedSessionTitle(sessionResource);
                let sessionTitle;
                if (rawTitle && !isUUID(rawTitle)) {
                    sessionTitle = rawTitle;
                }
                else if (LocalChatSessionUri.isLocalSession(sessionResource)) {
                    sessionTitle = localize('chatDebug.newSession', "New Chat");
                }
                else if (importedTitle) {
                    sessionTitle = localize('chatDebug.importedSession', "Imported: {0}", importedTitle);
                }
                else if (getChatSessionType(sessionResource) === 'copilotcli') {
                    const pathId = sessionResource.path.replace(/^\//, '').split('-')[0];
                    const shortId = pathId || sessionResource.authority || sessionResource.toString();
                    sessionTitle = localize('chatDebug.copilotCliSessionWithId', "Copilot CLI: {0}", shortId);
                }
                else if (getChatSessionType(sessionResource) === 'claude-code') {
                    const pathId = sessionResource.path.replace(/^\//, '').split('-')[0];
                    const shortId = pathId || sessionResource.authority || sessionResource.toString();
                    sessionTitle = localize('chatDebug.claudeCodeSessionWithId', "Claude Code: {0}", shortId);
                }
                else {
                    sessionTitle = localize('chatDebug.newSession', "New Chat");
                }
                const isActive = activeSessionResource !== undefined && sessionResource.toString() === activeSessionResource.toString();
                const item = DOM.append(sessionList, $('button.chat-debug-home-session-item'));
                item.setAttribute('role', 'listitem');
                if (isActive) {
                    item.classList.add('chat-debug-home-session-item-active');
                    item.setAttribute('aria-current', 'true');
                }
                DOM.append(item, $(`span${ThemeIcon.asCSSSelector(Codicon.comment)}`));
                const titleSpan = DOM.append(item, $('span.chat-debug-home-session-item-title'));
                titleSpan.textContent = sessionTitle;
                const ariaLabel = isActive
                    ? localize('chatDebug.sessionItemActive', "{0} (active)", sessionTitle)
                    : sessionTitle;
                item.setAttribute('aria-label', ariaLabel);
                if (isActive) {
                    DOM.append(item, $('span.chat-debug-home-session-badge', undefined, localize('chatDebug.active', "Active")));
                }
                this.renderDisposables.add(DOM.addDisposableListener(item, DOM.EventType.CLICK, () => {
                    this._onNavigateToSession.fire(sessionResource);
                }));
                items.push(item);
            }
            // Arrow key navigation between session items
            this.renderDisposables.add(DOM.addDisposableListener(sessionList, DOM.EventType.KEY_DOWN, (e) => {
                if (items.length === 0) {
                    return;
                }
                const focused = DOM.getActiveElement();
                const idx = items.indexOf(focused);
                if (idx === -1) {
                    return;
                }
                let nextIdx;
                switch (e.key) {
                    case 'ArrowDown':
                        nextIdx = idx + 1 < items.length ? idx + 1 : idx;
                        break;
                    case 'ArrowUp':
                        nextIdx = idx - 1 >= 0 ? idx - 1 : idx;
                        break;
                    case 'Home':
                        nextIdx = 0;
                        break;
                    case 'End':
                        nextIdx = items.length - 1;
                        break;
                }
                if (nextIdx !== undefined) {
                    e.preventDefault();
                    items[nextIdx].focus();
                }
            }));
        }
    }
};
ChatDebugHomeView = __decorate([
    __param(1, IChatService),
    __param(2, IChatDebugService),
    __param(3, IChatWidgetService),
    __param(4, IConfigurationService),
    __param(5, IPreferencesService)
], ChatDebugHomeView);
export { ChatDebugHomeView };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdERlYnVnSG9tZVZpZXcuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdERlYnVnL2NoYXREZWJ1Z0hvbWVWaWV3LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0NBQW9DLENBQUM7QUFDMUQsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN0RixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFcEUsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUM3RixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDdkUsT0FBTyxFQUFFLCtCQUErQixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDM0YsT0FBTyxFQUFFLGtCQUFrQixFQUFFLHFCQUFxQixFQUFFLG1CQUFtQixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDL0csT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sWUFB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