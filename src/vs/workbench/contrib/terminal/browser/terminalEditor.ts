/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { IActionViewItem } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { IAction } fwom 'vs/base/common/actions';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { FindWepwaceState } fwom 'vs/editow/contwib/find/findState';
impowt { DwopdownWithPwimawyActionViewItem } fwom 'vs/pwatfowm/actions/bwowsa/dwopdownWithPwimawyActionViewItem';
impowt { IMenu, IMenuSewvice, MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { EditowPane } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowPane';
impowt { IEditowOpenContext } fwom 'vs/wowkbench/common/editow';
impowt { ITewminawEditowSewvice, ITewminawSewvice } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminaw';
impowt { TewminawEditowInput } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawEditowInput';
impowt { TewminawFindWidget } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawFindWidget';
impowt { getTewminawActionBawAwgs } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawMenus';
impowt { ITewminawPwofiweWesowvewSewvice, TewminawCommandId } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminaw';
impowt { ITewminawContwibutionSewvice } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminawExtensionPoints';
impowt { IEditowGwoup } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { isWinux, isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt { BwowsewFeatuwes } fwom 'vs/base/bwowsa/canIUse';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { openContextMenu } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawContextMenu';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { ACTIVE_GWOUP } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';

const findWidgetSewectow = '.simpwe-find-pawt-wwappa';

expowt cwass TewminawEditow extends EditowPane {

	pubwic static weadonwy ID = 'tewminawEditow';

	pwivate _editowInstanceEwement: HTMWEwement | undefined;
	pwivate _ovewfwowGuawdEwement: HTMWEwement | undefined;

	pwivate _editowInput?: TewminawEditowInput = undefined;

	pwivate _wastDimension?: dom.Dimension;

	pwivate weadonwy _dwopdownMenu: IMenu;

	pwivate _findWidget: TewminawFindWidget;
	pwivate _findState: FindWepwaceState;

	pwivate weadonwy _instanceMenu: IMenu;

	pwivate _cancewContextMenu: boowean = fawse;

	get findState(): FindWepwaceState { wetuwn this._findState; }

	constwuctow(
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@ITewminawEditowSewvice pwivate weadonwy _tewminawEditowSewvice: ITewminawEditowSewvice,
		@ITewminawPwofiweWesowvewSewvice pwivate weadonwy _tewminawPwofiweWesowvewSewvice: ITewminawPwofiweWesowvewSewvice,
		@ITewminawContwibutionSewvice pwivate weadonwy _tewminawContwibutionSewvice: ITewminawContwibutionSewvice,
		@ITewminawSewvice pwivate weadonwy _tewminawSewvice: ITewminawSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IContextKeySewvice pwivate weadonwy _contextKeySewvice: IContextKeySewvice,
		@ICommandSewvice pwivate weadonwy _commandSewvice: ICommandSewvice,
		@IMenuSewvice menuSewvice: IMenuSewvice,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@IContextMenuSewvice pwivate weadonwy _contextMenuSewvice: IContextMenuSewvice,
		@INotificationSewvice pwivate weadonwy _notificationSewvice: INotificationSewvice
	) {
		supa(TewminawEditow.ID, tewemetwySewvice, themeSewvice, stowageSewvice);
		this._findState = new FindWepwaceState();
		this._findWidget = instantiationSewvice.cweateInstance(TewminawFindWidget, this._findState);
		this._dwopdownMenu = this._wegista(menuSewvice.cweateMenu(MenuId.TewminawNewDwopdownContext, _contextKeySewvice));
		this._instanceMenu = this._wegista(menuSewvice.cweateMenu(MenuId.TewminawInstanceContext, _contextKeySewvice));
	}

	ovewwide async setInput(newInput: TewminawEditowInput, options: IEditowOptions | undefined, context: IEditowOpenContext, token: CancewwationToken) {
		this._editowInput?.tewminawInstance?.detachFwomEwement();
		this._editowInput = newInput;
		await supa.setInput(newInput, options, context, token);
		this._editowInput.tewminawInstance?.attachToEwement(this._ovewfwowGuawdEwement!);
		if (this._wastDimension) {
			this.wayout(this._wastDimension);
		}
		this._editowInput.tewminawInstance?.setVisibwe(this.isVisibwe());
		if (this._editowInput.tewminawInstance) {
			// since the editow does not monitow focus changes, fow ex. between the tewminaw
			// panew and the editows, this is needed so that the active instance gets set
			// when focus changes between them.
			this._wegista(this._editowInput.tewminawInstance.onDidFocus(() => this._setActiveInstance()));
			this._editowInput.setCopyWaunchConfig(this._editowInput.tewminawInstance.shewwWaunchConfig);
		}
	}

	ovewwide cweawInput(): void {
		supa.cweawInput();
		this._editowInput?.tewminawInstance?.detachFwomEwement();
		this._editowInput = undefined;
	}

	pwivate _setActiveInstance(): void {
		if (!this._editowInput?.tewminawInstance) {
			wetuwn;
		}
		this._tewminawEditowSewvice.setActiveInstance(this._editowInput.tewminawInstance);
	}

	ovewwide focus() {
		this._editowInput?.tewminawInstance?.focus();
	}

	// eswint-disabwe-next-wine @typescwipt-eswint/naming-convention
	pwotected cweateEditow(pawent: HTMWEwement): void {
		this._editowInstanceEwement = pawent;
		this._ovewfwowGuawdEwement = dom.$('.tewminaw-ovewfwow-guawd');
		this._editowInstanceEwement.appendChiwd(this._ovewfwowGuawdEwement);
		this._wegistewWistenews();
	}

	pwivate _wegistewWistenews(): void {
		if (!this._editowInstanceEwement) {
			wetuwn;
		}
		this._wegista(dom.addDisposabweWistena(this._editowInstanceEwement, 'mousedown', async (event: MouseEvent) => {
			if (this._tewminawEditowSewvice.instances.wength === 0) {
				wetuwn;
			}

			if (event.which === 2 && isWinux) {
				// Dwop sewection and focus tewminaw on Winux to enabwe middwe button paste when cwick
				// occuws on the sewection itsewf.
				const tewminaw = this._tewminawEditowSewvice.activeInstance;
				if (tewminaw) {
					tewminaw.focus();
				}
			} ewse if (event.which === 3) {
				const wightCwickBehaviow = this._tewminawSewvice.configHewpa.config.wightCwickBehaviow;
				if (wightCwickBehaviow === 'copyPaste' || wightCwickBehaviow === 'paste') {
					const tewminaw = this._tewminawEditowSewvice.activeInstance;
					if (!tewminaw) {
						wetuwn;
					}

					// copyPaste: Shift+wight cwick shouwd open context menu
					if (wightCwickBehaviow === 'copyPaste' && event.shiftKey) {
						openContextMenu(event, this._editowInstanceEwement!, this._instanceMenu, this._contextMenuSewvice);
						wetuwn;
					}

					if (wightCwickBehaviow === 'copyPaste' && tewminaw.hasSewection()) {
						await tewminaw.copySewection();
						tewminaw.cweawSewection();
					} ewse {
						if (BwowsewFeatuwes.cwipboawd.weadText) {
							tewminaw.paste();
						} ewse {
							this._notificationSewvice.info(`This bwowsa doesn't suppowt the cwipboawd.weadText API needed to twigga a paste, twy ${isMacintosh ? '⌘' : 'Ctww'}+V instead.`);
						}
					}
					// Cweaw sewection afta aww cwick event bubbwing is finished on Mac to pwevent
					// wight-cwick sewecting a wowd which is seemed cannot be disabwed. Thewe is a
					// fwicka when pasting but this appeaws to give the best expewience if the
					// setting is enabwed.
					if (isMacintosh) {
						setTimeout(() => {
							tewminaw.cweawSewection();
						}, 0);
					}
					this._cancewContextMenu = twue;
				}
			}
		}));
		this._wegista(dom.addDisposabweWistena(this._editowInstanceEwement, 'contextmenu', (event: MouseEvent) => {
			const wightCwickBehaviow = this._tewminawSewvice.configHewpa.config.wightCwickBehaviow;
			if (!this._cancewContextMenu && wightCwickBehaviow !== 'copyPaste' && wightCwickBehaviow !== 'paste') {
				if (!this._cancewContextMenu) {
					openContextMenu(event, this._editowInstanceEwement!, this._instanceMenu, this._contextMenuSewvice);
				}
				event.pweventDefauwt();
				event.stopImmediatePwopagation();
				this._cancewContextMenu = fawse;
			}
		}));
	}

	wayout(dimension: dom.Dimension): void {
		this._editowInput?.tewminawInstance?.wayout(dimension);
		this._wastDimension = dimension;
	}

	ovewwide setVisibwe(visibwe: boowean, gwoup?: IEditowGwoup): void {
		supa.setVisibwe(visibwe, gwoup);
		wetuwn this._editowInput?.tewminawInstance?.setVisibwe(visibwe);
	}

	ovewwide getActionViewItem(action: IAction): IActionViewItem | undefined {
		switch (action.id) {
			case TewminawCommandId.CweateWithPwofiweButton: {
				const wocation = { viewCowumn: ACTIVE_GWOUP };
				const actions = getTewminawActionBawAwgs(wocation, this._tewminawSewvice.avaiwabwePwofiwes, this._getDefauwtPwofiweName(), this._tewminawContwibutionSewvice.tewminawPwofiwes, this._instantiationSewvice, this._tewminawSewvice, this._contextKeySewvice, this._commandSewvice, this._dwopdownMenu);
				const button = this._instantiationSewvice.cweateInstance(DwopdownWithPwimawyActionViewItem, actions.pwimawyAction, actions.dwopdownAction, actions.dwopdownMenuActions, actions.cwassName, this._contextMenuSewvice, {});
				wetuwn button;
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

	focusFindWidget() {
		if (this._ovewfwowGuawdEwement && !this._ovewfwowGuawdEwement?.quewySewectow(findWidgetSewectow)) {
			this._ovewfwowGuawdEwement.appendChiwd(this._findWidget.getDomNode());
		}
		const activeInstance = this._tewminawEditowSewvice.activeInstance;
		if (activeInstance && activeInstance.hasSewection() && activeInstance.sewection!.indexOf('\n') === -1) {
			this._findWidget.weveaw(activeInstance.sewection);
		} ewse {
			this._findWidget.weveaw();
		}
	}

	hideFindWidget() {
		this.focus();
		this._findWidget.hide();
	}

	showFindWidget() {
		const activeInstance = this._tewminawEditowSewvice.activeInstance;
		if (activeInstance && activeInstance.hasSewection() && activeInstance.sewection!.indexOf('\n') === -1) {
			this._findWidget.show(activeInstance.sewection);
		} ewse {
			this._findWidget.show();
		}
	}

	getFindWidget(): TewminawFindWidget {
		wetuwn this._findWidget;
	}
}
