/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IChatPhoneInputPresenter } from '../../../../../workbench/contrib/chat/browser/widget/input/chatPhoneInputPresenter.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { AgentHostModePicker } from '../agentHost/agentHostModePicker.js';

/**
 * Phone-aware variant of {@link AgentHostModePicker}. On phone-layout
 * viewports the desktop action-widget popover is replaced with the same
 * combined Mode + Model bottom sheet used by the workbench chip and the
 * empty new-chat picker (see {@link IChatPhoneInputPresenter}). On
 * desktop the inherited `_showPicker` falls through to the base
 * implementation, so this class is safe to keep through viewport-class
 * transitions.
 */
export class MobileAgentHostModePicker extends AgentHostModePicker {

	constructor(
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@IChatPhoneInputPresenter private readonly _phonePresenter: IChatPhoneInputPresenter,
	) {
		super(actionWidgetService, sessionsManagementService, sessionsProvidersService);
	}

	protected override _showPicker(): void {
		if (!this._triggerElement) {
			return;
		}
		if (this._phonePresenter.enabled.get()) {
			// The presenter's agent-host branch reads mode + model
			// directly from the active session's provider, so we don't
			// need to pass chat-input delegates here.
			const trigger = this._triggerElement;
			this._phonePresenter.showCombinedModeAndModelSheet(trigger, undefined, undefined)
				.finally(() => trigger.focus());
			return;
		}
		super._showPicker();
	}
}
