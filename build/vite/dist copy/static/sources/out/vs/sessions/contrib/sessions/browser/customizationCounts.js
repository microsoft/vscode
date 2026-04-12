/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { isEqualOrParent } from '../../../../base/common/resources.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { PromptsStorage } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { BUILTIN_STORAGE } from '../../chat/common/builtinPromptsStorage.js';
import { applyStorageSourceFilter } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { parseHooksFromFile } from '../../../../workbench/contrib/chat/common/promptSyntax/hookCompatibility.js';
import { parse as parseJSONC } from '../../../../base/common/jsonc.js';
const storageToCountKey = {
    [PromptsStorage.local]: 'workspace',
    [PromptsStorage.user]: 'user',
    [PromptsStorage.extension]: 'extension',
    [BUILTIN_STORAGE]: 'builtin',
};
export function getSourceCountsTotal(counts, filter) {
    let total = 0;
    for (const storage of filter.sources) {
        const key = storageToCountKey[storage];
        if (key) {
            total += counts[key];
        }
    }
    return total;
}
/**
 * Gets source counts for a prompt type, using the SAME data sources as
 * loadItems() in the list widget to avoid count mismatches.
 */
export async function getSourceCounts(promptsService, promptType, filter, workspaceContextService, workspaceService, fileService) {
    const items = [];
    if (promptType === PromptsType.agent) {
        // Must match loadItems: uses getCustomAgents()
        const agents = await promptsService.getCustomAgents(CancellationToken.None);
        for (const a of agents) {
            items.push({ storage: a.source.storage, uri: a.uri });
        }
    }
    else if (promptType === PromptsType.skill) {
        // Must match loadItems: uses findAgentSkills()
        const skills = await promptsService.findAgentSkills(CancellationToken.None);
        for (const s of skills ?? []) {
            items.push({ storage: s.storage, uri: s.uri });
        }
    }
    else if (promptType === PromptsType.prompt) {
        // Must match loadItems: uses getPromptSlashCommands() filtering out skills
        const commands = await promptsService.getPromptSlashCommands(CancellationToken.None);
        for (const c of commands) {
            if (c.type === PromptsType.skill) {
                continue;
            }
            items.push({ storage: c.storage, uri: c.uri });
        }
    }
    else if (promptType === PromptsType.instructions) {
        // Must match loadItems: uses listPromptFiles + listAgentInstructions
        const promptFiles = await promptsService.listPromptFiles(promptType, CancellationToken.None);
        for (const f of promptFiles) {
            items.push({ storage: f.storage, uri: f.uri });
        }
        const agentInstructions = await promptsService.listAgentInstructions(CancellationToken.None, undefined);
        const workspaceFolderUris = workspaceContextService.getWorkspace().folders.map(f => f.uri);
        const activeRoot = workspaceService.getActiveProjectRoot();
        if (activeRoot) {
            workspaceFolderUris.push(activeRoot);
        }
        for (const file of agentInstructions) {
            const isWorkspaceFile = workspaceFolderUris.some(root => isEqualOrParent(file.uri, root));
            items.push({
                storage: isWorkspaceFile ? PromptsStorage.local : PromptsStorage.user,
                uri: file.uri,
            });
        }
    }
    else if (promptType === PromptsType.hook && fileService) {
        // Must match loadItems: parse individual hooks from each file
        const hookFiles = await promptsService.listPromptFiles(PromptsType.hook, CancellationToken.None);
        const activeRoot = workspaceService.getActiveProjectRoot();
        for (const hookFile of hookFiles) {
            try {
                const content = await fileService.readFile(hookFile.uri);
                const json = parseJSONC(content.value.toString());
                const { hooks } = parseHooksFromFile(hookFile.uri, json, activeRoot, '');
                if (hooks.size > 0) {
                    for (const [, entry] of hooks) {
                        for (let i = 0; i < entry.hooks.length; i++) {
                            items.push({ storage: hookFile.storage, uri: hookFile.uri });
                        }
                    }
                }
                else {
                    items.push({ storage: hookFile.storage, uri: hookFile.uri });
                }
            }
            catch {
                items.push({ storage: hookFile.storage, uri: hookFile.uri });
            }
        }
    }
    else {
        // hooks and anything else: uses listPromptFiles
        const files = await promptsService.listPromptFiles(promptType, CancellationToken.None);
        for (const f of files) {
            items.push({ storage: f.storage, uri: f.uri });
        }
    }
    // Apply the same storage source filter as the list widget
    const filtered = applyStorageSourceFilter(items, filter);
    return {
        workspace: filtered.filter(i => i.storage === PromptsStorage.local).length,
        user: filtered.filter(i => i.storage === PromptsStorage.user).length,
        extension: filtered.filter(i => i.storage === PromptsStorage.extension).length,
        builtin: filtered.filter(i => i.storage === BUILTIN_STORAGE).length,
    };
}
export async function getCustomizationTotalCount(promptsService, mcpService, workspaceService, workspaceContextService, agentPluginService) {
    const types = [PromptsType.agent, PromptsType.skill, PromptsType.instructions, PromptsType.prompt, PromptsType.hook];
    const results = await Promise.all(types.map(type => {
        const filter = workspaceService.getStorageSourceFilter(type);
        return getSourceCounts(promptsService, type, filter, workspaceContextService, workspaceService)
            .then(counts => getSourceCountsTotal(counts, filter));
    }));
    const pluginCount = agentPluginService?.plugins.get().length ?? 0;
    return results.reduce((sum, n) => sum + n, 0) + mcpService.servers.get().length + pluginCount;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3VzdG9taXphdGlvbkNvdW50cy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2NvbnRyaWIvc2Vzc2lvbnMvYnJvd3Nlci9jdXN0b21pemF0aW9uQ291bnRzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUl2RSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sdUVBQXVFLENBQUM7QUFDcEcsT0FBTyxFQUFtQixjQUFjLEVBQUUsTUFBTSxrRkFBa0YsQ0FBQztBQUNuSSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFFN0UsT0FBTyxFQUFvQyx3QkFBd0IsRUFBd0IsTUFBTSw4RUFBOEUsQ0FBQztBQUNoTCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw2RUFBNkUsQ0FBQztBQUVqSCxPQUFPLEVBQUUsS0FBSyxJQUFJLFVBQVUsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBU3ZFLE1BQU0saUJBQWlCLEdBQWlEO0lBQ3ZFLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQyxFQUFFLFdBQVc7SUFDbkMsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTTtJQUM3QixDQUFDLGNBQWMsQ0FBQyxTQUFTLENBQUMsRUFBRSxXQUFXO0lBQ3ZDLENBQUMsZUFBZSxDQUFDLEVBQUUsU0FBUztDQUM1QixDQUFDO0FBRUYsTUFBTSxVQUFVLG9CQUFvQixDQUFDLE1BQXFCLEVBQUUsTUFBNEI7SUFDdkYsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDO0lBQ2QsS0FBSyxNQUFNLE9BQU8sSUFBSSxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDdEMsTUFBTSxH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