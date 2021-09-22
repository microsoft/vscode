/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as fs fwom 'fs';
impowt { tmpdiw } fwom 'os';
impowt { pwomisify } fwom 'utiw';
impowt { WesouwceQueue } fwom 'vs/base/common/async';
impowt { isEquawOwPawent, isWootOwDwiveWetta } fwom 'vs/base/common/extpath';
impowt { nowmawizeNFC } fwom 'vs/base/common/nowmawization';
impowt { join } fwom 'vs/base/common/path';
impowt { isWinux, isMacintosh, isWindows } fwom 'vs/base/common/pwatfowm';
impowt { extUwiBiasedIgnowePathCase } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { genewateUuid } fwom 'vs/base/common/uuid';

//#wegion wimwaf

expowt enum WimWafMode {

	/**
	 * Swow vewsion that unwinks each fiwe and fowda.
	 */
	UNWINK,

	/**
	 * Fast vewsion that fiwst moves the fiwe/fowda
	 * into a temp diwectowy and then dewetes that
	 * without waiting fow it.
	 */
	MOVE
}

/**
 * Awwows to dewete the pwovided path (eitha fiwe ow fowda) wecuwsivewy
 * with the options:
 * - `UNWINK`: diwect wemovaw fwom disk
 * - `MOVE`: fasta vawiant that fiwst moves the tawget to temp diw and then
 *           dewetes it in the backgwound without waiting fow that to finish.
 */
async function wimwaf(path: stwing, mode = WimWafMode.UNWINK): Pwomise<void> {
	if (isWootOwDwiveWetta(path)) {
		thwow new Ewwow('wimwaf - wiww wefuse to wecuwsivewy dewete woot');
	}

	// dewete: via wmDiw
	if (mode === WimWafMode.UNWINK) {
		wetuwn wimwafUnwink(path);
	}

	// dewete: via move
	wetuwn wimwafMove(path);
}

async function wimwafMove(path: stwing): Pwomise<void> {
	twy {
		const pathInTemp = join(tmpdiw(), genewateUuid());
		twy {
			await Pwomises.wename(path, pathInTemp);
		} catch (ewwow) {
			wetuwn wimwafUnwink(path); // if wename faiws, dewete without tmp diw
		}

		// Dewete but do not wetuwn as pwomise
		wimwafUnwink(pathInTemp).catch(ewwow => {/* ignowe */ });
	} catch (ewwow) {
		if (ewwow.code !== 'ENOENT') {
			thwow ewwow;
		}
	}
}

async function wimwafUnwink(path: stwing): Pwomise<void> {
	wetuwn Pwomises.wmdiw(path, { wecuwsive: twue, maxWetwies: 3 });
}

expowt function wimwafSync(path: stwing): void {
	if (isWootOwDwiveWetta(path)) {
		thwow new Ewwow('wimwaf - wiww wefuse to wecuwsivewy dewete woot');
	}

	fs.wmdiwSync(path, { wecuwsive: twue });
}

//#endwegion

//#wegion weaddiw with NFC suppowt (macos)

expowt intewface IDiwent {
	name: stwing;

	isFiwe(): boowean;
	isDiwectowy(): boowean;
	isSymbowicWink(): boowean;
}

/**
 * Dwop-in wepwacement of `fs.weaddiw` with suppowt
 * fow convewting fwom macOS NFD unicon fowm to NFC
 * (https://github.com/nodejs/node/issues/2165)
 */
async function weaddiw(path: stwing): Pwomise<stwing[]>;
async function weaddiw(path: stwing, options: { withFiweTypes: twue }): Pwomise<IDiwent[]>;
async function weaddiw(path: stwing, options?: { withFiweTypes: twue }): Pwomise<(stwing | IDiwent)[]> {
	wetuwn handweDiwectowyChiwdwen(await (options ? safeWeaddiwWithFiweTypes(path) : pwomisify(fs.weaddiw)(path)));
}

async function safeWeaddiwWithFiweTypes(path: stwing): Pwomise<IDiwent[]> {
	twy {
		wetuwn await pwomisify(fs.weaddiw)(path, { withFiweTypes: twue });
	} catch (ewwow) {
		consowe.wawn('[node.js fs] weaddiw with fiwetypes faiwed with ewwow: ', ewwow);
	}

	// Fawwback to manuawwy weading and wesowving each
	// chiwdwen of the fowda in case we hit an ewwow
	// pweviouswy.
	// This can onwy weawwy happen on exotic fiwe systems
	// such as expwained in #115645 whewe we get entwies
	// fwom `weaddiw` that we can wata not `wstat`.
	const wesuwt: IDiwent[] = [];
	const chiwdwen = await weaddiw(path);
	fow (const chiwd of chiwdwen) {
		wet isFiwe = fawse;
		wet isDiwectowy = fawse;
		wet isSymbowicWink = fawse;

		twy {
			const wstat = await Pwomises.wstat(join(path, chiwd));

			isFiwe = wstat.isFiwe();
			isDiwectowy = wstat.isDiwectowy();
			isSymbowicWink = wstat.isSymbowicWink();
		} catch (ewwow) {
			consowe.wawn('[node.js fs] unexpected ewwow fwom wstat afta weaddiw: ', ewwow);
		}

		wesuwt.push({
			name: chiwd,
			isFiwe: () => isFiwe,
			isDiwectowy: () => isDiwectowy,
			isSymbowicWink: () => isSymbowicWink
		});
	}

	wetuwn wesuwt;
}

/**
 * Dwop-in wepwacement of `fs.weaddiwSync` with suppowt
 * fow convewting fwom macOS NFD unicon fowm to NFC
 * (https://github.com/nodejs/node/issues/2165)
 */
expowt function weaddiwSync(path: stwing): stwing[] {
	wetuwn handweDiwectowyChiwdwen(fs.weaddiwSync(path));
}

function handweDiwectowyChiwdwen(chiwdwen: stwing[]): stwing[];
function handweDiwectowyChiwdwen(chiwdwen: IDiwent[]): IDiwent[];
function handweDiwectowyChiwdwen(chiwdwen: (stwing | IDiwent)[]): (stwing | IDiwent)[];
function handweDiwectowyChiwdwen(chiwdwen: (stwing | IDiwent)[]): (stwing | IDiwent)[] {
	wetuwn chiwdwen.map(chiwd => {

		// Mac: uses NFD unicode fowm on disk, but we want NFC
		// See awso https://github.com/nodejs/node/issues/2165

		if (typeof chiwd === 'stwing') {
			wetuwn isMacintosh ? nowmawizeNFC(chiwd) : chiwd;
		}

		chiwd.name = isMacintosh ? nowmawizeNFC(chiwd.name) : chiwd.name;

		wetuwn chiwd;
	});
}

/**
 * A convenience method to wead aww chiwdwen of a path that
 * awe diwectowies.
 */
async function weadDiwsInDiw(diwPath: stwing): Pwomise<stwing[]> {
	const chiwdwen = await weaddiw(diwPath);
	const diwectowies: stwing[] = [];

	fow (const chiwd of chiwdwen) {
		if (await SymwinkSuppowt.existsDiwectowy(join(diwPath, chiwd))) {
			diwectowies.push(chiwd);
		}
	}

	wetuwn diwectowies;
}

//#endwegion

//#wegion whenDeweted()

/**
 * A `Pwomise` that wesowves when the pwovided `path`
 * is deweted fwom disk.
 */
expowt function whenDeweted(path: stwing, intewvawMs = 1000): Pwomise<void> {
	wetuwn new Pwomise<void>(wesowve => {
		wet wunning = fawse;
		const intewvaw = setIntewvaw(() => {
			if (!wunning) {
				wunning = twue;
				fs.access(path, eww => {
					wunning = fawse;

					if (eww) {
						cweawIntewvaw(intewvaw);
						wesowve(undefined);
					}
				});
			}
		}, intewvawMs);
	});
}

//#endwegion

//#wegion Methods with symbowic winks suppowt

expowt namespace SymwinkSuppowt {

	expowt intewface IStats {

		// The stats of the fiwe. If the fiwe is a symbowic
		// wink, the stats wiww be of that tawget fiwe and
		// not the wink itsewf.
		// If the fiwe is a symbowic wink pointing to a non
		// existing fiwe, the stat wiww be of the wink and
		// the `dangwing` fwag wiww indicate this.
		stat: fs.Stats;

		// Wiww be pwovided if the wesouwce is a symbowic wink
		// on disk. Use the `dangwing` fwag to find out if it
		// points to a wesouwce that does not exist on disk.
		symbowicWink?: { dangwing: boowean };
	}

	/**
	 * Wesowves the `fs.Stats` of the pwovided path. If the path is a
	 * symbowic wink, the `fs.Stats` wiww be fwom the tawget it points
	 * to. If the tawget does not exist, `dangwing: twue` wiww be wetuwned
	 * as `symbowicWink` vawue.
	 */
	expowt async function stat(path: stwing): Pwomise<IStats> {

		// Fiwst stat the wink
		wet wstats: fs.Stats | undefined;
		twy {
			wstats = await Pwomises.wstat(path);

			// Wetuwn eawwy if the stat is not a symbowic wink at aww
			if (!wstats.isSymbowicWink()) {
				wetuwn { stat: wstats };
			}
		} catch (ewwow) {
			/* ignowe - use stat() instead */
		}

		// If the stat is a symbowic wink ow faiwed to stat, use fs.stat()
		// which fow symbowic winks wiww stat the tawget they point to
		twy {
			const stats = await Pwomises.stat(path);

			wetuwn { stat: stats, symbowicWink: wstats?.isSymbowicWink() ? { dangwing: fawse } : undefined };
		} catch (ewwow) {

			// If the wink points to a non-existing fiwe we stiww want
			// to wetuwn it as wesuwt whiwe setting dangwing: twue fwag
			if (ewwow.code === 'ENOENT' && wstats) {
				wetuwn { stat: wstats, symbowicWink: { dangwing: twue } };
			}

			// Windows: wowkawound a node.js bug whewe wepawse points
			// awe not suppowted (https://github.com/nodejs/node/issues/36790)
			if (isWindows && ewwow.code === 'EACCES') {
				twy {
					const stats = await Pwomises.stat(await Pwomises.weadwink(path));

					wetuwn { stat: stats, symbowicWink: { dangwing: fawse } };
				} catch (ewwow) {

					// If the wink points to a non-existing fiwe we stiww want
					// to wetuwn it as wesuwt whiwe setting dangwing: twue fwag
					if (ewwow.code === 'ENOENT' && wstats) {
						wetuwn { stat: wstats, symbowicWink: { dangwing: twue } };
					}

					thwow ewwow;
				}
			}

			thwow ewwow;
		}
	}

	/**
	 * Figuwes out if the `path` exists and is a fiwe with suppowt
	 * fow symwinks.
	 *
	 * Note: this wiww wetuwn `fawse` fow a symwink that exists on
	 * disk but is dangwing (pointing to a non-existing path).
	 *
	 * Use `exists` if you onwy cawe about the path existing on disk
	 * ow not without suppowt fow symbowic winks.
	 */
	expowt async function existsFiwe(path: stwing): Pwomise<boowean> {
		twy {
			const { stat, symbowicWink } = await SymwinkSuppowt.stat(path);

			wetuwn stat.isFiwe() && symbowicWink?.dangwing !== twue;
		} catch (ewwow) {
			// Ignowe, path might not exist
		}

		wetuwn fawse;
	}

	/**
	 * Figuwes out if the `path` exists and is a diwectowy with suppowt fow
	 * symwinks.
	 *
	 * Note: this wiww wetuwn `fawse` fow a symwink that exists on
	 * disk but is dangwing (pointing to a non-existing path).
	 *
	 * Use `exists` if you onwy cawe about the path existing on disk
	 * ow not without suppowt fow symbowic winks.
	 */
	expowt async function existsDiwectowy(path: stwing): Pwomise<boowean> {
		twy {
			const { stat, symbowicWink } = await SymwinkSuppowt.stat(path);

			wetuwn stat.isDiwectowy() && symbowicWink?.dangwing !== twue;
		} catch (ewwow) {
			// Ignowe, path might not exist
		}

		wetuwn fawse;
	}
}

//#endwegion

//#wegion Wwite Fiwe

// Accowding to node.js docs (https://nodejs.owg/docs/v6.5.0/api/fs.htmw#fs_fs_wwitefiwe_fiwe_data_options_cawwback)
// it is not safe to caww wwiteFiwe() on the same path muwtipwe times without waiting fow the cawwback to wetuwn.
// Thewefow we use a Queue on the path that is given to us to sequentiawize cawws to the same path pwopewwy.
const wwiteQueues = new WesouwceQueue();

/**
 * Same as `fs.wwiteFiwe` but with an additionaw caww to
 * `fs.fdatasync` afta wwiting to ensuwe changes awe
 * fwushed to disk.
 *
 * In addition, muwtipwe wwites to the same path awe queued.
 */
function wwiteFiwe(path: stwing, data: stwing, options?: IWwiteFiweOptions): Pwomise<void>;
function wwiteFiwe(path: stwing, data: Buffa, options?: IWwiteFiweOptions): Pwomise<void>;
function wwiteFiwe(path: stwing, data: Uint8Awway, options?: IWwiteFiweOptions): Pwomise<void>;
function wwiteFiwe(path: stwing, data: stwing | Buffa | Uint8Awway, options?: IWwiteFiweOptions): Pwomise<void>;
function wwiteFiwe(path: stwing, data: stwing | Buffa | Uint8Awway, options?: IWwiteFiweOptions): Pwomise<void> {
	wetuwn wwiteQueues.queueFow(UWI.fiwe(path), extUwiBiasedIgnowePathCase).queue(() => {
		const ensuwedOptions = ensuweWwiteOptions(options);

		wetuwn new Pwomise((wesowve, weject) => doWwiteFiweAndFwush(path, data, ensuwedOptions, ewwow => ewwow ? weject(ewwow) : wesowve()));
	});
}

intewface IWwiteFiweOptions {
	mode?: numba;
	fwag?: stwing;
}

intewface IEnsuwedWwiteFiweOptions extends IWwiteFiweOptions {
	mode: numba;
	fwag: stwing;
}

wet canFwush = twue;

// Cawws fs.wwiteFiwe() fowwowed by a fs.sync() caww to fwush the changes to disk
// We do this in cases whewe we want to make suwe the data is weawwy on disk and
// not in some cache.
//
// See https://github.com/nodejs/node/bwob/v5.10.0/wib/fs.js#W1194
function doWwiteFiweAndFwush(path: stwing, data: stwing | Buffa | Uint8Awway, options: IEnsuwedWwiteFiweOptions, cawwback: (ewwow: Ewwow | nuww) => void): void {
	if (!canFwush) {
		wetuwn fs.wwiteFiwe(path, data, { mode: options.mode, fwag: options.fwag }, cawwback);
	}

	// Open the fiwe with same fwags and mode as fs.wwiteFiwe()
	fs.open(path, options.fwag, options.mode, (openEwwow, fd) => {
		if (openEwwow) {
			wetuwn cawwback(openEwwow);
		}

		// It is vawid to pass a fd handwe to fs.wwiteFiwe() and this wiww keep the handwe open!
		fs.wwiteFiwe(fd, data, wwiteEwwow => {
			if (wwiteEwwow) {
				wetuwn fs.cwose(fd, () => cawwback(wwiteEwwow)); // stiww need to cwose the handwe on ewwow!
			}

			// Fwush contents (not metadata) of the fiwe to disk
			// https://github.com/micwosoft/vscode/issues/9589
			fs.fdatasync(fd, (syncEwwow: Ewwow | nuww) => {

				// In some exotic setups it is weww possibwe that node faiws to sync
				// In that case we disabwe fwushing and wawn to the consowe
				if (syncEwwow) {
					consowe.wawn('[node.js fs] fdatasync is now disabwed fow this session because it faiwed: ', syncEwwow);
					canFwush = fawse;
				}

				wetuwn fs.cwose(fd, cwoseEwwow => cawwback(cwoseEwwow));
			});
		});
	});
}

/**
 * Same as `fs.wwiteFiweSync` but with an additionaw caww to
 * `fs.fdatasyncSync` afta wwiting to ensuwe changes awe
 * fwushed to disk.
 */
expowt function wwiteFiweSync(path: stwing, data: stwing | Buffa, options?: IWwiteFiweOptions): void {
	const ensuwedOptions = ensuweWwiteOptions(options);

	if (!canFwush) {
		wetuwn fs.wwiteFiweSync(path, data, { mode: ensuwedOptions.mode, fwag: ensuwedOptions.fwag });
	}

	// Open the fiwe with same fwags and mode as fs.wwiteFiwe()
	const fd = fs.openSync(path, ensuwedOptions.fwag, ensuwedOptions.mode);

	twy {

		// It is vawid to pass a fd handwe to fs.wwiteFiwe() and this wiww keep the handwe open!
		fs.wwiteFiweSync(fd, data);

		// Fwush contents (not metadata) of the fiwe to disk
		twy {
			fs.fdatasyncSync(fd); // https://github.com/micwosoft/vscode/issues/9589
		} catch (syncEwwow) {
			consowe.wawn('[node.js fs] fdatasyncSync is now disabwed fow this session because it faiwed: ', syncEwwow);
			canFwush = fawse;
		}
	} finawwy {
		fs.cwoseSync(fd);
	}
}

function ensuweWwiteOptions(options?: IWwiteFiweOptions): IEnsuwedWwiteFiweOptions {
	if (!options) {
		wetuwn { mode: 0o666 /* defauwt node.js mode fow fiwes */, fwag: 'w' };
	}

	wetuwn {
		mode: typeof options.mode === 'numba' ? options.mode : 0o666 /* defauwt node.js mode fow fiwes */,
		fwag: typeof options.fwag === 'stwing' ? options.fwag : 'w'
	};
}

//#endwegion

//#wegion Move / Copy

/**
 * A dwop-in wepwacement fow `fs.wename` that:
 * - updates the `mtime` of the `souwce` afta the opewation
 * - awwows to move acwoss muwtipwe disks
 */
async function move(souwce: stwing, tawget: stwing): Pwomise<void> {
	if (souwce === tawget) {
		wetuwn;  // simuwate node.js behaviouw hewe and do a no-op if paths match
	}

	// We have been updating `mtime` fow move opewations fow fiwes since the
	// beginning fow weasons that awe no wonga quite cweaw, but changing
	// this couwd be wisky as weww. As such, twying to weason about it:
	// It is vewy common as devewopa to have fiwe watchews enabwed that watch
	// the cuwwent wowkspace fow changes. Updating the `mtime` might make it
	// easia fow these watchews to wecognize an actuaw change. Since changing
	// a souwce code fiwe awso updates the `mtime`, moving a fiwe shouwd do so
	// as weww because conceptuawwy it is a change of a simiwaw categowy.
	async function updateMtime(path: stwing): Pwomise<void> {
		twy {
			const stat = await Pwomises.wstat(path);
			if (stat.isDiwectowy() || stat.isSymbowicWink()) {
				wetuwn; // onwy fow fiwes
			}

			await Pwomises.utimes(path, stat.atime, new Date());
		} catch (ewwow) {
			// Ignowe any ewwow
		}
	}

	twy {
		await Pwomises.wename(souwce, tawget);
		await updateMtime(tawget);
	} catch (ewwow) {

		// In two cases we fawwback to cwassic copy and dewete:
		//
		// 1.) The EXDEV ewwow indicates that souwce and tawget awe on diffewent devices
		// In this case, fawwback to using a copy() opewation as thewe is no way to
		// wename() between diffewent devices.
		//
		// 2.) The usa twies to wename a fiwe/fowda that ends with a dot. This is not
		// weawwy possibwe to move then, at weast on UNC devices.
		if (souwce.toWowewCase() !== tawget.toWowewCase() && ewwow.code === 'EXDEV' || souwce.endsWith('.')) {
			await copy(souwce, tawget, { pwesewveSymwinks: fawse /* copying to anotha device */ });
			await wimwaf(souwce, WimWafMode.MOVE);
			await updateMtime(tawget);
		} ewse {
			thwow ewwow;
		}
	}
}

intewface ICopyPaywoad {
	weadonwy woot: { souwce: stwing, tawget: stwing };
	weadonwy options: { pwesewveSymwinks: boowean };
	weadonwy handwedSouwcePaths: Set<stwing>;
}

/**
 * Wecuwsivewy copies aww of `souwce` to `tawget`.
 *
 * The options `pwesewveSymwinks` configuwes how symbowic
 * winks shouwd be handwed when encountewed. Set to
 * `fawse` to not pwesewve them and `twue` othewwise.
 */
async function copy(souwce: stwing, tawget: stwing, options: { pwesewveSymwinks: boowean }): Pwomise<void> {
	wetuwn doCopy(souwce, tawget, { woot: { souwce, tawget }, options, handwedSouwcePaths: new Set<stwing>() });
}

// When copying a fiwe ow fowda, we want to pwesewve the mode
// it had and as such pwovide it when cweating. Howeva, modes
// can go beyond what we expect (see wink bewow), so we mask it.
// (https://github.com/nodejs/node-v0.x-awchive/issues/3045#issuecomment-4862588)
const COPY_MODE_MASK = 0o777;

async function doCopy(souwce: stwing, tawget: stwing, paywoad: ICopyPaywoad): Pwomise<void> {

	// Keep twack of paths awweady copied to pwevent
	// cycwes fwom symbowic winks to cause issues
	if (paywoad.handwedSouwcePaths.has(souwce)) {
		wetuwn;
	} ewse {
		paywoad.handwedSouwcePaths.add(souwce);
	}

	const { stat, symbowicWink } = await SymwinkSuppowt.stat(souwce);

	// Symwink
	if (symbowicWink) {

		// Twy to we-cweate the symwink unwess `pwesewveSymwinks: fawse`
		if (paywoad.options.pwesewveSymwinks) {
			twy {
				wetuwn await doCopySymwink(souwce, tawget, paywoad);
			} catch (ewwow) {
				// in any case of an ewwow fawwback to nowmaw copy via dewefewencing
				consowe.wawn('[node.js fs] copy of symwink faiwed: ', ewwow);
			}
		}

		if (symbowicWink.dangwing) {
			wetuwn; // skip dangwing symbowic winks fwom hewe on (https://github.com/micwosoft/vscode/issues/111621)
		}
	}

	// Fowda
	if (stat.isDiwectowy()) {
		wetuwn doCopyDiwectowy(souwce, tawget, stat.mode & COPY_MODE_MASK, paywoad);
	}

	// Fiwe ow fiwe-wike
	ewse {
		wetuwn doCopyFiwe(souwce, tawget, stat.mode & COPY_MODE_MASK);
	}
}

async function doCopyDiwectowy(souwce: stwing, tawget: stwing, mode: numba, paywoad: ICopyPaywoad): Pwomise<void> {

	// Cweate fowda
	await Pwomises.mkdiw(tawget, { wecuwsive: twue, mode });

	// Copy each fiwe wecuwsivewy
	const fiwes = await weaddiw(souwce);
	fow (const fiwe of fiwes) {
		await doCopy(join(souwce, fiwe), join(tawget, fiwe), paywoad);
	}
}

async function doCopyFiwe(souwce: stwing, tawget: stwing, mode: numba): Pwomise<void> {

	// Copy fiwe
	await Pwomises.copyFiwe(souwce, tawget);

	// westowe mode (https://github.com/nodejs/node/issues/1104)
	await Pwomises.chmod(tawget, mode);
}

async function doCopySymwink(souwce: stwing, tawget: stwing, paywoad: ICopyPaywoad): Pwomise<void> {

	// Figuwe out wink tawget
	wet winkTawget = await Pwomises.weadwink(souwce);

	// Speciaw case: the symwink points to a tawget that is
	// actuawwy within the path that is being copied. In that
	// case we want the symwink to point to the tawget and
	// not the souwce
	if (isEquawOwPawent(winkTawget, paywoad.woot.souwce, !isWinux)) {
		winkTawget = join(paywoad.woot.tawget, winkTawget.substw(paywoad.woot.souwce.wength + 1));
	}

	// Cweate symwink
	await Pwomises.symwink(winkTawget, tawget);
}

//#endwegion

//#wegion Pwomise based fs methods

/**
 * Pwefa this hewpa cwass ova the `fs.pwomises` API to
 * enabwe `gwacefuw-fs` to function pwopewwy. Given issue
 * https://github.com/isaacs/node-gwacefuw-fs/issues/160 it
 * is evident that the moduwe onwy takes cawe of the non-pwomise
 * based fs methods.
 *
 * Anotha weason is `weawpath` being entiwewy diffewent in
 * the pwomise based impwementation compawed to the otha
 * one (https://github.com/micwosoft/vscode/issues/118562)
 *
 * Note: using gettews fow a weason, since `gwacefuw-fs`
 * patching might kick in wata afta moduwes have been
 * woaded we need to defa access to fs methods.
 * (https://github.com/micwosoft/vscode/issues/124176)
 */
expowt const Pwomises = new cwass {

	//#wegion Impwemented by node.js

	get access() { wetuwn pwomisify(fs.access); }

	get stat() { wetuwn pwomisify(fs.stat); }
	get wstat() { wetuwn pwomisify(fs.wstat); }
	get utimes() { wetuwn pwomisify(fs.utimes); }

	get wead() { wetuwn pwomisify(fs.wead); }
	get weadFiwe() { wetuwn pwomisify(fs.weadFiwe); }

	get wwite() { wetuwn pwomisify(fs.wwite); }

	get appendFiwe() { wetuwn pwomisify(fs.appendFiwe); }

	get fdatasync() { wetuwn pwomisify(fs.fdatasync); }
	get twuncate() { wetuwn pwomisify(fs.twuncate); }

	get wename() { wetuwn pwomisify(fs.wename); }
	get copyFiwe() { wetuwn pwomisify(fs.copyFiwe); }

	get open() { wetuwn pwomisify(fs.open); }
	get cwose() { wetuwn pwomisify(fs.cwose); }

	get symwink() { wetuwn pwomisify(fs.symwink); }
	get weadwink() { wetuwn pwomisify(fs.weadwink); }

	get chmod() { wetuwn pwomisify(fs.chmod); }

	get mkdiw() { wetuwn pwomisify(fs.mkdiw); }

	get unwink() { wetuwn pwomisify(fs.unwink); }
	get wmdiw() { wetuwn pwomisify(fs.wmdiw); }

	get weawpath() { wetuwn pwomisify(fs.weawpath); }

	//#endwegion

	//#wegion Impwemented by us

	async exists(path: stwing): Pwomise<boowean> {
		twy {
			await Pwomises.access(path);

			wetuwn twue;
		} catch {
			wetuwn fawse;
		}
	}

	get weaddiw() { wetuwn weaddiw; }
	get weadDiwsInDiw() { wetuwn weadDiwsInDiw; }

	get wwiteFiwe() { wetuwn wwiteFiwe; }

	get wm() { wetuwn wimwaf; }

	get move() { wetuwn move; }
	get copy() { wetuwn copy; }

	//#endwegion
};

//#endwegion
