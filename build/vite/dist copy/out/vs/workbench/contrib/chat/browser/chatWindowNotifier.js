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
import * as dom from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableResourceMap, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorunDelta, autorunIterableDelta } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IChatService } from '../common/chatService/chatService.js';
import { migrateLegacyTerminalToolSpecificData } from '../common/chat.js';
import { ChatConfiguration, ChatNotificationMode } from '../common/constants.js';
import { IChatWidgetService } from './chat.js';
/**
 * Observes all live chat models and triggers OS notifications when any model
 * transitions to needing input (confirmation/elicitation).
 */
let ChatWindowNotifier = class ChatWindowNotifier extends Disposable {
    static { this.ID = 'workbench.contrib.chatWindowNotifier'; }
    constructor(_chatService, _chatWidgetService, _hostService, _configurationService) {
        super();
        this._chatService = _chatService;
        this._chatWidgetService = _chatWidgetService;
        this._hostService = _hostService;
        this._configurationService = _configurationService;
        this._activeNotifications = this._register(new DisposableResourceMap());
        const modelTrackers = this._register(new DisposableResourceMap());
        this._register(autorunIterableDelta(reader => this._chatService.chatModels.read(reader), ({ addedValues, removedValues }) => {
            for (const model of addedValues) {
                modelTrackers.set(model.sessionResource, this._trackModel(model));
            }
            for (const model of removedValues) {
                modelTrackers.deleteAndDispose(model.sessionResource);
            }
        }));
    }
    _trackModel(model) {
        return autorunDelta(model.requestNeedsInput, ({ lastValue, newValue }) => {
            const currentNeedsInput = !!newValue;
            const previousNeedsInput = !!lastValue;
            // Only notify on transition from false -> true
            if (!previousNeedsInput && currentNeedsInput && newValue) {
                this._notifyIfNeeded(model.sessionResource, newValue);
            }
            else if (previousNeedsInput && !currentNeedsInput) {
                // Clear any active notification for this session when input is no longer needed
                this._clearNotification(model.sessionResource);
            }
        });
    }
    async _notifyIfNeeded(sessionResource, info) {
        // Check configuration
        const mode = this._configurationService.getValue(ChatConfiguration.NotifyWindowOnConfirmation);
        if (mode === ChatNotificationMode.Off) {
            return;
        }
        // Find the widget to determine the target window
        const widget = this._chatWidgetService.getWidgetBySessionResource(sessionResource);
        const targetWindow = widget ? dom.getWindow(widget.domNode) : mainWindow;
        const isFocused = targetWindow.document.hasFocus();
        if (mode !== ChatNotificationMode.Always && isFocused) {
            return;
        }
        // Clear any existing notification for this session
        this._clearNotification(sessionResource);
        // Focus window in notify mode (flash taskbar/dock) if not already focused
        if (!isFocused) {
            await this._hostService.focus(targetWindow, { mode: 1 /* FocusMode.Notify */ });
        }
        // Create OS notification
        const notificationTitle = info.title ? localize('chatTitle', "Session: {0}", info.title) : localize('chat.untitledChat', "Untitled Session");
        const cts = new CancellationTokenSource();
        this._activeNotifications.set(sessionResource, toDisposable(() => cts.dispose(true)));
        // Determine if the pending input is for a question carousel
        const isQuestionCarousel = this._isQuestionCarouselPending(sessionResource);
        try {
            const actionLabel = isQuestionCarousel
                ? localize('openChatAction', "Open Session")
                : localize('allowAction', "Allow");
            const result = await this._hostService.showToast({
                title: this._sanitizeOSToastText(notificationTitle),
                body: this._getNotificationBody(sessionResource, info, isQuestionCarousel),
                actions: [actionLabel],
            }, cts.token);
            if (result.actionIndex === 0 && !isQuestionCarousel && this._confirmAllow(sessionResource)) {
                return; // skip focusing/opening chat if we successfully confirmed the tool invocation from the toast action
            }
            if (result.clicked || typeof result.actionIndex === 'number') {
                await this._hostService.focus(targetWindow, { mode: 2 /* FocusMode.Force */ });
                const widget = await this._chatWidgetService.openSession(sessionResource);
                widget?.focusInput();
            }
        }
        finally {
            this._clearNotification(sessionResource);
        }
    }
    _confirmAllow(sessionResource) {
        const model = this._chatService.getSession(sessionResource);
        const lastResponse = model?.lastRequest?.response;
        if (!lastResponse) {
            return false;
        }
        for (const part of lastResponse.response.value) {
            const state = part.kind === 'toolInvocation' ? part.state.get() : undefined;
            if (state?.type === 1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */ || state?.type === 3 /* IChatToolInvocation.StateKind.WaitingForPostApproval */) {
                state.confirm({ type: 4 /* ToolConfirmKind.UserAction */ });
                return true;
            }
        }
        return false;
    }
    _getNotificationBody(sessionResource, info, isQuestionCarousel) {
        if (isQuestionCarousel) {
            return localize('questionCarouselDetail', "Questions need your input.");
        }
        const terminalCommand = this._getPendingTerminalCommand(sessionResource);
        if (terminalCommand) {
            return this._sanitizeOSToastText(terminalCommand);
        }
        if (info.detail) {
            return this._sanitizeOSToastText(info.detail);
        }
        return localize('notificationDetail', "Approval needed to continue.");
    }
    _getPendingTerminalCommand(sessionResource) {
        const model = this._chatService.getSession(sessionResource);
        const lastResponse = model?.lastRequest?.response;
        if (!lastResponse?.response?.value) {
            return undefined;
        }
        for (const part of lastResponse.response.value) {
            if (part.kind === 'toolInvocation' && part.toolSpecificData?.kind === 'terminal') {
                const terminalData = migrateLegacyTerminalToolSpecificData(part.toolSpecificData);
                return terminalData.commandLine.forDisplay ?? terminalData.commandLine.userEdited ?? terminalData.commandLine.toolEdited ?? terminalData.commandLine.original;
            }
        }
        return undefined;
    }
    _isQuestionCarouselPending(sessionResource) {
        const model = this._chatService.getSession(sessionResource);
        const lastResponse = model?.lastRequest?.response;
        if (!lastResponse) {
            return false;
        }
        return lastResponse.response.value.some(part => part.kind === 'questionCarousel' && !part.isUsed);
    }
    _sanitizeOSToastText(text) {
        return text.replace(/`/g, '\''); // convert backticks to single quotes
    }
    _clearNotification(sessionResource) {
        this._activeNotifications.deleteAndDispose(sessionResource);
    }
};
ChatWindowNotifier = __decorate([
    __param(0, IChatService),
    __param(1, IChatWidgetService),
    __param(2, IHostService),
    __param(3, IConfigurationService)
], ChatWindowNotifier);
export { ChatWindowNotifier };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFdpbmRvd05vdGlmaWVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXRXaW5kb3dOb3RpZmllci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNsRixPQUFPLEVBQUUsVUFBVSxFQUFFLHFCQUFxQixFQUFFLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxZQUFZLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUUzRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFHbkcsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRXRFLE9BQU8sRUFBRSxZQUFZLEVBQXdDLE1BQU0sc0NBQXNDLENBQUM7QUFDMUcsT0FBTyxFQUFFLHFDQUFxQyxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDMUUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLG9CQUFvQixFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDakYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sV0FBVyxDQUFDO0FBRS9DOzs7R0FHRztBQUNJLElBQU0sa0JBQWtCLEdBQXhCLE1BQU0sa0JBQW1CLFNBQVEsVUFBVTthQUVqQyxPQUFFLEdBQUcsc0NBQXNDLEFBQXpDLENBQTBDO0lBSTVELFlBQ2UsWUFBMkMsRUFDckMsa0JB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