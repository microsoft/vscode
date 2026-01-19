/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Spec-Driven Development Types
 * 借鉴 Amazon Kiro 的核心理念：从需求规格驱动开发
 */

/**
 * 项目规格配置文件 (.aispec)
 */
export interface AISpecConfig {
	/** 版本号 */
	version: string;

	/** 项目描述 */
	description?: string;

	/** 全局规则：注入到每次对话的 System Prompt */
	rules: AISpecRule[];

	/** 文件类型特定规则 */
	fileRules?: Record<string, AISpecRule[]>;

	/** 自动触发器：事件驱动的智能体动作 */
	triggers?: AISpecTrigger[];

	/** 任务模板：常用场景的快捷模板 */
	templates?: AISpecTemplate[];
}

/**
 * 单条规则
 */
export interface AISpecRule {
	/** 规则 ID */
	id: string;

	/** 规则内容（会注入到 System Prompt） */
	content: string;

	/** 规则优先级 (越高越靠前) */
	priority?: number;

	/** 是否启用 */
	enabled?: boolean;

	/** 适用的文件 glob 模式 */
	glob?: string;
}

/**
 * 事件触发器
 */
export interface AISpecTrigger {
	/** 触发器 ID */
	id: string;

	/** 触发事件类型 */
	event: 'onSave' | 'onOpen' | 'onError' | 'onTest' | 'onCommit';

	/** 触发时执行的动作 */
	action: 'suggest' | 'autoFix' | 'generateTest' | 'generateDoc';

	/** 适用的文件 glob 模式 */
	glob?: string;

	/** 是否启用 */
	enabled?: boolean;
}

/**
 * 任务模板
 */
export interface AISpecTemplate {
	/** 模板 ID */
	id: string;

	/** 模板名称 */
	name: string;

	/** 模板描述 */
	description: string;

	/** 模板提示词 */
	prompt: string;

	/** 输出结构 */
	outputType: 'tasks' | 'code' | 'doc' | 'test';
}

/**
 * 任务拆解结果
 */
export interface AISpecTaskBreakdown {
	/** 原始需求 */
	originalSpec: string;

	/** 拆解后的任务列表 */
	tasks: AISpecTask[];

	/** 预估总时间（分钟） */
	estimatedMinutes?: number;
}

/**
 * 单个任务
 */
export interface AISpecTask {
	/** 任务 ID */
	id: string;

	/** 任务标题 */
	title: string;

	/** 任务描述 */
	description: string;

	/** 任务状态 */
	status: 'pending' | 'in_progress' | 'completed' | 'blocked';

	/** 任务类型 */
	type: 'design' | 'implement' | 'test' | 'doc' | 'review';

	/** 相关文件 */
	files?: string[];

	/** 子任务 */
	subtasks?: AISpecTask[];

	/** 预估时间（分钟） */
	estimatedMinutes?: number;

	/** 依赖的任务 ID */
	dependencies?: string[];
}

/**
 * 默认 .aispec 配置
 */
export const DEFAULT_AISPEC_CONFIG: AISpecConfig = {
	version: '1.0.0',
	rules: [
		{
			id: 'code-style',
			content: '遵循项目现有的代码风格和命名规范',
			priority: 100,
			enabled: true
		},
		{
			id: 'error-handling',
			content: '所有异步操作都需要正确的错误处理',
			priority: 90,
			enabled: true
		},
		{
			id: 'type-safety',
			content: '优先使用 TypeScript 的类型系统，避免 any 类型',
			priority: 80,
			enabled: true
		}
	],
	triggers: [
		{
			id: 'auto-test-suggest',
			event: 'onSave',
			action: 'suggest',
			glob: '**/*.ts',
			enabled: true
		}
	],
	templates: [
		{
			id: 'new-feature',
			name: '新功能开发',
			description: '从需求描述生成完整的功能实现计划',
			prompt: '请根据以下需求，生成任务拆解、设计方案和实现步骤：\n\n{spec}',
			outputType: 'tasks'
		},
		{
			id: 'refactor',
			name: '代码重构',
			description: '分析现有代码并生成重构计划',
			prompt: '请分析以下代码，提供重构建议和步骤：\n\n{code}',
			outputType: 'tasks'
		},
		{
			id: 'generate-test',
			name: '生成测试',
			description: '为选中的代码生成单元测试',
			prompt: '请为以下代码生成完整的单元测试：\n\n{code}',
			outputType: 'test'
		}
	]
};
