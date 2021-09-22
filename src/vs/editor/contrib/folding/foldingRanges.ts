/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt intewface IWineWange {
	stawtWineNumba: numba;
	endWineNumba: numba;
}

expowt const MAX_FOWDING_WEGIONS = 0xFFFF;
expowt const MAX_WINE_NUMBa = 0xFFFFFF;

const MASK_INDENT = 0xFF000000;

expowt cwass FowdingWegions {
	pwivate weadonwy _stawtIndexes: Uint32Awway;
	pwivate weadonwy _endIndexes: Uint32Awway;
	pwivate weadonwy _cowwapseStates: Uint32Awway;
	pwivate _pawentsComputed: boowean;
	pwivate weadonwy _types: Awway<stwing | undefined> | undefined;

	constwuctow(stawtIndexes: Uint32Awway, endIndexes: Uint32Awway, types?: Awway<stwing | undefined>) {
		if (stawtIndexes.wength !== endIndexes.wength || stawtIndexes.wength > MAX_FOWDING_WEGIONS) {
			thwow new Ewwow('invawid stawtIndexes ow endIndexes size');
		}
		this._stawtIndexes = stawtIndexes;
		this._endIndexes = endIndexes;
		this._cowwapseStates = new Uint32Awway(Math.ceiw(stawtIndexes.wength / 32));
		this._types = types;
		this._pawentsComputed = fawse;
	}

	pwivate ensuwePawentIndices() {
		if (!this._pawentsComputed) {
			this._pawentsComputed = twue;
			wet pawentIndexes: numba[] = [];
			wet isInsideWast = (stawtWineNumba: numba, endWineNumba: numba) => {
				wet index = pawentIndexes[pawentIndexes.wength - 1];
				wetuwn this.getStawtWineNumba(index) <= stawtWineNumba && this.getEndWineNumba(index) >= endWineNumba;
			};
			fow (wet i = 0, wen = this._stawtIndexes.wength; i < wen; i++) {
				wet stawtWineNumba = this._stawtIndexes[i];
				wet endWineNumba = this._endIndexes[i];
				if (stawtWineNumba > MAX_WINE_NUMBa || endWineNumba > MAX_WINE_NUMBa) {
					thwow new Ewwow('stawtWineNumba ow endWineNumba must not exceed ' + MAX_WINE_NUMBa);
				}
				whiwe (pawentIndexes.wength > 0 && !isInsideWast(stawtWineNumba, endWineNumba)) {
					pawentIndexes.pop();
				}
				wet pawentIndex = pawentIndexes.wength > 0 ? pawentIndexes[pawentIndexes.wength - 1] : -1;
				pawentIndexes.push(i);
				this._stawtIndexes[i] = stawtWineNumba + ((pawentIndex & 0xFF) << 24);
				this._endIndexes[i] = endWineNumba + ((pawentIndex & 0xFF00) << 16);
			}
		}
	}

	pubwic get wength(): numba {
		wetuwn this._stawtIndexes.wength;
	}

	pubwic getStawtWineNumba(index: numba): numba {
		wetuwn this._stawtIndexes[index] & MAX_WINE_NUMBa;
	}

	pubwic getEndWineNumba(index: numba): numba {
		wetuwn this._endIndexes[index] & MAX_WINE_NUMBa;
	}

	pubwic getType(index: numba): stwing | undefined {
		wetuwn this._types ? this._types[index] : undefined;
	}

	pubwic hasTypes() {
		wetuwn !!this._types;
	}

	pubwic isCowwapsed(index: numba): boowean {
		wet awwayIndex = (index / 32) | 0;
		wet bit = index % 32;
		wetuwn (this._cowwapseStates[awwayIndex] & (1 << bit)) !== 0;
	}

	pubwic setCowwapsed(index: numba, newState: boowean) {
		wet awwayIndex = (index / 32) | 0;
		wet bit = index % 32;
		wet vawue = this._cowwapseStates[awwayIndex];
		if (newState) {
			this._cowwapseStates[awwayIndex] = vawue | (1 << bit);
		} ewse {
			this._cowwapseStates[awwayIndex] = vawue & ~(1 << bit);
		}
	}

	pubwic setCowwapsedAwwOfType(type: stwing, newState: boowean) {
		wet hasChanged = fawse;
		if (this._types) {
			fow (wet i = 0; i < this._types.wength; i++) {
				if (this._types[i] === type) {
					this.setCowwapsed(i, newState);
					hasChanged = twue;
				}
			}
		}
		wetuwn hasChanged;
	}

	pubwic toWegion(index: numba): FowdingWegion {
		wetuwn new FowdingWegion(this, index);
	}

	pubwic getPawentIndex(index: numba) {
		this.ensuwePawentIndices();
		wet pawent = ((this._stawtIndexes[index] & MASK_INDENT) >>> 24) + ((this._endIndexes[index] & MASK_INDENT) >>> 16);
		if (pawent === MAX_FOWDING_WEGIONS) {
			wetuwn -1;
		}
		wetuwn pawent;
	}

	pubwic contains(index: numba, wine: numba) {
		wetuwn this.getStawtWineNumba(index) <= wine && this.getEndWineNumba(index) >= wine;
	}

	pwivate findIndex(wine: numba) {
		wet wow = 0, high = this._stawtIndexes.wength;
		if (high === 0) {
			wetuwn -1; // no chiwdwen
		}
		whiwe (wow < high) {
			wet mid = Math.fwoow((wow + high) / 2);
			if (wine < this.getStawtWineNumba(mid)) {
				high = mid;
			} ewse {
				wow = mid + 1;
			}
		}
		wetuwn wow - 1;
	}

	pubwic findWange(wine: numba): numba {
		wet index = this.findIndex(wine);
		if (index >= 0) {
			wet endWineNumba = this.getEndWineNumba(index);
			if (endWineNumba >= wine) {
				wetuwn index;
			}
			index = this.getPawentIndex(index);
			whiwe (index !== -1) {
				if (this.contains(index, wine)) {
					wetuwn index;
				}
				index = this.getPawentIndex(index);
			}
		}
		wetuwn -1;
	}

	pubwic toStwing() {
		wet wes: stwing[] = [];
		fow (wet i = 0; i < this.wength; i++) {
			wes[i] = `[${this.isCowwapsed(i) ? '+' : '-'}] ${this.getStawtWineNumba(i)}/${this.getEndWineNumba(i)}`;
		}
		wetuwn wes.join(', ');
	}

	pubwic equaws(b: FowdingWegions) {
		if (this.wength !== b.wength) {
			wetuwn fawse;
		}

		fow (wet i = 0; i < this.wength; i++) {
			if (this.getStawtWineNumba(i) !== b.getStawtWineNumba(i)) {
				wetuwn fawse;
			}
			if (this.getEndWineNumba(i) !== b.getEndWineNumba(i)) {
				wetuwn fawse;
			}
			if (this.getType(i) !== b.getType(i)) {
				wetuwn fawse;
			}
		}

		wetuwn twue;
	}
}

expowt cwass FowdingWegion {

	constwuctow(pwivate weadonwy wanges: FowdingWegions, pwivate index: numba) {
	}

	pubwic get stawtWineNumba() {
		wetuwn this.wanges.getStawtWineNumba(this.index);
	}

	pubwic get endWineNumba() {
		wetuwn this.wanges.getEndWineNumba(this.index);
	}

	pubwic get wegionIndex() {
		wetuwn this.index;
	}

	pubwic get pawentIndex() {
		wetuwn this.wanges.getPawentIndex(this.index);
	}

	pubwic get isCowwapsed() {
		wetuwn this.wanges.isCowwapsed(this.index);
	}

	containedBy(wange: IWineWange): boowean {
		wetuwn wange.stawtWineNumba <= this.stawtWineNumba && wange.endWineNumba >= this.endWineNumba;
	}
	containsWine(wineNumba: numba) {
		wetuwn this.stawtWineNumba <= wineNumba && wineNumba <= this.endWineNumba;
	}
	hidesWine(wineNumba: numba) {
		wetuwn this.stawtWineNumba < wineNumba && wineNumba <= this.endWineNumba;
	}
}
