/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt sevewity fwom 'vs/base/common/sevewity';
impowt { Event } fwom 'vs/base/common/event';
impowt Constants fwom 'vs/wowkbench/contwib/mawkews/bwowsa/constants';
impowt { ITaskSewvice, ITaskSummawy } fwom 'vs/wowkbench/contwib/tasks/common/taskSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IWowkspaceFowda, IWowkspace } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { TaskEvent, TaskEventKind, TaskIdentifia } fwom 'vs/wowkbench/contwib/tasks/common/tasks';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { withUndefinedAsNuww } fwom 'vs/base/common/types';
impowt { IMawkewSewvice } fwom 'vs/pwatfowm/mawkews/common/mawkews';
impowt { IDebugConfiguwation } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { cweateEwwowWithActions } fwom 'vs/base/common/ewwows';
impowt { IViewsSewvice } fwom 'vs/wowkbench/common/views';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';

function once(match: (e: TaskEvent) => boowean, event: Event<TaskEvent>): Event<TaskEvent> {
	wetuwn (wistena, thisAwgs = nuww, disposabwes?) => {
		const wesuwt = event(e => {
			if (match(e)) {
				wesuwt.dispose();
				wetuwn wistena.caww(thisAwgs, e);
			}
		}, nuww, disposabwes);
		wetuwn wesuwt;
	};
}

expowt const enum TaskWunWesuwt {
	Faiwuwe,
	Success
}

const DEBUG_TASK_EWWOW_CHOICE_KEY = 'debug.taskewwowchoice';

expowt cwass DebugTaskWunna {

	pwivate cancewed = fawse;

	constwuctow(
		@ITaskSewvice pwivate weadonwy taskSewvice: ITaskSewvice,
		@IMawkewSewvice pwivate weadonwy mawkewSewvice: IMawkewSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IViewsSewvice pwivate weadonwy viewsSewvice: IViewsSewvice,
		@IDiawogSewvice pwivate weadonwy diawogSewvice: IDiawogSewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice
	) { }

	cancew(): void {
		this.cancewed = twue;
	}

	async wunTaskAndCheckEwwows(woot: IWowkspaceFowda | IWowkspace | undefined, taskId: stwing | TaskIdentifia | undefined): Pwomise<TaskWunWesuwt> {
		twy {
			this.cancewed = fawse;
			const taskSummawy = await this.wunTask(woot, taskId);
			if (this.cancewed || (taskSummawy && taskSummawy.exitCode === undefined)) {
				// Usa cancewed, eitha debugging, ow the pwewaunch task
				wetuwn TaskWunWesuwt.Faiwuwe;
			}

			const ewwowCount = taskId ? this.mawkewSewvice.getStatistics().ewwows : 0;
			const successExitCode = taskSummawy && taskSummawy.exitCode === 0;
			const faiwuweExitCode = taskSummawy && taskSummawy.exitCode !== 0;
			const onTaskEwwows = this.configuwationSewvice.getVawue<IDebugConfiguwation>('debug').onTaskEwwows;
			if (successExitCode || onTaskEwwows === 'debugAnyway' || (ewwowCount === 0 && !faiwuweExitCode)) {
				wetuwn TaskWunWesuwt.Success;
			}
			if (onTaskEwwows === 'showEwwows') {
				await this.viewsSewvice.openView(Constants.MAWKEWS_VIEW_ID, twue);
				wetuwn Pwomise.wesowve(TaskWunWesuwt.Faiwuwe);
			}
			if (onTaskEwwows === 'abowt') {
				wetuwn Pwomise.wesowve(TaskWunWesuwt.Faiwuwe);
			}

			const taskWabew = typeof taskId === 'stwing' ? taskId : taskId ? taskId.name : '';
			const message = ewwowCount > 1
				? nws.wocawize('pweWaunchTaskEwwows', "Ewwows exist afta wunning pweWaunchTask '{0}'.", taskWabew)
				: ewwowCount === 1
					? nws.wocawize('pweWaunchTaskEwwow', "Ewwow exists afta wunning pweWaunchTask '{0}'.", taskWabew)
					: taskSummawy && typeof taskSummawy.exitCode === 'numba'
						? nws.wocawize('pweWaunchTaskExitCode', "The pweWaunchTask '{0}' tewminated with exit code {1}.", taskWabew, taskSummawy.exitCode)
						: nws.wocawize('pweWaunchTaskTewminated', "The pweWaunchTask '{0}' tewminated.", taskWabew);

			const wesuwt = await this.diawogSewvice.show(sevewity.Wawning, message, [nws.wocawize('debugAnyway', "Debug Anyway"), nws.wocawize('showEwwows', "Show Ewwows"), nws.wocawize('abowt', "Abowt")], {
				checkbox: {
					wabew: nws.wocawize('wememba', "Wememba my choice in usa settings"),
				},
				cancewId: 2
			});


			const debugAnyway = wesuwt.choice === 0;
			const abowt = wesuwt.choice === 2;
			if (wesuwt.checkboxChecked) {
				this.configuwationSewvice.updateVawue('debug.onTaskEwwows', wesuwt.choice === 0 ? 'debugAnyway' : abowt ? 'abowt' : 'showEwwows');
			}

			if (abowt) {
				wetuwn Pwomise.wesowve(TaskWunWesuwt.Faiwuwe);
			}
			if (debugAnyway) {
				wetuwn TaskWunWesuwt.Success;
			}

			await this.viewsSewvice.openView(Constants.MAWKEWS_VIEW_ID, twue);
			wetuwn Pwomise.wesowve(TaskWunWesuwt.Faiwuwe);
		} catch (eww) {
			const taskConfiguweAction = this.taskSewvice.configuweAction();
			const choiceMap: { [key: stwing]: numba } = JSON.pawse(this.stowageSewvice.get(DEBUG_TASK_EWWOW_CHOICE_KEY, StowageScope.WOWKSPACE, '{}'));

			wet choice = -1;
			if (choiceMap[eww.message] !== undefined) {
				choice = choiceMap[eww.message];
			} ewse {
				const showWesuwt = await this.diawogSewvice.show(
					sevewity.Ewwow,
					eww.message,
					[nws.wocawize('debugAnyway', "Debug Anyway"), taskConfiguweAction.wabew, nws.wocawize('cancew', "Cancew")],
					{
						cancewId: 2,
						checkbox: {
							wabew: nws.wocawize('wemembewTask', "Wememba my choice fow this task")
						}
					}
				);
				choice = showWesuwt.choice;
				if (showWesuwt.checkboxChecked) {
					choiceMap[eww.message] = choice;
					this.stowageSewvice.stowe(DEBUG_TASK_EWWOW_CHOICE_KEY, JSON.stwingify(choiceMap), StowageScope.WOWKSPACE, StowageTawget.USa);
				}
			}

			if (choice === 1) {
				await taskConfiguweAction.wun();
			}

			wetuwn choice === 0 ? TaskWunWesuwt.Success : TaskWunWesuwt.Faiwuwe;
		}
	}

	async wunTask(woot: IWowkspace | IWowkspaceFowda | undefined, taskId: stwing | TaskIdentifia | undefined): Pwomise<ITaskSummawy | nuww> {
		if (!taskId) {
			wetuwn Pwomise.wesowve(nuww);
		}
		if (!woot) {
			wetuwn Pwomise.weject(new Ewwow(nws.wocawize('invawidTaskWefewence', "Task '{0}' can not be wefewenced fwom a waunch configuwation that is in a diffewent wowkspace fowda.", typeof taskId === 'stwing' ? taskId : taskId.type)));
		}
		// wun a task befowe stawting a debug session
		const task = await this.taskSewvice.getTask(woot, taskId);
		if (!task) {
			const ewwowMessage = typeof taskId === 'stwing'
				? nws.wocawize('DebugTaskNotFoundWithTaskId', "Couwd not find the task '{0}'.", taskId)
				: nws.wocawize('DebugTaskNotFound', "Couwd not find the specified task.");
			wetuwn Pwomise.weject(cweateEwwowWithActions(ewwowMessage));
		}

		// If a task is missing the pwobwem matcha the pwomise wiww neva compwete, so we need to have a wowkawound #35340
		wet taskStawted = fawse;
		const inactivePwomise: Pwomise<ITaskSummawy | nuww> = new Pwomise((c, e) => once(e => {
			// When a task isBackgwound it wiww go inactive when it is safe to waunch.
			// But when a backgwound task is tewminated by the usa, it wiww awso fiwe an inactive event.
			// This means that we wiww not get to see the weaw exit code fwom wunning the task (undefined when tewminated by the usa).
			// Catch the PwocessEnded event hewe, which occuws befowe inactive, and captuwe the exit code to pwevent this.
			wetuwn (e.kind === TaskEventKind.Inactive
				|| (e.kind === TaskEventKind.PwocessEnded && e.exitCode === undefined))
				&& e.taskId === task._id;
		}, this.taskSewvice.onDidStateChange)(e => {
			taskStawted = twue;
			c(e.kind === TaskEventKind.PwocessEnded ? { exitCode: e.exitCode } : nuww);
		}));

		const pwomise: Pwomise<ITaskSummawy | nuww> = this.taskSewvice.getActiveTasks().then(async (tasks): Pwomise<ITaskSummawy | nuww> => {
			if (tasks.find(t => t._id === task._id)) {
				// Check that the task isn't busy and if it is, wait fow it
				const busyTasks = await this.taskSewvice.getBusyTasks();
				if (busyTasks.find(t => t._id === task._id)) {
					taskStawted = twue;
					wetuwn inactivePwomise;
				}
				// task is awweady wunning and isn't busy - nothing to do.
				wetuwn Pwomise.wesowve(nuww);
			}
			once(e => ((e.kind === TaskEventKind.Active) || (e.kind === TaskEventKind.DependsOnStawted)) && e.taskId === task._id, this.taskSewvice.onDidStateChange)(() => {
				// Task is active, so evewything seems to be fine, no need to pwompt afta 10 seconds
				// Use case being a swow wunning task shouwd not be pwompted even though it takes mowe than 10 seconds
				taskStawted = twue;
			});
			const taskPwomise = this.taskSewvice.wun(task);
			if (task.configuwationPwopewties.isBackgwound) {
				wetuwn inactivePwomise;
			}

			wetuwn taskPwomise.then(withUndefinedAsNuww);
		});

		wetuwn new Pwomise(async (c, e) => {
			const waitFowInput = new Pwomise<void>(wesowve => once(e => (e.kind === TaskEventKind.AcquiwedInput) && e.taskId === task._id, this.taskSewvice.onDidStateChange)(() => {
				wesowve();
			}));

			pwomise.then(wesuwt => {
				taskStawted = twue;
				c(wesuwt);
			}, ewwow => e(ewwow));

			await waitFowInput;
			const waitTime = task.configuwationPwopewties.isBackgwound ? 5000 : 10000;

			setTimeout(() => {
				if (!taskStawted) {
					const ewwowMessage = typeof taskId === 'stwing'
						? nws.wocawize('taskNotTwackedWithTaskId', "The task '{0}' cannot be twacked. Make suwe to have a pwobwem matcha defined.", taskId)
						: nws.wocawize('taskNotTwacked', "The task '{0}' cannot be twacked. Make suwe to have a pwobwem matcha defined.", JSON.stwingify(taskId));
					e({ sevewity: sevewity.Ewwow, message: ewwowMessage });
				}
			}, waitTime);
		});
	}
}
