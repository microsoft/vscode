/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';
import { ICustomInstructionsService } from '../../../platform/customInstructions/common/customInstructionsService';
import { INSTRUCTION_FILE_EXTENSION, SKILL_FILENAME } from '../../../platform/customInstructions/common/promptTypes';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { ILogService } from '../../../platform/log/common/logService';
import { IPromptsService } from '../../../platform/promptFiles/common/promptsService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { isCancellationError } from '../../../util/vs/base/common/errors';
import { Emitter } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { basename } from '../../../util/vs/base/common/resources';
import { URI } from '../../../util/vs/base/common/uri';
import { IChatPromptFileService } from '../common/chatPromptFileService';
import { ICopilotCLIAgents } from '../copilotcli/node/copilotCli';

export class CopilotCLICustomizationProvider extends Disposable implements vscode.ChatSessionCustomizationProvider {

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	static get metadata(): vscode.ChatSessionCustomizationProviderMetadata {
		return {
			label: 'Copilot CLI',
			iconId: 'copilot',
			supportedTypes: [
				vscode.ChatSessionCustomizationType.Agent,
				vscode.ChatSessionCustomizationType.Skill,
				vscode.ChatSessionCustomizationType.Instructions,
				vscode.ChatSessionCustomizationType.Hook,
				vscode.ChatSessionCustomizationType.Plugins,
			].filter((t): t is vscode.ChatSessionCustomizationType => t !== undefined),
		};
	}

	constructor(
		@IChatPromptFileService private readonly chatPromptFileService: IChatPromptFileService,
		@ICopilotCLIAgents private readonly copilotCLIAgents: ICopilotCLIAgents,
		@ICustomInstructionsService private readonly customInstructionsService: ICustomInstructionsService,
		@IPromptsService private readonly promptsService: IPromptsService,
		@ILogService private readonly logService: ILogService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IFileSystemService private readonly fileSystemService: IFileSystemService,
	) {
		super();

		this._register(this.chatPromptFileService.onDidChangeCustomAgents(() => this._onDidChange.fire()));
		this._register(this.chatPromptFileService.onDidChangeInstructions(() => this._onDidChange.fire()));
		this._register(this.chatPromptFileService.onDidChangeSkills(() => this._onDidChange.fire()));
		this._register(this.chatPromptFileService.onDidChangeHooks(() => this._onDidChange.fire()));
		this._register(this.chatPromptFileService.onDidChangePlugins(() => this._onDidChange.fire()));
		this._register(this.copilotCLIAgents.onDidChangeAgents(() => this._onDidChange.fire()));
	}

	async provideChatSessionCustomizations(token: vscode.CancellationToken): Promise<vscode.ChatSessionCustomizationItem[]> {
		const agents = await this.getAgentItems();
		const instructions = await this.getInstructionItems(token);
		const skills = this.getSkillItems();
		const hooks = this.getHookItems();
		const plugins = this.getPluginItems();

		this.logService.debug(`[CopilotCLICustomizationProvider] agents (${agents.length}): ${agents.map(a => a.name).join(', ') || '(none)'}`);
		this.logService.debug(`[CopilotCLICustomizationProvider] instructions (${instructions.length}): ${instructions.map(i => i.name).join(', ') || '(none)'}`);
		this.logService.debug(`[CopilotCLICustomizationProvider] skills (${skills.length}): ${skills.map(s => s.name).join(', ') || '(none)'}`);
		this.logService.debug(`[CopilotCLICustomizationProvider] hooks (${hooks.length}): ${hooks.map(h => h.name).join(', ') || '(none)'}`);

		this.logService.debug(`[CopilotCLICustomizationProvider] plugins (${plugins.length}): ${plugins.map(p => p.name).join(', ') || '(none)'}`);

		const items = [...agents, ...instructions, ...skills, ...hooks, ...plugins];
		this.logService.debug(`[CopilotCLICustomizationProvider] total: ${items.length} items`);
		return items;
	}

	/**
	 * Builds agent items from ICopilotCLIAgents, which already merges SDK
	 * and prompt-file agents with source URIs.
	 */
	private async getAgentItems(): Promise<vscode.ChatSessionCustomizationItem[]> {
		const agentInfos = await this.copilotCLIAgents.getAgents();
		return agentInfos.map(({ agent, sourceUri }) => ({
			uri: sourceUri,
			type: vscode.ChatSessionCustomizationType.Agent,
			name: agent.displayName || agent.name,
			description: agent.description,
		}));
	}

	/**
	 * Collects all instruction items from the prompt file service,
	 * categorizing them with groupKeys and badges matching the core
	 * implementation:
	 * - agent-instructions: AGENTS.md, CLAUDE.md, copilot-instructions.md
	 * - context-instructions: files with an applyTo pattern (badge = pattern)
	 * - on-demand-instructions: files without an applyTo pattern
	 */
	private async getInstructionItems(token: CancellationToken): Promise<vscode.ChatSessionCustomizationItem[]> {
		// Collect agent instruction URIs from customInstructionsService
		// (copilot-instructions.md) plus workspace-root AGENTS.md and CLAUDE.md
		const agentInstructionUriList = await this.customInstructionsService.getAgentInstructions();
		const rootFileNames = ['AGENTS.md', 'CLAUDE.md'];
		for (const folder of this.workspaceService.getWorkspaceFolders()) {
			for (const fileName of rootFileNames) {
				const uri = URI.joinPath(folder, fileName);
				try {
					await this.fileSystemService.stat(uri);
					agentInstructionUriList.push(uri);
				} catch {
					// file doesn't exist
				}
			}
		}

		const items: vscode.ChatSessionCustomizationItem[] = [];
		const seenUris = new Set<string>();

		// Emit agent instruction files (AGENTS.md, CLAUDE.md, copilot-instructions.md)
		// that come from customInstructionsService but may not appear in
		// chatPromptFileService.instructions.
		for (const uri of agentInstructionUriList) {
			seenUris.add(uri.toString());
			items.push({
				uri,
				type: vscode.ChatSessionCustomizationType.Instructions,
				name: basename(uri),
				groupKey: 'agent-instructions',
			});
		}

		for (const instruction of this.chatPromptFileService.instructions) {
			const uri = instruction.uri;

			if (seenUris.has(uri.toString())) {
				continue; // already emitted as agent instruction
			}

			const name = deriveNameFromUri(uri, INSTRUCTION_FILE_EXTENSION);

			let pattern: string | undefined;
			let description: string | undefined;
			try {
				const parsed = await this.promptsService.parseFile(uri, token);
				pattern = parsed.header?.applyTo;
				description = parsed.header?.description;
			} catch (err) {
				if (isCancellationError(err) || token.isCancellationRequested) {
					throw err;
				}
				this.logService.debug(`[CopilotCLICustomizationProvider] failed to parse ${uri.toString()}: ${err}`);
			}

			if (pattern !== undefined) {
				const badge = pattern === '**'
					? l10n.t('always added')
					: pattern;
				const badgeTooltip = pattern === '**'
					? l10n.t('This instruction is automatically included in every interaction.')
					: l10n.t('This instruction is automatically included when files matching \'{0}\' are in context.', pattern);
				items.push({
					uri,
					type: vscode.ChatSessionCustomizationType.Instructions,
					name,
					description,
					groupKey: 'context-instructions',
					badge,
					badgeTooltip,
				});
			} else {
				items.push({
					uri,
					type: vscode.ChatSessionCustomizationType.Instructions,
					name,
					description,
					groupKey: 'on-demand-instructions',
				});
			}
		}

		return items;
	}

	/**
	 * Collects all skill items from the prompt file service.
	 */
	private getSkillItems(): vscode.ChatSessionCustomizationItem[] {
		return this.chatPromptFileService.skills.map(s => ({
			uri: s.uri,
			type: vscode.ChatSessionCustomizationType.Skill,
			name: deriveNameFromUri(s.uri, SKILL_FILENAME),
		}));
	}

	/**
	 * Collects all hook items from the prompt file service.
	 * Each item is a hook configuration file (JSON).
	 */
	private getHookItems(): vscode.ChatSessionCustomizationItem[] {
		return this.chatPromptFileService.hooks.map(h => ({
			uri: h.uri,
			type: vscode.ChatSessionCustomizationType.Hook,
			name: basename(h.uri).replace(/\.json$/i, ''),
		}));
	}

	/**	 * Collects all plugin items from the prompt file service.
	 */
	private getPluginItems(): vscode.ChatSessionCustomizationItem[] {
		return this.chatPromptFileService.plugins.map(p => ({
			uri: p.uri,
			type: vscode.ChatSessionCustomizationType.Plugins,
			name: basename(p.uri),
		}));
	}
}

function deriveNameFromUri(uri: vscode.Uri, extensionOrFilename: string): string {
	const filename = basename(uri);
	if (filename.toLowerCase() === extensionOrFilename.toLowerCase()) {
		// For files like SKILL.md, use the parent directory name
		const parts = uri.path.split('/');
		return parts.length >= 2 ? parts[parts.length - 2] : filename;
	}
	if (filename.endsWith(extensionOrFilename)) {
		return filename.slice(0, -extensionOrFilename.length);
	}
	return filename;
}
