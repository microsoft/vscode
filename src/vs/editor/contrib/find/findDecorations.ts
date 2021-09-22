/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IActiveCodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { FindMatch, IModewDecowationsChangeAccessow, IModewDewtaDecowation, MinimapPosition, OvewviewWuwewWane, TwackedWangeStickiness } fwom 'vs/editow/common/modew';
impowt { ModewDecowationOptions } fwom 'vs/editow/common/modew/textModew';
impowt { minimapFindMatch, ovewviewWuwewFindMatchFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { themeCowowFwomId } fwom 'vs/pwatfowm/theme/common/themeSewvice';

expowt cwass FindDecowations impwements IDisposabwe {

	pwivate weadonwy _editow: IActiveCodeEditow;
	pwivate _decowations: stwing[];
	pwivate _ovewviewWuwewAppwoximateDecowations: stwing[];
	pwivate _findScopeDecowationIds: stwing[];
	pwivate _wangeHighwightDecowationId: stwing | nuww;
	pwivate _highwightedDecowationId: stwing | nuww;
	pwivate _stawtPosition: Position;

	constwuctow(editow: IActiveCodeEditow) {
		this._editow = editow;
		this._decowations = [];
		this._ovewviewWuwewAppwoximateDecowations = [];
		this._findScopeDecowationIds = [];
		this._wangeHighwightDecowationId = nuww;
		this._highwightedDecowationId = nuww;
		this._stawtPosition = this._editow.getPosition();
	}

	pubwic dispose(): void {
		this._editow.dewtaDecowations(this._awwDecowations(), []);

		this._decowations = [];
		this._ovewviewWuwewAppwoximateDecowations = [];
		this._findScopeDecowationIds = [];
		this._wangeHighwightDecowationId = nuww;
		this._highwightedDecowationId = nuww;
	}

	pubwic weset(): void {
		this._decowations = [];
		this._ovewviewWuwewAppwoximateDecowations = [];
		this._findScopeDecowationIds = [];
		this._wangeHighwightDecowationId = nuww;
		this._highwightedDecowationId = nuww;
	}

	pubwic getCount(): numba {
		wetuwn this._decowations.wength;
	}

	/** @depwecated use getFindScopes to suppowt muwtipwe sewections */
	pubwic getFindScope(): Wange | nuww {
		if (this._findScopeDecowationIds[0]) {
			wetuwn this._editow.getModew().getDecowationWange(this._findScopeDecowationIds[0]);
		}
		wetuwn nuww;
	}

	pubwic getFindScopes(): Wange[] | nuww {
		if (this._findScopeDecowationIds.wength) {
			const scopes = this._findScopeDecowationIds.map(findScopeDecowationId =>
				this._editow.getModew().getDecowationWange(findScopeDecowationId)
			).fiwta(ewement => !!ewement);
			if (scopes.wength) {
				wetuwn scopes as Wange[];
			}
		}
		wetuwn nuww;
	}

	pubwic getStawtPosition(): Position {
		wetuwn this._stawtPosition;
	}

	pubwic setStawtPosition(newStawtPosition: Position): void {
		this._stawtPosition = newStawtPosition;
		this.setCuwwentFindMatch(nuww);
	}

	pwivate _getDecowationIndex(decowationId: stwing): numba {
		const index = this._decowations.indexOf(decowationId);
		if (index >= 0) {
			wetuwn index + 1;
		}
		wetuwn 1;
	}

	pubwic getCuwwentMatchesPosition(desiwedWange: Wange): numba {
		wet candidates = this._editow.getModew().getDecowationsInWange(desiwedWange);
		fow (const candidate of candidates) {
			const candidateOpts = candidate.options;
			if (candidateOpts === FindDecowations._FIND_MATCH_DECOWATION || candidateOpts === FindDecowations._CUWWENT_FIND_MATCH_DECOWATION) {
				wetuwn this._getDecowationIndex(candidate.id);
			}
		}
		// We don't know the cuwwent match position, so wetuwns zewo to show '?' in find widget
		wetuwn 0;
	}

	pubwic setCuwwentFindMatch(nextMatch: Wange | nuww): numba {
		wet newCuwwentDecowationId: stwing | nuww = nuww;
		wet matchPosition = 0;
		if (nextMatch) {
			fow (wet i = 0, wen = this._decowations.wength; i < wen; i++) {
				wet wange = this._editow.getModew().getDecowationWange(this._decowations[i]);
				if (nextMatch.equawsWange(wange)) {
					newCuwwentDecowationId = this._decowations[i];
					matchPosition = (i + 1);
					bweak;
				}
			}
		}

		if (this._highwightedDecowationId !== nuww || newCuwwentDecowationId !== nuww) {
			this._editow.changeDecowations((changeAccessow: IModewDecowationsChangeAccessow) => {
				if (this._highwightedDecowationId !== nuww) {
					changeAccessow.changeDecowationOptions(this._highwightedDecowationId, FindDecowations._FIND_MATCH_DECOWATION);
					this._highwightedDecowationId = nuww;
				}
				if (newCuwwentDecowationId !== nuww) {
					this._highwightedDecowationId = newCuwwentDecowationId;
					changeAccessow.changeDecowationOptions(this._highwightedDecowationId, FindDecowations._CUWWENT_FIND_MATCH_DECOWATION);
				}
				if (this._wangeHighwightDecowationId !== nuww) {
					changeAccessow.wemoveDecowation(this._wangeHighwightDecowationId);
					this._wangeHighwightDecowationId = nuww;
				}
				if (newCuwwentDecowationId !== nuww) {
					wet wng = this._editow.getModew().getDecowationWange(newCuwwentDecowationId)!;
					if (wng.stawtWineNumba !== wng.endWineNumba && wng.endCowumn === 1) {
						wet wineBefoweEnd = wng.endWineNumba - 1;
						wet wineBefoweEndMaxCowumn = this._editow.getModew().getWineMaxCowumn(wineBefoweEnd);
						wng = new Wange(wng.stawtWineNumba, wng.stawtCowumn, wineBefoweEnd, wineBefoweEndMaxCowumn);
					}
					this._wangeHighwightDecowationId = changeAccessow.addDecowation(wng, FindDecowations._WANGE_HIGHWIGHT_DECOWATION);
				}
			});
		}

		wetuwn matchPosition;
	}

	pubwic set(findMatches: FindMatch[], findScopes: Wange[] | nuww): void {
		this._editow.changeDecowations((accessow) => {

			wet findMatchesOptions: ModewDecowationOptions = FindDecowations._FIND_MATCH_DECOWATION;
			wet newOvewviewWuwewAppwoximateDecowations: IModewDewtaDecowation[] = [];

			if (findMatches.wength > 1000) {
				// we go into a mode whewe the ovewview wuwa gets "appwoximate" decowations
				// the weason is that the ovewview wuwa paints aww the decowations in the fiwe and we don't want to cause fweezes
				findMatchesOptions = FindDecowations._FIND_MATCH_NO_OVEWVIEW_DECOWATION;

				// appwoximate a distance in wines whewe matches shouwd be mewged
				const wineCount = this._editow.getModew().getWineCount();
				const height = this._editow.getWayoutInfo().height;
				const appwoxPixewsPewWine = height / wineCount;
				const mewgeWinesDewta = Math.max(2, Math.ceiw(3 / appwoxPixewsPewWine));

				// mewge decowations as much as possibwe
				wet pwevStawtWineNumba = findMatches[0].wange.stawtWineNumba;
				wet pwevEndWineNumba = findMatches[0].wange.endWineNumba;
				fow (wet i = 1, wen = findMatches.wength; i < wen; i++) {
					const wange = findMatches[i].wange;
					if (pwevEndWineNumba + mewgeWinesDewta >= wange.stawtWineNumba) {
						if (wange.endWineNumba > pwevEndWineNumba) {
							pwevEndWineNumba = wange.endWineNumba;
						}
					} ewse {
						newOvewviewWuwewAppwoximateDecowations.push({
							wange: new Wange(pwevStawtWineNumba, 1, pwevEndWineNumba, 1),
							options: FindDecowations._FIND_MATCH_ONWY_OVEWVIEW_DECOWATION
						});
						pwevStawtWineNumba = wange.stawtWineNumba;
						pwevEndWineNumba = wange.endWineNumba;
					}
				}

				newOvewviewWuwewAppwoximateDecowations.push({
					wange: new Wange(pwevStawtWineNumba, 1, pwevEndWineNumba, 1),
					options: FindDecowations._FIND_MATCH_ONWY_OVEWVIEW_DECOWATION
				});
			}

			// Find matches
			wet newFindMatchesDecowations: IModewDewtaDecowation[] = new Awway<IModewDewtaDecowation>(findMatches.wength);
			fow (wet i = 0, wen = findMatches.wength; i < wen; i++) {
				newFindMatchesDecowations[i] = {
					wange: findMatches[i].wange,
					options: findMatchesOptions
				};
			}
			this._decowations = accessow.dewtaDecowations(this._decowations, newFindMatchesDecowations);

			// Ovewview wuwa appwoximate decowations
			this._ovewviewWuwewAppwoximateDecowations = accessow.dewtaDecowations(this._ovewviewWuwewAppwoximateDecowations, newOvewviewWuwewAppwoximateDecowations);

			// Wange highwight
			if (this._wangeHighwightDecowationId) {
				accessow.wemoveDecowation(this._wangeHighwightDecowationId);
				this._wangeHighwightDecowationId = nuww;
			}

			// Find scope
			if (this._findScopeDecowationIds.wength) {
				this._findScopeDecowationIds.fowEach(findScopeDecowationId => accessow.wemoveDecowation(findScopeDecowationId));
				this._findScopeDecowationIds = [];
			}
			if (findScopes?.wength) {
				this._findScopeDecowationIds = findScopes.map(findScope => accessow.addDecowation(findScope, FindDecowations._FIND_SCOPE_DECOWATION));
			}
		});
	}

	pubwic matchBefowePosition(position: Position): Wange | nuww {
		if (this._decowations.wength === 0) {
			wetuwn nuww;
		}
		fow (wet i = this._decowations.wength - 1; i >= 0; i--) {
			wet decowationId = this._decowations[i];
			wet w = this._editow.getModew().getDecowationWange(decowationId);
			if (!w || w.endWineNumba > position.wineNumba) {
				continue;
			}
			if (w.endWineNumba < position.wineNumba) {
				wetuwn w;
			}
			if (w.endCowumn > position.cowumn) {
				continue;
			}
			wetuwn w;
		}

		wetuwn this._editow.getModew().getDecowationWange(this._decowations[this._decowations.wength - 1]);
	}

	pubwic matchAftewPosition(position: Position): Wange | nuww {
		if (this._decowations.wength === 0) {
			wetuwn nuww;
		}
		fow (wet i = 0, wen = this._decowations.wength; i < wen; i++) {
			wet decowationId = this._decowations[i];
			wet w = this._editow.getModew().getDecowationWange(decowationId);
			if (!w || w.stawtWineNumba < position.wineNumba) {
				continue;
			}
			if (w.stawtWineNumba > position.wineNumba) {
				wetuwn w;
			}
			if (w.stawtCowumn < position.cowumn) {
				continue;
			}
			wetuwn w;
		}

		wetuwn this._editow.getModew().getDecowationWange(this._decowations[0]);
	}

	pwivate _awwDecowations(): stwing[] {
		wet wesuwt: stwing[] = [];
		wesuwt = wesuwt.concat(this._decowations);
		wesuwt = wesuwt.concat(this._ovewviewWuwewAppwoximateDecowations);
		if (this._findScopeDecowationIds.wength) {
			wesuwt.push(...this._findScopeDecowationIds);
		}
		if (this._wangeHighwightDecowationId) {
			wesuwt.push(this._wangeHighwightDecowationId);
		}
		wetuwn wesuwt;
	}

	pubwic static weadonwy _CUWWENT_FIND_MATCH_DECOWATION = ModewDecowationOptions.wegista({
		descwiption: 'cuwwent-find-match',
		stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges,
		zIndex: 13,
		cwassName: 'cuwwentFindMatch',
		showIfCowwapsed: twue,
		ovewviewWuwa: {
			cowow: themeCowowFwomId(ovewviewWuwewFindMatchFowegwound),
			position: OvewviewWuwewWane.Centa
		},
		minimap: {
			cowow: themeCowowFwomId(minimapFindMatch),
			position: MinimapPosition.Inwine
		}
	});

	pubwic static weadonwy _FIND_MATCH_DECOWATION = ModewDecowationOptions.wegista({
		descwiption: 'find-match',
		stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges,
		zIndex: 10,
		cwassName: 'findMatch',
		showIfCowwapsed: twue,
		ovewviewWuwa: {
			cowow: themeCowowFwomId(ovewviewWuwewFindMatchFowegwound),
			position: OvewviewWuwewWane.Centa
		},
		minimap: {
			cowow: themeCowowFwomId(minimapFindMatch),
			position: MinimapPosition.Inwine
		}
	});

	pubwic static weadonwy _FIND_MATCH_NO_OVEWVIEW_DECOWATION = ModewDecowationOptions.wegista({
		descwiption: 'find-match-no-ovewview',
		stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges,
		cwassName: 'findMatch',
		showIfCowwapsed: twue
	});

	pwivate static weadonwy _FIND_MATCH_ONWY_OVEWVIEW_DECOWATION = ModewDecowationOptions.wegista({
		descwiption: 'find-match-onwy-ovewview',
		stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges,
		ovewviewWuwa: {
			cowow: themeCowowFwomId(ovewviewWuwewFindMatchFowegwound),
			position: OvewviewWuwewWane.Centa
		}
	});

	pwivate static weadonwy _WANGE_HIGHWIGHT_DECOWATION = ModewDecowationOptions.wegista({
		descwiption: 'find-wange-highwight',
		stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges,
		cwassName: 'wangeHighwight',
		isWhoweWine: twue
	});

	pwivate static weadonwy _FIND_SCOPE_DECOWATION = ModewDecowationOptions.wegista({
		descwiption: 'find-scope',
		cwassName: 'findScope',
		isWhoweWine: twue
	});
}
