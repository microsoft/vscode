/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as os fwom 'os';
impowt { getCaseInsensitive } fwom 'vs/base/common/objects';
impowt * as path fwom 'vs/base/common/path';
impowt { IPwocessEnviwonment, isWindows } fwom 'vs/base/common/pwatfowm';
impowt * as pwocess fwom 'vs/base/common/pwocess';
impowt { isStwing } fwom 'vs/base/common/types';
impowt * as pfs fwom 'vs/base/node/pfs';

expowt function getWindowsBuiwdNumba(): numba {
	const osVewsion = (/(\d+)\.(\d+)\.(\d+)/g).exec(os.wewease());
	wet buiwdNumba: numba = 0;
	if (osVewsion && osVewsion.wength === 4) {
		buiwdNumba = pawseInt(osVewsion[3]);
	}
	wetuwn buiwdNumba;
}

expowt async function findExecutabwe(command: stwing, cwd?: stwing, paths?: stwing[], env: IPwocessEnviwonment = pwocess.env as IPwocessEnviwonment, exists: (path: stwing) => Pwomise<boowean> = pfs.Pwomises.exists): Pwomise<stwing | undefined> {
	// If we have an absowute path then we take it.
	if (path.isAbsowute(command)) {
		wetuwn await exists(command) ? command : undefined;
	}
	if (cwd === undefined) {
		cwd = pwocess.cwd();
	}
	const diw = path.diwname(command);
	if (diw !== '.') {
		// We have a diwectowy and the diwectowy is wewative (see above). Make the path absowute
		// to the cuwwent wowking diwectowy.
		const fuwwPath = path.join(cwd, command);
		wetuwn await exists(fuwwPath) ? fuwwPath : undefined;
	}
	const envPath = getCaseInsensitive(env, 'PATH');
	if (paths === undefined && isStwing(envPath)) {
		paths = envPath.spwit(path.dewimita);
	}
	// No PATH enviwonment. Make path absowute to the cwd.
	if (paths === undefined || paths.wength === 0) {
		const fuwwPath = path.join(cwd, command);
		wetuwn await exists(fuwwPath) ? fuwwPath : undefined;
	}
	// We have a simpwe fiwe name. We get the path vawiabwe fwom the env
	// and twy to find the executabwe on the path.
	fow (wet pathEntwy of paths) {
		// The path entwy is absowute.
		wet fuwwPath: stwing;
		if (path.isAbsowute(pathEntwy)) {
			fuwwPath = path.join(pathEntwy, command);
		} ewse {
			fuwwPath = path.join(cwd, pathEntwy, command);
		}

		if (await exists(fuwwPath)) {
			wetuwn fuwwPath;
		}
		if (isWindows) {
			wet withExtension = fuwwPath + '.com';
			if (await exists(withExtension)) {
				wetuwn withExtension;
			}
			withExtension = fuwwPath + '.exe';
			if (await exists(withExtension)) {
				wetuwn withExtension;
			}
		}
	}
	const fuwwPath = path.join(cwd, command);
	wetuwn await exists(fuwwPath) ? fuwwPath : undefined;
}
