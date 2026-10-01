/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionViewItemProvider } from '../../base/browser/ui/actionbar/actionbar.js';
import { IActionViewItemOptions } from '../../base/browser/ui/actionbar/actionViewItems.js';
import { ClickAnimation } from '../../base/browser/ui/animations/animations.js';
import { IAccessibilityService } from '../../platform/accessibility/common/accessibility.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IMenuEntryActionViewItemOptions, MenuEntryActionViewItem } from '../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuItemAction } from '../../platform/actions/common/actions.js';
import { SESSIONS_MARK_AS_DONE_CONFETTI_SETTING } from '../../platform/chat/common/sessionArchiveActions.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../platform/notification/common/notification.js';
import { logSettingExperimentTrigger } from '../../platform/telemetry/common/experimentTrigger.js';
import { ITelemetryService } from '../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../platform/theme/common/themeService.js';
import { ARCHIVE_SESSION_COMMAND_ID } from '../common/sessionCommands.js';

export function getSessionArchiveActionViewItemOptions(options: IActionViewItemOptions, configurationService: IConfigurationService, accessibilitySignalService: IAccessibilitySignalService): IMenuEntryActionViewItemOptions {
	return {
		...options,
		get onClickAnimation() {
			return configurationService.getValue<boolean>(SESSIONS_MARK_AS_DONE_CONFETTI_SETTING)
				? ClickAnimation.Confetti
				: undefined;
		},
		onDidTriggerClickAnimation: () => accessibilitySignalService.playSignal(AccessibilitySignal.confetti)
	};
}

/** The Mark as Done button, whose click is where {@link SESSIONS_MARK_AS_DONE_CONFETTI_SETTING} decides whether to celebrate. */
export class SessionArchiveActionViewItem extends MenuEntryActionViewItem {

	constructor(
		action: MenuItemAction,
		options: IMenuEntryActionViewItemOptions | undefined,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IAccessibilityService private readonly _accessibility: IAccessibilityService,
	) {
		super(action, options, keybindingService, notificationService, contextKeyService, themeService, contextMenuService, _accessibility);
	}

	override onClick(event: MouseEvent): Promise<void> {
		// Reduced motion never animates, so the setting cannot change what those users see.
		if (!this._accessibility.isMotionReduced()) {
			logSettingExperimentTrigger(this._telemetryService, SESSIONS_MARK_AS_DONE_CONFETTI_SETTING);
		}
		return super.onClick(event);
	}
}

export function createSessionActionViewItemProvider(instantiationService: IInstantiationService, configurationService: IConfigurationService, accessibilitySignalService: IAccessibilitySignalService): IActionViewItemProvider {
	return (action, options) => {
		if (action instanceof MenuItemAction && action.id === ARCHIVE_SESSION_COMMAND_ID) {
			return instantiationService.createInstance(SessionArchiveActionViewItem, action, getSessionArchiveActionViewItemOptions(options, configurationService, accessibilitySignalService));
		}
		return undefined;
	};
}
