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
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { registerWorkbenchContribution2 } from '../../../../common/contributions.js';
import { IChatWidgetService } from '../../../chat/browser/chat.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { ILanguageModelToolsService } from '../../../chat/common/tools/languageModelToolsService.js';
import { registerActiveInstanceAction, sharedWhenClause } from '../../../terminal/browser/terminalActions.js';
import { TerminalContextKeys } from '../../../terminal/common/terminalContextKey.js';
import { GetTerminalLastCommandTool, GetTerminalLastCommandToolData } from './tools/getTerminalLastCommandTool.js';
import { KillTerminalTool, KillTerminalToolData } from './tools/killTerminalTool.js';
import { GetTerminalOutputTool, GetTerminalOutputToolData } from './tools/getTerminalOutputTool.js';
import { SendToTerminalTool, SendToTerminalToolData } from './tools/sendToTerminalTool.js';
import { GetTerminalSelectionTool, GetTerminalSelectionToolData } from './tools/getTerminalSelectionTool.js';
import { ConfirmTerminalCommandTool, ConfirmTerminalCommandToolData } from './tools/runInTerminalConfirmationTool.js';
import { RunInTerminalTool, createRunInTerminalToolData } from './tools/runInTerminalTool.js';
import { CreateAndRunTaskTool, CreateAndRunTaskToolData } from './tools/task/createAndRunTaskTool.js';
import { GetTaskOutputTool, GetTaskOutputToolData } from './tools/task/getTaskOutputTool.js';
import { RunTaskTool, RunTaskToolData } from './tools/task/runTaskTool.js';
import { registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { ITerminalSandboxService, TerminalSandboxService } from '../common/terminalSandboxService.js';
import { isNumber } from '../../../../../base/common/types.js';
// #region Services
registerSingleton(ITerminalSandboxService, TerminalSandboxService, 1 /* InstantiationType.Delayed */);
// #endregion Services
let ShellIntegrationTimeoutMigrationContribution = class ShellIntegrationTimeoutMigrationContribution extends Disposable {
    static { this.ID = 'terminal.shellIntegrationTimeoutMigration'; }
    constructor(configurationService) {
        super();
        const deprecated = configurationService.inspect("chat.tools.terminal.shellIntegrationTimeout" /* TerminalChatAgentToolsSettingId.ShellIntegrationTimeout */);
        const target = configurationService.inspect("terminal.integrated.shellIntegration.timeout" /* TerminalSettingId.ShellIntegrationTimeout */);
        if (deprecated.userValue !== undefined && target.userValue === undefined && isNumber(deprecated.userValue)) {
            configurationService.updateValue("terminal.integrated.shellIntegration.timeout" /* TerminalSettingId.ShellIntegrationTimeout */, deprecated.userValue, 2 /* ConfigurationTarget.USER */);
        }
        if (deprecated.workspaceValue !== undefined && target.workspaceValue === undefined && isNumber(deprecated.workspaceValue)) {
            configurationService.updateValue("terminal.integrated.shellIntegration.timeout" /* TerminalSettingId.ShellIntegrationTimeout */, deprecated.workspaceValue, 5 /* ConfigurationTarget.WORKSPACE */);
        }
    }
};
ShellIntegrationTimeoutMigrationContribution = __decorate([
    __param(0, IConfigurationService)
], ShellIntegrationTimeoutMigrationContribution);
registerWorkbenchContribution2(ShellIntegrationTimeoutMigrationContribution.ID, ShellIntegrationTimeoutMigrationContribution, 4 /* WorkbenchPhase.Eventually */);
let OutputLocationMigrationContribution = class OutputLocationMigrationContribution extends Disposable {
    static { this.ID = 'terminal.outputLocationMigration'; }
    constructor(configurationService) {
        super();
        // Migrate legacy 'none' value to 'chat'
        const currentValue = configurationService.getValue("chat.tools.terminal.outputLocation" /* TerminalChatAgentToolsSettingId.OutputLocation */);
        if (currentValue === 'none') {
            configurationService.updateValue("chat.tools.terminal.outputLocation" /* TerminalChatAgentToolsSettingId.OutputLocation */, 'chat');
        }
    }
};
OutputLocationMigrationContribution = __decorate([
    __param(0, IConfigurationService)
], OutputLocationMigrationContribution);
registerWorkbenchContribution2(OutputLocationMigrationContribution.ID, OutputLocationMigrationContribution, 4 /* WorkbenchPhase.Eventually */);
let ChatAgentToolsContribution = class ChatAgentToolsContribution extends Disposable {
    static { this.ID = 'terminal.chatAgentTools'; }
    constructor(_instantiationService, _toolsService, _configurationService) {
        super();
        this._instantiationService = _instantiationService;
        this._toolsService = _toolsService;
        this._configurationService = _configurationService;
        this._runInTerminalToolRegistration = this._register(new MutableDisposable());
        this._runInTerminalToolRegistrationVersion = 0;
        // #region Terminal
        const confirmTerminalCommandTool = _instantiationService.createInstance(ConfirmTerminalCommandTool);
        this._register(_toolsService.registerTool(ConfirmTerminalCommandToolData, confirmTerminalCommandTool));
        const getTerminalOutputTool = _instantiationService.createInstance(GetTerminalOutputTool);
        this._register(_toolsService.registerTool(GetTerminalOutputToolData, getTerminalOutputTool));
        this._register(_toolsService.executeToolSet.addTool(GetTerminalOutputToolData));
        const killTerminalTool = _instantiationService.createInstance(KillTerminalTool);
        this._register(_toolsService.registerTool(KillTerminalToolData, killTerminalTool));
        this._register(_toolsService.executeToolSet.addTool(KillTerminalToolData));
        const sendToTerminalTool = _instantiationService.createInstance(SendToTerminalTool);
        this._register(_toolsService.registerTool(SendToTerminalToolData, sendToTerminalTool));
        this._register(_toolsService.executeToolSet.addTool(SendToTerminalToolData));
        this._registerRunInTerminalTool();
        const getTerminalSelectionTool = _instantiationService.createInstance(GetTerminalSelectionTool);
        this._register(_toolsService.registerTool(GetTerminalSelectionToolData, getTerminalSelectionTool));
        const getTerminalLastCommandTool = _instantiationService.createInstance(GetTerminalLastCommandTool);
        this._register(_toolsService.registerTool(GetTerminalLastCommandToolData, getTerminalLastCommandTool));
        this._register(_toolsService.readToolSet.addTool(GetTerminalSelectionToolData));
        this._register(_toolsService.readToolSet.addTool(GetTerminalLastCommandToolData));
        // #endregion
        // #region Tasks
        const runTaskTool = _instantiationService.createInstance(RunTaskTool);
        this._register(_toolsService.registerTool(RunTaskToolData, runTaskTool));
        const getTaskOutputTool = _instantiationService.createInstance(GetTaskOutputTool);
        this._register(_toolsService.registerTool(GetTaskOutputToolData, getTaskOutputTool));
        const createAndRunTaskTool = _instantiationService.createInstance(CreateAndRunTaskTool);
        this._register(_toolsService.registerTool(CreateAndRunTaskToolData, createAndRunTaskTool));
        this._register(_toolsService.executeToolSet.addTool(RunTaskToolData));
        this._register(_toolsService.executeToolSet.addTool(CreateAndRunTaskToolData));
        this._register(_toolsService.readToolSet.addTool(GetTaskOutputToolData));
        // #endregion
        // Re-register run_in_terminal tool when sandbox-related settings change,
        // so the tool description and input schema stay in sync with the current
        // sandbox state.
        this._register(this._configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration("chat.agent.sandbox.enabled" /* TerminalChatAgentToolsSettingId.AgentSandboxEnabled */) ||
                e.affectsConfiguration("chat.agent.sandbox" /* TerminalChatAgentToolsSettingId.DeprecatedAgentSandboxEnabled */) ||
                e.affectsConfiguration("chat.agent.sandbox.allowedNetworkDomains" /* TerminalChatAgentToolsSettingId.AgentSandboxNetworkAllowedDomains */) ||
                e.affectsConfiguration("chat.agent.sandboxNetwork.allowedDomains" /* TerminalChatAgentToolsSettingId.DeprecatedAgentSandboxNetworkAllowedDomains */) ||
                e.affectsConfiguration("chat.agent.sandbox.deniedNetworkDomains" /* TerminalChatAgentToolsSettingId.AgentSandboxNetworkDeniedDomains */) ||
                e.affectsConfiguration("chat.agent.sandboxNetwork.deniedDomains" /* TerminalChatAgentToolsSettingId.DeprecatedAgentSandboxNetworkDeniedDomains */) ||
                e.affectsConfiguration("chat.agent.sandbox.fileSystem.linux" /* TerminalChatAgentToolsSettingId.AgentSandboxLinuxFileSystem */) ||
                e.affectsConfiguration("chat.agent.sandboxFileSystem.linux" /* TerminalChatAgentToolsSettingId.DeprecatedAgentSandboxLinuxFileSystem */) ||
                e.affectsConfiguration("chat.agent.sandbox.fileSystem.mac" /* TerminalChatAgentToolsSettingId.AgentSandboxMacFileSystem */) ||
                e.affectsConfiguration("chat.agent.sandboxFileSystem.mac" /* TerminalChatAgentToolsSettingId.DeprecatedAgentSandboxMacFileSystem */)) {
                this._registerRunInTerminalTool();
            }
        }));
    }
    _registerRunInTerminalTool() {
        const version = ++this._runInTerminalToolRegistrationVersion;
        this._instantiationService.invokeFunction(createRunInTerminalToolData).then(runInTerminalToolData => {
            if (this._store.isDisposed || version !== this._runInTerminalToolRegistrationVersion) {
                return;
            }
            if (!this._runInTerminalTool) {
                this._runInTerminalTool = this._register(this._instantiationService.createInstance(RunInTerminalTool));
            }
            // Dispose old registration first so registerToolData doesn't throw
            // "already registered" for the same tool ID.
            this._runInTerminalToolRegistration.value = undefined;
            const store = new DisposableStore();
            store.add(this._toolsService.registerToolData(runInTerminalToolData));
            store.add(this._toolsService.registerToolImplementation(runInTerminalToolData.id, this._runInTerminalTool));
            store.add(this._toolsService.executeToolSet.addTool(runInTerminalToolData));
            this._runInTerminalToolRegistration.value = store;
        });
    }
};
ChatAgentToolsContribution = __decorate([
    __param(0, IInstantiationService),
    __param(1, ILanguageModelToolsService),
    __param(2, IConfigurationService)
], ChatAgentToolsContribution);
export { ChatAgentToolsContribution };
registerWorkbenchContribution2(ChatAgentToolsContribution.ID, ChatAgentToolsContribution, 3 /* WorkbenchPhase.AfterRestored */);
// #endregion Contributions
// #region Actions
registerActiveInstanceAction({
    id: "workbench.action.terminal.chat.addTerminalSelection" /* TerminalChatAgentToolsCommandId.ChatAddTerminalSelection */,
    title: localize('addTerminalSelection', 'Add Terminal Selection to Chat'),
    precondition: ContextKeyExpr.and(ChatContextKeys.enabled, sharedWhenClause.terminalAvailable),
    menu: [
        {
            id: MenuId.TerminalInstanceContext,
            group: "0_chat" /* TerminalContextMenuGroup.Chat */,
            order: 1,
            when: ContextKeyExpr.and(ChatContextKeys.enabled, TerminalContextKeys.textSelected)
        },
    ],
    run: async (activeInstance, _c, accessor) => {
        const chatWidgetService = accessor.get(IChatWidgetService);
        const selection = activeInstance.selection;
        if (!selection) {
            return;
        }
        const chatView = chatWidgetService.lastFocusedWidget ?? await chatWidgetService.revealWidget();
        if (!chatView) {
            return;
        }
        chatView.attachmentModel.addContext({
            id: `terminal-selection-${Date.now()}`,
            kind: 'generic',
            name: localize('terminalSelection', 'Terminal Selection'),
            fullName: localize('terminalSelection', 'Terminal Selection'),
            value: selection,
            icon: Codicon.terminal
        });
        chatView.focusInput();
    }
});
// #endregion Actions
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWwuY2hhdEFnZW50VG9vbHMuY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL2NoYXRBZ2VudFRvb2xzL2Jyb3dzZXIvdGVybWluYWwuY2hhdEFnZW50VG9vbHMuY29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDM0UsT0FBTyxFQUF1QixxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQzNILE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUN6RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUV0RyxPQUFPLEVBQUUsOEJBQThCLEVBQStDLE1BQU0scUNBQXFDLENBQUM7QUFDbEksT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDbkUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ3JHLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBRTlHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBR3JGLE9BQU8sRUFB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