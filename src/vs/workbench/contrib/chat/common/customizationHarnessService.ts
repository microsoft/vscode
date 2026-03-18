/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { IObservable, ISettableObservable, observableValue } from '../../../../base/common/observable.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { Event } from '../../../../base/common/event.js';
import { joinPath } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { AICustomizationManagementSection, IStorageSourceFilter } from './aiCustomizationWorkspaceService.js';
import { PromptsType } from './promptSyntax/promptTypes.js';
import { PromptsStorage } from './promptSyntax/service/promptsService.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';

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
	readonly id: string;
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
	/**
	 * When set, this harness is backed by an extension-contributed provider
	 * that can supply customization items directly (bypassing promptsService
	 * discovery and filtering).
	 */
	readonly itemProvider?: IExternalCustomizationItemProvider;
}

/**
 * Represents a customization item provided by an external extension.
 */
export interface IExternalCustomizationItem {
	readonly uri: URI;
	readonly type: string;
	readonly name: string;
	readonly description?: string;
}

/**
 * Provider interface for extension-contributed harnesses that supply
 * customization items directly from their SDK.
 */
export interface IExternalCustomizationItemProvider {
	/**
	 * Event that fires when the provider's customizations change.
	 */
	readonly onDidChange: Event<void>;
	/**
	 * Provide the customization items this harness supports.
	 */
	provideCustomizations(token: CancellationToken): Promise<IExternalCustomizationItem[] | undefined>;
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
	readonly activeHarness: IObservable<string>;

	/**
	 * All harnesses available in this window.
	 * When only one harness is available the UI should hide the toggle.
	 */
	readonly availableHarnesses: IObservable<readonly IHarnessDescriptor[]>;

	/**
	 * Changes the active harness. The new id must be present in
	 * `availableHarnesses`.
	 */
	setActiveHarness(id: string): void;

	/**
	 * Convenience: returns the storage source filter for the active harness
	 * and the given customization type.
	 */
	getStorageSourceFilter(type: PromptsType): IStorageSourceFilter;

	/**
	 * Returns the descriptor of the currently active harness.
	 */
	getActiveDescriptor(): IHarnessDescriptor;

	/**
	 * Registers an external harness contributed by an extension.
	 * The harness appears in the UI toggle alongside static harnesses.
	 * Returns a disposable that removes the harness when disposed.
	 */
	registerExternalHarness(descriptor: IHarnessDescriptor): IDisposable;
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
 * Claude does not support custom agents or prompt files.
 * It supports instructions (CLAUDE.md/AGENTS.md), skills (.claude/skills/),
 * and hooks (configured in .claude/settings.json / .claude/settings.local.json).
 */
export function createClaudeHarnessDescriptor(claudeRoots: readonly URI[], extras: readonly string[]): IHarnessDescriptor {
	return createRestrictedHarnessDescriptor(
		CustomizationHarness.Claude,
		localize('harness.claude', "Claude"),
		ThemeIcon.fromId(Codicon.claude.id),
		claudeRoots,
		extras,
		[AICustomizationManagementSection.Agents, AICustomizationManagementSection.Prompts],
		['.claude'],
	);
}

// #endregion

// #region Helpers

/**
 * Tests whether a file path belongs to one of the given workspace sub-paths.
 * Matches on path segment boundaries to avoid false positives
 * (e.g. `.claude` must appear as `/.claude/` in the path, not as part of
 * a longer segment like `not.claude`).
 */
export function matchesWorkspaceSubpath(filePath: string, subpaths: readonly string[]): boolean {
	return subpaths.some(sp => filePath.includes(`/${sp}/`) || filePath.endsWith(`/${sp}`));
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

	private readonly _activeHarness: ISettableObservable<string>;
	readonly activeHarness: IObservable<string>;

	private readonly _staticHarnesses: readonly IHarnessDescriptor[];
	private readonly _externalHarnesses: IHarnessDescriptor[] = [];
	private readonly _availableHarnesses: ISettableObservable<readonly IHarnessDescriptor[]>;
	readonly availableHarnesses: IObservable<readonly IHarnessDescriptor[]>;

	constructor(
		staticHarnesses: readonly IHarnessDescriptor[],
		defaultHarness: string,
	) {
		this._staticHarnesses = staticHarnesses;
		this._activeHarness = observableValue<string>(this, defaultHarness);
		this.activeHarness = this._activeHarness;
		this._availableHarnesses = observableValue<readonly IHarnessDescriptor[]>(this, [...this._staticHarnesses]);
		this.availableHarnesses = this._availableHarnesses;
	}

	private _getAllHarnesses(): readonly IHarnessDescriptor[] {
		return [...this._staticHarnesses, ...this._externalHarnesses];
	}

	private _refreshAvailableHarnesses(): void {
		this._availableHarnesses.set(this._getAllHarnesses(), undefined);
	}

	registerExternalHarness(descriptor: IHarnessDescriptor): IDisposable {
		this._externalHarnesses.push(descriptor);
		this._refreshAvailableHarnesses();
		return {
			dispose: () => {
				const idx = this._externalHarnesses.indexOf(descriptor);
				if (idx >= 0) {
					this._externalHarnesses.splice(idx, 1);
					this._refreshAvailableHarnesses();
					// If the removed harness was active, fall back to the first available
					if (this._activeHarness.get() === descriptor.id) {
						const all = this._getAllHarnesses();
						if (all.length > 0) {
							this._activeHarness.set(all[0].id, undefined);
						}
					}
				}
			}
		};
	}

	setActiveHarness(id: string): void {
		if (this._getAllHarnesses().some(h => h.id === id)) {
			this._activeHarness.set(id, undefined);
		}
	}

	getStorageSourceFilter(type: PromptsType): IStorageSourceFilter {
		const activeId = this._activeHarness.get();
		const all = this._getAllHarnesses();
		const descriptor = all.find(h => h.id === activeId);
		return descriptor?.getStorageSourceFilter(type) ?? all[0].getStorageSourceFilter(type);
	}

	getActiveDescriptor(): IHarnessDescriptor {
		const activeId = this._activeHarness.get();
		const all = this._getAllHarnesses();
		return all.find(h => h.id === activeId) ?? all[0];
	}
}

// #endregion
