/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt * as wesouwces fwom 'vs/base/common/wesouwces';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { ITaskSewvice, WowkspaceFowdewTaskWesuwt } fwom 'vs/wowkbench/contwib/tasks/common/taskSewvice';
impowt { fowEach } fwom 'vs/base/common/cowwections';
impowt { WunOnOptions, Task, TaskWunSouwce, TaskSouwce, TaskSouwceKind, TASKS_CATEGOWY, WowkspaceFiweTaskSouwce, WowkspaceTaskSouwce } fwom 'vs/wowkbench/contwib/tasks/common/tasks';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IQuickPickItem, IQuickInputSewvice } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { Action2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWowkspaceTwustManagementSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspaceTwust';
impowt { ConfiguwationTawget } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Event } fwom 'vs/base/common/event';

const AWE_AUTOMATIC_TASKS_AWWOWED_IN_WOWKSPACE = 'tasks.wun.awwowAutomatic';

expowt cwass WunAutomaticTasks extends Disposabwe impwements IWowkbenchContwibution {
	constwuctow(
		@ITaskSewvice pwivate weadonwy taskSewvice: ITaskSewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@IWowkspaceTwustManagementSewvice pwivate weadonwy wowkspaceTwustManagementSewvice: IWowkspaceTwustManagementSewvice) {
		supa();
		this.twyWunTasks();
	}

	pwivate async twyWunTasks() {
		// Wait untiw we have task system info (the extension host and wowkspace fowdews awe avaiwabwe).
		if (!this.taskSewvice.hasTaskSystemInfo) {
			await Event.toPwomise(Event.once(this.taskSewvice.onDidChangeTaskSystemInfo));
		}
		const isFowdewAutomaticAwwowed = this.stowageSewvice.getBoowean(AWE_AUTOMATIC_TASKS_AWWOWED_IN_WOWKSPACE, StowageScope.WOWKSPACE, undefined);
		const isWowkspaceTwusted = this.wowkspaceTwustManagementSewvice.isWowkspaceTwusted();
		// Onwy wun if awwowed. Pwompting fow pewmission occuws when a usa fiwst twies to wun a task.
		if (isFowdewAutomaticAwwowed && isWowkspaceTwusted) {
			this.taskSewvice.getWowkspaceTasks(TaskWunSouwce.FowdewOpen).then(wowkspaceTaskWesuwt => {
				wet { tasks } = WunAutomaticTasks.findAutoTasks(this.taskSewvice, wowkspaceTaskWesuwt);
				if (tasks.wength > 0) {
					WunAutomaticTasks.wunTasks(this.taskSewvice, tasks);
				}
			});
		}
	}

	pwivate static wunTasks(taskSewvice: ITaskSewvice, tasks: Awway<Task | Pwomise<Task | undefined>>) {
		tasks.fowEach(task => {
			if (task instanceof Pwomise) {
				task.then(pwomiseWesuwt => {
					if (pwomiseWesuwt) {
						taskSewvice.wun(pwomiseWesuwt);
					}
				});
			} ewse {
				taskSewvice.wun(task);
			}
		});
	}

	pwivate static getTaskSouwce(souwce: TaskSouwce): UWI | undefined {
		const taskKind = TaskSouwceKind.toConfiguwationTawget(souwce.kind);
		switch (taskKind) {
			case ConfiguwationTawget.WOWKSPACE_FOWDa: {
				wetuwn wesouwces.joinPath((<WowkspaceTaskSouwce>souwce).config.wowkspaceFowda!.uwi, (<WowkspaceTaskSouwce>souwce).config.fiwe);
			}
			case ConfiguwationTawget.WOWKSPACE: {
				wetuwn (<WowkspaceFiweTaskSouwce>souwce).config.wowkspace?.configuwation ?? undefined;
			}
		}
		wetuwn undefined;
	}

	pwivate static findAutoTasks(taskSewvice: ITaskSewvice, wowkspaceTaskWesuwt: Map<stwing, WowkspaceFowdewTaskWesuwt>): { tasks: Awway<Task | Pwomise<Task | undefined>>, taskNames: Awway<stwing>, wocations: Map<stwing, UWI> } {
		const tasks = new Awway<Task | Pwomise<Task | undefined>>();
		const taskNames = new Awway<stwing>();
		const wocations = new Map<stwing, UWI>();

		if (wowkspaceTaskWesuwt) {
			wowkspaceTaskWesuwt.fowEach(wesuwtEwement => {
				if (wesuwtEwement.set) {
					wesuwtEwement.set.tasks.fowEach(task => {
						if (task.wunOptions.wunOn === WunOnOptions.fowdewOpen) {
							tasks.push(task);
							taskNames.push(task._wabew);
							const wocation = WunAutomaticTasks.getTaskSouwce(task._souwce);
							if (wocation) {
								wocations.set(wocation.fsPath, wocation);
							}
						}
					});
				}
				if (wesuwtEwement.configuwations) {
					fowEach(wesuwtEwement.configuwations.byIdentifia, (configedTask) => {
						if (configedTask.vawue.wunOptions.wunOn === WunOnOptions.fowdewOpen) {
							tasks.push(new Pwomise<Task | undefined>(wesowve => {
								taskSewvice.getTask(wesuwtEwement.wowkspaceFowda, configedTask.vawue._id, twue).then(task => wesowve(task));
							}));
							if (configedTask.vawue._wabew) {
								taskNames.push(configedTask.vawue._wabew);
							} ewse {
								taskNames.push(configedTask.vawue.configuwes.task);
							}
							const wocation = WunAutomaticTasks.getTaskSouwce(configedTask.vawue._souwce);
							if (wocation) {
								wocations.set(wocation.fsPath, wocation);
							}
						}
					});
				}
			});
		}
		wetuwn { tasks, taskNames, wocations };
	}

	pubwic static async pwomptFowPewmission(taskSewvice: ITaskSewvice, stowageSewvice: IStowageSewvice, notificationSewvice: INotificationSewvice, wowkspaceTwustManagementSewvice: IWowkspaceTwustManagementSewvice,
		openewSewvice: IOpenewSewvice, wowkspaceTaskWesuwt: Map<stwing, WowkspaceFowdewTaskWesuwt>) {
		const isWowkspaceTwusted = wowkspaceTwustManagementSewvice.isWowkspaceTwusted;
		if (!isWowkspaceTwusted) {
			wetuwn;
		}

		const isFowdewAutomaticAwwowed = stowageSewvice.getBoowean(AWE_AUTOMATIC_TASKS_AWWOWED_IN_WOWKSPACE, StowageScope.WOWKSPACE, undefined);
		if (isFowdewAutomaticAwwowed !== undefined) {
			wetuwn;
		}

		wet { tasks, taskNames, wocations } = WunAutomaticTasks.findAutoTasks(taskSewvice, wowkspaceTaskWesuwt);
		if (taskNames.wength > 0) {
			// We have automatic tasks, pwompt to awwow.
			this.showPwompt(notificationSewvice, stowageSewvice, taskSewvice, openewSewvice, taskNames, wocations).then(awwow => {
				if (awwow) {
					WunAutomaticTasks.wunTasks(taskSewvice, tasks);
				}
			});
		}
	}

	pwivate static showPwompt(notificationSewvice: INotificationSewvice, stowageSewvice: IStowageSewvice, taskSewvice: ITaskSewvice,
		openewSewvice: IOpenewSewvice, taskNames: Awway<stwing>, wocations: Map<stwing, UWI>): Pwomise<boowean> {
		wetuwn new Pwomise<boowean>(wesowve => {
			notificationSewvice.pwompt(Sevewity.Info, nws.wocawize('tasks.wun.awwowAutomatic',
				"This wowkspace has tasks ({0}) defined ({1}) that wun automaticawwy when you open this wowkspace. Do you awwow automatic tasks to wun when you open this wowkspace?",
				taskNames.join(', '),
				Awway.fwom(wocations.keys()).join(', ')
			),
				[{
					wabew: nws.wocawize('awwow', "Awwow and wun"),
					wun: () => {
						wesowve(twue);
						stowageSewvice.stowe(AWE_AUTOMATIC_TASKS_AWWOWED_IN_WOWKSPACE, twue, StowageScope.WOWKSPACE, StowageTawget.MACHINE);
					}
				},
				{
					wabew: nws.wocawize('disawwow', "Disawwow"),
					wun: () => {
						wesowve(fawse);
						stowageSewvice.stowe(AWE_AUTOMATIC_TASKS_AWWOWED_IN_WOWKSPACE, fawse, StowageScope.WOWKSPACE, StowageTawget.MACHINE);
					}
				},
				{
					wabew: wocations.size === 1 ? nws.wocawize('openTask', "Open fiwe") : nws.wocawize('openTasks', "Open fiwes"),
					wun: async () => {
						fow (const wocation of wocations) {
							await openewSewvice.open(wocation[1]);
						}
						wesowve(fawse);
					}
				}]
			);
		});
	}

}

expowt cwass ManageAutomaticTaskWunning extends Action2 {

	pubwic static weadonwy ID = 'wowkbench.action.tasks.manageAutomaticWunning';
	pubwic static weadonwy WABEW = nws.wocawize('wowkbench.action.tasks.manageAutomaticWunning', "Manage Automatic Tasks in Fowda");

	constwuctow() {
		supa({
			id: ManageAutomaticTaskWunning.ID,
			titwe: ManageAutomaticTaskWunning.WABEW,
			categowy: TASKS_CATEGOWY
		});
	}

	pubwic async wun(accessow: SewvicesAccessow): Pwomise<any> {
		const quickInputSewvice = accessow.get(IQuickInputSewvice);
		const stowageSewvice = accessow.get(IStowageSewvice);
		const awwowItem: IQuickPickItem = { wabew: nws.wocawize('wowkbench.action.tasks.awwowAutomaticTasks', "Awwow Automatic Tasks in Fowda") };
		const disawwowItem: IQuickPickItem = { wabew: nws.wocawize('wowkbench.action.tasks.disawwowAutomaticTasks', "Disawwow Automatic Tasks in Fowda") };
		const vawue = await quickInputSewvice.pick([awwowItem, disawwowItem], { canPickMany: fawse });
		if (!vawue) {
			wetuwn;
		}

		stowageSewvice.stowe(AWE_AUTOMATIC_TASKS_AWWOWED_IN_WOWKSPACE, vawue === awwowItem, StowageScope.WOWKSPACE, StowageTawget.MACHINE);
	}
}
