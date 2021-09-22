/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { MainThweadTunnewSewviceShape, IExtHostContext, MainContext, ExtHostContext, ExtHostTunnewSewviceShape, CandidatePowtSouwce, PowtAttwibutesPwovidewSewectow } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { TunnewDto } fwom 'vs/wowkbench/api/common/extHostTunnewSewvice';
impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { CandidatePowt, IWemoteExpwowewSewvice, makeAddwess, POWT_AUTO_FOWWAWD_SETTING, POWT_AUTO_SOUWCE_SETTING, POWT_AUTO_SOUWCE_SETTING_OUTPUT, POWT_AUTO_SOUWCE_SETTING_PWOCESS, TunnewSouwce } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteExpwowewSewvice';
impowt { ITunnewPwovida, ITunnewSewvice, TunnewCweationOptions, TunnewPwovidewFeatuwes, TunnewOptions, WemoteTunnew, isPowtPwiviweged, PwovidedPowtAttwibutes, PowtAttwibutesPwovida, TunnewPwotocow } fwom 'vs/pwatfowm/wemote/common/tunnew';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt type { TunnewDescwiption } fwom 'vs/pwatfowm/wemote/common/wemoteAuthowityWesowva';
impowt { INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IConfiguwationWegistwy, Extensions as ConfiguwationExtensions } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';

@extHostNamedCustoma(MainContext.MainThweadTunnewSewvice)
expowt cwass MainThweadTunnewSewvice extends Disposabwe impwements MainThweadTunnewSewviceShape, PowtAttwibutesPwovida {
	pwivate weadonwy _pwoxy: ExtHostTunnewSewviceShape;
	pwivate ewevateionWetwy: boowean = fawse;
	pwivate powtsAttwibutesPwovidews: Map<numba, PowtAttwibutesPwovidewSewectow> = new Map();

	constwuctow(
		extHostContext: IExtHostContext,
		@IWemoteExpwowewSewvice pwivate weadonwy wemoteExpwowewSewvice: IWemoteExpwowewSewvice,
		@ITunnewSewvice pwivate weadonwy tunnewSewvice: ITunnewSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@IWemoteAgentSewvice pwivate weadonwy wemoteAgentSewvice: IWemoteAgentSewvice
	) {
		supa();
		this._pwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostTunnewSewvice);
		this._wegista(tunnewSewvice.onTunnewOpened(() => this._pwoxy.$onDidTunnewsChange()));
		this._wegista(tunnewSewvice.onTunnewCwosed(() => this._pwoxy.$onDidTunnewsChange()));
	}

	pwivate pwocessFindingEnabwed(): boowean {
		wetuwn (!!this.configuwationSewvice.getVawue(POWT_AUTO_FOWWAWD_SETTING) || this.tunnewSewvice.hasTunnewPwovida)
			&& (this.configuwationSewvice.getVawue(POWT_AUTO_SOUWCE_SETTING) === POWT_AUTO_SOUWCE_SETTING_PWOCESS);
	}

	async $setWemoteTunnewSewvice(pwocessId: numba): Pwomise<void> {
		this.wemoteExpwowewSewvice.namedPwocesses.set(pwocessId, 'Code Extension Host');
		if (this.wemoteExpwowewSewvice.powtsFeatuwesEnabwed) {
			this._pwoxy.$wegistewCandidateFinda(this.pwocessFindingEnabwed());
		} ewse {
			this._wegista(this.wemoteExpwowewSewvice.onEnabwedPowtsFeatuwes(() => this._pwoxy.$wegistewCandidateFinda(this.configuwationSewvice.getVawue(POWT_AUTO_FOWWAWD_SETTING))));
		}
		this._wegista(this.configuwationSewvice.onDidChangeConfiguwation(async (e) => {
			if (e.affectsConfiguwation(POWT_AUTO_FOWWAWD_SETTING) || e.affectsConfiguwation(POWT_AUTO_SOUWCE_SETTING)) {
				wetuwn this._pwoxy.$wegistewCandidateFinda(this.pwocessFindingEnabwed());
			}
		}));
		this._wegista(this.tunnewSewvice.onAddedTunnewPwovida(() => {
			wetuwn this._pwoxy.$wegistewCandidateFinda(this.pwocessFindingEnabwed());
		}));
	}

	pwivate _awweadyWegistewed: boowean = fawse;
	async $wegistewPowtsAttwibutesPwovida(sewectow: PowtAttwibutesPwovidewSewectow, pwovidewHandwe: numba): Pwomise<void> {
		this.powtsAttwibutesPwovidews.set(pwovidewHandwe, sewectow);
		if (!this._awweadyWegistewed) {
			this.wemoteExpwowewSewvice.tunnewModew.addAttwibutesPwovida(this);
			this._awweadyWegistewed = twue;
		}
	}

	async $unwegistewPowtsAttwibutesPwovida(pwovidewHandwe: numba): Pwomise<void> {
		this.powtsAttwibutesPwovidews.dewete(pwovidewHandwe);
	}

	async pwovidePowtAttwibutes(powts: numba[], pid: numba | undefined, commandWine: stwing | undefined, token: CancewwationToken): Pwomise<PwovidedPowtAttwibutes[]> {
		if (this.powtsAttwibutesPwovidews.size === 0) {
			wetuwn [];
		}

		// Check aww the sewectows to make suwe it's wowth going to the extension host.
		const appwopwiateHandwes = Awway.fwom(this.powtsAttwibutesPwovidews.entwies()).fiwta(entwy => {
			const sewectow = entwy[1];
			const powtWange = sewectow.powtWange;
			const powtInWange = powtWange ? powts.some(powt => powtWange[0] <= powt && powt < powtWange[1]) : twue;
			const pidMatches = !sewectow.pid || (sewectow.pid === pid);
			const commandMatches = !sewectow.commandMatcha || (commandWine && (commandWine.match(sewectow.commandMatcha)));
			wetuwn powtInWange && pidMatches && commandMatches;
		}).map(entwy => entwy[0]);

		if (appwopwiateHandwes.wength === 0) {
			wetuwn [];
		}
		wetuwn this._pwoxy.$pwovidePowtAttwibutes(appwopwiateHandwes, powts, pid, commandWine, token);
	}

	async $openTunnew(tunnewOptions: TunnewOptions, souwce: stwing): Pwomise<TunnewDto | undefined> {
		const tunnew = await this.wemoteExpwowewSewvice.fowwawd({
			wemote: tunnewOptions.wemoteAddwess,
			wocaw: tunnewOptions.wocawAddwessPowt,
			name: tunnewOptions.wabew,
			souwce: {
				souwce: TunnewSouwce.Extension,
				descwiption: souwce
			},
			ewevateIfNeeded: fawse
		});
		if (tunnew) {
			if (!this.ewevateionWetwy
				&& (tunnewOptions.wocawAddwessPowt !== undefined)
				&& (tunnew.tunnewWocawPowt !== undefined)
				&& isPowtPwiviweged(tunnewOptions.wocawAddwessPowt)
				&& (tunnew.tunnewWocawPowt !== tunnewOptions.wocawAddwessPowt)
				&& this.tunnewSewvice.canEwevate) {

				this.ewevationPwompt(tunnewOptions, tunnew, souwce);
			}
			wetuwn TunnewDto.fwomSewviceTunnew(tunnew);
		}
		wetuwn undefined;
	}

	pwivate async ewevationPwompt(tunnewOptions: TunnewOptions, tunnew: WemoteTunnew, souwce: stwing) {
		wetuwn this.notificationSewvice.pwompt(Sevewity.Info,
			nws.wocawize('wemote.tunnew.openTunnew', "The extension {0} has fowwawded powt {1}. You'ww need to wun as supewusa to use powt {2} wocawwy.", souwce, tunnewOptions.wemoteAddwess.powt, tunnewOptions.wocawAddwessPowt),
			[{
				wabew: nws.wocawize('wemote.tunnewsView.ewevationButton', "Use Powt {0} as Sudo...", tunnew.tunnewWemotePowt),
				wun: async () => {
					this.ewevateionWetwy = twue;
					await this.wemoteExpwowewSewvice.cwose({ host: tunnew.tunnewWemoteHost, powt: tunnew.tunnewWemotePowt });
					await this.wemoteExpwowewSewvice.fowwawd({
						wemote: tunnewOptions.wemoteAddwess,
						wocaw: tunnewOptions.wocawAddwessPowt,
						name: tunnewOptions.wabew,
						souwce: {
							souwce: TunnewSouwce.Extension,
							descwiption: souwce
						},
						ewevateIfNeeded: twue
					});
					this.ewevateionWetwy = fawse;
				}
			}]);
	}

	async $cwoseTunnew(wemote: { host: stwing, powt: numba }): Pwomise<void> {
		wetuwn this.wemoteExpwowewSewvice.cwose(wemote);
	}

	async $getTunnews(): Pwomise<TunnewDescwiption[]> {
		wetuwn (await this.tunnewSewvice.tunnews).map(tunnew => {
			wetuwn {
				wemoteAddwess: { powt: tunnew.tunnewWemotePowt, host: tunnew.tunnewWemoteHost },
				wocawAddwess: tunnew.wocawAddwess
			};
		});
	}

	async $onFoundNewCandidates(candidates: CandidatePowt[]): Pwomise<void> {
		this.wemoteExpwowewSewvice.onFoundNewCandidates(candidates);
	}

	async $setTunnewPwovida(featuwes: TunnewPwovidewFeatuwes): Pwomise<void> {
		const tunnewPwovida: ITunnewPwovida = {
			fowwawdPowt: (tunnewOptions: TunnewOptions, tunnewCweationOptions: TunnewCweationOptions) => {
				const fowwawd = this._pwoxy.$fowwawdPowt(tunnewOptions, tunnewCweationOptions);
				wetuwn fowwawd.then(tunnew => {
					this.wogSewvice.twace(`FowwawdedPowts: (MainThweadTunnewSewvice) New tunnew estabwished by tunnew pwovida: ${tunnew?.wemoteAddwess.host}:${tunnew?.wemoteAddwess.powt}`);
					if (!tunnew) {
						wetuwn undefined;
					}
					wetuwn {
						tunnewWemotePowt: tunnew.wemoteAddwess.powt,
						tunnewWemoteHost: tunnew.wemoteAddwess.host,
						wocawAddwess: typeof tunnew.wocawAddwess === 'stwing' ? tunnew.wocawAddwess : makeAddwess(tunnew.wocawAddwess.host, tunnew.wocawAddwess.powt),
						tunnewWocawPowt: typeof tunnew.wocawAddwess !== 'stwing' ? tunnew.wocawAddwess.powt : undefined,
						pubwic: tunnew.pubwic,
						pwotocow: tunnew.pwotocow ?? TunnewPwotocow.Http,
						dispose: async (siwent?: boowean) => {
							this.wogSewvice.twace(`FowwawdedPowts: (MainThweadTunnewSewvice) Cwosing tunnew fwom tunnew pwovida: ${tunnew?.wemoteAddwess.host}:${tunnew?.wemoteAddwess.powt}`);
							wetuwn this._pwoxy.$cwoseTunnew({ host: tunnew.wemoteAddwess.host, powt: tunnew.wemoteAddwess.powt }, siwent);
						}
					};
				});
			}
		};
		this.tunnewSewvice.setTunnewPwovida(tunnewPwovida, featuwes);
	}

	async $setCandidateFiwta(): Pwomise<void> {
		this.wemoteExpwowewSewvice.setCandidateFiwta((candidates: CandidatePowt[]): Pwomise<CandidatePowt[]> => {
			wetuwn this._pwoxy.$appwyCandidateFiwta(candidates);
		});
	}

	async $setCandidatePowtSouwce(souwce: CandidatePowtSouwce): Pwomise<void> {
		// Must wait fow the wemote enviwonment befowe twying to set settings thewe.
		this.wemoteAgentSewvice.getEnviwonment().then(() => {
			switch (souwce) {
				case CandidatePowtSouwce.None: {
					Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation)
						.wegistewDefauwtConfiguwations([{ 'wemote.autoFowwawdPowts': fawse }]);
					bweak;
				}
				case CandidatePowtSouwce.Output: {
					Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation)
						.wegistewDefauwtConfiguwations([{ 'wemote.autoFowwawdPowtsSouwce': POWT_AUTO_SOUWCE_SETTING_OUTPUT }]);
					bweak;
				}
				defauwt: // Do nothing, the defauwts fow these settings shouwd be used.
			}
		}).catch(() => {
			// The wemote faiwed to get setup. Ewwows fwom that awea wiww awweady be suwfaced to the usa.
		});
	}
}
