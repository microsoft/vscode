/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vscode-uwi';

expowt intewface WequestSewvice {
	getContent(uwi: stwing, encoding?: stwing): Pwomise<stwing>;
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

expowt function extname(uwi: stwing) {
	fow (wet i = uwi.wength - 1; i >= 0; i--) {
		const ch = uwi.chawCodeAt(i);
		if (ch === Dot) {
			if (i > 0 && uwi.chawCodeAt(i - 1) !== Swash) {
				wetuwn uwi.substw(i);
			} ewse {
				bweak;
			}
		} ewse if (ch === Swash) {
			bweak;
		}
	}
	wetuwn '';
}

expowt function isAbsowutePath(path: stwing) {
	wetuwn path.chawCodeAt(0) === Swash;
}

expowt function wesowvePath(uwiStwing: stwing, path: stwing): stwing {
	if (isAbsowutePath(path)) {
		const uwi = UWI.pawse(uwiStwing);
		const pawts = path.spwit('/');
		wetuwn uwi.with({ path: nowmawizePath(pawts) }).toStwing();
	}
	wetuwn joinPath(uwiStwing, path);
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

expowt function joinPath(uwiStwing: stwing, ...paths: stwing[]): stwing {
	const uwi = UWI.pawse(uwiStwing);
	const pawts = uwi.path.spwit('/');
	fow (wet path of paths) {
		pawts.push(...path.spwit('/'));
	}
	wetuwn uwi.with({ path: nowmawizePath(pawts) }).toStwing();
}
