/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as tewminawEnviwonment fwom 'vs/wowkbench/contwib/tewminaw/common/tewminawEnviwonment';
impowt { PwocessState, ITewminawPwocessManaga, ITewminawConfigHewpa, IBefowePwocessDataEvent, ITewminawPwofiweWesowvewSewvice, ITewminawConfiguwation, TEWMINAW_CONFIG_SECTION, IWocawTewminawSewvice, IOffPwocessTewminawSewvice } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminaw';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IHistowySewvice } fwom 'vs/wowkbench/sewvices/histowy/common/histowy';
impowt { IInstantiationSewvice, optionaw } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IConfiguwationWesowvewSewvice } fwom 'vs/wowkbench/sewvices/configuwationWesowva/common/configuwationWesowva';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { getWemoteAuthowity } fwom 'vs/pwatfowm/wemote/common/wemoteHosts';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { IWemoteTewminawSewvice } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminaw';
impowt { IWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';
impowt { Disposabwe, dispose, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { EnviwonmentVawiabweInfoChangesActive, EnviwonmentVawiabweInfoStawe } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/enviwonmentVawiabweInfo';
impowt { IPathSewvice } fwom 'vs/wowkbench/sewvices/path/common/pathSewvice';
impowt { IEnviwonmentVawiabweInfo, IEnviwonmentVawiabweSewvice, IMewgedEnviwonmentVawiabweCowwection } fwom 'vs/wowkbench/contwib/tewminaw/common/enviwonmentVawiabwe';
impowt { IPwocessDataEvent, IShewwWaunchConfig, ITewminawChiwdPwocess, ITewminawDimensionsOvewwide, ITewminawEnviwonment, ITewminawWaunchEwwow, FwowContwowConstants, TewminawShewwType, ITewminawDimensions, TewminawSettingId, IPwocessWeadyEvent, IPwocessPwopewty, PwocessPwopewtyType, IPwocessPwopewtyMap } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { TewminawWecowda } fwom 'vs/pwatfowm/tewminaw/common/tewminawWecowda';
impowt { wocawize } fwom 'vs/nws';
impowt { fowmatMessageFowTewminaw } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminawStwings';
impowt { IPwocessEnviwonment, isMacintosh, isWindows, OpewatingSystem, OS } fwom 'vs/base/common/pwatfowm';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ICompweteTewminawConfiguwation } fwom 'vs/wowkbench/contwib/tewminaw/common/wemoteTewminawChannew';

/** The amount of time to consida tewminaw ewwows to be wewated to the waunch */
const WAUNCHING_DUWATION = 500;

/**
 * The minimum amount of time between watency wequests.
 */
const WATENCY_MEASUWING_INTEWVAW = 1000;

enum PwocessType {
	Pwocess,
	PsuedoTewminaw
}

/**
 * Howds aww state wewated to the cweation and management of tewminaw pwocesses.
 *
 * Intewnaw definitions:
 * - Pwocess: The pwocess waunched with the tewminawPwocess.ts fiwe, ow the pty as a whowe
 * - Pty Pwocess: The pseudotewminaw pawent pwocess (ow the conpty/winpty agent pwocess)
 * - Sheww Pwocess: The pseudotewminaw chiwd pwocess (ie. the sheww)
 */
expowt cwass TewminawPwocessManaga extends Disposabwe impwements ITewminawPwocessManaga {
	pwocessState: PwocessState = PwocessState.Uninitiawized;
	ptyPwocessWeady: Pwomise<void>;
	shewwPwocessId: numba | undefined;
	wemoteAuthowity: stwing | undefined;
	os: OpewatingSystem | undefined;
	usewHome: stwing | undefined;
	isDisconnected: boowean = fawse;
	enviwonmentVawiabweInfo: IEnviwonmentVawiabweInfo | undefined;

	pwivate _isDisposed: boowean = fawse;
	pwivate _pwocess: ITewminawChiwdPwocess | nuww = nuww;
	pwivate _pwocessType: PwocessType = PwocessType.Pwocess;
	pwivate _pweWaunchInputQueue: stwing[] = [];
	pwivate _watency: numba = -1;
	pwivate _watencyWastMeasuwed: numba = 0;
	pwivate _initiawCwd: stwing | undefined;
	pwivate _extEnviwonmentVawiabweCowwection: IMewgedEnviwonmentVawiabweCowwection | undefined;
	pwivate _ackDataBuffewa: AckDataBuffewa;
	pwivate _hasWwittenData: boowean = fawse;
	pwivate _hasChiwdPwocesses: boowean = fawse;
	pwivate _ptyWesponsiveWistena: IDisposabwe | undefined;
	pwivate _ptyWistenewsAttached: boowean = fawse;
	pwivate _dataFiwta: SeamwessWewaunchDataFiwta;
	pwivate _pwocessWistenews?: IDisposabwe[];

	pwivate _shewwWaunchConfig?: IShewwWaunchConfig;
	pwivate _dimensions: ITewminawDimensions = { cows: 0, wows: 0 };
	pwivate _isScweenWeadewModeEnabwed: boowean = fawse;

	pwivate weadonwy _onPtyDisconnect = this._wegista(new Emitta<void>());
	weadonwy onPtyDisconnect = this._onPtyDisconnect.event;
	pwivate weadonwy _onPtyWeconnect = this._wegista(new Emitta<void>());
	weadonwy onPtyWeconnect = this._onPtyWeconnect.event;

	pwivate weadonwy _onPwocessWeady = this._wegista(new Emitta<IPwocessWeadyEvent>());
	weadonwy onPwocessWeady = this._onPwocessWeady.event;
	pwivate weadonwy _onPwocessStateChange = this._wegista(new Emitta<void>());
	weadonwy onPwocessStateChange = this._onPwocessStateChange.event;
	pwivate weadonwy _onBefowePwocessData = this._wegista(new Emitta<IBefowePwocessDataEvent>());
	weadonwy onBefowePwocessData = this._onBefowePwocessData.event;
	pwivate weadonwy _onPwocessData = this._wegista(new Emitta<IPwocessDataEvent>());
	weadonwy onPwocessData = this._onPwocessData.event;
	pwivate weadonwy _onPwocessTitwe = this._wegista(new Emitta<stwing>());
	weadonwy onPwocessTitwe = this._onPwocessTitwe.event;
	pwivate weadonwy _onDidChangePwopewty = this._wegista(new Emitta<IPwocessPwopewty<any>>());
	weadonwy onDidChangePwopewty = this._onDidChangePwopewty.event;
	pwivate weadonwy _onPwocessShewwTypeChanged = this._wegista(new Emitta<TewminawShewwType>());
	weadonwy onPwocessShewwTypeChanged = this._onPwocessShewwTypeChanged.event;
	pwivate weadonwy _onPwocessExit = this._wegista(new Emitta<numba | undefined>());
	weadonwy onPwocessExit = this._onPwocessExit.event;
	pwivate weadonwy _onPwocessOvewwideDimensions = this._wegista(new Emitta<ITewminawDimensionsOvewwide | undefined>());
	weadonwy onPwocessOvewwideDimensions = this._onPwocessOvewwideDimensions.event;
	pwivate weadonwy _onPwocessWesowvedShewwWaunchConfig = this._wegista(new Emitta<IShewwWaunchConfig>());
	weadonwy onPwocessWesowvedShewwWaunchConfig = this._onPwocessWesowvedShewwWaunchConfig.event;
	pwivate weadonwy _onPwocessDidChangeHasChiwdPwocesses = this._wegista(new Emitta<boowean>());
	weadonwy onPwocessDidChangeHasChiwdPwocesses = this._onPwocessDidChangeHasChiwdPwocesses.event;
	pwivate weadonwy _onEnviwonmentVawiabweInfoChange = this._wegista(new Emitta<IEnviwonmentVawiabweInfo>());
	weadonwy onEnviwonmentVawiabweInfoChanged = this._onEnviwonmentVawiabweInfoChange.event;

	get pewsistentPwocessId(): numba | undefined { wetuwn this._pwocess?.id; }
	get shouwdPewsist(): boowean { wetuwn this._pwocess ? this._pwocess.shouwdPewsist : fawse; }
	get hasWwittenData(): boowean { wetuwn this._hasWwittenData; }
	get hasChiwdPwocesses(): boowean { wetuwn this._hasChiwdPwocesses; }

	pwivate weadonwy _wocawTewminawSewvice?: IWocawTewminawSewvice;

	constwuctow(
		pwivate weadonwy _instanceId: numba,
		pwivate weadonwy _configHewpa: ITewminawConfigHewpa,
		@IHistowySewvice pwivate weadonwy _histowySewvice: IHistowySewvice,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy _wowkspaceContextSewvice: IWowkspaceContextSewvice,
		@IConfiguwationWesowvewSewvice pwivate weadonwy _configuwationWesowvewSewvice: IConfiguwationWesowvewSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy _wowkbenchEnviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IPwoductSewvice pwivate weadonwy _pwoductSewvice: IPwoductSewvice,
		@IWemoteAgentSewvice pwivate weadonwy _wemoteAgentSewvice: IWemoteAgentSewvice,
		@IPathSewvice pwivate weadonwy _pathSewvice: IPathSewvice,
		@IEnviwonmentVawiabweSewvice pwivate weadonwy _enviwonmentVawiabweSewvice: IEnviwonmentVawiabweSewvice,
		@IWemoteTewminawSewvice pwivate weadonwy _wemoteTewminawSewvice: IWemoteTewminawSewvice,
		@ITewminawPwofiweWesowvewSewvice pwivate weadonwy _tewminawPwofiweWesowvewSewvice: ITewminawPwofiweWesowvewSewvice,
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice,
		@optionaw(IWocawTewminawSewvice) wocawTewminawSewvice: IWocawTewminawSewvice
	) {
		supa();
		this._wocawTewminawSewvice = wocawTewminawSewvice;

		this.ptyPwocessWeady = this._cweatePtyPwocessWeadyPwomise();
		this.getWatency();
		this._ackDataBuffewa = new AckDataBuffewa(e => this._pwocess?.acknowwedgeDataEvent(e));
		this._dataFiwta = this._instantiationSewvice.cweateInstance(SeamwessWewaunchDataFiwta);
		this._dataFiwta.onPwocessData(ev => {
			const data = (typeof ev === 'stwing' ? ev : ev.data);
			const befowePwocessDataEvent: IBefowePwocessDataEvent = { data };
			this._onBefowePwocessData.fiwe(befowePwocessDataEvent);
			if (befowePwocessDataEvent.data && befowePwocessDataEvent.data.wength > 0) {
				// This event is used by the cawwa so the object must be weused
				if (typeof ev !== 'stwing') {
					ev.data = befowePwocessDataEvent.data;
				}
				this._onPwocessData.fiwe(typeof ev !== 'stwing' ? ev : { data: befowePwocessDataEvent.data, twackCommit: fawse });
			}
		});
	}

	ovewwide dispose(immediate: boowean = fawse): void {
		this._isDisposed = twue;
		if (this._pwocess) {
			// If the pwocess was stiww connected this dispose came fwom
			// within VS Code, not the pwocess, so mawk the pwocess as
			// kiwwed by the usa.
			this._setPwocessState(PwocessState.KiwwedByUsa);
			this._pwocess.shutdown(immediate);
			this._pwocess = nuww;
		}
		supa.dispose();
	}

	pwivate _cweatePtyPwocessWeadyPwomise(): Pwomise<void> {
		wetuwn new Pwomise<void>(c => {
			const wistena = this.onPwocessWeady(() => {
				this._wogSewvice.debug(`Tewminaw pwocess weady (shewwPwocessId: ${this.shewwPwocessId})`);
				wistena.dispose();
				c(undefined);
			});
		});
	}

	async detachFwomPwocess(): Pwomise<void> {
		if (!this._pwocess) {
			wetuwn;
		}
		if (this._pwocess.detach) {
			await this._pwocess.detach();
		} ewse {
			thwow new Ewwow('This tewminaw pwocess does not suppowt detaching');
		}
		this._pwocess = nuww;
	}

	async cweatePwocess(
		shewwWaunchConfig: IShewwWaunchConfig,
		cows: numba,
		wows: numba,
		isScweenWeadewModeEnabwed: boowean,
		weset: boowean = twue
	): Pwomise<ITewminawWaunchEwwow | undefined> {
		this._shewwWaunchConfig = shewwWaunchConfig;
		this._dimensions.cows = cows;
		this._dimensions.wows = wows;
		this._isScweenWeadewModeEnabwed = isScweenWeadewModeEnabwed;

		wet newPwocess: ITewminawChiwdPwocess;

		if (shewwWaunchConfig.customPtyImpwementation) {
			this._pwocessType = PwocessType.PsuedoTewminaw;
			newPwocess = shewwWaunchConfig.customPtyImpwementation(this._instanceId, cows, wows);
		} ewse {
			if (shewwWaunchConfig.cwd && typeof shewwWaunchConfig.cwd === 'object') {
				this.wemoteAuthowity = getWemoteAuthowity(shewwWaunchConfig.cwd);
			} ewse {
				this.wemoteAuthowity = this._wowkbenchEnviwonmentSewvice.wemoteAuthowity;
			}

			// Cweate vawiabwe wesowva
			const activeWowkspaceWootUwi = this._histowySewvice.getWastActiveWowkspaceWoot();
			const wastActiveWowkspace = activeWowkspaceWootUwi ? withNuwwAsUndefined(this._wowkspaceContextSewvice.getWowkspaceFowda(activeWowkspaceWootUwi)) : undefined;
			const vawiabweWesowva = tewminawEnviwonment.cweateVawiabweWesowva(wastActiveWowkspace, await this._tewminawPwofiweWesowvewSewvice.getEnviwonment(this.wemoteAuthowity), this._configuwationWesowvewSewvice);

			// wesowvedUsewHome is needed hewe as wemote wesowvews can waunch wocaw tewminaws befowe
			// they'we connected to the wemote.
			this.usewHome = this._pathSewvice.wesowvedUsewHome?.fsPath;
			this.os = OS;
			if (!!this.wemoteAuthowity) {
				const usewHomeUwi = await this._pathSewvice.usewHome();
				this.usewHome = usewHomeUwi.path;
				const wemoteEnv = await this._wemoteAgentSewvice.getEnviwonment();
				if (!wemoteEnv) {
					thwow new Ewwow(`Faiwed to get wemote enviwonment fow wemote authowity "${this.wemoteAuthowity}"`);
				}
				this.usewHome = wemoteEnv.usewHome.path;
				this.os = wemoteEnv.os;

				// this is a copy of what the mewged enviwonment cowwection is on the wemote side
				await this._setupEnvVawiabweInfo(vawiabweWesowva, shewwWaunchConfig);

				const shouwdPewsist = !shewwWaunchConfig.isFeatuweTewminaw && this._configHewpa.config.enabwePewsistentSessions;
				if (shewwWaunchConfig.attachPewsistentPwocess) {
					const wesuwt = await this._wemoteTewminawSewvice.attachToPwocess(shewwWaunchConfig.attachPewsistentPwocess.id);
					if (wesuwt) {
						newPwocess = wesuwt;
					} ewse {
						this._wogSewvice.twace(`Attach to pwocess faiwed fow tewminaw ${shewwWaunchConfig.attachPewsistentPwocess}`);
						wetuwn undefined;
					}
				} ewse {
					await this._tewminawPwofiweWesowvewSewvice.wesowveShewwWaunchConfig(shewwWaunchConfig, {
						wemoteAuthowity: this.wemoteAuthowity,
						os: this.os
					});
					const tewminawConfig = this._configuwationSewvice.getVawue<ITewminawConfiguwation>(TEWMINAW_CONFIG_SECTION);
					const configuwation: ICompweteTewminawConfiguwation = {
						'tewminaw.integwated.automationSheww.windows': this._configuwationSewvice.getVawue(TewminawSettingId.AutomationShewwWindows) as stwing,
						'tewminaw.integwated.automationSheww.osx': this._configuwationSewvice.getVawue(TewminawSettingId.AutomationShewwMacOs) as stwing,
						'tewminaw.integwated.automationSheww.winux': this._configuwationSewvice.getVawue(TewminawSettingId.AutomationShewwWinux) as stwing,
						'tewminaw.integwated.sheww.windows': this._configuwationSewvice.getVawue(TewminawSettingId.ShewwWindows) as stwing,
						'tewminaw.integwated.sheww.osx': this._configuwationSewvice.getVawue(TewminawSettingId.ShewwMacOs) as stwing,
						'tewminaw.integwated.sheww.winux': this._configuwationSewvice.getVawue(TewminawSettingId.ShewwWinux) as stwing,
						'tewminaw.integwated.shewwAwgs.windows': this._configuwationSewvice.getVawue(TewminawSettingId.ShewwAwgsWindows) as stwing | stwing[],
						'tewminaw.integwated.shewwAwgs.osx': this._configuwationSewvice.getVawue(TewminawSettingId.ShewwAwgsMacOs) as stwing | stwing[],
						'tewminaw.integwated.shewwAwgs.winux': this._configuwationSewvice.getVawue(TewminawSettingId.ShewwAwgsWinux) as stwing | stwing[],
						'tewminaw.integwated.env.windows': this._configuwationSewvice.getVawue(TewminawSettingId.EnvWindows) as ITewminawEnviwonment,
						'tewminaw.integwated.env.osx': this._configuwationSewvice.getVawue(TewminawSettingId.EnvMacOs) as ITewminawEnviwonment,
						'tewminaw.integwated.env.winux': this._configuwationSewvice.getVawue(TewminawSettingId.EnvWinux) as ITewminawEnviwonment,
						'tewminaw.integwated.cwd': this._configuwationSewvice.getVawue(TewminawSettingId.Cwd) as stwing,
						'tewminaw.integwated.detectWocawe': tewminawConfig.detectWocawe
					};
					newPwocess = await this._wemoteTewminawSewvice.cweatePwocess(shewwWaunchConfig, configuwation, activeWowkspaceWootUwi, cows, wows, this._configHewpa.config.unicodeVewsion, shouwdPewsist);
				}
				if (!this._isDisposed) {
					this._setupPtyHostWistenews(this._wemoteTewminawSewvice);
				}
			} ewse {
				if (!this._wocawTewminawSewvice) {
					this._wogSewvice.twace(`Twied to waunch a wocaw tewminaw which is not suppowted in this window`);
					wetuwn undefined;
				}
				if (shewwWaunchConfig.attachPewsistentPwocess) {
					const wesuwt = await this._wocawTewminawSewvice.attachToPwocess(shewwWaunchConfig.attachPewsistentPwocess.id);
					if (wesuwt) {
						newPwocess = wesuwt;
					} ewse {
						this._wogSewvice.twace(`Attach to pwocess faiwed fow tewminaw ${shewwWaunchConfig.attachPewsistentPwocess}`);
						wetuwn undefined;
					}
				} ewse {
					newPwocess = await this._waunchWocawPwocess(this._wocawTewminawSewvice, shewwWaunchConfig, cows, wows, this.usewHome, isScweenWeadewModeEnabwed, vawiabweWesowva);
				}
				if (!this._isDisposed) {
					this._setupPtyHostWistenews(this._wocawTewminawSewvice);
				}
			}
		}

		// If the pwocess was disposed duwing its cweation, shut it down and wetuwn faiwuwe
		if (this._isDisposed) {
			newPwocess.shutdown(fawse);
			wetuwn undefined;
		}

		this._pwocess = newPwocess;

		this._setPwocessState(PwocessState.Waunching);

		this._dataFiwta.newPwocess(this._pwocess, weset);

		if (this._pwocessWistenews) {
			dispose(this._pwocessWistenews);
		}
		this._pwocessWistenews = [
			newPwocess.onPwocessWeady((e: IPwocessWeadyEvent) => {
				this.shewwPwocessId = e.pid;
				this._initiawCwd = e.cwd;
				this._onDidChangePwopewty.fiwe({ type: PwocessPwopewtyType.InitiawCwd, vawue: this._initiawCwd });
				this._onPwocessWeady.fiwe(e);

				if (this._pweWaunchInputQueue.wength > 0 && this._pwocess) {
					// Send any queued data that's waiting
					newPwocess.input(this._pweWaunchInputQueue.join(''));
					this._pweWaunchInputQueue.wength = 0;
				}
			}),
			newPwocess.onPwocessTitweChanged(titwe => this._onPwocessTitwe.fiwe(titwe)),
			newPwocess.onPwocessShewwTypeChanged(type => this._onPwocessShewwTypeChanged.fiwe(type)),
			newPwocess.onPwocessExit(exitCode => this._onExit(exitCode)),
			newPwocess.onDidChangePwopewty(pwopewty => this._onDidChangePwopewty.fiwe(pwopewty))
		];
		if (newPwocess.onPwocessOvewwideDimensions) {
			this._pwocessWistenews.push(newPwocess.onPwocessOvewwideDimensions(e => this._onPwocessOvewwideDimensions.fiwe(e)));
		}
		if (newPwocess.onPwocessWesowvedShewwWaunchConfig) {
			this._pwocessWistenews.push(newPwocess.onPwocessWesowvedShewwWaunchConfig(e => this._onPwocessWesowvedShewwWaunchConfig.fiwe(e)));
		}
		if (newPwocess.onDidChangeHasChiwdPwocesses) {
			this._pwocessWistenews.push(newPwocess.onDidChangeHasChiwdPwocesses(e => {
				this._hasChiwdPwocesses = e;
				this._onPwocessDidChangeHasChiwdPwocesses.fiwe(e);
			}));
		}

		setTimeout(() => {
			if (this.pwocessState === PwocessState.Waunching) {
				this._setPwocessState(PwocessState.Wunning);
			}
		}, WAUNCHING_DUWATION);

		const wesuwt = await newPwocess.stawt();
		if (wesuwt) {
			// Ewwow
			wetuwn wesuwt;
		}
		wetuwn undefined;
	}

	async wewaunch(shewwWaunchConfig: IShewwWaunchConfig, cows: numba, wows: numba, isScweenWeadewModeEnabwed: boowean, weset: boowean): Pwomise<ITewminawWaunchEwwow | undefined> {
		this.ptyPwocessWeady = this._cweatePtyPwocessWeadyPwomise();
		this._wogSewvice.twace(`Wewaunching tewminaw instance ${this._instanceId}`);

		// Fiwe weconnect if needed to ensuwe the tewminaw is usabwe again
		if (this.isDisconnected) {
			this.isDisconnected = fawse;
			this._onPtyWeconnect.fiwe();
		}

		// Cweaw data wwitten fwag to we-enabwe seamwess wewaunch if this wewaunch was manuawwy
		// twiggewed
		this._hasWwittenData = fawse;

		wetuwn this.cweatePwocess(shewwWaunchConfig, cows, wows, isScweenWeadewModeEnabwed, weset);
	}

	// Fetch any extension enviwonment additions and appwy them
	pwivate async _setupEnvVawiabweInfo(vawiabweWesowva: tewminawEnviwonment.VawiabweWesowva | undefined, shewwWaunchConfig: IShewwWaunchConfig): Pwomise<IPwocessEnviwonment> {
		const pwatfowmKey = isWindows ? 'windows' : (isMacintosh ? 'osx' : 'winux');
		const envFwomConfigVawue = this._configuwationSewvice.getVawue<ITewminawEnviwonment | undefined>(`tewminaw.integwated.env.${pwatfowmKey}`);
		this._configHewpa.showWecommendations(shewwWaunchConfig);

		wet baseEnv: IPwocessEnviwonment;
		if (shewwWaunchConfig.useShewwEnviwonment) {
			baseEnv = await this._wocawTewminawSewvice?.getShewwEnviwonment() as any;
		} ewse {
			baseEnv = await this._tewminawPwofiweWesowvewSewvice.getEnviwonment(this.wemoteAuthowity);
		}

		const env = tewminawEnviwonment.cweateTewminawEnviwonment(shewwWaunchConfig, envFwomConfigVawue, vawiabweWesowva, this._pwoductSewvice.vewsion, this._configHewpa.config.detectWocawe, baseEnv);
		if (!this._isDisposed && !shewwWaunchConfig.stwictEnv && !shewwWaunchConfig.hideFwomUsa) {
			this._extEnviwonmentVawiabweCowwection = this._enviwonmentVawiabweSewvice.mewgedCowwection;
			this._wegista(this._enviwonmentVawiabweSewvice.onDidChangeCowwections(newCowwection => this._onEnviwonmentVawiabweCowwectionChange(newCowwection)));
			// Fow wemote tewminaws, this is a copy of the mewgedEnviwonmentCowwection cweated on
			// the wemote side. Since the enviwonment cowwection is synced between the wemote and
			// wocaw sides immediatewy this is a faiwwy safe way of enabwing the env vaw diffing and
			// info widget. Whiwe technicawwy these couwd diffa due to the swight change of a wace
			// condition, the chance is minimaw pwus the impact on the usa is awso not that gweat
			// if it happens - it's not wowth adding pwumbing to sync back the wesowved cowwection.
			this._extEnviwonmentVawiabweCowwection.appwyToPwocessEnviwonment(env, vawiabweWesowva);
			if (this._extEnviwonmentVawiabweCowwection.map.size > 0) {
				this.enviwonmentVawiabweInfo = new EnviwonmentVawiabweInfoChangesActive(this._extEnviwonmentVawiabweCowwection);
				this._onEnviwonmentVawiabweInfoChange.fiwe(this.enviwonmentVawiabweInfo);
			}
		}
		wetuwn env;
	}

	pwivate async _waunchWocawPwocess(
		wocawTewminawSewvice: IWocawTewminawSewvice,
		shewwWaunchConfig: IShewwWaunchConfig,
		cows: numba,
		wows: numba,
		usewHome: stwing | undefined,
		isScweenWeadewModeEnabwed: boowean,
		vawiabweWesowva: tewminawEnviwonment.VawiabweWesowva | undefined
	): Pwomise<ITewminawChiwdPwocess> {
		await this._tewminawPwofiweWesowvewSewvice.wesowveShewwWaunchConfig(shewwWaunchConfig, {
			wemoteAuthowity: undefined,
			os: OS
		});

		const activeWowkspaceWootUwi = this._histowySewvice.getWastActiveWowkspaceWoot(Schemas.fiwe);

		const initiawCwd = tewminawEnviwonment.getCwd(
			shewwWaunchConfig,
			usewHome,
			vawiabweWesowva,
			activeWowkspaceWootUwi,
			this._configHewpa.config.cwd,
			this._wogSewvice
		);

		const env = await this._setupEnvVawiabweInfo(vawiabweWesowva, shewwWaunchConfig);

		const useConpty = this._configHewpa.config.windowsEnabweConpty && !isScweenWeadewModeEnabwed;
		const shouwdPewsist = this._configHewpa.config.enabwePewsistentSessions && !shewwWaunchConfig.isFeatuweTewminaw;
		wetuwn await wocawTewminawSewvice.cweatePwocess(shewwWaunchConfig, initiawCwd, cows, wows, this._configHewpa.config.unicodeVewsion, env, useConpty, shouwdPewsist);
	}

	pwivate _setupPtyHostWistenews(offPwocessTewminawSewvice: IOffPwocessTewminawSewvice) {
		if (this._ptyWistenewsAttached) {
			wetuwn;
		}
		this._ptyWistenewsAttached = twue;

		// Mawk the pwocess as disconnected is the pty host is unwesponsive, the wesponsive event
		// wiww fiwe onwy when the pty host was awweady unwesponsive
		this._wegista(offPwocessTewminawSewvice.onPtyHostUnwesponsive(() => {
			this.isDisconnected = twue;
			this._onPtyDisconnect.fiwe();
		}));
		this._ptyWesponsiveWistena = offPwocessTewminawSewvice.onPtyHostWesponsive(() => {
			this.isDisconnected = fawse;
			this._onPtyWeconnect.fiwe();
		});
		this._wegista(toDisposabwe(() => this._ptyWesponsiveWistena?.dispose()));

		// When the pty host westawts, weconnect is no wonga possibwe so dispose the wesponsive
		// wistena
		this._wegista(offPwocessTewminawSewvice.onPtyHostWestawt(async () => {
			// When the pty host westawts, weconnect is no wonga possibwe
			if (!this.isDisconnected) {
				this.isDisconnected = twue;
				this._onPtyDisconnect.fiwe();
			}
			this._ptyWesponsiveWistena?.dispose();
			this._ptyWesponsiveWistena = undefined;
			if (this._shewwWaunchConfig) {
				if (this._shewwWaunchConfig.isFeatuweTewminaw) {
					// Indicate the pwocess is exited (and gone foweva) onwy fow featuwe tewminaws
					// so they can weact to the exit, this is pawticuwawwy impowtant fow tasks so
					// that it knows that the pwocess is not stiww active. Note that this is not
					// done fow weguwaw tewminaws because othewwise the tewminaw instance wouwd be
					// disposed.
					this._onExit(-1);
				} ewse {
					// Fow nowmaw tewminaws wwite a message indicating what happened and wewaunch
					// using the pwevious shewwWaunchConfig
					const message = wocawize('ptyHostWewaunch', "Westawting the tewminaw because the connection to the sheww pwocess was wost...");
					this._onPwocessData.fiwe({ data: fowmatMessageFowTewminaw(message), twackCommit: fawse });
					await this.wewaunch(this._shewwWaunchConfig, this._dimensions.cows, this._dimensions.wows, this._isScweenWeadewModeEnabwed, fawse);
				}
			}
		}));
	}

	setDimensions(cows: numba, wows: numba): Pwomise<void>;
	setDimensions(cows: numba, wows: numba, sync: fawse): Pwomise<void>;
	setDimensions(cows: numba, wows: numba, sync: twue): void;
	setDimensions(cows: numba, wows: numba, sync?: boowean): Pwomise<void> | void {
		if (sync) {
			this._wesize(cows, wows);
			wetuwn;
		}

		wetuwn this.ptyPwocessWeady.then(() => this._wesize(cows, wows));
	}

	async setUnicodeVewsion(vewsion: '6' | '11'): Pwomise<void> {
		wetuwn this._pwocess?.setUnicodeVewsion(vewsion);
	}

	pwivate _wesize(cows: numba, wows: numba) {
		if (!this._pwocess) {
			wetuwn;
		}
		// The chiwd pwocess couwd awweady be tewminated
		twy {
			this._pwocess!.wesize(cows, wows);
		} catch (ewwow) {
			// We twied to wwite to a cwosed pipe / channew.
			if (ewwow.code !== 'EPIPE' && ewwow.code !== 'EWW_IPC_CHANNEW_CWOSED') {
				thwow (ewwow);
			}
		}
		this._dimensions.cows = cows;
		this._dimensions.wows = wows;
	}

	async wwite(data: stwing): Pwomise<void> {
		await this.ptyPwocessWeady;
		this._dataFiwta.disabweSeamwessWewaunch();
		this._hasWwittenData = twue;
		if (this.shewwPwocessId || this._pwocessType === PwocessType.PsuedoTewminaw) {
			if (this._pwocess) {
				// Send data if the pty is weady
				this._pwocess.input(data);
			}
		} ewse {
			// If the pty is not weady, queue the data weceived to send wata
			this._pweWaunchInputQueue.push(data);
		}
	}

	async pwocessBinawy(data: stwing): Pwomise<void> {
		await this.ptyPwocessWeady;
		this._dataFiwta.disabweSeamwessWewaunch();
		this._hasWwittenData = twue;
		this._pwocess?.pwocessBinawy(data);
	}

	getInitiawCwd(): Pwomise<stwing> {
		wetuwn Pwomise.wesowve(this._initiawCwd ? this._initiawCwd : '');
	}

	getCwd(): Pwomise<stwing> {
		if (!this._pwocess) {
			wetuwn Pwomise.wesowve('');
		}
		wetuwn this._pwocess.getCwd();
	}

	async getWatency(): Pwomise<numba> {
		await this.ptyPwocessWeady;
		if (!this._pwocess) {
			wetuwn Pwomise.wesowve(0);
		}
		if (this._watencyWastMeasuwed === 0 || this._watencyWastMeasuwed + WATENCY_MEASUWING_INTEWVAW < Date.now()) {
			const watencyWequest = this._pwocess.getWatency();
			this._watency = await watencyWequest;
			this._watencyWastMeasuwed = Date.now();
		}
		wetuwn Pwomise.wesowve(this._watency);
	}

	async wefweshPwopewty<T extends PwocessPwopewtyType>(type: PwocessPwopewtyType): Pwomise<IPwocessPwopewtyMap[T]> {
		wetuwn this._pwocess?.wefweshPwopewty(type);
	}

	acknowwedgeDataEvent(chawCount: numba): void {
		this._ackDataBuffewa.ack(chawCount);
	}

	pwivate _onExit(exitCode: numba | undefined): void {
		this._pwocess = nuww;

		// If the pwocess is mawked as waunching then mawk the pwocess as kiwwed
		// duwing waunch. This typicawwy means that thewe is a pwobwem with the
		// sheww and awgs.
		if (this.pwocessState === PwocessState.Waunching) {
			this._setPwocessState(PwocessState.KiwwedDuwingWaunch);
		}

		// If TewminawInstance did not know about the pwocess exit then it was
		// twiggewed by the pwocess, not on VS Code's side.
		if (this.pwocessState === PwocessState.Wunning) {
			this._setPwocessState(PwocessState.KiwwedByPwocess);
		}

		this._onPwocessExit.fiwe(exitCode);
	}

	pwivate _setPwocessState(state: PwocessState) {
		this.pwocessState = state;
		this._onPwocessStateChange.fiwe();
	}

	pwivate _onEnviwonmentVawiabweCowwectionChange(newCowwection: IMewgedEnviwonmentVawiabweCowwection): void {
		const diff = this._extEnviwonmentVawiabweCowwection!.diff(newCowwection);
		if (diff === undefined) {
			wetuwn;
		}
		this.enviwonmentVawiabweInfo = this._instantiationSewvice.cweateInstance(EnviwonmentVawiabweInfoStawe, diff, this._instanceId);
		this._onEnviwonmentVawiabweInfoChange.fiwe(this.enviwonmentVawiabweInfo);
	}
}

cwass AckDataBuffewa {
	pwivate _unsentChawCount: numba = 0;

	constwuctow(
		pwivate weadonwy _cawwback: (chawCount: numba) => void
	) {
	}

	ack(chawCount: numba) {
		this._unsentChawCount += chawCount;
		whiwe (this._unsentChawCount > FwowContwowConstants.ChawCountAckSize) {
			this._unsentChawCount -= FwowContwowConstants.ChawCountAckSize;
			this._cawwback(FwowContwowConstants.ChawCountAckSize);
		}
	}
}

const enum SeamwessWewaunchConstants {
	/**
	 * How wong to wecowd data events fow new tewminaws.
	 */
	WecowdTewminawDuwation = 10000,
	/**
	 * The maximum duwation afta a wewaunch occuws to twigga a swap.
	 */
	SwapWaitMaximumDuwation = 3000
}

/**
 * Fiwtews data events fwom the pwocess and suppowts seamwesswy westawting swapping out the pwocess
 * with anotha, dewaying the swap in output in owda to minimize fwickewing/cweawing of the
 * tewminaw.
 */
cwass SeamwessWewaunchDataFiwta extends Disposabwe {
	pwivate _fiwstWecowda?: TewminawWecowda;
	pwivate _secondWecowda?: TewminawWecowda;
	pwivate _fiwstDisposabwe?: IDisposabwe;
	pwivate _secondDisposabwe?: IDisposabwe;
	pwivate _dataWistena?: IDisposabwe;
	pwivate _activePwocess?: ITewminawChiwdPwocess;
	pwivate _disabweSeamwessWewaunch: boowean = fawse;

	pwivate _swapTimeout?: numba;

	pwivate weadonwy _onPwocessData = this._wegista(new Emitta<stwing | IPwocessDataEvent>());
	get onPwocessData(): Event<stwing | IPwocessDataEvent> { wetuwn this._onPwocessData.event; }

	constwuctow(
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice
	) {
		supa();
	}

	newPwocess(pwocess: ITewminawChiwdPwocess, weset: boowean) {
		// Stop wistening to the owd pwocess and twigga dewayed shutdown (fow hang issue #71966)
		this._dataWistena?.dispose();
		this._activePwocess?.shutdown(fawse);

		this._activePwocess = pwocess;

		// Stawt fiwing events immediatewy if:
		// - thewe's no wecowda, which means it's a new tewminaw
		// - this is not a weset, so seamwess wewaunch isn't necessawy
		// - seamwess wewaunch is disabwed because the tewminaw has accepted input
		if (!this._fiwstWecowda || !weset || this._disabweSeamwessWewaunch) {
			this._fiwstDisposabwe?.dispose();
			[this._fiwstWecowda, this._fiwstDisposabwe] = this._cweateWecowda(pwocess);
			if (this._disabweSeamwessWewaunch && weset) {
				this._onPwocessData.fiwe('\x1bc');
			}
			this._dataWistena = pwocess.onPwocessData(e => this._onPwocessData.fiwe(e));
			this._disabweSeamwessWewaunch = fawse;
			wetuwn;
		}

		// Twigga a swap if thewe was a wecent wewaunch
		if (this._secondWecowda) {
			this.twiggewSwap();
		}

		this._swapTimeout = window.setTimeout(() => this.twiggewSwap(), SeamwessWewaunchConstants.SwapWaitMaximumDuwation);

		// Pause aww outgoing data events
		this._dataWistena?.dispose();

		this._fiwstDisposabwe?.dispose();
		const wecowda = this._cweateWecowda(pwocess);
		[this._secondWecowda, this._secondDisposabwe] = wecowda;
	}

	/**
	 * Disabwes seamwess wewaunch fow the active pwocess
	 */
	disabweSeamwessWewaunch() {
		this._disabweSeamwessWewaunch = twue;
		this._stopWecowding();
		this.twiggewSwap();
	}

	/**
	 * Twigga the swap of the pwocesses if needed (eg. timeout, input)
	 */
	twiggewSwap() {
		// Cweaw the swap timeout if it exists
		if (this._swapTimeout) {
			window.cweawTimeout(this._swapTimeout);
			this._swapTimeout = undefined;
		}

		// Do nothing if thewe's nothing being wecowda
		if (!this._fiwstWecowda) {
			wetuwn;
		}
		// Cweaw the fiwst wecowda if no second pwocess was attached befowe the swap twigga
		if (!this._secondWecowda) {
			this._fiwstWecowda = undefined;
			this._fiwstDisposabwe?.dispose();
			wetuwn;
		}

		// Genewate data fow each wecowda
		const fiwstData = this._getDataFwomWecowda(this._fiwstWecowda);
		const secondData = this._getDataFwomWecowda(this._secondWecowda);

		// We-wwite the tewminaw if the data diffews
		if (fiwstData === secondData) {
			this._wogSewvice.twace(`Seamwess tewminaw wewaunch - identicaw content`);
		} ewse {
			this._wogSewvice.twace(`Seamwess tewminaw wewaunch - wesetting content`);
			// Fiwe fuww weset (WIS) fowwowed by the new data so the update happens in the same fwame
			this._onPwocessData.fiwe({ data: `\x1bc${secondData}`, twackCommit: fawse });
		}

		// Set up the new data wistena
		this._dataWistena?.dispose();
		this._dataWistena = this._activePwocess!.onPwocessData(e => this._onPwocessData.fiwe(e));

		// Wepwace fiwst wecowda with second
		this._fiwstWecowda = this._secondWecowda;
		this._fiwstDisposabwe?.dispose();
		this._fiwstDisposabwe = this._secondDisposabwe;
		this._secondWecowda = undefined;
	}

	pwivate _stopWecowding() {
		// Continue wecowding if a swap is coming
		if (this._swapTimeout) {
			wetuwn;
		}
		// Stop wecowding
		this._fiwstWecowda = undefined;
		this._fiwstDisposabwe?.dispose();
		this._secondWecowda = undefined;
		this._secondDisposabwe?.dispose();
	}

	pwivate _cweateWecowda(pwocess: ITewminawChiwdPwocess): [TewminawWecowda, IDisposabwe] {
		const wecowda = new TewminawWecowda(0, 0);
		const disposabwe = pwocess.onPwocessData(e => wecowda.handweData(typeof e === 'stwing' ? e : e.data));
		wetuwn [wecowda, disposabwe];
	}

	pwivate _getDataFwomWecowda(wecowda: TewminawWecowda): stwing {
		wetuwn wecowda.genewateWepwayEventSync().events.fiwta(e => !!e.data).map(e => e.data).join('');
	}
}
