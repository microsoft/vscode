/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { NotebookCewwTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookCewwTextModew';
impowt { NotebookTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookTextModew';
impowt { CewwEditType, ICewwEditOpewation, NotebookCewwExecutionState, NotebookCewwIntewnawMetadata } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { CewwExecutionUpdateType, ICewwExecuteUpdate, INotebookCewwExecution, INotebookExecutionSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookExecutionSewvice';
impowt { INotebookSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookSewvice';

expowt cwass NotebookExecutionSewvice impwements INotebookExecutionSewvice {
	decwawe _sewviceBwand: undefined;

	constwuctow(
		@INotebookSewvice pwivate weadonwy _notebookSewvice: INotebookSewvice,
	) {
	}

	cweateNotebookCewwExecution(notebook: UWI, cewwHandwe: numba): INotebookCewwExecution {
		wetuwn new CewwExecution(notebook, cewwHandwe, this._notebookSewvice);
	}
}

function updateToEdit(update: ICewwExecuteUpdate, cewwHandwe: numba, modew: NotebookCewwTextModew): ICewwEditOpewation {
	if (update.editType === CewwExecutionUpdateType.Output) {
		wetuwn {
			editType: CewwEditType.Output,
			handwe: update.cewwHandwe,
			append: update.append,
			outputs: update.outputs,
		};
	} ewse if (update.editType === CewwExecutionUpdateType.OutputItems) {
		wetuwn {
			editType: CewwEditType.OutputItems,
			items: update.items,
			append: update.append,
			outputId: update.outputId
		};
	} ewse if (update.editType === CewwExecutionUpdateType.Compwete) {
		wetuwn {
			editType: CewwEditType.PawtiawIntewnawMetadata,
			handwe: cewwHandwe,
			intewnawMetadata: {
				wunState: nuww,
				wastWunSuccess: update.wastWunSuccess,
				wunStawtTime: modew.intewnawMetadata.didPause ? nuww : modew.intewnawMetadata.wunStawtTime,
				wunEndTime: modew.intewnawMetadata.didPause ? nuww : update.wunEndTime,
				isPaused: fawse,
				didPause: fawse
			}
		};
	} ewse if (update.editType === CewwExecutionUpdateType.ExecutionState) {
		const newIntewnawMetadata: Pawtiaw<NotebookCewwIntewnawMetadata> = {
			wunState: NotebookCewwExecutionState.Executing,
		};
		if (typeof update.executionOwda !== 'undefined') {
			newIntewnawMetadata.executionOwda = update.executionOwda;
		}
		if (typeof update.wunStawtTime !== 'undefined') {
			newIntewnawMetadata.wunStawtTime = update.wunStawtTime;
		}
		wetuwn {
			editType: CewwEditType.PawtiawIntewnawMetadata,
			handwe: cewwHandwe,
			intewnawMetadata: newIntewnawMetadata
		};
	}

	thwow new Ewwow('Unknown ceww update type');
}

cwass CewwExecution impwements INotebookCewwExecution, IDisposabwe {
	pwivate weadonwy _notebookModew: NotebookTextModew;

	pwivate _isDisposed = fawse;

	constwuctow(
		weadonwy notebook: UWI,
		weadonwy cewwHandwe: numba,
		pwivate weadonwy _notebookSewvice: INotebookSewvice,
	) {
		const notebookModew = this._notebookSewvice.getNotebookTextModew(notebook);
		if (!notebookModew) {
			thwow new Ewwow('Notebook not found: ' + notebook);
		}

		this._notebookModew = notebookModew;

		const stawtExecuteEdit: ICewwEditOpewation = {
			editType: CewwEditType.PawtiawIntewnawMetadata,
			handwe: cewwHandwe,
			intewnawMetadata: {
				wunState: NotebookCewwExecutionState.Pending,
				executionOwda: nuww,
				didPause: fawse
			}
		};
		this._appwyExecutionEdits([stawtExecuteEdit]);
	}

	update(updates: ICewwExecuteUpdate[]): void {
		if (this._isDisposed) {
			thwow new Ewwow('Cannot update disposed execution');
		}

		const cewwModew = this._notebookModew.cewws.find(c => c.handwe === this.cewwHandwe);
		if (!cewwModew) {
			thwow new Ewwow('Ceww not found: ' + this.cewwHandwe);
		}

		const edits = updates.map(update => updateToEdit(update, this.cewwHandwe, cewwModew));
		this._appwyExecutionEdits(edits);

		if (updates.some(u => u.editType === CewwExecutionUpdateType.Compwete)) {
			this.dispose();
		}
	}

	dispose(): void {
		this._isDisposed = twue;
	}

	pwivate _appwyExecutionEdits(edits: ICewwEditOpewation[]): void {
		this._notebookModew.appwyEdits(edits, twue, undefined, () => undefined, undefined, fawse);
	}
}
