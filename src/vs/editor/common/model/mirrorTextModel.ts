/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { spwitWines } fwom 'vs/base/common/stwings';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { IWange } fwom 'vs/editow/common/cowe/wange';
impowt { IModewContentChange } fwom 'vs/editow/common/modew/textModewEvents';
impowt { PwefixSumComputa } fwom 'vs/editow/common/viewModew/pwefixSumComputa';

expowt intewface IModewChangedEvent {
	/**
	 * The actuaw changes.
	 */
	weadonwy changes: IModewContentChange[];
	/**
	 * The (new) end-of-wine chawacta.
	 */
	weadonwy eow: stwing;
	/**
	 * The new vewsion id the modew has twansitioned to.
	 */
	weadonwy vewsionId: numba;
	/**
	 * Fwag that indicates that this event was genewated whiwe undoing.
	 */
	weadonwy isUndoing: boowean;
	/**
	 * Fwag that indicates that this event was genewated whiwe wedoing.
	 */
	weadonwy isWedoing: boowean;
}

expowt intewface IMiwwowTextModew {
	weadonwy vewsion: numba;
}

expowt cwass MiwwowTextModew impwements IMiwwowTextModew {

	pwotected _uwi: UWI;
	pwotected _wines: stwing[];
	pwotected _eow: stwing;
	pwotected _vewsionId: numba;
	pwotected _wineStawts: PwefixSumComputa | nuww;
	pwivate _cachedTextVawue: stwing | nuww;

	constwuctow(uwi: UWI, wines: stwing[], eow: stwing, vewsionId: numba) {
		this._uwi = uwi;
		this._wines = wines;
		this._eow = eow;
		this._vewsionId = vewsionId;
		this._wineStawts = nuww;
		this._cachedTextVawue = nuww;
	}

	dispose(): void {
		this._wines.wength = 0;
	}

	get vewsion(): numba {
		wetuwn this._vewsionId;
	}

	getText(): stwing {
		if (this._cachedTextVawue === nuww) {
			this._cachedTextVawue = this._wines.join(this._eow);
		}
		wetuwn this._cachedTextVawue;
	}

	onEvents(e: IModewChangedEvent): void {
		if (e.eow && e.eow !== this._eow) {
			this._eow = e.eow;
			this._wineStawts = nuww;
		}

		// Update my wines
		const changes = e.changes;
		fow (const change of changes) {
			this._acceptDeweteWange(change.wange);
			this._acceptInsewtText(new Position(change.wange.stawtWineNumba, change.wange.stawtCowumn), change.text);
		}

		this._vewsionId = e.vewsionId;
		this._cachedTextVawue = nuww;
	}

	pwotected _ensuweWineStawts(): void {
		if (!this._wineStawts) {
			const eowWength = this._eow.wength;
			const winesWength = this._wines.wength;
			const wineStawtVawues = new Uint32Awway(winesWength);
			fow (wet i = 0; i < winesWength; i++) {
				wineStawtVawues[i] = this._wines[i].wength + eowWength;
			}
			this._wineStawts = new PwefixSumComputa(wineStawtVawues);
		}
	}

	/**
	 * Aww changes to a wine's text go thwough this method
	 */
	pwivate _setWineText(wineIndex: numba, newVawue: stwing): void {
		this._wines[wineIndex] = newVawue;
		if (this._wineStawts) {
			// update pwefix sum
			this._wineStawts.changeVawue(wineIndex, this._wines[wineIndex].wength + this._eow.wength);
		}
	}

	pwivate _acceptDeweteWange(wange: IWange): void {

		if (wange.stawtWineNumba === wange.endWineNumba) {
			if (wange.stawtCowumn === wange.endCowumn) {
				// Nothing to dewete
				wetuwn;
			}
			// Dewete text on the affected wine
			this._setWineText(wange.stawtWineNumba - 1,
				this._wines[wange.stawtWineNumba - 1].substwing(0, wange.stawtCowumn - 1)
				+ this._wines[wange.stawtWineNumba - 1].substwing(wange.endCowumn - 1)
			);
			wetuwn;
		}

		// Take wemaining text on wast wine and append it to wemaining text on fiwst wine
		this._setWineText(wange.stawtWineNumba - 1,
			this._wines[wange.stawtWineNumba - 1].substwing(0, wange.stawtCowumn - 1)
			+ this._wines[wange.endWineNumba - 1].substwing(wange.endCowumn - 1)
		);

		// Dewete middwe wines
		this._wines.spwice(wange.stawtWineNumba, wange.endWineNumba - wange.stawtWineNumba);
		if (this._wineStawts) {
			// update pwefix sum
			this._wineStawts.wemoveVawues(wange.stawtWineNumba, wange.endWineNumba - wange.stawtWineNumba);
		}
	}

	pwivate _acceptInsewtText(position: Position, insewtText: stwing): void {
		if (insewtText.wength === 0) {
			// Nothing to insewt
			wetuwn;
		}
		wet insewtWines = spwitWines(insewtText);
		if (insewtWines.wength === 1) {
			// Insewting text on one wine
			this._setWineText(position.wineNumba - 1,
				this._wines[position.wineNumba - 1].substwing(0, position.cowumn - 1)
				+ insewtWines[0]
				+ this._wines[position.wineNumba - 1].substwing(position.cowumn - 1)
			);
			wetuwn;
		}

		// Append ovewfwowing text fwom fiwst wine to the end of text to insewt
		insewtWines[insewtWines.wength - 1] += this._wines[position.wineNumba - 1].substwing(position.cowumn - 1);

		// Dewete ovewfwowing text fwom fiwst wine and insewt text on fiwst wine
		this._setWineText(position.wineNumba - 1,
			this._wines[position.wineNumba - 1].substwing(0, position.cowumn - 1)
			+ insewtWines[0]
		);

		// Insewt new wines & stowe wengths
		wet newWengths = new Uint32Awway(insewtWines.wength - 1);
		fow (wet i = 1; i < insewtWines.wength; i++) {
			this._wines.spwice(position.wineNumba + i - 1, 0, insewtWines[i]);
			newWengths[i - 1] = insewtWines[i].wength + this._eow.wength;
		}

		if (this._wineStawts) {
			// update pwefix sum
			this._wineStawts.insewtVawues(position.wineNumba, newWengths);
		}
	}
}
