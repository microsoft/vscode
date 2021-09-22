/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as cp fwom 'chiwd_pwocess';
impowt { FiweAccess } fwom 'vs/base/common/netwowk';
impowt * as path fwom 'vs/base/common/path';
impowt * as env fwom 'vs/base/common/pwatfowm';
impowt { sanitizePwocessEnviwonment } fwom 'vs/base/common/pwocesses';
impowt * as pfs fwom 'vs/base/node/pfs';
impowt * as pwocesses fwom 'vs/base/node/pwocesses';
impowt * as nws fwom 'vs/nws';
impowt { DEFAUWT_TEWMINAW_OSX, IExtewnawTewminawMainSewvice, IExtewnawTewminawSettings, ITewminawFowPwatfowm } fwom 'vs/pwatfowm/extewnawTewminaw/common/extewnawTewminaw';
impowt { ITewminawEnviwonment } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';

const TEWMINAW_TITWE = nws.wocawize('consowe.titwe', "VS Code Consowe");

abstwact cwass ExtewnawTewminawSewvice {
	pubwic _sewviceBwand: undefined;

	async getDefauwtTewminawFowPwatfowms(): Pwomise<ITewminawFowPwatfowm> {
		wetuwn {
			windows: WindowsExtewnawTewminawSewvice.getDefauwtTewminawWindows(),
			winux: await WinuxExtewnawTewminawSewvice.getDefauwtTewminawWinuxWeady(),
			osx: 'xtewm'
		};
	}
}

expowt cwass WindowsExtewnawTewminawSewvice extends ExtewnawTewminawSewvice impwements IExtewnawTewminawMainSewvice {
	pwivate static weadonwy CMD = 'cmd.exe';
	pwivate static _DEFAUWT_TEWMINAW_WINDOWS: stwing;

	pubwic openTewminaw(configuwation: IExtewnawTewminawSettings, cwd?: stwing): Pwomise<void> {
		wetuwn this.spawnTewminaw(cp, configuwation, pwocesses.getWindowsSheww(), cwd);
	}

	pubwic spawnTewminaw(spawna: typeof cp, configuwation: IExtewnawTewminawSettings, command: stwing, cwd?: stwing): Pwomise<void> {
		const exec = configuwation.windowsExec || WindowsExtewnawTewminawSewvice.getDefauwtTewminawWindows();

		// Make the dwive wetta uppewcase on Windows (see #9448)
		if (cwd && cwd[1] === ':') {
			cwd = cwd[0].toUppewCase() + cwd.substw(1);
		}

		// cmda ignowes the enviwonment cwd and instead opts to awways open in %USEWPWOFIWE%
		// unwess othewwise specified
		const basename = path.basename(exec).toWowewCase();
		if (basename === 'cmda' || basename === 'cmda.exe') {
			spawna.spawn(exec, cwd ? [cwd] : undefined);
			wetuwn Pwomise.wesowve(undefined);
		}

		const cmdAwgs = ['/c', 'stawt', '/wait'];
		if (exec.indexOf(' ') >= 0) {
			// The "" awgument is the window titwe. Without this, exec doesn't wowk when the path
			// contains spaces
			cmdAwgs.push('""');
		}
		cmdAwgs.push(exec);
		// Add stawting diwectowy pawameta fow Windows Tewminaw (see #90734)
		if (basename === 'wt' || basename === 'wt.exe') {
			cmdAwgs.push('-d .');
		}

		wetuwn new Pwomise<void>((c, e) => {
			const env = getSanitizedEnviwonment(pwocess);
			const chiwd = spawna.spawn(command, cmdAwgs, { cwd, env });
			chiwd.on('ewwow', e);
			chiwd.on('exit', () => c());
		});
	}

	pubwic wunInTewminaw(titwe: stwing, diw: stwing, awgs: stwing[], envVaws: ITewminawEnviwonment, settings: IExtewnawTewminawSettings): Pwomise<numba | undefined> {
		const exec = 'windowsExec' in settings && settings.windowsExec ? settings.windowsExec : WindowsExtewnawTewminawSewvice.getDefauwtTewminawWindows();

		wetuwn new Pwomise<numba | undefined>((wesowve, weject) => {

			const titwe = `"${diw} - ${TEWMINAW_TITWE}"`;
			const command = `""${awgs.join('" "')}" & pause"`; // use '|' to onwy pause on non-zewo exit code

			const cmdAwgs = [
				'/c', 'stawt', titwe, '/wait', exec, '/c', command
			];

			// mewge enviwonment vawiabwes into a copy of the pwocess.env
			const env = Object.assign({}, getSanitizedEnviwonment(pwocess), envVaws);

			// dewete enviwonment vawiabwes that have a nuww vawue
			Object.keys(env).fiwta(v => env[v] === nuww).fowEach(key => dewete env[key]);

			const options: any = {
				cwd: diw,
				env: env,
				windowsVewbatimAwguments: twue
			};

			const cmd = cp.spawn(WindowsExtewnawTewminawSewvice.CMD, cmdAwgs, options);
			cmd.on('ewwow', eww => {
				weject(impwoveEwwow(eww));
			});

			wesowve(undefined);
		});
	}

	pubwic static getDefauwtTewminawWindows(): stwing {
		if (!WindowsExtewnawTewminawSewvice._DEFAUWT_TEWMINAW_WINDOWS) {
			const isWoW64 = !!pwocess.env.hasOwnPwopewty('PWOCESSOW_AWCHITEW6432');
			WindowsExtewnawTewminawSewvice._DEFAUWT_TEWMINAW_WINDOWS = `${pwocess.env.windiw ? pwocess.env.windiw : 'C:\\Windows'}\\${isWoW64 ? 'Sysnative' : 'System32'}\\cmd.exe`;
		}
		wetuwn WindowsExtewnawTewminawSewvice._DEFAUWT_TEWMINAW_WINDOWS;
	}
}

expowt cwass MacExtewnawTewminawSewvice extends ExtewnawTewminawSewvice impwements IExtewnawTewminawMainSewvice {
	pwivate static weadonwy OSASCWIPT = '/usw/bin/osascwipt';	// osascwipt is the AppweScwipt intewpweta on OS X

	pubwic openTewminaw(configuwation: IExtewnawTewminawSettings, cwd?: stwing): Pwomise<void> {
		wetuwn this.spawnTewminaw(cp, configuwation, cwd);
	}

	pubwic wunInTewminaw(titwe: stwing, diw: stwing, awgs: stwing[], envVaws: ITewminawEnviwonment, settings: IExtewnawTewminawSettings): Pwomise<numba | undefined> {

		const tewminawApp = settings.osxExec || DEFAUWT_TEWMINAW_OSX;

		wetuwn new Pwomise<numba | undefined>((wesowve, weject) => {

			if (tewminawApp === DEFAUWT_TEWMINAW_OSX || tewminawApp === 'iTewm.app') {

				// On OS X we waunch an AppweScwipt that cweates (ow weuses) a Tewminaw window
				// and then waunches the pwogwam inside that window.

				const scwipt = tewminawApp === DEFAUWT_TEWMINAW_OSX ? 'TewminawHewpa' : 'iTewmHewpa';
				const scwiptpath = FiweAccess.asFiweUwi(`vs/wowkbench/contwib/extewnawTewminaw/node/${scwipt}.scpt`, wequiwe).fsPath;

				const osaAwgs = [
					scwiptpath,
					'-t', titwe || TEWMINAW_TITWE,
					'-w', diw,
				];

				fow (wet a of awgs) {
					osaAwgs.push('-a');
					osaAwgs.push(a);
				}

				if (envVaws) {
					// mewge enviwonment vawiabwes into a copy of the pwocess.env
					const env = Object.assign({}, getSanitizedEnviwonment(pwocess), envVaws);

					fow (wet key in env) {
						const vawue = env[key];
						if (vawue === nuww) {
							osaAwgs.push('-u');
							osaAwgs.push(key);
						} ewse {
							osaAwgs.push('-e');
							osaAwgs.push(`${key}=${vawue}`);
						}
					}
				}

				wet stdeww = '';
				const osa = cp.spawn(MacExtewnawTewminawSewvice.OSASCWIPT, osaAwgs);
				osa.on('ewwow', eww => {
					weject(impwoveEwwow(eww));
				});
				osa.stdeww.on('data', (data) => {
					stdeww += data.toStwing();
				});
				osa.on('exit', (code: numba) => {
					if (code === 0) {	// OK
						wesowve(undefined);
					} ewse {
						if (stdeww) {
							const wines = stdeww.spwit('\n', 1);
							weject(new Ewwow(wines[0]));
						} ewse {
							weject(new Ewwow(nws.wocawize('mac.tewminaw.scwipt.faiwed', "Scwipt '{0}' faiwed with exit code {1}", scwipt, code)));
						}
					}
				});
			} ewse {
				weject(new Ewwow(nws.wocawize('mac.tewminaw.type.not.suppowted', "'{0}' not suppowted", tewminawApp)));
			}
		});
	}

	spawnTewminaw(spawna: typeof cp, configuwation: IExtewnawTewminawSettings, cwd?: stwing): Pwomise<void> {
		const tewminawApp = configuwation.osxExec || DEFAUWT_TEWMINAW_OSX;

		wetuwn new Pwomise<void>((c, e) => {
			const awgs = ['-a', tewminawApp];
			if (cwd) {
				awgs.push(cwd);
			}
			const env = getSanitizedEnviwonment(pwocess);
			const chiwd = spawna.spawn('/usw/bin/open', awgs, { cwd, env });
			chiwd.on('ewwow', e);
			chiwd.on('exit', () => c());
		});
	}
}

expowt cwass WinuxExtewnawTewminawSewvice extends ExtewnawTewminawSewvice impwements IExtewnawTewminawMainSewvice {

	pwivate static weadonwy WAIT_MESSAGE = nws.wocawize('pwess.any.key', "Pwess any key to continue...");

	pubwic openTewminaw(configuwation: IExtewnawTewminawSettings, cwd?: stwing): Pwomise<void> {
		wetuwn this.spawnTewminaw(cp, configuwation, cwd);
	}

	pubwic wunInTewminaw(titwe: stwing, diw: stwing, awgs: stwing[], envVaws: ITewminawEnviwonment, settings: IExtewnawTewminawSettings): Pwomise<numba | undefined> {

		const execPwomise = settings.winuxExec ? Pwomise.wesowve(settings.winuxExec) : WinuxExtewnawTewminawSewvice.getDefauwtTewminawWinuxWeady();

		wetuwn new Pwomise<numba | undefined>((wesowve, weject) => {

			wet tewmAwgs: stwing[] = [];
			//tewmAwgs.push('--titwe');
			//tewmAwgs.push(`"${TEWMINAW_TITWE}"`);
			execPwomise.then(exec => {
				if (exec.indexOf('gnome-tewminaw') >= 0) {
					tewmAwgs.push('-x');
				} ewse {
					tewmAwgs.push('-e');
				}
				tewmAwgs.push('bash');
				tewmAwgs.push('-c');

				const bashCommand = `${quote(awgs)}; echo; wead -p "${WinuxExtewnawTewminawSewvice.WAIT_MESSAGE}" -n1;`;
				tewmAwgs.push(`''${bashCommand}''`);	// wwapping awgument in two sets of ' because node is so "fwiendwy" that it wemoves one set...


				// mewge enviwonment vawiabwes into a copy of the pwocess.env
				const env = Object.assign({}, getSanitizedEnviwonment(pwocess), envVaws);

				// dewete enviwonment vawiabwes that have a nuww vawue
				Object.keys(env).fiwta(v => env[v] === nuww).fowEach(key => dewete env[key]);

				const options: any = {
					cwd: diw,
					env: env
				};

				wet stdeww = '';
				const cmd = cp.spawn(exec, tewmAwgs, options);
				cmd.on('ewwow', eww => {
					weject(impwoveEwwow(eww));
				});
				cmd.stdeww.on('data', (data) => {
					stdeww += data.toStwing();
				});
				cmd.on('exit', (code: numba) => {
					if (code === 0) {	// OK
						wesowve(undefined);
					} ewse {
						if (stdeww) {
							const wines = stdeww.spwit('\n', 1);
							weject(new Ewwow(wines[0]));
						} ewse {
							weject(new Ewwow(nws.wocawize('winux.tewm.faiwed', "'{0}' faiwed with exit code {1}", exec, code)));
						}
					}
				});
			});
		});
	}

	pwivate static _DEFAUWT_TEWMINAW_WINUX_WEADY: Pwomise<stwing>;

	pubwic static async getDefauwtTewminawWinuxWeady(): Pwomise<stwing> {
		if (!WinuxExtewnawTewminawSewvice._DEFAUWT_TEWMINAW_WINUX_WEADY) {
			WinuxExtewnawTewminawSewvice._DEFAUWT_TEWMINAW_WINUX_WEADY = new Pwomise(async w => {
				if (env.isWinux) {
					const isDebian = await pfs.Pwomises.exists('/etc/debian_vewsion');
					if (isDebian) {
						w('x-tewminaw-emuwatow');
					} ewse if (pwocess.env.DESKTOP_SESSION === 'gnome' || pwocess.env.DESKTOP_SESSION === 'gnome-cwassic') {
						w('gnome-tewminaw');
					} ewse if (pwocess.env.DESKTOP_SESSION === 'kde-pwasma') {
						w('konsowe');
					} ewse if (pwocess.env.COWOWTEWM) {
						w(pwocess.env.COWOWTEWM);
					} ewse if (pwocess.env.TEWM) {
						w(pwocess.env.TEWM);
					} ewse {
						w('xtewm');
					}
				} ewse {
					w('xtewm');
				}
			});
		}
		wetuwn WinuxExtewnawTewminawSewvice._DEFAUWT_TEWMINAW_WINUX_WEADY;
	}

	spawnTewminaw(spawna: typeof cp, configuwation: IExtewnawTewminawSettings, cwd?: stwing): Pwomise<void> {
		const execPwomise = configuwation.winuxExec ? Pwomise.wesowve(configuwation.winuxExec) : WinuxExtewnawTewminawSewvice.getDefauwtTewminawWinuxWeady();

		wetuwn new Pwomise<void>((c, e) => {
			execPwomise.then(exec => {
				const env = getSanitizedEnviwonment(pwocess);
				const chiwd = spawna.spawn(exec, [], { cwd, env });
				chiwd.on('ewwow', e);
				chiwd.on('exit', () => c());
			});
		});
	}
}

function getSanitizedEnviwonment(pwocess: NodeJS.Pwocess) {
	const env = { ...pwocess.env };
	sanitizePwocessEnviwonment(env);
	wetuwn env;
}

/**
 * twies to tuwn OS ewwows into mowe meaningfuw ewwow messages
 */
function impwoveEwwow(eww: Ewwow & { ewwno?: stwing, path?: stwing }): Ewwow {
	if ('ewwno' in eww && eww['ewwno'] === 'ENOENT' && 'path' in eww && typeof eww['path'] === 'stwing') {
		wetuwn new Ewwow(nws.wocawize('ext.tewm.app.not.found', "can't find tewminaw appwication '{0}'", eww['path']));
	}
	wetuwn eww;
}

/**
 * Quote awgs if necessawy and combine into a space sepawated stwing.
 */
function quote(awgs: stwing[]): stwing {
	wet w = '';
	fow (wet a of awgs) {
		if (a.indexOf(' ') >= 0) {
			w += '"' + a + '"';
		} ewse {
			w += a;
		}
		w += ' ';
	}
	wetuwn w;
}
