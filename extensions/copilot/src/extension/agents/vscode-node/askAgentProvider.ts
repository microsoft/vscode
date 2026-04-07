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
 * Base Ask agent configuration.
 * The Ask agent is read-only: it answers questions, explains code, and
 * provides information without modifying the workspace.
 */
const BASE_ASK_AGENT_CONFIG: AgentConfig = {
	name: 'Ask',
	description: 'Answers questions without making changes',
	argumentHint: 'Ask a question about your code or project',
	target: 'vscode',
	disableModelInvocation: true,
	agents: [],
	tools: [
		...DEFAULT_READ_TOOLS,
		'vscode.mermaid-chat-features/renderMermaidDiagram',
	],
	body: '' // Generated dynamically in buildCustomizedConfig
};

/**
 * Provides the Ask agent dynamically with settings-based customization.
 *
 * The Ask agent is a read-only conversational mode for answering questions,
 * explaining code, and researching topics without making any edits to the
 * workspace. It uses an embedded configuration and generates .agent.md content
 * with settings-based customization (additional tools and model override).
 */
export class AskAgentProvider extends Disposable implements vscode.ChatCustomAgentProvider {
	readonly label = vscode.l10n.t('Ask Agent');

	private static readonly CACHE_DIR = 'ask-agent';
	private static readonly AGENT_FILENAME = `Ask${AGENT_FILE_EXTENSION}`;

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
			if (e.affectsConfiguration(ConfigKey.AskAgentAdditionalTools.fullyQualifiedId) ||
				e.affectsConfiguration(ConfigKey.AskAgentModel.fullyQualifiedId)) {
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
			AskAgentProvider.CACHE_DIR
		);

		try {
			await this._fileSystemService.stat(cacheDir);
		} catch {
			await this._fileSystemService.createDirectory(cacheDir);
		}

		const fileUri = vscode.Uri.joinPath(cacheDir, AskAgentProvider.AGENT_FILENAME);
		await this._fileSystemService.writeFile(fileUri, new TextEncoder().encode(content));
		this._logService.trace(`[AskAgentProvider] Wrote agent file: ${fileUri.toString()}`);
		return fileUri;
	}

	static buildAgentBody(): string {
		return `You are an ASK AGENT — a knowledgeable assistant that answers questions, explains code, and provides information.

Your job: understand the user's question → research the codebase as needed → provide a clear, thorough answer. You are strictly read-only: NEVER modify files or run commands that change state.

<rules>
- NEVER use file editing tools, terminal commands that modify state, or any write operations
- Focus on answering questions, explaining concepts, and providing information
- Use search and read tools to gather context from the codebase when needed
- Provide code examples in your responses when helpful, but do NOT apply them
- Use #tool:vscode/askQuestions to clarify ambiguous questions before researching
- When the user's question is about code, reference specific files and symbols
- If a question would require making changes, explain what changes would be needed but do NOT make them
</rules>

<capabilities>
You can help with:
- **Code explanation**: How does this code work? What does this function do?
- **Architecture questions**: How is the project structured? How do components interact?
- **Debugging guidance**: Why might this error occur? What could cause this behavior?
- **Best practices**: What's the recommended approach for X? How should I structure Y?
- **API and library questions**: How do I use this API? What does this method expect?
- **Codebase navigation**: Where is X defined? Where is Y used?
- **General programming**: Language features, algorithms, design patterns, etc.
</capabilities>

<workflow>
1. **Understand** the question — identify what the user needs to know
2. **Research** the codebase if needed — use search and read tools to find relevant code
3. **Clarify** if the question is ambiguous — use #tool:vscode/askQuestions
4. **Answer** clearly — provide a well-structured response with references to relevant code
</workflow>`;
	}

	private _buildCustomizedConfig(): AgentConfig {
		const additionalTools = this._configurationService.getConfig(ConfigKey.AskAgentAdditionalTools);
		const modelOverride = this._configurationService.getConfig(ConfigKey.AskAgentModel);

		// Collect tools to add
		const toolsToAdd: string[] = [...additionalTools];

		// Always include askQuestions tool (now provided by core)
		toolsToAdd.push('vscode/askQuestions');

		// Merge additional tools (deduplicated)
		const tools = toolsToAdd.length > 0
			? [...new Set([...BASE_ASK_AGENT_CONFIG.tools, ...toolsToAdd])]
			: [...BASE_ASK_AGENT_CONFIG.tools];

		return {
			...BASE_ASK_AGENT_CONFIG,
			tools,
			body: AskAgentProvider.buildAgentBody(),
			...(modelOverride ? { model: modelOverride } : {}),
		};
	}
}
