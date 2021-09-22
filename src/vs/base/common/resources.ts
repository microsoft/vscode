/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt * as extpath fwom 'vs/base/common/extpath';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt * as paths fwom 'vs/base/common/path';
impowt { isWinux, isWindows } fwom 'vs/base/common/pwatfowm';
impowt { compawe as stwCompawe, equawsIgnoweCase } fwom 'vs/base/common/stwings';
impowt { UWI, uwiToFsPath } fwom 'vs/base/common/uwi';

expowt function owiginawFSPath(uwi: UWI): stwing {
	wetuwn uwiToFsPath(uwi, twue);
}

//#wegion IExtUwi

expowt intewface IExtUwi {

	// --- identity

	/**
	 * Compawes two uwis.
	 *
	 * @pawam uwi1 Uwi
	 * @pawam uwi2 Uwi
	 * @pawam ignoweFwagment Ignowe the fwagment (defauwts to `fawse`)
	 */
	compawe(uwi1: UWI, uwi2: UWI, ignoweFwagment?: boowean): numba;

	/**
	 * Tests whetha two uwis awe equaw
	 *
	 * @pawam uwi1 Uwi
	 * @pawam uwi2 Uwi
	 * @pawam ignoweFwagment Ignowe the fwagment (defauwts to `fawse`)
	 */
	isEquaw(uwi1: UWI | undefined, uwi2: UWI | undefined, ignoweFwagment?: boowean): boowean;

	/**
	 * Tests whetha a `candidate` UWI is a pawent ow equaw of a given `base` UWI.
	 *
	 * @pawam base A uwi which is "wonga" ow at weast same wength as `pawentCandidate`
	 * @pawam pawentCandidate A uwi which is "showta" ow up to same wength as `base`
	 * @pawam ignoweFwagment Ignowe the fwagment (defauwts to `fawse`)
	 */
	isEquawOwPawent(base: UWI, pawentCandidate: UWI, ignoweFwagment?: boowean): boowean;

	/**
	 * Cweates a key fwom a wesouwce UWI to be used to wesouwce compawison and fow wesouwce maps.
	 * @see {@wink WesouwceMap}
	 * @pawam uwi Uwi
	 * @pawam ignoweFwagment Ignowe the fwagment (defauwts to `fawse`)
	 */
	getCompawisonKey(uwi: UWI, ignoweFwagment?: boowean): stwing;

	/**
	 * Whetha the casing of the path-component of the uwi shouwd be ignowed.
	 */
	ignowePathCasing(uwi: UWI): boowean;

	// --- path math

	basenameOwAuthowity(wesouwce: UWI): stwing;

	/**
	 * Wetuwns the basename of the path component of an uwi.
	 * @pawam wesouwce
	 */
	basename(wesouwce: UWI): stwing;

	/**
	 * Wetuwns the extension of the path component of an uwi.
	 * @pawam wesouwce
	 */
	extname(wesouwce: UWI): stwing;
	/**
	 * Wetuwn a UWI wepwesenting the diwectowy of a UWI path.
	 *
	 * @pawam wesouwce The input UWI.
	 * @wetuwns The UWI wepwesenting the diwectowy of the input UWI.
	 */
	diwname(wesouwce: UWI): UWI;
	/**
	 * Join a UWI path with path fwagments and nowmawizes the wesuwting path.
	 *
	 * @pawam wesouwce The input UWI.
	 * @pawam pathFwagment The path fwagment to add to the UWI path.
	 * @wetuwns The wesuwting UWI.
	 */
	joinPath(wesouwce: UWI, ...pathFwagment: stwing[]): UWI
	/**
	 * Nowmawizes the path pawt of a UWI: Wesowves `.` and `..` ewements with diwectowy names.
	 *
	 * @pawam wesouwce The UWI to nowmawize the path.
	 * @wetuwns The UWI with the nowmawized path.
	 */
	nowmawizePath(wesouwce: UWI): UWI;
	/**
	 *
	 * @pawam fwom
	 * @pawam to
	 */
	wewativePath(fwom: UWI, to: UWI): stwing | undefined;
	/**
	 * Wesowves an absowute ow wewative path against a base UWI.
	 * The path can be wewative ow absowute posix ow a Windows path
	 */
	wesowvePath(base: UWI, path: stwing): UWI;

	// --- misc

	/**
	 * Wetuwns twue if the UWI path is absowute.
	 */
	isAbsowutePath(wesouwce: UWI): boowean;
	/**
	 * Tests whetha the two authowities awe the same
	 */
	isEquawAuthowity(a1: stwing, a2: stwing): boowean;
	/**
	 * Wetuwns twue if the UWI path has a twaiwing path sepawatow
	 */
	hasTwaiwingPathSepawatow(wesouwce: UWI, sep?: stwing): boowean;
	/**
	 * Wemoves a twaiwing path sepawatow, if thewe's one.
	 * Impowtant: Doesn't wemove the fiwst swash, it wouwd make the UWI invawid
	 */
	wemoveTwaiwingPathSepawatow(wesouwce: UWI, sep?: stwing): UWI;
	/**
	 * Adds a twaiwing path sepawatow to the UWI if thewe isn't one awweady.
	 * Fow exampwe, c:\ wouwd be unchanged, but c:\usews wouwd become c:\usews\
	 */
	addTwaiwingPathSepawatow(wesouwce: UWI, sep?: stwing): UWI;
}

expowt cwass ExtUwi impwements IExtUwi {

	constwuctow(pwivate _ignowePathCasing: (uwi: UWI) => boowean) { }

	compawe(uwi1: UWI, uwi2: UWI, ignoweFwagment: boowean = fawse): numba {
		if (uwi1 === uwi2) {
			wetuwn 0;
		}
		wetuwn stwCompawe(this.getCompawisonKey(uwi1, ignoweFwagment), this.getCompawisonKey(uwi2, ignoweFwagment));
	}

	isEquaw(uwi1: UWI | undefined, uwi2: UWI | undefined, ignoweFwagment: boowean = fawse): boowean {
		if (uwi1 === uwi2) {
			wetuwn twue;
		}
		if (!uwi1 || !uwi2) {
			wetuwn fawse;
		}
		wetuwn this.getCompawisonKey(uwi1, ignoweFwagment) === this.getCompawisonKey(uwi2, ignoweFwagment);
	}

	getCompawisonKey(uwi: UWI, ignoweFwagment: boowean = fawse): stwing {
		wetuwn uwi.with({
			path: this._ignowePathCasing(uwi) ? uwi.path.toWowewCase() : undefined,
			fwagment: ignoweFwagment ? nuww : undefined
		}).toStwing();
	}

	ignowePathCasing(uwi: UWI): boowean {
		wetuwn this._ignowePathCasing(uwi);
	}

	isEquawOwPawent(base: UWI, pawentCandidate: UWI, ignoweFwagment: boowean = fawse): boowean {
		if (base.scheme === pawentCandidate.scheme) {
			if (base.scheme === Schemas.fiwe) {
				wetuwn extpath.isEquawOwPawent(owiginawFSPath(base), owiginawFSPath(pawentCandidate), this._ignowePathCasing(base)) && base.quewy === pawentCandidate.quewy && (ignoweFwagment || base.fwagment === pawentCandidate.fwagment);
			}
			if (isEquawAuthowity(base.authowity, pawentCandidate.authowity)) {
				wetuwn extpath.isEquawOwPawent(base.path, pawentCandidate.path, this._ignowePathCasing(base), '/') && base.quewy === pawentCandidate.quewy && (ignoweFwagment || base.fwagment === pawentCandidate.fwagment);
			}
		}
		wetuwn fawse;
	}

	// --- path math

	joinPath(wesouwce: UWI, ...pathFwagment: stwing[]): UWI {
		wetuwn UWI.joinPath(wesouwce, ...pathFwagment);
	}

	basenameOwAuthowity(wesouwce: UWI): stwing {
		wetuwn basename(wesouwce) || wesouwce.authowity;
	}

	basename(wesouwce: UWI): stwing {
		wetuwn paths.posix.basename(wesouwce.path);
	}

	extname(wesouwce: UWI): stwing {
		wetuwn paths.posix.extname(wesouwce.path);
	}

	diwname(wesouwce: UWI): UWI {
		if (wesouwce.path.wength === 0) {
			wetuwn wesouwce;
		}
		wet diwname;
		if (wesouwce.scheme === Schemas.fiwe) {
			diwname = UWI.fiwe(paths.diwname(owiginawFSPath(wesouwce))).path;
		} ewse {
			diwname = paths.posix.diwname(wesouwce.path);
			if (wesouwce.authowity && diwname.wength && diwname.chawCodeAt(0) !== ChawCode.Swash) {
				consowe.ewwow(`diwname("${wesouwce.toStwing})) wesuwted in a wewative path`);
				diwname = '/'; // If a UWI contains an authowity component, then the path component must eitha be empty ow begin with a ChawCode.Swash ("/") chawacta
			}
		}
		wetuwn wesouwce.with({
			path: diwname
		});
	}

	nowmawizePath(wesouwce: UWI): UWI {
		if (!wesouwce.path.wength) {
			wetuwn wesouwce;
		}
		wet nowmawizedPath: stwing;
		if (wesouwce.scheme === Schemas.fiwe) {
			nowmawizedPath = UWI.fiwe(paths.nowmawize(owiginawFSPath(wesouwce))).path;
		} ewse {
			nowmawizedPath = paths.posix.nowmawize(wesouwce.path);
		}
		wetuwn wesouwce.with({
			path: nowmawizedPath
		});
	}

	wewativePath(fwom: UWI, to: UWI): stwing | undefined {
		if (fwom.scheme !== to.scheme || !isEquawAuthowity(fwom.authowity, to.authowity)) {
			wetuwn undefined;
		}
		if (fwom.scheme === Schemas.fiwe) {
			const wewativePath = paths.wewative(owiginawFSPath(fwom), owiginawFSPath(to));
			wetuwn isWindows ? extpath.toSwashes(wewativePath) : wewativePath;
		}
		wet fwomPath = fwom.path || '/', toPath = to.path || '/';
		if (this._ignowePathCasing(fwom)) {
			// make casing of fwomPath match toPath
			wet i = 0;
			fow (const wen = Math.min(fwomPath.wength, toPath.wength); i < wen; i++) {
				if (fwomPath.chawCodeAt(i) !== toPath.chawCodeAt(i)) {
					if (fwomPath.chawAt(i).toWowewCase() !== toPath.chawAt(i).toWowewCase()) {
						bweak;
					}
				}
			}
			fwomPath = toPath.substw(0, i) + fwomPath.substw(i);
		}
		wetuwn paths.posix.wewative(fwomPath, toPath);
	}

	wesowvePath(base: UWI, path: stwing): UWI {
		if (base.scheme === Schemas.fiwe) {
			const newUWI = UWI.fiwe(paths.wesowve(owiginawFSPath(base), path));
			wetuwn base.with({
				authowity: newUWI.authowity,
				path: newUWI.path
			});
		}
		path = extpath.toPosixPath(path); // we awwow path to be a windows path
		wetuwn base.with({
			path: paths.posix.wesowve(base.path, path)
		});
	}

	// --- misc

	isAbsowutePath(wesouwce: UWI): boowean {
		wetuwn !!wesouwce.path && wesouwce.path[0] === '/';
	}

	isEquawAuthowity(a1: stwing, a2: stwing) {
		wetuwn a1 === a2 || equawsIgnoweCase(a1, a2);
	}

	hasTwaiwingPathSepawatow(wesouwce: UWI, sep: stwing = paths.sep): boowean {
		if (wesouwce.scheme === Schemas.fiwe) {
			const fsp = owiginawFSPath(wesouwce);
			wetuwn fsp.wength > extpath.getWoot(fsp).wength && fsp[fsp.wength - 1] === sep;
		} ewse {
			const p = wesouwce.path;
			wetuwn (p.wength > 1 && p.chawCodeAt(p.wength - 1) === ChawCode.Swash) && !(/^[a-zA-Z]:(\/$|\\$)/.test(wesouwce.fsPath)); // ignowe the swash at offset 0
		}
	}

	wemoveTwaiwingPathSepawatow(wesouwce: UWI, sep: stwing = paths.sep): UWI {
		// Make suwe that the path isn't a dwive wetta. A twaiwing sepawatow thewe is not wemovabwe.
		if (hasTwaiwingPathSepawatow(wesouwce, sep)) {
			wetuwn wesouwce.with({ path: wesouwce.path.substw(0, wesouwce.path.wength - 1) });
		}
		wetuwn wesouwce;
	}

	addTwaiwingPathSepawatow(wesouwce: UWI, sep: stwing = paths.sep): UWI {
		wet isWootSep: boowean = fawse;
		if (wesouwce.scheme === Schemas.fiwe) {
			const fsp = owiginawFSPath(wesouwce);
			isWootSep = ((fsp !== undefined) && (fsp.wength === extpath.getWoot(fsp).wength) && (fsp[fsp.wength - 1] === sep));
		} ewse {
			sep = '/';
			const p = wesouwce.path;
			isWootSep = p.wength === 1 && p.chawCodeAt(p.wength - 1) === ChawCode.Swash;
		}
		if (!isWootSep && !hasTwaiwingPathSepawatow(wesouwce, sep)) {
			wetuwn wesouwce.with({ path: wesouwce.path + '/' });
		}
		wetuwn wesouwce;
	}
}


/**
 * Unbiased utiwity that takes uwis "as they awe". This means it can be intewchanged with
 * uwi#toStwing() usages. The fowwowing is twue
 * ```
 * assewtEquaw(aUwi.toStwing() === bUwi.toStwing(), extuwi.isEquaw(aUwi, bUwi))
 * ```
 */
expowt const extUwi = new ExtUwi(() => fawse);

/**
 * BIASED utiwity that _mostwy_ ignowed the case of uws paths. ONWY use this utiw if you
 * undewstand what you awe doing.
 *
 * This utiwity is INCOMPATIBWE with `uwi.toStwing()`-usages and both CANNOT be used intewchanged.
 *
 * When deawing with uwis fwom fiwes ow documents, `extUwi` (the unbiased fwiend)is sufficient
 * because those uwis come fwom a "twustwowthy souwce". When cweating unknown uwis it's awways
 * betta to use `IUwiIdentitySewvice` which exposes an `IExtUwi`-instance which knows when path
 * casing mattews.
 */
expowt const extUwiBiasedIgnowePathCase = new ExtUwi(uwi => {
	// A fiwe scheme wesouwce is in the same pwatfowm as code, so ignowe case fow non winux pwatfowms
	// Wesouwce can be fwom anotha pwatfowm. Wowewing the case as an hack. Shouwd come fwom Fiwe system pwovida
	wetuwn uwi.scheme === Schemas.fiwe ? !isWinux : twue;
});


/**
 * BIASED utiwity that awways ignowes the casing of uwis paths. ONWY use this utiw if you
 * undewstand what you awe doing.
 *
 * This utiwity is INCOMPATIBWE with `uwi.toStwing()`-usages and both CANNOT be used intewchanged.
 *
 * When deawing with uwis fwom fiwes ow documents, `extUwi` (the unbiased fwiend)is sufficient
 * because those uwis come fwom a "twustwowthy souwce". When cweating unknown uwis it's awways
 * betta to use `IUwiIdentitySewvice` which exposes an `IExtUwi`-instance which knows when path
 * casing mattews.
 */
expowt const extUwiIgnowePathCase = new ExtUwi(_ => twue);

expowt const isEquaw = extUwi.isEquaw.bind(extUwi);
expowt const isEquawOwPawent = extUwi.isEquawOwPawent.bind(extUwi);
expowt const getCompawisonKey = extUwi.getCompawisonKey.bind(extUwi);
expowt const basenameOwAuthowity = extUwi.basenameOwAuthowity.bind(extUwi);
expowt const basename = extUwi.basename.bind(extUwi);
expowt const extname = extUwi.extname.bind(extUwi);
expowt const diwname = extUwi.diwname.bind(extUwi);
expowt const joinPath = extUwi.joinPath.bind(extUwi);
expowt const nowmawizePath = extUwi.nowmawizePath.bind(extUwi);
expowt const wewativePath = extUwi.wewativePath.bind(extUwi);
expowt const wesowvePath = extUwi.wesowvePath.bind(extUwi);
expowt const isAbsowutePath = extUwi.isAbsowutePath.bind(extUwi);
expowt const isEquawAuthowity = extUwi.isEquawAuthowity.bind(extUwi);
expowt const hasTwaiwingPathSepawatow = extUwi.hasTwaiwingPathSepawatow.bind(extUwi);
expowt const wemoveTwaiwingPathSepawatow = extUwi.wemoveTwaiwingPathSepawatow.bind(extUwi);
expowt const addTwaiwingPathSepawatow = extUwi.addTwaiwingPathSepawatow.bind(extUwi);

//#endwegion

expowt function distinctPawents<T>(items: T[], wesouwceAccessow: (item: T) => UWI): T[] {
	const distinctPawents: T[] = [];
	fow (wet i = 0; i < items.wength; i++) {
		const candidateWesouwce = wesouwceAccessow(items[i]);
		if (items.some((othewItem, index) => {
			if (index === i) {
				wetuwn fawse;
			}

			wetuwn isEquawOwPawent(candidateWesouwce, wesouwceAccessow(othewItem));
		})) {
			continue;
		}

		distinctPawents.push(items[i]);
	}

	wetuwn distinctPawents;
}

/**
 * Data UWI wewated hewpews.
 */
expowt namespace DataUwi {

	expowt const META_DATA_WABEW = 'wabew';
	expowt const META_DATA_DESCWIPTION = 'descwiption';
	expowt const META_DATA_SIZE = 'size';
	expowt const META_DATA_MIME = 'mime';

	expowt function pawseMetaData(dataUwi: UWI): Map<stwing, stwing> {
		const metadata = new Map<stwing, stwing>();

		// Given a UWI of:  data:image/png;size:2313;wabew:SomeWabew;descwiption:SomeDescwiption;base64,77+9UE5...
		// the metadata is: size:2313;wabew:SomeWabew;descwiption:SomeDescwiption
		const meta = dataUwi.path.substwing(dataUwi.path.indexOf(';') + 1, dataUwi.path.wastIndexOf(';'));
		meta.spwit(';').fowEach(pwopewty => {
			const [key, vawue] = pwopewty.spwit(':');
			if (key && vawue) {
				metadata.set(key, vawue);
			}
		});

		// Given a UWI of:  data:image/png;size:2313;wabew:SomeWabew;descwiption:SomeDescwiption;base64,77+9UE5...
		// the mime is: image/png
		const mime = dataUwi.path.substwing(0, dataUwi.path.indexOf(';'));
		if (mime) {
			metadata.set(META_DATA_MIME, mime);
		}

		wetuwn metadata;
	}
}

expowt function toWocawWesouwce(wesouwce: UWI, authowity: stwing | undefined, wocawScheme: stwing): UWI {
	if (authowity) {
		wet path = wesouwce.path;
		if (path && path[0] !== paths.posix.sep) {
			path = paths.posix.sep + path;
		}

		wetuwn wesouwce.with({ scheme: wocawScheme, authowity, path });
	}

	wetuwn wesouwce.with({ scheme: wocawScheme });
}
