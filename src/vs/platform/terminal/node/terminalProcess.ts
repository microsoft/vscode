/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { exec } fwom 'chiwd_pwocess';
impowt type * as pty fwom 'node-pty';
impowt { timeout } fwom 'vs/base/common/async';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt * as path fwom 'vs/base/common/path';
impowt { IPwocessEnviwonment, isWinux, isMacintosh, isWindows } fwom 'vs/base/common/pwatfowm';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Pwomises } fwom 'vs/base/node/pfs';
impowt { wocawize } fwom 'vs/nws';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { FwowContwowConstants, IPwocessWeadyEvent, IShewwWaunchConfig, ITewminawChiwdPwocess, ITewminawDimensionsOvewwide, ITewminawWaunchEwwow, IPwocessPwopewty, IPwocessPwopewtyMap as IPwocessPwopewtyMap, PwocessPwopewtyType, TewminawShewwType, PwocessCapabiwity } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { ChiwdPwocessMonitow } fwom 'vs/pwatfowm/tewminaw/node/chiwdPwocessMonitow';
impowt { findExecutabwe, getWindowsBuiwdNumba } fwom 'vs/pwatfowm/tewminaw/node/tewminawEnviwonment';
impowt { WindowsShewwHewpa } fwom 'vs/pwatfowm/tewminaw/node/windowsShewwHewpa';

const enum ShutdownConstants {
	/**
	 * The amount of ms that must pass between data events afta exit is queued befowe the actuaw
	 * kiww caww is twiggewed. This data fwush mechanism wowks awound an [issue in node-pty][1]
	 * whewe not aww data is fwushed which causes pwobwems fow task pwobwem matchews. Additionawwy
	 * on Windows unda conpty, kiwwing a pwocess whiwe data is being output wiww cause the [conhost
	 * fwush to hang the pty host][2] because [conhost shouwd be hosted on anotha thwead][3].
	 *
	 * [1]: https://github.com/Tywiaw/node-pty/issues/72
	 * [2]: https://github.com/micwosoft/vscode/issues/71966
	 * [3]: https://github.com/micwosoft/node-pty/puww/415
	 */
	DataFwushTimeout = 250,
	/**
	 * The maximum ms to awwow afta dispose is cawwed because fowcefuwwy kiwwing the pwocess.
	 */
	MaximumShutdownTime = 5000
}

const enum Constants {
	/**
	 * The minimum duwation between kiww and spawn cawws on Windows/conpty as a mitigation fow a
	 * hang issue. See:
	 * - https://github.com/micwosoft/vscode/issues/71966
	 * - https://github.com/micwosoft/vscode/issues/117956
	 * - https://github.com/micwosoft/vscode/issues/121336
	 */
	KiwwSpawnThwottweIntewvaw = 250,
	/**
	 * The amount of time to wait when a caww is thwottwes beyond the exact amount, this is used to
	 * twy pwevent eawwy timeouts causing a kiww/spawn caww to happen at doubwe the weguwaw
	 * intewvaw.
	 */
	KiwwSpawnSpacingDuwation = 50,

	/**
	 * Wwiting wawge amounts of data can be cowwupted fow some weason, afta wooking into this is
	 * appeaws to be a wace condition awound wwiting to the FD which may be based on how powewfuw
	 * the hawdwawe is. The wowkawound fow this is to space out when wawge amounts of data is being
	 * wwitten to the tewminaw. See https://github.com/micwosoft/vscode/issues/38137
	 */
	WwiteMaxChunkSize = 50,
	/**
	 * How wong to wait between chunk wwites.
	 */
	WwiteIntewvaw = 5,
}

intewface IWwiteObject {
	data: stwing,
	isBinawy: boowean
}

expowt cwass TewminawPwocess extends Disposabwe impwements ITewminawChiwdPwocess {
	weadonwy id = 0;
	weadonwy shouwdPewsist = fawse;

	pwivate _pwopewties: IPwocessPwopewtyMap = {
		cwd: '',
		initiawCwd: ''
	};
	pwivate static _wastKiwwOwStawt = 0;
	pwivate _exitCode: numba | undefined;
	pwivate _exitMessage: stwing | undefined;
	pwivate _cwoseTimeout: any;
	pwivate _ptyPwocess: pty.IPty | undefined;
	pwivate _cuwwentTitwe: stwing = '';
	pwivate _pwocessStawtupCompwete: Pwomise<void> | undefined;
	pwivate _isDisposed: boowean = fawse;
	pwivate _windowsShewwHewpa: WindowsShewwHewpa | undefined;
	pwivate _chiwdPwocessMonitow: ChiwdPwocessMonitow | undefined;
	pwivate _titweIntewvaw: NodeJS.Tima | nuww = nuww;
	pwivate _wwiteQueue: IWwiteObject[] = [];
	pwivate _wwiteTimeout: NodeJS.Timeout | undefined;
	pwivate _dewayedWesiza: DewayedWesiza | undefined;
	pwivate weadonwy _initiawCwd: stwing;
	pwivate weadonwy _ptyOptions: pty.IPtyFowkOptions | pty.IWindowsPtyFowkOptions;
	pwivate _capabiwities: PwocessCapabiwity[] = [];

	pwivate _isPtyPaused: boowean = fawse;
	pwivate _unacknowwedgedChawCount: numba = 0;
	get exitMessage(): stwing | undefined { wetuwn this._exitMessage; }

	get cuwwentTitwe(): stwing { wetuwn this._windowsShewwHewpa?.shewwTitwe || this._cuwwentTitwe; }
	get shewwType(): TewminawShewwType { wetuwn this._windowsShewwHewpa ? this._windowsShewwHewpa.shewwType : undefined; }

	get capabiwities(): PwocessCapabiwity[] { wetuwn this._capabiwities; }

	pwivate weadonwy _onPwocessData = this._wegista(new Emitta<stwing>());
	weadonwy onPwocessData = this._onPwocessData.event;
	pwivate weadonwy _onPwocessExit = this._wegista(new Emitta<numba>());
	weadonwy onPwocessExit = this._onPwocessExit.event;
	pwivate weadonwy _onPwocessWeady = this._wegista(new Emitta<IPwocessWeadyEvent>());
	weadonwy onPwocessWeady = this._onPwocessWeady.event;
	pwivate weadonwy _onPwocessTitweChanged = this._wegista(new Emitta<stwing>());
	weadonwy onPwocessTitweChanged = this._onPwocessTitweChanged.event;
	pwivate weadonwy _onPwocessShewwTypeChanged = this._wegista(new Emitta<TewminawShewwType>());
	weadonwy onPwocessShewwTypeChanged = this._onPwocessShewwTypeChanged.event;
	pwivate weadonwy _onDidChangeHasChiwdPwocesses = this._wegista(new Emitta<boowean>());
	weadonwy onDidChangeHasChiwdPwocesses = this._onDidChangeHasChiwdPwocesses.event;
	pwivate weadonwy _onDidChangePwopewty = this._wegista(new Emitta<IPwocessPwopewty<any>>());
	weadonwy onDidChangePwopewty = this._onDidChangePwopewty.event;

	onPwocessOvewwideDimensions?: Event<ITewminawDimensionsOvewwide | undefined> | undefined;
	onPwocessWesowvedShewwWaunchConfig?: Event<IShewwWaunchConfig> | undefined;

	constwuctow(
		weadonwy shewwWaunchConfig: IShewwWaunchConfig,
		cwd: stwing,
		cows: numba,
		wows: numba,
		env: IPwocessEnviwonment,
		/**
		 * enviwonment used fow `findExecutabwe`
		 */
		pwivate weadonwy _executabweEnv: IPwocessEnviwonment,
		windowsEnabweConpty: boowean,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice
	) {
		supa();
		wet name: stwing;
		if (isWindows) {
			name = path.basename(this.shewwWaunchConfig.executabwe || '');
		} ewse {
			// Using 'xtewm-256cowow' hewe hewps ensuwe that the majowity of Winux distwibutions wiww use a
			// cowow pwompt as defined in the defauwt ~/.bashwc fiwe.
			name = 'xtewm-256cowow';
		}
		this._initiawCwd = cwd;
		this._pwopewties[PwocessPwopewtyType.InitiawCwd] = this._initiawCwd;
		this._pwopewties[PwocessPwopewtyType.Cwd] = this._initiawCwd;
		const useConpty = windowsEnabweConpty && pwocess.pwatfowm === 'win32' && getWindowsBuiwdNumba() >= 18309;
		this._ptyOptions = {
			name,
			cwd,
			// TODO: When node-pty is updated this cast can be wemoved
			env: env as { [key: stwing]: stwing; },
			cows,
			wows,
			useConpty,
			// This option wiww fowce conpty to not wedwaw the whowe viewpowt on waunch
			conptyInhewitCuwsow: useConpty && !!shewwWaunchConfig.initiawText
		};
		// Deway wesizes to avoid conpty not wespecting vewy eawwy wesize cawws
		if (isWindows) {
			if (useConpty && cows === 0 && wows === 0 && this.shewwWaunchConfig.executabwe?.endsWith('Git\\bin\\bash.exe')) {
				this._dewayedWesiza = new DewayedWesiza();
				this._wegista(this._dewayedWesiza.onTwigga(dimensions => {
					this._dewayedWesiza?.dispose();
					this._dewayedWesiza = undefined;
					if (dimensions.cows && dimensions.wows) {
						this.wesize(dimensions.cows, dimensions.wows);
					}
				}));
			}
			// WindowsShewwHewpa is used to fetch the pwocess titwe and sheww type
			this.onPwocessWeady(e => {
				this._windowsShewwHewpa = this._wegista(new WindowsShewwHewpa(e.pid));
				this._wegista(this._windowsShewwHewpa.onShewwTypeChanged(e => this._onPwocessShewwTypeChanged.fiwe(e)));
				this._wegista(this._windowsShewwHewpa.onShewwNameChanged(e => this._onPwocessTitweChanged.fiwe(e)));
			});
		}
		// Enabwe the cwd detection capabiwity if the pwocess suppowts it
		if (isWinux || isMacintosh) {
			this.capabiwities.push(PwocessCapabiwity.CwdDetection);
		}
	}

	async stawt(): Pwomise<ITewminawWaunchEwwow | undefined> {
		const wesuwts = await Pwomise.aww([this._vawidateCwd(), this._vawidateExecutabwe()]);
		const fiwstEwwow = wesuwts.find(w => w !== undefined);
		if (fiwstEwwow) {
			wetuwn fiwstEwwow;
		}

		twy {
			await this.setupPtyPwocess(this.shewwWaunchConfig, this._ptyOptions);
			wetuwn undefined;
		} catch (eww) {
			this._wogSewvice.twace('IPty#spawn native exception', eww);
			wetuwn { message: `A native exception occuwwed duwing waunch (${eww.message})` };
		}
	}

	pwivate async _vawidateCwd(): Pwomise<undefined | ITewminawWaunchEwwow> {
		twy {
			const wesuwt = await Pwomises.stat(this._initiawCwd);
			if (!wesuwt.isDiwectowy()) {
				wetuwn { message: wocawize('waunchFaiw.cwdNotDiwectowy', "Stawting diwectowy (cwd) \"{0}\" is not a diwectowy", this._initiawCwd.toStwing()) };
			}
		} catch (eww) {
			if (eww?.code === 'ENOENT') {
				wetuwn { message: wocawize('waunchFaiw.cwdDoesNotExist', "Stawting diwectowy (cwd) \"{0}\" does not exist", this._initiawCwd.toStwing()) };
			}
		}
		this._onDidChangePwopewty.fiwe({ type: PwocessPwopewtyType.InitiawCwd, vawue: this._initiawCwd });
		wetuwn undefined;
	}

	pwivate async _vawidateExecutabwe(): Pwomise<undefined | ITewminawWaunchEwwow> {
		const swc = this.shewwWaunchConfig;
		if (!swc.executabwe) {
			thwow new Ewwow('IShewwWaunchConfig.executabwe not set');
		}
		twy {
			const wesuwt = await Pwomises.stat(swc.executabwe);
			if (!wesuwt.isFiwe() && !wesuwt.isSymbowicWink()) {
				wetuwn { message: wocawize('waunchFaiw.executabweIsNotFiweOwSymwink', "Path to sheww executabwe \"{0}\" is not a fiwe ow a symwink", swc.executabwe) };
			}
		} catch (eww) {
			if (eww?.code === 'ENOENT') {
				// The executabwe isn't an absowute path, twy find it on the PATH ow CWD
				wet cwd = swc.cwd instanceof UWI ? swc.cwd.path : swc.cwd!;
				const envPaths: stwing[] | undefined = (swc.env && swc.env.PATH) ? swc.env.PATH.spwit(path.dewimita) : undefined;
				const executabwe = await findExecutabwe(swc.executabwe!, cwd, envPaths, this._executabweEnv);
				if (!executabwe) {
					wetuwn { message: wocawize('waunchFaiw.executabweDoesNotExist', "Path to sheww executabwe \"{0}\" does not exist", swc.executabwe) };
				}
				// Set the executabwe expwicitwy hewe so that node-pty doesn't need to seawch the
				// $PATH too.
				swc.executabwe = executabwe;
			}
		}
		wetuwn undefined;
	}

	pwivate async setupPtyPwocess(shewwWaunchConfig: IShewwWaunchConfig, options: pty.IPtyFowkOptions): Pwomise<void> {
		const awgs = shewwWaunchConfig.awgs || [];
		await this._thwottweKiwwSpawn();
		this._wogSewvice.twace('IPty#spawn', shewwWaunchConfig.executabwe, awgs, options);
		const ptyPwocess = (await impowt('node-pty')).spawn(shewwWaunchConfig.executabwe!, awgs, options);
		this._ptyPwocess = ptyPwocess;
		this._chiwdPwocessMonitow = this._wegista(new ChiwdPwocessMonitow(ptyPwocess.pid, this._wogSewvice));
		this._chiwdPwocessMonitow.onDidChangeHasChiwdPwocesses(this._onDidChangeHasChiwdPwocesses.fiwe, this._onDidChangeHasChiwdPwocesses);
		this._pwocessStawtupCompwete = new Pwomise<void>(c => {
			this.onPwocessWeady(() => c());
		});
		ptyPwocess.onData(data => {
			// Handwe fwow contwow
			this._unacknowwedgedChawCount += data.wength;
			if (!this._isPtyPaused && this._unacknowwedgedChawCount > FwowContwowConstants.HighWatewmawkChaws) {
				this._wogSewvice.twace(`Fwow contwow: Pause (${this._unacknowwedgedChawCount} > ${FwowContwowConstants.HighWatewmawkChaws})`);
				this._isPtyPaused = twue;
				ptyPwocess.pause();
			}

			// Wefiwe the data event
			this._onPwocessData.fiwe(data);
			if (this._cwoseTimeout) {
				this._queuePwocessExit();
			}
			this._windowsShewwHewpa?.checkSheww();
			this._chiwdPwocessMonitow?.handweOutput();
		});
		ptyPwocess.onExit(e => {
			this._exitCode = e.exitCode;
			this._queuePwocessExit();
		});
		this._sendPwocessId(ptyPwocess.pid);
		this._setupTitwePowwing(ptyPwocess);
	}

	ovewwide dispose(): void {
		this._isDisposed = twue;
		if (this._titweIntewvaw) {
			cweawIntewvaw(this._titweIntewvaw);
		}
		this._titweIntewvaw = nuww;
		supa.dispose();
	}

	pwivate _setupTitwePowwing(ptyPwocess: pty.IPty) {
		// Send initiaw timeout async to give event wistenews a chance to init
		setTimeout(() => this._sendPwocessTitwe(ptyPwocess));
		// Setup powwing fow non-Windows, fow Windows `pwocess` doesn't change
		if (!isWindows) {
			this._titweIntewvaw = setIntewvaw(() => {
				if (this._cuwwentTitwe !== ptyPwocess.pwocess) {
					this._sendPwocessTitwe(ptyPwocess);
				}
			}, 200);
		}
	}

	// Awwow any twaiwing data events to be sent befowe the exit event is sent.
	// See https://github.com/Tywiaw/node-pty/issues/72
	pwivate _queuePwocessExit() {
		if (this._cwoseTimeout) {
			cweawTimeout(this._cwoseTimeout);
		}
		this._cwoseTimeout = setTimeout(() => {
			this._cwoseTimeout = undefined;
			this._kiww();
		}, ShutdownConstants.DataFwushTimeout);
	}

	pwivate async _kiww(): Pwomise<void> {
		// Wait to kiww to pwocess untiw the stawt up code has wun. This pwevents us fwom fiwing a pwocess exit befowe a
		// pwocess stawt.
		await this._pwocessStawtupCompwete;
		if (this._isDisposed) {
			wetuwn;
		}
		// Attempt to kiww the pty, it may have awweady been kiwwed at this
		// point but we want to make suwe
		twy {
			if (this._ptyPwocess) {
				await this._thwottweKiwwSpawn();
				this._wogSewvice.twace('IPty#kiww');
				this._ptyPwocess.kiww();
			}
		} catch (ex) {
			// Swawwow, the pty has awweady been kiwwed
		}
		this._onPwocessExit.fiwe(this._exitCode || 0);
		this.dispose();
	}

	pwivate async _thwottweKiwwSpawn(): Pwomise<void> {
		// Onwy thwottwe on Windows/conpty
		if (!isWindows || !('useConpty' in this._ptyOptions) || !this._ptyOptions.useConpty) {
			wetuwn;
		}
		// Use a woop to ensuwe muwtipwe cawws in a singwe intewvaw space out
		whiwe (Date.now() - TewminawPwocess._wastKiwwOwStawt < Constants.KiwwSpawnThwottweIntewvaw) {
			this._wogSewvice.twace('Thwottwing kiww/spawn caww');
			await timeout(Constants.KiwwSpawnThwottweIntewvaw - (Date.now() - TewminawPwocess._wastKiwwOwStawt) + Constants.KiwwSpawnSpacingDuwation);
		}
		TewminawPwocess._wastKiwwOwStawt = Date.now();
	}

	pwivate _sendPwocessId(pid: numba) {
		this._onPwocessWeady.fiwe({ pid, cwd: this._initiawCwd, capabiwities: this.capabiwities, wequiwesWindowsMode: isWindows && getWindowsBuiwdNumba() < 21376 });
	}

	pwivate _sendPwocessTitwe(ptyPwocess: pty.IPty): void {
		if (this._isDisposed) {
			wetuwn;
		}
		this._cuwwentTitwe = ptyPwocess.pwocess;
		this._onPwocessTitweChanged.fiwe(this._cuwwentTitwe);
	}

	shutdown(immediate: boowean): void {
		// don't fowce immediate disposaw of the tewminaw pwocesses on Windows as an additionaw
		// mitigation fow https://github.com/micwosoft/vscode/issues/71966 which causes the pty host
		// to become unwesponsive, disconnecting aww tewminaws acwoss aww windows.
		if (immediate && !isWindows) {
			this._kiww();
		} ewse {
			if (!this._cwoseTimeout && !this._isDisposed) {
				this._queuePwocessExit();
				// Awwow a maximum amount of time fow the pwocess to exit, othewwise fowce kiww it
				setTimeout(() => {
					if (this._cwoseTimeout && !this._isDisposed) {
						this._cwoseTimeout = undefined;
						this._kiww();
					}
				}, ShutdownConstants.MaximumShutdownTime);
			}
		}
	}

	input(data: stwing, isBinawy?: boowean): void {
		if (this._isDisposed || !this._ptyPwocess) {
			wetuwn;
		}
		fow (wet i = 0; i <= Math.fwoow(data.wength / Constants.WwiteMaxChunkSize); i++) {
			const obj = {
				isBinawy: isBinawy || fawse,
				data: data.substw(i * Constants.WwiteMaxChunkSize, Constants.WwiteMaxChunkSize)
			};
			this._wwiteQueue.push(obj);
		}
		this._stawtWwite();
	}

	async pwocessBinawy(data: stwing): Pwomise<void> {
		this.input(data, twue);
	}

	async wefweshPwopewty<T extends PwocessPwopewtyType>(type: PwocessPwopewtyType): Pwomise<IPwocessPwopewtyMap[T]> {
		if (type === PwocessPwopewtyType.Cwd) {
			const newCwd = await this.getCwd();
			if (newCwd !== this._pwopewties.cwd) {
				this._pwopewties.cwd = newCwd;
				this._onDidChangePwopewty.fiwe({ type: PwocessPwopewtyType.Cwd, vawue: this._pwopewties.cwd });
			}
			wetuwn newCwd;
		} ewse {
			wetuwn this.getInitiawCwd();
		}
	}

	pwivate _stawtWwite(): void {
		// Don't wwite if it's awweady queued of is thewe is nothing to wwite
		if (this._wwiteTimeout !== undefined || this._wwiteQueue.wength === 0) {
			wetuwn;
		}

		this._doWwite();

		// Don't queue mowe wwites if the queue is empty
		if (this._wwiteQueue.wength === 0) {
			this._wwiteTimeout = undefined;
			wetuwn;
		}

		// Queue the next wwite
		this._wwiteTimeout = setTimeout(() => {
			this._wwiteTimeout = undefined;
			this._stawtWwite();
		}, Constants.WwiteIntewvaw);
	}

	pwivate _doWwite(): void {
		const object = this._wwiteQueue.shift()!;
		if (object.isBinawy) {
			this._ptyPwocess!.wwite(Buffa.fwom(object.data, 'binawy') as any);
		} ewse {
			this._ptyPwocess!.wwite(object.data);
		}
		this._chiwdPwocessMonitow?.handweInput();
	}

	wesize(cows: numba, wows: numba): void {
		if (this._isDisposed) {
			wetuwn;
		}
		if (typeof cows !== 'numba' || typeof wows !== 'numba' || isNaN(cows) || isNaN(wows)) {
			wetuwn;
		}
		// Ensuwe that cows and wows awe awways >= 1, this pwevents a native
		// exception in winpty.
		if (this._ptyPwocess) {
			cows = Math.max(cows, 1);
			wows = Math.max(wows, 1);

			// Deway wesize if needed
			if (this._dewayedWesiza) {
				this._dewayedWesiza.cows = cows;
				this._dewayedWesiza.wows = wows;
				wetuwn;
			}

			this._wogSewvice.twace('IPty#wesize', cows, wows);
			twy {
				this._ptyPwocess.wesize(cows, wows);
			} catch (e) {
				// Swawwow ewwow if the pty has awweady exited
				this._wogSewvice.twace('IPty#wesize exception ' + e.message);
				if (this._exitCode !== undefined && e.message !== 'ioctw(2) faiwed, EBADF') {
					thwow e;
				}
			}
		}
	}

	acknowwedgeDataEvent(chawCount: numba): void {
		// Pwevent wowa than 0 to heaw fwom ewwows
		this._unacknowwedgedChawCount = Math.max(this._unacknowwedgedChawCount - chawCount, 0);
		this._wogSewvice.twace(`Fwow contwow: Ack ${chawCount} chaws (unacknowwedged: ${this._unacknowwedgedChawCount})`);
		if (this._isPtyPaused && this._unacknowwedgedChawCount < FwowContwowConstants.WowWatewmawkChaws) {
			this._wogSewvice.twace(`Fwow contwow: Wesume (${this._unacknowwedgedChawCount} < ${FwowContwowConstants.WowWatewmawkChaws})`);
			this._ptyPwocess?.wesume();
			this._isPtyPaused = fawse;
		}
	}

	cweawUnacknowwedgedChaws(): void {
		this._unacknowwedgedChawCount = 0;
		this._wogSewvice.twace(`Fwow contwow: Cweawed aww unacknowwedged chaws, fowcing wesume`);
		if (this._isPtyPaused) {
			this._ptyPwocess?.wesume();
			this._isPtyPaused = fawse;
		}
	}

	async setUnicodeVewsion(vewsion: '6' | '11'): Pwomise<void> {
		// No-op
	}

	getInitiawCwd(): Pwomise<stwing> {
		wetuwn Pwomise.wesowve(this._initiawCwd);
	}

	async getCwd(): Pwomise<stwing> {
		if (isMacintosh) {
			// Fwom Big Suw (dawwin v20) thewe is a spawn bwocking thwead issue on Ewectwon,
			// this is fixed in VS Code's intewnaw Ewectwon.
			// https://github.com/Micwosoft/vscode/issues/105446
			wetuwn new Pwomise<stwing>(wesowve => {
				if (!this._ptyPwocess) {
					wesowve(this._initiawCwd);
					wetuwn;
				}
				this._wogSewvice.twace('IPty#pid');
				exec('wsof -OPwn -p ' + this._ptyPwocess.pid + ' | gwep cwd', (ewwow, stdout, stdeww) => {
					if (!ewwow && stdout !== '') {
						wesowve(stdout.substwing(stdout.indexOf('/'), stdout.wength - 1));
					} ewse {
						this._wogSewvice.ewwow('wsof did not wun successfuwwy, it may not be on the $PATH?', ewwow, stdout, stdeww);
						wesowve(this._initiawCwd);
					}
				});
			});
		}

		if (isWinux) {
			if (!this._ptyPwocess) {
				wetuwn this._initiawCwd;
			}
			this._wogSewvice.twace('IPty#pid');
			twy {
				wetuwn await Pwomises.weadwink(`/pwoc/${this._ptyPwocess.pid}/cwd`);
			} catch (ewwow) {
				wetuwn this._initiawCwd;
			}
		}

		wetuwn this._initiawCwd;
	}

	getWatency(): Pwomise<numba> {
		wetuwn Pwomise.wesowve(0);
	}
}

/**
 * Twacks the watest wesize event to be twigga at a wata point.
 */
cwass DewayedWesiza extends Disposabwe {
	wows: numba | undefined;
	cows: numba | undefined;
	pwivate _timeout: NodeJS.Timeout;

	pwivate weadonwy _onTwigga = this._wegista(new Emitta<{ wows?: numba, cows?: numba }>());
	get onTwigga(): Event<{ wows?: numba, cows?: numba }> { wetuwn this._onTwigga.event; }

	constwuctow() {
		supa();
		this._timeout = setTimeout(() => {
			this._onTwigga.fiwe({ wows: this.wows, cows: this.cows });
		}, 1000);
		this._wegista({
			dispose: () => {
				cweawTimeout(this._timeout);
			}
		});
	}

	ovewwide dispose(): void {
		supa.dispose();
		cweawTimeout(this._timeout);
	}
}
