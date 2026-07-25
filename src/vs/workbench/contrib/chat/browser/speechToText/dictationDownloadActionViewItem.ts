/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IManagedHoverContent } from '../../../../../base/browser/ui/hover/hover.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IMenuEntryActionViewItemOptions, MenuEntryActionViewItem } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IChatSpeechToTextService } from './chatSpeechToTextService.js';
import { DictationDownloadRing, getDictationDownloadHoverContent } from './dictationDownloadRing.js';
import { addMicButtonContextMenuListener, getDictationContextMenuActions } from './micButtonMenuActions.js';

/** Command whose keybinding the context menu targets while the model prepares. */
const TOGGLE_DICTATION_COMMAND_ID = 'workbench.action.chat.toggleSpeechToText';

/**
 * Toolbar affordance shown while the on-device dictation model downloads: a
 * download icon wrapped by a progress ring, plus a rich hover reporting the
 * percentage.
 */
export class DictationDownloadActionViewItem extends MenuEntryActionViewItem {

	constructor(
		action: MenuItemAction,
		options: IMenuEntryActionViewItemOptions | undefined,
		@IChatSpeechToTextService private readonly _speechToTextService: IChatSpeechToTextService,
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
		this._applyBackendIcon();

		container.classList.add('dictation-download-item');
		// The on-device backend downloads a model, so show a determinate progress
		// ring around the download icon. The cloud backend only connects (no
		// download), so its icon is swapped for a plain spinner instead.
		if (this._speechToTextService.currentBackend !== 'mai') {
			this._register(new DictationDownloadRing(container, this._speechToTextService));
		}

		// Keep the mic context menu available while the model prepares so the
		// affordance doesn't lose Select Microphone / Disable Dictation during
		// first-use download.
		this._register(addMicButtonContextMenuListener(
			container,
			() => getDictationContextMenuActions(this._commandService, this._configurationService, this._keybindingService, TOGGLE_DICTATION_COMMAND_ID),
			this._contextMenuService,
		));
	}

	protected override updateClass(): void {
		super.updateClass();
		this._applyBackendIcon();
	}

	private _applyBackendIcon(): void {
		if (this._speechToTextService.currentBackend !== 'mai' || !this.label) {
			return;
		}
		this.label.classList.remove(...ThemeIcon.asClassNameArray(Codicon.cloudDownload));
		this.label.classList.add(...ThemeIcon.asClassNameArray(Codicon.loading));
	}

	protected override getHoverContents(): IManagedHoverContent {
		return getDictationDownloadHoverContent(this._speechToTextService);
	}
}
