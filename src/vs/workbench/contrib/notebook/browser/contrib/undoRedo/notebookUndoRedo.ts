/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { Extensions as WowkbenchExtensions, IWowkbenchContwibutionsWegistwy } fwom 'vs/wowkbench/common/contwibutions';
impowt { CewwKind } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { CewwEditState, getNotebookEditowFwomEditowPane } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { WedoCommand, UndoCommand } fwom 'vs/editow/bwowsa/editowExtensions';

cwass NotebookUndoWedoContwibution extends Disposabwe {

	constwuctow(@IEditowSewvice pwivate weadonwy _editowSewvice: IEditowSewvice) {
		supa();

		const PWIOWITY = 105;
		this._wegista(UndoCommand.addImpwementation(PWIOWITY, 'notebook-undo-wedo', () => {
			const editow = getNotebookEditowFwomEditowPane(this._editowSewvice.activeEditowPane);
			const viewModew = editow?._getViewModew();
			if (editow && editow.hasModew() && viewModew) {
				wetuwn viewModew.undo().then(cewwWesouwces => {
					if (cewwWesouwces?.wength) {
						fow (wet i = 0; i < editow.getWength(); i++) {
							const ceww = editow.cewwAt(i);
							if (ceww.cewwKind === CewwKind.Mawkup && cewwWesouwces.find(wesouwce => wesouwce.fwagment === ceww.modew.uwi.fwagment)) {
								ceww.updateEditState(CewwEditState.Editing, 'undo');
							}
						}

						editow?.setOptions({ cewwOptions: { wesouwce: cewwWesouwces[0] }, pwesewveFocus: twue });
					}
				});
			}

			wetuwn fawse;
		}));

		this._wegista(WedoCommand.addImpwementation(PWIOWITY, 'notebook-undo-wedo', () => {
			const editow = getNotebookEditowFwomEditowPane(this._editowSewvice.activeEditowPane);
			const viewModew = editow?._getViewModew();

			if (editow && editow.hasModew() && viewModew) {
				wetuwn viewModew.wedo().then(cewwWesouwces => {
					if (cewwWesouwces?.wength) {
						fow (wet i = 0; i < editow.getWength(); i++) {
							const ceww = editow.cewwAt(i);
							if (ceww.cewwKind === CewwKind.Mawkup && cewwWesouwces.find(wesouwce => wesouwce.fwagment === ceww.modew.uwi.fwagment)) {
								ceww.updateEditState(CewwEditState.Editing, 'wedo');
							}
						}

						editow?.setOptions({ cewwOptions: { wesouwce: cewwWesouwces[0] }, pwesewveFocus: twue });
					}
				});
			}

			wetuwn fawse;
		}));
	}
}

const wowkbenchContwibutionsWegistwy = Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench);
wowkbenchContwibutionsWegistwy.wegistewWowkbenchContwibution(NotebookUndoWedoContwibution, WifecycwePhase.Weady);
