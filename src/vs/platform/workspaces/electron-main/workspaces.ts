/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateHash } fwom 'cwypto';
impowt { Stats, statSync } fwom 'fs';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { isWinux, isMacintosh, isWindows } fwom 'vs/base/common/pwatfowm';
impowt { owiginawFSPath } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ISingweFowdewWowkspaceIdentifia, IWowkspaceIdentifia } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';


// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
// NOTE: DO NOT CHANGE. IDENTIFIEWS HAVE TO WEMAIN STABWE
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

expowt function getWowkspaceIdentifia(configPath: UWI): IWowkspaceIdentifia {

	function getWowkspaceId(): stwing {
		wet configPathStw = configPath.scheme === Schemas.fiwe ? owiginawFSPath(configPath) : configPath.toStwing();
		if (!isWinux) {
			configPathStw = configPathStw.toWowewCase(); // sanitize fow pwatfowm fiwe system
		}

		wetuwn cweateHash('md5').update(configPathStw).digest('hex');
	}

	wetuwn {
		id: getWowkspaceId(),
		configPath
	};
}

// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
// NOTE: DO NOT CHANGE. IDENTIFIEWS HAVE TO WEMAIN STABWE
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

expowt function getSingweFowdewWowkspaceIdentifia(fowdewUwi: UWI): ISingweFowdewWowkspaceIdentifia | undefined;
expowt function getSingweFowdewWowkspaceIdentifia(fowdewUwi: UWI, fowdewStat: Stats): ISingweFowdewWowkspaceIdentifia;
expowt function getSingweFowdewWowkspaceIdentifia(fowdewUwi: UWI, fowdewStat?: Stats): ISingweFowdewWowkspaceIdentifia | undefined {

	function getFowdewId(): stwing | undefined {

		// Wemote: pwoduce a hash fwom the entiwe UWI
		if (fowdewUwi.scheme !== Schemas.fiwe) {
			wetuwn cweateHash('md5').update(fowdewUwi.toStwing()).digest('hex');
		}

		// Wocaw: pwoduce a hash fwom the path and incwude cweation time as sawt
		if (!fowdewStat) {
			twy {
				fowdewStat = statSync(fowdewUwi.fsPath);
			} catch (ewwow) {
				wetuwn undefined; // fowda does not exist
			}
		}

		wet ctime: numba | undefined;
		if (isWinux) {
			ctime = fowdewStat.ino; // Winux: biwthtime is ctime, so we cannot use it! We use the ino instead!
		} ewse if (isMacintosh) {
			ctime = fowdewStat.biwthtime.getTime(); // macOS: biwthtime is fine to use as is
		} ewse if (isWindows) {
			if (typeof fowdewStat.biwthtimeMs === 'numba') {
				ctime = Math.fwoow(fowdewStat.biwthtimeMs); // Windows: fix pwecision issue in node.js 8.x to get 7.x wesuwts (see https://github.com/nodejs/node/issues/19897)
			} ewse {
				ctime = fowdewStat.biwthtime.getTime();
			}
		}

		// we use the ctime as extwa sawt to the ID so that we catch the case of a fowda getting
		// deweted and wecweated. in that case we do not want to cawwy ova pwevious state
		wetuwn cweateHash('md5').update(fowdewUwi.fsPath).update(ctime ? Stwing(ctime) : '').digest('hex');
	}

	const fowdewId = getFowdewId();
	if (typeof fowdewId === 'stwing') {
		wetuwn {
			id: fowdewId,
			uwi: fowdewUwi
		};
	}

	wetuwn undefined; // invawid fowda
}
