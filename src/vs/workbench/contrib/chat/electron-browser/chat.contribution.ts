/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { InlineVoiceChatAction, QuickVoiceChatAction, StartVoiceChatAction, VoiceChatInChatViewAction, StopListeningAction, StopListeningAndSubmitAction, KeywordActivationContribution, InstallSpeechProviderForVoiceChatAction, HoldToVoiceChatInChatViewAction, ReadChatResponseAloud, StopReadAloud, StopReadChatItemAloud } from './actions/voiceChatActions.js';
import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILanguageModelToolsService } from '../common/languageModelToolsService.js';
import { FetchWebPageTool, FetchWebPageToolData } from './tools/fetchPageTool.js';
import { registerChatDeveloperActions } from './actions/chatDeveloperActions.js';
import { INativeWorkbenchEnvironmentService } from '../../../services/environment/electron-browser/environmentService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { CHAT_OPEN_ACTION_ID, IChatViewOpenOptions } from '../browser/actions/chatActions.js';
import { ChatMode } from '../common/constants.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { ipcRenderer } from '../../../../base/parts/sandbox/electron-browser/globals.js';
import { IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';

class NativeBuiltinToolsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'chat.nativeBuiltinTools';

	constructor(
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const editTool = instantiationService.createInstance(FetchWebPageTool);
		this._register(toolsService.registerToolData(FetchWebPageToolData));
		this._register(toolsService.registerToolImplementation(FetchWebPageToolData.id, editTool));
	}
}

class ChatCommandLineSupportContribution extends Disposable {

	static readonly ID = 'workbench.contrib.chatCommandLineSupport';

	constructor(
		@INativeWorkbenchEnvironmentService private readonly environmentService: INativeWorkbenchEnvironmentService,
		@ICommandService private readonly commandService: ICommandService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IWorkspaceTrustRequestService private readonly workspaceTrustRequestService: IWorkspaceTrustRequestService
	) {
		super();

		if (this.environmentService.window.isInitialStartup) {
			this.promptAgentic(this.environmentService.args.agent?._);
		}

		this.registerListeners();
	}

	private registerListeners() {
		ipcRenderer.on('vscode:subcommand', (_, subcommand: { type: string; args: { _: string[] } }) => {
			if (subcommand.type !== 'agent') {
				return;
			}

			this.promptAgentic(subcommand.args._);
		});
	}

	private async promptAgentic(agentArgs: string[] | undefined): Promise<void> {
		if (!Array.isArray(agentArgs) || agentArgs.length === 0) {
			return;
		}

		const trusted = await this.workspaceTrustRequestService.requestWorkspaceTrust({
			message: localize('copilotWorkspaceTrust', "Copilot is currently only supported in trusted workspaces.")
		});

		if (!trusted) {
			return;
		}

		this.layoutService.setAuxiliaryBarMaximized(true);

		const opts: IChatViewOpenOptions = {
			query: agentArgs.join(' '),
			mode: ChatMode.Agent
		};
		this.commandService.executeCommand(CHAT_OPEN_ACTION_ID, opts);
	}
}

registerAction2(StartVoiceChatAction);
registerAction2(InstallSpeechProviderForVoiceChatAction);

registerAction2(VoiceChatInChatViewAction);
registerAction2(HoldToVoiceChatInChatViewAction);
registerAction2(QuickVoiceChatAction);
registerAction2(InlineVoiceChatAction);

registerAction2(StopListeningAction);
registerAction2(StopListeningAndSubmitAction);

registerAction2(ReadChatResponseAloud);
registerAction2(StopReadChatItemAloud);
registerAction2(StopReadAloud);

registerChatDeveloperActions();

registerWorkbenchContribution2(KeywordActivationContribution.ID, KeywordActivationContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(NativeBuiltinToolsContribution.ID, NativeBuiltinToolsContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatCommandLineSupportContribution.ID, ChatCommandLineSupportContribution, WorkbenchPhase.AfterRestored);
