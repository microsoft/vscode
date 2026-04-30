/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';
import { ICustomInstructionsService } from '../../../../platform/customInstructions/common/customInstructionsService';
import { IFileSystemService } from '../../../../platform/filesystem/common/fileSystemService';
import { ILogService } from '../../../../platform/log/common/logService';
import { IPromptsService } from '../../../../platform/promptFiles/common/promptsService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { isCancellationError } from '../../../../util/vs/base/common/errors';
import { Emitter } from '../../../../util/vs/base/common/event';
import { Disposable } from '../../../../util/vs/base/common/lifecycle';
import { basename } from '../../../../util/vs/base/common/resources';
import { URI } from '../../../../util/vs/base/common/uri';
import { ICopilotCLIAgents, isEnabledForCopilotCLI } from '../../copilotcli/node/copilotCli';

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
		@ICopilotCLIAgents private readonly copilotCLIAgents: ICopilotCLIAgents,
		@ICustomInstructionsService private readonly customInstructionsService: ICustomInstructionsService,
		@IPromptsService private readonly promptsService: IPromptsService,
		@ILogService private readonly logService: ILogService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IFileSystemService private readonly fileSystemService: IFileSystemService,
	) {
		super();

		this._register(this.promptsService.onDidChangeCustomAgents(() => this._onDidChange.fire()));
		this._register(this.promptsService.onDidChangeInstructions(() => this._onDidChange.fire()));
		this._register(this.promptsService.onDidChangeSkills(() => this._onDidChange.fire()));
		this._register(this.promptsService.onDidChangeHooks(() => this._onDidChange.fire()));
		this._register(this.promptsService.onDidChangePlugins(() => this._onDidChange.fire()));
		this._register(this.copilotCLIAgents.onDidChangeAgents(() => this._onDidChange.fire()));
	}

	async provideChatSessionCustomizations(token: vscode.CancellationToken): Promise<vscode.ChatSessionCustomizationItem[]> {
		const [agents, instructions, skills, hooks, plugins] = await Promise.all([
			this.getAgentItems(token),
			this.getInstructionItems(token),
			this.getSkillItems(token),
			this.getHookItems(token),
			this.getPluginItems(token),
		].map(p => p.catch(err => {
			if (isCancellationError(err) || token.isCancellationRequested) {
				throw err;
			}
			this.logService.error(`[CopilotCLICustomizationProvider] failed to get customizations: ${err}`);
			return [];
		})));

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
	private async getAgentItems(_token: vscode.CancellationToken): Promise<vscode.ChatSessionCustomizationItem[]> {
		const agentInfos = await this.copilotCLIAgents.getAgents();
		return agentInfos.map(({ agent, sourceUri, pluginUri, extensionId }) => ({
			uri: sourceUri,
			type: vscode.ChatSessionCustomizationType.Agent,
			name: agent.displayName || agent.name,
			description: agent.description,
			extensionId,
			pluginUri
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
		// promptsService.getInstructions().
		for (const uri of agentInstructionUriList) {
			seenUris.add(uri.toString());
			items.push({
				uri,
				type: vscode.ChatSessionCustomizationType.Instructions,
				name: basename(uri),
				description: undefined,
				groupKey: 'agent-instructions',
				extensionId: undefined,
				pluginUri: undefined
			});
		}

		for (const instruction of await this.promptsService.getInstructions(token)) {
			const uri = instruction.uri;
			if (!isEnabledForCopilotCLI(instruction)) {
				continue; // only include instructions that are relevant for copilotcli
			}

			if (seenUris.has(uri.toString())) {
				continue; // already emitted as agent instruction
			}

			const name = instruction.name;
			const pattern = instruction.pattern;
			const description = instruction.description;

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
					extensionId: instruction.extensionId,
					pluginUri: instruction.pluginUri
				});
			} else {
				items.push({
					uri,
					type: vscode.ChatSessionCustomizationType.Instructions,
					name,
					description,
					groupKey: 'on-demand-instructions',
					extensionId: instruction.extensionId,
					pluginUri: instruction.pluginUri
				});
			}
		}

		return items;
	}

	/**
	 * Collects all skill items from the prompt file service.
	 */
	private async getSkillItems(token: vscode.CancellationToken): Promise<vscode.ChatSessionCustomizationItem[]> {
		return (await this.promptsService.getSkills(token)).filter(isEnabledForCopilotCLI).map(s => ({
			uri: s.uri,
			type: vscode.ChatSessionCustomizationType.Skill,
			name: s.name,
			description: s.description,
			extensionId: s.extensionId,
			pluginUri: s.pluginUri,
		}));
	}

	/**
	 * Collects all hook items from the prompt file service.
	 * Each item is a hook configuration file (JSON).
	 */
	private async getHookItems(token: vscode.CancellationToken): Promise<vscode.ChatSessionCustomizationItem[]> {
		return (await this.promptsService.getHooks(token)).filter(isEnabledForCopilotCLI).map(h => ({
			uri: h.uri,
			type: vscode.ChatSessionCustomizationType.Hook,
			name: basename(h.uri).replace(/\.json$/i, ''),
			description: undefined,
			extensionId: h.extensionId,
			pluginUri: h.pluginUri,
		}));
	}

	/**
	 * Collects all plugin items from the prompt file service.
	 */
	private async getPluginItems(token: vscode.CancellationToken): Promise<vscode.ChatSessionCustomizationItem[]> {
		return (await this.promptsService.getPlugins(token)).filter(isEnabledForCopilotCLI).map(p => ({
			uri: p.uri,
			type: vscode.ChatSessionCustomizationType.Plugins,
			name: basename(p.uri),
			description: undefined,
			extensionId: undefined,
			pluginUri: undefined,
		}));
	}
}
