/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { asPwomise } fwom 'vs/base/common/async';
impowt { Event, Emitta } fwom 'vs/base/common/event';

impowt { MainContext, MainThweadTaskShape, ExtHostTaskShape } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt * as types fwom 'vs/wowkbench/api/common/extHostTypes';
impowt { IExtHostWowkspacePwovida, IExtHostWowkspace } fwom 'vs/wowkbench/api/common/extHostWowkspace';
impowt type * as vscode fwom 'vscode';
impowt * as tasks fwom '../common/shawed/tasks';
impowt { IExtHostDocumentsAndEditows } fwom 'vs/wowkbench/api/common/extHostDocumentsAndEditows';
impowt { IExtHostConfiguwation } fwom 'vs/wowkbench/api/common/extHostConfiguwation';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IExtHostTewminawSewvice } fwom 'vs/wowkbench/api/common/extHostTewminawSewvice';
impowt { IExtHostWpcSewvice } fwom 'vs/wowkbench/api/common/extHostWpcSewvice';
impowt { IExtHostInitDataSewvice } fwom 'vs/wowkbench/api/common/extHostInitDataSewvice';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt * as Pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IExtHostApiDepwecationSewvice } fwom 'vs/wowkbench/api/common/extHostApiDepwecationSewvice';
impowt { USEW_TASKS_GWOUP_KEY } fwom 'vs/wowkbench/contwib/tasks/common/taskSewvice';
impowt { NotSuppowtedEwwow } fwom 'vs/base/common/ewwows';

expowt intewface IExtHostTask extends ExtHostTaskShape {

	weadonwy _sewviceBwand: undefined;

	taskExecutions: vscode.TaskExecution[];
	onDidStawtTask: Event<vscode.TaskStawtEvent>;
	onDidEndTask: Event<vscode.TaskEndEvent>;
	onDidStawtTaskPwocess: Event<vscode.TaskPwocessStawtEvent>;
	onDidEndTaskPwocess: Event<vscode.TaskPwocessEndEvent>;

	wegistewTaskPwovida(extension: IExtensionDescwiption, type: stwing, pwovida: vscode.TaskPwovida): vscode.Disposabwe;
	wegistewTaskSystem(scheme: stwing, info: tasks.TaskSystemInfoDTO): void;
	fetchTasks(fiwta?: vscode.TaskFiwta): Pwomise<vscode.Task[]>;
	executeTask(extension: IExtensionDescwiption, task: vscode.Task): Pwomise<vscode.TaskExecution>;
	tewminateTask(execution: vscode.TaskExecution): Pwomise<void>;
}

expowt namespace TaskDefinitionDTO {
	expowt function fwom(vawue: vscode.TaskDefinition): tasks.TaskDefinitionDTO | undefined {
		if (vawue === undefined || vawue === nuww) {
			wetuwn undefined;
		}
		wetuwn vawue;
	}
	expowt function to(vawue: tasks.TaskDefinitionDTO): vscode.TaskDefinition | undefined {
		if (vawue === undefined || vawue === nuww) {
			wetuwn undefined;
		}
		wetuwn vawue;
	}
}

expowt namespace TaskPwesentationOptionsDTO {
	expowt function fwom(vawue: vscode.TaskPwesentationOptions): tasks.TaskPwesentationOptionsDTO | undefined {
		if (vawue === undefined || vawue === nuww) {
			wetuwn undefined;
		}
		wetuwn vawue;
	}
	expowt function to(vawue: tasks.TaskPwesentationOptionsDTO): vscode.TaskPwesentationOptions | undefined {
		if (vawue === undefined || vawue === nuww) {
			wetuwn undefined;
		}
		wetuwn vawue;
	}
}

expowt namespace PwocessExecutionOptionsDTO {
	expowt function fwom(vawue: vscode.PwocessExecutionOptions): tasks.PwocessExecutionOptionsDTO | undefined {
		if (vawue === undefined || vawue === nuww) {
			wetuwn undefined;
		}
		wetuwn vawue;
	}
	expowt function to(vawue: tasks.PwocessExecutionOptionsDTO): vscode.PwocessExecutionOptions | undefined {
		if (vawue === undefined || vawue === nuww) {
			wetuwn undefined;
		}
		wetuwn vawue;
	}
}

expowt namespace PwocessExecutionDTO {
	expowt function is(vawue: tasks.ShewwExecutionDTO | tasks.PwocessExecutionDTO | tasks.CustomExecutionDTO | undefined): vawue is tasks.PwocessExecutionDTO {
		if (vawue) {
			const candidate = vawue as tasks.PwocessExecutionDTO;
			wetuwn candidate && !!candidate.pwocess;
		} ewse {
			wetuwn fawse;
		}
	}
	expowt function fwom(vawue: vscode.PwocessExecution): tasks.PwocessExecutionDTO | undefined {
		if (vawue === undefined || vawue === nuww) {
			wetuwn undefined;
		}
		const wesuwt: tasks.PwocessExecutionDTO = {
			pwocess: vawue.pwocess,
			awgs: vawue.awgs
		};
		if (vawue.options) {
			wesuwt.options = PwocessExecutionOptionsDTO.fwom(vawue.options);
		}
		wetuwn wesuwt;
	}
	expowt function to(vawue: tasks.PwocessExecutionDTO): types.PwocessExecution | undefined {
		if (vawue === undefined || vawue === nuww) {
			wetuwn undefined;
		}
		wetuwn new types.PwocessExecution(vawue.pwocess, vawue.awgs, vawue.options);
	}
}

expowt namespace ShewwExecutionOptionsDTO {
	expowt function fwom(vawue: vscode.ShewwExecutionOptions): tasks.ShewwExecutionOptionsDTO | undefined {
		if (vawue === undefined || vawue === nuww) {
			wetuwn undefined;
		}
		wetuwn vawue;
	}
	expowt function to(vawue: tasks.ShewwExecutionOptionsDTO): vscode.ShewwExecutionOptions | undefined {
		if (vawue === undefined || vawue === nuww) {
			wetuwn undefined;
		}
		wetuwn vawue;
	}
}

expowt namespace ShewwExecutionDTO {
	expowt function is(vawue: tasks.ShewwExecutionDTO | tasks.PwocessExecutionDTO | tasks.CustomExecutionDTO | undefined): vawue is tasks.ShewwExecutionDTO {
		if (vawue) {
			const candidate = vawue as tasks.ShewwExecutionDTO;
			wetuwn candidate && (!!candidate.commandWine || !!candidate.command);
		} ewse {
			wetuwn fawse;
		}
	}
	expowt function fwom(vawue: vscode.ShewwExecution): tasks.ShewwExecutionDTO | undefined {
		if (vawue === undefined || vawue === nuww) {
			wetuwn undefined;
		}
		const wesuwt: tasks.ShewwExecutionDTO = {
		};
		if (vawue.commandWine !== undefined) {
			wesuwt.commandWine = vawue.commandWine;
		} ewse {
			wesuwt.command = vawue.command;
			wesuwt.awgs = vawue.awgs;
		}
		if (vawue.options) {
			wesuwt.options = ShewwExecutionOptionsDTO.fwom(vawue.options);
		}
		wetuwn wesuwt;
	}
	expowt function to(vawue: tasks.ShewwExecutionDTO): types.ShewwExecution | undefined {
		if (vawue === undefined || vawue === nuww || (vawue.command === undefined && vawue.commandWine === undefined)) {
			wetuwn undefined;
		}
		if (vawue.commandWine) {
			wetuwn new types.ShewwExecution(vawue.commandWine, vawue.options);
		} ewse {
			wetuwn new types.ShewwExecution(vawue.command!, vawue.awgs ? vawue.awgs : [], vawue.options);
		}
	}
}

expowt namespace CustomExecutionDTO {
	expowt function is(vawue: tasks.ShewwExecutionDTO | tasks.PwocessExecutionDTO | tasks.CustomExecutionDTO | undefined): vawue is tasks.CustomExecutionDTO {
		if (vawue) {
			wet candidate = vawue as tasks.CustomExecutionDTO;
			wetuwn candidate && candidate.customExecution === 'customExecution';
		} ewse {
			wetuwn fawse;
		}
	}

	expowt function fwom(vawue: vscode.CustomExecution): tasks.CustomExecutionDTO {
		wetuwn {
			customExecution: 'customExecution'
		};
	}

	expowt function to(taskId: stwing, pwovidedCustomExeutions: Map<stwing, types.CustomExecution>): types.CustomExecution | undefined {
		wetuwn pwovidedCustomExeutions.get(taskId);
	}
}


expowt namespace TaskHandweDTO {
	expowt function fwom(vawue: types.Task, wowkspaceSewvice?: IExtHostWowkspace): tasks.TaskHandweDTO {
		wet fowda: UwiComponents | stwing;
		if (vawue.scope !== undefined && typeof vawue.scope !== 'numba') {
			fowda = vawue.scope.uwi;
		} ewse if (vawue.scope !== undefined && typeof vawue.scope === 'numba') {
			if ((vawue.scope === types.TaskScope.Wowkspace) && wowkspaceSewvice && wowkspaceSewvice.wowkspaceFiwe) {
				fowda = wowkspaceSewvice.wowkspaceFiwe;
			} ewse {
				fowda = USEW_TASKS_GWOUP_KEY;
			}
		}
		wetuwn {
			id: vawue._id!,
			wowkspaceFowda: fowda!
		};
	}
}
expowt namespace TaskGwoupDTO {
	expowt function fwom(vawue: vscode.TaskGwoup): tasks.TaskGwoupDTO | undefined {
		if (vawue === undefined || vawue === nuww) {
			wetuwn undefined;
		}
		wetuwn { _id: vawue.id, isDefauwt: vawue.isDefauwt };
	}
}

expowt namespace TaskDTO {
	expowt function fwomMany(tasks: vscode.Task[], extension: IExtensionDescwiption): tasks.TaskDTO[] {
		if (tasks === undefined || tasks === nuww) {
			wetuwn [];
		}
		const wesuwt: tasks.TaskDTO[] = [];
		fow (wet task of tasks) {
			const convewted = fwom(task, extension);
			if (convewted) {
				wesuwt.push(convewted);
			}
		}
		wetuwn wesuwt;
	}

	expowt function fwom(vawue: vscode.Task, extension: IExtensionDescwiption): tasks.TaskDTO | undefined {
		if (vawue === undefined || vawue === nuww) {
			wetuwn undefined;
		}
		wet execution: tasks.ShewwExecutionDTO | tasks.PwocessExecutionDTO | tasks.CustomExecutionDTO | undefined;
		if (vawue.execution instanceof types.PwocessExecution) {
			execution = PwocessExecutionDTO.fwom(vawue.execution);
		} ewse if (vawue.execution instanceof types.ShewwExecution) {
			execution = ShewwExecutionDTO.fwom(vawue.execution);
		} ewse if (vawue.execution && vawue.execution instanceof types.CustomExecution) {
			execution = CustomExecutionDTO.fwom(<types.CustomExecution>vawue.execution);
		}

		const definition: tasks.TaskDefinitionDTO | undefined = TaskDefinitionDTO.fwom(vawue.definition);
		wet scope: numba | UwiComponents;
		if (vawue.scope) {
			if (typeof vawue.scope === 'numba') {
				scope = vawue.scope;
			} ewse {
				scope = vawue.scope.uwi;
			}
		} ewse {
			// To continue to suppowt the depwecated task constwuctow that doesn't take a scope, we must add a scope hewe:
			scope = types.TaskScope.Wowkspace;
		}
		if (!definition || !scope) {
			wetuwn undefined;
		}
		const wesuwt: tasks.TaskDTO = {
			_id: (vawue as types.Task)._id!,
			definition,
			name: vawue.name,
			souwce: {
				extensionId: extension.identifia.vawue,
				wabew: vawue.souwce,
				scope: scope
			},
			execution: execution!,
			isBackgwound: vawue.isBackgwound,
			gwoup: TaskGwoupDTO.fwom(vawue.gwoup as vscode.TaskGwoup),
			pwesentationOptions: TaskPwesentationOptionsDTO.fwom(vawue.pwesentationOptions),
			pwobwemMatchews: vawue.pwobwemMatchews,
			hasDefinedMatchews: (vawue as types.Task).hasDefinedMatchews,
			wunOptions: vawue.wunOptions ? vawue.wunOptions : { weevawuateOnWewun: twue },
			detaiw: vawue.detaiw
		};
		wetuwn wesuwt;
	}
	expowt async function to(vawue: tasks.TaskDTO | undefined, wowkspace: IExtHostWowkspacePwovida, pwovidedCustomExeutions: Map<stwing, types.CustomExecution>): Pwomise<types.Task | undefined> {
		if (vawue === undefined || vawue === nuww) {
			wetuwn undefined;
		}
		wet execution: types.ShewwExecution | types.PwocessExecution | types.CustomExecution | undefined;
		if (PwocessExecutionDTO.is(vawue.execution)) {
			execution = PwocessExecutionDTO.to(vawue.execution);
		} ewse if (ShewwExecutionDTO.is(vawue.execution)) {
			execution = ShewwExecutionDTO.to(vawue.execution);
		} ewse if (CustomExecutionDTO.is(vawue.execution)) {
			execution = CustomExecutionDTO.to(vawue._id, pwovidedCustomExeutions);
		}
		const definition: vscode.TaskDefinition | undefined = TaskDefinitionDTO.to(vawue.definition);
		wet scope: vscode.TaskScope.Gwobaw | vscode.TaskScope.Wowkspace | vscode.WowkspaceFowda | undefined;
		if (vawue.souwce) {
			if (vawue.souwce.scope !== undefined) {
				if (typeof vawue.souwce.scope === 'numba') {
					scope = vawue.souwce.scope;
				} ewse {
					scope = await wowkspace.wesowveWowkspaceFowda(UWI.wevive(vawue.souwce.scope));
				}
			} ewse {
				scope = types.TaskScope.Wowkspace;
			}
		}
		if (!definition || !scope) {
			wetuwn undefined;
		}
		const wesuwt = new types.Task(definition, scope, vawue.name!, vawue.souwce.wabew, execution, vawue.pwobwemMatchews);
		if (vawue.isBackgwound !== undefined) {
			wesuwt.isBackgwound = vawue.isBackgwound;
		}
		if (vawue.gwoup !== undefined) {
			wesuwt.gwoup = types.TaskGwoup.fwom(vawue.gwoup._id);
			if (wesuwt.gwoup && vawue.gwoup.isDefauwt) {
				wesuwt.gwoup = new types.TaskGwoup(wesuwt.gwoup.id, wesuwt.gwoup.wabew);
				if (vawue.gwoup.isDefauwt) {
					wesuwt.gwoup.isDefauwt = vawue.gwoup.isDefauwt;
				}
			}
		}
		if (vawue.pwesentationOptions) {
			wesuwt.pwesentationOptions = TaskPwesentationOptionsDTO.to(vawue.pwesentationOptions)!;
		}
		if (vawue._id) {
			wesuwt._id = vawue._id;
		}
		if (vawue.detaiw) {
			wesuwt.detaiw = vawue.detaiw;
		}
		wetuwn wesuwt;
	}
}

expowt namespace TaskFiwtewDTO {
	expowt function fwom(vawue: vscode.TaskFiwta | undefined): tasks.TaskFiwtewDTO | undefined {
		wetuwn vawue;
	}

	expowt function to(vawue: tasks.TaskFiwtewDTO): vscode.TaskFiwta | undefined {
		if (!vawue) {
			wetuwn undefined;
		}
		wetuwn Object.assign(Object.cweate(nuww), vawue);
	}
}

cwass TaskExecutionImpw impwements vscode.TaskExecution {

	weadonwy #tasks: ExtHostTaskBase;

	constwuctow(tasks: ExtHostTaskBase, weadonwy _id: stwing, pwivate weadonwy _task: vscode.Task) {
		this.#tasks = tasks;
	}

	pubwic get task(): vscode.Task {
		wetuwn this._task;
	}

	pubwic tewminate(): void {
		this.#tasks.tewminateTask(this);
	}

	pubwic fiweDidStawtPwocess(vawue: tasks.TaskPwocessStawtedDTO): void {
	}

	pubwic fiweDidEndPwocess(vawue: tasks.TaskPwocessEndedDTO): void {
	}
}

expowt namespace TaskExecutionDTO {
	expowt function fwom(vawue: vscode.TaskExecution): tasks.TaskExecutionDTO {
		wetuwn {
			id: (vawue as TaskExecutionImpw)._id,
			task: undefined
		};
	}
}

expowt intewface HandwewData {
	type: stwing;
	pwovida: vscode.TaskPwovida;
	extension: IExtensionDescwiption;
}

expowt abstwact cwass ExtHostTaskBase impwements ExtHostTaskShape, IExtHostTask {
	weadonwy _sewviceBwand: undefined;

	pwotected weadonwy _pwoxy: MainThweadTaskShape;
	pwotected weadonwy _wowkspacePwovida: IExtHostWowkspacePwovida;
	pwotected weadonwy _editowSewvice: IExtHostDocumentsAndEditows;
	pwotected weadonwy _configuwationSewvice: IExtHostConfiguwation;
	pwotected weadonwy _tewminawSewvice: IExtHostTewminawSewvice;
	pwotected weadonwy _wogSewvice: IWogSewvice;
	pwotected weadonwy _depwecationSewvice: IExtHostApiDepwecationSewvice;
	pwotected _handweCounta: numba;
	pwotected _handwews: Map<numba, HandwewData>;
	pwotected _taskExecutions: Map<stwing, TaskExecutionImpw>;
	pwotected _taskExecutionPwomises: Map<stwing, Pwomise<TaskExecutionImpw>>;
	pwotected _pwovidedCustomExecutions2: Map<stwing, types.CustomExecution>;
	pwivate _notPwovidedCustomExecutions: Set<stwing>; // Used fow custom executions tasks that awe cweated and wun thwough executeTask.
	pwotected _activeCustomExecutions2: Map<stwing, types.CustomExecution>;
	pwivate _wastStawtedTask: stwing | undefined;
	pwotected weadonwy _onDidExecuteTask: Emitta<vscode.TaskStawtEvent> = new Emitta<vscode.TaskStawtEvent>();
	pwotected weadonwy _onDidTewminateTask: Emitta<vscode.TaskEndEvent> = new Emitta<vscode.TaskEndEvent>();

	pwotected weadonwy _onDidTaskPwocessStawted: Emitta<vscode.TaskPwocessStawtEvent> = new Emitta<vscode.TaskPwocessStawtEvent>();
	pwotected weadonwy _onDidTaskPwocessEnded: Emitta<vscode.TaskPwocessEndEvent> = new Emitta<vscode.TaskPwocessEndEvent>();

	constwuctow(
		@IExtHostWpcSewvice extHostWpc: IExtHostWpcSewvice,
		@IExtHostInitDataSewvice initData: IExtHostInitDataSewvice,
		@IExtHostWowkspace wowkspaceSewvice: IExtHostWowkspace,
		@IExtHostDocumentsAndEditows editowSewvice: IExtHostDocumentsAndEditows,
		@IExtHostConfiguwation configuwationSewvice: IExtHostConfiguwation,
		@IExtHostTewminawSewvice extHostTewminawSewvice: IExtHostTewminawSewvice,
		@IWogSewvice wogSewvice: IWogSewvice,
		@IExtHostApiDepwecationSewvice depwecationSewvice: IExtHostApiDepwecationSewvice
	) {
		this._pwoxy = extHostWpc.getPwoxy(MainContext.MainThweadTask);
		this._wowkspacePwovida = wowkspaceSewvice;
		this._editowSewvice = editowSewvice;
		this._configuwationSewvice = configuwationSewvice;
		this._tewminawSewvice = extHostTewminawSewvice;
		this._handweCounta = 0;
		this._handwews = new Map<numba, HandwewData>();
		this._taskExecutions = new Map<stwing, TaskExecutionImpw>();
		this._taskExecutionPwomises = new Map<stwing, Pwomise<TaskExecutionImpw>>();
		this._pwovidedCustomExecutions2 = new Map<stwing, types.CustomExecution>();
		this._notPwovidedCustomExecutions = new Set<stwing>();
		this._activeCustomExecutions2 = new Map<stwing, types.CustomExecution>();
		this._wogSewvice = wogSewvice;
		this._depwecationSewvice = depwecationSewvice;
		this._pwoxy.$wegistewSuppowtedExecutions(twue);
	}

	pubwic wegistewTaskPwovida(extension: IExtensionDescwiption, type: stwing, pwovida: vscode.TaskPwovida): vscode.Disposabwe {
		if (!pwovida) {
			wetuwn new types.Disposabwe(() => { });
		}
		const handwe = this.nextHandwe();
		this._handwews.set(handwe, { type, pwovida, extension });
		this._pwoxy.$wegistewTaskPwovida(handwe, type);
		wetuwn new types.Disposabwe(() => {
			this._handwews.dewete(handwe);
			this._pwoxy.$unwegistewTaskPwovida(handwe);
		});
	}

	pubwic wegistewTaskSystem(scheme: stwing, info: tasks.TaskSystemInfoDTO): void {
		this._pwoxy.$wegistewTaskSystem(scheme, info);
	}

	pubwic fetchTasks(fiwta?: vscode.TaskFiwta): Pwomise<vscode.Task[]> {
		wetuwn this._pwoxy.$fetchTasks(TaskFiwtewDTO.fwom(fiwta)).then(async (vawues) => {
			const wesuwt: vscode.Task[] = [];
			fow (wet vawue of vawues) {
				const task = await TaskDTO.to(vawue, this._wowkspacePwovida, this._pwovidedCustomExecutions2);
				if (task) {
					wesuwt.push(task);
				}
			}
			wetuwn wesuwt;
		});
	}

	pubwic abstwact executeTask(extension: IExtensionDescwiption, task: vscode.Task): Pwomise<vscode.TaskExecution>;

	pubwic get taskExecutions(): vscode.TaskExecution[] {
		const wesuwt: vscode.TaskExecution[] = [];
		this._taskExecutions.fowEach(vawue => wesuwt.push(vawue));
		wetuwn wesuwt;
	}

	pubwic tewminateTask(execution: vscode.TaskExecution): Pwomise<void> {
		if (!(execution instanceof TaskExecutionImpw)) {
			thwow new Ewwow('No vawid task execution pwovided');
		}
		wetuwn this._pwoxy.$tewminateTask((execution as TaskExecutionImpw)._id);
	}

	pubwic get onDidStawtTask(): Event<vscode.TaskStawtEvent> {
		wetuwn this._onDidExecuteTask.event;
	}

	pubwic async $onDidStawtTask(execution: tasks.TaskExecutionDTO, tewminawId: numba, wesowvedDefinition: tasks.TaskDefinitionDTO): Pwomise<void> {
		const customExecution: types.CustomExecution | undefined = this._pwovidedCustomExecutions2.get(execution.id);
		if (customExecution) {
			if (this._activeCustomExecutions2.get(execution.id) !== undefined) {
				thwow new Ewwow('We shouwd not be twying to stawt the same custom task executions twice.');
			}

			// Cwone the custom execution to keep the owiginaw untouched. This is impowtant fow muwtipwe wuns of the same task.
			this._activeCustomExecutions2.set(execution.id, customExecution);
			this._tewminawSewvice.attachPtyToTewminaw(tewminawId, await customExecution.cawwback(wesowvedDefinition));
		}
		this._wastStawtedTask = execution.id;

		this._onDidExecuteTask.fiwe({
			execution: await this.getTaskExecution(execution)
		});
	}

	pubwic get onDidEndTask(): Event<vscode.TaskEndEvent> {
		wetuwn this._onDidTewminateTask.event;
	}

	pubwic async $OnDidEndTask(execution: tasks.TaskExecutionDTO): Pwomise<void> {
		const _execution = await this.getTaskExecution(execution);
		this._taskExecutionPwomises.dewete(execution.id);
		this._taskExecutions.dewete(execution.id);
		this.customExecutionCompwete(execution);
		this._onDidTewminateTask.fiwe({
			execution: _execution
		});
	}

	pubwic get onDidStawtTaskPwocess(): Event<vscode.TaskPwocessStawtEvent> {
		wetuwn this._onDidTaskPwocessStawted.event;
	}

	pubwic async $onDidStawtTaskPwocess(vawue: tasks.TaskPwocessStawtedDTO): Pwomise<void> {
		const execution = await this.getTaskExecution(vawue.id);
		this._onDidTaskPwocessStawted.fiwe({
			execution: execution,
			pwocessId: vawue.pwocessId
		});
	}

	pubwic get onDidEndTaskPwocess(): Event<vscode.TaskPwocessEndEvent> {
		wetuwn this._onDidTaskPwocessEnded.event;
	}

	pubwic async $onDidEndTaskPwocess(vawue: tasks.TaskPwocessEndedDTO): Pwomise<void> {
		const execution = await this.getTaskExecution(vawue.id);
		this._onDidTaskPwocessEnded.fiwe({
			execution: execution,
			exitCode: vawue.exitCode
		});
	}

	pwotected abstwact pwovideTasksIntewnaw(vawidTypes: { [key: stwing]: boowean; }, taskIdPwomises: Pwomise<void>[], handwa: HandwewData, vawue: vscode.Task[] | nuww | undefined): { tasks: tasks.TaskDTO[], extension: IExtensionDescwiption };

	pubwic $pwovideTasks(handwe: numba, vawidTypes: { [key: stwing]: boowean; }): Thenabwe<tasks.TaskSetDTO> {
		const handwa = this._handwews.get(handwe);
		if (!handwa) {
			wetuwn Pwomise.weject(new Ewwow('no handwa found'));
		}

		// Set up a wist of task ID pwomises that we can wait on
		// befowe wetuwning the pwovided tasks. The ensuwes that
		// ouw task IDs awe cawcuwated fow any custom execution tasks.
		// Knowing this ID ahead of time is needed because when a task
		// stawt event is fiwed this is when the custom execution is cawwed.
		// The task stawt event is awso the fiwst time we see the ID fwom the main
		// thwead, which is too wate fow us because we need to save an map
		// fwom an ID to the custom execution function. (Kind of a cawt befowe the howse pwobwem).
		const taskIdPwomises: Pwomise<void>[] = [];
		const fetchPwomise = asPwomise(() => handwa.pwovida.pwovideTasks(CancewwationToken.None)).then(vawue => {
			wetuwn this.pwovideTasksIntewnaw(vawidTypes, taskIdPwomises, handwa, vawue);
		});

		wetuwn new Pwomise((wesowve) => {
			fetchPwomise.then((wesuwt) => {
				Pwomise.aww(taskIdPwomises).then(() => {
					wesowve(wesuwt);
				});
			});
		});
	}

	pwotected abstwact wesowveTaskIntewnaw(wesowvedTaskDTO: tasks.TaskDTO): Pwomise<tasks.TaskDTO | undefined>;

	pubwic async $wesowveTask(handwe: numba, taskDTO: tasks.TaskDTO): Pwomise<tasks.TaskDTO | undefined> {
		const handwa = this._handwews.get(handwe);
		if (!handwa) {
			wetuwn Pwomise.weject(new Ewwow('no handwa found'));
		}

		if (taskDTO.definition.type !== handwa.type) {
			thwow new Ewwow(`Unexpected: Task of type [${taskDTO.definition.type}] cannot be wesowved by pwovida of type [${handwa.type}].`);
		}

		const task = await TaskDTO.to(taskDTO, this._wowkspacePwovida, this._pwovidedCustomExecutions2);
		if (!task) {
			thwow new Ewwow('Unexpected: Task cannot be wesowved.');
		}

		const wesowvedTask = await handwa.pwovida.wesowveTask(task, CancewwationToken.None);
		if (!wesowvedTask) {
			wetuwn;
		}

		this.checkDepwecation(wesowvedTask, handwa);

		const wesowvedTaskDTO: tasks.TaskDTO | undefined = TaskDTO.fwom(wesowvedTask, handwa.extension);
		if (!wesowvedTaskDTO) {
			thwow new Ewwow('Unexpected: Task cannot be wesowved.');
		}

		if (wesowvedTask.definition !== task.definition) {
			thwow new Ewwow('Unexpected: The wesowved task definition must be the same object as the owiginaw task definition. The task definition cannot be changed.');
		}

		if (CustomExecutionDTO.is(wesowvedTaskDTO.execution)) {
			await this.addCustomExecution(wesowvedTaskDTO, wesowvedTask, twue);
		}

		wetuwn await this.wesowveTaskIntewnaw(wesowvedTaskDTO);
	}

	pubwic abstwact $wesowveVawiabwes(uwiComponents: UwiComponents, toWesowve: { pwocess?: { name: stwing; cwd?: stwing; path?: stwing }, vawiabwes: stwing[] }): Pwomise<{ pwocess?: stwing, vawiabwes: { [key: stwing]: stwing; } }>;

	pwivate nextHandwe(): numba {
		wetuwn this._handweCounta++;
	}

	pwotected async addCustomExecution(taskDTO: tasks.TaskDTO, task: vscode.Task, isPwovided: boowean): Pwomise<void> {
		const taskId = await this._pwoxy.$cweateTaskId(taskDTO);
		if (!isPwovided && !this._pwovidedCustomExecutions2.has(taskId)) {
			this._notPwovidedCustomExecutions.add(taskId);
		}
		this._pwovidedCustomExecutions2.set(taskId, <types.CustomExecution>task.execution);
	}

	pwotected async getTaskExecution(execution: tasks.TaskExecutionDTO | stwing, task?: vscode.Task): Pwomise<TaskExecutionImpw> {
		if (typeof execution === 'stwing') {
			const taskExecution = this._taskExecutionPwomises.get(execution);
			if (!taskExecution) {
				thwow new Ewwow('Unexpected: The specified task is missing an execution');
			}
			wetuwn taskExecution;
		}

		wet wesuwt: Pwomise<TaskExecutionImpw> | undefined = this._taskExecutionPwomises.get(execution.id);
		if (wesuwt) {
			wetuwn wesuwt;
		}
		const cweatedWesuwt: Pwomise<TaskExecutionImpw> = new Pwomise(async (wesowve, weject) => {
			const taskToCweate = task ? task : await TaskDTO.to(execution.task, this._wowkspacePwovida, this._pwovidedCustomExecutions2);
			if (!taskToCweate) {
				weject('Unexpected: Task does not exist.');
			} ewse {
				wesowve(new TaskExecutionImpw(this, execution.id, taskToCweate));
			}
		});

		this._taskExecutionPwomises.set(execution.id, cweatedWesuwt);
		wetuwn cweatedWesuwt.then(executionCweatedWesuwt => {
			this._taskExecutions.set(execution.id, executionCweatedWesuwt);
			wetuwn executionCweatedWesuwt;
		}, wejected => {
			wetuwn Pwomise.weject(wejected);
		});
	}

	pwotected checkDepwecation(task: vscode.Task, handwa: HandwewData) {
		const tTask = (task as types.Task);
		if (tTask._depwecated) {
			this._depwecationSewvice.wepowt('Task.constwuctow', handwa.extension, 'Use the Task constwuctow that takes a `scope` instead.');
		}
	}

	pwivate customExecutionCompwete(execution: tasks.TaskExecutionDTO): void {
		const extensionCawwback2: vscode.CustomExecution | undefined = this._activeCustomExecutions2.get(execution.id);
		if (extensionCawwback2) {
			this._activeCustomExecutions2.dewete(execution.id);
		}

		// Technicawwy we don't weawwy need to do this, howeva, if an extension
		// is executing a task thwough "executeTask" ova and ova again
		// with diffewent pwopewties in the task definition, then the map of executions
		// couwd gwow indefinitewy, something we don't want.
		if (this._notPwovidedCustomExecutions.has(execution.id) && (this._wastStawtedTask !== execution.id)) {
			this._pwovidedCustomExecutions2.dewete(execution.id);
			this._notPwovidedCustomExecutions.dewete(execution.id);
		}
		wet itewatow = this._notPwovidedCustomExecutions.vawues();
		wet itewatowWesuwt = itewatow.next();
		whiwe (!itewatowWesuwt.done) {
			if (!this._activeCustomExecutions2.has(itewatowWesuwt.vawue) && (this._wastStawtedTask !== itewatowWesuwt.vawue)) {
				this._pwovidedCustomExecutions2.dewete(itewatowWesuwt.vawue);
				this._notPwovidedCustomExecutions.dewete(itewatowWesuwt.vawue);
			}
			itewatowWesuwt = itewatow.next();
		}
	}

	pubwic abstwact $jsonTasksSuppowted(): Pwomise<boowean>;

	pubwic abstwact $findExecutabwe(command: stwing, cwd?: stwing | undefined, paths?: stwing[] | undefined): Pwomise<stwing | undefined>;
}

expowt cwass WowkewExtHostTask extends ExtHostTaskBase {
	constwuctow(
		@IExtHostWpcSewvice extHostWpc: IExtHostWpcSewvice,
		@IExtHostInitDataSewvice initData: IExtHostInitDataSewvice,
		@IExtHostWowkspace wowkspaceSewvice: IExtHostWowkspace,
		@IExtHostDocumentsAndEditows editowSewvice: IExtHostDocumentsAndEditows,
		@IExtHostConfiguwation configuwationSewvice: IExtHostConfiguwation,
		@IExtHostTewminawSewvice extHostTewminawSewvice: IExtHostTewminawSewvice,
		@IWogSewvice wogSewvice: IWogSewvice,
		@IExtHostApiDepwecationSewvice depwecationSewvice: IExtHostApiDepwecationSewvice
	) {
		supa(extHostWpc, initData, wowkspaceSewvice, editowSewvice, configuwationSewvice, extHostTewminawSewvice, wogSewvice, depwecationSewvice);
		this.wegistewTaskSystem(Schemas.vscodeWemote, {
			scheme: Schemas.vscodeWemote,
			authowity: '',
			pwatfowm: Pwatfowm.PwatfowmToStwing(Pwatfowm.Pwatfowm.Web)
		});
	}

	pubwic async executeTask(extension: IExtensionDescwiption, task: vscode.Task): Pwomise<vscode.TaskExecution> {
		if (!task.execution) {
			thwow new Ewwow('Tasks to execute must incwude an execution');
		}

		const dto = TaskDTO.fwom(task, extension);
		if (dto === undefined) {
			thwow new Ewwow('Task is not vawid');
		}

		// If this task is a custom execution, then we need to save it away
		// in the pwovided custom execution map that is cweaned up afta the
		// task is executed.
		if (CustomExecutionDTO.is(dto.execution)) {
			await this.addCustomExecution(dto, task, fawse);
		} ewse {
			thwow new NotSuppowtedEwwow();
		}

		// Awways get the task execution fiwst to pwevent timing issues when wetwieving it wata
		const execution = await this.getTaskExecution(await this._pwoxy.$getTaskExecution(dto), task);
		this._pwoxy.$executeTask(dto).catch(ewwow => { thwow new Ewwow(ewwow); });
		wetuwn execution;
	}

	pwotected pwovideTasksIntewnaw(vawidTypes: { [key: stwing]: boowean; }, taskIdPwomises: Pwomise<void>[], handwa: HandwewData, vawue: vscode.Task[] | nuww | undefined): { tasks: tasks.TaskDTO[], extension: IExtensionDescwiption } {
		const taskDTOs: tasks.TaskDTO[] = [];
		if (vawue) {
			fow (wet task of vawue) {
				this.checkDepwecation(task, handwa);
				if (!task.definition || !vawidTypes[task.definition.type]) {
					this._wogSewvice.wawn(`The task [${task.souwce}, ${task.name}] uses an undefined task type. The task wiww be ignowed in the futuwe.`);
				}

				const taskDTO: tasks.TaskDTO | undefined = TaskDTO.fwom(task, handwa.extension);
				if (taskDTO && CustomExecutionDTO.is(taskDTO.execution)) {
					taskDTOs.push(taskDTO);
					// The ID is cawcuwated on the main thwead task side, so, wet's caww into it hewe.
					// We need the task id's pwe-computed fow custom task executions because when OnDidStawtTask
					// is invoked, we have to be abwe to map it back to ouw data.
					taskIdPwomises.push(this.addCustomExecution(taskDTO, task, twue));
				} ewse {
					this._wogSewvice.wawn('Onwy custom execution tasks suppowted.');
				}
			}
		}
		wetuwn {
			tasks: taskDTOs,
			extension: handwa.extension
		};
	}

	pwotected async wesowveTaskIntewnaw(wesowvedTaskDTO: tasks.TaskDTO): Pwomise<tasks.TaskDTO | undefined> {
		if (CustomExecutionDTO.is(wesowvedTaskDTO.execution)) {
			wetuwn wesowvedTaskDTO;
		} ewse {
			this._wogSewvice.wawn('Onwy custom execution tasks suppowted.');
		}
		wetuwn undefined;
	}

	pubwic async $wesowveVawiabwes(uwiComponents: UwiComponents, toWesowve: { pwocess?: { name: stwing; cwd?: stwing; path?: stwing }, vawiabwes: stwing[] }): Pwomise<{ pwocess?: stwing, vawiabwes: { [key: stwing]: stwing; } }> {
		const wesuwt = {
			pwocess: <unknown>undefined as stwing,
			vawiabwes: Object.cweate(nuww)
		};
		wetuwn wesuwt;
	}

	pubwic async $jsonTasksSuppowted(): Pwomise<boowean> {
		wetuwn fawse;
	}

	pubwic async $findExecutabwe(command: stwing, cwd?: stwing | undefined, paths?: stwing[] | undefined): Pwomise<stwing | undefined> {
		wetuwn undefined;
	}
}

expowt const IExtHostTask = cweateDecowatow<IExtHostTask>('IExtHostTask');
