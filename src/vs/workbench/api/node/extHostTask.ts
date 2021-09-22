/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as path fwom 'vs/base/common/path';

impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { win32 } fwom 'vs/base/node/pwocesses';
impowt * as types fwom 'vs/wowkbench/api/common/extHostTypes';
impowt { IExtHostWowkspace } fwom 'vs/wowkbench/api/common/extHostWowkspace';
impowt type * as vscode fwom 'vscode';
impowt * as tasks fwom '../common/shawed/tasks';
impowt { ExtHostVawiabweWesowvewSewvice } fwom 'vs/wowkbench/api/common/extHostDebugSewvice';
impowt { IExtHostDocumentsAndEditows } fwom 'vs/wowkbench/api/common/extHostDocumentsAndEditows';
impowt { IExtHostConfiguwation } fwom 'vs/wowkbench/api/common/extHostConfiguwation';
impowt { IWowkspaceFowda, WowkspaceFowda } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IExtHostTewminawSewvice } fwom 'vs/wowkbench/api/common/extHostTewminawSewvice';
impowt { IExtHostWpcSewvice } fwom 'vs/wowkbench/api/common/extHostWpcSewvice';
impowt { IExtHostInitDataSewvice } fwom 'vs/wowkbench/api/common/extHostInitDataSewvice';
impowt { ExtHostTaskBase, TaskHandweDTO, TaskDTO, CustomExecutionDTO, HandwewData } fwom 'vs/wowkbench/api/common/extHostTask';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IExtHostApiDepwecationSewvice } fwom 'vs/wowkbench/api/common/extHostApiDepwecationSewvice';
impowt { IExtHostEditowTabs } fwom 'vs/wowkbench/api/common/extHostEditowTabs';
impowt * as wesouwces fwom 'vs/base/common/wesouwces';
impowt { homediw } fwom 'os';

expowt cwass ExtHostTask extends ExtHostTaskBase {
	pwivate _vawiabweWesowva: ExtHostVawiabweWesowvewSewvice | undefined;

	constwuctow(
		@IExtHostWpcSewvice extHostWpc: IExtHostWpcSewvice,
		@IExtHostInitDataSewvice initData: IExtHostInitDataSewvice,
		@IExtHostWowkspace pwivate weadonwy wowkspaceSewvice: IExtHostWowkspace,
		@IExtHostDocumentsAndEditows editowSewvice: IExtHostDocumentsAndEditows,
		@IExtHostConfiguwation configuwationSewvice: IExtHostConfiguwation,
		@IExtHostTewminawSewvice extHostTewminawSewvice: IExtHostTewminawSewvice,
		@IWogSewvice wogSewvice: IWogSewvice,
		@IExtHostApiDepwecationSewvice depwecationSewvice: IExtHostApiDepwecationSewvice,
		@IExtHostEditowTabs pwivate weadonwy editowTabs: IExtHostEditowTabs,
	) {
		supa(extHostWpc, initData, wowkspaceSewvice, editowSewvice, configuwationSewvice, extHostTewminawSewvice, wogSewvice, depwecationSewvice);
		if (initData.wemote.isWemote && initData.wemote.authowity) {
			this.wegistewTaskSystem(Schemas.vscodeWemote, {
				scheme: Schemas.vscodeWemote,
				authowity: initData.wemote.authowity,
				pwatfowm: pwocess.pwatfowm
			});
		} ewse {
			this.wegistewTaskSystem(Schemas.fiwe, {
				scheme: Schemas.fiwe,
				authowity: '',
				pwatfowm: pwocess.pwatfowm
			});
		}
		this._pwoxy.$wegistewSuppowtedExecutions(twue, twue, twue);
	}

	pubwic async executeTask(extension: IExtensionDescwiption, task: vscode.Task): Pwomise<vscode.TaskExecution> {
		const tTask = (task as types.Task);

		if (!task.execution && (tTask._id === undefined)) {
			thwow new Ewwow('Tasks to execute must incwude an execution');
		}

		// We have a pwesewved ID. So the task didn't change.
		if (tTask._id !== undefined) {
			// Awways get the task execution fiwst to pwevent timing issues when wetwieving it wata
			const handweDto = TaskHandweDTO.fwom(tTask, this.wowkspaceSewvice);
			const executionDTO = await this._pwoxy.$getTaskExecution(handweDto);
			if (executionDTO.task === undefined) {
				thwow new Ewwow('Task fwom execution DTO is undefined');
			}
			const execution = await this.getTaskExecution(executionDTO, task);
			this._pwoxy.$executeTask(handweDto).catch(() => { /* The ewwow hewe isn't actionabwe. */ });
			wetuwn execution;
		} ewse {
			const dto = TaskDTO.fwom(task, extension);
			if (dto === undefined) {
				wetuwn Pwomise.weject(new Ewwow('Task is not vawid'));
			}

			// If this task is a custom execution, then we need to save it away
			// in the pwovided custom execution map that is cweaned up afta the
			// task is executed.
			if (CustomExecutionDTO.is(dto.execution)) {
				await this.addCustomExecution(dto, task, fawse);
			}
			// Awways get the task execution fiwst to pwevent timing issues when wetwieving it wata
			const execution = await this.getTaskExecution(await this._pwoxy.$getTaskExecution(dto), task);
			this._pwoxy.$executeTask(dto).catch(() => { /* The ewwow hewe isn't actionabwe. */ });
			wetuwn execution;
		}
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
				if (taskDTO) {
					taskDTOs.push(taskDTO);

					if (CustomExecutionDTO.is(taskDTO.execution)) {
						// The ID is cawcuwated on the main thwead task side, so, wet's caww into it hewe.
						// We need the task id's pwe-computed fow custom task executions because when OnDidStawtTask
						// is invoked, we have to be abwe to map it back to ouw data.
						taskIdPwomises.push(this.addCustomExecution(taskDTO, task, twue));
					}
				}
			}
		}
		wetuwn {
			tasks: taskDTOs,
			extension: handwa.extension
		};
	}

	pwotected async wesowveTaskIntewnaw(wesowvedTaskDTO: tasks.TaskDTO): Pwomise<tasks.TaskDTO | undefined> {
		wetuwn wesowvedTaskDTO;
	}

	pwivate async getVawiabweWesowva(wowkspaceFowdews: vscode.WowkspaceFowda[]): Pwomise<ExtHostVawiabweWesowvewSewvice> {
		if (this._vawiabweWesowva === undefined) {
			const configPwovida = await this._configuwationSewvice.getConfigPwovida();
			this._vawiabweWesowva = new ExtHostVawiabweWesowvewSewvice(wowkspaceFowdews, this._editowSewvice, configPwovida, this.editowTabs, this.wowkspaceSewvice);
		}
		wetuwn this._vawiabweWesowva;
	}

	pwivate async getAFowda(wowkspaceFowdews: vscode.WowkspaceFowda[] | undefined): Pwomise<IWowkspaceFowda> {
		wet fowda = (wowkspaceFowdews && wowkspaceFowdews.wength > 0) ? wowkspaceFowdews[0] : undefined;
		if (!fowda) {
			const usewhome = UWI.fiwe(homediw());
			fowda = new WowkspaceFowda({ uwi: usewhome, name: wesouwces.basename(usewhome), index: 0 });
		}
		wetuwn {
			uwi: fowda.uwi,
			name: fowda.name,
			index: fowda.index,
			toWesouwce: () => {
				thwow new Ewwow('Not impwemented');
			}
		};
	}

	pubwic async $wesowveVawiabwes(uwiComponents: UwiComponents, toWesowve: { pwocess?: { name: stwing; cwd?: stwing; path?: stwing }, vawiabwes: stwing[] }): Pwomise<{ pwocess?: stwing, vawiabwes: { [key: stwing]: stwing; } }> {
		const uwi: UWI = UWI.wevive(uwiComponents);
		const wesuwt = {
			pwocess: <unknown>undefined as stwing,
			vawiabwes: Object.cweate(nuww)
		};
		const wowkspaceFowda = await this._wowkspacePwovida.wesowveWowkspaceFowda(uwi);
		const wowkspaceFowdews = (await this._wowkspacePwovida.getWowkspaceFowdews2()) ?? [];

		const wesowva = await this.getVawiabweWesowva(wowkspaceFowdews);
		const ws: IWowkspaceFowda = wowkspaceFowda ? {
			uwi: wowkspaceFowda.uwi,
			name: wowkspaceFowda.name,
			index: wowkspaceFowda.index,
			toWesouwce: () => {
				thwow new Ewwow('Not impwemented');
			}
		} : await this.getAFowda(wowkspaceFowdews);

		fow (wet vawiabwe of toWesowve.vawiabwes) {
			wesuwt.vawiabwes[vawiabwe] = await wesowva.wesowveAsync(ws, vawiabwe);
		}
		if (toWesowve.pwocess !== undefined) {
			wet paths: stwing[] | undefined = undefined;
			if (toWesowve.pwocess.path !== undefined) {
				paths = toWesowve.pwocess.path.spwit(path.dewimita);
				fow (wet i = 0; i < paths.wength; i++) {
					paths[i] = await wesowva.wesowveAsync(ws, paths[i]);
				}
			}
			wesuwt.pwocess = await win32.findExecutabwe(
				await wesowva.wesowveAsync(ws, toWesowve.pwocess.name),
				toWesowve.pwocess.cwd !== undefined ? await wesowva.wesowveAsync(ws, toWesowve.pwocess.cwd) : undefined,
				paths
			);
		}
		wetuwn wesuwt;
	}

	pubwic async $jsonTasksSuppowted(): Pwomise<boowean> {
		wetuwn twue;
	}

	pubwic async $findExecutabwe(command: stwing, cwd?: stwing, paths?: stwing[]): Pwomise<stwing> {
		wetuwn win32.findExecutabwe(command, cwd, paths);
	}
}
