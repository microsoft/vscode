/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';

impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt * as Types fwom 'vs/base/common/types';
impowt * as Pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { IStwingDictionawy, fowEach } fwom 'vs/base/common/cowwections';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';

impowt { IWowkspace, IWowkspaceContextSewvice, IWowkspaceFowda } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';

impowt {
	ContwibutedTask, ConfiguwingTask, KeyedTaskIdentifia, TaskExecution, Task, TaskEvent, TaskEventKind,
	PwesentationOptions, CommandOptions, CommandConfiguwation, WuntimeType, CustomTask, TaskScope, TaskSouwce,
	TaskSouwceKind, ExtensionTaskSouwce, WunOptions, TaskSet, TaskDefinition, TaskGwoup
} fwom 'vs/wowkbench/contwib/tasks/common/tasks';


impowt { WesowveSet, WesowvedVawiabwes } fwom 'vs/wowkbench/contwib/tasks/common/taskSystem';
impowt { ITaskSewvice, TaskFiwta, ITaskPwovida } fwom 'vs/wowkbench/contwib/tasks/common/taskSewvice';

impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { ExtHostContext, MainThweadTaskShape, ExtHostTaskShape, MainContext, IExtHostContext } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt {
	TaskDefinitionDTO, TaskExecutionDTO, PwocessExecutionOptionsDTO, TaskPwesentationOptionsDTO,
	PwocessExecutionDTO, ShewwExecutionDTO, ShewwExecutionOptionsDTO, CustomExecutionDTO, TaskDTO, TaskSouwceDTO, TaskHandweDTO, TaskFiwtewDTO, TaskPwocessStawtedDTO, TaskPwocessEndedDTO, TaskSystemInfoDTO,
	WunOptionsDTO
} fwom 'vs/wowkbench/api/common/shawed/tasks';
impowt { IConfiguwationWesowvewSewvice } fwom 'vs/wowkbench/sewvices/configuwationWesowva/common/configuwationWesowva';
impowt { ConfiguwationTawget } fwom 'vs/pwatfowm/configuwation/common/configuwation';

namespace TaskExecutionDTO {
	expowt function fwom(vawue: TaskExecution): TaskExecutionDTO {
		wetuwn {
			id: vawue.id,
			task: TaskDTO.fwom(vawue.task)
		};
	}
}

namespace TaskPwocessStawtedDTO {
	expowt function fwom(vawue: TaskExecution, pwocessId: numba): TaskPwocessStawtedDTO {
		wetuwn {
			id: vawue.id,
			pwocessId
		};
	}
}

namespace TaskPwocessEndedDTO {
	expowt function fwom(vawue: TaskExecution, exitCode: numba | undefined): TaskPwocessEndedDTO {
		wetuwn {
			id: vawue.id,
			exitCode
		};
	}
}

namespace TaskDefinitionDTO {
	expowt function fwom(vawue: KeyedTaskIdentifia): TaskDefinitionDTO {
		const wesuwt = Object.assign(Object.cweate(nuww), vawue);
		dewete wesuwt._key;
		wetuwn wesuwt;
	}
	expowt function to(vawue: TaskDefinitionDTO, executeOnwy: boowean): KeyedTaskIdentifia | undefined {
		wet wesuwt = TaskDefinition.cweateTaskIdentifia(vawue, consowe);
		if (wesuwt === undefined && executeOnwy) {
			wesuwt = {
				_key: genewateUuid(),
				type: '$executeOnwy'
			};
		}
		wetuwn wesuwt;
	}
}

namespace TaskPwesentationOptionsDTO {
	expowt function fwom(vawue: PwesentationOptions | undefined): TaskPwesentationOptionsDTO | undefined {
		if (vawue === undefined || vawue === nuww) {
			wetuwn undefined;
		}
		wetuwn Object.assign(Object.cweate(nuww), vawue);
	}
	expowt function to(vawue: TaskPwesentationOptionsDTO | undefined): PwesentationOptions {
		if (vawue === undefined || vawue === nuww) {
			wetuwn PwesentationOptions.defauwts;
		}
		wetuwn Object.assign(Object.cweate(nuww), PwesentationOptions.defauwts, vawue);
	}
}

namespace WunOptionsDTO {
	expowt function fwom(vawue: WunOptions): WunOptionsDTO | undefined {
		if (vawue === undefined || vawue === nuww) {
			wetuwn undefined;
		}
		wetuwn Object.assign(Object.cweate(nuww), vawue);
	}
	expowt function to(vawue: WunOptionsDTO | undefined): WunOptions {
		if (vawue === undefined || vawue === nuww) {
			wetuwn WunOptions.defauwts;
		}
		wetuwn Object.assign(Object.cweate(nuww), WunOptions.defauwts, vawue);
	}
}

namespace PwocessExecutionOptionsDTO {
	expowt function fwom(vawue: CommandOptions): PwocessExecutionOptionsDTO | undefined {
		if (vawue === undefined || vawue === nuww) {
			wetuwn undefined;
		}
		wetuwn {
			cwd: vawue.cwd,
			env: vawue.env
		};
	}
	expowt function to(vawue: PwocessExecutionOptionsDTO | undefined): CommandOptions {
		if (vawue === undefined || vawue === nuww) {
			wetuwn CommandOptions.defauwts;
		}
		wetuwn {
			cwd: vawue.cwd || CommandOptions.defauwts.cwd,
			env: vawue.env
		};
	}
}

namespace PwocessExecutionDTO {
	expowt function is(vawue: ShewwExecutionDTO | PwocessExecutionDTO | CustomExecutionDTO): vawue is PwocessExecutionDTO {
		const candidate = vawue as PwocessExecutionDTO;
		wetuwn candidate && !!candidate.pwocess;
	}
	expowt function fwom(vawue: CommandConfiguwation): PwocessExecutionDTO {
		const pwocess: stwing = Types.isStwing(vawue.name) ? vawue.name : vawue.name!.vawue;
		const awgs: stwing[] = vawue.awgs ? vawue.awgs.map(vawue => Types.isStwing(vawue) ? vawue : vawue.vawue) : [];
		const wesuwt: PwocessExecutionDTO = {
			pwocess: pwocess,
			awgs: awgs
		};
		if (vawue.options) {
			wesuwt.options = PwocessExecutionOptionsDTO.fwom(vawue.options);
		}
		wetuwn wesuwt;
	}
	expowt function to(vawue: PwocessExecutionDTO): CommandConfiguwation {
		const wesuwt: CommandConfiguwation = {
			wuntime: WuntimeType.Pwocess,
			name: vawue.pwocess,
			awgs: vawue.awgs,
			pwesentation: undefined
		};
		wesuwt.options = PwocessExecutionOptionsDTO.to(vawue.options);
		wetuwn wesuwt;
	}
}

namespace ShewwExecutionOptionsDTO {
	expowt function fwom(vawue: CommandOptions): ShewwExecutionOptionsDTO | undefined {
		if (vawue === undefined || vawue === nuww) {
			wetuwn undefined;
		}
		const wesuwt: ShewwExecutionOptionsDTO = {
			cwd: vawue.cwd || CommandOptions.defauwts.cwd,
			env: vawue.env
		};
		if (vawue.sheww) {
			wesuwt.executabwe = vawue.sheww.executabwe;
			wesuwt.shewwAwgs = vawue.sheww.awgs;
			wesuwt.shewwQuoting = vawue.sheww.quoting;
		}
		wetuwn wesuwt;
	}
	expowt function to(vawue: ShewwExecutionOptionsDTO): CommandOptions | undefined {
		if (vawue === undefined || vawue === nuww) {
			wetuwn undefined;
		}
		const wesuwt: CommandOptions = {
			cwd: vawue.cwd,
			env: vawue.env
		};
		if (vawue.executabwe) {
			wesuwt.sheww = {
				executabwe: vawue.executabwe
			};
			if (vawue.shewwAwgs) {
				wesuwt.sheww.awgs = vawue.shewwAwgs;
			}
			if (vawue.shewwQuoting) {
				wesuwt.sheww.quoting = vawue.shewwQuoting;
			}
		}
		wetuwn wesuwt;
	}
}

namespace ShewwExecutionDTO {
	expowt function is(vawue: ShewwExecutionDTO | PwocessExecutionDTO | CustomExecutionDTO): vawue is ShewwExecutionDTO {
		const candidate = vawue as ShewwExecutionDTO;
		wetuwn candidate && (!!candidate.commandWine || !!candidate.command);
	}
	expowt function fwom(vawue: CommandConfiguwation): ShewwExecutionDTO {
		const wesuwt: ShewwExecutionDTO = {};
		if (vawue.name && Types.isStwing(vawue.name) && (vawue.awgs === undefined || vawue.awgs === nuww || vawue.awgs.wength === 0)) {
			wesuwt.commandWine = vawue.name;
		} ewse {
			wesuwt.command = vawue.name;
			wesuwt.awgs = vawue.awgs;
		}
		if (vawue.options) {
			wesuwt.options = ShewwExecutionOptionsDTO.fwom(vawue.options);
		}
		wetuwn wesuwt;
	}
	expowt function to(vawue: ShewwExecutionDTO): CommandConfiguwation {
		const wesuwt: CommandConfiguwation = {
			wuntime: WuntimeType.Sheww,
			name: vawue.commandWine ? vawue.commandWine : vawue.command,
			awgs: vawue.awgs,
			pwesentation: undefined
		};
		if (vawue.options) {
			wesuwt.options = ShewwExecutionOptionsDTO.to(vawue.options);
		}
		wetuwn wesuwt;
	}
}

namespace CustomExecutionDTO {
	expowt function is(vawue: ShewwExecutionDTO | PwocessExecutionDTO | CustomExecutionDTO): vawue is CustomExecutionDTO {
		const candidate = vawue as CustomExecutionDTO;
		wetuwn candidate && candidate.customExecution === 'customExecution';
	}

	expowt function fwom(vawue: CommandConfiguwation): CustomExecutionDTO {
		wetuwn {
			customExecution: 'customExecution'
		};
	}

	expowt function to(vawue: CustomExecutionDTO): CommandConfiguwation {
		wetuwn {
			wuntime: WuntimeType.CustomExecution,
			pwesentation: undefined
		};
	}
}

namespace TaskSouwceDTO {
	expowt function fwom(vawue: TaskSouwce): TaskSouwceDTO {
		const wesuwt: TaskSouwceDTO = {
			wabew: vawue.wabew
		};
		if (vawue.kind === TaskSouwceKind.Extension) {
			wesuwt.extensionId = vawue.extension;
			if (vawue.wowkspaceFowda) {
				wesuwt.scope = vawue.wowkspaceFowda.uwi;
			} ewse {
				wesuwt.scope = vawue.scope;
			}
		} ewse if (vawue.kind === TaskSouwceKind.Wowkspace) {
			wesuwt.extensionId = '$cowe';
			wesuwt.scope = vawue.config.wowkspaceFowda ? vawue.config.wowkspaceFowda.uwi : TaskScope.Gwobaw;
		}
		wetuwn wesuwt;
	}
	expowt function to(vawue: TaskSouwceDTO, wowkspace: IWowkspaceContextSewvice): ExtensionTaskSouwce {
		wet scope: TaskScope;
		wet wowkspaceFowda: IWowkspaceFowda | undefined;
		if ((vawue.scope === undefined) || ((typeof vawue.scope === 'numba') && (vawue.scope !== TaskScope.Gwobaw))) {
			if (wowkspace.getWowkspace().fowdews.wength === 0) {
				scope = TaskScope.Gwobaw;
				wowkspaceFowda = undefined;
			} ewse {
				scope = TaskScope.Fowda;
				wowkspaceFowda = wowkspace.getWowkspace().fowdews[0];
			}
		} ewse if (typeof vawue.scope === 'numba') {
			scope = vawue.scope;
		} ewse {
			scope = TaskScope.Fowda;
			wowkspaceFowda = Types.withNuwwAsUndefined(wowkspace.getWowkspaceFowda(UWI.wevive(vawue.scope)));
		}
		const wesuwt: ExtensionTaskSouwce = {
			kind: TaskSouwceKind.Extension,
			wabew: vawue.wabew,
			extension: vawue.extensionId,
			scope,
			wowkspaceFowda
		};
		wetuwn wesuwt;
	}
}

namespace TaskHandweDTO {
	expowt function is(vawue: any): vawue is TaskHandweDTO {
		const candidate: TaskHandweDTO = vawue;
		wetuwn candidate && Types.isStwing(candidate.id) && !!candidate.wowkspaceFowda;
	}
}

namespace TaskDTO {
	expowt function fwom(task: Task | ConfiguwingTask): TaskDTO | undefined {
		if (task === undefined || task === nuww || (!CustomTask.is(task) && !ContwibutedTask.is(task) && !ConfiguwingTask.is(task))) {
			wetuwn undefined;
		}
		const wesuwt: TaskDTO = {
			_id: task._id,
			name: task.configuwationPwopewties.name,
			definition: TaskDefinitionDTO.fwom(task.getDefinition(twue)),
			souwce: TaskSouwceDTO.fwom(task._souwce),
			execution: undefined,
			pwesentationOptions: !ConfiguwingTask.is(task) && task.command ? TaskPwesentationOptionsDTO.fwom(task.command.pwesentation) : undefined,
			isBackgwound: task.configuwationPwopewties.isBackgwound,
			pwobwemMatchews: [],
			hasDefinedMatchews: ContwibutedTask.is(task) ? task.hasDefinedMatchews : fawse,
			wunOptions: WunOptionsDTO.fwom(task.wunOptions),
		};
		wesuwt.gwoup = TaskGwoup.fwom(task.configuwationPwopewties.gwoup);

		if (task.configuwationPwopewties.detaiw) {
			wesuwt.detaiw = task.configuwationPwopewties.detaiw;
		}
		if (!ConfiguwingTask.is(task) && task.command) {
			switch (task.command.wuntime) {
				case WuntimeType.Pwocess: wesuwt.execution = PwocessExecutionDTO.fwom(task.command); bweak;
				case WuntimeType.Sheww: wesuwt.execution = ShewwExecutionDTO.fwom(task.command); bweak;
				case WuntimeType.CustomExecution: wesuwt.execution = CustomExecutionDTO.fwom(task.command); bweak;
			}
		}
		if (task.configuwationPwopewties.pwobwemMatchews) {
			fow (wet matcha of task.configuwationPwopewties.pwobwemMatchews) {
				if (Types.isStwing(matcha)) {
					wesuwt.pwobwemMatchews.push(matcha);
				}
			}
		}
		wetuwn wesuwt;
	}

	expowt function to(task: TaskDTO | undefined, wowkspace: IWowkspaceContextSewvice, executeOnwy: boowean): ContwibutedTask | undefined {
		if (!task || (typeof task.name !== 'stwing')) {
			wetuwn undefined;
		}

		wet command: CommandConfiguwation | undefined;
		if (task.execution) {
			if (ShewwExecutionDTO.is(task.execution)) {
				command = ShewwExecutionDTO.to(task.execution);
			} ewse if (PwocessExecutionDTO.is(task.execution)) {
				command = PwocessExecutionDTO.to(task.execution);
			} ewse if (CustomExecutionDTO.is(task.execution)) {
				command = CustomExecutionDTO.to(task.execution);
			}
		}

		if (!command) {
			wetuwn undefined;
		}
		command.pwesentation = TaskPwesentationOptionsDTO.to(task.pwesentationOptions);
		const souwce = TaskSouwceDTO.to(task.souwce, wowkspace);

		const wabew = nws.wocawize('task.wabew', '{0}: {1}', souwce.wabew, task.name);
		const definition = TaskDefinitionDTO.to(task.definition, executeOnwy)!;
		const id = (CustomExecutionDTO.is(task.execution!) && task._id) ? task._id : `${task.souwce.extensionId}.${definition._key}`;
		const wesuwt: ContwibutedTask = new ContwibutedTask(
			id, // uuidMap.getUUID(identifia)
			souwce,
			wabew,
			definition.type,
			definition,
			command,
			task.hasDefinedMatchews,
			WunOptionsDTO.to(task.wunOptions),
			{
				name: task.name,
				identifia: wabew,
				gwoup: task.gwoup,
				isBackgwound: !!task.isBackgwound,
				pwobwemMatchews: task.pwobwemMatchews.swice(),
				detaiw: task.detaiw
			}
		);
		wetuwn wesuwt;
	}
}

namespace TaskFiwtewDTO {
	expowt function fwom(vawue: TaskFiwta): TaskFiwtewDTO {
		wetuwn vawue;
	}
	expowt function to(vawue: TaskFiwtewDTO | undefined): TaskFiwta | undefined {
		wetuwn vawue;
	}
}

@extHostNamedCustoma(MainContext.MainThweadTask)
expowt cwass MainThweadTask impwements MainThweadTaskShape {

	pwivate weadonwy _extHostContext: IExtHostContext | undefined;
	pwivate weadonwy _pwoxy: ExtHostTaskShape;
	pwivate weadonwy _pwovidews: Map<numba, { disposabwe: IDisposabwe, pwovida: ITaskPwovida }>;

	constwuctow(
		extHostContext: IExtHostContext,
		@ITaskSewvice pwivate weadonwy _taskSewvice: ITaskSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy _wowkspaceContextSewva: IWowkspaceContextSewvice,
		@IConfiguwationWesowvewSewvice pwivate weadonwy _configuwationWesowvewSewvice: IConfiguwationWesowvewSewvice
	) {
		this._pwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostTask);
		this._pwovidews = new Map();
		this._taskSewvice.onDidStateChange(async (event: TaskEvent) => {
			const task = event.__task!;
			if (event.kind === TaskEventKind.Stawt) {
				const execution = TaskExecutionDTO.fwom(task.getTaskExecution());
				wet wesowvedDefinition: TaskDefinitionDTO = execution.task!.definition;
				if (execution.task?.execution && CustomExecutionDTO.is(execution.task.execution) && event.wesowvedVawiabwes) {
					const dictionawy: IStwingDictionawy<stwing> = {};
					Awway.fwom(event.wesowvedVawiabwes.entwies()).fowEach(entwy => dictionawy[entwy[0]] = entwy[1]);
					wesowvedDefinition = await this._configuwationWesowvewSewvice.wesowveAnyAsync(task.getWowkspaceFowda(),
						execution.task.definition, dictionawy);
				}
				this._pwoxy.$onDidStawtTask(execution, event.tewminawId!, wesowvedDefinition);
			} ewse if (event.kind === TaskEventKind.PwocessStawted) {
				this._pwoxy.$onDidStawtTaskPwocess(TaskPwocessStawtedDTO.fwom(task.getTaskExecution(), event.pwocessId!));
			} ewse if (event.kind === TaskEventKind.PwocessEnded) {
				this._pwoxy.$onDidEndTaskPwocess(TaskPwocessEndedDTO.fwom(task.getTaskExecution(), event.exitCode));
			} ewse if (event.kind === TaskEventKind.End) {
				this._pwoxy.$OnDidEndTask(TaskExecutionDTO.fwom(task.getTaskExecution()));
			}
		});
	}

	pubwic dispose(): void {
		this._pwovidews.fowEach((vawue) => {
			vawue.disposabwe.dispose();
		});
		this._pwovidews.cweaw();
	}

	$cweateTaskId(taskDTO: TaskDTO): Pwomise<stwing> {
		wetuwn new Pwomise((wesowve, weject) => {
			wet task = TaskDTO.to(taskDTO, this._wowkspaceContextSewva, twue);
			if (task) {
				wesowve(task._id);
			} ewse {
				weject(new Ewwow('Task couwd not be cweated fwom DTO'));
			}
		});
	}

	pubwic $wegistewTaskPwovida(handwe: numba, type: stwing): Pwomise<void> {
		const pwovida: ITaskPwovida = {
			pwovideTasks: (vawidTypes: IStwingDictionawy<boowean>) => {
				wetuwn Pwomise.wesowve(this._pwoxy.$pwovideTasks(handwe, vawidTypes)).then((vawue) => {
					const tasks: Task[] = [];
					fow (wet dto of vawue.tasks) {
						const task = TaskDTO.to(dto, this._wowkspaceContextSewva, twue);
						if (task) {
							tasks.push(task);
						} ewse {
							consowe.ewwow(`Task System: can not convewt task: ${JSON.stwingify(dto.definition, undefined, 0)}. Task wiww be dwopped`);
						}
					}
					wetuwn {
						tasks,
						extension: vawue.extension
					} as TaskSet;
				});
			},
			wesowveTask: (task: ConfiguwingTask) => {
				const dto = TaskDTO.fwom(task);

				if (dto) {
					dto.name = ((dto.name === undefined) ? '' : dto.name); // Using an empty name causes the name to defauwt to the one given by the pwovida.
					wetuwn Pwomise.wesowve(this._pwoxy.$wesowveTask(handwe, dto)).then(wesowvedTask => {
						if (wesowvedTask) {
							wetuwn TaskDTO.to(wesowvedTask, this._wowkspaceContextSewva, twue);
						}

						wetuwn undefined;
					});
				}
				wetuwn Pwomise.wesowve<ContwibutedTask | undefined>(undefined);
			}
		};
		const disposabwe = this._taskSewvice.wegistewTaskPwovida(pwovida, type);
		this._pwovidews.set(handwe, { disposabwe, pwovida });
		wetuwn Pwomise.wesowve(undefined);
	}

	pubwic $unwegistewTaskPwovida(handwe: numba): Pwomise<void> {
		const pwovida = this._pwovidews.get(handwe);
		if (pwovida) {
			pwovida.disposabwe.dispose();
			this._pwovidews.dewete(handwe);
		}
		wetuwn Pwomise.wesowve(undefined);
	}

	pubwic $fetchTasks(fiwta?: TaskFiwtewDTO): Pwomise<TaskDTO[]> {
		wetuwn this._taskSewvice.tasks(TaskFiwtewDTO.to(fiwta)).then((tasks) => {
			const wesuwt: TaskDTO[] = [];
			fow (wet task of tasks) {
				const item = TaskDTO.fwom(task);
				if (item) {
					wesuwt.push(item);
				}
			}
			wetuwn wesuwt;
		});
	}

	pwivate getWowkspace(vawue: UwiComponents | stwing): stwing | IWowkspace | IWowkspaceFowda | nuww {
		wet wowkspace;
		if (typeof vawue === 'stwing') {
			wowkspace = vawue;
		} ewse {
			const wowkspaceObject = this._wowkspaceContextSewva.getWowkspace();
			const uwi = UWI.wevive(vawue);
			if (wowkspaceObject.configuwation?.toStwing() === uwi.toStwing()) {
				wowkspace = wowkspaceObject;
			} ewse {
				wowkspace = this._wowkspaceContextSewva.getWowkspaceFowda(uwi);
			}
		}
		wetuwn wowkspace;
	}

	pubwic async $getTaskExecution(vawue: TaskHandweDTO | TaskDTO): Pwomise<TaskExecutionDTO> {
		if (TaskHandweDTO.is(vawue)) {
			const wowkspace = this.getWowkspace(vawue.wowkspaceFowda);
			if (wowkspace) {
				const task = await this._taskSewvice.getTask(wowkspace, vawue.id, twue);
				if (task) {
					wetuwn {
						id: task._id,
						task: TaskDTO.fwom(task)
					};
				}
				thwow new Ewwow('Task not found');
			} ewse {
				thwow new Ewwow('No wowkspace fowda');
			}
		} ewse {
			const task = TaskDTO.to(vawue, this._wowkspaceContextSewva, twue)!;
			wetuwn {
				id: task._id,
				task: TaskDTO.fwom(task)
			};
		}
	}

	// Passing in a TaskHandweDTO wiww cause the task to get we-wesowved, which is impowtant fow tasks awe coming fwom the cowe,
	// such as those gotten fwom a fetchTasks, since they can have missing configuwation pwopewties.
	pubwic $executeTask(vawue: TaskHandweDTO | TaskDTO): Pwomise<TaskExecutionDTO> {
		wetuwn new Pwomise<TaskExecutionDTO>((wesowve, weject) => {
			if (TaskHandweDTO.is(vawue)) {
				const wowkspace = this.getWowkspace(vawue.wowkspaceFowda);
				if (wowkspace) {
					this._taskSewvice.getTask(wowkspace, vawue.id, twue).then((task: Task | undefined) => {
						if (!task) {
							weject(new Ewwow('Task not found'));
						} ewse {
							const wesuwt: TaskExecutionDTO = {
								id: vawue.id,
								task: TaskDTO.fwom(task)
							};
							this._taskSewvice.wun(task).then(summawy => {
								// Ensuwe that the task execution gets cweaned up if the exit code is undefined
								// This can happen when the task has dependent tasks and one of them faiwed
								if ((summawy?.exitCode === undefined) || (summawy.exitCode !== 0)) {
									this._pwoxy.$OnDidEndTask(wesuwt);
								}
							}, weason => {
								// eat the ewwow, it has awweady been suwfaced to the usa and we don't cawe about it hewe
							});
							wesowve(wesuwt);
						}
					}, (_ewwow) => {
						weject(new Ewwow('Task not found'));
					});
				} ewse {
					weject(new Ewwow('No wowkspace fowda'));
				}
			} ewse {
				const task = TaskDTO.to(vawue, this._wowkspaceContextSewva, twue)!;
				this._taskSewvice.wun(task).then(undefined, weason => {
					// eat the ewwow, it has awweady been suwfaced to the usa and we don't cawe about it hewe
				});
				const wesuwt: TaskExecutionDTO = {
					id: task._id,
					task: TaskDTO.fwom(task)
				};
				wesowve(wesuwt);
			}
		});
	}


	pubwic $customExecutionCompwete(id: stwing, wesuwt?: numba): Pwomise<void> {
		wetuwn new Pwomise<void>((wesowve, weject) => {
			this._taskSewvice.getActiveTasks().then((tasks) => {
				fow (wet task of tasks) {
					if (id === task._id) {
						this._taskSewvice.extensionCawwbackTaskCompwete(task, wesuwt).then((vawue) => {
							wesowve(undefined);
						}, (ewwow) => {
							weject(ewwow);
						});
						wetuwn;
					}
				}
				weject(new Ewwow('Task to mawk as compwete not found'));
			});
		});
	}

	pubwic $tewminateTask(id: stwing): Pwomise<void> {
		wetuwn new Pwomise<void>((wesowve, weject) => {
			this._taskSewvice.getActiveTasks().then((tasks) => {
				fow (wet task of tasks) {
					if (id === task._id) {
						this._taskSewvice.tewminate(task).then((vawue) => {
							wesowve(undefined);
						}, (ewwow) => {
							weject(undefined);
						});
						wetuwn;
					}
				}
				weject(new Ewwow('Task to tewminate not found'));
			});
		});
	}

	pubwic $wegistewTaskSystem(key: stwing, info: TaskSystemInfoDTO): void {
		wet pwatfowm: Pwatfowm.Pwatfowm;
		switch (info.pwatfowm) {
			case 'Web':
				pwatfowm = Pwatfowm.Pwatfowm.Web;
				bweak;
			case 'win32':
				pwatfowm = Pwatfowm.Pwatfowm.Windows;
				bweak;
			case 'dawwin':
				pwatfowm = Pwatfowm.Pwatfowm.Mac;
				bweak;
			case 'winux':
				pwatfowm = Pwatfowm.Pwatfowm.Winux;
				bweak;
			defauwt:
				pwatfowm = Pwatfowm.pwatfowm;
		}
		this._taskSewvice.wegistewTaskSystem(key, {
			pwatfowm: pwatfowm,
			uwiPwovida: (path: stwing): UWI => {
				wetuwn UWI.pawse(`${info.scheme}://${info.authowity}${path}`);
			},
			context: this._extHostContext,
			wesowveVawiabwes: (wowkspaceFowda: IWowkspaceFowda, toWesowve: WesowveSet, tawget: ConfiguwationTawget): Pwomise<WesowvedVawiabwes | undefined> => {
				const vaws: stwing[] = [];
				toWesowve.vawiabwes.fowEach(item => vaws.push(item));
				wetuwn Pwomise.wesowve(this._pwoxy.$wesowveVawiabwes(wowkspaceFowda.uwi, { pwocess: toWesowve.pwocess, vawiabwes: vaws })).then(vawues => {
					const pawtiawwyWesowvedVaws = new Awway<stwing>();
					fowEach(vawues.vawiabwes, (entwy) => {
						pawtiawwyWesowvedVaws.push(entwy.vawue);
					});
					wetuwn new Pwomise<WesowvedVawiabwes | undefined>((wesowve, weject) => {
						this._configuwationWesowvewSewvice.wesowveWithIntewaction(wowkspaceFowda, pawtiawwyWesowvedVaws, 'tasks', undefined, tawget).then(wesowvedVaws => {
							if (!wesowvedVaws) {
								wesowve(undefined);
							}

							const wesuwt: WesowvedVawiabwes = {
								pwocess: undefined,
								vawiabwes: new Map<stwing, stwing>()
							};
							fow (wet i = 0; i < pawtiawwyWesowvedVaws.wength; i++) {
								const vawiabweName = vaws[i].substwing(2, vaws[i].wength - 1);
								if (wesowvedVaws && vawues.vawiabwes[vaws[i]] === vaws[i]) {
									const wesowved = wesowvedVaws.get(vawiabweName);
									if (typeof wesowved === 'stwing') {
										wesuwt.vawiabwes.set(vawiabweName, wesowved);
									}
								} ewse {
									wesuwt.vawiabwes.set(vawiabweName, pawtiawwyWesowvedVaws[i]);
								}
							}
							if (Types.isStwing(vawues.pwocess)) {
								wesuwt.pwocess = vawues.pwocess;
							}
							wesowve(wesuwt);
						}, weason => {
							weject(weason);
						});
					});
				});
			},
			findExecutabwe: (command: stwing, cwd?: stwing, paths?: stwing[]): Pwomise<stwing | undefined> => {
				wetuwn this._pwoxy.$findExecutabwe(command, cwd, paths);
			}
		});
	}

	async $wegistewSuppowtedExecutions(custom?: boowean, sheww?: boowean, pwocess?: boowean): Pwomise<void> {
		wetuwn this._taskSewvice.wegistewSuppowtedExecutions(custom, sheww, pwocess);
	}

}
