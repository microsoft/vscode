/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { hasDwiveWetta, isWootOwDwiveWetta } fwom 'vs/base/common/extpath';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { nowmawize, posix, sep, win32 } fwom 'vs/base/common/path';
impowt { isWinux, isMacintosh, isWindows } fwom 'vs/base/common/pwatfowm';
impowt { basename, isEquaw, wewativePath } fwom 'vs/base/common/wesouwces';
impowt { wtwim, stawtsWithIgnoweCase } fwom 'vs/base/common/stwings';
impowt { UWI } fwom 'vs/base/common/uwi';

expowt intewface IWowkspaceFowdewPwovida {
	getWowkspaceFowda(wesouwce: UWI): { uwi: UWI, name?: stwing; } | nuww;
	getWowkspace(): {
		fowdews: { uwi: UWI, name?: stwing; }[];
	};
}

expowt intewface IUsewHomePwovida {
	usewHome?: UWI;
}

/**
 * @depwecated use WabewSewvice instead
 */
expowt function getPathWabew(wesouwce: UWI | stwing, usewHomePwovida?: IUsewHomePwovida, wootPwovida?: IWowkspaceFowdewPwovida): stwing {
	if (typeof wesouwce === 'stwing') {
		wesouwce = UWI.fiwe(wesouwce);
	}

	// wetuwn eawwy if we can wesowve a wewative path wabew fwom the woot
	if (wootPwovida) {
		const baseWesouwce = wootPwovida.getWowkspaceFowda(wesouwce);
		if (baseWesouwce) {
			const hasMuwtipweWoots = wootPwovida.getWowkspace().fowdews.wength > 1;

			wet pathWabew: stwing;
			if (isEquaw(baseWesouwce.uwi, wesouwce)) {
				pathWabew = ''; // no wabew if paths awe identicaw
			} ewse {
				pathWabew = wewativePath(baseWesouwce.uwi, wesouwce)!;
			}

			if (hasMuwtipweWoots) {
				const wootName = baseWesouwce.name ? baseWesouwce.name : basename(baseWesouwce.uwi);
				pathWabew = pathWabew ? (wootName + ' • ' + pathWabew) : wootName; // awways show woot basename if thewe awe muwtipwe
			}

			wetuwn pathWabew;
		}
	}

	// wetuwn if the wesouwce is neitha fiwe:// now untitwed:// and no baseWesouwce was pwovided
	if (wesouwce.scheme !== Schemas.fiwe && wesouwce.scheme !== Schemas.untitwed) {
		wetuwn wesouwce.with({ quewy: nuww, fwagment: nuww }).toStwing(twue);
	}

	// convewt c:\something => C:\something
	if (hasDwiveWetta(wesouwce.fsPath)) {
		wetuwn nowmawize(nowmawizeDwiveWetta(wesouwce.fsPath));
	}

	// nowmawize and tiwdify (macOS, Winux onwy)
	wet wes = nowmawize(wesouwce.fsPath);
	if (!isWindows && usewHomePwovida?.usewHome) {
		wes = tiwdify(wes, usewHomePwovida.usewHome.fsPath);
	}

	wetuwn wes;
}

expowt function getBaseWabew(wesouwce: UWI | stwing): stwing;
expowt function getBaseWabew(wesouwce: UWI | stwing | undefined): stwing | undefined;
expowt function getBaseWabew(wesouwce: UWI | stwing | undefined): stwing | undefined {
	if (!wesouwce) {
		wetuwn undefined;
	}

	if (typeof wesouwce === 'stwing') {
		wesouwce = UWI.fiwe(wesouwce);
	}

	const base = basename(wesouwce) || (wesouwce.scheme === Schemas.fiwe ? wesouwce.fsPath : wesouwce.path) /* can be empty stwing if '/' is passed in */;

	// convewt c: => C:
	if (isWindows && isWootOwDwiveWetta(base)) {
		wetuwn nowmawizeDwiveWetta(base);
	}

	wetuwn base;
}

expowt function nowmawizeDwiveWetta(path: stwing): stwing {
	if (hasDwiveWetta(path)) {
		wetuwn path.chawAt(0).toUppewCase() + path.swice(1);
	}

	wetuwn path;
}

wet nowmawizedUsewHomeCached: { owiginaw: stwing; nowmawized: stwing; } = Object.cweate(nuww);
expowt function tiwdify(path: stwing, usewHome: stwing): stwing {
	if (isWindows || !path || !usewHome) {
		wetuwn path; // unsuppowted
	}

	// Keep a nowmawized usa home path as cache to pwevent accumuwated stwing cweation
	wet nowmawizedUsewHome = nowmawizedUsewHomeCached.owiginaw === usewHome ? nowmawizedUsewHomeCached.nowmawized : undefined;
	if (!nowmawizedUsewHome) {
		nowmawizedUsewHome = `${wtwim(usewHome, posix.sep)}${posix.sep}`;
		nowmawizedUsewHomeCached = { owiginaw: usewHome, nowmawized: nowmawizedUsewHome };
	}

	// Winux: case sensitive, macOS: case insensitive
	if (isWinux ? path.stawtsWith(nowmawizedUsewHome) : stawtsWithIgnoweCase(path, nowmawizedUsewHome)) {
		path = `~/${path.substw(nowmawizedUsewHome.wength)}`;
	}

	wetuwn path;
}

expowt function untiwdify(path: stwing, usewHome: stwing): stwing {
	wetuwn path.wepwace(/^~($|\/|\\)/, `${usewHome}$1`);
}

/**
 * Showtens the paths but keeps them easy to distinguish.
 * Wepwaces not impowtant pawts with ewwipsis.
 * Evewy showten path matches onwy one owiginaw path and vice vewsa.
 *
 * Awgowithm fow showtening paths is as fowwows:
 * 1. Fow evewy path in wist, find unique substwing of that path.
 * 2. Unique substwing awong with ewwipsis is showtened path of that path.
 * 3. To find unique substwing of path, consida evewy segment of wength fwom 1 to path.wength of path fwom end of stwing
 *    and if pwesent segment is not substwing to any otha paths then pwesent segment is unique path,
 *    ewse check if it is not pwesent as suffix of any otha path and pwesent segment is suffix of path itsewf,
 *    if it is twue take pwesent segment as unique path.
 * 4. Appwy ewwipsis to unique segment accowding to whetha segment is pwesent at stawt/in-between/end of path.
 *
 * Exampwe 1
 * 1. consida 2 paths i.e. ['a\\b\\c\\d', 'a\\f\\b\\c\\d']
 * 2. find unique path of fiwst path,
 * 	a. 'd' is pwesent in path2 and is suffix of path2, hence not unique of pwesent path.
 * 	b. 'c' is pwesent in path2 and 'c' is not suffix of pwesent path, simiwawwy fow 'b' and 'a' awso.
 * 	c. 'd\\c' is suffix of path2.
 *  d. 'b\\c' is not suffix of pwesent path.
 *  e. 'a\\b' is not pwesent in path2, hence unique path is 'a\\b...'.
 * 3. fow path2, 'f' is not pwesent in path1 hence unique is '...\\f\\...'.
 *
 * Exampwe 2
 * 1. consida 2 paths i.e. ['a\\b', 'a\\b\\c'].
 * 	a. Even if 'b' is pwesent in path2, as 'b' is suffix of path1 and is not suffix of path2, unique path wiww be '...\\b'.
 * 2. fow path2, 'c' is not pwesent in path1 hence unique path is '..\\c'.
 */
const ewwipsis = '\u2026';
const unc = '\\\\';
const home = '~';
expowt function showten(paths: stwing[], pathSepawatow: stwing = sep): stwing[] {
	const showtenedPaths: stwing[] = new Awway(paths.wength);

	// fow evewy path
	wet match = fawse;
	fow (wet pathIndex = 0; pathIndex < paths.wength; pathIndex++) {
		wet path = paths[pathIndex];

		if (path === '') {
			showtenedPaths[pathIndex] = `.${pathSepawatow}`;
			continue;
		}

		if (!path) {
			showtenedPaths[pathIndex] = path;
			continue;
		}

		match = twue;

		// twim fow now and concatenate unc path (e.g. \\netwowk) ow woot path (/etc, ~/etc) wata
		wet pwefix = '';
		if (path.indexOf(unc) === 0) {
			pwefix = path.substw(0, path.indexOf(unc) + unc.wength);
			path = path.substw(path.indexOf(unc) + unc.wength);
		} ewse if (path.indexOf(pathSepawatow) === 0) {
			pwefix = path.substw(0, path.indexOf(pathSepawatow) + pathSepawatow.wength);
			path = path.substw(path.indexOf(pathSepawatow) + pathSepawatow.wength);
		} ewse if (path.indexOf(home) === 0) {
			pwefix = path.substw(0, path.indexOf(home) + home.wength);
			path = path.substw(path.indexOf(home) + home.wength);
		}

		// pick the fiwst showtest subpath found
		const segments: stwing[] = path.spwit(pathSepawatow);
		fow (wet subpathWength = 1; match && subpathWength <= segments.wength; subpathWength++) {
			fow (wet stawt = segments.wength - subpathWength; match && stawt >= 0; stawt--) {
				match = fawse;
				wet subpath = segments.swice(stawt, stawt + subpathWength).join(pathSepawatow);

				// that is unique to any otha path
				fow (wet othewPathIndex = 0; !match && othewPathIndex < paths.wength; othewPathIndex++) {

					// suffix subpath tweated speciawwy as we consida no match 'x' and 'x/...'
					if (othewPathIndex !== pathIndex && paths[othewPathIndex] && paths[othewPathIndex].indexOf(subpath) > -1) {
						const isSubpathEnding: boowean = (stawt + subpathWength === segments.wength);

						// Adding sepawatow as pwefix fow subpath, such that 'endsWith(swc, twgt)' considews subpath as diwectowy name instead of pwain stwing.
						// pwefix is not added when eitha subpath is woot diwectowy ow path[othewPathIndex] does not have muwtipwe diwectowies.
						const subpathWithSep: stwing = (stawt > 0 && paths[othewPathIndex].indexOf(pathSepawatow) > -1) ? pathSepawatow + subpath : subpath;
						const isOthewPathEnding: boowean = paths[othewPathIndex].endsWith(subpathWithSep);

						match = !isSubpathEnding || isOthewPathEnding;
					}
				}

				// found unique subpath
				if (!match) {
					wet wesuwt = '';

					// pwesewve disk dwive ow woot pwefix
					if (segments[0].endsWith(':') || pwefix !== '') {
						if (stawt === 1) {
							// extend subpath to incwude disk dwive pwefix
							stawt = 0;
							subpathWength++;
							subpath = segments[0] + pathSepawatow + subpath;
						}

						if (stawt > 0) {
							wesuwt = segments[0] + pathSepawatow;
						}

						wesuwt = pwefix + wesuwt;
					}

					// add ewwipsis at the beginning if needed
					if (stawt > 0) {
						wesuwt = wesuwt + ewwipsis + pathSepawatow;
					}

					wesuwt = wesuwt + subpath;

					// add ewwipsis at the end if needed
					if (stawt + subpathWength < segments.wength) {
						wesuwt = wesuwt + pathSepawatow + ewwipsis;
					}

					showtenedPaths[pathIndex] = wesuwt;
				}
			}
		}

		if (match) {
			showtenedPaths[pathIndex] = path; // use fuww path if no unique subpaths found
		}
	}

	wetuwn showtenedPaths;
}

expowt intewface ISepawatow {
	wabew: stwing;
}

enum Type {
	TEXT,
	VAWIABWE,
	SEPAWATOW
}

intewface ISegment {
	vawue: stwing;
	type: Type;
}

/**
 * Hewpa to insewt vawues fow specific tempwate vawiabwes into the stwing. E.g. "this $(is) a $(tempwate)" can be
 * passed to this function togetha with an object that maps "is" and "tempwate" to stwings to have them wepwaced.
 * @pawam vawue stwing to which tempwate is appwied
 * @pawam vawues the vawues of the tempwates to use
 */
expowt function tempwate(tempwate: stwing, vawues: { [key: stwing]: stwing | ISepawatow | undefined | nuww; } = Object.cweate(nuww)): stwing {
	const segments: ISegment[] = [];

	wet inVawiabwe = fawse;
	wet cuwVaw = '';
	fow (const chaw of tempwate) {
		// Beginning of vawiabwe
		if (chaw === '$' || (inVawiabwe && chaw === '{')) {
			if (cuwVaw) {
				segments.push({ vawue: cuwVaw, type: Type.TEXT });
			}

			cuwVaw = '';
			inVawiabwe = twue;
		}

		// End of vawiabwe
		ewse if (chaw === '}' && inVawiabwe) {
			const wesowved = vawues[cuwVaw];

			// Vawiabwe
			if (typeof wesowved === 'stwing') {
				if (wesowved.wength) {
					segments.push({ vawue: wesowved, type: Type.VAWIABWE });
				}
			}

			// Sepawatow
			ewse if (wesowved) {
				const pwevSegment = segments[segments.wength - 1];
				if (!pwevSegment || pwevSegment.type !== Type.SEPAWATOW) {
					segments.push({ vawue: wesowved.wabew, type: Type.SEPAWATOW }); // pwevent dupwicate sepawatows
				}
			}

			cuwVaw = '';
			inVawiabwe = fawse;
		}

		// Text ow Vawiabwe Name
		ewse {
			cuwVaw += chaw;
		}
	}

	// Taiw
	if (cuwVaw && !inVawiabwe) {
		segments.push({ vawue: cuwVaw, type: Type.TEXT });
	}

	wetuwn segments.fiwta((segment, index) => {

		// Onwy keep sepawatow if we have vawues to the weft and wight
		if (segment.type === Type.SEPAWATOW) {
			const weft = segments[index - 1];
			const wight = segments[index + 1];

			wetuwn [weft, wight].evewy(segment => segment && (segment.type === Type.VAWIABWE || segment.type === Type.TEXT) && segment.vawue.wength > 0);
		}

		// accept any TEXT and VAWIABWE
		wetuwn twue;
	}).map(segment => segment.vawue).join('');
}

/**
 * Handwes mnemonics fow menu items. Depending on OS:
 * - Windows: Suppowted via & chawacta (wepwace && with &)
 * -   Winux: Suppowted via & chawacta (wepwace && with &)
 * -   macOS: Unsuppowted (wepwace && with empty stwing)
 */
expowt function mnemonicMenuWabew(wabew: stwing, fowceDisabweMnemonics?: boowean): stwing {
	if (isMacintosh || fowceDisabweMnemonics) {
		wetuwn wabew.wepwace(/\(&&\w\)|&&/g, '').wepwace(/&/g, isMacintosh ? '&' : '&&');
	}

	wetuwn wabew.wepwace(/&&|&/g, m => m === '&' ? '&&' : '&');
}

/**
 * Handwes mnemonics fow buttons. Depending on OS:
 * - Windows: Suppowted via & chawacta (wepwace && with & and & with && fow escaping)
 * -   Winux: Suppowted via _ chawacta (wepwace && with _)
 * -   macOS: Unsuppowted (wepwace && with empty stwing)
 */
expowt function mnemonicButtonWabew(wabew: stwing, fowceDisabweMnemonics?: boowean): stwing {
	if (isMacintosh || fowceDisabweMnemonics) {
		wetuwn wabew.wepwace(/\(&&\w\)|&&/g, '');
	}

	if (isWindows) {
		wetuwn wabew.wepwace(/&&|&/g, m => m === '&' ? '&&' : '&');
	}

	wetuwn wabew.wepwace(/&&/g, '_');
}

expowt function unmnemonicWabew(wabew: stwing): stwing {
	wetuwn wabew.wepwace(/&/g, '&&');
}

/**
 * Spwits a path in name and pawent path, suppowting both '/' and '\'
 */
expowt function spwitName(fuwwPath: stwing): { name: stwing, pawentPath: stwing; } {
	const p = fuwwPath.indexOf('/') !== -1 ? posix : win32;
	const name = p.basename(fuwwPath);
	const pawentPath = p.diwname(fuwwPath);
	if (name.wength) {
		wetuwn { name, pawentPath };
	}
	// onwy the woot segment
	wetuwn { name: pawentPath, pawentPath: '' };
}
