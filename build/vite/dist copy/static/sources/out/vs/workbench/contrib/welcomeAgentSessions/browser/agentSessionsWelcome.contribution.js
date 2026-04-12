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
import { localize } from '../../../../nls.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { EditorPaneDescriptor } from '../../../browser/editor.js';
import { EditorExtensions } from '../../../common/editor.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { AuxiliaryBarMaximizedContext } from '../../../common/contextkeys.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { AgentSessionsWelcomeInput } from './agentSessionsWelcomeInput.js';
import { AgentSessionsWelcomePage, AgentSessionsWelcomeInputSerializer } from './agentSessionsWelcome.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
// Registration priority
const agentSessionsWelcomeInputTypeId = 'workbench.editors.agentSessionsWelcomeInput';
// Register editor serializer
Registry.as(EditorExtensions.EditorFactory)
    .registerEditorSerializer(agentSessionsWelcomeInputTypeId, AgentSessionsWelcomeInputSerializer);
// Register editor pane
Registry.as(EditorExtensions.EditorPane).registerEditorPane(EditorPaneDescriptor.create(AgentSessionsWelcomePage, AgentSessionsWelcomePage.ID, localize('agentSessionsWelcome', "Agent Sessions Welcome")), [
    new SyncDescriptor(AgentSessionsWelcomeInput)
]);
const getWorkspaceKind = (workspaceContextService) => {
    const state = workspaceContextService.getWorkbenchState();
    switch (state) {
        case 1 /* WorkbenchState.EMPTY */:
            return 'empty';
        case 2 /* WorkbenchState.FOLDER */:
            return 'folder';
        case 3 /* WorkbenchState.WORKSPACE */:
            return 'workspace';
        default:
            return 'empty';
    }
};
// Register resolver contribution
let AgentSessionsWelcomeEditorResolverContribution = class AgentSessionsWelcomeEditorResolverContribution extends Disposable {
    static { this.ID = 'workbench.contrib.agentSessionsWelcomeEditorResolver'; }
    constructor(editorResolverService, instantiationService, workspaceContextService) {
        super();
        this._register(editorResolverService.registerEditor(`${AgentSessionsWelcomeInput.RESOURCE.scheme}:${AgentSessionsWelcomeInput.RESOURCE.authority}/**`, {
            id: AgentSessionsWelcomePage.ID,
            label: localize('agentSessionsWelcome.displayName', "Agent Sessions Welcome"),
            priority: RegisteredEditorPriority.builtin,
        }, {
            singlePerResource: true,
            canSupportResource: resource => resource.scheme === AgentSessionsWelcomeInput.RESOURCE.scheme &&
                resource.authority === AgentSessionsWelcomeInput.RESOURCE.authority
        }, {
            createEditorInput: () => {
                return {
                    editor: instantiationService.createInstance(AgentSessionsWelcomeInput, { workspaceKind: getWorkspaceKind(workspaceContextService) }),
                };
            }
        }));
    }
};
AgentSessionsWelcomeEditorResolverContribution = __decorate([
    __param(0, IEditorResolverService),
    __param(1, IInstantiationService),
    __param(2, IWorkspaceContextService)
], AgentSessionsWelcomeEditorResolverContribution);
// Register command to open agent sessions welcome page
registerAction2(class OpenAgentSessionsWelcomeAction extends Action2 {
    constructor() {
        super({
            id: AgentSessionsWelcomePage.COMMAND_ID,
            title: localize('openAgentSessionsWelcome', "Open Agent Sessions Welcome"),
            precondition: ChatContextKeys.enabled
        });
    }
    async run(accessor) {
        const editorService = accessor.get(IEditorService);
        const instantiationService = accessor.get(IInstantiationService);
        const workspaceContextService = accessor.get(IWorkspaceContextService);
        const input = instantiationService.createInstance(AgentSessionsWelcomeInput, { initiator: 'command', workspaceKind: getWorkspaceKind(workspaceContextService) });
        await editorService.openEditor(input, { pinned: true });
    }
});
// Runner contribution - handles opening on startup
let AgentSessionsWelcomeRunnerContribution = class AgentSessionsWelcomeRunnerContribution extends Disposable {
    static { this.ID = 'workbench.contrib.agentSessionsWelcomeRunner'; }
    constructor(configurationService, editorService, editorGroupsService, instantiationService, contextKeyService, storageService, workspaceContextService, chatEntitlementService) {
        super();
        this.configurationService = configurationService;
        this.editorService = editorService;
        this.editorGroupsService = editorGroupsService;
        this.instantiationService = instantiationService;
        this.contextKeyService = contextKeyService;
        this.storageService = storageService;
        this.workspaceContextService = workspaceContextService;
        this.chatEntitlementService = chatEntitlementService;
        this.run();
    }
    async run() {
        // Check if AI features are enabled
        if (this.chatEntitlementService.sentiment.hidden) {
            return;
        }
        // Get startup editor configuration
        const startupEditor = this.configurationService.getValue('workbench.startupEditor');
        // Only proceed if configured to show agent sessions welcome page
        if (startupEditor !== 'agentSessionsWelcomePage') {
            return;
        }
        // Wait for editors to restore
        await this.editorGroupsService.whenReady;
        // If the auxiliary bar is maximized, we do not show the welcome page
        if (AuxiliaryBarMaximizedContext.getValue(this.contextKeyService)) {
            return;
        }
        // Check if there's prefill data from a workspace transfer - always show welcome page in that case
        const hasPrefillData = !!this.storageService.get('chat.welcomeViewPrefill', -1 /* StorageScope.APPLICATION */);
        // Don't open if there are already editors open (unless we have prefill data)
        if (this.editorService.activeEditor && !hasPrefillData) {
            return;
        }
        // Open the agent sessions welcome page
        const input = this.instantiationService.createInstance(AgentSessionsWelcomeInput, { initiator: 'startup', workspaceKind: getWorkspaceKind(this.workspaceContextService) });
        await this.editorService.openEditor(input, { pinned: false });
    }
};
AgentSessionsWelcomeRunnerContribution = __decorate([
    __param(0, IConfigurationService),
    __param(1, IEditorService),
    __param(2, IEditorGroupsService),
    __param(3, IInstantiationService),
    __param(4, IContextKeyService),
    __param(5, IStorageService),
    __param(6, IWorkspaceContextService),
    __param(7, IChatEntitlementService)
], AgentSessionsWelcomeRunnerContribution);
// Register contributions
registerWorkbenchContribution2(AgentSessionsWelcomeEditorResolverContribution.ID, AgentSessionsWelcomeEditorResolverContribution, 1 /* WorkbenchPhase.BlockStartup */);
registerWorkbenchContribution2(AgentSessionsWelcomeRunnerContribution.ID, AgentSessionsWelcomeRunnerContribution, 3 /* WorkbenchPhase.AfterRestored */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRTZXNzaW9uc1dlbGNvbWUuY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvd2VsY29tZUFnZW50U2Vzc2lvbnMvYnJvd3Nlci9hZ2VudFNlc3Npb25zV2VsY29tZS5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSw4QkFBOEIsRUFBMEMsTUFBTSxrQ0FBa0MsQ0FBQztBQUMxSCxPQUFPLEVBQUUsb0JBQW9CLEVBQXVCLE1BQU0sNEJBQTRCLENBQUM7QUFDdkYsT0FBTyxFQUFFLGdCQUFnQixFQUEwQixNQUFNLDJCQUEyQixDQUFDO0FBQ3JGLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzVILE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxxQkFBcUIsRUFBb0IsTUFBTSw0REFBNEQsQ0FBQztBQUNySCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbEYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDOUYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDMUYsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFD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