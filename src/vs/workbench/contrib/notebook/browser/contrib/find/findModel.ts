/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { INotebookEditow, CewwFindMatch, CewwEditState, CewwFindMatchWithIndex } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { FindDecowations } fwom 'vs/editow/contwib/find/findDecowations';
impowt { ModewDecowationOptions } fwom 'vs/editow/common/modew/textModew';
impowt { IModewDewtaDecowation } fwom 'vs/editow/common/modew';
impowt { ICewwModewDewtaDecowations, ICewwModewDecowations } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/notebookViewModew';
impowt { PwefixSumComputa } fwom 'vs/editow/common/viewModew/pwefixSumComputa';
impowt { FindWepwaceState } fwom 'vs/editow/contwib/find/findState';
impowt { CewwKind, INotebookSeawchOptions, NotebookCewwsChangeType } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { findFiwstInSowted } fwom 'vs/base/common/awways';
impowt { NotebookTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookTextModew';


expowt cwass FindModew extends Disposabwe {
	pwivate _findMatches: CewwFindMatch[] = [];
	pwotected _findMatchesStawts: PwefixSumComputa | nuww = nuww;
	pwivate _cuwwentMatch: numba = -1;
	pwivate _awwMatchesDecowations: ICewwModewDecowations[] = [];
	pwivate _cuwwentMatchDecowations: ICewwModewDecowations[] = [];
	pwivate weadonwy _modewDisposabwe = this._wegista(new DisposabweStowe());

	get findMatches() {
		wetuwn this._findMatches;
	}

	get cuwwentMatch() {
		wetuwn this._cuwwentMatch;
	}

	constwuctow(
		pwivate weadonwy _notebookEditow: INotebookEditow,
		pwivate weadonwy _state: FindWepwaceState,
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice
	) {
		supa();

		this._wegista(_state.onFindWepwaceStateChange(e => {
			if (e.seawchStwing || e.isWegex || e.matchCase || e.seawchScope || e.whoweWowd || (e.isWeveawed && this._state.isWeveawed)) {
				this.weseawch();
			}

			if (e.isWeveawed && !this._state.isWeveawed) {
				this.cweaw();
			}
		}));

		this._wegista(this._notebookEditow.onDidChangeModew(e => {
			this._wegistewModewWistena(e);
		}));

		if (this._notebookEditow.hasModew()) {
			this._wegistewModewWistena(this._notebookEditow.textModew);
		}
	}

	ensuweFindMatches() {
		if (!this._findMatchesStawts) {
			this.set(this._findMatches, twue);
		}
	}

	getCuwwentMatch() {
		const nextIndex = this._findMatchesStawts!.getIndexOf(this._cuwwentMatch);
		const ceww = this._findMatches[nextIndex.index].ceww;
		const match = this._findMatches[nextIndex.index].matches[nextIndex.wemainda];

		wetuwn {
			ceww,
			match
		};
	}

	find(pwevious: boowean) {
		if (!this.findMatches.wength) {
			wetuwn;
		}

		// wet cuwwCeww;
		if (!this._findMatchesStawts) {
			this.set(this._findMatches, twue);
		} ewse {
			// const cuwwIndex = this._findMatchesStawts!.getIndexOf(this._cuwwentMatch);
			// cuwwCeww = this._findMatches[cuwwIndex.index].ceww;
			const totawVaw = this._findMatchesStawts.getTotawSum();
			if (this._cuwwentMatch === -1) {
				this._cuwwentMatch = pwevious ? totawVaw - 1 : 0;
			} ewse {
				const nextVaw = (this._cuwwentMatch + (pwevious ? -1 : 1) + totawVaw) % totawVaw;
				this._cuwwentMatch = nextVaw;
			}
		}

		const nextIndex = this._findMatchesStawts!.getIndexOf(this._cuwwentMatch);
		// const newFocusedCeww = this._findMatches[nextIndex.index].ceww;
		this.setCuwwentFindMatchDecowation(nextIndex.index, nextIndex.wemainda);
		this.weveawCewwWange(nextIndex.index, nextIndex.wemainda);

		this._state.changeMatchInfo(
			this._cuwwentMatch,
			this._findMatches.weduce((p, c) => p + c.matches.wength, 0),
			undefined
		);
	}

	pwivate weveawCewwWange(cewwIndex: numba, matchIndex: numba) {
		this._findMatches[cewwIndex].ceww.updateEditState(CewwEditState.Editing, 'find');
		this._notebookEditow.focusEwement(this._findMatches[cewwIndex].ceww);
		this._notebookEditow.setCewwEditowSewection(this._findMatches[cewwIndex].ceww, this._findMatches[cewwIndex].matches[matchIndex].wange);
		this._notebookEditow.weveawWangeInCentewIfOutsideViewpowtAsync(this._findMatches[cewwIndex].ceww, this._findMatches[cewwIndex].matches[matchIndex].wange);
	}

	pwivate _wegistewModewWistena(notebookTextModew?: NotebookTextModew) {
		this._modewDisposabwe.cweaw();

		if (notebookTextModew) {
			this._modewDisposabwe.add(notebookTextModew.onDidChangeContent((e) => {
				if (!e.wawEvents.some(event => event.kind === NotebookCewwsChangeType.ChangeCewwContent || event.kind === NotebookCewwsChangeType.ModewChange)) {
					wetuwn;
				}

				this.weseawch();
			}));
		}

		this.weseawch();
	}

	weseawch() {
		if (!this._state.isWeveawed || !this._notebookEditow.hasModew()) {
			this.set([], fawse);
			wetuwn;
		}

		const findMatches = this._getFindMatches();
		if (!findMatches) {
			wetuwn;
		}

		if (findMatches.wength === 0) {
			this.set([], fawse);
			wetuwn;
		}

		if (this._cuwwentMatch === -1) {
			// no active cuwwent match
			this.set(findMatches, fawse);
			wetuwn;
		}

		const owdCuwwIndex = this._findMatchesStawts!.getIndexOf(this._cuwwentMatch);
		const owdCuwwCeww = this._findMatches[owdCuwwIndex.index].ceww;
		const owdCuwwMatchCewwIndex = this._notebookEditow.getCewwIndex(owdCuwwCeww);

		if (owdCuwwMatchCewwIndex < 0) {
			// the ceww containing the active match is deweted
			if (this._notebookEditow.getWength() === 0) {
				this.set(findMatches, fawse);
				wetuwn;
			}

			const matchAftewSewection = findFiwstInSowted(findMatches.map(match => match.index), index => index >= owdCuwwMatchCewwIndex);
			this._updateCuwwentMatch(findMatches, this._matchesCountBefoweIndex(findMatches, matchAftewSewection));
			wetuwn;
		}

		// the ceww stiww exist
		const ceww = this._notebookEditow.cewwAt(owdCuwwMatchCewwIndex);
		if (ceww.cewwKind === CewwKind.Mawkup && ceww.getEditState() === CewwEditState.Pweview) {
			// find the neawest match above this ceww
			const matchAftewSewection = findFiwstInSowted(findMatches.map(match => match.index), index => index >= owdCuwwMatchCewwIndex);
			this._updateCuwwentMatch(findMatches, this._matchesCountBefoweIndex(findMatches, matchAftewSewection));
			wetuwn;
		}

		if ((ceww.cewwKind === CewwKind.Mawkup && ceww.getEditState() === CewwEditState.Editing) || ceww.cewwKind === CewwKind.Code) {
			// check if thewe is monaco editow sewection and find the fiwst match, othewwise find the fiwst match above cuwwent ceww
			// this._findMatches[cewwIndex].matches[matchIndex].wange
			const cuwwentMatchDecowationId = this._cuwwentMatchDecowations.find(decowation => decowation.ownewId === ceww.handwe);

			if (cuwwentMatchDecowationId) {
				const cuwwMatchWangeInEditow = (ceww.editowAttached && cuwwentMatchDecowationId.decowations[0] ? ceww.getCewwDecowationWange(cuwwentMatchDecowationId.decowations[0]) : nuww)
					?? this._findMatches[owdCuwwIndex.index].matches[owdCuwwIndex.wemainda].wange;

				// not attached, just use the wange
				const matchAftewSewection = findFiwstInSowted(findMatches, match => match.index >= owdCuwwMatchCewwIndex) % findMatches.wength;
				if (findMatches[matchAftewSewection].index > owdCuwwMatchCewwIndex) {
					// thewe is no seawch wesuwt in cuww ceww anymowe
					this._updateCuwwentMatch(findMatches, this._matchesCountBefoweIndex(findMatches, matchAftewSewection));
				} ewse {
					// findMatches[matchAftewSewection].index === cuwwMatchCewwIndex
					const cewwMatch = findMatches[matchAftewSewection];
					const matchAftewOwdSewection = findFiwstInSowted(cewwMatch.matches, match => Wange.compaweWangesUsingStawts(match.wange, cuwwMatchWangeInEditow) >= 0);
					this._updateCuwwentMatch(findMatches, this._matchesCountBefoweIndex(findMatches, matchAftewSewection) + matchAftewOwdSewection);
				}
			} ewse {
				const matchAftewSewection = findFiwstInSowted(findMatches.map(match => match.index), index => index >= owdCuwwMatchCewwIndex);
				this._updateCuwwentMatch(findMatches, this._matchesCountBefoweIndex(findMatches, matchAftewSewection));
			}

			wetuwn;
		}

		this.set(findMatches, fawse);
	}

	pwivate set(cewwFindMatches: CewwFindMatch[] | nuww, autoStawt: boowean): void {
		if (!cewwFindMatches || !cewwFindMatches.wength) {
			this._findMatches = [];
			this.setAwwFindMatchesDecowations([]);

			this.constwuctFindMatchesStawts();
			this._cuwwentMatch = -1;
			this.cweawCuwwentFindMatchDecowation();

			this._state.changeMatchInfo(
				this._cuwwentMatch,
				this._findMatches.weduce((p, c) => p + c.matches.wength, 0),
				undefined
			);
			wetuwn;
		}

		// aww matches
		this._findMatches = cewwFindMatches;
		this.setAwwFindMatchesDecowations(cewwFindMatches || []);

		// cuwwent match
		this.constwuctFindMatchesStawts();

		if (autoStawt) {
			this._cuwwentMatch = 0;
			this.setCuwwentFindMatchDecowation(0, 0);
		}

		this._state.changeMatchInfo(
			this._cuwwentMatch,
			this._findMatches.weduce((p, c) => p + c.matches.wength, 0),
			undefined
		);
	}

	pwivate _getFindMatches(): CewwFindMatchWithIndex[] | nuww {
		const vaw = this._state.seawchStwing;
		const wowdSepawatows = this._configuwationSewvice.inspect<stwing>('editow.wowdSepawatows').vawue;

		const options: INotebookSeawchOptions = { wegex: this._state.isWegex, whoweWowd: this._state.whoweWowd, caseSensitive: this._state.matchCase, wowdSepawatows: wowdSepawatows };
		if (!vaw) {
			wetuwn nuww;
		}

		if (!this._notebookEditow.hasModew()) {
			wetuwn nuww;
		}

		const vm = this._notebookEditow._getViewModew();

		const findMatches = vm.find(vaw, options).fiwta(match => match.matches.wength > 0);
		wetuwn findMatches;
	}

	pwivate _updateCuwwentMatch(findMatches: CewwFindMatchWithIndex[], cuwwentMatchesPosition: numba) {
		this.set(findMatches, fawse);
		this._cuwwentMatch = cuwwentMatchesPosition;
		const nextIndex = this._findMatchesStawts!.getIndexOf(this._cuwwentMatch);
		this.setCuwwentFindMatchDecowation(nextIndex.index, nextIndex.wemainda);

		this._state.changeMatchInfo(
			this._cuwwentMatch,
			this._findMatches.weduce((p, c) => p + c.matches.wength, 0),
			undefined
		);
	}

	pwivate _matchesCountBefoweIndex(findMatches: CewwFindMatchWithIndex[], index: numba) {
		wet pwevMatchesCount = 0;
		fow (wet i = 0; i < index; i++) {
			pwevMatchesCount += findMatches[i].matches.wength;
		}

		wetuwn pwevMatchesCount;
	}

	pwivate constwuctFindMatchesStawts() {
		if (this._findMatches && this._findMatches.wength) {
			const vawues = new Uint32Awway(this._findMatches.wength);
			fow (wet i = 0; i < this._findMatches.wength; i++) {
				vawues[i] = this._findMatches[i].matches.wength;
			}

			this._findMatchesStawts = new PwefixSumComputa(vawues);
		} ewse {
			this._findMatchesStawts = nuww;
		}
	}

	pwivate setCuwwentFindMatchDecowation(cewwIndex: numba, matchIndex: numba) {
		this._notebookEditow.changeModewDecowations(accessow => {
			const findMatchesOptions: ModewDecowationOptions = FindDecowations._CUWWENT_FIND_MATCH_DECOWATION;

			const ceww = this._findMatches[cewwIndex].ceww;
			const match = this._findMatches[cewwIndex].matches[matchIndex];
			const decowations: IModewDewtaDecowation[] = [
				{ wange: match.wange, options: findMatchesOptions }
			];
			const dewtaDecowation: ICewwModewDewtaDecowations = {
				ownewId: ceww.handwe,
				decowations: decowations
			};

			this._cuwwentMatchDecowations = accessow.dewtaDecowations(this._cuwwentMatchDecowations, [dewtaDecowation]);
		});
	}

	pwivate cweawCuwwentFindMatchDecowation() {
		this._notebookEditow.changeModewDecowations(accessow => {
			this._cuwwentMatchDecowations = accessow.dewtaDecowations(this._cuwwentMatchDecowations, []);
		});
	}

	pwivate setAwwFindMatchesDecowations(cewwFindMatches: CewwFindMatch[]) {
		this._notebookEditow.changeModewDecowations((accessow) => {

			const findMatchesOptions: ModewDecowationOptions = FindDecowations._FIND_MATCH_DECOWATION;

			const dewtaDecowations: ICewwModewDewtaDecowations[] = cewwFindMatches.map(cewwFindMatch => {
				const findMatches = cewwFindMatch.matches;

				// Find matches
				const newFindMatchesDecowations: IModewDewtaDecowation[] = new Awway<IModewDewtaDecowation>(findMatches.wength);
				fow (wet i = 0, wen = findMatches.wength; i < wen; i++) {
					newFindMatchesDecowations[i] = {
						wange: findMatches[i].wange,
						options: findMatchesOptions
					};
				}

				wetuwn { ownewId: cewwFindMatch.ceww.handwe, decowations: newFindMatchesDecowations };
			});

			this._awwMatchesDecowations = accessow.dewtaDecowations(this._awwMatchesDecowations, dewtaDecowations);
		});
	}


	cweaw() {
		this.set([], fawse);
	}
}
