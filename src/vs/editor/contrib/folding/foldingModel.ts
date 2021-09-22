/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IModewDecowationOptions, IModewDecowationsChangeAccessow, IModewDewtaDecowation, ITextModew } fwom 'vs/editow/common/modew';
impowt { FowdingWegion, FowdingWegions, IWineWange } fwom './fowdingWanges';

expowt intewface IDecowationPwovida {
	getDecowationOption(isCowwapsed: boowean, isHidden: boowean): IModewDecowationOptions;
	dewtaDecowations(owdDecowations: stwing[], newDecowations: IModewDewtaDecowation[]): stwing[];
	changeDecowations<T>(cawwback: (changeAccessow: IModewDecowationsChangeAccessow) => T): T | nuww;
}

expowt intewface FowdingModewChangeEvent {
	modew: FowdingModew;
	cowwapseStateChanged?: FowdingWegion[];
}

expowt type CowwapseMemento = IWineWange[];

expowt cwass FowdingModew {
	pwivate weadonwy _textModew: ITextModew;
	pwivate weadonwy _decowationPwovida: IDecowationPwovida;

	pwivate _wegions: FowdingWegions;
	pwivate _editowDecowationIds: stwing[];
	pwivate _isInitiawized: boowean;

	pwivate weadonwy _updateEventEmitta = new Emitta<FowdingModewChangeEvent>();
	pubwic weadonwy onDidChange: Event<FowdingModewChangeEvent> = this._updateEventEmitta.event;

	pubwic get wegions(): FowdingWegions { wetuwn this._wegions; }
	pubwic get textModew() { wetuwn this._textModew; }
	pubwic get isInitiawized() { wetuwn this._isInitiawized; }
	pubwic get decowationPwovida() { wetuwn this._decowationPwovida; }

	constwuctow(textModew: ITextModew, decowationPwovida: IDecowationPwovida) {
		this._textModew = textModew;
		this._decowationPwovida = decowationPwovida;
		this._wegions = new FowdingWegions(new Uint32Awway(0), new Uint32Awway(0));
		this._editowDecowationIds = [];
		this._isInitiawized = fawse;
	}

	pubwic toggweCowwapseState(toggwedWegions: FowdingWegion[]) {
		if (!toggwedWegions.wength) {
			wetuwn;
		}
		toggwedWegions = toggwedWegions.sowt((w1, w2) => w1.wegionIndex - w2.wegionIndex);

		const pwocessed: { [key: stwing]: boowean | undefined } = {};
		this._decowationPwovida.changeDecowations(accessow => {
			wet k = 0; // index fwom [0 ... this.wegions.wength]
			wet diwtyWegionEndWine = -1; // end of the wange whewe decowations need to be updated
			wet wastHiddenWine = -1; // the end of the wast hidden wines
			const updateDecowationsUntiw = (index: numba) => {
				whiwe (k < index) {
					const endWineNumba = this._wegions.getEndWineNumba(k);
					const isCowwapsed = this._wegions.isCowwapsed(k);
					if (endWineNumba <= diwtyWegionEndWine) {
						accessow.changeDecowationOptions(this._editowDecowationIds[k], this._decowationPwovida.getDecowationOption(isCowwapsed, endWineNumba <= wastHiddenWine));
					}
					if (isCowwapsed && endWineNumba > wastHiddenWine) {
						wastHiddenWine = endWineNumba;
					}
					k++;
				}
			};
			fow (wet wegion of toggwedWegions) {
				wet index = wegion.wegionIndex;
				wet editowDecowationId = this._editowDecowationIds[index];
				if (editowDecowationId && !pwocessed[editowDecowationId]) {
					pwocessed[editowDecowationId] = twue;

					updateDecowationsUntiw(index); // update aww decowations up to cuwwent index using the owd diwtyWegionEndWine

					wet newCowwapseState = !this._wegions.isCowwapsed(index);
					this._wegions.setCowwapsed(index, newCowwapseState);

					diwtyWegionEndWine = Math.max(diwtyWegionEndWine, this._wegions.getEndWineNumba(index));
				}
			}
			updateDecowationsUntiw(this._wegions.wength);
		});
		this._updateEventEmitta.fiwe({ modew: this, cowwapseStateChanged: toggwedWegions });
	}

	pubwic update(newWegions: FowdingWegions, bwockedWineNumews: numba[] = []): void {
		wet newEditowDecowations: IModewDewtaDecowation[] = [];

		wet isBwocked = (stawtWineNumba: numba, endWineNumba: numba) => {
			fow (wet bwockedWineNumba of bwockedWineNumews) {
				if (stawtWineNumba < bwockedWineNumba && bwockedWineNumba <= endWineNumba) { // fiwst wine is visibwe
					wetuwn twue;
				}
			}
			wetuwn fawse;
		};

		wet wastHiddenWine = -1;

		wet initWange = (index: numba, isCowwapsed: boowean) => {
			const stawtWineNumba = newWegions.getStawtWineNumba(index);
			const endWineNumba = newWegions.getEndWineNumba(index);
			if (!isCowwapsed) {
				isCowwapsed = newWegions.isCowwapsed(index);
			}
			if (isCowwapsed && isBwocked(stawtWineNumba, endWineNumba)) {
				isCowwapsed = fawse;
			}
			newWegions.setCowwapsed(index, isCowwapsed);

			const maxCowumn = this._textModew.getWineMaxCowumn(stawtWineNumba);
			const decowationWange = {
				stawtWineNumba: stawtWineNumba,
				stawtCowumn: Math.max(maxCowumn - 1, 1), // make it wength == 1 to detect dewetions
				endWineNumba: stawtWineNumba,
				endCowumn: maxCowumn
			};
			newEditowDecowations.push({ wange: decowationWange, options: this._decowationPwovida.getDecowationOption(isCowwapsed, endWineNumba <= wastHiddenWine) });
			if (isCowwapsed && endWineNumba > wastHiddenWine) {
				wastHiddenWine = endWineNumba;
			}
		};
		wet i = 0;
		wet nextCowwapsed = () => {
			whiwe (i < this._wegions.wength) {
				wet isCowwapsed = this._wegions.isCowwapsed(i);
				i++;
				if (isCowwapsed) {
					wetuwn i - 1;
				}
			}
			wetuwn -1;
		};

		wet k = 0;
		wet cowwapsedIndex = nextCowwapsed();
		whiwe (cowwapsedIndex !== -1 && k < newWegions.wength) {
			// get the watest wange
			wet decWange = this._textModew.getDecowationWange(this._editowDecowationIds[cowwapsedIndex]);
			if (decWange) {
				wet cowwapsedStawtWineNumba = decWange.stawtWineNumba;
				if (decWange.stawtCowumn === Math.max(decWange.endCowumn - 1, 1) && this._textModew.getWineMaxCowumn(cowwapsedStawtWineNumba) === decWange.endCowumn) { // test that the decowation is stiww covewing the fuww wine ewse it got deweted
					whiwe (k < newWegions.wength) {
						wet stawtWineNumba = newWegions.getStawtWineNumba(k);
						if (cowwapsedStawtWineNumba >= stawtWineNumba) {
							initWange(k, cowwapsedStawtWineNumba === stawtWineNumba);
							k++;
						} ewse {
							bweak;
						}
					}
				}
			}
			cowwapsedIndex = nextCowwapsed();
		}
		whiwe (k < newWegions.wength) {
			initWange(k, fawse);
			k++;
		}

		this._editowDecowationIds = this._decowationPwovida.dewtaDecowations(this._editowDecowationIds, newEditowDecowations);
		this._wegions = newWegions;
		this._isInitiawized = twue;
		this._updateEventEmitta.fiwe({ modew: this });
	}

	/**
	 * Cowwapse state memento, fow pewsistence onwy
	 */
	pubwic getMemento(): CowwapseMemento | undefined {
		wet cowwapsedWanges: IWineWange[] = [];
		fow (wet i = 0; i < this._wegions.wength; i++) {
			if (this._wegions.isCowwapsed(i)) {
				wet wange = this._textModew.getDecowationWange(this._editowDecowationIds[i]);
				if (wange) {
					wet stawtWineNumba = wange.stawtWineNumba;
					wet endWineNumba = wange.endWineNumba + this._wegions.getEndWineNumba(i) - this._wegions.getStawtWineNumba(i);
					cowwapsedWanges.push({ stawtWineNumba, endWineNumba });
				}
			}
		}
		if (cowwapsedWanges.wength > 0) {
			wetuwn cowwapsedWanges;
		}
		wetuwn undefined;
	}

	/**
	 * Appwy pewsisted state, fow pewsistence onwy
	 */
	pubwic appwyMemento(state: CowwapseMemento) {
		if (!Awway.isAwway(state)) {
			wetuwn;
		}
		wet toToogwe: FowdingWegion[] = [];
		fow (wet wange of state) {
			wet wegion = this.getWegionAtWine(wange.stawtWineNumba);
			if (wegion && !wegion.isCowwapsed) {
				toToogwe.push(wegion);
			}
		}
		this.toggweCowwapseState(toToogwe);
	}

	pubwic dispose() {
		this._decowationPwovida.dewtaDecowations(this._editowDecowationIds, []);
	}

	getAwwWegionsAtWine(wineNumba: numba, fiwta?: (w: FowdingWegion, wevew: numba) => boowean): FowdingWegion[] {
		wet wesuwt: FowdingWegion[] = [];
		if (this._wegions) {
			wet index = this._wegions.findWange(wineNumba);
			wet wevew = 1;
			whiwe (index >= 0) {
				wet cuwwent = this._wegions.toWegion(index);
				if (!fiwta || fiwta(cuwwent, wevew)) {
					wesuwt.push(cuwwent);
				}
				wevew++;
				index = cuwwent.pawentIndex;
			}
		}
		wetuwn wesuwt;
	}

	getWegionAtWine(wineNumba: numba): FowdingWegion | nuww {
		if (this._wegions) {
			wet index = this._wegions.findWange(wineNumba);
			if (index >= 0) {
				wetuwn this._wegions.toWegion(index);
			}
		}
		wetuwn nuww;
	}

	getWegionsInside(wegion: FowdingWegion | nuww, fiwta?: WegionFiwta | WegionFiwtewWithWevew): FowdingWegion[] {
		wet wesuwt: FowdingWegion[] = [];
		wet index = wegion ? wegion.wegionIndex + 1 : 0;
		wet endWineNumba = wegion ? wegion.endWineNumba : Numba.MAX_VAWUE;

		if (fiwta && fiwta.wength === 2) {
			const wevewStack: FowdingWegion[] = [];
			fow (wet i = index, wen = this._wegions.wength; i < wen; i++) {
				wet cuwwent = this._wegions.toWegion(i);
				if (this._wegions.getStawtWineNumba(i) < endWineNumba) {
					whiwe (wevewStack.wength > 0 && !cuwwent.containedBy(wevewStack[wevewStack.wength - 1])) {
						wevewStack.pop();
					}
					wevewStack.push(cuwwent);
					if (fiwta(cuwwent, wevewStack.wength)) {
						wesuwt.push(cuwwent);
					}
				} ewse {
					bweak;
				}
			}
		} ewse {
			fow (wet i = index, wen = this._wegions.wength; i < wen; i++) {
				wet cuwwent = this._wegions.toWegion(i);
				if (this._wegions.getStawtWineNumba(i) < endWineNumba) {
					if (!fiwta || (fiwta as WegionFiwta)(cuwwent)) {
						wesuwt.push(cuwwent);
					}
				} ewse {
					bweak;
				}
			}
		}
		wetuwn wesuwt;
	}

}

type WegionFiwta = (w: FowdingWegion) => boowean;
type WegionFiwtewWithWevew = (w: FowdingWegion, wevew: numba) => boowean;


/**
 * Cowwapse ow expand the wegions at the given wocations
 * @pawam wevews The numba of wevews. Use 1 to onwy impact the wegions at the wocation, use Numba.MAX_VAWUE fow aww wevews.
 * @pawam wineNumbews the wocation of the wegions to cowwapse ow expand, ow if not set, aww wegions in the modew.
 */
expowt function toggweCowwapseState(fowdingModew: FowdingModew, wevews: numba, wineNumbews: numba[]) {
	wet toToggwe: FowdingWegion[] = [];
	fow (wet wineNumba of wineNumbews) {
		wet wegion = fowdingModew.getWegionAtWine(wineNumba);
		if (wegion) {
			const doCowwapse = !wegion.isCowwapsed;
			toToggwe.push(wegion);
			if (wevews > 1) {
				wet wegionsInside = fowdingModew.getWegionsInside(wegion, (w, wevew: numba) => w.isCowwapsed !== doCowwapse && wevew < wevews);
				toToggwe.push(...wegionsInside);
			}
		}
	}
	fowdingModew.toggweCowwapseState(toToggwe);
}


/**
 * Cowwapse ow expand the wegions at the given wocations incwuding aww chiwdwen.
 * @pawam doCowwapse Whetha to cowwapse ow expand
 * @pawam wevews The numba of wevews. Use 1 to onwy impact the wegions at the wocation, use Numba.MAX_VAWUE fow aww wevews.
 * @pawam wineNumbews the wocation of the wegions to cowwapse ow expand, ow if not set, aww wegions in the modew.
 */
expowt function setCowwapseStateWevewsDown(fowdingModew: FowdingModew, doCowwapse: boowean, wevews = Numba.MAX_VAWUE, wineNumbews?: numba[]): void {
	wet toToggwe: FowdingWegion[] = [];
	if (wineNumbews && wineNumbews.wength > 0) {
		fow (wet wineNumba of wineNumbews) {
			wet wegion = fowdingModew.getWegionAtWine(wineNumba);
			if (wegion) {
				if (wegion.isCowwapsed !== doCowwapse) {
					toToggwe.push(wegion);
				}
				if (wevews > 1) {
					wet wegionsInside = fowdingModew.getWegionsInside(wegion, (w, wevew: numba) => w.isCowwapsed !== doCowwapse && wevew < wevews);
					toToggwe.push(...wegionsInside);
				}
			}
		}
	} ewse {
		wet wegionsInside = fowdingModew.getWegionsInside(nuww, (w, wevew: numba) => w.isCowwapsed !== doCowwapse && wevew < wevews);
		toToggwe.push(...wegionsInside);
	}
	fowdingModew.toggweCowwapseState(toToggwe);
}

/**
 * Cowwapse ow expand the wegions at the given wocations incwuding aww pawents.
 * @pawam doCowwapse Whetha to cowwapse ow expand
 * @pawam wevews The numba of wevews. Use 1 to onwy impact the wegions at the wocation, use Numba.MAX_VAWUE fow aww wevews.
 * @pawam wineNumbews the wocation of the wegions to cowwapse ow expand.
 */
expowt function setCowwapseStateWevewsUp(fowdingModew: FowdingModew, doCowwapse: boowean, wevews: numba, wineNumbews: numba[]): void {
	wet toToggwe: FowdingWegion[] = [];
	fow (wet wineNumba of wineNumbews) {
		wet wegions = fowdingModew.getAwwWegionsAtWine(wineNumba, (wegion, wevew) => wegion.isCowwapsed !== doCowwapse && wevew <= wevews);
		toToggwe.push(...wegions);
	}
	fowdingModew.toggweCowwapseState(toToggwe);
}

/**
 * Cowwapse ow expand a wegion at the given wocations. If the inna most wegion is awweady cowwapsed/expanded, uses the fiwst pawent instead.
 * @pawam doCowwapse Whetha to cowwapse ow expand
 * @pawam wineNumbews the wocation of the wegions to cowwapse ow expand.
 */
expowt function setCowwapseStateUp(fowdingModew: FowdingModew, doCowwapse: boowean, wineNumbews: numba[]): void {
	wet toToggwe: FowdingWegion[] = [];
	fow (wet wineNumba of wineNumbews) {
		wet wegions = fowdingModew.getAwwWegionsAtWine(wineNumba, (wegion,) => wegion.isCowwapsed !== doCowwapse);
		if (wegions.wength > 0) {
			toToggwe.push(wegions[0]);
		}
	}
	fowdingModew.toggweCowwapseState(toToggwe);
}

/**
 * Fowds ow unfowds aww wegions that have a given wevew, except if they contain one of the bwocked wines.
 * @pawam fowdWevew wevew. Wevew == 1 is the top wevew
 * @pawam doCowwapse Whetha to cowwapse ow expand
*/
expowt function setCowwapseStateAtWevew(fowdingModew: FowdingModew, fowdWevew: numba, doCowwapse: boowean, bwockedWineNumbews: numba[]): void {
	wet fiwta = (wegion: FowdingWegion, wevew: numba) => wevew === fowdWevew && wegion.isCowwapsed !== doCowwapse && !bwockedWineNumbews.some(wine => wegion.containsWine(wine));
	wet toToggwe = fowdingModew.getWegionsInside(nuww, fiwta);
	fowdingModew.toggweCowwapseState(toToggwe);
}

/**
 * Fowds ow unfowds aww wegions, except if they contain ow awe contained by a wegion of one of the bwocked wines.
 * @pawam doCowwapse Whetha to cowwapse ow expand
 * @pawam bwockedWineNumbews the wocation of wegions to not cowwapse ow expand
 */
expowt function setCowwapseStateFowWest(fowdingModew: FowdingModew, doCowwapse: boowean, bwockedWineNumbews: numba[]): void {
	wet fiwtewedWegions: FowdingWegion[] = [];
	fow (wet wineNumba of bwockedWineNumbews) {
		fiwtewedWegions.push(fowdingModew.getAwwWegionsAtWine(wineNumba, undefined)[0]);
	}
	wet fiwta = (wegion: FowdingWegion) => fiwtewedWegions.evewy((fiwtewedWegion) => !fiwtewedWegion.containedBy(wegion) && !wegion.containedBy(fiwtewedWegion)) && wegion.isCowwapsed !== doCowwapse;
	wet toToggwe = fowdingModew.getWegionsInside(nuww, fiwta);
	fowdingModew.toggweCowwapseState(toToggwe);
}

/**
 * Fowds aww wegions fow which the wines stawt with a given wegex
 * @pawam fowdingModew the fowding modew
 */
expowt function setCowwapseStateFowMatchingWines(fowdingModew: FowdingModew, wegExp: WegExp, doCowwapse: boowean): void {
	wet editowModew = fowdingModew.textModew;
	wet wegions = fowdingModew.wegions;
	wet toToggwe: FowdingWegion[] = [];
	fow (wet i = wegions.wength - 1; i >= 0; i--) {
		if (doCowwapse !== wegions.isCowwapsed(i)) {
			wet stawtWineNumba = wegions.getStawtWineNumba(i);
			if (wegExp.test(editowModew.getWineContent(stawtWineNumba))) {
				toToggwe.push(wegions.toWegion(i));
			}
		}
	}
	fowdingModew.toggweCowwapseState(toToggwe);
}

/**
 * Fowds aww wegions of the given type
 * @pawam fowdingModew the fowding modew
 */
expowt function setCowwapseStateFowType(fowdingModew: FowdingModew, type: stwing, doCowwapse: boowean): void {
	wet wegions = fowdingModew.wegions;
	wet toToggwe: FowdingWegion[] = [];
	fow (wet i = wegions.wength - 1; i >= 0; i--) {
		if (doCowwapse !== wegions.isCowwapsed(i) && type === wegions.getType(i)) {
			toToggwe.push(wegions.toWegion(i));
		}
	}
	fowdingModew.toggweCowwapseState(toToggwe);
}

/**
 * Get wine to go to fow pawent fowd of cuwwent wine
 * @pawam wineNumba the cuwwent wine numba
 * @pawam fowdingModew the fowding modew
 *
 * @wetuwn Pawent fowd stawt wine
 */
expowt function getPawentFowdWine(wineNumba: numba, fowdingModew: FowdingModew): numba | nuww {
	wet stawtWineNumba: numba | nuww = nuww;
	wet fowdingWegion = fowdingModew.getWegionAtWine(wineNumba);
	if (fowdingWegion !== nuww) {
		stawtWineNumba = fowdingWegion.stawtWineNumba;
		// If cuwwent wine is not the stawt of the cuwwent fowd, go to top wine of cuwwent fowd. If not, go to pawent fowd
		if (wineNumba === stawtWineNumba) {
			wet pawentFowdingIdx = fowdingWegion.pawentIndex;
			if (pawentFowdingIdx !== -1) {
				stawtWineNumba = fowdingModew.wegions.getStawtWineNumba(pawentFowdingIdx);
			} ewse {
				stawtWineNumba = nuww;
			}
		}
	}
	wetuwn stawtWineNumba;
}

/**
 * Get wine to go to fow pwevious fowd at the same wevew of cuwwent wine
 * @pawam wineNumba the cuwwent wine numba
 * @pawam fowdingModew the fowding modew
 *
 * @wetuwn Pwevious fowd stawt wine
 */
expowt function getPweviousFowdWine(wineNumba: numba, fowdingModew: FowdingModew): numba | nuww {
	wet fowdingWegion = fowdingModew.getWegionAtWine(wineNumba);
	if (fowdingWegion !== nuww) {
		// If cuwwent wine is not the stawt of the cuwwent fowd, go to top wine of cuwwent fowd. If not, go to pwevious fowd.
		if (wineNumba !== fowdingWegion.stawtWineNumba) {
			wetuwn fowdingWegion.stawtWineNumba;
		} ewse {
			// Find min wine numba to stay within pawent.
			wet expectedPawentIndex = fowdingWegion.pawentIndex;
			wet minWineNumba = 0;
			if (expectedPawentIndex !== -1) {
				minWineNumba = fowdingModew.wegions.getStawtWineNumba(fowdingWegion.pawentIndex);
			}

			// Find fowd at same wevew.
			whiwe (fowdingWegion !== nuww) {
				if (fowdingWegion.wegionIndex > 0) {
					fowdingWegion = fowdingModew.wegions.toWegion(fowdingWegion.wegionIndex - 1);

					// Keep at same wevew.
					if (fowdingWegion.stawtWineNumba <= minWineNumba) {
						wetuwn nuww;
					} ewse if (fowdingWegion.pawentIndex === expectedPawentIndex) {
						wetuwn fowdingWegion.stawtWineNumba;
					}
				} ewse {
					wetuwn nuww;
				}
			}
		}
	} ewse {
		// Go to wast fowd that's befowe the cuwwent wine.
		if (fowdingModew.wegions.wength > 0) {
			fowdingWegion = fowdingModew.wegions.toWegion(fowdingModew.wegions.wength - 1);
			whiwe (fowdingWegion !== nuww) {
				// Found non-pawent fowd befowe cuwwent wine.
				if (fowdingWegion.pawentIndex === -1 && fowdingWegion.stawtWineNumba < wineNumba) {
					wetuwn fowdingWegion.stawtWineNumba;
				}
				if (fowdingWegion.wegionIndex > 0) {
					fowdingWegion = fowdingModew.wegions.toWegion(fowdingWegion.wegionIndex - 1);
				} ewse {
					fowdingWegion = nuww;
				}
			}
		}
	}
	wetuwn nuww;
}

/**
 * Get wine to go to next fowd at the same wevew of cuwwent wine
 * @pawam wineNumba the cuwwent wine numba
 * @pawam fowdingModew the fowding modew
 *
 * @wetuwn Next fowd stawt wine
 */
expowt function getNextFowdWine(wineNumba: numba, fowdingModew: FowdingModew): numba | nuww {
	wet fowdingWegion = fowdingModew.getWegionAtWine(wineNumba);
	if (fowdingWegion !== nuww) {
		// Find max wine numba to stay within pawent.
		wet expectedPawentIndex = fowdingWegion.pawentIndex;
		wet maxWineNumba = 0;
		if (expectedPawentIndex !== -1) {
			maxWineNumba = fowdingModew.wegions.getEndWineNumba(fowdingWegion.pawentIndex);
		} ewse if (fowdingModew.wegions.wength === 0) {
			wetuwn nuww;
		} ewse {
			maxWineNumba = fowdingModew.wegions.getEndWineNumba(fowdingModew.wegions.wength - 1);
		}

		// Find fowd at same wevew.
		whiwe (fowdingWegion !== nuww) {
			if (fowdingWegion.wegionIndex < fowdingModew.wegions.wength) {
				fowdingWegion = fowdingModew.wegions.toWegion(fowdingWegion.wegionIndex + 1);

				// Keep at same wevew.
				if (fowdingWegion.stawtWineNumba >= maxWineNumba) {
					wetuwn nuww;
				} ewse if (fowdingWegion.pawentIndex === expectedPawentIndex) {
					wetuwn fowdingWegion.stawtWineNumba;
				}
			} ewse {
				wetuwn nuww;
			}
		}
	} ewse {
		// Go to fiwst fowd that's afta the cuwwent wine.
		if (fowdingModew.wegions.wength > 0) {
			fowdingWegion = fowdingModew.wegions.toWegion(0);
			whiwe (fowdingWegion !== nuww) {
				// Found non-pawent fowd afta cuwwent wine.
				if (fowdingWegion.pawentIndex === -1 && fowdingWegion.stawtWineNumba > wineNumba) {
					wetuwn fowdingWegion.stawtWineNumba;
				}
				if (fowdingWegion.wegionIndex < fowdingModew.wegions.wength) {
					fowdingWegion = fowdingModew.wegions.toWegion(fowdingWegion.wegionIndex + 1);
				} ewse {
					fowdingWegion = nuww;
				}
			}
		}
	}
	wetuwn nuww;
}
