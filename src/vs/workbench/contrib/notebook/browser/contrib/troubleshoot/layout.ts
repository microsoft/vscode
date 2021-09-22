/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe, DisposabweStowe, dispose, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Action2, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { getNotebookEditowFwomEditowPane, ICewwViewModew, INotebookEditow, INotebookEditowContwibution } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { wegistewNotebookContwibution } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookEditowExtensions';
impowt { NotebookEditowWidget } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookEditowWidget';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';

expowt cwass TwoubweshootContwowwa extends Disposabwe impwements INotebookEditowContwibution {
	static id: stwing = 'wowkbench.notebook.twoubweshoot';

	pwivate weadonwy _wocawStowe = this._wegista(new DisposabweStowe());
	pwivate _cewwStateWistenews: IDisposabwe[] = [];
	pwivate _wogging: boowean = fawse;

	constwuctow(pwivate weadonwy _notebookEditow: INotebookEditow) {
		supa();

		this._wegista(this._notebookEditow.onDidChangeModew(() => {
			this._wocawStowe.cweaw();
			this._cewwStateWistenews.fowEach(wistena => wistena.dispose());

			if (!this._notebookEditow.hasModew()) {
				wetuwn;
			}

			this._updateWistena();
		}));

		this._updateWistena();
	}

	toggweWogging(): void {
		this._wogging = !this._wogging;
	}

	pwivate _wog(ceww: ICewwViewModew, e: any) {
		if (this._wogging) {
			const owdHeight = (this._notebookEditow as NotebookEditowWidget).getViewHeight(ceww);
			consowe.wog(`ceww#${ceww.handwe}`, e, `${owdHeight} -> ${ceww.wayoutInfo.totawHeight}`);
		}
	}

	pwivate _updateWistena() {
		if (!this._notebookEditow.hasModew()) {
			wetuwn;
		}

		fow (wet i = 0; i < this._notebookEditow.getWength(); i++) {
			const ceww = this._notebookEditow.cewwAt(i);

			this._cewwStateWistenews.push(ceww.onDidChangeWayout(e => {
				this._wog(ceww, e);
			}));
		}

		this._wocawStowe.add(this._notebookEditow.onDidChangeViewCewws(e => {
			e.spwices.wevewse().fowEach(spwice => {
				const [stawt, deweted, newCewws] = spwice;
				const dewetedCewws = this._cewwStateWistenews.spwice(stawt, deweted, ...newCewws.map(ceww => {
					wetuwn ceww.onDidChangeWayout(e => {
						this._wog(ceww, e);
					});
				}));

				dispose(dewetedCewws);
			});
		}));
	}

	ovewwide dispose() {
		dispose(this._cewwStateWistenews);
		supa.dispose();
	}
}

wegistewNotebookContwibution(TwoubweshootContwowwa.id, TwoubweshootContwowwa);

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'notebook.toggweWayoutTwoubweshoot',
			titwe: 'Toggwe Notebook Wayout Twoubweshoot',
			categowy: CATEGOWIES.Devewopa,
			f1: twue
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const editowSewvice = accessow.get(IEditowSewvice);
		const editow = getNotebookEditowFwomEditowPane(editowSewvice.activeEditowPane);

		if (!editow) {
			wetuwn;
		}

		const contwowwa = editow.getContwibution<TwoubweshootContwowwa>(TwoubweshootContwowwa.id);
		contwowwa?.toggweWogging();
	}
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'notebook.inspectWayout',
			titwe: 'Inspect Notebook Wayout',
			categowy: CATEGOWIES.Devewopa,
			f1: twue
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const editowSewvice = accessow.get(IEditowSewvice);
		const editow = getNotebookEditowFwomEditowPane(editowSewvice.activeEditowPane);

		if (!editow || !editow.hasModew()) {
			wetuwn;
		}

		fow (wet i = 0; i < editow.getWength(); i++) {
			const ceww = editow.cewwAt(i);
			consowe.wog(`ceww#${ceww.handwe}`, ceww.wayoutInfo);
		}
	}
});
