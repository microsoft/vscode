/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../../base/common/arrays.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derivedOpts, IObservable } from '../../../../base/common/observable.js';
import { localize, localize2 } from '../../../../nls.js';
import { MenuId, registerAction2, Action2, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { SessionsCategories } from '../../../common/categories.js';
import { IActiveSessionItem, IsActiveSessionBackgroundProviderContext, ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { Menus } from '../../../browser/menus.js';
import { ISessionsConfigurationService, ITaskEntry, TaskStorageTarget } from './sessionsConfigurationService.js';
import { IsAuxiliaryWindowContext } from '../../../../workbench/common/contextkeys.js';
import { SessionsWelcomeVisibleContext } from '../../../common/contextkeys.js';



// Menu IDs - exported for use in auxiliary bar part
export const RunScriptDropdownMenuId = MenuId.for('AgentSessionsRunScriptDropdown');

// Action IDs
const RUN_SCRIPT_ACTION_ID = 'workbench.action.agentSessions.runScript';
const RUN_SCRIPT_ACTION_PRIMARY_ID = 'workbench.action.agentSessions.runScriptPrimary';
const CONFIGURE_DEFAULT_RUN_ACTION_ID = 'workbench.action.agentSessions.configureDefaultRunAction';

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

interface IRunScriptActionContext {
	readonly session: IActiveSessionItem;
	readonly tasks: readonly ITaskEntry[];
	readonly lastRunTaskLabel: string | undefined;
}

/**
 * Workbench contribution that adds a split dropdown action to the auxiliary bar title
 * for running a task via tasks.json.
 */
export class RunScriptContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentSessions.runScript';

	private readonly _activeRunState: IObservable<IRunScriptActionContext | undefined>;

	constructor(
		@ISessionsManagementService private readonly _activeSessionService: ISessionsManagementService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@ISessionsConfigurationService private readonly _sessionsConfigService: ISessionsConfigurationService,
	) {
		super();

		this._activeRunState = derivedOpts<IRunScriptActionContext | undefined>({
			owner: this,
			equalsFn: (a, b) => {
				if (a === b) { return true; }
				if (!a || !b) { return false; }
				return a.session === b.session
					&& a.lastRunTaskLabel === b.lastRunTaskLabel
					&& equals(a.tasks, b.tasks, (t1, t2) =>
						t1.label === t2.label && t1.command === t2.command);
			}
		}, reader => {
			const activeSession = this._activeSessionService.activeSession.read(reader);
			if (!activeSession) {
				return undefined;
			}

			const tasks = this._sessionsConfigService.getSessionTasks(activeSession).read(reader);
			const lastRunTaskLabel = this._sessionsConfigService.getLastRunTaskLabel(activeSession.repository).read(reader);
			return { session: activeSession, tasks, lastRunTaskLabel };
		}).recomputeInitiallyAndOnChange(this._store);

		this._registerActions();
	}

	private _registerActions(): void {
		const that = this;

		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: RUN_SCRIPT_ACTION_PRIMARY_ID,
					title: { value: localize('runPrimaryScript', 'Run Primary Script'), original: 'Run Primary Script' },
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

				const { tasks, session, lastRunTaskLabel } = activeState;
				if (tasks.length === 0) {
					const task = await that._showConfigureQuickPick(session);
					if (task) {
						await that._sessionsConfigService.runTask(task, session);
					}
					return;
				}

				const mruIndex = lastRunTaskLabel !== undefined
					? tasks.findIndex(t => t.label === lastRunTaskLabel)
					: -1;
				const primaryTask = tasks[mruIndex >= 0 ? mruIndex : 0];
				await that._sessionsConfigService.runTask(primaryTask, session);
			}
		}));

		this._register(autorun(reader => {
			const activeState = this._activeRunState.read(reader);
			if (!activeState) {
				return;
			}

			const { tasks, session, lastRunTaskLabel } = activeState;
			const configureScriptPrecondition = session.worktree ?? session.repository ? ContextKeyExpr.true() : ContextKeyExpr.false();

			const mruIndex = lastRunTaskLabel !== undefined
				? tasks.findIndex(t => t.label === lastRunTaskLabel)
				: -1;

			if (tasks.length > 0) {
				// Register an action for each session task
				for (let i = 0; i < tasks.length; i++) {
					const task = tasks[i];
					const actionId = `${RUN_SCRIPT_ACTION_ID}.${i}`;
					const isPrimary = i === (mruIndex >= 0 ? mruIndex : 0);

					reader.store.add(registerAction2(class extends Action2 {
						constructor() {
							super({
								id: actionId,
								title: getTaskDisplayLabel(task),
								tooltip: !isPrimary ? localize('runActionTooltip', "Run '{0}' in terminal", getTaskDisplayLabel(task))
									: localize('runActionTooltipKeybinding', "Run '{0}' in terminal ({1})", getTaskDisplayLabel(task), that._keybindingService.lookupKeybinding(RUN_SCRIPT_ACTION_PRIMARY_ID)?.getLabel() ?? ''),
								icon: Codicon.play,
								category: SessionsCategories.Sessions,
								menu: [{
									id: RunScriptDropdownMenuId,
									group: '0_scripts',
									order: i === mruIndex ? -1 : i,
								}]
							});
						}

						async run(): Promise<void> {
							await that._sessionsConfigService.runTask(task, session);
						}
					}));
				}
			}

			// Configure run action (always shown in dropdown)
			reader.store.add(registerAction2(class extends Action2 {
				constructor() {
					super({
						id: CONFIGURE_DEFAULT_RUN_ACTION_ID,
						title: localize2('configureDefaultRunAction', "Add Run Action..."),
						category: SessionsCategories.Sessions,
						icon: Codicon.play,
						precondition: configureScriptPrecondition,
						menu: [{
							id: RunScriptDropdownMenuId,
							group: tasks.length === 0 ? 'navigation' : '1_configure',
							order: 0
						}]
					});
				}

				async run(): Promise<void> {
					const task = await that._showConfigureQuickPick(session);
					if (task) {
						await that._sessionsConfigService.runTask(task, session);
					}
				}
			}));
		}));
	}

	private async _showConfigureQuickPick(session: IActiveSessionItem): Promise<ITaskEntry | undefined> {
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
			label: localize('enterCustomCommand', "Enter Custom Command..."),
			description: localize('enterCustomCommandDesc', "Create a new shell task"),
		});

		if (nonSessionTasks.length > 0) {
			items.push({ type: 'separator', label: localize('existingTasks', "Existing Tasks") });
			for (const task of nonSessionTasks) {
				items.push({
					label: getTaskDisplayLabel(task),
					description: task.command,
					task,
					source: 'workspace',
				});
			}
		}

		const picked = await this._quickInputService.pick(items, {
			placeHolder: localize('pickRunAction', "Select a task or enter a custom command"),
		});

		if (!picked) {
			return undefined;
		}

		const pickedItem = picked as ITaskPickItem;
		if (pickedItem.task) {
			// Existing task — set inSessions: true
			await this._sessionsConfigService.addTaskToSessions(pickedItem.task, session, pickedItem.source ?? 'workspace');
			return pickedItem.task;
		} else {
			// Custom command path
			return this._showCustomCommandInput(session);
		}
	}

	private async _showCustomCommandInput(session: IActiveSessionItem): Promise<ITaskEntry | undefined> {
		const command = await this._quickInputService.input({
			placeHolder: localize('enterCommandPlaceholder', "Enter command (e.g., npm run dev)"),
			prompt: localize('enterCommandPrompt', "This command will be run as a task in the integrated terminal")
		});

		if (!command) {
			return undefined;
		}

		const target = await this._pickStorageTarget(session);
		if (!target) {
			return undefined;
		}

		return this._sessionsConfigService.createAndAddTask(command, session, target);
	}

	private async _pickStorageTarget(session: IActiveSessionItem): Promise<TaskStorageTarget | undefined> {
		const hasWorktree = !!session.worktree;
		const hasRepository = !!session.repository;

		interface IStorageTargetItem extends IQuickPickItem {
			target: TaskStorageTarget;
		}

		const items: IStorageTargetItem[] = [
			{
				target: 'user',
				label: localize('storeInUserSettings', "User Settings"),
				description: localize('storeInUserSettingsDesc', "Available in all sessions"),
			},
			hasWorktree ? {
				target: 'workspace',
				label: localize('storeInWorkspaceWorktreeSettings', "Workspace (Worktree)"),
				description: localize('storeInWorkspaceWorktreeSettingsDesc', "Stored in session worktree"),
			} : hasRepository ? {
				target: 'workspace',
				label: localize('storeInWorkspaceSettings', "Workspace"),
				description: localize('storeInWorkspace', "Stored in the workspace"),
			} : {
				target: 'workspace',
				label: localize('storeInWorkspaceSettingsDisable', "Workspace Unavailable"),
				description: localize('storeInWorkspaceDisabled', "Stored in the workspace Unavailable"),
				disabled: true,
				italic: true,
			}
		];

		return new Promise<TaskStorageTarget | undefined>(resolve => {
			const picker = this._quickInputService.createQuickPick<IStorageTargetItem>({ useSeparators: true });
			picker.placeholder = localize('pickStorageTarget', "Where should this action be saved?");
			picker.items = items;

			picker.onDidAccept(() => {
				const selected = picker.activeItems[0];
				if (selected && (selected.target !== 'workspace' || hasWorktree)) {
					resolve(selected.target);
					picker.dispose();
				}
			});
			picker.onDidHide(() => {
				resolve(undefined);
				picker.dispose();
			});
			picker.show();
		});
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
			tooltip: localize('runScriptNotAvailableTooltip', "Run Script is not available for this session type"),
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
