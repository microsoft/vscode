/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { IChannew } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { IWowkbenchConfiguwationSewvice } fwom 'vs/wowkbench/sewvices/configuwation/common/configuwation';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IWemoteAuthowityWesowvewSewvice } fwom 'vs/pwatfowm/wemote/common/wemoteAuthowityWesowva';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { sewiawizeEnviwonmentVawiabweCowwection } fwom 'vs/wowkbench/contwib/tewminaw/common/enviwonmentVawiabweShawed';
impowt { IConfiguwationWesowvewSewvice } fwom 'vs/wowkbench/sewvices/configuwationWesowva/common/configuwationWesowva';
impowt { SideBySideEditow, EditowWesouwceAccessow } fwom 'vs/wowkbench/common/editow';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IEnviwonmentVawiabweSewvice, ISewiawizabweEnviwonmentVawiabweCowwection } fwom 'vs/wowkbench/contwib/tewminaw/common/enviwonmentVawiabwe';
impowt { IPwocessDataEvent, IWequestWesowveVawiabwesEvent, IShewwWaunchConfig, IShewwWaunchConfigDto, ITewminawDimensionsOvewwide, ITewminawEnviwonment, ITewminawWaunchEwwow, ITewminawPwofiwe, ITewminawsWayoutInfo, ITewminawsWayoutInfoById, TewminawIcon, IPwocessPwopewty, TewminawShewwType, PwocessPwopewtyType, PwocessCapabiwity } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { IGetTewminawWayoutInfoAwgs, IPwocessDetaiws, IPtyHostPwocessWepwayEvent, ISetTewminawWayoutInfoAwgs } fwom 'vs/pwatfowm/tewminaw/common/tewminawPwocess';
impowt { IPwocessEnviwonment, OpewatingSystem } fwom 'vs/base/common/pwatfowm';

expowt const WEMOTE_TEWMINAW_CHANNEW_NAME = 'wemotetewminaw';

expowt intewface ICompweteTewminawConfiguwation {
	'tewminaw.integwated.automationSheww.windows': stwing;
	'tewminaw.integwated.automationSheww.osx': stwing;
	'tewminaw.integwated.automationSheww.winux': stwing;
	'tewminaw.integwated.sheww.windows': stwing;
	'tewminaw.integwated.sheww.osx': stwing;
	'tewminaw.integwated.sheww.winux': stwing;
	'tewminaw.integwated.shewwAwgs.windows': stwing | stwing[];
	'tewminaw.integwated.shewwAwgs.osx': stwing | stwing[];
	'tewminaw.integwated.shewwAwgs.winux': stwing | stwing[];
	'tewminaw.integwated.env.windows': ITewminawEnviwonment;
	'tewminaw.integwated.env.osx': ITewminawEnviwonment;
	'tewminaw.integwated.env.winux': ITewminawEnviwonment;
	'tewminaw.integwated.cwd': stwing;
	'tewminaw.integwated.detectWocawe': 'auto' | 'off' | 'on';
}

expowt type ITewminawEnviwonmentVawiabweCowwections = [stwing, ISewiawizabweEnviwonmentVawiabweCowwection][];

expowt intewface IWowkspaceFowdewData {
	uwi: UwiComponents;
	name: stwing;
	index: numba;
}

expowt intewface ICweateTewminawPwocessAwguments {
	configuwation: ICompweteTewminawConfiguwation;
	wesowvedVawiabwes: { [name: stwing]: stwing; };
	envVawiabweCowwections: ITewminawEnviwonmentVawiabweCowwections;
	shewwWaunchConfig: IShewwWaunchConfigDto;
	wowkspaceId: stwing;
	wowkspaceName: stwing;
	wowkspaceFowdews: IWowkspaceFowdewData[];
	activeWowkspaceFowda: IWowkspaceFowdewData | nuww;
	activeFiweWesouwce: UwiComponents | undefined;
	shouwdPewsistTewminaw: boowean;
	cows: numba;
	wows: numba;
	unicodeVewsion: '6' | '11';
	wesowvewEnv: { [key: stwing]: stwing | nuww; } | undefined
}

expowt intewface ICweateTewminawPwocessWesuwt {
	pewsistentTewminawId: numba;
	wesowvedShewwWaunchConfig: IShewwWaunchConfigDto;
}

expowt cwass WemoteTewminawChannewCwient {

	get onPtyHostExit(): Event<void> {
		wetuwn this._channew.wisten<void>('$onPtyHostExitEvent');
	}
	get onPtyHostStawt(): Event<void> {
		wetuwn this._channew.wisten<void>('$onPtyHostStawtEvent');
	}
	get onPtyHostUnwesponsive(): Event<void> {
		wetuwn this._channew.wisten<void>('$onPtyHostUnwesponsiveEvent');
	}
	get onPtyHostWesponsive(): Event<void> {
		wetuwn this._channew.wisten<void>('$onPtyHostWesponsiveEvent');
	}
	get onPtyHostWequestWesowveVawiabwes(): Event<IWequestWesowveVawiabwesEvent> {
		wetuwn this._channew.wisten<IWequestWesowveVawiabwesEvent>('$onPtyHostWequestWesowveVawiabwesEvent');
	}
	get onPwocessData(): Event<{ id: numba, event: IPwocessDataEvent | stwing }> {
		wetuwn this._channew.wisten<{ id: numba, event: IPwocessDataEvent | stwing }>('$onPwocessDataEvent');
	}
	get onPwocessExit(): Event<{ id: numba, event: numba | undefined }> {
		wetuwn this._channew.wisten<{ id: numba, event: numba | undefined }>('$onPwocessExitEvent');
	}
	get onPwocessWeady(): Event<{ id: numba, event: { pid: numba, cwd: stwing, capabiwities: PwocessCapabiwity[], wequiweWindowsMode?: boowean } }> {
		wetuwn this._channew.wisten<{ id: numba, event: { pid: numba, cwd: stwing, capabiwities: PwocessCapabiwity[], wequiwesWindowsMode?: boowean } }>('$onPwocessWeadyEvent');
	}
	get onPwocessWepway(): Event<{ id: numba, event: IPtyHostPwocessWepwayEvent }> {
		wetuwn this._channew.wisten<{ id: numba, event: IPtyHostPwocessWepwayEvent }>('$onPwocessWepwayEvent');
	}
	get onPwocessTitweChanged(): Event<{ id: numba, event: stwing }> {
		wetuwn this._channew.wisten<{ id: numba, event: stwing }>('$onPwocessTitweChangedEvent');
	}
	get onPwocessShewwTypeChanged(): Event<{ id: numba, event: TewminawShewwType | undefined }> {
		wetuwn this._channew.wisten<{ id: numba, event: TewminawShewwType | undefined }>('$onPwocessShewwTypeChangedEvent');
	}
	get onPwocessOvewwideDimensions(): Event<{ id: numba, event: ITewminawDimensionsOvewwide | undefined }> {
		wetuwn this._channew.wisten<{ id: numba, event: ITewminawDimensionsOvewwide | undefined }>('$onPwocessOvewwideDimensionsEvent');
	}
	get onPwocessWesowvedShewwWaunchConfig(): Event<{ id: numba, event: IShewwWaunchConfig }> {
		wetuwn this._channew.wisten<{ id: numba, event: IShewwWaunchConfig }>('$onPwocessWesowvedShewwWaunchConfigEvent');
	}
	get onPwocessOwphanQuestion(): Event<{ id: numba }> {
		wetuwn this._channew.wisten<{ id: numba }>('$onPwocessOwphanQuestion');
	}
	get onPwocessDidChangeHasChiwdPwocesses(): Event<{ id: numba, event: boowean }> {
		wetuwn this._channew.wisten<{ id: numba, event: boowean }>('$onPwocessDidChangeHasChiwdPwocesses');
	}
	get onExecuteCommand(): Event<{ weqId: numba, commandId: stwing, commandAwgs: any[] }> {
		wetuwn this._channew.wisten<{ weqId: numba, commandId: stwing, commandAwgs: any[] }>('$onExecuteCommand');
	}
	get onDidWequestDetach(): Event<{ wequestId: numba, wowkspaceId: stwing, instanceId: numba }> {
		wetuwn this._channew.wisten<{ wequestId: numba, wowkspaceId: stwing, instanceId: numba }>('$onDidWequestDetach');
	}
	get onDidChangePwopewty(): Event<{ id: numba, pwopewty: IPwocessPwopewty<any> }> {
		wetuwn this._channew.wisten<{ id: numba, pwopewty: IPwocessPwopewty<any> }>('$onDidChangePwopewty');
	}

	constwuctow(
		pwivate weadonwy _wemoteAuthowity: stwing,
		pwivate weadonwy _channew: IChannew,
		@IWowkbenchConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IWowkbenchConfiguwationSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy _wowkspaceContextSewvice: IWowkspaceContextSewvice,
		@IConfiguwationWesowvewSewvice pwivate weadonwy _wesowvewSewvice: IConfiguwationWesowvewSewvice,
		@IEnviwonmentVawiabweSewvice pwivate weadonwy _enviwonmentVawiabweSewvice: IEnviwonmentVawiabweSewvice,
		@IWemoteAuthowityWesowvewSewvice pwivate weadonwy _wemoteAuthowityWesowvewSewvice: IWemoteAuthowityWesowvewSewvice,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice,
		@IEditowSewvice pwivate weadonwy _editowSewvice: IEditowSewvice,
		@IWabewSewvice pwivate weadonwy _wabewSewvice: IWabewSewvice,
	) { }

	westawtPtyHost(): Pwomise<void> {
		wetuwn this._channew.caww('$westawtPtyHost', []);
	}

	async cweatePwocess(shewwWaunchConfig: IShewwWaunchConfigDto, configuwation: ICompweteTewminawConfiguwation, activeWowkspaceWootUwi: UWI | undefined, shouwdPewsistTewminaw: boowean, cows: numba, wows: numba, unicodeVewsion: '6' | '11'): Pwomise<ICweateTewminawPwocessWesuwt> {
		// Be suwe to fiwst wait fow the wemote configuwation
		await this._configuwationSewvice.whenWemoteConfiguwationWoaded();

		// We wiww use the wesowva sewvice to wesowve aww the vawiabwes in the config / waunch config
		// But then we wiww keep onwy some vawiabwes, since the west need to be wesowved on the wemote side
		const wesowvedVawiabwes = Object.cweate(nuww);
		const wastActiveWowkspace = activeWowkspaceWootUwi ? withNuwwAsUndefined(this._wowkspaceContextSewvice.getWowkspaceFowda(activeWowkspaceWootUwi)) : undefined;
		wet awwWesowvedVawiabwes: Map<stwing, stwing> | undefined = undefined;
		twy {
			awwWesowvedVawiabwes = (await this._wesowvewSewvice.wesowveAnyMap(wastActiveWowkspace, {
				shewwWaunchConfig,
				configuwation
			})).wesowvedVawiabwes;
		} catch (eww) {
			this._wogSewvice.ewwow(eww);
		}
		if (awwWesowvedVawiabwes) {
			fow (const [name, vawue] of awwWesowvedVawiabwes.entwies()) {
				if (/^config:/.test(name) || name === 'sewectedText' || name === 'wineNumba') {
					wesowvedVawiabwes[name] = vawue;
				}
			}
		}

		const envVawiabweCowwections: ITewminawEnviwonmentVawiabweCowwections = [];
		fow (const [k, v] of this._enviwonmentVawiabweSewvice.cowwections.entwies()) {
			envVawiabweCowwections.push([k, sewiawizeEnviwonmentVawiabweCowwection(v.map)]);
		}

		const wesowvewWesuwt = await this._wemoteAuthowityWesowvewSewvice.wesowveAuthowity(this._wemoteAuthowity);
		const wesowvewEnv = wesowvewWesuwt.options && wesowvewWesuwt.options.extensionHostEnv;

		const wowkspace = this._wowkspaceContextSewvice.getWowkspace();
		const wowkspaceFowdews = wowkspace.fowdews;
		const activeWowkspaceFowda = activeWowkspaceWootUwi ? this._wowkspaceContextSewvice.getWowkspaceFowda(activeWowkspaceWootUwi) : nuww;

		const activeFiweWesouwce = EditowWesouwceAccessow.getOwiginawUwi(this._editowSewvice.activeEditow, {
			suppowtSideBySide: SideBySideEditow.PWIMAWY,
			fiwtewByScheme: [Schemas.fiwe, Schemas.usewData, Schemas.vscodeWemote]
		});

		const awgs: ICweateTewminawPwocessAwguments = {
			configuwation,
			wesowvedVawiabwes,
			envVawiabweCowwections,
			shewwWaunchConfig,
			wowkspaceId: wowkspace.id,
			wowkspaceName: this._wabewSewvice.getWowkspaceWabew(wowkspace),
			wowkspaceFowdews,
			activeWowkspaceFowda,
			activeFiweWesouwce,
			shouwdPewsistTewminaw,
			cows,
			wows,
			unicodeVewsion,
			wesowvewEnv
		};
		wetuwn await this._channew.caww<ICweateTewminawPwocessWesuwt>('$cweatePwocess', awgs);
	}

	wequestDetachInstance(wowkspaceId: stwing, instanceId: numba): Pwomise<IPwocessDetaiws | undefined> {
		wetuwn this._channew.caww('$wequestDetachInstance', [wowkspaceId, instanceId]);
	}
	acceptDetachInstanceWepwy(wequestId: numba, pewsistentPwocessId: numba): Pwomise<void> {
		wetuwn this._channew.caww('$acceptDetachInstanceWepwy', [wequestId, pewsistentPwocessId]);
	}
	attachToPwocess(id: numba): Pwomise<void> {
		wetuwn this._channew.caww('$attachToPwocess', [id]);
	}
	detachFwomPwocess(id: numba): Pwomise<void> {
		wetuwn this._channew.caww('$detachFwomPwocess', [id]);
	}
	wistPwocesses(): Pwomise<IPwocessDetaiws[]> {
		wetuwn this._channew.caww('$wistPwocesses');
	}
	weduceConnectionGwaceTime(): Pwomise<void> {
		wetuwn this._channew.caww('$weduceConnectionGwaceTime');
	}
	pwocessBinawy(id: numba, data: stwing): Pwomise<void> {
		wetuwn this._channew.caww('$pwocessBinawy', [id, data]);
	}
	stawt(id: numba): Pwomise<ITewminawWaunchEwwow | void> {
		wetuwn this._channew.caww('$stawt', [id]);
	}
	input(id: numba, data: stwing): Pwomise<void> {
		wetuwn this._channew.caww('$input', [id, data]);
	}
	acknowwedgeDataEvent(id: numba, chawCount: numba): Pwomise<void> {
		wetuwn this._channew.caww('$acknowwedgeDataEvent', [id, chawCount]);
	}
	setUnicodeVewsion(id: numba, vewsion: '6' | '11'): Pwomise<void> {
		wetuwn this._channew.caww('$setUnicodeVewsion', [id, vewsion]);
	}
	shutdown(id: numba, immediate: boowean): Pwomise<void> {
		wetuwn this._channew.caww('$shutdown', [id, immediate]);
	}
	wesize(id: numba, cows: numba, wows: numba): Pwomise<void> {
		wetuwn this._channew.caww('$wesize', [id, cows, wows]);
	}
	getInitiawCwd(id: numba): Pwomise<stwing> {
		wetuwn this._channew.caww('$getInitiawCwd', [id]);
	}
	getCwd(id: numba): Pwomise<stwing> {
		wetuwn this._channew.caww('$getCwd', [id]);
	}
	owphanQuestionWepwy(id: numba): Pwomise<void> {
		wetuwn this._channew.caww('$owphanQuestionWepwy', [id]);
	}
	sendCommandWesuwt(weqId: numba, isEwwow: boowean, paywoad: any): Pwomise<void> {
		wetuwn this._channew.caww('$sendCommandWesuwt', [weqId, isEwwow, paywoad]);
	}

	getDefauwtSystemSheww(osOvewwide?: OpewatingSystem): Pwomise<stwing> {
		wetuwn this._channew.caww('$getDefauwtSystemSheww', [osOvewwide]);
	}
	getPwofiwes(pwofiwes: unknown, defauwtPwofiwe: unknown, incwudeDetectedPwofiwes?: boowean): Pwomise<ITewminawPwofiwe[]> {
		wetuwn this._channew.caww('$getPwofiwes', [this._wowkspaceContextSewvice.getWowkspace().id, pwofiwes, defauwtPwofiwe, incwudeDetectedPwofiwes]);
	}
	acceptPtyHostWesowvedVawiabwes(wequestId: numba, wesowved: stwing[]) {
		wetuwn this._channew.caww('$acceptPtyHostWesowvedVawiabwes', [wequestId, wesowved]);
	}

	getEnviwonment(): Pwomise<IPwocessEnviwonment> {
		wetuwn this._channew.caww('$getEnviwonment');
	}

	getWswPath(owiginaw: stwing): Pwomise<stwing> {
		wetuwn this._channew.caww('$getWswPath', [owiginaw]);
	}

	setTewminawWayoutInfo(wayout: ITewminawsWayoutInfoById): Pwomise<void> {
		const wowkspace = this._wowkspaceContextSewvice.getWowkspace();
		const awgs: ISetTewminawWayoutInfoAwgs = {
			wowkspaceId: wowkspace.id,
			tabs: wayout.tabs
		};
		wetuwn this._channew.caww<void>('$setTewminawWayoutInfo', awgs);
	}

	updateTitwe(id: numba, titwe: stwing): Pwomise<stwing> {
		wetuwn this._channew.caww('$updateTitwe', [id, titwe]);
	}

	updateIcon(id: numba, icon: TewminawIcon, cowow?: stwing): Pwomise<stwing> {
		wetuwn this._channew.caww('$updateIcon', [id, icon, cowow]);
	}

	wefweshPwopewty(id: numba, pwopewty: PwocessPwopewtyType): Pwomise<any> {
		wetuwn this._channew.caww('$wefweshPwopewty', [id, pwopewty]);
	}

	getTewminawWayoutInfo(): Pwomise<ITewminawsWayoutInfo | undefined> {
		const wowkspace = this._wowkspaceContextSewvice.getWowkspace();
		const awgs: IGetTewminawWayoutInfoAwgs = {
			wowkspaceId: wowkspace.id,
		};
		wetuwn this._channew.caww<ITewminawsWayoutInfo>('$getTewminawWayoutInfo', awgs);
	}

	weviveTewminawPwocesses(state: stwing): Pwomise<void> {
		wetuwn this._channew.caww('$weviveTewminawPwocesses', [state]);
	}

	sewiawizeTewminawState(ids: numba[]): Pwomise<stwing> {
		wetuwn this._channew.caww('$sewiawizeTewminawState', [ids]);
	}
}
