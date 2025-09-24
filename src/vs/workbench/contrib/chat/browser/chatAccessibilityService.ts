/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { alert, status } from '../../../../base/browser/ui/aria/aria.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
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

const CHAT_RESPONSE_PENDING_ALLOWANCE_MS = 4000;
export class ChatAccessibilityService extends Disposable implements IChatAccessibilityService {

	declare readonly _serviceBrand: undefined;

	private _pendingSignalMap: DisposableMap<number, AccessibilityProgressSignalScheduler> = this._register(new DisposableMap());

	private _requestId: number = 0;

	private readonly notification = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		@IAccessibilitySignalService private readonly _accessibilitySignalService: IAccessibilitySignalService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IHostService private readonly _hostService: IHostService,
	) {
		super();
	}
	acceptRequest(): number {
		this._requestId++;
		this._accessibilitySignalService.playSignal(AccessibilitySignal.chatRequestSent, { allowManyInParallel: true });
		this._pendingSignalMap.set(this._requestId, this._instantiationService.createInstance(AccessibilityProgressSignalScheduler, CHAT_RESPONSE_PENDING_ALLOWANCE_MS, undefined));
		return this._requestId;
	}
	acceptResponse(container: HTMLElement, response: IChatResponseViewModel | string | undefined, requestId: number, isVoiceInput?: boolean): void {
		this._pendingSignalMap.deleteAndDispose(requestId);
		const isPanelChat = typeof response !== 'string';
		const responseContent = typeof response === 'string' ? response : response?.response.toString();
		this._accessibilitySignalService.playSignal(AccessibilitySignal.chatResponseReceived, { allowManyInParallel: true });
		if (!response) {
			return;
		}
		this._showOSNotification(container);
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

	private async _showOSNotification(container: HTMLElement): Promise<void> {
		if (!this._configurationService.getValue(ChatConfiguration.ShowResponseCompletionOSNotification)) {
			return;
		}
		const targetWindow = dom.getWindow(container);
		if (targetWindow.document.hasFocus()) {
			return;
		}
		this._hostService.focus(targetWindow, { mode: FocusMode.Notify });
		const notification = await dom.triggerNotification('Chat response received');
		if (notification) {
			const disposables = this.notification.value = new DisposableStore();
			disposables.add(notification);

			disposables.add(Event.once(notification.onClick)(() => {
				this._hostService.focus(targetWindow, { mode: FocusMode.Force });
			}));

			disposables.add(this._hostService.onDidChangeFocus(focus => {
				if (focus) {
					disposables.dispose();
				}
			}));
		}
	}
}
