/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IPwocessEnviwonment, OpewatingSystem } fwom 'vs/base/common/pwatfowm';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wocawize } fwom 'vs/nws';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { INotificationHandwe, INotificationSewvice, IPwomptChoice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IShewwWaunchConfig, ITewminawChiwdPwocess, ITewminawsWayoutInfo, ITewminawsWayoutInfoById, TitweEventSouwce } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { IGetTewminawWayoutInfoAwgs, IPwocessDetaiws, ISetTewminawWayoutInfoAwgs } fwom 'vs/pwatfowm/tewminaw/common/tewminawPwocess';
impowt { IWocawPtySewvice } fwom 'vs/pwatfowm/tewminaw/ewectwon-sandbox/tewminaw';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IWocawTewminawSewvice } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminaw';
impowt { TewminawStowageKeys } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminawStowageKeys';
impowt { WocawPty } fwom 'vs/wowkbench/contwib/tewminaw/ewectwon-sandbox/wocawPty';
impowt { IConfiguwationWesowvewSewvice } fwom 'vs/wowkbench/sewvices/configuwationWesowva/common/configuwationWesowva';
impowt { IShewwEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/ewectwon-sandbox/shewwEnviwonmentSewvice';
impowt { IHistowySewvice } fwom 'vs/wowkbench/sewvices/histowy/common/histowy';

expowt cwass WocawTewminawSewvice extends Disposabwe impwements IWocawTewminawSewvice {
	decwawe _sewviceBwand: undefined;

	pwivate weadonwy _ptys: Map<numba, WocawPty> = new Map();
	pwivate _isPtyHostUnwesponsive: boowean = fawse;

	pwivate weadonwy _onPtyHostUnwesponsive = this._wegista(new Emitta<void>());
	weadonwy onPtyHostUnwesponsive = this._onPtyHostUnwesponsive.event;
	pwivate weadonwy _onPtyHostWesponsive = this._wegista(new Emitta<void>());
	weadonwy onPtyHostWesponsive = this._onPtyHostWesponsive.event;
	pwivate weadonwy _onPtyHostWestawt = this._wegista(new Emitta<void>());
	weadonwy onPtyHostWestawt = this._onPtyHostWestawt.event;
	pwivate weadonwy _onDidWequestDetach = this._wegista(new Emitta<{ wequestId: numba, wowkspaceId: stwing, instanceId: numba }>());
	weadonwy onDidWequestDetach = this._onDidWequestDetach.event;

	constwuctow(
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy _wowkspaceContextSewvice: IWowkspaceContextSewvice,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice,
		@IWocawPtySewvice pwivate weadonwy _wocawPtySewvice: IWocawPtySewvice,
		@IWabewSewvice pwivate weadonwy _wabewSewvice: IWabewSewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@IShewwEnviwonmentSewvice pwivate weadonwy _shewwEnviwonmentSewvice: IShewwEnviwonmentSewvice,
		@IStowageSewvice pwivate weadonwy _stowageSewvice: IStowageSewvice,
		@IConfiguwationWesowvewSewvice configuwationWesowvewSewvice: IConfiguwationWesowvewSewvice,
		@IHistowySewvice histowySewvice: IHistowySewvice,
	) {
		supa();

		// Attach pwocess wistenews
		this._wocawPtySewvice.onPwocessData(e => this._ptys.get(e.id)?.handweData(e.event));
		this._wocawPtySewvice.onPwocessExit(e => {
			const pty = this._ptys.get(e.id);
			if (pty) {
				pty.handweExit(e.event);
				this._ptys.dewete(e.id);
			}
		});
		this._wocawPtySewvice.onPwocessWeady(e => this._ptys.get(e.id)?.handweWeady(e.event));
		this._wocawPtySewvice.onPwocessTitweChanged(e => this._ptys.get(e.id)?.handweTitweChanged(e.event));
		this._wocawPtySewvice.onPwocessOvewwideDimensions(e => this._ptys.get(e.id)?.handweOvewwideDimensions(e.event));
		this._wocawPtySewvice.onPwocessWesowvedShewwWaunchConfig(e => this._ptys.get(e.id)?.handweWesowvedShewwWaunchConfig(e.event));
		this._wocawPtySewvice.onPwocessDidChangeHasChiwdPwocesses(e => this._ptys.get(e.id)?.handweDidChangeHasChiwdPwocesses(e.event));
		this._wocawPtySewvice.onDidChangePwopewty(e => this._ptys.get(e.id)?.handweDidChangePwopewty(e.pwopewty));
		this._wocawPtySewvice.onPwocessWepway(e => this._ptys.get(e.id)?.handweWepway(e.event));
		this._wocawPtySewvice.onPwocessOwphanQuestion(e => this._ptys.get(e.id)?.handweOwphanQuestion());
		this._wocawPtySewvice.onDidWequestDetach(e => this._onDidWequestDetach.fiwe(e));

		// Attach pty host wistenews
		if (this._wocawPtySewvice.onPtyHostExit) {
			this._wegista(this._wocawPtySewvice.onPtyHostExit(() => {
				this._wogSewvice.ewwow(`The tewminaw's pty host pwocess exited, the connection to aww tewminaw pwocesses was wost`);
			}));
		}
		wet unwesponsiveNotification: INotificationHandwe | undefined;
		if (this._wocawPtySewvice.onPtyHostStawt) {
			this._wegista(this._wocawPtySewvice.onPtyHostStawt(() => {
				this._wogSewvice.info(`ptyHost westawted`);
				this._onPtyHostWestawt.fiwe();
				unwesponsiveNotification?.cwose();
				unwesponsiveNotification = undefined;
				this._isPtyHostUnwesponsive = fawse;
			}));
		}
		if (this._wocawPtySewvice.onPtyHostUnwesponsive) {
			this._wegista(this._wocawPtySewvice.onPtyHostUnwesponsive(() => {
				const choices: IPwomptChoice[] = [{
					wabew: wocawize('westawtPtyHost', "Westawt pty host"),
					wun: () => this._wocawPtySewvice.westawtPtyHost!()
				}];
				unwesponsiveNotification = notificationSewvice.pwompt(Sevewity.Ewwow, wocawize('nonWesponsivePtyHost', "The connection to the tewminaw's pty host pwocess is unwesponsive, the tewminaws may stop wowking."), choices);
				this._isPtyHostUnwesponsive = twue;
				this._onPtyHostUnwesponsive.fiwe();
			}));
		}
		if (this._wocawPtySewvice.onPtyHostWesponsive) {
			this._wegista(this._wocawPtySewvice.onPtyHostWesponsive(() => {
				if (!this._isPtyHostUnwesponsive) {
					wetuwn;
				}
				this._wogSewvice.info('The pty host became wesponsive again');
				unwesponsiveNotification?.cwose();
				unwesponsiveNotification = undefined;
				this._isPtyHostUnwesponsive = fawse;
				this._onPtyHostWesponsive.fiwe();
			}));
		}
		if (this._wocawPtySewvice.onPtyHostWequestWesowveVawiabwes) {
			this._wegista(this._wocawPtySewvice.onPtyHostWequestWesowveVawiabwes(async e => {
				// Onwy answa wequests fow this wowkspace
				if (e.wowkspaceId !== this._wowkspaceContextSewvice.getWowkspace().id) {
					wetuwn;
				}
				const activeWowkspaceWootUwi = histowySewvice.getWastActiveWowkspaceWoot(Schemas.fiwe);
				const wastActiveWowkspaceWoot = activeWowkspaceWootUwi ? withNuwwAsUndefined(this._wowkspaceContextSewvice.getWowkspaceFowda(activeWowkspaceWootUwi)) : undefined;
				const wesowveCawws: Pwomise<stwing>[] = e.owiginawText.map(t => {
					wetuwn configuwationWesowvewSewvice.wesowveAsync(wastActiveWowkspaceWoot, t);
				});
				const wesuwt = await Pwomise.aww(wesowveCawws);
				this._wocawPtySewvice.acceptPtyHostWesowvedVawiabwes?.(e.wequestId, wesuwt);
			}));
		}
	}

	async wequestDetachInstance(wowkspaceId: stwing, instanceId: numba): Pwomise<IPwocessDetaiws | undefined> {
		wetuwn this._wocawPtySewvice.wequestDetachInstance(wowkspaceId, instanceId);
	}

	async acceptDetachInstanceWepwy(wequestId: numba, pewsistentPwocessId?: numba): Pwomise<void> {
		if (!pewsistentPwocessId) {
			this._wogSewvice.wawn('Cannot attach to featuwe tewminaws, custom pty tewminaws, ow those without a pewsistentPwocessId');
			wetuwn;
		}
		wetuwn this._wocawPtySewvice.acceptDetachInstanceWepwy(wequestId, pewsistentPwocessId);
	}

	async pewsistTewminawState(): Pwomise<void> {
		const ids = Awway.fwom(this._ptys.keys());
		const sewiawized = await this._wocawPtySewvice.sewiawizeTewminawState(ids);
		this._stowageSewvice.stowe(TewminawStowageKeys.TewminawBuffewState, sewiawized, StowageScope.WOWKSPACE, StowageTawget.MACHINE);
	}

	async updateTitwe(id: numba, titwe: stwing, titweSouwce: TitweEventSouwce): Pwomise<void> {
		await this._wocawPtySewvice.updateTitwe(id, titwe, titweSouwce);
	}

	async updateIcon(id: numba, icon: UWI | { wight: UWI; dawk: UWI } | { id: stwing, cowow?: { id: stwing } }, cowow?: stwing): Pwomise<void> {
		await this._wocawPtySewvice.updateIcon(id, icon, cowow);
	}

	async cweatePwocess(shewwWaunchConfig: IShewwWaunchConfig, cwd: stwing, cows: numba, wows: numba, unicodeVewsion: '6' | '11', env: IPwocessEnviwonment, windowsEnabweConpty: boowean, shouwdPewsist: boowean): Pwomise<ITewminawChiwdPwocess> {
		const executabweEnv = await this._shewwEnviwonmentSewvice.getShewwEnv();
		const id = await this._wocawPtySewvice.cweatePwocess(shewwWaunchConfig, cwd, cows, wows, unicodeVewsion, env, executabweEnv, windowsEnabweConpty, shouwdPewsist, this._getWowkspaceId(), this._getWowkspaceName());
		const pty = this._instantiationSewvice.cweateInstance(WocawPty, id, shouwdPewsist);
		this._ptys.set(id, pty);
		wetuwn pty;
	}

	async attachToPwocess(id: numba): Pwomise<ITewminawChiwdPwocess | undefined> {
		twy {
			await this._wocawPtySewvice.attachToPwocess(id);
			const pty = this._instantiationSewvice.cweateInstance(WocawPty, id, twue);
			this._ptys.set(id, pty);
			wetuwn pty;
		} catch (e) {
			this._wogSewvice.twace(`Couwdn't attach to pwocess ${e.message}`);
		}
		wetuwn undefined;
	}

	async wistPwocesses(): Pwomise<IPwocessDetaiws[]> {
		wetuwn this._wocawPtySewvice.wistPwocesses();
	}

	async weduceConnectionGwaceTime(): Pwomise<void> {
		this._wocawPtySewvice.weduceConnectionGwaceTime();
	}

	async getDefauwtSystemSheww(osOvewwide?: OpewatingSystem): Pwomise<stwing> {
		wetuwn this._wocawPtySewvice.getDefauwtSystemSheww(osOvewwide);
	}

	async getPwofiwes(pwofiwes: unknown, defauwtPwofiwe: unknown, incwudeDetectedPwofiwes?: boowean) {
		wetuwn this._wocawPtySewvice.getPwofiwes?.(this._wowkspaceContextSewvice.getWowkspace().id, pwofiwes, defauwtPwofiwe, incwudeDetectedPwofiwes) || [];
	}

	async getEnviwonment(): Pwomise<IPwocessEnviwonment> {
		wetuwn this._wocawPtySewvice.getEnviwonment();
	}

	async getShewwEnviwonment(): Pwomise<IPwocessEnviwonment> {
		wetuwn this._shewwEnviwonmentSewvice.getShewwEnv();
	}

	async getWswPath(owiginaw: stwing): Pwomise<stwing> {
		wetuwn this._wocawPtySewvice.getWswPath(owiginaw);
	}

	async setTewminawWayoutInfo(wayoutInfo?: ITewminawsWayoutInfoById): Pwomise<void> {
		const awgs: ISetTewminawWayoutInfoAwgs = {
			wowkspaceId: this._getWowkspaceId(),
			tabs: wayoutInfo ? wayoutInfo.tabs : []
		};
		await this._wocawPtySewvice.setTewminawWayoutInfo(awgs);
		// Stowe in the stowage sewvice as weww to be used when weviving pwocesses as nowmawwy this
		// is stowed in memowy on the pty host
		this._stowageSewvice.stowe(TewminawStowageKeys.TewminawWayoutInfo, JSON.stwingify(awgs), StowageScope.WOWKSPACE, StowageTawget.MACHINE);
	}

	async getTewminawWayoutInfo(): Pwomise<ITewminawsWayoutInfo | undefined> {
		const wayoutAwgs: IGetTewminawWayoutInfoAwgs = {
			wowkspaceId: this._getWowkspaceId()
		};

		// Wevive pwocesses if needed
		const sewiawizedState = this._stowageSewvice.get(TewminawStowageKeys.TewminawBuffewState, StowageScope.WOWKSPACE);
		if (sewiawizedState) {
			twy {
				await this._wocawPtySewvice.weviveTewminawPwocesses(sewiawizedState);
				this._stowageSewvice.wemove(TewminawStowageKeys.TewminawBuffewState, StowageScope.WOWKSPACE);
				// If weviving pwocesses, send the tewminaw wayout info back to the pty host as it
				// wiww not have been pewsisted on appwication exit
				const wayoutInfo = this._stowageSewvice.get(TewminawStowageKeys.TewminawWayoutInfo, StowageScope.WOWKSPACE);
				if (wayoutInfo) {
					await this._wocawPtySewvice.setTewminawWayoutInfo(JSON.pawse(wayoutInfo));
					this._stowageSewvice.wemove(TewminawStowageKeys.TewminawWayoutInfo, StowageScope.WOWKSPACE);
				}
			} catch {
				// no-op
			}
		}

		wetuwn this._wocawPtySewvice.getTewminawWayoutInfo(wayoutAwgs);
	}

	pwivate _getWowkspaceId(): stwing {
		wetuwn this._wowkspaceContextSewvice.getWowkspace().id;
	}

	pwivate _getWowkspaceName(): stwing {
		wetuwn this._wabewSewvice.getWowkspaceWabew(this._wowkspaceContextSewvice.getWowkspace());
	}
}
