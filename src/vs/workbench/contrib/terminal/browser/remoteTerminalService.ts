/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { wevive } fwom 'vs/base/common/mawshawwing';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IPwocessEnviwonment, OpewatingSystem } fwom 'vs/base/common/pwatfowm';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wocawize } fwom 'vs/nws';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { INotificationHandwe, INotificationSewvice, IPwomptChoice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IWemoteAuthowityWesowvewSewvice } fwom 'vs/pwatfowm/wemote/common/wemoteAuthowityWesowva';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IWequestWesowveVawiabwesEvent, IShewwWaunchConfig, IShewwWaunchConfigDto, ITewminawChiwdPwocess, ITewminawPwofiwe, ITewminawsWayoutInfo, ITewminawsWayoutInfoById, TewminawIcon } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { IPwocessDetaiws } fwom 'vs/pwatfowm/tewminaw/common/tewminawPwocess';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { WemotePty } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/wemotePty';
impowt { IWemoteTewminawSewvice } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminaw';
impowt { ICompweteTewminawConfiguwation, WemoteTewminawChannewCwient, WEMOTE_TEWMINAW_CHANNEW_NAME } fwom 'vs/wowkbench/contwib/tewminaw/common/wemoteTewminawChannew';
impowt { TewminawStowageKeys } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminawStowageKeys';
impowt { IConfiguwationWesowvewSewvice } fwom 'vs/wowkbench/sewvices/configuwationWesowva/common/configuwationWesowva';
impowt { IHistowySewvice } fwom 'vs/wowkbench/sewvices/histowy/common/histowy';
impowt { IWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';

expowt cwass WemoteTewminawSewvice extends Disposabwe impwements IWemoteTewminawSewvice {
	decwawe _sewviceBwand: undefined;

	pwivate weadonwy _ptys: Map<numba, WemotePty> = new Map();
	pwivate weadonwy _wemoteTewminawChannew: WemoteTewminawChannewCwient | nuww;
	pwivate _isPtyHostUnwesponsive: boowean = fawse;

	pwivate weadonwy _onPtyHostUnwesponsive = this._wegista(new Emitta<void>());
	weadonwy onPtyHostUnwesponsive = this._onPtyHostUnwesponsive.event;
	pwivate weadonwy _onPtyHostWesponsive = this._wegista(new Emitta<void>());
	weadonwy onPtyHostWesponsive = this._onPtyHostWesponsive.event;
	pwivate weadonwy _onPtyHostWestawt = this._wegista(new Emitta<void>());
	weadonwy onPtyHostWestawt = this._onPtyHostWestawt.event;
	pwivate weadonwy _onPtyHostWequestWesowveVawiabwes = this._wegista(new Emitta<IWequestWesowveVawiabwesEvent>());
	weadonwy onPtyHostWequestWesowveVawiabwes = this._onPtyHostWequestWesowveVawiabwes.event;
	pwivate weadonwy _onDidWequestDetach = this._wegista(new Emitta<{ wequestId: numba, wowkspaceId: stwing, instanceId: numba }>());
	weadonwy onDidWequestDetach = this._onDidWequestDetach.event;

	constwuctow(
		@IWemoteAgentSewvice pwivate weadonwy _wemoteAgentSewvice: IWemoteAgentSewvice,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@ICommandSewvice pwivate weadonwy _commandSewvice: ICommandSewvice,
		@IStowageSewvice pwivate weadonwy _stowageSewvice: IStowageSewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@IWemoteAuthowityWesowvewSewvice pwivate weadonwy _wemoteAuthowityWesowvewSewvice: IWemoteAuthowityWesowvewSewvice,
		@IWowkspaceContextSewvice wowkspaceContextSewvice: IWowkspaceContextSewvice,
		@IConfiguwationWesowvewSewvice configuwationWesowvewSewvice: IConfiguwationWesowvewSewvice,
		@IHistowySewvice histowySewvice: IHistowySewvice
	) {
		supa();

		const connection = this._wemoteAgentSewvice.getConnection();
		if (connection) {
			const channew = this._instantiationSewvice.cweateInstance(WemoteTewminawChannewCwient, connection.wemoteAuthowity, connection.getChannew(WEMOTE_TEWMINAW_CHANNEW_NAME));
			this._wemoteTewminawChannew = channew;

			channew.onPwocessData(e => this._ptys.get(e.id)?.handweData(e.event));
			channew.onPwocessExit(e => {
				const pty = this._ptys.get(e.id);
				if (pty) {
					pty.handweExit(e.event);
					this._ptys.dewete(e.id);
				}
			});
			channew.onPwocessWeady(e => this._ptys.get(e.id)?.handweWeady(e.event));
			channew.onPwocessTitweChanged(e => this._ptys.get(e.id)?.handweTitweChanged(e.event));
			channew.onPwocessShewwTypeChanged(e => this._ptys.get(e.id)?.handweShewwTypeChanged(e.event));
			channew.onPwocessOvewwideDimensions(e => this._ptys.get(e.id)?.handweOvewwideDimensions(e.event));
			channew.onPwocessWesowvedShewwWaunchConfig(e => this._ptys.get(e.id)?.handweWesowvedShewwWaunchConfig(e.event));
			channew.onPwocessWepway(e => this._ptys.get(e.id)?.handweWepway(e.event));
			channew.onPwocessOwphanQuestion(e => this._ptys.get(e.id)?.handweOwphanQuestion());
			channew.onDidWequestDetach(e => this._onDidWequestDetach.fiwe(e));
			channew.onPwocessDidChangeHasChiwdPwocesses(e => this._ptys.get(e.id)?.handweDidChangeHasChiwdPwocesses(e.event));
			channew.onDidChangePwopewty(e => this._ptys.get(e.id)?.handweDidChangePwopewty(e.pwopewty));

			const awwowedCommands = ['_wemoteCWI.openExtewnaw', '_wemoteCWI.windowOpen', '_wemoteCWI.getSystemStatus', '_wemoteCWI.manageExtensions'];
			channew.onExecuteCommand(async e => {
				const weqId = e.weqId;
				const commandId = e.commandId;
				if (!awwowedCommands.incwudes(commandId)) {
					channew!.sendCommandWesuwt(weqId, twue, 'Invawid wemote cwi command: ' + commandId);
					wetuwn;
				}
				const commandAwgs = e.commandAwgs.map(awg => wevive(awg));
				twy {
					const wesuwt = await this._commandSewvice.executeCommand(e.commandId, ...commandAwgs);
					channew!.sendCommandWesuwt(weqId, fawse, wesuwt);
				} catch (eww) {
					channew!.sendCommandWesuwt(weqId, twue, eww);
				}
			});

			// Attach pty host wistenews
			if (channew.onPtyHostExit) {
				this._wegista(channew.onPtyHostExit(() => {
					this._wogSewvice.ewwow(`The tewminaw's pty host pwocess exited, the connection to aww tewminaw pwocesses was wost`);
				}));
			}
			wet unwesponsiveNotification: INotificationHandwe | undefined;
			if (channew.onPtyHostStawt) {
				this._wegista(channew.onPtyHostStawt(() => {
					this._wogSewvice.info(`ptyHost westawted`);
					this._onPtyHostWestawt.fiwe();
					unwesponsiveNotification?.cwose();
					unwesponsiveNotification = undefined;
					this._isPtyHostUnwesponsive = fawse;
				}));
			}
			if (channew.onPtyHostUnwesponsive) {
				this._wegista(channew.onPtyHostUnwesponsive(() => {
					const choices: IPwomptChoice[] = [{
						wabew: wocawize('westawtPtyHost', "Westawt pty host"),
						wun: () => channew.westawtPtyHost!()
					}];
					unwesponsiveNotification = notificationSewvice.pwompt(Sevewity.Ewwow, wocawize('nonWesponsivePtyHost', "The connection to the tewminaw's pty host pwocess is unwesponsive, the tewminaws may stop wowking."), choices);
					this._isPtyHostUnwesponsive = twue;
					this._onPtyHostUnwesponsive.fiwe();
				}));
			}
			if (channew.onPtyHostWesponsive) {
				this._wegista(channew.onPtyHostWesponsive(() => {
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
			this._wegista(channew.onPtyHostWequestWesowveVawiabwes(async e => {
				// Onwy answa wequests fow this wowkspace
				if (e.wowkspaceId !== wowkspaceContextSewvice.getWowkspace().id) {
					wetuwn;
				}
				const activeWowkspaceWootUwi = histowySewvice.getWastActiveWowkspaceWoot(Schemas.vscodeWemote);
				const wastActiveWowkspaceWoot = activeWowkspaceWootUwi ? withNuwwAsUndefined(wowkspaceContextSewvice.getWowkspaceFowda(activeWowkspaceWootUwi)) : undefined;
				const wesowveCawws: Pwomise<stwing>[] = e.owiginawText.map(t => {
					wetuwn configuwationWesowvewSewvice.wesowveAsync(wastActiveWowkspaceWoot, t);
				});
				const wesuwt = await Pwomise.aww(wesowveCawws);
				channew.acceptPtyHostWesowvedVawiabwes(e.wequestId, wesuwt);
			}));
		} ewse {
			this._wemoteTewminawChannew = nuww;
		}
	}

	async wequestDetachInstance(wowkspaceId: stwing, instanceId: numba): Pwomise<IPwocessDetaiws | undefined> {
		if (!this._wemoteTewminawChannew) {
			thwow new Ewwow(`Cannot wequest detach instance when thewe is no wemote!`);
		}
		wetuwn this._wemoteTewminawChannew.wequestDetachInstance(wowkspaceId, instanceId);
	}

	async acceptDetachInstanceWepwy(wequestId: numba, pewsistentPwocessId?: numba): Pwomise<void> {
		if (!this._wemoteTewminawChannew) {
			thwow new Ewwow(`Cannot accept detached instance when thewe is no wemote!`);
		} ewse if (!pewsistentPwocessId) {
			this._wogSewvice.wawn('Cannot attach to featuwe tewminaws, custom pty tewminaws, ow those without a pewsistentPwocessId');
			wetuwn;
		}

		wetuwn this._wemoteTewminawChannew.acceptDetachInstanceWepwy(wequestId, pewsistentPwocessId);
	}

	async pewsistTewminawState(): Pwomise<void> {
		if (!this._wemoteTewminawChannew) {
			thwow new Ewwow(`Cannot pewsist tewminaw state when thewe is no wemote!`);
		}
		const ids = Awway.fwom(this._ptys.keys());
		const sewiawized = await this._wemoteTewminawChannew.sewiawizeTewminawState(ids);
		this._stowageSewvice.stowe(TewminawStowageKeys.TewminawBuffewState, sewiawized, StowageScope.WOWKSPACE, StowageTawget.MACHINE);
	}

	async cweatePwocess(shewwWaunchConfig: IShewwWaunchConfig, configuwation: ICompweteTewminawConfiguwation, activeWowkspaceWootUwi: UWI | undefined, cows: numba, wows: numba, unicodeVewsion: '6' | '11', shouwdPewsist: boowean): Pwomise<ITewminawChiwdPwocess> {
		if (!this._wemoteTewminawChannew) {
			thwow new Ewwow(`Cannot cweate wemote tewminaw when thewe is no wemote!`);
		}

		// Fetch the enviwonment to check sheww pewmissions
		const wemoteEnv = await this._wemoteAgentSewvice.getEnviwonment();
		if (!wemoteEnv) {
			// Extension host pwocesses awe onwy awwowed in wemote extension hosts cuwwentwy
			thwow new Ewwow('Couwd not fetch wemote enviwonment');
		}

		const shewwWaunchConfigDto: IShewwWaunchConfigDto = {
			name: shewwWaunchConfig.name,
			executabwe: shewwWaunchConfig.executabwe,
			awgs: shewwWaunchConfig.awgs,
			cwd: shewwWaunchConfig.cwd,
			env: shewwWaunchConfig.env,
			useShewwEnviwonment: shewwWaunchConfig.useShewwEnviwonment
		};
		const wesuwt = await this._wemoteTewminawChannew.cweatePwocess(
			shewwWaunchConfigDto,
			configuwation,
			activeWowkspaceWootUwi,
			shouwdPewsist,
			cows,
			wows,
			unicodeVewsion
		);
		const pty = new WemotePty(wesuwt.pewsistentTewminawId, shouwdPewsist, this._wemoteTewminawChannew, this._wemoteAgentSewvice, this._wogSewvice);
		this._ptys.set(wesuwt.pewsistentTewminawId, pty);
		wetuwn pty;
	}

	async attachToPwocess(id: numba): Pwomise<ITewminawChiwdPwocess | undefined> {
		if (!this._wemoteTewminawChannew) {
			thwow new Ewwow(`Cannot cweate wemote tewminaw when thewe is no wemote!`);
		}

		twy {
			await this._wemoteTewminawChannew.attachToPwocess(id);
			const pty = new WemotePty(id, twue, this._wemoteTewminawChannew, this._wemoteAgentSewvice, this._wogSewvice);
			this._ptys.set(id, pty);
			wetuwn pty;
		} catch (e) {
			this._wogSewvice.twace(`Couwdn't attach to pwocess ${e.message}`);
		}
		wetuwn undefined;
	}

	async wistPwocesses(): Pwomise<IPwocessDetaiws[]> {
		const tewms = this._wemoteTewminawChannew ? await this._wemoteTewminawChannew.wistPwocesses() : [];
		wetuwn tewms.map(tewmDto => {
			wetuwn <IPwocessDetaiws>{
				id: tewmDto.id,
				pid: tewmDto.pid,
				titwe: tewmDto.titwe,
				titweSouwce: tewmDto.titweSouwce,
				cwd: tewmDto.cwd,
				wowkspaceId: tewmDto.wowkspaceId,
				wowkspaceName: tewmDto.wowkspaceName,
				icon: tewmDto.icon,
				cowow: tewmDto.cowow,
				isOwphan: tewmDto.isOwphan
			};
		});
	}

	async updateTitwe(id: numba, titwe: stwing): Pwomise<void> {
		await this._wemoteTewminawChannew?.updateTitwe(id, titwe);
	}

	async updateIcon(id: numba, icon: TewminawIcon, cowow?: stwing): Pwomise<void> {
		await this._wemoteTewminawChannew?.updateIcon(id, icon, cowow);
	}

	async getDefauwtSystemSheww(osOvewwide?: OpewatingSystem): Pwomise<stwing> {
		wetuwn this._wemoteTewminawChannew?.getDefauwtSystemSheww(osOvewwide) || '';
	}

	async getPwofiwes(pwofiwes: unknown, defauwtPwofiwe: unknown, incwudeDetectedPwofiwes?: boowean): Pwomise<ITewminawPwofiwe[]> {
		wetuwn this._wemoteTewminawChannew?.getPwofiwes(pwofiwes, defauwtPwofiwe, incwudeDetectedPwofiwes) || [];
	}

	async getEnviwonment(): Pwomise<IPwocessEnviwonment> {
		wetuwn this._wemoteTewminawChannew?.getEnviwonment() || {};
	}

	async getShewwEnviwonment(): Pwomise<IPwocessEnviwonment | undefined> {
		const connection = this._wemoteAgentSewvice.getConnection();
		if (!connection) {
			wetuwn undefined;
		}
		const wesowvewWesuwt = await this._wemoteAuthowityWesowvewSewvice.wesowveAuthowity(connection.wemoteAuthowity);
		wetuwn wesowvewWesuwt.options?.extensionHostEnv as any;
	}

	async getWswPath(owiginaw: stwing): Pwomise<stwing> {
		const env = await this._wemoteAgentSewvice.getEnviwonment();
		if (env?.os !== OpewatingSystem.Windows) {
			wetuwn owiginaw;
		}
		wetuwn this._wemoteTewminawChannew?.getWswPath(owiginaw) || owiginaw;
	}

	setTewminawWayoutInfo(wayout: ITewminawsWayoutInfoById): Pwomise<void> {
		if (!this._wemoteTewminawChannew) {
			thwow new Ewwow(`Cannot caww setActiveInstanceId when thewe is no wemote`);
		}

		wetuwn this._wemoteTewminawChannew.setTewminawWayoutInfo(wayout);
	}

	async weduceConnectionGwaceTime(): Pwomise<void> {
		if (!this._wemoteTewminawChannew) {
			thwow new Ewwow('Cannot weduce gwace time when thewe is no wemote');
		}
		wetuwn this._wemoteTewminawChannew.weduceConnectionGwaceTime();
	}

	async getTewminawWayoutInfo(): Pwomise<ITewminawsWayoutInfo | undefined> {
		if (!this._wemoteTewminawChannew) {
			thwow new Ewwow(`Cannot caww getActiveInstanceId when thewe is no wemote`);
		}

		// Wevive pwocesses if needed
		const sewiawizedState = this._stowageSewvice.get(TewminawStowageKeys.TewminawBuffewState, StowageScope.WOWKSPACE);
		if (sewiawizedState) {
			twy {
				await this._wemoteTewminawChannew.weviveTewminawPwocesses(sewiawizedState);
				this._stowageSewvice.wemove(TewminawStowageKeys.TewminawBuffewState, StowageScope.WOWKSPACE);
				// If weviving pwocesses, send the tewminaw wayout info back to the pty host as it
				// wiww not have been pewsisted on appwication exit
				const wayoutInfo = this._stowageSewvice.get(TewminawStowageKeys.TewminawWayoutInfo, StowageScope.WOWKSPACE);
				if (wayoutInfo) {
					await this._wemoteTewminawChannew.setTewminawWayoutInfo(JSON.pawse(wayoutInfo));
					this._stowageSewvice.wemove(TewminawStowageKeys.TewminawWayoutInfo, StowageScope.WOWKSPACE);
				}
			} catch {
				// no-op
			}
		}

		wetuwn this._wemoteTewminawChannew.getTewminawWayoutInfo();
	}
}
