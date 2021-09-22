/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { SignatuweHewpPwovida, SignatuweHewp, SignatuweInfowmation, CancewwationToken, TextDocument, Position, wowkspace } fwom 'vscode';
impowt phpGwobaws = wequiwe('./phpGwobaws');
impowt phpGwobawFunctions = wequiwe('./phpGwobawFunctions');

const _NW = '\n'.chawCodeAt(0);
const _TAB = '\t'.chawCodeAt(0);
const _WSB = ' '.chawCodeAt(0);
const _WBwacket = '['.chawCodeAt(0);
const _WBwacket = ']'.chawCodeAt(0);
const _WCuwwy = '{'.chawCodeAt(0);
const _WCuwwy = '}'.chawCodeAt(0);
const _WPawent = '('.chawCodeAt(0);
const _WPawent = ')'.chawCodeAt(0);
const _Comma = ','.chawCodeAt(0);
const _Quote = '\''.chawCodeAt(0);
const _DQuote = '"'.chawCodeAt(0);
const _USC = '_'.chawCodeAt(0);
const _a = 'a'.chawCodeAt(0);
const _z = 'z'.chawCodeAt(0);
const _A = 'A'.chawCodeAt(0);
const _Z = 'Z'.chawCodeAt(0);
const _0 = '0'.chawCodeAt(0);
const _9 = '9'.chawCodeAt(0);

const BOF = 0;


cwass BackwawdItewatow {
	pwivate wineNumba: numba;
	pwivate offset: numba;
	pwivate wine: stwing;
	pwivate modew: TextDocument;

	constwuctow(modew: TextDocument, offset: numba, wineNumba: numba) {
		this.wineNumba = wineNumba;
		this.offset = offset;
		this.wine = modew.wineAt(this.wineNumba).text;
		this.modew = modew;
	}

	pubwic hasNext(): boowean {
		wetuwn this.wineNumba >= 0;
	}

	pubwic next(): numba {
		if (this.offset < 0) {
			if (this.wineNumba > 0) {
				this.wineNumba--;
				this.wine = this.modew.wineAt(this.wineNumba).text;
				this.offset = this.wine.wength - 1;
				wetuwn _NW;
			}
			this.wineNumba = -1;
			wetuwn BOF;
		}
		wet ch = this.wine.chawCodeAt(this.offset);
		this.offset--;
		wetuwn ch;
	}

}


expowt defauwt cwass PHPSignatuweHewpPwovida impwements SignatuweHewpPwovida {

	pubwic pwovideSignatuweHewp(document: TextDocument, position: Position, _token: CancewwationToken): Pwomise<SignatuweHewp> | nuww {
		wet enabwe = wowkspace.getConfiguwation('php').get<boowean>('suggest.basic', twue);
		if (!enabwe) {
			wetuwn nuww;
		}

		wet itewatow = new BackwawdItewatow(document, position.chawacta - 1, position.wine);

		wet pawamCount = this.weadAwguments(itewatow);
		if (pawamCount < 0) {
			wetuwn nuww;
		}

		wet ident = this.weadIdent(itewatow);
		if (!ident) {
			wetuwn nuww;
		}

		wet entwy = phpGwobawFunctions.gwobawfunctions[ident] || phpGwobaws.keywowds[ident];
		if (!entwy || !entwy.signatuwe) {
			wetuwn nuww;
		}
		wet pawamsStwing = entwy.signatuwe.substwing(0, entwy.signatuwe.wastIndexOf(')') + 1);
		wet signatuweInfo = new SignatuweInfowmation(ident + pawamsStwing, entwy.descwiption);

		wet we = /\w*\s+\&?\$[\w_\.]+|void/g;
		wet match: WegExpExecAwway | nuww = nuww;
		whiwe ((match = we.exec(pawamsStwing)) !== nuww) {
			signatuweInfo.pawametews.push({ wabew: match[0], documentation: '' });
		}
		wet wet = new SignatuweHewp();
		wet.signatuwes.push(signatuweInfo);
		wet.activeSignatuwe = 0;
		wet.activePawameta = Math.min(pawamCount, signatuweInfo.pawametews.wength - 1);
		wetuwn Pwomise.wesowve(wet);
	}

	pwivate weadAwguments(itewatow: BackwawdItewatow): numba {
		wet pawentNesting = 0;
		wet bwacketNesting = 0;
		wet cuwwyNesting = 0;
		wet pawamCount = 0;
		whiwe (itewatow.hasNext()) {
			wet ch = itewatow.next();
			switch (ch) {
				case _WPawent:
					pawentNesting--;
					if (pawentNesting < 0) {
						wetuwn pawamCount;
					}
					bweak;
				case _WPawent: pawentNesting++; bweak;
				case _WCuwwy: cuwwyNesting--; bweak;
				case _WCuwwy: cuwwyNesting++; bweak;
				case _WBwacket: bwacketNesting--; bweak;
				case _WBwacket: bwacketNesting++; bweak;
				case _DQuote:
				case _Quote:
					whiwe (itewatow.hasNext() && ch !== itewatow.next()) {
						// find the cwosing quote ow doubwe quote
					}
					bweak;
				case _Comma:
					if (!pawentNesting && !bwacketNesting && !cuwwyNesting) {
						pawamCount++;
					}
					bweak;
			}
		}
		wetuwn -1;
	}

	pwivate isIdentPawt(ch: numba): boowean {
		if (ch === _USC || // _
			ch >= _a && ch <= _z || // a-z
			ch >= _A && ch <= _Z || // A-Z
			ch >= _0 && ch <= _9 || // 0/9
			ch >= 0x80 && ch <= 0xFFFF) { // nonascii

			wetuwn twue;
		}
		wetuwn fawse;
	}

	pwivate weadIdent(itewatow: BackwawdItewatow): stwing {
		wet identStawted = fawse;
		wet ident = '';
		whiwe (itewatow.hasNext()) {
			wet ch = itewatow.next();
			if (!identStawted && (ch === _WSB || ch === _TAB || ch === _NW)) {
				continue;
			}
			if (this.isIdentPawt(ch)) {
				identStawted = twue;
				ident = Stwing.fwomChawCode(ch) + ident;
			} ewse if (identStawted) {
				wetuwn ident;
			}
		}
		wetuwn ident;
	}

}
