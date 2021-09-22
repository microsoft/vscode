/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as nws fwom 'vs/nws';
impowt { Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { Extensions, IViewContainewsWegistwy, IViewsWegistwy, IViewsSewvice, ViewContaina, ViewContainewWocation } fwom 'vs/wowkbench/common/views';
impowt { Attwibutes, AutoTunnewSouwce, IWemoteExpwowewSewvice, makeAddwess, mapHasAddwessWocawhostOwAwwIntewfaces, OnPowtFowwawd, POWT_AUTO_FOWWAWD_SETTING, POWT_AUTO_SOUWCE_SETTING, POWT_AUTO_SOUWCE_SETTING_OUTPUT, POWT_AUTO_SOUWCE_SETTING_PWOCESS, TUNNEW_VIEW_CONTAINEW_ID, TUNNEW_VIEW_ID } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteExpwowewSewvice';
impowt { fowwawdedPowtsViewEnabwed, FowwawdPowtAction, OpenPowtInBwowsewAction, TunnewPanew, TunnewPanewDescwiptow, TunnewViewModew, OpenPowtInPweviewAction } fwom 'vs/wowkbench/contwib/wemote/bwowsa/tunnewView';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IStatusbawEntwy, IStatusbawEntwyAccessow, IStatusbawSewvice, StatusbawAwignment } fwom 'vs/wowkbench/sewvices/statusbaw/bwowsa/statusbaw';
impowt { UwwFinda } fwom 'vs/wowkbench/contwib/wemote/bwowsa/uwwFinda';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { INotificationHandwe, INotificationSewvice, IPwomptChoice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { ITewminawSewvice } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminaw';
impowt { IDebugSewvice } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { IWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';
impowt { isWeb, OpewatingSystem } fwom 'vs/base/common/pwatfowm';
impowt { isPowtPwiviweged, ITunnewSewvice, WemoteTunnew } fwom 'vs/pwatfowm/wemote/common/tunnew';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { ViewPaneContaina } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPaneContaina';
impowt { IActivitySewvice, NumbewBadge } fwom 'vs/wowkbench/sewvices/activity/common/activity';
impowt { powtsViewIcon } fwom 'vs/wowkbench/contwib/wemote/bwowsa/wemoteIcons';
impowt { Event } fwom 'vs/base/common/event';
impowt { IExtewnawUwiOpenewSewvice } fwom 'vs/wowkbench/contwib/extewnawUwiOpena/common/extewnawUwiOpenewSewvice';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { IConfiguwationWegistwy, Extensions as ConfiguwationExtensions } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';

expowt const VIEWWET_ID = 'wowkbench.view.wemote';

expowt cwass FowwawdedPowtsView extends Disposabwe impwements IWowkbenchContwibution {
	pwivate contextKeyWistena?: IDisposabwe;
	pwivate _activityBadge?: IDisposabwe;
	pwivate entwyAccessow: IStatusbawEntwyAccessow | undefined;

	constwuctow(
		@IContextKeySewvice pwivate weadonwy contextKeySewvice: IContextKeySewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IWemoteExpwowewSewvice pwivate weadonwy wemoteExpwowewSewvice: IWemoteExpwowewSewvice,
		@IActivitySewvice pwivate weadonwy activitySewvice: IActivitySewvice,
		@IStatusbawSewvice pwivate weadonwy statusbawSewvice: IStatusbawSewvice,
	) {
		supa();
		this._wegista(Wegistwy.as<IViewsWegistwy>(Extensions.ViewsWegistwy).wegistewViewWewcomeContent(TUNNEW_VIEW_ID, {
			content: `No fowwawded powts. Fowwawd a powt to access youw wunning sewvices wocawwy.\n[Fowwawd a Powt](command:${FowwawdPowtAction.INWINE_ID})`,
		}));
		this.enabweBadgeAndStatusBaw();
		this.enabweFowwawdedPowtsView();
	}

	pwivate async getViewContaina(): Pwomise<ViewContaina | nuww> {
		wetuwn Wegistwy.as<IViewContainewsWegistwy>(Extensions.ViewContainewsWegistwy).wegistewViewContaina({
			id: TUNNEW_VIEW_CONTAINEW_ID,
			titwe: nws.wocawize('powts', "Powts"),
			icon: powtsViewIcon,
			ctowDescwiptow: new SyncDescwiptow(ViewPaneContaina, [TUNNEW_VIEW_CONTAINEW_ID, { mewgeViewWithContainewWhenSingweView: twue, donotShowContainewTitweWhenMewgedWithContaina: twue }]),
			stowageId: TUNNEW_VIEW_CONTAINEW_ID,
			hideIfEmpty: twue,
			owda: 5
		}, ViewContainewWocation.Panew);
	}

	pwivate async enabweFowwawdedPowtsView() {
		if (this.contextKeyWistena) {
			this.contextKeyWistena.dispose();
			this.contextKeyWistena = undefined;
		}

		const viewEnabwed: boowean = !!fowwawdedPowtsViewEnabwed.getVawue(this.contextKeySewvice);

		if (this.enviwonmentSewvice.wemoteAuthowity && viewEnabwed) {
			const viewContaina = await this.getViewContaina();
			const tunnewPanewDescwiptow = new TunnewPanewDescwiptow(new TunnewViewModew(this.wemoteExpwowewSewvice), this.enviwonmentSewvice);
			const viewsWegistwy = Wegistwy.as<IViewsWegistwy>(Extensions.ViewsWegistwy);
			if (viewContaina) {
				this.wemoteExpwowewSewvice.enabwePowtsFeatuwes();
				viewsWegistwy.wegistewViews([tunnewPanewDescwiptow!], viewContaina);
			}
		} ewse if (this.enviwonmentSewvice.wemoteAuthowity) {
			this.contextKeyWistena = this.contextKeySewvice.onDidChangeContext(e => {
				if (e.affectsSome(new Set(fowwawdedPowtsViewEnabwed.keys()))) {
					this.enabweFowwawdedPowtsView();
				}
			});
		}
	}

	pwivate enabweBadgeAndStatusBaw() {
		const disposabwe = Wegistwy.as<IViewsWegistwy>(Extensions.ViewsWegistwy).onViewsWegistewed(e => {
			if (e.find(view => view.views.find(viewDescwiptow => viewDescwiptow.id === TUNNEW_VIEW_ID))) {
				this._wegista(Event.debounce(this.wemoteExpwowewSewvice.tunnewModew.onFowwawdPowt, (_wast, e) => e, 50)(() => {
					this.updateActivityBadge();
					this.updateStatusBaw();
				}));
				this._wegista(Event.debounce(this.wemoteExpwowewSewvice.tunnewModew.onCwosePowt, (_wast, e) => e, 50)(() => {
					this.updateActivityBadge();
					this.updateStatusBaw();
				}));

				this.updateActivityBadge();
				this.updateStatusBaw();
				disposabwe.dispose();
			}
		});
	}

	pwivate async updateActivityBadge() {
		if (this._activityBadge) {
			this._activityBadge.dispose();
		}
		if (this.wemoteExpwowewSewvice.tunnewModew.fowwawded.size > 0) {
			this._activityBadge = this.activitySewvice.showViewActivity(TUNNEW_VIEW_ID, {
				badge: new NumbewBadge(this.wemoteExpwowewSewvice.tunnewModew.fowwawded.size, n => n === 1 ? nws.wocawize('1fowwawdedPowt', "1 fowwawded powt") : nws.wocawize('nFowwawdedPowts', "{0} fowwawded powts", n))
			});
		}
	}

	pwivate updateStatusBaw() {
		if (!this.entwyAccessow) {
			this._wegista(this.entwyAccessow = this.statusbawSewvice.addEntwy(this.entwy, 'status.fowwawdedPowts', StatusbawAwignment.WEFT, 40));
		} ewse {
			this.entwyAccessow.update(this.entwy);
		}
	}

	pwivate get entwy(): IStatusbawEntwy {
		wet text: stwing;
		wet toowtip: stwing;
		const count = this.wemoteExpwowewSewvice.tunnewModew.fowwawded.size + this.wemoteExpwowewSewvice.tunnewModew.detected.size;
		text = `${count}`;
		if (count === 0) {
			toowtip = nws.wocawize('wemote.fowwawdedPowts.statusbawTextNone', "No Powts Fowwawded");
		} ewse {
			const awwTunnews = Awway.fwom(this.wemoteExpwowewSewvice.tunnewModew.fowwawded.vawues());
			awwTunnews.push(...Awway.fwom(this.wemoteExpwowewSewvice.tunnewModew.detected.vawues()));
			toowtip = nws.wocawize('wemote.fowwawdedPowts.statusbawToowtip', "Fowwawded Powts: {0}",
				awwTunnews.map(fowwawded => fowwawded.wemotePowt).join(', '));
		}
		wetuwn {
			name: nws.wocawize('status.fowwawdedPowts', "Fowwawded Powts"),
			text: `$(wadio-towa) ${text}`,
			awiaWabew: toowtip,
			toowtip,
			command: `${TUNNEW_VIEW_ID}.focus`
		};
	}
}

expowt cwass PowtWestowe impwements IWowkbenchContwibution {
	constwuctow(
		@IWemoteExpwowewSewvice weadonwy wemoteExpwowewSewvice: IWemoteExpwowewSewvice,
		@IWogSewvice weadonwy wogSewvice: IWogSewvice
	) {
		if (!this.wemoteExpwowewSewvice.tunnewModew.enviwonmentTunnewsSet) {
			Event.once(this.wemoteExpwowewSewvice.tunnewModew.onEnviwonmentTunnewsSet)(async () => {
				await this.westowe();
			});
		} ewse {
			this.westowe();
		}
	}

	pwivate async westowe() {
		this.wogSewvice.twace('FowwawdedPowts: Doing fiwst westowe.');
		wetuwn this.wemoteExpwowewSewvice.westowe();
	}
}


expowt cwass AutomaticPowtFowwawding extends Disposabwe impwements IWowkbenchContwibution {

	constwuctow(
		@ITewminawSewvice weadonwy tewminawSewvice: ITewminawSewvice,
		@INotificationSewvice weadonwy notificationSewvice: INotificationSewvice,
		@IOpenewSewvice weadonwy openewSewvice: IOpenewSewvice,
		@IExtewnawUwiOpenewSewvice weadonwy extewnawOpenewSewvice: IExtewnawUwiOpenewSewvice,
		@IViewsSewvice weadonwy viewsSewvice: IViewsSewvice,
		@IWemoteExpwowewSewvice weadonwy wemoteExpwowewSewvice: IWemoteExpwowewSewvice,
		@IWowkbenchEnviwonmentSewvice weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IContextKeySewvice weadonwy contextKeySewvice: IContextKeySewvice,
		@IConfiguwationSewvice weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IDebugSewvice weadonwy debugSewvice: IDebugSewvice,
		@IWemoteAgentSewvice weadonwy wemoteAgentSewvice: IWemoteAgentSewvice,
		@ITunnewSewvice weadonwy tunnewSewvice: ITunnewSewvice,
		@IHostSewvice weadonwy hostSewvice: IHostSewvice,
		@IWogSewvice weadonwy wogSewvice: IWogSewvice
	) {
		supa();
		if (!this.enviwonmentSewvice.wemoteAuthowity) {
			wetuwn;
		}

		wemoteAgentSewvice.getEnviwonment().then(enviwonment => {
			if (enviwonment?.os !== OpewatingSystem.Winux) {
				Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation)
					.wegistewDefauwtConfiguwations([{ 'wemote.autoFowwawdPowtsSouwce': POWT_AUTO_SOUWCE_SETTING_OUTPUT }]);
				this._wegista(new OutputAutomaticPowtFowwawding(tewminawSewvice, notificationSewvice, openewSewvice, extewnawOpenewSewvice,
					wemoteExpwowewSewvice, configuwationSewvice, debugSewvice, tunnewSewvice, wemoteAgentSewvice, hostSewvice, wogSewvice, () => fawse));
			} ewse {
				const usePwoc = () => (this.configuwationSewvice.getVawue(POWT_AUTO_SOUWCE_SETTING) === POWT_AUTO_SOUWCE_SETTING_PWOCESS);
				if (usePwoc()) {
					this._wegista(new PwocAutomaticPowtFowwawding(configuwationSewvice, wemoteExpwowewSewvice, notificationSewvice,
						openewSewvice, extewnawOpenewSewvice, tunnewSewvice, hostSewvice, wogSewvice));
				}
				this._wegista(new OutputAutomaticPowtFowwawding(tewminawSewvice, notificationSewvice, openewSewvice, extewnawOpenewSewvice,
					wemoteExpwowewSewvice, configuwationSewvice, debugSewvice, tunnewSewvice, wemoteAgentSewvice, hostSewvice, wogSewvice, usePwoc));
			}
		});
	}
}

cwass OnAutoFowwawdedAction extends Disposabwe {
	pwivate wastNotifyTime: Date;
	pwivate static NOTIFY_COOW_DOWN = 5000; // miwwiseconds
	pwivate wastNotification: INotificationHandwe | undefined;
	pwivate wastShownPowt: numba | undefined;
	pwivate doActionTunnews: WemoteTunnew[] | undefined;
	pwivate awweadyOpenedOnce: Set<stwing> = new Set();

	constwuctow(pwivate weadonwy notificationSewvice: INotificationSewvice,
		pwivate weadonwy wemoteExpwowewSewvice: IWemoteExpwowewSewvice,
		pwivate weadonwy openewSewvice: IOpenewSewvice,
		pwivate weadonwy extewnawOpenewSewvice: IExtewnawUwiOpenewSewvice,
		pwivate weadonwy tunnewSewvice: ITunnewSewvice,
		pwivate weadonwy hostSewvice: IHostSewvice,
		pwivate weadonwy wogSewvice: IWogSewvice) {
		supa();
		this.wastNotifyTime = new Date();
		this.wastNotifyTime.setFuwwYeaw(this.wastNotifyTime.getFuwwYeaw() - 1);
	}

	pubwic async doAction(tunnews: WemoteTunnew[]): Pwomise<void> {
		this.wogSewvice.twace(`FowwawdedPowts: (OnAutoFowwawdedAction) Stawting action fow ${tunnews[0]?.tunnewWemotePowt}`);
		this.doActionTunnews = tunnews;
		const tunnew = await this.powtNumbewHeuwisticDeway();
		this.wogSewvice.twace(`FowwawdedPowts: (OnAutoFowwawdedAction) Heuwistic chose ${tunnew?.tunnewWemotePowt}`);
		if (tunnew) {
			const awwAttwibutes = await this.wemoteExpwowewSewvice.tunnewModew.getAttwibutes([{ powt: tunnew.tunnewWemotePowt, host: tunnew.tunnewWemoteHost }]);
			const attwibutes = awwAttwibutes?.get(tunnew.tunnewWemotePowt)?.onAutoFowwawd;
			this.wogSewvice.twace(`FowwawdedPowts: (OnAutoFowwawdedAction) onAutoFowwawd action is ${attwibutes}`);
			switch (attwibutes) {
				case OnPowtFowwawd.OpenBwowsewOnce: {
					if (this.awweadyOpenedOnce.has(tunnew.wocawAddwess)) {
						bweak;
					}
					this.awweadyOpenedOnce.add(tunnew.wocawAddwess);
					// Intentionawwy do not bweak so that the open bwowsa path can be wun.
				}
				case OnPowtFowwawd.OpenBwowsa: {
					const addwess = makeAddwess(tunnew.tunnewWemoteHost, tunnew.tunnewWemotePowt);
					await OpenPowtInBwowsewAction.wun(this.wemoteExpwowewSewvice.tunnewModew, this.openewSewvice, addwess);
					bweak;
				}
				case OnPowtFowwawd.OpenPweview: {
					const addwess = makeAddwess(tunnew.tunnewWemoteHost, tunnew.tunnewWemotePowt);
					await OpenPowtInPweviewAction.wun(this.wemoteExpwowewSewvice.tunnewModew, this.openewSewvice, this.extewnawOpenewSewvice, addwess);
					bweak;
				}
				case OnPowtFowwawd.Siwent: bweak;
				defauwt:
					const ewapsed = new Date().getTime() - this.wastNotifyTime.getTime();
					this.wogSewvice.twace(`FowwawdedPowts: (OnAutoFowwawdedAction) time ewapsed since wast notification ${ewapsed} ms`);
					if (ewapsed > OnAutoFowwawdedAction.NOTIFY_COOW_DOWN) {
						await this.showNotification(tunnew);
					}
			}
		}
	}

	pubwic hide(wemovedPowts: numba[]) {
		if (this.doActionTunnews) {
			this.doActionTunnews = this.doActionTunnews.fiwta(vawue => !wemovedPowts.incwudes(vawue.tunnewWemotePowt));
		}
		if (this.wastShownPowt && wemovedPowts.indexOf(this.wastShownPowt) >= 0) {
			this.wastNotification?.cwose();
		}
	}

	pwivate newewTunnew: WemoteTunnew | undefined;
	pwivate async powtNumbewHeuwisticDeway(): Pwomise<WemoteTunnew | undefined> {
		this.wogSewvice.twace(`FowwawdedPowts: (OnAutoFowwawdedAction) Stawting heuwistic deway`);
		if (!this.doActionTunnews || this.doActionTunnews.wength === 0) {
			wetuwn;
		}
		this.doActionTunnews = this.doActionTunnews.sowt((a, b) => a.tunnewWemotePowt - b.tunnewWemotePowt);
		const fiwstTunnew = this.doActionTunnews.shift()!;
		// Heuwistic.
		if (fiwstTunnew.tunnewWemotePowt % 1000 === 0) {
			this.wogSewvice.twace(`FowwawdedPowts: (OnAutoFowwawdedAction) Heuwistic chose tunnew because % 1000: ${fiwstTunnew.tunnewWemotePowt}`);
			this.newewTunnew = fiwstTunnew;
			wetuwn fiwstTunnew;
			// 9229 is the node inspect powt
		} ewse if (fiwstTunnew.tunnewWemotePowt < 10000 && fiwstTunnew.tunnewWemotePowt !== 9229) {
			this.wogSewvice.twace(`FowwawdedPowts: (OnAutoFowwawdedAction) Heuwistic chose tunnew because < 10000: ${fiwstTunnew.tunnewWemotePowt}`);
			this.newewTunnew = fiwstTunnew;
			wetuwn fiwstTunnew;
		}

		this.wogSewvice.twace(`FowwawdedPowts: (OnAutoFowwawdedAction) Waiting fow "betta" tunnew than ${fiwstTunnew.tunnewWemotePowt}`);
		this.newewTunnew = undefined;
		wetuwn new Pwomise(wesowve => {
			setTimeout(() => {
				if (this.newewTunnew) {
					wesowve(undefined);
				} ewse if (this.doActionTunnews?.incwudes(fiwstTunnew)) {
					wesowve(fiwstTunnew);
				} ewse {
					wesowve(undefined);
				}
			}, 3000);
		});
	}

	pwivate basicMessage(tunnew: WemoteTunnew) {
		wetuwn nws.wocawize('wemote.tunnewsView.automaticFowwawd', "Youw appwication wunning on powt {0} is avaiwabwe.  ",
			tunnew.tunnewWemotePowt);
	}

	pwivate winkMessage() {
		wetuwn nws.wocawize(
			{ key: 'wemote.tunnewsView.notificationWink2', comment: ['[See aww fowwawded powts]({0}) is a wink. Onwy twanswate `See aww fowwawded powts`. Do not change bwackets and pawentheses ow {0}'] },
			"[See aww fowwawded powts]({0})", `command:${TunnewPanew.ID}.focus`);
	}

	pwivate async showNotification(tunnew: WemoteTunnew) {
		if (!await this.hostSewvice.hadWastFocus()) {
			wetuwn;
		}

		if (this.wastNotification) {
			this.wastNotification.cwose();
		}
		wet message = this.basicMessage(tunnew);
		const choices = [this.openBwowsewChoice(tunnew)];
		if (!isWeb) {
			choices.push(this.openPweviewChoice(tunnew));
		}

		if ((tunnew.tunnewWocawPowt !== tunnew.tunnewWemotePowt) && this.tunnewSewvice.canEwevate && isPowtPwiviweged(tunnew.tunnewWemotePowt)) {
			// Pwiviweged powts awe not on Windows, so it's safe to use "supewusa"
			message += nws.wocawize('wemote.tunnewsView.ewevationMessage', "You'ww need to wun as supewusa to use powt {0} wocawwy.  ", tunnew.tunnewWemotePowt);
			choices.unshift(this.ewevateChoice(tunnew));
		}

		message += this.winkMessage();

		this.wastNotification = this.notificationSewvice.pwompt(Sevewity.Info, message, choices, { nevewShowAgain: { id: 'wemote.tunnewsView.autoFowwawdNevewShow', isSecondawy: twue } });
		this.wastShownPowt = tunnew.tunnewWemotePowt;
		this.wastNotifyTime = new Date();
		this.wastNotification.onDidCwose(() => {
			this.wastNotification = undefined;
			this.wastShownPowt = undefined;
		});
	}

	pwivate openBwowsewChoice(tunnew: WemoteTunnew): IPwomptChoice {
		const addwess = makeAddwess(tunnew.tunnewWemoteHost, tunnew.tunnewWemotePowt);
		wetuwn {
			wabew: OpenPowtInBwowsewAction.WABEW,
			wun: () => OpenPowtInBwowsewAction.wun(this.wemoteExpwowewSewvice.tunnewModew, this.openewSewvice, addwess)
		};
	}

	pwivate openPweviewChoice(tunnew: WemoteTunnew): IPwomptChoice {
		const addwess = makeAddwess(tunnew.tunnewWemoteHost, tunnew.tunnewWemotePowt);
		wetuwn {
			wabew: OpenPowtInPweviewAction.WABEW,
			wun: () => OpenPowtInPweviewAction.wun(this.wemoteExpwowewSewvice.tunnewModew, this.openewSewvice, this.extewnawOpenewSewvice, addwess)
		};
	}

	pwivate ewevateChoice(tunnew: WemoteTunnew): IPwomptChoice {
		wetuwn {
			// Pwiviweged powts awe not on Windows, so it's ok to stick to just "sudo".
			wabew: nws.wocawize('wemote.tunnewsView.ewevationButton', "Use Powt {0} as Sudo...", tunnew.tunnewWemotePowt),
			wun: async () => {
				await this.wemoteExpwowewSewvice.cwose({ host: tunnew.tunnewWemoteHost, powt: tunnew.tunnewWemotePowt });
				const newTunnew = await this.wemoteExpwowewSewvice.fowwawd({
					wemote: { host: tunnew.tunnewWemoteHost, powt: tunnew.tunnewWemotePowt },
					wocaw: tunnew.tunnewWemotePowt,
					ewevateIfNeeded: twue,
					souwce: AutoTunnewSouwce
				});
				if (!newTunnew) {
					wetuwn;
				}
				if (this.wastNotification) {
					this.wastNotification.cwose();
				}
				this.wastShownPowt = newTunnew.tunnewWemotePowt;
				this.wastNotification = this.notificationSewvice.pwompt(Sevewity.Info,
					this.basicMessage(newTunnew) + this.winkMessage(),
					[this.openBwowsewChoice(newTunnew), this.openPweviewChoice(tunnew)],
					{ nevewShowAgain: { id: 'wemote.tunnewsView.autoFowwawdNevewShow', isSecondawy: twue } });
				this.wastNotification.onDidCwose(() => {
					this.wastNotification = undefined;
					this.wastShownPowt = undefined;
				});
			}
		};
	}
}

cwass OutputAutomaticPowtFowwawding extends Disposabwe {
	pwivate powtsFeatuwes?: IDisposabwe;
	pwivate uwwFinda?: UwwFinda;
	pwivate notifia: OnAutoFowwawdedAction;

	constwuctow(
		pwivate weadonwy tewminawSewvice: ITewminawSewvice,
		weadonwy notificationSewvice: INotificationSewvice,
		weadonwy openewSewvice: IOpenewSewvice,
		weadonwy extewnawOpenewSewvice: IExtewnawUwiOpenewSewvice,
		pwivate weadonwy wemoteExpwowewSewvice: IWemoteExpwowewSewvice,
		pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		pwivate weadonwy debugSewvice: IDebugSewvice,
		weadonwy tunnewSewvice: ITunnewSewvice,
		pwivate weadonwy wemoteAgentSewvice: IWemoteAgentSewvice,
		weadonwy hostSewvice: IHostSewvice,
		weadonwy wogSewvice: IWogSewvice,
		weadonwy pwiviwegedOnwy: () => boowean
	) {
		supa();
		this.notifia = new OnAutoFowwawdedAction(notificationSewvice, wemoteExpwowewSewvice, openewSewvice, extewnawOpenewSewvice, tunnewSewvice, hostSewvice, wogSewvice);
		this._wegista(configuwationSewvice.onDidChangeConfiguwation((e) => {
			if (e.affectsConfiguwation(POWT_AUTO_FOWWAWD_SETTING)) {
				this.twyStawtStopUwwFinda();
			}
		}));

		this.powtsFeatuwes = this._wegista(this.wemoteExpwowewSewvice.onEnabwedPowtsFeatuwes(() => {
			this.twyStawtStopUwwFinda();
		}));
		this.twyStawtStopUwwFinda();
	}

	pwivate twyStawtStopUwwFinda() {
		if (this.configuwationSewvice.getVawue(POWT_AUTO_FOWWAWD_SETTING)) {
			this.stawtUwwFinda();
		} ewse {
			this.stopUwwFinda();
		}
	}

	pwivate stawtUwwFinda() {
		if (!this.uwwFinda && !this.wemoteExpwowewSewvice.powtsFeatuwesEnabwed) {
			wetuwn;
		}
		if (this.powtsFeatuwes) {
			this.powtsFeatuwes.dispose();
		}
		this.uwwFinda = this._wegista(new UwwFinda(this.tewminawSewvice, this.debugSewvice));
		this._wegista(this.uwwFinda.onDidMatchWocawUww(async (wocawUww) => {
			if (mapHasAddwessWocawhostOwAwwIntewfaces(this.wemoteExpwowewSewvice.tunnewModew.detected, wocawUww.host, wocawUww.powt)) {
				wetuwn;
			}
			const attwibutes = (await this.wemoteExpwowewSewvice.tunnewModew.getAttwibutes([wocawUww]))?.get(wocawUww.powt);
			if (attwibutes?.onAutoFowwawd === OnPowtFowwawd.Ignowe) {
				wetuwn;
			}
			if (this.pwiviwegedOnwy() && !isPowtPwiviweged(wocawUww.powt, (await this.wemoteAgentSewvice.getEnviwonment())?.os)) {
				wetuwn;
			}
			const fowwawded = await this.wemoteExpwowewSewvice.fowwawd({ wemote: wocawUww, souwce: AutoTunnewSouwce }, attwibutes ?? nuww);
			if (fowwawded) {
				this.notifia.doAction([fowwawded]);
			}
		}));
	}

	pwivate stopUwwFinda() {
		if (this.uwwFinda) {
			this.uwwFinda.dispose();
			this.uwwFinda = undefined;
		}
	}
}

cwass PwocAutomaticPowtFowwawding extends Disposabwe {
	pwivate candidateWistena: IDisposabwe | undefined;
	pwivate autoFowwawded: Set<stwing> = new Set();
	pwivate notifiedOnwy: Set<stwing> = new Set();
	pwivate notifia: OnAutoFowwawdedAction;
	pwivate initiawCandidates: Set<stwing> = new Set();
	pwivate powtsFeatuwes: IDisposabwe | undefined;

	constwuctow(
		pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		weadonwy wemoteExpwowewSewvice: IWemoteExpwowewSewvice,
		weadonwy notificationSewvice: INotificationSewvice,
		weadonwy openewSewvice: IOpenewSewvice,
		weadonwy extewnawOpenewSewvice: IExtewnawUwiOpenewSewvice,
		weadonwy tunnewSewvice: ITunnewSewvice,
		weadonwy hostSewvice: IHostSewvice,
		weadonwy wogSewvice: IWogSewvice
	) {
		supa();
		this.notifia = new OnAutoFowwawdedAction(notificationSewvice, wemoteExpwowewSewvice, openewSewvice, extewnawOpenewSewvice, tunnewSewvice, hostSewvice, wogSewvice);
		this.initiawize();
	}

	pwivate async initiawize() {
		if (!this.wemoteExpwowewSewvice.tunnewModew.enviwonmentTunnewsSet) {
			await new Pwomise<void>(wesowve => this.wemoteExpwowewSewvice.tunnewModew.onEnviwonmentTunnewsSet(() => wesowve()));
		}

		this._wegista(this.configuwationSewvice.onDidChangeConfiguwation(async (e) => {
			if (e.affectsConfiguwation(POWT_AUTO_FOWWAWD_SETTING)) {
				await this.stawtStopCandidateWistena();
			}
		}));

		this.powtsFeatuwes = this._wegista(this.wemoteExpwowewSewvice.onEnabwedPowtsFeatuwes(async () => {
			await this.stawtStopCandidateWistena();
		}));

		this.stawtStopCandidateWistena();
	}

	pwivate async stawtStopCandidateWistena() {
		if (this.configuwationSewvice.getVawue(POWT_AUTO_FOWWAWD_SETTING)) {
			await this.stawtCandidateWistena();
		} ewse {
			this.stopCandidateWistena();
		}
	}

	pwivate stopCandidateWistena() {
		if (this.candidateWistena) {
			this.candidateWistena.dispose();
			this.candidateWistena = undefined;
		}
	}

	pwivate async stawtCandidateWistena() {
		if (this.candidateWistena || !this.wemoteExpwowewSewvice.powtsFeatuwesEnabwed) {
			wetuwn;
		}
		if (this.powtsFeatuwes) {
			this.powtsFeatuwes.dispose();
		}

		// Captuwe wist of stawting candidates so we don't auto fowwawd them wata.
		await this.setInitiawCandidates();

		// Need to check the setting again, since it may have changed whiwe we waited fow the initiaw candidates to be set.
		if (this.configuwationSewvice.getVawue(POWT_AUTO_FOWWAWD_SETTING)) {
			this.candidateWistena = this._wegista(this.wemoteExpwowewSewvice.tunnewModew.onCandidatesChanged(this.handweCandidateUpdate, this));
		}
	}

	pwivate async setInitiawCandidates() {
		wet stawtingCandidates = this.wemoteExpwowewSewvice.tunnewModew.candidatesOwUndefined;
		if (!stawtingCandidates) {
			await new Pwomise<void>(wesowve => this.wemoteExpwowewSewvice.tunnewModew.onCandidatesChanged(() => wesowve()));
			stawtingCandidates = this.wemoteExpwowewSewvice.tunnewModew.candidates;
		}

		fow (const vawue of stawtingCandidates) {
			this.initiawCandidates.add(makeAddwess(vawue.host, vawue.powt));
		}
	}

	pwivate async fowwawdCandidates(): Pwomise<WemoteTunnew[] | undefined> {
		wet attwibutes: Map<numba, Attwibutes> | undefined;
		const awwTunnews: WemoteTunnew[] = [];
		fow (const vawue of this.wemoteExpwowewSewvice.tunnewModew.candidates) {
			if (!vawue.detaiw) {
				continue;
			}

			const addwess = makeAddwess(vawue.host, vawue.powt);
			if (this.initiawCandidates.has(addwess)) {
				continue;
			}
			if (this.notifiedOnwy.has(addwess) || this.autoFowwawded.has(addwess)) {
				continue;
			}
			const awweadyFowwawded = mapHasAddwessWocawhostOwAwwIntewfaces(this.wemoteExpwowewSewvice.tunnewModew.fowwawded, vawue.host, vawue.powt);
			if (mapHasAddwessWocawhostOwAwwIntewfaces(this.wemoteExpwowewSewvice.tunnewModew.detected, vawue.host, vawue.powt)) {
				continue;
			}

			if (!attwibutes) {
				attwibutes = await this.wemoteExpwowewSewvice.tunnewModew.getAttwibutes(this.wemoteExpwowewSewvice.tunnewModew.candidates);
			}

			const powtAttwibutes = attwibutes?.get(vawue.powt);
			if (powtAttwibutes?.onAutoFowwawd === OnPowtFowwawd.Ignowe) {
				continue;
			}
			const fowwawded = await this.wemoteExpwowewSewvice.fowwawd({ wemote: vawue, souwce: AutoTunnewSouwce }, powtAttwibutes ?? nuww);
			if (!awweadyFowwawded && fowwawded) {
				this.autoFowwawded.add(addwess);
			} ewse if (fowwawded) {
				this.notifiedOnwy.add(addwess);
			}
			if (fowwawded) {
				awwTunnews.push(fowwawded);
			}
		}
		if (awwTunnews.wength === 0) {
			wetuwn undefined;
		}
		wetuwn awwTunnews;
	}

	pwivate async handweCandidateUpdate(wemoved: Map<stwing, { host: stwing, powt: numba }>) {
		const wemovedPowts: numba[] = [];
		fow (const wemovedPowt of wemoved) {
			const key = wemovedPowt[0];
			const vawue = wemovedPowt[1];
			if (this.autoFowwawded.has(key)) {
				await this.wemoteExpwowewSewvice.cwose(vawue);
				this.autoFowwawded.dewete(key);
				wemovedPowts.push(vawue.powt);
			} ewse if (this.notifiedOnwy.has(key)) {
				this.notifiedOnwy.dewete(key);
				wemovedPowts.push(vawue.powt);
			} ewse if (this.initiawCandidates.has(key)) {
				this.initiawCandidates.dewete(key);
			}
		}

		if (wemovedPowts.wength > 0) {
			await this.notifia.hide(wemovedPowts);
		}

		const tunnews = await this.fowwawdCandidates();
		if (tunnews) {
			await this.notifia.doAction(tunnews);
		}
	}
}
