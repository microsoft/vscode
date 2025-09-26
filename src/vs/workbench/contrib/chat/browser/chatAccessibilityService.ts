/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { alert, status } from '../../../../base/browser/ui/aria/aria.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { AccessibilityProgressSignalScheduler } from '../../../../platform/accessibilitySignal/browser/progressAccessibilitySignalScheduler.js';
import { IChatAccessibilityService } from './chat.js';
import { IChatResponseViewModel } from '../common/chatViewModel.js';
import { renderAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { AccessibilityVoiceSettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { IChatElicitationRequest } from '../common/chatService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { FocusMode } from '../../../../platform/native/common/native.js';
import * as dom from '../../../../base/browser/dom.js';
import { Event } from '../../../../base/common/event.js';
import { ChatConfiguration } from '../common/constants.js';
import { localize } from '../../../../nls.js';
import { ChatWidget } from './chatWidget.js';

const CHAT_RESPONSE_PENDING_ALLOWANCE_MS = 4000;
export class ChatAccessibilityService extends Disposable implements IChatAccessibilityService {
	declare readonly _serviceBrand: undefined;

	private _pendingSignalMap: DisposableMap<number, AccessibilityProgressSignalScheduler> = this._register(new DisposableMap());

	private _requestId: number = 0;

	private readonly notifications: Set<DisposableStore> = new Set();

	constructor(
		@IAccessibilitySignalService private readonly _accessibilitySignalService: IAccessibilitySignalService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IHostService private readonly _hostService: IHostService
	) {
		super();
	}

	override dispose(): void {
		for (const ds of Array.from(this.notifications)) {
			ds.dispose();
		}
		this.notifications.clear();
		super.dispose();
	}

	acceptRequest(): number {
		this._requestId++;
		this._accessibilitySignalService.playSignal(AccessibilitySignal.chatRequestSent, { allowManyInParallel: true });
		this._pendingSignalMap.set(this._requestId, this._instantiationService.createInstance(AccessibilityProgressSignalScheduler, CHAT_RESPONSE_PENDING_ALLOWANCE_MS, undefined));
		return this._requestId;
	}
	acceptResponse(widget: ChatWidget, container: HTMLElement, response: IChatResponseViewModel | string | undefined, requestId: number, isVoiceInput?: boolean): void {
		this._pendingSignalMap.deleteAndDispose(requestId);
		const isPanelChat = typeof response !== 'string';
		const responseContent = typeof response === 'string' ? response : response?.response.toString();
		this._accessibilitySignalService.playSignal(AccessibilitySignal.chatResponseReceived, { allowManyInParallel: true });
		if (!response || !responseContent) {
			return;
		}
		this._showOSNotification(widget, container, responseContent.substring(0, 20));
		const errorDetails = isPanelChat && response.errorDetails ? ` ${response.errorDetails.message}` : '';
		const plainTextResponse = renderAsPlaintext(new MarkdownString(responseContent));
		if (!isVoiceInput || this._configurationService.getValue(AccessibilityVoiceSettingId.AutoSynthesize) !== 'on') {
			status(plainTextResponse + errorDetails);
		}
	}
	acceptElicitation(elicitation: IChatElicitationRequest): void {
		const title = typeof elicitation.title === 'string' ? elicitation.title : elicitation.title.value;
		const message = typeof elicitation.message === 'string' ? elicitation.message : elicitation.message.value;
		alert(title + ' ' + message);
		this._accessibilitySignalService.playSignal(AccessibilitySignal.chatUserActionRequired, { allowManyInParallel: true });
	}

	announceQueued(count: number): void {
		const message = count === 1
			? localize('chat.accessibility.queue.single', "1 chat message queued. It will be sent when the current response finishes.")
			: localize('chat.accessibility.queue.multiple', "{0} chat messages queued. They'll be sent when the current response finishes.", count);
		status(message);
	}

	announceQueueFlushed(count: number): void {
		const message = count === 1
			? localize('chat.accessibility.queue.flushed.single', "Queued chat message sent.")
			: localize('chat.accessibility.queue.flushed.multiple', "Queued chat messages sent.");
		status(message);
	}

	announceQueueCleared(count: number): void {
		const message = count === 1
			? localize('chat.accessibility.queue.cleared.single', "Queued chat message cleared.")
			: localize('chat.accessibility.queue.cleared.multiple', "Queued chat messages cleared.");
		status(message);
	}

	private async _showOSNotification(widget: ChatWidget, container: HTMLElement, responseContent: string): Promise<void> {
		if (!this._configurationService.getValue(ChatConfiguration.NotifyWindowOnResponseReceived)) {
			return;
		}

		const targetWindow = dom.getWindow(container);
		if (!targetWindow) {
			return;
		}

		if (targetWindow.document.hasFocus()) {
			return;
		}

		await this._hostService.focus(targetWindow, { mode: FocusMode.Notify });

		// Dispose any previous unhandled notifications to avoid replacement/coalescing.
		for (const ds of Array.from(this.notifications)) {
			ds.dispose();
			this.notifications.delete(ds);
		}


		const notification = await dom.triggerNotification(localize('chat.responseReceivedNotification', "Chat response received: {0}", responseContent), {
			detail: localize('chat.responseReceivedNotification.detail', "Click to focus chat"),
			sticky: false,
		});

		if (!notification) {
			return;
		}

		const disposables = new DisposableStore();
		disposables.add(notification);
		this.notifications.add(disposables);

		disposables.add(Event.once(notification.onClick)(async () => {
			await this._hostService.focus(targetWindow, { mode: FocusMode.Force });
			widget.input.focus();
			disposables.dispose();
			this.notifications.delete(disposables);
		}));

		disposables.add(this._hostService.onDidChangeFocus(focus => {
			if (focus) {
				disposables.dispose();
				this.notifications.delete(disposables);
			}
		}));
	}

}
