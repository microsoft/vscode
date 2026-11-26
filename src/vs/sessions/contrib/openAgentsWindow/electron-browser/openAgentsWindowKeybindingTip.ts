/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { AgentsWindowOpenSource } from '../../../../platform/window/common/window.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IChatTipService } from '../../../../workbench/contrib/chat/browser/chatTipService.js';
import { OPEN_AGENTS_WINDOW_COMMAND_ID } from '../../../../workbench/contrib/chat/common/constants.js';
import { SystemWideKeybindingTip } from '../../../../workbench/contrib/chat/electron-browser/systemWideKeybindingTip.js';
import { IKeybindingEditingService } from '../../../../workbench/services/keybinding/common/keybindingEditing.js';

export const ENABLE_OPEN_AGENTS_WINDOW_SYSTEM_WIDE_KEYBINDING_COMMAND_ID = 'sessions.action.enableOpenAgentsWindowSystemWideKeybinding';
export const OPEN_AGENTS_WINDOW_SYSTEM_WIDE_KEYBINDING = 'ctrl+cmd+a';

/** Offers to open the Agents Window with Ctrl+Cmd+A from any app, on macOS. */
export class OpenAgentsWindowSystemWideKeybindingTip extends SystemWideKeybindingTip {

	constructor(
		supported: boolean,
		chatTipService: IChatTipService,
		keybindingService: IKeybindingService,
		keybindingEditingService: IKeybindingEditingService,
		storageService: IStorageService,
		notificationService: INotificationService,
		logService: ILogService,
	) {
		super({
			tipId: 'sessions.openAgentsWindowSystemWideKeybinding',
			enableCommandId: ENABLE_OPEN_AGENTS_WINDOW_SYSTEM_WIDE_KEYBINDING_COMMAND_ID,
			commandId: OPEN_AGENTS_WINDOW_COMMAND_ID,
			commandArgs: { source: AgentsWindowOpenSource.KeyboardShortcut },
			dismissedStorageKey: 'sessions.openAgentsWindowSystemWideKeybindingTip.dismissed',
			dismissedStorageScope: StorageScope.APPLICATION,
			getKeybinding: () => keybindingService.resolveUserBinding(OPEN_AGENTS_WINDOW_SYSTEM_WIDE_KEYBINDING)[0],
			isEligible: () => supported,
			copy: {
				appendOffer: (content, keybindingLabel, enableLink) => {
					content.appendMarkdown(localize('openAgentsWindowSystemWideKeybinding.tipPrefix', "**Tip:** "));
					content.appendLink(enableLink, localize('openAgentsWindowSystemWideKeybinding.enable', "Enable {0}", keybindingLabel));
					content.appendMarkdown(localize('openAgentsWindowSystemWideKeybinding.tipSuffix', " to open the Agents Window from any app while VS Code is running."));
				},
				appendEnabled: (content, keybindingLabel, manageLink) => {
					content.appendMarkdown(localize('openAgentsWindowSystemWideKeybinding.enabled', "**Shortcut enabled:** Press `{0}` from any app to open the Agents Window. ", keybindingLabel));
					content.appendLink(manageLink, localize('openAgentsWindowSystemWideKeybinding.manage', "Manage Shortcut"));
				},
				getEnabledStatus: keybindingLabel => localize('openAgentsWindowSystemWideKeybinding.enabledStatus', "Shortcut {0} enabled. Press it from any app to open the Agents Window.", keybindingLabel),
			},
		}, chatTipService, keybindingService, keybindingEditingService, storageService, notificationService, logService);
	}
}

class OpenAgentsWindowSystemWideKeybindingTipContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.openAgentsWindowSystemWideKeybindingTip';

	constructor(
		@IChatTipService chatTipService: IChatTipService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IKeybindingEditingService keybindingEditingService: IKeybindingEditingService,
		@IStorageService storageService: IStorageService,
		@INotificationService notificationService: INotificationService,
		@ILogService logService: ILogService,
	) {
		super();

		this._register(new OpenAgentsWindowSystemWideKeybindingTip(
			isMacintosh,
			chatTipService,
			keybindingService,
			keybindingEditingService,
			storageService,
			notificationService,
			logService,
		));
	}
}

registerWorkbenchContribution2(
	OpenAgentsWindowSystemWideKeybindingTipContribution.ID,
	OpenAgentsWindowSystemWideKeybindingTipContribution,
	WorkbenchPhase.BlockRestore,
);
