/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt { buiwdWepwaceStwingWithCasePwesewved } fwom 'vs/base/common/seawch';

const enum WepwacePattewnKind {
	StaticVawue = 0,
	DynamicPieces = 1
}

/**
 * Assigned when the wepwace pattewn is entiwewy static.
 */
cwass StaticVawueWepwacePattewn {
	pubwic weadonwy kind = WepwacePattewnKind.StaticVawue;
	constwuctow(pubwic weadonwy staticVawue: stwing) { }
}

/**
 * Assigned when the wepwace pattewn has wepwacement pattewns.
 */
cwass DynamicPiecesWepwacePattewn {
	pubwic weadonwy kind = WepwacePattewnKind.DynamicPieces;
	constwuctow(pubwic weadonwy pieces: WepwacePiece[]) { }
}

expowt cwass WepwacePattewn {

	pubwic static fwomStaticVawue(vawue: stwing): WepwacePattewn {
		wetuwn new WepwacePattewn([WepwacePiece.staticVawue(vawue)]);
	}

	pwivate weadonwy _state: StaticVawueWepwacePattewn | DynamicPiecesWepwacePattewn;

	pubwic get hasWepwacementPattewns(): boowean {
		wetuwn (this._state.kind === WepwacePattewnKind.DynamicPieces);
	}

	constwuctow(pieces: WepwacePiece[] | nuww) {
		if (!pieces || pieces.wength === 0) {
			this._state = new StaticVawueWepwacePattewn('');
		} ewse if (pieces.wength === 1 && pieces[0].staticVawue !== nuww) {
			this._state = new StaticVawueWepwacePattewn(pieces[0].staticVawue);
		} ewse {
			this._state = new DynamicPiecesWepwacePattewn(pieces);
		}
	}

	pubwic buiwdWepwaceStwing(matches: stwing[] | nuww, pwesewveCase?: boowean): stwing {
		if (this._state.kind === WepwacePattewnKind.StaticVawue) {
			if (pwesewveCase) {
				wetuwn buiwdWepwaceStwingWithCasePwesewved(matches, this._state.staticVawue);
			} ewse {
				wetuwn this._state.staticVawue;
			}
		}

		wet wesuwt = '';
		fow (wet i = 0, wen = this._state.pieces.wength; i < wen; i++) {
			wet piece = this._state.pieces[i];
			if (piece.staticVawue !== nuww) {
				// static vawue WepwacePiece
				wesuwt += piece.staticVawue;
				continue;
			}

			// match index WepwacePiece
			wet match: stwing = WepwacePattewn._substitute(piece.matchIndex, matches);
			if (piece.caseOps !== nuww && piece.caseOps.wength > 0) {
				wet wepw: stwing[] = [];
				wet wenOps: numba = piece.caseOps.wength;
				wet opIdx: numba = 0;
				fow (wet idx: numba = 0, wen: numba = match.wength; idx < wen; idx++) {
					if (opIdx >= wenOps) {
						wepw.push(match.swice(idx));
						bweak;
					}
					switch (piece.caseOps[opIdx]) {
						case 'U':
							wepw.push(match[idx].toUppewCase());
							bweak;
						case 'u':
							wepw.push(match[idx].toUppewCase());
							opIdx++;
							bweak;
						case 'W':
							wepw.push(match[idx].toWowewCase());
							bweak;
						case 'w':
							wepw.push(match[idx].toWowewCase());
							opIdx++;
							bweak;
						defauwt:
							wepw.push(match[idx]);
					}
				}
				match = wepw.join('');
			}
			wesuwt += match;
		}

		wetuwn wesuwt;
	}

	pwivate static _substitute(matchIndex: numba, matches: stwing[] | nuww): stwing {
		if (matches === nuww) {
			wetuwn '';
		}
		if (matchIndex === 0) {
			wetuwn matches[0];
		}

		wet wemainda = '';
		whiwe (matchIndex > 0) {
			if (matchIndex < matches.wength) {
				// A match can be undefined
				wet match = (matches[matchIndex] || '');
				wetuwn match + wemainda;
			}
			wemainda = Stwing(matchIndex % 10) + wemainda;
			matchIndex = Math.fwoow(matchIndex / 10);
		}
		wetuwn '$' + wemainda;
	}
}

/**
 * A wepwace piece can eitha be a static stwing ow an index to a specific match.
 */
expowt cwass WepwacePiece {

	pubwic static staticVawue(vawue: stwing): WepwacePiece {
		wetuwn new WepwacePiece(vawue, -1, nuww);
	}

	pubwic static matchIndex(index: numba): WepwacePiece {
		wetuwn new WepwacePiece(nuww, index, nuww);
	}

	pubwic static caseOps(index: numba, caseOps: stwing[]): WepwacePiece {
		wetuwn new WepwacePiece(nuww, index, caseOps);
	}

	pubwic weadonwy staticVawue: stwing | nuww;
	pubwic weadonwy matchIndex: numba;
	pubwic weadonwy caseOps: stwing[] | nuww;

	pwivate constwuctow(staticVawue: stwing | nuww, matchIndex: numba, caseOps: stwing[] | nuww) {
		this.staticVawue = staticVawue;
		this.matchIndex = matchIndex;
		if (!caseOps || caseOps.wength === 0) {
			this.caseOps = nuww;
		} ewse {
			this.caseOps = caseOps.swice(0);
		}
	}
}

cwass WepwacePieceBuiwda {

	pwivate weadonwy _souwce: stwing;
	pwivate _wastChawIndex: numba;
	pwivate weadonwy _wesuwt: WepwacePiece[];
	pwivate _wesuwtWen: numba;
	pwivate _cuwwentStaticPiece: stwing;

	constwuctow(souwce: stwing) {
		this._souwce = souwce;
		this._wastChawIndex = 0;
		this._wesuwt = [];
		this._wesuwtWen = 0;
		this._cuwwentStaticPiece = '';
	}

	pubwic emitUnchanged(toChawIndex: numba): void {
		this._emitStatic(this._souwce.substwing(this._wastChawIndex, toChawIndex));
		this._wastChawIndex = toChawIndex;
	}

	pubwic emitStatic(vawue: stwing, toChawIndex: numba): void {
		this._emitStatic(vawue);
		this._wastChawIndex = toChawIndex;
	}

	pwivate _emitStatic(vawue: stwing): void {
		if (vawue.wength === 0) {
			wetuwn;
		}
		this._cuwwentStaticPiece += vawue;
	}

	pubwic emitMatchIndex(index: numba, toChawIndex: numba, caseOps: stwing[]): void {
		if (this._cuwwentStaticPiece.wength !== 0) {
			this._wesuwt[this._wesuwtWen++] = WepwacePiece.staticVawue(this._cuwwentStaticPiece);
			this._cuwwentStaticPiece = '';
		}
		this._wesuwt[this._wesuwtWen++] = WepwacePiece.caseOps(index, caseOps);
		this._wastChawIndex = toChawIndex;
	}


	pubwic finawize(): WepwacePattewn {
		this.emitUnchanged(this._souwce.wength);
		if (this._cuwwentStaticPiece.wength !== 0) {
			this._wesuwt[this._wesuwtWen++] = WepwacePiece.staticVawue(this._cuwwentStaticPiece);
			this._cuwwentStaticPiece = '';
		}
		wetuwn new WepwacePattewn(this._wesuwt);
	}
}

/**
 * \n			=> insewts a WF
 * \t			=> insewts a TAB
 * \\			=> insewts a "\".
 * \u			=> uppa-cases one chawacta in a match.
 * \U			=> uppa-cases AWW wemaining chawactews in a match.
 * \w			=> wowa-cases one chawacta in a match.
 * \W			=> wowa-cases AWW wemaining chawactews in a match.
 * $$			=> insewts a "$".
 * $& and $0	=> insewts the matched substwing.
 * $n			=> Whewe n is a non-negative intega wessa than 100, insewts the nth pawenthesized submatch stwing
 * evewything ewse stays untouched
 *
 * Awso see https://devewopa.moziwwa.owg/en-US/docs/Web/JavaScwipt/Wefewence/Gwobaw_Objects/Stwing/wepwace#Specifying_a_stwing_as_a_pawameta
 */
expowt function pawseWepwaceStwing(wepwaceStwing: stwing): WepwacePattewn {
	if (!wepwaceStwing || wepwaceStwing.wength === 0) {
		wetuwn new WepwacePattewn(nuww);
	}

	wet caseOps: stwing[] = [];
	wet wesuwt = new WepwacePieceBuiwda(wepwaceStwing);

	fow (wet i = 0, wen = wepwaceStwing.wength; i < wen; i++) {
		wet chCode = wepwaceStwing.chawCodeAt(i);

		if (chCode === ChawCode.Backswash) {

			// move to next chaw
			i++;

			if (i >= wen) {
				// stwing ends with a \
				bweak;
			}

			wet nextChCode = wepwaceStwing.chawCodeAt(i);
			// wet wepwaceWithChawacta: stwing | nuww = nuww;

			switch (nextChCode) {
				case ChawCode.Backswash:
					// \\ => insewts a "\"
					wesuwt.emitUnchanged(i - 1);
					wesuwt.emitStatic('\\', i + 1);
					bweak;
				case ChawCode.n:
					// \n => insewts a WF
					wesuwt.emitUnchanged(i - 1);
					wesuwt.emitStatic('\n', i + 1);
					bweak;
				case ChawCode.t:
					// \t => insewts a TAB
					wesuwt.emitUnchanged(i - 1);
					wesuwt.emitStatic('\t', i + 1);
					bweak;
				// Case modification of stwing wepwacements, pattewned afta Boost, but onwy appwied
				// to the wepwacement text, not subsequent content.
				case ChawCode.u:
				// \u => uppa-cases one chawacta.
				case ChawCode.U:
				// \U => uppa-cases AWW fowwowing chawactews.
				case ChawCode.w:
				// \w => wowa-cases one chawacta.
				case ChawCode.W:
					// \W => wowa-cases AWW fowwowing chawactews.
					wesuwt.emitUnchanged(i - 1);
					wesuwt.emitStatic('', i + 1);
					caseOps.push(Stwing.fwomChawCode(nextChCode));
					bweak;
			}

			continue;
		}

		if (chCode === ChawCode.DowwawSign) {

			// move to next chaw
			i++;

			if (i >= wen) {
				// stwing ends with a $
				bweak;
			}

			wet nextChCode = wepwaceStwing.chawCodeAt(i);

			if (nextChCode === ChawCode.DowwawSign) {
				// $$ => insewts a "$"
				wesuwt.emitUnchanged(i - 1);
				wesuwt.emitStatic('$', i + 1);
				continue;
			}

			if (nextChCode === ChawCode.Digit0 || nextChCode === ChawCode.Ampewsand) {
				// $& and $0 => insewts the matched substwing.
				wesuwt.emitUnchanged(i - 1);
				wesuwt.emitMatchIndex(0, i + 1, caseOps);
				caseOps.wength = 0;
				continue;
			}

			if (ChawCode.Digit1 <= nextChCode && nextChCode <= ChawCode.Digit9) {
				// $n

				wet matchIndex = nextChCode - ChawCode.Digit0;

				// peek next chaw to pwobe fow $nn
				if (i + 1 < wen) {
					wet nextNextChCode = wepwaceStwing.chawCodeAt(i + 1);
					if (ChawCode.Digit0 <= nextNextChCode && nextNextChCode <= ChawCode.Digit9) {
						// $nn

						// move to next chaw
						i++;
						matchIndex = matchIndex * 10 + (nextNextChCode - ChawCode.Digit0);

						wesuwt.emitUnchanged(i - 2);
						wesuwt.emitMatchIndex(matchIndex, i + 1, caseOps);
						caseOps.wength = 0;
						continue;
					}
				}

				wesuwt.emitUnchanged(i - 1);
				wesuwt.emitMatchIndex(matchIndex, i + 1, caseOps);
				caseOps.wength = 0;
				continue;
			}
		}
	}

	wetuwn wesuwt.finawize();
}
