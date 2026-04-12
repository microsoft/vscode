/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Disposable } from '../../../../base/common/lifecycle.js';
import { AgentHostContribution } from '../browser/agentSessions/agentHost/agentHostChatContribution.js';
import { autorun } from '../../../../base/common/observable.js';
import { resolve } from '../../../../base/common/path.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { URI } from '../../../../base/common/uri.js';
import { ipcRenderer } from '../../../../base/parts/sandbox/electron-browser/globals.js';
import { localize } from '../../../../nls.js';
import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { INativeWorkbenchEnvironmentService } from '../../../services/environment/electron-browser/environmentService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { ACTION_ID_NEW_CHAT, CHAT_OPEN_ACTION_ID } from '../browser/actions/chatActions.js';
import { ChatViewId, ChatViewPaneTarget, IChatWidgetService } from '../browser/chat.js';
import { ChatEditorInput } from '../browser/widgetHosts/editor/chatEditorInput.js';
import { AgentSessionProviders } from '../browser/agentSessions/agentSessions.js';
import { isSessionInProgressStatus } from '../browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../browser/agentSessions/agentSessionsService.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { ChatContextKeys } from '../common/actions/chatContextKeys.js';
import { ChatModeKind } from '../common/constants.js';
import { IChatService } from '../common/chatService/chatService.js';
import { registerChatDeveloperActions } from './actions/chatDeveloperActions.js';
import { registerChatExportZipAction } from './actions/chatExportZip.js';
import { HoldToVoiceChatInChatViewAction, InlineVoiceChatAction, KeywordActivationContribution, QuickVoiceChatAction, ReadChatResponseAloud, StartVoiceChatAction, StopListeningAction, StopListeningAndSubmitAction, StopReadAloud, StopReadChatItemAloud, VoiceChatInChatViewAction } from './actions/voiceChatActions.js';
import { NativeBuiltinToolsContribution } from './builtInTools/tools.js';
import { OpenAgentsWindowAction } from './agentSessions/agentSessionsActions.js';
let ChatCommandLineHandler = class ChatCommandLineHandler extends Disposable {
    static { this.ID = 'workbench.contrib.chatCommandLineHandler'; }
    constructor(environmentService, commandService, workspaceTrustRequestService, logService, layoutService, contextKeyService, chatWidgetService) {
        super();
        this.environmentService = environmentService;
        this.commandService = commandService;
        this.workspaceTrustRequestService = workspaceTrustRequestService;
        this.logService = logService;
        this.layoutService = layoutService;
        this.contextKeyService = contextKeyService;
        this.chatWidgetService = chatWidgetService;
        this.registerListeners();
    }
    registerListeners() {
        ipcRenderer.on('vscode:handleChatRequest', (_, ...args) => {
            const chatArgs = args[0];
            this.logService.trace('vscode:handleChatRequest', chatArgs);
            this.prompt(chatArgs);
        });
        ipcRenderer.on('vscode:openChatSession', (_, ...args) => {
            const sessionUriString = args[0];
            this.logService.trace('vscode:openChatSession', sessionUriString);
            const sessionResource = URI.parse(sessionUriString);
            this.chatWidgetService.openSession(sessionResource, ChatViewPaneTarget);
        });
    }
    async prompt(args) {
        if (!Array.isArray(args?._)) {
            return;
        }
        const trusted = await this.workspaceTrustRequestService.requestWorkspaceTrust({
            message: localize('copilotWorkspaceTrust', "AI features are currently only supported in trusted workspaces.")
        });
        if (!trusted) {
            return;
        }
        const opts = {
            query: args._.length > 0 ? args._.join(' ') : '',
            mode: args.mode ?? ChatModeKind.Agent,
            attachFiles: args['add-file']?.map(file => URI.file(resolve(file))), // use `resolve` to deal with relative paths properly
        };
        if (args.maximize) {
            const location = this.contextKeyService.getContextKeyValue(ChatContextKeys.panelLocation.key);
            if (location === 2 /* ViewContainerLocation.AuxiliaryBar */) {
                this.layoutService.setAuxiliaryBarMaximized(true);
            }
            else if (location === 1 /* ViewContainerLocation.Panel */ && !this.layoutService.isPanelMaximized()) {
                this.layoutService.toggleMaximizedPanel();
            }
        }
        await this.commandService.executeCommand(ACTION_ID_NEW_CHAT);
        await this.commandService.executeCommand(CHAT_OPEN_ACTION_ID, opts);
    }
};
ChatCommandLineHandler = __decorate([
    __param(0, INativeWorkbenchEnvironmentService),
    __param(1, ICommandService),
    __param(2, IWorkspaceTrustRequestService),
    __param(3, ILogService),
    __param(4, IWorkbenchLayoutService),
    __param(5, IContextKeyService),
    __param(6, IChatWidgetService)
], ChatCommandLineHandler);
let ChatSuspendThrottlingHandler = class ChatSuspendThrottlingHandler extends Disposable {
    static { this.ID = 'workbench.contrib.chatSuspendThrottlingHandler'; }
    constructor(nativeHostService, chatService) {
        super();
        this._register(autorun(reader => {
            const running = chatService.requestInProgressObs.read(reader);
            // When a chat request is in progress, we must ensure that background
            // throttling is not applied so that the chat session can continue
            // even when the window is not in focus.
            nativeHostService.setBackgroundThrottling(!running);
        }));
    }
};
ChatSuspendThrottlingHandler = __decorate([
    __param(0, INativeHostService),
    __param(1, IChatService)
], ChatSuspendThrottlingHandler);
let ChatLifecycleHandler = class ChatLifecycleHandler extends Disposable {
    static { this.ID = 'workbench.contrib.chatLifecycleHandler'; }
    constructor(lifecycleService, agentSessionsService, dialogService, widgetService, contextKeyService, extensionService, environmentService, chatEntitlementService) {
        super();
        this.agentSessionsService = agentSessionsService;
        this.dialogService = dialogService;
        this.widgetService = widgetService;
        this.contextKeyService = contextKeyService;
        this.environmentService = environmentService;
        this.chatEntitlementService = chatEntitlementService;
        this._register(lifecycleService.onBeforeShutdown(e => {
            e.veto(this.shouldVetoShutdown(e.reason), 'veto.chat');
        }));
        this._register(extensionService.onWillStop(e => {
            e.veto(this.hasNonCloudSessionInProgress(), localize('chatRequestInProgress', "A session is in progress."));
        }));
    }
    hasNonCloudSessionInProgress() {
        if (this.chatEntitlementService.sentiment.hidden) {
            return false; // AI features are disabled
        }
        return this.agentSessionsService.model.sessions.some(session => isSessionInProgressStatus(session.status) &&
            session.providerType !== AgentSessionProviders.Cloud &&
            !session.isArchived());
    }
    shouldVetoShutdown(reason) {
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
    async doShouldVetoShutdown(reason) {
        this.widgetService.revealWidget();
        let message;
        let detail;
        switch (reason) {
            case 1 /* ShutdownReason.CLOSE */:
                message = localize('closeTheWindow.message', "A session is in progress. Are you sure you want to close the window?");
                detail = localize('closeTheWindow.detail', "The session will stop if you close the window.");
                break;
            case 4 /* ShutdownReason.LOAD */:
                message = localize('changeWorkspace.message', "A session is in progress. Are you sure you want to change the workspace?");
                detail = localize('changeWorkspace.detail', "The session will stop if you change the workspace.");
                break;
            case 3 /* ShutdownReason.RELOAD */:
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
};
ChatLifecycleHandler = __decorate([
    __param(0, ILifecycleService),
    __param(1, IAgentSessionsService),
    __param(2, IDialogService),
    __param(3, IChatWidgetService),
    __param(4, IContextKeyService),
    __param(5, IExtensionService),
    __param(6, INativeWorkbenchEnvironmentService),
    __param(7, IChatEntitlementService)
], ChatLifecycleHandler);
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
registerWorkbenchContribution2(KeywordActivationContribution.ID, KeywordActivationContribution, 3 /* WorkbenchPhase.AfterRestored */);
registerWorkbenchContribution2(NativeBuiltinToolsContribution.ID, NativeBuiltinToolsContribution, 3 /* WorkbenchPhase.AfterRestored */);
registerWorkbenchContribution2(ChatCommandLineHandler.ID, ChatCommandLineHandler, 2 /* WorkbenchPhase.BlockRestore */);
registerWorkbenchContribution2(ChatSuspendThrottlingHandler.ID, ChatSuspendThrottlingHandler, 3 /* WorkbenchPhase.AfterRestored */);
registerWorkbenchContribution2(ChatLifecycleHandler.ID, ChatLifecycleHandler, 3 /* WorkbenchPhase.AfterRestored */);
registerWorkbenchContribution2(AgentHostContribution.ID, AgentHostContribution, 3 /* WorkbenchPhase.AfterRestored */);
// Register command for opening a new Agent Host session from the session type picker
CommandsRegistry.registerCommand(`workbench.action.chat.openNewChatSessionInPlace.${AgentSessionProviders.AgentHostCopilot}`, async (accessor, chatSessionPosition) => {
    const viewsService = accessor.get(IViewsService);
    const resource = URI.from({
        scheme: AgentSessionProviders.AgentHostCopilot,
        path: `/untitled-${generateUuid()}`,
    });
    if (chatSessionPosition === 'editor') {
        const editorService = accessor.get(IEditorService);
        await editorService.openEditor({
            resource,
            options: {
                override: ChatEditorInput.EditorID,
                pinned: true,
            },
        });
    }
    else {
        const view = await viewsService.openView(ChatViewId);
        await view.loadSession(resource);
        view.focus();
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdC5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2VsZWN0cm9uLWJyb3dzZXIvY2hhdC5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBQ3hHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDMUQsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDakYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLGVBQWUsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNoRixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDckUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDbEYsT0FBTyxFQUFF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