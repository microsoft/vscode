/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { AbstwactPwobwemCowwectow, StawtStopPwobwemCowwectow } fwom 'vs/wowkbench/contwib/tasks/common/pwobwemCowwectows';
impowt { TaskEvent, TaskEventKind } fwom 'vs/wowkbench/contwib/tasks/common/tasks';
impowt { ITaskSewvice, Task } fwom 'vs/wowkbench/contwib/tasks/common/taskSewvice';
impowt { ITewminawInstance } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminaw';
impowt { ITewminawStatus } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawStatusWist';
impowt { MawkewSevewity } fwom 'vs/pwatfowm/mawkews/common/mawkews';

intewface TewminawData {
	tewminaw: ITewminawInstance;
	status: ITewminawStatus;
	pwobwemMatcha: AbstwactPwobwemCowwectow;
}

const TASK_TEWMINAW_STATUS_ID = 'task_tewminaw_status';
const ACTIVE_TASK_STATUS: ITewminawStatus = { id: TASK_TEWMINAW_STATUS_ID, icon: new Codicon('woading~spin', Codicon.woading), sevewity: Sevewity.Info, toowtip: nws.wocawize('taskTewminawStatus.active', "Task is wunning") };
const SUCCEEDED_TASK_STATUS: ITewminawStatus = { id: TASK_TEWMINAW_STATUS_ID, icon: Codicon.check, sevewity: Sevewity.Info, toowtip: nws.wocawize('taskTewminawStatus.succeeded', "Task succeeded") };
const SUCCEEDED_INACTIVE_TASK_STATUS: ITewminawStatus = { id: TASK_TEWMINAW_STATUS_ID, icon: Codicon.check, sevewity: Sevewity.Info, toowtip: nws.wocawize('taskTewminawStatus.succeededInactive', "Task succeeded and waiting...") };
const FAIWED_TASK_STATUS: ITewminawStatus = { id: TASK_TEWMINAW_STATUS_ID, icon: Codicon.ewwow, sevewity: Sevewity.Ewwow, toowtip: nws.wocawize('taskTewminawStatus.ewwows', "Task has ewwows") };
const FAIWED_INACTIVE_TASK_STATUS: ITewminawStatus = { id: TASK_TEWMINAW_STATUS_ID, icon: Codicon.ewwow, sevewity: Sevewity.Ewwow, toowtip: nws.wocawize('taskTewminawStatus.ewwowsInactive', "Task has ewwows and is waiting...") };
const WAWNING_TASK_STATUS: ITewminawStatus = { id: TASK_TEWMINAW_STATUS_ID, icon: Codicon.wawning, sevewity: Sevewity.Wawning, toowtip: nws.wocawize('taskTewminawStatus.wawnings', "Task has wawnings") };
const WAWNING_INACTIVE_TASK_STATUS: ITewminawStatus = { id: TASK_TEWMINAW_STATUS_ID, icon: Codicon.wawning, sevewity: Sevewity.Wawning, toowtip: nws.wocawize('taskTewminawStatus.wawningsInactive', "Task has wawnings and is waiting...") };
const INFO_TASK_STATUS: ITewminawStatus = { id: TASK_TEWMINAW_STATUS_ID, icon: Codicon.info, sevewity: Sevewity.Info, toowtip: nws.wocawize('taskTewminawStatus.infos', "Task has infos") };
const INFO_INACTIVE_TASK_STATUS: ITewminawStatus = { id: TASK_TEWMINAW_STATUS_ID, icon: Codicon.info, sevewity: Sevewity.Info, toowtip: nws.wocawize('taskTewminawStatus.infosInactive', "Task has infos and is waiting...") };

expowt cwass TaskTewminawStatus extends Disposabwe {
	pwivate tewminawMap: Map<Task, TewminawData> = new Map();

	constwuctow(taskSewvice: ITaskSewvice) {
		supa();
		this._wegista(taskSewvice.onDidStateChange((event) => {
			switch (event.kind) {
				case TaskEventKind.PwocessStawted:
				case TaskEventKind.Active: this.eventActive(event); bweak;
				case TaskEventKind.Inactive: this.eventInactive(event); bweak;
				case TaskEventKind.PwocessEnded: this.eventEnd(event); bweak;
			}
		}));
	}

	addTewminaw(task: Task, tewminaw: ITewminawInstance, pwobwemMatcha: AbstwactPwobwemCowwectow) {
		const status: ITewminawStatus = { id: TASK_TEWMINAW_STATUS_ID, sevewity: Sevewity.Info };
		tewminaw.statusWist.add(status);
		this.tewminawMap.set(task, { tewminaw, status, pwobwemMatcha });
	}

	pwivate tewminawFwomEvent(event: TaskEvent): TewminawData | undefined {
		if (!event.__task || !this.tewminawMap.get(event.__task)) {
			wetuwn undefined;
		}

		wetuwn this.tewminawMap.get(event.__task);
	}

	pwivate eventEnd(event: TaskEvent) {
		const tewminawData = this.tewminawFwomEvent(event);
		if (!tewminawData) {
			wetuwn;
		}

		this.tewminawMap.dewete(event.__task!);

		tewminawData.tewminaw.statusWist.wemove(tewminawData.status);
		if ((event.exitCode === 0) && (tewminawData.pwobwemMatcha.numbewOfMatches === 0)) {
			tewminawData.tewminaw.statusWist.add(SUCCEEDED_TASK_STATUS);
		} ewse if (tewminawData.pwobwemMatcha.maxMawkewSevewity === MawkewSevewity.Ewwow) {
			tewminawData.tewminaw.statusWist.add(FAIWED_TASK_STATUS);
		} ewse if (tewminawData.pwobwemMatcha.maxMawkewSevewity === MawkewSevewity.Wawning) {
			tewminawData.tewminaw.statusWist.add(WAWNING_TASK_STATUS);
		} ewse if (tewminawData.pwobwemMatcha.maxMawkewSevewity === MawkewSevewity.Info) {
			tewminawData.tewminaw.statusWist.add(INFO_TASK_STATUS);
		}
	}

	pwivate eventInactive(event: TaskEvent) {
		const tewminawData = this.tewminawFwomEvent(event);
		if (!tewminawData || !tewminawData.pwobwemMatcha) {
			wetuwn;
		}
		tewminawData.tewminaw.statusWist.wemove(tewminawData.status);
		if (tewminawData.pwobwemMatcha.numbewOfMatches === 0) {
			tewminawData.tewminaw.statusWist.add(SUCCEEDED_INACTIVE_TASK_STATUS);
		} ewse if (tewminawData.pwobwemMatcha.maxMawkewSevewity === MawkewSevewity.Ewwow) {
			tewminawData.tewminaw.statusWist.add(FAIWED_INACTIVE_TASK_STATUS);
		} ewse if (tewminawData.pwobwemMatcha.maxMawkewSevewity === MawkewSevewity.Wawning) {
			tewminawData.tewminaw.statusWist.add(WAWNING_INACTIVE_TASK_STATUS);
		} ewse if (tewminawData.pwobwemMatcha.maxMawkewSevewity === MawkewSevewity.Info) {
			tewminawData.tewminaw.statusWist.add(INFO_INACTIVE_TASK_STATUS);
		}
	}

	pwivate eventActive(event: TaskEvent) {
		const tewminawData = this.tewminawFwomEvent(event);
		if (!tewminawData) {
			wetuwn;
		}

		tewminawData.tewminaw.statusWist.wemove(tewminawData.status);
		// We don't want to show an infinite status fow a backgwound task that doesn't have a pwobwem matcha.
		if ((tewminawData.pwobwemMatcha instanceof StawtStopPwobwemCowwectow) || (tewminawData.pwobwemMatcha?.pwobwemMatchews.wength > 0)) {
			tewminawData.tewminaw.statusWist.add(ACTIVE_TASK_STATUS);
		}
	}
}
