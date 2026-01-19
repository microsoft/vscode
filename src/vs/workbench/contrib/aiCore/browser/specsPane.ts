/*---------------------------------------------------------------------------------------------
 *  AI Core Specs Pane
 *  Kiro 风格的 Specs 侧边栏面板
 *--------------------------------------------------------------------------------------------*/

import './specsPane.css';
import * as dom from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { ViewPane, IViewPaneOptions } from '../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { ISpecModeService } from '../../../services/aiCore/browser/specModeService.js';
import { IChatModeService } from '../../../services/aiCore/browser/chatModeService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { SpecSession, SpecTask, UserStory } from '../../../services/aiCore/common/chatModeTypes.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { Codicon } from '../../../../base/common/codicons.js';

export const SPECS_VIEW_ID = 'workbench.view.specs';

export class SpecsPane extends ViewPane {

	static readonly Id = SPECS_VIEW_ID;

	private _container!: HTMLElement;
	private _headerSection!: HTMLElement;
	private _contentSection!: HTMLElement;
	private _emptyState!: HTMLElement;
	private _sessionView!: HTMLElement;

	private readonly _disposables = new DisposableStore();

	constructor(
		options: IViewPaneOptions,
		@ISpecModeService private readonly specModeService: ISpecModeService,
		@IChatModeService private readonly chatModeService: IChatModeService,
		@ICommandService private readonly commandService: ICommandService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		// 监听会话更新
		this._disposables.add(this.specModeService.onDidUpdateSession(() => this._updateView()));
		this._disposables.add(this.specModeService.onDidChangePhase(() => this._updateView()));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this._container = dom.append(container, dom.$('.specs-pane'));

		// 头部区域
		this._headerSection = dom.append(this._container, dom.$('.specs-header'));
		this._renderHeader();

		// 内容区域
		this._contentSection = dom.append(this._container, dom.$('.specs-content'));

		// 空状态
		this._emptyState = dom.append(this._contentSection, dom.$('.specs-empty-state'));
		this._renderEmptyState();

		// 会话视图
		this._sessionView = dom.append(this._contentSection, dom.$('.specs-session-view'));
		this._sessionView.style.display = 'none';

		this._updateView();
	}

	private _renderHeader(): void {
		const title = dom.append(this._headerSection, dom.$('.specs-title'));
		title.textContent = '📋 Specs';

		const actions = dom.append(this._headerSection, dom.$('.specs-actions'));

		// 新建 Spec 按钮
		const newButton = new Button(actions, { ...defaultButtonStyles, title: localize('newSpec', 'New Spec') });
		newButton.icon = Codicon.add;
		newButton.label = '';
		this._disposables.add(newButton.onDidClick(() => this._createNewSpec()));
		this._disposables.add(newButton);

		// 刷新按钮
		const refreshButton = new Button(actions, { ...defaultButtonStyles, title: localize('refresh', 'Refresh') });
		refreshButton.icon = Codicon.refresh;
		refreshButton.label = '';
		this._disposables.add(refreshButton.onDidClick(() => this._updateView()));
		this._disposables.add(refreshButton);
	}

	private _renderEmptyState(): void {
		const icon = dom.append(this._emptyState, dom.$('.specs-empty-icon'));
		icon.textContent = '📝';

		const message = dom.append(this._emptyState, dom.$('.specs-empty-message'));
		message.textContent = localize('noSpecs', 'No active spec session');

		const description = dom.append(this._emptyState, dom.$('.specs-empty-description'));
		description.textContent = localize('createSpec', 'Create a new spec to start planning your feature');

		const createButton = new Button(this._emptyState, { ...defaultButtonStyles });
		createButton.label = localize('createNewSpec', '+ New Spec');
		this._disposables.add(createButton.onDidClick(() => this._createNewSpec()));
		this._disposables.add(createButton);
	}

	private _createNewSpec(): void {
		// 切换到 Spec 模式并打开聊天
		this.chatModeService.setMode('spec');
		this.commandService.executeCommand('workbench.action.chat.open');
	}

	private _updateView(): void {
		const session = this.specModeService.getCurrentSession();

		if (session) {
			this._emptyState.style.display = 'none';
			this._sessionView.style.display = 'block';
			this._renderSessionView(session);
		} else {
			this._emptyState.style.display = 'flex';
			this._sessionView.style.display = 'none';
		}
	}

	private _renderSessionView(session: SpecSession): void {
		dom.clearNode(this._sessionView);

		// 进度条
		this._renderProgressSection(session);

		// 阶段指示器
		this._renderPhaseIndicator(session);

		// 用户故事
		this._renderStoriesSection(session);

		// 任务列表
		this._renderTasksSection(session);

		// 操作按钮
		this._renderActionsSection(session);
	}

	private _renderProgressSection(session: SpecSession): void {
		const section = dom.append(this._sessionView, dom.$('.specs-progress-section'));

		const completed = session.tasks.filter(t => t.status === 'completed').length;
		const total = session.tasks.length || 1;
		const percent = Math.round((completed / total) * 100);

		const header = dom.append(section, dom.$('.specs-section-header'));
		header.textContent = `📊 进度: ${completed}/${total} (${percent}%)`;

		const progressBar = dom.append(section, dom.$('.specs-progress-bar'));
		const progressFill = dom.append(progressBar, dom.$('.specs-progress-fill'));
		progressFill.style.width = `${percent}%`;
	}

	private _renderPhaseIndicator(session: SpecSession): void {
		const section = dom.append(this._sessionView, dom.$('.specs-phase-section'));

		const phases = [
			{ id: 'requirement_gathering', label: '需求', icon: '📝' },
			{ id: 'story_generation', label: '故事', icon: '📖' },
			{ id: 'design_generation', label: '设计', icon: '🏗️' },
			{ id: 'task_generation', label: '任务', icon: '📋' },
			{ id: 'task_execution', label: '执行', icon: '🔄' },
			{ id: 'completed', label: '完成', icon: '✅' }
		];

		const phasesContainer = dom.append(section, dom.$('.specs-phases'));

		for (const phase of phases) {
			const phaseItem = dom.append(phasesContainer, dom.$('.specs-phase-item'));

			const isCurrent = session.phase === phase.id ||
				(session.phase === 'story_review' && phase.id === 'story_generation') ||
				(session.phase === 'design_review' && phase.id === 'design_generation');
			const isPast = this._isPhaseCompleted(session.phase, phase.id);

			if (isCurrent) {
				phaseItem.classList.add('current');
			} else if (isPast) {
				phaseItem.classList.add('completed');
			}

			const icon = dom.append(phaseItem, dom.$('.specs-phase-icon'));
			icon.textContent = isPast ? '✅' : phase.icon;

			const label = dom.append(phaseItem, dom.$('.specs-phase-label'));
			label.textContent = phase.label;
		}
	}

	private _isPhaseCompleted(currentPhase: string, checkPhase: string): boolean {
		const phaseOrder = [
			'requirement_gathering', 'story_generation', 'story_review',
			'design_generation', 'design_review', 'task_generation',
			'task_execution', 'completed'
		];
		return phaseOrder.indexOf(currentPhase) > phaseOrder.indexOf(checkPhase);
	}

	private _renderStoriesSection(session: SpecSession): void {
		if (session.userStories.length === 0) {
			return;
		}

		const section = dom.append(this._sessionView, dom.$('.specs-stories-section'));

		const header = dom.append(section, dom.$('.specs-section-header'));
		header.textContent = `📖 用户故事 (${session.userStories.length})`;

		const list = dom.append(section, dom.$('.specs-stories-list'));

		for (const story of session.userStories) {
			this._renderStoryItem(list, story);
		}
	}

	private _renderStoryItem(container: HTMLElement, story: UserStory): void {
		const item = dom.append(container, dom.$('.specs-story-item'));

		const priorityIcon = story.priority === 'high' ? '🔴' :
			story.priority === 'medium' ? '🟡' : '🟢';

		const statusIcon = story.status === 'approved' ? '✅' :
			story.status === 'completed' ? '🎉' : '📝';

		const header = dom.append(item, dom.$('.specs-story-header'));
		header.textContent = `${priorityIcon} ${statusIcon} ${story.title}`;

		const desc = dom.append(item, dom.$('.specs-story-desc'));
		desc.textContent = story.description.slice(0, 80) + (story.description.length > 80 ? '...' : '');

		const criteria = dom.append(item, dom.$('.specs-story-criteria'));
		criteria.textContent = `${story.acceptanceCriteria.length} 个验收标准`;
	}

	private _renderTasksSection(session: SpecSession): void {
		if (session.tasks.length === 0) {
			return;
		}

		const section = dom.append(this._sessionView, dom.$('.specs-tasks-section'));

		const header = dom.append(section, dom.$('.specs-section-header'));
		const completed = session.tasks.filter(t => t.status === 'completed').length;
		header.textContent = `📋 任务 (${completed}/${session.tasks.length})`;

		const list = dom.append(section, dom.$('.specs-tasks-list'));

		for (const task of session.tasks) {
			this._renderTaskItem(list, task);
		}
	}

	private _renderTaskItem(container: HTMLElement, task: SpecTask): void {
		const item = dom.append(container, dom.$('.specs-task-item'));

		const statusIcon = task.status === 'completed' ? '✅' :
			task.status === 'in_progress' ? '🔄' :
			task.status === 'blocked' ? '🚫' : '⏳';

		const typeIcon = task.type === 'implementation' ? '💻' :
			task.type === 'test' ? '🧪' :
			task.type === 'documentation' ? '📝' : '👀';

		const checkbox = dom.append(item, dom.$('.specs-task-checkbox'));
		checkbox.textContent = task.status === 'completed' ? '☑' : '☐';

		const content = dom.append(item, dom.$('.specs-task-content'));

		const title = dom.append(content, dom.$('.specs-task-title'));
		title.textContent = `${typeIcon} ${task.title}`;

		const status = dom.append(content, dom.$('.specs-task-status'));
		status.textContent = statusIcon;

		if (task.status === 'completed') {
			item.classList.add('completed');
		} else if (task.status === 'in_progress') {
			item.classList.add('in-progress');
		}
	}

	private _renderActionsSection(session: SpecSession): void {
		const section = dom.append(this._sessionView, dom.$('.specs-actions-section'));

		const phase = session.phase;

		// 根据阶段显示不同按钮
		if (phase === 'story_review') {
			const approveBtn = new Button(section, { ...defaultButtonStyles });
			approveBtn.label = '✅ 批准用户故事';
			this._disposables.add(approveBtn.onDidClick(() => {
				this.specModeService.approveAllStories();
				this.commandService.executeCommand('workbench.action.chat.open');
			}));
			this._disposables.add(approveBtn);
		} else if (phase === 'design_review') {
			const approveBtn = new Button(section, { ...defaultButtonStyles });
			approveBtn.label = '✅ 批准技术设计';
			this._disposables.add(approveBtn.onDidClick(() => {
				this.specModeService.approveDesign();
				this.commandService.executeCommand('workbench.action.chat.open');
			}));
			this._disposables.add(approveBtn);
		} else if (phase === 'task_execution') {
			const nextTask = this.specModeService.getNextTask();
			if (nextTask) {
				const executeBtn = new Button(section, { ...defaultButtonStyles });
				executeBtn.label = `▶ 执行: ${nextTask.title}`;
				this._disposables.add(executeBtn.onDidClick(() => {
					this.commandService.executeCommand('workbench.action.chat.open');
				}));
				this._disposables.add(executeBtn);
			}
		}

		// 保存按钮
		const saveBtn = new Button(section, { ...defaultButtonStyles, secondary: true });
		saveBtn.label = '💾 保存规格文件';
		this._disposables.add(saveBtn.onDidClick(async () => {
			await this.specModeService.saveRequirementsFile();
			await this.specModeService.saveDesignFile();
			await this.specModeService.saveTasksFile();
		}));
		this._disposables.add(saveBtn);

		// 清除会话按钮
		const clearBtn = new Button(section, { ...defaultButtonStyles, secondary: true });
		clearBtn.label = '🗑️ 清除会话';
		this._disposables.add(clearBtn.onDidClick(() => {
			this.specModeService.clearSession();
			this._updateView();
		}));
		this._disposables.add(clearBtn);
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		if (this._container) {
			this._container.style.height = `${height}px`;
			this._container.style.width = `${width}px`;
		}
	}

	override dispose(): void {
		this._disposables.dispose();
		super.dispose();
	}
}
