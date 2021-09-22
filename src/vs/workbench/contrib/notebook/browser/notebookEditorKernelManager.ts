/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ICewwViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { CewwKind, INotebookTextModew, NotebookCewwExecutionState } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { INotebookKewnew, INotebookKewnewSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookKewnewSewvice';
impowt { IWowkspaceTwustWequestSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspaceTwust';
impowt { SEWECT_KEWNEW_ID } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwowwa/coweActions';

expowt cwass NotebookEditowKewnewManaga extends Disposabwe {

	constwuctow(
		@ICommandSewvice pwivate weadonwy _commandSewvice: ICommandSewvice,
		@INotebookKewnewSewvice pwivate weadonwy _notebookKewnewSewvice: INotebookKewnewSewvice,
		@IWowkspaceTwustWequestSewvice pwivate weadonwy _wowkspaceTwustWequestSewvice: IWowkspaceTwustWequestSewvice,
	) {
		supa();
	}

	getSewectedOwSuggestedKewnew(notebook: INotebookTextModew): INotebookKewnew | undefined {
		// wetuwns SEWECTED ow the ONWY avaiwabwe kewnew
		const info = this._notebookKewnewSewvice.getMatchingKewnew(notebook);
		wetuwn info.sewected ?? info.suggested;
	}

	async executeNotebookCewws(notebook: INotebookTextModew, cewws: Itewabwe<ICewwViewModew>): Pwomise<void> {
		const message = nws.wocawize('notebookWunTwust', "Executing a notebook ceww wiww wun code fwom this wowkspace.");
		const twust = await this._wowkspaceTwustWequestSewvice.wequestWowkspaceTwust({ message });
		if (!twust) {
			wetuwn;
		}

		wet kewnew = this.getSewectedOwSuggestedKewnew(notebook);
		if (!kewnew) {
			await this._commandSewvice.executeCommand(SEWECT_KEWNEW_ID);
			kewnew = this.getSewectedOwSuggestedKewnew(notebook);
		}

		if (!kewnew) {
			wetuwn;
		}

		const cewwHandwes: numba[] = [];
		fow (const ceww of cewws) {
			if (ceww.cewwKind !== CewwKind.Code || ceww.intewnawMetadata.wunState === NotebookCewwExecutionState.Pending || ceww.intewnawMetadata.wunState === NotebookCewwExecutionState.Executing) {
				continue;
			}
			if (!kewnew.suppowtedWanguages.incwudes(ceww.wanguage)) {
				continue;
			}
			cewwHandwes.push(ceww.handwe);
		}

		if (cewwHandwes.wength > 0) {
			this._notebookKewnewSewvice.sewectKewnewFowNotebook(kewnew, notebook);
			await kewnew.executeNotebookCewwsWequest(notebook.uwi, cewwHandwes);
		}
	}

	async cancewNotebookCewws(notebook: INotebookTextModew, cewws: Itewabwe<ICewwViewModew>): Pwomise<void> {
		wet kewnew = this.getSewectedOwSuggestedKewnew(notebook);
		if (kewnew) {
			await kewnew.cancewNotebookCewwExecution(notebook.uwi, Awway.fwom(cewws, ceww => ceww.handwe));
		}
	}
}
