/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InlineVoiceChatAction, QuickVoiceChatAction, StartVoiceChatAction, StopInlineVoiceChatAction, StopQuickVoiceChatAction, StopVoiceChatAction, StopVoiceChatAndSubmitAction, StopVoiceChatInChatEditorAction, StopVoiceChatInChatViewAction, VoiceChatInChatViewAction } from 'vs/workbench/contrib/chat/electron-sandbox/actions/voiceChatActions';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { ISpeechService } from 'vs/workbench/contrib/speech/common/speechService';
import { Disposable } from 'vs/base/common/lifecycle';
import { Event } from 'vs/base/common/event';
import { registerAction2 } from 'vs/platform/actions/common/actions';

function registerVoiceChatActions(): void {
	registerAction2(VoiceChatInChatViewAction);
	registerAction2(QuickVoiceChatAction);
	registerAction2(InlineVoiceChatAction);

	registerAction2(StartVoiceChatAction);
	registerAction2(StopVoiceChatAction);
	registerAction2(StopVoiceChatAndSubmitAction);

	registerAction2(StopVoiceChatInChatViewAction);
	registerAction2(StopVoiceChatInChatEditorAction);
	registerAction2(StopQuickVoiceChatAction);
	registerAction2(StopInlineVoiceChatAction);
}

class VoiceChatActionsContributor extends Disposable implements IWorkbenchContribution {

	constructor(@ISpeechService speechService: ISpeechService) {
		super();

		this._register(Event.once(speechService.onDidRegisterSpeechProvider)(() => {
			registerVoiceChatActions();
		}));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(VoiceChatActionsContributor, LifecyclePhase.Restored);
