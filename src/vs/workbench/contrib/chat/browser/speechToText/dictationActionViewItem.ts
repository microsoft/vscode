/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IManagedHoverContent } from '../../../../../base/browser/ui/hover/hover.js';
import { MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IMenuEntryActionViewItemOptions, MenuEntryActionViewItem } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IChatSpeechToTextService } from './chatSpeechToTextService.js';
import { getDictationDownloadHoverContent } from './dictationDownloadRing.js';
import { setupDictationMicGlow } from './dictationMicGlow.js';
import { getDictationHoverContent } from './micButtonHovers.js';
import { addMicButtonContextMenuListener, getDictationContextMenuActions } from './micButtonMenuActions.js';

/**
 * Action view item for the chat-input dictation mic button. Behaves like a
 * normal toolbar mic (click to dictate) but adds a right-click context menu with
 * dictation-specific entries — "Configure Keybinding" (mirroring the standard
 * toolbar affordance), "Select Microphone" and "Disable Dictation" — instead of
 * the generic toolbar context menu. Its hover also describes what dictation does
 * and which model transcribes the audio.
 */
export class DictationActionViewItem extends MenuEntryActionViewItem {

	constructor(
		action: MenuItemAction,
		options: IMenuEntryActionViewItemOptions | undefined,
		@ICommandService private readonly _commandService: ICommandService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService private readonly _dictationThemeService: IThemeService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IAccessibilityService private readonly _dictationAccessibilityService: IAccessibilityService,
		@IChatSpeechToTextService private readonly _speechToTextService: IChatSpeechToTextService,
	) {
		super(action, options, keybindingService, notificationService, contextKeyService, _dictationThemeService, contextMenuService, _dictationAccessibilityService);
	}

	override render(container: HTMLElement): void {
		super.render(container);

		this._register(addMicButtonContextMenuListener(
			container,
			() => getDictationContextMenuActions(this._commandService, this._configurationService, this._keybindingService, this._action.id),
			this._contextMenuService,
		));
		this._register(setupDictationMicGlow(container, this._speechToTextService, this._dictationAccessibilityService, undefined, this._dictationThemeService));
	}

	protected override getHoverContents(): IManagedHoverContent {
		if (this._speechToTextService.isPreparingModel) {
			return getDictationDownloadHoverContent(this._speechToTextService);
		}
		return getDictationHoverContent(this.getTooltip() ?? '', this._configurationService);
	}
}
