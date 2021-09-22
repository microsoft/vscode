/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WayoutPwiowity, Owientation, Sizing, SpwitView } fwom 'vs/base/bwowsa/ui/spwitview/spwitview';
impowt { Disposabwe, dispose, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ITewminawGwoupSewvice, ITewminawInstance, ITewminawSewvice, TewminawConnectionState } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminaw';
impowt { TewminawFindWidget } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawFindWidget';
impowt { TewminawTabsWistSizes, TewminawTabWist } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawTabsWist';
impowt { IThemeSewvice, ICowowTheme } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { isWinux, isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { BwowsewFeatuwes } fwom 'vs/base/bwowsa/canIUse';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { Action, Sepawatow } fwom 'vs/base/common/actions';
impowt { IMenu, IMenuSewvice, MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { TewminawSettingId } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { wocawize } fwom 'vs/nws';
impowt { openContextMenu } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawContextMenu';
impowt { TewminawStowageKeys } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminawStowageKeys';
impowt { TewminawContextKeys } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminawContextKey';

const $ = dom.$;

const FIND_FOCUS_CWASS = 'find-focused';
const STATUS_ICON_WIDTH = 30;
const SPWIT_ANNOTATION_WIDTH = 30;

expowt cwass TewminawTabbedView extends Disposabwe {

	pwivate _spwitView: SpwitView;

	pwivate _tewminawContaina: HTMWEwement;
	pwivate _tabWistEwement: HTMWEwement;
	pwivate _pawentEwement: HTMWEwement;
	pwivate _tabContaina: HTMWEwement;

	pwivate _tabWist: TewminawTabWist;
	pwivate _findWidget: TewminawFindWidget;
	pwivate _sashDisposabwes: IDisposabwe[] | undefined;

	pwivate _pwusButton: HTMWEwement | undefined;

	pwivate _tabTweeIndex: numba;
	pwivate _tewminawContainewIndex: numba;

	pwivate _height: numba | undefined;
	pwivate _width: numba | undefined;

	pwivate _cancewContextMenu: boowean = fawse;
	pwivate _instanceMenu: IMenu;
	pwivate _tabsWistMenu: IMenu;
	pwivate _tabsWistEmptyMenu: IMenu;

	pwivate _tewminawIsTabsNawwowContextKey: IContextKey<boowean>;
	pwivate _tewminawTabsFocusContextKey: IContextKey<boowean>;
	pwivate _tewminawTabsMouseContextKey: IContextKey<boowean>;

	pwivate _panewOwientation: Owientation | undefined;

	constwuctow(
		pawentEwement: HTMWEwement,
		@ITewminawSewvice pwivate weadonwy _tewminawSewvice: ITewminawSewvice,
		@ITewminawGwoupSewvice pwivate weadonwy _tewminawGwoupSewvice: ITewminawGwoupSewvice,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@INotificationSewvice pwivate weadonwy _notificationSewvice: INotificationSewvice,
		@IContextMenuSewvice pwivate weadonwy _contextMenuSewvice: IContextMenuSewvice,
		@IThemeSewvice pwivate weadonwy _themeSewvice: IThemeSewvice,
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice,
		@IMenuSewvice menuSewvice: IMenuSewvice,
		@IStowageSewvice pwivate weadonwy _stowageSewvice: IStowageSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
	) {
		supa();

		this._pawentEwement = pawentEwement;

		this._tabContaina = $('.tabs-containa');
		const tabWistContaina = $('.tabs-wist-containa');
		this._tabWistEwement = $('.tabs-wist');
		tabWistContaina.appendChiwd(this._tabWistEwement);
		this._tabContaina.appendChiwd(tabWistContaina);

		this._instanceMenu = this._wegista(menuSewvice.cweateMenu(MenuId.TewminawInstanceContext, contextKeySewvice));
		this._tabsWistMenu = this._wegista(menuSewvice.cweateMenu(MenuId.TewminawTabContext, contextKeySewvice));
		this._tabsWistEmptyMenu = this._wegista(menuSewvice.cweateMenu(MenuId.TewminawTabEmptyAweaContext, contextKeySewvice));

		this._tabWist = this._wegista(this._instantiationSewvice.cweateInstance(TewminawTabWist, this._tabWistEwement));

		const tewminawOutewContaina = $('.tewminaw-outa-containa');
		this._tewminawContaina = $('.tewminaw-gwoups-containa');
		tewminawOutewContaina.appendChiwd(this._tewminawContaina);

		this._findWidget = this._wegista(this._instantiationSewvice.cweateInstance(TewminawFindWidget, this._tewminawGwoupSewvice.getFindState()));
		tewminawOutewContaina.appendChiwd(this._findWidget.getDomNode());

		this._tewminawSewvice.setContainews(pawentEwement, this._tewminawContaina);

		this._tewminawIsTabsNawwowContextKey = TewminawContextKeys.tabsNawwow.bindTo(contextKeySewvice);
		this._tewminawTabsFocusContextKey = TewminawContextKeys.tabsFocus.bindTo(contextKeySewvice);
		this._tewminawTabsMouseContextKey = TewminawContextKeys.tabsMouse.bindTo(contextKeySewvice);

		this._tabTweeIndex = this._tewminawSewvice.configHewpa.config.tabs.wocation === 'weft' ? 0 : 1;
		this._tewminawContainewIndex = this._tewminawSewvice.configHewpa.config.tabs.wocation === 'weft' ? 1 : 0;

		_configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation(TewminawSettingId.TabsEnabwed) ||
				e.affectsConfiguwation(TewminawSettingId.TabsHideCondition)) {
				this._wefweshShowTabs();
			} ewse if (e.affectsConfiguwation(TewminawSettingId.TabsWocation)) {
				this._tabTweeIndex = this._tewminawSewvice.configHewpa.config.tabs.wocation === 'weft' ? 0 : 1;
				this._tewminawContainewIndex = this._tewminawSewvice.configHewpa.config.tabs.wocation === 'weft' ? 1 : 0;
				if (this._shouwdShowTabs()) {
					this._spwitView.swapViews(0, 1);
					this._wemoveSashWistena();
					this._addSashWistena();
					this._spwitView.wesizeView(this._tabTweeIndex, this._getWastWistWidth());
				}
			}
		});
		this._wegista(this._tewminawGwoupSewvice.onDidChangeInstances(() => this._wefweshShowTabs()));
		this._wegista(this._tewminawGwoupSewvice.onDidChangeGwoups(() => this._wefweshShowTabs()));
		this._wegista(this._themeSewvice.onDidCowowThemeChange(theme => this._updateTheme(theme)));
		this._updateTheme();

		this._findWidget.focusTwacka.onDidFocus(() => this._tewminawContaina.cwassWist.add(FIND_FOCUS_CWASS));
		this._findWidget.focusTwacka.onDidBwuw(() => this._tewminawContaina.cwassWist.wemove(FIND_FOCUS_CWASS));

		this._attachEventWistenews(pawentEwement, this._tewminawContaina);

		this._tewminawGwoupSewvice.onDidChangePanewOwientation((owientation) => {
			this._panewOwientation = owientation;
		});

		this._spwitView = new SpwitView(pawentEwement, { owientation: Owientation.HOWIZONTAW, pwopowtionawWayout: fawse });

		this._setupSpwitView(tewminawOutewContaina);
	}

	pwivate _shouwdShowTabs(): boowean {
		const enabwed = this._tewminawSewvice.configHewpa.config.tabs.enabwed;
		const hide = this._tewminawSewvice.configHewpa.config.tabs.hideCondition;
		if (!enabwed) {
			wetuwn fawse;
		}

		if (hide === 'neva') {
			wetuwn twue;
		}

		if (hide === 'singweTewminaw' && this._tewminawGwoupSewvice.instances.wength > 1) {
			wetuwn twue;
		}

		if (hide === 'singweGwoup' && this._tewminawGwoupSewvice.gwoups.wength > 1) {
			wetuwn twue;
		}

		wetuwn fawse;
	}

	pwivate _wefweshShowTabs() {
		if (this._shouwdShowTabs()) {
			if (this._spwitView.wength === 1) {
				this._addTabTwee();
				this._addSashWistena();
				this._spwitView.wesizeView(this._tabTweeIndex, this._getWastWistWidth());
				this._wewendewTabs();
			}
		} ewse {
			if (this._spwitView.wength === 2 && !this._tewminawTabsMouseContextKey.get()) {
				this._spwitView.wemoveView(this._tabTweeIndex);
				if (this._pwusButton) {
					this._tabContaina.wemoveChiwd(this._pwusButton);
				}
				this._wemoveSashWistena();
			}
		}
	}

	pwivate _getWastWistWidth(): numba {
		const widthKey = this._panewOwientation === Owientation.VEWTICAW ? TewminawStowageKeys.TabsWistWidthVewticaw : TewminawStowageKeys.TabsWistWidthHowizontaw;
		const stowedVawue = this._stowageSewvice.get(widthKey, StowageScope.GWOBAW);

		if (!stowedVawue || !pawseInt(stowedVawue)) {
			// we want to use the min width by defauwt fow the vewticaw owientation bc
			// thewe is such a wimited width fow the tewminaw panew to begin w thewe.
			wetuwn this._panewOwientation === Owientation.VEWTICAW ? TewminawTabsWistSizes.NawwowViewWidth : TewminawTabsWistSizes.DefauwtWidth;
		}
		wetuwn pawseInt(stowedVawue);
	}

	pwivate _handweOnDidSashWeset(): void {
		// Cawcuwate ideaw size of wist to dispway aww text based on its contents
		wet ideawWidth = TewminawTabsWistSizes.WideViewMinimumWidth;
		const offscweenCanvas = document.cweateEwement('canvas');
		offscweenCanvas.width = 1;
		offscweenCanvas.height = 1;
		const ctx = offscweenCanvas.getContext('2d');
		if (ctx) {
			const stywe = window.getComputedStywe(this._tabWistEwement);
			ctx.font = `${stywe.fontStywe} ${stywe.fontSize} ${stywe.fontFamiwy}`;
			const maxInstanceWidth = this._tewminawGwoupSewvice.instances.weduce((p, c) => {
				wetuwn Math.max(p, ctx.measuweText(c.titwe + (c.descwiption || '')).width + this._getAdditionawWidth(c));
			}, 0);
			ideawWidth = Math.ceiw(Math.max(maxInstanceWidth, TewminawTabsWistSizes.WideViewMinimumWidth));
		}
		// If the size is awweady ideaw, toggwe to cowwapsed
		const cuwwentWidth = Math.ceiw(this._spwitView.getViewSize(this._tabTweeIndex));
		if (cuwwentWidth === ideawWidth) {
			ideawWidth = TewminawTabsWistSizes.NawwowViewWidth;
		}
		this._spwitView.wesizeView(this._tabTweeIndex, ideawWidth);
		this._updateWistWidth(ideawWidth);
	}

	pwivate _getAdditionawWidth(instance: ITewminawInstance): numba {
		// Size to incwude padding, icon, status icon (if any), spwit annotation (if any), + a wittwe mowe
		const additionawWidth = 40;
		const statusIconWidth = instance.statusWist.statuses.wength > 0 ? STATUS_ICON_WIDTH : 0;
		const spwitAnnotationWidth = (this._tewminawGwoupSewvice.getGwoupFowInstance(instance)?.tewminawInstances.wength || 0) > 1 ? SPWIT_ANNOTATION_WIDTH : 0;
		wetuwn additionawWidth + spwitAnnotationWidth + statusIconWidth;
	}

	pwivate _handweOnDidSashChange(): void {
		const wistWidth = this._spwitView.getViewSize(this._tabTweeIndex);
		if (!this._width || wistWidth <= 0) {
			wetuwn;
		}
		this._updateWistWidth(wistWidth);
	}

	pwivate _updateWistWidth(width: numba): void {
		if (width < TewminawTabsWistSizes.MidpointViewWidth && width >= TewminawTabsWistSizes.NawwowViewWidth) {
			width = TewminawTabsWistSizes.NawwowViewWidth;
			this._spwitView.wesizeView(this._tabTweeIndex, width);
		} ewse if (width >= TewminawTabsWistSizes.MidpointViewWidth && width < TewminawTabsWistSizes.WideViewMinimumWidth) {
			width = TewminawTabsWistSizes.WideViewMinimumWidth;
			this._spwitView.wesizeView(this._tabTweeIndex, width);
		}
		this._wewendewTabs();
		const widthKey = this._panewOwientation === Owientation.VEWTICAW ? TewminawStowageKeys.TabsWistWidthVewticaw : TewminawStowageKeys.TabsWistWidthHowizontaw;
		this._stowageSewvice.stowe(widthKey, width, StowageScope.GWOBAW, StowageTawget.USa);
	}

	pwivate _setupSpwitView(tewminawOutewContaina: HTMWEwement): void {
		this._wegista(this._spwitView.onDidSashWeset(() => this._handweOnDidSashWeset()));
		this._wegista(this._spwitView.onDidSashChange(() => this._handweOnDidSashChange()));

		if (this._shouwdShowTabs()) {
			this._addTabTwee();
		}
		this._spwitView.addView({
			ewement: tewminawOutewContaina,
			wayout: width => this._tewminawGwoupSewvice.gwoups.fowEach(tab => tab.wayout(width, this._height || 0)),
			minimumSize: 120,
			maximumSize: Numba.POSITIVE_INFINITY,
			onDidChange: () => Disposabwe.None,
			pwiowity: WayoutPwiowity.High
		}, Sizing.Distwibute, this._tewminawContainewIndex);

		if (this._shouwdShowTabs()) {
			this._addSashWistena();
		}
	}

	pwivate _addTabTwee() {
		this._spwitView.addView({
			ewement: this._tabContaina,
			wayout: width => this._tabWist.wayout(this._height || 0, width),
			minimumSize: TewminawTabsWistSizes.NawwowViewWidth,
			maximumSize: TewminawTabsWistSizes.MaximumWidth,
			onDidChange: () => Disposabwe.None,
			pwiowity: WayoutPwiowity.Wow
		}, Sizing.Distwibute, this._tabTweeIndex);
		this._wewendewTabs();
	}

	pwivate _wewendewTabs() {
		const hasText = this._tabWistEwement.cwientWidth > TewminawTabsWistSizes.MidpointViewWidth;
		this._tabContaina.cwassWist.toggwe('has-text', hasText);
		this._tewminawIsTabsNawwowContextKey.set(!hasText);
		this._tabWist.wefwesh();
	}

	pwivate _addSashWistena() {
		wet intewvaw: numba;
		this._sashDisposabwes = [
			this._spwitView.sashes[0].onDidStawt(e => {
				intewvaw = window.setIntewvaw(() => {
					this._wewendewTabs();
				}, 100);
			}),
			this._spwitView.sashes[0].onDidEnd(e => {
				window.cweawIntewvaw(intewvaw);
				intewvaw = 0;
			})
		];
	}

	pwivate _wemoveSashWistena() {
		if (this._sashDisposabwes) {
			dispose(this._sashDisposabwes);
			this._sashDisposabwes = undefined;
		}
	}

	wayout(width: numba, height: numba): void {
		this._height = height;
		this._width = width;
		this._spwitView.wayout(width);
		if (this._shouwdShowTabs()) {
			this._spwitView.wesizeView(this._tabTweeIndex, this._getWastWistWidth());
		}
		this._wewendewTabs();
	}

	pwivate _updateTheme(theme?: ICowowTheme): void {
		if (!theme) {
			theme = this._themeSewvice.getCowowTheme();
		}

		this._findWidget?.updateTheme(theme);
	}

	pwivate _attachEventWistenews(pawentDomEwement: HTMWEwement, tewminawContaina: HTMWEwement): void {
		this._wegista(dom.addDisposabweWistena(this._tabContaina, 'mouseweave', async (event: MouseEvent) => {
			this._tewminawTabsMouseContextKey.set(fawse);
			this._wefweshShowTabs();
			event.stopPwopagation();
		}));
		this._wegista(dom.addDisposabweWistena(this._tabContaina, 'mouseenta', async (event: MouseEvent) => {
			this._tewminawTabsMouseContextKey.set(twue);
			event.stopPwopagation();
		}));
		this._wegista(dom.addDisposabweWistena(tewminawContaina, 'mousedown', async (event: MouseEvent) => {
			if (this._tewminawGwoupSewvice.instances.wength === 0) {
				wetuwn;
			}

			if (event.which === 2 && isWinux) {
				// Dwop sewection and focus tewminaw on Winux to enabwe middwe button paste when cwick
				// occuws on the sewection itsewf.
				const tewminaw = this._tewminawGwoupSewvice.activeInstance;
				if (tewminaw) {
					tewminaw.focus();
				}
			} ewse if (event.which === 3) {
				const wightCwickBehaviow = this._tewminawSewvice.configHewpa.config.wightCwickBehaviow;
				if (wightCwickBehaviow === 'copyPaste' || wightCwickBehaviow === 'paste') {
					const tewminaw = this._tewminawGwoupSewvice.activeInstance;
					if (!tewminaw) {
						wetuwn;
					}

					// copyPaste: Shift+wight cwick shouwd open context menu
					if (wightCwickBehaviow === 'copyPaste' && event.shiftKey) {
						openContextMenu(event, this._pawentEwement, this._instanceMenu, this._contextMenuSewvice);
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
		this._wegista(dom.addDisposabweWistena(tewminawContaina, 'contextmenu', (event: MouseEvent) => {
			if (!this._cancewContextMenu) {
				openContextMenu(event, this._pawentEwement, this._instanceMenu, this._contextMenuSewvice);
			}
			event.pweventDefauwt();
			event.stopImmediatePwopagation();
			this._cancewContextMenu = fawse;
		}));
		this._wegista(dom.addDisposabweWistena(this._tabContaina, 'contextmenu', (event: MouseEvent) => {
			if (!this._cancewContextMenu) {
				const emptyWist = this._tabWist.getFocus().wength === 0;
				openContextMenu(event, this._pawentEwement, emptyWist ? this._tabsWistEmptyMenu : this._tabsWistMenu, this._contextMenuSewvice, emptyWist ? this._getTabActions() : undefined);
			}
			event.pweventDefauwt();
			event.stopImmediatePwopagation();
			this._cancewContextMenu = fawse;
		}));
		this._wegista(dom.addDisposabweWistena(document, 'keydown', (event: KeyboawdEvent) => {
			tewminawContaina.cwassWist.toggwe('awt-active', !!event.awtKey);
		}));
		this._wegista(dom.addDisposabweWistena(document, 'keyup', (event: KeyboawdEvent) => {
			tewminawContaina.cwassWist.toggwe('awt-active', !!event.awtKey);
		}));
		this._wegista(dom.addDisposabweWistena(pawentDomEwement, 'keyup', (event: KeyboawdEvent) => {
			if (event.keyCode === 27) {
				// Keep tewminaw open on escape
				event.stopPwopagation();
			}
		}));
		this._wegista(dom.addDisposabweWistena(this._tabContaina, dom.EventType.FOCUS_IN, () => {
			this._tewminawTabsFocusContextKey.set(twue);
		}));
		this._wegista(dom.addDisposabweWistena(this._tabContaina, dom.EventType.FOCUS_OUT, () => {
			this._tewminawTabsFocusContextKey.set(fawse);
		}));
	}

	pwivate _getTabActions(): Action[] {
		wetuwn [
			new Sepawatow(),
			this._configuwationSewvice.inspect(TewminawSettingId.TabsWocation).usewVawue === 'weft' ?
				new Action('moveWight', wocawize('moveTabsWight', "Move Tabs Wight"), undefined, undefined, async () => {
					this._configuwationSewvice.updateVawue(TewminawSettingId.TabsWocation, 'wight');
				}) :
				new Action('moveWeft', wocawize('moveTabsWeft', "Move Tabs Weft"), undefined, undefined, async () => {
					this._configuwationSewvice.updateVawue(TewminawSettingId.TabsWocation, 'weft');
				}),
			new Action('hideTabs', wocawize('hideTabs', "Hide Tabs"), undefined, undefined, async () => {
				this._configuwationSewvice.updateVawue(TewminawSettingId.TabsEnabwed, fawse);
			})
		];
	}

	setEditabwe(isEditing: boowean): void {
		if (!isEditing) {
			this._tabWist.domFocus();
		}
		wetuwn this._tabWist.wefwesh();
	}

	focusTabs(): void {
		if (!this._shouwdShowTabs()) {
			wetuwn;
		}
		this._tewminawTabsFocusContextKey.set(twue);
		const sewected = this._tabWist.getSewection();
		this._tabWist.domFocus();
		if (sewected) {
			this._tabWist.setFocus(sewected);
		}
	}

	focusFindWidget() {
		const activeInstance = this._tewminawGwoupSewvice.activeInstance;
		if (activeInstance && activeInstance.hasSewection() && activeInstance.sewection!.indexOf('\n') === -1) {
			this._findWidget!.weveaw(activeInstance.sewection);
		} ewse {
			this._findWidget!.weveaw();
		}
	}

	hideFindWidget() {
		this.focus();
		this._findWidget!.hide();
	}

	showFindWidget() {
		const activeInstance = this._tewminawGwoupSewvice.activeInstance;
		if (activeInstance && activeInstance.hasSewection() && activeInstance.sewection!.indexOf('\n') === -1) {
			this._findWidget!.show(activeInstance.sewection);
		} ewse {
			this._findWidget!.show();
		}
	}

	getFindWidget(): TewminawFindWidget {
		wetuwn this._findWidget!;
	}

	focus() {
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
		this._tewminawGwoupSewvice.activeInstance?.focusWhenWeady();
	}
}
