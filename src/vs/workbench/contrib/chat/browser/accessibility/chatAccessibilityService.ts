/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderAsPlaintext } from '../../../../../base/browser/markdownRenderer.js';
import { alert, status } from '../../../../../base/browser/ui/aria/aria.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableMap } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { AccessibilityProgressSignalScheduler } from '../../../../../platform/accessibilitySignal/browser/progressAccessibilitySignalScheduler.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { AccessibilityVoiceSettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { ElicitationState, IChatElicitationRequest, IChatService } from '../../common/chatService/chatService.js';
import { IChatResponseViewModel } from '../../common/model/chatViewModel.js';
import { IChatAccessibilityService, IChatWidgetService } from '../chat.js';

const CHAT_RESPONSE_PENDING_ALLOWANCE_MS = 4000;
export class ChatAccessibilityService extends Disposable implements IChatAccessibilityService {
	declare readonly _serviceBrand: undefined;

	private _pendingSignalMap: DisposableMap<URI, AccessibilityProgressSignalScheduler> = this._register(new DisposableMap());

	constructor(
		@IAccessibilitySignalService private readonly _accessibilitySignalService: IAccessibilitySignalService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IChatWidgetService private readonly _widgetService: IChatWidgetService,
		@IChatService private readonly _chatService: IChatService,
	) {
		super();
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

	acceptRequest(uri: URI, skipRequestSignal?: boolean): void {
		if (!skipRequestSignal) {
			this._accessibilitySignalService.playSignal(AccessibilitySignal.chatRequestSent, { allowManyInParallel: true });
		}
		this._pendingSignalMap.set(uri, this._instantiationService.createInstance(AccessibilityProgressSignalScheduler, CHAT_RESPONSE_PENDING_ALLOWANCE_MS, undefined));
	}

	disposeRequest(requestId: URI): void {
		this._pendingSignalMap.deleteAndDispose(requestId);
	}

	acceptResponse(response: IChatResponseViewModel | string | undefined, requestId: URI, isVoiceInput?: boolean): void {
		this._pendingSignalMap.deleteAndDispose(requestId);
		const isPanelChat = typeof response !== 'string';
		const responseContent = typeof response === 'string' ? response : response?.response.toString();
		this._accessibilitySignalService.playSignal(AccessibilitySignal.chatResponseReceived, { allowManyInParallel: true });
		if (!response || !responseContent) {
			return;
		}
		const plainTextResponse = renderAsPlaintext(new MarkdownString(responseContent));
		const errorDetails = isPanelChat && response.errorDetails ? ` ${response.errorDetails.message}` : '';
		if (!isVoiceInput || this._configurationService.getValue(AccessibilityVoiceSettingId.AutoSynthesize) !== 'on') {
			status(plainTextResponse + errorDetails);
		}
	}
	acceptElicitation(elicitation: IChatElicitationRequest): void {
		if (elicitation.state.get() !== ElicitationState.Pending) {
			return;
		}
		const title = typeof elicitation.title === 'string' ? elicitation.title : elicitation.title.value;
		const message = typeof elicitation.message === 'string' ? elicitation.message : elicitation.message.value;
		alert(title + ' ' + message);
		this._accessibilitySignalService.playSignal(AccessibilitySignal.chatUserActionRequired, { allowManyInParallel: true });
	}

}
