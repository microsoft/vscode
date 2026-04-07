/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { AGENT_FILE_EXTENSION } from '../../../platform/customInstructions/common/promptTypes';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { ILogService } from '../../../platform/log/common/logService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { AgentConfig, buildAgentMarkdown, DEFAULT_READ_TOOLS } from './agentTypes';

/**
 * Fallback model priority list for the Explore agent.
 * Passed as a YAML array; the runtime picks the first available model.
 */
const EXPLORE_AGENT_FALLBACK_MODELS: readonly string[] = [
	'Claude Haiku 4.5 (copilot)',
	'Gemini 3 Flash (Preview) (copilot)',
	'Auto (copilot)',
];

/**
 * Base Explore agent configuration.
 * The Explore agent is a read-only code research subagent that autonomously
 * digs through codebases using multiple search strategies.
 */
const BASE_EXPLORE_AGENT_CONFIG: AgentConfig = {
	name: 'Explore',
	description: 'Fast read-only codebase exploration and Q&A subagent. Prefer over manually chaining multiple search and file-reading operations to avoid cluttering the main conversation. Safe to call in parallel. Specify thoroughness: quick, medium, or thorough.',
	argumentHint: 'Describe WHAT you\'re looking for and desired thoroughness (quick/medium/thorough)',
	target: 'vscode',
	userInvocable: false,
	agents: [],
	tools: [
		...DEFAULT_READ_TOOLS,
	],
	body: '' // Generated dynamically in buildCustomizedConfig
};

/**
 * Provides the Explore agent dynamically with settings-based customization.
 *
 * The Explore agent is a read-only code research subagent designed to be
 * invoked by other agents (e.g., Plan) for autonomous codebase exploration.
 * It uses small/fast models by default and focuses on search-heavy workflows.
 */
export class ExploreAgentProvider extends Disposable implements vscode.ChatCustomAgentProvider {
	readonly label = vscode.l10n.t('Explore Agent');

	private static readonly CACHE_DIR = 'explore-agent';
	private static readonly AGENT_FILENAME = `Explore${AGENT_FILE_EXTENSION}`;

	private readonly _onDidChangeCustomAgents = this._register(new vscode.EventEmitter<void>());
	readonly onDidChangeCustomAgents = this._onDidChangeCustomAgents.event;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IVSCodeExtensionContext private readonly _extensionContext: IVSCodeExtensionContext,
		@IFileSystemService private readonly _fileSystemService: IFileSystemService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('chat.exploreAgent.defaultModel') ||
				e.affectsConfiguration(ConfigKey.ExploreAgentModel.fullyQualifiedId)) {
				this._onDidChangeCustomAgents.fire();
			}
		}));
	}

	async provideCustomAgents(
		_context: unknown,
		_token: vscode.CancellationToken
	): Promise<vscode.ChatResource[]> {
		const config = this._buildCustomizedConfig();
		const content = buildAgentMarkdown(config);
		const fileUri = await this._writeCacheFile(content);
		return [{ uri: fileUri }];
	}

	private async _writeCacheFile(content: string): Promise<vscode.Uri> {
		const cacheDir = vscode.Uri.joinPath(
			this._extensionContext.globalStorageUri,
			ExploreAgentProvider.CACHE_DIR
		);

		try {
			await this._fileSystemService.stat(cacheDir);
		} catch {
			await this._fileSystemService.createDirectory(cacheDir);
		}

		const fileUri = vscode.Uri.joinPath(cacheDir, ExploreAgentProvider.AGENT_FILENAME);
		await this._fileSystemService.writeFile(fileUri, new TextEncoder().encode(content));
		this._logService.trace(`[ExploreAgentProvider] Wrote agent file: ${fileUri.toString()}`);
		return fileUri;
	}

	static buildAgentBody(): string {
		return `You are an exploration agent specialized in rapid codebase analysis and answering questions efficiently.

## Search Strategy

- Go **broad to narrow**:
	1. Start with glob patterns or semantic codesearch to discover relevant areas
	2. Narrow with text search (regex) or usages (LSP) for specific symbols or patterns
	3. Read files only when you know the path or need full context
- Pay attention to provided agent instructions/rules/skills as they apply to areas of the codebase to better understand architecture and best practices.
- Use the github repo tool to search references in external dependencies.

## Speed Principles

Adapt search strategy based on the requested thoroughness level.

**Bias for speed** — return findings as quickly as possible:
- Parallelize independent tool calls (multiple greps, multiple reads)
- Stop searching once you have sufficient context
- Make targeted searches, not exhaustive sweeps

## Output

Report findings directly as a message. Include:
- Files with absolute links
- Specific functions, types, or patterns that can be reused
- Analogous existing features that serve as implementation templates
- Clear answers to what was asked, not comprehensive overviews

Remember: Your goal is searching efficiently through MAXIMUM PARALLELISM to report concise and clear answers.`;
	}

	private _buildCustomizedConfig(): AgentConfig {
		// Model selection priority: core config > extension config > fallback list
		// Empty string means "not set", so we explicitly check for truthy values
		const coreDefaultModel = this._configurationService.getNonExtensionConfig<string>('chat.exploreAgent.defaultModel');
		const extModel = this._configurationService.getConfig(ConfigKey.ExploreAgentModel);
		const model: string | readonly string[] = coreDefaultModel || extModel || EXPLORE_AGENT_FALLBACK_MODELS;

		return {
			...BASE_EXPLORE_AGENT_CONFIG,
			body: ExploreAgentProvider.buildAgentBody(),
			model,
		};
	}
}
