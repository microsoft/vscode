/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Kiro 风格 Spec 编辑器视图
// 提供 Requirements → Design → Task list 的完整工作流

import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ISpecModeService } from '../../../../services/aiCore/browser/specModeService.js';
import { SpecSession, SpecTask, UserStory, TechnicalDesign } from '../../../../services/aiCore/common/chatModeTypes.js';
import { Emitter, Event } from '../../../../../base/common/event.js';

export type SpecTab = 'requirements' | 'design' | 'tasks';

export interface TaskAction {
	type: 'start' | 'retry' | 'view_changes' | 'view_execution' | 'make_required';
	taskId: string;
}

export interface SpecEditorState {
	activeTab: SpecTab;
	session: SpecSession | undefined;
	executingTaskId: string | undefined;
	filesUpdated: string[];
	elapsedTime: number;
}

/**
 * Spec 编辑器视图模型
 * 管理 Kiro 风格的 Spec 工作流状态
 */
export class SpecEditorViewModel extends Disposable {
	private _state: SpecEditorState;
	private readonly _disposables = new DisposableStore();

	private readonly _onDidChangeState = this._register(new Emitter<SpecEditorState>());
	readonly onDidChangeState: Event<SpecEditorState> = this._onDidChangeState.event;

	private readonly _onTaskAction = this._register(new Emitter<TaskAction>());
	readonly onTaskAction: Event<TaskAction> = this._onTaskAction.event;

	constructor(
		@ISpecModeService private readonly specModeService: ISpecModeService,
		@ILogService logService: ILogService
	) {
		super();
		logService.info('[SpecEditorViewModel] Initializing...');

		this._state = {
			activeTab: 'requirements',
			session: this.specModeService.getCurrentSession(),
			executingTaskId: undefined,
			filesUpdated: [],
			elapsedTime: 0
		};

		// 监听 Spec 会话更新
		this._disposables.add(this.specModeService.onDidUpdateSession(session => {
			this._state.session = session;
			this._onDidChangeState.fire(this._state);
		}));

		// 监听阶段变化
		this._disposables.add(this.specModeService.onDidChangePhase(phase => {
			// 根据阶段自动切换标签页
			if (phase === 'story_review' || phase === 'requirement_gathering') {
				this._state.activeTab = 'requirements';
			} else if (phase === 'design_review' || phase === 'design_generation') {
				this._state.activeTab = 'design';
			} else if (phase === 'task_generation' || phase === 'task_execution') {
				this._state.activeTab = 'tasks';
			}
			this._onDidChangeState.fire(this._state);
		}));
	}

	get state(): SpecEditorState {
		return this._state;
	}

	setActiveTab(tab: SpecTab): void {
		this._state.activeTab = tab;
		this._onDidChangeState.fire(this._state);
	}

	async executeTask(taskId: string): Promise<void> {
		const session = this._state.session;
		if (!session) return;

		const task = session.tasks.find(t => t.id === taskId);
		if (!task) return;

		this._state.executingTaskId = taskId;
		this._onDidChangeState.fire(this._state);

		try {
			const startTime = Date.now();
			const result = await this.specModeService.executeTaskWithLLM(task);

			if (result.success) {
				// 更新已修改的文件列表
				// TODO: 从 result 中提取文件列表
				this._state.elapsedTime = Date.now() - startTime;
			}
		} finally {
			this._state.executingTaskId = undefined;
			this._onDidChangeState.fire(this._state);
		}
	}

	async retryTask(taskId: string): Promise<void> {
		const session = this._state.session;
		if (!session) return;

		const task = session.tasks.find(t => t.id === taskId);
		if (!task) return;

		// 重置任务状态
		task.status = 'pending';
		this._onDidChangeState.fire(this._state);

		// 重新执行
		await this.executeTask(taskId);
	}

	addFileUpdated(filePath: string): void {
		if (!this._state.filesUpdated.includes(filePath)) {
			this._state.filesUpdated.push(filePath);
			this._onDidChangeState.fire(this._state);
		}
	}

	override dispose(): void {
		this._disposables.dispose();
		super.dispose();
	}
}

/**
 * 生成 Spec 编辑器的 HTML 内容
 */
export function renderSpecEditorHTML(state: SpecEditorState): string {
	return `
<!DOCTYPE html>
<html>
<head>
	<style>
		:root {
			--bg-primary: #1e1e1e;
			--bg-secondary: #252526;
			--bg-tertiary: #2d2d30;
			--text-primary: #cccccc;
			--text-secondary: #9d9d9d;
			--accent-blue: #007acc;
			--accent-green: #4ec9b0;
			--accent-red: #f14c4c;
			--accent-yellow: #dcdcaa;
			--border-color: #3c3c3c;
		}

		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			background: var(--bg-primary);
			color: var(--text-primary);
			margin: 0;
			padding: 0;
		}

		/* 顶部标签栏 */
		.spec-tabs {
			display: flex;
			background: var(--bg-secondary);
			border-bottom: 1px solid var(--border-color);
			padding: 0 16px;
		}

		.spec-tab {
			padding: 12px 20px;
			cursor: pointer;
			border-bottom: 2px solid transparent;
			color: var(--text-secondary);
			font-size: 13px;
			display: flex;
			align-items: center;
			gap: 8px;
		}

		.spec-tab:hover {
			color: var(--text-primary);
		}

		.spec-tab.active {
			color: var(--text-primary);
			border-bottom-color: var(--accent-blue);
		}

		.spec-tab .number {
			background: var(--bg-tertiary);
			padding: 2px 8px;
			border-radius: 10px;
			font-size: 11px;
		}

		.spec-tab.active .number {
			background: var(--accent-blue);
			color: white;
		}

		/* 内容区域 */
		.spec-content {
			padding: 16px;
			max-height: calc(100vh - 100px);
			overflow-y: auto;
		}

		/* 任务卡片 */
		.task-card {
			background: var(--bg-secondary);
			border: 1px solid var(--border-color);
			border-radius: 6px;
			padding: 12px 16px;
			margin-bottom: 8px;
		}

		.task-header {
			display: flex;
			align-items: center;
			gap: 8px;
			margin-bottom: 8px;
		}

		.task-status {
			font-size: 16px;
		}

		.task-status.completed { color: var(--accent-green); }
		.task-status.error { color: var(--accent-red); }
		.task-status.pending { color: var(--text-secondary); }
		.task-status.running { color: var(--accent-yellow); }

		.task-title {
			font-weight: 500;
			flex: 1;
		}

		.task-actions {
			display: flex;
			gap: 8px;
		}

		.task-action {
			padding: 4px 8px;
			background: var(--bg-tertiary);
			border: 1px solid var(--border-color);
			border-radius: 4px;
			color: var(--text-secondary);
			cursor: pointer;
			font-size: 11px;
		}

		.task-action:hover {
			color: var(--text-primary);
			border-color: var(--accent-blue);
		}

		.task-action.primary {
			background: var(--accent-blue);
			color: white;
			border-color: var(--accent-blue);
		}

		.task-subtasks {
			padding-left: 24px;
			font-size: 12px;
			color: var(--text-secondary);
		}

		.task-subtask {
			padding: 4px 0;
		}

		.task-deps {
			font-size: 11px;
			color: var(--accent-yellow);
			margin-top: 8px;
		}

		/* 文件更新面板 */
		.files-panel {
			position: fixed;
			right: 0;
			top: 48px;
			width: 300px;
			height: calc(100vh - 48px);
			background: var(--bg-secondary);
			border-left: 1px solid var(--border-color);
			padding: 16px;
		}

		.files-panel h3 {
			margin: 0 0 12px 0;
			font-size: 12px;
			text-transform: uppercase;
			color: var(--text-secondary);
		}

		.file-item {
			font-size: 12px;
			padding: 4px 0;
			color: var(--text-primary);
		}

		.file-item::before {
			content: '•';
			margin-right: 8px;
			color: var(--accent-green);
		}

		/* 统计信息 */
		.stats {
			position: fixed;
			bottom: 60px;
			right: 16px;
			font-size: 11px;
			color: var(--text-secondary);
		}

		/* Update tasks 按钮 */
		.update-btn {
			margin-left: auto;
			padding: 8px 16px;
			background: transparent;
			border: 1px solid var(--border-color);
			border-radius: 4px;
			color: var(--text-secondary);
			cursor: pointer;
			display: flex;
			align-items: center;
			gap: 6px;
		}

		.update-btn:hover {
			color: var(--text-primary);
			border-color: var(--accent-blue);
		}
	</style>
</head>
<body>
	<div class="spec-tabs">
		<div class="spec-tab ${state.activeTab === 'requirements' ? 'active' : ''}" data-tab="requirements">
			<span class="number">1</span> Requirements
		</div>
		<div class="spec-tab ${state.activeTab === 'design' ? 'active' : ''}" data-tab="design">
			<span class="number">2</span> Design
		</div>
		<div class="spec-tab ${state.activeTab === 'tasks' ? 'active' : ''}" data-tab="tasks">
			<span class="number">3</span> Task list
		</div>
		<button class="update-btn">
			<span>↻</span> Update tasks
		</button>
	</div>

	<div class="spec-content">
		${renderTabContent(state)}
	</div>

	${state.filesUpdated.length > 0 ? `
	<div class="files-panel">
		<h3>Files Updated:</h3>
		${state.filesUpdated.map(f => `<div class="file-item">${f}</div>`).join('')}
	</div>
	` : ''}

	${state.elapsedTime > 0 ? `
	<div class="stats">
		Elapsed time: ${formatTime(state.elapsedTime)}
	</div>
	` : ''}

	<script>
		const vscode = acquireVsCodeApi();

		// 标签页切换
		document.querySelectorAll('.spec-tab').forEach(tab => {
			tab.addEventListener('click', () => {
				vscode.postMessage({ type: 'tabChange', tab: tab.dataset.tab });
			});
		});

		// 任务操作
		document.querySelectorAll('.task-action').forEach(btn => {
			btn.addEventListener('click', () => {
				vscode.postMessage({
					type: 'taskAction',
					action: btn.dataset.action,
					taskId: btn.dataset.taskId
				});
			});
		});
	</script>
</body>
</html>
	`;
}

function renderTabContent(state: SpecEditorState): string {
	const session = state.session;
	if (!session) {
		return '<p>No active spec session. Start by describing what you want to build.</p>';
	}

	switch (state.activeTab) {
		case 'requirements':
			return renderRequirements(session.userStories);
		case 'design':
			return renderDesign(session.technicalDesign);
		case 'tasks':
			return renderTasks(session.tasks, state.executingTaskId);
		default:
			return '';
	}
}

function renderRequirements(stories: UserStory[]): string {
	if (stories.length === 0) {
		return '<p>正在生成需求文档...</p>';
	}

	return stories.map((story, index) => `
		<div class="task-card">
			<div class="task-header">
				<span class="task-status ${story.status === 'approved' ? 'completed' : 'pending'}">
					${story.status === 'approved' ? '✅' : '📋'}
				</span>
				<span class="task-title">US-${String(index + 1).padStart(3, '0')}: ${story.title}</span>
			</div>
			<div class="task-subtasks">
				<div class="task-subtask">${story.description}</div>
				${story.acceptanceCriteria.slice(0, 2).map(ac => `
					<div class="task-subtask">• ${ac}</div>
				`).join('')}
			</div>
		</div>
	`).join('');
}

function renderDesign(design: TechnicalDesign | undefined): string {
	if (!design) {
		return '<p>等待需求确认后生成设计文档...</p>';
	}

	return `
		<div class="task-card">
			<h3>架构概述</h3>
			<p>${design.overview}</p>
		</div>
		<div class="task-card">
			<h3>组件设计</h3>
			${design.components.map(c => `
				<div class="task-subtask">• <strong>${c.name}</strong>: ${c.responsibility}</div>
			`).join('')}
		</div>
		${design.sequenceDiagram ? `
		<div class="task-card">
			<h3>序列图</h3>
			<pre>${design.sequenceDiagram}</pre>
		</div>
		` : ''}
	`;
}

function renderTasks(tasks: SpecTask[], executingTaskId: string | undefined): string {
	if (tasks.length === 0) {
		return '<p>等待设计确认后生成任务列表...</p>';
	}

	return tasks.map(task => {
		const isExecuting = task.id === executingTaskId;
		const statusIcon = isExecuting ? '🔄' :
			task.status === 'completed' ? '✅' :
			task.status === 'failed' ? '❌' :
			task.status === 'in_progress' ? '🔄' : '⏳';

		const statusClass = isExecuting ? 'running' :
			task.status === 'completed' ? 'completed' :
			task.status === 'failed' ? 'error' : 'pending';

		return `
		<div class="task-card">
			<div class="task-header">
				<span class="task-status ${statusClass}">${statusIcon}</span>
				<span class="task-title">${task.title}</span>
				<div class="task-actions">
					${task.status === 'completed' ? `
						<button class="task-action" data-action="view_changes" data-task-id="${task.id}">View changes</button>
						<button class="task-action" data-action="view_execution" data-task-id="${task.id}">View execution</button>
					` : ''}
					${task.status === 'failed' ? `
						<button class="task-action primary" data-action="retry" data-task-id="${task.id}">↻ Retry</button>
					` : ''}
					${task.status === 'pending' ? `
						<button class="task-action primary" data-action="start" data-task-id="${task.id}">▶ Start task</button>
						<button class="task-action" data-action="make_required" data-task-id="${task.id}">Make task required</button>
					` : ''}
				</div>
			</div>
			<div class="task-subtasks">
				<div class="task-subtask">${task.description}</div>
			</div>
			${task.dependencies && task.dependencies.length > 0 ? `
				<div class="task-deps">_需求: ${task.dependencies.join(', ')}_</div>
			` : ''}
		</div>
		`;
	}).join('');
}

function formatTime(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	return `${minutes}m ${remainingSeconds}s`;
}
