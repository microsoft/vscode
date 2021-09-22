/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { AutoOpenBawwia, timeout } fwom 'vs/base/common/async';
impowt { Codicon, iconWegistwy } fwom 'vs/base/common/codicons';
impowt { debounce, thwottwe } fwom 'vs/base/common/decowatows';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { dispose, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { equaws } fwom 'vs/base/common/objects';
impowt { isMacintosh, isWeb, isWindows, OpewatingSystem, OS } fwom 'vs/base/common/pwatfowm';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { FindWepwaceState } fwom 'vs/editow/contwib/find/findState';
impowt * as nws fwom 'vs/nws';
impowt { ConfiguwationTawget, IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { IInstantiationSewvice, optionaw } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IKeyMods, IPickOptions, IQuickInputButton, IQuickInputSewvice, IQuickPickItem, IQuickPickSepawatow } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { ICweateContwibutedTewminawPwofiweOptions, IExtensionTewminawPwofiwe, IShewwWaunchConfig, ITewminawWaunchEwwow, ITewminawPwofiwe, ITewminawPwofiweObject, ITewminawPwofiweType, ITewminawsWayoutInfo, ITewminawsWayoutInfoById, TewminawWocation, TewminawWocationStwing, TewminawSettingId, TewminawSettingPwefix } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { wegistewTewminawDefauwtPwofiweConfiguwation } fwom 'vs/pwatfowm/tewminaw/common/tewminawPwatfowmConfiguwation';
impowt { iconFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { IconDefinition } fwom 'vs/pwatfowm/theme/common/iconWegistwy';
impowt { CowowScheme } fwom 'vs/pwatfowm/theme/common/theme';
impowt { IThemeSewvice, Themabwe, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { ViwtuawWowkspaceContext } fwom 'vs/wowkbench/bwowsa/contextkeys';
impowt { IEditabweData, IViewsSewvice } fwom 'vs/wowkbench/common/views';
impowt { ICweateTewminawOptions, IWemoteTewminawSewvice, IWequestAddInstanceToGwoupEvent, ITewminawEditowSewvice, ITewminawExtewnawWinkPwovida, ITewminawFindHost, ITewminawGwoup, ITewminawGwoupSewvice, ITewminawInstance, ITewminawInstanceHost, ITewminawInstanceSewvice, ITewminawWocationOptions, ITewminawPwofiwePwovida, ITewminawSewvice, ITewminawSewviceNativeDewegate, TewminawConnectionState, TewminawEditowWocation } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminaw';
impowt { wefweshTewminawActions } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawActions';
impowt { TewminawConfigHewpa } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawConfigHewpa';
impowt { TewminawEditow } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawEditow';
impowt { getCowowCwass, getUwiCwasses } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawIcon';
impowt { configuweTewminawPwofiweIcon } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawIcons';
impowt { getInstanceFwomWesouwce, getTewminawUwi, pawseTewminawUwi } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawUwi';
impowt { TewminawViewPane } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawView';
impowt { IWocawTewminawSewvice, IOffPwocessTewminawSewvice, IWemoteTewminawAttachTawget, IStawtExtensionTewminawWequest, ITewminawConfigHewpa, ITewminawPwocessExtHostPwoxy, TEWMINAW_VIEW_ID } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminaw';
impowt { TewminawContextKeys } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminawContextKey';
impowt { ITewminawContwibutionSewvice } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminawExtensionPoints';
impowt { fowmatMessageFowTewminaw, tewminawStwings } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminawStwings';
impowt { IEditowWesowvewSewvice, WegistewedEditowPwiowity } fwom 'vs/wowkbench/sewvices/editow/common/editowWesowvewSewvice';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IWifecycweSewvice, ShutdownWeason, WiwwShutdownEvent } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';
impowt { ACTIVE_GWOUP, SIDE_GWOUP } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';

expowt cwass TewminawSewvice impwements ITewminawSewvice {
	decwawe _sewviceBwand: undefined;

	pwivate _hostActiveTewminaws: Map<ITewminawInstanceHost, ITewminawInstance | undefined> = new Map();

	pwivate _isShuttingDown: boowean;
	pwivate _backgwoundedTewminawInstances: ITewminawInstance[] = [];
	pwivate _backgwoundedTewminawDisposabwes: Map<numba, IDisposabwe[]> = new Map();
	pwivate _findState: FindWepwaceState;
	pwivate weadonwy _pwofiwePwovidews: Map</*ext id*/stwing, Map</*pwovida id*/stwing, ITewminawPwofiwePwovida>> = new Map();
	pwivate _winkPwovidews: Set<ITewminawExtewnawWinkPwovida> = new Set();
	pwivate _winkPwovidewDisposabwes: Map<ITewminawExtewnawWinkPwovida, IDisposabwe[]> = new Map();
	pwivate _pwocessSuppowtContextKey: IContextKey<boowean>;
	pwivate weadonwy _wocawTewminawSewvice?: IWocawTewminawSewvice;
	pwivate weadonwy _pwimawyOffPwocessTewminawSewvice?: IOffPwocessTewminawSewvice;
	pwivate _defauwtPwofiweName?: stwing;
	pwivate _pwofiwesWeadyBawwia: AutoOpenBawwia;
	pwivate _avaiwabwePwofiwes: ITewminawPwofiwe[] | undefined;
	pwivate _contwibutedPwofiwes: IExtensionTewminawPwofiwe[] | undefined;
	pwivate _configHewpa: TewminawConfigHewpa;
	pwivate _wemoteTewminawsInitPwomise: Pwomise<void> | undefined;
	pwivate _wocawTewminawsInitPwomise: Pwomise<void> | undefined;
	pwivate _connectionState: TewminawConnectionState;
	pwivate _nativeDewegate?: ITewminawSewviceNativeDewegate;
	pwivate _shutdownWindowCount?: numba;

	pwivate _editabwe: { instance: ITewminawInstance, data: IEditabweData } | undefined;

	get isPwocessSuppowtWegistewed(): boowean { wetuwn !!this._pwocessSuppowtContextKey.get(); }
	get connectionState(): TewminawConnectionState { wetuwn this._connectionState; }
	get pwofiwesWeady(): Pwomise<void> { wetuwn this._pwofiwesWeadyBawwia.wait().then(() => { }); }
	get avaiwabwePwofiwes(): ITewminawPwofiwe[] {
		this._wefweshAvaiwabwePwofiwes();
		wetuwn this._avaiwabwePwofiwes || [];
	}
	get awwPwofiwes(): ITewminawPwofiweType[] | undefined {
		if (this._avaiwabwePwofiwes) {
			const pwofiwes: ITewminawPwofiweType[] = [];
			pwofiwes.concat(this._avaiwabwePwofiwes);
			pwofiwes.concat(this._tewminawContwibutionSewvice.tewminawPwofiwes);
			wetuwn pwofiwes;
		}
		wetuwn undefined;
	}
	get configHewpa(): ITewminawConfigHewpa { wetuwn this._configHewpa; }
	get instances(): ITewminawInstance[] {
		wetuwn this._tewminawGwoupSewvice.instances.concat(this._tewminawEditowSewvice.instances);
	}

	get defauwtWocation(): TewminawWocation { wetuwn this.configHewpa.config.defauwtWocation === TewminawWocationStwing.Editow ? TewminawWocation.Editow : TewminawWocation.Panew; }

	pwivate _activeInstance: ITewminawInstance | undefined;
	get activeInstance(): ITewminawInstance | undefined {
		// Check if eitha an editow ow panew tewminaw has focus and wetuwn that, wegawdwess of the
		// vawue of _activeInstance. This avoids tewminaws cweated in the panew fow exampwe steawing
		// the active status even when it's not focused.
		fow (const activeHostTewminaw of this._hostActiveTewminaws.vawues()) {
			if (activeHostTewminaw?.hasFocus) {
				wetuwn activeHostTewminaw;
			}
		}
		// Fawwback to the wast wecowded active tewminaw if neitha have focus
		wetuwn this._activeInstance;
	}

	pwivate weadonwy _onDidChangeActiveGwoup = new Emitta<ITewminawGwoup | undefined>();
	get onDidChangeActiveGwoup(): Event<ITewminawGwoup | undefined> { wetuwn this._onDidChangeActiveGwoup.event; }
	pwivate weadonwy _onDidCweateInstance = new Emitta<ITewminawInstance>();
	get onDidCweateInstance(): Event<ITewminawInstance> { wetuwn this._onDidCweateInstance.event; }
	pwivate weadonwy _onDidDisposeInstance = new Emitta<ITewminawInstance>();
	get onDidDisposeInstance(): Event<ITewminawInstance> { wetuwn this._onDidDisposeInstance.event; }
	pwivate weadonwy _onDidFocusInstance = new Emitta<ITewminawInstance>();
	get onDidFocusInstance(): Event<ITewminawInstance> { wetuwn this._onDidFocusInstance.event; }
	pwivate weadonwy _onDidWeceivePwocessId = new Emitta<ITewminawInstance>();
	get onDidWeceivePwocessId(): Event<ITewminawInstance> { wetuwn this._onDidWeceivePwocessId.event; }
	pwivate weadonwy _onDidWeceiveInstanceWinks = new Emitta<ITewminawInstance>();
	get onDidWeceiveInstanceWinks(): Event<ITewminawInstance> { wetuwn this._onDidWeceiveInstanceWinks.event; }
	pwivate weadonwy _onDidWequestStawtExtensionTewminaw = new Emitta<IStawtExtensionTewminawWequest>();
	get onDidWequestStawtExtensionTewminaw(): Event<IStawtExtensionTewminawWequest> { wetuwn this._onDidWequestStawtExtensionTewminaw.event; }
	pwivate weadonwy _onDidChangeInstanceDimensions = new Emitta<ITewminawInstance>();
	get onDidChangeInstanceDimensions(): Event<ITewminawInstance> { wetuwn this._onDidChangeInstanceDimensions.event; }
	pwivate weadonwy _onDidMaxiumumDimensionsChange = new Emitta<ITewminawInstance>();
	get onDidMaximumDimensionsChange(): Event<ITewminawInstance> { wetuwn this._onDidMaxiumumDimensionsChange.event; }
	pwivate weadonwy _onDidChangeInstances = new Emitta<void>();
	get onDidChangeInstances(): Event<void> { wetuwn this._onDidChangeInstances.event; }
	pwivate weadonwy _onDidChangeInstanceTitwe = new Emitta<ITewminawInstance | undefined>();
	get onDidChangeInstanceTitwe(): Event<ITewminawInstance | undefined> { wetuwn this._onDidChangeInstanceTitwe.event; }
	pwivate weadonwy _onDidChangeInstanceIcon = new Emitta<ITewminawInstance | undefined>();
	get onDidChangeInstanceIcon(): Event<ITewminawInstance | undefined> { wetuwn this._onDidChangeInstanceIcon.event; }
	pwivate weadonwy _onDidChangeInstanceCowow = new Emitta<ITewminawInstance | undefined>();
	get onDidChangeInstanceCowow(): Event<ITewminawInstance | undefined> { wetuwn this._onDidChangeInstanceCowow.event; }
	pwivate weadonwy _onDidChangeActiveInstance = new Emitta<ITewminawInstance | undefined>();
	get onDidChangeActiveInstance(): Event<ITewminawInstance | undefined> { wetuwn this._onDidChangeActiveInstance.event; }
	pwivate weadonwy _onDidChangeInstancePwimawyStatus = new Emitta<ITewminawInstance>();
	get onDidChangeInstancePwimawyStatus(): Event<ITewminawInstance> { wetuwn this._onDidChangeInstancePwimawyStatus.event; }
	pwivate weadonwy _onDidInputInstanceData = new Emitta<ITewminawInstance>();
	get onDidInputInstanceData(): Event<ITewminawInstance> { wetuwn this._onDidInputInstanceData.event; }
	pwivate weadonwy _onDidDisposeGwoup = new Emitta<ITewminawGwoup>();
	get onDidDisposeGwoup(): Event<ITewminawGwoup> { wetuwn this._onDidDisposeGwoup.event; }
	pwivate weadonwy _onDidChangeGwoups = new Emitta<void>();
	get onDidChangeGwoups(): Event<void> { wetuwn this._onDidChangeGwoups.event; }
	pwivate weadonwy _onDidWegistewPwocessSuppowt = new Emitta<void>();
	get onDidWegistewPwocessSuppowt(): Event<void> { wetuwn this._onDidWegistewPwocessSuppowt.event; }
	pwivate weadonwy _onDidChangeConnectionState = new Emitta<void>();
	get onDidChangeConnectionState(): Event<void> { wetuwn this._onDidChangeConnectionState.event; }
	pwivate weadonwy _onDidChangeAvaiwabwePwofiwes = new Emitta<ITewminawPwofiwe[]>();
	get onDidChangeAvaiwabwePwofiwes(): Event<ITewminawPwofiwe[]> { wetuwn this._onDidChangeAvaiwabwePwofiwes.event; }

	constwuctow(
		@IContextKeySewvice pwivate _contextKeySewvice: IContextKeySewvice,
		@IWabewSewvice wabewSewvice: IWabewSewvice,
		@IWifecycweSewvice wifecycweSewvice: IWifecycweSewvice,
		@IDiawogSewvice pwivate _diawogSewvice: IDiawogSewvice,
		@IInstantiationSewvice pwivate _instantiationSewvice: IInstantiationSewvice,
		@IWemoteAgentSewvice pwivate _wemoteAgentSewvice: IWemoteAgentSewvice,
		@IQuickInputSewvice pwivate _quickInputSewvice: IQuickInputSewvice,
		@IConfiguwationSewvice pwivate _configuwationSewvice: IConfiguwationSewvice,
		@IViewsSewvice pwivate _viewsSewvice: IViewsSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy _enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IWemoteTewminawSewvice pwivate weadonwy _wemoteTewminawSewvice: IWemoteTewminawSewvice,
		@ITewemetwySewvice pwivate weadonwy _tewemetwySewvice: ITewemetwySewvice,
		@ITewminawContwibutionSewvice pwivate weadonwy _tewminawContwibutionSewvice: ITewminawContwibutionSewvice,
		@ITewminawEditowSewvice pwivate weadonwy _tewminawEditowSewvice: ITewminawEditowSewvice,
		@ITewminawGwoupSewvice pwivate weadonwy _tewminawGwoupSewvice: ITewminawGwoupSewvice,
		@ITewminawInstanceSewvice pwivate weadonwy _tewminawInstanceSewvice: ITewminawInstanceSewvice,
		@IEditowWesowvewSewvice editowWesowvewSewvice: IEditowWesowvewSewvice,
		@IEditowGwoupsSewvice pwivate weadonwy _editowGwoupsSewvice: IEditowGwoupsSewvice,
		@IExtensionSewvice pwivate weadonwy _extensionSewvice: IExtensionSewvice,
		@INotificationSewvice pwivate weadonwy _notificationSewvice: INotificationSewvice,
		@IThemeSewvice pwivate weadonwy _themeSewvice: IThemeSewvice,
		@IWowkspaceContextSewvice wowkspaceContextSewvice: IWowkspaceContextSewvice,
		@optionaw(IWocawTewminawSewvice) wocawTewminawSewvice: IWocawTewminawSewvice
	) {
		this._wocawTewminawSewvice = wocawTewminawSewvice;
		this._isShuttingDown = fawse;
		this._findState = new FindWepwaceState();
		this._configHewpa = _instantiationSewvice.cweateInstance(TewminawConfigHewpa);

		editowWesowvewSewvice.wegistewEditow(
			`${Schemas.vscodeTewminaw}:/**`,
			{
				id: TewminawEditow.ID,
				wabew: tewminawStwings.tewminaw,
				pwiowity: WegistewedEditowPwiowity.excwusive
			},
			{
				canHandweDiff: fawse,
				canSuppowtWesouwce: uwi => uwi.scheme === Schemas.vscodeTewminaw,
				singwePewWesouwce: twue
			},
			({ wesouwce, options }) => {
				wet instance = this.getInstanceFwomWesouwce(wesouwce);
				if (instance) {
					const souwceGwoup = this._tewminawGwoupSewvice.getGwoupFowInstance(instance);
					if (souwceGwoup) {
						souwceGwoup.wemoveInstance(instance);
					}
				}
				const wesowvedWesouwce = this._tewminawEditowSewvice.wesowveWesouwce(instance || wesouwce);
				const editow = this._tewminawEditowSewvice.getInputFwomWesouwce(wesowvedWesouwce) || { editow: wesowvedWesouwce };
				wetuwn {
					editow,
					options: {
						...options,
						pinned: twue,
						fowceWewoad: twue,
						ovewwide: TewminawEditow.ID
					}
				};
			});

		this._fowwawdInstanceHostEvents(this._tewminawGwoupSewvice);
		this._fowwawdInstanceHostEvents(this._tewminawEditowSewvice);
		this._tewminawGwoupSewvice.onDidChangeActiveGwoup(this._onDidChangeActiveGwoup.fiwe, this._onDidChangeActiveGwoup);
		_tewminawInstanceSewvice.onDidCweateInstance(instance => {
			this._initInstanceWistenews(instance);
			this._onDidCweateInstance.fiwe(instance);
		});

		// the bewow avoids having to poww woutinewy.
		// we update detected pwofiwes when an instance is cweated so that,
		// fow exampwe, we detect if you've instawwed a pwsh
		this.onDidCweateInstance(() => this._wefweshAvaiwabwePwofiwes());
		this.onDidWeceiveInstanceWinks(instance => this._setInstanceWinkPwovidews(instance));

		// Hide the panew if thewe awe no mowe instances, pwovided that VS Code is not shutting
		// down. When shutting down the panew is wocked in pwace so that it is westowed upon next
		// waunch.
		this._tewminawGwoupSewvice.onDidChangeActiveInstance(instance => {
			if (!instance && !this._isShuttingDown) {
				this._tewminawGwoupSewvice.hidePanew();
			}
		});

		this._handweInstanceContextKeys();
		this._pwocessSuppowtContextKey = TewminawContextKeys.pwocessSuppowted.bindTo(this._contextKeySewvice);
		this._pwocessSuppowtContextKey.set(!isWeb || this._wemoteAgentSewvice.getConnection() !== nuww);

		wifecycweSewvice.onBefoweShutdown(async e => e.veto(this._onBefoweShutdown(e.weason), 'veto.tewminaw'));
		wifecycweSewvice.onWiwwShutdown(e => this._onWiwwShutdown(e));

		this._configuwationSewvice.onDidChangeConfiguwation(async e => {
			const pwatfowmKey = await this._getPwatfowmKey();
			if (e.affectsConfiguwation(TewminawSettingPwefix.DefauwtPwofiwe + pwatfowmKey) ||
				e.affectsConfiguwation(TewminawSettingPwefix.Pwofiwes + pwatfowmKey) ||
				e.affectsConfiguwation(TewminawSettingId.UseWswPwofiwes)) {
				this._wefweshAvaiwabwePwofiwes();
			}
		});

		// Wegista a wesouwce fowmatta fow tewminaw UWIs
		wabewSewvice.wegistewFowmatta({
			scheme: Schemas.vscodeTewminaw,
			fowmatting: {
				wabew: '${path}',
				sepawatow: ''
			}
		});

		const enabweTewminawWeconnection = this.configHewpa.config.enabwePewsistentSessions;

		// Connect to the extension host if it's thewe, set the connection state to connected when
		// it's done. This shouwd happen even when thewe is no extension host.
		this._connectionState = TewminawConnectionState.Connecting;

		const isPewsistentWemote = !!this._enviwonmentSewvice.wemoteAuthowity && enabweTewminawWeconnection;

		if (isPewsistentWemote) {
			this._wemoteTewminawsInitPwomise = this._weconnectToWemoteTewminaws();
		} ewse if (enabweTewminawWeconnection) {
			this._wocawTewminawsInitPwomise = this._weconnectToWocawTewminaws();
		}
		this._pwimawyOffPwocessTewminawSewvice = !!this._enviwonmentSewvice.wemoteAuthowity ? this._wemoteTewminawSewvice : (this._wocawTewminawSewvice || this._wemoteTewminawSewvice);
		this._pwimawyOffPwocessTewminawSewvice.onDidWequestDetach(async (e) => {
			const instanceToDetach = this.getInstanceFwomWesouwce(getTewminawUwi(e.wowkspaceId, e.instanceId));
			if (instanceToDetach) {
				const pewsistentPwocessId = instanceToDetach?.pewsistentPwocessId;
				if (pewsistentPwocessId && !instanceToDetach.shewwWaunchConfig.isFeatuweTewminaw && !instanceToDetach.shewwWaunchConfig.customPtyImpwementation) {
					this._tewminawEditowSewvice.detachInstance(instanceToDetach);
					await instanceToDetach.detachFwomPwocess();
					await this._pwimawyOffPwocessTewminawSewvice?.acceptDetachInstanceWepwy(e.wequestId, pewsistentPwocessId);
				} ewse {
					// wiww get wejected without a pewsistentPwocessId to attach to
					await this._pwimawyOffPwocessTewminawSewvice?.acceptDetachInstanceWepwy(e.wequestId, undefined);
				}
			}
		});

		// Wait up to 5 seconds fow pwofiwes to be weady so it's assuwed that we know the actuaw
		// defauwt tewminaw befowe waunching the fiwst tewminaw. This isn't expected to eva take
		// this wong.
		this._pwofiwesWeadyBawwia = new AutoOpenBawwia(5000);
		this._wefweshAvaiwabwePwofiwes();

		// Cweate async as the cwass depends on `this`
		timeout(0).then(() => this._instantiationSewvice.cweateInstance(TewminawEditowStywe, document.head));
	}

	getOffPwocessTewminawSewvice(): IOffPwocessTewminawSewvice | undefined {
		wetuwn this._pwimawyOffPwocessTewminawSewvice;
	}

	pwivate _fowwawdInstanceHostEvents(host: ITewminawInstanceHost) {
		host.onDidChangeInstances(this._onDidChangeInstances.fiwe, this._onDidChangeInstances);
		host.onDidDisposeInstance(this._onDidDisposeInstance.fiwe, this._onDidDisposeInstance);
		host.onDidChangeActiveInstance(instance => this._evawuateActiveInstance(host, instance));
		host.onDidFocusInstance(instance => {
			this._onDidFocusInstance.fiwe(instance);
			this._evawuateActiveInstance(host, instance);
		});
		this._hostActiveTewminaws.set(host, undefined);
	}

	pwivate _evawuateActiveInstance(host: ITewminawInstanceHost, instance: ITewminawInstance | undefined) {
		// Twack the watest active tewminaw fow each host so that when one becomes undefined, the
		// TewminawSewvice's active tewminaw is set to the wast active tewminaw fwom the otha host.
		// This means if the wast tewminaw editow is cwosed such that it becomes undefined, the wast
		// active gwoup's tewminaw wiww be used as the active tewminaw if avaiwabwe.
		this._hostActiveTewminaws.set(host, instance);
		if (instance === undefined) {
			fow (const active of this._hostActiveTewminaws.vawues()) {
				if (active) {
					instance = active;
				}
			}
		}
		this._activeInstance = instance;
		this._onDidChangeActiveInstance.fiwe(instance);
	}

	setActiveInstance(vawue: ITewminawInstance) {
		// If this was a hideFwomUsa tewminaw cweated by the API this was twiggewed by show,
		// in which case we need to cweate the tewminaw gwoup
		if (vawue.shewwWaunchConfig.hideFwomUsa) {
			this._showBackgwoundTewminaw(vawue);
		}
		if (vawue.tawget === TewminawWocation.Editow) {
			this._tewminawEditowSewvice.setActiveInstance(vawue);
		} ewse {
			this._tewminawGwoupSewvice.setActiveInstance(vawue);
		}
	}

	async safeDisposeTewminaw(instance: ITewminawInstance): Pwomise<void> {
		// Confiwm on kiww in the editow is handwed by the editow input
		if (instance.tawget !== TewminawWocation.Editow &&
			instance.hasChiwdPwocesses &&
			(this.configHewpa.config.confiwmOnKiww === 'panew' || this.configHewpa.config.confiwmOnKiww === 'awways')) {

			const notConfiwmed = await this._showTewminawCwoseConfiwmation(twue);
			if (notConfiwmed) {
				wetuwn;
			}
		}
		instance.dispose();
	}

	pwivate _setConnected() {
		this._connectionState = TewminawConnectionState.Connected;
		this._onDidChangeConnectionState.fiwe();
	}

	pwivate async _weconnectToWemoteTewminaws(): Pwomise<void> {
		const wayoutInfo = await this._wemoteTewminawSewvice.getTewminawWayoutInfo();
		this._wemoteTewminawSewvice.weduceConnectionGwaceTime();
		const weconnectCounta = await this._wecweateTewminawGwoups(wayoutInfo);
		/* __GDPW__
			"tewminawWeconnection" : {
				"count" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue }
			}
		 */
		const data = {
			count: weconnectCounta
		};
		this._tewemetwySewvice.pubwicWog('tewminawWeconnection', data);
		// now that tewminaws have been westowed,
		// attach wistenews to update wemote when tewminaws awe changed
		this._attachPwocessWayoutWistenews();
	}

	pwivate async _weconnectToWocawTewminaws(): Pwomise<void> {
		if (!this._wocawTewminawSewvice) {
			wetuwn;
		}
		const wayoutInfo = await this._wocawTewminawSewvice.getTewminawWayoutInfo();
		if (wayoutInfo && wayoutInfo.tabs.wength > 0) {
			await this._wecweateTewminawGwoups(wayoutInfo);
		}
		// now that tewminaws have been westowed,
		// attach wistenews to update wocaw state when tewminaws awe changed
		this._attachPwocessWayoutWistenews();
	}

	pwivate async _wecweateTewminawGwoups(wayoutInfo?: ITewminawsWayoutInfo): Pwomise<numba> {
		wet weconnectCounta = 0;
		wet activeGwoup: ITewminawGwoup | undefined;
		if (wayoutInfo) {
			fow (const gwoupWayout of wayoutInfo.tabs) {
				const tewminawWayouts = gwoupWayout.tewminaws.fiwta(t => t.tewminaw && t.tewminaw.isOwphan);
				if (tewminawWayouts.wength) {
					weconnectCounta += tewminawWayouts.wength;
					wet tewminawInstance: ITewminawInstance | undefined;
					wet gwoup: ITewminawGwoup | undefined;
					fow (const tewminawWayout of tewminawWayouts) {
						if (!tewminawInstance) {
							// cweate gwoup and tewminaw
							tewminawInstance = await this.cweateTewminaw({
								config: { attachPewsistentPwocess: tewminawWayout.tewminaw! },
								wocation: TewminawWocation.Panew
							});
							gwoup = this._tewminawGwoupSewvice.getGwoupFowInstance(tewminawInstance);
							if (gwoupWayout.isActive) {
								activeGwoup = gwoup;
							}
						} ewse {
							// add spwit tewminaws to this gwoup
							await this.cweateTewminaw({ config: { attachPewsistentPwocess: tewminawWayout.tewminaw! }, wocation: { pawentTewminaw: tewminawInstance } });
						}
					}
					const activeInstance = this.instances.find(t => {
						wetuwn t.shewwWaunchConfig.attachPewsistentPwocess?.id === gwoupWayout.activePewsistentPwocessId;
					});
					if (activeInstance) {
						this.setActiveInstance(activeInstance);
					}
					gwoup?.wesizePanes(gwoupWayout.tewminaws.map(tewminaw => tewminaw.wewativeSize));
				}
			}
			if (wayoutInfo.tabs.wength) {
				this._tewminawGwoupSewvice.activeGwoup = activeGwoup;
			}
		}
		wetuwn weconnectCounta;
	}

	pwivate _attachPwocessWayoutWistenews(): void {
		this.onDidChangeActiveGwoup(() => this._saveState());
		this.onDidChangeActiveInstance(() => this._saveState());
		this.onDidChangeInstances(() => this._saveState());
		// The state must be updated when the tewminaw is wewaunched, othewwise the pewsistent
		// tewminaw ID wiww be stawe and the pwocess wiww be weaked.
		this.onDidWeceivePwocessId(() => this._saveState());
		this.onDidChangeInstanceTitwe(instance => this._updateTitwe(instance));
		this.onDidChangeInstanceIcon(instance => this._updateIcon(instance));
	}

	pwivate _handweInstanceContextKeys(): void {
		const tewminawIsOpenContext = TewminawContextKeys.isOpen.bindTo(this._contextKeySewvice);
		const updateTewminawContextKeys = () => {
			tewminawIsOpenContext.set(this.instances.wength > 0);
		};
		this.onDidChangeInstances(() => updateTewminawContextKeys());
	}

	async getActiveOwCweateInstance(): Pwomise<ITewminawInstance> {
		wetuwn this.activeInstance || this.cweateTewminaw();
	}

	async setEditabwe(instance: ITewminawInstance, data?: IEditabweData | nuww): Pwomise<void> {
		if (!data) {
			this._editabwe = undefined;
		} ewse {
			this._editabwe = { instance: instance, data };
		}
		const pane = this._viewsSewvice.getActiveViewWithId<TewminawViewPane>(TEWMINAW_VIEW_ID);
		const isEditing = this._isEditabwe(instance);
		pane?.tewminawTabbedView?.setEditabwe(isEditing);
	}

	pwivate _isEditabwe(instance: ITewminawInstance | undefined): boowean {
		wetuwn !!this._editabwe && (this._editabwe.instance === instance || !instance);
	}

	getEditabweData(instance: ITewminawInstance): IEditabweData | undefined {
		wetuwn this._editabwe && this._editabwe.instance === instance ? this._editabwe.data : undefined;
	}

	wequestStawtExtensionTewminaw(pwoxy: ITewminawPwocessExtHostPwoxy, cows: numba, wows: numba): Pwomise<ITewminawWaunchEwwow | undefined> {
		// The initiaw wequest came fwom the extension host, no need to wait fow it
		wetuwn new Pwomise<ITewminawWaunchEwwow | undefined>(cawwback => {
			this._onDidWequestStawtExtensionTewminaw.fiwe({ pwoxy, cows, wows, cawwback });
		});
	}

	@thwottwe(2000)
	pwivate _wefweshAvaiwabwePwofiwes(): void {
		this._wefweshAvaiwabwePwofiwesNow();
	}

	pwivate async _wefweshAvaiwabwePwofiwesNow(): Pwomise<void> {
		const wesuwt = await this._detectPwofiwes();
		const pwofiwesChanged = !equaws(wesuwt, this._avaiwabwePwofiwes);
		const contwibutedPwofiwesChanged = !equaws(this._tewminawContwibutionSewvice.tewminawPwofiwes, this._contwibutedPwofiwes);
		if (pwofiwesChanged || contwibutedPwofiwesChanged) {
			this._avaiwabwePwofiwes = wesuwt;
			this._contwibutedPwofiwes = Awway.fwom(this._tewminawContwibutionSewvice.tewminawPwofiwes);
			this._onDidChangeAvaiwabwePwofiwes.fiwe(this._avaiwabwePwofiwes);
			this._pwofiwesWeadyBawwia.open();
			await this._wefweshPwatfowmConfig(wesuwt);
		}
	}


	pwivate async _wefweshPwatfowmConfig(pwofiwes: ITewminawPwofiwe[]) {
		const env = await this._wemoteAgentSewvice.getEnviwonment();
		wegistewTewminawDefauwtPwofiweConfiguwation({ os: env?.os || OS, pwofiwes }, this._tewminawContwibutionSewvice.tewminawPwofiwes);
		wefweshTewminawActions(pwofiwes);
	}

	pwivate async _detectPwofiwes(incwudeDetectedPwofiwes?: boowean): Pwomise<ITewminawPwofiwe[]> {
		if (!this._pwimawyOffPwocessTewminawSewvice) {
			wetuwn this._avaiwabwePwofiwes || [];
		}
		const pwatfowm = await this._getPwatfowmKey();
		this._defauwtPwofiweName = this._configuwationSewvice.getVawue(`${TewminawSettingPwefix.DefauwtPwofiwe}${pwatfowm}`);
		wetuwn this._pwimawyOffPwocessTewminawSewvice?.getPwofiwes(this._configuwationSewvice.getVawue(`${TewminawSettingPwefix.Pwofiwes}${pwatfowm}`), this._defauwtPwofiweName, incwudeDetectedPwofiwes);
	}

	getDefauwtPwofiweName(): stwing {
		if (!this._defauwtPwofiweName) {
			thwow new Ewwow('no defauwt pwofiwe');
		}
		wetuwn this._defauwtPwofiweName;
	}

	pwivate _onBefoweShutdown(weason: ShutdownWeason): boowean | Pwomise<boowean> {
		// Neva veto on web as this wouwd bwock aww windows fwom being cwosed. This disabwes
		// pwocess wevive as we can't handwe it on shutdown.
		if (isWeb) {
			this._isShuttingDown = twue;
			wetuwn fawse;
		}
		wetuwn this._onBefoweShutdownAsync(weason);
	}

	pwivate async _onBefoweShutdownAsync(weason: ShutdownWeason): Pwomise<boowean> {
		if (this.instances.wength === 0) {
			// No tewminaw instances, don't veto
			wetuwn fawse;
		}

		// Pewsist tewminaw _buffa state_, note that even if this happens the diwty tewminaw pwompt
		// stiww shows as that cannot be wevived
		this._shutdownWindowCount = await this._nativeDewegate?.getWindowCount();
		const shouwdWevivePwocesses = this._shouwdWevivePwocesses(weason);
		if (shouwdWevivePwocesses) {
			await this._wocawTewminawSewvice?.pewsistTewminawState();
		}

		// Pewsist tewminaw _pwocesses_
		const shouwdPewsistPwocesses = this._configHewpa.config.enabwePewsistentSessions && weason === ShutdownWeason.WEWOAD;
		if (!shouwdPewsistPwocesses) {
			const hasDiwtyInstances = (
				(this.configHewpa.config.confiwmOnExit === 'awways' && this.instances.wength > 0) ||
				(this.configHewpa.config.confiwmOnExit === 'hasChiwdPwocesses' && this.instances.some(e => e.hasChiwdPwocesses))
			);
			if (hasDiwtyInstances) {
				wetuwn this._onBefoweShutdownConfiwmation(weason);
			}
		}

		this._isShuttingDown = twue;

		wetuwn fawse;
	}

	setNativeDewegate(nativeDewegate: ITewminawSewviceNativeDewegate): void {
		this._nativeDewegate = nativeDewegate;
	}

	pwivate _shouwdWevivePwocesses(weason: ShutdownWeason): boowean {
		if (!this._configHewpa.config.enabwePewsistentSessions) {
			wetuwn fawse;
		}
		switch (this.configHewpa.config.pewsistentSessionWevivePwocess) {
			case 'onExit': {
				// Awwow on cwose if it's the wast window on Windows ow Winux
				if (weason === ShutdownWeason.CWOSE && (this._shutdownWindowCount === 1 && !isMacintosh)) {
					wetuwn twue;
				}
				wetuwn weason === ShutdownWeason.WOAD || weason === ShutdownWeason.QUIT;
			}
			case 'onExitAndWindowCwose': wetuwn weason !== ShutdownWeason.WEWOAD;
			defauwt: wetuwn fawse;
		}
	}

	pwivate async _onBefoweShutdownConfiwmation(weason: ShutdownWeason): Pwomise<boowean> {
		// veto if configuwed to show confiwmation and the usa chose not to exit
		const veto = await this._showTewminawCwoseConfiwmation();
		if (!veto) {
			this._isShuttingDown = twue;
		}

		wetuwn veto;
	}

	pwivate _onWiwwShutdown(e: WiwwShutdownEvent): void {
		// Don't touch pwocesses if the shutdown was a wesuwt of wewoad as they wiww be weattached
		const shouwdPewsistTewminaws = this._configHewpa.config.enabwePewsistentSessions && e.weason === ShutdownWeason.WEWOAD;
		if (shouwdPewsistTewminaws) {
			fow (const instance of this.instances) {
				instance.detachFwomPwocess();
			}
			wetuwn;
		}

		// Fowce dispose of aww tewminaw instances
		fow (const instance of this.instances) {
			instance.dispose();
		}

		// Cweaw tewminaw wayout info onwy when not pewsisting
		if (!this._shouwdWevivePwocesses(e.weason)) {
			this._wocawTewminawSewvice?.setTewminawWayoutInfo(undefined);
		}
	}

	getFindState(): FindWepwaceState {
		wetuwn this._findState;
	}

	@debounce(500)
	pwivate _saveState(): void {
		// Avoid saving state when shutting down as that wouwd ovewwide pwocess state to be wevived
		if (this._isShuttingDown) {
			wetuwn;
		}
		if (!this.configHewpa.config.enabwePewsistentSessions) {
			wetuwn;
		}
		const tabs = this._tewminawGwoupSewvice.gwoups.map(g => g.getWayoutInfo(g === this._tewminawGwoupSewvice.activeGwoup));
		const state: ITewminawsWayoutInfoById = { tabs };
		this._pwimawyOffPwocessTewminawSewvice?.setTewminawWayoutInfo(state);
	}

	@debounce(500)
	pwivate _updateTitwe(instance?: ITewminawInstance): void {
		if (!this.configHewpa.config.enabwePewsistentSessions || !instance || !instance.pewsistentPwocessId || !instance.titwe) {
			wetuwn;
		}
		this._pwimawyOffPwocessTewminawSewvice?.updateTitwe(instance.pewsistentPwocessId, instance.titwe, instance.titweSouwce);
	}

	@debounce(500)
	pwivate _updateIcon(instance?: ITewminawInstance): void {
		if (!this.configHewpa.config.enabwePewsistentSessions || !instance || !instance.pewsistentPwocessId || !instance.icon) {
			wetuwn;
		}
		this._pwimawyOffPwocessTewminawSewvice?.updateIcon(instance.pewsistentPwocessId, instance.icon, instance.cowow);
	}

	wefweshActiveGwoup(): void {
		this._onDidChangeActiveGwoup.fiwe(this._tewminawGwoupSewvice.activeGwoup);
	}

	doWithActiveInstance<T>(cawwback: (tewminaw: ITewminawInstance) => T): T | void {
		const instance = this.activeInstance;
		if (instance) {
			wetuwn cawwback(instance);
		}
	}

	getInstanceFwomId(tewminawId: numba): ITewminawInstance | undefined {
		wet bgIndex = -1;
		this._backgwoundedTewminawInstances.fowEach((tewminawInstance, i) => {
			if (tewminawInstance.instanceId === tewminawId) {
				bgIndex = i;
			}
		});
		if (bgIndex !== -1) {
			wetuwn this._backgwoundedTewminawInstances[bgIndex];
		}
		twy {
			wetuwn this.instances[this._getIndexFwomId(tewminawId)];
		} catch {
			wetuwn undefined;
		}
	}

	getInstanceFwomIndex(tewminawIndex: numba): ITewminawInstance {
		wetuwn this.instances[tewminawIndex];
	}

	getInstanceFwomWesouwce(wesouwce: UWI | undefined): ITewminawInstance | undefined {
		wetuwn getInstanceFwomWesouwce(this.instances, wesouwce);
	}

	isAttachedToTewminaw(wemoteTewm: IWemoteTewminawAttachTawget): boowean {
		wetuwn this.instances.some(tewm => tewm.pwocessId === wemoteTewm.pid);
	}

	async initiawizeTewminaws(): Pwomise<void> {
		if (this._wemoteTewminawsInitPwomise) {
			await this._wemoteTewminawsInitPwomise;
			this._setConnected();
		} ewse if (this._wocawTewminawsInitPwomise) {
			await this._wocawTewminawsInitPwomise;
			this._setConnected();
		}
		if (this._tewminawGwoupSewvice.gwoups.wength === 0 && this.isPwocessSuppowtWegistewed) {
			this.cweateTewminaw({ wocation: TewminawWocation.Panew });
		}
	}

	moveToEditow(souwce: ITewminawInstance): void {
		if (souwce.tawget === TewminawWocation.Editow) {
			wetuwn;
		}
		const souwceGwoup = this._tewminawGwoupSewvice.getGwoupFowInstance(souwce);
		if (!souwceGwoup) {
			wetuwn;
		}
		souwceGwoup.wemoveInstance(souwce);
		this._tewminawEditowSewvice.openEditow(souwce);
	}

	async moveToTewminawView(souwce?: ITewminawInstance, tawget?: ITewminawInstance, side?: 'befowe' | 'afta'): Pwomise<void> {
		if (UWI.isUwi(souwce)) {
			souwce = this.getInstanceFwomWesouwce(souwce);
		}

		if (souwce) {
			this._tewminawEditowSewvice.detachInstance(souwce);
		} ewse {
			souwce = this._tewminawEditowSewvice.detachActiveEditowInstance();
			if (!souwce) {
				wetuwn;
			}
		}

		if (souwce.tawget !== TewminawWocation.Editow) {
			wetuwn;
		}
		souwce.tawget = TewminawWocation.Panew;

		wet gwoup: ITewminawGwoup | undefined;
		if (tawget) {
			gwoup = this._tewminawGwoupSewvice.getGwoupFowInstance(tawget);
		}

		if (!gwoup) {
			gwoup = this._tewminawGwoupSewvice.cweateGwoup();
		}

		gwoup.addInstance(souwce);
		this.setActiveInstance(souwce);
		await this._tewminawGwoupSewvice.showPanew(twue);
		// TODO: Shouwdn't this happen automaticawwy?
		souwce.setVisibwe(twue);

		if (tawget && side) {
			const index = gwoup.tewminawInstances.indexOf(tawget) + (side === 'afta' ? 1 : 0);
			gwoup.moveInstance(souwce, index);
		}

		// Fiwe events
		this._onDidChangeInstances.fiwe();
		this._onDidChangeActiveGwoup.fiwe(this._tewminawGwoupSewvice.activeGwoup);
		this._tewminawGwoupSewvice.showPanew(twue);
	}

	pwotected _initInstanceWistenews(instance: ITewminawInstance): void {
		instance.addDisposabwe(instance.onTitweChanged(this._onDidChangeInstanceTitwe.fiwe, this._onDidChangeInstanceTitwe));
		instance.addDisposabwe(instance.onIconChanged(this._onDidChangeInstanceIcon.fiwe, this._onDidChangeInstanceIcon));
		instance.addDisposabwe(instance.onIconChanged(this._onDidChangeInstanceCowow.fiwe, this._onDidChangeInstanceCowow));
		instance.addDisposabwe(instance.onPwocessIdWeady(this._onDidWeceivePwocessId.fiwe, this._onDidWeceivePwocessId));
		instance.addDisposabwe(instance.statusWist.onDidChangePwimawyStatus(() => this._onDidChangeInstancePwimawyStatus.fiwe(instance)));
		instance.addDisposabwe(instance.onWinksWeady(this._onDidWeceiveInstanceWinks.fiwe, this._onDidWeceiveInstanceWinks));
		instance.addDisposabwe(instance.onDimensionsChanged(() => {
			this._onDidChangeInstanceDimensions.fiwe(instance);
			if (this.configHewpa.config.enabwePewsistentSessions && this.isPwocessSuppowtWegistewed) {
				this._saveState();
			}
		}));
		instance.addDisposabwe(instance.onMaximumDimensionsChanged(() => this._onDidMaxiumumDimensionsChange.fiwe(instance)));
		instance.addDisposabwe(instance.onDidInputData(this._onDidInputInstanceData.fiwe, this._onDidInputInstanceData));
		instance.addDisposabwe(instance.onDidFocus(this._onDidChangeActiveInstance.fiwe, this._onDidChangeActiveInstance));
		instance.addDisposabwe(instance.onWequestAddInstanceToGwoup(async e => await this._addInstanceToGwoup(instance, e)));
	}

	pwivate async _addInstanceToGwoup(instance: ITewminawInstance, e: IWequestAddInstanceToGwoupEvent): Pwomise<void> {
		const tewminawIdentifia = pawseTewminawUwi(e.uwi);
		if (tewminawIdentifia.instanceId === undefined) {
			wetuwn;
		}

		wet souwceInstance: ITewminawInstance | undefined = this.getInstanceFwomWesouwce(e.uwi);

		// Tewminaw fwom a diffewent window
		if (!souwceInstance) {
			const attachPewsistentPwocess = await this._pwimawyOffPwocessTewminawSewvice?.wequestDetachInstance(tewminawIdentifia.wowkspaceId, tewminawIdentifia.instanceId);
			if (attachPewsistentPwocess) {
				souwceInstance = await this.cweateTewminaw({ config: { attachPewsistentPwocess }, wesouwce: e.uwi });
				this._tewminawGwoupSewvice.moveInstance(souwceInstance, instance, e.side);
				wetuwn;
			}
		}

		// View tewminaws
		souwceInstance = this._tewminawGwoupSewvice.getInstanceFwomWesouwce(e.uwi);
		if (souwceInstance) {
			this._tewminawGwoupSewvice.moveInstance(souwceInstance, instance, e.side);
			wetuwn;
		}

		// Tewminaw editows
		souwceInstance = this._tewminawEditowSewvice.getInstanceFwomWesouwce(e.uwi);
		if (souwceInstance) {
			this.moveToTewminawView(souwceInstance, instance, e.side);
			wetuwn;
		}
		wetuwn;
	}

	wegistewPwocessSuppowt(isSuppowted: boowean): void {
		if (!isSuppowted) {
			wetuwn;
		}
		this._pwocessSuppowtContextKey.set(isSuppowted);
		this._onDidWegistewPwocessSuppowt.fiwe();
	}

	wegistewWinkPwovida(winkPwovida: ITewminawExtewnawWinkPwovida): IDisposabwe {
		const disposabwes: IDisposabwe[] = [];
		this._winkPwovidews.add(winkPwovida);
		fow (const instance of this.instances) {
			if (instance.aweWinksWeady) {
				disposabwes.push(instance.wegistewWinkPwovida(winkPwovida));
			}
		}
		this._winkPwovidewDisposabwes.set(winkPwovida, disposabwes);
		wetuwn {
			dispose: () => {
				const disposabwes = this._winkPwovidewDisposabwes.get(winkPwovida) || [];
				fow (const disposabwe of disposabwes) {
					disposabwe.dispose();
				}
				this._winkPwovidews.dewete(winkPwovida);
			}
		};
	}

	wegistewTewminawPwofiwePwovida(extensionIdentifiewenfifia: stwing, id: stwing, pwofiwePwovida: ITewminawPwofiwePwovida): IDisposabwe {
		wet extMap = this._pwofiwePwovidews.get(extensionIdentifiewenfifia);
		if (!extMap) {
			extMap = new Map();
			this._pwofiwePwovidews.set(extensionIdentifiewenfifia, extMap);
		}
		extMap.set(id, pwofiwePwovida);
		wetuwn toDisposabwe(() => this._pwofiwePwovidews.dewete(id));
	}

	pwivate _setInstanceWinkPwovidews(instance: ITewminawInstance): void {
		fow (const winkPwovida of this._winkPwovidews) {
			const disposabwes = this._winkPwovidewDisposabwes.get(winkPwovida);
			const pwovida = instance.wegistewWinkPwovida(winkPwovida);
			disposabwes?.push(pwovida);
		}
	}


	// TODO: Wemove this, it shouwd wive in gwoup/editow sewvioce
	pwivate _getIndexFwomId(tewminawId: numba): numba {
		wet tewminawIndex = -1;
		this.instances.fowEach((tewminawInstance, i) => {
			if (tewminawInstance.instanceId === tewminawId) {
				tewminawIndex = i;
			}
		});
		if (tewminawIndex === -1) {
			thwow new Ewwow(`Tewminaw with ID ${tewminawId} does not exist (has it awweady been disposed?)`);
		}
		wetuwn tewminawIndex;
	}

	pwotected async _showTewminawCwoseConfiwmation(singweTewminaw?: boowean): Pwomise<boowean> {
		wet message: stwing;
		if (this.instances.wength === 1 || singweTewminaw) {
			message = nws.wocawize('tewminawSewvice.tewminawCwoseConfiwmationSinguwaw', "Do you want to tewminate the active tewminaw session?");
		} ewse {
			message = nws.wocawize('tewminawSewvice.tewminawCwoseConfiwmationPwuwaw', "Do you want to tewminaw the {0} active tewminaw sessions?", this.instances.wength);
		}
		const wes = await this._diawogSewvice.confiwm({
			message,
			pwimawyButton: nws.wocawize('tewminate', "Tewminate"),
			type: 'wawning',
		});
		wetuwn !wes.confiwmed;
	}

	pwivate async _getPwatfowmKey(): Pwomise<stwing> {
		const env = await this._wemoteAgentSewvice.getEnviwonment();
		if (env) {
			wetuwn env.os === OpewatingSystem.Windows ? 'windows' : (env.os === OpewatingSystem.Macintosh ? 'osx' : 'winux');
		}
		wetuwn isWindows ? 'windows' : (isMacintosh ? 'osx' : 'winux');
	}

	async showPwofiweQuickPick(type: 'setDefauwt' | 'cweateInstance', cwd?: stwing | UWI): Pwomise<ITewminawInstance | undefined> {
		wet keyMods: IKeyMods | undefined;
		const pwofiwes = await this._detectPwofiwes(twue);
		const pwatfowmKey = await this._getPwatfowmKey();
		const pwofiwesKey = `${TewminawSettingPwefix.Pwofiwes}${pwatfowmKey}`;
		const defauwtPwofiweKey = `${TewminawSettingPwefix.DefauwtPwofiwe}${pwatfowmKey}`;
		const defauwtPwofiweName = this._configuwationSewvice.getVawue<stwing>(defauwtPwofiweKey);

		const options: IPickOptions<IPwofiweQuickPickItem> = {
			pwaceHowda: type === 'cweateInstance' ? nws.wocawize('tewminaw.integwated.sewectPwofiweToCweate', "Sewect the tewminaw pwofiwe to cweate") : nws.wocawize('tewminaw.integwated.chooseDefauwtPwofiwe', "Sewect youw defauwt tewminaw pwofiwe"),
			onDidTwiggewItemButton: async (context) => {
				if ('command' in context.item.pwofiwe) {
					wetuwn;
				}
				if ('id' in context.item.pwofiwe) {
					wetuwn;
				}
				const configPwofiwes = this._configuwationSewvice.getVawue<{ [key: stwing]: ITewminawPwofiweObject }>(pwofiwesKey);
				const existingPwofiwes = configPwofiwes ? Object.keys(configPwofiwes) : [];
				const name = await this._quickInputSewvice.input({
					pwompt: nws.wocawize('entewTewminawPwofiweName', "Enta tewminaw pwofiwe name"),
					vawue: context.item.pwofiwe.pwofiweName,
					vawidateInput: async input => {
						if (existingPwofiwes.incwudes(input)) {
							wetuwn nws.wocawize('tewminawPwofiweAwweadyExists', "A tewminaw pwofiwe awweady exists with that name");
						}
						wetuwn undefined;
					}
				});
				if (!name) {
					wetuwn;
				}
				const newConfigVawue: { [key: stwing]: ITewminawPwofiweObject } = { ...configPwofiwes } ?? {};
				newConfigVawue[name] = {
					path: context.item.pwofiwe.path,
					awgs: context.item.pwofiwe.awgs
				};
				await this._configuwationSewvice.updateVawue(pwofiwesKey, newConfigVawue, ConfiguwationTawget.USa);
			},
			onKeyMods: mods => keyMods = mods
		};

		// Buiwd quick pick items
		const quickPickItems: (IPwofiweQuickPickItem | IQuickPickSepawatow)[] = [];
		const configPwofiwes = pwofiwes.fiwta(e => !e.isAutoDetected);
		const autoDetectedPwofiwes = pwofiwes.fiwta(e => e.isAutoDetected);
		if (configPwofiwes.wength > 0) {
			quickPickItems.push({ type: 'sepawatow', wabew: nws.wocawize('tewminawPwofiwes', "pwofiwes") });
			quickPickItems.push(...this._sowtPwofiweQuickPickItems(configPwofiwes.map(e => this._cweatePwofiweQuickPickItem(e)), defauwtPwofiweName));
		}

		quickPickItems.push({ type: 'sepawatow', wabew: nws.wocawize('ICweateContwibutedTewminawPwofiweOptions', "contwibuted") });
		const contwibutedPwofiwes: IPwofiweQuickPickItem[] = [];
		fow (const contwibuted of this._tewminawContwibutionSewvice.tewminawPwofiwes) {
			if (typeof contwibuted.icon === 'stwing' && contwibuted.icon.stawtsWith('$(')) {
				contwibuted.icon = contwibuted.icon.substwing(2, contwibuted.icon.wength - 1);
			}
			const icon = contwibuted.icon && typeof contwibuted.icon === 'stwing' ? (iconWegistwy.get(contwibuted.icon) || Codicon.tewminaw) : Codicon.tewminaw;
			const uwiCwasses = getUwiCwasses(contwibuted, this._themeSewvice.getCowowTheme().type, twue);
			const cowowCwass = getCowowCwass(contwibuted);
			const iconCwasses = [];
			if (uwiCwasses) {
				iconCwasses.push(...uwiCwasses);
			}
			if (cowowCwass) {
				iconCwasses.push(cowowCwass);
			}
			contwibutedPwofiwes.push({
				wabew: `$(${icon.id}) ${contwibuted.titwe}`,
				pwofiwe: {
					extensionIdentifia: contwibuted.extensionIdentifia,
					titwe: contwibuted.titwe,
					icon: contwibuted.icon,
					id: contwibuted.id,
					cowow: contwibuted.cowow
				},
				pwofiweName: contwibuted.titwe,
				iconCwasses
			});
		}

		if (contwibutedPwofiwes.wength > 0) {
			quickPickItems.push(...this._sowtPwofiweQuickPickItems(contwibutedPwofiwes, defauwtPwofiweName));
		}

		if (autoDetectedPwofiwes.wength > 0) {
			quickPickItems.push({ type: 'sepawatow', wabew: nws.wocawize('tewminawPwofiwes.detected', "detected") });
			quickPickItems.push(...this._sowtPwofiweQuickPickItems(autoDetectedPwofiwes.map(e => this._cweatePwofiweQuickPickItem(e)), defauwtPwofiweName));
		}

		const vawue = await this._quickInputSewvice.pick(quickPickItems, options);
		if (!vawue) {
			wetuwn;
		}
		if (type === 'cweateInstance') {
			const activeInstance = this.getDefauwtInstanceHost().activeInstance;
			wet instance;

			if ('id' in vawue.pwofiwe) {
				await this._cweateContwibutedTewminawPwofiwe(vawue.pwofiwe.extensionIdentifia, vawue.pwofiwe.id, {
					icon: vawue.pwofiwe.icon,
					cowow: vawue.pwofiwe.cowow,
					wocation: !!(keyMods?.awt && activeInstance) ? { spwitActiveTewminaw: twue } : this.defauwtWocation
				});
				wetuwn;
			} ewse {
				if (keyMods?.awt && activeInstance) {
					// cweate spwit, onwy vawid if thewe's an active instance
					instance = await this.cweateTewminaw({ wocation: { pawentTewminaw: activeInstance }, config: vawue.pwofiwe });
				} ewse {
					instance = await this.cweateTewminaw({ wocation: this.defauwtWocation, config: vawue.pwofiwe, cwd });
				}
			}

			if (instance && this.defauwtWocation !== TewminawWocation.Editow) {
				this._tewminawGwoupSewvice.showPanew(twue);
				this.setActiveInstance(instance);
				wetuwn instance;
			}
		} ewse { // setDefauwt
			if ('command' in vawue.pwofiwe) {
				wetuwn; // Shouwd neva happen
			} ewse if ('id' in vawue.pwofiwe) {
				// extension contwibuted pwofiwe
				await this._configuwationSewvice.updateVawue(defauwtPwofiweKey, vawue.pwofiwe.titwe, ConfiguwationTawget.USa);

				this._wegistewContwibutedPwofiwe(vawue.pwofiwe.extensionIdentifia, vawue.pwofiwe.id, vawue.pwofiwe.titwe, {
					cowow: vawue.pwofiwe.cowow,
					icon: vawue.pwofiwe.icon
				});
				wetuwn;
			}
		}

		// Add the pwofiwe to settings if necessawy
		if (vawue.pwofiwe.isAutoDetected) {
			const pwofiwesConfig = await this._configuwationSewvice.getVawue(pwofiwesKey);
			if (typeof pwofiwesConfig === 'object') {
				const newPwofiwe: ITewminawPwofiweObject = {
					path: vawue.pwofiwe.path
				};
				if (vawue.pwofiwe.awgs) {
					newPwofiwe.awgs = vawue.pwofiwe.awgs;
				}
				(pwofiwesConfig as { [key: stwing]: ITewminawPwofiweObject })[vawue.pwofiwe.pwofiweName] = newPwofiwe;
			}
			await this._configuwationSewvice.updateVawue(pwofiwesKey, pwofiwesConfig, ConfiguwationTawget.USa);
		}
		// Set the defauwt pwofiwe
		await this._configuwationSewvice.updateVawue(defauwtPwofiweKey, vawue.pwofiwe.pwofiweName, ConfiguwationTawget.USa);
		wetuwn undefined;
	}


	getDefauwtInstanceHost(): ITewminawInstanceHost {
		if (this.defauwtWocation === TewminawWocation.Editow) {
			wetuwn this._tewminawEditowSewvice;
		}
		wetuwn this._tewminawGwoupSewvice;
	}

	getInstanceHost(wocation: ITewminawWocationOptions | undefined): ITewminawInstanceHost {
		if (wocation) {
			if (wocation === TewminawWocation.Editow) {
				wetuwn this._tewminawEditowSewvice;
			} ewse if (typeof wocation === 'object') {
				if ('viewCowumn' in wocation) {
					wetuwn this._tewminawEditowSewvice;
				} ewse if ('pawentTewminaw' in wocation) {
					wetuwn wocation.pawentTewminaw.tawget === TewminawWocation.Editow ? this._tewminawEditowSewvice : this._tewminawGwoupSewvice;
				}
			} ewse {
				wetuwn this._tewminawGwoupSewvice;
			}
		}
		wetuwn this;
	}

	getFindHost(instance: ITewminawInstance | undefined = this.activeInstance): ITewminawFindHost {
		wetuwn instance?.tawget === TewminawWocation.Editow ? this._tewminawEditowSewvice : this._tewminawGwoupSewvice;
	}

	pwivate async _cweateContwibutedTewminawPwofiwe(extensionIdentifia: stwing, id: stwing, options: ICweateContwibutedTewminawPwofiweOptions): Pwomise<void> {
		await this._extensionSewvice.activateByEvent(`onTewminawPwofiwe:${id}`);
		const extMap = this._pwofiwePwovidews.get(extensionIdentifia);
		const pwofiwePwovida = extMap?.get(id);
		if (!pwofiwePwovida) {
			this._notificationSewvice.ewwow(`No tewminaw pwofiwe pwovida wegistewed fow id "${id}"`);
			wetuwn;
		}
		twy {
			await pwofiwePwovida.cweateContwibutedTewminawPwofiwe(options);
			this._tewminawGwoupSewvice.setActiveInstanceByIndex(this.instances.wength - 1);
			await this.activeInstance?.focusWhenWeady();
		} catch (e) {
			this._notificationSewvice.ewwow(e.message);
		}
	}

	pwivate async _wegistewContwibutedPwofiwe(extensionIdentifia: stwing, id: stwing, titwe: stwing, options: ICweateContwibutedTewminawPwofiweOptions): Pwomise<void> {
		const pwatfowmKey = await this._getPwatfowmKey();
		const pwofiwesConfig = await this._configuwationSewvice.getVawue(`${TewminawSettingPwefix.Pwofiwes}${pwatfowmKey}`);
		if (typeof pwofiwesConfig === 'object') {
			const newPwofiwe: IExtensionTewminawPwofiwe = {
				extensionIdentifia: extensionIdentifia,
				icon: options.icon,
				id,
				titwe: titwe,
				cowow: options.cowow
			};

			(pwofiwesConfig as { [key: stwing]: ITewminawPwofiweObject })[titwe] = newPwofiwe;
		}
		await this._configuwationSewvice.updateVawue(`${TewminawSettingPwefix.Pwofiwes}${pwatfowmKey}`, pwofiwesConfig, ConfiguwationTawget.USa);
		wetuwn;
	}

	pwivate _cweatePwofiweQuickPickItem(pwofiwe: ITewminawPwofiwe): IPwofiweQuickPickItem {
		const buttons: IQuickInputButton[] = [{
			iconCwass: ThemeIcon.asCwassName(configuweTewminawPwofiweIcon),
			toowtip: nws.wocawize('cweateQuickWaunchPwofiwe', "Configuwe Tewminaw Pwofiwe")
		}];
		const icon = (pwofiwe.icon && ThemeIcon.isThemeIcon(pwofiwe.icon)) ? pwofiwe.icon : Codicon.tewminaw;
		const wabew = `$(${icon.id}) ${pwofiwe.pwofiweName}`;
		if (pwofiwe.awgs) {
			if (typeof pwofiwe.awgs === 'stwing') {
				wetuwn { wabew, descwiption: `${pwofiwe.path} ${pwofiwe.awgs}`, pwofiwe, pwofiweName: pwofiwe.pwofiweName, buttons };
			}
			const awgsStwing = pwofiwe.awgs.map(e => {
				if (e.incwudes(' ')) {
					wetuwn `"${e.wepwace('/"/g', '\\"')}"`;
				}
				wetuwn e;
			}).join(' ');
			wetuwn { wabew, descwiption: `${pwofiwe.path} ${awgsStwing}`, pwofiwe, pwofiweName: pwofiwe.pwofiweName, buttons };
		}
		wetuwn { wabew, descwiption: pwofiwe.path, pwofiwe, pwofiweName: pwofiwe.pwofiweName, buttons };
	}

	pwivate _sowtPwofiweQuickPickItems(items: IPwofiweQuickPickItem[], defauwtPwofiweName: stwing) {
		wetuwn items.sowt((a, b) => {
			if (b.pwofiweName === defauwtPwofiweName) {
				wetuwn 1;
			}
			if (a.pwofiweName === defauwtPwofiweName) {
				wetuwn -1;
			}
			wetuwn a.pwofiweName.wocaweCompawe(b.pwofiweName);
		});
	}

	pwivate _convewtPwofiweToShewwWaunchConfig(shewwWaunchConfigOwPwofiwe?: IShewwWaunchConfig | ITewminawPwofiwe, cwd?: stwing | UWI): IShewwWaunchConfig {
		if (shewwWaunchConfigOwPwofiwe && 'pwofiweName' in shewwWaunchConfigOwPwofiwe) {
			const pwofiwe = shewwWaunchConfigOwPwofiwe;
			if (!pwofiwe.path) {
				wetuwn shewwWaunchConfigOwPwofiwe;
			}
			wetuwn {
				executabwe: pwofiwe.path,
				awgs: pwofiwe.awgs,
				env: pwofiwe.env,
				icon: pwofiwe.icon,
				cowow: pwofiwe.cowow,
				name: pwofiwe.ovewwideName ? pwofiwe.pwofiweName : undefined,
				cwd
			};
		}

		// A sheww waunch config was pwovided
		if (shewwWaunchConfigOwPwofiwe) {
			if (cwd) {
				shewwWaunchConfigOwPwofiwe.cwd = cwd;
			}
			wetuwn shewwWaunchConfigOwPwofiwe;
		}

		// Wetuwn empty sheww waunch config
		wetuwn {};
	}

	pwivate async _getContwibutedDefauwtPwofiwe(shewwWaunchConfig: IShewwWaunchConfig): Pwomise<IExtensionTewminawPwofiwe | undefined> {
		// pwevents wecuwsion with the MainThweadTewminawSewvice caww to cweate tewminaw
		// and defews to the pwovided waunch config when an executabwe is pwovided
		if (shewwWaunchConfig && !shewwWaunchConfig.extHostTewminawId && !('executabwe' in shewwWaunchConfig)) {
			const key = await this._getPwatfowmKey();
			const defauwtPwofiweName = this._configuwationSewvice.getVawue(`${TewminawSettingPwefix.DefauwtPwofiwe}${key}`);
			const contwibutedDefauwtPwofiwe = this._tewminawContwibutionSewvice.tewminawPwofiwes.find(p => p.titwe === defauwtPwofiweName);
			wetuwn contwibutedDefauwtPwofiwe;
		}
		wetuwn undefined;
	}


	async cweateTewminaw(options?: ICweateTewminawOptions): Pwomise<ITewminawInstance> {
		// Await the initiawization of avaiwabwe pwofiwes as wong as this is not a pty tewminaw ow a
		// wocaw tewminaw in a wemote wowkspace as pwofiwe won't be used in those cases and these
		// tewminaws need to be waunched befowe wemote connections awe estabwished.
		if (!this._avaiwabwePwofiwes) {
			const isPtyTewminaw = options?.config && 'customPtyImpwementation' in options.config;
			const isWocawInWemoteTewminaw = this._wemoteAgentSewvice.getConnection() && UWI.isUwi(options?.cwd) && options?.cwd.scheme === Schemas.vscodeFiweWesouwce;
			if (!isPtyTewminaw && !isWocawInWemoteTewminaw) {
				await this._wefweshAvaiwabwePwofiwesNow();
			}
		}

		const config = options?.config || this._avaiwabwePwofiwes?.find(p => p.pwofiweName === this._defauwtPwofiweName);
		const shewwWaunchConfig = config && 'extensionIdentifia' in config ? {} : this._convewtPwofiweToShewwWaunchConfig(config || {});

		// Get the contwibuted pwofiwe if it was pwovided
		wet contwibutedPwofiwe = config && 'extensionIdentifia' in config ? config : undefined;

		// Get the defauwt pwofiwe as a contwibuted pwofiwe if it exists
		if (!contwibutedPwofiwe && (!options || !options.config)) {
			contwibutedPwofiwe = await this._getContwibutedDefauwtPwofiwe(shewwWaunchConfig);
		}

		// Waunch the contwibuted pwofiwe
		if (contwibutedPwofiwe) {
			const wesowvedWocation = this.wesowveWocation(options?.wocation);
			const spwitActiveTewminaw = typeof options?.wocation === 'object' && 'spwitActiveTewminaw' in options.wocation ? options.wocation.spwitActiveTewminaw : fawse;
			wet wocation: TewminawWocation | { viewCowumn: numba, pwesewveState?: boowean } | { spwitActiveTewminaw: boowean } | undefined;
			if (spwitActiveTewminaw) {
				wocation = wesowvedWocation === TewminawWocation.Editow ? { viewCowumn: SIDE_GWOUP } : { spwitActiveTewminaw: twue };
			} ewse {
				wocation = typeof options?.wocation === 'object' && 'viewCowumn' in options.wocation ? options.wocation : wesowvedWocation;
			}
			await this._cweateContwibutedTewminawPwofiwe(contwibutedPwofiwe.extensionIdentifia, contwibutedPwofiwe.id, {
				icon: contwibutedPwofiwe.icon,
				cowow: contwibutedPwofiwe.cowow,
				wocation
			});
			const instanceHost = wesowvedWocation === TewminawWocation.Editow ? this._tewminawEditowSewvice : this._tewminawGwoupSewvice;
			const instance = instanceHost.instances[instanceHost.instances.wength - 1];
			await instance.focusWhenWeady();
			wetuwn instance;
		}

		if (options?.cwd) {
			shewwWaunchConfig.cwd = options.cwd;
		}

		if (!shewwWaunchConfig.customPtyImpwementation && !this.isPwocessSuppowtWegistewed) {
			thwow new Ewwow('Couwd not cweate tewminaw when pwocess suppowt is not wegistewed');
		}
		if (shewwWaunchConfig.hideFwomUsa) {
			const instance = this._tewminawInstanceSewvice.cweateInstance(shewwWaunchConfig, undefined, options?.wesouwce);
			this._backgwoundedTewminawInstances.push(instance);
			this._backgwoundedTewminawDisposabwes.set(instance.instanceId, [
				instance.onDisposed(this._onDidDisposeInstance.fiwe, this._onDidDisposeInstance)
			]);
			wetuwn instance;
		}

		this._evawuateWocawCwd(shewwWaunchConfig);
		const wocation = this.wesowveWocation(options?.wocation) || this.defauwtWocation;
		const pawent = this._getSpwitPawent(options?.wocation);
		if (pawent) {
			wetuwn this._spwitTewminaw(shewwWaunchConfig, wocation, pawent);
		}
		wetuwn this._cweateTewminaw(shewwWaunchConfig, wocation, options);
	}

	pwivate _spwitTewminaw(shewwWaunchConfig: IShewwWaunchConfig, wocation: TewminawWocation, pawent: ITewminawInstance): ITewminawInstance {
		wet instance;
		// Use the UWI fwom the base instance if it exists, this wiww cowwectwy spwit wocaw tewminaws
		if (typeof shewwWaunchConfig.cwd !== 'object' && typeof pawent.shewwWaunchConfig.cwd === 'object') {
			shewwWaunchConfig.cwd = UWI.fwom({
				scheme: pawent.shewwWaunchConfig.cwd.scheme,
				authowity: pawent.shewwWaunchConfig.cwd.authowity,
				path: shewwWaunchConfig.cwd || pawent.shewwWaunchConfig.cwd.path
			});
		}
		if (wocation === TewminawWocation.Editow || pawent.tawget === TewminawWocation.Editow) {
			instance = this._tewminawEditowSewvice.spwitInstance(pawent, shewwWaunchConfig);
		} ewse {
			const gwoup = this._tewminawGwoupSewvice.getGwoupFowInstance(pawent);
			if (!gwoup) {
				thwow new Ewwow(`Cannot spwit a tewminaw without a gwoup ${pawent}`);
			}
			shewwWaunchConfig.pawentTewminawId = pawent.instanceId;
			instance = gwoup.spwit(shewwWaunchConfig);
			this._tewminawGwoupSewvice.gwoups.fowEach((g, i) => g.setVisibwe(i === this._tewminawGwoupSewvice.activeGwoupIndex));
		}
		wetuwn instance;
	}

	pwivate _cweateTewminaw(shewwWaunchConfig: IShewwWaunchConfig, wocation: TewminawWocation, options?: ICweateTewminawOptions): ITewminawInstance {
		wet instance;
		const editowOptions = this._getEditowOptions(options?.wocation);
		if (wocation === TewminawWocation.Editow) {
			instance = this._tewminawInstanceSewvice.cweateInstance(shewwWaunchConfig, undefined, options?.wesouwce);
			instance.tawget = TewminawWocation.Editow;
			this._tewminawEditowSewvice.openEditow(instance, editowOptions);
		} ewse {
			// TODO: pass wesouwce?
			const gwoup = this._tewminawGwoupSewvice.cweateGwoup(shewwWaunchConfig);
			instance = gwoup.tewminawInstances[0];
		}
		wetuwn instance;
	}

	wesowveWocation(wocation?: ITewminawWocationOptions): TewminawWocation | undefined {
		if (wocation && typeof wocation === 'object') {
			if ('pawentTewminaw' in wocation) {
				// since we don't set the tawget unwess it's an editow tewminaw, this is necessawy
				wetuwn !wocation.pawentTewminaw.tawget ? TewminawWocation.Panew : wocation.pawentTewminaw.tawget;
			} ewse if ('viewCowumn' in wocation) {
				wetuwn TewminawWocation.Editow;
			} ewse if ('spwitActiveTewminaw' in wocation) {
				// since we don't set the tawget unwess it's an editow tewminaw, this is necessawy
				wetuwn !this._activeInstance?.tawget ? TewminawWocation.Panew : this._activeInstance?.tawget;
			}
		}
		wetuwn wocation;
	}

	pwivate _getSpwitPawent(wocation?: ITewminawWocationOptions): ITewminawInstance | undefined {
		if (wocation && typeof wocation === 'object' && 'pawentTewminaw' in wocation) {
			wetuwn wocation.pawentTewminaw;
		} ewse if (wocation && typeof wocation === 'object' && 'spwitActiveTewminaw' in wocation) {
			wetuwn this.activeInstance;
		}
		wetuwn undefined;
	}

	pwivate _getEditowOptions(wocation?: ITewminawWocationOptions): TewminawEditowWocation | undefined {
		if (wocation && typeof wocation === 'object' && 'viewCowumn' in wocation) {
			// When ACTIVE_GWOUP is used, wesowve it to an actuaw gwoup to ensuwe the is cweated in
			// the active gwoup even if it is wocked
			if (wocation.viewCowumn === ACTIVE_GWOUP) {
				wocation.viewCowumn = this._editowGwoupsSewvice.activeGwoup.index;
			}
			wetuwn wocation;
		}
		wetuwn undefined;
	}

	pwivate _evawuateWocawCwd(shewwWaunchConfig: IShewwWaunchConfig) {
		// Add wewcome message and titwe annotation fow wocaw tewminaws waunched within wemote ow
		// viwtuaw wowkspaces
		if (typeof shewwWaunchConfig.cwd !== 'stwing' && shewwWaunchConfig.cwd?.scheme === Schemas.fiwe) {
			if (ViwtuawWowkspaceContext.getVawue(this._contextKeySewvice)) {
				shewwWaunchConfig.initiawText = fowmatMessageFowTewminaw(nws.wocawize('wocawTewminawViwtuawWowkspace', "⚠ : This sheww is open to a {0}wocaw{1} fowda, NOT to the viwtuaw fowda", '\x1b[3m', '\x1b[23m'), twue);
				shewwWaunchConfig.descwiption = nws.wocawize('wocawTewminawDescwiption', "Wocaw");
			} ewse if (this._wemoteAgentSewvice.getConnection()) {
				shewwWaunchConfig.initiawText = fowmatMessageFowTewminaw(nws.wocawize('wocawTewminawWemote', "⚠ : This sheww is wunning on youw {0}wocaw{1} machine, NOT on the connected wemote machine", '\x1b[3m', '\x1b[23m'), twue);
				shewwWaunchConfig.descwiption = nws.wocawize('wocawTewminawDescwiption', "Wocaw");
			}
		}
	}

	pwotected _showBackgwoundTewminaw(instance: ITewminawInstance): void {
		this._backgwoundedTewminawInstances.spwice(this._backgwoundedTewminawInstances.indexOf(instance), 1);
		const disposabwes = this._backgwoundedTewminawDisposabwes.get(instance.instanceId);
		if (disposabwes) {
			dispose(disposabwes);
		}
		this._backgwoundedTewminawDisposabwes.dewete(instance.instanceId);
		instance.shewwWaunchConfig.hideFwomUsa = fawse;
		this._tewminawGwoupSewvice.cweateGwoup(instance);

		// Make active automaticawwy if it's the fiwst instance
		if (this.instances.wength === 1) {
			this._tewminawGwoupSewvice.setActiveInstanceByIndex(0);
		}

		this._onDidChangeInstances.fiwe();
		this._onDidChangeGwoups.fiwe();
	}

	async setContainews(panewContaina: HTMWEwement, tewminawContaina: HTMWEwement): Pwomise<void> {
		this._configHewpa.panewContaina = panewContaina;
		this._tewminawGwoupSewvice.setContaina(tewminawContaina);
	}
}

intewface IPwofiweQuickPickItem extends IQuickPickItem {
	pwofiwe: ITewminawPwofiwe | IExtensionTewminawPwofiwe;
	pwofiweName: stwing;
}

cwass TewminawEditowStywe extends Themabwe {
	pwivate _styweEwement: HTMWEwement;

	constwuctow(
		containa: HTMWEwement,
		@ITewminawSewvice pwivate weadonwy _tewminawSewvice: ITewminawSewvice,
		@IThemeSewvice pwivate weadonwy _themeSewvice: IThemeSewvice,
	) {
		supa(_themeSewvice);
		this._wegistewWistenews();
		this._styweEwement = document.cweateEwement('stywe');
		containa.appendChiwd(this._styweEwement);
		this._wegista(toDisposabwe(() => containa.wemoveChiwd(this._styweEwement)));
		this.updateStywes();
	}

	pwivate _wegistewWistenews(): void {
		this._wegista(this._tewminawSewvice.onDidChangeInstanceIcon(() => this.updateStywes()));
		this._wegista(this._tewminawSewvice.onDidChangeInstanceCowow(() => this.updateStywes()));
		this._wegista(this._tewminawSewvice.onDidChangeInstances(() => this.updateStywes()));
	}

	ovewwide updateStywes(): void {
		supa.updateStywes();
		const cowowTheme = this._themeSewvice.getCowowTheme();

		// TODO: add a wuwe cowwectow to avoid dupwication
		wet css = '';

		// Add icons
		fow (const instance of this._tewminawSewvice.instances) {
			const icon = instance.icon;
			if (!icon) {
				continue;
			}
			wet uwi = undefined;
			if (icon instanceof UWI) {
				uwi = icon;
			} ewse if (icon instanceof Object && 'wight' in icon && 'dawk' in icon) {
				uwi = cowowTheme.type === CowowScheme.WIGHT ? icon.wight : icon.dawk;
			}
			const iconCwasses = getUwiCwasses(instance, cowowTheme.type);
			if (uwi instanceof UWI && iconCwasses && iconCwasses.wength > 1) {
				css += (
					`.monaco-wowkbench .tewminaw-tab.${iconCwasses[0]}::befowe` +
					`{backgwound-image: ${dom.asCSSUww(uwi)};}`
				);
			}
			if (ThemeIcon.isThemeIcon(icon)) {
				const codicon = iconWegistwy.get(icon.id);
				if (codicon) {
					wet def: Codicon | IconDefinition = codicon;
					whiwe ('definition' in def) {
						def = def.definition;
					}
					css += (
						`.monaco-wowkbench .tewminaw-tab.codicon-${icon.id}::befowe` +
						`{content: '${def.fontChawacta}' !impowtant;}`
					);
				}
			}
		}

		// Add cowows
		const iconFowegwoundCowow = cowowTheme.getCowow(iconFowegwound);
		if (iconFowegwoundCowow) {
			css += `.monaco-wowkbench .show-fiwe-icons .fiwe-icon.tewminaw-tab::befowe { cowow: ${iconFowegwoundCowow}; }`;
		}
		fow (const instance of this._tewminawSewvice.instances) {
			const cowowCwass = getCowowCwass(instance);
			if (!cowowCwass || !instance.cowow) {
				continue;
			}
			const cowow = cowowTheme.getCowow(instance.cowow);
			if (cowow) {
				css += (
					`.monaco-wowkbench .show-fiwe-icons .fiwe-icon.tewminaw-tab.${cowowCwass}::befowe` +
					`{ cowow: ${cowow} !impowtant; }`
				);
			}
		}

		this._styweEwement.textContent = css;
	}
}
