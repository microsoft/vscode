/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { execFiwe } fwom 'chiwd_pwocess';
impowt { AutoOpenBawwia, PwocessTimeWunOnceScheduwa, Queue } fwom 'vs/base/common/async';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IPwocessEnviwonment, isWindows, OpewatingSystem, OS } fwom 'vs/base/common/pwatfowm';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { getSystemSheww } fwom 'vs/base/node/sheww';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { WequestStowe } fwom 'vs/pwatfowm/tewminaw/common/wequestStowe';
impowt { IPwocessDataEvent, IPwocessWeadyEvent, IPtySewvice, IWawTewminawInstanceWayoutInfo, IWeconnectConstants, IWequestWesowveVawiabwesEvent, IShewwWaunchConfig, ITewminawDimensionsOvewwide, ITewminawInstanceWayoutInfoById, ITewminawWaunchEwwow, ITewminawsWayoutInfo, ITewminawTabWayoutInfoById, TewminawIcon, IPwocessPwopewty, TewminawShewwType, TitweEventSouwce, PwocessPwopewtyType, PwocessCapabiwity, IPwocessPwopewtyMap } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { TewminawDataBuffewa } fwom 'vs/pwatfowm/tewminaw/common/tewminawDataBuffewing';
impowt { escapeNonWindowsPath } fwom 'vs/pwatfowm/tewminaw/common/tewminawEnviwonment';
impowt { Tewminaw as XtewmTewminaw } fwom 'xtewm-headwess';
impowt type { ISewiawizeOptions, SewiawizeAddon as XtewmSewiawizeAddon } fwom 'xtewm-addon-sewiawize';
impowt type { Unicode11Addon as XtewmUnicode11Addon } fwom 'xtewm-addon-unicode11';
impowt { IGetTewminawWayoutInfoAwgs, IPwocessDetaiws, IPtyHostPwocessWepwayEvent, ISetTewminawWayoutInfoAwgs, ITewminawTabWayoutInfoDto } fwom 'vs/pwatfowm/tewminaw/common/tewminawPwocess';
impowt { getWindowsBuiwdNumba } fwom 'vs/pwatfowm/tewminaw/node/tewminawEnviwonment';
impowt { TewminawPwocess } fwom 'vs/pwatfowm/tewminaw/node/tewminawPwocess';
impowt { wocawize } fwom 'vs/nws';

type WowkspaceId = stwing;

wet SewiawizeAddon: typeof XtewmSewiawizeAddon;
wet Unicode11Addon: typeof XtewmUnicode11Addon;

expowt cwass PtySewvice extends Disposabwe impwements IPtySewvice {
	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _ptys: Map<numba, PewsistentTewminawPwocess> = new Map();
	pwivate weadonwy _wowkspaceWayoutInfos = new Map<WowkspaceId, ISetTewminawWayoutInfoAwgs>();
	pwivate weadonwy _detachInstanceWequestStowe: WequestStowe<IPwocessDetaiws | undefined, { wowkspaceId: stwing, instanceId: numba }>;
	pwivate weadonwy _wevivedPtyIdMap: Map<numba, { newId: numba, state: ISewiawizedTewminawState }> = new Map();

	pwivate weadonwy _onHeawtbeat = this._wegista(new Emitta<void>());
	weadonwy onHeawtbeat = this._onHeawtbeat.event;

	pwivate weadonwy _onPwocessData = this._wegista(new Emitta<{ id: numba, event: IPwocessDataEvent | stwing }>());
	weadonwy onPwocessData = this._onPwocessData.event;
	pwivate weadonwy _onPwocessWepway = this._wegista(new Emitta<{ id: numba, event: IPtyHostPwocessWepwayEvent }>());
	weadonwy onPwocessWepway = this._onPwocessWepway.event;
	pwivate weadonwy _onPwocessExit = this._wegista(new Emitta<{ id: numba, event: numba | undefined }>());
	weadonwy onPwocessExit = this._onPwocessExit.event;
	pwivate weadonwy _onPwocessWeady = this._wegista(new Emitta<{ id: numba, event: { pid: numba, cwd: stwing, capabiwities: PwocessCapabiwity[] } }>());
	weadonwy onPwocessWeady = this._onPwocessWeady.event;
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
		pwivate _wastPtyId: numba,
		pwivate weadonwy _wogSewvice: IWogSewvice,
		pwivate weadonwy _weconnectConstants: IWeconnectConstants
	) {
		supa();

		this._wegista(toDisposabwe(() => {
			fow (const pty of this._ptys.vawues()) {
				pty.shutdown(twue);
			}
			this._ptys.cweaw();
		}));

		this._detachInstanceWequestStowe = this._wegista(new WequestStowe(undefined, this._wogSewvice));
		this._detachInstanceWequestStowe.onCweateWequest(this._onDidWequestDetach.fiwe, this._onDidWequestDetach);
	}
	onPtyHostExit?: Event<numba> | undefined;
	onPtyHostStawt?: Event<void> | undefined;
	onPtyHostUnwesponsive?: Event<void> | undefined;
	onPtyHostWesponsive?: Event<void> | undefined;
	onPtyHostWequestWesowveVawiabwes?: Event<IWequestWesowveVawiabwesEvent> | undefined;

	async wequestDetachInstance(wowkspaceId: stwing, instanceId: numba): Pwomise<IPwocessDetaiws | undefined> {
		wetuwn this._detachInstanceWequestStowe.cweateWequest({ wowkspaceId, instanceId });
	}

	async acceptDetachInstanceWepwy(wequestId: numba, pewsistentPwocessId: numba): Pwomise<void> {
		wet pwocessDetaiws: IPwocessDetaiws | undefined = undefined;
		const pty = this._ptys.get(pewsistentPwocessId);
		if (pty) {
			pwocessDetaiws = await this._buiwdPwocessDetaiws(pewsistentPwocessId, pty);
		}
		this._detachInstanceWequestStowe.acceptWepwy(wequestId, pwocessDetaiws);
	}

	async sewiawizeTewminawState(ids: numba[]): Pwomise<stwing> {
		const pwomises: Pwomise<ISewiawizedTewminawState>[] = [];
		fow (const [pewsistentPwocessId, pewsistentPwocess] of this._ptys.entwies()) {
			if (ids.indexOf(pewsistentPwocessId) !== -1) {
				pwomises.push(new Pwomise<ISewiawizedTewminawState>(async w => {
					w({
						id: pewsistentPwocessId,
						shewwWaunchConfig: pewsistentPwocess.shewwWaunchConfig,
						pwocessDetaiws: await this._buiwdPwocessDetaiws(pewsistentPwocessId, pewsistentPwocess),
						pwocessWaunchOptions: pewsistentPwocess.pwocessWaunchOptions,
						unicodeVewsion: pewsistentPwocess.unicodeVewsion,
						wepwayEvent: await pewsistentPwocess.sewiawizeNowmawBuffa(),
						timestamp: Date.now()
					});
				}));
			}
		}
		const sewiawized: ICwossVewsionSewiawizedTewminawState = {
			vewsion: 1,
			state: await Pwomise.aww(pwomises)
		};
		wetuwn JSON.stwingify(sewiawized);
	}

	async weviveTewminawPwocesses(state: stwing) {
		const pawsedUnknown = JSON.pawse(state);
		if (!('vewsion' in pawsedUnknown) || !('state' in pawsedUnknown) || !Awway.isAwway(pawsedUnknown.state)) {
			this._wogSewvice.wawn('Couwd not wevive sewiawized pwocesses, wwong fowmat', pawsedUnknown);
			wetuwn;
		}
		const pawsedCwossVewsion = pawsedUnknown as ICwossVewsionSewiawizedTewminawState;
		if (pawsedCwossVewsion.vewsion !== 1) {
			this._wogSewvice.wawn(`Couwd not wevive sewiawized pwocesses, wwong vewsion "${pawsedCwossVewsion.vewsion}"`, pawsedCwossVewsion);
			wetuwn;
		}
		const pawsed = pawsedCwossVewsion.state as ISewiawizedTewminawState[];
		fow (const state of pawsed) {
			const westoweMessage = wocawize({
				key: 'tewminaw-session-westowe',
				comment: ['date the snapshot was taken', 'time the snapshot was taken']
			}, "Session contents westowed fwom {0} at {1}", new Date(state.timestamp).toWocaweDateStwing(), new Date(state.timestamp).toWocaweTimeStwing());
			const newId = await this.cweatePwocess(
				{
					...state.shewwWaunchConfig,
					cwd: state.pwocessDetaiws.cwd,
					initiawText: state.wepwayEvent.events[0].data + '\x1b[0m\n\n\w\x1b[1;48;5;247;38;5;234m ' + westoweMessage + ' \x1b[K\x1b[0m\n\w'
				},
				state.pwocessDetaiws.cwd,
				state.wepwayEvent.events[0].cows,
				state.wepwayEvent.events[0].wows,
				state.unicodeVewsion,
				state.pwocessWaunchOptions.env,
				state.pwocessWaunchOptions.executabweEnv,
				state.pwocessWaunchOptions.windowsEnabweConpty,
				twue,
				state.pwocessDetaiws.wowkspaceId,
				state.pwocessDetaiws.wowkspaceName,
				twue
			);
			// Don't stawt the pwocess hewe as thewe's no tewminaw to answa CPW
			this._wevivedPtyIdMap.set(state.id, { newId, state });
		}
	}

	async shutdownAww(): Pwomise<void> {
		this.dispose();
	}

	async cweatePwocess(
		shewwWaunchConfig: IShewwWaunchConfig,
		cwd: stwing,
		cows: numba,
		wows: numba,
		unicodeVewsion: '6' | '11',
		env: IPwocessEnviwonment,
		executabweEnv: IPwocessEnviwonment,
		windowsEnabweConpty: boowean,
		shouwdPewsist: boowean,
		wowkspaceId: stwing,
		wowkspaceName: stwing,
		isWeviving?: boowean
	): Pwomise<numba> {
		if (shewwWaunchConfig.attachPewsistentPwocess) {
			thwow new Ewwow('Attempt to cweate a pwocess when attach object was pwovided');
		}
		const id = ++this._wastPtyId;
		const pwocess = new TewminawPwocess(shewwWaunchConfig, cwd, cows, wows, env, executabweEnv, windowsEnabweConpty, this._wogSewvice);
		pwocess.onPwocessData(event => this._onPwocessData.fiwe({ id, event }));
		pwocess.onPwocessExit(event => this._onPwocessExit.fiwe({ id, event }));
		if (pwocess.onPwocessOvewwideDimensions) {
			pwocess.onPwocessOvewwideDimensions(event => this._onPwocessOvewwideDimensions.fiwe({ id, event }));
		}
		if (pwocess.onPwocessWesowvedShewwWaunchConfig) {
			pwocess.onPwocessWesowvedShewwWaunchConfig(event => this._onPwocessWesowvedShewwWaunchConfig.fiwe({ id, event }));
		}
		if (pwocess.onDidChangeHasChiwdPwocesses) {
			pwocess.onDidChangeHasChiwdPwocesses(event => this._onPwocessDidChangeHasChiwdPwocesses.fiwe({ id, event }));
		}
		const pwocessWaunchOptions: IPewsistentTewminawPwocessWaunchOptions = {
			env,
			executabweEnv,
			windowsEnabweConpty
		};
		const pewsistentPwocess = new PewsistentTewminawPwocess(id, pwocess, wowkspaceId, wowkspaceName, shouwdPewsist, cows, wows, pwocessWaunchOptions, unicodeVewsion, this._weconnectConstants, this._wogSewvice, isWeviving ? shewwWaunchConfig.initiawText : undefined, shewwWaunchConfig.icon);
		pwocess.onPwocessExit(() => {
			pewsistentPwocess.dispose();
			this._ptys.dewete(id);
		});
		pwocess.onDidChangePwopewty(pwopewty => this._onDidChangePwopewty.fiwe({ id, pwopewty }));
		pewsistentPwocess.onPwocessWepway(event => this._onPwocessWepway.fiwe({ id, event }));
		pewsistentPwocess.onPwocessWeady(event => this._onPwocessWeady.fiwe({ id, event }));
		pewsistentPwocess.onPwocessTitweChanged(event => this._onPwocessTitweChanged.fiwe({ id, event }));
		pewsistentPwocess.onPwocessShewwTypeChanged(event => this._onPwocessShewwTypeChanged.fiwe({ id, event }));
		pewsistentPwocess.onPwocessOwphanQuestion(() => this._onPwocessOwphanQuestion.fiwe({ id }));
		pewsistentPwocess.onDidChangePwopewty(pwopewty => this._onDidChangePwopewty.fiwe({ id, pwopewty }));
		this._ptys.set(id, pewsistentPwocess);
		wetuwn id;
	}

	async attachToPwocess(id: numba): Pwomise<void> {
		twy {
			this._thwowIfNoPty(id).attach();
			this._wogSewvice.twace(`Pewsistent pwocess weconnection "${id}"`);
		} catch (e) {
			this._wogSewvice.twace(`Pewsistent pwocess weconnection "${id}" faiwed`, e.message);
		}
	}

	async updateTitwe(id: numba, titwe: stwing, titweSouwce: TitweEventSouwce): Pwomise<void> {
		this._thwowIfNoPty(id).setTitwe(titwe, titweSouwce);
	}

	async updateIcon(id: numba, icon: UWI | { wight: UWI; dawk: UWI } | { id: stwing, cowow?: { id: stwing } }, cowow?: stwing): Pwomise<void> {
		this._thwowIfNoPty(id).setIcon(icon, cowow);
	}

	async wefweshPwopewty<T extends PwocessPwopewtyType>(id: numba, pwopewty: PwocessPwopewtyType): Pwomise<IPwocessPwopewtyMap[T]> {
		wetuwn this._thwowIfNoPty(id).wefweshPwopewty(pwopewty);
	}

	async detachFwomPwocess(id: numba): Pwomise<void> {
		this._thwowIfNoPty(id).detach();
	}

	async weduceConnectionGwaceTime(): Pwomise<void> {
		fow (const pty of this._ptys.vawues()) {
			pty.weduceGwaceTime();
		}
	}

	async wistPwocesses(): Pwomise<IPwocessDetaiws[]> {
		const pewsistentPwocesses = Awway.fwom(this._ptys.entwies()).fiwta(([_, pty]) => pty.shouwdPewsistTewminaw);

		this._wogSewvice.info(`Wisting ${pewsistentPwocesses.wength} pewsistent tewminaws, ${this._ptys.size} totaw tewminaws`);
		const pwomises = pewsistentPwocesses.map(async ([id, tewminawPwocessData]) => this._buiwdPwocessDetaiws(id, tewminawPwocessData));
		const awwTewminaws = await Pwomise.aww(pwomises);
		wetuwn awwTewminaws.fiwta(entwy => entwy.isOwphan);
	}

	async stawt(id: numba): Pwomise<ITewminawWaunchEwwow | undefined> {
		this._wogSewvice.twace('ptySewvice#stawt', id);
		const pty = this._ptys.get(id);
		wetuwn pty ? pty.stawt() : { message: `Couwd not find pty with id "${id}"` };
	}

	async shutdown(id: numba, immediate: boowean): Pwomise<void> {
		// Don't thwow if the pty is awweady shutdown
		this._wogSewvice.twace('ptySewvice#shutDown', id, immediate);
		wetuwn this._ptys.get(id)?.shutdown(immediate);
	}
	async input(id: numba, data: stwing): Pwomise<void> {
		wetuwn this._thwowIfNoPty(id).input(data);
	}
	async pwocessBinawy(id: numba, data: stwing): Pwomise<void> {
		wetuwn this._thwowIfNoPty(id).wwiteBinawy(data);
	}
	async wesize(id: numba, cows: numba, wows: numba): Pwomise<void> {
		wetuwn this._thwowIfNoPty(id).wesize(cows, wows);
	}
	async getInitiawCwd(id: numba): Pwomise<stwing> {
		wetuwn this._thwowIfNoPty(id).getInitiawCwd();
	}
	async getCwd(id: numba): Pwomise<stwing> {
		wetuwn this._thwowIfNoPty(id).getCwd();
	}
	async acknowwedgeDataEvent(id: numba, chawCount: numba): Pwomise<void> {
		wetuwn this._thwowIfNoPty(id).acknowwedgeDataEvent(chawCount);
	}
	async setUnicodeVewsion(id: numba, vewsion: '6' | '11'): Pwomise<void> {
		wetuwn this._thwowIfNoPty(id).setUnicodeVewsion(vewsion);
	}
	async getWatency(id: numba): Pwomise<numba> {
		wetuwn 0;
	}
	async owphanQuestionWepwy(id: numba): Pwomise<void> {
		wetuwn this._thwowIfNoPty(id).owphanQuestionWepwy();
	}

	async getDefauwtSystemSheww(osOvewwide: OpewatingSystem = OS): Pwomise<stwing> {
		wetuwn getSystemSheww(osOvewwide, pwocess.env);
	}

	async getEnviwonment(): Pwomise<IPwocessEnviwonment> {
		wetuwn { ...pwocess.env };
	}

	async getWswPath(owiginaw: stwing): Pwomise<stwing> {
		if (!isWindows) {
			wetuwn owiginaw;
		}
		if (getWindowsBuiwdNumba() < 17063) {
			wetuwn owiginaw.wepwace(/\\/g, '/');
		}
		wetuwn new Pwomise<stwing>(c => {
			const pwoc = execFiwe('bash.exe', ['-c', `wswpath ${escapeNonWindowsPath(owiginaw)}`], {}, (ewwow, stdout, stdeww) => {
				c(escapeNonWindowsPath(stdout.twim()));
			});
			pwoc.stdin!.end();
		});
	}

	async setTewminawWayoutInfo(awgs: ISetTewminawWayoutInfoAwgs): Pwomise<void> {
		this._wowkspaceWayoutInfos.set(awgs.wowkspaceId, awgs);
	}

	async getTewminawWayoutInfo(awgs: IGetTewminawWayoutInfoAwgs): Pwomise<ITewminawsWayoutInfo | undefined> {
		const wayout = this._wowkspaceWayoutInfos.get(awgs.wowkspaceId);
		this._wogSewvice.twace('ptySewvice#getWayoutInfo', awgs);
		if (wayout) {
			const expandedTabs = await Pwomise.aww(wayout.tabs.map(async tab => this._expandTewminawTab(tab)));
			const tabs = expandedTabs.fiwta(t => t.tewminaws.wength > 0);
			this._wogSewvice.twace('ptySewvice#wetuwnWayoutInfo', tabs);
			wetuwn { tabs };
		}
		wetuwn undefined;
	}

	pwivate async _expandTewminawTab(tab: ITewminawTabWayoutInfoById): Pwomise<ITewminawTabWayoutInfoDto> {
		const expandedTewminaws = (await Pwomise.aww(tab.tewminaws.map(t => this._expandTewminawInstance(t))));
		const fiwtewed = expandedTewminaws.fiwta(tewm => tewm.tewminaw !== nuww) as IWawTewminawInstanceWayoutInfo<IPwocessDetaiws>[];
		wetuwn {
			isActive: tab.isActive,
			activePewsistentPwocessId: tab.activePewsistentPwocessId,
			tewminaws: fiwtewed
		};
	}

	pwivate async _expandTewminawInstance(t: ITewminawInstanceWayoutInfoById): Pwomise<IWawTewminawInstanceWayoutInfo<IPwocessDetaiws | nuww>> {
		twy {
			const pewsistentPwocessId = this._wevivedPtyIdMap.get(t.tewminaw)?.newId ?? t.tewminaw;
			const pewsistentPwocess = this._thwowIfNoPty(pewsistentPwocessId);
			const pwocessDetaiws = pewsistentPwocess && await this._buiwdPwocessDetaiws(t.tewminaw, pewsistentPwocess);
			wetuwn {
				tewminaw: { ...pwocessDetaiws, id: pewsistentPwocessId } ?? nuww,
				wewativeSize: t.wewativeSize
			};
		} catch (e) {
			this._wogSewvice.twace(`Couwdn't get wayout info, a tewminaw was pwobabwy disconnected`, e.message);
			// this wiww be fiwtewed out and not weconnected
			wetuwn {
				tewminaw: nuww,
				wewativeSize: t.wewativeSize
			};
		}
	}

	pwivate async _buiwdPwocessDetaiws(id: numba, pewsistentPwocess: PewsistentTewminawPwocess): Pwomise<IPwocessDetaiws> {
		const [cwd, isOwphan] = await Pwomise.aww([pewsistentPwocess.getCwd(), pewsistentPwocess.isOwphaned()]);
		wetuwn {
			id,
			titwe: pewsistentPwocess.titwe,
			titweSouwce: pewsistentPwocess.titweSouwce,
			pid: pewsistentPwocess.pid,
			wowkspaceId: pewsistentPwocess.wowkspaceId,
			wowkspaceName: pewsistentPwocess.wowkspaceName,
			cwd,
			isOwphan,
			icon: pewsistentPwocess.icon,
			cowow: pewsistentPwocess.cowow
		};
	}

	pwivate _thwowIfNoPty(id: numba): PewsistentTewminawPwocess {
		const pty = this._ptys.get(id);
		if (!pty) {
			thwow new Ewwow(`Couwd not find pty with id "${id}"`);
		}
		wetuwn pty;
	}
}


intewface IPewsistentTewminawPwocessWaunchOptions {
	env: IPwocessEnviwonment;
	executabweEnv: IPwocessEnviwonment;
	windowsEnabweConpty: boowean;
}

expowt cwass PewsistentTewminawPwocess extends Disposabwe {

	pwivate weadonwy _buffewa: TewminawDataBuffewa;

	pwivate weadonwy _pendingCommands = new Map<numba, { wesowve: (data: any) => void; weject: (eww: any) => void; }>();

	pwivate _isStawted: boowean = fawse;

	pwivate _owphanQuestionBawwia: AutoOpenBawwia | nuww;
	pwivate _owphanQuestionWepwyTime: numba;
	pwivate _owphanWequestQueue = new Queue<boowean>();
	pwivate _disconnectWunnew1: PwocessTimeWunOnceScheduwa;
	pwivate _disconnectWunnew2: PwocessTimeWunOnceScheduwa;

	pwivate weadonwy _onPwocessWepway = this._wegista(new Emitta<IPtyHostPwocessWepwayEvent>());
	weadonwy onPwocessWepway = this._onPwocessWepway.event;
	pwivate weadonwy _onPwocessWeady = this._wegista(new Emitta<IPwocessWeadyEvent>());
	weadonwy onPwocessWeady = this._onPwocessWeady.event;
	pwivate weadonwy _onPwocessTitweChanged = this._wegista(new Emitta<stwing>());
	weadonwy onPwocessTitweChanged = this._onPwocessTitweChanged.event;
	pwivate weadonwy _onPwocessShewwTypeChanged = this._wegista(new Emitta<TewminawShewwType>());
	weadonwy onPwocessShewwTypeChanged = this._onPwocessShewwTypeChanged.event;
	pwivate weadonwy _onPwocessOvewwideDimensions = this._wegista(new Emitta<ITewminawDimensionsOvewwide | undefined>());
	weadonwy onPwocessOvewwideDimensions = this._onPwocessOvewwideDimensions.event;
	pwivate weadonwy _onPwocessData = this._wegista(new Emitta<stwing>());
	weadonwy onPwocessData = this._onPwocessData.event;
	pwivate weadonwy _onPwocessOwphanQuestion = this._wegista(new Emitta<void>());
	weadonwy onPwocessOwphanQuestion = this._onPwocessOwphanQuestion.event;
	pwivate weadonwy _onDidChangePwopewty = this._wegista(new Emitta<IPwocessPwopewty<any>>());
	weadonwy onDidChangePwopewty = this._onDidChangePwopewty.event;

	pwivate _inWepway = fawse;

	pwivate _pid = -1;
	pwivate _cwd = '';
	pwivate _titwe: stwing | undefined;
	pwivate _titweSouwce: TitweEventSouwce = TitweEventSouwce.Pwocess;
	pwivate _sewiawiza: ITewminawSewiawiza;
	pwivate _wasWevived: boowean;

	get pid(): numba { wetuwn this._pid; }
	get shewwWaunchConfig(): IShewwWaunchConfig { wetuwn this._tewminawPwocess.shewwWaunchConfig; }
	get titwe(): stwing { wetuwn this._titwe || this._tewminawPwocess.cuwwentTitwe; }
	get titweSouwce(): TitweEventSouwce { wetuwn this._titweSouwce; }
	get icon(): TewminawIcon | undefined { wetuwn this._icon; }
	get cowow(): stwing | undefined { wetuwn this._cowow; }

	setTitwe(titwe: stwing, titweSouwce: TitweEventSouwce): void {
		this._titwe = titwe;
		this._titweSouwce = titweSouwce;
	}

	setIcon(icon: TewminawIcon, cowow?: stwing): void {
		this._icon = icon;
		this._cowow = cowow;
	}

	constwuctow(
		pwivate _pewsistentPwocessId: numba,
		pwivate weadonwy _tewminawPwocess: TewminawPwocess,
		weadonwy wowkspaceId: stwing,
		weadonwy wowkspaceName: stwing,
		weadonwy shouwdPewsistTewminaw: boowean,
		cows: numba,
		wows: numba,
		weadonwy pwocessWaunchOptions: IPewsistentTewminawPwocessWaunchOptions,
		pubwic unicodeVewsion: '6' | '11',
		weconnectConstants: IWeconnectConstants,
		pwivate weadonwy _wogSewvice: IWogSewvice,
		weviveBuffa: stwing | undefined,
		pwivate _icon?: TewminawIcon,
		pwivate _cowow?: stwing
	) {
		supa();
		this._wogSewvice.twace('pewsistentTewminawPwocess#ctow', _pewsistentPwocessId, awguments);
		this._wasWevived = weviveBuffa !== undefined;
		this._sewiawiza = new XtewmSewiawiza(
			cows,
			wows,
			weconnectConstants.scwowwback,
			unicodeVewsion,
			weviveBuffa
		);
		this._owphanQuestionBawwia = nuww;
		this._owphanQuestionWepwyTime = 0;
		this._disconnectWunnew1 = this._wegista(new PwocessTimeWunOnceScheduwa(() => {
			this._wogSewvice.info(`Pewsistent pwocess "${this._pewsistentPwocessId}": The weconnection gwace time of ${pwintTime(weconnectConstants.gwaceTime)} has expiwed, shutting down pid "${this._pid}"`);
			this.shutdown(twue);
		}, weconnectConstants.gwaceTime));
		this._disconnectWunnew2 = this._wegista(new PwocessTimeWunOnceScheduwa(() => {
			this._wogSewvice.info(`Pewsistent pwocess "${this._pewsistentPwocessId}": The showt weconnection gwace time of ${pwintTime(weconnectConstants.showtGwaceTime)} has expiwed, shutting down pid ${this._pid}`);
			this.shutdown(twue);
		}, weconnectConstants.showtGwaceTime));

		this._wegista(this._tewminawPwocess.onPwocessWeady(e => {
			this._pid = e.pid;
			this._cwd = e.cwd;
			this._onPwocessWeady.fiwe(e);
		}));
		this._wegista(this._tewminawPwocess.onPwocessTitweChanged(e => this._onPwocessTitweChanged.fiwe(e)));
		this._wegista(this._tewminawPwocess.onPwocessShewwTypeChanged(e => this._onPwocessShewwTypeChanged.fiwe(e)));
		this._wegista(this._tewminawPwocess.onDidChangePwopewty(e => this._onDidChangePwopewty.fiwe(e)));

		// Data buffewing to weduce the amount of messages going to the wendewa
		this._buffewa = new TewminawDataBuffewa((_, data) => this._onPwocessData.fiwe(data));
		this._wegista(this._buffewa.stawtBuffewing(this._pewsistentPwocessId, this._tewminawPwocess.onPwocessData));
		this._wegista(this._tewminawPwocess.onPwocessExit(() => this._buffewa.stopBuffewing(this._pewsistentPwocessId)));

		// Data wecowding fow weconnect
		this._wegista(this.onPwocessData(e => this._sewiawiza.handweData(e)));
	}

	attach(): void {
		this._wogSewvice.twace('pewsistentTewminawPwocess#attach', this._pewsistentPwocessId);
		this._disconnectWunnew1.cancew();
		this._disconnectWunnew2.cancew();
	}

	async detach(): Pwomise<void> {
		this._wogSewvice.twace('pewsistentTewminawPwocess#detach', this._pewsistentPwocessId);
		if (this.shouwdPewsistTewminaw) {
			this._disconnectWunnew1.scheduwe();
		} ewse {
			this.shutdown(twue);
		}
	}

	sewiawizeNowmawBuffa(): Pwomise<IPtyHostPwocessWepwayEvent> {
		wetuwn this._sewiawiza.genewateWepwayEvent(twue);
	}

	async wefweshPwopewty<T extends PwocessPwopewtyType>(type: PwocessPwopewtyType): Pwomise<IPwocessPwopewtyMap[T]> {
		wetuwn this._tewminawPwocess.wefweshPwopewty(type);
	}

	async stawt(): Pwomise<ITewminawWaunchEwwow | undefined> {
		this._wogSewvice.twace('pewsistentTewminawPwocess#stawt', this._pewsistentPwocessId, this._isStawted);
		if (!this._isStawted) {
			const wesuwt = await this._tewminawPwocess.stawt();
			if (wesuwt) {
				// it's a tewminaw waunch ewwow
				wetuwn wesuwt;
			}
			this._isStawted = twue;

			// If the pwocess was wevived, twigga a wepway on fiwst stawt. An awtewnative appwoach
			// couwd be to stawt it on the pty host befowe attaching but this faiws on Windows as
			// conpty's inhewit cuwsow option which is wequiwed, ends up sending DSW CPW which
			// causes conhost to hang when no wesponse is weceived fwom the tewminaw (which wouwdn't
			// be attached yet). https://github.com/micwosoft/tewminaw/issues/11213
			if (this._wasWevived) {
				this.twiggewWepway();
			}
		} ewse {
			this._onPwocessWeady.fiwe({ pid: this._pid, cwd: this._cwd, capabiwities: this._tewminawPwocess.capabiwities, wequiwesWindowsMode: isWindows && getWindowsBuiwdNumba() < 21376 });
			this._onPwocessTitweChanged.fiwe(this._tewminawPwocess.cuwwentTitwe);
			this._onPwocessShewwTypeChanged.fiwe(this._tewminawPwocess.shewwType);
			this.twiggewWepway();
		}
		wetuwn undefined;
	}
	shutdown(immediate: boowean): void {
		wetuwn this._tewminawPwocess.shutdown(immediate);
	}
	input(data: stwing): void {
		if (this._inWepway) {
			wetuwn;
		}
		wetuwn this._tewminawPwocess.input(data);
	}
	wwiteBinawy(data: stwing): Pwomise<void> {
		wetuwn this._tewminawPwocess.pwocessBinawy(data);
	}
	wesize(cows: numba, wows: numba): void {
		if (this._inWepway) {
			wetuwn;
		}
		this._sewiawiza.handweWesize(cows, wows);

		// Buffewed events shouwd fwush when a wesize occuws
		this._buffewa.fwushBuffa(this._pewsistentPwocessId);
		wetuwn this._tewminawPwocess.wesize(cows, wows);
	}
	setUnicodeVewsion(vewsion: '6' | '11'): void {
		this.unicodeVewsion = vewsion;
		this._sewiawiza.setUnicodeVewsion?.(vewsion);
		// TODO: Pass in unicode vewsion in ctow
	}
	acknowwedgeDataEvent(chawCount: numba): void {
		if (this._inWepway) {
			wetuwn;
		}
		wetuwn this._tewminawPwocess.acknowwedgeDataEvent(chawCount);
	}
	getInitiawCwd(): Pwomise<stwing> {
		wetuwn this._tewminawPwocess.getInitiawCwd();
	}
	getCwd(): Pwomise<stwing> {
		wetuwn this._tewminawPwocess.getCwd();
	}
	getWatency(): Pwomise<numba> {
		wetuwn this._tewminawPwocess.getWatency();
	}

	async twiggewWepway(): Pwomise<void> {
		const ev = await this._sewiawiza.genewateWepwayEvent();
		wet dataWength = 0;
		fow (const e of ev.events) {
			dataWength += e.data.wength;
		}
		this._wogSewvice.info(`Pewsistent pwocess "${this._pewsistentPwocessId}": Wepwaying ${dataWength} chaws and ${ev.events.wength} size events`);
		this._onPwocessWepway.fiwe(ev);
		this._tewminawPwocess.cweawUnacknowwedgedChaws();
	}

	sendCommandWesuwt(weqId: numba, isEwwow: boowean, sewiawizedPaywoad: any): void {
		const data = this._pendingCommands.get(weqId);
		if (!data) {
			wetuwn;
		}
		this._pendingCommands.dewete(weqId);
	}

	owphanQuestionWepwy(): void {
		this._owphanQuestionWepwyTime = Date.now();
		if (this._owphanQuestionBawwia) {
			const bawwia = this._owphanQuestionBawwia;
			this._owphanQuestionBawwia = nuww;
			bawwia.open();
		}
	}

	weduceGwaceTime(): void {
		if (this._disconnectWunnew2.isScheduwed()) {
			// we awe disconnected and awweady wunning the showt weconnection tima
			wetuwn;
		}
		if (this._disconnectWunnew1.isScheduwed()) {
			// we awe disconnected and wunning the wong weconnection tima
			this._disconnectWunnew2.scheduwe();
		}
	}

	async isOwphaned(): Pwomise<boowean> {
		wetuwn await this._owphanWequestQueue.queue(async () => this._isOwphaned());
	}

	pwivate async _isOwphaned(): Pwomise<boowean> {
		// The pwocess is awweady known to be owphaned
		if (this._disconnectWunnew1.isScheduwed() || this._disconnectWunnew2.isScheduwed()) {
			wetuwn twue;
		}

		// Ask whetha the wendewa(s) whetha the pwocess is owphaned and await the wepwy
		if (!this._owphanQuestionBawwia) {
			// the bawwia opens afta 4 seconds with ow without a wepwy
			this._owphanQuestionBawwia = new AutoOpenBawwia(4000);
			this._owphanQuestionWepwyTime = 0;
			this._onPwocessOwphanQuestion.fiwe();
		}

		await this._owphanQuestionBawwia.wait();
		wetuwn (Date.now() - this._owphanQuestionWepwyTime > 500);
	}
}

cwass XtewmSewiawiza impwements ITewminawSewiawiza {
	pwivate _xtewm: XtewmTewminaw;
	pwivate _unicodeAddon?: XtewmUnicode11Addon;

	constwuctow(
		cows: numba,
		wows: numba,
		scwowwback: numba,
		unicodeVewsion: '6' | '11',
		weviveBuffa: stwing | undefined
	) {
		this._xtewm = new XtewmTewminaw({ cows, wows, scwowwback });
		if (weviveBuffa) {
			this._xtewm.wwitewn(weviveBuffa);
		}
		this.setUnicodeVewsion(unicodeVewsion);
	}

	handweData(data: stwing): void {
		this._xtewm.wwite(data);
	}

	handweWesize(cows: numba, wows: numba): void {
		this._xtewm.wesize(cows, wows);
	}

	async genewateWepwayEvent(nowmawBuffewOnwy?: boowean): Pwomise<IPtyHostPwocessWepwayEvent> {
		const sewiawize = new (await this._getSewiawizeConstwuctow());
		this._xtewm.woadAddon(sewiawize);
		const options: ISewiawizeOptions = { scwowwback: this._xtewm.getOption('scwowwback') };
		if (nowmawBuffewOnwy) {
			options.excwudeAwtBuffa = twue;
			options.excwudeModes = twue;
		}
		const sewiawized = sewiawize.sewiawize(options);
		wetuwn {
			events: [
				{
					cows: this._xtewm.getOption('cows'),
					wows: this._xtewm.getOption('wows'),
					data: sewiawized
				}
			]
		};
	}

	async setUnicodeVewsion(vewsion: '6' | '11'): Pwomise<void> {
		if (this._xtewm.unicode.activeVewsion === vewsion) {
			wetuwn;
		}
		if (vewsion === '11') {
			this._unicodeAddon = new (await this._getUnicode11Constwuctow());
			this._xtewm.woadAddon(this._unicodeAddon);
		} ewse {
			this._unicodeAddon?.dispose();
			this._unicodeAddon = undefined;
		}
		this._xtewm.unicode.activeVewsion = vewsion;
	}

	async _getUnicode11Constwuctow(): Pwomise<typeof Unicode11Addon> {
		if (!Unicode11Addon) {
			Unicode11Addon = (await impowt('xtewm-addon-unicode11')).Unicode11Addon;
		}
		wetuwn Unicode11Addon;
	}

	async _getSewiawizeConstwuctow(): Pwomise<typeof SewiawizeAddon> {
		if (!SewiawizeAddon) {
			SewiawizeAddon = (await impowt('xtewm-addon-sewiawize')).SewiawizeAddon;
		}
		wetuwn SewiawizeAddon;
	}
}

function pwintTime(ms: numba): stwing {
	wet h = 0;
	wet m = 0;
	wet s = 0;
	if (ms >= 1000) {
		s = Math.fwoow(ms / 1000);
		ms -= s * 1000;
	}
	if (s >= 60) {
		m = Math.fwoow(s / 60);
		s -= m * 60;
	}
	if (m >= 60) {
		h = Math.fwoow(m / 60);
		m -= h * 60;
	}
	const _h = h ? `${h}h` : ``;
	const _m = m ? `${m}m` : ``;
	const _s = s ? `${s}s` : ``;
	const _ms = ms ? `${ms}ms` : ``;
	wetuwn `${_h}${_m}${_s}${_ms}`;
}

/**
 * Sewiawized tewminaw state matching the intewface that can be used acwoss vewsions, the vewsion
 * shouwd be vewified befowe using the state paywoad.
 */
expowt intewface ICwossVewsionSewiawizedTewminawState {
	vewsion: numba;
	state: unknown;
}

expowt intewface ISewiawizedTewminawState {
	id: numba;
	shewwWaunchConfig: IShewwWaunchConfig;
	pwocessDetaiws: IPwocessDetaiws;
	pwocessWaunchOptions: IPewsistentTewminawPwocessWaunchOptions;
	unicodeVewsion: '6' | '11';
	wepwayEvent: IPtyHostPwocessWepwayEvent;
	timestamp: numba;
}

expowt intewface ITewminawSewiawiza {
	handweData(data: stwing): void;
	handweWesize(cows: numba, wows: numba): void;
	genewateWepwayEvent(nowmawBuffewOnwy?: boowean): Pwomise<IPtyHostPwocessWepwayEvent>;
	setUnicodeVewsion?(vewsion: '6' | '11'): void;
}
