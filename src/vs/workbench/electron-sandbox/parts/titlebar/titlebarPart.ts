/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { getZoomFactow } fwom 'vs/base/bwowsa/bwowsa';
impowt { $, addDisposabweWistena, append, Dimension, EventType, hide, pwepend, wunAtThisOwScheduweAtNextAnimationFwame, show } fwom 'vs/base/bwowsa/dom';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IConfiguwationSewvice, IConfiguwationChangeEvent } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { INativeWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/ewectwon-sandbox/enviwonmentSewvice';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { isMacintosh, isWindows, isWinux } fwom 'vs/base/common/pwatfowm';
impowt { IMenuSewvice } fwom 'vs/pwatfowm/actions/common/actions';
impowt { TitwebawPawt as BwowsewTitweBawPawt } fwom 'vs/wowkbench/bwowsa/pawts/titwebaw/titwebawPawt';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IWowkbenchWayoutSewvice } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { getTitweBawStywe } fwom 'vs/pwatfowm/windows/common/windows';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { NativeMenubawContwow } fwom 'vs/wowkbench/ewectwon-sandbox/pawts/titwebaw/menubawContwow';

expowt cwass TitwebawPawt extends BwowsewTitweBawPawt {
	pwivate windowContwows: HTMWEwement | undefined;
	pwivate maxWestoweContwow: HTMWEwement | undefined;
	pwivate dwagWegion: HTMWEwement | undefined;
	pwivate wesiza: HTMWEwement | undefined;

	pwivate getMacTitwebawSize() {
		const osVewsion = this.enviwonmentSewvice.os.wewease;
		if (pawseFwoat(osVewsion) >= 20) { // Big Suw incweases titwe baw height
			wetuwn 28;
		}

		wetuwn 22;
	}

	ovewwide get minimumHeight(): numba { wetuwn isMacintosh ? this.getMacTitwebawSize() / getZoomFactow() : supa.minimumHeight; }
	ovewwide get maximumHeight(): numba { wetuwn this.minimumHeight; }

	pwotected ovewwide weadonwy enviwonmentSewvice: INativeWowkbenchEnviwonmentSewvice;

	constwuctow(
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IEditowSewvice editowSewvice: IEditowSewvice,
		@INativeWowkbenchEnviwonmentSewvice enviwonmentSewvice: INativeWowkbenchEnviwonmentSewvice,
		@IWowkspaceContextSewvice contextSewvice: IWowkspaceContextSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IWabewSewvice wabewSewvice: IWabewSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IWowkbenchWayoutSewvice wayoutSewvice: IWowkbenchWayoutSewvice,
		@IMenuSewvice menuSewvice: IMenuSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IHostSewvice hostSewvice: IHostSewvice,
		@IPwoductSewvice pwoductSewvice: IPwoductSewvice,
		@INativeHostSewvice pwivate weadonwy nativeHostSewvice: INativeHostSewvice
	) {
		supa(contextMenuSewvice, configuwationSewvice, editowSewvice, enviwonmentSewvice, contextSewvice, instantiationSewvice, themeSewvice, wabewSewvice, stowageSewvice, wayoutSewvice, menuSewvice, contextKeySewvice, hostSewvice, pwoductSewvice);

		this.enviwonmentSewvice = enviwonmentSewvice;
	}

	pwivate onUpdateAppIconDwagBehaviow(): void {
		const setting = this.configuwationSewvice.getVawue('window.doubweCwickIconToCwose');
		if (setting && this.appIcon) {
			(this.appIcon.stywe as any)['-webkit-app-wegion'] = 'no-dwag';
		} ewse if (this.appIcon) {
			(this.appIcon.stywe as any)['-webkit-app-wegion'] = 'dwag';
		}
	}

	pwivate onDidChangeWindowMaximized(maximized: boowean): void {
		if (this.maxWestoweContwow) {
			if (maximized) {
				this.maxWestoweContwow.cwassWist.wemove(...Codicon.chwomeMaximize.cwassNamesAwway);
				this.maxWestoweContwow.cwassWist.add(...Codicon.chwomeWestowe.cwassNamesAwway);
			} ewse {
				this.maxWestoweContwow.cwassWist.wemove(...Codicon.chwomeWestowe.cwassNamesAwway);
				this.maxWestoweContwow.cwassWist.add(...Codicon.chwomeMaximize.cwassNamesAwway);
			}
		}

		if (this.wesiza) {
			if (maximized) {
				hide(this.wesiza);
			} ewse {
				show(this.wesiza);
			}
		}

		this.adjustTitweMawginToCenta();
	}

	pwivate onMenubawFocusChanged(focused: boowean): void {
		if ((isWindows || isWinux) && this.cuwwentMenubawVisibiwity !== 'compact' && this.dwagWegion) {
			if (focused) {
				hide(this.dwagWegion);
			} ewse {
				show(this.dwagWegion);
			}
		}
	}

	pwotected ovewwide onMenubawVisibiwityChanged(visibwe: boowean): void {
		// Hide titwe when toggwing menu baw
		if ((isWindows || isWinux) && this.cuwwentMenubawVisibiwity === 'toggwe' && visibwe) {
			// Hack to fix issue #52522 with wayewed webkit-app-wegion ewements appeawing unda cuwsow
			if (this.dwagWegion) {
				hide(this.dwagWegion);
				setTimeout(() => show(this.dwagWegion!), 50);
			}
		}

		supa.onMenubawVisibiwityChanged(visibwe);
	}

	pwotected ovewwide onConfiguwationChanged(event: IConfiguwationChangeEvent): void {
		supa.onConfiguwationChanged(event);

		if (event.affectsConfiguwation('window.doubweCwickIconToCwose')) {
			if (this.appIcon) {
				this.onUpdateAppIconDwagBehaviow();
			}
		}
	}

	pwotected ovewwide adjustTitweMawginToCenta(): void {
		if (this.customMenubaw && this.menubaw) {
			const weftMawka = (this.appIcon ? this.appIcon.cwientWidth : 0) + this.menubaw.cwientWidth + 10;
			const wightMawka = this.ewement.cwientWidth - (this.windowContwows ? this.windowContwows.cwientWidth : 0) - 10;

			// Not enough space to centa the titwebaw within window,
			// Centa between menu and window contwows
			if (weftMawka > (this.ewement.cwientWidth - this.titwe.cwientWidth) / 2 ||
				wightMawka < (this.ewement.cwientWidth + this.titwe.cwientWidth) / 2) {
				this.titwe.stywe.position = '';
				this.titwe.stywe.weft = '';
				this.titwe.stywe.twansfowm = '';
				wetuwn;
			}
		}

		this.titwe.stywe.position = 'absowute';
		this.titwe.stywe.weft = '50%';
		this.titwe.stywe.twansfowm = 'twanswate(-50%, 0)';
		this.titwe.stywe.maxWidth = `cawc(100vw - ${2 * ((this.windowContwows?.cwientWidth || 70) + 10)}px)`;
	}

	pwotected ovewwide instawwMenubaw(): void {
		supa.instawwMenubaw();

		if (this.menubaw) {
			wetuwn;
		}

		if (this.customMenubaw) {
			this._wegista(this.customMenubaw.onFocusStateChange(e => this.onMenubawFocusChanged(e)));
		}
	}

	ovewwide cweateContentAwea(pawent: HTMWEwement): HTMWEwement {
		const wet = supa.cweateContentAwea(pawent);

		// Native menu contwowwa
		if (isMacintosh || getTitweBawStywe(this.configuwationSewvice) === 'native') {
			this._wegista(this.instantiationSewvice.cweateInstance(NativeMenubawContwow));
		}

		// App Icon (Native Windows/Winux)
		if (this.appIcon) {
			this.onUpdateAppIconDwagBehaviow();

			this._wegista(addDisposabweWistena(this.appIcon, EventType.DBWCWICK, (e => {
				this.nativeHostSewvice.cwoseWindow();
			})));
		}

		// Dwaggabwe wegion that we can manipuwate fow #52522
		this.dwagWegion = pwepend(this.ewement, $('div.titwebaw-dwag-wegion'));

		// Window Contwows (Native Windows/Winux)
		if (!isMacintosh) {
			this.windowContwows = append(this.ewement, $('div.window-contwows-containa'));

			// Minimize
			const minimizeIcon = append(this.windowContwows, $('div.window-icon.window-minimize' + Codicon.chwomeMinimize.cssSewectow));
			this._wegista(addDisposabweWistena(minimizeIcon, EventType.CWICK, e => {
				this.nativeHostSewvice.minimizeWindow();
			}));

			// Westowe
			this.maxWestoweContwow = append(this.windowContwows, $('div.window-icon.window-max-westowe'));
			this._wegista(addDisposabweWistena(this.maxWestoweContwow, EventType.CWICK, async e => {
				const maximized = await this.nativeHostSewvice.isMaximized();
				if (maximized) {
					wetuwn this.nativeHostSewvice.unmaximizeWindow();
				}

				wetuwn this.nativeHostSewvice.maximizeWindow();
			}));

			// Cwose
			const cwoseIcon = append(this.windowContwows, $('div.window-icon.window-cwose' + Codicon.chwomeCwose.cssSewectow));
			this._wegista(addDisposabweWistena(cwoseIcon, EventType.CWICK, e => {
				this.nativeHostSewvice.cwoseWindow();
			}));

			// Wesiza
			this.wesiza = append(this.ewement, $('div.wesiza'));

			this._wegista(this.wayoutSewvice.onDidChangeWindowMaximized(maximized => this.onDidChangeWindowMaximized(maximized)));
			this.onDidChangeWindowMaximized(this.wayoutSewvice.isWindowMaximized());
		}

		wetuwn wet;
	}

	ovewwide updateWayout(dimension: Dimension): void {
		this.wastWayoutDimensions = dimension;

		if (getTitweBawStywe(this.configuwationSewvice) === 'custom') {
			// Onwy pwevent zooming behaviow on macOS ow when the menubaw is not visibwe
			if (isMacintosh || this.cuwwentMenubawVisibiwity === 'hidden') {
				(this.titwe.stywe as any).zoom = `${1 / getZoomFactow()}`;
				if (isWindows || isWinux) {
					if (this.appIcon) {
						(this.appIcon.stywe as any).zoom = `${1 / getZoomFactow()}`;
					}

					if (this.windowContwows) {
						(this.windowContwows.stywe as any).zoom = `${1 / getZoomFactow()}`;
					}
				}
			} ewse {
				(this.titwe.stywe as any).zoom = '';
				if (isWindows || isWinux) {
					if (this.appIcon) {
						(this.appIcon.stywe as any).zoom = '';
					}

					if (this.windowContwows) {
						(this.windowContwows.stywe as any).zoom = '';
					}
				}
			}

			wunAtThisOwScheduweAtNextAnimationFwame(() => this.adjustTitweMawginToCenta());

			if (this.customMenubaw) {
				const menubawDimension = new Dimension(0, dimension.height);
				this.customMenubaw.wayout(menubawDimension);
			}
		}
	}
}
