/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { localize } from '../../../../../nls.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { ChatConfiguration, ChatPermissionLevel } from '../../../../../workbench/contrib/chat/common/constants.js';
import { DEFAULT_PERMISSION_LEVELS, IPermissionPickerDelegate, PermissionPicker } from './permissionPicker.js';
import { isPhoneLayout } from '../../../../browser/parts/mobile/mobileLayout.js';
import { IMobilePickerSheetItem, showMobilePickerSheet } from '../../../../browser/parts/mobile/mobilePickerSheet.js';

const LEARN_MORE_ID = 'learn-more';

/**
 * Phone variant of {@link PermissionPicker} that surfaces the available
 * approval levels (provided by the delegate, defaulting to
 * Default/Bypass/Autopilot) as a {@link showMobilePickerSheet} bottom sheet
 * rather than the desktop action-widget popup.
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
		@IStorageService storageService: IStorageService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IHoverService hoverService: IHoverService,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
	) {
		super(_delegate, actionWidgetService, configurationService, dialogService, openerService, storageService, telemetryService, hoverService);
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

		const levels = this._delegate.availableLevels ?? DEFAULT_PERMISSION_LEVELS;
		const items: IMobilePickerSheetItem[] = levels.map(level => {
			const meta = this._getPermissionLevelMeta(level);
			return {
				id: level,
				label: meta.label,
				description: meta.detail,
				icon: meta.icon,
				checked: this._currentLevel === level,
				// Default is never policy-restricted; elevated levels are
				// disabled when enterprise policy turns off auto-approval.
				...(level !== ChatPermissionLevel.Default && policyRestricted ? { disabled: true } : {}),
			} satisfies IMobilePickerSheetItem;
		});
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
				await this.openerService.open(URI.parse('https://aka.ms/vscode/docs/permissions'));
				return;
			}
			await this._selectLevel(id as ChatPermissionLevel);
		});
	}
}
