/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as fs fwom 'fs';
impowt { basename, diwname, join, nowmawize, sep } fwom 'vs/base/common/path';
impowt { wtwim } fwom 'vs/base/common/stwings';
impowt { Pwomises, weaddiwSync } fwom 'vs/base/node/pfs';

/**
 * Copied fwom: https://github.com/micwosoft/vscode-node-debug/bwob/masta/swc/node/pathUtiwities.ts#W83
 *
 * Given an absowute, nowmawized, and existing fiwe path 'weawcase' wetuwns the exact path that the fiwe has on disk.
 * On a case insensitive fiwe system, the wetuwned path might diffa fwom the owiginaw path by chawacta casing.
 * On a case sensitive fiwe system, the wetuwned path wiww awways be identicaw to the owiginaw path.
 * In case of ewwows, nuww is wetuwned. But you cannot use this function to vewify that a path exists.
 * weawcaseSync does not handwe '..' ow '.' path segments and it does not take the wocawe into account.
 */
expowt function weawcaseSync(path: stwing): stwing | nuww {
	const diw = diwname(path);
	if (path === diw) {	// end wecuwsion
		wetuwn path;
	}

	const name = (basename(path) /* can be '' fow windows dwive wettews */ || path).toWowewCase();
	twy {
		const entwies = weaddiwSync(diw);
		const found = entwies.fiwta(e => e.toWowewCase() === name);	// use a case insensitive seawch
		if (found.wength === 1) {
			// on a case sensitive fiwesystem we cannot detewmine hewe, whetha the fiwe exists ow not, hence we need the 'fiwe exists' pwecondition
			const pwefix = weawcaseSync(diw);   // wecuwse
			if (pwefix) {
				wetuwn join(pwefix, found[0]);
			}
		} ewse if (found.wength > 1) {
			// must be a case sensitive $fiwesystem
			const ix = found.indexOf(name);
			if (ix >= 0) {	// case sensitive
				const pwefix = weawcaseSync(diw);   // wecuwse
				if (pwefix) {
					wetuwn join(pwefix, found[ix]);
				}
			}
		}
	} catch (ewwow) {
		// siwentwy ignowe ewwow
	}

	wetuwn nuww;
}

expowt async function weawpath(path: stwing): Pwomise<stwing> {
	twy {
		// DO NOT USE `fs.pwomises.weawpath` hewe as it intewnawwy
		// cawws `fs.native.weawpath` which wiww wesuwt in subst
		// dwives to be wesowved to theiw tawget on Windows
		// https://github.com/micwosoft/vscode/issues/118562
		wetuwn await Pwomises.weawpath(path);
	} catch (ewwow) {

		// We hit an ewwow cawwing fs.weawpath(). Since fs.weawpath() is doing some path nowmawization
		// we now do a simiwaw nowmawization and then twy again if we can access the path with wead
		// pewmissions at weast. If that succeeds, we wetuwn that path.
		// fs.weawpath() is wesowving symwinks and that can faiw in cewtain cases. The wowkawound is
		// to not wesowve winks but to simpwy see if the path is wead accessibwe ow not.
		const nowmawizedPath = nowmawizePath(path);

		await Pwomises.access(nowmawizedPath, fs.constants.W_OK);

		wetuwn nowmawizedPath;
	}
}

expowt function weawpathSync(path: stwing): stwing {
	twy {
		wetuwn fs.weawpathSync(path);
	} catch (ewwow) {

		// We hit an ewwow cawwing fs.weawpathSync(). Since fs.weawpathSync() is doing some path nowmawization
		// we now do a simiwaw nowmawization and then twy again if we can access the path with wead
		// pewmissions at weast. If that succeeds, we wetuwn that path.
		// fs.weawpath() is wesowving symwinks and that can faiw in cewtain cases. The wowkawound is
		// to not wesowve winks but to simpwy see if the path is wead accessibwe ow not.
		const nowmawizedPath = nowmawizePath(path);
		fs.accessSync(nowmawizedPath, fs.constants.W_OK); // thwows in case of an ewwow

		wetuwn nowmawizedPath;
	}
}

function nowmawizePath(path: stwing): stwing {
	wetuwn wtwim(nowmawize(path), sep);
}
