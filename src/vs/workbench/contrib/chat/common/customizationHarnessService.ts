/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { constObservable, IObservable, ISettableObservable, observableValue } from '../../../../base/common/observable.js';
import { joinPath } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { AICustomizationManagementSection, IStorageSourceFilter } from './aiCustomizationWorkspaceService.js';
import { PromptsType } from './promptSyntax/promptTypes.js';
import { PromptsStorage } from './promptSyntax/service/promptsService.js';

export const ICustomizationHarnessService = createDecorator<ICustomizationHarnessService>('customizationHarnessService');

/**
 * Identifies the AI harness (execution environment) that customizations
 * are filtered for. Storage answers "where did this come from?"; harness
 * answers "who consumes it?".
 */
export enum CustomizationHarness {
	VSCode = 'vscode',
	CLI = 'cli',
	Claude = 'claude',
}

/**
 * Describes a single harness option for the UI toggle.
 */
export interface IHarnessDescriptor {
	readonly id: CustomizationHarness;
	readonly label: string;
	readonly icon: ThemeIcon;
	/**
	 * Management sections that should be hidden when this harness is active.
	 * For example, Claude does not support custom agents so the Agents
	 * section is hidden.
	 */
	readonly hiddenSections?: readonly string[];
	/**
	 * Workspace sub-paths that this harness recognizes for file creation.
	 * When set, the directory picker for new customization files only offers
	 * workspace directories under these sub-paths (e.g. `.claude` for Claude).
	 * When `undefined`, all workspace directories are shown (Local harness).
	 */
	readonly workspaceSubpaths?: readonly string[];
	/**
	 * Returns the storage source filter that should be applied to customization
	 * items of the given type when this harness is active.
	 */
	getStorageSourceFilter(type: PromptsType): IStorageSourceFilter;
}

/**
 * Service that manages the active customization harness and provides
 * per-type storage source filters based on the selected harness.
 *
 * The default (core) registration exposes a single "VS Code" harness
 * that shows all storage sources. The sessions window overrides this
 * to provide CLI-scoped harnesses.
 */
export interface ICustomizationHarnessService {
	readonly _serviceBrand: undefined;

	/**
	 * The currently active harness.
	 */
	readonly activeHarness: IObservable<CustomizationHarness>;

	/**
	 * All harnesses available in this window.
	 * When only one harness is available the UI should hide the toggle.
	 */
	readonly availableHarnesses: IObservable<readonly IHarnessDescriptor[]>;

	/**
	 * Changes the active harness. The new id must be present in
	 * `availableHarnesses`.
	 */
	setActiveHarness(id: CustomizationHarness): void;

	/**
	 * Convenience: returns the storage source filter for the active harness
	 * and the given customization type.
	 */
	getStorageSourceFilter(type: PromptsType): IStorageSourceFilter;

	/**
	 * Returns the descriptor of the currently active harness.
	 */
	getActiveDescriptor(): IHarnessDescriptor;
}

// #region Shared filter constants

/**
 * Hooks are always restricted to local + plugin sources regardless of harness.
 */
const HOOKS_FILTER: IStorageSourceFilter = {
	sources: [PromptsStorage.local, PromptsStorage.plugin],
};

// #endregion

// #region Well-known user directories

/**
 * Returns the user-home directories accessible to the Copilot CLI harness.
 */
export function getCliUserRoots(userHome: URI): readonly URI[] {
	return [
		joinPath(userHome, '.copilot'),
		joinPath(userHome, '.claude'),
		joinPath(userHome, '.agents'),
	];
}

/**
 * Returns the user-home directories accessible to the Claude harness.
 */
export function getClaudeUserRoots(userHome: URI): readonly URI[] {
	return [joinPath(userHome, '.claude')];
}

// #endregion

// #region Harness descriptor factories

/**
 * Builds the full source list from the base set (local, user, plugin)
 * plus any additional sources specific to the window type.
 *
 * Core passes `[PromptsStorage.extension]`; sessions passes its
 * BUILTIN_STORAGE constant.
 */
function buildAllSources(extras: readonly string[]): readonly string[] {
	return [PromptsStorage.local, PromptsStorage.user, PromptsStorage.plugin, ...extras];
}

/**
 * Creates a "VS Code" harness descriptor that shows all storage sources
 * with no user-root restrictions.
 */
export function createVSCodeHarnessDescriptor(extras: readonly string[]): IHarnessDescriptor {
	const filter: IStorageSourceFilter = { sources: buildAllSources(extras) };
	return {
		id: CustomizationHarness.VSCode,
		label: localize('harness.local', "Local"),
		icon: ThemeIcon.fromId(Codicon.vm.id),
		getStorageSourceFilter: () => filter,
	};
}

/**
 * Creates a harness descriptor that restricts user-file roots for most
 * types (agents, skills, instructions) while leaving hooks and prompts
 * unrestricted. Used for CLI and Claude harnesses.
 */
function createRestrictedHarnessDescriptor(
	id: CustomizationHarness,
	label: string,
	icon: ThemeIcon,
	restrictedUserRoots: readonly URI[],
	extras: readonly string[],
	hiddenSections?: readonly string[],
	workspaceSubpaths?: readonly string[],
): IHarnessDescriptor {
	const allSources = buildAllSources(extras);
	const allRootsFilter: IStorageSourceFilter = { sources: allSources };
	const restrictedFilter: IStorageSourceFilter = { sources: allSources, includedUserFileRoots: restrictedUserRoots };
	return {
		id,
		label,
		icon,
		hiddenSections,
		workspaceSubpaths,
		getStorageSourceFilter(type: PromptsType): IStorageSourceFilter {
			if (type === PromptsType.hook) {
				return HOOKS_FILTER;
			}
			if (type === PromptsType.prompt) {
				return allRootsFilter;
			}
			return restrictedFilter;
		},
	};
}

/**
 * Creates a "Copilot CLI" harness descriptor.
 */
export function createCliHarnessDescriptor(cliUserRoots: readonly URI[], extras: readonly string[]): IHarnessDescriptor {
	return createRestrictedHarnessDescriptor(
		CustomizationHarness.CLI,
		localize('harness.cli', "Copilot CLI"),
		ThemeIcon.fromId(Codicon.worktree.id),
		cliUserRoots,
		extras,
		undefined, // no hidden sections
		['.github', '.copilot', '.agents', '.claude'],
	);
}

/**
 * Creates a "Claude" harness descriptor.
 * Claude does not support custom agents or hooks.
 */
export function createClaudeHarnessDescriptor(claudeRoots: readonly URI[], extras: readonly string[]): IHarnessDescriptor {
	return createRestrictedHarnessDescriptor(
		CustomizationHarness.Claude,
		localize('harness.claude', "Claude"),
		ThemeIcon.fromId(Codicon.claude.id),
		claudeRoots,
		extras,
		[AICustomizationManagementSection.Agents, AICustomizationManagementSection.Hooks],
		['.claude'],
	);
}

// #endregion

// #region Base implementation

/**
 * Reusable base implementation of {@link ICustomizationHarnessService}.
 * Concrete registrations only need to supply the list of harness
 * descriptors and a default harness id.
 */
export class CustomizationHarnessServiceBase implements ICustomizationHarnessService {
	declare readonly _serviceBrand: undefined;

	private readonly _activeHarness: ISettableObservable<CustomizationHarness>;
	readonly activeHarness: IObservable<CustomizationHarness>;
	readonly availableHarnesses: IObservable<readonly IHarnessDescriptor[]>;

	constructor(
		private readonly _harnesses: readonly IHarnessDescriptor[],
		defaultHarness: CustomizationHarness,
	) {
		this._activeHarness = observableValue<CustomizationHarness>(this, defaultHarness);
		this.activeHarness = this._activeHarness;
		this.availableHarnesses = constObservable(this._harnesses);
	}

	setActiveHarness(id: CustomizationHarness): void {
		if (this._harnesses.some(h => h.id === id)) {
			this._activeHarness.set(id, undefined);
		}
	}

	getStorageSourceFilter(type: PromptsType): IStorageSourceFilter {
		const activeId = this._activeHarness.get();
		const descriptor = this._harnesses.find(h => h.id === activeId);
		return descriptor?.getStorageSourceFilter(type) ?? this._harnesses[0].getStorageSourceFilter(type);
	}

	getActiveDescriptor(): IHarnessDescriptor {
		const activeId = this._activeHarness.get();
		return this._harnesses.find(h => h.id === activeId) ?? this._harnesses[0];
	}
}

// #endregion
