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
import * as dom from '../../../../../base/browser/dom.js';
import { renderAsPlaintext } from '../../../../../base/browser/markdownRenderer.js';
import { alert, status } from '../../../../../base/browser/ui/aria/aria.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableMap, DisposableSet, toDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { AccessibilityProgressSignalScheduler } from '../../../../../platform/accessibilitySignal/browser/progressAccessibilitySignalScheduler.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { ChatConfiguration, ChatNotificationMode } from '../../common/constants.js';
import { IChatWidgetService } from '../chat.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
const CHAT_RESPONSE_PENDING_ALLOWANCE_MS = 4000;
let ChatAccessibilityService = class ChatAccessibilityService extends Disposable {
    constructor(_accessibilitySignalService, _instantiationService, _configurationService, _hostService, _widgetService, _chatService) {
        super();
        this._accessibilitySignalService = _accessibilitySignalService;
        this._instantiationService = _instantiationService;
        this._configurationService = _configurationService;
        this._hostService = _hostService;
        this._widgetService = _widgetService;
        this._chatService = _chatService;
        this._pendingSignalMap = this._register(new DisposableMap());
        this.toasts = this._register(new DisposableSet());
        this._register(this._widgetService.onDidBackgroundSession(e => {
            const session = this._chatService.getSession(e);
            if (!session) {
                return;
            }
            const requestInProgress = session.requestInProgress.get();
            if (!requestInProgress) {
                return;
            }
            this.disposeRequest(e);
        }));
    }
    acceptRequest(uri, skipRequestSignal) {
        if (!skipRequestSignal) {
            this._accessibilitySignalService.playSignal(AccessibilitySignal.chatRequestSent, { allowManyInParallel: true });
        }
        this._pendingSignalMap.set(uri, this._instantiationService.createInstance(AccessibilityProgressSignalScheduler, CHAT_RESPONSE_PENDING_ALLOWANCE_MS, undefined));
    }
    disposeRequest(requestId) {
        this._pendingSignalMap.deleteAndDispose(requestId);
    }
    acceptResponse(widget, container, response, requestId, isVoiceInput) {
        this._pendingSignalMap.deleteAndDispose(requestId);
        const isPanelChat = typeof response !== 'string';
        const responseContent = typeof response === 'string' ? response : response?.response.toString();
        this._accessibilitySignalService.playSignal(AccessibilitySignal.chatResponseReceived, { allowManyInParallel: true });
        if (!response || !responseContent) {
            return;
        }
        const plainTextResponse = renderAsPlaintext(new MarkdownString(responseContent));
        const errorDetails = isPanelChat && response.errorDetails ? ` ${response.errorDetails.message}` : '';
        this._showOSNotification(widget, container, plainTextResponse + errorDetails);
        if (!isVoiceInput || this._configurationService.getValue("accessibility.voice.autoSynthesize" /* AccessibilityVoiceSettingId.AutoSynthesize */) !== 'on') {
            status(plainTextResponse + errorDetails);
        }
    }
    acceptElicitation(elicitation) {
        if (elicitation.state.get() !== "pending" /* ElicitationState.Pending */) {
            return;
        }
        const title = typeof elicitation.title === 'string' ? elicitation.title : elicitation.title.value;
        const message = typeof elicitation.message === 'string' ? elicitation.message : elicitation.message.value;
        alert(title + ' ' + message);
        this._accessibilitySignalService.playSignal(AccessibilitySignal.chatUserActionRequired, { allowManyInParallel: true });
    }
    async _showOSNotification(widget, container, responseContent) {
        const mode = this._configurationService.getValue(ChatConfiguration.NotifyWindowOnResponseReceived);
        if (mode === ChatNotificationMode.Off) {
            return;
        }
        const targetWindow = dom.getWindow(container);
        if (!targetWindow) {
            return;
        }
        const isFocused = targetWindow.document.hasFocus();
        if (mode !== ChatNotificationMode.Always && isFocused) {
            return;
        }
        // Don't show notification if there's no meaningful content
        if (!responseContent || !responseContent.trim()) {
            return;
        }
        // Focus window in notify mode (flash taskbar/dock) if not already focused
        if (!isFocused) {
            await this._hostService.focus(targetWindow, { mode: 1 /* FocusMode.Notify */ });
        }
        // Dispose any previous unhandled notifications to avoid replacement/coalescing.
        this.toasts.clearAndDisposeAll();
        const title = widget?.viewModel?.model.title ? localize('chatTitle', "Chat: {0}", widget.viewModel.model.title) : localize('chat.untitledChat', "Untitled Chat");
        const cts = new CancellationTokenSource();
        const disposable = toDisposable(() => cts.dispose(true));
        this.toasts.add(disposable);
        const { clicked } = await this._hostService.showToast({ title, body: localize('notificationDetail', "New chat response.") }, cts.token);
        this.toasts.deleteAndDispose(disposable);
        if (clicked) {
            await this._hostService.focus(targetWindow, { mode: 2 /* FocusMode.Force */ });
            await this._widgetService.reveal(widget);
            widget.focusInput();
        }
    }
};
ChatAccessibilityService = __decorate([
    __param(0, IAccessibilitySignalService),
    __param(1, IInstantiationService),
    __param(2, IConfigurationService),
    __param(3, IHostService),
    __param(4, IChatWidgetService),
    __param(5, IChatService)
], ChatAccessibilityService);
export { ChatAccessibilityService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEFjY2Vzc2liaWxpdHlTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FjY2Vzc2liaWxpdHkvY2hhdEFjY2Vzc2liaWxpdHlTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0NBQW9DLENBQUM7QUFDMUQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDcEYsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDM0UsT0FBTyxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQUUsYUFBYSxFQUFFLFlBQVksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRWpILE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSxtRkFBbUYsQ0FBQztBQUNySixPQUFPLEVBQUUsb0NBQW9DLEVBQUUsTUFBTSw2RkFBNkYsQ0FBQztBQUNuSixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUV0RyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFFekUsT0FBTyxFQUE2QyxZQUFZLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUVsSCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUNwRixPQUFPLEVBQTZCLGtCQUFrQixFQUFF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