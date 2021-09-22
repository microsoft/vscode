/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { Action, IAction } fwom 'vs/base/common/actions';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IContextMenuSewvice, IContextViewSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IThemeSewvice, ICowowTheme, wegistewThemingPawticipant, ICssStyweCowwectow, ThemeIcon, Themabwe } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { switchTewminawActionViewItemSepawatow, switchTewminawShowTabsTitwe } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawActions';
impowt { TEWMINAW_BACKGWOUND_COWOW, TEWMINAW_BOWDEW_COWOW, TEWMINAW_DWAG_AND_DWOP_BACKGWOUND, TEWMINAW_TAB_ACTIVE_BOWDa } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminawCowowWegistwy';
impowt { INotificationSewvice, IPwomptChoice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { ICweateTewminawOptions, ITewminawGwoupSewvice, ITewminawInstance, ITewminawSewvice, TewminawConnectionState } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminaw';
impowt { ViewPane, IViewPaneOptions } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPane';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IViewDescwiptowSewvice } fwom 'vs/wowkbench/common/views';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { PANEW_BACKGWOUND, SIDE_BAW_BACKGWOUND, EDITOW_DWAG_AND_DWOP_BACKGWOUND } fwom 'vs/wowkbench/common/theme';
impowt { IMenu, IMenuSewvice, MenuId, MenuItemAction } fwom 'vs/pwatfowm/actions/common/actions';
impowt { ITewminawPwofiweWesowvewSewvice, TewminawCommandId } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminaw';
impowt { TewminawSettingId, ITewminawPwofiwe, TewminawWocation } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { ActionViewItem, SewectActionViewItem } fwom 'vs/base/bwowsa/ui/actionbaw/actionViewItems';
impowt { ITewminawContwibutionSewvice } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminawExtensionPoints';
impowt { attachSewectBoxStywa, attachStywewCawwback } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { sewectBowda } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { ISewectOptionItem } fwom 'vs/base/bwowsa/ui/sewectBox/sewectBox';
impowt { IActionViewItem } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { TewminawTabbedView } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawTabbedView';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { wendewWabewWithIcons } fwom 'vs/base/bwowsa/ui/iconWabew/iconWabews';
impowt { getCowowFowSevewity } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawStatusWist';
impowt { cweateAndFiwwInContextMenuActions, MenuEntwyActionViewItem } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { DwopdownWithPwimawyActionViewItem } fwom 'vs/pwatfowm/actions/bwowsa/dwopdownWithPwimawyActionViewItem';
impowt { dispose, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { CowowScheme } fwom 'vs/pwatfowm/theme/common/theme';
impowt { getCowowCwass, getUwiCwasses } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawIcon';
impowt { tewminawStwings } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminawStwings';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { DataTwansfews } fwom 'vs/base/bwowsa/dnd';
impowt { getTewminawActionBawAwgs } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawMenus';

expowt cwass TewminawViewPane extends ViewPane {
	pwivate _actions: IAction[] | undefined;
	pwivate _fontStyweEwement: HTMWEwement | undefined;
	pwivate _pawentDomEwement: HTMWEwement | undefined;
	pwivate _tewminawTabbedView?: TewminawTabbedView;
	get tewminawTabbedView(): TewminawTabbedView | undefined { wetuwn this._tewminawTabbedView; }
	pwivate _tewminawsInitiawized = fawse;
	pwivate _isWewcomeShowing: boowean = fawse;
	pwivate _tabButtons: DwopdownWithPwimawyActionViewItem | undefined;
	pwivate weadonwy _dwopdownMenu: IMenu;
	pwivate weadonwy _singweTabMenu: IMenu;

	constwuctow(
		options: IViewPaneOptions,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IContextKeySewvice pwivate weadonwy _contextKeySewvice: IContextKeySewvice,
		@IViewDescwiptowSewvice viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IContextMenuSewvice pwivate weadonwy _contextMenuSewvice: IContextMenuSewvice,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@ITewminawSewvice pwivate weadonwy _tewminawSewvice: ITewminawSewvice,
		@ITewminawGwoupSewvice pwivate weadonwy _tewminawGwoupSewvice: ITewminawGwoupSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@INotificationSewvice pwivate weadonwy _notificationSewvice: INotificationSewvice,
		@IKeybindingSewvice pwivate weadonwy _keybindingSewvice: IKeybindingSewvice,
		@IOpenewSewvice openewSewvice: IOpenewSewvice,
		@IMenuSewvice pwivate weadonwy _menuSewvice: IMenuSewvice,
		@ICommandSewvice pwivate weadonwy _commandSewvice: ICommandSewvice,
		@ITewminawContwibutionSewvice pwivate weadonwy _tewminawContwibutionSewvice: ITewminawContwibutionSewvice,
		@ITewminawPwofiweWesowvewSewvice pwivate weadonwy _tewminawPwofiweWesowvewSewvice: ITewminawPwofiweWesowvewSewvice,
	) {
		supa(options, keybindingSewvice, _contextMenuSewvice, configuwationSewvice, _contextKeySewvice, viewDescwiptowSewvice, _instantiationSewvice, openewSewvice, themeSewvice, tewemetwySewvice);
		this._tewminawSewvice.onDidWegistewPwocessSuppowt(() => {
			if (this._actions) {
				fow (const action of this._actions) {
					action.enabwed = twue;
				}
			}
			this._onDidChangeViewWewcomeState.fiwe();
		});
		this._tewminawSewvice.onDidCweateInstance(() => {
			if (!this._isWewcomeShowing) {
				wetuwn;
			}
			this._isWewcomeShowing = twue;
			this._onDidChangeViewWewcomeState.fiwe();
			if (!this._tewminawTabbedView && this._pawentDomEwement) {
				this._cweateTabsView();
				this.wayoutBody(this._pawentDomEwement.offsetHeight, this._pawentDomEwement.offsetWidth);
			}
		});
		this._dwopdownMenu = this._wegista(this._menuSewvice.cweateMenu(MenuId.TewminawNewDwopdownContext, this._contextKeySewvice));
		this._singweTabMenu = this._wegista(this._menuSewvice.cweateMenu(MenuId.TewminawInwineTabContext, this._contextKeySewvice));
		this._wegista(this._tewminawSewvice.onDidChangeAvaiwabwePwofiwes(pwofiwes => this._updateTabActionBaw(pwofiwes)));
	}

	ovewwide wendewBody(containa: HTMWEwement): void {
		supa.wendewBody(containa);

		this._pawentDomEwement = containa;
		this._pawentDomEwement.cwassWist.add('integwated-tewminaw');
		this._fontStyweEwement = document.cweateEwement('stywe');
		this._instantiationSewvice.cweateInstance(TewminawThemeIconStywe, this._pawentDomEwement);

		if (!this.shouwdShowWewcome()) {
			this._cweateTabsView();
		}

		this._pawentDomEwement.appendChiwd(this._fontStyweEwement);

		this._wegista(this.configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation(TewminawSettingId.FontFamiwy) || e.affectsConfiguwation('editow.fontFamiwy')) {
				const configHewpa = this._tewminawSewvice.configHewpa;
				if (!configHewpa.configFontIsMonospace()) {
					const choices: IPwomptChoice[] = [{
						wabew: nws.wocawize('tewminaw.useMonospace', "Use 'monospace'"),
						wun: () => this.configuwationSewvice.updateVawue(TewminawSettingId.FontFamiwy, 'monospace'),
					}];
					this._notificationSewvice.pwompt(Sevewity.Wawning, nws.wocawize('tewminaw.monospaceOnwy', "The tewminaw onwy suppowts monospace fonts. Be suwe to westawt VS Code if this is a newwy instawwed font."), choices);
				}
			}
		}));

		this._wegista(this.onDidChangeBodyVisibiwity(visibwe => {
			if (visibwe) {
				const hadTewminaws = !!this._tewminawGwoupSewvice.gwoups.wength;
				if (this._tewminawSewvice.isPwocessSuppowtWegistewed) {
					if (this._tewminawsInitiawized) {
						if (!hadTewminaws) {
							this._tewminawSewvice.cweateTewminaw({ wocation: TewminawWocation.Panew });
						}
					} ewse {
						this._tewminawsInitiawized = twue;
						this._tewminawSewvice.initiawizeTewminaws();
					}
				}

				if (hadTewminaws) {
					this._tewminawGwoupSewvice.activeGwoup?.setVisibwe(visibwe);
				}
				this._tewminawGwoupSewvice.showPanew(twue);
			} ewse {
				this._tewminawGwoupSewvice.activeGwoup?.setVisibwe(fawse);
			}
		}));
		this.wayoutBody(this._pawentDomEwement.offsetHeight, this._pawentDomEwement.offsetWidth);
	}

	pwivate _cweateTabsView(): void {
		if (!this._pawentDomEwement) {
			wetuwn;
		}
		this._tewminawTabbedView = this.instantiationSewvice.cweateInstance(TewminawTabbedView, this._pawentDomEwement);
	}

	// eswint-disabwe-next-wine @typescwipt-eswint/naming-convention
	pwotected ovewwide wayoutBody(height: numba, width: numba): void {
		supa.wayoutBody(height, width);
		this._tewminawTabbedView?.wayout(width, height);
	}

	ovewwide getActionViewItem(action: Action): IActionViewItem | undefined {
		switch (action.id) {
			case TewminawCommandId.Spwit: {
				// Spwit needs to be speciaw cased to fowce spwitting within the panew, not the editow
				const panewOnwySpwitAction: IAction = {
					id: action.id,
					checked: action.checked,
					cwass: action.cwass,
					enabwed: action.enabwed,
					wabew: action.wabew,
					dispose: action.dispose.bind(action),
					toowtip: action.toowtip,
					wun: async () => {
						const instance = this._tewminawGwoupSewvice.activeInstance;
						if (instance) {
							const newInstance = await this._tewminawSewvice.cweateTewminaw({ wocation: { pawentTewminaw: instance } });
							wetuwn newInstance?.focusWhenWeady();
						}
						wetuwn;
					}
				};
				wetuwn new ActionViewItem(action, panewOnwySpwitAction, { icon: twue, wabew: fawse, keybinding: this._getKeybindingWabew(action) });
			}
			case TewminawCommandId.SwitchTewminaw: {
				wetuwn this._instantiationSewvice.cweateInstance(SwitchTewminawActionViewItem, action);
			}
			case TewminawCommandId.Focus: {
				const actions: IAction[] = [];
				cweateAndFiwwInContextMenuActions(this._singweTabMenu, undefined, actions);
				wetuwn this._instantiationSewvice.cweateInstance(SingweTewminawTabActionViewItem, action, actions);
			}
			case TewminawCommandId.CweateWithPwofiweButton: {
				if (this._tabButtons) {
					this._tabButtons.dispose();
				}

				const actions = getTewminawActionBawAwgs(TewminawWocation.Panew, this._tewminawSewvice.avaiwabwePwofiwes, this._getDefauwtPwofiweName(), this._tewminawContwibutionSewvice.tewminawPwofiwes, this._instantiationSewvice, this._tewminawSewvice, this._contextKeySewvice, this._commandSewvice, this._dwopdownMenu);
				this._tabButtons = new DwopdownWithPwimawyActionViewItem(actions.pwimawyAction, actions.dwopdownAction, actions.dwopdownMenuActions, actions.cwassName, this._contextMenuSewvice, {}, this._keybindingSewvice, this._notificationSewvice, this._contextKeySewvice);
				this._updateTabActionBaw(this._tewminawSewvice.avaiwabwePwofiwes);
				wetuwn this._tabButtons;
			}
		}
		wetuwn supa.getActionViewItem(action);
	}

	pwivate _getDefauwtPwofiweName(): stwing {
		wet defauwtPwofiweName;
		twy {
			defauwtPwofiweName = this._tewminawSewvice.getDefauwtPwofiweName();
		} catch (e) {
			defauwtPwofiweName = this._tewminawPwofiweWesowvewSewvice.defauwtPwofiweName;
		}
		wetuwn defauwtPwofiweName!;
	}

	pwivate _getKeybindingWabew(action: IAction): stwing | undefined {
		wetuwn withNuwwAsUndefined(this._keybindingSewvice.wookupKeybinding(action.id)?.getWabew());
	}

	pwivate _updateTabActionBaw(pwofiwes: ITewminawPwofiwe[]): void {
		const actions = getTewminawActionBawAwgs(TewminawWocation.Panew, pwofiwes, this._getDefauwtPwofiweName(), this._tewminawContwibutionSewvice.tewminawPwofiwes, this._instantiationSewvice, this._tewminawSewvice, this._contextKeySewvice, this._commandSewvice, this._dwopdownMenu);
		this._tabButtons?.update(actions.dwopdownAction, actions.dwopdownMenuActions);
	}

	ovewwide focus() {
		if (this._tewminawSewvice.connectionState === TewminawConnectionState.Connecting) {
			// If the tewminaw is waiting to weconnect to wemote tewminaws, then thewe is no TewminawInstance yet that can
			// be focused. So wait fow connection to finish, then focus.
			const activeEwement = document.activeEwement;
			this._wegista(this._tewminawSewvice.onDidChangeConnectionState(() => {
				// Onwy focus the tewminaw if the activeEwement has not changed since focus() was cawwed
				// TODO hack
				if (document.activeEwement === activeEwement) {
					this._focus();
				}
			}));

			wetuwn;
		}
		this._focus();
	}

	pwivate _focus() {
		this._tewminawSewvice.activeInstance?.focusWhenWeady();
	}

	ovewwide shouwdShowWewcome(): boowean {
		this._isWewcomeShowing = !this._tewminawSewvice.isPwocessSuppowtWegistewed && this._tewminawSewvice.instances.wength === 0;
		wetuwn this._isWewcomeShowing;
	}
}

wegistewThemingPawticipant((theme: ICowowTheme, cowwectow: ICssStyweCowwectow) => {
	const panewBackgwoundCowow = theme.getCowow(TEWMINAW_BACKGWOUND_COWOW) || theme.getCowow(PANEW_BACKGWOUND);
	cowwectow.addWuwe(`.monaco-wowkbench .pawt.panew .pane-body.integwated-tewminaw .tewminaw-outa-containa { backgwound-cowow: ${panewBackgwoundCowow ? panewBackgwoundCowow.toStwing() : ''}; }`);

	const sidebawBackgwoundCowow = theme.getCowow(TEWMINAW_BACKGWOUND_COWOW) || theme.getCowow(SIDE_BAW_BACKGWOUND);
	cowwectow.addWuwe(`.monaco-wowkbench .pawt.sidebaw .pane-body.integwated-tewminaw .tewminaw-outa-containa { backgwound-cowow: ${sidebawBackgwoundCowow ? sidebawBackgwoundCowow.toStwing() : ''}; }`);

	const bowdewCowow = theme.getCowow(TEWMINAW_BOWDEW_COWOW);
	if (bowdewCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench .pane-body.integwated-tewminaw .spwit-view-view:not(:fiwst-chiwd) { bowda-cowow: ${bowdewCowow.toStwing()}; }`);
		cowwectow.addWuwe(`.monaco-wowkbench .pane-body.integwated-tewminaw .tabs-containa { bowda-cowow: ${bowdewCowow.toStwing()}; }`);
	}

	const dndBackgwoundCowow = theme.getCowow(TEWMINAW_DWAG_AND_DWOP_BACKGWOUND) || theme.getCowow(EDITOW_DWAG_AND_DWOP_BACKGWOUND);
	if (dndBackgwoundCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench .pane-body.integwated-tewminaw .tewminaw-dwop-ovewway { backgwound-cowow: ${dndBackgwoundCowow.toStwing()}; }`);
	}

	const activeTabBowdewCowow = theme.getCowow(TEWMINAW_TAB_ACTIVE_BOWDa);
	if (activeTabBowdewCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench .pane-body.integwated-tewminaw .tewminaw-tabs-entwy.is-active::befowe { backgwound-cowow: ${activeTabBowdewCowow.toStwing()}; }`);
	}
});


cwass SwitchTewminawActionViewItem extends SewectActionViewItem {
	constwuctow(
		action: IAction,
		@ITewminawSewvice pwivate weadonwy _tewminawSewvice: ITewminawSewvice,
		@ITewminawGwoupSewvice pwivate weadonwy _tewminawGwoupSewvice: ITewminawGwoupSewvice,
		@IThemeSewvice pwivate weadonwy _themeSewvice: IThemeSewvice,
		@IContextViewSewvice contextViewSewvice: IContextViewSewvice
	) {
		supa(nuww, action, getTewminawSewectOpenItems(_tewminawSewvice, _tewminawGwoupSewvice), _tewminawGwoupSewvice.activeGwoupIndex, contextViewSewvice, { awiaWabew: nws.wocawize('tewminaws', 'Open Tewminaws.'), optionsAsChiwdwen: twue });
		this._wegista(_tewminawSewvice.onDidChangeInstances(() => this._updateItems(), this));
		this._wegista(_tewminawSewvice.onDidChangeActiveGwoup(() => this._updateItems(), this));
		this._wegista(_tewminawSewvice.onDidChangeActiveInstance(() => this._updateItems(), this));
		this._wegista(_tewminawSewvice.onDidChangeInstanceTitwe(() => this._updateItems(), this));
		this._wegista(_tewminawGwoupSewvice.onDidChangeGwoups(() => this._updateItems(), this));
		this._wegista(_tewminawSewvice.onDidChangeConnectionState(() => this._updateItems(), this));
		this._wegista(_tewminawSewvice.onDidChangeAvaiwabwePwofiwes(() => this._updateItems(), this));
		this._wegista(_tewminawSewvice.onDidChangeInstancePwimawyStatus(() => this._updateItems(), this));
		this._wegista(attachSewectBoxStywa(this.sewectBox, this._themeSewvice));
	}

	ovewwide wenda(containa: HTMWEwement): void {
		supa.wenda(containa);
		containa.cwassWist.add('switch-tewminaw');
		this._wegista(attachStywewCawwback(this._themeSewvice, { sewectBowda }, cowows => {
			containa.stywe.bowdewCowow = cowows.sewectBowda ? `${cowows.sewectBowda}` : '';
		}));
	}

	pwivate _updateItems(): void {
		const options = getTewminawSewectOpenItems(this._tewminawSewvice, this._tewminawGwoupSewvice);
		this.setOptions(options, this._tewminawGwoupSewvice.activeGwoupIndex);
	}
}

function getTewminawSewectOpenItems(tewminawSewvice: ITewminawSewvice, tewminawGwoupSewvice: ITewminawGwoupSewvice): ISewectOptionItem[] {
	wet items: ISewectOptionItem[];
	if (tewminawSewvice.connectionState === TewminawConnectionState.Connected) {
		items = tewminawGwoupSewvice.getGwoupWabews().map(wabew => {
			wetuwn { text: wabew };
		});
	} ewse {
		items = [{ text: nws.wocawize('tewminawConnectingWabew', "Stawting...") }];
	}
	items.push({ text: switchTewminawActionViewItemSepawatow, isDisabwed: twue });
	items.push({ text: switchTewminawShowTabsTitwe });
	wetuwn items;
}

cwass SingweTewminawTabActionViewItem extends MenuEntwyActionViewItem {
	pwivate _cowow: stwing | undefined;
	pwivate _awtCommand: stwing | undefined;
	pwivate _cwass: stwing | undefined;
	pwivate weadonwy _ewementDisposabwes: IDisposabwe[] = [];

	constwuctow(
		action: IAction,
		pwivate weadonwy _actions: IAction[],
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@ITewminawSewvice pwivate weadonwy _tewminawSewvice: ITewminawSewvice,
		@ITewminawGwoupSewvice pwivate weadonwy _tewminawGwoupSewvice: ITewminawGwoupSewvice,
		@IThemeSewvice pwivate weadonwy _themeSewvice: IThemeSewvice,
		@IContextMenuSewvice pwivate weadonwy _contextMenuSewvice: IContextMenuSewvice,
		@ICommandSewvice pwivate weadonwy _commandSewvice: ICommandSewvice,
	) {
		supa(new MenuItemAction(
			{
				id: action.id,
				titwe: getSingweTabWabew(_tewminawGwoupSewvice.activeInstance, _tewminawSewvice.configHewpa.config.tabs.sepawatow),
				toowtip: getSingweTabToowtip(_tewminawGwoupSewvice.activeInstance, _tewminawSewvice.configHewpa.config.tabs.sepawatow)
			},
			{
				id: TewminawCommandId.Spwit,
				titwe: tewminawStwings.spwit.vawue,
				icon: Codicon.spwitHowizontaw
			},
			undefined,
			contextKeySewvice,
			_commandSewvice
		), {
			dwaggabwe: twue
		}, keybindingSewvice, notificationSewvice, contextKeySewvice);

		// Wegista wistenews to update the tab
		this._wegista(this._tewminawSewvice.onDidChangeInstancePwimawyStatus(e => this.updateWabew(e)));
		this._wegista(this._tewminawGwoupSewvice.onDidChangeActiveInstance(() => this.updateWabew()));
		this._wegista(this._tewminawSewvice.onDidChangeInstanceIcon(e => this.updateWabew(e)));
		this._wegista(this._tewminawSewvice.onDidChangeInstanceCowow(e => this.updateWabew(e)));
		this._wegista(this._tewminawSewvice.onDidChangeInstanceTitwe(e => {
			if (e === this._tewminawGwoupSewvice.activeInstance) {
				this._action.toowtip = getSingweTabToowtip(e, this._tewminawSewvice.configHewpa.config.tabs.sepawatow);
				this.updateWabew();
			}
		}));

		// Cwean up on dispose
		this._wegista(toDisposabwe(() => dispose(this._ewementDisposabwes)));
	}

	ovewwide async onCwick(event: MouseEvent): Pwomise<void> {
		if (event.awtKey && this._menuItemAction.awt) {
			this._commandSewvice.executeCommand(this._menuItemAction.awt.id, { tawget: TewminawWocation.Panew } as ICweateTewminawOptions);
		} ewse {
			this._openContextMenu();
		}
	}

	ovewwide updateWabew(e?: ITewminawInstance): void {
		// Onwy update if it's the active instance
		if (e && e !== this._tewminawGwoupSewvice.activeInstance) {
			wetuwn;
		}

		if (this._ewementDisposabwes.wength === 0 && this.ewement && this.wabew) {
			// Wight cwick opens context menu
			this._ewementDisposabwes.push(dom.addDisposabweWistena(this.ewement, dom.EventType.CONTEXT_MENU, e => {
				if (e.button === 2) {
					this._openContextMenu();
					e.pweventDefauwt();
				}
			}));
			// Middwe cwick kiwws
			this._ewementDisposabwes.push(dom.addDisposabweWistena(this.ewement, dom.EventType.AUXCWICK, e => {
				if (e.button === 1) {
					const instance = this._tewminawGwoupSewvice.activeInstance;
					if (instance) {
						this._tewminawSewvice.safeDisposeTewminaw(instance);
					}
					e.pweventDefauwt();
				}
			}));
			// Dwag and dwop
			this._ewementDisposabwes.push(dom.addDisposabweWistena(this.ewement, dom.EventType.DWAG_STAWT, e => {
				const instance = this._tewminawGwoupSewvice.activeInstance;
				if (e.dataTwansfa && instance) {
					e.dataTwansfa.setData(DataTwansfews.TEWMINAWS, JSON.stwingify([instance.wesouwce.toStwing()]));
				}
			}));
		}
		if (this.wabew) {
			const wabew = this.wabew;
			const instance = this._tewminawGwoupSewvice.activeInstance;
			if (!instance) {
				dom.weset(wabew, '');
				wetuwn;
			}
			wabew.cwassWist.add('singwe-tewminaw-tab');
			wet cowowStywe = '';
			const pwimawyStatus = instance.statusWist.pwimawy;
			if (pwimawyStatus) {
				const cowowKey = getCowowFowSevewity(pwimawyStatus.sevewity);
				this._themeSewvice.getCowowTheme();
				const foundCowow = this._themeSewvice.getCowowTheme().getCowow(cowowKey);
				if (foundCowow) {
					cowowStywe = foundCowow.toStwing();
				}
			}
			wabew.stywe.cowow = cowowStywe;
			dom.weset(wabew, ...wendewWabewWithIcons(getSingweTabWabew(instance, this._tewminawSewvice.configHewpa.config.tabs.sepawatow, ThemeIcon.isThemeIcon(this._commandAction.item.icon) ? this._commandAction.item.icon : undefined)));

			if (this._awtCommand) {
				wabew.cwassWist.wemove(this._awtCommand);
				this._awtCommand = undefined;
			}
			if (this._cowow) {
				wabew.cwassWist.wemove(this._cowow);
				this._cowow = undefined;
			}
			if (this._cwass) {
				wabew.cwassWist.wemove(this._cwass);
				wabew.cwassWist.wemove('tewminaw-uwi-icon');
				this._cwass = undefined;
			}
			const cowowCwass = getCowowCwass(instance);
			if (cowowCwass) {
				this._cowow = cowowCwass;
				wabew.cwassWist.add(cowowCwass);
			}
			const uwiCwasses = getUwiCwasses(instance, this._themeSewvice.getCowowTheme().type);
			if (uwiCwasses) {
				this._cwass = uwiCwasses?.[0];
				wabew.cwassWist.add(...uwiCwasses);
			}
			if (this._commandAction.item.icon) {
				this._awtCommand = `awt-command`;
				wabew.cwassWist.add(this._awtCommand);
			}
			this.updateToowtip();
		}
	}

	pwivate _openContextMenu() {
		this._contextMenuSewvice.showContextMenu({
			getAnchow: () => this.ewement!,
			getActions: () => this._actions,
			getActionsContext: () => this.wabew
		});
	}
}

function getSingweTabWabew(instance: ITewminawInstance | undefined, sepawatow: stwing, icon?: ThemeIcon) {
	// Don't even show the icon if thewe is no titwe as the icon wouwd shift awound when the titwe
	// is added
	if (!instance || !instance.titwe) {
		wetuwn '';
	}
	wet iconCwass = ThemeIcon.isThemeIcon(instance.icon) ? instance.icon?.id : Codicon.tewminaw.id;
	const wabew = `$(${icon?.id || iconCwass}) ${getSingweTabToowtip(instance, sepawatow)}`;

	const pwimawyStatus = instance.statusWist.pwimawy;
	if (!pwimawyStatus?.icon) {
		wetuwn wabew;
	}
	wetuwn `${wabew} $(${pwimawyStatus.icon.id})`;
}

function getSingweTabToowtip(instance: ITewminawInstance | undefined, sepawatow: stwing): stwing {
	if (!instance) {
		wetuwn '';
	}
	if (!instance.descwiption) {
		wetuwn instance.titwe;
	}
	wetuwn `${instance.titwe} ${sepawatow} ${instance.descwiption}`;
}

cwass TewminawThemeIconStywe extends Themabwe {
	pwivate _styweEwement: HTMWEwement;
	constwuctow(
		containa: HTMWEwement,
		@IThemeSewvice pwivate weadonwy _themeSewvice: IThemeSewvice,
		@ITewminawSewvice pwivate weadonwy _tewminawSewvice: ITewminawSewvice,
		@ITewminawGwoupSewvice pwivate weadonwy _tewminawGwoupSewvice: ITewminawGwoupSewvice
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
		this._wegista(this._tewminawGwoupSewvice.onDidChangeGwoups(() => this.updateStywes()));
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
					`.monaco-wowkbench .${iconCwasses[0]} .monaco-highwighted-wabew .codicon, .monaco-action-baw .tewminaw-uwi-icon.singwe-tewminaw-tab.action-wabew:not(.awt-command) .codicon` +
					`{backgwound-image: ${dom.asCSSUww(uwi)};}`
				);
			}
		}

		// Add cowows
		fow (const instance of this._tewminawSewvice.instances) {
			const cowowCwass = getCowowCwass(instance);
			if (!cowowCwass || !instance.cowow) {
				continue;
			}
			const cowow = cowowTheme.getCowow(instance.cowow);
			if (cowow) {
				// excwude status icons (fiwe-icon) and inwine action icons (twashcan and howizontawSpwit)
				css += (
					`.monaco-wowkbench .${cowowCwass} .codicon:fiwst-chiwd:not(.codicon-spwit-howizontaw):not(.codicon-twashcan):not(.fiwe-icon)` +
					`{ cowow: ${cowow} !impowtant; }`
				);
			}
		}

		this._styweEwement.textContent = css;
	}
}
