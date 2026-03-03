/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createMarkdownCommandLink, MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ChatContextKeys } from '../common/actions/chatContextKeys.js';
import { ChatConfiguration, ChatModeKind } from '../common/constants.js';
import { ChatTipStorageKeys } from './chatTipStorageKeys.js';
import { ChatTipTier } from './chatTipCatalog.js';
import { IChatTipService } from './chatTipService.js';
import { SETTINGS_COMMAND_OPEN_SETTINGS } from '../../preferences/browser/preferences.contribution.js';

/**
 * Registers the "Yolo Mode" (auto approve) tip. The tip is only registered
 * when the user has never enabled auto-approve, and is unregistered if the
 * user enables it. This keeps the eligibility logic self-contained rather
 * than requiring special-case checks in the tip service.
 */
export class YoloModeTipContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'chat.yoloModeTipContribution';

	constructor(
		@IChatTipService chatTipService: IChatTipService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
	) {
		super();

		const tipRegistration = this._register(new MutableDisposable());

		const register = () => {
			const settingsLink = createMarkdownCommandLink({ id: SETTINGS_COMMAND_OPEN_SETTINGS, title: localize('tip.yoloMode.label', "auto approve"), arguments: [ChatConfiguration.GlobalAutoApprove] });
			tipRegistration.value = chatTipService.registerTip({
				id: 'tip.yoloMode',
				tier: ChatTipTier.Qol,
				message: new MarkdownString(
					localize(
						'tip.yoloMode',
						"Enable {0} to give the agent full control without manual confirmation.",
						settingsLink
					)
				),
				when: ContextKeyExpr.and(
					ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
					ContextKeyExpr.notEquals(`config.${ChatConfiguration.GlobalAutoApprove}`, true),
				),
				excludeWhenSettingsChanged: [ChatConfiguration.GlobalAutoApprove],
				dismissWhenCommandsClicked: [SETTINGS_COMMAND_OPEN_SETTINGS],
			});
		};

		const wasEverEnabled = () =>
			storageService.getBoolean(ChatTipStorageKeys.YoloModeEverEnabled, StorageScope.APPLICATION, false)
			|| configurationService.getValue<boolean>(ChatConfiguration.GlobalAutoApprove);

		const isPolicyBlocked = () =>
			configurationService.inspect<boolean>(ChatConfiguration.GlobalAutoApprove).policyValue === false;

		// Only register the tip if yolo mode was never enabled and policy doesn't block it
		if (!wasEverEnabled() && !isPolicyBlocked()) {
			register();

			// Unregister if the user enables yolo mode later
			this._register(configurationService.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration(ChatConfiguration.GlobalAutoApprove)) {
					if (configurationService.getValue<boolean>(ChatConfiguration.GlobalAutoApprove)) {
						storageService.store(ChatTipStorageKeys.YoloModeEverEnabled, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
						tipRegistration.clear();
					}
				}
			}));
		} else if (!storageService.getBoolean(ChatTipStorageKeys.YoloModeEverEnabled, StorageScope.APPLICATION, false)) {
			// Auto-approve is currently on or policy blocks it -- persist the flag
			// so disabling auto-approve later won't re-surface the tip.
			storageService.store(ChatTipStorageKeys.YoloModeEverEnabled, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
	}
}
