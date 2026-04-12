/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { applyStorageSourceFilter } from '../../common/aiCustomizationWorkspaceService.js';
import { AICustomizationManagementSection } from './aiCustomizationManagement.js';
/**
 * Maps section ID to prompt type. Duplicated from aiCustomizationListWidget
 * to avoid a circular dependency.
 */
function sectionToPromptType(section) {
    switch (section) {
        case AICustomizationManagementSection.Agents:
            return PromptsType.agent;
        case AICustomizationManagementSection.Skills:
            return PromptsType.skill;
        case AICustomizationManagementSection.Instructions:
            return PromptsType.instructions;
        case AICustomizationManagementSection.Hooks:
            return PromptsType.hook;
        case AICustomizationManagementSection.Prompts:
        default:
            return PromptsType.prompt;
    }
}
/**
 * Generates a debug diagnostics report for the AI Customization list widget.
 * Returns the report as a string suitable for opening in an editor.
 */
export async function generateCustomizationDebugReport(section, promptsService, workspaceService, widgetState, activeDescriptor) {
    const externalProvider = activeDescriptor?.itemProvider;
    const promptType = sectionToPromptType(section);
    const filter = workspaceService.getStorageSourceFilter(promptType);
    const lines = [];
    lines.push(`== Customization Debug: ${section} (${promptType}) ==`);
    lines.push(`Window: ${workspaceService.isSessionsWindow ? 'Sessions' : 'Core VS Code'}`);
    lines.push(`Active root: ${workspaceService.getActiveProjectRoot()?.fsPath ?? '(none)'}`);
    lines.push(`Sections: [${workspaceService.managementSections.join(', ')}]`);
    lines.push(`Filter sources: [${filter.sources.join(', ')}]`);
    // Dump active harness descriptor
    if (activeDescriptor) {
        lines.push('');
        lines.push('--- Active Harness ---');
        lines.push(`  id: ${activeDescriptor.id}`);
        lines.push(`  label: ${activeDescriptor.label}`);
        lines.push(`  hasItemProvider: ${!!activeDescriptor.itemProvider}`);
        lines.push(`  hasSyncProvider: ${!!activeDescriptor.syncProvider}`);
        lines.push(`  hiddenSections: ${activeDescriptor.hiddenSections ? `[${activeDescriptor.hiddenSections.join(', ')}]` : '(none)'}`);
        lines.push(`  workspaceSubpaths: ${activeDescriptor.workspaceSubpaths ? `[${activeDescriptor.workspaceSubpaths.join(', ')}]` : '(none)'}`);
        lines.push(`  hideGenerateButton: ${activeDescriptor.hideGenerateButton ?? false}`);
        lines.push(`  requiredAgentId: ${activeDescriptor.requiredAgentId ?? '(none)'}`);
        lines.push(`  instructionFileFilter: ${activeDescriptor.instructionFileFilter ? `[${activeDescriptor.instructionFileFilter.join(', ')}]` : '(none)'}`);
    }
    lines.push('');
    if (filter.includedUserFileRoots) {
        lines.push(`Filter includedUserFileRoots:`);
        for (const r of filter.includedUserFileRoots) {
            lines.push(`  ${r.fsPath}`);
        }
    }
    else {
        lines.push(`Filter includedUserFileRoots: (all)`);
    }
    lines.push('');
    if (externalProvider) {
        await appendExternalProviderData(lines, externalProvider, promptType);
    }
    else {
        await appendRawServiceData(lines, promptsService, promptType);
        await appendFilteredData(lines, promptsService, promptType, filter);
    }
    appendWidgetState(lines, widgetState);
    if (!externalProvider) {
        await appendSourceFolders(lines, promptsService, promptType);
    }
    return lines.join('\n');
}
async function appendExternalProviderData(lines, provider, promptType) {
    lines.push('--- External Provider Data ---');
    const allItems = await provider.provideChatSessionCustomizations(CancellationToken.None);
    if (!allItems) {
        lines.push('  Provider returned undefined');
        lines.push('');
        return;
    }
    lines.push(`  Total items from provider: ${allItems.length}`);
    // Group by type for summary
    const byType = new Map();
    for (const item of allItems) {
        const existing = byType.get(item.type) ?? [];
        existing.push(item);
        byType.set(item.type, existing);
    }
    for (const [type, items] of byType) {
        lines.push(`  ${type}: ${items.length} items`);
        for (const item of items) {
            lines.push(`    ${item.name} — ${item.uri.fsPath ?? item.uri.toString()}`);
            if (item.description) {
                lines.push(`      desc: ${item.description}`);
            }
            if (item.groupKey) {
                lines.push(`      groupKey: ${item.groupKey}`);
            }
            if (item.badge) {
                lines.push(`      badge: ${item.badge}`);
            }
            if (item.status) {
                lines.push(`      status: ${item.status}${item.statusMessage ? ` (${item.statusMessage})` : ''}`);
            }
            if (item.enabled === false) {
                lines.push(`      enabled: false`);
            }
            lines.push(`      scheme: ${item.uri.scheme}`);
        }
    }
    // Show items matching the current section
    const sectionItems = allItems.filter(i => i.type === promptType);
    lines.push(`  Items matching current section (${promptType}): ${sectionItems.length}`);
    lines.push('');
}
async function appendRawServiceData(lines, promptsService, promptType) {
    lines.push('--- Stage 1: Raw PromptsService Data ---');
    const [localFiles, userFiles, extensionFiles] = await Promise.all([
        promptsService.listPromptFilesForStorage(promptType, PromptsStorage.local, CancellationToken.None),
        promptsService.listPromptFilesForStorage(promptType, PromptsStorage.user, CancellationToken.None),
        promptsService.listPromptFilesForStorage(promptType, PromptsStorage.extension, CancellationToken.None),
    ]);
    lines.push(`  listPromptFilesForStorage(local):  ${localFiles.length} files`);
    appendFileList(lines, localFiles);
    lines.push(`  listPromptFilesForStorage(user):   ${userFiles.length} files`);
    appendFileList(lines, userFiles);
    lines.push(`  listPromptFilesForStorage(ext):    ${extensionFiles.length} files`);
    appendFileList(lines, extensionFiles);
    const allFiles = await promptsService.listPromptFiles(promptType, CancellationToken.None);
    lines.push(`  listPromptFiles (merged):          ${allFiles.length} files`);
    if (promptType === PromptsType.instructions) {
        const agentInstructions = await promptsService.listAgentInstructions(CancellationToken.None, undefined);
        lines.push(`  listAgentInstructions (extra):     ${agentInstructions.length} files`);
        appendFileList(lines, agentInstructions);
    }
    if (promptType === PromptsType.skill) {
        const skills = await promptsService.findAgentSkills(CancellationToken.None);
        lines.push(`  findAgentSkills:                   ${skills?.length ?? 0} skills`);
        for (const s of skills ?? []) {
            lines.push(`    ${s.name ?? '?'} [${s.storage}] ${s.uri.fsPath}`);
        }
    }
    if (promptType === PromptsType.agent) {
        const agents = await promptsService.getCustomAgents(CancellationToken.None);
        lines.push(`  getCustomAgents:                   ${agents.length} agents`);
        for (const a of agents) {
            lines.push(`    ${a.name} [${a.source.storage}] ${a.uri.fsPath}`);
        }
    }
    if (promptType === PromptsType.prompt) {
        const commands = await promptsService.getPromptSlashCommands(CancellationToken.None);
        lines.push(`  getPromptSlashCommands:            ${commands.length} commands`);
        for (const c of commands) {
            lines.push(`    /${c.name} [${c.storage}] ${c.uri.fsPath} (type=${c.type})`);
        }
    }
    lines.push('');
}
async function appendFilteredData(lines, promptsService, promptType, filter) {
    lines.push('--- Stage 2: After applyStorageSourceFilter ---');
    const [localFiles, userFiles, extensionFiles] = await Promise.all([
        promptsService.listPromptFilesForStorage(promptType, PromptsStorage.local, CancellationToken.None),
        promptsService.listPromptFilesForStorage(promptType, PromptsStorage.user, CancellationToken.None),
        promptsService.listPromptFilesForStorage(promptType, PromptsStorage.extension, CancellationToken.None),
    ]);
    const all = [...localFiles, ...userFiles, ...extensionFiles];
    const filtered = applyStorageSourceFilter(all, filter);
    lines.push(`  Input: ${all.length} → Filtered: ${filtered.length}`);
    lines.push(`    local:     ${filtered.filter(f => f.storage === PromptsStorage.local).length}`);
    lines.push(`    user:      ${filtered.filter(f => f.storage === PromptsStorage.user).length}`);
    lines.push(`    extension: ${filtered.filter(f => f.storage === PromptsStorage.extension).length}`);
    const removedCount = all.length - filtered.length;
    if (removedCount > 0) {
        const filteredUris = new Set(filtered.map(f => f.uri.toString()));
        const removed = all.filter(f => !filteredUris.has(f.uri.toString()));
        lines.push(`  Removed (${removedCount}):`);
        for (const f of removed) {
            lines.push(`    [${f.storage}] ${f.uri.fsPath}`);
        }
    }
    lines.push('');
}
function appendWidgetState(lines, state) {
    lines.push('--- Stage 3: Widget State (loadItems → filterItems) ---');
    lines.push(`  allItems (after loadItems): ${state.allItems.length}`);
    lines.push(`    local:     ${state.allItems.filter(i => i.storage === PromptsStorage.local).length}`);
    lines.push(`    user:      ${state.allItems.filter(i => i.storage === PromptsStorage.user).length}`);
    lines.push(`    extension: ${state.allItems.filter(i => i.storage === PromptsStorage.extension).length}`);
    lines.push(`    plugin:    ${state.allItems.filter(i => i.storage === PromptsStorage.plugin).length}`);
    // Show each item with its groupKey and storage
    for (const item of state.allItems) {
        lines.push(`    - ${item.name} [storage=${item.storage ?? '?'}, groupKey=${item.groupKey ?? '(none)'}]`);
    }
    lines.push(`  displayEntries (after filterItems): ${state.displayEntries.length}`);
    const fileEntries = state.displayEntries.filter(e => e.type === 'file-item');
    lines.push(`    file items shown: ${fileEntries.length}`);
    const groupEntries = state.displayEntries.filter(e => e.type === 'group-header');
    for (const g of groupEntries) {
        lines.push(`    group "${g.label}": count=${g.count}, collapsed=${g.collapsed}`);
    }
    lines.push('');
}
async function appendSourceFolders(lines, promptsService, promptType) {
    lines.push('--- Source Folders (creation targets) ---');
    const sourceFolders = await promptsService.getSourceFolders(promptType);
    for (const sf of sourceFolders) {
        lines.push(`  [${sf.storage}] ${sf.uri.fsPath}`);
    }
    try {
        const resolvedFolders = await promptsService.getResolvedSourceFolders(promptType);
        lines.push('');
        lines.push('--- Resolved Source Folders (discovery order) ---');
        for (const rf of resolvedFolders) {
            lines.push(`  [${rf.storage}] ${rf.uri.fsPath} (source=${rf.source})`);
        }
    }
    catch {
        // getResolvedSourceFolders may not exist for all types
    }
}
function appendFileList(lines, files) {
    for (const f of files) {
        lines.push(`    ${f.uri.fsPath}`);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWlDdXN0b21pemF0aW9uRGVidWdQYW5lbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9haUN1c3RvbWl6YXRpb24vYWlDdXN0b21pemF0aW9uRGVidWdQYW5lbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUUvRSxPQUFPLEVBQW1CLGNBQWMsRUFBZSxNQUFNLHFEQUFxRCxDQUFDO0FBQ25ILE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUN2RSxPQUFPLEVBQW9DLHdCQUF3QixFQUF3QixNQUFNLGlEQUFpRCxDQUFDO0FBQ25KLE9BQU8sRUFBRSxnQ0FBZ0MsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBR2xGOzs7R0FHRztBQUNILFNBQVMsbUJBQW1CLENBQUMsT0FBeUM7SUFDckUsUUFBUSxPQUFPLEVBQUUsQ0FBQztRQUNqQixLQUFLLGdDQUFnQyxDQUFDLE1BQU07WUFDM0MsT0FBTyxXQUFXLENBQUMsS0FBSyxDQUFDO1FBQzFCLEtBQUssZ0NBQWdDLENBQUMsTUFBTTtZQUMzQyxPQUFPLFdBQVcsQ0FBQyxLQUFLLENBQUM7UUFDMUIsS0FBSyxnQ0FBZ0MsQ0FBQyxZQUFZO1lBQ2pELE9BQU8sV0FBVyxDQUFDLFlBQVksQ0FBQztRQUNqQyxLQUFLLGdDQUFnQyxDQUFDLEtBQUs7WUFDMUMsT0FBTyxXQUFXLENBQUMsSUFBSSxDQUFDO1FBQ3pCLEtBQUssZ0NBQWdDLENBQUMsT0FBTyxDQUFDO1FBQzlDO1lBQ0MsT0FBTyxXQUFXLENBQUMsTUFBTSxDQUFDO0lBQzVCLENBQUM7QUFDRixDQUFDO0FBVUQ7OztHQUdHO0FBQ0gsTUFBTSxDQUFDLEtBQUssVUFBVSxnQ0FBZ0MsQ0FDckQsT0FBeUMsRUFDekMsY0FBK0IsRUFDL0IsZ0JBQWtELEVBQ2xELFdBQThCLEVBQzlCLGdCQUFxQztJQUVyQyxNQUFNLGdCQUFnQixHQUFHLGdCQUFnQixFQUFFLFlBQVksQ0FBQztJQUN4RCxNQUFNLFVBQVUsR0FBRyxtQkFBbUIsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUNoRCxNQUFNLE1BQU0sR0FBRyxnQkFBZ0IsQ0FBQyxzQkFBc0IsQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUNuRSxNQUFNLEtBQUssR0FBYSxFQUFFLENBQUM7SUFFM0IsS0FBSyxDQUFDLElBQUksQ0FBQywyQkFBMkIsT0FBTyxLQUFLLFVBQVUsTUFBTSxDQUFDLENBQUM7SUFDcEUsS0FBSyxDQUFDLElBQUksQ0FBQyxXQUFXLGdCQUFnQixDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUM7SUFDekYsS0FBSyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsZ0JBQWdCLENBQUMsb0JBQW9CLEVBQUUsRUFBRSxNQUFNLElBQUksUUFBUSxFQUFFLENBQUMsQ0FBQztJQUMxRixLQUFLLENBQUMsSUFBSSxDQUFDLGNBQWMsZ0JBQWdCLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUM1RSxLQUFLLENBQUMsSUFBSSxDQUFDLG9CQUFvQixNQUFNLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7SUFFN0QsaUNBQWlDO0lBQ2pDLElBQUksZ0JBQWdCLEVBQUUsQ0FBQztRQUN0QixLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ2YsS0FBSyxDQUFDLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO1FBQ3JDLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxnQkFBZ0IsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzNDLEtBQUssQ0FBQyxJQUFJLENBQUMsWUFBWSxnQkFBZ0IsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO1FBQ2pELEtBQUssQ0FBQyxJQUFJLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxZQUFZLEVBQUUsQ0FBQyxDQUFDO1FBQ3BFLEtBQUssQ0FBQyxJQUFJLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxZQUFZLEVBQUUsQ0FBQyxDQUFDO1FBQ3BFLEtBQUssQ0FBQyxJQUFJLENBQUMscUJBQXFCLGdCQUFnQixDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsSUFBSSxnQkFBZ0IsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDbEksS0FBSyxDQUFDLElBQUksQ0FBQyx3QkFBd0IsZ0JBQWdCLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLElBQUksZ0JBQWdCLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDM0ksS0FBSyxDQUFDLElBQUksQ0FBQyx5QkFBeUIsZ0JBQWdCLENBQUMsa0JBQWtCLElBQUksS0FBSyxFQUFFLENBQUMsQ0FBQztRQUNwRixLQUFLLENBQUMsSUFBSSxDQUFDLHNCQUFzQixnQkFBZ0IsQ0FBQyxlQUFlLElBQUksUUFBUSxFQUFFLENBQUMsQ0FBQztRQUNqRixLQUFLLENBQUMsSUFBSSxDQUFDLDRCQUE0QixnQkFBZ0IsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLENBQUMsSUFBSSxnQkFBZ0IsQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztJQUN4SixDQUFDO0lBQ0QsS0FBSyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUNmLElBQUksTUFBTSxDQUFDLHFCQUFxQixFQUFFLENBQUM7UUFDbEMsS0FBSyxDQUFDLElBQUksQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO1FBQzVDLEtBQUssTUFBTSxDQUFDLElBQUksTUFBTSxDQUFDLHFCQUFxQixFQUFFLENBQUM7WUFDOUMsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQzdCLENBQUM7SUFDRixDQUFDO1NBQU0sQ0FBQztRQUNQLEtBQUssQ0FBQyxJQUFJLENBQUMscUNBQXFDLENBQUMsQ0FBQztJQUNuRCxDQUFDO0lBQ0QsS0FBSyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUVmLElBQUksZ0JBQWdCLEVBQUUsQ0FBQztRQUN0QixNQUFNLDBCQUEwQixDQUFDLEtBQUssRUFBRSxnQkFBZ0IsRUFBRSxVQUFVLENBQUMsQ0FBQztJQUN2RSxDQUFDO1NBQU0sQ0FBQztRQUNQLE1BQU0sb0JBQW9CLENBQUMsS0FBSyxFQUFFLGNBQWMsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUM5RCxNQUFNLGtCQUFrQixDQUFDLEtBQUssRUFBRSxjQUFjLEVBQUUsVUFBVSxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQ3JFLENBQUM7SUFDRCxpQkFBaUIsQ0FBQyxLQUFLLEVBQUUsV0FBVyxDQUFDLENBQUM7SUFDdEMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7UUFDdkIsTUFBTSxtQkFBbUIsQ0FBQyxLQUFLLEVBQUUsY0FBYyxFQUFFLFVBQVUsQ0FBQyxDQUFDO0lBQzlELENBQUM7SUFFRCxPQUFPLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDekIsQ0FBQztBQUVELEtBQUssVUFBVSwwQkFBMEIsQ0FBQyxLQUFlLEVBQUUsUUFBNEMsRUFBRSxVQUF1QjtJQUMvSCxLQUFLLENBQUMsSUFBSSxDQUFDLGdDQUFnQyxDQUFDLENBQUM7SUFFN0MsTUFBTSxRQUFRLEdBQUcsTUFBTSxRQUFRLENBQUMsZ0NBQWdDLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDekYsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ2YsS0FBSyxDQUFDLElBQUksQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO1FBQzVDLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDZixPQUFPO0lBQ1IsQ0FBQztJQUVELEtBQUssQ0FBQyxJQUFJLENBQUMsZ0NBQWdDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBRTlELDRCQUE0QjtJQUM1QixNQUFNLE1BQU0sR0FBRyxJQUFJLEdBQUcsRUFBMkIsQ0FBQztJQUNsRCxLQUFLLE1BQU0sSUFBSSxJQUFJLFFBQVEsRUFBRSxDQUFDO1FBQzdCLE1BQU0sUUFBUSxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUM3QyxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3BCLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxRQUFRLENBQUMsQ0FBQztJQUNqQyxDQUFDO0lBQ0QsS0FBSyxNQUFNLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJLE1BQU0sRUFBRSxDQUFDO1FBQ3BDLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxJQUFJLEtBQUssS0FBSyxDQUFDLE1BQU0sUUFBUSxDQUFDLENBQUM7UUFDL0MsS0FBSyxNQUFNLElBQUksSUFBSSxLQUFLLEVBQUUsQ0FBQztZQUMxQixLQUFLLENBQUMsSUFBSSxDQUFDLE9BQU8sSUFBSSxDQUFDLElBQUksTUFBTSxJQUFJLENBQUMsR0FBRyxDQUFDLE1BQU0sSUFBSSxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUMzRSxJQUFJLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztnQkFDdEIsS0FBSyxDQUFDLElBQUksQ0FBQyxlQUFlLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDO1lBQy9DLENBQUM7WUFDRCxJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFDbkIsS0FBSyxDQUFDLElBQUksQ0FBQyxtQkFBbUIsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7WUFDaEQsQ0FBQztZQUNELElBQUksSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUNoQixLQUFLLENBQUMsSUFBSSxDQUFDLGdCQUFnQixJQUFJLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQztZQUMxQyxDQUFDO1lBQ0QsSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQ2pCLEtBQUssQ0FBQyxJQUFJLENBQUMsaUJBQWlCLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsS0FBSyxJQUFJLENBQUMsYUFBYSxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDbkcsQ0FBQztZQUNELElBQUksSUFBSSxDQUFDLE9BQU8sS0FBSyxLQUFLLEVBQUUsQ0FBQztnQkFDNUIsS0FBSyxDQUFDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO1lBQ3BDLENBQUM7WUFDRCxLQUFLLENBQUMsSUFBSSxDQUFDLGlCQUFpQixJQUFJLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDaEQsQ0FBQztJQUNGLENBQUM7SUFFRCwwQ0FBMEM7SUFDMUMsTUFBTSxZQUFZLEdBQUcsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssVUFBVSxDQUFDLENBQUM7SUFDakUsS0FBSyxDQUFDLElBQUksQ0FBQyxxQ0FBcUMsVUFBVSxNQUFNLFlBQVksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBQ3ZGLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDaEIsQ0FBQztBQUVELEtBQUssVUFBVSxvQkFBb0IsQ0FBQyxLQUFlLEVBQUUsY0FBK0IsRUFBRSxVQUF1QjtJQUM1RyxLQUFLLENBQUMsSUFBSSxDQUFDLDBDQUEwQyxDQUFDLENBQUM7SUFFdkQsTUFBTSxDQUFDLFVBQVUsRUFBRSxTQUFTLEVBQUUsY0FBYyxDQUFDLEdBQUcsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFDO1FBQ2pFLGNBQWMsQ0FBQyx5QkFBeUIsQ0FBQyxVQUFVLEVBQUUsY0FBYyxDQUFDLEtBQUssRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUM7UUFDbEcsY0FBYyxDQUFDLHlCQUF5QixDQUFDLFVBQVUsRUFBRSxjQUFjLENBQUMsSUFBSSxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQztRQUNqRyxjQUFjLENBQUMseUJBQXlCLENBQUMsVUFBVSxFQUFFLGNBQWMsQ0FBQyxTQUFTLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDO0tBQ3RHLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQyxJQUFJLENBQUMsd0NBQXdDLFVBQVUsQ0FBQyxNQUFNLFFBQVEsQ0FBQyxDQUFDO0lBQzlFLGNBQWMsQ0FBQyxLQUFLLEVBQUUsVUFBVSxDQUFDLENBQUM7SUFFbEMsS0FBSyxDQUFDLElBQUksQ0FBQyx3Q0FBd0MsU0FBUyxDQUFDLE1BQU0sUUFBUSxDQUFDLENBQUM7SUFDN0UsY0FBYyxDQUFDLEtBQUssRUFBRSxTQUFTLENBQUMsQ0FBQztJQUVqQyxLQUFLLENBQUMsSUFBSSxDQUFDLHdDQUF3QyxjQUFjLENBQUMsTUFBTSxRQUFRLENBQUMsQ0FBQztJQUNsRixjQUFjLENBQUMsS0FBSyxFQUFFLGNBQWMsQ0FBQyxDQUFDO0lBRXRDLE1BQU0sUUFBUSxHQUFHLE1BQU0sY0FBYyxDQUFDLGVBQWUsQ0FBQyxVQUFVLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDMUYsS0FBSyxDQUFDLElBQUksQ0FBQyx3Q0FBd0MsUUFBUSxDQUFDLE1BQU0sUUFBUSxDQUFDLENBQUM7SUFFNUUsSUFBSSxVQUFVLEtBQUssV0FBVyxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQzdDLE1BQU0saUJBQWlCLEdBQUcsTUFBTSxjQUFjLENBQUMscUJBQXFCLENBQUMsaUJBQWlCLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQ3hHLEtBQUssQ0FBQyxJQUFJLENBQUMsd0NBQXdDLGlCQUFpQixDQUFDLE1BQU0sUUFBUSxDQUFDLENBQUM7UUFDckYsY0FBYyxDQUFDLEtBQUssRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO0lBQzFDLENBQUM7SUFFRCxJQUFJLFVBQVUsS0FBSyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDdEMsTUFBTSxNQUFNLEdBQUcsTUFBTSxjQUFjLENBQUMsZUFBZSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzVFLEtBQUssQ0FBQyxJQUFJLENBQUMsd0NBQXdDLE1BQU0sRUFBRSxNQUFNLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUNqRixLQUFLLE1BQU0sQ0FBQyxJQUFJLE1BQU0sSUFBSSxFQUFFLEVBQUUsQ0FBQztZQUM5QixLQUFLLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksSUFBSSxHQUFHLEtBQUssQ0FBQyxDQUFDLE9BQU8sS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDbkUsQ0FBQztJQUNGLENBQUM7SUFFRCxJQUFJLFVBQVUsS0FBSyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDdEMsTUFBTSxNQUFNLEdBQUcsTUFBTSxjQUFjLENBQUMsZUFBZSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzVFLEtBQUssQ0FBQyxJQUFJLENBQUMsd0NBQXdDLE1BQU0sQ0FBQyxNQUFNLFNBQVMsQ0FBQyxDQUFDO1FBQzNFLEtBQUssTUFBTSxDQUFDLElBQUksTUFBTSxFQUFFLENBQUM7WUFDeEIsS0FBSyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxPQUFPLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQ25FLENBQUM7SUFDRixDQUFDO0lBRUQsSUFBSSxVQUFVLEtBQUssV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ3ZDLE1BQU0sUUFBUSxHQUFHLE1BQU0sY0FBYyxDQUFDLHNCQUFzQixDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3JGLEtBQUssQ0FBQyxJQUFJLENBQUMsd0NBQXdDLFFBQVEsQ0FBQyxNQUFNLFdBQVcsQ0FBQyxDQUFDO1FBQy9FLEtBQUssTUFBTSxDQUFDLElBQUksUUFBUSxFQUFFLENBQUM7WUFDMUIsS0FBSyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLE9BQU8sS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sVUFBVSxDQUFDLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQztRQUM5RSxDQUFDO0lBQ0YsQ0FBQztJQUVELEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDaEIsQ0FBQztBQUVELEtBQUssVUFBVSxrQkFBa0IsQ0FBQyxLQUFlLEVBQUUsY0FBK0IsRUFBRSxVQUF1QixFQUFFLE1BQTRCO0lBQ3hJLEtBQUssQ0FBQyxJQUFJLENBQUMsaURBQWlELENBQUMsQ0FBQztJQUU5RCxNQUFNLENBQUMsVUFBVSxFQUFFLFNBQVMsRUFBRSxjQUFjLENBQUMsR0FBRyxNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQUM7UUFDakUsY0FBYyxDQUFDLHlCQUF5QixDQUFDLFVBQVUsRUFBRSxjQUFjLENBQUMsS0FBSyxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQztRQUNsRyxjQUFjLENBQUMseUJBQXlCLENBQUMsVUFBVSxFQUFFLGNBQWMsQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDO1FBQ2pHLGNBQWMsQ0FBQyx5QkFBeUIsQ0FBQyxVQUFVLEVBQUUsY0FBYyxDQUFDLFNBQVMsRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUM7S0FDdEcsQ0FBQyxDQUFDO0lBRUgsTUFBTSxHQUFHLEdBQWtCLENBQUMsR0FBRyxVQUFVLEVBQUUsR0FBRyxTQUFTLEVBQUUsR0FBRyxjQUFjLENBQUMsQ0FBQztJQUM1RSxNQUFNLFFBQVEsR0FBRyx3QkFBd0IsQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDdkQsS0FBSyxDQUFDLElBQUksQ0FBQyxZQUFZLEdBQUcsQ0FBQyxNQUFNLGdCQUFnQixRQUFRLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUNwRSxLQUFLLENBQUMsSUFBSSxDQUFDLGtCQUFrQixRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sS0FBSyxjQUFjLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUNoRyxLQUFLLENBQUMsSUFBSSxDQUFDLGtCQUFrQixRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sS0FBSyxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUMvRixLQUFLLENBQUMsSUFBSSxDQUFDLGtCQUFrQixRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sS0FBSyxjQUFjLENBQUMsU0FBUyxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUVwRyxNQUFNLFlBQVksR0FBRyxHQUFHLENBQUMsTUFBTSxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUM7SUFDbEQsSUFBSSxZQUFZLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDdEIsTUFBTSxZQUFZLEdBQUcsSUFBSSxHQUFHLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2xFLE1BQU0sT0FBTyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDckUsS0FBSyxDQUFDLElBQUksQ0FBQyxjQUFjLFlBQVksSUFBSSxDQUFDLENBQUM7UUFDM0MsS0FBSyxNQUFNLENBQUMsSUFBSSxPQUFPLEVBQUUsQ0FBQztZQUN6QixLQUFLLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLE9BQU8sS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDbEQsQ0FBQztJQUNGLENBQUM7SUFFRCxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQ2hCLENBQUM7QUFFRCxTQUFTLGlCQUFpQixDQUFDLEtBQWUsRUFBRSxLQUF3QjtJQUNuRSxLQUFLLENBQUMsSUFBSSxDQUFDLHlEQUF5RCxDQUFDLENBQUM7SUFDdEUsS0FBSyxDQUFDLElBQUksQ0FBQyxpQ0FBaUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBQ3JFLEtBQUssQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEtBQUssQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sS0FBSyxjQUFjLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUN0RyxLQUFLLENBQUMsSUFBSSxDQUFDLGtCQUFrQixLQUFLLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLEtBQUssY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7SUFDckcsS0FBSyxDQUFDLElBQUksQ0FBQyxrQkFBa0IsS0FBSyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxLQUFLLGNBQWMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBQzFHLEtBQUssQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEtBQUssQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sS0FBSyxjQUFjLENBQUMsTUFBTSxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUV2RywrQ0FBK0M7SUFDL0MsS0FBSyxNQUFNLElBQUksSUFBSSxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDbkMsS0FBSyxDQUFDLElBQUksQ0FBQyxTQUFTLElBQUksQ0FBQyxJQUFJLGFBQWEsSUFBSSxDQUFDLE9BQU8sSUFBSSxHQUFHLGNBQWMsSUFBSSxDQUFDLFFBQVEsSUFBSSxRQUFRLEdBQUcsQ0FBQyxDQUFDO0lBQzFHLENBQUM7SUFFRCxLQUFLLENBQUMsSUFBSSxDQUFDLHlDQUF5QyxLQUFLLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7SUFDbkYsTUFBTSxXQUFXLEdBQUcsS0FBSyxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLFdBQVcsQ0FBQyxDQUFDO0lBQzdFLEtBQUssQ0FBQyxJQUFJLENBQUMseUJBQXlCLFdBQVcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBQzFELE1BQU0sWUFBWSxHQUFHLEtBQUssQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxjQUFjLENBQUMsQ0FBQztJQUNqRixLQUFLLE1BQU0sQ0FBQyxJQUFJLFlBQVksRUFBRSxDQUFDO1FBQzlCLEtBQUssQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUMsS0FBSyxZQUFZLENBQUMsQ0FBQyxLQUFLLGVBQWUsQ0FBQyxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUM7SUFDbEYsQ0FBQztJQUNELEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDaEIsQ0FBQztBQUVELEtBQUssVUFBVSxtQkFBbUIsQ0FBQyxLQUFlLEVBQUUsY0FBK0IsRUFBRSxVQUF1QjtJQUMzRyxLQUFLLENBQUMsSUFBSSxDQUFDLDJDQUEyQyxDQUFDLENBQUM7SUFDeEQsTUFBTSxhQUFhLEdBQUcsTUFBTSxjQUFjLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDeEUsS0FBSyxNQUFNLEVBQUUsSUFBSSxhQUFhLEVBQUUsQ0FBQztRQUNoQyxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLE9BQU8sS0FBSyxFQUFFLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7SUFDbEQsQ0FBQztJQUVELElBQUksQ0FBQztRQUNKLE1BQU0sZUFBZSxHQUFHLE1BQU0sY0FBYyxDQUFDLHdCQUF3QixDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ2xGLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDZixLQUFLLENBQUMsSUFBSSxDQUFDLG1EQUFtRCxDQUFDLENBQUM7UUFDaEUsS0FBSyxNQUFNLEVBQUUsSUFBSSxlQUFlLEVBQUUsQ0FBQztZQUNsQyxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLE9BQU8sS0FBSyxFQUFFLENBQUMsR0FBRyxDQUFDLE1BQU0sWUFBWSxFQUFFLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztRQUN4RSxDQUFDO0lBQ0YsQ0FBQztJQUFDLE1BQU0sQ0FBQztRQUNSLHVEQUF1RDtJQUN4RCxDQUFDO0FBQ0YsQ0FBQztBQUVELFNBQVMsY0FBYyxDQUFDLEtBQWUsRUFBRSxLQUE4QjtJQUN0RSxLQUFLLE1BQU0sQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDO1FBQ3ZCLEtBQUssQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7SUFDbkMsQ0FBQztBQUNGLENBQUMifQ==