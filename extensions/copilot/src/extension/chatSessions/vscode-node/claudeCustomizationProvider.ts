/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { INativeEnvService } from '../../../platform/env/common/envService';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { ILogService } from '../../../platform/log/common/logService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { Emitter } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { basename } from '../../../util/vs/base/common/resources';
import { URI } from '../../../util/vs/base/common/uri';
import { IClaudeRuntimeDataService } from '../claude/common/claudeRuntimeDataService';
import { ClaudeSessionUri } from '../claude/common/claudeSessionUri';
import { IPromptsService } from '../../../platform/promptFiles/common/promptsService';

// TODO: Consider reporting Claude slash commands (from Query.supportedCommands()) when appropriate
// TODO: Report MCP servers when ChatSessionCustomizationType.Mcp is available (use Query.mcpServerStatus())

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

/**
 * Hook event IDs that Claude supports, matching the HookEvent types from
 * the Claude Agent SDK. Used to discover hooks from .claude/settings.json.
 */
const HOOK_EVENT_IDS = [
	'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest',
	'UserPromptSubmit', 'Stop', 'SubagentStart', 'SubagentStop',
	'PreCompact', 'SessionStart', 'SessionEnd', 'Notification',
] as const;

interface HookConfig {
	readonly type: string;
	readonly command: string;
}

interface MatcherConfig {
	readonly matcher: string;
	readonly hooks: HookConfig[];
}

interface HooksSettings {
	readonly hooks?: Partial<Record<string, MatcherConfig[]>>;
}

export class ClaudeCustomizationProvider extends Disposable implements vscode.ChatSessionCustomizationProvider {

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

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
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IFileSystemService private readonly fileSystemService: IFileSystemService,
		@INativeEnvService private readonly envService: INativeEnvService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this._register(this.runtimeDataService.onDidChange(() => this._onDidChange.fire()));
		this._register(this.promptsService.onDidChangeCustomAgents(() => this._onDidChange.fire()));
		this._register(this.promptsService.onDidChangeSkills(() => this._onDidChange.fire()));
		this._register(this.workspaceService.onDidChangeWorkspaceFolders(() => this._onDidChange.fire()));
	}

	async provideChatSessionCustomizations(token: vscode.CancellationToken): Promise<vscode.ChatSessionCustomizationItem[]> {
		const items: vscode.ChatSessionCustomizationItem[] = [];

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
			if (this.isClaudePath(agent.uri)) {
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
		const instructionItems = await this.discoverInstructions();
		items.push(...instructionItems);
		this.logService.debug(`[ClaudeCustomizationProvider] instructions (${instructionItems.length}): ${instructionItems.map(i => i.name).join(', ') || '(none)'}`);

		// Skills from .claude/skills/ directories (user-defined SKILL.md files)
		const skillItems: vscode.ChatSessionCustomizationItem[] = [];
		for (const skill of await this.promptsService.getSkills(token)) {
			if (this.isClaudePath(skill.uri)) {
				const item: vscode.ChatSessionCustomizationItem = {
					uri: skill.uri,
					type: vscode.ChatSessionCustomizationType.Skill,
					name: skill.name,
				};
				skillItems.push(item);
			}
		}
		items.push(...skillItems);
		this.logService.debug(`[ClaudeCustomizationProvider] skills (${skillItems.length}): ${skillItems.map(s => s.name).join(', ') || '(none)'}`);

		// Hooks from .claude/settings.json files
		const hookItems = await this.discoverHooks();
		items.push(...hookItems);
		this.logService.debug(`[ClaudeCustomizationProvider] hooks (${hookItems.length}): ${hookItems.map(h => h.name).join(', ') || '(none)'}`);

		this.logService.debug(`[ClaudeCustomizationProvider] total: ${items.length} items`);
		return items;
	}

	private async discoverInstructions(): Promise<vscode.ChatSessionCustomizationItem[]> {
		const items: vscode.ChatSessionCustomizationItem[] = [];
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
				items.push({
					uri,
					type: vscode.ChatSessionCustomizationType.Instructions,
					name,
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

	private async discoverHooks(): Promise<vscode.ChatSessionCustomizationItem[]> {
		const items: vscode.ChatSessionCustomizationItem[] = [];
		const settingsPaths = this.getSettingsFilePaths();

		for (const settingsUri of settingsPaths) {
			try {
				const content = await this.fileSystemService.readFile(settingsUri);
				const settings: HooksSettings = JSON.parse(new TextDecoder().decode(content));
				if (!settings.hooks) {
					continue;
				}

				for (const eventId of HOOK_EVENT_IDS) {
					const matchers = settings.hooks[eventId];
					if (!matchers || matchers.length === 0) {
						continue;
					}

					for (const matcher of matchers) {
						for (const hook of matcher.hooks) {
							const matcherLabel = matcher.matcher === '*' ? '' : ` (${matcher.matcher})`;
							items.push({
								uri: settingsUri,
								type: vscode.ChatSessionCustomizationType.Hook,
								name: `${eventId}${matcherLabel}`,
								description: hook.command,
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

	private getSettingsFilePaths(): URI[] {
		const paths: URI[] = [];

		for (const folder of this.workspaceService.getWorkspaceFolders()) {
			paths.push(URI.joinPath(folder, '.claude', 'settings.json'));
			paths.push(URI.joinPath(folder, '.claude', 'settings.local.json'));
		}

		paths.push(URI.joinPath(this.envService.userHome, '.claude', 'settings.json'));
		return paths;
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
}

