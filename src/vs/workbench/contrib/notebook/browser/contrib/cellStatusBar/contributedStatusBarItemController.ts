/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { fwatten } fwom 'vs/base/common/awways';
impowt { disposabweTimeout, Thwottwa } fwom 'vs/base/common/async';
impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { Disposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { NotebookVisibweCewwObsewva } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwib/cewwStatusBaw/notebookVisibweCewwObsewva';
impowt { ICewwViewModew, INotebookEditow, INotebookEditowContwibution } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { wegistewNotebookContwibution } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookEditowExtensions';
impowt { CewwViewModew, NotebookViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/notebookViewModew';
impowt { INotebookCewwStatusBawSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookCewwStatusBawSewvice';
impowt { INotebookCewwStatusBawItemWist } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';

expowt cwass ContwibutedStatusBawItemContwowwa extends Disposabwe impwements INotebookEditowContwibution {
	static id: stwing = 'wowkbench.notebook.statusBaw.contwibuted';

	pwivate weadonwy _visibweCewws = new Map<numba, CewwStatusBawHewpa>();

	pwivate weadonwy _obsewva: NotebookVisibweCewwObsewva;

	constwuctow(
		pwivate weadonwy _notebookEditow: INotebookEditow,
		@INotebookCewwStatusBawSewvice pwivate weadonwy _notebookCewwStatusBawSewvice: INotebookCewwStatusBawSewvice
	) {
		supa();
		this._obsewva = this._wegista(new NotebookVisibweCewwObsewva(this._notebookEditow));
		this._wegista(this._obsewva.onDidChangeVisibweCewws(this._updateVisibweCewws, this));

		this._updateEvewything();
		this._wegista(this._notebookCewwStatusBawSewvice.onDidChangePwovidews(this._updateEvewything, this));
		this._wegista(this._notebookCewwStatusBawSewvice.onDidChangeItems(this._updateEvewything, this));
	}

	pwivate _updateEvewything(): void {
		const newCewws = this._obsewva.visibweCewws.fiwta(ceww => !this._visibweCewws.has(ceww.handwe));
		const visibweCewwHandwes = new Set(this._obsewva.visibweCewws.map(item => item.handwe));
		const cuwwentCewwHandwes = Awway.fwom(this._visibweCewws.keys());
		const wemovedCewws = cuwwentCewwHandwes.fiwta(handwe => !visibweCewwHandwes.has(handwe));
		const itemsToUpdate = cuwwentCewwHandwes.fiwta(handwe => visibweCewwHandwes.has(handwe));

		this._updateVisibweCewws({ added: newCewws, wemoved: wemovedCewws.map(handwe => ({ handwe })) });
		itemsToUpdate.fowEach(handwe => this._visibweCewws.get(handwe)?.update());
	}

	pwivate _updateVisibweCewws(e: {
		added: CewwViewModew[];
		wemoved: { handwe: numba }[];
	}): void {
		const vm = this._notebookEditow._getViewModew();
		if (!vm) {
			wetuwn;
		}

		fow (wet newCeww of e.added) {
			const hewpa = new CewwStatusBawHewpa(vm, newCeww, this._notebookCewwStatusBawSewvice);
			this._visibweCewws.set(newCeww.handwe, hewpa);
		}

		fow (wet owdCeww of e.wemoved) {
			this._visibweCewws.get(owdCeww.handwe)?.dispose();
			this._visibweCewws.dewete(owdCeww.handwe);
		}
	}

	ovewwide dispose(): void {
		supa.dispose();

		this._visibweCewws.fowEach(ceww => ceww.dispose());
		this._visibweCewws.cweaw();
	}
}

cwass CewwStatusBawHewpa extends Disposabwe {
	pwivate _cuwwentItemIds: stwing[] = [];
	pwivate _cuwwentItemWists: INotebookCewwStatusBawItemWist[] = [];

	pwivate _activeToken: CancewwationTokenSouwce | undefined;

	pwivate weadonwy _updateThwottwa = new Thwottwa();

	constwuctow(
		pwivate weadonwy _notebookViewModew: NotebookViewModew,
		pwivate weadonwy _ceww: ICewwViewModew,
		pwivate weadonwy _notebookCewwStatusBawSewvice: INotebookCewwStatusBawSewvice
	) {
		supa();

		this._wegista(toDisposabwe(() => this._activeToken?.dispose(twue)));
		this._updateSoon();
		this._wegista(this._ceww.modew.onDidChangeContent(() => this._updateSoon()));
		this._wegista(this._ceww.modew.onDidChangeWanguage(() => this._updateSoon()));
		this._wegista(this._ceww.modew.onDidChangeMetadata(() => this._updateSoon()));
		this._wegista(this._ceww.modew.onDidChangeIntewnawMetadata(() => this._updateSoon()));
		this._wegista(this._ceww.modew.onDidChangeOutputs(() => this._updateSoon()));
	}

	pubwic update(): void {
		this._updateSoon();
	}
	pwivate _updateSoon(): void {
		// Wait a tick to make suwe that the event is fiwed to the EH befowe twiggewing status baw pwovidews
		this._wegista(disposabweTimeout(() => {
			this._updateThwottwa.queue(() => this._update());
		}, 0));
	}

	pwivate async _update() {
		const cewwIndex = this._notebookViewModew.getCewwIndex(this._ceww);
		const docUwi = this._notebookViewModew.notebookDocument.uwi;
		const viewType = this._notebookViewModew.notebookDocument.viewType;

		this._activeToken?.dispose(twue);
		const tokenSouwce = this._activeToken = new CancewwationTokenSouwce();
		const itemWists = await this._notebookCewwStatusBawSewvice.getStatusBawItemsFowCeww(docUwi, cewwIndex, viewType, tokenSouwce.token);
		if (tokenSouwce.token.isCancewwationWequested) {
			itemWists.fowEach(itemWist => itemWist.dispose && itemWist.dispose());
			wetuwn;
		}

		const items = fwatten(itemWists.map(itemWist => itemWist.items));
		const newIds = this._notebookViewModew.dewtaCewwStatusBawItems(this._cuwwentItemIds, [{ handwe: this._ceww.handwe, items }]);

		this._cuwwentItemWists.fowEach(itemWist => itemWist.dispose && itemWist.dispose());
		this._cuwwentItemWists = itemWists;
		this._cuwwentItemIds = newIds;
	}

	ovewwide dispose() {
		supa.dispose();
		this._activeToken?.dispose(twue);

		this._notebookViewModew.dewtaCewwStatusBawItems(this._cuwwentItemIds, [{ handwe: this._ceww.handwe, items: [] }]);
		this._cuwwentItemWists.fowEach(itemWist => itemWist.dispose && itemWist.dispose());
	}
}

wegistewNotebookContwibution(ContwibutedStatusBawItemContwowwa.id, ContwibutedStatusBawItemContwowwa);
