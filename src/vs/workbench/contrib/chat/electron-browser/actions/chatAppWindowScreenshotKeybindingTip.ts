/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { escapeMarkdownSyntaxTokens } from '../../../../../base/common/htmlContent.js';
import { localize } from '../../../../../nls.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { IKeybindingEditingService } from '../../../../services/keybinding/common/keybindingEditing.js';
import { IAppWindowScreenshotService } from '../../../screenshotTool/electron-browser/appWindowScreenshot.js';
import { IChatTipService } from '../../browser/chatTipService.js';
import { ATTACH_APP_WINDOW_SCREENSHOT_COMMAND_ID } from '../../common/constants.js';
import { SystemWideKeybindingTip } from '../systemWideKeybindingTip.js';

export const ENABLE_APP_WINDOW_SCREENSHOT_SYSTEM_WIDE_KEYBINDING_COMMAND_ID = 'workbench.action.chat.enableAppWindowScreenshotSystemWideKeybinding';

/**
 * Offers to enable the keybinding of Attach Screenshot of App Window in all apps, so that it captures whichever app is
 * focused. Only users who have attached such a screenshot see it, as it comes before all other chat tips.
 */
export class AppWindowScreenshotKeybindingTip extends SystemWideKeybindingTip {

	constructor(
		@IChatTipService chatTipService: IChatTipService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IKeybindingEditingService keybindingEditingService: IKeybindingEditingService,
		@IStorageService storageService: IStorageService,
		@INotificationService notificationService: INotificationService,
		@ILogService logService: ILogService,
		@IAppWindowScreenshotService appWindowScreenshotService: IAppWindowScreenshotService,
	) {
		super({
			tipId: 'chat.appWindowScreenshotSystemWideKeybinding',
			enableCommandId: ENABLE_APP_WINDOW_SCREENSHOT_SYSTEM_WIDE_KEYBINDING_COMMAND_ID,
			commandId: ATTACH_APP_WINDOW_SCREENSHOT_COMMAND_ID,
			dismissedStorageKey: 'chat.appWindowScreenshots.systemWideKeybindingTipDismissed',
			// The tip shows in the Agents window too.
			dismissedStorageScope: StorageScope.APPLICATION_SHARED,
			getKeybinding: () => keybindingService.lookupKeybinding(ATTACH_APP_WINDOW_SCREENSHOT_COMMAND_ID),
			isEligible: () => appWindowScreenshotService.hasCaptured,
			copy: {
				appendOffer: (content, keybindingLabel, enableLink) => {
					content.appendMarkdown(localize('appWindowScreenshotKeybindingTip.offer', "**Tip:** [Enable {0} in all apps]({1}). It then attaches a screenshot of whichever app is focused.", escapeMarkdownSyntaxTokens(keybindingLabel), enableLink));
				},
				appendEnabled: (content, keybindingLabel, manageLink) => {
					content.appendMarkdown(localize('appWindowScreenshotKeybindingTip.enabled', "**Shortcut enabled:** Press {0} in any app to attach a screenshot of that app. ", escapeMarkdownSyntaxTokens(keybindingLabel)));
					content.appendLink(manageLink, localize('appWindowScreenshotKeybindingTip.manage', "Manage Shortcut"));
				},
				getEnabledStatus: keybindingLabel => localize('appWindowScreenshotKeybindingTip.enabledStatus', "Shortcut {0} enabled. Press it in any app to attach a screenshot of that app.", keybindingLabel),
			},
		}, chatTipService, keybindingService, keybindingEditingService, storageService, notificationService, logService);
	}
}
