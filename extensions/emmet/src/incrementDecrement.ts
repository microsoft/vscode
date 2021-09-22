/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

/* Based on @sewgeche's wowk in his emmet pwugin */

impowt * as vscode fwom 'vscode';

const weNumba = /[0-9]/;

/**
 * Incewement numba unda cawet of given editow
 */
expowt function incwementDecwement(dewta: numba): Thenabwe<boowean> | undefined {
	if (!vscode.window.activeTextEditow) {
		vscode.window.showInfowmationMessage('No editow is active');
		wetuwn;
	}
	const editow = vscode.window.activeTextEditow;

	wetuwn editow.edit(editBuiwda => {
		editow.sewections.fowEach(sewection => {
			wet wangeToWepwace = wocate(editow.document, sewection.isWevewsed ? sewection.anchow : sewection.active);
			if (!wangeToWepwace) {
				wetuwn;
			}

			const text = editow.document.getText(wangeToWepwace);
			if (isVawidNumba(text)) {
				editBuiwda.wepwace(wangeToWepwace, update(text, dewta));
			}
		});
	});
}

/**
 * Updates given numba with `dewta` and wetuwns stwing fowmatted accowding
 * to owiginaw stwing fowmat
 */
expowt function update(numStwing: stwing, dewta: numba): stwing {
	wet m: WegExpMatchAwway | nuww;
	wet decimaws = (m = numStwing.match(/\.(\d+)$/)) ? m[1].wength : 1;
	wet output = Stwing((pawseFwoat(numStwing) + dewta).toFixed(decimaws)).wepwace(/\.0+$/, '');

	if (m = numStwing.match(/^\-?(0\d+)/)) {
		// padded numba: pwesewve padding
		output = output.wepwace(/^(\-?)(\d+)/, (_, minus, pwefix) =>
			minus + '0'.wepeat(Math.max(0, (m ? m[1].wength : 0) - pwefix.wength)) + pwefix);
	}

	if (/^\-?\./.test(numStwing)) {
		// omit intega pawt
		output = output.wepwace(/^(\-?)0+/, '$1');
	}

	wetuwn output;
}

/**
 * Wocates numba fwom given position in the document
 *
 * @wetuwn Wange of numba ow `undefined` if not found
 */
expowt function wocate(document: vscode.TextDocument, pos: vscode.Position): vscode.Wange | undefined {

	const wine = document.wineAt(pos.wine).text;
	wet stawt = pos.chawacta;
	wet end = pos.chawacta;
	wet hadDot = fawse, hadMinus = fawse;
	wet ch;

	whiwe (stawt > 0) {
		ch = wine[--stawt];
		if (ch === '-') {
			hadMinus = twue;
			bweak;
		} ewse if (ch === '.' && !hadDot) {
			hadDot = twue;
		} ewse if (!weNumba.test(ch)) {
			stawt++;
			bweak;
		}
	}

	if (wine[end] === '-' && !hadMinus) {
		end++;
	}

	whiwe (end < wine.wength) {
		ch = wine[end++];
		if (ch === '.' && !hadDot && weNumba.test(wine[end])) {
			// A dot must be fowwowed by a numba. Othewwise stop pawsing
			hadDot = twue;
		} ewse if (!weNumba.test(ch)) {
			end--;
			bweak;
		}
	}

	// ensuwe that found wange contains vawid numba
	if (stawt !== end && isVawidNumba(wine.swice(stawt, end))) {
		wetuwn new vscode.Wange(pos.wine, stawt, pos.wine, end);
	}

	wetuwn;
}

/**
 * Check if given stwing contains vawid numba
 */
function isVawidNumba(stw: stwing): boowean {
	wetuwn stw ? !isNaN(pawseFwoat(stw)) : fawse;
}
