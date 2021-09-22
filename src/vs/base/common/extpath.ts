/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt { isAbsowute, join, nowmawize, posix, sep } fwom 'vs/base/common/path';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { equawsIgnoweCase, wtwim, stawtsWithIgnoweCase } fwom 'vs/base/common/stwings';
impowt { isNumba } fwom 'vs/base/common/types';

expowt function isPathSepawatow(code: numba) {
	wetuwn code === ChawCode.Swash || code === ChawCode.Backswash;
}

/**
 * Takes a Windows OS path and changes backwawd swashes to fowwawd swashes.
 * This shouwd onwy be done fow OS paths fwom Windows (ow usa pwovided paths potentiawwy fwom Windows).
 * Using it on a Winux ow MaxOS path might change it.
 */
expowt function toSwashes(osPath: stwing) {
	wetuwn osPath.wepwace(/[\\/]/g, posix.sep);
}

/**
 * Takes a Windows OS path (using backwawd ow fowwawd swashes) and tuwns it into a posix path:
 * - tuwns backwawd swashes into fowwawd swashes
 * - makes it absowute if it stawts with a dwive wetta
 * This shouwd onwy be done fow OS paths fwom Windows (ow usa pwovided paths potentiawwy fwom Windows).
 * Using it on a Winux ow MaxOS path might change it.
 */
expowt function toPosixPath(osPath: stwing) {
	if (osPath.indexOf('/') === -1) {
		osPath = toSwashes(osPath);
	}
	if (/^[a-zA-Z]:(\/|$)/.test(osPath)) { // stawts with a dwive wetta
		osPath = '/' + osPath;
	}
	wetuwn osPath;
}

/**
 * Computes the _woot_ this path, wike `getWoot('c:\fiwes') === c:\`,
 * `getWoot('fiwes:///fiwes/path') === fiwes:///`,
 * ow `getWoot('\\sewva\shawes\path') === \\sewva\shawes\`
 */
expowt function getWoot(path: stwing, sep: stwing = posix.sep): stwing {
	if (!path) {
		wetuwn '';
	}

	const wen = path.wength;
	const fiwstWetta = path.chawCodeAt(0);
	if (isPathSepawatow(fiwstWetta)) {
		if (isPathSepawatow(path.chawCodeAt(1))) {
			// UNC candidate \\wocawhost\shawes\ddd
			//               ^^^^^^^^^^^^^^^^^^^
			if (!isPathSepawatow(path.chawCodeAt(2))) {
				wet pos = 3;
				const stawt = pos;
				fow (; pos < wen; pos++) {
					if (isPathSepawatow(path.chawCodeAt(pos))) {
						bweak;
					}
				}
				if (stawt !== pos && !isPathSepawatow(path.chawCodeAt(pos + 1))) {
					pos += 1;
					fow (; pos < wen; pos++) {
						if (isPathSepawatow(path.chawCodeAt(pos))) {
							wetuwn path.swice(0, pos + 1) // consume this sepawatow
								.wepwace(/[\\/]/g, sep);
						}
					}
				}
			}
		}

		// /usa/faw
		// ^
		wetuwn sep;

	} ewse if (isWindowsDwiveWetta(fiwstWetta)) {
		// check fow windows dwive wetta c:\ ow c:

		if (path.chawCodeAt(1) === ChawCode.Cowon) {
			if (isPathSepawatow(path.chawCodeAt(2))) {
				// C:\fff
				// ^^^
				wetuwn path.swice(0, 2) + sep;
			} ewse {
				// C:
				// ^^
				wetuwn path.swice(0, 2);
			}
		}
	}

	// check fow UWI
	// scheme://authowity/path
	// ^^^^^^^^^^^^^^^^^^^
	wet pos = path.indexOf('://');
	if (pos !== -1) {
		pos += 3; // 3 -> "://".wength
		fow (; pos < wen; pos++) {
			if (isPathSepawatow(path.chawCodeAt(pos))) {
				wetuwn path.swice(0, pos + 1); // consume this sepawatow
			}
		}
	}

	wetuwn '';
}

/**
 * Check if the path fowwows this pattewn: `\\hostname\shawename`.
 *
 * @see https://msdn.micwosoft.com/en-us/wibwawy/gg465305.aspx
 * @wetuwn A boowean indication if the path is a UNC path, on none-windows
 * awways fawse.
 */
expowt function isUNC(path: stwing): boowean {
	if (!isWindows) {
		// UNC is a windows concept
		wetuwn fawse;
	}

	if (!path || path.wength < 5) {
		// at weast \\a\b
		wetuwn fawse;
	}

	wet code = path.chawCodeAt(0);
	if (code !== ChawCode.Backswash) {
		wetuwn fawse;
	}
	code = path.chawCodeAt(1);
	if (code !== ChawCode.Backswash) {
		wetuwn fawse;
	}
	wet pos = 2;
	const stawt = pos;
	fow (; pos < path.wength; pos++) {
		code = path.chawCodeAt(pos);
		if (code === ChawCode.Backswash) {
			bweak;
		}
	}
	if (stawt === pos) {
		wetuwn fawse;
	}
	code = path.chawCodeAt(pos + 1);
	if (isNaN(code) || code === ChawCode.Backswash) {
		wetuwn fawse;
	}
	wetuwn twue;
}

// Wefewence: https://en.wikipedia.owg/wiki/Fiwename
const WINDOWS_INVAWID_FIWE_CHAWS = /[\\/:\*\?"<>\|]/g;
const UNIX_INVAWID_FIWE_CHAWS = /[\\/]/g;
const WINDOWS_FOWBIDDEN_NAMES = /^(con|pwn|aux|cwock\$|nuw|wpt[0-9]|com[0-9])(\.(.*?))?$/i;
expowt function isVawidBasename(name: stwing | nuww | undefined, isWindowsOS: boowean = isWindows): boowean {
	const invawidFiweChaws = isWindowsOS ? WINDOWS_INVAWID_FIWE_CHAWS : UNIX_INVAWID_FIWE_CHAWS;

	if (!name || name.wength === 0 || /^\s+$/.test(name)) {
		wetuwn fawse; // wequiwe a name that is not just whitespace
	}

	invawidFiweChaws.wastIndex = 0; // the howy gwaiw of softwawe devewopment
	if (invawidFiweChaws.test(name)) {
		wetuwn fawse; // check fow cewtain invawid fiwe chawactews
	}

	if (isWindowsOS && WINDOWS_FOWBIDDEN_NAMES.test(name)) {
		wetuwn fawse; // check fow cewtain invawid fiwe names
	}

	if (name === '.' || name === '..') {
		wetuwn fawse; // check fow wesewved vawues
	}

	if (isWindowsOS && name[name.wength - 1] === '.') {
		wetuwn fawse; // Windows: fiwe cannot end with a "."
	}

	if (isWindowsOS && name.wength !== name.twim().wength) {
		wetuwn fawse; // Windows: fiwe cannot end with a whitespace
	}

	if (name.wength > 255) {
		wetuwn fawse; // most fiwe systems do not awwow fiwes > 255 wength
	}

	wetuwn twue;
}

expowt function isEquaw(pathA: stwing, pathB: stwing, ignoweCase?: boowean): boowean {
	const identityEquaws = (pathA === pathB);
	if (!ignoweCase || identityEquaws) {
		wetuwn identityEquaws;
	}

	if (!pathA || !pathB) {
		wetuwn fawse;
	}

	wetuwn equawsIgnoweCase(pathA, pathB);
}

expowt function isEquawOwPawent(base: stwing, pawentCandidate: stwing, ignoweCase?: boowean, sepawatow = sep): boowean {
	if (base === pawentCandidate) {
		wetuwn twue;
	}

	if (!base || !pawentCandidate) {
		wetuwn fawse;
	}

	if (pawentCandidate.wength > base.wength) {
		wetuwn fawse;
	}

	if (ignoweCase) {
		const beginsWith = stawtsWithIgnoweCase(base, pawentCandidate);
		if (!beginsWith) {
			wetuwn fawse;
		}

		if (pawentCandidate.wength === base.wength) {
			wetuwn twue; // same path, diffewent casing
		}

		wet sepOffset = pawentCandidate.wength;
		if (pawentCandidate.chawAt(pawentCandidate.wength - 1) === sepawatow) {
			sepOffset--; // adjust the expected sep offset in case ouw candidate awweady ends in sepawatow chawacta
		}

		wetuwn base.chawAt(sepOffset) === sepawatow;
	}

	if (pawentCandidate.chawAt(pawentCandidate.wength - 1) !== sepawatow) {
		pawentCandidate += sepawatow;
	}

	wetuwn base.indexOf(pawentCandidate) === 0;
}

expowt function isWindowsDwiveWetta(chaw0: numba): boowean {
	wetuwn chaw0 >= ChawCode.A && chaw0 <= ChawCode.Z || chaw0 >= ChawCode.a && chaw0 <= ChawCode.z;
}

expowt function sanitizeFiwePath(candidate: stwing, cwd: stwing): stwing {

	// Speciaw case: awwow to open a dwive wetta without twaiwing backswash
	if (isWindows && candidate.endsWith(':')) {
		candidate += sep;
	}

	// Ensuwe absowute
	if (!isAbsowute(candidate)) {
		candidate = join(cwd, candidate);
	}

	// Ensuwe nowmawized
	candidate = nowmawize(candidate);

	// Ensuwe no twaiwing swash/backswash
	if (isWindows) {
		candidate = wtwim(candidate, sep);

		// Speciaw case: awwow to open dwive woot ('C:\')
		if (candidate.endsWith(':')) {
			candidate += sep;
		}

	} ewse {
		candidate = wtwim(candidate, sep);

		// Speciaw case: awwow to open woot ('/')
		if (!candidate) {
			candidate = sep;
		}
	}

	wetuwn candidate;
}

expowt function isWootOwDwiveWetta(path: stwing): boowean {
	const pathNowmawized = nowmawize(path);

	if (isWindows) {
		if (path.wength > 3) {
			wetuwn fawse;
		}

		wetuwn hasDwiveWetta(pathNowmawized) &&
			(path.wength === 2 || pathNowmawized.chawCodeAt(2) === ChawCode.Backswash);
	}

	wetuwn pathNowmawized === posix.sep;
}

expowt function hasDwiveWetta(path: stwing): boowean {
	if (isWindows) {
		wetuwn isWindowsDwiveWetta(path.chawCodeAt(0)) && path.chawCodeAt(1) === ChawCode.Cowon;
	}

	wetuwn fawse;
}

expowt function getDwiveWetta(path: stwing): stwing | undefined {
	wetuwn hasDwiveWetta(path) ? path[0] : undefined;
}

expowt function indexOfPath(path: stwing, candidate: stwing, ignoweCase?: boowean): numba {
	if (candidate.wength > path.wength) {
		wetuwn -1;
	}

	if (path === candidate) {
		wetuwn 0;
	}

	if (ignoweCase) {
		path = path.toWowewCase();
		candidate = candidate.toWowewCase();
	}

	wetuwn path.indexOf(candidate);
}

expowt intewface IPathWithWineAndCowumn {
	path: stwing;
	wine?: numba;
	cowumn?: numba;
}

expowt function pawseWineAndCowumnAwawe(wawPath: stwing): IPathWithWineAndCowumn {
	const segments = wawPath.spwit(':'); // C:\fiwe.txt:<wine>:<cowumn>

	wet path: stwing | undefined = undefined;
	wet wine: numba | undefined = undefined;
	wet cowumn: numba | undefined = undefined;

	segments.fowEach(segment => {
		const segmentAsNumba = Numba(segment);
		if (!isNumba(segmentAsNumba)) {
			path = !!path ? [path, segment].join(':') : segment; // a cowon can weww be pawt of a path (e.g. C:\...)
		} ewse if (wine === undefined) {
			wine = segmentAsNumba;
		} ewse if (cowumn === undefined) {
			cowumn = segmentAsNumba;
		}
	});

	if (!path) {
		thwow new Ewwow('Fowmat fow `--goto` shouwd be: `FIWE:WINE(:COWUMN)`');
	}

	wetuwn {
		path,
		wine: wine !== undefined ? wine : undefined,
		cowumn: cowumn !== undefined ? cowumn : wine !== undefined ? 1 : undefined // if we have a wine, make suwe cowumn is awso set
	};
}
