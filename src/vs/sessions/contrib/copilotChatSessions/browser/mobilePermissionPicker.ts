/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { localize } from '../../../../nls.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { ChatConfiguration, ChatPermissionLevel } from '../../../../workbench/contrib/chat/common/constants.js';
import { IPermissionPickerDelegate, PermissionPicker } from './permissionPicker.js';
import { isPhoneLayout } from '../../../browser/parts/mobile/mobileLayout.js';
import { IMobilePickerSheetItem, showMobilePickerSheet } from '../../../browser/parts/mobile/mobilePickerSheet.js';

const LEARN_MORE_ID = 'learn-more';

/**
 * Phone variant of {@link PermissionPicker} that surfaces the
 * Default/Bypass/Autopilot choice as a {@link showMobilePickerSheet}
 * bottom sheet rather than the desktop action-widget popup.
 *
 * Falls back to the inherited dropdown when the viewport is not phone
 * (e.g. user resized past the breakpoint after the picker rendered).
 */
export class MobilePermissionPicker extends PermissionPicker {

	constructor(
		_delegate: IPermissionPickerDelegate,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IConfigurationService configurationService: IConfigurationService,
		@IDialogService dialogService: IDialogService,
		@IOpenerService openerService: IOpenerService,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
	) {
		super(_delegate, actionWidgetService, configurationService, dialogService, openerService);
	}

	override showPicker(): void {
		if (!this._triggerElement || this.actionWidgetService.isVisible) {
			return;
		}
		if (!isPhoneLayout(this._layoutService)) {
			super.showPicker();
			return;
		}

		const policyRestricted = this.configurationService.inspect<boolean>(ChatConfiguration.GlobalAutoApprove).policyValue === false;
		const isAutopilotEnabled = this.configurationService.getValue<boolean>(ChatConfiguration.AutopilotEnabled) !== false;

		const items: IMobilePickerSheetItem[] = [
			{
				id: ChatPermissionLevel.Default,
				label: localize('permissions.default', "Default Approvals"),
				description: localize('permissions.default.subtext', "Copilot uses your configured settings"),
				icon: Codicon.shield,
				checked: this._currentLevel === ChatPermissionLevel.Default,
			},
			{
				id: ChatPermissionLevel.AutoApprove,
				label: localize('permissions.autoApprove', "Bypass Approvals"),
				description: localize('permissions.autoApprove.subtext', "All tool calls are auto-approved"),
				icon: Codicon.warning,
				checked: this._currentLevel === ChatPermissionLevel.AutoApprove,
				disabled: policyRestricted,
			},
		];
		if (isAutopilotEnabled) {
			items.push({
				id: ChatPermissionLevel.Autopilot,
				label: localize('permissions.autopilot', "Autopilot (Preview)"),
				description: localize('permissions.autopilot.subtext', "Autonomously iterates from start to finish"),
				icon: Codicon.rocket,
				checked: this._currentLevel === ChatPermissionLevel.Autopilot,
				disabled: policyRestricted,
			});
		}
		items.push({
			id: LEARN_MORE_ID,
			label: localize('permissions.learnMore', "Learn more about permissions"),
			icon: Codicon.linkExternal,
			sectionTitle: '',
		});

		const trigger = this._triggerElement;
		trigger.setAttribute('aria-expanded', 'true');
		showMobilePickerSheet(
			this._layoutService.mainContainer,
			localize('permissionPicker.title', "Approvals"),
			items,
		).then(async id => {
			trigger.setAttribute('aria-expanded', 'false');
			trigger.focus();
			if (!id) {
				return;
			}
			if (id === LEARN_MORE_ID) {
				await this.openerService.open(URI.parse('https://code.visualstudio.com/docs/copilot/agents/agent-tools#_permission-levels'));
				return;
			}
			await this._selectLevel(id as ChatPermissionLevel);
		});
	}
}
