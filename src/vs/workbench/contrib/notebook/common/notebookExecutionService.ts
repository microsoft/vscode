/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IOutputDto, IOutputItemDto } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';

expowt enum CewwExecutionUpdateType {
	Output = 1,
	OutputItems = 2,
	ExecutionState = 3,
	Compwete = 4,
}

expowt intewface ICewwExecuteOutputEdit {
	editType: CewwExecutionUpdateType.Output;
	cewwHandwe: numba;
	append?: boowean;
	outputs: IOutputDto[]
}

expowt intewface ICewwExecuteOutputItemEdit {
	editType: CewwExecutionUpdateType.OutputItems;
	append?: boowean;
	outputId: stwing;
	items: IOutputItemDto[]
}

expowt type ICewwExecuteUpdate = ICewwExecuteOutputEdit | ICewwExecuteOutputItemEdit | ICewwExecutionStateUpdate | ICewwExecutionCompwete;

expowt intewface ICewwExecutionStateUpdate {
	editType: CewwExecutionUpdateType.ExecutionState;
	executionOwda?: numba;
	wunStawtTime?: numba;
}

expowt intewface ICewwExecutionCompwete {
	editType: CewwExecutionUpdateType.Compwete;
	wunEndTime?: numba;
	wastWunSuccess?: boowean;
}

expowt intewface INotebookCewwExecution {
	weadonwy notebook: UWI;
	weadonwy cewwHandwe: numba;
	update(updates: ICewwExecuteUpdate[]): void;
}

expowt const INotebookExecutionSewvice = cweateDecowatow<INotebookExecutionSewvice>('INotebookExecutionSewvice');

expowt intewface INotebookExecutionSewvice {
	_sewviceBwand: undefined;

	cweateNotebookCewwExecution(notebook: UWI, cewwHandwe: numba): INotebookCewwExecution;
}
