/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import picomatch from 'picomatch';
import * as vscode from 'vscode';
import { INativeEnvService } from '../../../platform/env/common/envService';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { ILogService } from '../../../platform/log/common/logService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { Emitter } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { basename, dirname } from '../../../util/vs/base/common/resources';
import { URI } from '../../../util/vs/base/common/uri';
import { IClaudeRuntimeDataService } from '../claude/common/claudeRuntimeDataService';
import { ClaudeSettingsFile, ClaudeSettingsLocationType, IClaudeSettingsService } from '../claude/common/claudeSettingsService';
import { ClaudeSessionUri } from '../claude/common/claudeSessionUri';
import { IPromptsService } from '../../../platform/promptFiles/common/promptsService';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { HOOK_EVENTS } from '@anthropic-ai/claude-agent-sdk';
import { ExtensionDisablementStore } from '../common/extensionDisablementStore';

// TODO: Consider reporting Claude slash commands (from Query.supportedCommands()) when appropriate
// TODO: Report MCP servers when ChatSessionCustomizationType.Mcp is available (use Query.mcpServerStatus())

/**
 * Internal item type that extends the API item with a flag indicating
 * whether the customization is owned by a VS Code extension.
 */
interface ClaudeCustomizationItem extends vscode.ChatSessionCustomizationItem {
	readonly vscodeOwned?: boolean;
}

/**
 * Hard-coded CLAUDE.md instruction file names that Claude recognizes.
 * Per workspace folder: CLAUDE.md, CLAUDE.local.md, .claude/CLAUDE.md, .claude/CLAUDE.local.md
 * User home: ~/.claude/CLAUDE.md
 */
const WORKSPACE_INSTRUCTION_PATHS = [
	'CLAUDE.md',
	'CLAUDE.local.md',
	['.claude', 'CLAUDE.md'] as const,
	['.claude', 'CLAUDE.local.md'] as const,
] as const;

const HOME_INSTRUCTION_PATHS = [
	['.claude', 'CLAUDE.md'] as const,
] as const;

export class ClaudeCustomizationProvider extends Disposable implements vscode.ChatSessionCustomizationProvider {

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private readonly _disablementStore: ExtensionDisablementStore;
	private _lastVscodeOwnedUris = new Set<string>();

	static get metadata(): vscode.ChatSessionCustomizationProviderMetadata {
		return {
			label: 'Claude',
			iconId: 'claude',
			supportedTypes: [
				vscode.ChatSessionCustomizationType.Agent,
				vscode.ChatSessionCustomizationType.Skill,
				vscode.ChatSessionCustomizationType.Instructions,
				vscode.ChatSessionCustomizationType.Hook,
			],
		};
	}

	constructor(
		@IPromptsService private readonly promptsService: IPromptsService,
		@IClaudeRuntimeDataService private readonly runtimeDataService: IClaudeRuntimeDataService,
		@IClaudeSettingsService private readonly claudeSettingsService: IClaudeSettingsService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IFileSystemService private readonly fileSystemService: IFileSystemService,
		@INativeEnvService private readonly envService: INativeEnvService,
		@ILogService private readonly logService: ILogService,
		@IVSCodeExtensionContext extensionContext: IVSCodeExtensionContext,
	) {
		super();

		this._disablementStore = new ExtensionDisablementStore('claude', extensionContext.globalState, extensionContext.workspaceState);

		this._register(this.runtimeDataService.onDidChange(() => this._onDidChange.fire()));
		this._register(this.claudeSettingsService.onDidChange(() => this._onDidChange.fire()));
		this._register(this.promptsService.onDidChangeCustomAgents(() => this._onDidChange.fire()));
		this._register(this.promptsService.onDidChangeSkills(() => this._onDidChange.fire()));
		this._register(this.workspaceService.onDidChangeWorkspaceFolders(() => this._onDidChange.fire()));
	}

	async provideChatSessionCustomizations(token: vscode.CancellationToken): Promise<vscode.ChatSessionCustomizationItem[]> {
		const items: ClaudeCustomizationItem[] = [];
		const settingsFiles = await this.claudeSettingsService.readAllSettings();

		// Agents: hybrid approach — file-based .claude/ agents merged with SDK-provided agents.
		// File-based agents are available immediately; SDK agents appear once a session starts.
		const sdkAgents = this.runtimeDataService.getAgents();
		const sdkAgentNames = new Set(sdkAgents.map(a => a.name.toLowerCase()));

		// SDK agents (built-in subagents like "Explore") — preferred when available
		for (const agent of sdkAgents) {
			items.push({
				uri: URI.from({ scheme: ClaudeSessionUri.scheme, path: `/agents/${agent.name}` }),
				type: vscode.ChatSessionCustomizationType.Agent,
				name: agent.name,
				description: agent.description,
				// No groupKey — vscode infers Built-in from non-file: scheme
			});
		}

		// File-based agents from .claude/ paths — shown pre-session, deduplicated with SDK
		for (const agent of await this.promptsService.getCustomAgents(token)) {
			if (isEnabledForClaudeCode(agent) && this.isClaudePath(agent.uri)) {
				const name = agent.name;
				if (!sdkAgentNames.has(name.toLowerCase())) {
					items.push({
						uri: agent.uri,
						type: vscode.ChatSessionCustomizationType.Agent,
						name,
					});
				}
			}
		}

		const agentItems = items.filter(i => i.type === vscode.ChatSessionCustomizationType.Agent);
		this.logService.debug(`[ClaudeCustomizationProvider] agents (${agentItems.length}): ${agentItems.map(a => a.name).join(', ') || '(none)'}${sdkAgents.length ? ' [sdk]' : ' [files-only, no session]'}`);

		// Instructions from hard-coded CLAUDE.md paths (checked for existence)
		const instructionItems = await this.discoverInstructions(settingsFiles);
		items.push(...instructionItems);
		this.logService.debug(`[ClaudeCustomizationProvider] instructions (${instructionItems.length}): ${instructionItems.map(i => i.name).join(', ') || '(none)'}`);

		// Skills from .claude/skills/ directories (user-defined SKILL.md files)
		// Merge skillOverrides across files (first-writer-wins per skill name)
		const skillOverrides: Record<string, string> = {};
		for (const s of [...settingsFiles].reverse()) {
			if (s.settings.skillOverrides) {
				Object.assign(skillOverrides, s.settings.skillOverrides);
			}
		}
		const skillItems: ClaudeCustomizationItem[] = [];
		for (const skill of await this.promptsService.getSkills(token)) {
			if (this.isClaudePath(skill.uri)) {
				const skillName = basename(dirname(skill.uri));
				const override = skillOverrides[skillName];
				const item: ClaudeCustomizationItem = {
					uri: skill.uri,
					type: vscode.ChatSessionCustomizationType.Skill,
					name: skill.name,
					enabled: override !== 'off',
					enablementScope: vscode.ChatSessionCustomizationEnablementScope.Workspace
				};
				skillItems.push(item);
			} else if (skill.extensionId) {
				// Extension-contributed skills (owned by VS Code)
				skillItems.push({
					uri: skill.uri,
					type: vscode.ChatSessionCustomizationType.Skill,
					name: skill.name,
					vscodeOwned: true,
					enabled: !this._disablementStore.isDisabled(skill.uri, 'skill'),
					enablementScope: vscode.ChatSessionCustomizationEnablementScope.Global,
				});
			}
		}
		items.push(...skillItems);
		this.logService.debug(`[ClaudeCustomizationProvider] skills (${skillItems.length}): ${skillItems.map(s => s.name).join(', ') || '(none)'}`);

		// Hooks from .claude/settings.json files
		const hookItems = await this.discoverHooks(settingsFiles);
		items.push(...hookItems);
		this.logService.debug(`[ClaudeCustomizationProvider] hooks (${hookItems.length}): ${hookItems.map(h => h.name).join(', ') || '(none)'}`);

		this.logService.debug(`[ClaudeCustomizationProvider] total: ${items.length} items`);

		// Track vscode-owned URIs for routing enablement handlers
		this._lastVscodeOwnedUris = new Set(
			items.filter(i => i.vscodeOwned).map(i => i.uri.toString()),
		);

		return items;
	}

	private async discoverInstructions(settingsFiles: Readonly<ClaudeSettingsFile[]>): Promise<ClaudeCustomizationItem[]> {
		const items: ClaudeCustomizationItem[] = [];
		const candidates: URI[] = [];

		for (const folder of this.workspaceService.getWorkspaceFolders()) {
			for (const entry of WORKSPACE_INSTRUCTION_PATHS) {
				if (typeof entry === 'string') {
					candidates.push(URI.joinPath(folder, entry));
				} else {
					candidates.push(URI.joinPath(folder, ...entry));
				}
			}
		}

		for (const entry of HOME_INSTRUCTION_PATHS) {
			candidates.push(URI.joinPath(this.envService.userHome, ...entry));
		}

		for (const uri of candidates) {
			if (await this.fileExists(uri)) {
				const name = basename(uri).replace(/\.md$/i, '');

				let excluded = false;
				let excludedByUnknownPattern = false;

				for (const file of settingsFiles) {
					if (!Array.isArray(file.settings.claudeMdExcludes)) {
						continue;
					}
					for (const pattern of file.settings.claudeMdExcludes ?? []) {
						if (typeof pattern !== 'string') {
							continue;
						}
						if (this._matchesExclude(uri, pattern)) {
							excluded = true;
							excludedByUnknownPattern = excludedByUnknownPattern || (uri.path !== pattern);
						}
					}
				}

				items.push({
					uri,
					type: vscode.ChatSessionCustomizationType.Instructions,
					name,
					enablementScope: excludedByUnknownPattern
						? vscode.ChatSessionCustomizationEnablementScope.None :
						vscode.ChatSessionCustomizationEnablementScope.Workspace,
					enabled: !excluded,
				});
			}
		}

		return items;
	}

	private async fileExists(uri: URI): Promise<boolean> {
		try {
			await this.fileSystemService.stat(uri);
			return true;
		} catch {
			return false;
		}
	}

	private async discoverHooks(settingsFiles: Readonly<ClaudeSettingsFile[]>): Promise<ClaudeCustomizationItem[]> {
		const items: ClaudeCustomizationItem[] = [];

		let disableAllHooks = false;
		for (const settingsFile of settingsFiles) {
			try {
				if (!settingsFile.settings.hooks || typeof settingsFile.settings.hooks !== 'object') {
					continue;
				}

				// Higher priority settings files override lower priority ones
				disableAllHooks = disableAllHooks || settingsFile.settings.disableAllHooks === true;

				for (const eventId of HOOK_EVENTS) {
					const matchers = settingsFile.settings.hooks[eventId];
					if (!Array.isArray(matchers)) {
						continue;
					}
					for (const matcher of matchers) {
						if (!Array.isArray(matcher.hooks)) {
							continue;
						}
						for (const hook of matcher.hooks) {
							if (typeof hook !== 'object') {
								continue;
							}
							const matcherLabel = matcher.matcher === '*' ? '' : ` (${matcher.matcher})`;
							let description: string | undefined;
							switch (hook.type) {
								case 'command': description = hook.command; break;
								case 'prompt': description = hook.prompt; break;
								case 'agent': description = hook.prompt; break;
								case 'http': description = hook.url; break;
							}
							items.push({
								uri: settingsFile.uri,
								type: vscode.ChatSessionCustomizationType.Hook,
								name: `${eventId}${matcherLabel}`,
								description,
								enabled: !disableAllHooks,
								// TODO: There isn't a great way to toggle enablement for individual hooks
								enablementScope: vscode.ChatSessionCustomizationEnablementScope.None,
							});
						}
					}
				}
			} catch {
				// Settings file doesn't exist or is invalid — skip
			}
		}

		return items;
	}

	private isClaudePath(uri: URI): boolean {
		const folders = this.workspaceService.getWorkspaceFolders();
		for (const folder of folders) {
			const folderPath = folder.path.endsWith('/') ? folder.path : folder.path + '/';
			if (uri.path.startsWith(folderPath)) {
				const relative = uri.path.slice(folderPath.length);
				if (relative.startsWith('.claude/')) {
					return true;
				}
			}
		}

		// Also check user home .claude/ directory
		const homePath = this.envService.userHome.path;
		const homePrefix = homePath.endsWith('/') ? homePath : homePath + '/';
		if (uri.path.startsWith(homePrefix)) {
			const relative = uri.path.slice(homePrefix.length);
			if (relative.startsWith('.claude/')) {
				return true;
			}
		}

		return false;
	}

	// --- Settings ---

	/**
	 * Checks whether a URI matches a claudeMdExcludes pattern.
	 * Patterns are matched against absolute file paths using picomatch,
	 * consistent with how Claude Code evaluates them.
	 */
	private _matchesExclude(uri: URI, pattern: string): boolean {
		return this._getExcludeMatcher(pattern)(uri.path);
	}

	private readonly _excludeMatcherCache = new Map<string, picomatch.Matcher>();

	private _getExcludeMatcher(pattern: string): picomatch.Matcher {
		let matcher = this._excludeMatcherCache.get(pattern);
		if (!matcher) {
			matcher = picomatch(pattern, { dot: true });
			this._excludeMatcherCache.set(pattern, matcher);
		}
		return matcher;
	}

	// --- Enablement ---

	async handleCustomizationEnablement(uri: vscode.Uri, type: vscode.ChatSessionCustomizationType, enabled: boolean, scope: vscode.ChatSessionCustomizationEnablementScope, _token: vscode.CancellationToken): Promise<void> {
		// TODO: should we support writing to settings.local.json files?
		const location = scope === vscode.ChatSessionCustomizationEnablementScope.Workspace
			? ClaudeSettingsLocationType.Workspace
			: ClaudeSettingsLocationType.User;

		const allSettingsFiles = await this.claudeSettingsService.readAllSettings();

		const writeSettings = async (settingsUri: URI, settings: Parameters<IClaudeSettingsService['writeSettingsFile']>[1]): Promise<void> => {
			try {
				await this.claudeSettingsService.writeSettingsFile(settingsUri, settings);
			} catch (err) {
				void vscode.window.showErrorMessage(vscode.l10n.t('Failed to update Claude settings: {0}', err instanceof Error ? err.message : String(err)));
			}
		};

		if (type.id === vscode.ChatSessionCustomizationType.Skill.id) {
			if (this._lastVscodeOwnedUris.has(uri.toString())) {
				// VS Code extension-contributed skill
				await this._disablementStore.setDisabled(URI.from(uri), 'skill', !enabled, 'global');
				this._onDidChange.fire();
				return;
			} else {
				// Claude-native skill — use skillOverrides
				const skillName = basename(dirname(uri));
				const targetSettingsUri = !enabled ? this.claudeSettingsService.getUri(location, uri) : undefined;

				for (const file of allSettingsFiles) {
					if (file.settings.skillOverrides && typeof file.settings.skillOverrides !== 'object') {
						// skip malformed skillOverrides
						this.logService.warn(`[ClaudeCustomizationProvider] Skipping malformed skillOverrides in ${file.uri.toString()}`);
						continue;
					}

					const isTarget = targetSettingsUri?.toString() === file.uri.toString();
					const skillOverrides = { ...file.settings.skillOverrides ?? {} };
					let shouldUpdateSettings = skillName in skillOverrides;

					delete skillOverrides[skillName];
					if (isTarget) {
						skillOverrides[skillName] = 'off';
						shouldUpdateSettings = true;
					}

					if (shouldUpdateSettings) {
						const updated = { ...file.settings, skillOverrides: Object.keys(skillOverrides).length > 0 ? skillOverrides : undefined };
						await writeSettings(file.uri, updated);
					}
				}
			}
		} else if (type.id === vscode.ChatSessionCustomizationType.Instructions.id) {
			if (this._lastVscodeOwnedUris.has(uri.toString())) {
				// VS Code extension-contributed instruction
				await this._disablementStore.setDisabled(URI.from(uri), 'instructions', !enabled, 'global');
				this._onDidChange.fire();
				return;
			} else {
				// Claude-native instruction — use claudeMdExcludes
				const instructionsUri = uri;
				const targetSettingsUri = !enabled ? this.claudeSettingsService.getUri(location, uri) : undefined;

				for (const file of allSettingsFiles) {
					const isTarget = targetSettingsUri?.toString() === file.uri.toString();

					if (!file.settings.claudeMdExcludes || !Array.isArray(file.settings.claudeMdExcludes)) {
						// File has no claudeMdExcludes — only write if this is the target for disabling
						if (isTarget) {
							const updated = { ...file.settings, claudeMdExcludes: [instructionsUri.path] };
							await writeSettings(file.uri, updated);
						}
						continue;
					}
					const filtered = (file.settings.claudeMdExcludes ?? []).filter(p => p !== instructionsUri.path);
					let shouldUpdateSettings = filtered.length !== (file.settings.claudeMdExcludes ?? []).length;

					const newExcludes = [...filtered];
					if (isTarget && !newExcludes.includes(instructionsUri.path)) {
						newExcludes.push(instructionsUri.path);
						shouldUpdateSettings = true;
					}

					if (shouldUpdateSettings) {
						const updated = { ...file.settings, claudeMdExcludes: newExcludes.length > 0 ? newExcludes : undefined };
						await writeSettings(file.uri, updated);
					}
				}
			}
		} else if (type.id === vscode.ChatSessionCustomizationType.Agent.id && this._lastVscodeOwnedUris.has(uri.toString())) {
			// VS Code extension-contributed agent
			await this._disablementStore.setDisabled(URI.from(uri), 'agent', !enabled, 'global');
			this._onDidChange.fire();
			return;
		} else if (type.id === vscode.ChatSessionCustomizationType.Hook.id) {
			// Hooks are toggled via the disableAllHooks flag in the settings file
			// that contains them. Toggling any hook toggles all hooks in that file.
			for (const file of allSettingsFiles) {
				if (file.uri.toString() !== uri.toString()) {
					continue;
				}
				const newValue = !enabled ? true : undefined;
				const shouldUpdateSettings = file.settings.disableAllHooks !== newValue;
				if (shouldUpdateSettings) {
					const updated = { ...file.settings, disableAllHooks: newValue };
					await writeSettings(file.uri, updated);
				}
			}
		} else {
			this.logService.warn(`[ClaudeCustomizationProvider] Per-item enablement not supported for type: ${type.id}`);
			void vscode.window.showErrorMessage(vscode.l10n.t('Toggling {0} customizations is not supported.', type.id));
			return;
		}

		this.logService.debug(`[ClaudeCustomizationProvider] ${enabled ? 'Enabled' : 'Disabled'} ${type.id} in ${location}`);
		this._onDidChange.fire();
	}

}

export function isEnabledForClaudeCode(customization: { sessionTypes?: readonly string[] }): boolean {
	const sessionTypes = customization.sessionTypes;
	return sessionTypes === undefined || sessionTypes.includes('claude-code') || false;
}
