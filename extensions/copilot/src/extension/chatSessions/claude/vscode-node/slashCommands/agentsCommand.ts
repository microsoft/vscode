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
import { DisposableStore } from '../../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../../util/vs/base/common/uri';
import { IClaudeSlashCommandHandler, registerClaudeSlashCommand } from './claudeSlashCommandRegistry';

/**
 * AGENTS CONFIGURATION WIZARD
 * ===========================
 *
 * This wizard allows users to create and manage specialized Claude subagents that can be
 * delegated to for specific tasks. Each agent has its own system prompt, tools, and model.
 *
 * ## MAIN MENU
 * Shows a list of all agents with options to create new or manage existing ones.
 *
 * - Create new agent (always available)
 * - Project agents (.claude/agents/) - listed with model
 * - User/Personal agents (~/.claude/agents/) - listed with model
 *
 * ## CREATE FLOW
 * 1. Choose location (Project .claude/agents/ or Personal ~/.claude/agents/)
 * 2. Choose creation method:
 *    - Generate with Claude (recommended): Describe what the agent should do
 *    - Manual configuration: Enter type, system prompt, description manually
 * 3. For "Generate with Claude":
 *    a. Enter description of what agent should do
 *    b. Wait for generation
 *    c. Select tools (with advanced options for individual tools/MCP)
 *    d. Select model
 *    e. File is saved and opened
 * 4. For "Manual configuration":
 *    a. Enter agent type identifier (e.g., "test-runner")
 *    b. Enter system prompt
 *    c. Enter description (when Claude should use this agent)
 *    d. Select tools
 *    e. Select model
 *    f. File is saved and opened
 *
 * ## EDIT FLOW (selecting existing agent)
 * 1. Choose action:
 *    - View agent (opens file)
 *    - Edit agent (shows edit menu)
 *    - Delete agent (with confirmation)
 *    - Back (returns to main menu)
 * 2. Edit menu:
 *    - Open in editor
 *    - Edit tools (tool picker)
 *    - Edit model (model picker)
 *
 * ## AGENT FILE FORMAT
 * Agents are stored as markdown files with YAML frontmatter:
 * ```
 * ---
 * name: agent-name
 * description: "When Claude should use this agent..."
 * model: sonnet
 * allowedTools:
 *   - Read
 *   - Grep
 *   - Glob
 * ---
 *
 * System prompt content here...
 * ```
 */

/**
 * Agent location type
 */
type AgentLocationType = 'project' | 'user';

/**
 * Agent file location
 */
interface AgentLocation {
	type: AgentLocationType;
	label: string;
	agentsDir: URI;
	workspaceFolder?: URI;
}

/**
 * Parsed agent configuration
 */
interface AgentConfig {
	name: string;
	description: string;
	model: string;
	allowedTools?: string[];
	systemPrompt: string;
}

/**
 * Agent with its source location
 */
interface AgentWithSource {
	config: AgentConfig;
	location: AgentLocation;
	filePath: URI;
}

/**
 * Available models for agents
 */
const AGENT_MODELS = [
	{
		id: 'sonnet',
		label: 'Sonnet',
		description: 'Balanced performance - best for most agents',
		isDefault: true,
	},
	{
		id: 'opus',
		label: 'Opus',
		description: 'Most capable for complex reasoning tasks',
	},
	{
		id: 'haiku',
		label: 'Haiku',
		description: 'Fast and efficient for simple tasks',
	},
	{
		id: 'inherit',
		label: 'Inherit from parent',
		description: 'Use the same model as the main conversation',
	},
] as const;

/**
 * Tool categories for selection
 */
const TOOL_CATEGORIES = [
	{ id: 'readonly', label: 'Read-only tools', tools: ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'] },
	{ id: 'edit', label: 'Edit tools', tools: ['Edit', 'Write', 'NotebookEdit'] },
	{ id: 'execution', label: 'Execution tools', tools: ['Bash'] },
	{ id: 'mcp', label: 'MCP tools', tools: [] }, // Populated dynamically
	{ id: 'other', label: 'Other tools', tools: ['Skill', 'Task', 'TodoWrite'] },
] as const;

/**
 * All individual tools
 */
const ALL_TOOLS = [
	'Bash',
	'Glob',
	'Grep',
	'Read',
	'Edit',
	'Write',
	'NotebookEdit',
	'WebFetch',
	'WebSearch',
	'Skill',
	'Task',
	'TodoWrite',
] as const;

/**
 * Slash command handler for managing Claude agents.
 * Launches a QuickPick wizard to create, view, edit, and delete agents.
 */
export class AgentsSlashCommand implements IClaudeSlashCommandHandler {
	readonly commandName = 'agents';
	readonly description = 'Create and manage specialized Claude agents';
	readonly commandId = 'copilot.claude.agents';

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
		stream?.markdown(vscode.l10n.t('Opening agents configuration...'));

		// Fire and forget - wizard runs in background
		this._runWizard().catch(error => {
			this.logService.error('[AgentsSlashCommand] Error running agents wizard:', error);
			vscode.window.showErrorMessage(
				vscode.l10n.t('Error configuring agent: {0}', error instanceof Error ? error.message : String(error))
			);
		});

		return {};
	}

	private async _runWizard(): Promise<void> {
		// Main menu - show agents list
		const result = await this._showMainMenu();
		if (!result) {
			return;
		}

		if (result.action === 'create') {
			await this._runCreateFlow();
		} else if (result.action === 'select' && result.agent) {
			await this._runAgentActionMenu(result.agent);
		}
	}

	/**
	 * Shows the main agents list menu.
	 */
	private async _showMainMenu(): Promise<{ action: 'create' | 'select'; agent?: AgentWithSource } | undefined> {
		const projectAgents = await this._loadProjectAgents();
		const userAgents = await this._loadUserAgents();

		type AgentMenuItem = vscode.QuickPickItem & {
			action: 'create' | 'select';
			agent?: AgentWithSource;
		};

		const items: (AgentMenuItem | vscode.QuickPickItem)[] = [];

		// Create new agent option
		items.push({
			label: '$(add) ' + vscode.l10n.t('Create new agent'),
			action: 'create',
		});

		// Project agents section
		if (projectAgents.length > 0) {
			items.push({
				label: vscode.l10n.t('Project agents'),
				kind: vscode.QuickPickItemKind.Separator,
			});

			for (const agent of projectAgents) {
				items.push({
					label: agent.config.name,
					description: `· ${agent.config.model}`,
					action: 'select',
					agent,
				});
			}
		}

		// User/Personal agents section
		if (userAgents.length > 0) {
			items.push({
				label: vscode.l10n.t('Personal agents'),
				kind: vscode.QuickPickItemKind.Separator,
			});

			for (const agent of userAgents) {
				items.push({
					label: agent.config.name,
					description: `· ${agent.config.model}`,
					action: 'select',
					agent,
				});
			}
		}

		// Show placeholder text if no custom agents
		const placeholderText = projectAgents.length === 0 && userAgents.length === 0
			? vscode.l10n.t('No agents found. Create specialized subagents that Claude can delegate to.')
			: vscode.l10n.t('Select an agent to view, edit, or delete');

		const selected = await vscode.window.showQuickPick(items, {
			title: vscode.l10n.t('Agents'),
			placeHolder: placeholderText,
			ignoreFocusOut: true,
		}) as AgentMenuItem | undefined;

		if (!selected) {
			return undefined;
		}

		return { action: selected.action, agent: selected.agent };
	}

	/**
	 * Runs the create agent flow.
	 */
	private async _runCreateFlow(): Promise<void> {
		// Step 1: Choose location
		const location = await this._selectLocation();
		if (!location) {
			return;
		}

		// Step 2: Choose creation method
		const method = await this._selectCreationMethod();
		if (!method) {
			return;
		}

		if (method === 'generate') {
			await this._runGenerateFlow(location);
		} else {
			await this._runManualFlow(location);
		}
	}

	/**
	 * Step 1: Select where to save the agent.
	 */
	private async _selectLocation(): Promise<AgentLocation | undefined> {
		type LocationItem = vscode.QuickPickItem & { location: AgentLocation };

		const items: LocationItem[] = [];

		// Project location (first workspace folder)
		const workspaceFolders = this.workspaceService.getWorkspaceFolders();
		if (workspaceFolders.length > 0) {
			const firstFolder = workspaceFolders[0];
			items.push({
				label: vscode.l10n.t('1. Project (.claude/agents/)'),
				location: {
					type: 'project',
					label: vscode.l10n.t('Project'),
					agentsDir: URI.joinPath(firstFolder, '.claude', 'agents'),
					workspaceFolder: firstFolder,
				},
			});
		}

		// Personal location
		items.push({
			label: vscode.l10n.t('2. Personal (~/.claude/agents/)'),
			location: {
				type: 'user',
				label: vscode.l10n.t('Personal'),
				agentsDir: URI.joinPath(this.envService.userHome, '.claude', 'agents'),
			},
		});

		const selected = await vscode.window.showQuickPick(items, {
			title: vscode.l10n.t('Create new agent'),
			placeHolder: vscode.l10n.t('Choose location'),
			ignoreFocusOut: true,
		});

		return selected?.location;
	}

	/**
	 * Step 2: Select creation method.
	 */
	private async _selectCreationMethod(): Promise<'generate' | 'manual' | undefined> {
		const items: (vscode.QuickPickItem & { method: 'generate' | 'manual' })[] = [
			{
				label: vscode.l10n.t('1. Generate with Claude (recommended)'),
				method: 'generate',
			},
			{
				label: vscode.l10n.t('2. Manual configuration'),
				method: 'manual',
			},
		];

		const selected = await vscode.window.showQuickPick(items, {
			title: vscode.l10n.t('Create new agent'),
			placeHolder: vscode.l10n.t('Creation method'),
			ignoreFocusOut: true,
		});

		return selected?.method;
	}

	/**
	 * Generate flow: describe agent, generate, select tools, select model.
	 */
	private async _runGenerateFlow(location: AgentLocation): Promise<void> {
		// Step 3: Enter description
		const description = await vscode.window.showInputBox({
			title: vscode.l10n.t('Create new agent'),
			prompt: vscode.l10n.t('Describe what this agent should do and when it should be used (be comprehensive for best results)'),
			placeHolder: vscode.l10n.t('e.g., Help me write unit tests for my code...'),
			ignoreFocusOut: true,
		});

		if (!description) {
			return;
		}

		// Step 4: Generate agent with Claude
		const generated = await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: vscode.l10n.t('Generating agent from description...'),
			cancellable: true,
		}, async (_progress, token) => {
			return this._generateAgentConfig(description, token);
		});

		if (!generated) {
			return;
		}

		// Step 5: Select tools
		const tools = await this._selectTools();
		if (!tools) {
			return;
		}

		// Step 6: Select model
		const model = await this._selectModel();
		if (!model) {
			return;
		}

		// Build final config
		const config: AgentConfig = {
			name: generated.name,
			description: generated.description,
			model,
			allowedTools: tools.length > 0 && !tools.includes('*') ? tools : undefined,
			systemPrompt: generated.systemPrompt,
		};

		// Save and open
		const filePath = URI.joinPath(location.agentsDir, `${config.name}.md`);
		await this._saveAgent(filePath, config);
		await this._openAgentFile(filePath);
	}

	/**
	 * Manual flow: enter type, system prompt, description, select tools, select model.
	 */
	private async _runManualFlow(location: AgentLocation): Promise<void> {
		// Step 3: Enter agent type (identifier)
		const name = await vscode.window.showInputBox({
			title: vscode.l10n.t('Create new agent'),
			prompt: vscode.l10n.t('Enter a unique identifier for your agent:'),
			placeHolder: vscode.l10n.t('e.g., test-runner, tech-lead, etc'),
			ignoreFocusOut: true,
			validateInput: value => {
				if (!value) {
					return vscode.l10n.t('Agent name is required');
				}
				if (!/^[a-z0-9-]+$/.test(value)) {
					return vscode.l10n.t('Use lowercase letters, numbers, and hyphens only');
				}
				return null;
			},
		});

		if (!name) {
			return;
		}

		// Step 4: Enter system prompt
		const systemPrompt = await vscode.window.showInputBox({
			title: vscode.l10n.t('Create new agent'),
			prompt: vscode.l10n.t('Enter the system prompt for your agent:') + '\n' + vscode.l10n.t('Be comprehensive for best results'),
			placeHolder: vscode.l10n.t('You are a helpful code reviewer who...'),
			ignoreFocusOut: true,
		});

		if (!systemPrompt) {
			return;
		}

		// Step 5: Enter description
		const description = await vscode.window.showInputBox({
			title: vscode.l10n.t('Create new agent'),
			prompt: vscode.l10n.t('When should Claude use this agent?'),
			placeHolder: vscode.l10n.t("e.g., use this agent after you're done writing code..."),
			ignoreFocusOut: true,
		});

		if (!description) {
			return;
		}

		// Step 6: Select tools
		const tools = await this._selectTools();
		if (!tools) {
			return;
		}

		// Step 7: Select model
		const model = await this._selectModel();
		if (!model) {
			return;
		}

		// Build config
		const config: AgentConfig = {
			name,
			description,
			model,
			allowedTools: tools.length > 0 && !tools.includes('*') ? tools : undefined,
			systemPrompt,
		};

		// Save and open
		const filePath = URI.joinPath(location.agentsDir, `${config.name}.md`);
		await this._saveAgent(filePath, config);
		await this._openAgentFile(filePath);
	}

	/**
	 * Generate agent config using Claude.
	 */
	private async _generateAgentConfig(
		description: string,
		token: vscode.CancellationToken
	): Promise<{ name: string; description: string; systemPrompt: string } | undefined> {
		try {
			const prompt = `Based on the following description, generate a Claude agent configuration.

Description: ${description}

Respond with a JSON object containing:
1. "name": A short, kebab-case identifier (e.g., "test-runner", "code-reviewer")
2. "description": A detailed description of when Claude should use this agent (include examples)
3. "systemPrompt": A comprehensive system prompt that defines the agent's behavior, expertise, and guidelines

Keep the systemPrompt focused but thorough. Include specific instructions for how the agent should approach tasks.

Respond ONLY with the JSON object, no markdown code blocks or other text.`;

			// Use claude-sonnet-4.5 for agent generation (fast and efficient for structured output)
			let models = await vscode.lm.selectChatModels({ family: 'claude-sonnet-4.5', vendor: 'copilot' });
			if (models.length === 0) {
				// Fallback to any available model
				models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
				// Get latest claude-sonnet- model
				models = models
					.filter(model => model.family.startsWith('claude-sonnet-'))
					.sort((a, b) => b.family.localeCompare(a.family));
				if (models.length === 0) {
					vscode.window.showErrorMessage(vscode.l10n.t('No language model available for agent generation'));
					return undefined;
				}
			}

			const response = await models[0].sendRequest(
				[vscode.LanguageModelChatMessage.User(prompt)],
				{},
				token
			);

			let responseText = '';
			for await (const chunk of response.stream) {
				if (chunk instanceof vscode.LanguageModelTextPart) {
					responseText += chunk.value;
				}
			}

			// Strip markdown code blocks if present
			let jsonText = responseText.trim();
			const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
			if (codeBlockMatch) {
				jsonText = codeBlockMatch[1].trim();
			}

			// Parse JSON response
			const parsed = JSON.parse(jsonText);
			return {
				name: parsed.name,
				description: parsed.description,
				systemPrompt: parsed.systemPrompt,
			};
		} catch (error) {
			this.logService.error('[AgentsSlashCommand] Failed to generate agent:', error);
			vscode.window.showErrorMessage(
				vscode.l10n.t('Failed to generate agent: {0}', error instanceof Error ? error.message : String(error))
			);
			return undefined;
		}
	}

	/**
	 * Select tools for the agent (multi-select with categories).
	 */
	private async _selectTools(): Promise<string[] | undefined> {
		type ToolPickItem = vscode.QuickPickItem & {
			categoryId?: string;
			toolId?: string;
		};

		// Toggle button for advanced options
		const showAdvancedButton: vscode.QuickInputButton = {
			iconPath: new vscode.ThemeIcon('chevron-down'),
			tooltip: vscode.l10n.t('Show advanced options'),
		};
		const hideAdvancedButton: vscode.QuickInputButton = {
			iconPath: new vscode.ThemeIcon('chevron-up'),
			tooltip: vscode.l10n.t('Hide advanced options'),
		};

		let showAdvanced = false;
		let resolved = false;

		return new Promise<string[] | undefined>((resolve) => {
			const disposables = new DisposableStore();
			const quickPick = vscode.window.createQuickPick<ToolPickItem>();
			disposables.add(quickPick);
			quickPick.title = vscode.l10n.t('Create new agent');
			quickPick.placeholder = vscode.l10n.t('Select tools');
			quickPick.canSelectMany = true;
			quickPick.ignoreFocusOut = true;
			quickPick.buttons = [showAdvancedButton];

			const updateItems = () => {
				const items: ToolPickItem[] = [];

				// Tool categories
				for (const cat of TOOL_CATEGORIES) {
					items.push({
						label: cat.label,
						categoryId: cat.id,
					});
				}

				// Advanced: individual tools
				if (showAdvanced) {
					items.push({
						label: vscode.l10n.t('Individual Tools'),
						kind: vscode.QuickPickItemKind.Separator,
					});

					for (const tool of ALL_TOOLS) {
						items.push({
							label: tool,
							toolId: tool,
						});
					}
				}

				// Preserve selection when updating items
				const previouslySelectedIds = new Set(
					quickPick.selectedItems.map(item => item.categoryId || item.toolId)
				);

				quickPick.items = items;

				// Restore selection
				quickPick.selectedItems = items.filter(item => {
					const id = item.categoryId || item.toolId;
					return id && previouslySelectedIds.has(id);
				});
			};

			// Initialize with all categories selected
			updateItems();
			quickPick.selectedItems = quickPick.items.filter(item => item.categoryId);

			disposables.add(quickPick.onDidTriggerButton((button) => {
				if (button === showAdvancedButton || button === hideAdvancedButton) {
					showAdvanced = !showAdvanced;
					quickPick.buttons = [showAdvanced ? hideAdvancedButton : showAdvancedButton];
					updateItems();
				}
			}));

			disposables.add(quickPick.onDidAccept(() => {
				if (resolved) {
					return;
				}
				resolved = true;

				const selectedItems = quickPick.selectedItems;
				disposables.dispose();

				// Check if all categories are selected - treat as "all tools"
				const selectedCategoryIds = new Set(
					selectedItems.filter(item => item.categoryId).map(item => item.categoryId)
				);
				const allCategoriesSelected = TOOL_CATEGORIES.every(cat => selectedCategoryIds.has(cat.id));
				if (allCategoriesSelected) {
					resolve(['*']);
					return;
				}

				// Collect selected tools from categories and individual tools
				const tools = new Set<string>();
				for (const item of selectedItems) {
					if (item.categoryId) {
						const cat = TOOL_CATEGORIES.find(c => c.id === item.categoryId);
						if (cat) {
							for (const tool of cat.tools) {
								tools.add(tool);
							}
						}
					} else if (item.toolId) {
						tools.add(item.toolId);
					}
				}

				resolve(Array.from(tools));
			}));

			disposables.add(quickPick.onDidHide(() => {
				disposables.dispose();
				if (!resolved) {
					resolved = true;
					resolve(undefined);
				}
			}));

			quickPick.show();
		});
	}

	/**
	 * Select model for the agent.
	 */
	private async _selectModel(): Promise<string | undefined> {
		const items = AGENT_MODELS.map((model, index) => ({
			label: `${index + 1}. ${model.label}${'isDefault' in model && model.isDefault ? ' $(check)' : ''}`,
			description: model.description,
			modelId: model.id,
		}));

		const selected = await vscode.window.showQuickPick(items, {
			title: vscode.l10n.t('Create new agent'),
			placeHolder: vscode.l10n.t('Select model') + '\n' + vscode.l10n.t("Model determines the agent's reasoning capabilities and speed."),
			ignoreFocusOut: true,
		});

		return selected?.modelId;
	}

	/**
	 * Shows the action menu for a selected agent.
	 */
	private async _runAgentActionMenu(agent: AgentWithSource): Promise<void> {
		type ActionItem = vscode.QuickPickItem & { action: 'view' | 'edit' | 'delete' | 'back' };

		const items: ActionItem[] = [
			{ label: vscode.l10n.t('1. View agent'), action: 'view' },
			{ label: vscode.l10n.t('2. Edit agent'), action: 'edit' },
			{ label: vscode.l10n.t('3. Delete agent'), action: 'delete' },
			{ label: vscode.l10n.t('4. Back'), action: 'back' },
		];

		const selected = await vscode.window.showQuickPick(items, {
			title: agent.config.name,
			placeHolder: vscode.l10n.t('Choose an action'),
			ignoreFocusOut: true,
		});

		if (!selected) {
			return;
		}

		switch (selected.action) {
			case 'view':
				await this._openAgentFile(agent.filePath);
				break;
			case 'edit':
				await this._runEditMenu(agent);
				break;
			case 'delete':
				await this._deleteAgent(agent);
				break;
			case 'back':
				await this._runWizard();
				break;
		}
	}

	/**
	 * Shows the edit menu for an agent.
	 */
	private async _runEditMenu(agent: AgentWithSource): Promise<void> {
		type EditItem = vscode.QuickPickItem & { action: 'open' | 'tools' | 'model' };

		const items: EditItem[] = [
			{ label: '$(edit) ' + vscode.l10n.t('Open in editor'), action: 'open' },
			{ label: '$(tools) ' + vscode.l10n.t('Edit tools'), action: 'tools' },
			{ label: '$(symbol-misc) ' + vscode.l10n.t('Edit model'), action: 'model' },
		];

		const selected = await vscode.window.showQuickPick(items, {
			title: vscode.l10n.t('Edit agent: {0}', agent.config.name),
			placeHolder: vscode.l10n.t('Source: {0}', agent.location.label),
			ignoreFocusOut: true,
		});

		if (!selected) {
			return;
		}

		switch (selected.action) {
			case 'open':
				await this._openAgentFile(agent.filePath);
				break;
			case 'tools': {
				const tools = await this._selectTools();
				if (tools) {
					const updatedConfig = {
						...agent.config,
						allowedTools: tools.includes('*') ? undefined : tools,
					};
					await this._saveAgent(agent.filePath, updatedConfig);
					await this._openAgentFile(agent.filePath);
				}
				break;
			}
			case 'model': {
				const model = await this._selectModel();
				if (model) {
					const updatedConfig = {
						...agent.config,
						model,
					};
					await this._saveAgent(agent.filePath, updatedConfig);
					await this._openAgentFile(agent.filePath);
				}
				break;
			}
		}
	}

	/**
	 * Delete an agent with confirmation.
	 */
	private async _deleteAgent(agent: AgentWithSource): Promise<void> {
		const confirm = await vscode.window.showWarningMessage(
			vscode.l10n.t('Are you sure you want to delete the agent "{0}"?', agent.config.name),
			{ modal: true },
			vscode.l10n.t('Delete')
		);

		if (confirm === vscode.l10n.t('Delete')) {
			await this.fileSystemService.delete(agent.filePath);
			vscode.window.showInformationMessage(vscode.l10n.t('Agent "{0}" deleted', agent.config.name));
			// Return to main menu
			await this._runWizard();
		}
	}

	/**
	 * Load all project agents from .claude/agents/ directories.
	 */
	private async _loadProjectAgents(): Promise<AgentWithSource[]> {
		const agents: AgentWithSource[] = [];
		const workspaceFolders = this.workspaceService.getWorkspaceFolders();

		for (const folder of workspaceFolders) {
			const agentsDir = URI.joinPath(folder, '.claude', 'agents');
			const location: AgentLocation = {
				type: 'project',
				label: vscode.l10n.t('Project'),
				agentsDir,
				workspaceFolder: folder,
			};

			const loaded = await this._loadAgentsFromDirectory(agentsDir, location);
			agents.push(...loaded);
		}

		return agents;
	}

	/**
	 * Load all user/personal agents from ~/.claude/agents/.
	 */
	private async _loadUserAgents(): Promise<AgentWithSource[]> {
		const agentsDir = URI.joinPath(this.envService.userHome, '.claude', 'agents');
		const location: AgentLocation = {
			type: 'user',
			label: vscode.l10n.t('Personal'),
			agentsDir,
		};

		return this._loadAgentsFromDirectory(agentsDir, location);
	}

	/**
	 * Load agents from a specific directory.
	 */
	private async _loadAgentsFromDirectory(dir: URI, location: AgentLocation): Promise<AgentWithSource[]> {
		const agents: AgentWithSource[] = [];

		try {
			const entries = await this.fileSystemService.readDirectory(dir);

			for (const [name, type] of entries) {
				if (type === vscode.FileType.File && name.endsWith('.md')) {
					const filePath = URI.joinPath(dir, name);
					try {
						const config = await this._parseAgentFile(filePath);
						if (config) {
							agents.push({ config, location, filePath });
						}
					} catch (error) {
						this.logService.warn(`[AgentsSlashCommand] Failed to parse agent file ${filePath.fsPath}: ${error}`);
					}
				}
			}
		} catch {
			// Directory doesn't exist or can't be read
		}

		return agents;
	}

	/**
	 * Parse an agent markdown file with YAML frontmatter.
	 */
	private async _parseAgentFile(filePath: URI): Promise<AgentConfig | undefined> {
		try {
			const content = await this.fileSystemService.readFile(filePath);
			const text = new TextDecoder().decode(content);

			// Parse YAML frontmatter
			const frontmatterMatch = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
			if (!frontmatterMatch) {
				return undefined;
			}

			const frontmatter = frontmatterMatch[1];
			const systemPrompt = frontmatterMatch[2].trim();

			// Simple YAML parsing for the fields we need
			const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
			const descMatch = frontmatter.match(/^description:\s*["']?([\s\S]*?)["']?$/m);
			const modelMatch = frontmatter.match(/^model:\s*(.+)$/m);

			// Parse allowedTools if present
			const toolsMatch = frontmatter.match(/^allowedTools:\s*\n((?:\s+-\s+.+\n?)+)/m);
			let allowedTools: string[] | undefined;
			if (toolsMatch) {
				allowedTools = toolsMatch[1]
					.split('\n')
					.map(line => line.match(/^\s+-\s+(.+)$/)?.[1])
					.filter((t): t is string => !!t);
			}

			if (!nameMatch || !modelMatch) {
				return undefined;
			}

			return {
				name: nameMatch[1].trim(),
				description: descMatch ? descMatch[1].trim() : '',
				model: modelMatch[1].trim(),
				allowedTools,
				systemPrompt,
			};
		} catch {
			return undefined;
		}
	}

	/**
	 * Save an agent to a markdown file.
	 */
	private async _saveAgent(filePath: URI, config: AgentConfig): Promise<void> {
		// Ensure directory exists
		const dir = URI.joinPath(filePath, '..');
		await createDirectoryIfNotExists(this.fileSystemService, dir);

		// Build the file content
		let content = `---\nname: ${config.name}\ndescription: "${config.description.replace(/"/g, '\\"')}"\nmodel: ${config.model}\n`;

		if (config.allowedTools && config.allowedTools.length > 0) {
			content += 'allowedTools:\n';
			for (const tool of config.allowedTools) {
				content += `  - ${tool}\n`;
			}
		}

		content += `---\n\n${config.systemPrompt}\n`;

		await this.fileSystemService.writeFile(filePath, new TextEncoder().encode(content));
	}

	/**
	 * Open an agent file in the editor.
	 */
	private async _openAgentFile(filePath: URI): Promise<void> {
		const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath.fsPath));
		await vscode.window.showTextDocument(doc);
	}
}

// Self-register the agents command
registerClaudeSlashCommand(AgentsSlashCommand);
