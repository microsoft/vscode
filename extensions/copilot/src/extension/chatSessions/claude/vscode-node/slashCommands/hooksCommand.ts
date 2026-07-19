/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { INativeEnvService } from '../../../../../platform/env/common/envService';
import { createDirectoryIfNotExists, IFileSystemService } from '../../../../../platform/filesystem/common/fileSystemService';
import { ILogService } from '../../../../../platform/log/common/logService';
import { IWorkspaceService } from '../../../../../platform/workspace/common/workspaceService';
import { CancellationToken } from '../../../../../util/vs/base/common/cancellation';
import { URI } from '../../../../../util/vs/base/common/uri';
import { IClaudeSlashCommandHandler, registerClaudeSlashCommand } from './claudeSlashCommandRegistry';

/**
 * HOOKS CONFIGURATION WIZARD
 * ==========================
 *
 * This wizard supports two distinct flows: CREATE and EDIT.
 *
 * ## CREATE FLOW (new matcher)
 * Used when adding a completely new hook configuration.
 *
 * 1. Select hook event (e.g., PreToolUse, PostToolUse, etc.)
 * 2. For tool-based hooks: Select "+ Add new matcher..." option
 * 3. Enter the new matcher pattern (e.g., "Bash", "Edit", "*")
 * 4. Enter the hook command to run
 * 5. Select where to save (Workspace (local), Workspace, or User settings)
 * 6. Configuration is written to the selected settings file
 * 7. The settings file is opened with cursor at the new hook command
 *
 * ## EDIT FLOW (existing matcher)
 * Used when modifying hooks for an existing matcher.
 *
 * 1. Select hook event (e.g., PreToolUse, PostToolUse, etc.)
 * 2. For tool-based hooks: Select an existing matcher (grouped by file path)
 * 3. Select existing hook command to edit, or "+ Add new hook..."
 *    - If editing existing: Input box pre-filled with current command
 *    - If adding new: Empty input box for new command
 * 4. Changes are written back to the SAME settings file where the matcher was found
 *    (no location picker - we preserve the original source)
 * 5. The settings file is opened with cursor at the modified hook command
 *
 * ## Lifecycle Hooks (no matcher)
 * For hooks like UserPromptSubmit, Stop, SessionStart, etc.:
 * - The matcher is implicitly "*" (matches all)
 * - Flow is similar but skips the matcher selection step
 * - Uses the same Create vs Edit logic based on whether hooks already exist
 */

/**
 * Hook event types matching Claude Code SDK
 * See: https://platform.claude.com/docs/en/agent-sdk/hooks
 *
 * Tool-based hooks receive tool_name and tool_input - matchers filter by tool name.
 * Lifecycle hooks receive event-specific data - matchers are ignored.
 */
const HOOK_EVENTS = [
	// Tool-based hooks (matcher filters by tool name)
	{
		id: 'PreToolUse',
		label: vscode.l10n.t('Before tool execution'),
		needsMatcher: true,
		inputDescription: vscode.l10n.t('Exit 0: allow, Exit 2: block with stderr to model.'),
		jsonSchema: '{ "tool_name": string, "tool_input": object }',
	},
	{
		id: 'PostToolUse',
		label: vscode.l10n.t('After tool execution'),
		needsMatcher: true,
		inputDescription: vscode.l10n.t('Runs after tool completes successfully.'),
		jsonSchema: '{ "tool_name": string, "tool_input": object, "tool_response": string }',
	},
	{
		id: 'PostToolUseFailure',
		label: vscode.l10n.t('After tool execution fails'),
		needsMatcher: true,
		inputDescription: vscode.l10n.t('Runs when a tool fails or is interrupted.'),
		jsonSchema: '{ "tool_name": string, "tool_input": object, "error": string, "is_interrupt": boolean }',
	},
	{
		id: 'PermissionRequest',
		label: vscode.l10n.t('When permission dialog would be displayed'),
		needsMatcher: true,
		inputDescription: vscode.l10n.t('Custom permission handling. Exit 0: allow, Exit 2: deny.'),
		jsonSchema: '{ "tool_name": string, "tool_input": object, "permission_suggestions": string[] }',
	},
	// Lifecycle hooks (matchers ignored, fires for all events of this type)
	{
		id: 'UserPromptSubmit',
		label: vscode.l10n.t('When the user submits a prompt'),
		needsMatcher: false,
		inputDescription: vscode.l10n.t('Exit 0: allow, Exit 2: block with stderr to model.'),
		jsonSchema: '{ "prompt": string }',
	},
	{
		id: 'Stop',
		label: vscode.l10n.t('When agent execution stops'),
		needsMatcher: false,
		inputDescription: vscode.l10n.t('Use to save state or clean up resources.'),
		jsonSchema: '{ "stop_hook_active": boolean }',
	},
	{
		id: 'SubagentStart',
		label: vscode.l10n.t('When a subagent is initialized'),
		needsMatcher: false,
		inputDescription: vscode.l10n.t('Track parallel task spawning.'),
		jsonSchema: '{ "agent_id": string, "agent_type": string }',
	},
	{
		id: 'SubagentStop',
		label: vscode.l10n.t('When a subagent completes'),
		needsMatcher: false,
		inputDescription: vscode.l10n.t('Aggregate results from parallel tasks.'),
		jsonSchema: '{ "agent_id": string, "agent_transcript_path": string, "stop_hook_active": boolean }',
	},
	{
		id: 'PreCompact',
		label: vscode.l10n.t('Before conversation compaction'),
		needsMatcher: false,
		inputDescription: vscode.l10n.t('Archive transcript before summarizing.'),
		jsonSchema: '{ "trigger": "manual" | "auto", "custom_instructions": string }',
	},
	{
		id: 'SessionStart',
		label: vscode.l10n.t('When a session is initialized'),
		needsMatcher: false,
		inputDescription: vscode.l10n.t('Initialize logging and telemetry.'),
		jsonSchema: '{ "source": "startup" | "resume" | "clear" | "compact" }',
	},
	{
		id: 'SessionEnd',
		label: vscode.l10n.t('When a session terminates'),
		needsMatcher: false,
		inputDescription: vscode.l10n.t('Clean up temporary resources.'),
		jsonSchema: '{ "reason": "clear" | "logout" | "prompt_input_exit" | "other" }',
	},
	{
		id: 'Notification',
		label: vscode.l10n.t('When agent status messages are sent'),
		needsMatcher: false,
		inputDescription: vscode.l10n.t('Send updates to Slack or dashboards.'),
		jsonSchema: '{ "message": string, "notification_type": string, "title": string }',
	},
] as const;

type HookEventId = typeof HOOK_EVENTS[number]['id'];
type HookEvent = typeof HOOK_EVENTS[number];

/**
 * Settings location type: 'local' or 'shared' for workspace, 'user' for global
 */
type SettingsLocationType = 'local' | 'shared' | 'user';

/**
 * A resolved settings location with full path and label.
 * For multi-root workspaces, there's one local/shared pair per workspace folder.
 */
interface SettingsLocation {
	/** The type of location */
	type: SettingsLocationType;
	/** Display label (e.g., "my-project (local)", "my-project", "User") */
	label: string;
	/** Full path to the settings file */
	settingsPath: URI;
	/** For workspace locations, the workspace folder URI */
	workspaceFolder?: URI;
}

interface HookConfig {
	type: 'command';
	command: string;
}

interface MatcherConfig {
	matcher: string;
	hooks: HookConfig[];
}

interface HooksSettings {
	hooks?: Partial<Record<HookEventId, MatcherConfig[]>>;
}

/**
 * A matcher with its source location tracked
 */
interface MatcherWithSource {
	matcher: string;
	location: SettingsLocation;
}

/**
 * A hook command with its source location tracked
 */
interface HookWithSource {
	command: string;
	location: SettingsLocation;
}

interface IHooksWizardResult {
	event: string;
	matcher: string;
	command: string;
	location: string;
	mode: 'create' | 'edit';
}

/**
 * Slash command handler for configuring Claude Code hooks.
 * Launches a QuickPick wizard to configure hook events, matchers, and commands.
 *
 * Supports two flows:
 * - CREATE: Add new matcher → enter command → select save location
 * - EDIT: Select existing matcher → select/add hook → saves to original location
 */
export class HooksSlashCommand implements IClaudeSlashCommandHandler {
	readonly commandName = 'hooks';
	readonly description = 'Configure Claude Code hooks for tool execution and events';
	readonly commandId = 'copilot.claude.hooks';

	constructor(
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IFileSystemService private readonly fileSystemService: IFileSystemService,
		@INativeEnvService private readonly envService: INativeEnvService,
		@ILogService private readonly logService: ILogService,
	) { }

	async handle(
		_args: string,
		stream: vscode.ChatResponseStream | undefined,
		_token: CancellationToken
	): Promise<vscode.ChatResult> {
		stream?.markdown(vscode.l10n.t('Opening hooks configuration...'));

		// Fire and forget - wizard runs in background
		this._runWizard().catch(error => {
			this.logService.error('[HooksSlashCommand] Error running hooks wizard:', error);
			vscode.window.showErrorMessage(
				vscode.l10n.t('Error configuring hook: {0}', error instanceof Error ? error.message : String(error))
			);
		});

		return {};
	}

	private async _runWizard(): Promise<IHooksWizardResult | undefined> {
		// Step 1: Select hook event
		const eventConfig = await this._selectHookEvent();
		if (!eventConfig) {
			return undefined;
		}

		// Step 2: Determine mode and get matcher
		let matcher: string;
		let targetLocation: SettingsLocation;
		let mode: 'create' | 'edit';

		if (eventConfig.needsMatcher) {
			// Tool-based hook: show matchers with source locations
			const matcherResult = await this._selectOrCreateMatcher(eventConfig);
			if (!matcherResult) {
				return undefined;
			}
			matcher = matcherResult.matcher;
			mode = matcherResult.mode;

			if (mode === 'edit') {
				// Edit mode: use the location where matcher was found
				targetLocation = matcherResult.location!;

				// Show existing hooks for this matcher and allow edit/add
				const hookResult = await this._selectOrAddHookForEdit(eventConfig, matcher, targetLocation);
				if (!hookResult) {
					return undefined;
				}

				// Save to the original location
				await this._saveHookConfig(eventConfig.id, matcher, hookResult.command, targetLocation, hookResult.originalCommand);

				// Open the file at the hook position
				await this._openFileAtHook(targetLocation, hookResult.command);

				return this._showSuccessAndReturn(eventConfig, matcher, hookResult.command, targetLocation, mode);
			} else {
				// Create mode: enter command, then pick location
				const command = await this._enterCommand(eventConfig, matcher);
				if (!command) {
					return undefined;
				}

				const location = await this._selectSaveLocation();
				if (!location) {
					return undefined;
				}

				await this._saveHookConfig(eventConfig.id, matcher, command, location);

				// Open the file at the hook position
				await this._openFileAtHook(location, command);

				return this._showSuccessAndReturn(eventConfig, matcher, command, location, mode);
			}
		} else {
			// Lifecycle hook: matcher is always "*"
			matcher = '*';

			// Check if hooks already exist for this event
			const existingHooks = await this._getExistingHooksWithSource(eventConfig.id, matcher);

			if (existingHooks.length > 0) {
				// Edit mode: show existing hooks
				const hookResult = await this._selectOrAddHookFromList(eventConfig, matcher, existingHooks);
				if (!hookResult) {
					return undefined;
				}

				if (hookResult.mode === 'edit') {
					// Editing existing hook - save to its original location
					await this._saveHookConfig(eventConfig.id, matcher, hookResult.command, hookResult.location!, hookResult.originalCommand);
					await this._openFileAtHook(hookResult.location!, hookResult.command);
					return this._showSuccessAndReturn(eventConfig, matcher, hookResult.command, hookResult.location!, 'edit');
				} else {
					// Adding new hook - ask where to save
					const location = await this._selectSaveLocation();
					if (!location) {
						return undefined;
					}
					await this._saveHookConfig(eventConfig.id, matcher, hookResult.command, location);
					await this._openFileAtHook(location, hookResult.command);
					return this._showSuccessAndReturn(eventConfig, matcher, hookResult.command, location, 'create');
				}
			} else {
				// Create mode: no existing hooks
				const command = await this._enterCommand(eventConfig, matcher);
				if (!command) {
					return undefined;
				}

				const location = await this._selectSaveLocation();
				if (!location) {
					return undefined;
				}

				await this._saveHookConfig(eventConfig.id, matcher, command, location);
				await this._openFileAtHook(location, command);
				return this._showSuccessAndReturn(eventConfig, matcher, command, location, 'create');
			}
		}
	}

	/**
	 * Opens the settings file and positions cursor at the hook command.
	 */
	private async _openFileAtHook(location: SettingsLocation, command: string): Promise<void> {
		try {
			const document = await vscode.workspace.openTextDocument(vscode.Uri.file(location.settingsPath.fsPath));
			const text = document.getText();

			// Find the line containing the command
			const commandEscaped = command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const regex = new RegExp(`"command"\\s*:\\s*"${commandEscaped}"`);
			const match = regex.exec(text);

			let position = new vscode.Position(0, 0);
			if (match) {
				const beforeMatch = text.substring(0, match.index);
				const lineNumber = (beforeMatch.match(/\n/g) || []).length;
				const lastNewline = beforeMatch.lastIndexOf('\n');
				const column = match.index - lastNewline - 1 + match[0].indexOf(command);
				position = new vscode.Position(lineNumber, column);
			}

			const editor = await vscode.window.showTextDocument(document, {
				selection: new vscode.Range(position, position),
				preview: false,
			});

			// Reveal the line in center of editor
			editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
		} catch (error) {
			this.logService.warn(`[HooksSlashCommand] Failed to open file at hook position: ${error}`);
		}
	}

	private _showSuccessAndReturn(
		eventConfig: HookEvent,
		matcher: string,
		command: string,
		location: SettingsLocation,
		mode: 'create' | 'edit'
	): IHooksWizardResult {
		return {
			event: eventConfig.label,
			matcher,
			command,
			location: location.label,
			mode,
		};
	}

	private async _selectHookEvent(): Promise<HookEvent | undefined> {
		const items = HOOK_EVENTS.map((event, index) => ({
			label: `${index + 1}. ${event.id}`,
			description: event.label,
			event,
		}));

		const selected = await vscode.window.showQuickPick(items, {
			title: vscode.l10n.t('Configure Hook'),
			placeHolder: vscode.l10n.t('Which hook would you like to configure?'),
			matchOnDetail: true,
			ignoreFocusOut: true
		});

		return selected?.event;
	}

	/**
	 * Shows existing matchers with their source locations (grouped by location label), plus option to add new.
	 * Returns the selected matcher and whether we're in create or edit mode.
	 */
	private async _selectOrCreateMatcher(eventConfig: HookEvent): Promise<{
		matcher: string;
		mode: 'create' | 'edit';
		location?: SettingsLocation;
	} | undefined> {
		const existingMatchers = await this._getExistingMatchersWithSource(eventConfig.id);

		type MatcherItem = vscode.QuickPickItem & {
			isAddNew: boolean;
			matcher?: string;
			location?: SettingsLocation;
		};

		const addNewItem: MatcherItem = {
			label: '$(add) ' + vscode.l10n.t('Add new matcher...'),
			isAddNew: true,
		};

		// Group matchers by location label and create items with separators
		const items: (MatcherItem | vscode.QuickPickItem)[] = [addNewItem];

		// Group by location label
		const matchersByLocation = new Map<string, MatcherWithSource[]>();
		for (const m of existingMatchers) {
			const existing = matchersByLocation.get(m.location.label) || [];
			existing.push(m);
			matchersByLocation.set(m.location.label, existing);
		}

		for (const [locationLabel, matchers] of matchersByLocation) {
			// Add separator for this location
			items.push({
				label: locationLabel,
				kind: vscode.QuickPickItemKind.Separator,
			});

			// Add matchers from this location
			for (const m of matchers) {
				items.push({
					label: m.matcher,
					isAddNew: false,
					matcher: m.matcher,
					location: m.location,
				});
			}
		}

		const selected = await vscode.window.showQuickPick(items, {
			title: vscode.l10n.t('Configure Hook: {0}', eventConfig.id),
			placeHolder: vscode.l10n.t('Which tool should trigger this hook?'),
			ignoreFocusOut: true,
		}) as MatcherItem | undefined;

		if (!selected) {
			return undefined;
		}

		if (selected.isAddNew) {
			// Create mode: prompt for new matcher
			const newMatcher = await vscode.window.showInputBox({
				title: vscode.l10n.t('Configure Hook: {0}', eventConfig.id),
				prompt: vscode.l10n.t('Enter a tool name or pattern (e.g., "Bash", "Edit", or "*" for all)'),
				placeHolder: vscode.l10n.t('Which tool should trigger this hook?'),
				ignoreFocusOut: true,
			});

			if (!newMatcher) {
				return undefined;
			}

			return { matcher: newMatcher, mode: 'create' };
		}

		// Edit mode: use existing matcher and its location
		return {
			matcher: selected.matcher!,
			mode: 'edit',
			location: selected.location,
		};
	}

	/**
	 * For edit mode: shows hooks for a specific matcher at a specific location.
	 * Allows editing existing or adding new (which also goes to that location).
	 */
	private async _selectOrAddHookForEdit(
		eventConfig: HookEvent,
		matcher: string,
		location: SettingsLocation
	): Promise<{ command: string; originalCommand?: string } | undefined> {
		const existingHooks = await this._getHooksAtLocation(eventConfig.id, matcher, location);

		type HookItem = vscode.QuickPickItem & {
			isAddNew: boolean;
			command?: string;
		};

		const addNewItem: HookItem = {
			label: '$(add) ' + vscode.l10n.t('Add new hook...'),
			isAddNew: true,
		};

		// Build items with location label separator
		const items: (HookItem | vscode.QuickPickItem)[] = [addNewItem];

		if (existingHooks.length > 0) {
			items.push({
				label: location.label,
				kind: vscode.QuickPickItemKind.Separator,
			});

			for (const h of existingHooks) {
				items.push({
					label: h,
					isAddNew: false,
					command: h,
				});
			}
		}

		const selected = await vscode.window.showQuickPick(items, {
			title: vscode.l10n.t('Configure Hook: {0} → {1}', eventConfig.id, matcher),
			placeHolder: vscode.l10n.t('Select a hook to edit or add a new one'),
			ignoreFocusOut: true,
		}) as HookItem | undefined;

		if (!selected) {
			return undefined;
		}

		if (selected.isAddNew) {
			// Add new hook to this location
			const command = await this._enterCommand(eventConfig, matcher, location.label);
			if (!command) {
				return undefined;
			}
			return { command };
		}

		// Edit existing hook
		const editedCommand = await vscode.window.showInputBox({
			title: vscode.l10n.t('Edit Hook: {0} → {1}', eventConfig.id, matcher),
			value: selected.command,
			prompt: vscode.l10n.t('Modifying {0}. Stdin Input: {1}', location.label, eventConfig.jsonSchema),
			placeHolder: './my-hook-script.sh',
			ignoreFocusOut: true,
		});

		if (!editedCommand) {
			return undefined;
		}

		return { command: editedCommand, originalCommand: selected.command };
	}

	/**
	 * For lifecycle hooks: shows all hooks across all locations, grouped by location label.
	 */
	private async _selectOrAddHookFromList(
		eventConfig: HookEvent,
		matcher: string,
		existingHooks: HookWithSource[]
	): Promise<{
		command: string;
		mode: 'create' | 'edit';
		location?: SettingsLocation;
		originalCommand?: string;
	} | undefined> {
		type HookItem = vscode.QuickPickItem & {
			isAddNew: boolean;
			command?: string;
			location?: SettingsLocation;
		};

		const addNewItem: HookItem = {
			label: '$(add) ' + vscode.l10n.t('Add new hook...'),
			isAddNew: true,
		};

		// Build items with location label separators
		const items: (HookItem | vscode.QuickPickItem)[] = [addNewItem];

		// Group by location label
		const hooksByLocation = new Map<string, HookWithSource[]>();
		for (const h of existingHooks) {
			const existing = hooksByLocation.get(h.location.label) || [];
			existing.push(h);
			hooksByLocation.set(h.location.label, existing);
		}

		for (const [locationLabel, hooks] of hooksByLocation) {
			items.push({
				label: locationLabel,
				kind: vscode.QuickPickItemKind.Separator,
			});

			for (const h of hooks) {
				items.push({
					label: h.command,
					isAddNew: false,
					command: h.command,
					location: h.location,
				});
			}
		}

		const selected = await vscode.window.showQuickPick(items, {
			title: vscode.l10n.t('Configure Hook: {0}', eventConfig.id),
			placeHolder: vscode.l10n.t('Select a hook to edit or add a new one'),
			ignoreFocusOut: true,
		}) as HookItem | undefined;

		if (!selected) {
			return undefined;
		}

		if (selected.isAddNew) {
			// Create mode: enter command (location will be asked later)
			const command = await this._enterCommand(eventConfig, matcher);
			if (!command) {
				return undefined;
			}
			return { command, mode: 'create' };
		}

		// Edit mode: edit existing hook
		const editedCommand = await vscode.window.showInputBox({
			title: vscode.l10n.t('Edit Hook: {0}', eventConfig.id),
			value: selected.command,
			prompt: vscode.l10n.t('Modifying {0}. Stdin Input: {1}', selected.location!.label, eventConfig.jsonSchema),
			placeHolder: './my-hook-script.sh',
			ignoreFocusOut: true,
		});

		if (!editedCommand) {
			return undefined;
		}

		return {
			command: editedCommand,
			mode: 'edit',
			location: selected.location,
			originalCommand: selected.command,
		};
	}

	private async _enterCommand(eventConfig: HookEvent, matcher: string, locationLabel?: string): Promise<string | undefined> {
		const promptText = locationLabel
			? vscode.l10n.t('Modifying {0}. Stdin Input: {1}', locationLabel, eventConfig.jsonSchema)
			: vscode.l10n.t('What shell command should run? Stdin Input: {0}', eventConfig.jsonSchema);

		return vscode.window.showInputBox({
			title: eventConfig.needsMatcher
				? vscode.l10n.t('Configure Hook: {0} → {1}', eventConfig.id, matcher)
				: vscode.l10n.t('Configure Hook: {0}', eventConfig.id),
			placeHolder: './my-hook-script.sh',
			prompt: promptText,
			ignoreFocusOut: true,
		});
	}

	private async _selectSaveLocation(): Promise<SettingsLocation | undefined> {
		type LocationItem = vscode.QuickPickItem & {
			location: SettingsLocation;
		};

		const items: LocationItem[] = [];
		const homeDir = this.envService.userHome.fsPath;
		const workspaceFolders = this.workspaceService.getWorkspaceFolders();

		// Add workspace-level locations for each workspace folder
		for (const folderUri of workspaceFolders) {
			const folderName = this.workspaceService.getWorkspaceFolderName(folderUri);

			// Workspace (local)
			const localPath = URI.joinPath(folderUri, '.claude', 'settings.local.json');
			items.push({
				label: workspaceFolders.length > 1
					? vscode.l10n.t('Workspace (local) - {0}', folderName)
					: vscode.l10n.t('Workspace (local)'),
				description: `${folderName}/.claude/settings.local.json`,
				location: {
					type: 'local',
					label: workspaceFolders.length > 1 ? vscode.l10n.t('Workspace (local) - {0}', folderName) : vscode.l10n.t('Workspace (local)'),
					workspaceFolder: folderUri,
					settingsPath: localPath,
				},
			});

			// Workspace (shared)
			const sharedPath = URI.joinPath(folderUri, '.claude', 'settings.json');
			items.push({
				label: workspaceFolders.length > 1
					? vscode.l10n.t('Workspace - {0}', folderName)
					: vscode.l10n.t('Workspace'),
				description: `${folderName}/.claude/settings.json`,
				location: {
					type: 'shared',
					label: workspaceFolders.length > 1 ? vscode.l10n.t('Workspace - {0}', folderName) : vscode.l10n.t('Workspace'),
					workspaceFolder: folderUri,
					settingsPath: sharedPath,
				},
			});
		}

		// Add user-level location
		const userPath = URI.joinPath(this.envService.userHome, '.claude', 'settings.json');
		let userDisplayPath = userPath.fsPath;
		if (homeDir && userDisplayPath.startsWith(homeDir)) {
			userDisplayPath = '~' + userDisplayPath.slice(homeDir.length);
		}
		items.push({
			label: vscode.l10n.t('User'),
			description: userDisplayPath,
			location: {
				type: 'user',
				label: vscode.l10n.t('User'),
				settingsPath: userPath,
			},
		});

		const selected = await vscode.window.showQuickPick(items, {
			title: vscode.l10n.t('Save Hook Configuration'),
			placeHolder: vscode.l10n.t('Where should this hook be saved?'),
			ignoreFocusOut: true,
		});

		return selected?.location;
	}

	/**
	 * Gets all possible settings locations for reading existing hooks.
	 */
	private _getAllSettingsLocations(): SettingsLocation[] {
		const locations: SettingsLocation[] = [];
		const workspaceFolders = this.workspaceService.getWorkspaceFolders();

		// Add workspace-level locations for each workspace folder
		for (const folderUri of workspaceFolders) {
			const folderName = this.workspaceService.getWorkspaceFolderName(folderUri);

			// Workspace (local)
			locations.push({
				type: 'local',
				label: workspaceFolders.length > 1 ? vscode.l10n.t('Workspace (local) - {0}', folderName) : vscode.l10n.t('Workspace (local)'),
				workspaceFolder: folderUri,
				settingsPath: URI.joinPath(folderUri, '.claude', 'settings.local.json'),
			});

			// Workspace (shared)
			locations.push({
				type: 'shared',
				label: workspaceFolders.length > 1 ? vscode.l10n.t('Workspace - {0}', folderName) : vscode.l10n.t('Workspace'),
				workspaceFolder: folderUri,
				settingsPath: URI.joinPath(folderUri, '.claude', 'settings.json'),
			});
		}

		// Add user-level location
		locations.push({
			type: 'user',
			label: vscode.l10n.t('User'),
			settingsPath: URI.joinPath(this.envService.userHome, '.claude', 'settings.json'),
		});

		return locations;
	}

	private async _loadSettings(settingsPath: URI): Promise<HooksSettings> {
		try {
			const content = await this.fileSystemService.readFile(settingsPath);
			return JSON.parse(new TextDecoder().decode(content)) as HooksSettings;
		} catch {
			return {};
		}
	}

	private async _saveSettings(settingsPath: URI, settings: HooksSettings): Promise<void> {
		const dirPath = URI.joinPath(settingsPath, '..');
		await createDirectoryIfNotExists(this.fileSystemService, dirPath);

		const content = JSON.stringify(settings, null, '  ');
		await this.fileSystemService.writeFile(settingsPath, new TextEncoder().encode(content));
	}

	/**
	 * Saves a hook configuration.
	 * If originalCommand is provided, replaces that command; otherwise adds new.
	 */
	private async _saveHookConfig(
		event: HookEventId,
		matcher: string,
		command: string,
		location: SettingsLocation,
		originalCommand?: string
	): Promise<void> {
		const settingsPath = location.settingsPath;
		const settings = await this._loadSettings(settingsPath);

		if (!settings.hooks) {
			settings.hooks = {};
		}

		if (!settings.hooks[event]) {
			settings.hooks[event] = [];
		}

		let matcherConfig = settings.hooks[event]!.find(m => m.matcher === matcher);
		if (!matcherConfig) {
			matcherConfig = { matcher, hooks: [] };
			settings.hooks[event]!.push(matcherConfig);
		}

		if (originalCommand) {
			// Edit mode: replace the original command
			const hookIndex = matcherConfig.hooks.findIndex(h => h.command === originalCommand);
			if (hookIndex >= 0) {
				matcherConfig.hooks[hookIndex] = { type: 'command', command };
			} else {
				// Original not found, just add new
				matcherConfig.hooks.push({ type: 'command', command });
			}
		} else {
			// Create mode: add if not already present
			const existingHook = matcherConfig.hooks.find(h => h.command === command);
			if (!existingHook) {
				matcherConfig.hooks.push({ type: 'command', command });
			}
		}

		await this._saveSettings(settingsPath, settings);
	}

	/**
	 * Gets all matchers for an event, tracking which settings file each came from.
	 */
	private async _getExistingMatchersWithSource(event: HookEventId): Promise<MatcherWithSource[]> {
		const matchers: MatcherWithSource[] = [];
		const allLocations = this._getAllSettingsLocations();

		for (const location of allLocations) {
			try {
				const settings = await this._loadSettings(location.settingsPath);
				if (settings.hooks?.[event]) {
					for (const matcherConfig of settings.hooks[event]!) {
						// Check if we already have this matcher from a higher-priority location
						const existing = matchers.find(m => m.matcher === matcherConfig.matcher);
						if (!existing) {
							matchers.push({
								matcher: matcherConfig.matcher,
								location,
							});
						}
					}
				}
			} catch {
				// Ignore errors, settings file might not exist
			}
		}

		return matchers;
	}

	/**
	 * Gets all hooks for an event/matcher, tracking which settings file each came from.
	 */
	private async _getExistingHooksWithSource(event: HookEventId, matcher: string): Promise<HookWithSource[]> {
		const hooks: HookWithSource[] = [];
		const allLocations = this._getAllSettingsLocations();

		for (const location of allLocations) {
			try {
				const settings = await this._loadSettings(location.settingsPath);
				if (settings.hooks?.[event]) {
					const matcherConfig = settings.hooks[event]!.find(m => m.matcher === matcher);
					if (matcherConfig) {
						for (const hook of matcherConfig.hooks) {
							hooks.push({
								command: hook.command,
								location,
							});
						}
					}
				}
			} catch {
				// Ignore errors, settings file might not exist
			}
		}

		return hooks;
	}

	/**
	 * Gets hooks for a specific matcher at a specific location only.
	 */
	private async _getHooksAtLocation(event: HookEventId, matcher: string, location: SettingsLocation): Promise<string[]> {
		try {
			const settings = await this._loadSettings(location.settingsPath);
			if (settings.hooks?.[event]) {
				const matcherConfig = settings.hooks[event]!.find(m => m.matcher === matcher);
				if (matcherConfig) {
					return matcherConfig.hooks.map(h => h.command);
				}
			}
		} catch {
			// Ignore errors
		}
		return [];
	}
}

// Self-register the hooks command
registerClaudeSlashCommand(HooksSlashCommand);
