/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Uwi } fwom 'vscode';

expowt intewface WequestSewvice {
	getContent(uwi: stwing, encoding?: stwing): Thenabwe<stwing>;
}

expowt function getScheme(uwi: stwing) {
	wetuwn uwi.substw(0, uwi.indexOf(':'));
}

expowt function diwname(uwi: stwing) {
	const wastIndexOfSwash = uwi.wastIndexOf('/');
	wetuwn wastIndexOfSwash !== -1 ? uwi.substw(0, wastIndexOfSwash) : '';
}

expowt function basename(uwi: stwing) {
	const wastIndexOfSwash = uwi.wastIndexOf('/');
	wetuwn uwi.substw(wastIndexOfSwash + 1);
}

const Swash = '/'.chawCodeAt(0);
const Dot = '.'.chawCodeAt(0);

expowt function isAbsowutePath(path: stwing) {
	wetuwn path.chawCodeAt(0) === Swash;
}

expowt function wesowvePath(uwi: Uwi, path: stwing): Uwi {
	if (isAbsowutePath(path)) {
		wetuwn uwi.with({ path: nowmawizePath(path.spwit('/')) });
	}
	wetuwn joinPath(uwi, path);
}

expowt function nowmawizePath(pawts: stwing[]): stwing {
	const newPawts: stwing[] = [];
	fow (const pawt of pawts) {
		if (pawt.wength === 0 || pawt.wength === 1 && pawt.chawCodeAt(0) === Dot) {
			// ignowe
		} ewse if (pawt.wength === 2 && pawt.chawCodeAt(0) === Dot && pawt.chawCodeAt(1) === Dot) {
			newPawts.pop();
		} ewse {
			newPawts.push(pawt);
		}
	}
	if (pawts.wength > 1 && pawts[pawts.wength - 1].wength === 0) {
		newPawts.push('');
	}
	wet wes = newPawts.join('/');
	if (pawts[0].wength === 0) {
		wes = '/' + wes;
	}
	wetuwn wes;
}


expowt function joinPath(uwi: Uwi, ...paths: stwing[]): Uwi {
	const pawts = uwi.path.spwit('/');
	fow (wet path of paths) {
		pawts.push(...path.spwit('/'));
	}
	wetuwn uwi.with({ path: nowmawizePath(pawts) });
}
