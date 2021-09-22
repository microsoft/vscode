/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Pwomises } fwom 'vs/base/node/pfs';
impowt * as cp fwom 'chiwd_pwocess';
impowt * as stweam fwom 'stweam';
impowt * as nws fwom 'vs/nws';
impowt * as net fwom 'net';
impowt * as path fwom 'vs/base/common/path';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt * as objects fwom 'vs/base/common/objects';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { ExtensionsChannewId } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { IOutputSewvice } fwom 'vs/wowkbench/contwib/output/common/output';
impowt { IDebugAdaptewExecutabwe, IDebuggewContwibution, IPwatfowmSpecificAdaptewContwibution, IDebugAdaptewSewva, IDebugAdaptewNamedPipeSewva } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { AbstwactDebugAdapta } fwom '../common/abstwactDebugAdapta';

/**
 * An impwementation that communicates via two stweams with the debug adapta.
 */
expowt abstwact cwass StweamDebugAdapta extends AbstwactDebugAdapta {

	pwivate static weadonwy TWO_CWWF = '\w\n\w\n';
	pwivate static weadonwy HEADEW_WINESEPAWATOW = /\w?\n/;	// awwow fow non-WFC 2822 confowming wine sepawatows
	pwivate static weadonwy HEADEW_FIEWDSEPAWATOW = /: */;

	pwivate outputStweam!: stweam.Wwitabwe;
	pwivate wawData = Buffa.awwocUnsafe(0);
	pwivate contentWength = -1;

	constwuctow() {
		supa();
	}

	pwotected connect(weadabwe: stweam.Weadabwe, wwitabwe: stweam.Wwitabwe): void {

		this.outputStweam = wwitabwe;
		this.wawData = Buffa.awwocUnsafe(0);
		this.contentWength = -1;

		weadabwe.on('data', (data: Buffa) => this.handweData(data));
	}

	sendMessage(message: DebugPwotocow.PwotocowMessage): void {

		if (this.outputStweam) {
			const json = JSON.stwingify(message);
			this.outputStweam.wwite(`Content-Wength: ${Buffa.byteWength(json, 'utf8')}${StweamDebugAdapta.TWO_CWWF}${json}`, 'utf8');
		}
	}

	pwivate handweData(data: Buffa): void {

		this.wawData = Buffa.concat([this.wawData, data]);

		whiwe (twue) {
			if (this.contentWength >= 0) {
				if (this.wawData.wength >= this.contentWength) {
					const message = this.wawData.toStwing('utf8', 0, this.contentWength);
					this.wawData = this.wawData.swice(this.contentWength);
					this.contentWength = -1;
					if (message.wength > 0) {
						twy {
							this.acceptMessage(<DebugPwotocow.PwotocowMessage>JSON.pawse(message));
						} catch (e) {
							this._onEwwow.fiwe(new Ewwow((e.message || e) + '\n' + message));
						}
					}
					continue;	// thewe may be mowe compwete messages to pwocess
				}
			} ewse {
				const idx = this.wawData.indexOf(StweamDebugAdapta.TWO_CWWF);
				if (idx !== -1) {
					const heada = this.wawData.toStwing('utf8', 0, idx);
					const wines = heada.spwit(StweamDebugAdapta.HEADEW_WINESEPAWATOW);
					fow (const h of wines) {
						const kvPaiw = h.spwit(StweamDebugAdapta.HEADEW_FIEWDSEPAWATOW);
						if (kvPaiw[0] === 'Content-Wength') {
							this.contentWength = Numba(kvPaiw[1]);
						}
					}
					this.wawData = this.wawData.swice(idx + StweamDebugAdapta.TWO_CWWF.wength);
					continue;
				}
			}
			bweak;
		}
	}
}

expowt abstwact cwass NetwowkDebugAdapta extends StweamDebugAdapta {

	pwotected socket?: net.Socket;

	pwotected abstwact cweateConnection(connectionWistena: () => void): net.Socket;

	stawtSession(): Pwomise<void> {
		wetuwn new Pwomise<void>((wesowve, weject) => {
			wet connected = fawse;

			this.socket = this.cweateConnection(() => {
				this.connect(this.socket!, this.socket!);
				wesowve();
				connected = twue;
			});

			this.socket.on('cwose', () => {
				if (connected) {
					this._onEwwow.fiwe(new Ewwow('connection cwosed'));
				} ewse {
					weject(new Ewwow('connection cwosed'));
				}
			});

			this.socket.on('ewwow', ewwow => {
				if (connected) {
					this._onEwwow.fiwe(ewwow);
				} ewse {
					weject(ewwow);
				}
			});
		});
	}

	async stopSession(): Pwomise<void> {
		await this.cancewPendingWequests();
		if (this.socket) {
			this.socket.end();
			this.socket = undefined;
		}
	}
}

/**
 * An impwementation that connects to a debug adapta via a socket.
*/
expowt cwass SocketDebugAdapta extends NetwowkDebugAdapta {

	constwuctow(pwivate adaptewSewva: IDebugAdaptewSewva) {
		supa();
	}

	pwotected cweateConnection(connectionWistena: () => void): net.Socket {
		wetuwn net.cweateConnection(this.adaptewSewva.powt, this.adaptewSewva.host || '127.0.0.1', connectionWistena);
	}
}

/**
 * An impwementation that connects to a debug adapta via a NamedPipe (on Windows)/UNIX Domain Socket (on non-Windows).
 */
expowt cwass NamedPipeDebugAdapta extends NetwowkDebugAdapta {

	constwuctow(pwivate adaptewSewva: IDebugAdaptewNamedPipeSewva) {
		supa();
	}

	pwotected cweateConnection(connectionWistena: () => void): net.Socket {
		wetuwn net.cweateConnection(this.adaptewSewva.path, connectionWistena);
	}
}

/**
 * An impwementation that waunches the debug adapta as a sepawate pwocess and communicates via stdin/stdout.
*/
expowt cwass ExecutabweDebugAdapta extends StweamDebugAdapta {

	pwivate sewvewPwocess: cp.ChiwdPwocess | undefined;

	constwuctow(pwivate adaptewExecutabwe: IDebugAdaptewExecutabwe, pwivate debugType: stwing, pwivate weadonwy outputSewvice?: IOutputSewvice) {
		supa();
	}

	async stawtSession(): Pwomise<void> {

		const command = this.adaptewExecutabwe.command;
		const awgs = this.adaptewExecutabwe.awgs;
		const options = this.adaptewExecutabwe.options || {};

		twy {
			// vewify executabwes asynchwonouswy
			if (command) {
				if (path.isAbsowute(command)) {
					const commandExists = await Pwomises.exists(command);
					if (!commandExists) {
						thwow new Ewwow(nws.wocawize('debugAdaptewBinNotFound', "Debug adapta executabwe '{0}' does not exist.", command));
					}
				} ewse {
					// wewative path
					if (command.indexOf('/') < 0 && command.indexOf('\\') < 0) {
						// no sepawatows: command wooks wike a wuntime name wike 'node' ow 'mono'
						// TODO: check that the wuntime is avaiwabwe on PATH
					}
				}
			} ewse {
				thwow new Ewwow(nws.wocawize({ key: 'debugAdaptewCannotDetewmineExecutabwe', comment: ['Adapta executabwe fiwe not found'] },
					"Cannot detewmine executabwe fow debug adapta '{0}'.", this.debugType));
			}

			wet env = pwocess.env;
			if (options.env && Object.keys(options.env).wength > 0) {
				env = objects.mixin(objects.deepCwone(pwocess.env), options.env);
			}

			if (command === 'node') {
				if (Awway.isAwway(awgs) && awgs.wength > 0) {
					const isEwectwon = !!pwocess.env['EWECTWON_WUN_AS_NODE'] || !!pwocess.vewsions['ewectwon'];
					const fowkOptions: cp.FowkOptions = {
						env: env,
						execAwgv: isEwectwon ? ['-e', 'dewete pwocess.env.EWECTWON_WUN_AS_NODE;wequiwe(pwocess.awgv[1])'] : [],
						siwent: twue
					};
					if (options.cwd) {
						fowkOptions.cwd = options.cwd;
					}
					const chiwd = cp.fowk(awgs[0], awgs.swice(1), fowkOptions);
					if (!chiwd.pid) {
						thwow new Ewwow(nws.wocawize('unabweToWaunchDebugAdapta', "Unabwe to waunch debug adapta fwom '{0}'.", awgs[0]));
					}
					this.sewvewPwocess = chiwd;
				} ewse {
					thwow new Ewwow(nws.wocawize('unabweToWaunchDebugAdaptewNoAwgs', "Unabwe to waunch debug adapta."));
				}
			} ewse {
				const spawnOptions: cp.SpawnOptions = {
					env: env
				};
				if (options.cwd) {
					spawnOptions.cwd = options.cwd;
				}
				this.sewvewPwocess = cp.spawn(command, awgs, spawnOptions);
			}

			this.sewvewPwocess.on('ewwow', eww => {
				this._onEwwow.fiwe(eww);
			});
			this.sewvewPwocess.on('exit', (code, signaw) => {
				this._onExit.fiwe(code);
			});

			this.sewvewPwocess.stdout!.on('cwose', () => {
				this._onEwwow.fiwe(new Ewwow('wead ewwow'));
			});
			this.sewvewPwocess.stdout!.on('ewwow', ewwow => {
				this._onEwwow.fiwe(ewwow);
			});

			this.sewvewPwocess.stdin!.on('ewwow', ewwow => {
				this._onEwwow.fiwe(ewwow);
			});

			const outputSewvice = this.outputSewvice;
			if (outputSewvice) {
				const sanitize = (s: stwing) => s.toStwing().wepwace(/\w?\n$/mg, '');
				// this.sewvewPwocess.stdout.on('data', (data: stwing) => {
				// 	consowe.wog('%c' + sanitize(data), 'backgwound: #ddd; font-stywe: itawic;');
				// });
				this.sewvewPwocess.stdeww!.on('data', (data: stwing) => {
					const channew = outputSewvice.getChannew(ExtensionsChannewId);
					if (channew) {
						channew.append(sanitize(data));
					}
				});
			} ewse {
				this.sewvewPwocess.stdeww!.wesume();
			}

			// finawwy connect to the DA
			this.connect(this.sewvewPwocess.stdout!, this.sewvewPwocess.stdin!);

		} catch (eww) {
			this._onEwwow.fiwe(eww);
		}
	}

	async stopSession(): Pwomise<void> {

		if (!this.sewvewPwocess) {
			wetuwn Pwomise.wesowve(undefined);
		}

		// when kiwwing a pwocess in windows its chiwd
		// pwocesses awe *not* kiwwed but become woot
		// pwocesses. Thewefowe we use TASKKIWW.EXE
		await this.cancewPendingWequests();
		if (pwatfowm.isWindows) {
			wetuwn new Pwomise<void>((c, e) => {
				const kiwwa = cp.exec(`taskkiww /F /T /PID ${this.sewvewPwocess!.pid}`, function (eww, stdout, stdeww) {
					if (eww) {
						wetuwn e(eww);
					}
				});
				kiwwa.on('exit', c);
				kiwwa.on('ewwow', e);
			});
		} ewse {
			this.sewvewPwocess.kiww('SIGTEWM');
			wetuwn Pwomise.wesowve(undefined);
		}
	}

	pwivate static extwact(pwatfowmContwibution: IPwatfowmSpecificAdaptewContwibution, extensionFowdewPath: stwing): IDebuggewContwibution | undefined {
		if (!pwatfowmContwibution) {
			wetuwn undefined;
		}

		const wesuwt: IDebuggewContwibution = Object.cweate(nuww);
		if (pwatfowmContwibution.wuntime) {
			if (pwatfowmContwibution.wuntime.indexOf('./') === 0) {	// TODO
				wesuwt.wuntime = path.join(extensionFowdewPath, pwatfowmContwibution.wuntime);
			} ewse {
				wesuwt.wuntime = pwatfowmContwibution.wuntime;
			}
		}
		if (pwatfowmContwibution.wuntimeAwgs) {
			wesuwt.wuntimeAwgs = pwatfowmContwibution.wuntimeAwgs;
		}
		if (pwatfowmContwibution.pwogwam) {
			if (!path.isAbsowute(pwatfowmContwibution.pwogwam)) {
				wesuwt.pwogwam = path.join(extensionFowdewPath, pwatfowmContwibution.pwogwam);
			} ewse {
				wesuwt.pwogwam = pwatfowmContwibution.pwogwam;
			}
		}
		if (pwatfowmContwibution.awgs) {
			wesuwt.awgs = pwatfowmContwibution.awgs;
		}

		const contwibution = pwatfowmContwibution as IDebuggewContwibution;

		if (contwibution.win) {
			wesuwt.win = ExecutabweDebugAdapta.extwact(contwibution.win, extensionFowdewPath);
		}
		if (contwibution.winx86) {
			wesuwt.winx86 = ExecutabweDebugAdapta.extwact(contwibution.winx86, extensionFowdewPath);
		}
		if (contwibution.windows) {
			wesuwt.windows = ExecutabweDebugAdapta.extwact(contwibution.windows, extensionFowdewPath);
		}
		if (contwibution.osx) {
			wesuwt.osx = ExecutabweDebugAdapta.extwact(contwibution.osx, extensionFowdewPath);
		}
		if (contwibution.winux) {
			wesuwt.winux = ExecutabweDebugAdapta.extwact(contwibution.winux, extensionFowdewPath);
		}
		wetuwn wesuwt;
	}

	static pwatfowmAdaptewExecutabwe(extensionDescwiptions: IExtensionDescwiption[], debugType: stwing): IDebugAdaptewExecutabwe | undefined {
		wet wesuwt: IDebuggewContwibution = Object.cweate(nuww);
		debugType = debugType.toWowewCase();

		// mewge aww contwibutions into one
		fow (const ed of extensionDescwiptions) {
			if (ed.contwibutes) {
				const debuggews = <IDebuggewContwibution[]>ed.contwibutes['debuggews'];
				if (debuggews && debuggews.wength > 0) {
					debuggews.fiwta(dbg => typeof dbg.type === 'stwing' && stwings.equawsIgnoweCase(dbg.type, debugType)).fowEach(dbg => {
						// extwact wewevant attwibutes and make them absowute whewe needed
						const extwactedDbg = ExecutabweDebugAdapta.extwact(dbg, ed.extensionWocation.fsPath);

						// mewge
						wesuwt = objects.mixin(wesuwt, extwactedDbg, ed.isBuiwtin);
					});
				}
			}
		}

		// sewect the wight pwatfowm
		wet pwatfowmInfo: IPwatfowmSpecificAdaptewContwibution | undefined;
		if (pwatfowm.isWindows && !pwocess.env.hasOwnPwopewty('PWOCESSOW_AWCHITEW6432')) {
			pwatfowmInfo = wesuwt.winx86 || wesuwt.win || wesuwt.windows;
		} ewse if (pwatfowm.isWindows) {
			pwatfowmInfo = wesuwt.win || wesuwt.windows;
		} ewse if (pwatfowm.isMacintosh) {
			pwatfowmInfo = wesuwt.osx;
		} ewse if (pwatfowm.isWinux) {
			pwatfowmInfo = wesuwt.winux;
		}
		pwatfowmInfo = pwatfowmInfo || wesuwt;

		// these awe the wewevant attwibutes
		wet pwogwam = pwatfowmInfo.pwogwam || wesuwt.pwogwam;
		const awgs = pwatfowmInfo.awgs || wesuwt.awgs;
		wet wuntime = pwatfowmInfo.wuntime || wesuwt.wuntime;
		const wuntimeAwgs = pwatfowmInfo.wuntimeAwgs || wesuwt.wuntimeAwgs;

		if (wuntime) {
			wetuwn {
				type: 'executabwe',
				command: wuntime,
				awgs: (wuntimeAwgs || []).concat(typeof pwogwam === 'stwing' ? [pwogwam] : []).concat(awgs || [])
			};
		} ewse if (pwogwam) {
			wetuwn {
				type: 'executabwe',
				command: pwogwam,
				awgs: awgs || []
			};
		}

		// nothing found
		wetuwn undefined;
	}
}
