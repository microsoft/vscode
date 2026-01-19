/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { localize } from '../../../../nls.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IAICoreService } from '../common/aiCoreService.js';
import { IAISpecService } from '../common/specService.js';
import { ITaskBreakdownService } from '../common/taskBreakdownService.js';
import { ILLMService } from '../common/llmService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IStatusbarService, StatusbarAlignment, IStatusbarEntryAccessor } from '../../statusbar/browser/statusbar.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { URI } from '../../../../base/common/uri.js';

// ============================================================================
// AI Core Configuration Registration
// ============================================================================
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'aiCore',
	title: localize('aiCore', 'AI Core'),
	type: 'object',
	properties: {
		'aiCore.useGLM': {
			type: 'boolean',
			default: true,
			description: localize('aiCore.useGLM', 'Use GLM-4.7 as the default AI model (bypasses GitHub Copilot login)')
		},
		'aiCore.glmApiKey': {
			type: 'string',
			default: '',
			description: localize('aiCore.glmApiKey', 'API Key for GLM-4.7 (leave empty to use built-in key)')
		},
		'aiCore.glmModel': {
			type: 'string',
			default: 'glm-4.7',
			enum: ['glm-4.7', 'glm-4-plus', 'glm-4-air', 'glm-4-flash'],
			description: localize('aiCore.glmModel', 'GLM model to use')
		},
		'aiCore.agentMode': {
			type: 'boolean',
			default: true,
			description: localize('aiCore.agentMode', 'Enable Agent mode with full tool access (file operations, terminal commands, etc.)')
		},
		'aiCore.executionMode': {
			type: 'string',
			default: 'autopilot', // 默认 Autopilot 模式 - 自动执行
			enum: ['autopilot', 'supervised'],
			enumDescriptions: [
				localize('aiCore.executionMode.autopilot', 'Autopilot - AI automatically executes changes without confirmation (faster, for experienced users)'),
				localize('aiCore.executionMode.supervised', 'Supervised - Each change requires your approval with diff preview (safer, recommended)')
			],
			description: localize('aiCore.executionMode', 'Execution mode: Autopilot (auto-execute) or Supervised (confirm each change)')
		},
		'aiCore.defaultChatMode': {
			type: 'string',
			default: 'vibe',
			enum: ['vibe', 'spec'],
			enumDescriptions: [
				localize('aiCore.chatMode.vibe', 'Vibe Mode - Chat first, then build. Quick exploration and iteration.'),
				localize('aiCore.chatMode.spec', 'Spec Mode - Plan first, then build. Structured requirements and design.')
			],
			description: localize('aiCore.defaultChatMode', 'Default chat mode: Vibe (quick chat) or Spec (structured planning)')
		},
		'aiCore.enableThinking': {
			type: 'boolean',
			default: true,
			description: localize('aiCore.enableThinking', 'Enable deep thinking mode for complex reasoning tasks (GLM-4.7)')
		},
		'aiCore.enableWebSearch': {
			type: 'boolean',
			default: true,
			description: localize('aiCore.enableWebSearch', 'Enable web search to get real-time information from the internet (always enabled)')
		},
		'aiCore.searchEngine': {
			type: 'string',
			default: 'search_pro',
			enum: ['search_std', 'search_pro', 'search_pro_sogou', 'search_pro_quark'],
			enumDescriptions: [
				localize('aiCore.searchEngine.std', 'Standard search (cheapest, 0.01 CNY/query)'),
				localize('aiCore.searchEngine.pro', 'Pro search (recommended, 0.03 CNY/query)'),
				localize('aiCore.searchEngine.sogou', 'Sogou search (Tencent ecosystem, 0.05 CNY/query)'),
				localize('aiCore.searchEngine.quark', 'Quark search (vertical content, 0.05 CNY/query)')
			],
			description: localize('aiCore.searchEngine', 'Search engine to use for web search')
		},
		'aiCore.index.enabled': {
			type: 'boolean',
			default: true,
			description: localize('aiCore.index.enabled', 'Enable code indexing for @codebase search')
		},
		'aiCore.index.autoIndex': {
			type: 'boolean',
			default: true,
			description: localize('aiCore.index.autoIndex', 'Automatically index workspace on startup')
		}
	}
});

// Import services
import { IAgentToolService } from './agentToolService.js';
import './agentToolService.js'; // Ensure it's registered
import { ICodeIndexService } from './codeIndexService.js';
import './codeIndexService.js'; // Ensure it's registered

// ============================================================================
// AI Core: Dump Context
// ============================================================================
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'aicore.debugDumpContext',
			title: {
				value: localize('aicore.debugDumpContext', 'AI Core: Dump Context'),
				original: 'AI Core: Dump Context'
			},
			menu: [{ id: MenuId.CommandPalette }]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const aiCoreService = accessor.get(IAICoreService);
		const specService = accessor.get(IAISpecService);
		const logService = accessor.get(ILogService);
		const notificationService = accessor.get(INotificationService);

		const context = await aiCoreService.buildContext({
			sessionId: 'manual',
			message: '',
			mode: 'chat'
		});

		const activeFile = context.files.find(f => f.isActive);
		const recentCount = context.recentFiles?.length ?? 0;
		const symbolCount = context.symbols?.length ?? 0;
		const specConfig = specService.getConfig();
		const rulesCount = specConfig.rules.filter(r => r.enabled !== false).length;

		// 详细日志
		logService.info(`[AICoreService]: === Context Dump ===`);
		logService.info(`[AICoreService]: Active file: ${activeFile?.uri ?? 'none'} (${activeFile?.languageId ?? '-'})`);
		logService.info(`[AICoreService]: Active file content length: ${activeFile?.content.length ?? 0} chars`);
		logService.info(`[AICoreService]: Recent files: ${recentCount}`);
		context.recentFiles?.forEach((f, i) => {
			logService.info(`[AICoreService]:   [${i + 1}] ${f.uri}`);
		});
		logService.info(`[AICoreService]: Symbols: ${symbolCount}`);
		context.symbols?.slice(0, 10).forEach(s => {
			logService.info(`[AICoreService]:   - ${s.kind}: ${s.name}`);
		});
		if (symbolCount > 10) {
			logService.info(`[AICoreService]:   ... and ${symbolCount - 10} more`);
		}
		logService.info(`[AICoreService]: Spec rules: ${rulesCount}`);
		specConfig.rules.filter(r => r.enabled !== false).forEach(r => {
			logService.info(`[AICoreService]:   - [${r.id}] ${r.content.slice(0, 50)}...`);
		});

		notificationService.info(localize(
			'aicore.debugDumpContextDone3',
			'AI Core: {0} file, {1} recent, {2} symbols, {3} rules',
			context.files.length,
			recentCount,
			symbolCount,
			rulesCount
		));
	}
});

// ============================================================================
// AI Core: Initialize Spec Config (.aispec)
// ============================================================================
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'aicore.initSpec',
			title: {
				value: localize('aicore.initSpec', 'AI Core: Initialize .aispec Config'),
				original: 'AI Core: Initialize .aispec Config'
			},
			menu: [{ id: MenuId.CommandPalette }]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const specService = accessor.get(IAISpecService);
		const notificationService = accessor.get(INotificationService);
		const openerService = accessor.get(IOpenerService);

		const uri = await specService.initDefaultConfig();
		if (uri) {
			notificationService.notify({
				severity: Severity.Info,
				message: localize('aicore.initSpecCreated', 'Created .aispec config file'),
				actions: {
					primary: [{
						id: 'openSpec',
						label: localize('aicore.openSpec', 'Open'),
						tooltip: '',
						class: undefined,
						enabled: true,
						run: () => openerService.open(uri)
					}]
				}
			});
		} else {
			notificationService.info(localize('aicore.initSpecExists', '.aispec config already exists or no workspace'));
		}
	}
});

// ============================================================================
// AI Core: Show Current Rules
// ============================================================================
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'aicore.showRules',
			title: {
				value: localize('aicore.showRules', 'AI Core: Show Current Rules'),
				original: 'AI Core: Show Current Rules'
			},
			menu: [{ id: MenuId.CommandPalette }]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const specService = accessor.get(IAISpecService);
		const aiCoreService = accessor.get(IAICoreService);
		const notificationService = accessor.get(INotificationService);
		const logService = accessor.get(ILogService);

		const config = specService.getConfig();
		const activeRules = config.rules.filter(r => r.enabled !== false);
		const prefix = aiCoreService.getSystemPromptPrefix();

		logService.info(`[AISpec]: === Current Rules ===`);
		logService.info(`[AISpec]: Version: ${config.version}`);
		logService.info(`[AISpec]: Active rules: ${activeRules.length}`);
		activeRules.forEach(r => {
			logService.info(`[AISpec]:   [${r.id}] (priority: ${r.priority ?? 0}) ${r.content}`);
		});
		logService.info(`[AISpec]: Triggers: ${config.triggers?.length ?? 0}`);
		logService.info(`[AISpec]: Templates: ${config.templates?.length ?? 0}`);
		logService.info(`[AISpec]: System prompt prefix length: ${prefix.length} chars`);

		notificationService.info(localize(
			'aicore.showRulesResult',
			'AI Spec: {0} rules, {1} triggers, {2} templates',
			activeRules.length,
			config.triggers?.length ?? 0,
			config.templates?.length ?? 0
		));
	}
});

// ============================================================================
// AI Core: Reload Spec Config
// ============================================================================
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'aicore.reloadSpec',
			title: {
				value: localize('aicore.reloadSpec', 'AI Core: Reload .aispec Config'),
				original: 'AI Core: Reload .aispec Config'
			},
			menu: [{ id: MenuId.CommandPalette }]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const specService = accessor.get(IAISpecService);
		const notificationService = accessor.get(INotificationService);

		await specService.reloadConfig();
		const config = specService.getConfig();
		const rulesCount = config.rules.filter(r => r.enabled !== false).length;

		notificationService.info(localize(
			'aicore.reloadSpecDone',
			'AI Spec config reloaded: {0} rules active',
			rulesCount
		));
	}
});

// ============================================================================
// AI Core: Spec-Driven Task Breakdown（需求驱动任务拆解）
// ============================================================================
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'aicore.breakdownSpec',
			title: {
				value: localize('aicore.breakdownSpec', 'AI Core: Breakdown Spec into Tasks'),
				original: 'AI Core: Breakdown Spec into Tasks'
			},
			menu: [{ id: MenuId.CommandPalette }]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const taskService = accessor.get(ITaskBreakdownService);
		const notificationService = accessor.get(INotificationService);
		const logService = accessor.get(ILogService);
		const quickInputService = accessor.get(IQuickInputService);

		// 弹出输入框让用户输入需求
		const spec = await quickInputService.input({
			placeHolder: localize('aicore.specPlaceholder', 'Describe your requirement (e.g., "实现用户登录功能")'),
			prompt: localize('aicore.specPrompt', 'Enter your specification for task breakdown'),
			title: localize('aicore.specTitle', 'Spec-Driven Development')
		});

		if (!spec) {
			return;
		}

		// 执行任务拆解
		const breakdown = await taskService.breakdownFromSpec(spec);

		// 输出日志
		logService.info(`[TaskBreakdown]: === Task Breakdown ===`);
		logService.info(`[TaskBreakdown]: Original spec: ${spec}`);
		logService.info(`[TaskBreakdown]: Estimated time: ${breakdown.estimatedMinutes} minutes`);
		logService.info(`[TaskBreakdown]: Tasks:`);
		breakdown.tasks.forEach((task, i) => {
			logService.info(`[TaskBreakdown]:   [${i + 1}] ${task.title} (${task.type}, ${task.status})`);
			if (task.subtasks?.length) {
				task.subtasks.forEach((sub, j) => {
					logService.info(`[TaskBreakdown]:       [${i + 1}.${j + 1}] ${sub.title}`);
				});
			}
		});

		// 显示结果
		notificationService.info(localize(
			'aicore.breakdownDone',
			'Task breakdown: {0} tasks, ~{1} minutes',
			breakdown.tasks.length,
			breakdown.estimatedMinutes ?? 0
		));
	}
});

// ============================================================================
// AI Core: Show Current Tasks
// ============================================================================
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'aicore.showTasks',
			title: {
				value: localize('aicore.showTasks', 'AI Core: Show Current Tasks'),
				original: 'AI Core: Show Current Tasks'
			},
			menu: [{ id: MenuId.CommandPalette }]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const taskService = accessor.get(ITaskBreakdownService);
		const notificationService = accessor.get(INotificationService);
		const logService = accessor.get(ILogService);
		const quickInputService = accessor.get(IQuickInputService);

		const breakdown = taskService.getCurrentBreakdown();
		if (!breakdown) {
			notificationService.info(localize('aicore.noTasks', 'No tasks. Use "AI Core: Breakdown Spec" first.'));
			return;
		}

		// 显示任务列表让用户选择
		const items = breakdown.tasks.map(task => ({
			label: `${task.status === 'completed' ? '✓' : task.status === 'in_progress' ? '▶' : '○'} ${task.title}`,
			description: `${task.type} · ${task.estimatedMinutes ?? 0}min`,
			detail: task.description,
			task
		}));

		const selected = await quickInputService.pick(items, {
			placeHolder: localize('aicore.selectTask', 'Select a task to work on'),
			title: localize('aicore.tasksTitle', `Tasks (${breakdown.tasks.length})`)
		});

		if (selected) {
			// 更新任务状态为 in_progress
			taskService.updateTaskStatus(selected.task.id, 'in_progress');

			// 生成任务 prompt
			const prompt = taskService.getTaskPrompt(selected.task.id);
			logService.info(`[TaskBreakdown]: Selected task: ${selected.task.id}`);
			logService.info(`[TaskBreakdown]: Task prompt:\n${prompt}`);

			notificationService.info(localize(
				'aicore.taskSelected',
				'Task "{0}" is now in progress. Prompt copied to log.',
				selected.task.title
			));
		}
	}
});

// ============================================================================
// AI Core: Get Next Task
// ============================================================================
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'aicore.nextTask',
			title: {
				value: localize('aicore.nextTask', 'AI Core: Get Next Pending Task'),
				original: 'AI Core: Get Next Pending Task'
			},
			menu: [{ id: MenuId.CommandPalette }]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const taskService = accessor.get(ITaskBreakdownService);
		const notificationService = accessor.get(INotificationService);
		const logService = accessor.get(ILogService);

		const nextTask = taskService.getNextPendingTask();
		if (!nextTask) {
			notificationService.info(localize('aicore.noNextTask', 'No pending tasks. All done or no breakdown yet.'));
			return;
		}

		// 更新任务状态
		taskService.updateTaskStatus(nextTask.id, 'in_progress');

		// 生成 prompt
		const prompt = taskService.getTaskPrompt(nextTask.id);
		logService.info(`[TaskBreakdown]: Next task: ${nextTask.id} - ${nextTask.title}`);
		logService.info(`[TaskBreakdown]: Prompt:\n${prompt}`);

		notificationService.notify({
			severity: Severity.Info,
			message: localize('aicore.nextTaskInfo', 'Next task: {0}', nextTask.title),
			actions: {
				primary: [{
					id: 'copyPrompt',
					label: localize('aicore.viewDetails', 'View Details'),
					tooltip: '',
					class: undefined,
					enabled: true,
					run: () => {
						logService.info(`[TaskBreakdown]: Task details: ${JSON.stringify(nextTask, null, 2)}`);
					}
				}]
			}
		});
	}
});

// ============================================================================
// AI Core: Test LLM Connection (测试智谱 AI 连接)
// ============================================================================
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'aicore.testLLM',
			title: {
				value: localize('aicore.testLLM', 'AI Core: Test LLM Connection (GLM-4.7)'),
				original: 'AI Core: Test LLM Connection (GLM-4.7)'
			},
			menu: [{ id: MenuId.CommandPalette }]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const llmService = accessor.get(ILLMService);
		const notificationService = accessor.get(INotificationService);
		const logService = accessor.get(ILogService);

		notificationService.info(localize('aicore.testingLLM', 'Testing GLM-4.7 connection...'));

		try {
			const response = await llmService.chat({
				messages: [
					{ role: 'system', content: '你是一个有帮助的AI助手。' },
					{ role: 'user', content: '你好！请用一句话介绍你自己。' }
				],
				maxTokens: 100
			});

			logService.info(`[LLMService]: Test response: ${response.content}`);
			logService.info(`[LLMService]: Model: ${response.model}, Tokens: ${response.usage?.totalTokens ?? 'unknown'}`);

			notificationService.notify({
				severity: Severity.Info,
				message: localize('aicore.llmTestSuccess', 'GLM-4.7 Connected! Response: {0}', response.content.slice(0, 100))
			});
		} catch (error) {
			logService.error(`[LLMService]: Test failed: ${String(error)}`);
			notificationService.error(localize('aicore.llmTestFailed', 'GLM-4.7 connection failed: {0}', String(error)));
		}
	}
});

// ============================================================================
// AI Core: Quick Chat with LLM (快速对话)
// ============================================================================
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'aicore.quickChat',
			title: {
				value: localize('aicore.quickChat', 'AI Core: Quick Chat with GLM-4.7'),
				original: 'AI Core: Quick Chat with GLM-4.7'
			},
			menu: [{ id: MenuId.CommandPalette }]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const llmService = accessor.get(ILLMService);
		const specService = accessor.get(IAISpecService);
		const aiCoreService = accessor.get(IAICoreService);
		const notificationService = accessor.get(INotificationService);
		const logService = accessor.get(ILogService);
		const quickInputService = accessor.get(IQuickInputService);

		// 获取用户输入
		const userInput = await quickInputService.input({
			placeHolder: localize('aicore.chatPlaceholder', 'Ask GLM-4.7 anything...'),
			prompt: localize('aicore.chatPrompt', 'Enter your message'),
			title: localize('aicore.chatTitle', 'Quick Chat with GLM-4.7')
		});

		if (!userInput) {
			return;
		}

		notificationService.info(localize('aicore.thinking', 'Thinking...'));

		try {
			// 获取上下文和规则
			const context = await aiCoreService.buildContext({
				sessionId: 'quickchat',
				message: userInput,
				mode: 'chat'
			});

			// 构建 System Prompt（包含 Spec 规则）
			const activeFile = context.files.find(f => f.isActive);
			const specPrefix = specService.getSystemPromptPrefix(activeFile?.uri);

			let systemPrompt = '你是一个专业的编程助手，擅长代码分析、问题解决和技术解释。请用中文回答。\n\n';
			if (specPrefix) {
				systemPrompt += specPrefix;
			}
			if (activeFile) {
				systemPrompt += `\n当前文件：${activeFile.uri}\n语言：${activeFile.languageId ?? 'unknown'}\n`;
			}

			// 发送请求
			const response = await llmService.chat({
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: userInput }
				],
				maxTokens: 2048
			});

			logService.info(`[QuickChat]: User: ${userInput}`);
			logService.info(`[QuickChat]: Assistant: ${response.content}`);
			logService.info(`[QuickChat]: Tokens: ${response.usage?.totalTokens ?? 'unknown'}`);

			// 显示结果（截断显示）
			const displayContent = response.content.length > 200
				? response.content.slice(0, 200) + '...'
				: response.content;

			notificationService.notify({
				severity: Severity.Info,
				message: displayContent,
				actions: {
					primary: [{
						id: 'viewFull',
						label: localize('aicore.viewFull', 'View Full Response'),
						tooltip: '',
						class: undefined,
						enabled: true,
						run: () => {
							logService.info(`[QuickChat]: Full response:\n${response.content}`);
						}
					}]
				}
			});
		} catch (error) {
			logService.error(`[QuickChat]: Failed: ${String(error)}`);
			notificationService.error(localize('aicore.chatFailed', 'Chat failed: {0}', String(error)));
		}
	}
});

// ============================================================================
// AI Core: Explain Selected Code (解释选中代码)
// ============================================================================
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'aicore.explainCode',
			title: {
				value: localize('aicore.explainCode', 'AI Core: Explain Selected Code'),
				original: 'AI Core: Explain Selected Code'
			},
			menu: [{ id: MenuId.CommandPalette }]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const llmService = accessor.get(ILLMService);
		const editorService = accessor.get(IEditorService);
		const notificationService = accessor.get(INotificationService);
		const logService = accessor.get(ILogService);

		// 获取选中的代码
		const editor = editorService.activeTextEditorControl;
		if (!editor || !('getSelection' in editor)) {
			notificationService.warn(localize('aicore.noEditor', 'No active editor'));
			return;
		}

		const selection = (editor as { getSelection(): { isEmpty(): boolean } | null }).getSelection();
		const model = (editor as { getModel(): { getValueInRange(sel: unknown): string; getLanguageId(): string } | null }).getModel();

		if (!selection || selection.isEmpty() || !model) {
			notificationService.warn(localize('aicore.noSelection', 'Please select some code first'));
			return;
		}

		const selectedCode = model.getValueInRange(selection);
		const language = model.getLanguageId();

		notificationService.info(localize('aicore.analyzing', 'Analyzing code...'));

		try {
			const response = await llmService.chat({
				messages: [
					{
						role: 'system',
						content: '你是一个专业的代码分析专家。请用简洁清晰的中文解释代码的功能、逻辑和关键点。'
					},
					{
						role: 'user',
						content: `请解释以下 ${language} 代码：\n\n\`\`\`${language}\n${selectedCode}\n\`\`\``
					}
				],
				maxTokens: 1500
			});

			logService.info(`[ExplainCode]: Language: ${language}`);
			logService.info(`[ExplainCode]: Code length: ${selectedCode.length} chars`);
			logService.info(`[ExplainCode]: Explanation:\n${response.content}`);

			const displayContent = response.content.length > 300
				? response.content.slice(0, 300) + '...'
				: response.content;

			notificationService.notify({
				severity: Severity.Info,
				message: displayContent,
				actions: {
					primary: [{
						id: 'viewFull',
						label: localize('aicore.viewFull', 'View Full Response'),
						tooltip: '',
						class: undefined,
						enabled: true,
						run: () => {
							logService.info(`[ExplainCode]: Full explanation:\n${response.content}`);
						}
					}]
				}
			});
		} catch (error) {
			logService.error(`[ExplainCode]: Failed: ${String(error)}`);
			notificationService.error(localize('aicore.explainFailed', 'Explain failed: {0}', String(error)));
		}
	}
});

// ============================================================================
// AI Core: Send Selection to Chat (Ctrl+L) - 类似 Cursor 的代码选择发送
// ============================================================================
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IChatWidgetService } from '../../../contrib/chat/browser/chat.js';
import { ISearchService, ITextQuery, QueryType } from '../../../services/search/common/search.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { Range } from '../../../../editor/common/core/range.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';
import { Schemas } from '../../../../base/common/network.js';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'aicore.sendSelectionToChat',
			title: {
				value: localize('aicore.sendSelectionToChat', 'AI Core: Send Selection to Chat'),
				original: 'AI Core: Send Selection to Chat'
			},
			menu: [{ id: MenuId.CommandPalette }],
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyCode.KeyL,
				weight: KeybindingWeight.WorkbenchContrib + 100 // 高优先级
			}
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const chatWidgetService = accessor.get(IChatWidgetService);

		// 获取当前编辑器和 URI
		const activeEditor = editorService.activeTextEditorControl;
		const activeUri = EditorResourceAccessor.getCanonicalUri(editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });

		if (!activeEditor || !activeUri) {
			// 没有打开的编辑器，直接打开 Chat
			const widget = await chatWidgetService.revealWidget();
			widget?.focusInput();
			return;
		}

		// 检查 URI scheme 是否支持
		if (![Schemas.file, Schemas.vscodeRemote, Schemas.untitled].includes(activeUri.scheme)) {
			const widget = await chatWidgetService.revealWidget();
			widget?.focusInput();
			return;
		}

		// 获取选区
		const selection = (activeEditor as { getSelection?(): { selectionStartLineNumber: number; selectionStartColumn: number; positionLineNumber: number; positionColumn: number } | null }).getSelection?.();

		// 打开/显示 Chat widget
		const widget = await chatWidgetService.revealWidget();
		if (!widget) {
			return;
		}

		// 使用 attachmentModel.addFile 添加文件附件（像 Cursor 那样显示为标签）
		if (selection) {
			// 有选区时，添加选中范围
			const range = new Range(
				selection.selectionStartLineNumber,
				selection.selectionStartColumn,
				selection.positionLineNumber,
				selection.positionColumn
			);

			// 如果选区为空（光标没有选中内容），添加当前行
			if (range.isEmpty()) {
				const lineRange = new Range(selection.selectionStartLineNumber, 1, selection.selectionStartLineNumber + 1, 1);
				widget.attachmentModel.addFile(activeUri, lineRange);
			} else {
				widget.attachmentModel.addFile(activeUri, range);
			}
		} else {
			// 没有选区，添加整个文件
			widget.attachmentModel.addFile(activeUri);
		}

		widget.focusInput();
	}
});

// ============================================================================
// AI Core: Search Codebase (全局代码库搜索)
// ============================================================================
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'aicore.searchCodebase',
			title: {
				value: localize('aicore.searchCodebase', 'AI Core: Search Codebase'),
				original: 'AI Core: Search Codebase'
			},
			menu: [{ id: MenuId.CommandPalette }]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const searchService = accessor.get(ISearchService);
		const workspaceService = accessor.get(IWorkspaceContextService);
		const quickInputService = accessor.get(IQuickInputService);
		const chatWidgetService = accessor.get(IChatWidgetService);
		const notificationService = accessor.get(INotificationService);
		const logService = accessor.get(ILogService);

		// 获取搜索关键词
		const searchTerm = await quickInputService.input({
			placeHolder: localize('aicore.searchPlaceholder', 'Enter search term...'),
			prompt: localize('aicore.searchPrompt', 'Search codebase and send results to Chat'),
			title: localize('aicore.searchTitle', 'Codebase Search')
		});

		if (!searchTerm) {
			return;
		}

		const folders = workspaceService.getWorkspace().folders;
		if (folders.length === 0) {
			notificationService.warn(localize('aicore.noWorkspace', 'No workspace folder open'));
			return;
		}

		notificationService.info(localize('aicore.searching', 'Searching codebase...'));

		try {
			// 执行文本搜索
			const query: ITextQuery = {
				type: QueryType.Text,
				contentPattern: { pattern: searchTerm },
				folderQueries: folders.map(f => ({ folder: f.uri })),
				maxResults: 20
			};

			const results = await searchService.textSearch(query);

			if (results.results.length === 0) {
				notificationService.info(localize('aicore.noResults', 'No results found for: {0}', searchTerm));
				return;
			}

			// 构建搜索结果文本
			let resultText = `## 代码库搜索结果\n\n搜索关键词: \`${searchTerm}\`\n\n找到 ${results.results.length} 个结果：\n\n`;

			for (const result of results.results.slice(0, 10)) {
				const fileName = result.resource.fsPath.split('/').pop() || result.resource.fsPath;
				resultText += `### ${fileName}\n`;
				resultText += `路径: \`${result.resource.fsPath}\`\n\n`;

				if (result.results) {
					for (const match of result.results.slice(0, 3)) {
						if ('preview' in match && match.preview) {
							const preview = match.preview as { text: string };
							const lineNum = 'ranges' in match ? (match.ranges as { startLineNumber: number }[])[0]?.startLineNumber : 0;
							resultText += `行 ${lineNum}: \`${preview.text.trim()}\`\n`;
						}
					}
				}
				resultText += '\n';
			}

			logService.info(`[SearchCodebase]: Found ${results.results.length} results for "${searchTerm}"`);

			// 发送到 Chat
			const widget = await chatWidgetService.revealWidget();
			if (widget) {
				widget.setInput(`请帮我分析以下代码搜索结果：\n\n${resultText}\n\n我想了解这些代码的作用和关联。`);
				widget.focusInput();
			}
		} catch (error) {
			logService.error(`[SearchCodebase]: Failed: ${String(error)}`);
			notificationService.error(localize('aicore.searchFailed', 'Search failed: {0}', String(error)));
		}
	}
});

// ============================================================================
// AI Core: List Project Files (列出项目文件)
// ============================================================================
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'aicore.listProjectFiles',
			title: {
				value: localize('aicore.listProjectFiles', 'AI Core: List Project Files'),
				original: 'AI Core: List Project Files'
			},
			menu: [{ id: MenuId.CommandPalette }]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const searchService = accessor.get(ISearchService);
		const workspaceService = accessor.get(IWorkspaceContextService);
		const chatWidgetService = accessor.get(IChatWidgetService);
		const notificationService = accessor.get(INotificationService);
		const logService = accessor.get(ILogService);

		const folders = workspaceService.getWorkspace().folders;
		if (folders.length === 0) {
			notificationService.warn(localize('aicore.noWorkspace', 'No workspace folder open'));
			return;
		}

		notificationService.info(localize('aicore.listingFiles', 'Listing project files...'));

		try {
			// 搜索所有文件
			const results = await searchService.fileSearch({
				type: QueryType.File,
				folderQueries: folders.map(f => ({ folder: f.uri })),
				maxResults: 100,
				filePattern: '**/*.{ts,tsx,js,jsx,py,java,go,rs,c,cpp,h,css,scss,html,json,md}'
			});

			if (results.results.length === 0) {
				notificationService.info(localize('aicore.noFiles', 'No source files found'));
				return;
			}

			// 按目录分组
			const filesByDir = new Map<string, string[]>();
			for (const result of results.results) {
				const parts = result.resource.fsPath.split('/');
				const fileName = parts.pop() || '';
				const dir = parts.slice(-2).join('/') || '/';
				if (!filesByDir.has(dir)) {
					filesByDir.set(dir, []);
				}
				filesByDir.get(dir)!.push(fileName);
			}

			// 构建文件列表
			let fileList = `## 项目文件结构\n\n共 ${results.results.length} 个源文件：\n\n`;
			for (const [dir, files] of filesByDir.entries()) {
				fileList += `### ${dir}/\n`;
				for (const file of files.slice(0, 10)) {
					fileList += `- ${file}\n`;
				}
				if (files.length > 10) {
					fileList += `- ... 和 ${files.length - 10} 个其他文件\n`;
				}
				fileList += '\n';
			}

			logService.info(`[ListFiles]: Found ${results.results.length} files`);

			// 发送到 Chat
			const widget = await chatWidgetService.revealWidget();
			if (widget) {
				widget.setInput(`请帮我了解这个项目的结构：\n\n${fileList}`);
				widget.focusInput();
			}
		} catch (error) {
			logService.error(`[ListFiles]: Failed: ${String(error)}`);
			notificationService.error(localize('aicore.listFailed', 'List failed: {0}', String(error)));
		}
	}
});

// ============================================================================
// AI Core: Review Pending Changes (查看待确认的文件变更)
// ============================================================================
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'aicore.reviewChanges',
			title: {
				value: localize('aicore.reviewChanges', 'AI Core: Review Pending Changes'),
				original: 'AI Core: Review Pending Changes'
			},
			menu: [{ id: MenuId.CommandPalette }]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const agentToolService = accessor.get(IAgentToolService);
		const quickInputService = accessor.get(IQuickInputService);
		const notificationService = accessor.get(INotificationService);
		const editorService = accessor.get(IEditorService);

		const pendingChanges = agentToolService.getPendingChanges();

		if (pendingChanges.length === 0) {
			notificationService.info(localize('aicore.noChanges', 'No pending changes'));
			return;
		}

		const items = pendingChanges.map((change, index) => ({
			label: `$(file) ${change.uri.fsPath.split('/').pop()}`,
			description: change.description,
			detail: `${change.originalContent ? 'Modified' : 'New file'} - ${change.uri.fsPath}`,
			change,
			index
		}));

		const picked = await quickInputService.pick(items, {
			placeHolder: localize('aicore.selectChange', 'Select a change to review'),
			title: localize('aicore.pendingChanges', 'Pending File Changes ({0})', pendingChanges.length)
		});

		if (!picked) {
			return;
		}

		// 显示 diff 编辑器
		const change = picked.change;

		// 简化版：使用通知显示 diff 信息
		// TODO: 后续可以使用 IDiffEditor 显示完整 diff
		notificationService.info(
			localize('aicore.diffPreview', 'File: {0}\nDescription: {1}\nLines changed: {2}',
				change.uri.fsPath.split('/').pop(),
				change.description,
				Math.abs(change.newContent.split('\n').length - change.originalContent.split('\n').length)
			)
		);

		// 提供应用/拒绝选项
		const action = await quickInputService.pick([
			{ label: '$(check) Apply', description: 'Apply this change', action: 'apply' },
			{ label: '$(x) Reject', description: 'Discard this change', action: 'reject' },
			{ label: '$(eye) View Full Diff', description: 'View in editor', action: 'view' }
		], {
			placeHolder: localize('aicore.chooseAction', 'Choose action for this change')
		});

		if (action?.action === 'apply') {
			const success = await agentToolService.applyChange(change);
			if (success) {
				notificationService.info(localize('aicore.changeApplied', 'Change applied successfully'));
			} else {
				notificationService.error(localize('aicore.changeFailed', 'Failed to apply change'));
			}
		} else if (action?.action === 'reject') {
			agentToolService.rejectChange(change);
			notificationService.info(localize('aicore.changeRejected', 'Change rejected'));
		} else if (action?.action === 'view') {
			// 在新编辑器中显示原始和新内容
			await editorService.openEditor({
				resource: change.uri,
				options: { pinned: true }
			});
		}
	}
});

// ============================================================================
// AI Core: Apply All Changes (应用所有变更)
// ============================================================================
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'aicore.applyAllChanges',
			title: {
				value: localize('aicore.applyAllChanges', 'AI Core: Apply All Pending Changes'),
				original: 'AI Core: Apply All Pending Changes'
			},
			menu: [{ id: MenuId.CommandPalette }]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const agentToolService = accessor.get(IAgentToolService);
		const notificationService = accessor.get(INotificationService);
		const quickInputService = accessor.get(IQuickInputService);

		const pendingChanges = agentToolService.getPendingChanges();

		if (pendingChanges.length === 0) {
			notificationService.info(localize('aicore.noChanges', 'No pending changes'));
			return;
		}

		// 确认
		const confirm = await quickInputService.pick([
			{ label: '$(check) Yes, apply all', apply: true },
			{ label: '$(x) Cancel', apply: false }
		], {
			placeHolder: localize('aicore.confirmApply', 'Apply {0} pending changes?', pendingChanges.length)
		});

		if (!confirm?.apply) {
			return;
		}

		const result = await agentToolService.applyAllChanges();
		notificationService.info(
			localize('aicore.applyResult', 'Applied {0} changes, {1} failed',
				result.applied, result.failed)
		);
	}
});

// ============================================================================
// AI Core: Clear Pending Changes (清除所有待变更)
// ============================================================================
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'aicore.clearChanges',
			title: {
				value: localize('aicore.clearChanges', 'AI Core: Clear All Pending Changes'),
				original: 'AI Core: Clear All Pending Changes'
			},
			menu: [{ id: MenuId.CommandPalette }]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const agentToolService = accessor.get(IAgentToolService);
		const notificationService = accessor.get(INotificationService);

		const count = agentToolService.getPendingChanges().length;
		agentToolService.clearPendingChanges();

		notificationService.info(localize('aicore.cleared', 'Cleared {0} pending changes', count));
	}
});

// ============================================================================
// AI Core: Toggle Agent Mode (切换 Agent 模式)
// ============================================================================
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'aicore.toggleAgentMode',
			title: {
				value: localize('aicore.toggleAgentMode', 'AI Core: Toggle Agent Mode'),
				original: 'AI Core: Toggle Agent Mode'
			},
			menu: [{ id: MenuId.CommandPalette }]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const configService = accessor.get(IConfigurationService);
		const notificationService = accessor.get(INotificationService);

		const current = configService.getValue<boolean>('aiCore.agentMode') !== false;
		await configService.updateValue('aiCore.agentMode', !current);

		notificationService.info(
			localize('aicore.agentModeToggled', 'Agent Mode: {0}', !current ? 'Enabled' : 'Disabled')
		);
	}
});

// ============================================================================
// AI Core: Toggle Execution Mode (Autopilot/Supervised 切换)
// ============================================================================
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'aicore.toggleExecutionMode',
			title: {
				value: localize('aicore.toggleExecutionMode', 'AI Core: Toggle Execution Mode (Autopilot/Supervised)'),
				original: 'AI Core: Toggle Execution Mode (Autopilot/Supervised)'
			},
			menu: [{ id: MenuId.CommandPalette }]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const configService = accessor.get(IConfigurationService);
		const notificationService = accessor.get(INotificationService);

		const current = configService.getValue<string>('aiCore.executionMode') || 'supervised';
		const newMode = current === 'autopilot' ? 'supervised' : 'autopilot';
		await configService.updateValue('aiCore.executionMode', newMode);

		const modeLabel = newMode === 'autopilot'
			? localize('aicore.autopilotMode', '🚀 Autopilot (Auto-execute)')
			: localize('aicore.supervisedMode', '👁️ Supervised (Confirm each change)');

		notificationService.info(
			localize('aicore.executionModeToggled', 'Execution Mode: {0}', modeLabel)
		);
	}
});

// ============================================================================
// AI Core: Revert All Changes (撤销所有更改)
// ============================================================================

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'aicore.revertAllChanges',
			title: {
				value: localize('aicore.revertAllChanges', 'AI Core: Revert All Changes'),
				original: 'AI Core: Revert All Changes'
			},
			menu: [{ id: MenuId.CommandPalette }]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const agentToolService = accessor.get(IAgentToolService);
		const notificationService = accessor.get(INotificationService);

		await agentToolService.revertAllChanges();

		notificationService.info(
			localize('aicore.changesReverted', '↩️ All changes have been reverted')
		);
	}
});

// ============================================================================
// AI Core: Reject All Changes (拒绝所有更改)
// ============================================================================
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'aicore.rejectAllChanges',
			title: {
				value: localize('aicore.rejectAllChanges', 'AI Core: Reject All Pending Changes'),
				original: 'AI Core: Reject All Pending Changes'
			},
			menu: [{ id: MenuId.CommandPalette }]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const agentToolService = accessor.get(IAgentToolService);
		const notificationService = accessor.get(INotificationService);

		const pending = agentToolService.getPendingChanges();
		if (pending.length === 0) {
			notificationService.info(localize('aicore.noPendingChanges', 'No pending changes'));
			return;
		}

		agentToolService.clearPendingChanges();

		notificationService.info(
			localize('aicore.changesRejected', '❌ Rejected {0} pending changes', pending.length)
		);
	}
});

// ============================================================================
// AI Core: Switch Chat Mode (Vibe/Spec 模式切换)
// ============================================================================
import { IChatModeService } from './chatModeService.js';
import { ISpecModeService } from './specModeService.js';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'aicore.switchToVibeMode',
			title: {
				value: localize('aicore.switchToVibeMode', 'AI Core: Switch to Vibe Mode'),
				original: 'AI Core: Switch to Vibe Mode'
			},
			menu: [{ id: MenuId.CommandPalette }]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const chatModeService = accessor.get(IChatModeService);
		const notificationService = accessor.get(INotificationService);

		chatModeService.setMode('vibe');
		notificationService.info(
			localize('aicore.vibeMode', '💬 Vibe Mode: Chat first, then build')
		);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'aicore.switchToSpecMode',
			title: {
				value: localize('aicore.switchToSpecMode', 'AI Core: Switch to Spec Mode'),
				original: 'AI Core: Switch to Spec Mode'
			},
			menu: [{ id: MenuId.CommandPalette }]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const chatModeService = accessor.get(IChatModeService);
		const notificationService = accessor.get(INotificationService);

		chatModeService.setMode('spec');
		notificationService.info(
			localize('aicore.specMode', '📋 Spec Mode: Plan first, then build')
		);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'aicore.toggleChatMode',
			title: {
				value: localize('aicore.toggleChatMode', 'AI Core: Toggle Chat Mode (Vibe/Spec)'),
				original: 'AI Core: Toggle Chat Mode (Vibe/Spec)'
			},
			menu: [{ id: MenuId.CommandPalette }],
			keybinding: {
				primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 46 /* KeyCode.KeyM */,
				weight: 200 /* KeybindingWeight.WorkbenchContrib */
			}
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const chatModeService = accessor.get(IChatModeService);
		const notificationService = accessor.get(INotificationService);

		const currentMode = chatModeService.getCurrentMode();
		const newMode = currentMode === 'vibe' ? 'spec' : 'vibe';

		chatModeService.setMode(newMode);

		if (newMode === 'vibe') {
			notificationService.info(localize('aicore.vibeMode', '💬 Vibe Mode: Chat first, then build'));
		} else {
			notificationService.info(localize('aicore.specMode', '📋 Spec Mode: Plan first, then build'));
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'aicore.resetModeSelection',
			title: {
				value: localize('aicore.resetModeSelection', 'AI Core: Show Mode Selection'),
				original: 'AI Core: Show Mode Selection'
			},
			menu: [{ id: MenuId.CommandPalette }]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const chatModeService = accessor.get(IChatModeService);
		chatModeService.resetModeSelection();
	}
});

// ============================================================================
// AI Core: Spec 文件操作 (Kiro 风格)
// ============================================================================
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'aicore.saveSpecFiles',
			title: {
				value: localize('aicore.saveSpecFiles', 'AI Core: Save Spec Files (requirements.md, design.md, tasks.md)'),
				original: 'AI Core: Save Spec Files'
			},
			menu: [{ id: MenuId.CommandPalette }]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const specService = accessor.get(ISpecModeService);
		const notificationService = accessor.get(INotificationService);

		const session = specService.getCurrentSession();
		if (!session) {
			notificationService.warn(localize('aicore.noSpecSession', 'No active Spec session'));
			return;
		}

		await specService.saveRequirementsFile();
		await specService.saveDesignFile();
		await specService.saveTasksFile();

		notificationService.info(
			localize('aicore.specFilesSaved', 'Spec files saved to .specs/{0}/', session.id)
		);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'aicore.showSpecProgress',
			title: {
				value: localize('aicore.showSpecProgress', 'AI Core: Show Spec Progress'),
				original: 'AI Core: Show Spec Progress'
			},
			menu: [{ id: MenuId.CommandPalette }]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const specService = accessor.get(ISpecModeService);
		const notificationService = accessor.get(INotificationService);

		const session = specService.getCurrentSession();
		if (!session) {
			notificationService.info(localize('aicore.noSpecSession', 'No active Spec session. Switch to Spec mode and start planning!'));
			return;
		}

		const completed = session.tasks.filter(t => t.status === 'completed').length;
		const total = session.tasks.length;
		const phase = specService.getCurrentPhase();

		let message = `📋 Spec: ${session.id}\n`;
		message += `📍 Phase: ${phase}\n`;
		message += `📊 Stories: ${session.userStories.length}\n`;
		if (total > 0) {
			message += `✅ Tasks: ${completed}/${total}`;
		}

		notificationService.info(message);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'aicore.executeNextTask',
			title: {
				value: localize('aicore.executeNextTask', 'AI Core: Execute Next Spec Task'),
				original: 'AI Core: Execute Next Spec Task'
			},
			menu: [{ id: MenuId.CommandPalette }]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const specService = accessor.get(ISpecModeService);
		const notificationService = accessor.get(INotificationService);

		const nextTask = specService.getNextTask();
		if (!nextTask) {
			notificationService.info(localize('aicore.noMoreTasks', '🎉 All tasks completed!'));
			return;
		}

		specService.startTask(nextTask.id);
		notificationService.info(
			localize('aicore.startingTask', '🔄 Starting: {0}', nextTask.title)
		);
	}
});

// ============================================================================
// AI Core: Index Workspace (索引工作区)
// ============================================================================
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'aicore.indexWorkspace',
			title: {
				value: localize('aicore.indexWorkspace', 'AI Core: Index Workspace'),
				original: 'AI Core: Index Workspace'
			},
			menu: [{ id: MenuId.CommandPalette }]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const codeIndexService = accessor.get(ICodeIndexService);
		const notificationService = accessor.get(INotificationService);

		notificationService.info(localize('aicore.indexingStarted', 'Starting workspace indexing...'));

		try {
			await codeIndexService.indexWorkspace();
			const status = codeIndexService.getStatus();
			notificationService.info(
				localize('aicore.indexingComplete', 'Indexing complete: {0} files, {1} code chunks', status.indexedFiles, status.indexedChunks)
			);
		} catch (error) {
			notificationService.error(localize('aicore.indexingFailed', 'Indexing failed: {0}', String(error)));
		}
	}
});

// ============================================================================
// AI Core: Search Codebase (@codebase 语义搜索)
// ============================================================================
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'aicore.semanticSearchCodebase',
			title: {
				value: localize('aicore.semanticSearchCodebase', 'AI Core: Semantic Search Codebase (@codebase)'),
				original: 'AI Core: Semantic Search Codebase (@codebase)'
			},
			menu: [{ id: MenuId.CommandPalette }]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const codeIndexService = accessor.get(ICodeIndexService);
		const quickInputService = accessor.get(IQuickInputService);
		const notificationService = accessor.get(INotificationService);
		const editorService = accessor.get(IEditorService);

		// 检查索引状态
		const status = codeIndexService.getStatus();
		if (status.indexedChunks === 0) {
			const result = await quickInputService.pick(
				[
					{ label: localize('aicore.indexNow', 'Index Now'), picked: true },
					{ label: localize('aicore.cancel', 'Cancel') }
				],
				{ placeHolder: localize('aicore.noIndex', 'No code indexed. Would you like to index the workspace first?') }
			);

			if (result?.label === localize('aicore.indexNow', 'Index Now')) {
				notificationService.info(localize('aicore.indexingStarted', 'Starting workspace indexing...'));
				await codeIndexService.indexWorkspace();
			} else {
				return;
			}
		}

		// 获取搜索查询
		const query = await quickInputService.input({
			placeHolder: localize('aicore.searchPlaceholder', 'Enter your search query (e.g., "user authentication logic")'),
			prompt: localize('aicore.searchPrompt', 'Semantic code search - finds code by meaning, not just text')
		});

		if (!query) {
			return;
		}

		// 执行搜索
		notificationService.info(localize('aicore.searching', 'Searching...'));

		const response = await codeIndexService.search({
			query,
			topK: 10,
			minScore: 0.3
		});

		if (response.results.length === 0) {
			notificationService.info(localize('aicore.noResults', 'No matching code found'));
			return;
		}

		// 显示结果
		const items = response.results.map(result => ({
			label: `$(symbol-${result.chunk.type}) ${result.chunk.name || result.chunk.path.split('/').pop()}`,
			description: `${result.chunk.path}:${result.chunk.startLine}-${result.chunk.endLine}`,
			detail: result.matchReason,
			chunk: result.chunk
		}));

		const selected = await quickInputService.pick(items, {
			placeHolder: localize('aicore.selectResult', 'Select a result to open ({0} matches in {1}ms)', response.totalMatches, response.durationMs)
		});

		if (selected && 'chunk' in selected) {
			// 打开文件并跳转到位置
			await editorService.openEditor({
				resource: selected.chunk.uri,
				options: {
					selection: {
						startLineNumber: selected.chunk.startLine,
						startColumn: 1,
						endLineNumber: selected.chunk.endLine,
						endColumn: 1
					}
				}
			});
		}
	}
});

// ============================================================================
// AI Core: Show Index Status (显示索引状态)
// ============================================================================
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'aicore.showIndexStatus',
			title: {
				value: localize('aicore.showIndexStatus', 'AI Core: Show Index Status'),
				original: 'AI Core: Show Index Status'
			},
			menu: [{ id: MenuId.CommandPalette }]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const codeIndexService = accessor.get(ICodeIndexService);
		const notificationService = accessor.get(INotificationService);

		const status = codeIndexService.getStatus();

		const message = status.indexedChunks > 0
			? localize('aicore.indexStatus', 'Index Status: {0} files, {1} chunks, last updated: {2}',
				status.indexedFiles,
				status.indexedChunks,
				status.lastUpdated ? new Date(status.lastUpdated).toLocaleString() : 'Never')
			: localize('aicore.noIndexStatus', 'No index available. Use "AI Core: Index Workspace" to create one.');

		notificationService.info(message);
	}
});

// ============================================================================
// AI Core: Clear Index (清空索引)
// ============================================================================
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'aicore.clearIndex',
			title: {
				value: localize('aicore.clearIndex', 'AI Core: Clear Index'),
				original: 'AI Core: Clear Index'
			},
			menu: [{ id: MenuId.CommandPalette }]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const codeIndexService = accessor.get(ICodeIndexService);
		const notificationService = accessor.get(INotificationService);
		const quickInputService = accessor.get(IQuickInputService);

		const confirm = await quickInputService.pick(
			[
				{ label: localize('aicore.yes', 'Yes'), picked: true },
				{ label: localize('aicore.no', 'No') }
			],
			{ placeHolder: localize('aicore.confirmClear', 'Are you sure you want to clear the code index?') }
		);

		if (confirm?.label === localize('aicore.yes', 'Yes')) {
			codeIndexService.clearIndex();
			notificationService.info(localize('aicore.indexCleared', 'Code index cleared'));
		}
	}
});

// ============================================================================
// AI Core: Toggle Deep Thinking Mode (深度思考模式开关)
// ============================================================================

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'aicore.toggleThinking',
			title: {
				value: localize('aicore.toggleThinking', 'AI Core: Toggle Deep Thinking Mode'),
				original: 'AI Core: Toggle Deep Thinking Mode'
			},
			menu: [
				{ id: MenuId.CommandPalette },
				{
					id: MenuId.ChatInput,
					group: 'navigation',
					order: 1
				}
			]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const configService = accessor.get(IConfigurationService);
		const notificationService = accessor.get(INotificationService);

		const currentValue = configService.getValue<boolean>('aiCore.enableThinking') !== false;
		await configService.updateValue('aiCore.enableThinking', !currentValue);

		const newValue = !currentValue;
		notificationService.info(
			newValue
				? localize('aicore.thinkingEnabled', '💭 Deep Thinking Mode: ON')
				: localize('aicore.thinkingDisabled', '💭 Deep Thinking Mode: OFF')
		);
	}
});

// ============================================================================
// AI Core: Deep Thinking Status Bar Item
// ============================================================================
class DeepThinkingStatusContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'aiCore.deepThinkingStatus';

	private statusBarEntry: IStatusbarEntryAccessor | undefined;

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IConfigurationService private readonly configService: IConfigurationService,
	) {
		super();

		this.updateStatusBar();

		// 监听配置变化
		this._register(this.configService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('aiCore.enableThinking')) {
				this.updateStatusBar();
			}
		}));
	}

	private updateStatusBar(): void {
		const isEnabled = this.configService.getValue<boolean>('aiCore.enableThinking') !== false;

		const text = isEnabled ? '$(lightbulb) 深度思考: ON' : '$(lightbulb) 深度思考: OFF';
		const tooltip = isEnabled
			? localize('aicore.thinkingStatusOn', 'Deep Thinking Mode is ON - Click to toggle')
			: localize('aicore.thinkingStatusOff', 'Deep Thinking Mode is OFF - Click to toggle');

		if (this.statusBarEntry) {
			this.statusBarEntry.update({
				name: 'AI Core Deep Thinking',
				text,
				tooltip,
				command: 'aicore.toggleThinking',
				ariaLabel: tooltip
			});
		} else {
			this.statusBarEntry = this.statusbarService.addEntry(
				{
					name: 'AI Core Deep Thinking',
					text,
					tooltip,
					command: 'aicore.toggleThinking',
					ariaLabel: tooltip
				},
				'aicore.deepThinking',
				StatusbarAlignment.RIGHT,
				100
			);
		}
	}
}

registerWorkbenchContribution2(DeepThinkingStatusContribution.ID, DeepThinkingStatusContribution, WorkbenchPhase.AfterRestored);

// ============================================================================
// AI Core: Execution Mode Status Bar Item (Autopilot/Supervised)
// ============================================================================
class ExecutionModeStatusContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'aiCore.executionModeStatus';

	private statusBarEntry: IStatusbarEntryAccessor | undefined;

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IConfigurationService private readonly configService: IConfigurationService,
	) {
		super();

		this.updateStatusBar();

		// 监听配置变化
		this._register(this.configService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('aiCore.executionMode')) {
				this.updateStatusBar();
			}
		}));
	}

	private updateStatusBar(): void {
		const mode = this.configService.getValue<string>('aiCore.executionMode') || 'supervised';
		const isAutopilot = mode === 'autopilot';

		const text = isAutopilot ? '$(rocket) Autopilot' : '$(eye) Supervised';
		const tooltip = isAutopilot
			? localize('aicore.autopilotStatus', 'Autopilot Mode - AI auto-executes changes. Click to switch to Supervised.')
			: localize('aicore.supervisedStatus', 'Supervised Mode - Each change requires confirmation. Click to switch to Autopilot.');

		if (this.statusBarEntry) {
			this.statusBarEntry.update({
				name: 'AI Core Execution Mode',
				text,
				tooltip,
				command: 'aicore.toggleExecutionMode',
				ariaLabel: tooltip
			});
		} else {
			this.statusBarEntry = this.statusbarService.addEntry(
				{
					name: 'AI Core Execution Mode',
					text,
					tooltip,
					command: 'aicore.toggleExecutionMode',
					ariaLabel: tooltip
				},
				'aicore.executionMode',
				StatusbarAlignment.RIGHT,
				99
			);
		}
	}
}

registerWorkbenchContribution2(ExecutionModeStatusContribution.ID, ExecutionModeStatusContribution, WorkbenchPhase.AfterRestored);

// ============================================================================
// 任务执行命令 (Kiro 风格可点击按钮)
// ============================================================================

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'aicore.executeTask',
			title: {
				value: localize('aicore.executeTask', 'AI Core: Execute Spec Task'),
				original: 'AI Core: Execute Spec Task'
			},
			menu: []  // 不在命令面板显示，仅供内部调用
		});
	}

	override async run(accessor: ServicesAccessor, args?: { taskId?: string }): Promise<void> {
		const specService = accessor.get(ISpecModeService);
		const notificationService = accessor.get(INotificationService);
		const commandService = accessor.get(ICommandService);

		if (!args?.taskId) {
			// 如果没有指定任务，执行下一个待处理任务
			const nextTask = specService.getNextTask();
			if (nextTask) {
				await specService.startTask(nextTask.id);
				// 打开聊天并发送执行命令
				await commandService.executeCommand('workbench.action.chat.open');
			} else {
				notificationService.info(localize('aicore.noTasksToExecute', 'No pending tasks to execute'));
			}
			return;
		}

		// 执行指定任务
		const session = specService.getCurrentSession();
		if (!session) {
			notificationService.warn(localize('aicore.noSession', 'No active spec session'));
			return;
		}

		const task = session.tasks.find(t => t.id === args.taskId);
		if (!task) {
			notificationService.warn(localize('aicore.taskNotFound', 'Task not found'));
			return;
		}

		await specService.startTask(task.id);
		notificationService.info(localize('aicore.taskStarted', 'Started task: {0}', task.title));

		// 打开聊天
		await commandService.executeCommand('workbench.action.chat.open');
	}
});

// 执行所有任务命令
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'aicore.executeAllTasks',
			title: {
				value: localize('aicore.executeAllTasks', 'AI Core: Execute All Spec Tasks'),
				original: 'AI Core: Execute All Spec Tasks'
			},
			menu: [{ id: MenuId.CommandPalette }]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const specService = accessor.get(ISpecModeService);
		const notificationService = accessor.get(INotificationService);

		const session = specService.getCurrentSession();
		if (!session) {
			notificationService.warn(localize('aicore.noSession', 'No active spec session'));
			return;
		}

		const pendingTasks = session.tasks.filter(t => t.status === 'pending');
		if (pendingTasks.length === 0) {
			notificationService.info(localize('aicore.allTasksCompleted', 'All tasks are already completed'));
			return;
		}

		notificationService.info(localize('aicore.executingAllTasks', 'Executing {0} tasks...', pendingTasks.length));

		for (const task of pendingTasks) {
			await specService.executeTaskWithLLM(task);
		}

		notificationService.info(localize('aicore.allTasksExecuted', 'All tasks executed successfully'));
	}
});


// 预览设计文档命令
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'aicore.previewDesign',
			title: {
				value: localize('aicore.previewDesign', 'AI Core: Preview Design Document'),
				original: 'AI Core: Preview Design Document'
			},
			menu: [{ id: MenuId.CommandPalette }]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const specService = accessor.get(ISpecModeService);
		const editorService = accessor.get(IEditorService);
		const notificationService = accessor.get(INotificationService);

		const session = specService.getCurrentSession();
		if (!session) {
			notificationService.warn(localize('aicore.noSession', 'No active spec session'));
			return;
		}

		// 先保存设计文件
		await specService.saveDesignFile();

		// 获取设计文件路径
		const specsFolder = specService.getSpecsFolder();
		if (!specsFolder) {
			notificationService.warn(localize('aicore.noSpecsFolder', 'No specs folder found'));
			return;
		}

		const designFileUri = URI.joinPath(specsFolder, session.id, 'design.md');

		// 打开设计文件
		await editorService.openEditor({ resource: designFileUri });

		notificationService.info(localize('aicore.designOpened', 'Design document opened. Mermaid diagrams will render in preview.'));
	}
});

// 预览需求文档命令
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'aicore.previewRequirements',
			title: {
				value: localize('aicore.previewRequirements', 'AI Core: Preview Requirements Document'),
				original: 'AI Core: Preview Requirements Document'
			},
			menu: [{ id: MenuId.CommandPalette }]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const specService = accessor.get(ISpecModeService);
		const editorService = accessor.get(IEditorService);
		const notificationService = accessor.get(INotificationService);

		const session = specService.getCurrentSession();
		if (!session) {
			notificationService.warn(localize('aicore.noSession', 'No active spec session'));
			return;
		}

		// 先保存需求文件
		await specService.saveRequirementsFile();

		// 获取需求文件路径
		const specsFolder = specService.getSpecsFolder();
		if (!specsFolder) {
			notificationService.warn(localize('aicore.noSpecsFolder', 'No specs folder found'));
			return;
		}

		const requirementsFileUri = URI.joinPath(specsFolder, session.id, 'requirements.md');

		// 打开需求文件
		await editorService.openEditor({ resource: requirementsFileUri });
	}
});

// 预览任务文档命令
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'aicore.previewTasks',
			title: {
				value: localize('aicore.previewTasks', 'AI Core: Preview Tasks Document'),
				original: 'AI Core: Preview Tasks Document'
			},
			menu: [{ id: MenuId.CommandPalette }]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const specService = accessor.get(ISpecModeService);
		const editorService = accessor.get(IEditorService);
		const notificationService = accessor.get(INotificationService);

		const session = specService.getCurrentSession();
		if (!session) {
			notificationService.warn(localize('aicore.noSession', 'No active spec session'));
			return;
		}

		// 先保存任务文件
		await specService.saveTasksFile();

		// 获取任务文件路径
		const specsFolder = specService.getSpecsFolder();
		if (!specsFolder) {
			notificationService.warn(localize('aicore.noSpecsFolder', 'No specs folder found'));
			return;
		}

		const tasksFileUri = URI.joinPath(specsFolder, session.id, 'tasks.md');

		// 打开任务文件
		await editorService.openEditor({ resource: tasksFileUri });
	}
});

// 显示上下文提供者帮助
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'aicore.showContextProviders',
			title: {
				value: localize('aicore.showContextProviders', 'AI Core: Show Context Providers'),
				original: 'AI Core: Show Context Providers'
			},
			menu: [{ id: MenuId.CommandPalette }]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const notificationService = accessor.get(INotificationService);

		const helpMessage = `
**# 上下文提供者 (Context Providers)**

在聊天中使用 # 符号引用上下文：

| 符号 | 功能 | 示例 |
|------|------|------|
| \`#file:路径\` | 引用特定文件 | \`#file:src/app.ts 解释这个文件\` |
| \`#folder:路径\` | 引用文件夹 | \`#folder:src/components 有哪些组件?\` |
| \`#codebase\` | 整个代码库结构 | \`#codebase 项目结构是怎样的?\` |
| \`#current\` | 当前打开的文件 | \`#current 解释这段代码\` |
| \`#selection\` | 当前选中的代码 | \`#selection 这里有什么问题?\` |
| \`#terminal\` | 终端输出 | \`#terminal 这个错误怎么解决?\` |
| \`#problems\` | 当前问题列表 | \`#problems 帮我修复这些问题\` |
| \`#git diff\` | Git 更改 | \`#git diff 解释我的更改\` |
| \`#repository\` | 仓库信息 | \`#repository 这是什么项目?\` |
| \`#url:地址\` | 网页内容 | \`#url:https://docs.example.com 参考这个文档\` |

**提示**: 可以组合多个上下文，例如：
\`#file:src/api.ts #problems 修复这个文件的问题\`
`;

		notificationService.info(helpMessage);
	}
});
