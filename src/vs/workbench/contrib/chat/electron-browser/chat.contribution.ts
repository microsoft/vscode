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
import { ACTION_ID_NEW_CHAT, CHAT_OPEN_ACTION_ID, IChatViewOpenOptions } from '../browser/actions/chatActions.js';
import { ChatModeKind } from '../common/constants.js';
import { ipcRenderer } from '../../../../base/parts/sandbox/electron-browser/globals.js';
import { IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { URI } from '../../../../base/common/uri.js';
import { resolve } from '../../../../base/common/path.js';
import { showChatView } from '../browser/chat.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../common/chatContextKeys.js';
import { ViewContainerLocation } from '../../../common/views.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IChatService } from '../common/chatService.js';
import { autorun } from '../../../../base/common/observable.js';
import { ILifecycleService, ShutdownReason } from '../../../services/lifecycle/common/lifecycle.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { isMacintosh } from '../../../../base/common/platform.js';

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

class ChatCommandLineHandler extends Disposable {

	static readonly ID = 'workbench.contrib.chatCommandLineHandler';

	constructor(
		@INativeWorkbenchEnvironmentService private readonly environmentService: INativeWorkbenchEnvironmentService,
		@ICommandService private readonly commandService: ICommandService,
		@IWorkspaceTrustRequestService private readonly workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@IViewsService private readonly viewsService: IViewsService,
		@ILogService private readonly logService: ILogService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners() {
		ipcRenderer.on('vscode:handleChatRequest', (_, args: typeof this.environmentService.args.chat) => {
			this.logService.trace('vscode:handleChatRequest', args);

			this.prompt(args);
		});
	}

	private async prompt(args: typeof this.environmentService.args.chat): Promise<void> {
		if (!Array.isArray(args?._)) {
			return;
		}

		const trusted = await this.workspaceTrustRequestService.requestWorkspaceTrust({
			message: localize('copilotWorkspaceTrust', "Copilot is currently only supported in trusted workspaces.")
		});

		if (!trusted) {
			return;
		}

		const opts: IChatViewOpenOptions = {
			query: args._.length > 0 ? args._.join(' ') : '',
			mode: args.mode ?? ChatModeKind.Agent,
			attachFiles: args['add-file']?.map(file => URI.file(resolve(file))), // use `resolve` to deal with relative paths properly
		};

		const chatWidget = await showChatView(this.viewsService);

		if (args.maximize) {
			const location = this.contextKeyService.getContextKeyValue<ViewContainerLocation>(ChatContextKeys.panelLocation.key);
			if (location === ViewContainerLocation.AuxiliaryBar) {
				this.layoutService.setAuxiliaryBarMaximized(true);
			} else if (location === ViewContainerLocation.Panel && !this.layoutService.isPanelMaximized()) {
				this.layoutService.toggleMaximizedPanel();
			}
		}

		await chatWidget?.waitForReady();
		await this.commandService.executeCommand(ACTION_ID_NEW_CHAT);
		await this.commandService.executeCommand(CHAT_OPEN_ACTION_ID, opts);
	}
}

class ChatSuspendThrottlingHandler extends Disposable {

	static readonly ID = 'workbench.contrib.chatSuspendThrottlingHandler';

	constructor(
		@INativeHostService nativeHostService: INativeHostService,
		@IChatService chatService: IChatService
	) {
		super();

		this._register(autorun(reader => {
			const running = chatService.requestInProgressObs.read(reader);

			// When a chat request is in progress, we must ensure that background
			// throttling is not applied so that the chat session can continue
			// even when the window is not in focus.
			nativeHostService.setBackgroundThrottling(!running);
		}));
	}
}

class ChatLifecycleHandler extends Disposable {

	static readonly ID = 'workbench.contrib.chatLifecycleHandler';

	constructor(
		@ILifecycleService lifecycleService: ILifecycleService,
		@IChatService private readonly chatService: IChatService,
		@IDialogService private readonly dialogService: IDialogService,
		@IViewsService private readonly viewsService: IViewsService
	) {
		super();

		this._register(lifecycleService.onBeforeShutdown(e => {
			e.veto(this.shouldVetoShutdown(e.reason), 'veto.chat');
		}));
	}

	private shouldVetoShutdown(reason: ShutdownReason): boolean | Promise<boolean> {
		const running = this.chatService.requestInProgressObs.read(undefined);
		if (!running) {
			return false;
		}

		return this.doShouldVetoShutdown(reason);
	}

	private async doShouldVetoShutdown(reason: ShutdownReason): Promise<boolean> {

		showChatView(this.viewsService);

		let message: string;
		switch (reason) {
			case ShutdownReason.CLOSE:
				message = localize('closeTheWindow.message', "A chat request is in progress. Are you sure you want to close the window?");
				break;
			case ShutdownReason.LOAD:
				message = localize('changeWorkspace.message', "A chat request is in progress. Are you sure you want to change the workspace?");
				break;
			case ShutdownReason.RELOAD:
				message = localize('reloadTheWindow.message', "A chat request is in progress. Are you sure you want to reload the window?");
				break;
			default:
				message = isMacintosh ? localize('quit.message', "A chat request is in progress. Are you sure you want to quit?") : localize('exit.message', "A chat request is in progress. Are you sure you want to exit?");
				break;
		}

		const result = await this.dialogService.confirm({
			message,
			detail: localize('quit.detail', "The chat request will be cancelled if you continue.")
		});

		return !result.confirmed;
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
registerWorkbenchContribution2(ChatCommandLineHandler.ID, ChatCommandLineHandler, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatSuspendThrottlingHandler.ID, ChatSuspendThrottlingHandler, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatLifecycleHandler.ID, ChatLifecycleHandler, WorkbenchPhase.AfterRestored);
