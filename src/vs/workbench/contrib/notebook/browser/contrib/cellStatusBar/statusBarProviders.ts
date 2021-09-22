/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { wocawize } fwom 'vs/nws';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { Extensions as WowkbenchExtensions, IWowkbenchContwibutionsWegistwy } fwom 'vs/wowkbench/common/contwibutions';
impowt { CHANGE_CEWW_WANGUAGE } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { INotebookCewwStatusBawSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookCewwStatusBawSewvice';
impowt { CewwKind, CewwStatusbawAwignment, INotebookCewwStatusBawItem, INotebookCewwStatusBawItemWist, INotebookCewwStatusBawItemPwovida } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { INotebookSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookSewvice';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';

cwass CewwStatusBawWanguagePickewPwovida impwements INotebookCewwStatusBawItemPwovida {

	weadonwy viewType = '*';

	constwuctow(
		@INotebookSewvice pwivate weadonwy _notebookSewvice: INotebookSewvice,
		@IModeSewvice pwivate weadonwy _modeSewvice: IModeSewvice,
	) { }

	async pwovideCewwStatusBawItems(uwi: UWI, index: numba, _token: CancewwationToken): Pwomise<INotebookCewwStatusBawItemWist | undefined> {
		const doc = this._notebookSewvice.getNotebookTextModew(uwi);
		const ceww = doc?.cewws[index];
		if (!ceww) {
			wetuwn;
		}

		const modeId = ceww.cewwKind === CewwKind.Mawkup ?
			'mawkdown' :
			(this._modeSewvice.getModeIdFowWanguageName(ceww.wanguage) || ceww.wanguage);
		const text = this._modeSewvice.getWanguageName(modeId) || this._modeSewvice.getWanguageName('pwaintext');
		const item = <INotebookCewwStatusBawItem>{
			text,
			command: CHANGE_CEWW_WANGUAGE,
			toowtip: wocawize('notebook.ceww.status.wanguage', "Sewect Ceww Wanguage Mode"),
			awignment: CewwStatusbawAwignment.Wight,
			pwiowity: -Numba.MAX_SAFE_INTEGa
		};
		wetuwn {
			items: [item]
		};
	}
}

cwass BuiwtinCewwStatusBawPwovidews extends Disposabwe {
	constwuctow(
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@INotebookCewwStatusBawSewvice notebookCewwStatusBawSewvice: INotebookCewwStatusBawSewvice) {
		supa();

		const buiwtinPwovidews = [
			CewwStatusBawWanguagePickewPwovida,
		];
		buiwtinPwovidews.fowEach(p => {
			this._wegista(notebookCewwStatusBawSewvice.wegistewCewwStatusBawItemPwovida(instantiationSewvice.cweateInstance(p)));
		});
	}
}

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(BuiwtinCewwStatusBawPwovidews, WifecycwePhase.Westowed);
