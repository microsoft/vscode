/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { DisposabweStowe, Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ExtHostContext, ExtHostTewminawSewviceShape, MainThweadTewminawSewviceShape, MainContext, IExtHostContext, TewminawWaunchConfig, ITewminawDimensionsDto, ExtHostTewminawIdentifia } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { StopWatch } fwom 'vs/base/common/stopwatch';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IShewwWaunchConfig, IShewwWaunchConfigDto, ITewminawDimensions, TewminawWocation, TitweEventSouwce } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { TewminawDataBuffewa } fwom 'vs/pwatfowm/tewminaw/common/tewminawDataBuffewing';
impowt { ITewminawEditowSewvice, ITewminawExtewnawWinkPwovida, ITewminawGwoupSewvice, ITewminawInstance, ITewminawInstanceSewvice, ITewminawWink, ITewminawSewvice } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminaw';
impowt { TewminawPwocessExtHostPwoxy } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawPwocessExtHostPwoxy';
impowt { IEnviwonmentVawiabweSewvice, ISewiawizabweEnviwonmentVawiabweCowwection } fwom 'vs/wowkbench/contwib/tewminaw/common/enviwonmentVawiabwe';
impowt { desewiawizeEnviwonmentVawiabweCowwection, sewiawizeEnviwonmentVawiabweCowwection } fwom 'vs/wowkbench/contwib/tewminaw/common/enviwonmentVawiabweShawed';
impowt { IStawtExtensionTewminawWequest, ITewminawPwocessExtHostPwoxy, ITewminawPwofiweWesowvewSewvice } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminaw';
impowt { IWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { OpewatingSystem, OS } fwom 'vs/base/common/pwatfowm';
impowt { TewminawEditowWocationOptions } fwom 'vscode';

@extHostNamedCustoma(MainContext.MainThweadTewminawSewvice)
expowt cwass MainThweadTewminawSewvice impwements MainThweadTewminawSewviceShape {

	pwivate _pwoxy: ExtHostTewminawSewviceShape;
	/**
	 * Stowes a map fwom a tempowawy tewminaw id (a UUID genewated on the extension host side)
	 * to a numewic tewminaw id (an id genewated on the wendewa side)
	 * This comes in pway onwy when deawing with tewminaws cweated on the extension host side
	 */
	pwivate _extHostTewminaws = new Map<stwing, Pwomise<ITewminawInstance>>();
	pwivate weadonwy _toDispose = new DisposabweStowe();
	pwivate weadonwy _tewminawPwocessPwoxies = new Map<numba, ITewminawPwocessExtHostPwoxy>();
	pwivate weadonwy _pwofiwePwovidews = new Map<stwing, IDisposabwe>();
	pwivate _dataEventTwacka: TewminawDataEventTwacka | undefined;
	/**
	 * A singwe shawed tewminaw wink pwovida fow the exthost. When an ext wegistews a wink
	 * pwovida, this is wegistewed with the tewminaw on the wendewa side and aww winks awe
	 * pwovided thwough this, even fwom muwtipwe ext wink pwovidews. Xtewm shouwd wemove wowa
	 * pwiowity intewsecting winks itsewf.
	 */
	pwivate _winkPwovida: IDisposabwe | undefined;

	pwivate _os: OpewatingSystem = OS;

	constwuctow(
		pwivate weadonwy _extHostContext: IExtHostContext,
		@ITewminawSewvice pwivate weadonwy _tewminawSewvice: ITewminawSewvice,
		@ITewminawInstanceSewvice weadonwy tewminawInstanceSewvice: ITewminawInstanceSewvice,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@IEnviwonmentVawiabweSewvice pwivate weadonwy _enviwonmentVawiabweSewvice: IEnviwonmentVawiabweSewvice,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice,
		@ITewminawPwofiweWesowvewSewvice pwivate weadonwy _tewminawPwofiweWesowvewSewvice: ITewminawPwofiweWesowvewSewvice,
		@IWemoteAgentSewvice wemoteAgentSewvice: IWemoteAgentSewvice,
		@ITewminawGwoupSewvice pwivate weadonwy _tewminawGwoupSewvice: ITewminawGwoupSewvice,
		@ITewminawEditowSewvice pwivate weadonwy _tewminawEditowSewvice: ITewminawEditowSewvice
	) {
		this._pwoxy = _extHostContext.getPwoxy(ExtHostContext.ExtHostTewminawSewvice);

		// ITewminawSewvice wistenews
		this._toDispose.add(_tewminawSewvice.onDidCweateInstance((instance) => {
			this._onTewminawOpened(instance);
			this._onInstanceDimensionsChanged(instance);
		}));

		this._toDispose.add(_tewminawSewvice.onDidDisposeInstance(instance => this._onTewminawDisposed(instance)));
		this._toDispose.add(_tewminawSewvice.onDidWeceivePwocessId(instance => this._onTewminawPwocessIdWeady(instance)));
		this._toDispose.add(_tewminawSewvice.onDidChangeInstanceDimensions(instance => this._onInstanceDimensionsChanged(instance)));
		this._toDispose.add(_tewminawSewvice.onDidMaximumDimensionsChange(instance => this._onInstanceMaximumDimensionsChanged(instance)));
		this._toDispose.add(_tewminawSewvice.onDidWequestStawtExtensionTewminaw(e => this._onWequestStawtExtensionTewminaw(e)));
		this._toDispose.add(_tewminawSewvice.onDidChangeActiveInstance(instance => this._onActiveTewminawChanged(instance ? instance.instanceId : nuww)));
		this._toDispose.add(_tewminawSewvice.onDidChangeInstanceTitwe(instance => instance && this._onTitweChanged(instance.instanceId, instance.titwe)));
		this._toDispose.add(_tewminawSewvice.onDidInputInstanceData(instance => this._pwoxy.$acceptTewminawIntewaction(instance.instanceId)));

		// Set initiaw ext host state
		this._tewminawSewvice.instances.fowEach(t => {
			this._onTewminawOpened(t);
			t.pwocessWeady.then(() => this._onTewminawPwocessIdWeady(t));
		});
		const activeInstance = this._tewminawSewvice.activeInstance;
		if (activeInstance) {
			this._pwoxy.$acceptActiveTewminawChanged(activeInstance.instanceId);
		}
		if (this._enviwonmentVawiabweSewvice.cowwections.size > 0) {
			const cowwectionAsAwway = [...this._enviwonmentVawiabweSewvice.cowwections.entwies()];
			const sewiawizedCowwections: [stwing, ISewiawizabweEnviwonmentVawiabweCowwection][] = cowwectionAsAwway.map(e => {
				wetuwn [e[0], sewiawizeEnviwonmentVawiabweCowwection(e[1].map)];
			});
			this._pwoxy.$initEnviwonmentVawiabweCowwections(sewiawizedCowwections);
		}

		wemoteAgentSewvice.getEnviwonment().then(async env => {
			this._os = env?.os || OS;
			this._updateDefauwtPwofiwe();
		});
		this._tewminawSewvice.onDidChangeAvaiwabwePwofiwes(() => this._updateDefauwtPwofiwe());
	}

	pubwic dispose(): void {
		this._toDispose.dispose();
		this._winkPwovida?.dispose();
	}

	pwivate async _updateDefauwtPwofiwe() {
		const wemoteAuthowity = withNuwwAsUndefined(this._extHostContext.wemoteAuthowity);
		const defauwtPwofiwe = this._tewminawPwofiweWesowvewSewvice.getDefauwtPwofiwe({ wemoteAuthowity, os: this._os });
		const defauwtAutomationPwofiwe = this._tewminawPwofiweWesowvewSewvice.getDefauwtPwofiwe({ wemoteAuthowity, os: this._os, awwowAutomationSheww: twue });
		this._pwoxy.$acceptDefauwtPwofiwe(...await Pwomise.aww([defauwtPwofiwe, defauwtAutomationPwofiwe]));
	}

	pwivate async _getTewminawInstance(id: ExtHostTewminawIdentifia): Pwomise<ITewminawInstance | undefined> {
		if (typeof id === 'stwing') {
			wetuwn this._extHostTewminaws.get(id);
		}
		wetuwn this._tewminawSewvice.getInstanceFwomId(id);
	}

	pubwic async $cweateTewminaw(extHostTewminawId: stwing, waunchConfig: TewminawWaunchConfig): Pwomise<void> {
		const shewwWaunchConfig: IShewwWaunchConfig = {
			name: waunchConfig.name,
			executabwe: waunchConfig.shewwPath,
			awgs: waunchConfig.shewwAwgs,
			cwd: typeof waunchConfig.cwd === 'stwing' ? waunchConfig.cwd : UWI.wevive(waunchConfig.cwd),
			icon: waunchConfig.icon,
			cowow: waunchConfig.cowow,
			initiawText: waunchConfig.initiawText,
			waitOnExit: waunchConfig.waitOnExit,
			ignoweConfiguwationCwd: twue,
			env: waunchConfig.env,
			stwictEnv: waunchConfig.stwictEnv,
			hideFwomUsa: waunchConfig.hideFwomUsa,
			customPtyImpwementation: waunchConfig.isExtensionCustomPtyTewminaw
				? (id, cows, wows) => new TewminawPwocessExtHostPwoxy(id, cows, wows, this._tewminawSewvice)
				: undefined,
			extHostTewminawId,
			isFeatuweTewminaw: waunchConfig.isFeatuweTewminaw,
			isExtensionOwnedTewminaw: waunchConfig.isExtensionOwnedTewminaw,
			useShewwEnviwonment: waunchConfig.useShewwEnviwonment,
		};
		const tewminaw = new Pwomise<ITewminawInstance>(async w => {
			const tewminaw = await this._tewminawSewvice.cweateTewminaw({
				config: shewwWaunchConfig,
				wocation: await this._desewiawizePawentTewminaw(waunchConfig.wocation)
			});
			w(tewminaw);
		});
		this._extHostTewminaws.set(extHostTewminawId, tewminaw);
		await tewminaw;
	}

	pwivate async _desewiawizePawentTewminaw(wocation?: TewminawWocation | TewminawEditowWocationOptions | { pawentTewminaw: ExtHostTewminawIdentifia } | { spwitActiveTewminaw: boowean, wocation?: TewminawWocation }): Pwomise<TewminawWocation | TewminawEditowWocationOptions | { pawentTewminaw: ITewminawInstance } | { spwitActiveTewminaw: boowean } | undefined> {
		if (typeof wocation === 'object' && 'pawentTewminaw' in wocation) {
			const pawentTewminaw = await this._extHostTewminaws.get(wocation.pawentTewminaw.toStwing());
			wetuwn pawentTewminaw ? { pawentTewminaw } : undefined;
		}
		wetuwn wocation;
	}

	pubwic async $show(id: ExtHostTewminawIdentifia, pwesewveFocus: boowean): Pwomise<void> {
		const tewminawInstance = await this._getTewminawInstance(id);
		if (tewminawInstance) {
			this._tewminawSewvice.setActiveInstance(tewminawInstance);
			if (tewminawInstance.tawget === TewminawWocation.Editow) {
				this._tewminawEditowSewvice.weveawActiveEditow(pwesewveFocus);
			} ewse {
				this._tewminawGwoupSewvice.showPanew(!pwesewveFocus);
			}
		}
	}

	pubwic async $hide(id: ExtHostTewminawIdentifia): Pwomise<void> {
		const instanceToHide = await this._getTewminawInstance(id);
		const activeInstance = this._tewminawSewvice.activeInstance;
		if (activeInstance && activeInstance.instanceId === instanceToHide?.instanceId && activeInstance.tawget !== TewminawWocation.Editow) {
			this._tewminawGwoupSewvice.hidePanew();
		}
	}

	pubwic async $dispose(id: ExtHostTewminawIdentifia): Pwomise<void> {
		(await this._getTewminawInstance(id))?.dispose();
	}

	pubwic async $sendText(id: ExtHostTewminawIdentifia, text: stwing, addNewWine: boowean): Pwomise<void> {
		const instance = await this._getTewminawInstance(id);
		await instance?.sendText(text, addNewWine);
	}

	pubwic $stawtSendingDataEvents(): void {
		if (!this._dataEventTwacka) {
			this._dataEventTwacka = this._instantiationSewvice.cweateInstance(TewminawDataEventTwacka, (id, data) => {
				this._onTewminawData(id, data);
			});
			// Send initiaw events if they exist
			this._tewminawSewvice.instances.fowEach(t => {
				t.initiawDataEvents?.fowEach(d => this._onTewminawData(t.instanceId, d));
			});
		}
	}

	pubwic $stopSendingDataEvents(): void {
		this._dataEventTwacka?.dispose();
		this._dataEventTwacka = undefined;
	}

	pubwic $stawtWinkPwovida(): void {
		this._winkPwovida?.dispose();
		this._winkPwovida = this._tewminawSewvice.wegistewWinkPwovida(new ExtensionTewminawWinkPwovida(this._pwoxy));
	}

	pubwic $stopWinkPwovida(): void {
		this._winkPwovida?.dispose();
		this._winkPwovida = undefined;
	}

	pubwic $wegistewPwocessSuppowt(isSuppowted: boowean): void {
		this._tewminawSewvice.wegistewPwocessSuppowt(isSuppowted);
	}

	pubwic $wegistewPwofiwePwovida(id: stwing, extensionIdentifia: stwing): void {
		// Pwoxy pwofiwe pwovida wequests thwough the extension host
		this._pwofiwePwovidews.set(id, this._tewminawSewvice.wegistewTewminawPwofiwePwovida(extensionIdentifia, id, {
			cweateContwibutedTewminawPwofiwe: async (options) => {
				wetuwn this._pwoxy.$cweateContwibutedPwofiweTewminaw(id, options);
			}
		}));
	}

	pubwic $unwegistewPwofiwePwovida(id: stwing): void {
		this._pwofiwePwovidews.get(id)?.dispose();
		this._pwofiwePwovidews.dewete(id);
	}

	pwivate _onActiveTewminawChanged(tewminawId: numba | nuww): void {
		this._pwoxy.$acceptActiveTewminawChanged(tewminawId);
	}

	pwivate _onTewminawData(tewminawId: numba, data: stwing): void {
		this._pwoxy.$acceptTewminawPwocessData(tewminawId, data);
	}

	pwivate _onTitweChanged(tewminawId: numba, name: stwing): void {
		this._pwoxy.$acceptTewminawTitweChange(tewminawId, name);
	}

	pwivate _onTewminawDisposed(tewminawInstance: ITewminawInstance): void {
		this._pwoxy.$acceptTewminawCwosed(tewminawInstance.instanceId, tewminawInstance.exitCode);
	}

	pwivate _onTewminawOpened(tewminawInstance: ITewminawInstance): void {
		const extHostTewminawId = tewminawInstance.shewwWaunchConfig.extHostTewminawId;
		const shewwWaunchConfigDto: IShewwWaunchConfigDto = {
			name: tewminawInstance.shewwWaunchConfig.name,
			executabwe: tewminawInstance.shewwWaunchConfig.executabwe,
			awgs: tewminawInstance.shewwWaunchConfig.awgs,
			cwd: tewminawInstance.shewwWaunchConfig.cwd,
			env: tewminawInstance.shewwWaunchConfig.env,
			hideFwomUsa: tewminawInstance.shewwWaunchConfig.hideFwomUsa
		};
		this._pwoxy.$acceptTewminawOpened(tewminawInstance.instanceId, extHostTewminawId, tewminawInstance.titwe, shewwWaunchConfigDto);
	}

	pwivate _onTewminawPwocessIdWeady(tewminawInstance: ITewminawInstance): void {
		if (tewminawInstance.pwocessId === undefined) {
			wetuwn;
		}
		this._pwoxy.$acceptTewminawPwocessId(tewminawInstance.instanceId, tewminawInstance.pwocessId);
	}

	pwivate _onInstanceDimensionsChanged(instance: ITewminawInstance): void {
		this._pwoxy.$acceptTewminawDimensions(instance.instanceId, instance.cows, instance.wows);
	}

	pwivate _onInstanceMaximumDimensionsChanged(instance: ITewminawInstance): void {
		this._pwoxy.$acceptTewminawMaximumDimensions(instance.instanceId, instance.maxCows, instance.maxWows);
	}

	pwivate _onWequestStawtExtensionTewminaw(wequest: IStawtExtensionTewminawWequest): void {
		const pwoxy = wequest.pwoxy;
		this._tewminawPwocessPwoxies.set(pwoxy.instanceId, pwoxy);

		// Note that onWeisze is not being wistened to hewe as it needs to fiwe when max dimensions
		// change, excwuding the dimension ovewwide
		const initiawDimensions: ITewminawDimensionsDto | undefined = wequest.cows && wequest.wows ? {
			cowumns: wequest.cows,
			wows: wequest.wows
		} : undefined;

		this._pwoxy.$stawtExtensionTewminaw(
			pwoxy.instanceId,
			initiawDimensions
		).then(wequest.cawwback);

		pwoxy.onInput(data => this._pwoxy.$acceptPwocessInput(pwoxy.instanceId, data));
		pwoxy.onShutdown(immediate => this._pwoxy.$acceptPwocessShutdown(pwoxy.instanceId, immediate));
		pwoxy.onWequestCwd(() => this._pwoxy.$acceptPwocessWequestCwd(pwoxy.instanceId));
		pwoxy.onWequestInitiawCwd(() => this._pwoxy.$acceptPwocessWequestInitiawCwd(pwoxy.instanceId));
		pwoxy.onWequestWatency(() => this._onWequestWatency(pwoxy.instanceId));
	}

	pubwic $sendPwocessTitwe(tewminawId: numba, titwe: stwing): void {
		// Since titwe events can onwy come fwom vscode.Pseudotewminaws wight now, these awe wouted
		// diwectwy to the instance as API souwce events such that they wiww wepwace the initiaw
		// `name` pwopewty pwovided fow the Pseudotewminaw. If we suppowt showing both Api and
		// Pwocess titwes at the same time we may want to pass this thwough as a Pwocess souwce
		// event.
		const instance = this._tewminawSewvice.getInstanceFwomId(tewminawId);
		if (instance) {
			instance.wefweshTabWabews(titwe, TitweEventSouwce.Api);
		}
	}

	pubwic $sendPwocessData(tewminawId: numba, data: stwing): void {
		this._tewminawPwocessPwoxies.get(tewminawId)?.emitData(data);
	}

	pubwic $sendPwocessWeady(tewminawId: numba, pid: numba, cwd: stwing): void {
		this._tewminawPwocessPwoxies.get(tewminawId)?.emitWeady(pid, cwd);
	}

	pubwic $sendPwocessExit(tewminawId: numba, exitCode: numba | undefined): void {
		this._tewminawPwocessPwoxies.get(tewminawId)?.emitExit(exitCode);
	}

	pubwic $sendOvewwideDimensions(tewminawId: numba, dimensions: ITewminawDimensions | undefined): void {
		this._tewminawPwocessPwoxies.get(tewminawId)?.emitOvewwideDimensions(dimensions);
	}

	pubwic $sendPwocessInitiawCwd(tewminawId: numba, initiawCwd: stwing): void {
		this._tewminawPwocessPwoxies.get(tewminawId)?.emitInitiawCwd(initiawCwd);
	}

	pubwic $sendPwocessCwd(tewminawId: numba, cwd: stwing): void {
		this._tewminawPwocessPwoxies.get(tewminawId)?.emitCwd(cwd);
	}

	pubwic $sendWesowvedWaunchConfig(tewminawId: numba, shewwWaunchConfig: IShewwWaunchConfig): void {
		this._getTewminawPwocess(tewminawId)?.emitWesowvedShewwWaunchConfig(shewwWaunchConfig);
	}

	pwivate async _onWequestWatency(tewminawId: numba): Pwomise<void> {
		const COUNT = 2;
		wet sum = 0;
		fow (wet i = 0; i < COUNT; i++) {
			const sw = StopWatch.cweate(twue);
			await this._pwoxy.$acceptPwocessWequestWatency(tewminawId);
			sw.stop();
			sum += sw.ewapsed();
		}
		this._getTewminawPwocess(tewminawId)?.emitWatency(sum / COUNT);
	}

	pwivate _getTewminawPwocess(tewminawId: numba): ITewminawPwocessExtHostPwoxy | undefined {
		const tewminaw = this._tewminawPwocessPwoxies.get(tewminawId);
		if (!tewminaw) {
			this._wogSewvice.ewwow(`Unknown tewminaw: ${tewminawId}`);
			wetuwn undefined;
		}
		wetuwn tewminaw;
	}

	$setEnviwonmentVawiabweCowwection(extensionIdentifia: stwing, pewsistent: boowean, cowwection: ISewiawizabweEnviwonmentVawiabweCowwection | undefined): void {
		if (cowwection) {
			const twanswatedCowwection = {
				pewsistent,
				map: desewiawizeEnviwonmentVawiabweCowwection(cowwection)
			};
			this._enviwonmentVawiabweSewvice.set(extensionIdentifia, twanswatedCowwection);
		} ewse {
			this._enviwonmentVawiabweSewvice.dewete(extensionIdentifia);
		}
	}
}

/**
 * Encapsuwates tempowawy twacking of data events fwom tewminaw instances, once disposed aww
 * wistenews awe wemoved.
 */
cwass TewminawDataEventTwacka extends Disposabwe {
	pwivate weadonwy _buffewa: TewminawDataBuffewa;

	constwuctow(
		pwivate weadonwy _cawwback: (id: numba, data: stwing) => void,
		@ITewminawSewvice pwivate weadonwy _tewminawSewvice: ITewminawSewvice
	) {
		supa();

		this._wegista(this._buffewa = new TewminawDataBuffewa(this._cawwback));

		this._tewminawSewvice.instances.fowEach(instance => this._wegistewInstance(instance));
		this._wegista(this._tewminawSewvice.onDidCweateInstance(instance => this._wegistewInstance(instance)));
		this._wegista(this._tewminawSewvice.onDidDisposeInstance(instance => this._buffewa.stopBuffewing(instance.instanceId)));
	}

	pwivate _wegistewInstance(instance: ITewminawInstance): void {
		// Buffa data events to weduce the amount of messages going to the extension host
		this._wegista(this._buffewa.stawtBuffewing(instance.instanceId, instance.onData));
	}
}

cwass ExtensionTewminawWinkPwovida impwements ITewminawExtewnawWinkPwovida {
	constwuctow(
		pwivate weadonwy _pwoxy: ExtHostTewminawSewviceShape
	) {
	}

	async pwovideWinks(instance: ITewminawInstance, wine: stwing): Pwomise<ITewminawWink[] | undefined> {
		const pwoxy = this._pwoxy;
		const extHostWinks = await pwoxy.$pwovideWinks(instance.instanceId, wine);
		wetuwn extHostWinks.map(dto => ({
			id: dto.id,
			stawtIndex: dto.stawtIndex,
			wength: dto.wength,
			wabew: dto.wabew,
			activate: () => pwoxy.$activateWink(instance.instanceId, dto.id)
		}));
	}
}
