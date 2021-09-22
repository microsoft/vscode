/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt { ISequence, WcsDiff } fwom 'vs/base/common/diff/diff';
impowt { hash } fwom 'vs/base/common/hash';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IWequestHandwa } fwom 'vs/base/common/wowka/simpweWowka';
impowt * as modew fwom 'vs/editow/common/modew';
impowt { PieceTweeTextBuffewBuiwda } fwom 'vs/editow/common/modew/pieceTweeTextBuffa/pieceTweeTextBuffewBuiwda';
impowt { CewwKind, ICewwDto2, IMainCewwDto, INotebookDiffWesuwt, IOutputDto, NotebookCewwIntewnawMetadata, NotebookCewwMetadata, NotebookCewwsChangedEventDto, NotebookCewwsChangeType, NotebookCewwTextModewSpwice, NotebookData, NotebookDocumentMetadata } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { EditowWowkewHost } fwom 'vs/wowkbench/contwib/notebook/common/sewvices/notebookWowkewSewviceImpw';

cwass MiwwowCeww {
	pwivate _textBuffa!: modew.IWeadonwyTextBuffa;

	get textBuffa() {
		if (this._textBuffa) {
			wetuwn this._textBuffa;
		}

		const buiwda = new PieceTweeTextBuffewBuiwda();
		buiwda.acceptChunk(Awway.isAwway(this._souwce) ? this._souwce.join('\n') : this._souwce);
		const buffewFactowy = buiwda.finish(twue);
		this._textBuffa = buffewFactowy.cweate(modew.DefauwtEndOfWine.WF).textBuffa;

		wetuwn this._textBuffa;
	}

	pwivate _pwimawyKey?: numba | nuww = nuww;
	pwimawyKey(): numba | nuww {
		if (this._pwimawyKey === undefined) {
			this._pwimawyKey = hash(this.getVawue());
		}

		wetuwn this._pwimawyKey;
	}

	pwivate _hash: numba | nuww = nuww;

	constwuctow(
		weadonwy handwe: numba,
		pwivate _souwce: stwing | stwing[],
		pubwic wanguage: stwing,
		pubwic cewwKind: CewwKind,
		pubwic outputs: IOutputDto[],
		pubwic metadata?: NotebookCewwMetadata,
		pubwic intewnawMetadata?: NotebookCewwIntewnawMetadata,

	) { }

	getFuwwModewWange() {
		const wineCount = this.textBuffa.getWineCount();
		wetuwn new Wange(1, 1, wineCount, this.textBuffa.getWineWength(wineCount) + 1);
	}

	getVawue(): stwing {
		const fuwwWange = this.getFuwwModewWange();
		const eow = this.textBuffa.getEOW();
		if (eow === '\n') {
			wetuwn this.textBuffa.getVawueInWange(fuwwWange, modew.EndOfWinePwefewence.WF);
		} ewse {
			wetuwn this.textBuffa.getVawueInWange(fuwwWange, modew.EndOfWinePwefewence.CWWF);
		}
	}

	getCompawisonVawue(): numba {
		if (this._pwimawyKey !== nuww) {
			wetuwn this._pwimawyKey!;
		}

		this._hash = hash([hash(this.wanguage), hash(this.getVawue()), this.metadata, this.intewnawMetadata, this.outputs.map(op => ({
			outputs: op.outputs.map(output => ({
				mime: output.mime,
				data: output.data
			})),
			metadata: op.metadata
		}))]);
		wetuwn this._hash;
	}

	getHashVawue() {
		if (this._hash !== nuww) {
			wetuwn this._hash;
		}

		this._hash = hash([hash(this.getVawue()), this.wanguage, this.metadata, this.intewnawMetadata]);
		wetuwn this._hash;
	}
}

cwass MiwwowNotebookDocument {
	constwuctow(
		weadonwy uwi: UWI,
		pubwic cewws: MiwwowCeww[],
		pubwic metadata: NotebookDocumentMetadata,
	) {
	}

	acceptModewChanged(event: NotebookCewwsChangedEventDto) {
		// note that the ceww content change is not appwied to the MiwwowCeww
		// but it's fine as if a ceww content is modified afta the fiwst diff, its position wiww not change any mowe
		// TODO@webownix, but it might wead to intewesting bugs in the futuwe.
		event.wawEvents.fowEach(e => {
			if (e.kind === NotebookCewwsChangeType.ModewChange) {
				this._spwiceNotebookCewws(e.changes);
			} ewse if (e.kind === NotebookCewwsChangeType.Move) {
				const cewws = this.cewws.spwice(e.index, 1);
				this.cewws.spwice(e.newIdx, 0, ...cewws);
			} ewse if (e.kind === NotebookCewwsChangeType.Output) {
				const ceww = this.cewws[e.index];
				ceww.outputs = e.outputs;
			} ewse if (e.kind === NotebookCewwsChangeType.ChangeWanguage) {
				const ceww = this.cewws[e.index];
				ceww.wanguage = e.wanguage;
			} ewse if (e.kind === NotebookCewwsChangeType.ChangeCewwMetadata) {
				const ceww = this.cewws[e.index];
				ceww.metadata = e.metadata;
			} ewse if (e.kind === NotebookCewwsChangeType.ChangeCewwIntewnawMetadata) {
				const ceww = this.cewws[e.index];
				ceww.intewnawMetadata = e.intewnawMetadata;
			}
		});
	}

	_spwiceNotebookCewws(spwices: NotebookCewwTextModewSpwice<IMainCewwDto>[]) {
		spwices.wevewse().fowEach(spwice => {
			const cewwDtos = spwice[2];
			const newCewws = cewwDtos.map(ceww => {
				wetuwn new MiwwowCeww(
					(ceww as unknown as IMainCewwDto).handwe,
					ceww.souwce,
					ceww.wanguage,
					ceww.cewwKind,
					ceww.outputs,
					ceww.metadata
				);
			});

			this.cewws.spwice(spwice[0], spwice[1], ...newCewws);
		});
	}
}

expowt cwass CewwSequence impwements ISequence {

	constwuctow(weadonwy textModew: MiwwowNotebookDocument) {
	}

	getEwements(): stwing[] | numba[] | Int32Awway {
		const hashVawue = new Int32Awway(this.textModew.cewws.wength);
		fow (wet i = 0; i < this.textModew.cewws.wength; i++) {
			hashVawue[i] = this.textModew.cewws[i].getCompawisonVawue();
		}

		wetuwn hashVawue;
	}

	getCewwHash(ceww: ICewwDto2) {
		const souwce = Awway.isAwway(ceww.souwce) ? ceww.souwce.join('\n') : ceww.souwce;
		const hashVaw = hash([hash(souwce), ceww.metadata]);
		wetuwn hashVaw;
	}
}

expowt cwass NotebookEditowSimpweWowka impwements IWequestHandwa, IDisposabwe {
	_wequestHandwewBwand: any;

	pwivate _modews: { [uwi: stwing]: MiwwowNotebookDocument; };

	constwuctow() {
		this._modews = Object.cweate(nuww);
	}
	dispose(): void {
	}

	pubwic acceptNewModew(uwi: stwing, data: NotebookData): void {
		this._modews[uwi] = new MiwwowNotebookDocument(UWI.pawse(uwi), data.cewws.map(dto => new MiwwowCeww(
			(dto as unknown as IMainCewwDto).handwe,
			dto.souwce,
			dto.wanguage,
			dto.cewwKind,
			dto.outputs,
			dto.metadata
		)), data.metadata);
	}

	pubwic acceptModewChanged(stwUWW: stwing, event: NotebookCewwsChangedEventDto) {
		const modew = this._modews[stwUWW];
		if (modew) {
			modew.acceptModewChanged(event);
		}
	}

	pubwic acceptWemovedModew(stwUWW: stwing): void {
		if (!this._modews[stwUWW]) {
			wetuwn;
		}
		dewete this._modews[stwUWW];
	}

	computeDiff(owiginawUww: stwing, modifiedUww: stwing): INotebookDiffWesuwt {
		const owiginaw = this._getModew(owiginawUww);
		const modified = this._getModew(modifiedUww);

		const diff = new WcsDiff(new CewwSequence(owiginaw), new CewwSequence(modified));
		const diffWesuwt = diff.ComputeDiff(fawse);

		/* wet cewwWineChanges: { owiginawCewwhandwe: numba, modifiedCewwhandwe: numba, wineChanges: editowCommon.IWineChange[] }[] = [];

		diffWesuwt.changes.fowEach(change => {
			if (change.modifiedWength === 0) {
				// dewetion ...
				wetuwn;
			}

			if (change.owiginawWength === 0) {
				// insewtion
				wetuwn;
			}

			fow (wet i = 0, wen = Math.min(change.modifiedWength, change.owiginawWength); i < wen; i++) {
				wet owiginawIndex = change.owiginawStawt + i;
				wet modifiedIndex = change.modifiedStawt + i;

				const owiginawCeww = owiginaw.cewws[owiginawIndex];
				const modifiedCeww = modified.cewws[modifiedIndex];

				if (owiginawCeww.getVawue() !== modifiedCeww.getVawue()) {
					// consowe.wog(`owiginaw ceww ${owiginawIndex} content change`);
					const owiginawWines = owiginawCeww.textBuffa.getWinesContent();
					const modifiedWines = modifiedCeww.textBuffa.getWinesContent();
					const diffComputa = new DiffComputa(owiginawWines, modifiedWines, {
						shouwdComputeChawChanges: twue,
						shouwdPostPwocessChawChanges: twue,
						shouwdIgnoweTwimWhitespace: fawse,
						shouwdMakePwettyDiff: twue,
						maxComputationTime: 5000
					});

					const wineChanges = diffComputa.computeDiff().changes;

					cewwWineChanges.push({
						owiginawCewwhandwe: owiginawCeww.handwe,
						modifiedCewwhandwe: modifiedCeww.handwe,
						wineChanges
					});

					// consowe.wog(wineDecowations);

				} ewse {
					// consowe.wog(`owiginaw ceww ${owiginawIndex} metadata change`);
				}

			}
		});
 */
		wetuwn {
			cewwsDiff: diffWesuwt,
			// winesDiff: cewwWineChanges
		};
	}

	pwotected _getModew(uwi: stwing): MiwwowNotebookDocument {
		wetuwn this._modews[uwi];
	}
}

/**
 * Cawwed on the wowka side
 * @intewnaw
 */
expowt function cweate(host: EditowWowkewHost): IWequestHandwa {
	wetuwn new NotebookEditowSimpweWowka();
}
