/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { isEqualOrParent } from '../../../../base/common/resources.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { PromptsType } from './promptSyntax/promptTypes.js';
import { IChatPromptSlashCommand, PromptsStorage } from './promptSyntax/service/promptsService.js';

export const IAICustomizationWorkspaceService = createDecorator<IAICustomizationWorkspaceService>('aiCustomizationWorkspaceService');

/**
 * Extended storage type for AI Customization that includes built-in prompts
 * shipped with the application, alongside the core `PromptsStorage` values.
 */
export type AICustomizationPromptsStorage = PromptsStorage | 'builtin';

/**
 * Storage type discriminator for built-in customizations shipped with the application.
 */
export const BUILTIN_STORAGE: AICustomizationPromptsStorage = 'builtin';

/**
 * Possible section IDs for the AI Customization Management Editor sidebar.
 */
export const AICustomizationManagementSection = {
	Agents: 'agents',
	Skills: 'skills',
	Instructions: 'instructions',
	Prompts: 'prompts',
	Hooks: 'hooks',
	McpServers: 'mcpServers',
	Plugins: 'plugins',
	Models: 'models',
} as const;

export type AICustomizationManagementSection = typeof AICustomizationManagementSection[keyof typeof AICustomizationManagementSection];

/**
 * Per-type filter policy controlling which storage sources and user file
 * roots are visible for a given customization type.
 */
export interface IStorageSourceFilter {
	/**
	 * Which storage groups to display (e.g. workspace, user, extension, builtin).
	 */
	readonly sources: readonly string[];

	/**
	 * If set, only user files under these roots are shown (allowlist).
	 * If `undefined`, all user file roots are included.
	 */
	readonly includedUserFileRoots?: readonly URI[];
}

/**
 * Controls which features are shown on the welcome page of the
 * AI Customization Management Editor.
 */
export interface IWelcomePageFeatures {
	/** Show the "Configure Your AI" getting-started banner. */
	readonly showGettingStartedBanner: boolean;
}

/**
 * Applies a storage source filter to an array of items that have uri and storage.
 * Removes items whose storage is not in the filter's source list,
 * and for user-storage items, removes those not under an allowed root.
 */
export function applyStorageSourceFilter<T extends { readonly uri: URI; readonly storage: string }>(items: readonly T[], filter: IStorageSourceFilter): readonly T[] {
	const sourceSet = new Set(filter.sources);
	return items.filter(item => {
		if (!sourceSet.has(item.storage)) {
			return false;
		}
		if (item.storage === PromptsStorage.user && filter.includedUserFileRoots) {
			return filter.includedUserFileRoots.some(root => isEqualOrParent(item.uri, root));
		}
		return true;
	});
}

/**
 * Provides workspace context for AI Customization views.
 */
export interface IAICustomizationWorkspaceService {
	readonly _serviceBrand: undefined;

	/**
	 * Observable that fires when the active project root changes.
	 */
	readonly activeProjectRoot: IObservable<URI | undefined>;

	/**
	 * Returns the current active project root, if any.
	 */
	getActiveProjectRoot(): URI | undefined;

	/**
	 * The sections to show in the AI Customization Management Editor sidebar.
	 */
	readonly managementSections: readonly AICustomizationManagementSection[];

	/**
	 * Returns the storage source filter for a given customization type.
	 * Controls which storage groups and user file roots are visible.
	 */
	getStorageSourceFilter(type: PromptsType): IStorageSourceFilter;

	/**
	 * Whether this is a sessions window (vs core VS Code).
	 */
	readonly isSessionsWindow: boolean;

	/**
	 * Controls which features are displayed on the welcome page.
	 */
	readonly welcomePageFeatures: IWelcomePageFeatures;

	/**
	 * Commits files in the active project.
	 */
	commitFiles(projectRoot: URI, fileUris: URI[]): Promise<void>;

	/**
	 * Commits the deletion of resources that have already been removed from disk.
	 * The URIs may point to individual files or to directories (for example, when
	 * deleting a skill, the entire customization folder is removed). Implementations
	 * should ensure that directory deletions are handled recursively as needed.
	 * In sessions this stages and commits the removal in the relevant repositories.
	 */
	deleteFiles(projectRoot: URI, fileUris: URI[]): Promise<void>;

	/**
	 * Launches the AI-guided creation flow for the given customization type.
	 */
	generateCustomization(type: PromptsType): Promise<void>;

	/**
	 * Whether a transient project root override is currently active.
	 */
	readonly hasOverrideProjectRoot: IObservable<boolean>;

	/**
	 * Sets a transient override for the active project root.
	 * While set, `activeProjectRoot` returns this value instead of the
	 * session- or workspace-derived root. Call `clearOverrideProjectRoot()` to revert.
	 */
	setOverrideProjectRoot(root: URI): void;

	/**
	 * Clears the transient project root override, reverting to the
	 * session-derived (or workspace-derived) root.
	 */
	clearOverrideProjectRoot(): void;

	/**
	 * Returns prompt/skill slash commands filtered through the workspace
	 * service's storage source policy, ensuring the results match the
	 * customizations visible in the AI Customization views.
	 */
	getFilteredPromptSlashCommands(token: CancellationToken): Promise<readonly IChatPromptSlashCommand[]>;

	/**
	 * Returns a map of built-in skill names that have direct UI integrations
	 * (toolbar buttons, menu items, etc.) to a tooltip describing the
	 * integration. Used to display a 'UI Integration' badge in the
	 * customizations editor, especially important when users override a
	 * built-in skill that drives a UI surface.
	 */
	getSkillUIIntegrations(): ReadonlyMap<string, string>;
}
