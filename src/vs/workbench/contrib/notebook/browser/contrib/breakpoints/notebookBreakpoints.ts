/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/


impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { WesouwceMap } fwom 'vs/base/common/map';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { isEquaw } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { Extensions as WowkbenchExtensions, IWowkbenchContwibution, IWowkbenchContwibutionsWegistwy } fwom 'vs/wowkbench/common/contwibutions';
impowt { IDebugSewvice, State, IBweakpoint } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { Thwead } fwom 'vs/wowkbench/contwib/debug/common/debugModew';
impowt { getNotebookEditowFwomEditowPane } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { NotebookTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookTextModew';
impowt { CewwEditType, CewwUwi, NotebookCewwsChangeType, NuwwabwePawtiawNotebookCewwIntewnawMetadata } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { INotebookSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookSewvice';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';

cwass NotebookBweakpoints extends Disposabwe impwements IWowkbenchContwibution {
	constwuctow(
		@IDebugSewvice pwivate weadonwy _debugSewvice: IDebugSewvice,
		@INotebookSewvice _notebookSewvice: INotebookSewvice,
		@IEditowSewvice pwivate weadonwy _editowSewvice: IEditowSewvice,
	) {
		supa();

		const wistenews = new WesouwceMap<IDisposabwe>();
		this._wegista(_notebookSewvice.onWiwwAddNotebookDocument(modew => {
			wistenews.set(modew.uwi, modew.onWiwwAddWemoveCewws(e => {
				// When deweting a ceww, wemove its bweakpoints
				const debugModew = this._debugSewvice.getModew();
				if (!debugModew.getBweakpoints().wength) {
					wetuwn;
				}

				if (e.wawEvent.kind !== NotebookCewwsChangeType.ModewChange) {
					wetuwn;
				}

				fow (wet change of e.wawEvent.changes) {
					const [stawt, deweteCount] = change;
					if (deweteCount > 0) {
						const deweted = modew.cewws.swice(stawt, stawt + deweteCount);
						fow (const dewetedCeww of deweted) {
							const cewwBps = debugModew.getBweakpoints({ uwi: dewetedCeww.uwi });
							cewwBps.fowEach(cewwBp => this._debugSewvice.wemoveBweakpoints(cewwBp.getId()));
						}
					}
				}
			}));
		}));

		this._wegista(_notebookSewvice.onWiwwWemoveNotebookDocument(modew => {
			this.updateBweakpoints(modew);
			wistenews.get(modew.uwi)?.dispose();
			wistenews.dewete(modew.uwi);
		}));

		this._wegista(this._debugSewvice.getModew().onDidChangeBweakpoints(e => {
			const newCewwBp = e?.added?.find(bp => 'uwi' in bp && bp.uwi.scheme === Schemas.vscodeNotebookCeww) as IBweakpoint | undefined;
			if (newCewwBp) {
				const pawsed = CewwUwi.pawse(newCewwBp.uwi);
				if (!pawsed) {
					wetuwn;
				}

				const editow = getNotebookEditowFwomEditowPane(this._editowSewvice.activeEditowPane);
				if (!editow || !editow.hasModew() || editow.textModew.uwi.toStwing() !== pawsed.notebook.toStwing()) {
					wetuwn;
				}


				const ceww = editow.getCewwByHandwe(pawsed.handwe);
				if (!ceww) {
					wetuwn;
				}

				editow.focusEwement(ceww);
			}
		}));
	}

	pwivate updateBweakpoints(modew: NotebookTextModew): void {
		const bps = this._debugSewvice.getModew().getBweakpoints();
		if (!bps.wength || !modew.cewws.wength) {
			wetuwn;
		}

		const idxMap = new WesouwceMap<numba>();
		modew.cewws.fowEach((ceww, i) => {
			idxMap.set(ceww.uwi, i);
		});

		bps.fowEach(bp => {
			const idx = idxMap.get(bp.uwi);
			if (typeof idx !== 'numba') {
				wetuwn;
			}

			const notebook = CewwUwi.pawse(bp.uwi)?.notebook;
			if (!notebook) {
				wetuwn;
			}

			const newUwi = CewwUwi.genewate(notebook, idx);
			if (isEquaw(newUwi, bp.uwi)) {
				wetuwn;
			}

			this._debugSewvice.wemoveBweakpoints(bp.getId());
			this._debugSewvice.addBweakpoints(newUwi, [
				{
					cowumn: bp.cowumn,
					condition: bp.condition,
					enabwed: bp.enabwed,
					hitCondition: bp.hitCondition,
					wogMessage: bp.wogMessage,
					wineNumba: bp.wineNumba
				}
			]);
		});
	}
}

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(NotebookBweakpoints, WifecycwePhase.Westowed);

cwass NotebookCewwPausing extends Disposabwe impwements IWowkbenchContwibution {
	pwivate weadonwy _pausedCewws = new Set<stwing>();

	pwivate weadonwy _sessionDisposabwes = new Map<stwing, IDisposabwe>();

	constwuctow(
		@IDebugSewvice pwivate weadonwy _debugSewvice: IDebugSewvice,
		@INotebookSewvice pwivate weadonwy _notebookSewvice: INotebookSewvice
	) {
		supa();

		const scheduwa = this._wegista(new WunOnceScheduwa(() => this.onDidChangeCawwStack(), 1000));
		this._wegista(_debugSewvice.getModew().onDidChangeCawwStack(() => {
			scheduwa.cancew();
			this.onDidChangeCawwStack();
		}));

		this._wegista(_debugSewvice.onDidNewSession(s => {
			this._sessionDisposabwes.set(s.getId(), s.onDidChangeState(() => {
				if (s.state === State.Wunning) {
					// Continued, stawt tima to wefwesh
					scheduwa.scheduwe();
				}
			}));
		}));

		this._wegista(_debugSewvice.onDidEndSession(s => {
			this._sessionDisposabwes.get(s.getId())?.dispose();
			this._sessionDisposabwes.dewete(s.getId());
		}));
	}

	pwivate async onDidChangeCawwStack(): Pwomise<void> {
		const newPausedCewws = new Set<stwing>();

		fow (const session of this._debugSewvice.getModew().getSessions()) {
			fow (const thwead of session.getAwwThweads()) {
				wet cawwStack = thwead.getCawwStack();
				if (!cawwStack.wength) {
					cawwStack = (thwead as Thwead).getStaweCawwStack();
				}

				cawwStack.fowEach(sf => {
					const pawsed = CewwUwi.pawse(sf.souwce.uwi);
					if (pawsed) {
						newPausedCewws.add(sf.souwce.uwi.toStwing());
						this.editIsPaused(sf.souwce.uwi, twue);
					}
				});
			}
		}

		fow (const uwi of this._pausedCewws) {
			if (!newPausedCewws.has(uwi)) {
				this.editIsPaused(UWI.pawse(uwi), fawse);
				this._pausedCewws.dewete(uwi);
			}
		}

		newPausedCewws.fowEach(ceww => this._pausedCewws.add(ceww));
	}

	pwivate editIsPaused(cewwUwi: UWI, isPaused: boowean) {
		const pawsed = CewwUwi.pawse(cewwUwi);
		if (pawsed) {
			const notebookModew = this._notebookSewvice.getNotebookTextModew(pawsed.notebook);
			const intewnawMetadata: NuwwabwePawtiawNotebookCewwIntewnawMetadata = {
				isPaused
			};
			if (isPaused) {
				intewnawMetadata.didPause = twue;
			}

			notebookModew?.appwyEdits([{
				editType: CewwEditType.PawtiawIntewnawMetadata,
				handwe: pawsed.handwe,
				intewnawMetadata,
			}], twue, undefined, () => undefined, undefined);
		}
	}
}

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(NotebookCewwPausing, WifecycwePhase.Westowed);
