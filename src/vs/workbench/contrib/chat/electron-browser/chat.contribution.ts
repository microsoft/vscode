/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { timeout } from '../../../../base/common/async.js';
import { autorun } from '../../../../base/common/observable.js';
import { resolve } from '../../../../base/common/path.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { ipcRenderer } from '../../../../base/parts/sandbox/electron-browser/globals.js';
import { localize } from '../../../../nls.js';
import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ILocalGitService } from '../../../../platform/git/common/localGitService.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSharedProcessRemoteService } from '../../../../platform/ipc/electron-browser/services.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { ViewContainerLocation } from '../../../common/views.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { INativeWorkbenchEnvironmentService } from '../../../services/environment/electron-browser/environmentService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { ILifecycleService, ShutdownReason } from '../../../services/lifecycle/common/lifecycle.js';
import { ACTION_ID_NEW_CHAT, CHAT_OPEN_ACTION_ID, IChatViewOpenOptions } from '../browser/actions/chatActions.js';
import { AgentHostContribution } from '../browser/agentSessions/agentHost/agentHostChatContribution.js';
import { AgentHostTerminalContribution } from '../browser/agentSessions/agentHost/agentHostTerminalContribution.js';
import { AgentSessionProviders, getAgentSessionProviderName } from '../browser/agentSessions/agentSessions.js';
import { isSessionInProgressStatus } from '../browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../browser/agentSessions/agentSessionsService.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../browser/chat.js';
import { ChatSessionPosition, openChatSession } from '../browser/chatSessions/chatSessions.contribution.js';
import { IAgentHostService } from '../../../../platform/agentHost/common/agentService.js';
import { type AgentInfo, type RootState } from '../../../../platform/agentHost/common/state/sessionState.js';
import { ChatContextKeys } from '../common/actions/chatContextKeys.js';
import { IChatService } from '../common/chatService/chatService.js';
import { ChatModeKind } from '../common/constants.js';
import { IPluginGitService } from '../common/plugins/pluginGitService.js';
import { registerChatDeveloperActions } from './actions/chatDeveloperActions.js';
import { registerChatExportZipAction } from './actions/chatExportZip.js';
import { HoldToVoiceChatInChatViewAction, InlineVoiceChatAction, KeywordActivationContribution, QuickVoiceChatAction, ReadChatResponseAloud, StartVoiceChatAction, StopListeningAction, StopListeningAndSubmitAction, StopReadAloud, StopReadChatItemAloud, VoiceChatInChatViewAction } from './actions/voiceChatActions.js';
import { OpenWorkspaceInAgentsWindowAction, OpenWorkspaceInAgentsContribution, OpenAgentsWindowAction } from './agentSessions/agentSessionsActions.js';
import { NativeBuiltinToolsContribution } from './builtInTools/tools.js';
import { NativePluginGitCommandService } from './pluginGitCommandService.js';

// Override the browser PluginGitCommandService with the native one that always
// runs git locally via the shared process. See the decision matrix on the
// `IPluginGitService` interface for the full per-flavor wiring.
registerSingleton(IPluginGitService, NativePluginGitCommandService, InstantiationType.Delayed);
registerSharedProcessRemoteService(ILocalGitService, 'localGit');

class ChatCommandLineHandler extends Disposable {

	static readonly ID = 'workbench.contrib.chatCommandLineHandler';

	constructor(
		@INativeWorkbenchEnvironmentService private readonly environmentService: INativeWorkbenchEnvironmentService,
		@ICommandService private readonly commandService: ICommandService,
		@IWorkspaceTrustRequestService private readonly workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@ILogService private readonly logService: ILogService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners() {
		ipcRenderer.on('vscode:handleChatRequest', (_, ...args: unknown[]) => {
			const chatArgs = args[0] as typeof this.environmentService.args.chat;
			this.logService.trace('vscode:handleChatRequest', chatArgs);

			this.prompt(chatArgs);
		});

		ipcRenderer.on('vscode:openChatSession', (_, ...args: unknown[]) => {
			const sessionUriString = args[0] as string;
			this.logService.trace('vscode:openChatSession', sessionUriString);

			const sessionResource = URI.parse(sessionUriString);
			this.chatWidgetService.openSession(sessionResource, ChatViewPaneTarget);
		});
	}

	private async prompt(args: typeof this.environmentService.args.chat): Promise<void> {
		if (!Array.isArray(args?._)) {
			return;
		}

		const trusted = await this.workspaceTrustRequestService.requestWorkspaceTrust({
			message: localize('copilotWorkspaceTrust', "AI features are currently only supported in trusted workspaces.")
		});

		if (!trusted) {
			return;
		}

		const opts: IChatViewOpenOptions = {
			query: args._.length > 0 ? args._.join(' ') : '',
			mode: args.mode ?? ChatModeKind.Agent,
			attachFiles: args['add-file']?.map(file => URI.file(resolve(file))), // use `resolve` to deal with relative paths properly
		};

		if (args.maximize) {
			const location = this.contextKeyService.getContextKeyValue<ViewContainerLocation>(ChatContextKeys.panelLocation.key);
			if (location === ViewContainerLocation.AuxiliaryBar) {
				this.layoutService.setAuxiliaryBarMaximized(true);
			} else if (location === ViewContainerLocation.Panel && !this.layoutService.isPanelMaximized()) {
				this.layoutService.toggleMaximizedPanel();
			}
		}

		await this.commandService.executeCommand(ACTION_ID_NEW_CHAT);
		await this.commandService.executeCommand(CHAT_OPEN_ACTION_ID, opts);
	}
}

class ChatSuspendThrottlingHandler extends Disposable {

	static readonly ID = 'workbench.contrib.chatSuspendThrottlingHandler';

	constructor(
		@INativeHostService nativeHostService: INativeHostService,
		@IChatService chatService: IChatService,
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
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IDialogService private readonly dialogService: IDialogService,
		@IChatWidgetService private readonly widgetService: IChatWidgetService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IExtensionService extensionService: IExtensionService,
		@INativeWorkbenchEnvironmentService private readonly environmentService: INativeWorkbenchEnvironmentService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
	) {
		super();

		this._register(lifecycleService.onBeforeShutdown(e => {
			e.veto(this.shouldVetoShutdown(e.reason), 'veto.chat');
		}));

		this._register(extensionService.onWillStop(e => {
			e.veto(this.hasNonCloudSessionInProgress(), localize('chatRequestInProgress', "A session is in progress."));
		}));
	}

	private hasNonCloudSessionInProgress(): boolean {
		if (this.chatEntitlementService.sentiment.hidden) {
			return false; // AI features are disabled
		}

		return this.agentSessionsService.model.sessions.some(session =>
			isSessionInProgressStatus(session.status) &&
			session.providerType !== AgentSessionProviders.Cloud &&
			!session.isArchived()
		);
	}

	private shouldVetoShutdown(reason: ShutdownReason): boolean | Promise<boolean> {
		if (this.environmentService.enableSmokeTestDriver) {
			return false;
		}

		if (!this.hasNonCloudSessionInProgress()) {
			return false;
		}

		if (ChatContextKeys.skipChatRequestInProgressMessage.getValue(this.contextKeyService) === true) {
			return false;
		}

		return this.doShouldVetoShutdown(reason);
	}

	private async doShouldVetoShutdown(reason: ShutdownReason): Promise<boolean> {

		this.widgetService.revealWidget();

		let message: string;
		let detail: string;
		switch (reason) {
			case ShutdownReason.CLOSE:
				message = localize('closeTheWindow.message', "A session is in progress. Are you sure you want to close the window?");
				detail = localize('closeTheWindow.detail', "The session will stop if you close the window.");
				break;
			case ShutdownReason.LOAD:
				message = localize('changeWorkspace.message', "A session is in progress. Are you sure you want to change the workspace?");
				detail = localize('changeWorkspace.detail', "The session will stop if you change the workspace.");
				break;
			case ShutdownReason.RELOAD:
				message = localize('reloadTheWindow.message', "A session is in progress. Are you sure you want to reload the window?");
				detail = localize('reloadTheWindow.detail', "The session will stop if you reload the window.");
				break;
			default:
				message = isMacintosh ? localize('quit.message', "A session is in progress. Are you sure you want to quit?") : localize('exit.message', "A session is in progress. Are you sure you want to exit?");
				detail = isMacintosh ? localize('quit.detail', "The session will stop if you quit.") : localize('exit.detail', "The session will stop if you exit.");
				break;
		}

		const result = await this.dialogService.confirm({ message, detail });

		return !result.confirmed;
	}
}

registerAction2(OpenWorkspaceInAgentsWindowAction);
registerAction2(OpenAgentsWindowAction);
registerAction2(StartVoiceChatAction);

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
registerChatExportZipAction();

registerWorkbenchContribution2(KeywordActivationContribution.ID, KeywordActivationContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(NativeBuiltinToolsContribution.ID, NativeBuiltinToolsContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatCommandLineHandler.ID, ChatCommandLineHandler, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatSuspendThrottlingHandler.ID, ChatSuspendThrottlingHandler, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatLifecycleHandler.ID, ChatLifecycleHandler, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(AgentHostContribution.ID, AgentHostContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(AgentHostTerminalContribution.ID, AgentHostTerminalContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(OpenWorkspaceInAgentsContribution.ID, OpenWorkspaceInAgentsContribution, WorkbenchPhase.BlockRestore);

// How long to wait for the agent host to surface an AgentInfo before
// throwing an error. Long enough for normal startup, short enough to avoid
// hanging automation indefinitely if the agent host is disabled or fails
// to start.
const AGENT_HOST_REGISTRATION_TIMEOUT_MS = 30_000;

function getCopilotAgentInfo(rootState: RootState | Error | undefined): AgentInfo | undefined {
	if (!rootState || rootState instanceof Error) {
		return undefined;
	}
	return rootState.agents.find(a => a.provider === 'copilotcli');
}

/**
 * Resolve the actual session-content-provider scheme registered by the local
 * agent host. The agent host registers chat sessions under
 * `agent-host-${agent.provider}` (e.g. `agent-host-copilotcli`) only after it
 * surfaces an `AgentInfo` via `rootState`. This is asynchronous, so the static
 * `agent-host-copilot` umbrella commands need to wait for that registration
 * before opening a session — otherwise we'd build a URI with a scheme that has
 * no content provider and fall back to a fresh local chat session.
 */
async function resolveAgentHostSessionType(agentHostService: IAgentHostService): Promise<string> {
	const agent = getCopilotAgentInfo(agentHostService.rootState.value);
	if (agent) {
		return `agent-host-${agent.provider}`;
	}

	// Wait for the first non-empty root state, capped by a timeout.
	// The subscription must be disposed on both success and timeout to avoid leaks.
	const cts = new CancellationTokenSource();
	const waitForAgent = new Promise<AgentInfo | undefined>(res => {
		const sub = agentHostService.rootState.onDidChange(state => {
			const found = getCopilotAgentInfo(state);
			if (found) {
				sub.dispose();
				res(found);
			}
		});
		cts.token.onCancellationRequested(() => {
			sub.dispose();
			res(undefined);
		});
	});
	const resolved = await Promise.race([
		waitForAgent,
		timeout(AGENT_HOST_REGISTRATION_TIMEOUT_MS).then(() => {
			cts.cancel();
			cts.dispose();
			return undefined;
		}),
	]);
	if (!resolved) {
		throw new Error('Agent host did not register a copilotcli agent within the timeout period. Ensure the agent host is enabled and running.');
	}
	return `agent-host-${resolved.provider}`;
}

// Open a new Agent Host session at the given position. Shared by the session
// type picker command and the static sidebar/editor commands below.
// Delegates to `openChatSession` so the session type picker, context keys,
// and welcome flows all stay in sync with the dynamic per-agent path.
async function openNewAgentHostSession(accessor: ServicesAccessor, position: ChatSessionPosition): Promise<void> {
	// Snapshot the services we need synchronously — `accessor` is only valid
	// before the first `await`. Use the instantiation service to mint a fresh
	// accessor for the downstream `openChatSession` call.
	const agentHostService = accessor.get(IAgentHostService);
	const instantiationService = accessor.get(IInstantiationService);
	const sessionType = await resolveAgentHostSessionType(agentHostService);
	return instantiationService.invokeFunction(innerAccessor => openChatSession(innerAccessor, {
		type: sessionType,
		displayName: getAgentSessionProviderName(sessionType),
		position,
	}));
}

// Register command for opening a new Agent Host session from the session type picker
CommandsRegistry.registerCommand(
	`workbench.action.chat.openNewChatSessionInPlace.${AgentSessionProviders.AgentHostCopilot}`,
	(accessor, chatSessionPosition: string) =>
		openNewAgentHostSession(accessor, chatSessionPosition === 'editor' ? ChatSessionPosition.Editor : ChatSessionPosition.Sidebar)
);

// Static sidebar/editor open commands for the Agent Host umbrella scheme.
// The dynamic per-agent commands (e.g. `agent-host-copilot`) are only
// registered after the agent host starts and surfaces an AgentInfo, which
// is asynchronous. Provide stable command ids that automation (evals) can
// invoke before the dynamic registration has occurred.
CommandsRegistry.registerCommand(
	`workbench.action.chat.openNewSessionSidebar.${AgentSessionProviders.AgentHostCopilot}`,
	accessor => openNewAgentHostSession(accessor, ChatSessionPosition.Sidebar)
);
CommandsRegistry.registerCommand(
	`workbench.action.chat.openNewSessionEditor.${AgentSessionProviders.AgentHostCopilot}`,
	accessor => openNewAgentHostSession(accessor, ChatSessionPosition.Editor)
);
