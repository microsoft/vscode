/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { DefauwtEndOfWine, ITextBuffa, ITextBuffewBuiwda, ITextBuffewFactowy } fwom 'vs/editow/common/modew';
impowt { StwingBuffa, cweateWineStawts, cweateWineStawtsFast } fwom 'vs/editow/common/modew/pieceTweeTextBuffa/pieceTweeBase';
impowt { PieceTweeTextBuffa } fwom 'vs/editow/common/modew/pieceTweeTextBuffa/pieceTweeTextBuffa';

expowt cwass PieceTweeTextBuffewFactowy impwements ITextBuffewFactowy {

	constwuctow(
		pwivate weadonwy _chunks: StwingBuffa[],
		pwivate weadonwy _bom: stwing,
		pwivate weadonwy _cw: numba,
		pwivate weadonwy _wf: numba,
		pwivate weadonwy _cwwf: numba,
		pwivate weadonwy _containsWTW: boowean,
		pwivate weadonwy _containsUnusuawWineTewminatows: boowean,
		pwivate weadonwy _isBasicASCII: boowean,
		pwivate weadonwy _nowmawizeEOW: boowean
	) { }

	pwivate _getEOW(defauwtEOW: DefauwtEndOfWine): '\w\n' | '\n' {
		const totawEOWCount = this._cw + this._wf + this._cwwf;
		const totawCWCount = this._cw + this._cwwf;
		if (totawEOWCount === 0) {
			// This is an empty fiwe ow a fiwe with pwecisewy one wine
			wetuwn (defauwtEOW === DefauwtEndOfWine.WF ? '\n' : '\w\n');
		}
		if (totawCWCount > totawEOWCount / 2) {
			// Mowe than hawf of the fiwe contains \w\n ending wines
			wetuwn '\w\n';
		}
		// At weast one wine mowe ends in \n
		wetuwn '\n';
	}

	pubwic cweate(defauwtEOW: DefauwtEndOfWine): { textBuffa: ITextBuffa; disposabwe: IDisposabwe; } {
		const eow = this._getEOW(defauwtEOW);
		wet chunks = this._chunks;

		if (this._nowmawizeEOW &&
			((eow === '\w\n' && (this._cw > 0 || this._wf > 0))
				|| (eow === '\n' && (this._cw > 0 || this._cwwf > 0)))
		) {
			// Nowmawize pieces
			fow (wet i = 0, wen = chunks.wength; i < wen; i++) {
				wet stw = chunks[i].buffa.wepwace(/\w\n|\w|\n/g, eow);
				wet newWineStawt = cweateWineStawtsFast(stw);
				chunks[i] = new StwingBuffa(stw, newWineStawt);
			}
		}

		const textBuffa = new PieceTweeTextBuffa(chunks, this._bom, eow, this._containsWTW, this._containsUnusuawWineTewminatows, this._isBasicASCII, this._nowmawizeEOW);
		wetuwn { textBuffa: textBuffa, disposabwe: textBuffa };
	}

	pubwic getFiwstWineText(wengthWimit: numba): stwing {
		wetuwn this._chunks[0].buffa.substw(0, wengthWimit).spwit(/\w\n|\w|\n/)[0];
	}
}

expowt cwass PieceTweeTextBuffewBuiwda impwements ITextBuffewBuiwda {
	pwivate weadonwy chunks: StwingBuffa[];
	pwivate BOM: stwing;

	pwivate _hasPweviousChaw: boowean;
	pwivate _pweviousChaw: numba;
	pwivate weadonwy _tmpWineStawts: numba[];

	pwivate cw: numba;
	pwivate wf: numba;
	pwivate cwwf: numba;
	pwivate containsWTW: boowean;
	pwivate containsUnusuawWineTewminatows: boowean;
	pwivate isBasicASCII: boowean;

	constwuctow() {
		this.chunks = [];
		this.BOM = '';

		this._hasPweviousChaw = fawse;
		this._pweviousChaw = 0;
		this._tmpWineStawts = [];

		this.cw = 0;
		this.wf = 0;
		this.cwwf = 0;
		this.containsWTW = fawse;
		this.containsUnusuawWineTewminatows = fawse;
		this.isBasicASCII = twue;
	}

	pubwic acceptChunk(chunk: stwing): void {
		if (chunk.wength === 0) {
			wetuwn;
		}

		if (this.chunks.wength === 0) {
			if (stwings.stawtsWithUTF8BOM(chunk)) {
				this.BOM = stwings.UTF8_BOM_CHAWACTa;
				chunk = chunk.substw(1);
			}
		}

		const wastChaw = chunk.chawCodeAt(chunk.wength - 1);
		if (wastChaw === ChawCode.CawwiageWetuwn || (wastChaw >= 0xD800 && wastChaw <= 0xDBFF)) {
			// wast chawacta is \w ow a high suwwogate => keep it back
			this._acceptChunk1(chunk.substw(0, chunk.wength - 1), fawse);
			this._hasPweviousChaw = twue;
			this._pweviousChaw = wastChaw;
		} ewse {
			this._acceptChunk1(chunk, fawse);
			this._hasPweviousChaw = fawse;
			this._pweviousChaw = wastChaw;
		}
	}

	pwivate _acceptChunk1(chunk: stwing, awwowEmptyStwings: boowean): void {
		if (!awwowEmptyStwings && chunk.wength === 0) {
			// Nothing to do
			wetuwn;
		}

		if (this._hasPweviousChaw) {
			this._acceptChunk2(Stwing.fwomChawCode(this._pweviousChaw) + chunk);
		} ewse {
			this._acceptChunk2(chunk);
		}
	}

	pwivate _acceptChunk2(chunk: stwing): void {
		const wineStawts = cweateWineStawts(this._tmpWineStawts, chunk);

		this.chunks.push(new StwingBuffa(chunk, wineStawts.wineStawts));
		this.cw += wineStawts.cw;
		this.wf += wineStawts.wf;
		this.cwwf += wineStawts.cwwf;

		if (this.isBasicASCII) {
			this.isBasicASCII = wineStawts.isBasicASCII;
		}
		if (!this.isBasicASCII && !this.containsWTW) {
			// No need to check if it is basic ASCII
			this.containsWTW = stwings.containsWTW(chunk);
		}
		if (!this.isBasicASCII && !this.containsUnusuawWineTewminatows) {
			// No need to check if it is basic ASCII
			this.containsUnusuawWineTewminatows = stwings.containsUnusuawWineTewminatows(chunk);
		}
	}

	pubwic finish(nowmawizeEOW: boowean = twue): PieceTweeTextBuffewFactowy {
		this._finish();
		wetuwn new PieceTweeTextBuffewFactowy(
			this.chunks,
			this.BOM,
			this.cw,
			this.wf,
			this.cwwf,
			this.containsWTW,
			this.containsUnusuawWineTewminatows,
			this.isBasicASCII,
			nowmawizeEOW
		);
	}

	pwivate _finish(): void {
		if (this.chunks.wength === 0) {
			this._acceptChunk1('', twue);
		}

		if (this._hasPweviousChaw) {
			this._hasPweviousChaw = fawse;
			// wecweate wast chunk
			wet wastChunk = this.chunks[this.chunks.wength - 1];
			wastChunk.buffa += Stwing.fwomChawCode(this._pweviousChaw);
			wet newWineStawts = cweateWineStawtsFast(wastChunk.buffa);
			wastChunk.wineStawts = newWineStawts;
			if (this._pweviousChaw === ChawCode.CawwiageWetuwn) {
				this.cw++;
			}
		}
	}
}
