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
import { AGENT_MD_FILENAME } from './promptSyntax/config/promptFileLocations.js';

export const ICustomizationHarnessService = createDecorator<ICustomizationHarnessService>('customizationHarnessService');

/**
 * Override for a management section's create-button behavior.
 */
export interface ISectionOverride {
	/**
	 * Label for the primary button. Required when `commandId` or `rootFile`
	 * is set. Ignored otherwise (the widget uses its default label).
	 */
	readonly label?: string;
	/** When set, the primary button invokes this command (e.g. hooks quick pick). */
	readonly commandId?: string;
	/** When set, the primary button creates this file at the workspace root. */
	readonly rootFile?: string;
	/**
	 * Custom type label for the dropdown workspace/user create actions
	 * (e.g. "Rule" instead of "Instruction"). When undefined, the
	 * section's default type label is used.
	 */
	readonly typeLabel?: string;
	/**
	 * Root-level file shortcuts added to the dropdown (e.g. `['AGENTS.md']`).
	 * Each entry creates a "New {filename}" action that creates the file at
	 * the workspace root. Harnesses that don't support a file simply omit it.
	 */
	readonly rootFileShortcuts?: readonly string[];
	/**
	 * File extension override for new files created under this section.
	 * When set, files are created with this extension (e.g. `.md` for
	 * Claude rules) instead of the default for the prompt type
	 * (e.g. `.instructions.md`).
	 */
	readonly fileExtension?: string;
}

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
	 * For example, Claude does not support prompt files so the Prompts
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
	 * When `true`, the "Generate with AI" sparkle button is hidden and replaced
	 * with a plain "New X" manual-creation button (like sessions).
	 */
	readonly hideGenerateButton?: boolean;
	/**
	 * Per-section overrides for the create button behavior.
	 *
	 * A `commandId` entry replaces the button entirely with a command
	 * invocation (e.g. Claude hooks → `copilot.claude.hooks`).
	 *
	 * A `rootFile` entry makes the primary button create a specific file
	 * at the workspace root (e.g. Claude instructions → `CLAUDE.md`).
	 * When combined with `typeLabel`, the dropdown create actions use
	 * that label instead of the section's default (e.g. "Rule" instead
	 * of "Instruction").
	 */
	readonly sectionOverrides?: ReadonlyMap<string, ISectionOverride>;
	/**
	 * The chat agent ID that must be registered for this harness to appear.
	 * When `undefined`, the harness is always available (e.g. Local).
	 */
	readonly requiredAgentId?: string;
	/**
	 * Instruction file patterns that this harness recognizes.
	 * Each entry is either an exact filename (e.g. `'CLAUDE.md'`) or a
	 * path prefix ending with `/` (e.g. `'.claude/rules/'`).
	 * When set, instruction items that don't match any pattern are filtered out.
	 * When `undefined`, all instruction files are shown.
	 */
	readonly instructionFileFilter?: readonly string[];
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
		sectionOverrides: new Map([
			[AICustomizationManagementSection.Instructions, {
				rootFileShortcuts: [AGENT_MD_FILENAME],
			}],
		]),
		getStorageSourceFilter: () => filter,
	};
}

/**
 * Creates a harness descriptor that restricts user-file roots for most
 * types (agents, skills, instructions) while leaving hooks and prompts
 * unrestricted. Used for CLI and Claude harnesses.
 */
interface IRestrictedHarnessOptions {
	readonly hiddenSections?: readonly string[];
	readonly workspaceSubpaths?: readonly string[];
	readonly hideGenerateButton?: boolean;
	readonly sectionOverrides?: ReadonlyMap<string, ISectionOverride>;
	readonly requiredAgentId?: string;
	readonly instructionFileFilter?: readonly string[];
}

function createRestrictedHarnessDescriptor(
	id: CustomizationHarness,
	label: string,
	icon: ThemeIcon,
	restrictedUserRoots: readonly URI[],
	extras: readonly string[],
	options?: IRestrictedHarnessOptions,
): IHarnessDescriptor {
	const allSources = buildAllSources(extras);
	const allRootsFilter: IStorageSourceFilter = { sources: allSources };
	const restrictedFilter: IStorageSourceFilter = { sources: allSources, includedUserFileRoots: restrictedUserRoots };
	return {
		id,
		label,
		icon,
		hiddenSections: options?.hiddenSections,
		workspaceSubpaths: options?.workspaceSubpaths,
		hideGenerateButton: options?.hideGenerateButton,
		sectionOverrides: options?.sectionOverrides,
		requiredAgentId: options?.requiredAgentId,
		instructionFileFilter: options?.instructionFileFilter,
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
		{
			hideGenerateButton: true,
			requiredAgentId: 'copilotcli',
			workspaceSubpaths: ['.github', '.copilot', '.agents', '.claude'],
			sectionOverrides: new Map([
				[AICustomizationManagementSection.Instructions, {
					rootFileShortcuts: [AGENT_MD_FILENAME],
				}],
			]),
		},
	);
}

/**
 * Creates a "Claude" harness descriptor.
 * Claude does not support prompt files (.prompt.md), AGENTS.md, or extension-contributed plugins.
 * It supports agents (.claude/agents/), instructions (CLAUDE.md, .claude/rules/),
 * skills (.claude/skills/), and hooks (.claude/settings.json).
 */
export function createClaudeHarnessDescriptor(claudeRoots: readonly URI[], extras: readonly string[]): IHarnessDescriptor {
	return createRestrictedHarnessDescriptor(
		CustomizationHarness.Claude,
		localize('harness.claude', "Claude"),
		ThemeIcon.fromId(Codicon.claude.id),
		claudeRoots,
		extras,
		{
			hiddenSections: [AICustomizationManagementSection.Prompts, AICustomizationManagementSection.Plugins],
			workspaceSubpaths: ['.claude'],
			hideGenerateButton: true,
			requiredAgentId: 'claude-code',
			sectionOverrides: new Map([
				[AICustomizationManagementSection.Hooks, {
					label: localize('claudeHooks', "Configure Claude Hooks"),
					commandId: 'copilot.claude.hooks',
				}],
				[AICustomizationManagementSection.Instructions, {
					label: localize('addClaudeMd', "Add CLAUDE.md"),
					rootFile: 'CLAUDE.md',
					typeLabel: localize('rule', "Rule"),
					fileExtension: '.md',
				}],
			]),
			instructionFileFilter: ['CLAUDE.md', 'CLAUDE.local.md', '.claude/rules/', 'copilot-instructions.md'],
		},
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

/**
 * Tests whether an instruction file matches one of the harness's recognized
 * instruction file patterns. Patterns can be exact filenames (e.g. `CLAUDE.md`)
 * or path prefixes ending with `/` (e.g. `.claude/rules/`).
 */
export function matchesInstructionFileFilter(filePath: string, filters: readonly string[]): boolean {
	const name = filePath.substring(filePath.lastIndexOf('/') + 1);
	return filters.some(f => {
		if (f.endsWith('/')) {
			// Path prefix: check if the file is under this directory
			return filePath.includes(`/${f}`) || filePath.startsWith(f);
		}
		return name === f;
	});
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

	private readonly _allHarnesses: readonly IHarnessDescriptor[];

	constructor(
		harnesses: readonly IHarnessDescriptor[],
		defaultHarness: CustomizationHarness,
		availableHarnesses?: IObservable<readonly IHarnessDescriptor[]>,
	) {
		this._allHarnesses = harnesses;
		this._activeHarness = observableValue<CustomizationHarness>(this, defaultHarness);
		this.activeHarness = this._activeHarness;
		this.availableHarnesses = availableHarnesses ?? constObservable(harnesses);
	}

	setActiveHarness(id: CustomizationHarness): void {
		const available = this.availableHarnesses.get();
		if (available.some(h => h.id === id)) {
			this._activeHarness.set(id, undefined);
		}
	}

	getStorageSourceFilter(type: PromptsType): IStorageSourceFilter {
		const descriptor = this.getActiveDescriptor();
		return descriptor.getStorageSourceFilter(type);
	}

	getActiveDescriptor(): IHarnessDescriptor {
		const activeId = this._activeHarness.get();
		const available = this.availableHarnesses.get();
		return available.find(h => h.id === activeId) ?? available[0] ?? this._allHarnesses[0];
	}
}

// #endregion
