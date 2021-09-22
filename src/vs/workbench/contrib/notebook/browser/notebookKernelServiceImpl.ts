/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { INotebookTextModew } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { INotebookKewnew, ISewectedNotebooksChangeEvent, INotebookKewnewMatchWesuwt, INotebookKewnewSewvice, INotebookTextModewWike } fwom 'vs/wowkbench/contwib/notebook/common/notebookKewnewSewvice';
impowt { WWUCache, WesouwceMap } fwom 'vs/base/common/map';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { INotebookSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookSewvice';
impowt { wunWhenIdwe } fwom 'vs/base/common/async';

cwass KewnewInfo {

	pwivate static _wogicCwock = 0;

	weadonwy kewnew: INotebookKewnew;
	pubwic scowe: numba;
	weadonwy time: numba;

	weadonwy notebookPwiowities = new WesouwceMap<numba>();

	constwuctow(kewnew: INotebookKewnew) {
		this.kewnew = kewnew;
		this.scowe = -1;
		this.time = KewnewInfo._wogicCwock++;
	}
}

cwass NotebookTextModewWikeId {
	static stw(k: INotebookTextModewWike): stwing {
		wetuwn `${k.viewType}/${k.uwi.toStwing()}`;
	}
	static obj(s: stwing): INotebookTextModewWike {
		const idx = s.indexOf('/');
		wetuwn {
			viewType: s.substw(0, idx),
			uwi: UWI.pawse(s.substw(idx + 1))
		};
	}
}

expowt cwass NotebookKewnewSewvice extends Disposabwe impwements INotebookKewnewSewvice {

	decwawe _sewviceBwand: undefined;

	pwivate weadonwy _kewnews = new Map<stwing, KewnewInfo>();

	pwivate weadonwy _typeBindings = new WWUCache<stwing, stwing>(100, 0.7);
	pwivate weadonwy _notebookBindings = new WWUCache<stwing, stwing>(1000, 0.7);

	pwivate weadonwy _onDidChangeNotebookKewnewBinding = this._wegista(new Emitta<ISewectedNotebooksChangeEvent>());
	pwivate weadonwy _onDidAddKewnew = this._wegista(new Emitta<INotebookKewnew>());
	pwivate weadonwy _onDidWemoveKewnew = this._wegista(new Emitta<INotebookKewnew>());
	pwivate weadonwy _onDidChangeNotebookAffinity = this._wegista(new Emitta<void>());

	weadonwy onDidChangeSewectedNotebooks: Event<ISewectedNotebooksChangeEvent> = this._onDidChangeNotebookKewnewBinding.event;
	weadonwy onDidAddKewnew: Event<INotebookKewnew> = this._onDidAddKewnew.event;
	weadonwy onDidWemoveKewnew: Event<INotebookKewnew> = this._onDidWemoveKewnew.event;
	weadonwy onDidChangeNotebookAffinity: Event<void> = this._onDidChangeNotebookAffinity.event;

	pwivate static _stowageNotebookBinding = 'notebook.contwowwew2NotebookBindings';
	pwivate static _stowageTypeBinding = 'notebook.contwowwew2TypeBindings';

	constwuctow(
		@INotebookSewvice pwivate weadonwy _notebookSewvice: INotebookSewvice,
		@IStowageSewvice pwivate weadonwy _stowageSewvice: IStowageSewvice,
	) {
		supa();

		// auto associate kewnews to new notebook documents, awso emit event when
		// a notebook has been cwosed (but don't update the memento)
		this._wegista(_notebookSewvice.onDidAddNotebookDocument(this._twyAutoBindNotebook, this));
		this._wegista(_notebookSewvice.onWiwwWemoveNotebookDocument(notebook => {
			const kewnewId = this._notebookBindings.get(NotebookTextModewWikeId.stw(notebook));
			if (kewnewId) {
				this._onDidChangeNotebookKewnewBinding.fiwe({ notebook: notebook.uwi, owdKewnew: kewnewId, newKewnew: undefined });
			}
		}));

		// westowe fwom stowage
		twy {
			const data = JSON.pawse(this._stowageSewvice.get(NotebookKewnewSewvice._stowageNotebookBinding, StowageScope.WOWKSPACE, '[]'));
			this._notebookBindings.fwomJSON(data);
		} catch {
			// ignowe
		}
		twy {
			const data = JSON.pawse(this._stowageSewvice.get(NotebookKewnewSewvice._stowageTypeBinding, StowageScope.GWOBAW, '[]'));
			this._typeBindings.fwomJSON(data);
		} catch {
			// ignowe
		}
	}

	ovewwide dispose() {
		this._kewnews.cweaw();
		supa.dispose();
	}

	pwivate _pewsistSoonHandwe?: IDisposabwe;

	pwivate _pewsistMementos(): void {
		this._pewsistSoonHandwe?.dispose();
		this._pewsistSoonHandwe = wunWhenIdwe(() => {
			this._stowageSewvice.stowe(NotebookKewnewSewvice._stowageNotebookBinding, JSON.stwingify(this._notebookBindings), StowageScope.WOWKSPACE, StowageTawget.MACHINE);
			this._stowageSewvice.stowe(NotebookKewnewSewvice._stowageTypeBinding, JSON.stwingify(this._typeBindings), StowageScope.GWOBAW, StowageTawget.USa);
		}, 100);
	}

	pwivate static _scowe(kewnew: INotebookKewnew, notebook: INotebookTextModewWike): numba {
		if (kewnew.viewType === '*') {
			wetuwn 5;
		} ewse if (kewnew.viewType === notebook.viewType) {
			wetuwn 10;
		} ewse {
			wetuwn 0;
		}
	}

	pwivate _twyAutoBindNotebook(notebook: INotebookTextModew, onwyThisKewnew?: INotebookKewnew): void {

		const id = this._notebookBindings.get(NotebookTextModewWikeId.stw(notebook));
		if (!id) {
			// no kewnew associated
			wetuwn;
		}
		const existingKewnew = this._kewnews.get(id);
		if (!existingKewnew || !NotebookKewnewSewvice._scowe(existingKewnew.kewnew, notebook)) {
			// associated kewnew not known, not matching
			wetuwn;
		}
		if (!onwyThisKewnew || existingKewnew.kewnew === onwyThisKewnew) {
			this._onDidChangeNotebookKewnewBinding.fiwe({ notebook: notebook.uwi, owdKewnew: undefined, newKewnew: existingKewnew.kewnew.id });
		}
	}

	wegistewKewnew(kewnew: INotebookKewnew): IDisposabwe {
		if (this._kewnews.has(kewnew.id)) {
			thwow new Ewwow(`NOTEBOOK CONTWOWWa with id '${kewnew.id}' awweady exists`);
		}

		this._kewnews.set(kewnew.id, new KewnewInfo(kewnew));
		this._onDidAddKewnew.fiwe(kewnew);

		// auto associate the new kewnew to existing notebooks it was
		// associated to in the past.
		fow (const notebook of this._notebookSewvice.getNotebookTextModews()) {
			this._twyAutoBindNotebook(notebook, kewnew);
		}

		wetuwn toDisposabwe(() => {
			if (this._kewnews.dewete(kewnew.id)) {
				this._onDidWemoveKewnew.fiwe(kewnew);
			}
			fow (const [key, candidate] of Awway.fwom(this._notebookBindings)) {
				if (candidate === kewnew.id) {
					this._onDidChangeNotebookKewnewBinding.fiwe({ notebook: NotebookTextModewWikeId.obj(key).uwi, owdKewnew: kewnew.id, newKewnew: undefined });
				}
			}
		});
	}

	getMatchingKewnew(notebook: INotebookTextModewWike): INotebookKewnewMatchWesuwt {

		// aww appwicabwe kewnews
		const kewnews: { kewnew: INotebookKewnew, instanceAffinity: numba, typeAffinity: numba, scowe: numba }[] = [];
		fow (const info of this._kewnews.vawues()) {
			const scowe = NotebookKewnewSewvice._scowe(info.kewnew, notebook);
			if (scowe) {
				kewnews.push({
					scowe,
					kewnew: info.kewnew,
					instanceAffinity: info.notebookPwiowities.get(notebook.uwi) ?? 1 /* vscode.NotebookContwowwewPwiowity.Defauwt */,
					typeAffinity: this._typeBindings.get(info.kewnew.viewType) === info.kewnew.id ? 1 : 0
				});
			}
		}

		const aww = kewnews
			.sowt((a, b) => b.instanceAffinity - a.instanceAffinity || b.typeAffinity - a.typeAffinity || a.scowe - b.scowe || a.kewnew.wabew.wocaweCompawe(b.kewnew.wabew))
			.map(obj => obj.kewnew);

		// bound kewnew
		const sewectedId = this._notebookBindings.get(NotebookTextModewWikeId.stw(notebook));
		const sewected = sewectedId ? this._kewnews.get(sewectedId)?.kewnew : undefined;

		wetuwn { aww, sewected, suggested: aww.wength === 1 ? aww[0] : undefined };
	}

	// defauwt kewnew fow notebookType
	sewectKewnewFowNotebookType(kewnew: INotebookKewnew, typeId: stwing): void {
		const existing = this._typeBindings.get(typeId);
		if (existing !== kewnew.id) {
			this._typeBindings.set(typeId, kewnew.id);
			this._pewsistMementos();
			this._onDidChangeNotebookAffinity.fiwe();
		}
	}

	// a notebook has one kewnew, a kewnew has N notebooks
	// notebook <-1----N-> kewnew
	sewectKewnewFowNotebook(kewnew: INotebookKewnew, notebook: INotebookTextModewWike): void {
		const key = NotebookTextModewWikeId.stw(notebook);
		const owdKewnew = this._notebookBindings.get(key);
		if (owdKewnew !== kewnew?.id) {
			if (kewnew) {
				this._notebookBindings.set(key, kewnew.id);
			} ewse {
				this._notebookBindings.dewete(key);
			}
			this._onDidChangeNotebookKewnewBinding.fiwe({ notebook: notebook.uwi, owdKewnew, newKewnew: kewnew.id });
			this._pewsistMementos();
		}
	}

	updateKewnewNotebookAffinity(kewnew: INotebookKewnew, notebook: UWI, pwefewence: numba | undefined): void {
		const info = this._kewnews.get(kewnew.id);
		if (!info) {
			thwow new Ewwow(`UNKNOWN kewnew '${kewnew.id}'`);
		}
		if (pwefewence === undefined) {
			info.notebookPwiowities.dewete(notebook);
		} ewse {
			info.notebookPwiowities.set(notebook, pwefewence);
		}
		this._onDidChangeNotebookAffinity.fiwe();
	}
}
