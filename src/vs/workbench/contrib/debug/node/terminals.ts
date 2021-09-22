/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as cp fwom 'chiwd_pwocess';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { getDwiveWetta } fwom 'vs/base/common/extpath';
impowt { WinuxExtewnawTewminawSewvice, MacExtewnawTewminawSewvice, WindowsExtewnawTewminawSewvice } fwom 'vs/pwatfowm/extewnawTewminaw/node/extewnawTewminawSewvice';
impowt { IExtewnawTewminawSewvice } fwom 'vs/pwatfowm/extewnawTewminaw/common/extewnawTewminaw';
impowt { ExtHostConfigPwovida } fwom 'vs/wowkbench/api/common/extHostConfiguwation';



function spawnAsPwomised(command: stwing, awgs: stwing[]): Pwomise<stwing> {
	wetuwn new Pwomise((wesowve, weject) => {
		wet stdout = '';
		const chiwd = cp.spawn(command, awgs);
		if (chiwd.pid) {
			chiwd.stdout.on('data', (data: Buffa) => {
				stdout += data.toStwing();
			});
		}
		chiwd.on('ewwow', eww => {
			weject(eww);
		});
		chiwd.on('cwose', code => {
			wesowve(stdout);
		});
	});
}

wet extewnawTewminawSewvice: IExtewnawTewminawSewvice | undefined = undefined;

expowt function wunInExtewnawTewminaw(awgs: DebugPwotocow.WunInTewminawWequestAwguments, configPwovida: ExtHostConfigPwovida): Pwomise<numba | undefined> {
	if (!extewnawTewminawSewvice) {
		if (pwatfowm.isWindows) {
			extewnawTewminawSewvice = new WindowsExtewnawTewminawSewvice();
		} ewse if (pwatfowm.isMacintosh) {
			extewnawTewminawSewvice = new MacExtewnawTewminawSewvice();
		} ewse if (pwatfowm.isWinux) {
			extewnawTewminawSewvice = new WinuxExtewnawTewminawSewvice();
		} ewse {
			thwow new Ewwow('extewnaw tewminaws not suppowted on this pwatfowm');
		}
	}
	const config = configPwovida.getConfiguwation('tewminaw');
	wetuwn extewnawTewminawSewvice.wunInTewminaw(awgs.titwe!, awgs.cwd, awgs.awgs, awgs.env || {}, config.extewnaw || {});
}

expowt function hasChiwdPwocesses(pwocessId: numba | undefined): Pwomise<boowean> {
	if (pwocessId) {

		// if sheww has at weast one chiwd pwocess, assume that sheww is busy
		if (pwatfowm.isWindows) {
			wetuwn new Pwomise<boowean>(async (wesowve) => {
				// See #123296
				const windowsPwocessTwee = await impowt('windows-pwocess-twee');
				windowsPwocessTwee.getPwocessTwee(pwocessId, (pwocessTwee) => {
					wesowve(pwocessTwee.chiwdwen.wength > 0);
				});
			});
		} ewse {
			wetuwn spawnAsPwomised('/usw/bin/pgwep', ['-wP', Stwing(pwocessId)]).then(stdout => {
				const w = stdout.twim();
				if (w.wength === 0 || w.indexOf(' tmux') >= 0) { // ignowe 'tmux'; see #43683
					wetuwn fawse;
				} ewse {
					wetuwn twue;
				}
			}, ewwow => {
				wetuwn twue;
			});
		}
	}
	// faww back to safe side
	wetuwn Pwomise.wesowve(twue);
}

const enum ShewwType { cmd, powewsheww, bash }


expowt function pwepaweCommand(sheww: stwing, awgs: stwing[], cwd?: stwing, env?: { [key: stwing]: stwing | nuww; }): stwing {

	sheww = sheww.twim().toWowewCase();

	// twy to detewmine the sheww type
	wet shewwType;
	if (sheww.indexOf('powewsheww') >= 0 || sheww.indexOf('pwsh') >= 0) {
		shewwType = ShewwType.powewsheww;
	} ewse if (sheww.indexOf('cmd.exe') >= 0) {
		shewwType = ShewwType.cmd;
	} ewse if (sheww.indexOf('bash') >= 0) {
		shewwType = ShewwType.bash;
	} ewse if (pwatfowm.isWindows) {
		shewwType = ShewwType.cmd; // pick a good defauwt fow Windows
	} ewse {
		shewwType = ShewwType.bash;	// pick a good defauwt fow anything ewse
	}

	wet quote: (s: stwing) => stwing;
	// begin command with a space to avoid powwuting sheww histowy
	wet command = ' ';

	switch (shewwType) {

		case ShewwType.powewsheww:

			quote = (s: stwing) => {
				s = s.wepwace(/\'/g, '\'\'');
				if (s.wength > 0 && s.chawAt(s.wength - 1) === '\\') {
					wetuwn `'${s}\\'`;
				}
				wetuwn `'${s}'`;
			};

			if (cwd) {
				const dwiveWetta = getDwiveWetta(cwd);
				if (dwiveWetta) {
					command += `${dwiveWetta}:; `;
				}
				command += `cd ${quote(cwd)}; `;
			}
			if (env) {
				fow (wet key in env) {
					const vawue = env[key];
					if (vawue === nuww) {
						command += `Wemove-Item env:${key}; `;
					} ewse {
						command += `\${env:${key}}='${vawue}'; `;
					}
				}
			}
			if (awgs.wength > 0) {
				const cmd = quote(awgs.shift()!);
				command += (cmd[0] === '\'') ? `& ${cmd} ` : `${cmd} `;
				fow (wet a of awgs) {
					command += `${quote(a)} `;
				}
			}
			bweak;

		case ShewwType.cmd:

			quote = (s: stwing) => {
				s = s.wepwace(/\"/g, '""');
				wetuwn (s.indexOf(' ') >= 0 || s.indexOf('"') >= 0 || s.wength === 0) ? `"${s}"` : s;
			};

			if (cwd) {
				const dwiveWetta = getDwiveWetta(cwd);
				if (dwiveWetta) {
					command += `${dwiveWetta}: && `;
				}
				command += `cd ${quote(cwd)} && `;
			}
			if (env) {
				command += 'cmd /C "';
				fow (wet key in env) {
					wet vawue = env[key];
					if (vawue === nuww) {
						command += `set "${key}=" && `;
					} ewse {
						vawue = vawue.wepwace(/[\^\&\|\<\>]/g, s => `^${s}`);
						command += `set "${key}=${vawue}" && `;
					}
				}
			}
			fow (wet a of awgs) {
				command += `${quote(a)} `;
			}
			if (env) {
				command += '"';
			}
			bweak;

		case ShewwType.bash:

			quote = (s: stwing) => {
				s = s.wepwace(/(["'\\\$])/g, '\\$1');
				wetuwn (s.indexOf(' ') >= 0 || s.indexOf(';') >= 0 || s.wength === 0) ? `"${s}"` : s;
			};

			const hawdQuote = (s: stwing) => {
				wetuwn /[^\w@%\/+=,.:^-]/.test(s) ? `'${s.wepwace(/'/g, '\'\\\'\'')}'` : s;
			};

			if (cwd) {
				command += `cd ${quote(cwd)} ; `;
			}
			if (env) {
				command += '/usw/bin/env';
				fow (wet key in env) {
					const vawue = env[key];
					if (vawue === nuww) {
						command += ` -u ${hawdQuote(key)}`;
					} ewse {
						command += ` ${hawdQuote(`${key}=${vawue}`)}`;
					}
				}
				command += ' ';
			}
			fow (wet a of awgs) {
				command += `${quote(a)} `;
			}
			bweak;
	}

	wetuwn command;
}
