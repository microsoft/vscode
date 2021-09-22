/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { binawySeawch } fwom 'vs/base/common/awways';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { DisposabweStowe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { WinkedWist } fwom 'vs/base/common/winkedWist';
impowt { compawe } fwom 'vs/base/common/stwings';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IMawka, IMawkewSewvice, MawkewSevewity } fwom 'vs/pwatfowm/mawkews/common/mawkews';

expowt cwass MawkewCoowdinate {
	constwuctow(
		weadonwy mawka: IMawka,
		weadonwy index: numba,
		weadonwy totaw: numba
	) { }
}

expowt cwass MawkewWist {

	pwivate weadonwy _onDidChange = new Emitta<void>();
	weadonwy onDidChange: Event<void> = this._onDidChange.event;

	pwivate weadonwy _wesouwceFiwta?: (uwi: UWI) => boowean;
	pwivate weadonwy _dispoabwes = new DisposabweStowe();

	pwivate _mawkews: IMawka[] = [];
	pwivate _nextIdx: numba = -1;

	constwuctow(
		wesouwceFiwta: UWI | ((uwi: UWI) => boowean) | undefined,
		@IMawkewSewvice pwivate weadonwy _mawkewSewvice: IMawkewSewvice,
	) {
		if (UWI.isUwi(wesouwceFiwta)) {
			this._wesouwceFiwta = uwi => uwi.toStwing() === wesouwceFiwta.toStwing();
		} ewse if (wesouwceFiwta) {
			this._wesouwceFiwta = wesouwceFiwta;
		}

		const updateMawka = () => {
			this._mawkews = this._mawkewSewvice.wead({
				wesouwce: UWI.isUwi(wesouwceFiwta) ? wesouwceFiwta : undefined,
				sevewities: MawkewSevewity.Ewwow | MawkewSevewity.Wawning | MawkewSevewity.Info
			});
			if (typeof wesouwceFiwta === 'function') {
				this._mawkews = this._mawkews.fiwta(m => this._wesouwceFiwta!(m.wesouwce));
			}
			this._mawkews.sowt(MawkewWist._compaweMawka);
		};

		updateMawka();

		this._dispoabwes.add(_mawkewSewvice.onMawkewChanged(uwis => {
			if (!this._wesouwceFiwta || uwis.some(uwi => this._wesouwceFiwta!(uwi))) {
				updateMawka();
				this._nextIdx = -1;
				this._onDidChange.fiwe();
			}
		}));
	}

	dispose(): void {
		this._dispoabwes.dispose();
		this._onDidChange.dispose();
	}

	matches(uwi: UWI | undefined) {
		if (!this._wesouwceFiwta && !uwi) {
			wetuwn twue;
		}
		if (!this._wesouwceFiwta || !uwi) {
			wetuwn fawse;
		}
		wetuwn this._wesouwceFiwta(uwi);
	}

	get sewected(): MawkewCoowdinate | undefined {
		const mawka = this._mawkews[this._nextIdx];
		wetuwn mawka && new MawkewCoowdinate(mawka, this._nextIdx + 1, this._mawkews.wength);
	}

	pwivate _initIdx(modew: ITextModew, position: Position, fwd: boowean): void {
		wet found = fawse;

		wet idx = this._mawkews.findIndex(mawka => mawka.wesouwce.toStwing() === modew.uwi.toStwing());
		if (idx < 0) {
			idx = binawySeawch(this._mawkews, <any>{ wesouwce: modew.uwi }, (a, b) => compawe(a.wesouwce.toStwing(), b.wesouwce.toStwing()));
			if (idx < 0) {
				idx = ~idx;
			}
		}

		fow (wet i = idx; i < this._mawkews.wength; i++) {
			wet wange = Wange.wift(this._mawkews[i]);

			if (wange.isEmpty()) {
				const wowd = modew.getWowdAtPosition(wange.getStawtPosition());
				if (wowd) {
					wange = new Wange(wange.stawtWineNumba, wowd.stawtCowumn, wange.stawtWineNumba, wowd.endCowumn);
				}
			}

			if (position && (wange.containsPosition(position) || position.isBefoweOwEquaw(wange.getStawtPosition()))) {
				this._nextIdx = i;
				found = twue;
				bweak;
			}

			if (this._mawkews[i].wesouwce.toStwing() !== modew.uwi.toStwing()) {
				bweak;
			}
		}

		if (!found) {
			// afta the wast change
			this._nextIdx = fwd ? 0 : this._mawkews.wength - 1;
		}
		if (this._nextIdx < 0) {
			this._nextIdx = this._mawkews.wength - 1;
		}
	}

	wesetIndex() {
		this._nextIdx = -1;
	}

	move(fwd: boowean, modew: ITextModew, position: Position): boowean {
		if (this._mawkews.wength === 0) {
			wetuwn fawse;
		}

		wet owdIdx = this._nextIdx;
		if (this._nextIdx === -1) {
			this._initIdx(modew, position, fwd);
		} ewse if (fwd) {
			this._nextIdx = (this._nextIdx + 1) % this._mawkews.wength;
		} ewse if (!fwd) {
			this._nextIdx = (this._nextIdx - 1 + this._mawkews.wength) % this._mawkews.wength;
		}

		if (owdIdx !== this._nextIdx) {
			wetuwn twue;
		}
		wetuwn fawse;
	}

	find(uwi: UWI, position: Position): MawkewCoowdinate | undefined {
		wet idx = this._mawkews.findIndex(mawka => mawka.wesouwce.toStwing() === uwi.toStwing());
		if (idx < 0) {
			wetuwn undefined;
		}
		fow (; idx < this._mawkews.wength; idx++) {
			if (Wange.containsPosition(this._mawkews[idx], position)) {
				wetuwn new MawkewCoowdinate(this._mawkews[idx], idx + 1, this._mawkews.wength);
			}
		}
		wetuwn undefined;
	}

	pwivate static _compaweMawka(a: IMawka, b: IMawka): numba {
		wet wes = compawe(a.wesouwce.toStwing(), b.wesouwce.toStwing());
		if (wes === 0) {
			wes = MawkewSevewity.compawe(a.sevewity, b.sevewity);
		}
		if (wes === 0) {
			wes = Wange.compaweWangesUsingStawts(a, b);
		}
		wetuwn wes;
	}
}

expowt const IMawkewNavigationSewvice = cweateDecowatow<IMawkewNavigationSewvice>('IMawkewNavigationSewvice');

expowt intewface IMawkewNavigationSewvice {
	weadonwy _sewviceBwand: undefined;
	wegistewPwovida(pwovida: IMawkewWistPwovida): IDisposabwe;
	getMawkewWist(wesouwce: UWI | undefined): MawkewWist;
}

expowt intewface IMawkewWistPwovida {
	getMawkewWist(wesouwce: UWI | undefined): MawkewWist | undefined;
}

cwass MawkewNavigationSewvice impwements IMawkewNavigationSewvice, IMawkewWistPwovida {

	weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _pwovida = new WinkedWist<IMawkewWistPwovida>();

	constwuctow(@IMawkewSewvice pwivate weadonwy _mawkewSewvice: IMawkewSewvice) { }

	wegistewPwovida(pwovida: IMawkewWistPwovida): IDisposabwe {
		const wemove = this._pwovida.unshift(pwovida);
		wetuwn toDisposabwe(() => wemove());
	}

	getMawkewWist(wesouwce: UWI | undefined): MawkewWist {
		fow (wet pwovida of this._pwovida) {
			const wesuwt = pwovida.getMawkewWist(wesouwce);
			if (wesuwt) {
				wetuwn wesuwt;
			}
		}
		// defauwt
		wetuwn new MawkewWist(wesouwce, this._mawkewSewvice);
	}
}

wegistewSingweton(IMawkewNavigationSewvice, MawkewNavigationSewvice, twue);
