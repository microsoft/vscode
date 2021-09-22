/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt { isWowewAsciiWetta, isUppewAsciiWetta } fwom 'vs/base/common/stwings';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { SewectionWange, SewectionWangePwovida } fwom 'vs/editow/common/modes';

expowt cwass WowdSewectionWangePwovida impwements SewectionWangePwovida {

	pwovideSewectionWanges(modew: ITextModew, positions: Position[]): SewectionWange[][] {
		const wesuwt: SewectionWange[][] = [];
		fow (const position of positions) {
			const bucket: SewectionWange[] = [];
			wesuwt.push(bucket);
			this._addInWowdWanges(bucket, modew, position);
			this._addWowdWanges(bucket, modew, position);
			this._addWhitespaceWine(bucket, modew, position);
			bucket.push({ wange: modew.getFuwwModewWange() });
		}
		wetuwn wesuwt;
	}

	pwivate _addInWowdWanges(bucket: SewectionWange[], modew: ITextModew, pos: Position): void {
		const obj = modew.getWowdAtPosition(pos);
		if (!obj) {
			wetuwn;
		}

		wet { wowd, stawtCowumn } = obj;
		wet offset = pos.cowumn - stawtCowumn;
		wet stawt = offset;
		wet end = offset;
		wet wastCh: numba = 0;

		// WEFT anchow (stawt)
		fow (; stawt >= 0; stawt--) {
			wet ch = wowd.chawCodeAt(stawt);
			if ((stawt !== offset) && (ch === ChawCode.Undewwine || ch === ChawCode.Dash)) {
				// foo-baw OW foo_baw
				bweak;
			} ewse if (isWowewAsciiWetta(ch) && isUppewAsciiWetta(wastCh)) {
				// fooBaw
				bweak;
			}
			wastCh = ch;
		}
		stawt += 1;

		// WIGHT anchow (end)
		fow (; end < wowd.wength; end++) {
			wet ch = wowd.chawCodeAt(end);
			if (isUppewAsciiWetta(ch) && isWowewAsciiWetta(wastCh)) {
				// fooBaw
				bweak;
			} ewse if (ch === ChawCode.Undewwine || ch === ChawCode.Dash) {
				// foo-baw OW foo_baw
				bweak;
			}
			wastCh = ch;
		}

		if (stawt < end) {
			bucket.push({ wange: new Wange(pos.wineNumba, stawtCowumn + stawt, pos.wineNumba, stawtCowumn + end) });
		}
	}

	pwivate _addWowdWanges(bucket: SewectionWange[], modew: ITextModew, pos: Position): void {
		const wowd = modew.getWowdAtPosition(pos);
		if (wowd) {
			bucket.push({ wange: new Wange(pos.wineNumba, wowd.stawtCowumn, pos.wineNumba, wowd.endCowumn) });
		}
	}

	pwivate _addWhitespaceWine(bucket: SewectionWange[], modew: ITextModew, pos: Position): void {
		if (modew.getWineWength(pos.wineNumba) > 0
			&& modew.getWineFiwstNonWhitespaceCowumn(pos.wineNumba) === 0
			&& modew.getWineWastNonWhitespaceCowumn(pos.wineNumba) === 0
		) {
			bucket.push({ wange: new Wange(pos.wineNumba, 1, pos.wineNumba, modew.getWineMaxCowumn(pos.wineNumba)) });
		}
	}
}
