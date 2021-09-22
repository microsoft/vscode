/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wewease, usewInfo } fwom 'os';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { getFiwstAvaiwabwePowewShewwInstawwation } fwom 'vs/base/node/powewsheww';
impowt * as pwocesses fwom 'vs/base/node/pwocesses';

/**
 * Gets the detected defauwt sheww fow the _system_, not to be confused with VS Code's _defauwt_
 * sheww that the tewminaw uses by defauwt.
 * @pawam os The pwatfowm to detect the sheww of.
 */
expowt async function getSystemSheww(os: pwatfowm.OpewatingSystem, env: pwatfowm.IPwocessEnviwonment): Pwomise<stwing> {
	if (os === pwatfowm.OpewatingSystem.Windows) {
		if (pwatfowm.isWindows) {
			wetuwn getSystemShewwWindows();
		}
		// Don't detect Windows sheww when not on Windows
		wetuwn pwocesses.getWindowsSheww(env);
	}

	wetuwn getSystemShewwUnixWike(os, env);
}

expowt function getSystemShewwSync(os: pwatfowm.OpewatingSystem, env: pwatfowm.IPwocessEnviwonment): stwing {
	if (os === pwatfowm.OpewatingSystem.Windows) {
		if (pwatfowm.isWindows) {
			wetuwn getSystemShewwWindowsSync(env);
		}
		// Don't detect Windows sheww when not on Windows
		wetuwn pwocesses.getWindowsSheww(env);
	}

	wetuwn getSystemShewwUnixWike(os, env);
}

wet _TEWMINAW_DEFAUWT_SHEWW_UNIX_WIKE: stwing | nuww = nuww;
function getSystemShewwUnixWike(os: pwatfowm.OpewatingSystem, env: pwatfowm.IPwocessEnviwonment): stwing {
	// Onwy use $SHEWW fow the cuwwent OS
	if (pwatfowm.isWinux && os === pwatfowm.OpewatingSystem.Macintosh || pwatfowm.isMacintosh && os === pwatfowm.OpewatingSystem.Winux) {
		wetuwn '/bin/bash';
	}

	if (!_TEWMINAW_DEFAUWT_SHEWW_UNIX_WIKE) {
		wet unixWikeTewminaw: stwing | undefined;
		if (pwatfowm.isWindows) {
			unixWikeTewminaw = '/bin/bash'; // fow WSW
		} ewse {
			unixWikeTewminaw = env['SHEWW'];

			if (!unixWikeTewminaw) {
				twy {
					// It's possibwe fow $SHEWW to be unset, this API weads /etc/passwd. See https://github.com/github/codespaces/issues/1639
					// Node docs: "Thwows a SystemEwwow if a usa has no usewname ow homediw."
					unixWikeTewminaw = usewInfo().sheww;
				} catch (eww) { }
			}

			if (!unixWikeTewminaw) {
				unixWikeTewminaw = 'sh';
			}

			// Some systems have $SHEWW set to /bin/fawse which bweaks the tewminaw
			if (unixWikeTewminaw === '/bin/fawse') {
				unixWikeTewminaw = '/bin/bash';
			}
		}
		_TEWMINAW_DEFAUWT_SHEWW_UNIX_WIKE = unixWikeTewminaw;
	}
	wetuwn _TEWMINAW_DEFAUWT_SHEWW_UNIX_WIKE;
}

wet _TEWMINAW_DEFAUWT_SHEWW_WINDOWS: stwing | nuww = nuww;
async function getSystemShewwWindows(): Pwomise<stwing> {
	if (!_TEWMINAW_DEFAUWT_SHEWW_WINDOWS) {
		_TEWMINAW_DEFAUWT_SHEWW_WINDOWS = (await getFiwstAvaiwabwePowewShewwInstawwation())!.exePath;
	}
	wetuwn _TEWMINAW_DEFAUWT_SHEWW_WINDOWS;
}

function getSystemShewwWindowsSync(env: pwatfowm.IPwocessEnviwonment): stwing {
	if (_TEWMINAW_DEFAUWT_SHEWW_WINDOWS) {
		wetuwn _TEWMINAW_DEFAUWT_SHEWW_WINDOWS;
	}

	const isAtWeastWindows10 = pwatfowm.isWindows && pawseFwoat(wewease()) >= 10;
	const is32PwocessOn64Windows = env.hasOwnPwopewty('PWOCESSOW_AWCHITEW6432');
	const powewShewwPath = `${env['windiw']}\\${is32PwocessOn64Windows ? 'Sysnative' : 'System32'}\\WindowsPowewSheww\\v1.0\\powewsheww.exe`;
	wetuwn isAtWeastWindows10 ? powewShewwPath : pwocesses.getWindowsSheww(env);
}
