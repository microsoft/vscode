/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, EventType } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { ActionViewItem, BaseActionViewItem, IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Action, IAction } from '../../../../base/common/actions.js';
import { equals } from '../../../../base/common/arrays.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derivedOpts, IObservable } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../nls.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { ActionWidgetDropdownActionViewItem } from '../../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js';
import { MenuId, registerAction2, Action2, MenuRegistry, SubmenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction } from '../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IQuickInputButton, IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { logSessionsInteraction } from '../../../common/sessionsTelemetry.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { SessionsCategories } from '../../../common/categories.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { IsActiveSessionBackgroundProviderContext, SessionsWelcomeVisibleContext } from '../../../common/contextkeys.js';
import { ISession } from '../../sessions/common/sessionData.js';
import { Menus } from '../../../browser/menus.js';
import { INonSessionTaskEntry, ISessionsConfigurationService, ISessionTaskWithTarget, ITaskEntry, TaskStorageTarget } from './sessionsConfigurationService.js';
import { IsAuxiliaryWindowContext } from '../../../../workbench/common/contextkeys.js';
import { IRunScriptCustomTaskWidgetResult, RunScriptCustomTaskWidget } from './runScriptCustomTaskWidget.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';


// Menu IDs - exported for use in auxiliary bar part
export const RunScriptDropdownMenuId = MenuId.for('AgentSessionsRunScriptDropdown');
const RUN_SCRIPT_ACTION_MODAL_VISIBLE_CLASS = 'run-script-action-modal-visible';

// Action IDs
const RUN_SCRIPT_ACTION_PRIMARY_ID = 'workbench.action.agentSessions.runScriptPrimary';
const CONFIGURE_DEFAULT_RUN_ACTION_ID = 'workbench.action.agentSessions.configureDefaultRunAction';
const GENERATE_RUN_ACTION_ID = 'workbench.action.agentSessions.generateRunAction';
const closeQuickWidgetButton: IQuickInputButton = {
	iconClass: ThemeIcon.asClassName(Codicon.close),
	tooltip: localize('closeQuickWidget', "Close"),
	alwaysVisible: true,
};

function getTaskDisplayLabel(task: ITaskEntry): string {
	if (task.label && task.label.length > 0) {
		return task.label;
	}
	if (task.script && task.script.length > 0) {
		return task.script;
	}
	if (task.command && task.command.length > 0) {
		return task.command;
	}
	if (task.task && task.task.toString().length > 0) {
		return task.task.toString();
	}
	return '';
}

function getTaskCommandPreview(task: ITaskEntry): string {
	if (task.command && task.command.length > 0) {
		return task.command;
	}
	if (task.script && task.script.length > 0) {
		return localize('npmTaskCommandPreview', "npm run {0}", task.script);
	}
	if (task.task && task.task.toString().length > 0) {
		return task.task.toString();
	}
	return getTaskDisplayLabel(task);
}

function getPrimaryTask(tasks: readonly ISessionTaskWithTarget[], pinnedTaskLabel: string | undefined): ISessionTaskWithTarget | undefined {
	if (tasks.length === 0) {
		return undefined;
	}

	if (pinnedTaskLabel) {
		const pinnedTask = tasks.find(task => task.task.label === pinnedTaskLabel);
		if (pinnedTask) {
			return pinnedTask;
		}
	}

	return tasks[0];
}

interface IRunScriptActionContext {
	readonly session: ISession;
	readonly tasks: readonly ISessionTaskWithTarget[];
	readonly pinnedTaskLabel: string | undefined;
}

type TaskConfigurationMode = 'add' | 'configure';

/**
 * Workbench contribution that adds a split dropdown action to the auxiliary bar title
 * for running a task via tasks.json.
 */
export class RunScriptContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentSessions.runScript';

	private readonly _activeRunState: IObservable<IRunScriptActionContext | undefined>;

	constructor(
		@ISessionsManagementService private readonly _sessionManagementService: ISessionsManagementService,
		@IKeybindingService _keybindingService: IKeybindingService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@ISessionsConfigurationService private readonly _sessionsConfigService: ISessionsConfigurationService,
		@IActionViewItemService private readonly _actionViewItemService: IActionViewItemService,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();

		this._activeRunState = derivedOpts<IRunScriptActionContext | undefined>({
			owner: this,
			equalsFn: (a, b) => {
				if (a === b) { return true; }
				if (!a || !b) { return false; }
				return a.session === b.session
					&& a.pinnedTaskLabel === b.pinnedTaskLabel
					&& equals(a.tasks, b.tasks, (t1, t2) =>
						t1.task.label === t2.task.label
						&& t1.task.command === t2.task.command
						&& t1.target === t2.target
						&& t1.task.runOptions?.runOn === t2.task.runOptions?.runOn);
			}
		}, reader => {
			const activeSession = this._sessionManagementService.activeSession.read(reader);
			if (!activeSession) {
				return undefined;
			}

			const tasks = this._sessionsConfigService.getSessionTasks(activeSession).read(reader);
			const repo = activeSession.workspace.read(reader)?.repositories[0];
			const pinnedTaskLabel = this._sessionsConfigService.getPinnedTaskLabel(repo?.uri).read(reader);
			return { session: activeSession, tasks, pinnedTaskLabel };
		}).recomputeInitiallyAndOnChange(this._store);

		this._registerActionViewItemProvider();
		this._registerActions();
	}

	private _registerActionViewItemProvider(): void {
		const that = this;
		this._register(this._actionViewItemService.register(
			Menus.TitleBarSessionMenu,
			RunScriptDropdownMenuId,
			(action, options, instantiationService) => {
				if (!(action instanceof SubmenuItemAction)) {
					return undefined;
				}
				return instantiationService.createInstance(
					RunScriptActionViewItem,
					action,
					options,
					that._activeRunState,
					(session: ISession) => that._showConfigureQuickPick(session),
					(session: ISession, existingTask: INonSessionTaskEntry, mode?: TaskConfigurationMode) => that._showCustomCommandInput(session, existingTask, mode),
				);
			},
		));
	}

	private _registerActions(): void {
		const that = this;

		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: RUN_SCRIPT_ACTION_PRIMARY_ID,
					title: { value: localize('runPrimaryTask', 'Run Primary Task'), original: 'Run Primary Task' },
					icon: Codicon.play,
					category: SessionsCategories.Sessions,
					f1: true,
				});
			}

			async run(): Promise<void> {
				const activeState = that._activeRunState.get();
				if (!activeState) {
					return;
				}

				logSessionsInteraction(that._telemetryService, 'runPrimaryTask');

				const { tasks, session } = activeState;
				if (tasks.length === 0) {
					const task = await that._showConfigureQuickPick(session);
					if (task) {
						await that._sessionsConfigService.runTask(task, session);
					}
					return;
				}

				const primaryTask = getPrimaryTask(tasks, activeState.pinnedTaskLabel);
				if (!primaryTask) {
					return;
				}
				await that._sessionsConfigService.runTask(primaryTask.task, session);
			}
		}));

		this._register(autorun(reader => {
			const activeState = this._activeRunState.read(reader);
			if (!activeState) {
				return;
			}

			const { session, tasks } = activeState;
			const repo = session.workspace.read(reader)?.repositories[0];
			const configureScriptPrecondition = repo?.workingDirectory ?? repo?.uri ? ContextKeyExpr.true() : ContextKeyExpr.false();

			reader.store.add(registerAction2(class extends Action2 {
				constructor() {
					super({
						id: CONFIGURE_DEFAULT_RUN_ACTION_ID,
						title: localize2('configureDefaultRunAction', "Add Task..."),
						category: SessionsCategories.Sessions,
						icon: Codicon.add,
						precondition: configureScriptPrecondition,
						menu: [{
							id: RunScriptDropdownMenuId,
							group: tasks.length === 0 ? 'navigation' : '1_configure',
							order: 0
						}]
					});
				}

				async run(): Promise<void> {
					logSessionsInteraction(that._telemetryService, 'addTask');
					const task = await that._showConfigureQuickPick(session);
					if (task) {
						await that._sessionsConfigService.runTask(task, session);
					}
				}
			}));

			reader.store.add(registerAction2(class extends Action2 {
				constructor() {
					super({
						id: GENERATE_RUN_ACTION_ID,
						title: localize2('generateRunAction', "Generate New Task..."),
						category: SessionsCategories.Sessions,
						precondition: IsActiveSessionBackgroundProviderContext,
						menu: [{
							id: RunScriptDropdownMenuId,
							group: tasks.length === 0 ? 'navigation' : '1_configure',
							order: 1
						}]
					});
				}

				async run(): Promise<void> {
					logSessionsInteraction(that._telemetryService, 'generateNewTask');
					await that._sessionManagementService.sendAndCreateChat(session, { query: '/generate-run-commands' });
				}
			}));
		}));
	}

	private async _showConfigureQuickPick(session: ISession): Promise<ITaskEntry | undefined> {
		const nonSessionTasks = await this._sessionsConfigService.getNonSessionTasks(session);
		if (nonSessionTasks.length === 0) {
			// No existing tasks, go straight to custom command input
			return this._showCustomCommandInput(session);
		}

		interface ITaskPickItem extends IQuickPickItem {
			readonly task?: ITaskEntry;
			readonly source?: TaskStorageTarget;
		}

		const items: (ITaskPickItem | IQuickPickSeparator)[] = [];

		items.push({ type: 'separator', label: localize('custom', "Custom") });
		items.push({
			label: localize('createNewTask', "Create new task..."),
			description: localize('enterCustomCommandDesc', "Create a new shell task"),
		});

		if (nonSessionTasks.length > 0) {
			items.push({ type: 'separator', label: localize('existingTasks', "Existing Tasks") });
			for (const { task, target } of nonSessionTasks) {
				items.push({
					label: getTaskDisplayLabel(task),
					description: task.command,
					task,
					source: target,
				});
			}
		}

		const picked = await this._quickInputService.pick(items, {
			placeHolder: localize('pickRunAction', "Select or create a task"),
		});

		if (!picked) {
			return undefined;
		}

		const pickedItem = picked as ITaskPickItem;
		if (pickedItem.task) {
			return this._showCustomCommandInput(session, { task: pickedItem.task, target: pickedItem.source ?? 'workspace' }, 'add', true);
		} else {
			// Custom command path
			return this._showCustomCommandInput(session, undefined, 'add', true);
		}
	}

	private async _showCustomCommandInput(session: ISession, existingTask?: INonSessionTaskEntry, mode: TaskConfigurationMode = 'add', allowBackNavigation = false): Promise<ITaskEntry | undefined> {
		const taskConfiguration = await this._showCustomCommandWidget(session, existingTask, mode, allowBackNavigation);
		if (!taskConfiguration) {
			return undefined;
		}
		if (taskConfiguration === 'back') {
			return this._showConfigureQuickPick(session);
		}

		if (existingTask) {
			if (mode === 'configure') {
				const newLabel = taskConfiguration.label?.trim() || existingTask.task.label || taskConfiguration.command;

				let updatedTask: ITaskEntry = {
					...existingTask.task,
					label: newLabel,
					inSessions: true,
				};

				if (taskConfiguration.command && existingTask.task.command !== undefined) {
					updatedTask = {
						...updatedTask,
						command: taskConfiguration.command,
					};
				}

				if (taskConfiguration.runOn) {
					updatedTask = {
						...updatedTask,
						runOptions: {
							...(existingTask.task.runOptions ?? {}),
							runOn: taskConfiguration.runOn,
						},
					};
				}

				await this._sessionsConfigService.updateTask(existingTask.task.label, updatedTask, session, existingTask.target, taskConfiguration.target);
				return updatedTask;
			}

			await this._sessionsConfigService.addTaskToSessions(existingTask.task, session, existingTask.target, { runOn: taskConfiguration.runOn ?? 'default' });
			return {
				...existingTask.task,
				inSessions: true,
				...(taskConfiguration.runOn ? { runOptions: { runOn: taskConfiguration.runOn } } : {}),
			};
		}

		return this._sessionsConfigService.createAndAddTask(
			taskConfiguration.label,
			taskConfiguration.command,
			session,
			taskConfiguration.target,
			taskConfiguration.runOn ? { runOn: taskConfiguration.runOn } : undefined
		);
	}

	private _showCustomCommandWidget(session: ISession, existingTask?: INonSessionTaskEntry, mode: TaskConfigurationMode = 'add', allowBackNavigation = false): Promise<IRunScriptCustomTaskWidgetResult | 'back' | undefined> {
		const repo = session.workspace.get()?.repositories[0];
		const workspaceTargetDisabledReason = !(repo?.workingDirectory ?? repo?.uri)
			? localize('workspaceStorageUnavailableTooltip', "Workspace storage is unavailable for this session")
			: undefined;
		const isConfigureMode = mode === 'configure';

		return new Promise<IRunScriptCustomTaskWidgetResult | 'back' | undefined>(resolve => {
			const disposables = new DisposableStore();
			let settled = false;

			const quickWidget = disposables.add(this._quickInputService.createQuickWidget());
			quickWidget.title = isConfigureMode
				? localize('configureActionWidgetTitle', "Configure Task")
				: existingTask
					? localize('addExistingActionWidgetTitle', "Add Existing Task")
					: localize('addActionWidgetTitle', "Add Task");
			quickWidget.description = isConfigureMode
				? localize('configureActionWidgetDescription', "Update how this task is named, saved, and run.")
				: existingTask
					? localize('addExistingActionWidgetDescription', "Enable an existing task for sessions and configure when it should run.")
					: localize('addActionWidgetDescription', "Create a shell task and configure how it should be saved and run.");
			quickWidget.ignoreFocusOut = true;
			quickWidget.buttons = allowBackNavigation
				? [this._quickInputService.backButton, closeQuickWidgetButton]
				: [closeQuickWidgetButton];
			const widget = disposables.add(new RunScriptCustomTaskWidget({
				label: existingTask?.task.label,
				labelDisabledReason: existingTask && !isConfigureMode ? localize('existingTaskLabelLocked', "This name comes from an existing task and cannot be changed here.") : undefined,
				command: existingTask ? getTaskCommandPreview(existingTask.task) : undefined,
				commandDisabledReason: existingTask && !isConfigureMode ? localize('existingTaskCommandLocked', "This command comes from an existing task and cannot be changed here.") : undefined,
				target: existingTask?.target,
				targetDisabledReason: existingTask && !isConfigureMode ? localize('existingTaskTargetLocked', "This existing task cannot be moved between workspace and user storage.") : workspaceTargetDisabledReason,
				runOn: existingTask?.task.runOptions?.runOn === 'worktreeCreated' ? 'worktreeCreated' : undefined,
				mode: isConfigureMode ? 'configure' : existingTask ? 'add-existing' : 'add',
			}));
			quickWidget.widget = widget.domNode;
			this._layoutService.mainContainer.classList.add(RUN_SCRIPT_ACTION_MODAL_VISIBLE_CLASS);
			const backdrop = append(this._layoutService.mainContainer, $('.run-script-action-modal-backdrop'));
			disposables.add(addDisposableListener(backdrop, EventType.MOUSE_DOWN, e => {
				e.preventDefault();
				e.stopPropagation();
				complete(undefined);
			}));
			disposables.add({ dispose: () => backdrop.remove() });
			disposables.add({ dispose: () => this._layoutService.mainContainer.classList.remove(RUN_SCRIPT_ACTION_MODAL_VISIBLE_CLASS) });

			const complete = (result: IRunScriptCustomTaskWidgetResult | undefined) => {
				if (settled) {
					return;
				}
				settled = true;
				resolve(result);
				quickWidget.hide();
			};

			disposables.add(widget.onDidSubmit(result => complete(result)));
			disposables.add(widget.onDidCancel(() => complete(undefined)));
			disposables.add(quickWidget.onDidTriggerButton(button => {
				if (allowBackNavigation && button === this._quickInputService.backButton) {
					settled = true;
					resolve('back');
					quickWidget.hide();
					return;
				}
				if (button === closeQuickWidgetButton) {
					complete(undefined);
				}
			}));
			disposables.add(quickWidget.onDidHide(() => {
				if (!settled) {
					settled = true;
					resolve(undefined);
				}
				disposables.dispose();
			}));

			quickWidget.show();
			widget.focus();
		});
	}
}

/**
 * Split-button action view item for the run script picker in the sessions titlebar.
 * The primary button runs the pinned task, or the first task if none is pinned.
 * The dropdown arrow opens a custom action widget with categories and per-item
 * toolbar actions (pin, configure, remove).
 */
class RunScriptActionViewItem extends BaseActionViewItem {

	private readonly _primaryActionAction: Action;
	private readonly _primaryAction: ActionViewItem;
	private readonly _dropdown: ChevronActionWidgetDropdown;

	constructor(
		action: IAction,
		_options: IActionViewItemOptions,
		private readonly _activeRunState: IObservable<IRunScriptActionContext | undefined>,
		private readonly _showConfigureQuickPick: (session: ISession) => Promise<ITaskEntry | undefined>,
		private readonly _showCustomCommandInput: (session: ISession, existingTask: INonSessionTaskEntry, mode?: TaskConfigurationMode) => Promise<ITaskEntry | undefined>,
		@ICommandService private readonly _commandService: ICommandService,
		@ISessionsConfigurationService private readonly _sessionsConfigService: ISessionsConfigurationService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IActionWidgetService private readonly _actionWidgetService: IActionWidgetService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ITelemetryService telemetryService: ITelemetryService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
	) {
		super(undefined, action);

		const state = this._activeRunState.get();
		const hasTasks = state && state.tasks.length > 0;

		// Primary action button - runs the pinned task (or first task when none is pinned)
		this._primaryActionAction = this._register(new Action(
			'agentSessions.runScriptPrimary',
			this._getPrimaryActionTooltip(state),
			ThemeIcon.asClassName(Codicon.play),
			hasTasks,
			() => this._commandService.executeCommand(RUN_SCRIPT_ACTION_PRIMARY_ID)
		));
		this._primaryAction = this._register(new ActionViewItem(undefined, this._primaryActionAction, { icon: true, label: false }));

		// Update enabled state when tasks change
		this._register(autorun(reader => {
			const runState = this._activeRunState.read(reader);
			this._primaryActionAction.enabled = !!runState && runState.tasks.length > 0;
			this._primaryActionAction.label = this._getPrimaryActionTooltip(runState);
		}));

		// Dropdown with categorized actions and per-item toolbars
		const dropdownAction = this._register(new Action('agentSessions.runScriptDropdown', localize('runDropdown', "More Tasks...")));
		this._dropdown = this._register(new ChevronActionWidgetDropdown(
			dropdownAction,
			{
				actionProvider: { getActions: () => this._getDropdownActions() },
				showItemKeybindings: true,
			},
			this._actionWidgetService,
			this._keybindingService,
			contextKeyService,
			telemetryService,
		));
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('monaco-dropdown-with-default');

		// Primary action button
		const primaryContainer = $('.action-container');
		this._primaryAction.render(append(container, primaryContainer));
		this._register(addDisposableListener(primaryContainer, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.RightArrow)) {
				this._primaryAction.blur();
				this._dropdown.focus();
				event.stopPropagation();
			}
		}));

		// Dropdown arrow button
		const dropdownContainer = $('.dropdown-action-container');
		this._dropdown.render(append(container, dropdownContainer));
		this._register(addDisposableListener(dropdownContainer, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.LeftArrow)) {
				this._dropdown.setFocusable(false);
				this._primaryAction.focus();
				event.stopPropagation();
			}
		}));
	}

	override focus(fromRight?: boolean): void {
		if (fromRight) {
			this._dropdown.focus();
		} else {
			this._primaryAction.focus();
		}
	}

	override blur(): void {
		this._primaryAction.blur();
		this._dropdown.blur();
	}

	override setFocusable(focusable: boolean): void {
		this._primaryAction.setFocusable(focusable);
		this._dropdown.setFocusable(focusable);
	}

	private _getPrimaryActionTooltip(state: IRunScriptActionContext | undefined): string {
		if (!state || state.tasks.length === 0) {
			return localize('runPrimaryTaskTooltip', "Run Primary Task");
		}

		const primaryTask = getPrimaryTask(state.tasks, state.pinnedTaskLabel)?.task;
		if (!primaryTask) {
			return localize('runPrimaryTaskTooltip', "Run Primary Task");
		}

		const keybindingLabel = this._keybindingService.lookupKeybinding(RUN_SCRIPT_ACTION_PRIMARY_ID)?.getLabel();
		return keybindingLabel
			? localize('runActionTooltipKeybinding', "{0} ({1})", getTaskDisplayLabel(primaryTask), keybindingLabel)
			: getTaskDisplayLabel(primaryTask);
	}

	private _getDropdownActions(): IActionWidgetDropdownAction[] {
		const state = this._activeRunState.get();
		if (!state) {
			return [];
		}

		const { tasks, session, pinnedTaskLabel } = state;
		const repo = session.workspace.get()?.repositories[0];
		const actions: IActionWidgetDropdownAction[] = [];

		// Category for normal tasks (no header shown)
		const defaultCategory = { label: '', order: 0, showHeader: false };
		// Category for worktree-creation tasks
		const worktreeCategory = { label: localize('worktreeCreationCategory', "Run on Worktree Creation"), order: 1, showHeader: true };
		// Category for add actions
		const addCategory = { label: localize('addActionsCategory', "Add"), order: 2, showHeader: true };

		for (let i = 0; i < tasks.length; i++) {
			const entry = tasks[i];
			const task = entry.task;
			const isWorktreeTask = task.runOptions?.runOn === 'worktreeCreated';
			const isPinned = task.label === pinnedTaskLabel;

			const toolbarActions: IAction[] = [
				{
					id: `runScript.pin.${i}`,
					label: isPinned ? localize('unpinTask', "Unpin") : localize('pinTask', "Pin"),
					tooltip: isPinned ? localize('unpinTaskTooltip', "Unpin") : localize('pinTaskTooltip', "Pin"),
					class: ThemeIcon.asClassName(isPinned ? Codicon.pinned : Codicon.pin),
					enabled: !!repo?.uri,
					run: async () => {
						this._actionWidgetService.hide();
						this._sessionsConfigService.setPinnedTaskLabel(repo?.uri, isPinned ? undefined : task.label);
					}
				},
				{
					id: `runScript.configure.${i}`,
					label: localize('configureTask', "Configure"),
					tooltip: localize('configureTask', "Configure"),
					class: ThemeIcon.asClassName(Codicon.gear),
					enabled: true,
					run: async () => {
						this._actionWidgetService.hide();
						await this._showCustomCommandInput(session, { task, target: entry.target }, 'configure');
					}
				},
				{
					id: `runScript.remove.${i}`,
					label: localize('removeTask', "Remove"),
					tooltip: localize('removeTask', "Remove"),
					class: ThemeIcon.asClassName(Codicon.close),
					enabled: true,
					run: async () => {
						this._actionWidgetService.hide();
						await this._sessionsConfigService.removeTask(task.label, session, entry.target);
					}
				}
			];

			actions.push({
				id: `runScript.task.${i}`,
				label: getTaskDisplayLabel(task),
				tooltip: '',
				hover: {
					content: localize('runActionTooltip', "Run '{0}' in terminal", getTaskDisplayLabel(task)),
					position: { hoverPosition: HoverPosition.LEFT }
				},
				icon: Codicon.play,
				enabled: true,
				class: undefined,
				category: isWorktreeTask ? worktreeCategory : defaultCategory,
				toolbarActions,
				run: async () => {
					await this._sessionsConfigService.runTask(task, session);
				},
			});
		}

		// "Add Task..." action
		const canConfigure = !!(repo?.workingDirectory ?? repo?.uri);
		actions.push({
			id: 'runScript.addAction',
			label: localize('configureDefaultRunAction', "Add Task..."),
			tooltip: '',
			hover: {
				content: canConfigure
					? localize('addActionTooltip', "Add a new task")
					: localize('addActionTooltipDisabled', "Cannot add tasks to this session because workspace storage is unavailable"),
				position: { hoverPosition: HoverPosition.LEFT }
			},
			icon: Codicon.add,
			enabled: canConfigure,
			class: undefined,
			category: addCategory,
			run: async () => {
				const task = await this._showConfigureQuickPick(session);
				if (task) {
					await this._sessionsConfigService.runTask(task, session);
				}
			},
		});

		// "Generate New Task..." action
		actions.push({
			id: 'runScript.generateAction',
			label: localize('generateRunAction', "Generate New Task..."),
			tooltip: '',
			hover: {
				content: localize('generateRunActionTooltip', "Generate a new workspace task"),
				position: { hoverPosition: HoverPosition.LEFT },
			},
			icon: Codicon.sparkle,
			enabled: true,
			class: undefined,
			category: addCategory,
			run: async () => {
				await this._sessionsManagementService.sendAndCreateChat(session, { query: '/generate-run-commands' });
			},
		});

		return actions;
	}
}

/**
 * {@link ActionWidgetDropdownActionViewItem} that renders a chevron-down icon
 * as its label, used as the dropdown arrow in the split button.
 */
class ChevronActionWidgetDropdown extends ActionWidgetDropdownActionViewItem {
	protected override renderLabel(element: HTMLElement): IDisposable | null {
		element.classList.add('codicon', 'codicon-chevron-down');
		return null;
	}
}

// Register the Run split button submenu on the workbench title bar (background sessions only)
MenuRegistry.appendMenuItem(Menus.TitleBarSessionMenu, {
	submenu: RunScriptDropdownMenuId,
	isSplitButton: true,
	title: localize2('run', "Run"),
	icon: Codicon.play,
	group: 'navigation',
	order: 8,
	when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated(), IsActiveSessionBackgroundProviderContext)
});

// Disabled placeholder shown in the titlebar when the active session does not support running scripts
class RunScriptNotAvailableAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.agentSessions.runScript.notAvailable',
			title: localize2('run', "Run"),
			tooltip: localize('runScriptNotAvailableTooltip', "Run Task is not available for this session type"),
			icon: Codicon.play,
			precondition: ContextKeyExpr.false(),
			menu: [{
				id: Menus.TitleBarSessionMenu,
				group: 'navigation',
				order: 8,
				when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated(), IsActiveSessionBackgroundProviderContext.toNegated())
			}]
		});
	}

	override run(): void { }
}

registerAction2(RunScriptNotAvailableAction);

// Register F5 keybinding at module level to ensure it's in the registry
// before the keybinding resolver is cached. The command handler is
// registered later by RunScriptContribution.
KeybindingsRegistry.registerKeybindingRule({
	id: RUN_SCRIPT_ACTION_PRIMARY_ID,
	primary: KeyCode.F5,
	weight: KeybindingWeight.WorkbenchContrib + 100,
	when: IsAuxiliaryWindowContext.toNegated()
});
