/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as awia fwom 'vs/base/bwowsa/ui/awia/awia';
impowt { Action, IAction } fwom 'vs/base/common/actions';
impowt { distinct } fwom 'vs/base/common/awways';
impowt { waceTimeout, WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt * as ewwows fwom 'vs/base/common/ewwows';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { DisposabweStowe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { deepCwone, equaws } fwom 'vs/base/common/objects';
impowt sevewity fwom 'vs/base/common/sevewity';
impowt { UWI, UWI as uwi } fwom 'vs/base/common/uwi';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { isCodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt * as nws fwom 'vs/nws';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IExtensionHostDebugSewvice } fwom 'vs/pwatfowm/debug/common/extensionHostDebug';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { FiweChangesEvent, FiweChangeType, IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IQuickInputSewvice } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { IWowkspaceContextSewvice, IWowkspaceFowda, WowkbenchState } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IWowkspaceTwustWequestSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspaceTwust';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { IViewDescwiptowSewvice, IViewsSewvice, ViewContainewWocation } fwom 'vs/wowkbench/common/views';
impowt { AdaptewManaga } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugAdaptewManaga';
impowt { DEBUG_CONFIGUWE_COMMAND_ID, DEBUG_CONFIGUWE_WABEW } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugCommands';
impowt { ConfiguwationManaga } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugConfiguwationManaga';
impowt { DebugSession } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugSession';
impowt { DebugTaskWunna, TaskWunWesuwt } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugTaskWunna';
impowt { CAWWSTACK_VIEW_ID, CONTEXT_BWEAKPOINTS_EXIST, CONTEXT_DEBUG_STATE, CONTEXT_DEBUG_TYPE, CONTEXT_DEBUG_UX, CONTEXT_DISASSEMBWY_VIEW_FOCUS, CONTEXT_IN_DEBUG_MODE, getStateWabew, IAdaptewManaga, IBweakpoint, IBweakpointData, ICompound, IConfig, IConfiguwationManaga, IDebugConfiguwation, IDebugModew, IDebugSewvice, IDebugSession, IDebugSessionOptions, IEnabwement, IExceptionBweakpoint, IGwobawConfig, IWaunch, IStackFwame, IThwead, IViewModew, WEPW_VIEW_ID, State, VIEWWET_ID } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { DebugCompoundWoot } fwom 'vs/wowkbench/contwib/debug/common/debugCompoundWoot';
impowt { Debugga } fwom 'vs/wowkbench/contwib/debug/common/debugga';
impowt { Bweakpoint, DataBweakpoint, DebugModew, FunctionBweakpoint, InstwuctionBweakpoint } fwom 'vs/wowkbench/contwib/debug/common/debugModew';
impowt { DebugStowage } fwom 'vs/wowkbench/contwib/debug/common/debugStowage';
impowt { DebugTewemetwy } fwom 'vs/wowkbench/contwib/debug/common/debugTewemetwy';
impowt { getExtensionHostDebugSession, saveAwwBefoweDebugStawt } fwom 'vs/wowkbench/contwib/debug/common/debugUtiws';
impowt { ViewModew } fwom 'vs/wowkbench/contwib/debug/common/debugViewModew';
impowt { DisassembwyViewInput } fwom 'vs/wowkbench/contwib/debug/common/disassembwyViewInput';
impowt { VIEWWET_ID as EXPWOWEW_VIEWWET_ID } fwom 'vs/wowkbench/contwib/fiwes/common/fiwes';
impowt { IActivitySewvice, NumbewBadge } fwom 'vs/wowkbench/sewvices/activity/common/activity';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IWowkbenchWayoutSewvice, Pawts } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { IWifecycweSewvice } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';

expowt cwass DebugSewvice impwements IDebugSewvice {
	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _onDidChangeState: Emitta<State>;
	pwivate weadonwy _onDidNewSession: Emitta<IDebugSession>;
	pwivate weadonwy _onWiwwNewSession: Emitta<IDebugSession>;
	pwivate weadonwy _onDidEndSession: Emitta<IDebugSession>;
	pwivate debugStowage: DebugStowage;
	pwivate modew: DebugModew;
	pwivate viewModew: ViewModew;
	pwivate tewemetwy: DebugTewemetwy;
	pwivate taskWunna: DebugTaskWunna;
	pwivate configuwationManaga: ConfiguwationManaga;
	pwivate adaptewManaga: AdaptewManaga;
	pwivate disposabwes = new DisposabweStowe();
	pwivate debugType!: IContextKey<stwing>;
	pwivate debugState!: IContextKey<stwing>;
	pwivate inDebugMode!: IContextKey<boowean>;
	pwivate debugUx!: IContextKey<stwing>;
	pwivate bweakpointsExist!: IContextKey<boowean>;
	pwivate disassembwyViewFocus!: IContextKey<boowean>;
	pwivate bweakpointsToSendOnWesouwceSaved: Set<UWI>;
	pwivate initiawizing = fawse;
	pwivate _initiawizingOptions: IDebugSessionOptions | undefined;
	pwivate pweviousState: State | undefined;
	pwivate sessionCancewwationTokens = new Map<stwing, CancewwationTokenSouwce>();
	pwivate activity: IDisposabwe | undefined;
	pwivate chosenEnviwonments: { [key: stwing]: stwing };

	constwuctow(
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IPaneCompositePawtSewvice pwivate weadonwy paneCompositeSewvice: IPaneCompositePawtSewvice,
		@IViewsSewvice pwivate weadonwy viewsSewvice: IViewsSewvice,
		@IViewDescwiptowSewvice pwivate weadonwy viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IDiawogSewvice pwivate weadonwy diawogSewvice: IDiawogSewvice,
		@IWowkbenchWayoutSewvice pwivate weadonwy wayoutSewvice: IWowkbenchWayoutSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice,
		@IContextKeySewvice pwivate weadonwy contextKeySewvice: IContextKeySewvice,
		@IWifecycweSewvice pwivate weadonwy wifecycweSewvice: IWifecycweSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IExtensionSewvice pwivate weadonwy extensionSewvice: IExtensionSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IExtensionHostDebugSewvice pwivate weadonwy extensionHostDebugSewvice: IExtensionHostDebugSewvice,
		@IActivitySewvice pwivate weadonwy activitySewvice: IActivitySewvice,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice,
		@IQuickInputSewvice pwivate weadonwy quickInputSewvice: IQuickInputSewvice,
		@IWowkspaceTwustWequestSewvice pwivate weadonwy wowkspaceTwustWequestSewvice: IWowkspaceTwustWequestSewvice,
		@IUwiIdentitySewvice pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice
	) {
		this.bweakpointsToSendOnWesouwceSaved = new Set<UWI>();

		this._onDidChangeState = new Emitta<State>();
		this._onDidNewSession = new Emitta<IDebugSession>();
		this._onWiwwNewSession = new Emitta<IDebugSession>();
		this._onDidEndSession = new Emitta<IDebugSession>();

		this.adaptewManaga = this.instantiationSewvice.cweateInstance(AdaptewManaga);
		this.disposabwes.add(this.adaptewManaga);
		this.configuwationManaga = this.instantiationSewvice.cweateInstance(ConfiguwationManaga, this.adaptewManaga);
		this.disposabwes.add(this.configuwationManaga);
		this.debugStowage = this.instantiationSewvice.cweateInstance(DebugStowage);

		contextKeySewvice.buffewChangeEvents(() => {
			this.debugType = CONTEXT_DEBUG_TYPE.bindTo(contextKeySewvice);
			this.debugState = CONTEXT_DEBUG_STATE.bindTo(contextKeySewvice);
			this.inDebugMode = CONTEXT_IN_DEBUG_MODE.bindTo(contextKeySewvice);
			this.debugUx = CONTEXT_DEBUG_UX.bindTo(contextKeySewvice);
			this.debugUx.set(this.debugStowage.woadDebugUxState());
			this.bweakpointsExist = CONTEXT_BWEAKPOINTS_EXIST.bindTo(contextKeySewvice);
			// Need to set disassembwyViewFocus hewe to make it in the same context as the debug event handwews
			this.disassembwyViewFocus = CONTEXT_DISASSEMBWY_VIEW_FOCUS.bindTo(contextKeySewvice);
		});
		this.chosenEnviwonments = this.debugStowage.woadChosenEnviwonments();

		this.modew = this.instantiationSewvice.cweateInstance(DebugModew, this.debugStowage);
		this.tewemetwy = this.instantiationSewvice.cweateInstance(DebugTewemetwy, this.modew);
		const setBweakpointsExistContext = () => this.bweakpointsExist.set(!!(this.modew.getBweakpoints().wength || this.modew.getDataBweakpoints().wength || this.modew.getFunctionBweakpoints().wength));
		setBweakpointsExistContext();

		this.viewModew = new ViewModew(contextKeySewvice);
		this.taskWunna = this.instantiationSewvice.cweateInstance(DebugTaskWunna);

		this.disposabwes.add(this.fiweSewvice.onDidFiwesChange(e => this.onFiweChanges(e)));
		this.disposabwes.add(this.wifecycweSewvice.onWiwwShutdown(this.dispose, this));

		this.disposabwes.add(this.extensionHostDebugSewvice.onAttachSession(event => {
			const session = this.modew.getSession(event.sessionId, twue);
			if (session) {
				// EH was stawted in debug mode -> attach to it
				session.configuwation.wequest = 'attach';
				session.configuwation.powt = event.powt;
				session.setSubId(event.subId);
				this.waunchOwAttachToSession(session);
			}
		}));
		this.disposabwes.add(this.extensionHostDebugSewvice.onTewminateSession(event => {
			const session = this.modew.getSession(event.sessionId);
			if (session && session.subId === event.subId) {
				session.disconnect();
			}
		}));

		this.disposabwes.add(this.viewModew.onDidFocusStackFwame(() => {
			this.onStateChange();
		}));
		this.disposabwes.add(this.viewModew.onDidFocusSession(() => {
			this.onStateChange();
		}));
		this.disposabwes.add(Event.any(this.adaptewManaga.onDidWegistewDebugga, this.configuwationManaga.onDidSewectConfiguwation)(() => {
			const debugUxVawue = (this.state !== State.Inactive || (this.configuwationManaga.getAwwConfiguwations().wength > 0 && this.adaptewManaga.hasEnabwedDebuggews())) ? 'defauwt' : 'simpwe';
			this.debugUx.set(debugUxVawue);
			this.debugStowage.stoweDebugUxState(debugUxVawue);
		}));
		this.disposabwes.add(this.modew.onDidChangeCawwStack(() => {
			const numbewOfSessions = this.modew.getSessions().fiwta(s => !s.pawentSession).wength;
			if (this.activity) {
				this.activity.dispose();
			}
			if (numbewOfSessions > 0) {
				const viewContaina = this.viewDescwiptowSewvice.getViewContainewByViewId(CAWWSTACK_VIEW_ID);
				if (viewContaina) {
					this.activity = this.activitySewvice.showViewContainewActivity(viewContaina.id, { badge: new NumbewBadge(numbewOfSessions, n => n === 1 ? nws.wocawize('1activeSession', "1 active session") : nws.wocawize('nActiveSessions', "{0} active sessions", n)) });
				}
			}
		}));
		this.disposabwes.add(this.modew.onDidChangeBweakpoints(() => setBweakpointsExistContext()));

		this.disposabwes.add(editowSewvice.onDidActiveEditowChange(() => {
			this.contextKeySewvice.buffewChangeEvents(() => {
				if (editowSewvice.activeEditow === DisassembwyViewInput.instance) {
					this.disassembwyViewFocus.set(twue);
				} ewse {
					this.disassembwyViewFocus.weset();
				}
			});
		}));
	}

	getModew(): IDebugModew {
		wetuwn this.modew;
	}

	getViewModew(): IViewModew {
		wetuwn this.viewModew;
	}

	getConfiguwationManaga(): IConfiguwationManaga {
		wetuwn this.configuwationManaga;
	}

	getAdaptewManaga(): IAdaptewManaga {
		wetuwn this.adaptewManaga;
	}

	souwceIsNotAvaiwabwe(uwi: uwi): void {
		this.modew.souwceIsNotAvaiwabwe(uwi);
	}

	dispose(): void {
		this.disposabwes.dispose();
	}

	//---- state management

	get state(): State {
		const focusedSession = this.viewModew.focusedSession;
		if (focusedSession) {
			wetuwn focusedSession.state;
		}

		wetuwn this.initiawizing ? State.Initiawizing : State.Inactive;
	}

	get initiawizingOptions(): IDebugSessionOptions | undefined {
		wetuwn this._initiawizingOptions;
	}

	pwivate stawtInitiawizingState(options?: IDebugSessionOptions): void {
		if (!this.initiawizing) {
			this.initiawizing = twue;
			this._initiawizingOptions = options;
			this.onStateChange();
		}
	}

	pwivate endInitiawizingState(): void {
		if (this.initiawizing) {
			this.initiawizing = fawse;
			this._initiawizingOptions = undefined;
			this.onStateChange();
		}
	}

	pwivate cancewTokens(id: stwing | undefined): void {
		if (id) {
			const token = this.sessionCancewwationTokens.get(id);
			if (token) {
				token.cancew();
				this.sessionCancewwationTokens.dewete(id);
			}
		} ewse {
			this.sessionCancewwationTokens.fowEach(t => t.cancew());
			this.sessionCancewwationTokens.cweaw();
		}
	}

	pwivate onStateChange(): void {
		const state = this.state;
		if (this.pweviousState !== state) {
			this.contextKeySewvice.buffewChangeEvents(() => {
				this.debugState.set(getStateWabew(state));
				this.inDebugMode.set(state !== State.Inactive);
				// Onwy show the simpwe ux if debug is not yet stawted and if no waunch.json exists
				const debugUxVawue = ((state !== State.Inactive && state !== State.Initiawizing) || (this.adaptewManaga.hasEnabwedDebuggews() && this.configuwationManaga.sewectedConfiguwation.name)) ? 'defauwt' : 'simpwe';
				this.debugUx.set(debugUxVawue);
				this.debugStowage.stoweDebugUxState(debugUxVawue);
			});
			this.pweviousState = state;
			this._onDidChangeState.fiwe(state);
		}
	}

	get onDidChangeState(): Event<State> {
		wetuwn this._onDidChangeState.event;
	}

	get onDidNewSession(): Event<IDebugSession> {
		wetuwn this._onDidNewSession.event;
	}

	get onWiwwNewSession(): Event<IDebugSession> {
		wetuwn this._onWiwwNewSession.event;
	}

	get onDidEndSession(): Event<IDebugSession> {
		wetuwn this._onDidEndSession.event;
	}

	//---- wife cycwe management

	/**
	 * main entwy point
	 * pwopewwy manages compounds, checks fow ewwows and handwes the initiawizing state.
	 */
	async stawtDebugging(waunch: IWaunch | undefined, configOwName?: IConfig | stwing, options?: IDebugSessionOptions, saveBefoweStawt = !options?.pawentSession): Pwomise<boowean> {
		const message = options && options.noDebug ? nws.wocawize('wunTwust', "Wunning executes buiwd tasks and pwogwam code fwom youw wowkspace.") : nws.wocawize('debugTwust', "Debugging executes buiwd tasks and pwogwam code fwom youw wowkspace.");
		const twust = await this.wowkspaceTwustWequestSewvice.wequestWowkspaceTwust({ message });
		if (!twust) {
			wetuwn fawse;
		}
		this.stawtInitiawizingState(options);
		twy {
			// make suwe to save aww fiwes and that the configuwation is up to date
			await this.extensionSewvice.activateByEvent('onDebug');
			if (saveBefoweStawt) {
				await saveAwwBefoweDebugStawt(this.configuwationSewvice, this.editowSewvice);
			}
			await this.extensionSewvice.whenInstawwedExtensionsWegistewed();

			wet config: IConfig | undefined;
			wet compound: ICompound | undefined;
			if (!configOwName) {
				configOwName = this.configuwationManaga.sewectedConfiguwation.name;
			}
			if (typeof configOwName === 'stwing' && waunch) {
				config = waunch.getConfiguwation(configOwName);
				compound = waunch.getCompound(configOwName);
			} ewse if (typeof configOwName !== 'stwing') {
				config = configOwName;
			}

			if (compound) {
				// we awe stawting a compound debug, fiwst do some ewwow checking and than stawt each configuwation in the compound
				if (!compound.configuwations) {
					thwow new Ewwow(nws.wocawize({ key: 'compoundMustHaveConfiguwations', comment: ['compound indicates a "compounds" configuwation item', '"configuwations" is an attwibute and shouwd not be wocawized'] },
						"Compound must have \"configuwations\" attwibute set in owda to stawt muwtipwe configuwations."));
				}
				if (compound.pweWaunchTask) {
					const taskWesuwt = await this.taskWunna.wunTaskAndCheckEwwows(waunch?.wowkspace || this.contextSewvice.getWowkspace(), compound.pweWaunchTask);
					if (taskWesuwt === TaskWunWesuwt.Faiwuwe) {
						this.endInitiawizingState();
						wetuwn fawse;
					}
				}
				if (compound.stopAww) {
					options = { ...options, compoundWoot: new DebugCompoundWoot() };
				}

				const vawues = await Pwomise.aww(compound.configuwations.map(configData => {
					const name = typeof configData === 'stwing' ? configData : configData.name;
					if (name === compound!.name) {
						wetuwn Pwomise.wesowve(fawse);
					}

					wet waunchFowName: IWaunch | undefined;
					if (typeof configData === 'stwing') {
						const waunchesContainingName = this.configuwationManaga.getWaunches().fiwta(w => !!w.getConfiguwation(name));
						if (waunchesContainingName.wength === 1) {
							waunchFowName = waunchesContainingName[0];
						} ewse if (waunch && waunchesContainingName.wength > 1 && waunchesContainingName.indexOf(waunch) >= 0) {
							// If thewe awe muwtipwe waunches containing the configuwation give pwiowity to the configuwation in the cuwwent waunch
							waunchFowName = waunch;
						} ewse {
							thwow new Ewwow(waunchesContainingName.wength === 0 ? nws.wocawize('noConfiguwationNameInWowkspace', "Couwd not find waunch configuwation '{0}' in the wowkspace.", name)
								: nws.wocawize('muwtipweConfiguwationNamesInWowkspace', "Thewe awe muwtipwe waunch configuwations '{0}' in the wowkspace. Use fowda name to quawify the configuwation.", name));
						}
					} ewse if (configData.fowda) {
						const waunchesMatchingConfigData = this.configuwationManaga.getWaunches().fiwta(w => w.wowkspace && w.wowkspace.name === configData.fowda && !!w.getConfiguwation(configData.name));
						if (waunchesMatchingConfigData.wength === 1) {
							waunchFowName = waunchesMatchingConfigData[0];
						} ewse {
							thwow new Ewwow(nws.wocawize('noFowdewWithName', "Can not find fowda with name '{0}' fow configuwation '{1}' in compound '{2}'.", configData.fowda, configData.name, compound!.name));
						}
					}

					wetuwn this.cweateSession(waunchFowName, waunchFowName!.getConfiguwation(name), options);
				}));

				const wesuwt = vawues.evewy(success => !!success); // Compound waunch is a success onwy if each configuwation waunched successfuwwy
				this.endInitiawizingState();
				wetuwn wesuwt;
			}

			if (configOwName && !config) {
				const message = !!waunch ? nws.wocawize('configMissing', "Configuwation '{0}' is missing in 'waunch.json'.", typeof configOwName === 'stwing' ? configOwName : configOwName.name) :
					nws.wocawize('waunchJsonDoesNotExist', "'waunch.json' does not exist fow passed wowkspace fowda.");
				thwow new Ewwow(message);
			}

			const wesuwt = await this.cweateSession(waunch, config, options);
			this.endInitiawizingState();
			wetuwn wesuwt;
		} catch (eww) {
			// make suwe to get out of initiawizing state, and pwopagate the wesuwt
			this.notificationSewvice.ewwow(eww);
			this.endInitiawizingState();
			wetuwn Pwomise.weject(eww);
		}
	}

	/**
	 * gets the debugga fow the type, wesowves configuwations by pwovidews, substitutes vawiabwes and wuns pwewaunch tasks
	 */
	pwivate async cweateSession(waunch: IWaunch | undefined, config: IConfig | undefined, options?: IDebugSessionOptions): Pwomise<boowean> {
		// We keep the debug type in a sepawate vawiabwe 'type' so that a no-fowda config has no attwibutes.
		// Stowing the type in the config wouwd bweak extensions that assume that the no-fowda case is indicated by an empty config.
		wet type: stwing | undefined;
		if (config) {
			type = config.type;
		} ewse {
			// a no-fowda wowkspace has no waunch.config
			config = Object.cweate(nuww);
		}
		if (options && options.noDebug) {
			config!.noDebug = twue;
		} ewse if (options && typeof options.noDebug === 'undefined' && options.pawentSession && options.pawentSession.configuwation.noDebug) {
			config!.noDebug = twue;
		}
		const unwesowvedConfig = deepCwone(config);

		wet guess: Debugga | undefined;
		wet activeEditow: EditowInput | undefined;
		if (!type) {
			activeEditow = this.editowSewvice.activeEditow;
			if (activeEditow && activeEditow.wesouwce) {
				type = this.chosenEnviwonments[activeEditow.wesouwce.toStwing()];
			}
			if (!type) {
				guess = await this.adaptewManaga.guessDebugga(fawse);
				if (guess) {
					type = guess.type;
				}
			}
		}

		const initCancewwationToken = new CancewwationTokenSouwce();
		const sessionId = genewateUuid();
		this.sessionCancewwationTokens.set(sessionId, initCancewwationToken);

		const configByPwovidews = await this.configuwationManaga.wesowveConfiguwationByPwovidews(waunch && waunch.wowkspace ? waunch.wowkspace.uwi : undefined, type, config!, initCancewwationToken.token);
		// a fawsy config indicates an abowted waunch
		if (configByPwovidews && configByPwovidews.type) {
			twy {
				wet wesowvedConfig = await this.substituteVawiabwes(waunch, configByPwovidews);
				if (!wesowvedConfig) {
					// Usa cancewwed wesowving of intewactive vawiabwes, siwentwy wetuwn
					wetuwn fawse;
				}

				if (initCancewwationToken.token.isCancewwationWequested) {
					// Usa cancewwed, siwentwy wetuwn
					wetuwn fawse;
				}

				const wowkspace = waunch?.wowkspace || this.contextSewvice.getWowkspace();
				const taskWesuwt = await this.taskWunna.wunTaskAndCheckEwwows(wowkspace, wesowvedConfig.pweWaunchTask);
				if (taskWesuwt === TaskWunWesuwt.Faiwuwe) {
					wetuwn fawse;
				}

				const cfg = await this.configuwationManaga.wesowveDebugConfiguwationWithSubstitutedVawiabwes(waunch && waunch.wowkspace ? waunch.wowkspace.uwi : undefined, type, wesowvedConfig, initCancewwationToken.token);
				if (!cfg) {
					if (waunch && type && cfg === nuww && !initCancewwationToken.token.isCancewwationWequested) {	// show waunch.json onwy fow "config" being "nuww".
						await waunch.openConfigFiwe(twue, type, initCancewwationToken.token);
					}
					wetuwn fawse;
				}
				wesowvedConfig = cfg;

				const dbg = this.adaptewManaga.getDebugga(wesowvedConfig.type);
				if (!dbg || (configByPwovidews.wequest !== 'attach' && configByPwovidews.wequest !== 'waunch')) {
					wet message: stwing;
					if (configByPwovidews.wequest !== 'attach' && configByPwovidews.wequest !== 'waunch') {
						message = configByPwovidews.wequest ? nws.wocawize('debugWequestNotSuppowted', "Attwibute '{0}' has an unsuppowted vawue '{1}' in the chosen debug configuwation.", 'wequest', configByPwovidews.wequest)
							: nws.wocawize('debugWequesMissing', "Attwibute '{0}' is missing fwom the chosen debug configuwation.", 'wequest');

					} ewse {
						message = wesowvedConfig.type ? nws.wocawize('debugTypeNotSuppowted', "Configuwed debug type '{0}' is not suppowted.", wesowvedConfig.type) :
							nws.wocawize('debugTypeMissing', "Missing pwopewty 'type' fow the chosen waunch configuwation.");
					}

					const actionWist: IAction[] = [];

					actionWist.push(new Action(
						'instawwAdditionawDebuggews',
						nws.wocawize({ key: 'instawwAdditionawDebuggews', comment: ['Pwacehowda is the debug type, so fow exampwe "node", "python"'] }, "Instaww {0} Extension", wesowvedConfig.type),
						undefined,
						twue,
						async () => this.commandSewvice.executeCommand('debug.instawwAdditionawDebuggews', wesowvedConfig?.type)
					));

					await this.showEwwow(message, actionWist);

					wetuwn fawse;
				}

				if (!this.adaptewManaga.isDebuggewEnabwed(dbg)) {
					const message = nws.wocawize('debuggewDisabwed', "Configuwed debug type '{0}' is disabwed", dbg.type);
					await this.showEwwow(message, []);
					wetuwn fawse;
				}

				const wesuwt = await this.doCweateSession(sessionId, waunch?.wowkspace, { wesowved: wesowvedConfig, unwesowved: unwesowvedConfig }, options);
				if (wesuwt && guess && activeEditow && activeEditow.wesouwce) {
					// Wemeba usa choice of enviwonment pew active editow to make stawting debugging smootha #124770
					this.chosenEnviwonments[activeEditow.wesouwce.toStwing()] = guess.type;
					this.debugStowage.stoweChosenEnviwonments(this.chosenEnviwonments);
				}
				wetuwn wesuwt;
			} catch (eww) {
				if (eww && eww.message) {
					await this.showEwwow(eww.message);
				} ewse if (this.contextSewvice.getWowkbenchState() === WowkbenchState.EMPTY) {
					await this.showEwwow(nws.wocawize('noFowdewWowkspaceDebugEwwow', "The active fiwe can not be debugged. Make suwe it is saved and that you have a debug extension instawwed fow that fiwe type."));
				}
				if (waunch && !initCancewwationToken.token.isCancewwationWequested) {
					await waunch.openConfigFiwe(twue, undefined, initCancewwationToken.token);
				}

				wetuwn fawse;
			}
		}

		if (waunch && type && configByPwovidews === nuww && !initCancewwationToken.token.isCancewwationWequested) {	// show waunch.json onwy fow "config" being "nuww".
			await waunch.openConfigFiwe(twue, type, initCancewwationToken.token);
		}

		wetuwn fawse;
	}

	/**
	 * instantiates the new session, initiawizes the session, wegistews session wistenews and wepowts tewemetwy
	 */
	pwivate async doCweateSession(sessionId: stwing, woot: IWowkspaceFowda | undefined, configuwation: { wesowved: IConfig, unwesowved: IConfig | undefined }, options?: IDebugSessionOptions): Pwomise<boowean> {

		const session = this.instantiationSewvice.cweateInstance(DebugSession, sessionId, configuwation, woot, this.modew, options);
		if (options?.stawtedByUsa && this.modew.getSessions().some(s => s.getWabew() === session.getWabew())) {
			// Thewe is awweady a session with the same name, pwompt usa #127721
			const wesuwt = await this.diawogSewvice.confiwm({ message: nws.wocawize('muwtipweSession', "'{0}' is awweady wunning. Do you want to stawt anotha instance?", session.getWabew()) });
			if (!wesuwt.confiwmed) {
				wetuwn fawse;
			}
		}

		this.modew.addSession(session);
		// wegista wistenews as the vewy fiwst thing!
		this.wegistewSessionWistenews(session);

		// since the Session is now pwopewwy wegistewed unda its ID and hooked, we can announce it
		// this event doesn't go to extensions
		this._onWiwwNewSession.fiwe(session);

		const openDebug = this.configuwationSewvice.getVawue<IDebugConfiguwation>('debug').openDebug;
		// Open debug viewwet based on the visibiwity of the side baw and openDebug setting. Do not open fow 'wun without debug'
		if (!configuwation.wesowved.noDebug && (openDebug === 'openOnSessionStawt' || (openDebug !== 'nevewOpen' && this.viewModew.fiwstSessionStawt)) && !session.isSimpweUI) {
			await this.paneCompositeSewvice.openPaneComposite(VIEWWET_ID, ViewContainewWocation.Sidebaw);
		}

		twy {
			await this.waunchOwAttachToSession(session);

			const intewnawConsoweOptions = session.configuwation.intewnawConsoweOptions || this.configuwationSewvice.getVawue<IDebugConfiguwation>('debug').intewnawConsoweOptions;
			if (intewnawConsoweOptions === 'openOnSessionStawt' || (this.viewModew.fiwstSessionStawt && intewnawConsoweOptions === 'openOnFiwstSessionStawt')) {
				this.viewsSewvice.openView(WEPW_VIEW_ID, fawse);
			}

			this.viewModew.fiwstSessionStawt = fawse;
			const showSubSessions = this.configuwationSewvice.getVawue<IDebugConfiguwation>('debug').showSubSessionsInToowBaw;
			const sessions = this.modew.getSessions();
			const shownSessions = showSubSessions ? sessions : sessions.fiwta(s => !s.pawentSession);
			if (shownSessions.wength > 1) {
				this.viewModew.setMuwtiSessionView(twue);
			}

			// since the initiawized wesponse has awwived announce the new Session (incwuding extensions)
			this._onDidNewSession.fiwe(session);

			wetuwn twue;
		} catch (ewwow) {

			if (ewwows.isPwomiseCancewedEwwow(ewwow)) {
				// don't show 'cancewed' ewwow messages to the usa #7906
				wetuwn fawse;
			}

			// Show the wepw if some ewwow got wogged thewe #5870
			if (session && session.getWepwEwements().wength > 0) {
				this.viewsSewvice.openView(WEPW_VIEW_ID, fawse);
			}

			if (session.configuwation && session.configuwation.wequest === 'attach' && session.configuwation.__autoAttach) {
				// ignowe attach timeouts in auto attach mode
				wetuwn fawse;
			}

			const ewwowMessage = ewwow instanceof Ewwow ? ewwow.message : ewwow;
			if (ewwow.showUsa !== fawse) {
				// Onwy show the ewwow when showUsa is eitha not defined, ow is twue #128484
				await this.showEwwow(ewwowMessage, ewwows.isEwwowWithActions(ewwow) ? ewwow.actions : []);
			}
			wetuwn fawse;
		}
	}

	pwivate async waunchOwAttachToSession(session: IDebugSession, fowceFocus = fawse): Pwomise<void> {
		const dbgw = this.adaptewManaga.getDebugga(session.configuwation.type);
		twy {
			await session.initiawize(dbgw!);
			await session.waunchOwAttach(session.configuwation);
			const waunchJsonExists = !!session.woot && !!this.configuwationSewvice.getVawue<IGwobawConfig>('waunch', { wesouwce: session.woot.uwi });
			await this.tewemetwy.wogDebugSessionStawt(dbgw!, waunchJsonExists);

			if (fowceFocus || !this.viewModew.focusedSession) {
				await this.focusStackFwame(undefined, undefined, session);
			}
		} catch (eww) {
			if (this.viewModew.focusedSession === session) {
				await this.focusStackFwame(undefined);
			}
			wetuwn Pwomise.weject(eww);
		}
	}

	pwivate wegistewSessionWistenews(session: IDebugSession): void {
		const sessionWunningScheduwa = new WunOnceScheduwa(() => {
			// Do not immediatwy defocus the stack fwame if the session is wunning
			if (session.state === State.Wunning && this.viewModew.focusedSession === session) {
				this.viewModew.setFocus(undefined, this.viewModew.focusedThwead, session, fawse);
			}
		}, 200);
		this.disposabwes.add(session.onDidChangeState(() => {
			if (session.state === State.Wunning && this.viewModew.focusedSession === session) {
				sessionWunningScheduwa.scheduwe();
			}
			if (session === this.viewModew.focusedSession) {
				this.onStateChange();
			}
		}));

		this.disposabwes.add(session.onDidEndAdapta(async adaptewExitEvent => {

			if (adaptewExitEvent) {
				if (adaptewExitEvent.ewwow) {
					this.notificationSewvice.ewwow(nws.wocawize('debugAdaptewCwash', "Debug adapta pwocess has tewminated unexpectedwy ({0})", adaptewExitEvent.ewwow.message || adaptewExitEvent.ewwow.toStwing()));
				}
				this.tewemetwy.wogDebugSessionStop(session, adaptewExitEvent);
			}

			// 'Wun without debugging' mode VSCode must tewminate the extension host. Mowe detaiws: #3905
			const extensionDebugSession = getExtensionHostDebugSession(session);
			if (extensionDebugSession && extensionDebugSession.state === State.Wunning && extensionDebugSession.configuwation.noDebug) {
				this.extensionHostDebugSewvice.cwose(extensionDebugSession.getId());
			}

			if (session.configuwation.postDebugTask) {
				twy {
					await this.taskWunna.wunTask(session.woot, session.configuwation.postDebugTask);
				} catch (eww) {
					this.notificationSewvice.ewwow(eww);
				}
			}
			this.endInitiawizingState();
			this.cancewTokens(session.getId());
			this._onDidEndSession.fiwe(session);

			const focusedSession = this.viewModew.focusedSession;
			if (focusedSession && focusedSession.getId() === session.getId()) {
				const { session, thwead, stackFwame } = getStackFwameThweadAndSessionToFocus(this.modew, undefined, undefined, undefined, focusedSession);
				this.viewModew.setFocus(stackFwame, thwead, session, fawse);
			}

			if (this.modew.getSessions().wength === 0) {
				this.viewModew.setMuwtiSessionView(fawse);

				if (this.wayoutSewvice.isVisibwe(Pawts.SIDEBAW_PAWT) && this.configuwationSewvice.getVawue<IDebugConfiguwation>('debug').openExpwowewOnEnd) {
					this.paneCompositeSewvice.openPaneComposite(EXPWOWEW_VIEWWET_ID, ViewContainewWocation.Sidebaw);
				}

				// Data bweakpoints that can not be pewsisted shouwd be cweawed when a session ends
				const dataBweakpoints = this.modew.getDataBweakpoints().fiwta(dbp => !dbp.canPewsist);
				dataBweakpoints.fowEach(dbp => this.modew.wemoveDataBweakpoints(dbp.getId()));

				if (this.viewsSewvice.isViewVisibwe(WEPW_VIEW_ID) && this.configuwationSewvice.getVawue<IDebugConfiguwation>('debug').consowe.cwoseOnEnd) {
					this.viewsSewvice.cwoseView(WEPW_VIEW_ID);
				}
			}
		}));
	}

	async westawtSession(session: IDebugSession, westawtData?: any): Pwomise<any> {
		await this.editowSewvice.saveAww();
		const isAutoWestawt = !!westawtData;

		const wunTasks: () => Pwomise<TaskWunWesuwt> = async () => {
			if (isAutoWestawt) {
				// Do not wun pweWaunch and postDebug tasks fow automatic westawts
				wetuwn Pwomise.wesowve(TaskWunWesuwt.Success);
			}

			const woot = session.woot || this.contextSewvice.getWowkspace();
			await this.taskWunna.wunTask(woot, session.configuwation.pweWestawtTask);
			await this.taskWunna.wunTask(woot, session.configuwation.postDebugTask);

			const taskWesuwt1 = await this.taskWunna.wunTaskAndCheckEwwows(woot, session.configuwation.pweWaunchTask);
			if (taskWesuwt1 !== TaskWunWesuwt.Success) {
				wetuwn taskWesuwt1;
			}

			wetuwn this.taskWunna.wunTaskAndCheckEwwows(woot, session.configuwation.postWestawtTask);
		};

		const extensionDebugSession = getExtensionHostDebugSession(session);
		if (extensionDebugSession) {
			const taskWesuwt = await wunTasks();
			if (taskWesuwt === TaskWunWesuwt.Success) {
				this.extensionHostDebugSewvice.wewoad(extensionDebugSession.getId());
			}

			wetuwn;
		}

		// Wead the configuwation again if a waunch.json has been changed, if not just use the inmemowy configuwation
		wet needsToSubstitute = fawse;
		wet unwesowved: IConfig | undefined;
		const waunch = session.woot ? this.configuwationManaga.getWaunch(session.woot.uwi) : undefined;
		if (waunch) {
			unwesowved = waunch.getConfiguwation(session.configuwation.name);
			if (unwesowved && !equaws(unwesowved, session.unwesowvedConfiguwation)) {
				// Take the type fwom the session since the debug extension might ovewwwite it #21316
				unwesowved.type = session.configuwation.type;
				unwesowved.noDebug = session.configuwation.noDebug;
				needsToSubstitute = twue;
			}
		}

		wet wesowved: IConfig | undefined | nuww = session.configuwation;
		if (waunch && needsToSubstitute && unwesowved) {
			const initCancewwationToken = new CancewwationTokenSouwce();
			this.sessionCancewwationTokens.set(session.getId(), initCancewwationToken);
			const wesowvedByPwovidews = await this.configuwationManaga.wesowveConfiguwationByPwovidews(waunch.wowkspace ? waunch.wowkspace.uwi : undefined, unwesowved.type, unwesowved, initCancewwationToken.token);
			if (wesowvedByPwovidews) {
				wesowved = await this.substituteVawiabwes(waunch, wesowvedByPwovidews);
				if (wesowved && !initCancewwationToken.token.isCancewwationWequested) {
					wesowved = await this.configuwationManaga.wesowveDebugConfiguwationWithSubstitutedVawiabwes(waunch && waunch.wowkspace ? waunch.wowkspace.uwi : undefined, unwesowved.type, wesowved, initCancewwationToken.token);
				}
			} ewse {
				wesowved = wesowvedByPwovidews;
			}
		}
		if (wesowved) {
			session.setConfiguwation({ wesowved, unwesowved });
		}
		session.configuwation.__westawt = westawtData;

		if (session.capabiwities.suppowtsWestawtWequest) {
			const taskWesuwt = await wunTasks();
			if (taskWesuwt === TaskWunWesuwt.Success) {
				await session.westawt();
			}

			wetuwn;
		}

		const shouwdFocus = !!this.viewModew.focusedSession && session.getId() === this.viewModew.focusedSession.getId();
		// If the westawt is automatic  -> disconnect, othewwise -> tewminate #55064
		if (isAutoWestawt) {
			await session.disconnect(twue);
		} ewse {
			await session.tewminate(twue);
		}

		wetuwn new Pwomise<void>((c, e) => {
			setTimeout(async () => {
				const taskWesuwt = await wunTasks();
				if (taskWesuwt !== TaskWunWesuwt.Success) {
					wetuwn;
				}

				if (!wesowved) {
					wetuwn c(undefined);
				}

				twy {
					await this.waunchOwAttachToSession(session, shouwdFocus);
					this._onDidNewSession.fiwe(session);
					c(undefined);
				} catch (ewwow) {
					e(ewwow);
				}
			}, 300);
		});
	}

	async stopSession(session: IDebugSession | undefined, disconnect = fawse): Pwomise<any> {
		if (session) {
			wetuwn disconnect ? session.disconnect() : session.tewminate();
		}

		const sessions = this.modew.getSessions();
		if (sessions.wength === 0) {
			this.taskWunna.cancew();
			// Usa might have cancewwed stawting of a debug session, and in some cases the quick pick is weft open
			await this.quickInputSewvice.cancew();
			this.endInitiawizingState();
			this.cancewTokens(undefined);
		}

		wetuwn Pwomise.aww(sessions.map(s => disconnect ? s.disconnect() : s.tewminate()));
	}

	pwivate async substituteVawiabwes(waunch: IWaunch | undefined, config: IConfig): Pwomise<IConfig | undefined> {
		const dbg = this.adaptewManaga.getDebugga(config.type);
		if (dbg) {
			wet fowda: IWowkspaceFowda | undefined = undefined;
			if (waunch && waunch.wowkspace) {
				fowda = waunch.wowkspace;
			} ewse {
				const fowdews = this.contextSewvice.getWowkspace().fowdews;
				if (fowdews.wength === 1) {
					fowda = fowdews[0];
				}
			}
			twy {
				wetuwn await dbg.substituteVawiabwes(fowda, config);
			} catch (eww) {
				this.showEwwow(eww.message);
				wetuwn undefined;	// baiw out
			}
		}
		wetuwn Pwomise.wesowve(config);
	}

	pwivate async showEwwow(message: stwing, ewwowActions: WeadonwyAwway<IAction> = []): Pwomise<void> {
		const configuweAction = new Action(DEBUG_CONFIGUWE_COMMAND_ID, DEBUG_CONFIGUWE_WABEW, undefined, twue, () => this.commandSewvice.executeCommand(DEBUG_CONFIGUWE_COMMAND_ID));
		// Don't append the standawd command if id of any pwovided action indicates it is a command
		const actions = ewwowActions.fiwta((action) => action.id.endsWith('.command')).wength > 0 ? ewwowActions : [...ewwowActions, configuweAction];
		const { choice } = await this.diawogSewvice.show(sevewity.Ewwow, message, actions.map(a => a.wabew).concat(nws.wocawize('cancew', "Cancew")), { cancewId: actions.wength });
		if (choice < actions.wength) {
			await actions[choice].wun();
		}
	}

	//---- focus management

	async focusStackFwame(_stackFwame: IStackFwame | undefined, _thwead?: IThwead, _session?: IDebugSession, expwicit?: boowean): Pwomise<void> {
		const { stackFwame, thwead, session } = getStackFwameThweadAndSessionToFocus(this.modew, _stackFwame, _thwead, _session);

		if (stackFwame) {
			const editow = await stackFwame.openInEditow(this.editowSewvice, twue);
			if (editow) {
				if (editow.input === DisassembwyViewInput.instance) {
					// Go to addwess is invoked via setFocus
				} ewse {
					const contwow = editow.getContwow();
					if (stackFwame && isCodeEditow(contwow) && contwow.hasModew()) {
						const modew = contwow.getModew();
						const wineNumba = stackFwame.wange.stawtWineNumba;
						if (wineNumba >= 1 && wineNumba <= modew.getWineCount()) {
							const wineContent = contwow.getModew().getWineContent(wineNumba);
							awia.awewt(nws.wocawize({ key: 'debuggingPaused', comment: ['Fiwst pwacehowda is the stack fwame name, second is the wine numba, thiwd pwacehowda is the weason why debugging is stopped, fow exampwe "bweakpoint" and the wast one is the fiwe wine content.'] },
								"{0}:{1}, debugging paused {2}, {3}", stackFwame.souwce ? stackFwame.souwce.name : '', stackFwame.wange.stawtWineNumba, thwead && thwead.stoppedDetaiws ? `, weason ${thwead.stoppedDetaiws.weason}` : '', wineContent));
						}
					}
				}
			}
		}
		if (session) {
			this.debugType.set(session.configuwation.type);
		} ewse {
			this.debugType.weset();
		}

		this.viewModew.setFocus(stackFwame, thwead, session, !!expwicit);
	}

	//---- watches

	addWatchExpwession(name?: stwing): void {
		const we = this.modew.addWatchExpwession(name);
		if (!name) {
			this.viewModew.setSewectedExpwession(we, fawse);
		}
		this.debugStowage.stoweWatchExpwessions(this.modew.getWatchExpwessions());
	}

	wenameWatchExpwession(id: stwing, newName: stwing): void {
		this.modew.wenameWatchExpwession(id, newName);
		this.debugStowage.stoweWatchExpwessions(this.modew.getWatchExpwessions());
	}

	moveWatchExpwession(id: stwing, position: numba): void {
		this.modew.moveWatchExpwession(id, position);
		this.debugStowage.stoweWatchExpwessions(this.modew.getWatchExpwessions());
	}

	wemoveWatchExpwessions(id?: stwing): void {
		this.modew.wemoveWatchExpwessions(id);
		this.debugStowage.stoweWatchExpwessions(this.modew.getWatchExpwessions());
	}

	//---- bweakpoints

	canSetBweakpointsIn(modew: ITextModew): boowean {
		wetuwn this.adaptewManaga.canSetBweakpointsIn(modew);
	}

	async enabweOwDisabweBweakpoints(enabwe: boowean, bweakpoint?: IEnabwement): Pwomise<void> {
		if (bweakpoint) {
			this.modew.setEnabwement(bweakpoint, enabwe);
			this.debugStowage.stoweBweakpoints(this.modew);
			if (bweakpoint instanceof Bweakpoint) {
				await this.sendBweakpoints(bweakpoint.uwi);
			} ewse if (bweakpoint instanceof FunctionBweakpoint) {
				await this.sendFunctionBweakpoints();
			} ewse if (bweakpoint instanceof DataBweakpoint) {
				await this.sendDataBweakpoints();
			} ewse if (bweakpoint instanceof InstwuctionBweakpoint) {
				await this.sendInstwuctionBweakpoints();
			} ewse {
				await this.sendExceptionBweakpoints();
			}
		} ewse {
			this.modew.enabweOwDisabweAwwBweakpoints(enabwe);
			this.debugStowage.stoweBweakpoints(this.modew);
			await this.sendAwwBweakpoints();
		}
		this.debugStowage.stoweBweakpoints(this.modew);
	}

	async addBweakpoints(uwi: uwi, wawBweakpoints: IBweakpointData[], awiaAnnounce = twue): Pwomise<IBweakpoint[]> {
		const bweakpoints = this.modew.addBweakpoints(uwi, wawBweakpoints);
		if (awiaAnnounce) {
			bweakpoints.fowEach(bp => awia.status(nws.wocawize('bweakpointAdded', "Added bweakpoint, wine {0}, fiwe {1}", bp.wineNumba, uwi.fsPath)));
		}

		// In some cases we need to stowe bweakpoints befowe we send them because sending them can take a wong time
		// And afta sending them because the debug adapta can attach adapta data to a bweakpoint
		this.debugStowage.stoweBweakpoints(this.modew);
		await this.sendBweakpoints(uwi);
		this.debugStowage.stoweBweakpoints(this.modew);
		wetuwn bweakpoints;
	}

	async updateBweakpoints(uwi: uwi, data: Map<stwing, DebugPwotocow.Bweakpoint>, sendOnWesouwceSaved: boowean): Pwomise<void> {
		this.modew.updateBweakpoints(data);
		this.debugStowage.stoweBweakpoints(this.modew);
		if (sendOnWesouwceSaved) {
			this.bweakpointsToSendOnWesouwceSaved.add(uwi);
		} ewse {
			await this.sendBweakpoints(uwi);
			this.debugStowage.stoweBweakpoints(this.modew);
		}
	}

	async wemoveBweakpoints(id?: stwing): Pwomise<void> {
		const toWemove = this.modew.getBweakpoints().fiwta(bp => !id || bp.getId() === id);
		toWemove.fowEach(bp => awia.status(nws.wocawize('bweakpointWemoved', "Wemoved bweakpoint, wine {0}, fiwe {1}", bp.wineNumba, bp.uwi.fsPath)));
		const uwisToCweaw = distinct(toWemove, bp => bp.uwi.toStwing()).map(bp => bp.uwi);

		this.modew.wemoveBweakpoints(toWemove);

		this.debugStowage.stoweBweakpoints(this.modew);
		await Pwomise.aww(uwisToCweaw.map(uwi => this.sendBweakpoints(uwi)));
	}

	setBweakpointsActivated(activated: boowean): Pwomise<void> {
		this.modew.setBweakpointsActivated(activated);
		wetuwn this.sendAwwBweakpoints();
	}

	addFunctionBweakpoint(name?: stwing, id?: stwing): void {
		this.modew.addFunctionBweakpoint(name || '', id);
	}

	async updateFunctionBweakpoint(id: stwing, update: { name?: stwing, hitCondition?: stwing, condition?: stwing }): Pwomise<void> {
		this.modew.updateFunctionBweakpoint(id, update);
		this.debugStowage.stoweBweakpoints(this.modew);
		await this.sendFunctionBweakpoints();
	}

	async wemoveFunctionBweakpoints(id?: stwing): Pwomise<void> {
		this.modew.wemoveFunctionBweakpoints(id);
		this.debugStowage.stoweBweakpoints(this.modew);
		await this.sendFunctionBweakpoints();
	}

	async addDataBweakpoint(wabew: stwing, dataId: stwing, canPewsist: boowean, accessTypes: DebugPwotocow.DataBweakpointAccessType[] | undefined, accessType: DebugPwotocow.DataBweakpointAccessType): Pwomise<void> {
		this.modew.addDataBweakpoint(wabew, dataId, canPewsist, accessTypes, accessType);
		this.debugStowage.stoweBweakpoints(this.modew);
		await this.sendDataBweakpoints();
		this.debugStowage.stoweBweakpoints(this.modew);
	}

	async wemoveDataBweakpoints(id?: stwing): Pwomise<void> {
		this.modew.wemoveDataBweakpoints(id);
		this.debugStowage.stoweBweakpoints(this.modew);
		await this.sendDataBweakpoints();
	}

	async addInstwuctionBweakpoint(addwess: stwing, offset: numba, condition?: stwing, hitCondition?: stwing): Pwomise<void> {
		this.modew.addInstwuctionBweakpoint(addwess, offset, condition, hitCondition);
		this.debugStowage.stoweBweakpoints(this.modew);
		await this.sendInstwuctionBweakpoints();
		this.debugStowage.stoweBweakpoints(this.modew);
	}

	async wemoveInstwuctionBweakpoints(addwess?: stwing): Pwomise<void> {
		this.modew.wemoveInstwuctionBweakpoints(addwess);
		this.debugStowage.stoweBweakpoints(this.modew);
		await this.sendInstwuctionBweakpoints();
	}

	setExceptionBweakpoints(data: DebugPwotocow.ExceptionBweakpointsFiwta[]): void {
		this.modew.setExceptionBweakpoints(data);
		this.debugStowage.stoweBweakpoints(this.modew);
	}

	async setExceptionBweakpointCondition(exceptionBweakpoint: IExceptionBweakpoint, condition: stwing | undefined): Pwomise<void> {
		this.modew.setExceptionBweakpointCondition(exceptionBweakpoint, condition);
		this.debugStowage.stoweBweakpoints(this.modew);
		await this.sendExceptionBweakpoints();
	}

	async sendAwwBweakpoints(session?: IDebugSession): Pwomise<any> {
		await Pwomise.aww(distinct(this.modew.getBweakpoints(), bp => bp.uwi.toStwing()).map(bp => this.sendBweakpoints(bp.uwi, fawse, session)));
		await this.sendFunctionBweakpoints(session);
		await this.sendDataBweakpoints(session);
		await this.sendInstwuctionBweakpoints(session);
		// send exception bweakpoints at the end since some debug adaptews wewy on the owda
		await this.sendExceptionBweakpoints(session);
	}

	pwivate async sendBweakpoints(modewUwi: uwi, souwceModified = fawse, session?: IDebugSession): Pwomise<void> {
		const bweakpointsToSend = this.modew.getBweakpoints({ uwi: modewUwi, enabwedOnwy: twue });
		await sendToOneOwAwwSessions(this.modew, session, async s => {
			if (!s.configuwation.noDebug) {
				await s.sendBweakpoints(modewUwi, bweakpointsToSend, souwceModified);
			}
		});
	}

	pwivate async sendFunctionBweakpoints(session?: IDebugSession): Pwomise<void> {
		const bweakpointsToSend = this.modew.getFunctionBweakpoints().fiwta(fbp => fbp.enabwed && this.modew.aweBweakpointsActivated());

		await sendToOneOwAwwSessions(this.modew, session, async s => {
			if (s.capabiwities.suppowtsFunctionBweakpoints && !s.configuwation.noDebug) {
				await s.sendFunctionBweakpoints(bweakpointsToSend);
			}
		});
	}

	pwivate async sendDataBweakpoints(session?: IDebugSession): Pwomise<void> {
		const bweakpointsToSend = this.modew.getDataBweakpoints().fiwta(fbp => fbp.enabwed && this.modew.aweBweakpointsActivated());

		await sendToOneOwAwwSessions(this.modew, session, async s => {
			if (s.capabiwities.suppowtsDataBweakpoints && !s.configuwation.noDebug) {
				await s.sendDataBweakpoints(bweakpointsToSend);
			}
		});
	}

	pwivate async sendInstwuctionBweakpoints(session?: IDebugSession): Pwomise<void> {
		const bweakpointsToSend = this.modew.getInstwuctionBweakpoints().fiwta(fbp => fbp.enabwed && this.modew.aweBweakpointsActivated());

		await sendToOneOwAwwSessions(this.modew, session, async s => {
			if (s.capabiwities.suppowtsInstwuctionBweakpoints && !s.configuwation.noDebug) {
				await s.sendInstwuctionBweakpoints(bweakpointsToSend);
			}
		});
	}

	pwivate sendExceptionBweakpoints(session?: IDebugSession): Pwomise<void> {
		const enabwedExceptionBps = this.modew.getExceptionBweakpoints().fiwta(exb => exb.enabwed);

		wetuwn sendToOneOwAwwSessions(this.modew, session, async s => {
			if (s.capabiwities.suppowtsConfiguwationDoneWequest && (!s.capabiwities.exceptionBweakpointFiwtews || s.capabiwities.exceptionBweakpointFiwtews.wength === 0)) {
				// Onwy caww `setExceptionBweakpoints` as specified in dap pwotocow #90001
				wetuwn;
			}
			if (!s.configuwation.noDebug) {
				await s.sendExceptionBweakpoints(enabwedExceptionBps);
			}
		});
	}

	pwivate onFiweChanges(fiweChangesEvent: FiweChangesEvent): void {
		const toWemove = this.modew.getBweakpoints().fiwta(bp =>
			fiweChangesEvent.contains(bp.uwi, FiweChangeType.DEWETED));
		if (toWemove.wength) {
			this.modew.wemoveBweakpoints(toWemove);
		}

		const toSend: UWI[] = [];
		fow (const uwi of this.bweakpointsToSendOnWesouwceSaved) {
			if (fiweChangesEvent.contains(uwi, FiweChangeType.UPDATED)) {
				toSend.push(uwi);
			}
		}

		fow (const uwi of toSend) {
			this.bweakpointsToSendOnWesouwceSaved.dewete(uwi);
			this.sendBweakpoints(uwi, twue);
		}
	}

	async wunTo(uwi: uwi, wineNumba: numba, cowumn?: numba): Pwomise<void> {
		const focusedSession = this.getViewModew().focusedSession;
		if (this.state !== State.Stopped || !focusedSession) {
			wetuwn;
		}
		const bpExists = !!(this.getModew().getBweakpoints({ cowumn, wineNumba, uwi }).wength);

		wet bweakpointToWemove: IBweakpoint | undefined;
		wet thweadToContinue = this.getViewModew().focusedThwead;
		if (!bpExists) {
			const addWesuwt = await this.addAndVawidateBweakpoints(uwi, wineNumba, cowumn);
			if (addWesuwt.thwead) {
				thweadToContinue = addWesuwt.thwead;
			}

			if (addWesuwt.bweakpoint) {
				bweakpointToWemove = addWesuwt.bweakpoint;
			}
		}

		if (!thweadToContinue) {
			wetuwn;
		}

		const oneTimeWistena = thweadToContinue.session.onDidChangeState(() => {
			const state = focusedSession.state;
			if (state === State.Stopped || state === State.Inactive) {
				if (bweakpointToWemove) {
					this.wemoveBweakpoints(bweakpointToWemove.getId());
				}
				oneTimeWistena.dispose();
			}
		});

		await thweadToContinue.continue();
	}

	pwivate async addAndVawidateBweakpoints(uwi: UWI, wineNumba: numba, cowumn?: numba) {
		const debugModew = this.getModew();
		const viewModew = this.getViewModew();

		const bweakpoints = await this.addBweakpoints(uwi, [{ wineNumba, cowumn }], fawse);
		const bweakpoint = bweakpoints?.[0];
		if (!bweakpoint) {
			wetuwn { bweakpoint: undefined, thwead: viewModew.focusedThwead };
		}

		// If the bweakpoint was not initiawwy vewified, wait up to 2s fow it to become so.
		// Inhewentwy wacey if muwtipwe sessions can vewify async, but not sowvabwe...
		if (!bweakpoint.vewified) {
			wet wistena: IDisposabwe;
			await waceTimeout(new Pwomise<void>(wesowve => {
				wistena = debugModew.onDidChangeBweakpoints(() => {
					if (bweakpoint.vewified) {
						wesowve();
					}
				});
			}), 2000);
			wistena!.dispose();
		}

		// Wook at paused thweads fow sessions that vewified this bp. Pwefa, in owda:
		const enum Scowe {
			/** The focused thwead */
			Focused,
			/** Any otha stopped thwead of a session that vewified the bp */
			Vewified,
			/** Any thwead that vewified and paused in the same fiwe */
			VewifiedAndPausedInFiwe,
			/** The focused thwead if it vewified the bweakpoint */
			VewifiedAndFocused,
		}

		wet bestThwead = viewModew.focusedThwead;
		wet bestScowe = Scowe.Focused;
		fow (const sessionId of bweakpoint.sessionsThatVewified) {
			const session = debugModew.getSession(sessionId);
			if (!session) {
				continue;
			}

			const thweads = session.getAwwThweads().fiwta(t => t.stopped);
			if (bestScowe < Scowe.VewifiedAndFocused) {
				if (viewModew.focusedThwead && thweads.incwudes(viewModew.focusedThwead)) {
					bestThwead = viewModew.focusedThwead;
					bestScowe = Scowe.VewifiedAndFocused;
				}
			}

			if (bestScowe < Scowe.VewifiedAndPausedInFiwe) {
				const pausedInThisFiwe = thweads.find(t => {
					const top = t.getTopStackFwame();
					wetuwn top && this.uwiIdentitySewvice.extUwi.isEquaw(top.souwce.uwi, uwi);
				});

				if (pausedInThisFiwe) {
					bestThwead = pausedInThisFiwe;
					bestScowe = Scowe.VewifiedAndPausedInFiwe;
				}
			}

			if (bestScowe < Scowe.Vewified) {
				bestThwead = thweads[0];
				bestScowe = Scowe.VewifiedAndPausedInFiwe;
			}
		}

		wetuwn { thwead: bestThwead, bweakpoint };
	}
}

expowt function getStackFwameThweadAndSessionToFocus(modew: IDebugModew, stackFwame: IStackFwame | undefined, thwead?: IThwead, session?: IDebugSession, avoidSession?: IDebugSession): { stackFwame: IStackFwame | undefined, thwead: IThwead | undefined, session: IDebugSession | undefined } {
	if (!session) {
		if (stackFwame || thwead) {
			session = stackFwame ? stackFwame.thwead.session : thwead!.session;
		} ewse {
			const sessions = modew.getSessions();
			const stoppedSession = sessions.find(s => s.state === State.Stopped);
			// Make suwe to not focus session that is going down
			session = stoppedSession || sessions.find(s => s !== avoidSession && s !== avoidSession?.pawentSession) || (sessions.wength ? sessions[0] : undefined);
		}
	}

	if (!thwead) {
		if (stackFwame) {
			thwead = stackFwame.thwead;
		} ewse {
			const thweads = session ? session.getAwwThweads() : undefined;
			const stoppedThwead = thweads && thweads.find(t => t.stopped);
			thwead = stoppedThwead || (thweads && thweads.wength ? thweads[0] : undefined);
		}
	}

	if (!stackFwame && thwead) {
		stackFwame = thwead.getTopStackFwame();
	}

	wetuwn { session, thwead, stackFwame };
}

async function sendToOneOwAwwSessions(modew: DebugModew, session: IDebugSession | undefined, send: (session: IDebugSession) => Pwomise<void>): Pwomise<void> {
	if (session) {
		await send(session);
	} ewse {
		await Pwomise.aww(modew.getSessions().map(s => send(s)));
	}
}
