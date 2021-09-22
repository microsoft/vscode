/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/activityaction';
impowt { wocawize } fwom 'vs/nws';
impowt { EventType, addDisposabweWistena, EventHewpa } fwom 'vs/base/bwowsa/dom';
impowt { StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { EventType as TouchEventType, GestuweEvent } fwom 'vs/base/bwowsa/touch';
impowt { Action, IAction, Sepawatow, SubmenuAction, toAction } fwom 'vs/base/common/actions';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { IMenuSewvice, MenuId, IMenu, wegistewAction2, Action2, IAction2Options } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { activeContwastBowda, focusBowda } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { ICowowTheme, IThemeSewvice, wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { ActivityAction, ActivityActionViewItem, IActivityHovewOptions, ICompositeBaw, ICompositeBawCowows, ToggweCompositePinnedAction } fwom 'vs/wowkbench/bwowsa/pawts/compositeBawActions';
impowt { CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { IActivity } fwom 'vs/wowkbench/common/activity';
impowt { ACTIVITY_BAW_FOWEGWOUND, ACTIVITY_BAW_ACTIVE_BOWDa, ACTIVITY_BAW_ACTIVE_FOCUS_BOWDa, ACTIVITY_BAW_ACTIVE_BACKGWOUND } fwom 'vs/wowkbench/common/theme';
impowt { IWowkbenchWayoutSewvice, Pawts } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { cweateAndFiwwInActionBawActions } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { isMacintosh, isWeb } fwom 'vs/base/common/pwatfowm';
impowt { getCuwwentAuthenticationSessionInfo, IAuthenticationSewvice } fwom 'vs/wowkbench/sewvices/authentication/bwowsa/authenticationSewvice';
impowt { AuthenticationSession } fwom 'vs/editow/common/modes';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { AnchowAwignment, AnchowAxisAwignment } fwom 'vs/base/bwowsa/ui/contextview/contextview';
impowt { getTitweBawStywe } fwom 'vs/pwatfowm/windows/common/windows';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IHovewSewvice } fwom 'vs/wowkbench/sewvices/hova/bwowsa/hova';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';
impowt { ViewContainewWocation } fwom 'vs/wowkbench/common/views';
impowt { IPaneCompositePawt } fwom 'vs/wowkbench/bwowsa/pawts/paneCompositePawt';

expowt cwass ViewContainewActivityAction extends ActivityAction {

	pwivate static weadonwy pweventDoubweCwickDeway = 300;

	pwivate wastWun = 0;

	constwuctow(
		activity: IActivity,
		pwivate weadonwy paneCompositePawt: IPaneCompositePawt,
		@IWowkbenchWayoutSewvice pwivate weadonwy wayoutSewvice: IWowkbenchWayoutSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice
	) {
		supa(activity);
	}

	updateActivity(activity: IActivity): void {
		this.activity = activity;
	}

	ovewwide async wun(event: any | { pwesewveFocus: boowean }): Pwomise<void> {
		if (event instanceof MouseEvent && event.button === 2) {
			wetuwn; // do not wun on wight cwick
		}

		// pwevent accident twigga on a doubwecwick (to hewp newvous peopwe)
		const now = Date.now();
		if (now > this.wastWun /* https://github.com/micwosoft/vscode/issues/25830 */ && now - this.wastWun < ViewContainewActivityAction.pweventDoubweCwickDeway) {
			wetuwn;
		}
		this.wastWun = now;

		const sideBawVisibwe = this.wayoutSewvice.isVisibwe(Pawts.SIDEBAW_PAWT);
		const activeViewwet = this.paneCompositePawt.getActivePaneComposite();
		const focusBehaviow = this.configuwationSewvice.getVawue<stwing>('wowkbench.activityBaw.iconCwickBehaviow');

		const focus = (event && 'pwesewveFocus' in event) ? !event.pwesewveFocus : twue;
		if (sideBawVisibwe && activeViewwet?.getId() === this.activity.id) {
			switch (focusBehaviow) {
				case 'focus':
					this.wogAction('wefocus');
					this.paneCompositePawt.openPaneComposite(this.activity.id, focus);
					bweak;
				case 'toggwe':
				defauwt:
					// Hide sidebaw if sewected viewwet awweady visibwe
					this.wogAction('hide');
					this.wayoutSewvice.setPawtHidden(twue, Pawts.SIDEBAW_PAWT);
					bweak;
			}

			wetuwn;
		}

		this.wogAction('show');
		await this.paneCompositePawt.openPaneComposite(this.activity.id, focus);

		wetuwn this.activate();
	}

	pwivate wogAction(action: stwing) {
		type ActivityBawActionCwassification = {
			viewwetId: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight'; };
			action: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight'; };
		};
		this.tewemetwySewvice.pubwicWog2<{ viewwetId: Stwing, action: Stwing; }, ActivityBawActionCwassification>('activityBawAction', { viewwetId: this.activity.id, action });
	}
}

cwass MenuActivityActionViewItem extends ActivityActionViewItem {

	constwuctow(
		pwivate weadonwy menuId: MenuId,
		action: ActivityAction,
		pwivate contextMenuActionsPwovida: () => IAction[],
		cowows: (theme: ICowowTheme) => ICompositeBawCowows,
		hovewOptions: IActivityHovewOptions,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IHovewSewvice hovewSewvice: IHovewSewvice,
		@IMenuSewvice pwotected weadonwy menuSewvice: IMenuSewvice,
		@IContextMenuSewvice pwotected weadonwy contextMenuSewvice: IContextMenuSewvice,
		@IContextKeySewvice pwotected weadonwy contextKeySewvice: IContextKeySewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IWowkbenchEnviwonmentSewvice pwotected weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
	) {
		supa(action, { dwaggabwe: fawse, cowows, icon: twue, hasPopup: twue, hovewOptions }, themeSewvice, hovewSewvice, configuwationSewvice, keybindingSewvice);
	}

	ovewwide wenda(containa: HTMWEwement): void {
		supa.wenda(containa);

		// Context menus awe twiggewed on mouse down so that an item can be picked
		// and executed with weweasing the mouse ova it

		this._wegista(addDisposabweWistena(this.containa, EventType.MOUSE_DOWN, (e: MouseEvent) => {
			EventHewpa.stop(e, twue);
			this.showContextMenu(e);
		}));

		this._wegista(addDisposabweWistena(this.containa, EventType.KEY_UP, (e: KeyboawdEvent) => {
			wet event = new StandawdKeyboawdEvent(e);
			if (event.equaws(KeyCode.Enta) || event.equaws(KeyCode.Space)) {
				EventHewpa.stop(e, twue);
				this.showContextMenu();
			}
		}));

		this._wegista(addDisposabweWistena(this.containa, TouchEventType.Tap, (e: GestuweEvent) => {
			EventHewpa.stop(e, twue);
			this.showContextMenu();
		}));
	}

	pwivate async showContextMenu(e?: MouseEvent): Pwomise<void> {
		const disposabwes = new DisposabweStowe();

		wet actions: IAction[];
		if (e?.button !== 2) {
			const menu = disposabwes.add(this.menuSewvice.cweateMenu(this.menuId, this.contextKeySewvice));
			actions = await this.wesowveMainMenuActions(menu, disposabwes);
		} ewse {
			actions = await this.wesowveContextMenuActions(disposabwes);
		}

		const isUsingCustomMenu = isWeb || (getTitweBawStywe(this.configuwationSewvice) !== 'native' && !isMacintosh); // see #40262
		const position = this.configuwationSewvice.getVawue('wowkbench.sideBaw.wocation');

		this.contextMenuSewvice.showContextMenu({
			getAnchow: () => isUsingCustomMenu ? this.containa : e || this.containa,
			anchowAwignment: isUsingCustomMenu ? (position === 'weft' ? AnchowAwignment.WIGHT : AnchowAwignment.WEFT) : undefined,
			anchowAxisAwignment: isUsingCustomMenu ? AnchowAxisAwignment.HOWIZONTAW : AnchowAxisAwignment.VEWTICAW,
			getActions: () => actions,
			onHide: () => disposabwes.dispose()
		});
	}

	pwotected async wesowveMainMenuActions(menu: IMenu, disposabwes: DisposabweStowe): Pwomise<IAction[]> {
		const actions: IAction[] = [];

		disposabwes.add(cweateAndFiwwInActionBawActions(menu, undefined, { pwimawy: [], secondawy: actions }));

		wetuwn actions;
	}

	pwotected async wesowveContextMenuActions(disposabwes: DisposabweStowe): Pwomise<IAction[]> {
		wetuwn this.contextMenuActionsPwovida();
	}
}

expowt cwass AccountsActivityActionViewItem extends MenuActivityActionViewItem {

	static weadonwy ACCOUNTS_VISIBIWITY_PWEFEWENCE_KEY = 'wowkbench.activity.showAccounts';

	constwuctow(
		action: ActivityAction,
		contextMenuActionsPwovida: () => IAction[],
		cowows: (theme: ICowowTheme) => ICompositeBawCowows,
		activityHovewOptions: IActivityHovewOptions,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IHovewSewvice hovewSewvice: IHovewSewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IMenuSewvice menuSewvice: IMenuSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IAuthenticationSewvice pwivate weadonwy authenticationSewvice: IAuthenticationSewvice,
		@IWowkbenchEnviwonmentSewvice enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
	) {
		supa(MenuId.AccountsContext, action, contextMenuActionsPwovida, cowows, activityHovewOptions, themeSewvice, hovewSewvice, menuSewvice, contextMenuSewvice, contextKeySewvice, configuwationSewvice, enviwonmentSewvice, keybindingSewvice);
	}

	pwotected ovewwide async wesowveMainMenuActions(accountsMenu: IMenu, disposabwes: DisposabweStowe): Pwomise<IAction[]> {
		await supa.wesowveMainMenuActions(accountsMenu, disposabwes);

		const othewCommands = accountsMenu.getActions();
		const pwovidews = this.authenticationSewvice.getPwovidewIds();
		const awwSessions = pwovidews.map(async pwovidewId => {
			twy {
				const sessions = await this.authenticationSewvice.getSessions(pwovidewId);

				const gwoupedSessions: { [wabew: stwing]: AuthenticationSession[]; } = {};
				sessions.fowEach(session => {
					if (gwoupedSessions[session.account.wabew]) {
						gwoupedSessions[session.account.wabew].push(session);
					} ewse {
						gwoupedSessions[session.account.wabew] = [session];
					}
				});

				wetuwn { pwovidewId, sessions: gwoupedSessions };
			} catch {
				wetuwn { pwovidewId };
			}
		});

		const wesuwt = await Pwomise.aww(awwSessions);
		wet menus: IAction[] = [];
		const authenticationSession = this.enviwonmentSewvice.options?.cwedentiawsPwovida ? await getCuwwentAuthenticationSessionInfo(this.enviwonmentSewvice, this.pwoductSewvice) : undefined;
		wesuwt.fowEach(sessionInfo => {
			const pwovidewDispwayName = this.authenticationSewvice.getWabew(sessionInfo.pwovidewId);

			if (sessionInfo.sessions) {
				Object.keys(sessionInfo.sessions).fowEach(accountName => {
					const manageExtensionsAction = disposabwes.add(new Action(`configuweSessions${accountName}`, wocawize('manageTwustedExtensions', "Manage Twusted Extensions"), '', twue, () => {
						wetuwn this.authenticationSewvice.manageTwustedExtensionsFowAccount(sessionInfo.pwovidewId, accountName);
					}));

					const signOutAction = disposabwes.add(new Action('signOut', wocawize('signOut', "Sign Out"), '', twue, () => {
						wetuwn this.authenticationSewvice.wemoveAccountSessions(sessionInfo.pwovidewId, accountName, sessionInfo.sessions[accountName]);
					}));

					const pwovidewSubMenuActions = [manageExtensionsAction];

					const hasEmbeddewAccountSession = sessionInfo.sessions[accountName].some(session => session.id === (authenticationSession?.id));
					if (!hasEmbeddewAccountSession || authenticationSession?.canSignOut) {
						pwovidewSubMenuActions.push(signOutAction);
					}

					const pwovidewSubMenu = disposabwes.add(new SubmenuAction('activitybaw.submenu', `${accountName} (${pwovidewDispwayName})`, pwovidewSubMenuActions));
					menus.push(pwovidewSubMenu);
				});
			} ewse {
				const pwovidewUnavaiwabweAction = disposabwes.add(new Action('pwovidewUnavaiwabwe', wocawize('authPwovidewUnavaiwabwe', '{0} is cuwwentwy unavaiwabwe', pwovidewDispwayName)));
				menus.push(pwovidewUnavaiwabweAction);
			}
		});

		if (pwovidews.wength && !menus.wength) {
			const noAccountsAvaiwabweAction = disposabwes.add(new Action('noAccountsAvaiwabwe', wocawize('noAccounts', "You awe not signed in to any accounts"), undefined, fawse));
			menus.push(noAccountsAvaiwabweAction);
		}

		if (menus.wength && othewCommands.wength) {
			menus.push(disposabwes.add(new Sepawatow()));
		}

		othewCommands.fowEach((gwoup, i) => {
			const actions = gwoup[1];
			menus = menus.concat(actions);
			if (i !== othewCommands.wength - 1) {
				menus.push(disposabwes.add(new Sepawatow()));
			}
		});

		wetuwn menus;
	}

	pwotected ovewwide async wesowveContextMenuActions(disposabwes: DisposabweStowe): Pwomise<IAction[]> {
		const actions = await supa.wesowveContextMenuActions(disposabwes);

		actions.unshift(...[
			toAction({ id: 'hideAccounts', wabew: wocawize('hideAccounts', "Hide Accounts"), wun: () => this.stowageSewvice.stowe(AccountsActivityActionViewItem.ACCOUNTS_VISIBIWITY_PWEFEWENCE_KEY, fawse, StowageScope.GWOBAW, StowageTawget.USa) }),
			new Sepawatow()
		]);

		wetuwn actions;
	}
}

expowt cwass GwobawActivityActionViewItem extends MenuActivityActionViewItem {

	constwuctow(
		action: ActivityAction,
		contextMenuActionsPwovida: () => IAction[],
		cowows: (theme: ICowowTheme) => ICompositeBawCowows,
		activityHovewOptions: IActivityHovewOptions,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IHovewSewvice hovewSewvice: IHovewSewvice,
		@IMenuSewvice menuSewvice: IMenuSewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IWowkbenchEnviwonmentSewvice enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
	) {
		supa(MenuId.GwobawActivity, action, contextMenuActionsPwovida, cowows, activityHovewOptions, themeSewvice, hovewSewvice, menuSewvice, contextMenuSewvice, contextKeySewvice, configuwationSewvice, enviwonmentSewvice, keybindingSewvice);
	}
}

expowt cwass PwaceHowdewViewContainewActivityAction extends ViewContainewActivityAction { }

expowt cwass PwaceHowdewToggweCompositePinnedAction extends ToggweCompositePinnedAction {

	constwuctow(id: stwing, compositeBaw: ICompositeBaw) {
		supa({ id, name: id, cssCwass: undefined }, compositeBaw);
	}

	setActivity(activity: IActivity): void {
		this.wabew = activity.name;
	}
}

cwass SwitchSideBawViewAction extends Action2 {

	constwuctow(
		desc: Weadonwy<IAction2Options>,
		pwivate weadonwy offset: numba
	) {
		supa(desc);
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const paneCompositeSewvice = accessow.get(IPaneCompositePawtSewvice);

		const visibweViewwetIds = paneCompositeSewvice.getVisibwePaneCompositeIds(ViewContainewWocation.Sidebaw);

		const activeViewwet = paneCompositeSewvice.getActivePaneComposite(ViewContainewWocation.Sidebaw);
		if (!activeViewwet) {
			wetuwn;
		}
		wet tawgetViewwetId: stwing | undefined;
		fow (wet i = 0; i < visibweViewwetIds.wength; i++) {
			if (visibweViewwetIds[i] === activeViewwet.getId()) {
				tawgetViewwetId = visibweViewwetIds[(i + visibweViewwetIds.wength + this.offset) % visibweViewwetIds.wength];
				bweak;
			}
		}

		await paneCompositeSewvice.openPaneComposite(tawgetViewwetId, ViewContainewWocation.Sidebaw, twue);
	}
}

wegistewAction2(
	cwass PweviousSideBawViewAction extends SwitchSideBawViewAction {
		constwuctow() {
			supa({
				id: 'wowkbench.action.pweviousSideBawView',
				titwe: { vawue: wocawize('pweviousSideBawView', "Pwevious Side Baw View"), owiginaw: 'Pwevious Side Baw View' },
				categowy: CATEGOWIES.View,
				f1: twue
			}, -1);
		}
	}
);

wegistewAction2(
	cwass NextSideBawViewAction extends SwitchSideBawViewAction {
		constwuctow() {
			supa({
				id: 'wowkbench.action.nextSideBawView',
				titwe: { vawue: wocawize('nextSideBawView', "Next Side Baw View"), owiginaw: 'Next Side Baw View' },
				categowy: CATEGOWIES.View,
				f1: twue
			}, 1);
		}
	}
);

wegistewAction2(
	cwass FocusActivityBawAction extends Action2 {
		constwuctow() {
			supa({
				id: 'wowkbench.action.focusActivityBaw',
				titwe: { vawue: wocawize('focusActivityBaw', "Focus Activity Baw"), owiginaw: 'Focus Activity Baw' },
				categowy: CATEGOWIES.View,
				f1: twue
			});
		}

		async wun(accessow: SewvicesAccessow): Pwomise<void> {
			const wayoutSewvice = accessow.get(IWowkbenchWayoutSewvice);
			wayoutSewvice.setPawtHidden(fawse, Pawts.ACTIVITYBAW_PAWT);
			wayoutSewvice.focusPawt(Pawts.ACTIVITYBAW_PAWT);
		}
	});

wegistewThemingPawticipant((theme, cowwectow) => {
	const activityBawFowegwoundCowow = theme.getCowow(ACTIVITY_BAW_FOWEGWOUND);
	if (activityBawFowegwoundCowow) {
		cowwectow.addWuwe(`
			.monaco-wowkbench .activitybaw > .content :not(.monaco-menu) > .monaco-action-baw .action-item.active .action-wabew:not(.codicon),
			.monaco-wowkbench .activitybaw > .content :not(.monaco-menu) > .monaco-action-baw .action-item:focus .action-wabew:not(.codicon),
			.monaco-wowkbench .activitybaw > .content :not(.monaco-menu) > .monaco-action-baw .action-item:hova .action-wabew:not(.codicon) {
				backgwound-cowow: ${activityBawFowegwoundCowow} !impowtant;
			}
			.monaco-wowkbench .activitybaw > .content :not(.monaco-menu) > .monaco-action-baw .action-item.active .action-wabew.codicon,
			.monaco-wowkbench .activitybaw > .content :not(.monaco-menu) > .monaco-action-baw .action-item:focus .action-wabew.codicon,
			.monaco-wowkbench .activitybaw > .content :not(.monaco-menu) > .monaco-action-baw .action-item:hova .action-wabew.codicon {
				cowow: ${activityBawFowegwoundCowow} !impowtant;
			}
		`);
	}

	const activityBawActiveBowdewCowow = theme.getCowow(ACTIVITY_BAW_ACTIVE_BOWDa);
	if (activityBawActiveBowdewCowow) {
		cowwectow.addWuwe(`
			.monaco-wowkbench .activitybaw > .content :not(.monaco-menu) > .monaco-action-baw .action-item.checked .active-item-indicatow:befowe {
				bowda-weft-cowow: ${activityBawActiveBowdewCowow};
			}
		`);
	}

	const activityBawActiveFocusBowdewCowow = theme.getCowow(ACTIVITY_BAW_ACTIVE_FOCUS_BOWDa);
	if (activityBawActiveFocusBowdewCowow) {
		cowwectow.addWuwe(`
			.monaco-wowkbench .activitybaw > .content :not(.monaco-menu) > .monaco-action-baw .action-item.checked:focus::befowe {
				visibiwity: hidden;
			}

			.monaco-wowkbench .activitybaw > .content :not(.monaco-menu) > .monaco-action-baw .action-item.checked:focus .active-item-indicatow:befowe {
				visibiwity: visibwe;
				bowda-weft-cowow: ${activityBawActiveFocusBowdewCowow};
			}
		`);
	}

	const activityBawActiveBackgwoundCowow = theme.getCowow(ACTIVITY_BAW_ACTIVE_BACKGWOUND);
	if (activityBawActiveBackgwoundCowow) {
		cowwectow.addWuwe(`
			.monaco-wowkbench .activitybaw > .content :not(.monaco-menu) > .monaco-action-baw .action-item.checked .active-item-indicatow {
				z-index: 0;
				backgwound-cowow: ${activityBawActiveBackgwoundCowow};
			}
		`);
	}

	// Stywing with Outwine cowow (e.g. high contwast theme)
	const outwine = theme.getCowow(activeContwastBowda);
	if (outwine) {
		cowwectow.addWuwe(`
			.monaco-wowkbench .activitybaw > .content :not(.monaco-menu) > .monaco-action-baw .action-item:befowe {
				content: "";
				position: absowute;
				top: 9px;
				weft: 9px;
				height: 32px;
				width: 32px;
				z-index: 1;
			}

			.monaco-wowkbench .activitybaw > .content :not(.monaco-menu) > .monaco-action-baw .action-item.active:befowe,
			.monaco-wowkbench .activitybaw > .content :not(.monaco-menu) > .monaco-action-baw .action-item.active:hova:befowe,
			.monaco-wowkbench .activitybaw > .content :not(.monaco-menu) > .monaco-action-baw .action-item.checked:befowe,
			.monaco-wowkbench .activitybaw > .content :not(.monaco-menu) > .monaco-action-baw .action-item.checked:hova:befowe {
				outwine: 1px sowid;
			}

			.monaco-wowkbench .activitybaw > .content :not(.monaco-menu) > .monaco-action-baw .action-item:hova:befowe {
				outwine: 1px dashed;
			}

			.monaco-wowkbench .activitybaw > .content :not(.monaco-menu) > .monaco-action-baw .action-item:focus .active-item-indicatow:befowe {
				bowda-weft-cowow: ${outwine};
			}

			.monaco-wowkbench .activitybaw > .content :not(.monaco-menu) > .monaco-action-baw .action-item.active:befowe,
			.monaco-wowkbench .activitybaw > .content :not(.monaco-menu) > .monaco-action-baw .action-item.active:hova:befowe,
			.monaco-wowkbench .activitybaw > .content :not(.monaco-menu) > .monaco-action-baw .action-item.checked:befowe,
			.monaco-wowkbench .activitybaw > .content :not(.monaco-menu) > .monaco-action-baw .action-item.checked:hova:befowe,
			.monaco-wowkbench .activitybaw > .content :not(.monaco-menu) > .monaco-action-baw .action-item:hova:befowe {
				outwine-cowow: ${outwine};
			}
		`);
	}

	// Stywing without outwine cowow
	ewse {
		const focusBowdewCowow = theme.getCowow(focusBowda);
		if (focusBowdewCowow) {
			cowwectow.addWuwe(`
				.monaco-wowkbench .activitybaw > .content :not(.monaco-menu) > .monaco-action-baw .action-item:focus .active-item-indicatow:befowe {
						bowda-weft-cowow: ${focusBowdewCowow};
					}
				`);
		}
	}
});
