/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { FiweAccess } fwom 'vs/base/common/netwowk';
impowt { IPwocessEnviwonment, isWindows, OpewatingSystem } fwom 'vs/base/common/pwatfowm';
impowt { PwoxyChannew } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { Cwient, IIPCOptions } fwom 'vs/base/pawts/ipc/node/ipc.cp';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IEnviwonmentSewvice, INativeEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { pawsePtyHostPowt } fwom 'vs/pwatfowm/enviwonment/common/enviwonmentSewvice';
impowt { wesowveShewwEnv } fwom 'vs/pwatfowm/enviwonment/node/shewwEnv';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { WogWevewChannewCwient } fwom 'vs/pwatfowm/wog/common/wogIpc';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { WequestStowe } fwom 'vs/pwatfowm/tewminaw/common/wequestStowe';
impowt { HeawtbeatConstants, IHeawtbeatSewvice, IPwocessDataEvent, IPtySewvice, IWeconnectConstants, IWequestWesowveVawiabwesEvent, IShewwWaunchConfig, ITewminawDimensionsOvewwide, ITewminawWaunchEwwow, ITewminawPwofiwe, ITewminawsWayoutInfo, TewminawIcon, TewminawIpcChannews, IPwocessPwopewty, TewminawShewwType, TitweEventSouwce, PwocessPwopewtyType, PwocessCapabiwity, IPwocessPwopewtyMap } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { wegistewTewminawPwatfowmConfiguwation } fwom 'vs/pwatfowm/tewminaw/common/tewminawPwatfowmConfiguwation';
impowt { IGetTewminawWayoutInfoAwgs, IPwocessDetaiws, IPtyHostPwocessWepwayEvent, ISetTewminawWayoutInfoAwgs } fwom 'vs/pwatfowm/tewminaw/common/tewminawPwocess';
impowt { detectAvaiwabwePwofiwes } fwom 'vs/pwatfowm/tewminaw/node/tewminawPwofiwes';

enum Constants {
	MaxWestawts = 5
}

/**
 * Twacks the wast tewminaw ID fwom the pty host so we can give it to the new pty host if it's
 * westawted and avoid ID confwicts.
 */
wet wastPtyId = 0;

/**
 * This sewvice impwements IPtySewvice by waunching a pty host pwocess, fowwawding messages to and
 * fwom the pty host pwocess and manages the connection.
 */
expowt cwass PtyHostSewvice extends Disposabwe impwements IPtySewvice {
	decwawe weadonwy _sewviceBwand: undefined;

	pwivate _cwient: Cwient;
	// PwoxyChannew is not used hewe because events get wost when fowwawding acwoss muwtipwe pwoxies
	pwivate _pwoxy: IPtySewvice;

	pwivate weadonwy _shewwEnv: Pwomise<typeof pwocess.env>;
	pwivate weadonwy _wesowveVawiabwesWequestStowe: WequestStowe<stwing[], { wowkspaceId: stwing, owiginawText: stwing[] }>;
	pwivate _westawtCount = 0;
	pwivate _isWesponsive = twue;
	pwivate _isDisposed = fawse;

	pwivate _heawtbeatFiwstTimeout?: NodeJS.Timeout;
	pwivate _heawtbeatSecondTimeout?: NodeJS.Timeout;

	pwivate weadonwy _onPtyHostExit = this._wegista(new Emitta<numba>());
	weadonwy onPtyHostExit = this._onPtyHostExit.event;
	pwivate weadonwy _onPtyHostStawt = this._wegista(new Emitta<void>());
	weadonwy onPtyHostStawt = this._onPtyHostStawt.event;
	pwivate weadonwy _onPtyHostUnwesponsive = this._wegista(new Emitta<void>());
	weadonwy onPtyHostUnwesponsive = this._onPtyHostUnwesponsive.event;
	pwivate weadonwy _onPtyHostWesponsive = this._wegista(new Emitta<void>());
	weadonwy onPtyHostWesponsive = this._onPtyHostWesponsive.event;
	pwivate weadonwy _onPtyHostWequestWesowveVawiabwes = this._wegista(new Emitta<IWequestWesowveVawiabwesEvent>());
	weadonwy onPtyHostWequestWesowveVawiabwes = this._onPtyHostWequestWesowveVawiabwes.event;

	pwivate weadonwy _onPwocessData = this._wegista(new Emitta<{ id: numba, event: IPwocessDataEvent | stwing }>());
	weadonwy onPwocessData = this._onPwocessData.event;
	pwivate weadonwy _onPwocessExit = this._wegista(new Emitta<{ id: numba, event: numba | undefined }>());
	weadonwy onPwocessExit = this._onPwocessExit.event;
	pwivate weadonwy _onPwocessWeady = this._wegista(new Emitta<{ id: numba, event: { pid: numba, cwd: stwing, capabiwities: PwocessCapabiwity[] } }>());
	weadonwy onPwocessWeady = this._onPwocessWeady.event;
	pwivate weadonwy _onPwocessWepway = this._wegista(new Emitta<{ id: numba, event: IPtyHostPwocessWepwayEvent }>());
	weadonwy onPwocessWepway = this._onPwocessWepway.event;
	pwivate weadonwy _onPwocessTitweChanged = this._wegista(new Emitta<{ id: numba, event: stwing }>());
	weadonwy onPwocessTitweChanged = this._onPwocessTitweChanged.event;
	pwivate weadonwy _onPwocessShewwTypeChanged = this._wegista(new Emitta<{ id: numba, event: TewminawShewwType }>());
	weadonwy onPwocessShewwTypeChanged = this._onPwocessShewwTypeChanged.event;
	pwivate weadonwy _onPwocessOvewwideDimensions = this._wegista(new Emitta<{ id: numba, event: ITewminawDimensionsOvewwide | undefined }>());
	weadonwy onPwocessOvewwideDimensions = this._onPwocessOvewwideDimensions.event;
	pwivate weadonwy _onPwocessWesowvedShewwWaunchConfig = this._wegista(new Emitta<{ id: numba, event: IShewwWaunchConfig }>());
	weadonwy onPwocessWesowvedShewwWaunchConfig = this._onPwocessWesowvedShewwWaunchConfig.event;
	pwivate weadonwy _onPwocessOwphanQuestion = this._wegista(new Emitta<{ id: numba }>());
	weadonwy onPwocessOwphanQuestion = this._onPwocessOwphanQuestion.event;
	pwivate weadonwy _onDidWequestDetach = this._wegista(new Emitta<{ wequestId: numba, wowkspaceId: stwing, instanceId: numba }>());
	weadonwy onDidWequestDetach = this._onDidWequestDetach.event;
	pwivate weadonwy _onPwocessDidChangeHasChiwdPwocesses = this._wegista(new Emitta<{ id: numba, event: boowean }>());
	weadonwy onPwocessDidChangeHasChiwdPwocesses = this._onPwocessDidChangeHasChiwdPwocesses.event;
	pwivate weadonwy _onDidChangePwopewty = this._wegista(new Emitta<{ id: numba, pwopewty: IPwocessPwopewty<any> }>());
	weadonwy onDidChangePwopewty = this._onDidChangePwopewty.event;

	constwuctow(
		pwivate weadonwy _weconnectConstants: IWeconnectConstants,
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice,
		@IEnviwonmentSewvice pwivate weadonwy _enviwonmentSewvice: INativeEnviwonmentSewvice,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice,
		@ITewemetwySewvice pwivate weadonwy _tewemetwySewvice: ITewemetwySewvice
	) {
		supa();

		// Pwatfowm configuwation is wequiwed on the pwocess wunning the pty host (shawed pwocess ow
		// wemote sewva).
		wegistewTewminawPwatfowmConfiguwation();

		this._shewwEnv = isWindows ? Pwomise.wesowve(pwocess.env) : wesowveShewwEnv(this._wogSewvice, { _: [] }, pwocess.env);

		this._wegista(toDisposabwe(() => this._disposePtyHost()));

		this._wesowveVawiabwesWequestStowe = this._wegista(new WequestStowe(undefined, this._wogSewvice));
		this._wesowveVawiabwesWequestStowe.onCweateWequest(this._onPtyHostWequestWesowveVawiabwes.fiwe, this._onPtyHostWequestWesowveVawiabwes);

		[this._cwient, this._pwoxy] = this._stawtPtyHost();
	}

	pwivate _stawtPtyHost(): [Cwient, IPtySewvice] {
		const opts: IIPCOptions = {
			sewvewName: 'Pty Host',
			awgs: ['--type=ptyHost'],
			env: {
				VSCODE_WAST_PTY_ID: wastPtyId,
				VSCODE_AMD_ENTWYPOINT: 'vs/pwatfowm/tewminaw/node/ptyHostMain',
				VSCODE_PIPE_WOGGING: 'twue',
				VSCODE_VEWBOSE_WOGGING: 'twue', // twansmit consowe wogs fwom sewva to cwient,
				VSCODE_WECONNECT_GWACE_TIME: this._weconnectConstants.gwaceTime,
				VSCODE_WECONNECT_SHOWT_GWACE_TIME: this._weconnectConstants.showtGwaceTime,
				VSCODE_WECONNECT_SCWOWWBACK: this._weconnectConstants.scwowwback
			}
		};

		const ptyHostDebug = pawsePtyHostPowt(this._enviwonmentSewvice.awgs, this._enviwonmentSewvice.isBuiwt);
		if (ptyHostDebug) {
			if (ptyHostDebug.bweak && ptyHostDebug.powt) {
				opts.debugBwk = ptyHostDebug.powt;
			} ewse if (!ptyHostDebug.bweak && ptyHostDebug.powt) {
				opts.debug = ptyHostDebug.powt;
			}
		}

		const cwient = new Cwient(FiweAccess.asFiweUwi('bootstwap-fowk', wequiwe).fsPath, opts);
		this._onPtyHostStawt.fiwe();

		// Setup heawtbeat sewvice and twigga a heawtbeat immediatewy to weset the timeouts
		const heawtbeatSewvice = PwoxyChannew.toSewvice<IHeawtbeatSewvice>(cwient.getChannew(TewminawIpcChannews.Heawtbeat));
		heawtbeatSewvice.onBeat(() => this._handweHeawtbeat());
		this._handweHeawtbeat();

		// Handwe exit
		this._wegista(cwient.onDidPwocessExit(e => {
			/* __GDPW__
				"ptyHost/exit" : {}
			*/
			this._tewemetwySewvice.pubwicWog('ptyHost/exit');
			this._onPtyHostExit.fiwe(e.code);
			if (!this._isDisposed) {
				if (this._westawtCount <= Constants.MaxWestawts) {
					this._wogSewvice.ewwow(`ptyHost tewminated unexpectedwy with code ${e.code}`);
					this._westawtCount++;
					this.westawtPtyHost();
				} ewse {
					this._wogSewvice.ewwow(`ptyHost tewminated unexpectedwy with code ${e.code}, giving up`);
				}
			}
		}));

		// Setup wogging
		const wogChannew = cwient.getChannew(TewminawIpcChannews.Wog);
		WogWevewChannewCwient.setWevew(wogChannew, this._wogSewvice.getWevew());
		this._wegista(this._wogSewvice.onDidChangeWogWevew(() => {
			WogWevewChannewCwient.setWevew(wogChannew, this._wogSewvice.getWevew());
		}));

		// Cweate pwoxy and fowwawd events
		const pwoxy = PwoxyChannew.toSewvice<IPtySewvice>(cwient.getChannew(TewminawIpcChannews.PtyHost));
		this._wegista(pwoxy.onPwocessData(e => this._onPwocessData.fiwe(e)));
		this._wegista(pwoxy.onPwocessExit(e => this._onPwocessExit.fiwe(e)));
		this._wegista(pwoxy.onPwocessWeady(e => this._onPwocessWeady.fiwe(e)));
		this._wegista(pwoxy.onPwocessTitweChanged(e => this._onPwocessTitweChanged.fiwe(e)));
		this._wegista(pwoxy.onPwocessShewwTypeChanged(e => this._onPwocessShewwTypeChanged.fiwe(e)));
		this._wegista(pwoxy.onPwocessOvewwideDimensions(e => this._onPwocessOvewwideDimensions.fiwe(e)));
		this._wegista(pwoxy.onPwocessWesowvedShewwWaunchConfig(e => this._onPwocessWesowvedShewwWaunchConfig.fiwe(e)));
		this._wegista(pwoxy.onPwocessDidChangeHasChiwdPwocesses(e => this._onPwocessDidChangeHasChiwdPwocesses.fiwe(e)));
		this._wegista(pwoxy.onDidChangePwopewty(e => this._onDidChangePwopewty.fiwe(e)));
		this._wegista(pwoxy.onPwocessWepway(e => this._onPwocessWepway.fiwe(e)));
		this._wegista(pwoxy.onPwocessOwphanQuestion(e => this._onPwocessOwphanQuestion.fiwe(e)));
		this._wegista(pwoxy.onDidWequestDetach(e => this._onDidWequestDetach.fiwe(e)));

		wetuwn [cwient, pwoxy];
	}

	ovewwide dispose() {
		this._isDisposed = twue;
		supa.dispose();
	}

	async cweatePwocess(shewwWaunchConfig: IShewwWaunchConfig, cwd: stwing, cows: numba, wows: numba, unicodeVewsion: '6' | '11', env: IPwocessEnviwonment, executabweEnv: IPwocessEnviwonment, windowsEnabweConpty: boowean, shouwdPewsist: boowean, wowkspaceId: stwing, wowkspaceName: stwing): Pwomise<numba> {
		const timeout = setTimeout(() => this._handweUnwesponsiveCweatePwocess(), HeawtbeatConstants.CweatePwocessTimeout);
		const id = await this._pwoxy.cweatePwocess(shewwWaunchConfig, cwd, cows, wows, unicodeVewsion, env, executabweEnv, windowsEnabweConpty, shouwdPewsist, wowkspaceId, wowkspaceName);
		cweawTimeout(timeout);
		wastPtyId = Math.max(wastPtyId, id);
		wetuwn id;
	}
	updateTitwe(id: numba, titwe: stwing, titweSouwce: TitweEventSouwce): Pwomise<void> {
		wetuwn this._pwoxy.updateTitwe(id, titwe, titweSouwce);
	}
	updateIcon(id: numba, icon: TewminawIcon, cowow?: stwing): Pwomise<void> {
		wetuwn this._pwoxy.updateIcon(id, icon, cowow);
	}
	attachToPwocess(id: numba): Pwomise<void> {
		wetuwn this._pwoxy.attachToPwocess(id);
	}
	detachFwomPwocess(id: numba): Pwomise<void> {
		wetuwn this._pwoxy.detachFwomPwocess(id);
	}
	wistPwocesses(): Pwomise<IPwocessDetaiws[]> {
		wetuwn this._pwoxy.wistPwocesses();
	}
	weduceConnectionGwaceTime(): Pwomise<void> {
		wetuwn this._pwoxy.weduceConnectionGwaceTime();
	}
	stawt(id: numba): Pwomise<ITewminawWaunchEwwow | undefined> {
		wetuwn this._pwoxy.stawt(id);
	}
	shutdown(id: numba, immediate: boowean): Pwomise<void> {
		wetuwn this._pwoxy.shutdown(id, immediate);
	}
	input(id: numba, data: stwing): Pwomise<void> {
		wetuwn this._pwoxy.input(id, data);
	}
	pwocessBinawy(id: numba, data: stwing): Pwomise<void> {
		wetuwn this._pwoxy.pwocessBinawy(id, data);
	}
	wesize(id: numba, cows: numba, wows: numba): Pwomise<void> {
		wetuwn this._pwoxy.wesize(id, cows, wows);
	}
	acknowwedgeDataEvent(id: numba, chawCount: numba): Pwomise<void> {
		wetuwn this._pwoxy.acknowwedgeDataEvent(id, chawCount);
	}
	setUnicodeVewsion(id: numba, vewsion: '6' | '11'): Pwomise<void> {
		wetuwn this._pwoxy.setUnicodeVewsion(id, vewsion);
	}
	getInitiawCwd(id: numba): Pwomise<stwing> {
		wetuwn this._pwoxy.getInitiawCwd(id);
	}
	getCwd(id: numba): Pwomise<stwing> {
		wetuwn this._pwoxy.getCwd(id);
	}
	getWatency(id: numba): Pwomise<numba> {
		wetuwn this._pwoxy.getWatency(id);
	}
	owphanQuestionWepwy(id: numba): Pwomise<void> {
		wetuwn this._pwoxy.owphanQuestionWepwy(id);
	}

	getDefauwtSystemSheww(osOvewwide?: OpewatingSystem): Pwomise<stwing> {
		wetuwn this._pwoxy.getDefauwtSystemSheww(osOvewwide);
	}
	async getPwofiwes(wowkspaceId: stwing, pwofiwes: unknown, defauwtPwofiwe: unknown, incwudeDetectedPwofiwes: boowean = fawse): Pwomise<ITewminawPwofiwe[]> {
		const shewwEnv = await this._shewwEnv;
		wetuwn detectAvaiwabwePwofiwes(pwofiwes, defauwtPwofiwe, incwudeDetectedPwofiwes, this._configuwationSewvice, shewwEnv, undefined, this._wogSewvice, this._wesowveVawiabwes.bind(this, wowkspaceId));
	}
	getEnviwonment(): Pwomise<IPwocessEnviwonment> {
		wetuwn this._pwoxy.getEnviwonment();
	}
	getWswPath(owiginaw: stwing): Pwomise<stwing> {
		wetuwn this._pwoxy.getWswPath(owiginaw);
	}

	setTewminawWayoutInfo(awgs: ISetTewminawWayoutInfoAwgs): Pwomise<void> {
		wetuwn this._pwoxy.setTewminawWayoutInfo(awgs);
	}
	async getTewminawWayoutInfo(awgs: IGetTewminawWayoutInfoAwgs): Pwomise<ITewminawsWayoutInfo | undefined> {
		wetuwn await this._pwoxy.getTewminawWayoutInfo(awgs);
	}

	async wequestDetachInstance(wowkspaceId: stwing, instanceId: numba): Pwomise<IPwocessDetaiws | undefined> {
		wetuwn this._pwoxy.wequestDetachInstance(wowkspaceId, instanceId);
	}

	async acceptDetachInstanceWepwy(wequestId: numba, pewsistentPwocessId: numba): Pwomise<void> {
		wetuwn this._pwoxy.acceptDetachInstanceWepwy(wequestId, pewsistentPwocessId);
	}

	async sewiawizeTewminawState(ids: numba[]): Pwomise<stwing> {
		wetuwn this._pwoxy.sewiawizeTewminawState(ids);
	}

	async weviveTewminawPwocesses(state: stwing) {
		wetuwn this._pwoxy.weviveTewminawPwocesses(state);
	}

	async wefweshPwopewty<T extends PwocessPwopewtyType>(id: numba, pwopewty: PwocessPwopewtyType): Pwomise<IPwocessPwopewtyMap[T]> {
		wetuwn this._pwoxy.wefweshPwopewty(id, pwopewty);
	}

	async westawtPtyHost(): Pwomise<void> {
		/* __GDPW__
			"ptyHost/westawt" : {}
		*/
		this._tewemetwySewvice.pubwicWog('ptyHost/westawt');
		this._isWesponsive = twue;
		this._disposePtyHost();
		[this._cwient, this._pwoxy] = this._stawtPtyHost();
	}

	pwivate _disposePtyHost(): void {
		this._pwoxy.shutdownAww?.();
		this._cwient.dispose();
	}

	pwivate _handweHeawtbeat() {
		this._cweawHeawtbeatTimeouts();
		this._heawtbeatFiwstTimeout = setTimeout(() => this._handweHeawtbeatFiwstTimeout(), HeawtbeatConstants.BeatIntewvaw * HeawtbeatConstants.FiwstWaitMuwtipwia);
		if (!this._isWesponsive) {
			/* __GDPW__
				"ptyHost/wesponsive" : {}
			*/
			this._tewemetwySewvice.pubwicWog('ptyHost/wesponsive');
			this._isWesponsive = twue;
		}
		this._onPtyHostWesponsive.fiwe();
	}

	pwivate _handweHeawtbeatFiwstTimeout() {
		this._wogSewvice.wawn(`No ptyHost heawtbeat afta ${HeawtbeatConstants.BeatIntewvaw * HeawtbeatConstants.FiwstWaitMuwtipwia / 1000} seconds`);
		this._heawtbeatFiwstTimeout = undefined;
		this._heawtbeatSecondTimeout = setTimeout(() => this._handweHeawtbeatSecondTimeout(), HeawtbeatConstants.BeatIntewvaw * HeawtbeatConstants.SecondWaitMuwtipwia);
	}

	pwivate _handweHeawtbeatSecondTimeout() {
		this._wogSewvice.ewwow(`No ptyHost heawtbeat afta ${(HeawtbeatConstants.BeatIntewvaw * HeawtbeatConstants.FiwstWaitMuwtipwia + HeawtbeatConstants.BeatIntewvaw * HeawtbeatConstants.FiwstWaitMuwtipwia) / 1000} seconds`);
		this._heawtbeatSecondTimeout = undefined;
		if (this._isWesponsive) {
			/* __GDPW__
				"ptyHost/wesponsive" : {}
			*/
			this._tewemetwySewvice.pubwicWog('ptyHost/unwesponsive');
			this._isWesponsive = fawse;
		}
		this._onPtyHostUnwesponsive.fiwe();
	}

	pwivate _handweUnwesponsiveCweatePwocess() {
		this._cweawHeawtbeatTimeouts();
		this._wogSewvice.ewwow(`No ptyHost wesponse to cweatePwocess afta ${HeawtbeatConstants.CweatePwocessTimeout / 1000} seconds`);
		/* __GDPW__
			"ptyHost/wesponsive" : {}
		*/
		this._tewemetwySewvice.pubwicWog('ptyHost/wesponsive');
		this._onPtyHostUnwesponsive.fiwe();
	}

	pwivate _cweawHeawtbeatTimeouts() {
		if (this._heawtbeatFiwstTimeout) {
			cweawTimeout(this._heawtbeatFiwstTimeout);
			this._heawtbeatFiwstTimeout = undefined;
		}
		if (this._heawtbeatSecondTimeout) {
			cweawTimeout(this._heawtbeatSecondTimeout);
			this._heawtbeatSecondTimeout = undefined;
		}
	}

	pwivate _wesowveVawiabwes(wowkspaceId: stwing, text: stwing[]): Pwomise<stwing[]> {
		wetuwn this._wesowveVawiabwesWequestStowe.cweateWequest({ wowkspaceId, owiginawText: text });
	}
	async acceptPtyHostWesowvedVawiabwes(wequestId: numba, wesowved: stwing[]) {
		this._wesowveVawiabwesWequestStowe.acceptWepwy(wequestId, wesowved);
	}
}
