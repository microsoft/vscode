/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { IObservable, ISettableObservable, observableValue } from '../../../../base/common/observable.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { joinPath } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { AICustomizationManagementSection, IStorageSourceFilter } from './aiCustomizationWorkspaceService.js';
import { PromptsType } from './promptSyntax/promptTypes.js';
import { AGENT_MD_FILENAME } from './promptSyntax/config/promptFileLocations.js';
import { IAgentSource, IChatPromptSlashCommand, ICustomAgent, IPromptsService, IResolvedChatPromptSlashCommand, matchesSessionType, PromptsStorage } from './promptSyntax/service/promptsService.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { SessionType } from './chatSessionsService.js';
import { CustomAgent } from './promptSyntax/service/promptsServiceImpl.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { getCanonicalPluginCommandId } from './plugins/agentPluginService.js';

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

export interface ICustomizationItemAction {
	readonly id: string;
	readonly label: string;
	readonly tooltip?: string;
	readonly icon?: ThemeIcon;
	readonly enabled?: boolean;
	run(): void | Promise<void>;
}

/**
 * Describes a single harness option for the UI toggle.
 */
export interface IHarnessDescriptor {
	/**
	 * The harness/session-type identifier.
	 */
	readonly id: string;
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
	/**
	 * When set, this harness is backed by an extension-contributed provider
	 * that can supply customization items directly (bypassing promptsService
	 * discovery and filtering).
	 */
	readonly itemProvider?: ICustomizationItemProvider;
	/**
	 * When `true`, the "Troubleshoot" action is available in item context
	 * menus. This opens chat with the `/troubleshoot` command pre-filled
	 * for the selected customization.
	 */
	readonly supportsTroubleshoot?: boolean;
	/**
	 * When set, this harness uses an opt-out sync model where all eligible
	 * local customizations are synced by default. The UI shows disable
	 * affordances when this harness is active.
	 */
	readonly syncProvider?: ICustomizationSyncProvider;
	/**
	 * Optional plugin-management actions shown in the Plugins section toolbar.
	 * Harnesses can use these to replace the default local install/create
	 * actions with environment-specific commands (for example, configuring
	 * plugins on a remote agent host).
	 */
	readonly pluginActions?: readonly ICustomizationItemAction[];
}

/**
 * Represents a customization item provided by any source.
 */
export interface ICustomizationItem {
	/** Optional stable identity used by list widgets when URI alone is not unique. */
	readonly itemKey?: string;
	readonly uri: URI;
	readonly type: string;
	readonly name: string;
	readonly description?: string;
	/** Storage origin (local, user, extension, plugin). Set by providers that know the source. */
	readonly storage?: PromptsStorage;
	/** The extension identifier that contributed this customization, if any. */
	readonly extensionId: string | undefined;
	/** The URI of the plugin that contributed this customization, if any. */
	readonly pluginUri: URI | undefined;
	/** Server-reported loading status for this customization. */
	readonly status?: 'loading' | 'loaded' | 'degraded' | 'error';
	/** Human-readable status detail (e.g. error message or warning). */
	readonly statusMessage?: string;
	/** Whether this customization is currently enabled. */
	readonly enabled?: boolean;
	/** When set, items with the same groupKey are displayed under a shared collapsible header. */
	readonly groupKey?: string;
	/** When set, shows a small inline badge next to the item name (e.g. an applyTo glob pattern). */
	readonly badge?: string;
	/** Tooltip shown when hovering the badge. */
	readonly badgeTooltip?: string;
	/**
	 * Whether this customization item can be invoked by the user.
	 * Relevant for prompt / skill and custom agents
	 */
	readonly userInvocable?: boolean;
	/** Optional inline/context-menu actions specific to this item. */
	readonly actions?: readonly ICustomizationItemAction[];
}

/**
 * Provider interface for extension-contributed harnesses that supply
 * customization items directly from their SDK.
 */
export interface ICustomizationItemProvider {
	/**
	 * Event that fires when the provider's customizations change.
	 */
	readonly onDidChange: Event<void>;
	/**
	 * Provide the customization items this harness supports.
	 */
	provideChatSessionCustomizations(token: CancellationToken): Promise<ICustomizationItem[] | undefined>;
}

/**
 * Provider interface for harnesses that use an opt-out sync model.
 *
 * Every eligible local customization is synced by default; the user
 * can disable individual items. The persisted set captures only the
 * user's opt-outs.
 */
export interface ICustomizationSyncProvider {
	readonly onDidChange: Event<void>;
	isDisabled(uri: URI): boolean;
	setDisabled(uri: URI, disabled: boolean): void;
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
	 * Finds the descriptor of the harness with the given id, or `undefined` if no such harness exists.
	 * @param sessionType The harness id (sessionType)
	 */
	findHarnessById(sessionType: string): IHarnessDescriptor | undefined;

	/**
	 * Changes the active harness. The new id must be present in
	 * `availableHarnesses`.
	 */
	setActiveHarness(sessionType: string): void;

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


	/**
	 * Fires when one of the provided slash commands changes.
	 */
	readonly onDidChangeSlashCommands: Event<{ readonly sessionType: string }>;

	/**
	 * Fires when one of the provided custom agents changes.
	 */
	readonly onDidChangeCustomAgents: Event<{ readonly sessionType: string }>;

	/**
	 * Returns the prompt and skill slash commands for the given session type.
	 * Provider-backed harnesses contribute their own items directly; the default
	 * VS Code harness falls back to the core prompts service.
	 */
	getSlashCommands(sessionType: string, token: CancellationToken): Promise<readonly IChatPromptSlashCommand[]>;

	/**
	 * Returns the custom agents for the given session type.
	 * Provider-backed harnesses select items via their own provider and resolve
	 * details via the core prompts service.
	 */
	getCustomAgents(sessionType: string, token: CancellationToken): Promise<readonly ICustomAgent[]>;

	/**
	 * Resolves a slash command to its full metadata, including the parsed prompt file for prompt commands.
	 * Provider-backed harnesses resolve their own items directly; the default VS Code harness falls back to the core prompts service.
	 */
	resolvePromptSlashCommand(name: string, sessionType: string, token: CancellationToken): Promise<IResolvedChatPromptSlashCommand | undefined>;
}

/**
 * Minimal slash-command metadata resolved from the active harness.
 */
export interface ICustomizationSlashCommand {
	readonly uri: URI;
	readonly type: PromptsType.prompt | PromptsType.skill;
	readonly name: string;
	readonly description?: string;
	readonly userInvocable: boolean;
	readonly sessionTypes?: readonly string[];
}

// #region Shared filter constants

/**
 * Empty filter returned when no harness is registered yet.
 */
const EMPTY_FILTER: IStorageSourceFilter = {
	sources: [],
};

/**
 * Empty descriptor returned when no harness is registered yet.
 */
const EMPTY_DESCRIPTOR: IHarnessDescriptor = {
	id: '',
	label: '',
	icon: Codicon.sparkle,
	getStorageSourceFilter: () => ({ sources: [] }),
};


/**
 * Hooks filter — local, user, and plugin sources.
 */
const HOOKS_FILTER: IStorageSourceFilter = {
	sources: [PromptsStorage.local, PromptsStorage.user, PromptsStorage.plugin],
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
		id: SessionType.Local,
		label: localize('harness.local', "Local"),
		icon: ThemeIcon.fromId(Codicon.vm.id),
		supportsTroubleshoot: true,
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
 * unrestricted. Used for restricted harnesses like CLI.
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
	id: string,
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
		SessionType.CopilotCLI,
		localize('harness.cli', "Copilot CLI"),
		ThemeIcon.fromId(Codicon.copilot.id),
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
	private readonly _onDidChangeSlashCommands = new Emitter<{ readonly sessionType: string }>();
	readonly onDidChangeSlashCommands = this._onDidChangeSlashCommands.event;
	private readonly _onDidChangeCustomAgents = new Emitter<{ readonly sessionType: string }>();
	readonly onDidChangeCustomAgents = this._onDidChangeCustomAgents.event;
	private readonly _providerListeners: IDisposable[] = [];
	private _isDisposed = false;

	private readonly _activeHarness: ISettableObservable<string>;
	readonly activeHarness: IObservable<string>;

	private readonly _staticHarnesses: readonly IHarnessDescriptor[];
	private readonly _externalHarnesses: IHarnessDescriptor[] = [];
	private readonly _availableHarnesses: ISettableObservable<readonly IHarnessDescriptor[]>;
	readonly availableHarnesses: IObservable<readonly IHarnessDescriptor[]>;

	constructor(
		staticHarnesses: readonly IHarnessDescriptor[],
		defaultHarness: string,
		private readonly promptsService: IPromptsService,
	) {
		this._staticHarnesses = staticHarnesses;
		this.promptsService = promptsService;
		this._activeHarness = observableValue<string>(this, defaultHarness);
		this.activeHarness = this._activeHarness;
		this._availableHarnesses = observableValue<readonly IHarnessDescriptor[]>(this, [...this._staticHarnesses]);
		this.availableHarnesses = this._availableHarnesses;
		this._rebindProviderListeners();
	}

	private _getAllHarnesses(): readonly IHarnessDescriptor[] {
		// External harnesses shadow static ones with the same id so that
		// extension-contributed harnesses can upgrade a built-in entry.
		const externalIds = new Set(this._externalHarnesses.map(h => h.id));
		return [
			...this._staticHarnesses.filter(h => !externalIds.has(h.id)),
			...this._externalHarnesses,
		];
	}

	private _refreshAvailableHarnesses(): void {
		if (this._isDisposed) {
			return;
		}
		this._availableHarnesses.set(this._getAllHarnesses(), undefined);
		this._rebindProviderListeners();
	}

	private _rebindProviderListeners(): void {
		for (const listener of this._providerListeners) {
			listener.dispose();
		}
		this._providerListeners.length = 0;
		for (const harness of this._getAllHarnesses()) {
			const provider = harness.itemProvider;
			if (!provider) {
				this._providerListeners.push(this.promptsService.onDidChangeSlashCommands(() => this._onDidChangeSlashCommands.fire({ sessionType: harness.id })));
				this._providerListeners.push(this.promptsService.onDidChangeCustomAgents(() => this._onDidChangeCustomAgents.fire({ sessionType: harness.id })));
			} else {
				this._providerListeners.push(provider.onDidChange(() => this._onDidChangeSlashCommands.fire({ sessionType: harness.id })));
				this._providerListeners.push(provider.onDidChange(() => this._onDidChangeCustomAgents.fire({ sessionType: harness.id })));
			}
		}
	}

	dispose(): void {
		this._isDisposed = true;
		for (const listener of this._providerListeners) {
			listener.dispose();
		}
		this._providerListeners.length = 0;
		this._onDidChangeSlashCommands.dispose();
		this._onDidChangeCustomAgents.dispose();
	}

	registerExternalHarness(descriptor: IHarnessDescriptor): IDisposable {
		this._externalHarnesses.push(descriptor);
		this._refreshAvailableHarnesses();
		return {
			dispose: () => {
				if (this._isDisposed) {
					return;
				}
				const idx = this._externalHarnesses.indexOf(descriptor);
				if (idx >= 0) {
					this._externalHarnesses.splice(idx, 1);
					this._refreshAvailableHarnesses();
					// If the removed harness was active, only fall back when no
					// remaining harness (e.g. the restored static one) shares the id.
					if (this._activeHarness.get() === descriptor.id) {
						const all = this._getAllHarnesses();
						if (!all.some(h => h.id === descriptor.id) && all.length > 0) {
							this._activeHarness.set(all[0].id, undefined);
						}
					}
				}
			}
		};
	}

	findHarnessById(id: string): IHarnessDescriptor | undefined {
		return this._getAllHarnesses().find(h => h.id === id);
	}

	setActiveHarness(id: string): void {
		const harness = this.findHarnessById(id);
		if (harness) {
			this._activeHarness.set(id, undefined);
		}
	}

	getStorageSourceFilter(type: PromptsType): IStorageSourceFilter {
		const activeId = this._activeHarness.get();
		const all = this._getAllHarnesses();
		if (all.length === 0) {
			return EMPTY_FILTER;
		}
		const descriptor = all.find(h => h.id === activeId) ?? all[0];
		return descriptor?.getStorageSourceFilter(type) ?? EMPTY_FILTER;
	}

	getActiveDescriptor(): IHarnessDescriptor {
		const activeId = this._activeHarness.get();
		const all = this._getAllHarnesses();
		if (all.length === 0) {
			return EMPTY_DESCRIPTOR;
		}
		return all.find(h => h.id === activeId) ?? all[0];
	}

	async getSlashCommands(sessionType: string, token: CancellationToken): Promise<readonly IChatPromptSlashCommand[]> {
		const harness = this.findHarnessById(sessionType);
		if (!harness || !harness.itemProvider) {
			const commands = await this.promptsService.getPromptSlashCommands(token);
			return commands.filter(command => matchesSessionType(command.sessionTypes, sessionType));
		}

		const items = await harness.itemProvider.provideChatSessionCustomizations(token);
		if (!items) {
			return [];
		}
		const result = [];
		for (const item of items) {
			if ((item.enabled !== false) && (item.type === PromptsType.prompt || item.type === PromptsType.skill)) {
				result.push({
					uri: item.uri,
					type: item.type as PromptsType.prompt | PromptsType.skill,
					name: item.pluginUri ? getCanonicalPluginCommandId({ uri: item.pluginUri }, item.name) : item.name,
					description: item.description,
					userInvocable: item.userInvocable ?? true,
					storage: item.storage ?? PromptsStorage.local,
					sessionTypes: [sessionType],
				});
			}
		}
		return result;
	}

	async getCustomAgents(sessionType: string, token: CancellationToken): Promise<readonly ICustomAgent[]> {
		const harness = this.findHarnessById(sessionType);
		if (!harness || !harness.itemProvider) {
			const allAgents = await this.promptsService.getCustomAgents(token);
			return allAgents.filter(agent => matchesSessionType(agent.sessionTypes, sessionType));
		}

		const items = await harness.itemProvider.provideChatSessionCustomizations(token);
		if (!items) {
			return [];
		}

		const getSource = (item: ICustomizationItem): IAgentSource => {
			if (item.storage === PromptsStorage.extension && item.extensionId) {
				return { storage: PromptsStorage.extension, extensionId: new ExtensionIdentifier(item.extensionId) };
			} else if (item.storage === PromptsStorage.plugin && item.pluginUri) {
				return { storage: PromptsStorage.plugin, pluginUri: item.pluginUri };
			} else if (item.storage === PromptsStorage.user) {
				return { storage: PromptsStorage.user };
			}
			return { storage: PromptsStorage.local };
		};

		const result: ICustomAgent[] = [];
		for (const item of items) {
			if ((item.enabled !== false) && item.type === PromptsType.agent) {
				const promptFile = await this.promptsService.parseNew(item.uri, token);
				const extra = {
					name: item.name,
					description: item.description,
					sessionTypes: [sessionType],
					hooks: undefined,
					source: getSource(item),
					type: PromptsType.agent,
				};
				result.push(CustomAgent.fromParsedPromptFile(promptFile, extra));
			}
		}
		return result;
	}

	public async resolvePromptSlashCommand(name: string, sessionType: string, token: CancellationToken): Promise<IResolvedChatPromptSlashCommand | undefined> {
		const commands = await this.getSlashCommands(sessionType, token);
		const command = commands.find(cmd => cmd.name === name);
		if (command) {
			const parsedPromptFile = await this.promptsService.parseNew(command.uri, token);
			return {
				...command,
				userInvocable: parsedPromptFile.header?.userInvocable ?? command.userInvocable,
				parsedPromptFile,
			};
		}
		return undefined;
	}
}

// #endregion
