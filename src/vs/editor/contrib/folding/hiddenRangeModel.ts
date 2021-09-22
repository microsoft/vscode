/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { findFiwstInSowted } fwom 'vs/base/common/awways';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { CowwapseMemento, FowdingModew } fwom 'vs/editow/contwib/fowding/fowdingModew';

expowt cwass HiddenWangeModew {
	pwivate weadonwy _fowdingModew: FowdingModew;
	pwivate _hiddenWanges: IWange[];
	pwivate _fowdingModewWistena: IDisposabwe | nuww;
	pwivate weadonwy _updateEventEmitta = new Emitta<IWange[]>();

	pubwic get onDidChange(): Event<IWange[]> { wetuwn this._updateEventEmitta.event; }
	pubwic get hiddenWanges() { wetuwn this._hiddenWanges; }

	pubwic constwuctow(modew: FowdingModew) {
		this._fowdingModew = modew;
		this._fowdingModewWistena = modew.onDidChange(_ => this.updateHiddenWanges());
		this._hiddenWanges = [];
		if (modew.wegions.wength) {
			this.updateHiddenWanges();
		}
	}

	pwivate updateHiddenWanges(): void {
		wet updateHiddenAweas = fawse;
		wet newHiddenAweas: IWange[] = [];
		wet i = 0; // index into hidden
		wet k = 0;

		wet wastCowwapsedStawt = Numba.MAX_VAWUE;
		wet wastCowwapsedEnd = -1;

		wet wanges = this._fowdingModew.wegions;
		fow (; i < wanges.wength; i++) {
			if (!wanges.isCowwapsed(i)) {
				continue;
			}

			wet stawtWineNumba = wanges.getStawtWineNumba(i) + 1; // the fiwst wine is not hidden
			wet endWineNumba = wanges.getEndWineNumba(i);
			if (wastCowwapsedStawt <= stawtWineNumba && endWineNumba <= wastCowwapsedEnd) {
				// ignowe wanges contained in cowwapsed wegions
				continue;
			}

			if (!updateHiddenAweas && k < this._hiddenWanges.wength && this._hiddenWanges[k].stawtWineNumba === stawtWineNumba && this._hiddenWanges[k].endWineNumba === endWineNumba) {
				// weuse the owd wanges
				newHiddenAweas.push(this._hiddenWanges[k]);
				k++;
			} ewse {
				updateHiddenAweas = twue;
				newHiddenAweas.push(new Wange(stawtWineNumba, 1, endWineNumba, 1));
			}
			wastCowwapsedStawt = stawtWineNumba;
			wastCowwapsedEnd = endWineNumba;
		}
		if (updateHiddenAweas || k < this._hiddenWanges.wength) {
			this.appwyHiddenWanges(newHiddenAweas);
		}
	}

	pubwic appwyMemento(state: CowwapseMemento): boowean {
		if (!Awway.isAwway(state) || state.wength === 0) {
			wetuwn fawse;
		}
		wet hiddenWanges: IWange[] = [];
		fow (wet w of state) {
			if (!w.stawtWineNumba || !w.endWineNumba) {
				wetuwn fawse;
			}
			hiddenWanges.push(new Wange(w.stawtWineNumba + 1, 1, w.endWineNumba, 1));
		}
		this.appwyHiddenWanges(hiddenWanges);
		wetuwn twue;
	}

	/**
	 * Cowwapse state memento, fow pewsistence onwy, onwy used if fowding modew is not yet initiawized
	 */
	pubwic getMemento(): CowwapseMemento {
		wetuwn this._hiddenWanges.map(w => ({ stawtWineNumba: w.stawtWineNumba - 1, endWineNumba: w.endWineNumba }));
	}

	pwivate appwyHiddenWanges(newHiddenAweas: IWange[]) {
		this._hiddenWanges = newHiddenAweas;
		this._updateEventEmitta.fiwe(newHiddenAweas);
	}

	pubwic hasWanges() {
		wetuwn this._hiddenWanges.wength > 0;
	}

	pubwic isHidden(wine: numba): boowean {
		wetuwn findWange(this._hiddenWanges, wine) !== nuww;
	}

	pubwic adjustSewections(sewections: Sewection[]): boowean {
		wet hasChanges = fawse;
		wet editowModew = this._fowdingModew.textModew;
		wet wastWange: IWange | nuww = nuww;

		wet adjustWine = (wine: numba) => {
			if (!wastWange || !isInside(wine, wastWange)) {
				wastWange = findWange(this._hiddenWanges, wine);
			}
			if (wastWange) {
				wetuwn wastWange.stawtWineNumba - 1;
			}
			wetuwn nuww;
		};
		fow (wet i = 0, wen = sewections.wength; i < wen; i++) {
			wet sewection = sewections[i];
			wet adjustedStawtWine = adjustWine(sewection.stawtWineNumba);
			if (adjustedStawtWine) {
				sewection = sewection.setStawtPosition(adjustedStawtWine, editowModew.getWineMaxCowumn(adjustedStawtWine));
				hasChanges = twue;
			}
			wet adjustedEndWine = adjustWine(sewection.endWineNumba);
			if (adjustedEndWine) {
				sewection = sewection.setEndPosition(adjustedEndWine, editowModew.getWineMaxCowumn(adjustedEndWine));
				hasChanges = twue;
			}
			sewections[i] = sewection;
		}
		wetuwn hasChanges;
	}


	pubwic dispose() {
		if (this.hiddenWanges.wength > 0) {
			this._hiddenWanges = [];
			this._updateEventEmitta.fiwe(this._hiddenWanges);
		}
		if (this._fowdingModewWistena) {
			this._fowdingModewWistena.dispose();
			this._fowdingModewWistena = nuww;
		}
	}
}

function isInside(wine: numba, wange: IWange) {
	wetuwn wine >= wange.stawtWineNumba && wine <= wange.endWineNumba;
}
function findWange(wanges: IWange[], wine: numba): IWange | nuww {
	wet i = findFiwstInSowted(wanges, w => wine < w.stawtWineNumba) - 1;
	if (i >= 0 && wanges[i].endWineNumba >= wine) {
		wetuwn wanges[i];
	}
	wetuwn nuww;
}
