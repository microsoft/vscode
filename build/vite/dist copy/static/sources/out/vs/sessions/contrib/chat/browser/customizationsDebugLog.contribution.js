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
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { ILoggerService } from '../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { registerWorkbenchContribution2 } from '../../../../workbench/common/contributions.js';
import { IAICustomizationWorkspaceService, applyStorageSourceFilter } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { IPromptsService, PromptsStorage } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { AICustomizationManagementSection } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagement.js';
import { IMcpService } from '../../../../workbench/contrib/mcp/common/mcpTypes.js';
const PROMPT_SECTIONS = [
    { section: AICustomizationManagementSection.Agents, type: PromptsType.agent },
    { section: AICustomizationManagementSection.Skills, type: PromptsType.skill },
    { section: AICustomizationManagementSection.Instructions, type: PromptsType.instructions },
    { section: AICustomizationManagementSection.Prompts, type: PromptsType.prompt },
    { section: AICustomizationManagementSection.Hooks, type: PromptsType.hook },
];
let CustomizationsDebugLogContribution = class CustomizationsDebugLogContribution extends Disposable {
    static { this.ID = 'sessions.customizationsDebugLog'; }
    constructor(loggerService, _promptsService, _workspaceService, _workspaceContextService, _mcpService) {
        super();
        this._promptsService = _promptsService;
        this._workspaceService = _workspaceService;
        this._workspaceContextService = _workspaceContextService;
        this._mcpService = _mcpService;
        this._snapshotDirty = false;
        this._logger = this._register(loggerService.createLogger('customizationsDebug', { name: 'Customizations Debug' }));
        this._register(this._promptsService.onDidChangeCustomAgents(() => this._logSnapshot()));
        this._register(this._promptsService.onDidChangeSlashCommands(() => this._logSnapshot()));
        this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(() => this._logSnapshot()));
        this._register(autorun(reader => {
            this._workspaceService.activeProjectRoot.read(reader);
            this._logSnapshot();
        }));
        this._register(autorun(reader => {
            this._mcpService.servers.read(reader);
            this._logSnapshot();
        }));
    }
    _logSnapshot() {
        if (this._pendingSnapshot) {
            this._snapshotDirty = true;
            return;
        }
        this._pendingSnapshot = this._doLogSnapshot().finally(() => {
            this._pendingSnapshot = undefined;
            if (this._snapshotDirty) {
                this._snapshotDirty = false;
                this._logSnapshot();
            }
        });
    }
    async _doLogSnapshot() {
        const root = this._workspaceService.getActiveProjectRoot()?.fsPath ?? '(none)';
        this._logger.info('');
        this._logger.info('=== Customizations Snapshot ===');
        this._logger.info(`  Root: ${root}`);
        this._logger.info(`  Sections: ${this._workspaceService.managementSections.join(', ')}`);
        this._logger.info('');
        // Header
        this._logger.info(`  ${'Section'.padEnd(16)} ${'Local'.padStart(6)} ${'User'.padStart(6)} ${'Ext'.padStart(6)} ${'Total'.padStart(7)}`);
        this._logger.info(`  ${'--------'.padEnd(16)} ${'-----'.padStart(6)} ${'----'.padStart(6)} ${'---'.padStart(6)} ${'-----'.padStart(7)}`);
        for (const { section, type } of PROMPT_SECTIONS) {
            const filter = this._workspaceService.getStorageSourceFilter(type);
            await this._logSectionRow(section, type, filter);
        }
        this._logger.info('');
        // Details per section
        for (const { section, type } of PROMPT_SECTIONS) {
            const filter = this._workspaceService.getStorageSourceFilter(type);
            await this._logSectionDetails(section, type, filter);
        }
        // MCP Servers
        this._logMcpServers();
    }
    _logMcpServers() {
        const servers = this._mcpService.servers.get();
        this._logger.info(`  -- MCP Servers (${servers.length}) --`);
        if (servers.length === 0) {
            this._logger.info('     (none registered)');
        }
        for (const server of servers) {
            const state = server.connectionState.get();
            const stateStr = state?.state ?? 'unknown';
            this._logger.info(`     ${server.definition.label} [${stateStr}] id=${server.definition.id}`);
        }
        this._logger.info('');
    }
    async _logSectionRow(section, type, filter) {
        try {
            const [localFiles, userFiles, extensionFiles] = await Promise.all([
                this._promptsService.listPromptFilesForStorage(type, PromptsStorage.local, CancellationToken.None),
                this._promptsService.listPromptFilesForStorage(type, PromptsStorage.user, CancellationToken.None),
                this._promptsService.listPromptFilesForStorage(type, PromptsStorage.extension, CancellationToken.None),
            ]);
            const all = [...localFiles, ...userFiles, ...extensionFiles];
            const filtered = applyStorageSourceFilter(all, filter);
            const local = filtered.filter(f => f.storage === PromptsStorage.local).length;
            const user = filtered.filter(f => f.storage === PromptsStorage.user).length;
            const ext = filtered.filter(f => f.storage === PromptsStorage.extension).length;
            this._logger.info(`  ${section.padEnd(16)} ${String(local).padStart(6)} ${String(user).padStart(6)} ${String(ext).padStart(6)} ${String(filtered.length).padStart(7)}`);
        }
        catch {
            this._logger.info(`  ${section.padEnd(16)}  (error)`);
        }
    }
    async _logSectionDetails(section, type, filter) {
        try {
            // Source folders - where we look for files
            const sourceFolders = await this._promptsService.getSourceFolders(type);
            if (sourceFolders.length > 0) {
                this._logger.info(`  -- ${section} --`);
                this._logger.info(`     Search paths:`);
                for (const sf of sourceFolders) {
                    this._logger.info(`       [${sf.storage}] ${sf.uri.fsPath}`);
                }
            }
            const [localFiles, userFiles, extensionFiles] = await Promise.all([
                this._promptsService.listPromptFilesForStorage(type, PromptsStorage.local, CancellationToken.None),
                this._promptsService.listPromptFilesForStorage(type, PromptsStorage.user, CancellationToken.None),
                this._promptsService.listPromptFilesForStorage(type, PromptsStorage.extension, CancellationToken.None),
            ]);
            const all = [...localFiles, ...userFiles, ...extensionFiles];
            const filtered = applyStorageSourceFilter(all, filter);
            if (filtered.length > 0) {
                if (sourceFolders.length === 0) {
                    this._logger.info(`  -- ${section} --`);
                }
                this._logger.info(`     Filter: sources=[${filter.sources.join(', ')}]${filter.includedUserFileRoots ? `, roots=[${filter.includedUserFileRoots.map(r => r.fsPath).join(', ')}]` : ''}`);
                this._logger.info(`     Found ${filtered.length} item(s):`);
                for (const f of filtered) {
                    this._logger.info(`       [${f.storage}] ${f.uri.fsPath}`);
                }
            }
            if (sourceFolders.length > 0 || filtered.length > 0) {
                this._logger.info('');
            }
        }
        catch {
            // already logged in row
        }
    }
};
CustomizationsDebugLogContribution = __decorate([
    __param(0, ILoggerService),
    __param(1, IPromptsService),
    __param(2, IAICustomizationWorkspaceService),
    __param(3, IWorkspaceContextService),
    __param(4, IMcpService)
], CustomizationsDebugLogContribution);
registerWorkbenchContribution2(CustomizationsDebugLogContribution.ID, CustomizationsDebugLogContribution, 3 /* WorkbenchPhase.AfterRestored */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3VzdG9taXphdGlvbnNEZWJ1Z0xvZy5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9jb250cmliL2NoYXQvYnJvd3Nlci9jdXN0b21pemF0aW9uc0RlYnVnTG9nLmNvbnRyaWJ1dGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hFLE9BQU8sRUFBVyxjQUFjLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUM5RixPQUFPLEVBQTBCLDhCQUE4QixFQUFrQixNQUFNLCtDQUErQyxDQUFDO0FBQ3ZJLE9BQU8sRUFBRSxnQ0FBZ0MsRUFBRSx3QkFBd0IsRUFBd0IsTUFBTSw4RUFBOEUsQ0FBQztBQUNoTCxPQUFPLEVBQUUsZUFBZSxFQUFFLGNBQWMsRUFBZSxNQUFNLGtGQUFrRixDQUFDO0FBQ2hKLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx1RUFBdUUsQ0FBQztBQUNwRyxPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSx5RkFBeUYsQ0FBQztBQUMzSSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFFbkYsTUFBTSxlQUFlLEdBQXVFO0lBQzNGLEVBQUUsT0FBTyxFQUFFLGdDQUFnQyxDQUFDLE1BQU0sRUFBRSxJQUFJLEVBQUUsV0FBVyxDQUFDLEtBQUssRUFBRTtJQUM3RSxFQUFFLE9BQU8sRUFBRSxnQ0FBZ0MsQ0FBQyxNQUFNLEVBQUUsSUFBSSxF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