/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { IPromptsService, PromptsStorage, IPromptPath } from '../../common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { IAICustomizationWorkspaceService, applyStorageSourceFilter, IStorageSourceFilter } from '../../common/aiCustomizationWorkspaceService.js';
import { AICustomizationManagementSection } from './aiCustomizationManagement.js';

/**
 * Maps section ID to prompt type. Duplicated from aiCustomizationListWidget
 * to avoid a circular dependency.
 */
function sectionToPromptType(section: AICustomizationManagementSection): PromptsType {
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
 * Snapshot of the list widget's internal state, passed in to avoid coupling.
 */
export interface IDebugWidgetState {
	readonly allItems: readonly { readonly storage: PromptsStorage }[];
	readonly displayEntries: readonly { type: string; label?: string; count?: number; collapsed?: boolean }[];
}

/**
 * Generates a debug diagnostics report for the AI Customization list widget.
 * Returns the report as a string suitable for opening in an editor.
 */
export async function generateCustomizationDebugReport(
	section: AICustomizationManagementSection,
	promptsService: IPromptsService,
	workspaceService: IAICustomizationWorkspaceService,
	widgetState: IDebugWidgetState,
): Promise<string> {
	const promptType = sectionToPromptType(section);
	const filter = workspaceService.getStorageSourceFilter(promptType);
	const lines: string[] = [];

	lines.push(`== Customization Debug: ${section} (${promptType}) ==`);
	lines.push(`Window: ${workspaceService.isSessionsWindow ? 'Sessions' : 'Core VS Code'}`);
	lines.push(`Active root: ${workspaceService.getActiveProjectRoot()?.fsPath ?? '(none)'}`);
	lines.push(`Sections: [${workspaceService.managementSections.join(', ')}]`);
	lines.push(`Filter sources: [${filter.sources.join(', ')}]`);
	if (filter.includedUserFileRoots) {
		lines.push(`Filter includedUserFileRoots:`);
		for (const r of filter.includedUserFileRoots) {
			lines.push(`  ${r.fsPath}`);
		}
	} else {
		lines.push(`Filter includedUserFileRoots: (all)`);
	}
	lines.push('');

	await appendRawServiceData(lines, promptsService, promptType);
	await appendFilteredData(lines, promptsService, promptType, filter);
	appendWidgetState(lines, widgetState);
	await appendSourceFolders(lines, promptsService, promptType);

	return lines.join('\n');
}

async function appendRawServiceData(lines: string[], promptsService: IPromptsService, promptType: PromptsType): Promise<void> {
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
			lines.push(`    /${c.name} [${c.promptPath.storage}] ${c.promptPath.uri.fsPath} (type=${c.promptPath.type})`);
		}
	}

	lines.push('');
}

async function appendFilteredData(lines: string[], promptsService: IPromptsService, promptType: PromptsType, filter: IStorageSourceFilter): Promise<void> {
	lines.push('--- Stage 2: After applyStorageSourceFilter ---');

	const [localFiles, userFiles, extensionFiles] = await Promise.all([
		promptsService.listPromptFilesForStorage(promptType, PromptsStorage.local, CancellationToken.None),
		promptsService.listPromptFilesForStorage(promptType, PromptsStorage.user, CancellationToken.None),
		promptsService.listPromptFilesForStorage(promptType, PromptsStorage.extension, CancellationToken.None),
	]);

	const all: IPromptPath[] = [...localFiles, ...userFiles, ...extensionFiles];
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

function appendWidgetState(lines: string[], state: IDebugWidgetState): void {
	lines.push('--- Stage 3: Widget State (loadItems → filterItems) ---');
	lines.push(`  allItems (after loadItems): ${state.allItems.length}`);
	lines.push(`    local:     ${state.allItems.filter(i => i.storage === PromptsStorage.local).length}`);
	lines.push(`    user:      ${state.allItems.filter(i => i.storage === PromptsStorage.user).length}`);
	lines.push(`    extension: ${state.allItems.filter(i => i.storage === PromptsStorage.extension).length}`);
	lines.push(`    plugin:    ${state.allItems.filter(i => i.storage === PromptsStorage.plugin).length}`);

	lines.push(`  displayEntries (after filterItems): ${state.displayEntries.length}`);
	const fileEntries = state.displayEntries.filter(e => e.type === 'file-item');
	lines.push(`    file items shown: ${fileEntries.length}`);
	const groupEntries = state.displayEntries.filter(e => e.type === 'group-header');
	for (const g of groupEntries) {
		lines.push(`    group "${g.label}": count=${g.count}, collapsed=${g.collapsed}`);
	}
	lines.push('');
}

async function appendSourceFolders(lines: string[], promptsService: IPromptsService, promptType: PromptsType): Promise<void> {
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
	} catch {
		// getResolvedSourceFolders may not exist for all types
	}
}

function appendFileList(lines: string[], files: readonly { uri: URI }[]): void {
	for (const f of files) {
		lines.push(`    ${f.uri.fsPath}`);
	}
}
