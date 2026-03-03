/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createMarkdownCommandLink, MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
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
 * Registers the "Thinking Phrases" tip. The tip is only registered when the
 * user has never modified the thinking phrases setting, and is unregistered
 * if the user modifies it.
 */
export class ThinkingPhrasesTipContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'chat.thinkingPhrasesTipContribution';

	constructor(
		@IChatTipService chatTipService: IChatTipService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
	) {
		super();

		const wasEverModified = storageService.getBoolean(ChatTipStorageKeys.ThinkingPhrasesEverModified, StorageScope.APPLICATION, false)
			|| this._isSettingModified(configurationService, ChatConfiguration.ThinkingPhrases);

		if (wasEverModified) {
			return;
		}

		const tipRegistration = this._register(new MutableDisposable());
		const settingsLink = createMarkdownCommandLink({ id: SETTINGS_COMMAND_OPEN_SETTINGS, title: localize('tip.thinkingPhrases.label', "thinking phrases"), arguments: [ChatConfiguration.ThinkingPhrases] });
		tipRegistration.value = chatTipService.registerTip({
			id: 'tip.thinkingPhrases',
			tier: ChatTipTier.Qol,
			message: new MarkdownString(
				localize(
					'tip.thinkingPhrases',
					"Customize the loading messages shown while the agent works with {0}.",
					settingsLink
				)
			),
			when: ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
			excludeWhenSettingsChanged: [ChatConfiguration.ThinkingPhrases],
			dismissWhenCommandsClicked: [SETTINGS_COMMAND_OPEN_SETTINGS],
		});

		// Unregister if the user modifies the setting
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.ThinkingPhrases)) {
				storageService.store(ChatTipStorageKeys.ThinkingPhrasesEverModified, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
				tipRegistration.clear();
			}
		}));
	}

	private _isSettingModified(configurationService: IConfigurationService, key: string): boolean {
		const inspected = configurationService.inspect(key);
		return inspected.userValue !== undefined
			|| inspected.userLocalValue !== undefined
			|| inspected.userRemoteValue !== undefined
			|| inspected.workspaceValue !== undefined
			|| inspected.workspaceFolderValue !== undefined;
	}
}
