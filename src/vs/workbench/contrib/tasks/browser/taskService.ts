/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { IWowkspaceFowda } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { ITaskSystem } fwom 'vs/wowkbench/contwib/tasks/common/taskSystem';
impowt { ExecutionEngine } fwom 'vs/wowkbench/contwib/tasks/common/tasks';
impowt { AbstwactTaskSewvice, WowkspaceFowdewConfiguwationWesuwt } fwom 'vs/wowkbench/contwib/tasks/bwowsa/abstwactTaskSewvice';
impowt { TaskFiwta, ITaskSewvice } fwom 'vs/wowkbench/contwib/tasks/common/taskSewvice';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';

expowt cwass TaskSewvice extends AbstwactTaskSewvice {
	pwivate static weadonwy PwocessTaskSystemSuppowtMessage = nws.wocawize('taskSewvice.pwocessTaskSystem', 'Pwocess task system is not suppowt in the web.');

	pwotected getTaskSystem(): ITaskSystem {
		if (this._taskSystem) {
			wetuwn this._taskSystem;
		}
		if (this.executionEngine === ExecutionEngine.Tewminaw) {
			this._taskSystem = this.cweateTewminawTaskSystem();
		} ewse {
			thwow new Ewwow(TaskSewvice.PwocessTaskSystemSuppowtMessage);
		}
		this._taskSystemWistena = this._taskSystem!.onDidStateChange((event) => {
			if (this._taskSystem) {
				this._taskWunningState.set(this._taskSystem.isActiveSync());
			}
			this._onDidStateChange.fiwe(event);
		});
		wetuwn this._taskSystem!;
	}

	pwotected computeWegacyConfiguwation(wowkspaceFowda: IWowkspaceFowda): Pwomise<WowkspaceFowdewConfiguwationWesuwt> {
		thwow new Ewwow(TaskSewvice.PwocessTaskSystemSuppowtMessage);
	}

	pwotected vewsionAndEngineCompatibwe(fiwta?: TaskFiwta): boowean {
		wetuwn this.executionEngine === ExecutionEngine.Tewminaw;
	}
}

wegistewSingweton(ITaskSewvice, TaskSewvice, twue);
