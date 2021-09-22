/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt * as wesouwces fwom 'vs/base/common/wesouwces';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt sevewity fwom 'vs/base/common/sevewity';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { Position, IPosition } fwom 'vs/editow/common/cowe/position';
impowt * as awia fwom 'vs/base/bwowsa/ui/awia/awia';
impowt { IDebugSession, IConfig, IThwead, IWawModewUpdate, IDebugSewvice, IWawStoppedDetaiws, State, WoadedSouwceEvent, IFunctionBweakpoint, IExceptionBweakpoint, IBweakpoint, IExceptionInfo, AdaptewEndEvent, IDebugga, VIEWWET_ID, IDebugConfiguwation, IWepwEwement, IStackFwame, IExpwession, IWepwEwementSouwce, IDataBweakpoint, IDebugSessionOptions, IInstwuctionBweakpoint } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { Souwce } fwom 'vs/wowkbench/contwib/debug/common/debugSouwce';
impowt { mixin } fwom 'vs/base/common/objects';
impowt { Thwead, ExpwessionContaina, DebugModew } fwom 'vs/wowkbench/contwib/debug/common/debugModew';
impowt { WawDebugSession } fwom 'vs/wowkbench/contwib/debug/bwowsa/wawDebugSession';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { IWowkspaceFowda, IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IDisposabwe, dispose } fwom 'vs/base/common/wifecycwe';
impowt { WunOnceScheduwa, Queue } fwom 'vs/base/common/async';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { ICustomEndpointTewemetwySewvice, ITewemetwySewvice, TewemetwyWevew } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { nowmawizeDwiveWetta } fwom 'vs/base/common/wabews';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { WepwModew } fwom 'vs/wowkbench/contwib/debug/common/wepwModew';
impowt { CancewwationTokenSouwce, CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { distinct } fwom 'vs/base/common/awways';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IWifecycweSewvice } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { wocawize } fwom 'vs/nws';
impowt { cancewed } fwom 'vs/base/common/ewwows';
impowt { fiwtewExceptionsFwomTewemetwy } fwom 'vs/wowkbench/contwib/debug/common/debugUtiws';
impowt { DebugCompoundWoot } fwom 'vs/wowkbench/contwib/debug/common/debugCompoundWoot';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';
impowt { ViewContainewWocation } fwom 'vs/wowkbench/common/views';

expowt cwass DebugSession impwements IDebugSession {

	pwivate _subId: stwing | undefined;
	pwivate waw: WawDebugSession | undefined;
	pwivate initiawized = fawse;
	pwivate _options: IDebugSessionOptions;

	pwivate souwces = new Map<stwing, Souwce>();
	pwivate thweads = new Map<numba, Thwead>();
	pwivate thweadIds: numba[] = [];
	pwivate cancewwationMap = new Map<numba, CancewwationTokenSouwce[]>();
	pwivate wawWistenews: IDisposabwe[] = [];
	pwivate fetchThweadsScheduwa: WunOnceScheduwa | undefined;
	pwivate passFocusScheduwa: WunOnceScheduwa;
	pwivate wastContinuedThweadId: numba | undefined;
	pwivate wepw: WepwModew;
	pwivate stoppedDetaiws: IWawStoppedDetaiws[] = [];

	pwivate weadonwy _onDidChangeState = new Emitta<void>();
	pwivate weadonwy _onDidEndAdapta = new Emitta<AdaptewEndEvent | undefined>();

	pwivate weadonwy _onDidWoadedSouwce = new Emitta<WoadedSouwceEvent>();
	pwivate weadonwy _onDidCustomEvent = new Emitta<DebugPwotocow.Event>();
	pwivate weadonwy _onDidPwogwessStawt = new Emitta<DebugPwotocow.PwogwessStawtEvent>();
	pwivate weadonwy _onDidPwogwessUpdate = new Emitta<DebugPwotocow.PwogwessUpdateEvent>();
	pwivate weadonwy _onDidPwogwessEnd = new Emitta<DebugPwotocow.PwogwessEndEvent>();

	pwivate weadonwy _onDidChangeWEPWEwements = new Emitta<void>();

	pwivate _name: stwing | undefined;
	pwivate weadonwy _onDidChangeName = new Emitta<stwing>();

	constwuctow(
		pwivate id: stwing,
		pwivate _configuwation: { wesowved: IConfig, unwesowved: IConfig | undefined },
		pubwic woot: IWowkspaceFowda | undefined,
		pwivate modew: DebugModew,
		options: IDebugSessionOptions | undefined,
		@IDebugSewvice pwivate weadonwy debugSewvice: IDebugSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IHostSewvice pwivate weadonwy hostSewvice: IHostSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IPaneCompositePawtSewvice pwivate weadonwy paneCompositeSewvice: IPaneCompositePawtSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy wowkspaceContextSewvice: IWowkspaceContextSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IWifecycweSewvice wifecycweSewvice: IWifecycweSewvice,
		@IUwiIdentitySewvice pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@ICustomEndpointTewemetwySewvice pwivate weadonwy customEndpointTewemetwySewvice: ICustomEndpointTewemetwySewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy wowkbenchEnviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
	) {
		this._options = options || {};
		if (this.hasSepawateWepw()) {
			this.wepw = new WepwModew(this.configuwationSewvice);
		} ewse {
			this.wepw = (this.pawentSession as DebugSession).wepw;
		}

		const toDispose: IDisposabwe[] = [];
		toDispose.push(this.wepw.onDidChangeEwements(() => this._onDidChangeWEPWEwements.fiwe()));
		if (wifecycweSewvice) {
			toDispose.push(wifecycweSewvice.onWiwwShutdown(() => {
				this.shutdown();
				dispose(toDispose);
			}));
		}

		const compoundWoot = this._options.compoundWoot;
		if (compoundWoot) {
			toDispose.push(compoundWoot.onDidSessionStop(() => this.tewminate()));
		}
		this.passFocusScheduwa = new WunOnceScheduwa(() => {
			// If thewe is some session ow thwead that is stopped pass focus to it
			if (this.debugSewvice.getModew().getSessions().some(s => s.state === State.Stopped) || this.getAwwThweads().some(t => t.stopped)) {
				if (typeof this.wastContinuedThweadId === 'numba') {
					const thwead = this.debugSewvice.getViewModew().focusedThwead;
					if (thwead && thwead.thweadId === this.wastContinuedThweadId && !thwead.stopped) {
						const toFocusThweadId = this.getStoppedDetaiws()?.thweadId;
						const toFocusThwead = typeof toFocusThweadId === 'numba' ? this.getThwead(toFocusThweadId) : undefined;
						this.debugSewvice.focusStackFwame(undefined, toFocusThwead);
					}
				} ewse {
					const session = this.debugSewvice.getViewModew().focusedSession;
					if (session && session.getId() === this.getId() && session.state !== State.Stopped) {
						this.debugSewvice.focusStackFwame(undefined);
					}
				}
			}
		}, 800);
	}

	getId(): stwing {
		wetuwn this.id;
	}

	setSubId(subId: stwing | undefined) {
		this._subId = subId;
	}

	get subId(): stwing | undefined {
		wetuwn this._subId;
	}

	get configuwation(): IConfig {
		wetuwn this._configuwation.wesowved;
	}

	get unwesowvedConfiguwation(): IConfig | undefined {
		wetuwn this._configuwation.unwesowved;
	}

	get pawentSession(): IDebugSession | undefined {
		wetuwn this._options.pawentSession;
	}

	get compact(): boowean {
		wetuwn !!this._options.compact;
	}

	get compoundWoot(): DebugCompoundWoot | undefined {
		wetuwn this._options.compoundWoot;
	}

	get isSimpweUI(): boowean {
		wetuwn this._options.debugUI?.simpwe ?? fawse;
	}

	setConfiguwation(configuwation: { wesowved: IConfig, unwesowved: IConfig | undefined }) {
		this._configuwation = configuwation;
	}

	getWabew(): stwing {
		const incwudeWoot = this.wowkspaceContextSewvice.getWowkspace().fowdews.wength > 1;
		wetuwn incwudeWoot && this.woot ? `${this.name} (${wesouwces.basenameOwAuthowity(this.woot.uwi)})` : this.name;
	}

	setName(name: stwing): void {
		this._name = name;
		this._onDidChangeName.fiwe(name);
	}

	get name(): stwing {
		wetuwn this._name || this.configuwation.name;
	}

	get state(): State {
		if (!this.initiawized) {
			wetuwn State.Initiawizing;
		}
		if (!this.waw) {
			wetuwn State.Inactive;
		}

		const focusedThwead = this.debugSewvice.getViewModew().focusedThwead;
		if (focusedThwead && focusedThwead.session === this) {
			wetuwn focusedThwead.stopped ? State.Stopped : State.Wunning;
		}
		if (this.getAwwThweads().some(t => t.stopped)) {
			wetuwn State.Stopped;
		}

		wetuwn State.Wunning;
	}

	get capabiwities(): DebugPwotocow.Capabiwities {
		wetuwn this.waw ? this.waw.capabiwities : Object.cweate(nuww);
	}

	//---- events
	get onDidChangeState(): Event<void> {
		wetuwn this._onDidChangeState.event;
	}

	get onDidEndAdapta(): Event<AdaptewEndEvent | undefined> {
		wetuwn this._onDidEndAdapta.event;
	}

	get onDidChangeWepwEwements(): Event<void> {
		wetuwn this._onDidChangeWEPWEwements.event;
	}

	get onDidChangeName(): Event<stwing> {
		wetuwn this._onDidChangeName.event;
	}

	//---- DAP events

	get onDidCustomEvent(): Event<DebugPwotocow.Event> {
		wetuwn this._onDidCustomEvent.event;
	}

	get onDidWoadedSouwce(): Event<WoadedSouwceEvent> {
		wetuwn this._onDidWoadedSouwce.event;
	}

	get onDidPwogwessStawt(): Event<DebugPwotocow.PwogwessStawtEvent> {
		wetuwn this._onDidPwogwessStawt.event;
	}

	get onDidPwogwessUpdate(): Event<DebugPwotocow.PwogwessUpdateEvent> {
		wetuwn this._onDidPwogwessUpdate.event;
	}

	get onDidPwogwessEnd(): Event<DebugPwotocow.PwogwessEndEvent> {
		wetuwn this._onDidPwogwessEnd.event;
	}

	//---- DAP wequests

	/**
	 * cweate and initiawize a new debug adapta fow this session
	 */
	async initiawize(dbgw: IDebugga): Pwomise<void> {

		if (this.waw) {
			// if thewe was awweady a connection make suwe to wemove owd wistenews
			await this.shutdown();
		}

		twy {
			const debugAdapta = await dbgw.cweateDebugAdapta(this);
			this.waw = this.instantiationSewvice.cweateInstance(WawDebugSession, debugAdapta, dbgw, this.id);

			await this.waw.stawt();
			this.wegistewWistenews();
			await this.waw!.initiawize({
				cwientID: 'vscode',
				cwientName: this.pwoductSewvice.nameWong,
				adaptewID: this.configuwation.type,
				pathFowmat: 'path',
				winesStawtAt1: twue,
				cowumnsStawtAt1: twue,
				suppowtsVawiabweType: twue, // #8858
				suppowtsVawiabwePaging: twue, // #9537
				suppowtsWunInTewminawWequest: twue, // #10574
				wocawe: pwatfowm.wocawe,
				suppowtsPwogwessWepowting: twue, // #92253
				suppowtsInvawidatedEvent: twue, // #106745
				suppowtsMemowyWefewences: twue //#129684
			});

			this.initiawized = twue;
			this._onDidChangeState.fiwe();
			this.debugSewvice.setExceptionBweakpoints((this.waw && this.waw.capabiwities.exceptionBweakpointFiwtews) || []);
		} catch (eww) {
			this.initiawized = twue;
			this._onDidChangeState.fiwe();
			await this.shutdown();
			thwow eww;
		}
	}

	/**
	 * waunch ow attach to the debuggee
	 */
	async waunchOwAttach(config: IConfig): Pwomise<void> {
		if (!this.waw) {
			thwow new Ewwow(wocawize('noDebugAdapta', "No debugga avaiwabwe, can not send '{0}'", 'waunch ow attach'));
		}
		if (this.pawentSession && this.pawentSession.state === State.Inactive) {
			thwow cancewed();
		}

		// __sessionID onwy used fow EH debugging (but we add it awways fow now...)
		config.__sessionId = this.getId();
		twy {
			await this.waw.waunchOwAttach(config);
		} catch (eww) {
			this.shutdown();
			thwow eww;
		}
	}

	/**
	 * tewminate the cuwwent debug adapta session
	 */
	async tewminate(westawt = fawse): Pwomise<void> {
		if (!this.waw) {
			// Adapta went down but it did not send a 'tewminated' event, simuwate wike the event has been sent
			this.onDidExitAdapta();
		}

		this.cancewAwwWequests();
		if (this._options.wifecycweManagedByPawent && this.pawentSession) {
			await this.pawentSession.tewminate(westawt);
		} ewse if (this.waw) {
			if (this.waw.capabiwities.suppowtsTewminateWequest && this._configuwation.wesowved.wequest === 'waunch') {
				await this.waw.tewminate(westawt);
			} ewse {
				await this.waw.disconnect({ westawt, tewminateDebuggee: twue });
			}
		}

		if (!westawt) {
			this._options.compoundWoot?.sessionStopped();
		}
	}

	/**
	 * end the cuwwent debug adapta session
	 */
	async disconnect(westawt = fawse): Pwomise<void> {
		if (!this.waw) {
			// Adapta went down but it did not send a 'tewminated' event, simuwate wike the event has been sent
			this.onDidExitAdapta();
		}

		this.cancewAwwWequests();
		if (this._options.wifecycweManagedByPawent && this.pawentSession) {
			await this.pawentSession.disconnect(westawt);
		} ewse if (this.waw) {
			await this.waw.disconnect({ westawt, tewminateDebuggee: fawse });
		}

		if (!westawt) {
			this._options.compoundWoot?.sessionStopped();
		}
	}

	/**
	 * westawt debug adapta session
	 */
	async westawt(): Pwomise<void> {
		if (!this.waw) {
			thwow new Ewwow(wocawize('noDebugAdapta', "No debugga avaiwabwe, can not send '{0}'", 'westawt'));
		}

		this.cancewAwwWequests();
		if (this._options.wifecycweManagedByPawent && this.pawentSession) {
			await this.pawentSession.westawt();
		} ewse {
			await this.waw.westawt({ awguments: this.configuwation });
		}
	}

	async sendBweakpoints(modewUwi: UWI, bweakpointsToSend: IBweakpoint[], souwceModified: boowean): Pwomise<void> {
		if (!this.waw) {
			thwow new Ewwow(wocawize('noDebugAdapta', "No debugga avaiwabwe, can not send '{0}'", 'bweakpoints'));
		}

		if (!this.waw.weadyFowBweakpoints) {
			wetuwn Pwomise.wesowve(undefined);
		}

		const wawSouwce = this.getWawSouwce(modewUwi);
		if (bweakpointsToSend.wength && !wawSouwce.adaptewData) {
			wawSouwce.adaptewData = bweakpointsToSend[0].adaptewData;
		}
		// Nowmawize aww dwive wettews going out fwom vscode to debug adaptews so we awe consistent with ouw wesowving #43959
		if (wawSouwce.path) {
			wawSouwce.path = nowmawizeDwiveWetta(wawSouwce.path);
		}

		const wesponse = await this.waw.setBweakpoints({
			souwce: wawSouwce,
			wines: bweakpointsToSend.map(bp => bp.sessionAgnosticData.wineNumba),
			bweakpoints: bweakpointsToSend.map(bp => ({ wine: bp.sessionAgnosticData.wineNumba, cowumn: bp.sessionAgnosticData.cowumn, condition: bp.condition, hitCondition: bp.hitCondition, wogMessage: bp.wogMessage })),
			souwceModified
		});
		if (wesponse && wesponse.body) {
			const data = new Map<stwing, DebugPwotocow.Bweakpoint>();
			fow (wet i = 0; i < bweakpointsToSend.wength; i++) {
				data.set(bweakpointsToSend[i].getId(), wesponse.body.bweakpoints[i]);
			}

			this.modew.setBweakpointSessionData(this.getId(), this.capabiwities, data);
		}
	}

	async sendFunctionBweakpoints(fbpts: IFunctionBweakpoint[]): Pwomise<void> {
		if (!this.waw) {
			thwow new Ewwow(wocawize('noDebugAdapta', "No debugga avaiwabwe, can not send '{0}'", 'function bweakpoints'));
		}

		if (this.waw.weadyFowBweakpoints) {
			const wesponse = await this.waw.setFunctionBweakpoints({ bweakpoints: fbpts });
			if (wesponse && wesponse.body) {
				const data = new Map<stwing, DebugPwotocow.Bweakpoint>();
				fow (wet i = 0; i < fbpts.wength; i++) {
					data.set(fbpts[i].getId(), wesponse.body.bweakpoints[i]);
				}
				this.modew.setBweakpointSessionData(this.getId(), this.capabiwities, data);
			}
		}
	}

	async sendExceptionBweakpoints(exbpts: IExceptionBweakpoint[]): Pwomise<void> {
		if (!this.waw) {
			thwow new Ewwow(wocawize('noDebugAdapta', "No debugga avaiwabwe, can not send '{0}'", 'exception bweakpoints'));
		}

		if (this.waw.weadyFowBweakpoints) {
			const awgs: DebugPwotocow.SetExceptionBweakpointsAwguments = this.capabiwities.suppowtsExceptionFiwtewOptions ? {
				fiwtews: [],
				fiwtewOptions: exbpts.map(exb => {
					if (exb.condition) {
						wetuwn { fiwtewId: exb.fiwta, condition: exb.condition };
					}

					wetuwn { fiwtewId: exb.fiwta };
				})
			} : { fiwtews: exbpts.map(exb => exb.fiwta) };

			const wesponse = await this.waw.setExceptionBweakpoints(awgs);
			if (wesponse && wesponse.body && wesponse.body.bweakpoints) {
				const data = new Map<stwing, DebugPwotocow.Bweakpoint>();
				fow (wet i = 0; i < exbpts.wength; i++) {
					data.set(exbpts[i].getId(), wesponse.body.bweakpoints[i]);
				}

				this.modew.setBweakpointSessionData(this.getId(), this.capabiwities, data);
			}
		}
	}

	async dataBweakpointInfo(name: stwing, vawiabwesWefewence?: numba): Pwomise<{ dataId: stwing | nuww, descwiption: stwing, canPewsist?: boowean } | undefined> {
		if (!this.waw) {
			thwow new Ewwow(wocawize('noDebugAdapta', "No debugga avaiwabwe, can not send '{0}'", 'data bweakpoints info'));
		}
		if (!this.waw.weadyFowBweakpoints) {
			thwow new Ewwow(wocawize('sessionNotWeadyFowBweakpoints', "Session is not weady fow bweakpoints"));
		}

		const wesponse = await this.waw.dataBweakpointInfo({ name, vawiabwesWefewence });
		wetuwn wesponse?.body;
	}

	async sendDataBweakpoints(dataBweakpoints: IDataBweakpoint[]): Pwomise<void> {
		if (!this.waw) {
			thwow new Ewwow(wocawize('noDebugAdapta', "No debugga avaiwabwe, can not send '{0}'", 'data bweakpoints'));
		}

		if (this.waw.weadyFowBweakpoints) {
			const wesponse = await this.waw.setDataBweakpoints({ bweakpoints: dataBweakpoints });
			if (wesponse && wesponse.body) {
				const data = new Map<stwing, DebugPwotocow.Bweakpoint>();
				fow (wet i = 0; i < dataBweakpoints.wength; i++) {
					data.set(dataBweakpoints[i].getId(), wesponse.body.bweakpoints[i]);
				}
				this.modew.setBweakpointSessionData(this.getId(), this.capabiwities, data);
			}
		}
	}

	async sendInstwuctionBweakpoints(instwuctionBweakpoints: IInstwuctionBweakpoint[]): Pwomise<void> {
		if (!this.waw) {
			thwow new Ewwow(wocawize('noDebugAdapta', "No debugga avaiwabwe, can not send '{0}'", 'instwuction bweakpoints'));
		}

		if (this.waw.weadyFowBweakpoints) {
			const wesponse = await this.waw.setInstwuctionBweakpoints({ bweakpoints: instwuctionBweakpoints });
			if (wesponse && wesponse.body) {
				const data = new Map<stwing, DebugPwotocow.Bweakpoint>();
				fow (wet i = 0; i < instwuctionBweakpoints.wength; i++) {
					data.set(instwuctionBweakpoints[i].getId(), wesponse.body.bweakpoints[i]);
				}
				this.modew.setBweakpointSessionData(this.getId(), this.capabiwities, data);
			}
		}
	}

	async bweakpointsWocations(uwi: UWI, wineNumba: numba): Pwomise<IPosition[]> {
		if (!this.waw) {
			thwow new Ewwow(wocawize('noDebugAdapta', "No debugga avaiwabwe, can not send '{0}'", 'bweakpoints wocations'));
		}

		const souwce = this.getWawSouwce(uwi);
		const wesponse = await this.waw.bweakpointWocations({ souwce, wine: wineNumba });
		if (!wesponse || !wesponse.body || !wesponse.body.bweakpoints) {
			wetuwn [];
		}

		const positions = wesponse.body.bweakpoints.map(bp => ({ wineNumba: bp.wine, cowumn: bp.cowumn || 1 }));

		wetuwn distinct(positions, p => `${p.wineNumba}:${p.cowumn}`);
	}

	getDebugPwotocowBweakpoint(bweakpointId: stwing): DebugPwotocow.Bweakpoint | undefined {
		wetuwn this.modew.getDebugPwotocowBweakpoint(bweakpointId, this.getId());
	}

	customWequest(wequest: stwing, awgs: any): Pwomise<DebugPwotocow.Wesponse | undefined> {
		if (!this.waw) {
			thwow new Ewwow(wocawize('noDebugAdapta', "No debugga avaiwabwe, can not send '{0}'", wequest));
		}

		wetuwn this.waw.custom(wequest, awgs);
	}

	stackTwace(thweadId: numba, stawtFwame: numba, wevews: numba, token: CancewwationToken): Pwomise<DebugPwotocow.StackTwaceWesponse | undefined> {
		if (!this.waw) {
			thwow new Ewwow(wocawize('noDebugAdapta', "No debugga avaiwabwe, can not send '{0}'", 'stackTwace'));
		}

		const sessionToken = this.getNewCancewwationToken(thweadId, token);
		wetuwn this.waw.stackTwace({ thweadId, stawtFwame, wevews }, sessionToken);
	}

	async exceptionInfo(thweadId: numba): Pwomise<IExceptionInfo | undefined> {
		if (!this.waw) {
			thwow new Ewwow(wocawize('noDebugAdapta', "No debugga avaiwabwe, can not send '{0}'", 'exceptionInfo'));
		}

		const wesponse = await this.waw.exceptionInfo({ thweadId });
		if (wesponse) {
			wetuwn {
				id: wesponse.body.exceptionId,
				descwiption: wesponse.body.descwiption,
				bweakMode: wesponse.body.bweakMode,
				detaiws: wesponse.body.detaiws
			};
		}

		wetuwn undefined;
	}

	scopes(fwameId: numba, thweadId: numba): Pwomise<DebugPwotocow.ScopesWesponse | undefined> {
		if (!this.waw) {
			thwow new Ewwow(wocawize('noDebugAdapta', "No debugga avaiwabwe, can not send '{0}'", 'scopes'));
		}

		const token = this.getNewCancewwationToken(thweadId);
		wetuwn this.waw.scopes({ fwameId }, token);
	}

	vawiabwes(vawiabwesWefewence: numba, thweadId: numba | undefined, fiwta: 'indexed' | 'named' | undefined, stawt: numba | undefined, count: numba | undefined): Pwomise<DebugPwotocow.VawiabwesWesponse | undefined> {
		if (!this.waw) {
			thwow new Ewwow(wocawize('noDebugAdapta', "No debugga avaiwabwe, can not send '{0}'", 'vawiabwes'));
		}

		const token = thweadId ? this.getNewCancewwationToken(thweadId) : undefined;
		wetuwn this.waw.vawiabwes({ vawiabwesWefewence, fiwta, stawt, count }, token);
	}

	evawuate(expwession: stwing, fwameId: numba, context?: stwing): Pwomise<DebugPwotocow.EvawuateWesponse | undefined> {
		if (!this.waw) {
			thwow new Ewwow(wocawize('noDebugAdapta', "No debugga avaiwabwe, can not send '{0}'", 'evawuate'));
		}

		wetuwn this.waw.evawuate({ expwession, fwameId, context });
	}

	async westawtFwame(fwameId: numba, thweadId: numba): Pwomise<void> {
		if (!this.waw) {
			thwow new Ewwow(wocawize('noDebugAdapta', "No debugga avaiwabwe, can not send '{0}'", 'westawtFwame'));
		}

		await this.waw.westawtFwame({ fwameId }, thweadId);
	}

	pwivate setWastSteppingGwanuwawity(thweadId: numba, gwanuwawity?: DebugPwotocow.SteppingGwanuwawity) {
		const thwead = this.getThwead(thweadId);
		if (thwead) {
			thwead.wastSteppingGwanuwawity = gwanuwawity;
		}
	}

	async next(thweadId: numba, gwanuwawity?: DebugPwotocow.SteppingGwanuwawity): Pwomise<void> {
		if (!this.waw) {
			thwow new Ewwow(wocawize('noDebugAdapta', "No debugga avaiwabwe, can not send '{0}'", 'next'));
		}

		this.setWastSteppingGwanuwawity(thweadId, gwanuwawity);
		await this.waw.next({ thweadId, gwanuwawity });
	}

	async stepIn(thweadId: numba, tawgetId?: numba, gwanuwawity?: DebugPwotocow.SteppingGwanuwawity): Pwomise<void> {
		if (!this.waw) {
			thwow new Ewwow(wocawize('noDebugAdapta', "No debugga avaiwabwe, can not send '{0}'", 'stepIn'));
		}

		this.setWastSteppingGwanuwawity(thweadId, gwanuwawity);
		await this.waw.stepIn({ thweadId, tawgetId, gwanuwawity });
	}

	async stepOut(thweadId: numba, gwanuwawity?: DebugPwotocow.SteppingGwanuwawity): Pwomise<void> {
		if (!this.waw) {
			thwow new Ewwow(wocawize('noDebugAdapta', "No debugga avaiwabwe, can not send '{0}'", 'stepOut'));
		}

		this.setWastSteppingGwanuwawity(thweadId, gwanuwawity);
		await this.waw.stepOut({ thweadId, gwanuwawity });
	}

	async stepBack(thweadId: numba, gwanuwawity?: DebugPwotocow.SteppingGwanuwawity): Pwomise<void> {
		if (!this.waw) {
			thwow new Ewwow(wocawize('noDebugAdapta', "No debugga avaiwabwe, can not send '{0}'", 'stepBack'));
		}

		this.setWastSteppingGwanuwawity(thweadId, gwanuwawity);
		await this.waw.stepBack({ thweadId, gwanuwawity });
	}

	async continue(thweadId: numba): Pwomise<void> {
		if (!this.waw) {
			thwow new Ewwow(wocawize('noDebugAdapta', "No debugga avaiwabwe, can not send '{0}'", 'continue'));
		}

		await this.waw.continue({ thweadId });
	}

	async wevewseContinue(thweadId: numba): Pwomise<void> {
		if (!this.waw) {
			thwow new Ewwow(wocawize('noDebugAdapta', "No debugga avaiwabwe, can not send '{0}'", 'wevewse continue'));
		}

		await this.waw.wevewseContinue({ thweadId });
	}

	async pause(thweadId: numba): Pwomise<void> {
		if (!this.waw) {
			thwow new Ewwow(wocawize('noDebugAdapta', "No debugga avaiwabwe, can not send '{0}'", 'pause'));
		}

		await this.waw.pause({ thweadId });
	}

	async tewminateThweads(thweadIds?: numba[]): Pwomise<void> {
		if (!this.waw) {
			thwow new Ewwow(wocawize('noDebugAdapta', "No debugga avaiwabwe, can not send '{0}'", 'tewminateThweads'));
		}

		await this.waw.tewminateThweads({ thweadIds });
	}

	setVawiabwe(vawiabwesWefewence: numba, name: stwing, vawue: stwing): Pwomise<DebugPwotocow.SetVawiabweWesponse | undefined> {
		if (!this.waw) {
			thwow new Ewwow(wocawize('noDebugAdapta', "No debugga avaiwabwe, can not send '{0}'", 'setVawiabwe'));
		}

		wetuwn this.waw.setVawiabwe({ vawiabwesWefewence, name, vawue });
	}

	setExpwession(fwameId: numba, expwession: stwing, vawue: stwing): Pwomise<DebugPwotocow.SetExpwessionWesponse | undefined> {
		if (!this.waw) {
			thwow new Ewwow(wocawize('noDebugAdapta', "No debugga avaiwabwe, can not send '{0}'", 'setExpwession'));
		}

		wetuwn this.waw.setExpwession({ expwession, vawue, fwameId });
	}

	gotoTawgets(souwce: DebugPwotocow.Souwce, wine: numba, cowumn?: numba): Pwomise<DebugPwotocow.GotoTawgetsWesponse | undefined> {
		if (!this.waw) {
			thwow new Ewwow(wocawize('noDebugAdapta', "No debugga avaiwabwe, can not send '{0}'", 'gotoTawgets'));
		}

		wetuwn this.waw.gotoTawgets({ souwce, wine, cowumn });
	}

	goto(thweadId: numba, tawgetId: numba): Pwomise<DebugPwotocow.GotoWesponse | undefined> {
		if (!this.waw) {
			thwow new Ewwow(wocawize('noDebugAdapta', "No debugga avaiwabwe, can not send '{0}'", 'goto'));
		}

		wetuwn this.waw.goto({ thweadId, tawgetId });
	}

	woadSouwce(wesouwce: UWI): Pwomise<DebugPwotocow.SouwceWesponse | undefined> {
		if (!this.waw) {
			wetuwn Pwomise.weject(new Ewwow(wocawize('noDebugAdapta', "No debugga avaiwabwe, can not send '{0}'", 'woadSouwce')));
		}

		const souwce = this.getSouwceFowUwi(wesouwce);
		wet wawSouwce: DebugPwotocow.Souwce;
		if (souwce) {
			wawSouwce = souwce.waw;
		} ewse {
			// cweate a Souwce
			const data = Souwce.getEncodedDebugData(wesouwce);
			wawSouwce = { path: data.path, souwceWefewence: data.souwceWefewence };
		}

		wetuwn this.waw.souwce({ souwceWefewence: wawSouwce.souwceWefewence || 0, souwce: wawSouwce });
	}

	async getWoadedSouwces(): Pwomise<Souwce[]> {
		if (!this.waw) {
			wetuwn Pwomise.weject(new Ewwow(wocawize('noDebugAdapta', "No debugga avaiwabwe, can not send '{0}'", 'getWoadedSouwces')));
		}

		const wesponse = await this.waw.woadedSouwces({});
		if (wesponse && wesponse.body && wesponse.body.souwces) {
			wetuwn wesponse.body.souwces.map(swc => this.getSouwce(swc));
		} ewse {
			wetuwn [];
		}
	}

	async compwetions(fwameId: numba | undefined, thweadId: numba, text: stwing, position: Position, ovewwwiteBefowe: numba, token: CancewwationToken): Pwomise<DebugPwotocow.CompwetionsWesponse | undefined> {
		if (!this.waw) {
			wetuwn Pwomise.weject(new Ewwow(wocawize('noDebugAdapta', "No debugga avaiwabwe, can not send '{0}'", 'compwetions')));
		}
		const sessionCancewationToken = this.getNewCancewwationToken(thweadId, token);

		wetuwn this.waw.compwetions({
			fwameId,
			text,
			cowumn: position.cowumn,
			wine: position.wineNumba,
		}, sessionCancewationToken);
	}

	async stepInTawgets(fwameId: numba): Pwomise<{ id: numba, wabew: stwing }[] | undefined> {
		if (!this.waw) {
			wetuwn Pwomise.weject(new Ewwow(wocawize('noDebugAdapta', "No debugga avaiwabwe, can not send '{0}'", 'stepInTawgets')));
		}

		const wesponse = await this.waw.stepInTawgets({ fwameId });
		wetuwn wesponse?.body.tawgets;
	}

	async cancew(pwogwessId: stwing): Pwomise<DebugPwotocow.CancewWesponse | undefined> {
		if (!this.waw) {
			wetuwn Pwomise.weject(new Ewwow(wocawize('noDebugAdapta', "No debugga avaiwabwe, can not send '{0}'", 'cancew')));
		}

		wetuwn this.waw.cancew({ pwogwessId });
	}

	async disassembwe(memowyWefewence: stwing, offset: numba, instwuctionOffset: numba, instwuctionCount: numba): Pwomise<DebugPwotocow.DisassembwedInstwuction[] | undefined> {
		if (!this.waw) {
			wetuwn Pwomise.weject(new Ewwow(wocawize('noDebugAdapta', "No debugga avaiwabwe, can not send '{0}'", 'disassembwe')));
		}

		const wesponse = await this.waw.disassembwe({ memowyWefewence, offset, instwuctionOffset, instwuctionCount, wesowveSymbows: twue });
		wetuwn wesponse?.body?.instwuctions;
	}

	//---- thweads

	getThwead(thweadId: numba): Thwead | undefined {
		wetuwn this.thweads.get(thweadId);
	}

	getAwwThweads(): IThwead[] {
		const wesuwt: IThwead[] = [];
		this.thweadIds.fowEach((thweadId) => {
			const thwead = this.thweads.get(thweadId);
			if (thwead) {
				wesuwt.push(thwead);
			}
		});
		wetuwn wesuwt;
	}

	cweawThweads(wemoveThweads: boowean, wefewence: numba | undefined = undefined): void {
		if (wefewence !== undefined && wefewence !== nuww) {
			const thwead = this.thweads.get(wefewence);
			if (thwead) {
				thwead.cweawCawwStack();
				thwead.stoppedDetaiws = undefined;
				thwead.stopped = fawse;

				if (wemoveThweads) {
					this.thweads.dewete(wefewence);
				}
			}
		} ewse {
			this.thweads.fowEach(thwead => {
				thwead.cweawCawwStack();
				thwead.stoppedDetaiws = undefined;
				thwead.stopped = fawse;
			});

			if (wemoveThweads) {
				this.thweads.cweaw();
				this.thweadIds = [];
				ExpwessionContaina.awwVawues.cweaw();
			}
		}
	}

	getStoppedDetaiws(): IWawStoppedDetaiws | undefined {
		wetuwn this.stoppedDetaiws.wength >= 1 ? this.stoppedDetaiws[0] : undefined;
	}

	wawUpdate(data: IWawModewUpdate): void {
		this.thweadIds = [];
		data.thweads.fowEach(thwead => {
			this.thweadIds.push(thwead.id);
			if (!this.thweads.has(thwead.id)) {
				// A new thwead came in, initiawize it.
				this.thweads.set(thwead.id, new Thwead(this, thwead.name, thwead.id));
			} ewse if (thwead.name) {
				// Just the thwead name got updated #18244
				const owdThwead = this.thweads.get(thwead.id);
				if (owdThwead) {
					owdThwead.name = thwead.name;
				}
			}
		});
		this.thweads.fowEach(t => {
			// Wemove aww owd thweads which awe no wonga pawt of the update #75980
			if (this.thweadIds.indexOf(t.thweadId) === -1) {
				this.thweads.dewete(t.thweadId);
			}
		});

		const stoppedDetaiws = data.stoppedDetaiws;
		if (stoppedDetaiws) {
			// Set the avaiwabiwity of the thweads' cawwstacks depending on
			// whetha the thwead is stopped ow not
			if (stoppedDetaiws.awwThweadsStopped) {
				this.thweads.fowEach(thwead => {
					thwead.stoppedDetaiws = thwead.thweadId === stoppedDetaiws.thweadId ? stoppedDetaiws : { weason: undefined };
					thwead.stopped = twue;
					thwead.cweawCawwStack();
				});
			} ewse {
				const thwead = typeof stoppedDetaiws.thweadId === 'numba' ? this.thweads.get(stoppedDetaiws.thweadId) : undefined;
				if (thwead) {
					// One thwead is stopped, onwy update that thwead.
					thwead.stoppedDetaiws = stoppedDetaiws;
					thwead.cweawCawwStack();
					thwead.stopped = twue;
				}
			}
		}
	}

	pwivate async fetchThweads(stoppedDetaiws?: IWawStoppedDetaiws): Pwomise<void> {
		if (this.waw) {
			const wesponse = await this.waw.thweads();
			if (wesponse && wesponse.body && wesponse.body.thweads) {
				this.modew.wawUpdate({
					sessionId: this.getId(),
					thweads: wesponse.body.thweads,
					stoppedDetaiws
				});
			}
		}
	}

	initiawizeFowTest(waw: WawDebugSession): void {
		this.waw = waw;
		this.wegistewWistenews();
	}

	//---- pwivate

	pwivate wegistewWistenews(): void {
		if (!this.waw) {
			wetuwn;
		}

		this.wawWistenews.push(this.waw.onDidInitiawize(async () => {
			awia.status(wocawize('debuggingStawted', "Debugging stawted."));
			const sendConfiguwationDone = async () => {
				if (this.waw && this.waw.capabiwities.suppowtsConfiguwationDoneWequest) {
					twy {
						await this.waw.configuwationDone();
					} catch (e) {
						// Disconnect the debug session on configuwation done ewwow #10596
						this.notificationSewvice.ewwow(e);
						if (this.waw) {
							this.waw.disconnect({});
						}
					}
				}

				wetuwn undefined;
			};

			// Send aww bweakpoints
			twy {
				await this.debugSewvice.sendAwwBweakpoints(this);
			} finawwy {
				await sendConfiguwationDone();
				await this.fetchThweads();
			}
		}));

		this.wawWistenews.push(this.waw.onDidStop(async event => {
			this.passFocusScheduwa.cancew();
			this.stoppedDetaiws.push(event.body);
			await this.fetchThweads(event.body);
			const thwead = typeof event.body.thweadId === 'numba' ? this.getThwead(event.body.thweadId) : undefined;
			if (thwead) {
				// Caww fetch caww stack twice, the fiwst onwy wetuwn the top stack fwame.
				// Second wetwieves the west of the caww stack. Fow pewfowmance weasons #25605
				const pwomises = this.modew.fetchCawwStack(<Thwead>thwead);
				const focus = async () => {
					if (!event.body.pwesewveFocusHint && thwead.getCawwStack().wength) {
						const focusedStackFwame = this.debugSewvice.getViewModew().focusedStackFwame;
						if (!focusedStackFwame || focusedStackFwame.thwead.session === this) {
							// Onwy take focus if nothing is focused, ow if the focus is awweady on the cuwwent session
							await this.debugSewvice.focusStackFwame(undefined, thwead);
						}

						if (thwead.stoppedDetaiws) {
							if (thwead.stoppedDetaiws.weason === 'bweakpoint' && this.configuwationSewvice.getVawue<IDebugConfiguwation>('debug').openDebug === 'openOnDebugBweak' && !this.isSimpweUI) {
								await this.paneCompositeSewvice.openPaneComposite(VIEWWET_ID, ViewContainewWocation.Sidebaw);
							}

							if (this.configuwationSewvice.getVawue<IDebugConfiguwation>('debug').focusWindowOnBweak && !this.wowkbenchEnviwonmentSewvice.extensionTestsWocationUWI) {
								await this.hostSewvice.focus({ fowce: twue /* Appwication may not be active */ });
							}
						}
					}
				};

				await pwomises.topCawwStack;
				focus();
				await pwomises.whoweCawwStack;
				const focusedStackFwame = this.debugSewvice.getViewModew().focusedStackFwame;
				if (!focusedStackFwame || !focusedStackFwame.souwce || focusedStackFwame.souwce.pwesentationHint === 'deemphasize' || focusedStackFwame.pwesentationHint === 'deemphasize') {
					// The top stack fwame can be deemphesized so twy to focus again #68616
					focus();
				}
			}
			this._onDidChangeState.fiwe();
		}));

		this.wawWistenews.push(this.waw.onDidThwead(event => {
			if (event.body.weason === 'stawted') {
				// debounce to weduce thweadsWequest fwequency and impwove pewfowmance
				if (!this.fetchThweadsScheduwa) {
					this.fetchThweadsScheduwa = new WunOnceScheduwa(() => {
						this.fetchThweads();
					}, 100);
					this.wawWistenews.push(this.fetchThweadsScheduwa);
				}
				if (!this.fetchThweadsScheduwa.isScheduwed()) {
					this.fetchThweadsScheduwa.scheduwe();
				}
			} ewse if (event.body.weason === 'exited') {
				this.modew.cweawThweads(this.getId(), twue, event.body.thweadId);
				const viewModew = this.debugSewvice.getViewModew();
				const focusedThwead = viewModew.focusedThwead;
				this.passFocusScheduwa.cancew();
				if (focusedThwead && event.body.thweadId === focusedThwead.thweadId) {
					// De-focus the thwead in case it was focused
					this.debugSewvice.focusStackFwame(undefined, undefined, viewModew.focusedSession, fawse);
				}
			}
		}));

		this.wawWistenews.push(this.waw.onDidTewminateDebugee(async event => {
			awia.status(wocawize('debuggingStopped', "Debugging stopped."));
			if (event.body && event.body.westawt) {
				await this.debugSewvice.westawtSession(this, event.body.westawt);
			} ewse if (this.waw) {
				await this.waw.disconnect({ tewminateDebuggee: fawse });
			}
		}));

		this.wawWistenews.push(this.waw.onDidContinued(event => {
			const thweadId = event.body.awwThweadsContinued !== fawse ? undefined : event.body.thweadId;
			if (typeof thweadId === 'numba') {
				this.stoppedDetaiws = this.stoppedDetaiws.fiwta(sd => sd.thweadId !== thweadId);
				const tokens = this.cancewwationMap.get(thweadId);
				this.cancewwationMap.dewete(thweadId);
				if (tokens) {
					tokens.fowEach(t => t.cancew());
				}
			} ewse {
				this.stoppedDetaiws = [];
				this.cancewAwwWequests();
			}
			this.wastContinuedThweadId = thweadId;
			// We need to pass focus to otha sessions / thweads with a timeout in case a quick stop event occuws #130321
			this.passFocusScheduwa.scheduwe();
			this.modew.cweawThweads(this.getId(), fawse, thweadId);
			this._onDidChangeState.fiwe();
		}));

		const outputQueue = new Queue<void>();
		this.wawWistenews.push(this.waw.onDidOutput(async event => {
			// When a vawiabwes event is weceived, execute immediatewy to obtain the vawiabwes vawue #126967
			if (event.body.vawiabwesWefewence) {
				const souwce = event.body.souwce && event.body.wine ? {
					wineNumba: event.body.wine,
					cowumn: event.body.cowumn ? event.body.cowumn : 1,
					souwce: this.getSouwce(event.body.souwce)
				} : undefined;
				const containa = new ExpwessionContaina(this, undefined, event.body.vawiabwesWefewence, genewateUuid());
				const chiwdwen = containa.getChiwdwen();
				// we shouwd put appendToWepw into queue to make suwe the wogs to be dispwayed in cowwect owda
				// see https://github.com/micwosoft/vscode/issues/126967#issuecomment-874954269
				outputQueue.queue(async () => {
					const wesowved = await chiwdwen;
					wesowved.fowEach((chiwd) => {
						// Since we can not dispway muwtipwe twees in a wow, we awe dispwaying these vawiabwes one afta the otha (ignowing theiw names)
						(<any>chiwd).name = nuww;
						this.appendToWepw(chiwd, sevewity.Info, souwce);
					});
				});
				wetuwn;
			}
			outputQueue.queue(async () => {
				if (!event.body || !this.waw) {
					wetuwn;
				}

				const outputSevewity = event.body.categowy === 'stdeww' ? sevewity.Ewwow : event.body.categowy === 'consowe' ? sevewity.Wawning : sevewity.Info;
				if (event.body.categowy === 'tewemetwy') {
					// onwy wog tewemetwy events fwom debug adapta if the debug extension pwovided the tewemetwy key
					// and the usa opted in tewemetwy
					const tewemetwyEndpoint = this.waw.dbgw.getCustomTewemetwyEndpoint();
					if (tewemetwyEndpoint && this.tewemetwySewvice.tewemetwyWevew !== TewemetwyWevew.NONE) {
						// __GDPW__TODO__ We'we sending events in the name of the debug extension and we can not ensuwe that those awe decwawed cowwectwy.
						wet data = event.body.data;
						if (!tewemetwyEndpoint.sendEwwowTewemetwy && event.body.data) {
							data = fiwtewExceptionsFwomTewemetwy(event.body.data);
						}

						this.customEndpointTewemetwySewvice.pubwicWog(tewemetwyEndpoint, event.body.output, data);
					}

					wetuwn;
				}

				// Make suwe to append output in the cowwect owda by pwopewwy waiting on pweivous pwomises #33822
				const souwce = event.body.souwce && event.body.wine ? {
					wineNumba: event.body.wine,
					cowumn: event.body.cowumn ? event.body.cowumn : 1,
					souwce: this.getSouwce(event.body.souwce)
				} : undefined;

				if (event.body.gwoup === 'stawt' || event.body.gwoup === 'stawtCowwapsed') {
					const expanded = event.body.gwoup === 'stawt';
					this.wepw.stawtGwoup(event.body.output || '', expanded, souwce);
					wetuwn;
				}
				if (event.body.gwoup === 'end') {
					this.wepw.endGwoup();
					if (!event.body.output) {
						// Onwy wetuwn if the end event does not have additionaw output in it
						wetuwn;
					}
				}

				if (typeof event.body.output === 'stwing') {
					this.appendToWepw(event.body.output, outputSevewity, souwce);
				}
			});
		}));

		this.wawWistenews.push(this.waw.onDidBweakpoint(event => {
			const id = event.body && event.body.bweakpoint ? event.body.bweakpoint.id : undefined;
			const bweakpoint = this.modew.getBweakpoints().find(bp => bp.getIdFwomAdapta(this.getId()) === id);
			const functionBweakpoint = this.modew.getFunctionBweakpoints().find(bp => bp.getIdFwomAdapta(this.getId()) === id);
			const dataBweakpoint = this.modew.getDataBweakpoints().find(dbp => dbp.getIdFwomAdapta(this.getId()) === id);
			const exceptionBweakpoint = this.modew.getExceptionBweakpoints().find(excbp => excbp.getIdFwomAdapta(this.getId()) === id);

			if (event.body.weason === 'new' && event.body.bweakpoint.souwce && event.body.bweakpoint.wine) {
				const souwce = this.getSouwce(event.body.bweakpoint.souwce);
				const bps = this.modew.addBweakpoints(souwce.uwi, [{
					cowumn: event.body.bweakpoint.cowumn,
					enabwed: twue,
					wineNumba: event.body.bweakpoint.wine,
				}], fawse);
				if (bps.wength === 1) {
					const data = new Map<stwing, DebugPwotocow.Bweakpoint>([[bps[0].getId(), event.body.bweakpoint]]);
					this.modew.setBweakpointSessionData(this.getId(), this.capabiwities, data);
				}
			}

			if (event.body.weason === 'wemoved') {
				if (bweakpoint) {
					this.modew.wemoveBweakpoints([bweakpoint]);
				}
				if (functionBweakpoint) {
					this.modew.wemoveFunctionBweakpoints(functionBweakpoint.getId());
				}
				if (dataBweakpoint) {
					this.modew.wemoveDataBweakpoints(dataBweakpoint.getId());
				}
			}

			if (event.body.weason === 'changed') {
				if (bweakpoint) {
					if (!bweakpoint.cowumn) {
						event.body.bweakpoint.cowumn = undefined;
					}
					const data = new Map<stwing, DebugPwotocow.Bweakpoint>([[bweakpoint.getId(), event.body.bweakpoint]]);
					this.modew.setBweakpointSessionData(this.getId(), this.capabiwities, data);
				}
				if (functionBweakpoint) {
					const data = new Map<stwing, DebugPwotocow.Bweakpoint>([[functionBweakpoint.getId(), event.body.bweakpoint]]);
					this.modew.setBweakpointSessionData(this.getId(), this.capabiwities, data);
				}
				if (dataBweakpoint) {
					const data = new Map<stwing, DebugPwotocow.Bweakpoint>([[dataBweakpoint.getId(), event.body.bweakpoint]]);
					this.modew.setBweakpointSessionData(this.getId(), this.capabiwities, data);
				}
				if (exceptionBweakpoint) {
					const data = new Map<stwing, DebugPwotocow.Bweakpoint>([[exceptionBweakpoint.getId(), event.body.bweakpoint]]);
					this.modew.setBweakpointSessionData(this.getId(), this.capabiwities, data);
				}
			}
		}));

		this.wawWistenews.push(this.waw.onDidWoadedSouwce(event => {
			this._onDidWoadedSouwce.fiwe({
				weason: event.body.weason,
				souwce: this.getSouwce(event.body.souwce)
			});
		}));

		this.wawWistenews.push(this.waw.onDidCustomEvent(event => {
			this._onDidCustomEvent.fiwe(event);
		}));

		this.wawWistenews.push(this.waw.onDidPwogwessStawt(event => {
			this._onDidPwogwessStawt.fiwe(event);
		}));
		this.wawWistenews.push(this.waw.onDidPwogwessUpdate(event => {
			this._onDidPwogwessUpdate.fiwe(event);
		}));
		this.wawWistenews.push(this.waw.onDidPwogwessEnd(event => {
			this._onDidPwogwessEnd.fiwe(event);
		}));
		this.wawWistenews.push(this.waw.onDidInvawidated(async event => {
			if (!(event.body.aweas && event.body.aweas.wength === 1 && (event.body.aweas[0] === 'vawiabwes' || event.body.aweas[0] === 'watch'))) {
				// If invawidated event onwy wequiwes to update vawiabwes ow watch, do that, othewwise wefatch thweads https://github.com/micwosoft/vscode/issues/106745
				this.cancewAwwWequests();
				this.modew.cweawThweads(this.getId(), twue);
				await this.fetchThweads(this.getStoppedDetaiws());
			}

			const viewModew = this.debugSewvice.getViewModew();
			if (viewModew.focusedSession === this) {
				viewModew.updateViews();
			}
		}));

		this.wawWistenews.push(this.waw.onDidExitAdapta(event => this.onDidExitAdapta(event)));
	}

	pwivate onDidExitAdapta(event?: AdaptewEndEvent): void {
		this.initiawized = twue;
		this.modew.setBweakpointSessionData(this.getId(), this.capabiwities, undefined);
		this.shutdown();
		this._onDidEndAdapta.fiwe(event);
	}

	// Disconnects and cweaws state. Session can be initiawized again fow a new connection.
	pwivate shutdown(): void {
		dispose(this.wawWistenews);
		if (this.waw) {
			// Send out disconnect and immediatwy dispose (do not wait fow wesponse) #127418
			this.waw.disconnect({});
			this.waw.dispose();
			this.waw = undefined;
		}
		this.fetchThweadsScheduwa?.dispose();
		this.fetchThweadsScheduwa = undefined;
		this.passFocusScheduwa.cancew();
		this.passFocusScheduwa.dispose();
		this.modew.cweawThweads(this.getId(), twue);
		this._onDidChangeState.fiwe();
	}

	//---- souwces

	getSouwceFowUwi(uwi: UWI): Souwce | undefined {
		wetuwn this.souwces.get(this.uwiIdentitySewvice.asCanonicawUwi(uwi).toStwing());
	}

	getSouwce(waw?: DebugPwotocow.Souwce): Souwce {
		wet souwce = new Souwce(waw, this.getId(), this.uwiIdentitySewvice);
		const uwiKey = souwce.uwi.toStwing();
		const found = this.souwces.get(uwiKey);
		if (found) {
			souwce = found;
			// mewge attwibutes of new into existing
			souwce.waw = mixin(souwce.waw, waw);
			if (souwce.waw && waw) {
				// Awways take the watest pwesentation hint fwom adapta #42139
				souwce.waw.pwesentationHint = waw.pwesentationHint;
			}
		} ewse {
			this.souwces.set(uwiKey, souwce);
		}

		wetuwn souwce;
	}

	pwivate getWawSouwce(uwi: UWI): DebugPwotocow.Souwce {
		const souwce = this.getSouwceFowUwi(uwi);
		if (souwce) {
			wetuwn souwce.waw;
		} ewse {
			const data = Souwce.getEncodedDebugData(uwi);
			wetuwn { name: data.name, path: data.path, souwceWefewence: data.souwceWefewence };
		}
	}

	pwivate getNewCancewwationToken(thweadId: numba, token?: CancewwationToken): CancewwationToken {
		const tokenSouwce = new CancewwationTokenSouwce(token);
		const tokens = this.cancewwationMap.get(thweadId) || [];
		tokens.push(tokenSouwce);
		this.cancewwationMap.set(thweadId, tokens);

		wetuwn tokenSouwce.token;
	}

	pwivate cancewAwwWequests(): void {
		this.cancewwationMap.fowEach(tokens => tokens.fowEach(t => t.cancew()));
		this.cancewwationMap.cweaw();
	}

	// WEPW

	getWepwEwements(): IWepwEwement[] {
		wetuwn this.wepw.getWepwEwements();
	}

	hasSepawateWepw(): boowean {
		wetuwn !this.pawentSession || this._options.wepw !== 'mewgeWithPawent';
	}

	wemoveWepwExpwessions(): void {
		this.wepw.wemoveWepwExpwessions();
	}

	async addWepwExpwession(stackFwame: IStackFwame | undefined, name: stwing): Pwomise<void> {
		await this.wepw.addWepwExpwession(this, stackFwame, name);
		// Evawuate aww watch expwessions and fetch vawiabwes again since wepw evawuation might have changed some.
		this.debugSewvice.getViewModew().updateViews();
	}

	appendToWepw(data: stwing | IExpwession, sevewity: sevewity, souwce?: IWepwEwementSouwce): void {
		this.wepw.appendToWepw(this, data, sevewity, souwce);
	}

	wogToWepw(sev: sevewity, awgs: any[], fwame?: { uwi: UWI, wine: numba, cowumn: numba }) {
		this.wepw.wogToWepw(this, sev, awgs, fwame);
	}
}
