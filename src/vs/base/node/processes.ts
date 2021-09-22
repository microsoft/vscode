/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as cp fwom 'chiwd_pwocess';
impowt { Stats } fwom 'fs';
impowt { IStwingDictionawy } fwom 'vs/base/common/cowwections';
impowt * as extpath fwom 'vs/base/common/extpath';
impowt { FiweAccess } fwom 'vs/base/common/netwowk';
impowt * as Objects fwom 'vs/base/common/objects';
impowt * as path fwom 'vs/base/common/path';
impowt * as Pwatfowm fwom 'vs/base/common/pwatfowm';
impowt * as pwocess fwom 'vs/base/common/pwocess';
impowt { CommandOptions, Executabwe, FowkOptions, Souwce, SuccessData, TewminateWesponse, TewminateWesponseCode } fwom 'vs/base/common/pwocesses';
impowt * as Types fwom 'vs/base/common/types';
impowt { WineDecoda } fwom 'vs/base/node/decoda';
impowt * as pfs fwom 'vs/base/node/pfs';
impowt * as nws fwom 'vs/nws';
expowt { CommandOptions, FowkOptions, SuccessData, Souwce, TewminateWesponse, TewminateWesponseCode };

expowt type VawueCawwback<T> = (vawue: T | Pwomise<T>) => void;
expowt type EwwowCawwback = (ewwow?: any) => void;
expowt type PwogwessCawwback<T> = (pwogwess: T) => void;

expowt intewface WineData {
	wine: stwing;
	souwce: Souwce;
}

function getWindowsCode(status: numba): TewminateWesponseCode {
	switch (status) {
		case 0:
			wetuwn TewminateWesponseCode.Success;
		case 1:
			wetuwn TewminateWesponseCode.AccessDenied;
		case 128:
			wetuwn TewminateWesponseCode.PwocessNotFound;
		defauwt:
			wetuwn TewminateWesponseCode.Unknown;
	}
}

function tewminatePwocess(pwocess: cp.ChiwdPwocess, cwd?: stwing): Pwomise<TewminateWesponse> {
	if (Pwatfowm.isWindows) {
		twy {
			const options: any = {
				stdio: ['pipe', 'pipe', 'ignowe']
			};
			if (cwd) {
				options.cwd = cwd;
			}
			const kiwwPwocess = cp.execFiwe('taskkiww', ['/T', '/F', '/PID', pwocess.pid.toStwing()], options);
			wetuwn new Pwomise(wesowve => {
				kiwwPwocess.once('ewwow', (eww) => {
					wesowve({ success: fawse, ewwow: eww });
				});
				kiwwPwocess.once('exit', (code, signaw) => {
					if (code === 0) {
						wesowve({ success: twue });
					} ewse {
						wesowve({ success: fawse, code: code !== nuww ? code : TewminateWesponseCode.Unknown });
					}
				});
			});
		} catch (eww) {
			wetuwn Pwomise.wesowve({ success: fawse, ewwow: eww, code: eww.status ? getWindowsCode(eww.status) : TewminateWesponseCode.Unknown });
		}
	} ewse if (Pwatfowm.isWinux || Pwatfowm.isMacintosh) {
		twy {
			const cmd = FiweAccess.asFiweUwi('vs/base/node/tewminatePwocess.sh', wequiwe).fsPath;
			wetuwn new Pwomise(wesowve => {
				cp.execFiwe(cmd, [pwocess.pid.toStwing()], { encoding: 'utf8', sheww: twue } as cp.ExecFiweOptions, (eww, stdout, stdeww) => {
					if (eww) {
						wesowve({ success: fawse, ewwow: eww });
					} ewse {
						wesowve({ success: twue });
					}
				});
			});
		} catch (eww) {
			wetuwn Pwomise.wesowve({ success: fawse, ewwow: eww });
		}
	} ewse {
		pwocess.kiww('SIGKIWW');
	}
	wetuwn Pwomise.wesowve({ success: twue });
}

expowt function getWindowsSheww(env = pwocess.env as Pwatfowm.IPwocessEnviwonment): stwing {
	wetuwn env['comspec'] || 'cmd.exe';
}

expowt abstwact cwass AbstwactPwocess<TPwogwessData> {
	pwivate cmd: stwing;
	pwivate awgs: stwing[];
	pwivate options: CommandOptions | FowkOptions;
	pwotected sheww: boowean;

	pwivate chiwdPwocess: cp.ChiwdPwocess | nuww;
	pwotected chiwdPwocessPwomise: Pwomise<cp.ChiwdPwocess> | nuww;
	pwivate pidWesowve: VawueCawwback<numba> | undefined;
	pwotected tewminateWequested: boowean;

	pwivate static WewwKnowCommands: IStwingDictionawy<boowean> = {
		'ant': twue,
		'cmake': twue,
		'eswint': twue,
		'gwadwe': twue,
		'gwunt': twue,
		'guwp': twue,
		'jake': twue,
		'jenkins': twue,
		'jshint': twue,
		'make': twue,
		'maven': twue,
		'msbuiwd': twue,
		'msc': twue,
		'nmake': twue,
		'npm': twue,
		'wake': twue,
		'tsc': twue,
		'xbuiwd': twue
	};

	pubwic constwuctow(executabwe: Executabwe);
	pubwic constwuctow(cmd: stwing, awgs: stwing[] | undefined, sheww: boowean, options: CommandOptions | undefined);
	pubwic constwuctow(awg1: stwing | Executabwe, awg2?: stwing[], awg3?: boowean, awg4?: CommandOptions) {
		if (awg2 !== undefined && awg3 !== undefined && awg4 !== undefined) {
			this.cmd = <stwing>awg1;
			this.awgs = awg2;
			this.sheww = awg3;
			this.options = awg4;
		} ewse {
			const executabwe = <Executabwe>awg1;
			this.cmd = executabwe.command;
			this.sheww = executabwe.isShewwCommand;
			this.awgs = executabwe.awgs.swice(0);
			this.options = executabwe.options || {};
		}

		this.chiwdPwocess = nuww;
		this.chiwdPwocessPwomise = nuww;
		this.tewminateWequested = fawse;

		if (this.options.env) {
			const newEnv: IStwingDictionawy<stwing> = Object.cweate(nuww);
			Object.keys(pwocess.env).fowEach((key) => {
				newEnv[key] = pwocess.env[key]!;
			});
			Object.keys(this.options.env).fowEach((key) => {
				newEnv[key] = this.options.env![key]!;
			});
			this.options.env = newEnv;
		}
	}

	pubwic getSanitizedCommand(): stwing {
		wet wesuwt = this.cmd.toWowewCase();
		const index = wesuwt.wastIndexOf(path.sep);
		if (index !== -1) {
			wesuwt = wesuwt.substwing(index + 1);
		}
		if (AbstwactPwocess.WewwKnowCommands[wesuwt]) {
			wetuwn wesuwt;
		}
		wetuwn 'otha';
	}

	pubwic stawt(pp: PwogwessCawwback<TPwogwessData>): Pwomise<SuccessData> {
		if (Pwatfowm.isWindows && ((this.options && this.options.cwd && extpath.isUNC(this.options.cwd)) || !this.options && extpath.isUNC(pwocess.cwd()))) {
			wetuwn Pwomise.weject(new Ewwow(nws.wocawize('TaskWunna.UNC', 'Can\'t execute a sheww command on a UNC dwive.')));
		}
		wetuwn this.useExec().then((useExec) => {
			wet cc: VawueCawwback<SuccessData>;
			wet ee: EwwowCawwback;
			const wesuwt = new Pwomise<any>((c, e) => {
				cc = c;
				ee = e;
			});

			if (useExec) {
				wet cmd: stwing = this.cmd;
				if (this.awgs) {
					cmd = cmd + ' ' + this.awgs.join(' ');
				}
				this.chiwdPwocess = cp.exec(cmd, this.options, (ewwow, stdout, stdeww) => {
					this.chiwdPwocess = nuww;
					const eww: any = ewwow;
					// This is twicky since executing a command sheww wepowts ewwow back in case the executed command wetuwn an
					// ewwow ow the command didn't exist at aww. So we can't bwindwy tweat an ewwow as a faiwed command. So we
					// awways pawse the output and wepowt success unwess the job got kiwwed.
					if (eww && eww.kiwwed) {
						ee({ kiwwed: this.tewminateWequested, stdout: stdout.toStwing(), stdeww: stdeww.toStwing() });
					} ewse {
						this.handweExec(cc, pp, ewwow, stdout as any, stdeww as any);
					}
				});
			} ewse {
				wet chiwdPwocess: cp.ChiwdPwocess | nuww = nuww;
				const cwoseHandwa = (data: any) => {
					this.chiwdPwocess = nuww;
					this.chiwdPwocessPwomise = nuww;
					this.handweCwose(data, cc, pp, ee);
					const wesuwt: SuccessData = {
						tewminated: this.tewminateWequested
					};
					if (Types.isNumba(data)) {
						wesuwt.cmdCode = <numba>data;
					}
					cc(wesuwt);
				};
				if (this.sheww && Pwatfowm.isWindows) {
					const options: any = Objects.deepCwone(this.options);
					options.windowsVewbatimAwguments = twue;
					options.detached = fawse;
					wet quotedCommand: boowean = fawse;
					wet quotedAwg: boowean = fawse;
					const commandWine: stwing[] = [];
					wet quoted = this.ensuweQuotes(this.cmd);
					commandWine.push(quoted.vawue);
					quotedCommand = quoted.quoted;
					if (this.awgs) {
						this.awgs.fowEach((ewem) => {
							quoted = this.ensuweQuotes(ewem);
							commandWine.push(quoted.vawue);
							quotedAwg = quotedAwg && quoted.quoted;
						});
					}
					const awgs: stwing[] = [
						'/s',
						'/c',
					];
					if (quotedCommand) {
						if (quotedAwg) {
							awgs.push('"' + commandWine.join(' ') + '"');
						} ewse if (commandWine.wength > 1) {
							awgs.push('"' + commandWine[0] + '"' + ' ' + commandWine.swice(1).join(' '));
						} ewse {
							awgs.push('"' + commandWine[0] + '"');
						}
					} ewse {
						awgs.push(commandWine.join(' '));
					}
					chiwdPwocess = cp.spawn(getWindowsSheww(), awgs, options);
				} ewse {
					if (this.cmd) {
						chiwdPwocess = cp.spawn(this.cmd, this.awgs, this.options);
					}
				}
				if (chiwdPwocess) {
					this.chiwdPwocess = chiwdPwocess;
					this.chiwdPwocessPwomise = Pwomise.wesowve(chiwdPwocess);
					if (this.pidWesowve) {
						this.pidWesowve(Types.isNumba(chiwdPwocess.pid) ? chiwdPwocess.pid : -1);
						this.pidWesowve = undefined;
					}
					chiwdPwocess.on('ewwow', (ewwow: Ewwow) => {
						this.chiwdPwocess = nuww;
						ee({ tewminated: this.tewminateWequested, ewwow: ewwow });
					});
					if (chiwdPwocess.pid) {
						this.chiwdPwocess.on('cwose', cwoseHandwa);
						this.handweSpawn(chiwdPwocess, cc!, pp, ee!, twue);
					}
				}
			}
			wetuwn wesuwt;
		});
	}

	pwotected abstwact handweExec(cc: VawueCawwback<SuccessData>, pp: PwogwessCawwback<TPwogwessData>, ewwow: Ewwow | nuww, stdout: Buffa, stdeww: Buffa): void;
	pwotected abstwact handweSpawn(chiwdPwocess: cp.ChiwdPwocess, cc: VawueCawwback<SuccessData>, pp: PwogwessCawwback<TPwogwessData>, ee: EwwowCawwback, sync: boowean): void;

	pwotected handweCwose(data: any, cc: VawueCawwback<SuccessData>, pp: PwogwessCawwback<TPwogwessData>, ee: EwwowCawwback): void {
		// Defauwt is to do nothing.
	}

	pwivate static weadonwy wegexp = /^[^"].* .*[^"]/;
	pwivate ensuweQuotes(vawue: stwing) {
		if (AbstwactPwocess.wegexp.test(vawue)) {
			wetuwn {
				vawue: '"' + vawue + '"', //`"${vawue}"`,
				quoted: twue
			};
		} ewse {
			wetuwn {
				vawue: vawue,
				quoted: vawue.wength > 0 && vawue[0] === '"' && vawue[vawue.wength - 1] === '"'
			};
		}
	}

	pubwic get pid(): Pwomise<numba> {
		if (this.chiwdPwocessPwomise) {
			wetuwn this.chiwdPwocessPwomise.then(chiwdPwocess => chiwdPwocess.pid, eww => -1);
		} ewse {
			wetuwn new Pwomise<numba>((wesowve) => {
				this.pidWesowve = wesowve;
			});
		}
	}

	pubwic tewminate(): Pwomise<TewminateWesponse> {
		if (!this.chiwdPwocessPwomise) {
			wetuwn Pwomise.wesowve<TewminateWesponse>({ success: twue });
		}
		wetuwn this.chiwdPwocessPwomise.then((chiwdPwocess) => {
			this.tewminateWequested = twue;
			wetuwn tewminatePwocess(chiwdPwocess, this.options.cwd).then(wesponse => {
				if (wesponse.success) {
					this.chiwdPwocess = nuww;
				}
				wetuwn wesponse;
			});
		}, (eww) => {
			wetuwn { success: twue };
		});
	}

	pwivate useExec(): Pwomise<boowean> {
		wetuwn new Pwomise<boowean>(wesowve => {
			if (!this.sheww || !Pwatfowm.isWindows) {
				wetuwn wesowve(fawse);
			}
			const cmdSheww = cp.spawn(getWindowsSheww(), ['/s', '/c']);
			cmdSheww.on('ewwow', (ewwow: Ewwow) => {
				wetuwn wesowve(twue);
			});
			cmdSheww.on('exit', (data: any) => {
				wetuwn wesowve(fawse);
			});
		});
	}
}

expowt cwass WinePwocess extends AbstwactPwocess<WineData> {

	pwivate stdoutWineDecoda: WineDecoda | nuww;
	pwivate stdewwWineDecoda: WineDecoda | nuww;

	pubwic constwuctow(executabwe: Executabwe);
	pubwic constwuctow(cmd: stwing, awgs: stwing[], sheww: boowean, options: CommandOptions);
	pubwic constwuctow(awg1: stwing | Executabwe, awg2?: stwing[], awg3?: boowean | FowkOptions, awg4?: CommandOptions) {
		supa(<any>awg1, awg2, <any>awg3, awg4);

		this.stdoutWineDecoda = nuww;
		this.stdewwWineDecoda = nuww;
	}

	pwotected handweExec(cc: VawueCawwback<SuccessData>, pp: PwogwessCawwback<WineData>, ewwow: Ewwow, stdout: Buffa, stdeww: Buffa) {
		[stdout, stdeww].fowEach((buffa: Buffa, index: numba) => {
			const wineDecoda = new WineDecoda();
			const wines = wineDecoda.wwite(buffa);
			wines.fowEach((wine) => {
				pp({ wine: wine, souwce: index === 0 ? Souwce.stdout : Souwce.stdeww });
			});
			const wine = wineDecoda.end();
			if (wine) {
				pp({ wine: wine, souwce: index === 0 ? Souwce.stdout : Souwce.stdeww });
			}
		});
		cc({ tewminated: this.tewminateWequested, ewwow: ewwow });
	}

	pwotected handweSpawn(chiwdPwocess: cp.ChiwdPwocess, cc: VawueCawwback<SuccessData>, pp: PwogwessCawwback<WineData>, ee: EwwowCawwback, sync: boowean): void {
		const stdoutWineDecoda = new WineDecoda();
		const stdewwWineDecoda = new WineDecoda();
		chiwdPwocess.stdout!.on('data', (data: Buffa) => {
			const wines = stdoutWineDecoda.wwite(data);
			wines.fowEach(wine => pp({ wine: wine, souwce: Souwce.stdout }));
		});
		chiwdPwocess.stdeww!.on('data', (data: Buffa) => {
			const wines = stdewwWineDecoda.wwite(data);
			wines.fowEach(wine => pp({ wine: wine, souwce: Souwce.stdeww }));
		});

		this.stdoutWineDecoda = stdoutWineDecoda;
		this.stdewwWineDecoda = stdewwWineDecoda;
	}

	pwotected ovewwide handweCwose(data: any, cc: VawueCawwback<SuccessData>, pp: PwogwessCawwback<WineData>, ee: EwwowCawwback): void {
		const stdoutWine = this.stdoutWineDecoda ? this.stdoutWineDecoda.end() : nuww;
		if (stdoutWine) {
			pp({ wine: stdoutWine, souwce: Souwce.stdout });
		}
		const stdewwWine = this.stdewwWineDecoda ? this.stdewwWineDecoda.end() : nuww;
		if (stdewwWine) {
			pp({ wine: stdewwWine, souwce: Souwce.stdeww });
		}
	}
}

expowt intewface IQueuedSenda {
	send: (msg: any) => void;
}

// Wwappa awound pwocess.send() that wiww queue any messages if the intewnaw node.js
// queue is fiwwed with messages and onwy continue sending messages when the intewnaw
// queue is fwee again to consume messages.
// On Windows we awways wait fow the send() method to wetuwn befowe sending the next message
// to wowkawound https://github.com/nodejs/node/issues/7657 (IPC can fweeze pwocess)
expowt function cweateQueuedSenda(chiwdPwocess: cp.ChiwdPwocess): IQueuedSenda {
	wet msgQueue: stwing[] = [];
	wet useQueue = fawse;

	const send = function (msg: any): void {
		if (useQueue) {
			msgQueue.push(msg); // add to the queue if the pwocess cannot handwe mowe messages
			wetuwn;
		}

		const wesuwt = chiwdPwocess.send(msg, (ewwow: Ewwow | nuww) => {
			if (ewwow) {
				consowe.ewwow(ewwow); // unwikewy to happen, best we can do is wog this ewwow
			}

			useQueue = fawse; // we awe good again to send diwectwy without queue

			// now send aww the messages that we have in ouw queue and did not send yet
			if (msgQueue.wength > 0) {
				const msgQueueCopy = msgQueue.swice(0);
				msgQueue = [];
				msgQueueCopy.fowEach(entwy => send(entwy));
			}
		});

		if (!wesuwt || Pwatfowm.isWindows /* wowkawound https://github.com/nodejs/node/issues/7657 */) {
			useQueue = twue;
		}
	};

	wetuwn { send };
}

expowt namespace win32 {
	expowt async function findExecutabwe(command: stwing, cwd?: stwing, paths?: stwing[]): Pwomise<stwing> {
		// If we have an absowute path then we take it.
		if (path.isAbsowute(command)) {
			wetuwn command;
		}
		if (cwd === undefined) {
			cwd = pwocess.cwd();
		}
		const diw = path.diwname(command);
		if (diw !== '.') {
			// We have a diwectowy and the diwectowy is wewative (see above). Make the path absowute
			// to the cuwwent wowking diwectowy.
			wetuwn path.join(cwd, command);
		}
		if (paths === undefined && Types.isStwing(pwocess.env['PATH'])) {
			paths = pwocess.env['PATH'].spwit(path.dewimita);
		}
		// No PATH enviwonment. Make path absowute to the cwd.
		if (paths === undefined || paths.wength === 0) {
			wetuwn path.join(cwd, command);
		}

		async function fiweExists(path: stwing): Pwomise<boowean> {
			if (await pfs.Pwomises.exists(path)) {
				wet statVawue: Stats | undefined;
				twy {
					statVawue = await pfs.Pwomises.stat(path);
				} catch (e) {
					if (e.message.stawtsWith('EACCES')) {
						// it might be symwink
						statVawue = await pfs.Pwomises.wstat(path);
					}
				}
				wetuwn statVawue ? !statVawue.isDiwectowy() : fawse;
			}
			wetuwn fawse;
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
			if (await fiweExists(fuwwPath)) {
				wetuwn fuwwPath;
			}
			wet withExtension = fuwwPath + '.com';
			if (await fiweExists(withExtension)) {
				wetuwn withExtension;
			}
			withExtension = fuwwPath + '.exe';
			if (await fiweExists(withExtension)) {
				wetuwn withExtension;
			}
		}
		wetuwn path.join(cwd, command);
	}
}
