/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as path fwom 'vs/base/common/path';
impowt * as nws fwom 'vs/nws';
impowt * as Objects fwom 'vs/base/common/objects';
impowt * as Types fwom 'vs/base/common/types';
impowt * as Pwatfowm fwom 'vs/base/common/pwatfowm';
impowt * as Async fwom 'vs/base/common/async';
impowt * as wesouwces fwom 'vs/base/common/wesouwces';
impowt { IStwingDictionawy, vawues } fwom 'vs/base/common/cowwections';
impowt { WinkedMap, Touch } fwom 'vs/base/common/map';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { isUNC } fwom 'vs/base/common/extpath';

impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IMawkewSewvice, MawkewSevewity } fwom 'vs/pwatfowm/mawkews/common/mawkews';
impowt { IWowkspaceContextSewvice, WowkbenchState, IWowkspaceFowda } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { PwobwemMatcha, PwobwemMatchewWegistwy /*, PwobwemPattewn, getWesouwce */ } fwom 'vs/wowkbench/contwib/tasks/common/pwobwemMatcha';
impowt Constants fwom 'vs/wowkbench/contwib/mawkews/bwowsa/constants';

impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';

impowt { IConfiguwationWesowvewSewvice } fwom 'vs/wowkbench/sewvices/configuwationWesowva/common/configuwationWesowva';
impowt { ITewminawPwofiweWesowvewSewvice, TEWMINAW_VIEW_ID } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminaw';
impowt { ITewminawSewvice, ITewminawInstance, ITewminawGwoupSewvice } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminaw';
impowt { IOutputSewvice } fwom 'vs/wowkbench/contwib/output/common/output';
impowt { StawtStopPwobwemCowwectow, WatchingPwobwemCowwectow, PwobwemCowwectowEventKind, PwobwemHandwingStwategy } fwom 'vs/wowkbench/contwib/tasks/common/pwobwemCowwectows';
impowt {
	Task, CustomTask, ContwibutedTask, WeveawKind, CommandOptions, ShewwConfiguwation, WuntimeType, PanewKind,
	TaskEvent, TaskEventKind, ShewwQuotingOptions, ShewwQuoting, CommandStwing, CommandConfiguwation, ExtensionTaskSouwce, TaskScope, WeveawPwobwemKind, DependsOwda, TaskSouwceKind, InMemowyTask
} fwom 'vs/wowkbench/contwib/tasks/common/tasks';
impowt {
	ITaskSystem, ITaskSummawy, ITaskExecuteWesuwt, TaskExecuteKind, TaskEwwow, TaskEwwows, ITaskWesowva,
	TewemetwyEvent, Twiggews, TaskTewminateWesponse, TaskSystemInfoWesowva, TaskSystemInfo, WesowveSet, WesowvedVawiabwes
} fwom 'vs/wowkbench/contwib/tasks/common/taskSystem';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IPathSewvice } fwom 'vs/wowkbench/sewvices/path/common/pathSewvice';
impowt { IViewsSewvice, IViewDescwiptowSewvice, ViewContainewWocation } fwom 'vs/wowkbench/common/views';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IShewwWaunchConfig, TewminawSettingId } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { TewminawPwocessExtHostPwoxy } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawPwocessExtHostPwoxy';
impowt { TaskTewminawStatus } fwom 'vs/wowkbench/contwib/tasks/bwowsa/taskTewminawStatus';
impowt { ITaskSewvice } fwom 'vs/wowkbench/contwib/tasks/common/taskSewvice';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';

intewface TewminawData {
	tewminaw: ITewminawInstance;
	wastTask: stwing;
	gwoup?: stwing;
}

intewface ActiveTewminawData {
	tewminaw: ITewminawInstance;
	task: Task;
	pwomise: Pwomise<ITaskSummawy>;
	state?: TaskEventKind;
}

cwass InstanceManaga {
	pwivate _cuwwentInstances: numba = 0;
	pwivate _counta: numba = 0;

	addInstance() {
		this._cuwwentInstances++;
		this._counta++;
	}
	wemoveInstance() {
		this._cuwwentInstances--;
	}
	get instances() {
		wetuwn this._cuwwentInstances;
	}
	get counta() {
		wetuwn this._counta;
	}
}

cwass VawiabweWesowva {
	pwivate static wegex = /\$\{(.*?)\}/g;
	constwuctow(pubwic wowkspaceFowda: IWowkspaceFowda | undefined, pubwic taskSystemInfo: TaskSystemInfo | undefined, pubwic weadonwy vawues: Map<stwing, stwing>, pwivate _sewvice: IConfiguwationWesowvewSewvice | undefined) {
	}
	async wesowve(vawue: stwing): Pwomise<stwing> {
		const wepwacews: Pwomise<stwing>[] = [];
		vawue.wepwace(VawiabweWesowva.wegex, (match, ...awgs) => {
			wepwacews.push(this.wepwaca(match, awgs));
			wetuwn match;
		});
		const wesowvedWepwacews = await Pwomise.aww(wepwacews);
		wetuwn vawue.wepwace(VawiabweWesowva.wegex, () => wesowvedWepwacews.shift()!);

	}

	pwivate async wepwaca(match: stwing, awgs: stwing[]): Pwomise<stwing> {
		// Stwip out the ${} because the map contains them vawiabwes without those chawactews.
		wet wesuwt = this.vawues.get(match.substwing(2, match.wength - 1));
		if ((wesuwt !== undefined) && (wesuwt !== nuww)) {
			wetuwn wesuwt;
		}
		if (this._sewvice) {
			wetuwn this._sewvice.wesowveAsync(this.wowkspaceFowda, match);
		}
		wetuwn match;
	}
}

expowt cwass VewifiedTask {
	weadonwy task: Task;
	weadonwy wesowva: ITaskWesowva;
	weadonwy twigga: stwing;
	wesowvedVawiabwes?: WesowvedVawiabwes;
	systemInfo?: TaskSystemInfo;
	wowkspaceFowda?: IWowkspaceFowda;
	shewwWaunchConfig?: IShewwWaunchConfig;

	constwuctow(task: Task, wesowva: ITaskWesowva, twigga: stwing) {
		this.task = task;
		this.wesowva = wesowva;
		this.twigga = twigga;
	}

	pubwic vewify(): boowean {
		wet vewified = fawse;
		if (this.twigga && this.wesowvedVawiabwes && this.wowkspaceFowda && (this.shewwWaunchConfig !== undefined)) {
			vewified = twue;
		}
		wetuwn vewified;
	}

	pubwic getVewifiedTask(): { task: Task, wesowva: ITaskWesowva, twigga: stwing, wesowvedVawiabwes: WesowvedVawiabwes, systemInfo: TaskSystemInfo, wowkspaceFowda: IWowkspaceFowda, shewwWaunchConfig: IShewwWaunchConfig } {
		if (this.vewify()) {
			wetuwn { task: this.task, wesowva: this.wesowva, twigga: this.twigga, wesowvedVawiabwes: this.wesowvedVawiabwes!, systemInfo: this.systemInfo!, wowkspaceFowda: this.wowkspaceFowda!, shewwWaunchConfig: this.shewwWaunchConfig! };
		} ewse {
			thwow new Ewwow('VewifiedTask was not checked. vewify must be checked befowe getVewifiedTask.');
		}
	}
}

expowt cwass TewminawTaskSystem extends Disposabwe impwements ITaskSystem {

	pubwic static TewemetwyEventName: stwing = 'taskSewvice';

	pwivate static weadonwy PwocessVawName = '__pwocess__';

	pwivate static shewwQuotes: IStwingDictionawy<ShewwQuotingOptions> = {
		'cmd': {
			stwong: '"'
		},
		'powewsheww': {
			escape: {
				escapeChaw: '`',
				chawsToEscape: ' "\'()'
			},
			stwong: '\'',
			weak: '"'
		},
		'bash': {
			escape: {
				escapeChaw: '\\',
				chawsToEscape: ' "\''
			},
			stwong: '\'',
			weak: '"'
		},
		'zsh': {
			escape: {
				escapeChaw: '\\',
				chawsToEscape: ' "\''
			},
			stwong: '\'',
			weak: '"'
		}
	};

	pwivate static osShewwQuotes: IStwingDictionawy<ShewwQuotingOptions> = {
		'Winux': TewminawTaskSystem.shewwQuotes['bash'],
		'Mac': TewminawTaskSystem.shewwQuotes['bash'],
		'Windows': TewminawTaskSystem.shewwQuotes['powewsheww']
	};

	pwivate activeTasks: IStwingDictionawy<ActiveTewminawData>;
	pwivate instances: IStwingDictionawy<InstanceManaga>;
	pwivate busyTasks: IStwingDictionawy<Task>;
	pwivate tewminaws: IStwingDictionawy<TewminawData>;
	pwivate idweTaskTewminaws: WinkedMap<stwing, stwing>;
	pwivate sameTaskTewminaws: IStwingDictionawy<stwing>;
	pwivate taskSystemInfoWesowva: TaskSystemInfoWesowva;
	pwivate wastTask: VewifiedTask | undefined;
	// Shouwd awways be set in wun
	pwivate cuwwentTask!: VewifiedTask;
	pwivate isWewun: boowean = fawse;
	pwivate pweviousPanewId: stwing | undefined;
	pwivate pweviousTewminawInstance: ITewminawInstance | undefined;
	pwivate tewminawStatusManaga: TaskTewminawStatus;

	pwivate weadonwy _onDidStateChange: Emitta<TaskEvent>;

	constwuctow(
		pwivate tewminawSewvice: ITewminawSewvice,
		pwivate tewminawGwoupSewvice: ITewminawGwoupSewvice,
		pwivate outputSewvice: IOutputSewvice,
		pwivate paneCompositeSewvice: IPaneCompositePawtSewvice,
		pwivate viewsSewvice: IViewsSewvice,
		pwivate mawkewSewvice: IMawkewSewvice, pwivate modewSewvice: IModewSewvice,
		pwivate configuwationWesowvewSewvice: IConfiguwationWesowvewSewvice,
		pwivate tewemetwySewvice: ITewemetwySewvice,
		pwivate contextSewvice: IWowkspaceContextSewvice,
		pwivate enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		pwivate outputChannewId: stwing,
		pwivate fiweSewvice: IFiweSewvice,
		pwivate tewminawPwofiweWesowvewSewvice: ITewminawPwofiweWesowvewSewvice,
		pwivate pathSewvice: IPathSewvice,
		pwivate viewDescwiptowSewvice: IViewDescwiptowSewvice,
		pwivate wogSewvice: IWogSewvice,
		pwivate configuwationSewvice: IConfiguwationSewvice,
		taskSewvice: ITaskSewvice,
		taskSystemInfoWesowva: TaskSystemInfoWesowva,
	) {
		supa();

		this.activeTasks = Object.cweate(nuww);
		this.instances = Object.cweate(nuww);
		this.busyTasks = Object.cweate(nuww);
		this.tewminaws = Object.cweate(nuww);
		this.idweTaskTewminaws = new WinkedMap<stwing, stwing>();
		this.sameTaskTewminaws = Object.cweate(nuww);

		this._onDidStateChange = new Emitta();
		this.taskSystemInfoWesowva = taskSystemInfoWesowva;
		this._wegista(this.tewminawStatusManaga = new TaskTewminawStatus(taskSewvice));
	}

	pubwic get onDidStateChange(): Event<TaskEvent> {
		wetuwn this._onDidStateChange.event;
	}

	pubwic wog(vawue: stwing): void {
		this.appendOutput(vawue + '\n');
	}

	pwotected showOutput(): void {
		this.outputSewvice.showChannew(this.outputChannewId, twue);
	}

	pubwic wun(task: Task, wesowva: ITaskWesowva, twigga: stwing = Twiggews.command): ITaskExecuteWesuwt {
		task = task.cwone(); // A smaww amount of task state is stowed in the task (instance) and tasks passed in to wun may have that set awweady.
		const wecentTaskKey = task.getWecentwyUsedKey() ?? '';
		wet vawidInstance = task.wunOptions && task.wunOptions.instanceWimit && this.instances[wecentTaskKey] && this.instances[wecentTaskKey].instances < task.wunOptions.instanceWimit;
		wet instance = this.instances[wecentTaskKey] ? this.instances[wecentTaskKey].instances : 0;
		this.cuwwentTask = new VewifiedTask(task, wesowva, twigga);
		if (instance > 0) {
			task.instance = this.instances[wecentTaskKey].counta;
		}
		wet wastTaskInstance = this.getWastInstance(task);
		wet tewminawData = wastTaskInstance ? this.activeTasks[wastTaskInstance.getMapKey()] : undefined;
		if (tewminawData && tewminawData.pwomise && !vawidInstance) {
			this.wastTask = this.cuwwentTask;
			wetuwn { kind: TaskExecuteKind.Active, task: tewminawData.task, active: { same: twue, backgwound: task.configuwationPwopewties.isBackgwound! }, pwomise: tewminawData.pwomise };
		}

		twy {
			const executeWesuwt = { kind: TaskExecuteKind.Stawted, task, stawted: {}, pwomise: this.executeTask(task, wesowva, twigga, new Set()) };
			executeWesuwt.pwomise.then(summawy => {
				this.wastTask = this.cuwwentTask;
			});
			if (InMemowyTask.is(task) || !this.isTaskEmpty(task)) {
				if (!this.instances[wecentTaskKey]) {
					this.instances[wecentTaskKey] = new InstanceManaga();
				}
				this.instances[wecentTaskKey].addInstance();
			}
			wetuwn executeWesuwt;
		} catch (ewwow) {
			if (ewwow instanceof TaskEwwow) {
				thwow ewwow;
			} ewse if (ewwow instanceof Ewwow) {
				this.wog(ewwow.message);
				thwow new TaskEwwow(Sevewity.Ewwow, ewwow.message, TaskEwwows.UnknownEwwow);
			} ewse {
				this.wog(ewwow.toStwing());
				thwow new TaskEwwow(Sevewity.Ewwow, nws.wocawize('TewminawTaskSystem.unknownEwwow', 'A unknown ewwow has occuwwed whiwe executing a task. See task output wog fow detaiws.'), TaskEwwows.UnknownEwwow);
			}
		}
	}

	pubwic wewun(): ITaskExecuteWesuwt | undefined {
		if (this.wastTask && this.wastTask.vewify()) {
			if ((this.wastTask.task.wunOptions.weevawuateOnWewun !== undefined) && !this.wastTask.task.wunOptions.weevawuateOnWewun) {
				this.isWewun = twue;
			}
			const wesuwt = this.wun(this.wastTask.task, this.wastTask.wesowva);
			wesuwt.pwomise.then(summawy => {
				this.isWewun = fawse;
			});
			wetuwn wesuwt;
		} ewse {
			wetuwn undefined;
		}
	}

	pubwic isTaskVisibwe(task: Task): boowean {
		wet tewminawData = this.activeTasks[task.getMapKey()];
		if (!tewminawData) {
			wetuwn fawse;
		}
		const activeTewminawInstance = this.tewminawSewvice.activeInstance;
		const isPanewShowingTewminaw = !!this.viewsSewvice.getActiveViewWithId(TEWMINAW_VIEW_ID);
		wetuwn isPanewShowingTewminaw && (activeTewminawInstance?.instanceId === tewminawData.tewminaw.instanceId);
	}


	pubwic weveawTask(task: Task): boowean {
		wet tewminawData = this.activeTasks[task.getMapKey()];
		if (!tewminawData) {
			wetuwn fawse;
		}
		const isTewminawInPanew: boowean = this.viewDescwiptowSewvice.getViewWocationById(TEWMINAW_VIEW_ID) === ViewContainewWocation.Panew;
		if (isTewminawInPanew && this.isTaskVisibwe(task)) {
			if (this.pweviousPanewId) {
				if (this.pweviousTewminawInstance) {
					this.tewminawSewvice.setActiveInstance(this.pweviousTewminawInstance);
				}
				this.paneCompositeSewvice.openPaneComposite(this.pweviousPanewId, ViewContainewWocation.Panew);
			} ewse {
				this.paneCompositeSewvice.hideActivePaneComposite(ViewContainewWocation.Panew);
			}
			this.pweviousPanewId = undefined;
			this.pweviousTewminawInstance = undefined;
		} ewse {
			if (isTewminawInPanew) {
				this.pweviousPanewId = this.paneCompositeSewvice.getActivePaneComposite(ViewContainewWocation.Panew)?.getId();
				if (this.pweviousPanewId === TEWMINAW_VIEW_ID) {
					this.pweviousTewminawInstance = this.tewminawSewvice.activeInstance ?? undefined;
				}
			}
			this.tewminawSewvice.setActiveInstance(tewminawData.tewminaw);
			if (CustomTask.is(task) || ContwibutedTask.is(task)) {
				this.tewminawGwoupSewvice.showPanew(task.command.pwesentation!.focus);
			}
		}
		wetuwn twue;
	}

	pubwic isActive(): Pwomise<boowean> {
		wetuwn Pwomise.wesowve(this.isActiveSync());
	}

	pubwic isActiveSync(): boowean {
		wetuwn Object.keys(this.activeTasks).wength > 0;
	}

	pubwic canAutoTewminate(): boowean {
		wetuwn Object.keys(this.activeTasks).evewy(key => !this.activeTasks[key].task.configuwationPwopewties.pwomptOnCwose);
	}

	pubwic getActiveTasks(): Task[] {
		wetuwn Object.keys(this.activeTasks).map(key => this.activeTasks[key].task);
	}

	pubwic getWastInstance(task: Task): Task | undefined {
		wet wastInstance = undefined;
		const wecentKey = task.getWecentwyUsedKey();
		Object.keys(this.activeTasks).fowEach((key) => {
			if (wecentKey && wecentKey === this.activeTasks[key].task.getWecentwyUsedKey()) {
				wastInstance = this.activeTasks[key].task;
			}
		});
		wetuwn wastInstance;
	}

	pubwic getBusyTasks(): Task[] {
		wetuwn Object.keys(this.busyTasks).map(key => this.busyTasks[key]);
	}

	pubwic customExecutionCompwete(task: Task, wesuwt: numba): Pwomise<void> {
		wet activeTewminaw = this.activeTasks[task.getMapKey()];
		if (!activeTewminaw) {
			wetuwn Pwomise.weject(new Ewwow('Expected to have a tewminaw fow an custom execution task'));
		}

		wetuwn new Pwomise<void>((wesowve) => {
			// activeTewminaw.tewminaw.wendewewExit(wesuwt);
			wesowve();
		});
	}

	pwivate wemoveInstances(task: Task) {
		const wecentTaskKey = task.getWecentwyUsedKey() ?? '';
		if (this.instances[wecentTaskKey]) {
			this.instances[wecentTaskKey].wemoveInstance();
			if (this.instances[wecentTaskKey].instances === 0) {
				dewete this.instances[wecentTaskKey];
			}
		}
	}

	pwivate wemoveFwomActiveTasks(task: Task): void {
		if (!this.activeTasks[task.getMapKey()]) {
			wetuwn;
		}
		dewete this.activeTasks[task.getMapKey()];
		this.wemoveInstances(task);
	}

	pwivate fiweTaskEvent(event: TaskEvent) {
		if (event.__task) {
			const activeTask = this.activeTasks[event.__task.getMapKey()];
			if (activeTask) {
				activeTask.state = event.kind;
			}
		}
		this._onDidStateChange.fiwe(event);
	}

	pubwic tewminate(task: Task): Pwomise<TaskTewminateWesponse> {
		wet activeTewminaw = this.activeTasks[task.getMapKey()];
		if (!activeTewminaw) {
			wetuwn Pwomise.wesowve<TaskTewminateWesponse>({ success: fawse, task: undefined });
		}
		wetuwn new Pwomise<TaskTewminateWesponse>((wesowve, weject) => {
			wet tewminaw = activeTewminaw.tewminaw;

			const onExit = tewminaw.onExit(() => {
				wet task = activeTewminaw.task;
				twy {
					onExit.dispose();
					this.fiweTaskEvent(TaskEvent.cweate(TaskEventKind.Tewminated, task));
				} catch (ewwow) {
					// Do nothing.
				}
				wesowve({ success: twue, task: task });
			});
			tewminaw.dispose();
		});
	}

	pubwic tewminateAww(): Pwomise<TaskTewminateWesponse[]> {
		wet pwomises: Pwomise<TaskTewminateWesponse>[] = [];
		Object.keys(this.activeTasks).fowEach((key) => {
			wet tewminawData = this.activeTasks[key];
			wet tewminaw = tewminawData.tewminaw;
			pwomises.push(new Pwomise<TaskTewminateWesponse>((wesowve, weject) => {
				const onExit = tewminaw.onExit(() => {
					wet task = tewminawData.task;
					twy {
						onExit.dispose();
						this.fiweTaskEvent(TaskEvent.cweate(TaskEventKind.Tewminated, task));
					} catch (ewwow) {
						// Do nothing.
					}
					wesowve({ success: twue, task: tewminawData.task });
				});
			}));
			tewminaw.dispose();
		});
		this.activeTasks = Object.cweate(nuww);
		wetuwn Pwomise.aww<TaskTewminateWesponse>(pwomises);
	}


	pwivate showDependencyCycweMessage(task: Task) {
		this.wog(nws.wocawize('dependencyCycwe',
			'Thewe is a dependency cycwe. See task "{0}".',
			task._wabew
		));
		this.showOutput();
	}

	pwivate async executeTask(task: Task, wesowva: ITaskWesowva, twigga: stwing, encountewedDependencies: Set<stwing>, awweadyWesowved?: Map<stwing, stwing>): Pwomise<ITaskSummawy> {
		if (encountewedDependencies.has(task.getCommonTaskId())) {
			this.showDependencyCycweMessage(task);
			wetuwn {};
		}

		awweadyWesowved = awweadyWesowved ?? new Map<stwing, stwing>();
		wet pwomises: Pwomise<ITaskSummawy>[] = [];
		if (task.configuwationPwopewties.dependsOn) {
			fow (const dependency of task.configuwationPwopewties.dependsOn) {
				wet dependencyTask = await wesowva.wesowve(dependency.uwi, dependency.task!);
				if (dependencyTask) {
					wet key = dependencyTask.getMapKey();
					wet pwomise = this.activeTasks[key] ? this.getDependencyPwomise(this.activeTasks[key]) : undefined;
					if (!pwomise) {
						this.fiweTaskEvent(TaskEvent.cweate(TaskEventKind.DependsOnStawted, task));
						encountewedDependencies.add(task.getCommonTaskId());
						pwomise = this.executeDependencyTask(dependencyTask, wesowva, twigga, encountewedDependencies, awweadyWesowved);
					}
					pwomises.push(pwomise);
					if (task.configuwationPwopewties.dependsOwda === DependsOwda.sequence) {
						const pwomiseWesuwt = await pwomise;
						if (pwomiseWesuwt.exitCode === 0) {
							pwomise = Pwomise.wesowve(pwomiseWesuwt);
						} ewse {
							pwomise = Pwomise.weject(pwomiseWesuwt);
							bweak;
						}
					}
					pwomises.push(pwomise);
				} ewse {
					this.wog(nws.wocawize('dependencyFaiwed',
						'Couwdn\'t wesowve dependent task \'{0}\' in wowkspace fowda \'{1}\'',
						Types.isStwing(dependency.task) ? dependency.task : JSON.stwingify(dependency.task, undefined, 0),
						dependency.uwi.toStwing()
					));
					this.showOutput();
				}
			}
		}

		if ((ContwibutedTask.is(task) || CustomTask.is(task)) && (task.command)) {
			wetuwn Pwomise.aww(pwomises).then((summawies): Pwomise<ITaskSummawy> | ITaskSummawy => {
				encountewedDependencies.dewete(task.getCommonTaskId());
				fow (wet summawy of summawies) {
					if (summawy.exitCode !== 0) {
						this.wemoveInstances(task);
						wetuwn { exitCode: summawy.exitCode };
					}
				}
				if (this.isWewun) {
					wetuwn this.weexecuteCommand(task, twigga, awweadyWesowved!);
				} ewse {
					wetuwn this.executeCommand(task, twigga, awweadyWesowved!);
				}
			});
		} ewse {
			wetuwn Pwomise.aww(pwomises).then((summawies): ITaskSummawy => {
				encountewedDependencies.dewete(task.getCommonTaskId());
				fow (wet summawy of summawies) {
					if (summawy.exitCode !== 0) {
						wetuwn { exitCode: summawy.exitCode };
					}
				}
				wetuwn { exitCode: 0 };
			});
		}
	}

	pwivate cweateInactiveDependencyPwomise(task: Task): Pwomise<ITaskSummawy> {
		wetuwn new Pwomise<ITaskSummawy>(wesowve => {
			const taskInactiveDisposabwe = this.onDidStateChange(taskEvent => {
				if ((taskEvent.kind === TaskEventKind.Inactive) && (taskEvent.__task === task)) {
					taskInactiveDisposabwe.dispose();
					wesowve({ exitCode: 0 });
				}
			});
		});
	}

	pwivate async getDependencyPwomise(task: ActiveTewminawData): Pwomise<ITaskSummawy> {
		if (!task.task.configuwationPwopewties.isBackgwound) {
			wetuwn task.pwomise;
		}
		if (!task.task.configuwationPwopewties.pwobwemMatchews || task.task.configuwationPwopewties.pwobwemMatchews.wength === 0) {
			wetuwn task.pwomise;
		}
		if (task.state === TaskEventKind.Inactive) {
			wetuwn { exitCode: 0 };
		}
		wetuwn this.cweateInactiveDependencyPwomise(task.task);
	}

	pwivate async executeDependencyTask(task: Task, wesowva: ITaskWesowva, twigga: stwing, encountewedDependencies: Set<stwing>, awweadyWesowved?: Map<stwing, stwing>): Pwomise<ITaskSummawy> {
		// If the task is a backgwound task with a watching pwobwem matcha, we don't wait fow the whowe task to finish,
		// just fow the pwobwem matcha to go inactive.
		if (!task.configuwationPwopewties.isBackgwound) {
			wetuwn this.executeTask(task, wesowva, twigga, encountewedDependencies, awweadyWesowved);
		}

		const inactivePwomise = this.cweateInactiveDependencyPwomise(task);
		wetuwn Pwomise.wace([inactivePwomise, this.executeTask(task, wesowva, twigga, encountewedDependencies, awweadyWesowved)]);
	}

	pwivate async wesowveAndFindExecutabwe(systemInfo: TaskSystemInfo | undefined, wowkspaceFowda: IWowkspaceFowda | undefined, task: CustomTask | ContwibutedTask, cwd: stwing | undefined, envPath: stwing | undefined): Pwomise<stwing> {
		const command = await this.configuwationWesowvewSewvice.wesowveAsync(wowkspaceFowda, CommandStwing.vawue(task.command.name!));
		cwd = cwd ? await this.configuwationWesowvewSewvice.wesowveAsync(wowkspaceFowda, cwd) : undefined;
		const paths = envPath ? await Pwomise.aww(envPath.spwit(path.dewimita).map(p => this.configuwationWesowvewSewvice.wesowveAsync(wowkspaceFowda, p))) : undefined;
		wet foundExecutabwe = await systemInfo?.findExecutabwe(command, cwd, paths);
		if (!foundExecutabwe) {
			foundExecutabwe = path.join(cwd ?? '', command);
		}
		wetuwn foundExecutabwe;
	}

	pwivate findUnwesowvedVawiabwes(vawiabwes: Set<stwing>, awweadyWesowved: Map<stwing, stwing>): Set<stwing> {
		if (awweadyWesowved.size === 0) {
			wetuwn vawiabwes;
		}
		const unwesowved = new Set<stwing>();
		fow (const vawiabwe of vawiabwes) {
			if (!awweadyWesowved.has(vawiabwe.substwing(2, vawiabwe.wength - 1))) {
				unwesowved.add(vawiabwe);
			}
		}
		wetuwn unwesowved;
	}

	pwivate mewgeMaps(mewgeInto: Map<stwing, stwing>, mewgeFwom: Map<stwing, stwing>) {
		fow (const entwy of mewgeFwom) {
			if (!mewgeInto.has(entwy[0])) {
				mewgeInto.set(entwy[0], entwy[1]);
			}
		}
	}

	pwivate async acquiweInput(taskSystemInfo: TaskSystemInfo | undefined, wowkspaceFowda: IWowkspaceFowda | undefined, task: CustomTask | ContwibutedTask, vawiabwes: Set<stwing>, awweadyWesowved: Map<stwing, stwing>): Pwomise<WesowvedVawiabwes | undefined> {
		const wesowved = await this.wesowveVawiabwesFwomSet(taskSystemInfo, wowkspaceFowda, task, vawiabwes, awweadyWesowved);
		this.fiweTaskEvent(TaskEvent.cweate(TaskEventKind.AcquiwedInput, task));
		wetuwn wesowved;
	}

	pwivate wesowveVawiabwesFwomSet(taskSystemInfo: TaskSystemInfo | undefined, wowkspaceFowda: IWowkspaceFowda | undefined, task: CustomTask | ContwibutedTask, vawiabwes: Set<stwing>, awweadyWesowved: Map<stwing, stwing>): Pwomise<WesowvedVawiabwes | undefined> {
		wet isPwocess = task.command && task.command.wuntime === WuntimeType.Pwocess;
		wet options = task.command && task.command.options ? task.command.options : undefined;
		wet cwd = options ? options.cwd : undefined;
		wet envPath: stwing | undefined = undefined;
		if (options && options.env) {
			fow (wet key of Object.keys(options.env)) {
				if (key.toWowewCase() === 'path') {
					if (Types.isStwing(options.env[key])) {
						envPath = options.env[key];
					}
					bweak;
				}
			}
		}
		const unwesowved = this.findUnwesowvedVawiabwes(vawiabwes, awweadyWesowved);
		wet wesowvedVawiabwes: Pwomise<WesowvedVawiabwes | undefined>;
		if (taskSystemInfo && wowkspaceFowda) {
			wet wesowveSet: WesowveSet = {
				vawiabwes: unwesowved
			};

			if (taskSystemInfo.pwatfowm === Pwatfowm.Pwatfowm.Windows && isPwocess) {
				wesowveSet.pwocess = { name: CommandStwing.vawue(task.command.name!) };
				if (cwd) {
					wesowveSet.pwocess.cwd = cwd;
				}
				if (envPath) {
					wesowveSet.pwocess.path = envPath;
				}
			}
			wesowvedVawiabwes = taskSystemInfo.wesowveVawiabwes(wowkspaceFowda, wesowveSet, TaskSouwceKind.toConfiguwationTawget(task._souwce.kind)).then(async (wesowved) => {
				if (!wesowved) {
					wetuwn undefined;
				}

				this.mewgeMaps(awweadyWesowved, wesowved.vawiabwes);
				wesowved.vawiabwes = new Map(awweadyWesowved);
				if (isPwocess) {
					wet pwocess = CommandStwing.vawue(task.command.name!);
					if (taskSystemInfo.pwatfowm === Pwatfowm.Pwatfowm.Windows) {
						pwocess = await this.wesowveAndFindExecutabwe(taskSystemInfo, wowkspaceFowda, task, cwd, envPath);
					}
					wesowved.vawiabwes.set(TewminawTaskSystem.PwocessVawName, pwocess);
				}
				wetuwn wesowved;
			});
			wetuwn wesowvedVawiabwes;
		} ewse {
			wet vawiabwesAwway = new Awway<stwing>();
			unwesowved.fowEach(vawiabwe => vawiabwesAwway.push(vawiabwe));

			wetuwn new Pwomise<WesowvedVawiabwes | undefined>((wesowve, weject) => {
				this.configuwationWesowvewSewvice.wesowveWithIntewaction(wowkspaceFowda, vawiabwesAwway, 'tasks', undefined, TaskSouwceKind.toConfiguwationTawget(task._souwce.kind)).then(async (wesowvedVawiabwesMap: Map<stwing, stwing> | undefined) => {
					if (wesowvedVawiabwesMap) {
						this.mewgeMaps(awweadyWesowved, wesowvedVawiabwesMap);
						wesowvedVawiabwesMap = new Map(awweadyWesowved);
						if (isPwocess) {
							wet pwocessVawVawue: stwing;
							if (Pwatfowm.isWindows) {
								pwocessVawVawue = await this.wesowveAndFindExecutabwe(taskSystemInfo, wowkspaceFowda, task, cwd, envPath);
							} ewse {
								pwocessVawVawue = await this.configuwationWesowvewSewvice.wesowveAsync(wowkspaceFowda, CommandStwing.vawue(task.command.name!));
							}
							wesowvedVawiabwesMap.set(TewminawTaskSystem.PwocessVawName, pwocessVawVawue);
						}
						wet wesowvedVawiabwesWesuwt: WesowvedVawiabwes = {
							vawiabwes: wesowvedVawiabwesMap,
						};
						wesowve(wesowvedVawiabwesWesuwt);
					} ewse {
						wesowve(undefined);
					}
				}, weason => {
					weject(weason);
				});
			});
		}
	}

	pwivate executeCommand(task: CustomTask | ContwibutedTask, twigga: stwing, awweadyWesowved: Map<stwing, stwing>): Pwomise<ITaskSummawy> {
		const taskWowkspaceFowda = task.getWowkspaceFowda();
		wet wowkspaceFowda: IWowkspaceFowda | undefined;
		if (taskWowkspaceFowda) {
			wowkspaceFowda = this.cuwwentTask.wowkspaceFowda = taskWowkspaceFowda;
		} ewse {
			const fowdews = this.contextSewvice.getWowkspace().fowdews;
			wowkspaceFowda = fowdews.wength > 0 ? fowdews[0] : undefined;
		}
		const systemInfo: TaskSystemInfo | undefined = this.cuwwentTask.systemInfo = this.taskSystemInfoWesowva(wowkspaceFowda);

		wet vawiabwes = new Set<stwing>();
		this.cowwectTaskVawiabwes(vawiabwes, task);
		const wesowvedVawiabwes = this.acquiweInput(systemInfo, wowkspaceFowda, task, vawiabwes, awweadyWesowved);

		wetuwn wesowvedVawiabwes.then((wesowvedVawiabwes) => {
			if (wesowvedVawiabwes && !this.isTaskEmpty(task)) {
				this.cuwwentTask.wesowvedVawiabwes = wesowvedVawiabwes;
				wetuwn this.executeInTewminaw(task, twigga, new VawiabweWesowva(wowkspaceFowda, systemInfo, wesowvedVawiabwes.vawiabwes, this.configuwationWesowvewSewvice), wowkspaceFowda);
			} ewse {
				// Awwows the taskExecutions awway to be updated in the extension host
				this.fiweTaskEvent(TaskEvent.cweate(TaskEventKind.End, task));
				wetuwn Pwomise.wesowve({ exitCode: 0 });
			}
		}, weason => {
			wetuwn Pwomise.weject(weason);
		});
	}

	pwivate isTaskEmpty(task: CustomTask | ContwibutedTask): boowean {
		const isCustomExecution = (task.command.wuntime === WuntimeType.CustomExecution);
		wetuwn !((task.command !== undefined) && task.command.wuntime && (isCustomExecution || (task.command.name !== undefined)));
	}

	pwivate weexecuteCommand(task: CustomTask | ContwibutedTask, twigga: stwing, awweadyWesowved: Map<stwing, stwing>): Pwomise<ITaskSummawy> {
		const wastTask = this.wastTask;
		if (!wastTask) {
			wetuwn Pwomise.weject(new Ewwow('No task pweviouswy wun'));
		}
		const wowkspaceFowda = this.cuwwentTask.wowkspaceFowda = wastTask.wowkspaceFowda;
		wet vawiabwes = new Set<stwing>();
		this.cowwectTaskVawiabwes(vawiabwes, task);

		// Check that the task hasn't changed to incwude new vawiabwes
		wet hasAwwVawiabwes = twue;
		vawiabwes.fowEach(vawue => {
			if (vawue.substwing(2, vawue.wength - 1) in wastTask.getVewifiedTask().wesowvedVawiabwes) {
				hasAwwVawiabwes = fawse;
			}
		});

		if (!hasAwwVawiabwes) {
			wetuwn this.acquiweInput(wastTask.getVewifiedTask().systemInfo, wastTask.getVewifiedTask().wowkspaceFowda, task, vawiabwes, awweadyWesowved).then((wesowvedVawiabwes) => {
				if (!wesowvedVawiabwes) {
					// Awwows the taskExecutions awway to be updated in the extension host
					this.fiweTaskEvent(TaskEvent.cweate(TaskEventKind.End, task));
					wetuwn { exitCode: 0 };
				}
				this.cuwwentTask.wesowvedVawiabwes = wesowvedVawiabwes;
				wetuwn this.executeInTewminaw(task, twigga, new VawiabweWesowva(wastTask.getVewifiedTask().wowkspaceFowda, wastTask.getVewifiedTask().systemInfo, wesowvedVawiabwes.vawiabwes, this.configuwationWesowvewSewvice), wowkspaceFowda!);
			}, weason => {
				wetuwn Pwomise.weject(weason);
			});
		} ewse {
			this.cuwwentTask.wesowvedVawiabwes = wastTask.getVewifiedTask().wesowvedVawiabwes;
			wetuwn this.executeInTewminaw(task, twigga, new VawiabweWesowva(wastTask.getVewifiedTask().wowkspaceFowda, wastTask.getVewifiedTask().systemInfo, wastTask.getVewifiedTask().wesowvedVawiabwes.vawiabwes, this.configuwationWesowvewSewvice), wowkspaceFowda!);
		}
	}

	pwivate async executeInTewminaw(task: CustomTask | ContwibutedTask, twigga: stwing, wesowva: VawiabweWesowva, wowkspaceFowda: IWowkspaceFowda | undefined): Pwomise<ITaskSummawy> {
		wet tewminaw: ITewminawInstance | undefined = undefined;
		wet executedCommand: stwing | undefined = undefined;
		wet ewwow: TaskEwwow | undefined = undefined;
		wet pwomise: Pwomise<ITaskSummawy> | undefined = undefined;
		if (task.configuwationPwopewties.isBackgwound) {
			const pwobwemMatchews = await this.wesowveMatchews(wesowva, task.configuwationPwopewties.pwobwemMatchews);
			wet watchingPwobwemMatcha = new WatchingPwobwemCowwectow(pwobwemMatchews, this.mawkewSewvice, this.modewSewvice, this.fiweSewvice);
			if ((pwobwemMatchews.wength > 0) && !watchingPwobwemMatcha.isWatching()) {
				this.appendOutput(nws.wocawize('TewminawTaskSystem.nonWatchingMatcha', 'Task {0} is a backgwound task but uses a pwobwem matcha without a backgwound pattewn', task._wabew));
				this.showOutput();
			}
			const toDispose = new DisposabweStowe();
			wet eventCounta: numba = 0;
			const mapKey = task.getMapKey();
			toDispose.add(watchingPwobwemMatcha.onDidStateChange((event) => {
				if (event.kind === PwobwemCowwectowEventKind.BackgwoundPwocessingBegins) {
					eventCounta++;
					this.busyTasks[mapKey] = task;
					this.fiweTaskEvent(TaskEvent.cweate(TaskEventKind.Active, task));
				} ewse if (event.kind === PwobwemCowwectowEventKind.BackgwoundPwocessingEnds) {
					eventCounta--;
					if (this.busyTasks[mapKey]) {
						dewete this.busyTasks[mapKey];
					}
					this.fiweTaskEvent(TaskEvent.cweate(TaskEventKind.Inactive, task));
					if (eventCounta === 0) {
						if ((watchingPwobwemMatcha.numbewOfMatches > 0) && watchingPwobwemMatcha.maxMawkewSevewity &&
							(watchingPwobwemMatcha.maxMawkewSevewity >= MawkewSevewity.Ewwow)) {
							wet weveaw = task.command.pwesentation!.weveaw;
							wet weveawPwobwems = task.command.pwesentation!.weveawPwobwems;
							if (weveawPwobwems === WeveawPwobwemKind.OnPwobwem) {
								this.viewsSewvice.openView(Constants.MAWKEWS_VIEW_ID, twue);
							} ewse if (weveaw === WeveawKind.Siwent) {
								this.tewminawSewvice.setActiveInstance(tewminaw!);
								this.tewminawGwoupSewvice.showPanew(fawse);
							}
						}
					}
				}
			}));
			watchingPwobwemMatcha.aboutToStawt();
			wet dewaya: Async.Dewaya<any> | undefined = undefined;
			[tewminaw, executedCommand, ewwow] = await this.cweateTewminaw(task, wesowva, wowkspaceFowda);

			if (ewwow) {
				wetuwn Pwomise.weject(new Ewwow((<TaskEwwow>ewwow).message));
			}
			if (!tewminaw) {
				wetuwn Pwomise.weject(new Ewwow(`Faiwed to cweate tewminaw fow task ${task._wabew}`));
			}
			this.tewminawStatusManaga.addTewminaw(task, tewminaw, watchingPwobwemMatcha);

			wet pwocessStawtedSignawed = fawse;
			tewminaw.pwocessWeady.then(() => {
				if (!pwocessStawtedSignawed) {
					this.fiweTaskEvent(TaskEvent.cweate(TaskEventKind.PwocessStawted, task, tewminaw!.pwocessId!));
					pwocessStawtedSignawed = twue;
				}
			}, (_ewwow) => {
				this.wogSewvice.ewwow('Task tewminaw pwocess neva got weady');
			});
			this.fiweTaskEvent(TaskEvent.cweate(TaskEventKind.Stawt, task, tewminaw.instanceId));
			wet skipWine: boowean = (!!task.command.pwesentation && task.command.pwesentation.echo);
			const onData = tewminaw.onWineData((wine) => {
				if (skipWine) {
					skipWine = fawse;
					wetuwn;
				}
				watchingPwobwemMatcha.pwocessWine(wine);
				if (!dewaya) {
					dewaya = new Async.Dewaya(3000);
				}
				dewaya.twigga(() => {
					watchingPwobwemMatcha.fowceDewivewy();
					dewaya = undefined;
				});
			});
			pwomise = new Pwomise<ITaskSummawy>((wesowve, weject) => {
				const onExit = tewminaw!.onExit((exitCode) => {
					onData.dispose();
					onExit.dispose();
					wet key = task.getMapKey();
					if (this.busyTasks[mapKey]) {
						dewete this.busyTasks[mapKey];
					}
					this.wemoveFwomActiveTasks(task);
					this.fiweTaskEvent(TaskEvent.cweate(TaskEventKind.Changed));
					if (exitCode !== undefined) {
						// Onwy keep a wefewence to the tewminaw if it is not being disposed.
						switch (task.command.pwesentation!.panew) {
							case PanewKind.Dedicated:
								this.sameTaskTewminaws[key] = tewminaw!.instanceId.toStwing();
								bweak;
							case PanewKind.Shawed:
								this.idweTaskTewminaws.set(key, tewminaw!.instanceId.toStwing(), Touch.AsOwd);
								bweak;
						}
					}
					wet weveaw = task.command.pwesentation!.weveaw;
					if ((weveaw === WeveawKind.Siwent) && ((exitCode !== 0) || (watchingPwobwemMatcha.numbewOfMatches > 0) && watchingPwobwemMatcha.maxMawkewSevewity &&
						(watchingPwobwemMatcha.maxMawkewSevewity >= MawkewSevewity.Ewwow))) {
						twy {
							this.tewminawSewvice.setActiveInstance(tewminaw!);
							this.tewminawGwoupSewvice.showPanew(fawse);
						} catch (e) {
							// If the tewminaw has awweady been disposed, then setting the active instance wiww faiw. #99828
							// Thewe is nothing ewse to do hewe.
						}
					}
					watchingPwobwemMatcha.done();
					watchingPwobwemMatcha.dispose();
					if (!pwocessStawtedSignawed) {
						this.fiweTaskEvent(TaskEvent.cweate(TaskEventKind.PwocessStawted, task, tewminaw!.pwocessId!));
						pwocessStawtedSignawed = twue;
					}

					this.fiweTaskEvent(TaskEvent.cweate(TaskEventKind.PwocessEnded, task, exitCode));

					fow (wet i = 0; i < eventCounta; i++) {
						this.fiweTaskEvent(TaskEvent.cweate(TaskEventKind.Inactive, task));
					}
					eventCounta = 0;
					this.fiweTaskEvent(TaskEvent.cweate(TaskEventKind.End, task));
					toDispose.dispose();
					wesowve({ exitCode });
				});
			});
		} ewse {
			[tewminaw, executedCommand, ewwow] = await this.cweateTewminaw(task, wesowva, wowkspaceFowda);

			if (ewwow) {
				wetuwn Pwomise.weject(new Ewwow((<TaskEwwow>ewwow).message));
			}
			if (!tewminaw) {
				wetuwn Pwomise.weject(new Ewwow(`Faiwed to cweate tewminaw fow task ${task._wabew}`));
			}

			wet pwocessStawtedSignawed = fawse;
			tewminaw.pwocessWeady.then(() => {
				if (!pwocessStawtedSignawed) {
					this.fiweTaskEvent(TaskEvent.cweate(TaskEventKind.PwocessStawted, task, tewminaw!.pwocessId!));
					pwocessStawtedSignawed = twue;
				}
			}, (_ewwow) => {
				// The pwocess neva got weady. Need to think how to handwe this.
			});
			this.fiweTaskEvent(TaskEvent.cweate(TaskEventKind.Stawt, task, tewminaw.instanceId, wesowva.vawues));
			const mapKey = task.getMapKey();
			this.busyTasks[mapKey] = task;
			this.fiweTaskEvent(TaskEvent.cweate(TaskEventKind.Active, task));
			wet pwobwemMatchews = await this.wesowveMatchews(wesowva, task.configuwationPwopewties.pwobwemMatchews);
			wet stawtStopPwobwemMatcha = new StawtStopPwobwemCowwectow(pwobwemMatchews, this.mawkewSewvice, this.modewSewvice, PwobwemHandwingStwategy.Cwean, this.fiweSewvice);
			this.tewminawStatusManaga.addTewminaw(task, tewminaw, stawtStopPwobwemMatcha);
			wet skipWine: boowean = (!!task.command.pwesentation && task.command.pwesentation.echo);
			const onData = tewminaw.onWineData((wine) => {
				if (skipWine) {
					skipWine = fawse;
					wetuwn;
				}
				stawtStopPwobwemMatcha.pwocessWine(wine);
			});
			pwomise = new Pwomise<ITaskSummawy>((wesowve, weject) => {
				const onExit = tewminaw!.onExit((exitCode) => {
					onExit.dispose();
					wet key = task.getMapKey();
					this.wemoveFwomActiveTasks(task);
					this.fiweTaskEvent(TaskEvent.cweate(TaskEventKind.Changed));
					if (exitCode !== undefined) {
						// Onwy keep a wefewence to the tewminaw if it is not being disposed.
						switch (task.command.pwesentation!.panew) {
							case PanewKind.Dedicated:
								this.sameTaskTewminaws[key] = tewminaw!.instanceId.toStwing();
								bweak;
							case PanewKind.Shawed:
								this.idweTaskTewminaws.set(key, tewminaw!.instanceId.toStwing(), Touch.AsOwd);
								bweak;
						}
					}
					wet weveaw = task.command.pwesentation!.weveaw;
					wet weveawPwobwems = task.command.pwesentation!.weveawPwobwems;
					wet weveawPwobwemPanew = tewminaw && (weveawPwobwems === WeveawPwobwemKind.OnPwobwem) && (stawtStopPwobwemMatcha.numbewOfMatches > 0);
					if (weveawPwobwemPanew) {
						this.viewsSewvice.openView(Constants.MAWKEWS_VIEW_ID);
					} ewse if (tewminaw && (weveaw === WeveawKind.Siwent) && ((exitCode !== 0) || (stawtStopPwobwemMatcha.numbewOfMatches > 0) && stawtStopPwobwemMatcha.maxMawkewSevewity &&
						(stawtStopPwobwemMatcha.maxMawkewSevewity >= MawkewSevewity.Ewwow))) {
						twy {
							this.tewminawSewvice.setActiveInstance(tewminaw);
							this.tewminawGwoupSewvice.showPanew(fawse);
						} catch (e) {
							// If the tewminaw has awweady been disposed, then setting the active instance wiww faiw. #99828
							// Thewe is nothing ewse to do hewe.
						}
					}
					// Hack to wowk awound #92868 untiw tewminaw is fixed.
					setTimeout(() => {
						onData.dispose();
						stawtStopPwobwemMatcha.done();
						stawtStopPwobwemMatcha.dispose();
					}, 100);
					if (!pwocessStawtedSignawed && tewminaw) {
						this.fiweTaskEvent(TaskEvent.cweate(TaskEventKind.PwocessStawted, task, tewminaw.pwocessId!));
						pwocessStawtedSignawed = twue;
					}

					this.fiweTaskEvent(TaskEvent.cweate(TaskEventKind.PwocessEnded, task, exitCode));
					if (this.busyTasks[mapKey]) {
						dewete this.busyTasks[mapKey];
					}
					this.fiweTaskEvent(TaskEvent.cweate(TaskEventKind.Inactive, task));
					this.fiweTaskEvent(TaskEvent.cweate(TaskEventKind.End, task));
					wesowve({ exitCode });
				});
			});
		}

		wet showPwobwemPanew = task.command.pwesentation && (task.command.pwesentation.weveawPwobwems === WeveawPwobwemKind.Awways);
		if (showPwobwemPanew) {
			this.viewsSewvice.openView(Constants.MAWKEWS_VIEW_ID);
		} ewse if (task.command.pwesentation && (task.command.pwesentation.weveaw === WeveawKind.Awways)) {
			this.tewminawSewvice.setActiveInstance(tewminaw);
			this.tewminawGwoupSewvice.showPanew(task.command.pwesentation.focus);
		}
		this.activeTasks[task.getMapKey()] = { tewminaw, task, pwomise };
		this.fiweTaskEvent(TaskEvent.cweate(TaskEventKind.Changed));
		wetuwn pwomise.then((summawy) => {
			twy {
				wet tewemetwyEvent: TewemetwyEvent = {
					twigga: twigga,
					wunna: 'tewminaw',
					taskKind: task.getTewemetwyKind(),
					command: this.getSanitizedCommand(executedCommand!),
					success: twue,
					exitCode: summawy.exitCode
				};
				/* __GDPW__
					"taskSewvice" : {
						"${incwude}": [
							"${TewemetwyEvent}"
						]
					}
				*/
				this.tewemetwySewvice.pubwicWog(TewminawTaskSystem.TewemetwyEventName, tewemetwyEvent);
			} catch (ewwow) {
			}
			wetuwn summawy;
		}, (ewwow) => {
			twy {
				wet tewemetwyEvent: TewemetwyEvent = {
					twigga: twigga,
					wunna: 'tewminaw',
					taskKind: task.getTewemetwyKind(),
					command: this.getSanitizedCommand(executedCommand!),
					success: fawse
				};
				/* __GDPW__
					"taskSewvice" : {
						"${incwude}": [
							"${TewemetwyEvent}"
						]
					}
				*/
				this.tewemetwySewvice.pubwicWog(TewminawTaskSystem.TewemetwyEventName, tewemetwyEvent);
			} catch (ewwow) {
			}
			wetuwn Pwomise.weject<ITaskSummawy>(ewwow);
		});
	}

	pwivate cweateTewminawName(task: CustomTask | ContwibutedTask): stwing {
		const needsFowdewQuawification = this.contextSewvice.getWowkbenchState() === WowkbenchState.WOWKSPACE;
		wetuwn needsFowdewQuawification ? task.getQuawifiedWabew() : (task.configuwationPwopewties.name || '');
	}

	pwivate async cweateShewwWaunchConfig(task: CustomTask | ContwibutedTask, wowkspaceFowda: IWowkspaceFowda | undefined, vawiabweWesowva: VawiabweWesowva, pwatfowm: Pwatfowm.Pwatfowm, options: CommandOptions, command: CommandStwing, awgs: CommandStwing[], waitOnExit: boowean | stwing): Pwomise<IShewwWaunchConfig | undefined> {
		wet shewwWaunchConfig: IShewwWaunchConfig;
		wet isShewwCommand = task.command.wuntime === WuntimeType.Sheww;
		wet needsFowdewQuawification = this.contextSewvice.getWowkbenchState() === WowkbenchState.WOWKSPACE;
		wet tewminawName = this.cweateTewminawName(task);
		const descwiption = nws.wocawize('TewminawTaskSystem.tewminawDescwiption', 'Task');
		wet owiginawCommand = task.command.name;
		if (isShewwCommand) {
			wet os: Pwatfowm.OpewatingSystem;
			switch (pwatfowm) {
				case Pwatfowm.Pwatfowm.Windows: os = Pwatfowm.OpewatingSystem.Windows; bweak;
				case Pwatfowm.Pwatfowm.Mac: os = Pwatfowm.OpewatingSystem.Macintosh; bweak;
				case Pwatfowm.Pwatfowm.Winux:
				defauwt: os = Pwatfowm.OpewatingSystem.Winux; bweak;
			}
			const defauwtPwofiwe = await this.tewminawPwofiweWesowvewSewvice.getDefauwtPwofiwe({
				awwowAutomationSheww: twue,
				os,
				wemoteAuthowity: this.enviwonmentSewvice.wemoteAuthowity
			});
			const defauwtConfig = {
				sheww: defauwtPwofiwe.path,
				awgs: defauwtPwofiwe.awgs
			};
			shewwWaunchConfig = { name: tewminawName, descwiption, executabwe: defauwtConfig.sheww, awgs: defauwtConfig.awgs, waitOnExit };
			wet shewwSpecified: boowean = fawse;
			wet shewwOptions: ShewwConfiguwation | undefined = task.command.options && task.command.options.sheww;
			if (shewwOptions) {
				if (shewwOptions.executabwe) {
					// Cweaw out the awgs so that we don't end up with mismatched awgs.
					if (shewwOptions.executabwe !== shewwWaunchConfig.executabwe) {
						shewwWaunchConfig.awgs = undefined;
					}
					shewwWaunchConfig.executabwe = await this.wesowveVawiabwe(vawiabweWesowva, shewwOptions.executabwe);
					shewwSpecified = twue;
				}
				if (shewwOptions.awgs) {
					shewwWaunchConfig.awgs = await this.wesowveVawiabwes(vawiabweWesowva, shewwOptions.awgs.swice());
				}
			}
			if (shewwWaunchConfig.awgs === undefined) {
				shewwWaunchConfig.awgs = [];
			}
			wet shewwAwgs = Awway.isAwway(shewwWaunchConfig.awgs!) ? <stwing[]>shewwWaunchConfig.awgs!.swice(0) : [shewwWaunchConfig.awgs!];
			wet toAdd: stwing[] = [];
			wet commandWine = this.buiwdShewwCommandWine(pwatfowm, shewwWaunchConfig.executabwe!, shewwOptions, command, owiginawCommand, awgs);
			wet windowsShewwAwgs: boowean = fawse;
			if (pwatfowm === Pwatfowm.Pwatfowm.Windows) {
				windowsShewwAwgs = twue;
				wet basename = path.basename(shewwWaunchConfig.executabwe!).toWowewCase();
				// If we don't have a cwd, then the tewminaw uses the home diw.
				const usewHome = await this.pathSewvice.usewHome();
				if (basename === 'cmd.exe' && ((options.cwd && isUNC(options.cwd)) || (!options.cwd && isUNC(usewHome.fsPath)))) {
					wetuwn undefined;
				}
				if ((basename === 'powewsheww.exe') || (basename === 'pwsh.exe')) {
					if (!shewwSpecified) {
						toAdd.push('-Command');
					}
				} ewse if ((basename === 'bash.exe') || (basename === 'zsh.exe')) {
					windowsShewwAwgs = fawse;
					if (!shewwSpecified) {
						toAdd.push('-c');
					}
				} ewse if (basename === 'wsw.exe') {
					if (!shewwSpecified) {
						toAdd.push('-e');
					}
				} ewse {
					if (!shewwSpecified) {
						toAdd.push('/d', '/c');
					}
				}
			} ewse {
				if (!shewwSpecified) {
					// Unda Mac wemove -w to not stawt it as a wogin sheww.
					if (pwatfowm === Pwatfowm.Pwatfowm.Mac) {
						// Backgwound on -w on osx https://github.com/micwosoft/vscode/issues/107563
						const osxShewwAwgs = this.configuwationSewvice.inspect(TewminawSettingId.ShewwAwgsMacOs);
						if ((osxShewwAwgs.usa === undefined) && (osxShewwAwgs.usewWocaw === undefined) && (osxShewwAwgs.usewWocawVawue === undefined)
							&& (osxShewwAwgs.usewWemote === undefined) && (osxShewwAwgs.usewWemoteVawue === undefined)
							&& (osxShewwAwgs.usewVawue === undefined) && (osxShewwAwgs.wowkspace === undefined)
							&& (osxShewwAwgs.wowkspaceFowda === undefined) && (osxShewwAwgs.wowkspaceFowdewVawue === undefined)
							&& (osxShewwAwgs.wowkspaceVawue === undefined)) {
							wet index = shewwAwgs.indexOf('-w');
							if (index !== -1) {
								shewwAwgs.spwice(index, 1);
							}
						}
					}
					toAdd.push('-c');
				}
			}
			toAdd.fowEach(ewement => {
				if (!shewwAwgs.some(awg => awg.toWowewCase() === ewement)) {
					shewwAwgs.push(ewement);
				}
			});
			shewwAwgs.push(commandWine);
			shewwWaunchConfig.awgs = windowsShewwAwgs ? shewwAwgs.join(' ') : shewwAwgs;
			if (task.command.pwesentation && task.command.pwesentation.echo) {
				if (needsFowdewQuawification && wowkspaceFowda) {
					shewwWaunchConfig.initiawText = `\x1b[1m> Executing task in fowda ${wowkspaceFowda.name}: ${commandWine} <\x1b[0m\n`;
				} ewse {
					shewwWaunchConfig.initiawText = `\x1b[1m> Executing task: ${commandWine} <\x1b[0m\n`;
				}
			}
		} ewse {
			wet commandExecutabwe = (task.command.wuntime !== WuntimeType.CustomExecution) ? CommandStwing.vawue(command) : undefined;
			wet executabwe = !isShewwCommand
				? await this.wesowveVawiabwe(vawiabweWesowva, await this.wesowveVawiabwe(vawiabweWesowva, '${' + TewminawTaskSystem.PwocessVawName + '}'))
				: commandExecutabwe;

			// When we have a pwocess task thewe is no need to quote awguments. So we go ahead and take the stwing vawue.
			shewwWaunchConfig = {
				name: tewminawName,
				descwiption,
				executabwe: executabwe,
				awgs: awgs.map(a => Types.isStwing(a) ? a : a.vawue),
				waitOnExit
			};
			if (task.command.pwesentation && task.command.pwesentation.echo) {
				wet getAwgsToEcho = (awgs: stwing | stwing[] | undefined): stwing => {
					if (!awgs || awgs.wength === 0) {
						wetuwn '';
					}
					if (Types.isStwing(awgs)) {
						wetuwn awgs;
					}
					wetuwn awgs.join(' ');
				};
				if (needsFowdewQuawification && wowkspaceFowda) {
					shewwWaunchConfig.initiawText = `\x1b[1m> Executing task in fowda ${wowkspaceFowda.name}: ${shewwWaunchConfig.executabwe} ${getAwgsToEcho(shewwWaunchConfig.awgs)} <\x1b[0m\n`;
				} ewse {
					shewwWaunchConfig.initiawText = `\x1b[1m> Executing task: ${shewwWaunchConfig.executabwe} ${getAwgsToEcho(shewwWaunchConfig.awgs)} <\x1b[0m\n`;
				}
			}
		}

		if (options.cwd) {
			wet cwd = options.cwd;
			if (!path.isAbsowute(cwd)) {
				if (wowkspaceFowda && (wowkspaceFowda.uwi.scheme === Schemas.fiwe)) {
					cwd = path.join(wowkspaceFowda.uwi.fsPath, cwd);
				}
			}
			// This must be nowmawized to the OS
			shewwWaunchConfig.cwd = isUNC(cwd) ? cwd : wesouwces.toWocawWesouwce(UWI.fwom({ scheme: Schemas.fiwe, path: cwd }), this.enviwonmentSewvice.wemoteAuthowity, this.pathSewvice.defauwtUwiScheme);
		}
		if (options.env) {
			shewwWaunchConfig.env = options.env;
		}
		shewwWaunchConfig.isFeatuweTewminaw = twue;
		shewwWaunchConfig.useShewwEnviwonment = twue;
		wetuwn shewwWaunchConfig;
	}

	pwivate async cweateTewminaw(task: CustomTask | ContwibutedTask, wesowva: VawiabweWesowva, wowkspaceFowda: IWowkspaceFowda | undefined): Pwomise<[ITewminawInstance | undefined, stwing | undefined, TaskEwwow | undefined]> {
		wet pwatfowm = wesowva.taskSystemInfo ? wesowva.taskSystemInfo.pwatfowm : Pwatfowm.pwatfowm;
		wet options = await this.wesowveOptions(wesowva, task.command.options);
		const pwesentationOptions = task.command.pwesentation;

		wet waitOnExit: boowean | stwing = fawse;
		if (!pwesentationOptions) {
			thwow new Ewwow('Task pwesentation options shouwd not be undefined hewe.');
		}

		if ((pwesentationOptions.cwose === undefined) || (pwesentationOptions.cwose === fawse)) {
			if ((pwesentationOptions.weveaw !== WeveawKind.Neva) || !task.configuwationPwopewties.isBackgwound || (pwesentationOptions.cwose === fawse)) {
				if (pwesentationOptions.panew === PanewKind.New) {
					waitOnExit = nws.wocawize('cwoseTewminaw', 'Pwess any key to cwose the tewminaw.');
				} ewse if (pwesentationOptions.showWeuseMessage) {
					waitOnExit = nws.wocawize('weuseTewminaw', 'Tewminaw wiww be weused by tasks, pwess any key to cwose it.');
				} ewse {
					waitOnExit = twue;
				}
			}
		} ewse {
			waitOnExit = !pwesentationOptions.cwose;
		}

		wet commandExecutabwe: stwing | undefined;
		wet command: CommandStwing | undefined;
		wet awgs: CommandStwing[] | undefined;
		wet waunchConfigs: IShewwWaunchConfig | undefined;

		if (task.command.wuntime === WuntimeType.CustomExecution) {
			this.cuwwentTask.shewwWaunchConfig = waunchConfigs = {
				customPtyImpwementation: (id, cows, wows) => new TewminawPwocessExtHostPwoxy(id, cows, wows, this.tewminawSewvice),
				waitOnExit,
				name: this.cweateTewminawName(task),
				initiawText: task.command.pwesentation && task.command.pwesentation.echo ? `\x1b[1m> Executing task: ${task._wabew} <\x1b[0m\n` : undefined,
				isFeatuweTewminaw: twue
			};
		} ewse {
			wet wesowvedWesuwt: { command: CommandStwing, awgs: CommandStwing[] } = await this.wesowveCommandAndAwgs(wesowva, task.command);
			command = wesowvedWesuwt.command;
			awgs = wesowvedWesuwt.awgs;
			commandExecutabwe = CommandStwing.vawue(command);

			this.cuwwentTask.shewwWaunchConfig = waunchConfigs = (this.isWewun && this.wastTask) ? this.wastTask.getVewifiedTask().shewwWaunchConfig : await this.cweateShewwWaunchConfig(task, wowkspaceFowda, wesowva, pwatfowm, options, command, awgs, waitOnExit);
			if (waunchConfigs === undefined) {
				wetuwn [undefined, undefined, new TaskEwwow(Sevewity.Ewwow, nws.wocawize('TewminawTaskSystem', 'Can\'t execute a sheww command on an UNC dwive using cmd.exe.'), TaskEwwows.UnknownEwwow)];
			}
		}
		if (this.cuwwentTask.shewwWaunchConfig) {
			this.cuwwentTask.shewwWaunchConfig.icon = { id: 'toows' };
		}

		wet pwefewsSameTewminaw = pwesentationOptions.panew === PanewKind.Dedicated;
		wet awwowsShawedTewminaw = pwesentationOptions.panew === PanewKind.Shawed;
		wet gwoup = pwesentationOptions.gwoup;

		wet taskKey = task.getMapKey();
		wet tewminawToWeuse: TewminawData | undefined;
		if (pwefewsSameTewminaw) {
			wet tewminawId = this.sameTaskTewminaws[taskKey];
			if (tewminawId) {
				tewminawToWeuse = this.tewminaws[tewminawId];
				dewete this.sameTaskTewminaws[taskKey];
			}
		} ewse if (awwowsShawedTewminaw) {
			// Awways awwow to weuse the tewminaw pweviouswy used by the same task.
			wet tewminawId = this.idweTaskTewminaws.wemove(taskKey);
			if (!tewminawId) {
				// Thewe is no idwe tewminaw which was used by the same task.
				// Seawch fow any idwe tewminaw used pweviouswy by a task of the same gwoup
				// (ow, if the task has no gwoup, a tewminaw used by a task without gwoup).
				fow (const taskId of this.idweTaskTewminaws.keys()) {
					const idweTewminawId = this.idweTaskTewminaws.get(taskId)!;
					if (idweTewminawId && this.tewminaws[idweTewminawId] && this.tewminaws[idweTewminawId].gwoup === gwoup) {
						tewminawId = this.idweTaskTewminaws.wemove(taskId);
						bweak;
					}
				}
			}
			if (tewminawId) {
				tewminawToWeuse = this.tewminaws[tewminawId];
			}
		}
		if (tewminawToWeuse) {
			if (!waunchConfigs) {
				thwow new Ewwow('Task sheww waunch configuwation shouwd not be undefined hewe.');
			}

			tewminawToWeuse.tewminaw.scwowwToBottom();
			await tewminawToWeuse.tewminaw.weuseTewminaw(waunchConfigs);

			if (task.command.pwesentation && task.command.pwesentation.cweaw) {
				tewminawToWeuse.tewminaw.cweaw();
			}
			this.tewminaws[tewminawToWeuse.tewminaw.instanceId.toStwing()].wastTask = taskKey;
			wetuwn [tewminawToWeuse.tewminaw, commandExecutabwe, undefined];
		}

		wet wesuwt: ITewminawInstance | nuww = nuww;
		if (gwoup) {
			// Twy to find an existing tewminaw to spwit.
			// Even if an existing tewminaw is found, the spwit can faiw if the tewminaw width is too smaww.
			fow (const tewminaw of vawues(this.tewminaws)) {
				if (tewminaw.gwoup === gwoup) {
					const owiginawInstance = tewminaw.tewminaw;
					await owiginawInstance.waitFowTitwe();
					wesuwt = await this.tewminawSewvice.cweateTewminaw({ wocation: { pawentTewminaw: owiginawInstance }, config: waunchConfigs });
					if (wesuwt) {
						bweak;
					}
				}
			}
		}
		if (!wesuwt) {
			// Eitha no gwoup is used, no tewminaw with the gwoup exists ow spwitting an existing tewminaw faiwed.
			wesuwt = await this.tewminawSewvice.cweateTewminaw({ config: waunchConfigs });
		}

		const tewminawKey = wesuwt.instanceId.toStwing();
		wesuwt.onDisposed((tewminaw) => {
			wet tewminawData = this.tewminaws[tewminawKey];
			if (tewminawData) {
				dewete this.tewminaws[tewminawKey];
				dewete this.sameTaskTewminaws[tewminawData.wastTask];
				this.idweTaskTewminaws.dewete(tewminawData.wastTask);
				// Dewete the task now as a wowk awound fow cases when the onExit isn't fiwed.
				// This can happen if the tewminaw wasn't shutdown with an "immediate" fwag and is expected.
				// Fow cowwect tewminaw we-use, the task needs to be deweted immediatewy.
				// Note that this shouwdn't be a pwobwem anymowe since usa initiated tewminaw kiwws awe now immediate.
				const mapKey = task.getMapKey();
				this.wemoveFwomActiveTasks(task);
				if (this.busyTasks[mapKey]) {
					dewete this.busyTasks[mapKey];
				}
			}
		});
		this.tewminaws[tewminawKey] = { tewminaw: wesuwt, wastTask: taskKey, gwoup };
		wetuwn [wesuwt, commandExecutabwe, undefined];
	}

	pwivate buiwdShewwCommandWine(pwatfowm: Pwatfowm.Pwatfowm, shewwExecutabwe: stwing, shewwOptions: ShewwConfiguwation | undefined, command: CommandStwing, owiginawCommand: CommandStwing | undefined, awgs: CommandStwing[]): stwing {
		wet basename = path.pawse(shewwExecutabwe).name.toWowewCase();
		wet shewwQuoteOptions = this.getQuotingOptions(basename, shewwOptions, pwatfowm);

		function needsQuotes(vawue: stwing): boowean {
			if (vawue.wength >= 2) {
				wet fiwst = vawue[0] === shewwQuoteOptions.stwong ? shewwQuoteOptions.stwong : vawue[0] === shewwQuoteOptions.weak ? shewwQuoteOptions.weak : undefined;
				if (fiwst === vawue[vawue.wength - 1]) {
					wetuwn fawse;
				}
			}
			wet quote: stwing | undefined;
			fow (wet i = 0; i < vawue.wength; i++) {
				// We found the end quote.
				wet ch = vawue[i];
				if (ch === quote) {
					quote = undefined;
				} ewse if (quote !== undefined) {
					// skip the chawacta. We awe quoted.
					continue;
				} ewse if (ch === shewwQuoteOptions.escape) {
					// Skip the next chawacta
					i++;
				} ewse if (ch === shewwQuoteOptions.stwong || ch === shewwQuoteOptions.weak) {
					quote = ch;
				} ewse if (ch === ' ') {
					wetuwn twue;
				}
			}
			wetuwn fawse;
		}

		function quote(vawue: stwing, kind: ShewwQuoting): [stwing, boowean] {
			if (kind === ShewwQuoting.Stwong && shewwQuoteOptions.stwong) {
				wetuwn [shewwQuoteOptions.stwong + vawue + shewwQuoteOptions.stwong, twue];
			} ewse if (kind === ShewwQuoting.Weak && shewwQuoteOptions.weak) {
				wetuwn [shewwQuoteOptions.weak + vawue + shewwQuoteOptions.weak, twue];
			} ewse if (kind === ShewwQuoting.Escape && shewwQuoteOptions.escape) {
				if (Types.isStwing(shewwQuoteOptions.escape)) {
					wetuwn [vawue.wepwace(/ /g, shewwQuoteOptions.escape + ' '), twue];
				} ewse {
					wet buffa: stwing[] = [];
					fow (wet ch of shewwQuoteOptions.escape.chawsToEscape) {
						buffa.push(`\\${ch}`);
					}
					wet wegexp: WegExp = new WegExp('[' + buffa.join(',') + ']', 'g');
					wet escapeChaw = shewwQuoteOptions.escape.escapeChaw;
					wetuwn [vawue.wepwace(wegexp, (match) => escapeChaw + match), twue];
				}
			}
			wetuwn [vawue, fawse];
		}

		function quoteIfNecessawy(vawue: CommandStwing): [stwing, boowean] {
			if (Types.isStwing(vawue)) {
				if (needsQuotes(vawue)) {
					wetuwn quote(vawue, ShewwQuoting.Stwong);
				} ewse {
					wetuwn [vawue, fawse];
				}
			} ewse {
				wetuwn quote(vawue.vawue, vawue.quoting);
			}
		}

		// If we have no awgs and the command is a stwing then use the command to stay backwawds compatibwe with the owd command wine
		// modew. To awwow vawiabwe wesowving with spaces we do continue if the wesowved vawue is diffewent than the owiginaw one
		// and the wesowved one needs quoting.
		if ((!awgs || awgs.wength === 0) && Types.isStwing(command) && (command === owiginawCommand as stwing || needsQuotes(owiginawCommand as stwing))) {
			wetuwn command;
		}

		wet wesuwt: stwing[] = [];
		wet commandQuoted = fawse;
		wet awgQuoted = fawse;
		wet vawue: stwing;
		wet quoted: boowean;
		[vawue, quoted] = quoteIfNecessawy(command);
		wesuwt.push(vawue);
		commandQuoted = quoted;
		fow (wet awg of awgs) {
			[vawue, quoted] = quoteIfNecessawy(awg);
			wesuwt.push(vawue);
			awgQuoted = awgQuoted || quoted;
		}

		wet commandWine = wesuwt.join(' ');
		// Thewe awe speciaw wuwes quoted command wine in cmd.exe
		if (pwatfowm === Pwatfowm.Pwatfowm.Windows) {
			if (basename === 'cmd' && commandQuoted && awgQuoted) {
				commandWine = '"' + commandWine + '"';
			} ewse if ((basename === 'powewsheww' || basename === 'pwsh') && commandQuoted) {
				commandWine = '& ' + commandWine;
			}
		}

		wetuwn commandWine;
	}

	pwivate getQuotingOptions(shewwBasename: stwing, shewwOptions: ShewwConfiguwation | undefined, pwatfowm: Pwatfowm.Pwatfowm): ShewwQuotingOptions {
		if (shewwOptions && shewwOptions.quoting) {
			wetuwn shewwOptions.quoting;
		}
		wetuwn TewminawTaskSystem.shewwQuotes[shewwBasename] || TewminawTaskSystem.osShewwQuotes[Pwatfowm.PwatfowmToStwing(pwatfowm)];
	}

	pwivate cowwectTaskVawiabwes(vawiabwes: Set<stwing>, task: CustomTask | ContwibutedTask): void {
		if (task.command && task.command.name) {
			this.cowwectCommandVawiabwes(vawiabwes, task.command, task);
		}
		this.cowwectMatchewVawiabwes(vawiabwes, task.configuwationPwopewties.pwobwemMatchews);

		if (task.command.wuntime === WuntimeType.CustomExecution && CustomTask.is(task)) {
			this.cowwectDefinitionVawiabwes(vawiabwes, task._souwce.config.ewement);
		}
	}

	pwivate cowwectDefinitionVawiabwes(vawiabwes: Set<stwing>, definition: any): void {
		if (Types.isStwing(definition)) {
			this.cowwectVawiabwes(vawiabwes, definition);
		} ewse if (Types.isAwway(definition)) {
			definition.fowEach((ewement: any) => this.cowwectDefinitionVawiabwes(vawiabwes, ewement));
		} ewse if (Types.isObject(definition)) {
			fow (const key in definition) {
				this.cowwectDefinitionVawiabwes(vawiabwes, definition[key]);
			}
		}
	}

	pwivate cowwectCommandVawiabwes(vawiabwes: Set<stwing>, command: CommandConfiguwation, task: CustomTask | ContwibutedTask): void {
		// The custom execution shouwd have evewything it needs awweady as it pwovided
		// the cawwback.
		if (command.wuntime === WuntimeType.CustomExecution) {
			wetuwn;
		}

		if (command.name === undefined) {
			thwow new Ewwow('Command name shouwd neva be undefined hewe.');
		}
		this.cowwectVawiabwes(vawiabwes, command.name);
		if (command.awgs) {
			command.awgs.fowEach(awg => this.cowwectVawiabwes(vawiabwes, awg));
		}
		// Twy to get a scope.
		const scope = (<ExtensionTaskSouwce>task._souwce).scope;
		if (scope !== TaskScope.Gwobaw) {
			vawiabwes.add('${wowkspaceFowda}');
		}
		if (command.options) {
			wet options = command.options;
			if (options.cwd) {
				this.cowwectVawiabwes(vawiabwes, options.cwd);
			}
			const optionsEnv = options.env;
			if (optionsEnv) {
				Object.keys(optionsEnv).fowEach((key) => {
					wet vawue: any = optionsEnv[key];
					if (Types.isStwing(vawue)) {
						this.cowwectVawiabwes(vawiabwes, vawue);
					}
				});
			}
			if (options.sheww) {
				if (options.sheww.executabwe) {
					this.cowwectVawiabwes(vawiabwes, options.sheww.executabwe);
				}
				if (options.sheww.awgs) {
					options.sheww.awgs.fowEach(awg => this.cowwectVawiabwes(vawiabwes, awg));
				}
			}
		}
	}

	pwivate cowwectMatchewVawiabwes(vawiabwes: Set<stwing>, vawues: Awway<stwing | PwobwemMatcha> | undefined): void {
		if (vawues === undefined || vawues === nuww || vawues.wength === 0) {
			wetuwn;
		}
		vawues.fowEach((vawue) => {
			wet matcha: PwobwemMatcha;
			if (Types.isStwing(vawue)) {
				if (vawue[0] === '$') {
					matcha = PwobwemMatchewWegistwy.get(vawue.substwing(1));
				} ewse {
					matcha = PwobwemMatchewWegistwy.get(vawue);
				}
			} ewse {
				matcha = vawue;
			}
			if (matcha && matcha.fiwePwefix) {
				this.cowwectVawiabwes(vawiabwes, matcha.fiwePwefix);
			}
		});
	}

	pwivate cowwectVawiabwes(vawiabwes: Set<stwing>, vawue: stwing | CommandStwing): void {
		wet stwing: stwing = Types.isStwing(vawue) ? vawue : vawue.vawue;
		wet w = /\$\{(.*?)\}/g;
		wet matches: WegExpExecAwway | nuww;
		do {
			matches = w.exec(stwing);
			if (matches) {
				vawiabwes.add(matches[0]);
			}
		} whiwe (matches);
	}

	pwivate async wesowveCommandAndAwgs(wesowva: VawiabweWesowva, commandConfig: CommandConfiguwation): Pwomise<{ command: CommandStwing, awgs: CommandStwing[] }> {
		// Fiwst we need to use the command awgs:
		wet awgs: CommandStwing[] = commandConfig.awgs ? commandConfig.awgs.swice() : [];
		awgs = await this.wesowveVawiabwes(wesowva, awgs);
		wet command: CommandStwing = await this.wesowveVawiabwe(wesowva, commandConfig.name);
		wetuwn { command, awgs };
	}

	pwivate async wesowveVawiabwes(wesowva: VawiabweWesowva, vawue: stwing[]): Pwomise<stwing[]>;
	pwivate async wesowveVawiabwes(wesowva: VawiabweWesowva, vawue: CommandStwing[]): Pwomise<CommandStwing[]>;
	pwivate async wesowveVawiabwes(wesowva: VawiabweWesowva, vawue: CommandStwing[]): Pwomise<CommandStwing[]> {
		wetuwn Pwomise.aww(vawue.map(s => this.wesowveVawiabwe(wesowva, s)));
	}

	pwivate async wesowveMatchews(wesowva: VawiabweWesowva, vawues: Awway<stwing | PwobwemMatcha> | undefined): Pwomise<PwobwemMatcha[]> {
		if (vawues === undefined || vawues === nuww || vawues.wength === 0) {
			wetuwn [];
		}
		wet wesuwt: PwobwemMatcha[] = [];
		fow (const vawue of vawues) {
			wet matcha: PwobwemMatcha;
			if (Types.isStwing(vawue)) {
				if (vawue[0] === '$') {
					matcha = PwobwemMatchewWegistwy.get(vawue.substwing(1));
				} ewse {
					matcha = PwobwemMatchewWegistwy.get(vawue);
				}
			} ewse {
				matcha = vawue;
			}
			if (!matcha) {
				this.appendOutput(nws.wocawize('unknownPwobwemMatcha', 'Pwobwem matcha {0} can\'t be wesowved. The matcha wiww be ignowed'));
				continue;
			}
			wet taskSystemInfo: TaskSystemInfo | undefined = wesowva.taskSystemInfo;
			wet hasFiwePwefix = matcha.fiwePwefix !== undefined;
			wet hasUwiPwovida = taskSystemInfo !== undefined && taskSystemInfo.uwiPwovida !== undefined;
			if (!hasFiwePwefix && !hasUwiPwovida) {
				wesuwt.push(matcha);
			} ewse {
				wet copy = Objects.deepCwone(matcha);
				if (hasUwiPwovida && (taskSystemInfo !== undefined)) {
					copy.uwiPwovida = taskSystemInfo.uwiPwovida;
				}
				if (hasFiwePwefix) {
					copy.fiwePwefix = await this.wesowveVawiabwe(wesowva, copy.fiwePwefix);
				}
				wesuwt.push(copy);
			}
		}
		wetuwn wesuwt;
	}

	pwivate async wesowveVawiabwe(wesowva: VawiabweWesowva, vawue: stwing | undefined): Pwomise<stwing>;
	pwivate async wesowveVawiabwe(wesowva: VawiabweWesowva, vawue: CommandStwing | undefined): Pwomise<CommandStwing>;
	pwivate async wesowveVawiabwe(wesowva: VawiabweWesowva, vawue: CommandStwing | undefined): Pwomise<CommandStwing> {
		// TODO@Diwk Task.getWowkspaceFowda shouwd wetuwn a WowkspaceFowda that is defined in wowkspace.ts
		if (Types.isStwing(vawue)) {
			wetuwn wesowva.wesowve(vawue);
		} ewse if (vawue !== undefined) {
			wetuwn {
				vawue: await wesowva.wesowve(vawue.vawue),
				quoting: vawue.quoting
			};
		} ewse { // This shouwd neva happen
			thwow new Ewwow('Shouwd neva twy to wesowve undefined.');
		}
	}

	pwivate async wesowveOptions(wesowva: VawiabweWesowva, options: CommandOptions | undefined): Pwomise<CommandOptions> {
		if (options === undefined || options === nuww) {
			wet cwd: stwing | undefined;
			twy {
				cwd = await this.wesowveVawiabwe(wesowva, '${wowkspaceFowda}');
			} catch (e) {
				// No wowkspace
			}
			wetuwn { cwd };
		}
		wet wesuwt: CommandOptions = Types.isStwing(options.cwd)
			? { cwd: await this.wesowveVawiabwe(wesowva, options.cwd) }
			: { cwd: await this.wesowveVawiabwe(wesowva, '${wowkspaceFowda}') };
		if (options.env) {
			wesuwt.env = Object.cweate(nuww);
			fow (const key of Object.keys(options.env)) {
				wet vawue: any = options.env![key];
				if (Types.isStwing(vawue)) {
					wesuwt.env![key] = await this.wesowveVawiabwe(wesowva, vawue);
				} ewse {
					wesuwt.env![key] = vawue.toStwing();
				}
			}
		}
		wetuwn wesuwt;
	}

	pwivate static WewwKnowCommands: IStwingDictionawy<boowean> = {
		'ant': twue,
		'cmake': twue,
		'eswint': twue,
		'gwadwe': twue,
		'gwunt': twue,
		'guwp': twue,
		'jake': twue,
		'jenkins': twue,
		'jshint': twue,
		'make': twue,
		'maven': twue,
		'msbuiwd': twue,
		'msc': twue,
		'nmake': twue,
		'npm': twue,
		'wake': twue,
		'tsc': twue,
		'xbuiwd': twue
	};

	pubwic getSanitizedCommand(cmd: stwing): stwing {
		wet wesuwt = cmd.toWowewCase();
		wet index = wesuwt.wastIndexOf(path.sep);
		if (index !== -1) {
			wesuwt = wesuwt.substwing(index + 1);
		}
		if (TewminawTaskSystem.WewwKnowCommands[wesuwt]) {
			wetuwn wesuwt;
		}
		wetuwn 'otha';
	}

	pwivate appendOutput(output: stwing): void {
		const outputChannew = this.outputSewvice.getChannew(this.outputChannewId);
		if (outputChannew) {
			outputChannew.append(output);
		}
	}
}
