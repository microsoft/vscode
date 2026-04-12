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
import { PromptsService } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsServiceImpl.js';
import { PromptFilesLocator } from '../../../../workbench/contrib/chat/common/promptSyntax/utils/promptFilesLocator.js';
import { Event } from '../../../../base/common/event.js';
import { basename, dirname, isEqualOrParent, joinPath } from '../../../../base/common/resources.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { FileAccess } from '../../../../base/common/network.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { HOOKS_SOURCE_FOLDER, SKILL_FILENAME } from '../../../../workbench/contrib/chat/common/promptSyntax/config/promptFileLocations.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { PromptsStorage } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { BUILTIN_STORAGE } from '../../chat/common/builtinPromptsStorage.js';
import { IWorkbenchEnvironmentService } from '../../../../workbench/services/environment/common/environmentService.js';
import { IPathService } from '../../../../workbench/services/path/common/pathService.js';
import { ISearchService } from '../../../../workbench/services/search/common/search.js';
import { IUserDataProfileService } from '../../../../workbench/services/userDataProfile/common/userDataProfile.js';
import { IAICustomizationWorkspaceService } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
/** URI root for built-in skills bundled with the Agents app. */
export const BUILTIN_SKILLS_URI = FileAccess.asFileUri('vs/sessions/skills');
export class AgenticPromptsService extends PromptsService {
    createPromptFilesLocator() {
        return this.instantiationService.createInstance(AgenticPromptFilesLocator);
    }
    getCopilotRoot() {
        if (!this._copilotRoot) {
            this._copilotRoot = joinPath(this.pathService.userHome({ preferLocal: true }), '.copilot');
        }
        return this._copilotRoot;
    }
    //#region Built-in Skills
    /**
     * Returns built-in skill metadata, discovering and parsing SKILL.md files
     * bundled in the `vs/sessions/skills/` directory.
     */
    async getBuiltinSkills() {
        if (!this._builtinSkillsCache) {
            this._builtinSkillsCache = this.discoverBuiltinSkills();
        }
        return this._builtinSkillsCache;
    }
    /**
     * Discovers built-in skills from `vs/sessions/skills/{name}/SKILL.md`.
     * Each subdirectory containing a SKILL.md is treated as a skill.
     */
    async discoverBuiltinSkills() {
        try {
            const stat = await this.fileService.resolve(BUILTIN_SKILLS_URI);
            if (!stat.children) {
                return [];
            }
            const skills = [];
            for (const child of stat.children) {
                if (!child.isDirectory) {
                    continue;
                }
                const skillFileUri = joinPath(child.resource, SKILL_FILENAME);
                try {
                    const parsed = await this.parseNew(skillFileUri, CancellationToken.None);
                    const rawName = parsed.header?.name;
                    const rawDescription = parsed.header?.description;
                    if (!rawName || !rawDescription) {
                        continue;
                    }
                    const name = sanitizeSkillText(rawName, 64);
                    const description = sanitizeSkillText(rawDescription, 1024);
                    const folderName = basename(child.resource);
                    if (name !== folderName) {
                        continue;
                    }
                    skills.push({
                        uri: skillFileUri,
                        storage: BUILTIN_STORAGE,
                        name,
                        description,
                        disableModelInvocation: parsed.header?.disableModelInvocation === true,
                        userInvocable: parsed.header?.userInvocable !== false,
                    });
                }
                catch (e) {
                    this.logger.warn(`[discoverBuiltinSkills] Failed to parse built-in skill: ${skillFileUri}`, e instanceof Error ? e.message : String(e));
                }
            }
            return skills;
        }
        catch {
            return [];
        }
    }
    /**
     * Returns built-in skill file paths for listing in the UI.
     */
    async getBuiltinSkillPaths() {
        const skills = await this.getBuiltinSkills();
        return skills.map(s => ({
            uri: s.uri,
            storage: BUILTIN_STORAGE,
            type: PromptsType.skill,
            name: s.name,
            description: s.description,
        }));
    }
    /**
     * Override to include built-in skills, appending them with lowest priority.
     * Skills from any other source (workspace, user, extension, internal) take precedence.
     */
    async findAgentSkills(token) {
        const baseResult = await super.findAgentSkills(token);
        if (baseResult === undefined) {
            return undefined;
        }
        const builtinSkills = await this.getBuiltinSkills();
        if (builtinSkills.length === 0) {
            return baseResult;
        }
        // Collect names already present from other sources
        const existingNames = new Set(baseResult.map(s => s.name));
        const disabledSkills = this.getDisabledPromptFiles(PromptsType.skill);
        const nonOverridden = builtinSkills.filter(s => !existingNames.has(s.name) && !disabledSkills.has(s.uri));
        if (nonOverridden.length === 0) {
            return baseResult;
        }
        return [...baseResult, ...nonOverridden];
    }
    //#endregion
    /**
     * Override to include built-in skills, filtering out those overridden by
     * user or workspace items with the same name.
     */
    async listPromptFiles(type, token) {
        const baseResults = await super.listPromptFiles(type, token);
        if (type !== PromptsType.skill) {
            return baseResults;
        }
        const builtinItems = await this.getBuiltinSkillPaths();
        if (builtinItems.length === 0) {
            return baseResults;
        }
        // Collect names of user/workspace items to detect overrides
        const overriddenNames = new Set();
        for (const p of baseResults) {
            if (p.storage === PromptsStorage.local || p.storage === PromptsStorage.user) {
                overriddenNames.add(basename(dirname(p.uri)));
            }
        }
        const nonOverridden = builtinItems.filter(p => !overriddenNames.has(basename(dirname(p.uri))));
        // Built-in items use BUILTIN_STORAGE ('builtin') which is not in the
        // core IPromptPath union but is handled by the sessions UI layer.
        return [...baseResults, ...nonOverridden];
    }
    async listPromptFilesForStorage(type, storage, token) {
        if (storage === BUILTIN_STORAGE) {
            if (type === PromptsType.skill) {
                return this.getBuiltinSkillPaths();
            }
            // Built-in storage is only valid for skills; for other types, there are no items.
            return [];
        }
        return super.listPromptFilesForStorage(type, storage, token);
    }
    /**
     * Override to use ~/.copilot as the user-level source folder for creation,
     * instead of the VS Code profile's promptsHome.
     */
    async getSourceFolders(type) {
        const folders = await super.getSourceFolders(type);
        const copilotRoot = this.getCopilotRoot();
        // Replace any user-storage folders with the CLI-accessible ~/.copilot root
        return folders.map(folder => {
            if (folder.storage === PromptsStorage.user) {
                const subfolder = getCliUserSubfolder(type);
                return subfolder
                    ? { ...folder, uri: joinPath(copilotRoot, subfolder) }
                    : folder;
            }
            return folder;
        });
    }
}
let AgenticPromptFilesLocator = class AgenticPromptFilesLocator extends PromptFilesLocator {
    constructor(fileService, configService, workspaceService, environmentService, searchService, userDataService, logService, pathService, workspaceTrustManagementService, customizationWorkspaceService) {
        super(fileService, configService, workspaceService, environmentService, searchService, userDataService, logService, pathService, workspaceTrustManagementService);
        this.customizationWorkspaceService = customizationWorkspaceService;
    }
    getWorkspaceFolders() {
        const folder = this.getActiveWorkspaceFolder();
        return folder ? [folder] : [];
    }
    getWorkspaceFolder(resource) {
        const folder = this.getActiveWorkspaceFolder();
        if (!folder) {
            return undefined;
        }
        return isEqualOrParent(resource, folder.uri) ? folder : undefined;
    }
    onDidChangeWorkspaceFolders() {
        return Event.fromObservableLight(this.customizationWorkspaceService.activeProjectRoot);
    }
    async getHookSourceFolders() {
        const configured = await super.getHookSourceFolders();
        if (configured.length > 0) {
            return configured;
        }
        const folder = this.getActiveWorkspaceFolder();
        return folder ? [joinPath(folder.uri, HOOKS_SOURCE_FOLDER)] : [];
    }
    getActiveWorkspaceFolder() {
        const root = this.customizationWorkspaceService.getActiveProjectRoot();
        if (!root) {
            return undefined;
        }
        return {
            uri: root,
            name: basename(root),
            index: 0,
            toResource: relativePath => joinPath(root, relativePath),
        };
    }
};
AgenticPromptFilesLocator = __decorate([
    __param(0, IFileService),
    __param(1, IConfigurationService),
    __param(2, IWorkspaceContextService),
    __param(3, IWorkbenchEnvironmentService),
    __param(4, ISearchService),
    __param(5, IUserDataProfileService),
    __param(6, ILogService),
    __param(7, IPathService),
    __param(8, IWorkspaceTrustManagementService),
    __param(9, IAICustomizationWorkspaceService)
], AgenticPromptFilesLocator);
/**
 * Returns the subfolder name under ~/.copilot/ for a given customization type.
 * Used to determine the CLI-accessible user creation target.
 *
 * Prompts are a VS Code concept and use the standard profile promptsHome,
 * so they are intentionally excluded here.
 */
function getCliUserSubfolder(type) {
    switch (type) {
        case PromptsType.instructions: return 'instructions';
        case PromptsType.skill: return 'skills';
        case PromptsType.agent: return 'agents';
        default: return undefined;
    }
}
/**
 * Strips XML tags and truncates to the given max length.
 * Matches the sanitization applied by PromptsService for other skill sources.
 */
function sanitizeSkillText(text, maxLength) {
    const sanitized = text.replace(/<[^>]+>/g, '');
    return sanitized.length > maxLength ? sanitized.substring(0, maxLength) : sanitized;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0c1NlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9jb250cmliL2NoYXQvYnJvd3Nlci9wcm9tcHRzU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0ZBQXNGLENBQUM7QUFDdEgsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sb0ZBQW9GLENBQUM7QUFDeEgsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxRQUFRLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVwRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDaEUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsd0JBQXdCLEVBQW9CLE1BQU0sb0RBQW9ELENBQUM7QUFDaEgsT0FBTyxFQUFFLG1CQUFtQixFQUFFLGNBQWMsRUFBRSxNQUFNLHNGQUFzRixDQUFDO0FBQzNJLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx1RUFBdUUsQ0FBQztBQUNwRyxPQUFPLEVBQTRCLGNBQWMsRUFBRSxNQUFNLGtGQUFrRixDQUFDO0FBQzVJLE9BQU8sRUFBRSxlQUFlLEVBQXNCLE1BQU0sNENBQTRDLENBQUM7QUFDakcsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0seUVBQXlF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