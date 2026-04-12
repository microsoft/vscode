/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { $, addDisposableListener, append, EventType } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { ActionViewItem, BaseActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Action } from '../../../../base/common/actions.js';
import { equals } from '../../../../base/common/arrays.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, derivedOpts } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../nls.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { ActionWidgetDropdownActionViewItem } from '../../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js';
import { MenuId, registerAction2, Action2, MenuRegistry, SubmenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { KeybindingsRegistry } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { logSessionsInteraction } from '../../../common/sessionsTelemetry.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { SessionsCategories } from '../../../common/categories.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { IsActiveSessionBackgroundProviderContext, SessionsWelcomeVisibleContext } from '../../../common/contextkeys.js';
import { Menus } from '../../../browser/menus.js';
import { ISessionsConfigurationService } from './sessionsConfigurationService.js';
import { IsAuxiliaryWindowContext } from '../../../../workbench/common/contextkeys.js';
import { RunScriptCustomTaskWidget } from './runScriptCustomTaskWidget.js';
// Menu IDs - exported for use in auxiliary bar part
export const RunScriptDropdownMenuId = MenuId.for('AgentSessionsRunScriptDropdown');
const RUN_SCRIPT_ACTION_MODAL_VISIBLE_CLASS = 'run-script-action-modal-visible';
// Action IDs
const RUN_SCRIPT_ACTION_PRIMARY_ID = 'workbench.action.agentSessions.runScriptPrimary';
const CONFIGURE_DEFAULT_RUN_ACTION_ID = 'workbench.action.agentSessions.configureDefaultRunAction';
const GENERATE_RUN_ACTION_ID = 'workbench.action.agentSessions.generateRunAction';
const closeQuickWidgetButton = {
    iconClass: ThemeIcon.asClassName(Codicon.close),
    tooltip: localize('closeQuickWidget', "Close"),
    alwaysVisible: true,
};
function getTaskDisplayLabel(task) {
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
function getTaskCommandPreview(task) {
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
function getPrimaryTask(tasks, pinnedTaskLabel) {
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
/**
 * Workbench contribution that adds a split dropdown action to the auxiliary bar title
 * for running a task via tasks.json.
 */
let RunScriptContribution = class RunScriptContribution extends Disposable {
    static { this.ID = 'workbench.contrib.agentSessions.runScript'; }
    constructor(_sessionManagementService, _keybindingService, _quickInputService, _sessionsConfigService, _actionViewItemService, _layoutService, _telemetryService) {
        super();
        this._sessionManagementService = _sessionManagementService;
        this._quickInputService = _quickInputService;
        this._sessionsConfigService = _sessionsConfigService;
        this._actionViewItemService = _actionViewItemService;
        this._layoutService = _layoutService;
        this._telemetryService = _telemetryService;
        this._activeRunState = derivedOpts({
            owner: this,
            equalsFn: (a, b) => {
                if (a === b) {
                    return true;
                }
                if (!a || !b) {
                    return false;
                }
                return a.session === b.session
                    && a.pinnedTaskLabel === b.pinnedTaskLabel
                    && equals(a.tasks, b.tasks, (t1, t2) => t1.task.label === t2.task.label
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
    _registerActionViewItemProvider() {
        const that = this;
        this._register(this._actionViewItemService.register(Menus.TitleBarSessionMenu, RunScriptDropdownMenuId, (action, options, instantiationService) => {
            if (!(action instanceof SubmenuItemAction)) {
                return undefined;
            }
            return instantiationService.createInstance(RunScriptActionViewItem, action, options, that._activeRunState, (session) => that._showConfigureQuickPick(session), (session, existingTask, mode) => that._showCustomCommandInput(session, existingTask, mode));
        }));
    }
    _registerActions() {
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
            async run() {
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
                async run() {
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
                async run() {
                    logSessionsInteraction(that._telemetryService, 'generateNewTask');
                    await that._sessionManagementService.sendAndCreateChat(session, { query: '/generate-run-commands' });
                }
            }));
        }));
    }
    async _showConfigureQuickPick(session) {
        const nonSessionTasks = await this._sessionsConfigService.getNonSessionTasks(session);
        if (nonSessionTasks.length === 0) {
            // No existing tasks, go straight to custom command input
            return this._showCustomCommandInput(session);
        }
        const items = [];
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
        const pickedItem = picked;
        if (pickedItem.task) {
            return this._showCustomCommandInput(session, { task: pickedItem.task, target: pickedItem.source ?? 'workspace' }, 'add', true);
        }
        else {
            // Custom command path
            return this._showCustomCommandInput(session, undefined, 'add', true);
        }
    }
    async _showCustomCommandInput(session, existingTask, mode = 'add', allowBackNavigation = false) {
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
                let updatedTask = {
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
        return this._sessionsConfigService.createAndAddTask(taskConfiguration.label, taskConfiguration.command, session, taskConfiguration.target, taskConfiguration.runOn ? { runOn: taskConfiguration.runOn } : undefined);
    }
    _showCustomCommandWidget(session, existingTask, mode = 'add', allowBackNavigation = false) {
        const repo = session.workspace.get()?.repositories[0];
        const workspaceTargetDisabledReason = !(repo?.workingDirectory ?? repo?.uri)
            ? localize('workspaceStorageUnavailableTooltip', "Workspace storage is unavailable for this session")
            : undefined;
        const isConfigureMode = mode === 'configure';
        return new Promise(resolve => {
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
            const complete = (result) => {
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
};
RunScriptContribution = __decorate([
    __param(0, ISessionsManagementService),
    __param(1, IKeybindingService),
    __param(2, IQuickInputService),
    __param(3, ISessionsConfigurationService),
    __param(4, IActionViewItemService),
    __param(5, IWorkbenchLayoutService),
    __param(6, ITelemetryService)
], RunScriptContribution);
export { RunScriptContribution };
/**
 * Split-button action view item for the run script picker in the sessions titlebar.
 * The primary button runs the pinned task, or the first task if none is pinned.
 * The dropdown arrow opens a custom action widget with categories and per-item
 * toolbar actions (pin, configure, remove).
 */
let RunScriptActionViewItem = class RunScriptActionViewItem extends BaseActionViewItem {
    constructor(action, _options, _activeRunState, _showConfigureQuickPick, _showCustomCommandInput, _commandService, _sessionsConfigService, _keybindingService, _actionWidgetService, contextKeyService, telemetryService, _sessionsManagementService) {
        super(undefined, action);
        this._activeRunState = _activeRunState;
        this._showConfigureQuickPick = _showConfigureQuickPick;
        this._showCustomCommandInput = _showCustomCommandInput;
        this._commandService = _commandService;
        this._sessionsConfigService = _sessionsConfigService;
        this._keybindingService = _keybindingService;
        this._actionWidgetService = _actionWidgetService;
        this._sessionsManagementService = _sessionsManagementService;
        const state = this._activeRunState.get();
        const hasTasks = state && state.tasks.length > 0;
        // Primary action button - runs the pinned task (or first task when none is pinned)
        this._primaryActionAction = this._register(new Action('agentSessions.runScriptPrimary', this._getPrimaryActionTooltip(state), ThemeIcon.asClassName(Codicon.play), hasTasks, () => this._commandService.executeCommand(RUN_SCRIPT_ACTION_PRIMARY_ID)));
        this._primaryAction = this._register(new ActionViewItem(undefined, this._primaryActionAction, { icon: true, label: false }));
        // Update enabled state when tasks change
        this._register(autorun(reader => {
            const runState = this._activeRunState.read(reader);
            this._primaryActionAction.enabled = !!runState && runState.tasks.length > 0;
            this._primaryActionAction.label = this._getPrimaryActionTooltip(runState);
        }));
        // Dropdown with categorized task actions and per-item toolbars
        const dropdownAction = this._register(new Action('agentSessions.runScriptDropdown', localize('runDropdown', "More Tasks...")));
        this._dropdown = this._register(new ChevronActionWidgetDropdown(dropdownAction, {
            actionProvider: { getActions: () => this._getDropdownActions() },
            showItemKeybindings: true,
        }, this._actionWidgetService, this._keybindingService, contextKeyService, telemetryService));
    }
    render(container) {
        super.render(container);
        container.classList.add('monaco-dropdown-with-default');
        // Primary action button
        const primaryContainer = $('.action-container');
        this._primaryAction.render(append(container, primaryContainer));
        this._register(addDisposableListener(primaryContainer, EventType.KEY_DOWN, (e) => {
            const event = new StandardKeyboardEvent(e);
            if (event.equals(17 /* KeyCode.RightArrow */)) {
                this._primaryAction.blur();
                this._dropdown.focus();
                event.stopPropagation();
            }
        }));
        // Dropdown arrow button
        const dropdownContainer = $('.dropdown-action-container');
        this._dropdown.render(append(container, dropdownContainer));
        this._register(addDisposableListener(dropdownContainer, EventType.KEY_DOWN, (e) => {
            const event = new StandardKeyboardEvent(e);
            if (event.equals(15 /* KeyCode.LeftArrow */)) {
                this._dropdown.setFocusable(false);
                this._primaryAction.focus();
                event.stopPropagation();
            }
        }));
    }
    focus(fromRight) {
        if (fromRight) {
            this._dropdown.focus();
        }
        else {
            this._primaryAction.focus();
        }
    }
    blur() {
        this._primaryAction.blur();
        this._dropdown.blur();
    }
    setFocusable(focusable) {
        this._primaryAction.setFocusable(focusable);
        this._dropdown.setFocusable(focusable);
    }
    _getPrimaryActionTooltip(state) {
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
    _getDropdownActions() {
        const state = this._activeRunState.get();
        if (!state) {
            return [];
        }
        const { tasks, session, pinnedTaskLabel } = state;
        const repo = session.workspace.get()?.repositories[0];
        const actions = [];
        // Category for normal tasks (no header shown)
        const defaultCategory = { label: '', order: 0, showHeader: false };
        // Category for worktree-creation tasks
        const worktreeCategory = { label: localize('worktreeCreationCategory', "Run on Worktree Creation"), order: 1, showHeader: true };
        // Category for task creation and management
        const tasksCategory = { label: localize('tasksActionsCategory', "Tasks"), order: 2, showHeader: true };
        for (let i = 0; i < tasks.length; i++) {
            const entry = tasks[i];
            const task = entry.task;
            const isWorktreeTask = task.runOptions?.runOn === 'worktreeCreated';
            const isPinned = task.label === pinnedTaskLabel;
            const toolbarActions = [
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
                    position: { hoverPosition: 0 /* HoverPosition.LEFT */ }
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
                position: { hoverPosition: 0 /* HoverPosition.LEFT */ }
            },
            icon: Codicon.add,
            enabled: canConfigure,
            class: undefined,
            category: tasksCategory,
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
                position: { hoverPosition: 0 /* HoverPosition.LEFT */ },
            },
            icon: Codicon.sparkle,
            enabled: true,
            class: undefined,
            category: tasksCategory,
            run: async () => {
                await this._sessionsManagementService.sendAndCreateChat(session, { query: '/generate-run-commands' });
            },
        });
        return actions;
    }
};
RunScriptActionViewItem = __decorate([
    __param(5, ICommandService),
    __param(6, ISessionsConfigurationService),
    __param(7, IKeybindingService),
    __param(8, IActionWidgetService),
    __param(9, IContextKeyService),
    __param(10, ITelemetryService),
    __param(11, ISessionsManagementService)
], RunScriptActionViewItem);
/**
 * {@link ActionWidgetDropdownActionViewItem} that renders a chevron-down icon
 * for the split button dropdown in the titlebar.
 */
class ChevronActionWidgetDropdown extends ActionWidgetDropdownActionViewItem {
    renderLabel(element) {
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
    run() { }
}
registerAction2(RunScriptNotAvailableAction);
// Register F5 keybinding at module level to ensure it's in the registry
// before the keybinding resolver is cached. The command handler is
// registered later by RunScriptContribution.
KeybindingsRegistry.registerKeybindingRule({
    id: RUN_SCRIPT_ACTION_PRIMARY_ID,
    primary: 63 /* KeyCode.F5 */,
    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 100,
    when: IsAuxiliaryWindowContext.toNegated()
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicnVuU2NyaXB0QWN0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvY29udHJpYi9jaGF0L2Jyb3dzZXIvcnVuU2NyaXB0QWN0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxDQUFDLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzlGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxjQUFjLEVBQUUsa0JBQWtCLEVBQTBCLE1BQU0sMERBQTBELENBQUM7QUFDdEksT0FBTyxFQUFFLE1BQU0sRUFBVyxNQUFNLG9DQUFvQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMzRCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFOUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQWUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLFdBQVcsRUFBZSxNQUFNLHVDQUF1QyxDQUFDO0FBQzFGLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3pELE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxrQ0FBa0MsRUFBRSxNQUFNLDRFQUE0RSxDQUFDO0FBQ2hJLE9BQU8sRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBRSxZQUFZLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNuSSxPQUFP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