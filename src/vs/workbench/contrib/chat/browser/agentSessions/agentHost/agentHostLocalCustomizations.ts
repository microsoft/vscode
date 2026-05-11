/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { isEqualOrParent } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { type URI as ProtocolURI } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { type CustomizationRef } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { AICustomizationPromptsStorage, BUILTIN_STORAGE } from '../../../common/aiCustomizationWorkspaceService.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { IPromptPath, IPromptsService, matchesSessionType, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { type ICustomizationSyncProvider } from '../../../common/customizationHarnessService.js';
import { IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import type { SyncedCustomizationBundler } from './syncedCustomizationBundler.js';

/**
 * Prompt types that participate in auto-sync to an agent host harness.
 *
 * Hooks are intentionally excluded — bundling hooks requires merging into
 * `hooks/hooks.json` (see {@link SyncedCustomizationBundler}).
 */
export const SYNCABLE_PROMPT_TYPES: readonly PromptsType[] = [
	PromptsType.agent,
	PromptsType.skill,
	PromptsType.instructions,
	PromptsType.prompt,
];

/**
 * Storage sources whose contents are auto-synced. Extension and built-in
 * customizations are included so the agent host has the same skills,
 * instructions, and agents available as the local VS Code client.
 */
export const SYNCABLE_STORAGE_SOURCES: readonly PromptsStorage[] = [
	PromptsStorage.plugin,
	PromptsStorage.extension,
];

export interface ILocalCustomizationFile {
	readonly uri: URI;
	readonly type: PromptsType;
	readonly storage: AICustomizationPromptsStorage;
	readonly disabled: boolean;
	readonly pluginUri?: URI;
	readonly extensionId?: string;
}

/**
 * Enumerates all local customization files eligible for auto-sync to an
 * agent host harness, annotating each with whether the user has opted out.
 *
 * This is the single source of truth used by both the AI Customization view
 * (to render disable affordances) and the agent host wire (to compute the
 * `customizations` set published via `activeClientChanged`).
 *
 * Built-in skills bundled with the Agents app (only present when the
 * sessions-aware prompts service is in play) are also enumerated so that
 * `/create-pr`, `/merge`, etc. are available to every agent host without
 * any per-provider plumbing. In the regular VS Code workbench window the
 * built-in lookup returns nothing and this is a no-op.
 */
export async function enumerateLocalCustomizationsForHarness(
	promptsService: IPromptsService,
	syncProvider: ICustomizationSyncProvider,
	sessionType: string,
	token: CancellationToken,
): Promise<readonly ILocalCustomizationFile[]> {
	const result: ILocalCustomizationFile[] = [];
	for (const type of SYNCABLE_PROMPT_TYPES) {
		const lists = await Promise.all(
			SYNCABLE_STORAGE_SOURCES.map(storage => promptsService.listPromptFilesForStorage(type, storage, token)),
		);
		for (let i = 0; i < lists.length; i++) {
			const storage = SYNCABLE_STORAGE_SOURCES[i];
			for (const file of lists[i]) {
				if (matchesSessionType(file.sessionTypes, sessionType)) {
					result.push({
						uri: file.uri,
						type,
						storage,
						pluginUri: file.pluginUri,
						extensionId: file.extension?.identifier.value,
						disabled: syncProvider.isDisabled(file.uri),
					});
				}
			}
		}
	}

	// Built-in skills (e.g. `/create-pr`, `/merge`) are exposed via
	// `BUILTIN_STORAGE`, which is not a member of the core `PromptsStorage`
	// enum. The sessions-aware prompts service supports this extra storage,
	// but the regular workbench prompts service throws on unknown storage
	// values; treat that case as "no built-in skills available" so
	// enumeration remains a no-op outside Sessions.
	let builtinSkills: readonly IPromptPath[] = [];
	try {
		builtinSkills = await promptsService.listPromptFilesForStorage(
			PromptsType.skill,
			BUILTIN_STORAGE as unknown as PromptsStorage,
			token,
		);
	} catch {
		builtinSkills = [];
	}
	for (const file of builtinSkills) {
		if (matchesSessionType(file.sessionTypes, sessionType)) {
			result.push({
				uri: file.uri,
				type: PromptsType.skill,
				storage: BUILTIN_STORAGE,
				disabled: syncProvider.isDisabled(file.uri),
			});
		}
	}

	return result;
}

/**
 * Resolves the customization refs to include in an `activeClientChanged`
 * message.
 *
 * Every eligible local file is synced unless the user opted out. Files
 * belonging to installed plugins are de-duped to a single plugin ref;
 * remaining loose files are bundled into a synthetic Open Plugin.
 */
export async function resolveCustomizationRefs(
	promptsService: IPromptsService,
	syncProvider: ICustomizationSyncProvider,
	agentPluginService: IAgentPluginService,
	bundler: SyncedCustomizationBundler,
	sessionType: string,
): Promise<CustomizationRef[]> {
	const enumerated = await enumerateLocalCustomizationsForHarness(promptsService, syncProvider, sessionType, CancellationToken.None);
	const enabled = enumerated.filter(e => !e.disabled);
	if (enabled.length === 0) {
		return [];
	}

	const plugins = agentPluginService.plugins.get();
	const pluginRefs = new Map<string, CustomizationRef>();
	const looseFiles: { uri: URI; type: PromptsType }[] = [];

	for (const entry of enabled) {
		if (entry.storage === PromptsStorage.plugin) {
			const plugin = plugins.find(p => isEqualOrParent(entry.uri, p.uri));
			if (!plugin) {
				continue;
			}
			if (syncProvider.isDisabled(plugin.uri)) {
				continue;
			}
			const key = plugin.uri.toString();
			if (!pluginRefs.has(key)) {
				pluginRefs.set(key, { uri: key as ProtocolURI, displayName: plugin.label });
			}
		} else {
			looseFiles.push({ uri: entry.uri, type: entry.type });
		}
	}

	const refs: CustomizationRef[] = [...pluginRefs.values()];
	if (looseFiles.length > 0) {
		const result = await bundler.bundle(looseFiles);
		if (result) {
			refs.push(result.ref);
		}
	}
	return refs;
}
