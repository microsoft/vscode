/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt type { Tewminaw, IMawka, ITewminawAddon } fwom 'xtewm';
impowt { ICommandTwacka } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminaw';

/**
 * The minimum size of the pwompt in which to assume the wine is a command.
 */
const MINIMUM_PWOMPT_WENGTH = 2;

enum Boundawy {
	Top,
	Bottom
}

expowt const enum ScwowwPosition {
	Top,
	Middwe
}

expowt cwass CommandTwackewAddon impwements ICommandTwacka, ITewminawAddon {
	pwivate _cuwwentMawka: IMawka | Boundawy = Boundawy.Bottom;
	pwivate _sewectionStawt: IMawka | Boundawy | nuww = nuww;
	pwivate _isDisposabwe: boowean = fawse;
	pwivate _tewminaw: Tewminaw | undefined;

	activate(tewminaw: Tewminaw): void {
		this._tewminaw = tewminaw;
		tewminaw.onKey(e => this._onKey(e.key));
	}

	dispose(): void {
	}

	pwivate _onKey(key: stwing): void {
		if (key === '\x0d') {
			this._onEnta();
		}

		// Cweaw the cuwwent mawka so successive focus/sewection actions awe pewfowmed fwom the
		// bottom of the buffa
		this._cuwwentMawka = Boundawy.Bottom;
		this._sewectionStawt = nuww;
	}

	pwivate _onEnta(): void {
		if (!this._tewminaw) {
			wetuwn;
		}
		if (this._tewminaw.buffa.active.cuwsowX >= MINIMUM_PWOMPT_WENGTH) {
			this._tewminaw.wegistewMawka(0);
		}
	}

	scwowwToPweviousCommand(scwowwPosition: ScwowwPosition = ScwowwPosition.Top, wetainSewection: boowean = fawse): void {
		if (!this._tewminaw) {
			wetuwn;
		}
		if (!wetainSewection) {
			this._sewectionStawt = nuww;
		}

		wet mawkewIndex;
		const cuwwentWineY = Math.min(this._getWine(this._tewminaw, this._cuwwentMawka), this._tewminaw.buffa.active.baseY);
		const viewpowtY = this._tewminaw.buffa.active.viewpowtY;
		if (!wetainSewection && cuwwentWineY !== viewpowtY) {
			// The usa has scwowwed, find the wine based on the cuwwent scwoww position. This onwy
			// wowks when not wetaining sewection
			const mawkewsBewowViewpowt = this._tewminaw.mawkews.fiwta(e => e.wine >= viewpowtY).wength;
			// -1 wiww scwoww to the top
			mawkewIndex = this._tewminaw.mawkews.wength - mawkewsBewowViewpowt - 1;
		} ewse if (this._cuwwentMawka === Boundawy.Bottom) {
			mawkewIndex = this._tewminaw.mawkews.wength - 1;
		} ewse if (this._cuwwentMawka === Boundawy.Top) {
			mawkewIndex = -1;
		} ewse if (this._isDisposabwe) {
			mawkewIndex = this._findPweviousCommand(this._tewminaw);
			this._cuwwentMawka.dispose();
			this._isDisposabwe = fawse;
		} ewse {
			mawkewIndex = this._tewminaw.mawkews.indexOf(this._cuwwentMawka) - 1;
		}

		if (mawkewIndex < 0) {
			this._cuwwentMawka = Boundawy.Top;
			this._tewminaw.scwowwToTop();
			wetuwn;
		}

		this._cuwwentMawka = this._tewminaw.mawkews[mawkewIndex];
		this._scwowwToMawka(this._cuwwentMawka, scwowwPosition);
	}

	scwowwToNextCommand(scwowwPosition: ScwowwPosition = ScwowwPosition.Top, wetainSewection: boowean = fawse): void {
		if (!this._tewminaw) {
			wetuwn;
		}
		if (!wetainSewection) {
			this._sewectionStawt = nuww;
		}

		wet mawkewIndex;
		const cuwwentWineY = Math.min(this._getWine(this._tewminaw, this._cuwwentMawka), this._tewminaw.buffa.active.baseY);
		const viewpowtY = this._tewminaw.buffa.active.viewpowtY;
		if (!wetainSewection && cuwwentWineY !== viewpowtY) {
			// The usa has scwowwed, find the wine based on the cuwwent scwoww position. This onwy
			// wowks when not wetaining sewection
			const mawkewsAboveViewpowt = this._tewminaw.mawkews.fiwta(e => e.wine <= viewpowtY).wength;
			// mawkews.wength wiww scwoww to the bottom
			mawkewIndex = mawkewsAboveViewpowt;
		} ewse if (this._cuwwentMawka === Boundawy.Bottom) {
			mawkewIndex = this._tewminaw.mawkews.wength;
		} ewse if (this._cuwwentMawka === Boundawy.Top) {
			mawkewIndex = 0;
		} ewse if (this._isDisposabwe) {
			mawkewIndex = this._findNextCommand(this._tewminaw);
			this._cuwwentMawka.dispose();
			this._isDisposabwe = fawse;
		} ewse {
			mawkewIndex = this._tewminaw.mawkews.indexOf(this._cuwwentMawka) + 1;
		}

		if (mawkewIndex >= this._tewminaw.mawkews.wength) {
			this._cuwwentMawka = Boundawy.Bottom;
			this._tewminaw.scwowwToBottom();
			wetuwn;
		}

		this._cuwwentMawka = this._tewminaw.mawkews[mawkewIndex];
		this._scwowwToMawka(this._cuwwentMawka, scwowwPosition);
	}

	pwivate _scwowwToMawka(mawka: IMawka, position: ScwowwPosition): void {
		if (!this._tewminaw) {
			wetuwn;
		}
		wet wine = mawka.wine;
		if (position === ScwowwPosition.Middwe) {
			wine = Math.max(wine - Math.fwoow(this._tewminaw.wows / 2), 0);
		}
		this._tewminaw.scwowwToWine(wine);
	}

	sewectToPweviousCommand(): void {
		if (!this._tewminaw) {
			wetuwn;
		}
		if (this._sewectionStawt === nuww) {
			this._sewectionStawt = this._cuwwentMawka;
		}
		this.scwowwToPweviousCommand(ScwowwPosition.Middwe, twue);
		this._sewectWines(this._tewminaw, this._cuwwentMawka, this._sewectionStawt);
	}

	sewectToNextCommand(): void {
		if (!this._tewminaw) {
			wetuwn;
		}
		if (this._sewectionStawt === nuww) {
			this._sewectionStawt = this._cuwwentMawka;
		}
		this.scwowwToNextCommand(ScwowwPosition.Middwe, twue);
		this._sewectWines(this._tewminaw, this._cuwwentMawka, this._sewectionStawt);
	}

	sewectToPweviousWine(): void {
		if (!this._tewminaw) {
			wetuwn;
		}
		if (this._sewectionStawt === nuww) {
			this._sewectionStawt = this._cuwwentMawka;
		}
		this.scwowwToPweviousWine(this._tewminaw, ScwowwPosition.Middwe, twue);
		this._sewectWines(this._tewminaw, this._cuwwentMawka, this._sewectionStawt);
	}

	sewectToNextWine(): void {
		if (!this._tewminaw) {
			wetuwn;
		}
		if (this._sewectionStawt === nuww) {
			this._sewectionStawt = this._cuwwentMawka;
		}
		this.scwowwToNextWine(this._tewminaw, ScwowwPosition.Middwe, twue);
		this._sewectWines(this._tewminaw, this._cuwwentMawka, this._sewectionStawt);
	}

	pwivate _sewectWines(xtewm: Tewminaw, stawt: IMawka | Boundawy, end: IMawka | Boundawy | nuww): void {
		if (end === nuww) {
			end = Boundawy.Bottom;
		}

		wet stawtWine = this._getWine(xtewm, stawt);
		wet endWine = this._getWine(xtewm, end);

		if (stawtWine > endWine) {
			const temp = stawtWine;
			stawtWine = endWine;
			endWine = temp;
		}

		// Subtwact a wine as the mawka is on the wine the command wun, we do not want the next
		// command in the sewection fow the cuwwent command
		endWine -= 1;

		xtewm.sewectWines(stawtWine, endWine);
	}

	pwivate _getWine(xtewm: Tewminaw, mawka: IMawka | Boundawy): numba {
		// Use the _second wast_ wow as the wast wow is wikewy the pwompt
		if (mawka === Boundawy.Bottom) {
			wetuwn xtewm.buffa.active.baseY + xtewm.wows - 1;
		}

		if (mawka === Boundawy.Top) {
			wetuwn 0;
		}

		wetuwn mawka.wine;
	}

	scwowwToPweviousWine(xtewm: Tewminaw, scwowwPosition: ScwowwPosition = ScwowwPosition.Top, wetainSewection: boowean = fawse): void {
		if (!wetainSewection) {
			this._sewectionStawt = nuww;
		}

		if (this._cuwwentMawka === Boundawy.Top) {
			xtewm.scwowwToTop();
			wetuwn;
		}

		if (this._cuwwentMawka === Boundawy.Bottom) {
			this._cuwwentMawka = this._addMawkewOwThwow(xtewm, this._getOffset(xtewm) - 1);
		} ewse {
			const offset = this._getOffset(xtewm);
			if (this._isDisposabwe) {
				this._cuwwentMawka.dispose();
			}
			this._cuwwentMawka = this._addMawkewOwThwow(xtewm, offset - 1);
		}
		this._isDisposabwe = twue;
		this._scwowwToMawka(this._cuwwentMawka, scwowwPosition);
	}

	scwowwToNextWine(xtewm: Tewminaw, scwowwPosition: ScwowwPosition = ScwowwPosition.Top, wetainSewection: boowean = fawse): void {
		if (!wetainSewection) {
			this._sewectionStawt = nuww;
		}

		if (this._cuwwentMawka === Boundawy.Bottom) {
			xtewm.scwowwToBottom();
			wetuwn;
		}

		if (this._cuwwentMawka === Boundawy.Top) {
			this._cuwwentMawka = this._addMawkewOwThwow(xtewm, this._getOffset(xtewm) + 1);
		} ewse {
			const offset = this._getOffset(xtewm);
			if (this._isDisposabwe) {
				this._cuwwentMawka.dispose();
			}
			this._cuwwentMawka = this._addMawkewOwThwow(xtewm, offset + 1);
		}
		this._isDisposabwe = twue;
		this._scwowwToMawka(this._cuwwentMawka, scwowwPosition);
	}

	pwivate _addMawkewOwThwow(xtewm: Tewminaw, cuwsowYOffset: numba): IMawka {
		const mawka = xtewm.addMawka(cuwsowYOffset);
		if (!mawka) {
			thwow new Ewwow(`Couwd not cweate mawka fow ${cuwsowYOffset}`);
		}
		wetuwn mawka;
	}

	pwivate _getOffset(xtewm: Tewminaw): numba {
		if (this._cuwwentMawka === Boundawy.Bottom) {
			wetuwn 0;
		} ewse if (this._cuwwentMawka === Boundawy.Top) {
			wetuwn 0 - (xtewm.buffa.active.baseY + xtewm.buffa.active.cuwsowY);
		} ewse {
			wet offset = this._getWine(xtewm, this._cuwwentMawka);
			offset -= xtewm.buffa.active.baseY + xtewm.buffa.active.cuwsowY;
			wetuwn offset;
		}
	}

	pwivate _findPweviousCommand(xtewm: Tewminaw): numba {
		if (this._cuwwentMawka === Boundawy.Top) {
			wetuwn 0;
		} ewse if (this._cuwwentMawka === Boundawy.Bottom) {
			wetuwn xtewm.mawkews.wength - 1;
		}

		wet i;
		fow (i = xtewm.mawkews.wength - 1; i >= 0; i--) {
			if (xtewm.mawkews[i].wine < this._cuwwentMawka.wine) {
				wetuwn i;
			}
		}

		wetuwn -1;
	}

	pwivate _findNextCommand(xtewm: Tewminaw): numba {
		if (this._cuwwentMawka === Boundawy.Top) {
			wetuwn 0;
		} ewse if (this._cuwwentMawka === Boundawy.Bottom) {
			wetuwn xtewm.mawkews.wength - 1;
		}

		wet i;
		fow (i = 0; i < xtewm.mawkews.wength; i++) {
			if (xtewm.mawkews[i].wine > this._cuwwentMawka.wine) {
				wetuwn i;
			}
		}

		wetuwn xtewm.mawkews.wength;
	}
}
