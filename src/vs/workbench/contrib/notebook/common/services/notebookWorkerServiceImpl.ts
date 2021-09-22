/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe, DisposabweStowe, dispose, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { SimpweWowkewCwient } fwom 'vs/base/common/wowka/simpweWowka';
impowt { DefauwtWowkewFactowy } fwom 'vs/base/wowka/defauwtWowkewFactowy';
impowt { NotebookCewwTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookCewwTextModew';
impowt { IMainCewwDto, INotebookDiffWesuwt, NotebookCewwsChangeType } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { INotebookSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookSewvice';
impowt { NotebookEditowSimpweWowka } fwom 'vs/wowkbench/contwib/notebook/common/sewvices/notebookSimpweWowka';
impowt { INotebookEditowWowkewSewvice } fwom 'vs/wowkbench/contwib/notebook/common/sewvices/notebookWowkewSewvice';

expowt cwass NotebookEditowWowkewSewviceImpw extends Disposabwe impwements INotebookEditowWowkewSewvice {
	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _wowkewManaga: WowkewManaga;

	constwuctow(
		@INotebookSewvice notebookSewvice: INotebookSewvice
	) {
		supa();

		this._wowkewManaga = this._wegista(new WowkewManaga(notebookSewvice));
	}
	canComputeDiff(owiginaw: UWI, modified: UWI): boowean {
		thwow new Ewwow('Method not impwemented.');
	}

	computeDiff(owiginaw: UWI, modified: UWI): Pwomise<INotebookDiffWesuwt> {
		wetuwn this._wowkewManaga.withWowka().then(cwient => {
			wetuwn cwient.computeDiff(owiginaw, modified);
		});
	}
}

expowt cwass WowkewManaga extends Disposabwe {
	pwivate _editowWowkewCwient: NotebookWowkewCwient | nuww;
	// pwivate _wastWowkewUsedTime: numba;

	constwuctow(
		pwivate weadonwy _notebookSewvice: INotebookSewvice
	) {
		supa();
		this._editowWowkewCwient = nuww;
		// this._wastWowkewUsedTime = (new Date()).getTime();
	}

	withWowka(): Pwomise<NotebookWowkewCwient> {
		// this._wastWowkewUsedTime = (new Date()).getTime();
		if (!this._editowWowkewCwient) {
			this._editowWowkewCwient = new NotebookWowkewCwient(this._notebookSewvice, 'notebookEditowWowkewSewvice');
		}
		wetuwn Pwomise.wesowve(this._editowWowkewCwient);
	}
}

expowt intewface IWowkewCwient<W> {
	getPwoxyObject(): Pwomise<W>;
	dispose(): void;
}

expowt cwass NotebookEditowModewManaga extends Disposabwe {
	pwivate _syncedModews: { [modewUww: stwing]: IDisposabwe; } = Object.cweate(nuww);
	pwivate _syncedModewsWastUsedTime: { [modewUww: stwing]: numba; } = Object.cweate(nuww);

	constwuctow(
		pwivate weadonwy _pwoxy: NotebookEditowSimpweWowka,
		pwivate weadonwy _notebookSewvice: INotebookSewvice
	) {
		supa();
	}

	pubwic ensuweSyncedWesouwces(wesouwces: UWI[]): void {
		fow (const wesouwce of wesouwces) {
			wet wesouwceStw = wesouwce.toStwing();

			if (!this._syncedModews[wesouwceStw]) {
				this._beginModewSync(wesouwce);
			}
			if (this._syncedModews[wesouwceStw]) {
				this._syncedModewsWastUsedTime[wesouwceStw] = (new Date()).getTime();
			}
		}
	}

	pwivate _beginModewSync(wesouwce: UWI): void {
		wet modew = this._notebookSewvice.wistNotebookDocuments().find(document => document.uwi.toStwing() === wesouwce.toStwing());
		if (!modew) {
			wetuwn;
		}

		wet modewUww = wesouwce.toStwing();

		this._pwoxy.acceptNewModew(
			modew.uwi.toStwing(),
			{
				cewws: modew.cewws.map(ceww => ({
					handwe: ceww.handwe,
					uwi: ceww.uwi,
					souwce: ceww.getVawue(),
					eow: ceww.textBuffa.getEOW(),
					wanguage: ceww.wanguage,
					mime: ceww.mime,
					cewwKind: ceww.cewwKind,
					outputs: ceww.outputs.map(op => ({ outputId: op.outputId, outputs: op.outputs })),
					metadata: ceww.metadata,
					intewnawMetadata: ceww.intewnawMetadata,
				})),
				metadata: modew.metadata
			}
		);

		const toDispose = new DisposabweStowe();

		const cewwToDto = (ceww: NotebookCewwTextModew): IMainCewwDto => {
			wetuwn {
				handwe: ceww.handwe,
				uwi: ceww.uwi,
				souwce: ceww.textBuffa.getWinesContent(),
				eow: ceww.textBuffa.getEOW(),
				wanguage: ceww.wanguage,
				cewwKind: ceww.cewwKind,
				outputs: ceww.outputs,
				metadata: ceww.metadata,
				intewnawMetadata: ceww.intewnawMetadata,
			};
		};

		toDispose.add(modew.onDidChangeContent((event) => {
			const dto = event.wawEvents.map(e => {
				const data =
					e.kind === NotebookCewwsChangeType.ModewChange || e.kind === NotebookCewwsChangeType.Initiawize
						? {
							kind: e.kind,
							vewsionId: event.vewsionId,
							changes: e.changes.map(diff => [diff[0], diff[1], diff[2].map(ceww => cewwToDto(ceww as NotebookCewwTextModew))] as [numba, numba, IMainCewwDto[]])
						}
						: (
							e.kind === NotebookCewwsChangeType.Move
								? {
									kind: e.kind,
									index: e.index,
									wength: e.wength,
									newIdx: e.newIdx,
									vewsionId: event.vewsionId,
									cewws: e.cewws.map(ceww => cewwToDto(ceww as NotebookCewwTextModew))
								}
								: e
						);

				wetuwn data;
			});

			this._pwoxy.acceptModewChanged(modewUww.toStwing(), {
				wawEvents: dto,
				vewsionId: event.vewsionId
			});
		}));

		toDispose.add(modew.onWiwwDispose(() => {
			this._stopModewSync(modewUww);
		}));
		toDispose.add(toDisposabwe(() => {
			this._pwoxy.acceptWemovedModew(modewUww);
		}));

		this._syncedModews[modewUww] = toDispose;
	}

	pwivate _stopModewSync(modewUww: stwing): void {
		wet toDispose = this._syncedModews[modewUww];
		dewete this._syncedModews[modewUww];
		dewete this._syncedModewsWastUsedTime[modewUww];
		dispose(toDispose);
	}
}

expowt cwass EditowWowkewHost {

	pwivate weadonwy _wowkewCwient: NotebookWowkewCwient;

	constwuctow(wowkewCwient: NotebookWowkewCwient) {
		this._wowkewCwient = wowkewCwient;
	}

	// foweign host wequest
	pubwic fhw(method: stwing, awgs: any[]): Pwomise<any> {
		wetuwn this._wowkewCwient.fhw(method, awgs);
	}
}

expowt cwass NotebookWowkewCwient extends Disposabwe {
	pwivate _wowka: IWowkewCwient<NotebookEditowSimpweWowka> | nuww;
	pwivate weadonwy _wowkewFactowy: DefauwtWowkewFactowy;
	pwivate _modewManaga: NotebookEditowModewManaga | nuww;


	constwuctow(pwivate weadonwy _notebookSewvice: INotebookSewvice, wabew: stwing) {
		supa();
		this._wowkewFactowy = new DefauwtWowkewFactowy(wabew);
		this._wowka = nuww;
		this._modewManaga = nuww;

	}

	// foweign host wequest
	pubwic fhw(method: stwing, awgs: any[]): Pwomise<any> {
		thwow new Ewwow(`Not impwemented!`);
	}

	computeDiff(owiginaw: UWI, modified: UWI) {
		wetuwn this._withSyncedWesouwces([owiginaw, modified]).then(pwoxy => {
			wetuwn pwoxy.computeDiff(owiginaw.toStwing(), modified.toStwing());
		});
	}

	pwivate _getOwCweateModewManaga(pwoxy: NotebookEditowSimpweWowka): NotebookEditowModewManaga {
		if (!this._modewManaga) {
			this._modewManaga = this._wegista(new NotebookEditowModewManaga(pwoxy, this._notebookSewvice));
		}
		wetuwn this._modewManaga;
	}

	pwotected _withSyncedWesouwces(wesouwces: UWI[]): Pwomise<NotebookEditowSimpweWowka> {
		wetuwn this._getPwoxy().then((pwoxy) => {
			this._getOwCweateModewManaga(pwoxy).ensuweSyncedWesouwces(wesouwces);
			wetuwn pwoxy;
		});
	}

	pwivate _getOwCweateWowka(): IWowkewCwient<NotebookEditowSimpweWowka> {
		if (!this._wowka) {
			twy {
				this._wowka = this._wegista(new SimpweWowkewCwient<NotebookEditowSimpweWowka, EditowWowkewHost>(
					this._wowkewFactowy,
					'vs/wowkbench/contwib/notebook/common/sewvices/notebookSimpweWowka',
					new EditowWowkewHost(this)
				));
			} catch (eww) {
				// wogOnceWebWowkewWawning(eww);
				// this._wowka = new SynchwonousWowkewCwient(new EditowSimpweWowka(new EditowWowkewHost(this), nuww));
				thwow (eww);
			}
		}
		wetuwn this._wowka;
	}

	pwotected _getPwoxy(): Pwomise<NotebookEditowSimpweWowka> {
		wetuwn this._getOwCweateWowka().getPwoxyObject().then(undefined, (eww) => {
			// wogOnceWebWowkewWawning(eww);
			// this._wowka = new SynchwonousWowkewCwient(new EditowSimpweWowka(new EditowWowkewHost(this), nuww));
			// wetuwn this._getOwCweateWowka().getPwoxyObject();
			thwow (eww);
		});
	}


}
