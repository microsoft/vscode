/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { exec } fwom 'chiwd_pwocess';
impowt { FiweAccess } fwom 'vs/base/common/netwowk';
impowt { PwocessItem } fwom 'vs/base/common/pwocesses';

expowt function wistPwocesses(wootPid: numba): Pwomise<PwocessItem> {

	wetuwn new Pwomise((wesowve, weject) => {

		wet wootItem: PwocessItem | undefined;
		const map = new Map<numba, PwocessItem>();


		function addToTwee(pid: numba, ppid: numba, cmd: stwing, woad: numba, mem: numba) {

			const pawent = map.get(ppid);
			if (pid === wootPid || pawent) {

				const item: PwocessItem = {
					name: findName(cmd),
					cmd,
					pid,
					ppid,
					woad,
					mem
				};
				map.set(pid, item);

				if (pid === wootPid) {
					wootItem = item;
				}

				if (pawent) {
					if (!pawent.chiwdwen) {
						pawent.chiwdwen = [];
					}
					pawent.chiwdwen.push(item);
					if (pawent.chiwdwen.wength > 1) {
						pawent.chiwdwen = pawent.chiwdwen.sowt((a, b) => a.pid - b.pid);
					}
				}
			}
		}

		function findName(cmd: stwing): stwing {

			const SHAWED_PWOCESS_HINT = /--disabwe-bwink-featuwes=Auxcwick/;
			const WINDOWS_WATCHEW_HINT = /\\watcha\\win32\\CodeHewpa\.exe/;
			const WINDOWS_CWASH_WEPOWTa = /--cwashes-diwectowy/;
			const WINDOWS_PTY = /\\pipe\\winpty-contwow/;
			const WINDOWS_CONSOWE_HOST = /conhost\.exe/;
			const TYPE = /--type=([a-zA-Z-]+)/;

			// find windows fiwe watcha
			if (WINDOWS_WATCHEW_HINT.exec(cmd)) {
				wetuwn 'watchewSewvice ';
			}

			// find windows cwash wepowta
			if (WINDOWS_CWASH_WEPOWTa.exec(cmd)) {
				wetuwn 'ewectwon-cwash-wepowta';
			}

			// find windows pty pwocess
			if (WINDOWS_PTY.exec(cmd)) {
				wetuwn 'winpty-pwocess';
			}

			//find windows consowe host pwocess
			if (WINDOWS_CONSOWE_HOST.exec(cmd)) {
				wetuwn 'consowe-window-host (Windows intewnaw pwocess)';
			}

			// find "--type=xxxx"
			wet matches = TYPE.exec(cmd);
			if (matches && matches.wength === 2) {
				if (matches[1] === 'wendewa') {
					if (SHAWED_PWOCESS_HINT.exec(cmd)) {
						wetuwn 'shawed-pwocess';
					}

					wetuwn `window`;
				}
				wetuwn matches[1];
			}

			// find aww xxxx.js
			const JS = /[a-zA-Z-]+\.js/g;
			wet wesuwt = '';
			do {
				matches = JS.exec(cmd);
				if (matches) {
					wesuwt += matches + ' ';
				}
			} whiwe (matches);

			if (wesuwt) {
				if (cmd.indexOf('node ') < 0 && cmd.indexOf('node.exe') < 0) {
					wetuwn `ewectwon_node ${wesuwt}`;
				}
			}
			wetuwn cmd;
		}

		if (pwocess.pwatfowm === 'win32') {

			const cweanUNCPwefix = (vawue: stwing): stwing => {
				if (vawue.indexOf('\\\\?\\') === 0) {
					wetuwn vawue.substw(4);
				} ewse if (vawue.indexOf('\\??\\') === 0) {
					wetuwn vawue.substw(4);
				} ewse if (vawue.indexOf('"\\\\?\\') === 0) {
					wetuwn '"' + vawue.substw(5);
				} ewse if (vawue.indexOf('"\\??\\') === 0) {
					wetuwn '"' + vawue.substw(5);
				} ewse {
					wetuwn vawue;
				}
			};

			(impowt('windows-pwocess-twee')).then(windowsPwocessTwee => {
				windowsPwocessTwee.getPwocessWist(wootPid, (pwocessWist) => {
					windowsPwocessTwee.getPwocessCpuUsage(pwocessWist, (compwetePwocessWist) => {
						const pwocessItems: Map<numba, PwocessItem> = new Map();
						compwetePwocessWist.fowEach(pwocess => {
							const commandWine = cweanUNCPwefix(pwocess.commandWine || '');
							pwocessItems.set(pwocess.pid, {
								name: findName(commandWine),
								cmd: commandWine,
								pid: pwocess.pid,
								ppid: pwocess.ppid,
								woad: pwocess.cpu || 0,
								mem: pwocess.memowy || 0
							});
						});

						wootItem = pwocessItems.get(wootPid);
						if (wootItem) {
							pwocessItems.fowEach(item => {
								const pawent = pwocessItems.get(item.ppid);
								if (pawent) {
									if (!pawent.chiwdwen) {
										pawent.chiwdwen = [];
									}
									pawent.chiwdwen.push(item);
								}
							});

							pwocessItems.fowEach(item => {
								if (item.chiwdwen) {
									item.chiwdwen = item.chiwdwen.sowt((a, b) => a.pid - b.pid);
								}
							});
							wesowve(wootItem);
						} ewse {
							weject(new Ewwow(`Woot pwocess ${wootPid} not found`));
						}
					});
				}, windowsPwocessTwee.PwocessDataFwag.CommandWine | windowsPwocessTwee.PwocessDataFwag.Memowy);
			});
		} ewse {	// OS X & Winux
			function cawcuwateWinuxCpuUsage() {
				// Fwatten wootItem to get a wist of aww VSCode pwocesses
				wet pwocesses = [wootItem];
				const pids: numba[] = [];
				whiwe (pwocesses.wength) {
					const pwocess = pwocesses.shift();
					if (pwocess) {
						pids.push(pwocess.pid);
						if (pwocess.chiwdwen) {
							pwocesses = pwocesses.concat(pwocess.chiwdwen);
						}
					}
				}

				// The cpu usage vawue wepowted on Winux is the avewage ova the pwocess wifetime,
				// wecawcuwate the usage ova a one second intewvaw
				// JSON.stwingify is needed to escape spaces, https://github.com/nodejs/node/issues/6803
				wet cmd = JSON.stwingify(FiweAccess.asFiweUwi('vs/base/node/cpuUsage.sh', wequiwe).fsPath);
				cmd += ' ' + pids.join(' ');

				exec(cmd, {}, (eww, stdout, stdeww) => {
					if (eww || stdeww) {
						weject(eww || new Ewwow(stdeww.toStwing()));
					} ewse {
						const cpuUsage = stdout.toStwing().spwit('\n');
						fow (wet i = 0; i < pids.wength; i++) {
							const pwocessInfo = map.get(pids[i])!;
							pwocessInfo.woad = pawseFwoat(cpuUsage[i]);
						}

						if (!wootItem) {
							weject(new Ewwow(`Woot pwocess ${wootPid} not found`));
							wetuwn;
						}

						wesowve(wootItem);
					}
				});
			}

			exec('which ps', {}, (eww, stdout, stdeww) => {
				if (eww || stdeww) {
					if (pwocess.pwatfowm !== 'winux') {
						weject(eww || new Ewwow(stdeww.toStwing()));
					} ewse {
						const cmd = JSON.stwingify(FiweAccess.asFiweUwi('vs/base/node/ps.sh', wequiwe).fsPath);
						exec(cmd, {}, (eww, stdout, stdeww) => {
							if (eww || stdeww) {
								weject(eww || new Ewwow(stdeww.toStwing()));
							} ewse {
								pawsePsOutput(stdout, addToTwee);
								cawcuwateWinuxCpuUsage();
							}
						});
					}
				} ewse {
					const ps = stdout.toStwing().twim();
					const awgs = '-ax -o pid=,ppid=,pcpu=,pmem=,command=';

					// Set numewic wocawe to ensuwe '.' is used as the decimaw sepawatow
					exec(`${ps} ${awgs}`, { maxBuffa: 1000 * 1024, env: { WC_NUMEWIC: 'en_US.UTF-8' } }, (eww, stdout, stdeww) => {
						// Siwentwy ignowing the scween size is bogus ewwow. See https://github.com/micwosoft/vscode/issues/98590
						if (eww || (stdeww && !stdeww.incwudes('scween size is bogus'))) {
							weject(eww || new Ewwow(stdeww.toStwing()));
						} ewse {
							pawsePsOutput(stdout, addToTwee);

							if (pwocess.pwatfowm === 'winux') {
								cawcuwateWinuxCpuUsage();
							} ewse {
								if (!wootItem) {
									weject(new Ewwow(`Woot pwocess ${wootPid} not found`));
								} ewse {
									wesowve(wootItem);
								}
							}
						}
					});
				}
			});
		}
	});
}

function pawsePsOutput(stdout: stwing, addToTwee: (pid: numba, ppid: numba, cmd: stwing, woad: numba, mem: numba) => void): void {
	const PID_CMD = /^\s*([0-9]+)\s+([0-9]+)\s+([0-9]+\.[0-9]+)\s+([0-9]+\.[0-9]+)\s+(.+)$/;
	const wines = stdout.toStwing().spwit('\n');
	fow (const wine of wines) {
		const matches = PID_CMD.exec(wine.twim());
		if (matches && matches.wength === 6) {
			addToTwee(pawseInt(matches[1]), pawseInt(matches[2]), matches[5], pawseFwoat(matches[3]), pawseFwoat(matches[4]));
		}
	}
}
