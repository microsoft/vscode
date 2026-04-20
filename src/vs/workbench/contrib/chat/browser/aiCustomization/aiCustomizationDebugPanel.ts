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
import { ICustomizationItemProvider, IHarnessDescriptor } from '../../common/customizationHarnessService.js';

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
	readonly allItems: readonly { readonly name?: string; readonly storage?: PromptsStorage; readonly groupKey?: string }[];
	readonly displayEntries: readonly { type: string; label?: string; count?: number; collapsed?: boolean }[];
}

/**
 * Generates a debug diagnostics report for the AI Customization list widget.
 *
 * The report follows the unified pipeline:
 *   1. Provider output — what the active provider returns
 *   2. Raw PromptsService data — lower-level service output (when no extension provider)
 *   3. Widget state — normalized items and display entries after grouping
 *   4. Source folders — where files are discovered from
 */
export async function generateCustomizationDebugReport(
	section: AICustomizationManagementSection,
	promptsService: IPromptsService,
	workspaceService: IAICustomizationWorkspaceService,
	widgetState: IDebugWidgetState,
	activeDescriptor?: IHarnessDescriptor,
	promptsServiceItemProvider?: ICustomizationItemProvider,
): Promise<string> {
	const promptType = sectionToPromptType(section);
	const filter = workspaceService.getStorageSourceFilter(promptType);
	const lines: string[] = [];

	lines.push(`== Customization Debug: ${section} (${promptType}) ==`);
	lines.push(`Window: ${workspaceService.isSessionsWindow ? 'Sessions' : 'Core VS Code'}`);
	lines.push(`Active root: ${workspaceService.getActiveProjectRoot()?.fsPath ?? '(none)'}`);
	lines.push(`Sections: [${workspaceService.managementSections.join(', ')}]`);
	lines.push(`Filter sources: [${filter.sources.join(', ')}]`);

	// Active harness descriptor
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
	} else {
		lines.push(`Filter includedUserFileRoots: (all)`);
	}
	lines.push('');

	// Determine which provider the widget actually uses (mirrors getItemSource logic)
	const extensionProvider = activeDescriptor?.itemProvider;
	const hasSyncProvider = !!activeDescriptor?.syncProvider;
	const effectiveProvider = extensionProvider ?? (hasSyncProvider ? undefined : promptsServiceItemProvider);

	// Stage 1: Provider output
	if (effectiveProvider) {
		let providerLabel: string;
		if (extensionProvider) {
			providerLabel = 'Extension Provider';
		} else {
			providerLabel = 'PromptsService Adapter (fallback — no extension provider registered)';
		}
		await appendProviderData(lines, effectiveProvider, promptType, providerLabel);
	} else if (hasSyncProvider) {
		lines.push('--- Stage 1: No item provider (sync-only harness) ---');
		lines.push('');
	} else {
		lines.push('--- Stage 1: No provider available ---');
		lines.push('');
	}

	// Stage 2: Raw PromptsService data — always useful for diagnostics
	if (!extensionProvider) {
		await appendRawServiceData(lines, promptsService, promptType);
		await appendFilteredData(lines, promptsService, promptType, filter);
	}

	// Stage 3: Widget state
	appendWidgetState(lines, widgetState);

	// Stage 4: Source folders
	await appendSourceFolders(lines, promptsService, promptType);

	return lines.join('\n');
}

async function appendProviderData(lines: string[], provider: ICustomizationItemProvider, promptType: PromptsType, label: string): Promise<void> {
	lines.push(`--- Stage 1: Provider Output (${label}) ---`);

	const allItems = await provider.provideChatSessionCustomizations(CancellationToken.None);
	if (!allItems) {
		lines.push('  Provider returned undefined');
		lines.push('');
		return;
	}

	lines.push(`  Total items from provider: ${allItems.length}`);

	// Group by type for summary
	const byType = new Map<string, typeof allItems>();
	for (const item of allItems) {
		const existing = byType.get(item.type) ?? [];
		existing.push(item);
		byType.set(item.type, existing);
	}
	for (const [type, items] of byType) {
		lines.push(`  ${type}: ${items.length} items`);
		for (const item of items) {
			const path = item.uri.scheme === 'file' ? item.uri.fsPath : item.uri.toString();
			lines.push(`    ${item.name} — ${path}`);
			if (item.description) {
				lines.push(`      desc: ${item.description}`);
			}
			if (item.storage) {
				lines.push(`      storage: ${item.storage}`);
			}
			if (item.groupKey) {
				lines.push(`      groupKey: ${item.groupKey}`);
			}
			if (item.extensionLabel) {
				lines.push(`      extensionLabel: ${item.extensionLabel}`);
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
		}
	}

	const sectionItems = allItems.filter(i => i.type === promptType);
	lines.push(`  Items matching current section (${promptType}): ${sectionItems.length}`);
	lines.push('');
}

async function appendRawServiceData(lines: string[], promptsService: IPromptsService, promptType: PromptsType): Promise<void> {
	lines.push('--- Stage 2a: Raw PromptsService Data ---');

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

async function appendFilteredData(lines: string[], promptsService: IPromptsService, promptType: PromptsType, filter: IStorageSourceFilter): Promise<void> {
	lines.push('--- Stage 2b: After applyStorageSourceFilter ---');

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

async function appendSourceFolders(lines: string[], promptsService: IPromptsService, promptType: PromptsType): Promise<void> {
	lines.push('--- Stage 4: Source Folders (creation targets) ---');
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
