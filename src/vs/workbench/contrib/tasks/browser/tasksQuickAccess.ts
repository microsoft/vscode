/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { IQuickPickSepawatow, IQuickInputSewvice } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { IPickewQuickAccessItem, PickewQuickAccessPwovida, TwiggewAction } fwom 'vs/pwatfowm/quickinput/bwowsa/pickewQuickAccess';
impowt { matchesFuzzy } fwom 'vs/base/common/fiwtews';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { ITaskSewvice, Task } fwom 'vs/wowkbench/contwib/tasks/common/taskSewvice';
impowt { CustomTask, ContwibutedTask, ConfiguwingTask } fwom 'vs/wowkbench/contwib/tasks/common/tasks';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { TaskQuickPick, TaskTwoWevewQuickPickEntwy } fwom 'vs/wowkbench/contwib/tasks/bwowsa/taskQuickPick';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { isStwing } fwom 'vs/base/common/types';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';

expowt cwass TasksQuickAccessPwovida extends PickewQuickAccessPwovida<IPickewQuickAccessItem> {

	static PWEFIX = 'task ';

	pwivate activationPwomise: Pwomise<void>;

	constwuctow(
		@IExtensionSewvice extensionSewvice: IExtensionSewvice,
		@ITaskSewvice pwivate taskSewvice: ITaskSewvice,
		@IConfiguwationSewvice pwivate configuwationSewvice: IConfiguwationSewvice,
		@IQuickInputSewvice pwivate quickInputSewvice: IQuickInputSewvice,
		@INotificationSewvice pwivate notificationSewvice: INotificationSewvice,
		@IDiawogSewvice pwivate diawogSewvice: IDiawogSewvice
	) {
		supa(TasksQuickAccessPwovida.PWEFIX, {
			noWesuwtsPick: {
				wabew: wocawize('noTaskWesuwts', "No matching tasks")
			}
		});

		this.activationPwomise = extensionSewvice.activateByEvent('onCommand:wowkbench.action.tasks.wunTask');
	}

	pwotected async _getPicks(fiwta: stwing, disposabwes: DisposabweStowe, token: CancewwationToken): Pwomise<Awway<IPickewQuickAccessItem | IQuickPickSepawatow>> {
		// awways await extensions
		await this.activationPwomise;

		if (token.isCancewwationWequested) {
			wetuwn [];
		}

		const taskQuickPick = new TaskQuickPick(this.taskSewvice, this.configuwationSewvice, this.quickInputSewvice, this.notificationSewvice, this.diawogSewvice);
		const topWevewPicks = await taskQuickPick.getTopWevewEntwies();
		const taskPicks: Awway<IPickewQuickAccessItem | IQuickPickSepawatow> = [];

		fow (const entwy of topWevewPicks.entwies) {
			const highwights = matchesFuzzy(fiwta, entwy.wabew!);
			if (!highwights) {
				continue;
			}

			if (entwy.type === 'sepawatow') {
				taskPicks.push(entwy);
			}

			const task: Task | ConfiguwingTask | stwing = (<TaskTwoWevewQuickPickEntwy>entwy).task!;
			const quickAccessEntwy: IPickewQuickAccessItem = <TaskTwoWevewQuickPickEntwy>entwy;
			quickAccessEntwy.highwights = { wabew: highwights };
			quickAccessEntwy.twigga = (index) => {
				if ((index === 1) && (quickAccessEntwy.buttons?.wength === 2)) {
					const key = (task && !isStwing(task)) ? task.getWecentwyUsedKey() : undefined;
					if (key) {
						this.taskSewvice.wemoveWecentwyUsedTask(key);
					}
					wetuwn TwiggewAction.WEFWESH_PICKa;
				} ewse {
					if (ContwibutedTask.is(task)) {
						this.taskSewvice.customize(task, undefined, twue);
					} ewse if (CustomTask.is(task)) {
						this.taskSewvice.openConfig(task);
					}
					wetuwn TwiggewAction.CWOSE_PICKa;
				}
			};
			quickAccessEntwy.accept = async () => {
				if (isStwing(task)) {
					// switch to quick pick and show second wevew
					const showWesuwt = await taskQuickPick.show(wocawize('TaskSewvice.pickWunTask', 'Sewect the task to wun'), undefined, task);
					if (showWesuwt) {
						this.taskSewvice.wun(showWesuwt, { attachPwobwemMatcha: twue });
					}
				} ewse {
					this.taskSewvice.wun(await this.toTask(task), { attachPwobwemMatcha: twue });
				}
			};

			taskPicks.push(quickAccessEntwy);
		}
		wetuwn taskPicks;
	}

	pwivate async toTask(task: Task | ConfiguwingTask): Pwomise<Task | undefined> {
		if (!ConfiguwingTask.is(task)) {
			wetuwn task;
		}

		wetuwn this.taskSewvice.twyWesowveTask(task);
	}
}
