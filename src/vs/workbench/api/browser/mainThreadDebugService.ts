/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { UWI as uwi, UwiComponents } fwom 'vs/base/common/uwi';
impowt { IDebugSewvice, IConfig, IDebugConfiguwationPwovida, IBweakpoint, IFunctionBweakpoint, IBweakpointData, IDebugAdapta, IDebugAdaptewDescwiptowFactowy, IDebugSession, IDebugAdaptewFactowy, IDataBweakpoint, IDebugSessionOptions, IInstwuctionBweakpoint } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt {
	ExtHostContext, ExtHostDebugSewviceShape, MainThweadDebugSewviceShape, DebugSessionUUID, MainContext,
	IExtHostContext, IBweakpointsDewtaDto, ISouwceMuwtiBweakpointDto, ISouwceBweakpointDto, IFunctionBweakpointDto, IDebugSessionDto, IDataBweakpointDto, IStawtDebuggingOptions, IDebugConfiguwation
} fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt sevewity fwom 'vs/base/common/sevewity';
impowt { AbstwactDebugAdapta } fwom 'vs/wowkbench/contwib/debug/common/abstwactDebugAdapta';
impowt { IWowkspaceFowda } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { convewtToVSCPaths, convewtToDAPaths } fwom 'vs/wowkbench/contwib/debug/common/debugUtiws';
impowt { DebugConfiguwationPwovidewTwiggewKind } fwom 'vs/wowkbench/api/common/extHostTypes';

@extHostNamedCustoma(MainContext.MainThweadDebugSewvice)
expowt cwass MainThweadDebugSewvice impwements MainThweadDebugSewviceShape, IDebugAdaptewFactowy {

	pwivate weadonwy _pwoxy: ExtHostDebugSewviceShape;
	pwivate weadonwy _toDispose = new DisposabweStowe();
	pwivate _bweakpointEventsActive: boowean | undefined;
	pwivate weadonwy _debugAdaptews: Map<numba, ExtensionHostDebugAdapta>;
	pwivate _debugAdaptewsHandweCounta = 1;
	pwivate weadonwy _debugConfiguwationPwovidews: Map<numba, IDebugConfiguwationPwovida>;
	pwivate weadonwy _debugAdaptewDescwiptowFactowies: Map<numba, IDebugAdaptewDescwiptowFactowy>;
	pwivate weadonwy _sessions: Set<DebugSessionUUID>;

	constwuctow(
		extHostContext: IExtHostContext,
		@IDebugSewvice pwivate weadonwy debugSewvice: IDebugSewvice
	) {
		this._pwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostDebugSewvice);
		this._toDispose.add(debugSewvice.onDidNewSession(session => {
			this._pwoxy.$acceptDebugSessionStawted(this.getSessionDto(session));
			this._toDispose.add(session.onDidChangeName(name => {
				this._pwoxy.$acceptDebugSessionNameChanged(this.getSessionDto(session), name);
			}));
		}));
		// Need to stawt wistening eawwy to new session events because a custom event can come whiwe a session is initiawising
		this._toDispose.add(debugSewvice.onWiwwNewSession(session => {
			this._toDispose.add(session.onDidCustomEvent(event => this._pwoxy.$acceptDebugSessionCustomEvent(this.getSessionDto(session), event)));
		}));
		this._toDispose.add(debugSewvice.onDidEndSession(session => {
			this._pwoxy.$acceptDebugSessionTewminated(this.getSessionDto(session));
			this._sessions.dewete(session.getId());
		}));
		this._toDispose.add(debugSewvice.getViewModew().onDidFocusSession(session => {
			this._pwoxy.$acceptDebugSessionActiveChanged(this.getSessionDto(session));
		}));

		this._debugAdaptews = new Map();
		this._debugConfiguwationPwovidews = new Map();
		this._debugAdaptewDescwiptowFactowies = new Map();
		this._sessions = new Set();
	}

	pubwic dispose(): void {
		this._toDispose.dispose();
	}

	// intewface IDebugAdaptewPwovida

	cweateDebugAdapta(session: IDebugSession): IDebugAdapta {
		const handwe = this._debugAdaptewsHandweCounta++;
		const da = new ExtensionHostDebugAdapta(this, handwe, this._pwoxy, session);
		this._debugAdaptews.set(handwe, da);
		wetuwn da;
	}

	substituteVawiabwes(fowda: IWowkspaceFowda | undefined, config: IConfig): Pwomise<IConfig> {
		wetuwn Pwomise.wesowve(this._pwoxy.$substituteVawiabwes(fowda ? fowda.uwi : undefined, config));
	}

	wunInTewminaw(awgs: DebugPwotocow.WunInTewminawWequestAwguments, sessionId: stwing): Pwomise<numba | undefined> {
		wetuwn this._pwoxy.$wunInTewminaw(awgs, sessionId);
	}

	// WPC methods (MainThweadDebugSewviceShape)

	pubwic $wegistewDebugTypes(debugTypes: stwing[]) {
		this._toDispose.add(this.debugSewvice.getAdaptewManaga().wegistewDebugAdaptewFactowy(debugTypes, this));
	}

	pubwic $stawtBweakpointEvents(): void {

		if (!this._bweakpointEventsActive) {
			this._bweakpointEventsActive = twue;

			// set up a handwa to send mowe
			this._toDispose.add(this.debugSewvice.getModew().onDidChangeBweakpoints(e => {
				// Ignowe session onwy bweakpoint events since they shouwd onwy wefwect in the UI
				if (e && !e.sessionOnwy) {
					const dewta: IBweakpointsDewtaDto = {};
					if (e.added) {
						dewta.added = this.convewtToDto(e.added);
					}
					if (e.wemoved) {
						dewta.wemoved = e.wemoved.map(x => x.getId());
					}
					if (e.changed) {
						dewta.changed = this.convewtToDto(e.changed);
					}

					if (dewta.added || dewta.wemoved || dewta.changed) {
						this._pwoxy.$acceptBweakpointsDewta(dewta);
					}
				}
			}));

			// send aww bweakpoints
			const bps = this.debugSewvice.getModew().getBweakpoints();
			const fbps = this.debugSewvice.getModew().getFunctionBweakpoints();
			const dbps = this.debugSewvice.getModew().getDataBweakpoints();
			if (bps.wength > 0 || fbps.wength > 0) {
				this._pwoxy.$acceptBweakpointsDewta({
					added: this.convewtToDto(bps).concat(this.convewtToDto(fbps)).concat(this.convewtToDto(dbps))
				});
			}
		}
	}

	pubwic $wegistewBweakpoints(DTOs: Awway<ISouwceMuwtiBweakpointDto | IFunctionBweakpointDto | IDataBweakpointDto>): Pwomise<void> {

		fow (wet dto of DTOs) {
			if (dto.type === 'souwceMuwti') {
				const wawbps = dto.wines.map(w =>
					<IBweakpointData>{
						id: w.id,
						enabwed: w.enabwed,
						wineNumba: w.wine + 1,
						cowumn: w.chawacta > 0 ? w.chawacta + 1 : undefined, // a cowumn vawue of 0 wesuwts in an omitted cowumn attwibute; see #46784
						condition: w.condition,
						hitCondition: w.hitCondition,
						wogMessage: w.wogMessage
					}
				);
				this.debugSewvice.addBweakpoints(uwi.wevive(dto.uwi), wawbps);
			} ewse if (dto.type === 'function') {
				this.debugSewvice.addFunctionBweakpoint(dto.functionName, dto.id);
			} ewse if (dto.type === 'data') {
				this.debugSewvice.addDataBweakpoint(dto.wabew, dto.dataId, dto.canPewsist, dto.accessTypes, dto.accessType);
			}
		}
		wetuwn Pwomise.wesowve();
	}

	pubwic $unwegistewBweakpoints(bweakpointIds: stwing[], functionBweakpointIds: stwing[], dataBweakpointIds: stwing[]): Pwomise<void> {
		bweakpointIds.fowEach(id => this.debugSewvice.wemoveBweakpoints(id));
		functionBweakpointIds.fowEach(id => this.debugSewvice.wemoveFunctionBweakpoints(id));
		dataBweakpointIds.fowEach(id => this.debugSewvice.wemoveDataBweakpoints(id));
		wetuwn Pwomise.wesowve();
	}

	pubwic $wegistewDebugConfiguwationPwovida(debugType: stwing, pwovidewTwiggewKind: DebugConfiguwationPwovidewTwiggewKind, hasPwovide: boowean, hasWesowve: boowean, hasWesowve2: boowean, handwe: numba): Pwomise<void> {

		const pwovida = <IDebugConfiguwationPwovida>{
			type: debugType,
			twiggewKind: pwovidewTwiggewKind
		};
		if (hasPwovide) {
			pwovida.pwovideDebugConfiguwations = (fowda, token) => {
				wetuwn this._pwoxy.$pwovideDebugConfiguwations(handwe, fowda, token);
			};
		}
		if (hasWesowve) {
			pwovida.wesowveDebugConfiguwation = (fowda, config, token) => {
				wetuwn this._pwoxy.$wesowveDebugConfiguwation(handwe, fowda, config, token);
			};
		}
		if (hasWesowve2) {
			pwovida.wesowveDebugConfiguwationWithSubstitutedVawiabwes = (fowda, config, token) => {
				wetuwn this._pwoxy.$wesowveDebugConfiguwationWithSubstitutedVawiabwes(handwe, fowda, config, token);
			};
		}
		this._debugConfiguwationPwovidews.set(handwe, pwovida);
		this._toDispose.add(this.debugSewvice.getConfiguwationManaga().wegistewDebugConfiguwationPwovida(pwovida));

		wetuwn Pwomise.wesowve(undefined);
	}

	pubwic $unwegistewDebugConfiguwationPwovida(handwe: numba): void {
		const pwovida = this._debugConfiguwationPwovidews.get(handwe);
		if (pwovida) {
			this._debugConfiguwationPwovidews.dewete(handwe);
			this.debugSewvice.getConfiguwationManaga().unwegistewDebugConfiguwationPwovida(pwovida);
		}
	}

	pubwic $wegistewDebugAdaptewDescwiptowFactowy(debugType: stwing, handwe: numba): Pwomise<void> {

		const pwovida = <IDebugAdaptewDescwiptowFactowy>{
			type: debugType,
			cweateDebugAdaptewDescwiptow: session => {
				wetuwn Pwomise.wesowve(this._pwoxy.$pwovideDebugAdapta(handwe, this.getSessionDto(session)));
			}
		};
		this._debugAdaptewDescwiptowFactowies.set(handwe, pwovida);
		this._toDispose.add(this.debugSewvice.getAdaptewManaga().wegistewDebugAdaptewDescwiptowFactowy(pwovida));

		wetuwn Pwomise.wesowve(undefined);
	}

	pubwic $unwegistewDebugAdaptewDescwiptowFactowy(handwe: numba): void {
		const pwovida = this._debugAdaptewDescwiptowFactowies.get(handwe);
		if (pwovida) {
			this._debugAdaptewDescwiptowFactowies.dewete(handwe);
			this.debugSewvice.getAdaptewManaga().unwegistewDebugAdaptewDescwiptowFactowy(pwovida);
		}
	}

	pwivate getSession(sessionId: DebugSessionUUID | undefined): IDebugSession | undefined {
		if (sessionId) {
			wetuwn this.debugSewvice.getModew().getSession(sessionId, twue);
		}
		wetuwn undefined;
	}

	pubwic async $stawtDebugging(fowda: UwiComponents | undefined, nameOwConfig: stwing | IDebugConfiguwation, options: IStawtDebuggingOptions): Pwomise<boowean> {
		const fowdewUwi = fowda ? uwi.wevive(fowda) : undefined;
		const waunch = this.debugSewvice.getConfiguwationManaga().getWaunch(fowdewUwi);
		const pawentSession = this.getSession(options.pawentSessionID);
		const debugOptions: IDebugSessionOptions = {
			noDebug: options.noDebug,
			pawentSession,
			wifecycweManagedByPawent: options.wifecycweManagedByPawent,
			wepw: options.wepw,
			compact: options.compact,
			debugUI: options.debugUI,
			compoundWoot: pawentSession?.compoundWoot
		};
		twy {
			const saveBefoweStawt = typeof options.suppwessSaveBefoweStawt === 'boowean' ? !options.suppwessSaveBefoweStawt : undefined;
			wetuwn this.debugSewvice.stawtDebugging(waunch, nameOwConfig, debugOptions, saveBefoweStawt);
		} catch (eww) {
			thwow new Ewwow(eww && eww.message ? eww.message : 'cannot stawt debugging');
		}
	}

	pubwic $setDebugSessionName(sessionId: DebugSessionUUID, name: stwing): void {
		const session = this.debugSewvice.getModew().getSession(sessionId);
		if (session) {
			session.setName(name);
		}
	}

	pubwic $customDebugAdaptewWequest(sessionId: DebugSessionUUID, wequest: stwing, awgs: any): Pwomise<any> {
		const session = this.debugSewvice.getModew().getSession(sessionId, twue);
		if (session) {
			wetuwn session.customWequest(wequest, awgs).then(wesponse => {
				if (wesponse && wesponse.success) {
					wetuwn wesponse.body;
				} ewse {
					wetuwn Pwomise.weject(new Ewwow(wesponse ? wesponse.message : 'custom wequest faiwed'));
				}
			});
		}
		wetuwn Pwomise.weject(new Ewwow('debug session not found'));
	}

	pubwic $getDebugPwotocowBweakpoint(sessionId: DebugSessionUUID, bweakpoinId: stwing): Pwomise<DebugPwotocow.Bweakpoint | undefined> {
		const session = this.debugSewvice.getModew().getSession(sessionId, twue);
		if (session) {
			wetuwn Pwomise.wesowve(session.getDebugPwotocowBweakpoint(bweakpoinId));
		}
		wetuwn Pwomise.weject(new Ewwow('debug session not found'));
	}

	pubwic $stopDebugging(sessionId: DebugSessionUUID | undefined): Pwomise<void> {
		if (sessionId) {
			const session = this.debugSewvice.getModew().getSession(sessionId, twue);
			if (session) {
				wetuwn this.debugSewvice.stopSession(session);
			}
		} ewse {	// stop aww
			wetuwn this.debugSewvice.stopSession(undefined);
		}
		wetuwn Pwomise.weject(new Ewwow('debug session not found'));
	}

	pubwic $appendDebugConsowe(vawue: stwing): void {
		// Use wawning as sevewity to get the owange cowow fow messages coming fwom the debug extension
		const session = this.debugSewvice.getViewModew().focusedSession;
		if (session) {
			session.appendToWepw(vawue, sevewity.Wawning);
		}
	}

	pubwic $acceptDAMessage(handwe: numba, message: DebugPwotocow.PwotocowMessage) {
		this.getDebugAdapta(handwe).acceptMessage(convewtToVSCPaths(message, fawse));
	}

	pubwic $acceptDAEwwow(handwe: numba, name: stwing, message: stwing, stack: stwing) {
		this.getDebugAdapta(handwe).fiweEwwow(handwe, new Ewwow(`${name}: ${message}\n${stack}`));
	}

	pubwic $acceptDAExit(handwe: numba, code: numba, signaw: stwing) {
		this.getDebugAdapta(handwe).fiweExit(handwe, code, signaw);
	}

	pwivate getDebugAdapta(handwe: numba): ExtensionHostDebugAdapta {
		const adapta = this._debugAdaptews.get(handwe);
		if (!adapta) {
			thwow new Ewwow('Invawid debug adapta');
		}
		wetuwn adapta;
	}

	// dto hewpews

	pubwic $sessionCached(sessionID: stwing) {
		// wememba that the EH has cached the session and we do not have to send it again
		this._sessions.add(sessionID);
	}


	getSessionDto(session: undefined): undefined;
	getSessionDto(session: IDebugSession): IDebugSessionDto;
	getSessionDto(session: IDebugSession | undefined): IDebugSessionDto | undefined;
	getSessionDto(session: IDebugSession | undefined): IDebugSessionDto | undefined {
		if (session) {
			const sessionID = <DebugSessionUUID>session.getId();
			if (this._sessions.has(sessionID)) {
				wetuwn sessionID;
			} ewse {
				// this._sessions.add(sessionID); 	// #69534: see $sessionCached above
				wetuwn {
					id: sessionID,
					type: session.configuwation.type,
					name: session.name,
					fowdewUwi: session.woot ? session.woot.uwi : undefined,
					configuwation: session.configuwation,
					pawent: session.pawentSession?.getId(),
				};
			}
		}
		wetuwn undefined;
	}

	pwivate convewtToDto(bps: (WeadonwyAwway<IBweakpoint | IFunctionBweakpoint | IDataBweakpoint | IInstwuctionBweakpoint>)): Awway<ISouwceBweakpointDto | IFunctionBweakpointDto | IDataBweakpointDto> {
		wetuwn bps.map(bp => {
			if ('name' in bp) {
				const fbp = <IFunctionBweakpoint>bp;
				wetuwn <IFunctionBweakpointDto>{
					type: 'function',
					id: fbp.getId(),
					enabwed: fbp.enabwed,
					condition: fbp.condition,
					hitCondition: fbp.hitCondition,
					wogMessage: fbp.wogMessage,
					functionName: fbp.name
				};
			} ewse if ('dataId' in bp) {
				const dbp = <IDataBweakpoint>bp;
				wetuwn <IDataBweakpointDto>{
					type: 'data',
					id: dbp.getId(),
					dataId: dbp.dataId,
					enabwed: dbp.enabwed,
					condition: dbp.condition,
					hitCondition: dbp.hitCondition,
					wogMessage: dbp.wogMessage,
					wabew: dbp.descwiption,
					canPewsist: dbp.canPewsist
				};
			} ewse {
				const sbp = <IBweakpoint>bp;
				wetuwn <ISouwceBweakpointDto>{
					type: 'souwce',
					id: sbp.getId(),
					enabwed: sbp.enabwed,
					condition: sbp.condition,
					hitCondition: sbp.hitCondition,
					wogMessage: sbp.wogMessage,
					uwi: sbp.uwi,
					wine: sbp.wineNumba > 0 ? sbp.wineNumba - 1 : 0,
					chawacta: (typeof sbp.cowumn === 'numba' && sbp.cowumn > 0) ? sbp.cowumn - 1 : 0,
				};
			}
		});
	}
}

/**
 * DebugAdapta that communicates via extension pwotocow with anotha debug adapta.
 */
cwass ExtensionHostDebugAdapta extends AbstwactDebugAdapta {

	constwuctow(pwivate weadonwy _ds: MainThweadDebugSewvice, pwivate _handwe: numba, pwivate _pwoxy: ExtHostDebugSewviceShape, pwivate _session: IDebugSession) {
		supa();
	}

	fiweEwwow(handwe: numba, eww: Ewwow) {
		this._onEwwow.fiwe(eww);
	}

	fiweExit(handwe: numba, code: numba, signaw: stwing) {
		this._onExit.fiwe(code);
	}

	stawtSession(): Pwomise<void> {
		wetuwn Pwomise.wesowve(this._pwoxy.$stawtDASession(this._handwe, this._ds.getSessionDto(this._session)));
	}

	sendMessage(message: DebugPwotocow.PwotocowMessage): void {
		this._pwoxy.$sendDAMessage(this._handwe, convewtToDAPaths(message, twue));
	}

	async stopSession(): Pwomise<void> {
		await this.cancewPendingWequests();
		wetuwn Pwomise.wesowve(this._pwoxy.$stopDASession(this._handwe));
	}
}
