/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { AISpecTask, AISpecTaskBreakdown } from './specTypes.js';

export const ITaskBreakdownService = createDecorator<ITaskBreakdownService>('ITaskBreakdownService');

export interface ITaskBreakdownService {
	readonly _serviceBrand: undefined;

	/** 当前任务列表变更事件 */
	readonly onDidChangeTasks: Event<AISpecTaskBreakdown | undefined>;

	/** 获取当前任务拆解 */
	getCurrentBreakdown(): AISpecTaskBreakdown | undefined;

	/** 从需求文本生成任务拆解（模拟，后续接入真实 AI） */
	breakdownFromSpec(spec: string): Promise<AISpecTaskBreakdown>;

	/** 更新任务状态 */
	updateTaskStatus(taskId: string, status: AISpecTask['status']): void;

	/** 清除当前任务 */
	clearTasks(): void;

	/** 获取下一个待处理任务 */
	getNextPendingTask(): AISpecTask | undefined;

	/** 生成任务的 prompt（用于 Chat 对话） */
	getTaskPrompt(taskId: string): string | undefined;
}

export class TaskBreakdownService extends Disposable implements ITaskBreakdownService {
	readonly _serviceBrand: undefined;

	private _currentBreakdown: AISpecTaskBreakdown | undefined;

	private readonly _onDidChangeTasks = this._register(new Emitter<AISpecTaskBreakdown | undefined>());
	readonly onDidChangeTasks = this._onDidChangeTasks.event;

	constructor(
		@ILogService private readonly logService: ILogService
	) {
		super();
	}

	getCurrentBreakdown(): AISpecTaskBreakdown | undefined {
		return this._currentBreakdown;
	}

	async breakdownFromSpec(spec: string): Promise<AISpecTaskBreakdown> {
		this.logService.info(`[TaskBreakdown]: Breaking down spec: ${spec.slice(0, 100)}...`);

		// 模拟任务拆解（后续接入真实 AI 模型）
		const breakdown = this.simulateBreakdown(spec);

		this._currentBreakdown = breakdown;
		this._onDidChangeTasks.fire(breakdown);

		this.logService.info(`[TaskBreakdown]: Generated ${breakdown.tasks.length} tasks`);
		return breakdown;
	}

	updateTaskStatus(taskId: string, status: AISpecTask['status']): void {
		if (!this._currentBreakdown) {
			return;
		}

		const task = this.findTask(this._currentBreakdown.tasks, taskId);
		if (task) {
			task.status = status;
			this._onDidChangeTasks.fire(this._currentBreakdown);
			this.logService.trace(`[TaskBreakdown]: Task ${taskId} status -> ${status}`);
		}
	}

	clearTasks(): void {
		this._currentBreakdown = undefined;
		this._onDidChangeTasks.fire(undefined);
	}

	getNextPendingTask(): AISpecTask | undefined {
		if (!this._currentBreakdown) {
			return undefined;
		}

		return this.findNextPending(this._currentBreakdown.tasks);
	}

	getTaskPrompt(taskId: string): string | undefined {
		if (!this._currentBreakdown) {
			return undefined;
		}

		const task = this.findTask(this._currentBreakdown.tasks, taskId);
		if (!task) {
			return undefined;
		}

		return `请帮我完成以下任务：

## 任务：${task.title}

${task.description}

${task.files?.length ? `相关文件：\n${task.files.map(f => `- ${f}`).join('\n')}` : ''}

请提供具体的实现方案和代码。`;
	}

	private findTask(tasks: AISpecTask[], id: string): AISpecTask | undefined {
		for (const task of tasks) {
			if (task.id === id) {
				return task;
			}
			if (task.subtasks) {
				const found = this.findTask(task.subtasks, id);
				if (found) {
					return found;
				}
			}
		}
		return undefined;
	}

	private findNextPending(tasks: AISpecTask[]): AISpecTask | undefined {
		for (const task of tasks) {
			if (task.status === 'pending') {
				// 检查依赖
				if (task.dependencies?.length) {
					const allDepsCompleted = task.dependencies.every(depId => {
						const dep = this.findTask(this._currentBreakdown!.tasks, depId);
						return dep?.status === 'completed';
					});
					if (!allDepsCompleted) {
						continue;
					}
				}
				return task;
			}
			if (task.subtasks) {
				const found = this.findNextPending(task.subtasks);
				if (found) {
					return found;
				}
			}
		}
		return undefined;
	}

	/**
	 * 模拟任务拆解（后续替换为真实 AI 调用）
	 */
	private simulateBreakdown(spec: string): AISpecTaskBreakdown {
		const specLower = spec.toLowerCase();

		// 根据关键词生成不同的任务模板
		if (specLower.includes('登录') || specLower.includes('login') || specLower.includes('auth')) {
			return this.createAuthTaskBreakdown(spec);
		}

		if (specLower.includes('api') || specLower.includes('接口')) {
			return this.createApiTaskBreakdown(spec);
		}

		if (specLower.includes('组件') || specLower.includes('component')) {
			return this.createComponentTaskBreakdown(spec);
		}

		// 默认任务拆解
		return this.createDefaultTaskBreakdown(spec);
	}

	private createAuthTaskBreakdown(spec: string): AISpecTaskBreakdown {
		return {
			originalSpec: spec,
			estimatedMinutes: 240,
			tasks: [
				{
					id: 'auth-1',
					title: '设计认证流程',
					description: '设计用户认证的整体流程，包括登录、注册、Token 管理',
					status: 'pending',
					type: 'design',
					estimatedMinutes: 30
				},
				{
					id: 'auth-2',
					title: '实现认证服务',
					description: '创建 AuthService，实现登录、注册、刷新 Token 等核心方法',
					status: 'pending',
					type: 'implement',
					dependencies: ['auth-1'],
					estimatedMinutes: 60,
					files: ['src/services/auth.ts']
				},
				{
					id: 'auth-3',
					title: '实现 UI 组件',
					description: '创建登录表单、注册表单组件',
					status: 'pending',
					type: 'implement',
					dependencies: ['auth-2'],
					estimatedMinutes: 90,
					files: ['src/components/LoginForm.tsx', 'src/components/RegisterForm.tsx']
				},
				{
					id: 'auth-4',
					title: '编写单元测试',
					description: '为认证服务编写单元测试',
					status: 'pending',
					type: 'test',
					dependencies: ['auth-2'],
					estimatedMinutes: 45,
					files: ['src/services/__tests__/auth.test.ts']
				},
				{
					id: 'auth-5',
					title: '编写文档',
					description: '编写认证模块的使用文档',
					status: 'pending',
					type: 'doc',
					dependencies: ['auth-3', 'auth-4'],
					estimatedMinutes: 15
				}
			]
		};
	}

	private createApiTaskBreakdown(spec: string): AISpecTaskBreakdown {
		return {
			originalSpec: spec,
			estimatedMinutes: 180,
			tasks: [
				{
					id: 'api-1',
					title: '设计 API 接口',
					description: '定义 API 接口规范，包括请求/响应格式、错误码',
					status: 'pending',
					type: 'design',
					estimatedMinutes: 20
				},
				{
					id: 'api-2',
					title: '实现 API 服务',
					description: '创建 API 服务层，封装 HTTP 请求',
					status: 'pending',
					type: 'implement',
					dependencies: ['api-1'],
					estimatedMinutes: 60
				},
				{
					id: 'api-3',
					title: '添加类型定义',
					description: '为 API 请求和响应添加 TypeScript 类型',
					status: 'pending',
					type: 'implement',
					dependencies: ['api-1'],
					estimatedMinutes: 30
				},
				{
					id: 'api-4',
					title: '编写测试',
					description: '编写 API 集成测试',
					status: 'pending',
					type: 'test',
					dependencies: ['api-2', 'api-3'],
					estimatedMinutes: 45
				}
			]
		};
	}

	private createComponentTaskBreakdown(spec: string): AISpecTaskBreakdown {
		return {
			originalSpec: spec,
			estimatedMinutes: 120,
			tasks: [
				{
					id: 'comp-1',
					title: '设计组件接口',
					description: '定义组件的 Props、State 和事件接口',
					status: 'pending',
					type: 'design',
					estimatedMinutes: 15
				},
				{
					id: 'comp-2',
					title: '实现组件逻辑',
					description: '实现组件的核心业务逻辑',
					status: 'pending',
					type: 'implement',
					dependencies: ['comp-1'],
					estimatedMinutes: 45
				},
				{
					id: 'comp-3',
					title: '实现组件样式',
					description: '编写组件的 CSS 样式',
					status: 'pending',
					type: 'implement',
					dependencies: ['comp-2'],
					estimatedMinutes: 30
				},
				{
					id: 'comp-4',
					title: '编写测试',
					description: '编写组件的单元测试和快照测试',
					status: 'pending',
					type: 'test',
					dependencies: ['comp-3'],
					estimatedMinutes: 30
				}
			]
		};
	}

	private createDefaultTaskBreakdown(spec: string): AISpecTaskBreakdown {
		return {
			originalSpec: spec,
			estimatedMinutes: 90,
			tasks: [
				{
					id: 'default-1',
					title: '需求分析',
					description: `分析需求：${spec}`,
					status: 'pending',
					type: 'design',
					estimatedMinutes: 15
				},
				{
					id: 'default-2',
					title: '方案设计',
					description: '设计实现方案，确定技术选型',
					status: 'pending',
					type: 'design',
					dependencies: ['default-1'],
					estimatedMinutes: 20
				},
				{
					id: 'default-3',
					title: '代码实现',
					description: '按照设计方案实现功能',
					status: 'pending',
					type: 'implement',
					dependencies: ['default-2'],
					estimatedMinutes: 40
				},
				{
					id: 'default-4',
					title: '测试验证',
					description: '编写测试用例，验证功能正确性',
					status: 'pending',
					type: 'test',
					dependencies: ['default-3'],
					estimatedMinutes: 15
				}
			]
		};
	}
}

registerSingleton(ITaskBreakdownService, TaskBreakdownService, InstantiationType.Delayed);
