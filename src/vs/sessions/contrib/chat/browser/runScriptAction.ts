/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../../base/common/arrays.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derivedOpts, IObservable } from '../../../../base/common/observable.js';
import { localize, localize2 } from '../../../../nls.js';
import { MenuId, registerAction2, Action2, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { SessionsCategories } from '../../../common/categories.js';
import { IActiveSessionItem, ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { Menus } from '../../../browser/menus.js';
import { ISessionsConfigurationService, ITaskEntry, TaskStorageTarget } from './sessionsConfigurationService.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IsAuxiliaryWindowContext } from '../../../../workbench/common/contextkeys.js';



// Menu IDs - exported for use in auxiliary bar part
export const RunScriptDropdownMenuId = MenuId.for('AgentSessionsRunScriptDropdown');

// Action IDs
const RUN_SCRIPT_ACTION_ID = 'workbench.action.agentSessions.runScript';
const CONFIGURE_DEFAULT_RUN_ACTION_ID = 'workbench.action.agentSessions.configureDefaultRunAction';

function getTaskDisplayLabel(task: ITaskEntry): string {
	return task.label || (task['script'] as string | undefined) || (task['task'] as string | undefined) || '';
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

		this._register(autorun(reader => {
			const activeState = this._activeRunState.read(reader);
			if (!activeState) {
				return;
			}

			const { tasks, session, lastRunTaskLabel } = activeState;
			const configureScriptPrecondition = session.worktree ? ContextKeyExpr.true() : ContextKeyExpr.false();
			const addRunActionDisabledTooltip = session.worktree ? undefined : localize('configureScriptTooltipDisabled', "Actions can not be added in empty sessions");

			const mruIndex = lastRunTaskLabel !== undefined
				? tasks.findIndex(t => t.label === lastRunTaskLabel)
				: -1;

			if (tasks.length > 0) {
				// Register an action for each session task
				for (let i = 0; i < tasks.length; i++) {
					const task = tasks[i];
					const actionId = `${RUN_SCRIPT_ACTION_ID}.${i}`;

					reader.store.add(registerAction2(class extends Action2 {
						constructor() {
							super({
								id: actionId,
								title: getTaskDisplayLabel(task),
								tooltip: localize('runActionTooltip', "Run '{0}' in terminal", getTaskDisplayLabel(task)),
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
						tooltip: addRunActionDisabledTooltip,
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
					await that._showConfigureQuickPick(session);
				}
			}));
		}));
	}

	private async _showConfigureQuickPick(session: IActiveSessionItem): Promise<void> {
		const nonSessionTasks = await this._sessionsConfigService.getNonSessionTasks(session);

		interface ITaskPickItem extends IQuickPickItem {
			readonly task?: ITaskEntry;
			readonly source?: TaskStorageTarget;
		}

		const items: (ITaskPickItem | IQuickPickSeparator)[] = [];

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

		items.push({ type: 'separator', label: localize('custom', "Custom") });
		items.push({
			label: localize('enterCustomCommand', "Enter Custom Command..."),
			description: localize('enterCustomCommandDesc', "Create a new shell task"),
		});

		const picked = await this._quickInputService.pick(items, {
			placeHolder: localize('pickRunAction', "Select a task or enter a custom command"),
		});

		if (!picked) {
			return;
		}

		const pickedItem = picked as ITaskPickItem;
		if (pickedItem.task) {
			// Existing task — set inSessions: true
			await this._sessionsConfigService.addTaskToSessions(pickedItem.task, session, pickedItem.source ?? 'workspace');
		} else {
			// Custom command path
			await this._showCustomCommandInput(session);
		}
	}

	private async _showCustomCommandInput(session: IActiveSessionItem): Promise<void> {
		const command = await this._quickInputService.input({
			placeHolder: localize('enterCommandPlaceholder', "Enter command (e.g., npm run dev)"),
			prompt: localize('enterCommandPrompt', "This command will be run as a task in the integrated terminal")
		});

		if (!command) {
			return;
		}

		const target = await this._pickStorageTarget(session);
		if (!target) {
			return;
		}

		await this._sessionsConfigService.createAndAddTask(command, session, target);
	}

	private async _pickStorageTarget(session: IActiveSessionItem): Promise<TaskStorageTarget | undefined> {
		const hasWorktree = !!session.worktree;

		interface IStorageTargetItem extends IQuickPickItem {
			target: TaskStorageTarget;
		}

		const items: IStorageTargetItem[] = [
			{
				target: 'user',
				label: localize('storeInUserSettings', "User Settings"),
				description: localize('storeInUserSettingsDesc', "Available in all sessions"),
			},
			{
				target: 'workspace',
				label: localize('storeInWorkspaceSettings', "Workspace Settings"),
				description: hasWorktree
					? localize('storeInWorkspaceSettingsDesc', "Stored in session worktree")
					: localize('storeInWorkspaceSettingsDisabled', "Not available in empty sessions"),
				italic: !hasWorktree,
				disabled: !hasWorktree,
			},
		];

		return new Promise<TaskStorageTarget | undefined>(resolve => {
			const picker = this._quickInputService.createQuickPick<IStorageTargetItem>({ useSeparators: true });
			picker.placeholder = localize('pickStorageTarget', "Where should this action be saved?");
			picker.items = items;

			picker.onDidAccept(() => {
				const selected = picker.activeItems[0];
				if (selected && (selected.target !== 'workspace' || hasWorktree)) {
					picker.dispose();
					resolve(selected.target);
				}
			});
			picker.onDidHide(() => {
				picker.dispose();
				resolve(undefined);
			});
			picker.show();
		});
	}
}

// Register the Run split button submenu on the workbench title bar
MenuRegistry.appendMenuItem(Menus.TitleBarRight, {
	submenu: RunScriptDropdownMenuId,
	isSplitButton: true,
	title: localize2('run', "Run"),
	icon: Codicon.play,
	group: 'navigation',
	order: 8,
	when: IsAuxiliaryWindowContext.toNegated()
});
