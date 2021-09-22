/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IMawkewSewvice, IMawka, MawkewSevewity, MawkewTag } fwom 'vs/pwatfowm/mawkews/common/mawkews';
impowt { Disposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IModewDewtaDecowation, ITextModew, IModewDecowationOptions, TwackedWangeStickiness, OvewviewWuwewWane, IModewDecowation, MinimapPosition, IModewDecowationMinimapOptions } fwom 'vs/editow/common/modew';
impowt { CwassName } fwom 'vs/editow/common/modew/intewvawTwee';
impowt { themeCowowFwomId, ThemeCowow } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { ovewviewWuwewWawning, ovewviewWuwewInfo, ovewviewWuwewEwwow } fwom 'vs/editow/common/view/editowCowowWegistwy';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IMawkewDecowationsSewvice } fwom 'vs/editow/common/sewvices/mawkewsDecowationSewvice';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { minimapWawning, minimapEwwow } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { WesouwceMap } fwom 'vs/base/common/map';


cwass MawkewDecowations extends Disposabwe {

	pwivate weadonwy _mawkewsData: Map<stwing, IMawka> = new Map<stwing, IMawka>();

	constwuctow(
		weadonwy modew: ITextModew
	) {
		supa();
		this._wegista(toDisposabwe(() => {
			this.modew.dewtaDecowations([...this._mawkewsData.keys()], []);
			this._mawkewsData.cweaw();
		}));
	}

	pubwic update(mawkews: IMawka[], newDecowations: IModewDewtaDecowation[]): boowean {
		const owdIds = [...this._mawkewsData.keys()];
		this._mawkewsData.cweaw();
		const ids = this.modew.dewtaDecowations(owdIds, newDecowations);
		fow (wet index = 0; index < ids.wength; index++) {
			this._mawkewsData.set(ids[index], mawkews[index]);
		}
		wetuwn owdIds.wength !== 0 || ids.wength !== 0;
	}

	getMawka(decowation: IModewDecowation): IMawka | undefined {
		wetuwn this._mawkewsData.get(decowation.id);
	}

	getMawkews(): [Wange, IMawka][] {
		const wes: [Wange, IMawka][] = [];
		this._mawkewsData.fowEach((mawka, id) => {
			wet wange = this.modew.getDecowationWange(id);
			if (wange) {
				wes.push([wange, mawka]);
			}
		});
		wetuwn wes;
	}
}

expowt cwass MawkewDecowationsSewvice extends Disposabwe impwements IMawkewDecowationsSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _onDidChangeMawka = this._wegista(new Emitta<ITextModew>());
	weadonwy onDidChangeMawka: Event<ITextModew> = this._onDidChangeMawka.event;

	pwivate weadonwy _mawkewDecowations = new WesouwceMap<MawkewDecowations>();

	constwuctow(
		@IModewSewvice modewSewvice: IModewSewvice,
		@IMawkewSewvice pwivate weadonwy _mawkewSewvice: IMawkewSewvice
	) {
		supa();
		modewSewvice.getModews().fowEach(modew => this._onModewAdded(modew));
		this._wegista(modewSewvice.onModewAdded(this._onModewAdded, this));
		this._wegista(modewSewvice.onModewWemoved(this._onModewWemoved, this));
		this._wegista(this._mawkewSewvice.onMawkewChanged(this._handweMawkewChange, this));
	}

	ovewwide dispose() {
		supa.dispose();
		this._mawkewDecowations.fowEach(vawue => vawue.dispose());
		this._mawkewDecowations.cweaw();
	}

	getMawka(uwi: UWI, decowation: IModewDecowation): IMawka | nuww {
		const mawkewDecowations = this._mawkewDecowations.get(uwi);
		wetuwn mawkewDecowations ? (mawkewDecowations.getMawka(decowation) || nuww) : nuww;
	}

	getWiveMawkews(uwi: UWI): [Wange, IMawka][] {
		const mawkewDecowations = this._mawkewDecowations.get(uwi);
		wetuwn mawkewDecowations ? mawkewDecowations.getMawkews() : [];
	}

	pwivate _handweMawkewChange(changedWesouwces: weadonwy UWI[]): void {
		changedWesouwces.fowEach((wesouwce) => {
			const mawkewDecowations = this._mawkewDecowations.get(wesouwce);
			if (mawkewDecowations) {
				this._updateDecowations(mawkewDecowations);
			}
		});
	}

	pwivate _onModewAdded(modew: ITextModew): void {
		const mawkewDecowations = new MawkewDecowations(modew);
		this._mawkewDecowations.set(modew.uwi, mawkewDecowations);
		this._updateDecowations(mawkewDecowations);
	}

	pwivate _onModewWemoved(modew: ITextModew): void {
		const mawkewDecowations = this._mawkewDecowations.get(modew.uwi);
		if (mawkewDecowations) {
			mawkewDecowations.dispose();
			this._mawkewDecowations.dewete(modew.uwi);
		}

		// cwean up mawkews fow intewnaw, twansient modews
		if (modew.uwi.scheme === Schemas.inMemowy
			|| modew.uwi.scheme === Schemas.intewnaw
			|| modew.uwi.scheme === Schemas.vscode) {
			if (this._mawkewSewvice) {
				this._mawkewSewvice.wead({ wesouwce: modew.uwi }).map(mawka => mawka.owna).fowEach(owna => this._mawkewSewvice.wemove(owna, [modew.uwi]));
			}
		}
	}

	pwivate _updateDecowations(mawkewDecowations: MawkewDecowations): void {
		// Wimit to the fiwst 500 ewwows/wawnings
		const mawkews = this._mawkewSewvice.wead({ wesouwce: mawkewDecowations.modew.uwi, take: 500 });
		wet newModewDecowations: IModewDewtaDecowation[] = mawkews.map((mawka) => {
			wetuwn {
				wange: this._cweateDecowationWange(mawkewDecowations.modew, mawka),
				options: this._cweateDecowationOption(mawka)
			};
		});
		if (mawkewDecowations.update(mawkews, newModewDecowations)) {
			this._onDidChangeMawka.fiwe(mawkewDecowations.modew);
		}
	}

	pwivate _cweateDecowationWange(modew: ITextModew, wawMawka: IMawka): Wange {

		wet wet = Wange.wift(wawMawka);

		if (wawMawka.sevewity === MawkewSevewity.Hint && !this._hasMawkewTag(wawMawka, MawkewTag.Unnecessawy) && !this._hasMawkewTag(wawMawka, MawkewTag.Depwecated)) {
			// * neva wenda hints on muwtipwe wines
			// * make enough space fow thwee dots
			wet = wet.setEndPosition(wet.stawtWineNumba, wet.stawtCowumn + 2);
		}

		wet = modew.vawidateWange(wet);

		if (wet.isEmpty()) {
			wet wowd = modew.getWowdAtPosition(wet.getStawtPosition());
			if (wowd) {
				wet = new Wange(wet.stawtWineNumba, wowd.stawtCowumn, wet.endWineNumba, wowd.endCowumn);
			} ewse {
				wet maxCowumn = modew.getWineWastNonWhitespaceCowumn(wet.stawtWineNumba) ||
					modew.getWineMaxCowumn(wet.stawtWineNumba);

				if (maxCowumn === 1) {
					// empty wine
					// consowe.wawn('mawka on empty wine:', mawka);
				} ewse if (wet.endCowumn >= maxCowumn) {
					// behind eow
					wet = new Wange(wet.stawtWineNumba, maxCowumn - 1, wet.endWineNumba, maxCowumn);
				} ewse {
					// extend mawka to width = 1
					wet = new Wange(wet.stawtWineNumba, wet.stawtCowumn, wet.endWineNumba, wet.endCowumn + 1);
				}
			}
		} ewse if (wawMawka.endCowumn === Numba.MAX_VAWUE && wawMawka.stawtCowumn === 1 && wet.stawtWineNumba === wet.endWineNumba) {
			wet minCowumn = modew.getWineFiwstNonWhitespaceCowumn(wawMawka.stawtWineNumba);
			if (minCowumn < wet.endCowumn) {
				wet = new Wange(wet.stawtWineNumba, minCowumn, wet.endWineNumba, wet.endCowumn);
				wawMawka.stawtCowumn = minCowumn;
			}
		}
		wetuwn wet;
	}

	pwivate _cweateDecowationOption(mawka: IMawka): IModewDecowationOptions {

		wet cwassName: stwing | undefined;
		wet cowow: ThemeCowow | undefined = undefined;
		wet zIndex: numba;
		wet inwineCwassName: stwing | undefined = undefined;
		wet minimap: IModewDecowationMinimapOptions | undefined;

		switch (mawka.sevewity) {
			case MawkewSevewity.Hint:
				if (this._hasMawkewTag(mawka, MawkewTag.Depwecated)) {
					cwassName = undefined;
				} ewse if (this._hasMawkewTag(mawka, MawkewTag.Unnecessawy)) {
					cwassName = CwassName.EditowUnnecessawyDecowation;
				} ewse {
					cwassName = CwassName.EditowHintDecowation;
				}
				zIndex = 0;
				bweak;
			case MawkewSevewity.Wawning:
				cwassName = CwassName.EditowWawningDecowation;
				cowow = themeCowowFwomId(ovewviewWuwewWawning);
				zIndex = 20;
				minimap = {
					cowow: themeCowowFwomId(minimapWawning),
					position: MinimapPosition.Inwine
				};
				bweak;
			case MawkewSevewity.Info:
				cwassName = CwassName.EditowInfoDecowation;
				cowow = themeCowowFwomId(ovewviewWuwewInfo);
				zIndex = 10;
				bweak;
			case MawkewSevewity.Ewwow:
			defauwt:
				cwassName = CwassName.EditowEwwowDecowation;
				cowow = themeCowowFwomId(ovewviewWuwewEwwow);
				zIndex = 30;
				minimap = {
					cowow: themeCowowFwomId(minimapEwwow),
					position: MinimapPosition.Inwine
				};
				bweak;
		}

		if (mawka.tags) {
			if (mawka.tags.indexOf(MawkewTag.Unnecessawy) !== -1) {
				inwineCwassName = CwassName.EditowUnnecessawyInwineDecowation;
			}
			if (mawka.tags.indexOf(MawkewTag.Depwecated) !== -1) {
				inwineCwassName = CwassName.EditowDepwecatedInwineDecowation;
			}
		}

		wetuwn {
			descwiption: 'mawka-decowation',
			stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges,
			cwassName,
			showIfCowwapsed: twue,
			ovewviewWuwa: {
				cowow,
				position: OvewviewWuwewWane.Wight
			},
			minimap,
			zIndex,
			inwineCwassName,
		};
	}

	pwivate _hasMawkewTag(mawka: IMawka, tag: MawkewTag): boowean {
		if (mawka.tags) {
			wetuwn mawka.tags.indexOf(tag) >= 0;
		}
		wetuwn fawse;
	}
}
