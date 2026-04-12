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
var AICustomizationWorkspaceService_1;
import { constObservable, derived, observableFromEventOpts } from '../../../../../base/common/observable.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IAICustomizationWorkspaceService, AICustomizationManagementSection } from '../../common/aiCustomizationWorkspaceService.js';
import { registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { ICustomizationHarnessService } from '../../common/customizationHarnessService.js';
import { GENERATE_AGENT_COMMAND_ID, GENERATE_HOOK_COMMAND_ID, GENERATE_ON_DEMAND_INSTRUCTIONS_COMMAND_ID, GENERATE_PROMPT_COMMAND_ID, GENERATE_SKILL_COMMAND_ID, } from '../actions/chatActions.js';
let AICustomizationWorkspaceService = class AICustomizationWorkspaceService {
    static { AICustomizationWorkspaceService_1 = this; }
    constructor(workspaceContextService, commandService, promptsService, harnessService) {
        this.workspaceContextService = workspaceContextService;
        this.commandService = commandService;
        this.promptsService = promptsService;
        this.harnessService = harnessService;
        this.managementSections = [
            AICustomizationManagementSection.Agents,
            AICustomizationManagementSection.Skills,
            AICustomizationManagementSection.Instructions,
            AICustomizationManagementSection.Prompts,
            AICustomizationManagementSection.Hooks,
            AICustomizationManagementSection.McpServers,
            AICustomizationManagementSection.Plugins,
        ];
        this.isSessionsWindow = false;
        this.hasOverrideProjectRoot = constObservable(false);
        const workspaceFolders = observableFromEventOpts({ owner: this }, this.workspaceContextService.onDidChangeWorkspaceFolders, () => this.workspaceContextService.getWorkspace().folders);
        this.activeProjectRoot = derived(reader => {
            const folders = workspaceFolders.read(reader);
            return folders[0]?.uri;
        });
    }
    getActiveProjectRoot() {
        const folders = this.workspaceContextService.getWorkspace().folders;
        return folders[0]?.uri;
    }
    getStorageSourceFilter(type) {
        return this.harnessService.getStorageSourceFilter(type);
    }
    setOverrideProjectRoot(_root) { }
    clearOverrideProjectRoot() { }
    async commitFiles(_projectRoot, _fileUris) {
        // No-op in core VS Code.
    }
    async deleteFiles(_projectRoot, _fileUris) {
        // No-op in core VS Code.
    }
    async generateCustomization(type) {
        const commandIds = {
            [PromptsType.agent]: GENERATE_AGENT_COMMAND_ID,
            [PromptsType.skill]: GENERATE_SKILL_COMMAND_ID,
            [PromptsType.instructions]: GENERATE_ON_DEMAND_INSTRUCTIONS_COMMAND_ID,
            [PromptsType.prompt]: GENERATE_PROMPT_COMMAND_ID,
            [PromptsType.hook]: GENERATE_HOOK_COMMAND_ID,
        };
        const commandId = commandIds[type];
        if (commandId) {
            await this.commandService.executeCommand(commandId);
        }
    }
    async getFilteredPromptSlashCommands(token) {
        return this.promptsService.getPromptSlashCommands(token);
    }
    static { this._emptyIntegrations = new Map(); }
    getSkillUIIntegrations() {
        return AICustomizationWorkspaceService_1._emptyIntegrations;
    }
};
AICustomizationWorkspaceService = AICustomizationWorkspaceService_1 = __decorate([
    __param(0, IWorkspaceContextService),
    __param(1, ICommandService),
    __param(2, IPromptsService),
    __param(3, ICustomizationHarnessService)
], AICustomizationWorkspaceService);
registerSingleton(IAICustomizationWorkspaceService, AICustomizationWorkspaceService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9haUN1c3RvbWl6YXRpb24vYWlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxPQUFPLEVBQWUsdUJBQXVCLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUcxSCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUNqRyxPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsZ0NBQWdDLEVBQXdCLE1BQU0saURBQWlELENBQUM7QUFDM0osT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ2xILE9BQU8sRUFBMkIsZUFBZSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDL0csT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUN2RSxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUMzRixPQUFPLEVBQ04seUJBQXlCLEVBQ3pCLHdCQUF3QixFQUN4QiwwQ0FBMEMsRUFDMUMsMEJBQTBCLEVBQzFCLHlCQUF5QixHQUN6QixNQUFNLDJCQUEyQixDQUFDO0FBRW5DLElBQU0sK0JBQStCLEdBQXJDLE1BQU0sK0JBQStCOztJQUtwQyxZQUMyQix1QkFBa0UsRUFDM0UsY0FBZ0QsRUFDaEQsY0FBZ0QsRUFDbkMsY0FBNkQ7UUFIaEQsNEJBQXVCLEdBQXZCLHVCQUF1QixDQUEwQjtRQUMxRCxtQkFBYyxHQUFkLGNBQWMsQ0FBaUI7UUFD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