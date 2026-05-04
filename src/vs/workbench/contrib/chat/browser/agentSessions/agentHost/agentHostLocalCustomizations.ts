/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { basename, isEqualOrParent } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { type URI as ProtocolURI } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { type CustomizationRef } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { AICustomizationPromptsStorage, BUILTIN_STORAGE } from '../../../common/aiCustomizationWorkspaceService.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { IPromptPath, IPromptsService, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { type ICustomizationSyncProvider, type ICustomizationItem, type ICustomizationItemProvider } from '../../../common/customizationHarnessService.js';
import { IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { getFriendlyName } from '../../aiCustomization/aiCustomizationItemSource.js';
import type { SyncedCustomizationBundler } from './syncedCustomizationBundler.js';
import { getSkillFolderName } from '../../../common/promptSyntax/config/promptFileLocations.js';

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
	PromptsStorage.local,
	PromptsStorage.user,
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
		result.push({
			uri: file.uri,
			type: PromptsType.skill,
			storage: BUILTIN_STORAGE,
			disabled: syncProvider.isDisabled(file.uri),
		});
	}

	return result;
}

/**
 * {@link ICustomizationItemProvider} that surfaces an agent host
 * harness's local customizations as items in the AI Customization view.
 *
 * Each enumerated file is emitted as an {@link ICustomizationItem} with
 * `enabled = !syncProvider.isDisabled(uri)`, so the standard disable
 * affordance in the list widget reflects (and toggles) the
 * per-harness opt-out.
 */
export class LocalAgentHostCustomizationItemProvider extends Disposable implements ICustomizationItemProvider {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	constructor(
		private readonly _promptsService: IPromptsService,
		private readonly _syncProvider: ICustomizationSyncProvider,
	) {
		super();
		this._register(this._syncProvider.onDidChange(() => this._onDidChange.fire()));
		this._register(Event.any(
			this._promptsService.onDidChangeCustomAgents,
			this._promptsService.onDidChangeSlashCommands,
			this._promptsService.onDidChangeSkills,
			this._promptsService.onDidChangeInstructions,
		)(() => this._onDidChange.fire()));
	}

	async provideChatSessionCustomizations(token: CancellationToken): Promise<ICustomizationItem[]> {
		const [enumerated, skills] = await Promise.all([
			enumerateLocalCustomizationsForHarness(this._promptsService, this._syncProvider, token),
			this._promptsService.findAgentSkills(token),
		]);
		if (token.isCancellationRequested) {
			return [];
		}
		// Skill files are conventionally named SKILL.md inside a per-skill
		// folder, so the filename is not a useful display name. Look up the
		// parsed skill metadata (name + description from frontmatter) and
		// fall back to the parent folder name when a skill failed to parse.
		const skillByUri = new ResourceMap<{ name: string; description: string | undefined; userInvocable?: boolean }>();
		for (const skill of skills ?? []) {
			skillByUri.set(skill.uri, { name: skill.name, description: skill.description, userInvocable: skill.userInvocable });
		}
		return enumerated.map(file => {
			let name: string;
			let description: string | undefined;
			let userInvocable: boolean | undefined;
			if (file.type === PromptsType.skill) {
				const parsed = skillByUri.get(file.uri);
				name = parsed?.name ?? getSkillFolderName(file.uri);
				description = parsed?.description;
				userInvocable = parsed?.userInvocable;
			} else {
				name = getFriendlyName(basename(file.uri));
			}
			return {
				uri: file.uri,
				type: file.type,
				name,
				description,
				// Cast through the wider storage union: built-in skills use
				// `BUILTIN_STORAGE`, which is not a `PromptsStorage` enum
				// member but is recognized by the AI Customization view.
				storage: file.storage as PromptsStorage,
				enabled: !file.disabled,
				extensionId: file.extensionId,
				pluginUri: file.pluginUri,
				userInvocable
			};
		});
	}
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
): Promise<CustomizationRef[]> {
	const enumerated = await enumerateLocalCustomizationsForHarness(promptsService, syncProvider, CancellationToken.None);
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
