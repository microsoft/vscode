/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IMenuEntryActionViewItemOptions, MenuEntryActionViewItem } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { addMicButtonContextMenuListener, getVoiceModeContextMenuActions } from '../speechToText/micButtonMenuActions.js';

/**
 * Stable command the "Configure Keybinding" entry targets. Voice Mode swaps the
 * rendered action between start and push-to-talk-stop while listening, but the
 * keybinding lives on the start command, so target it in both states.
 */
const VOICE_START_COMMAND = 'agentsVoice.startVoiceInChat';

/**
 * Action view item for the chat-input Voice Mode button. Behaves like the normal
 * toolbar voice-mode toggle (click to start/stop) but adds a right-click context
 * menu with voice-specific entries — "Configure Keybinding" (mirroring the
 * standard toolbar affordance), "Select Microphone" and "Disable Voice Mode" —
 * instead of the generic toolbar context menu. Mirrors {@link DictationActionViewItem}.
 */
export class VoiceModeActionViewItem extends MenuEntryActionViewItem {

	constructor(
		action: MenuItemAction,
		options: IMenuEntryActionViewItemOptions | undefined,
		@ICommandService private readonly _commandService: ICommandService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
	) {
		super(action, options, keybindingService, notificationService, contextKeyService, themeService, contextMenuService, accessibilityService);
	}

	override render(container: HTMLElement): void {
		super.render(container);

		this._register(addMicButtonContextMenuListener(
			container,
			() => getVoiceModeContextMenuActions(this._commandService, this._configurationService, this._keybindingService, VOICE_START_COMMAND),
			this._contextMenuService,
		));
	}
}
