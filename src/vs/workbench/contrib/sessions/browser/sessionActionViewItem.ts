/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionViewItemProvider } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { ClickAnimation, triggerClickAnimation } from '../../../../base/browser/ui/animations/animations.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IMenuEntryActionViewItemOptions, MenuEntryActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { SESSIONS_MARK_AS_DONE_CONFETTI_SETTING } from '../../../../platform/chat/common/sessionArchiveActions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { logSettingExperimentTrigger } from '../../../../platform/telemetry/common/experimentTrigger.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ARCHIVE_SESSION_COMMAND_ID, ARCHIVE_SESSION_GROUP_COMMAND_ID } from '../common/sessionCommands.js';

export function getSessionArchiveActionViewItemOptions(options: IActionViewItemOptions, configurationService: IConfigurationService, shouldTriggerClickAnimation?: (context: unknown) => boolean): IMenuEntryActionViewItemOptions {
	return {
		...options,
		shouldTriggerClickAnimation,
		get onClickAnimation() {
			return configurationService.getValue<boolean>(SESSIONS_MARK_AS_DONE_CONFETTI_SETTING)
				? ClickAnimation.Confetti
				: undefined;
		}
	};
}

/** The Mark as Done button, whose click is where {@link SESSIONS_MARK_AS_DONE_CONFETTI_SETTING} decides whether to celebrate. */
export class SessionArchiveActionViewItem extends MenuEntryActionViewItem {

	private readonly _beforeActionAnimationOptions: IMenuEntryActionViewItemOptions | undefined;
	private readonly _animateBeforeAction: boolean;

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
		const animateBeforeAction = action.id === ARCHIVE_SESSION_COMMAND_ID;
		super(action, options, keybindingService, notificationService, contextKeyService, themeService, contextMenuService, _accessibility);
		this._animateBeforeAction = animateBeforeAction;
		this._beforeActionAnimationOptions = animateBeforeAction ? options : undefined;
	}

	protected override get onClickAnimation(): ClickAnimation | undefined {
		return this._animateBeforeAction ? undefined : super.onClickAnimation;
	}

	override onClick(event: MouseEvent): Promise<void> {
		// Reduced motion never animates, so the setting cannot change what those users see.
		if (!this._accessibility.isMotionReduced()) {
			logSettingExperimentTrigger(this._telemetryService, SESSIONS_MARK_AS_DONE_CONFETTI_SETTING);
		}
		const animation = this._beforeActionAnimationOptions?.onClickAnimation;
		if (animation && this.element && !this._accessibility.isMotionReduced() && (this._beforeActionAnimationOptions?.shouldTriggerClickAnimation?.(this._context) ?? true)) {
			const icon = this._menuItemAction.item.icon;
			triggerClickAnimation(this.element, animation, ThemeIcon.isThemeIcon(icon) ? icon : undefined);
			this._beforeActionAnimationOptions?.onDidTriggerClickAnimation?.();
		}
		return super.onClick(event);
	}
}

export function createSessionActionViewItemProvider(instantiationService: IInstantiationService, configurationService: IConfigurationService, shouldTriggerClickAnimation?: (context: unknown) => boolean): IActionViewItemProvider {
	return (action, options) => {
		if (action instanceof MenuItemAction && (action.id === ARCHIVE_SESSION_COMMAND_ID || action.id === ARCHIVE_SESSION_GROUP_COMMAND_ID)) {
			return instantiationService.createInstance(SessionArchiveActionViewItem, action, getSessionArchiveActionViewItemOptions(options, configurationService, shouldTriggerClickAnimation));
		}
		return undefined;
	};
}
