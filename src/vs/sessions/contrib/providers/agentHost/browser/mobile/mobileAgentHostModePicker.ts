/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IChatWidgetService } from '../../../../../../workbench/contrib/chat/browser/chat.js';
import { IChatPhoneInputPresenter } from '../../../../../../workbench/contrib/chat/browser/widget/input/chatPhoneInputPresenter.js';
import { IObservable } from '../../../../../../base/common/observable.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { IActiveSession } from '../../../../../services/sessions/common/sessionsManagement.js';
import { AgentHostModePicker } from '../agentHostModePicker.js';
import { createChatPhoneInputSessionContext } from './mobileChatPhoneInputTarget.js';

/**
 * Phone-aware variant of {@link AgentHostModePicker}. On phone-layout
 * viewports the desktop action-widget popover is replaced with the same
 * combined Mode + Model bottom sheet used by the workbench picker button and the
 * empty new-chat picker (see {@link IChatPhoneInputPresenter}). On
 * desktop the inherited `_showPicker` falls through to the base
 * implementation, so this class is safe to keep through viewport-class
 * transitions.
 */
export class MobileAgentHostModePicker extends AgentHostModePicker {

	constructor(
		session: IObservable<IActiveSession | undefined>,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IHoverService hoverService: IHoverService,
		@IChatPhoneInputPresenter private readonly _phonePresenter: IChatPhoneInputPresenter,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
	) {
		super(session, actionWidgetService, sessionsProvidersService, telemetryService, hoverService);
	}

	protected override _showPicker(anchor = this._triggerElement, onHide?: () => void): boolean {
		if (!anchor) {
			return false;
		}
		// Guard applies to both the phone sheet and the desktop popover —
		// either path can dispatch through `setSessionConfigValue`.
		if (this._isCurrentlyResolvingConfig()) {
			return false;
		}
		if (this._phonePresenter.enabled.get()) {
			this._phonePresenter.showCombinedModeAndModelSheet(anchor, {
				kind: 'session',
				getSessionContext: () => createChatPhoneInputSessionContext(this._session.get()),
				selectModel: modelIdentifier => {
					const chatResource = this._session.get()?.activeChat.get().resource;
					return chatResource
						? this._chatWidgetService.getWidgetBySessionResource(chatResource)?.inputPart.switchModelByIdentifier(modelIdentifier, true, true) ?? false
						: false;
				},
			})
				.finally(() => {
					anchor.focus();
					onHide?.();
				});
			return true;
		}
		return super._showPicker(anchor, onHide);
	}
}
