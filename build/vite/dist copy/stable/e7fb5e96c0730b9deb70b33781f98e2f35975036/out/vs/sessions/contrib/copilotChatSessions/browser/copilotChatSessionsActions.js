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
import { coalesce } from '../../../../base/common/arrays.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../base/common/observable.js';
import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2, MenuId, MenuRegistry, isIMenuItem } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { BaseActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { registerWorkbenchContribution2 } from '../../../../workbench/common/contributions.js';
import { ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { EnhancedModelPickerActionItem } from '../../../../workbench/contrib/chat/browser/widget/input/modelPickerActionItem2.js';
import { IContextKeyService, ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { Menus } from '../../../browser/menus.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { ISessionsProvidersService } from '../../sessions/browser/sessionsProvidersService.js';
import { SessionItemContextMenuId } from '../../sessions/browser/views/sessionsList.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { COPILOT_PROVIDER_ID } from './copilotChatSessionsProvider.js';
import { COPILOT_CLI_SESSION_TYPE, COPILOT_CLOUD_SESSION_TYPE } from '../../sessions/browser/sessionTypes.js';
import { ActiveSessionHasGitRepositoryContext, ActiveSessionProviderIdContext, ActiveSessionTypeContext, ChatSessionProviderIdContext, IsNewChatSessionContext } from '../../../common/contextkeys.js';
import { IsolationPicker } from './isolationPicker.js';
import { BranchPicker } from './branchPicker.js';
import { ModePicker } from './modePicker.js';
import { CloudModelPicker } from './modelPicker.js';
import { NewChatPermissionPicker } from '../../chat/browser/newChatPermissionPicker.js';
const IsActiveSessionCopilotCLI = ContextKeyExpr.equals(ActiveSessionTypeContext.key, COPILOT_CLI_SESSION_TYPE);
const IsActiveSessionCopilotCloud = ContextKeyExpr.equals(ActiveSessionTypeContext.key, COPILOT_CLOUD_SESSION_TYPE);
const IsActiveCopilotChatSessionProvider = ContextKeyExpr.equals(ActiveSessionProviderIdContext.key, COPILOT_PROVIDER_ID);
const IsActiveSessionCopilotChatCLI = ContextKeyExpr.and(IsActiveSessionCopilotCLI, IsActiveCopilotChatSessionProvider);
const IsActiveSessionCopilotChatCloud = ContextKeyExpr.and(IsActiveSessionCopilotCloud, IsActiveCopilotChatSessionProvider);
const IsActiveSessionRemoteAgentHost = ContextKeyExpr.regex(ActiveSessionProviderIdContext.key, /^agenthost-/);
// -- Actions --
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'sessions.defaultCopilot.isolationPicker',
            title: localize2('isolationPicker', "Isolation Mode"),
            f1: false,
            menu: [{
                    id: Menus.NewSessionRepositoryConfig,
                    group: 'navigation',
                    order: 1,
                    when: ContextKeyExpr.and(IsNewChatSessionContext, IsActiveSessionCopilotChatCLI, ContextKeyExpr.equals('config.github.copilot.chat.cli.isolationOption.enabled', true)),
                }],
        });
    }
    async run() { }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'sessions.defaultCopilot.branchPicker',
            title: localize2('branchPicker', "Branch"),
            f1: false,
            precondition: ActiveSessionHasGitRepositoryContext,
            menu: [{
                    id: Menus.NewSessionRepositoryConfig,
                    group: 'navigation',
                    order: 2,
                    when: ContextKeyExpr.and(IsNewChatSessionContext, IsActiveSessionCopilotChatCLI),
                }],
        });
    }
    async run() { }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'sessions.defaultCopilot.modePicker',
            title: localize2('modePicker', "Mode"),
            f1: false,
            menu: [{
                    id: Menus.NewSessionConfig,
                    group: 'navigation',
                    order: 0,
                    when: IsActiveSessionCopilotChatCLI,
                }],
        });
    }
    async run() { }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'sessions.defaultCopilot.localModelPicker',
            title: localize2('localModelPicker', "Model"),
            f1: false,
            menu: [{
                    id: Menus.NewSessionConfig,
                    group: 'navigation',
                    order: 1,
                    when: ContextKeyExpr.or(IsActiveSessionCopilotChatCLI, IsActiveSessionRemoteAgentHost),
                }],
        });
    }
    async run() { }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'sessions.defaultCopilot.cloudModelPicker',
            title: localize2('cloudModelPicker', "Model"),
            f1: false,
            menu: [{
                    id: Menus.NewSessionConfig,
                    group: 'navigation',
                    order: 1,
                    when: IsActiveSessionCopilotChatCloud,
                }],
        });
    }
    async run() { }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'sessions.defaultCopilot.permissionPicker',
            title: localize2('permissionPicker', "Permissions"),
            f1: false,
            menu: [{
                    id: Menus.NewSessionControl,
                    group: 'navigation',
                    order: 1,
                    when: IsActiveSessionCopilotChatCLI,
                }],
        });
    }
    async run() { }
});
// -- Helper --
/**
 * Wraps a standalone picker widget as a {@link BaseActionViewItem}
 * so it can be rendered by a {@link MenuWorkbenchToolBar}.
 */
class PickerActionViewItem extends BaseActionViewItem {
    constructor(picker) {
        super(undefined, { id: '', label: '', enabled: true, class: undefined, tooltip: '', run: () => { } });
        this.picker = picker;
    }
    render(container) {
        this.picker.render(container);
    }
    dispose() {
        this.picker.dispose();
        super.dispose();
    }
}
// -- Action View Item Registrations --
let CopilotPickerActionViewItemContribution = class CopilotPickerActionViewItemContribution extends Disposable {
    static { this.ID = 'workbench.contrib.copilotPickerActionViewItems'; }
    constructor(actionViewItemService, instantiationService, languageModelsService, sessionsManagementService, sessionsProvidersService, storageService) {
        super();
        this._register(actionViewItemService.register(Menus.NewSessionRepositoryConfig, 'sessions.defaultCopilot.isolationPicker', () => {
            const picker = instantiationService.createInstance(IsolationPicker);
            return new PickerActionViewItem(picker);
        }));
        this._register(actionViewItemService.register(Menus.NewSessionRepositoryConfig, 'sessions.defaultCopilot.branchPicker', () => {
            const picker = instantiationService.createInstance(BranchPicker);
            return new PickerActionViewItem(picker);
        }));
        this._register(actionViewItemService.register(Menus.NewSessionConfig, 'sessions.defaultCopilot.modePicker', () => {
            const picker = instantiationService.createInstance(ModePicker);
            return new PickerActionViewItem(picker);
        }));
        this._register(actionViewItemService.register(Menus.NewSessionConfig, 'sessions.defaultCopilot.localModelPicker', () => {
            const currentModel = observableValue('currentModel', undefined);
            const delegate = {
                currentModel,
                setModel: (model) => {
                    currentModel.set(model, undefined);
                    storageService.store('sessions.localModelPicker.selectedModelId', model.identifier, 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
                    const session = sessionsManagementService.activeSession.get();
                    if (session) {
                        const provider = sessionsProvidersService.getProviders().find(p => p.id === session.providerId);
                        provider?.setModel(session.sessionId, model.identifier);
                    }
                },
                getModels: () => getAvailableModels(languageModelsService, sessionsManagementService),
                useGroupedModelPicker: () => true,
                showManageModelsAction: () => false,
                showUnavailableFeatured: () => false,
                showFeatured: () => true,
            };
            const pickerOptions = {
                hideChevrons: observableValue('hideChevrons', false),
                hoverPosition: { hoverPosition: 3 /* HoverPosition.ABOVE */ },
            };
            const action = { id: 'sessions.modelPicker', label: '', enabled: true, class: undefined, tooltip: '', run: () => { } };
            const modelPicker = instantiationService.createInstance(EnhancedModelPickerActionItem, action, delegate, pickerOptions);
            // Initialize with remembered model or first available model
            const rememberedModelId = storageService.get('sessions.localModelPicker.selectedModelId', 0 /* StorageScope.PROFILE */);
            const initModel = () => {
                const models = getAvailableModels(languageModelsService, sessionsManagementService);
                modelPicker.setEnabled(models.length > 0);
                if (!currentModel.get() && models.length > 0) {
                    const remembered = rememberedModelId ? models.find(m => m.identifier === rememberedModelId) : undefined;
                    delegate.setModel(remembered ?? models[0]);
                }
            };
            initModel();
            this._register(languageModelsService.onDidChangeLanguageModels(() => initModel()));
            return modelPicker;
        }));
        this._register(actionViewItemService.register(Menus.NewSessionConfig, 'sessions.defaultCopilot.cloudModelPicker', () => {
            const picker = instantiationService.createInstance(CloudModelPicker);
            return new PickerActionViewItem(picker);
        }));
        this._register(actionViewItemService.register(Menus.NewSessionControl, 'sessions.defaultCopilot.permissionPicker', () => {
            const picker = instantiationService.createInstance(NewChatPermissionPicker);
            return new PickerActionViewItem(picker);
        }));
    }
};
CopilotPickerActionViewItemContribution = __decorate([
    __param(0, IActionViewItemService),
    __param(1, IInstantiationService),
    __param(2, ILanguageModelsService),
    __param(3, ISessionsManagementService),
    __param(4, ISessionsProvidersService),
    __param(5, IStorageService)
], CopilotPickerActionViewItemContribution);
function getAvailableModels(languageModelsService, sessionsManagementService) {
    const session = sessionsManagementService.activeSession.get();
    if (!session) {
        return [];
    }
    return languageModelsService.getLanguageModelIds()
        .map(id => {
        const metadata = languageModelsService.lookupLanguageModel(id);
        return metadata ? { metadata, identifier: id } : undefined;
    })
        .filter((m) => !!m && m.metadata.targetChatSessionType === session.sessionType);
}
// -- Context Key Contribution --
let CopilotActiveSessionContribution = class CopilotActiveSessionContribution extends Disposable {
    static { this.ID = 'workbench.contrib.copilotActiveSession'; }
    constructor(sessionsManagementService, sessionsProvidersService, contextKeyService) {
        super();
        const hasRepositoryKey = ActiveSessionHasGitRepositoryContext.bindTo(contextKeyService);
        this._register(autorun((reader) => {
            const session = sessionsManagementService.activeSession.read(reader);
            const providerSession = session ? sessionsProvidersService.getProvider(session.providerId)?.getSession(session.sessionId) : undefined;
            const isLoading = providerSession?.loading.read(reader);
            hasRepositoryKey.set(!isLoading && !!providerSession?.gitRepository);
        }));
    }
};
CopilotActiveSessionContribution = __decorate([
    __param(0, ISessionsManagementService),
    __param(1, ISessionsProvidersService),
    __param(2, IContextKeyService)
], CopilotActiveSessionContribution);
registerWorkbenchContribution2(CopilotPickerActionViewItemContribution.ID, CopilotPickerActionViewItemContribution, 3 /* WorkbenchPhase.AfterRestored */);
registerWorkbenchContribution2(CopilotActiveSessionContribution.ID, CopilotActiveSessionContribution, 3 /* WorkbenchPhase.AfterRestored */);
/**
 * Bridges extension-contributed context menu actions from {@link MenuId.AgentSessionsContext}
 * to {@link SessionItemContextMenuId} for the new sessions view.
 * Registers wrapper commands that resolve {@link ISession} → {@link IAgentSession}
 * and forward to the original command with marshalled context.
 */
let CopilotSessionContextMenuBridge = class CopilotSessionContextMenuBridge extends Disposable {
    static { this.ID = 'copilotChatSessions.contextMenuBridge'; }
    constructor(agentSessionsService, commandService) {
        super();
        this.agentSessionsService = agentSessionsService;
        this.commandService = commandService;
        this._bridgedIds = new Set();
        this._bridgeItems();
        this._register(MenuRegistry.onDidChangeMenu(menuIds => {
            if (menuIds.has(MenuId.AgentSessionsContext)) {
                this._bridgeItems();
            }
        }));
    }
    _bridgeItems() {
        const items = MenuRegistry.getMenuItems(MenuId.AgentSessionsContext).filter(isIMenuItem);
        for (const item of items) {
            const commandId = item.command.id;
            if (!commandId.startsWith('github.copilot.')) {
                continue;
            }
            if (this._bridgedIds.has(commandId)) {
                continue;
            }
            this._bridgedIds.add(commandId);
            const wrapperId = `sessionsViewPane.bridge.${commandId}`;
            this._register(CommandsRegistry.registerCommand(wrapperId, (accessor, context) => {
                if (!context) {
                    return;
                }
                const sessions = Array.isArray(context) ? context : [context];
                const agentSessions = coalesce(sessions.map(s => this.agentSessionsService.getSession(s.resource)));
                if (agentSessions.length === 0) {
                    return;
                }
                return this.commandService.executeCommand(commandId, {
                    session: agentSessions[0],
                    sessions: agentSessions,
                    $mid: 25 /* MarshalledId.AgentSessionContext */,
                });
            }));
            const providerWhen = ContextKeyExpr.equals(ChatSessionProviderIdContext.key, COPILOT_PROVIDER_ID);
            this._register(MenuRegistry.appendMenuItem(SessionItemContextMenuId, {
                command: { ...item.command, id: wrapperId },
                group: item.group,
                order: item.order,
                when: item.when ? ContextKeyExpr.and(providerWhen, item.when) : providerWhen,
            }));
        }
    }
};
CopilotSessionContextMenuBridge = __decorate([
    __param(0, IAgentSessionsService),
    __param(1, ICommandService)
], CopilotSessionContextMenuBridge);
registerWorkbenchContribution2(CopilotSessionContextMenuBridge.ID, CopilotSessionContextMenuBridge, 3 /* WorkbenchPhase.AfterRestored */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29waWxvdENoYXRTZXNzaW9uc0FjdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9jb250cmliL2NvcGlsb3RDaGF0U2Vzc2lvbnMvYnJvd3Nlci9jb3BpbG90Q2hhdFNlc3Npb25zQWN0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBVyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDMUYsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQy9DLE9BQU8sRUFBRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sRUFBRSxZQUFZLEVBQUUsV0FBVyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDN0gsT0FBTyxFQUFFLGdCQUFnQixFQUFFLGVBQWUsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBRXJHLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzlGLE9BQU8sRUFBMEIsOEJBQThCLEVBQWtCLE1BQU0sK0NBQStDLENBQUM7QUFDdkksT0FBTyxFQUEyQyxzQkFBc0IsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBRzlJLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLG1GQUFtRixDQUFDO0FBRWxJLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxjQUFjLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMxRyxP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