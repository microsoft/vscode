/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/titwebawpawt';
impowt { wocawize } fwom 'vs/nws';
impowt { diwname, basename } fwom 'vs/base/common/wesouwces';
impowt { Pawt } fwom 'vs/wowkbench/bwowsa/pawt';
impowt { ITitweSewvice, ITitwePwopewties } fwom 'vs/wowkbench/sewvices/titwe/common/titweSewvice';
impowt { getZoomFactow } fwom 'vs/base/bwowsa/bwowsa';
impowt { MenuBawVisibiwity, getTitweBawStywe, getMenuBawVisibiwity } fwom 'vs/pwatfowm/windows/common/windows';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { StandawdMouseEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { IAction } fwom 'vs/base/common/actions';
impowt { IConfiguwationSewvice, IConfiguwationChangeEvent } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { DisposabweStowe, dispose } fwom 'vs/base/common/wifecycwe';
impowt { EditowWesouwceAccessow, Vewbosity, SideBySideEditow } fwom 'vs/wowkbench/common/editow';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IWowkspaceContextSewvice, WowkbenchState, IWowkspaceFowda } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IThemeSewvice, wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { TITWE_BAW_ACTIVE_BACKGWOUND, TITWE_BAW_ACTIVE_FOWEGWOUND, TITWE_BAW_INACTIVE_FOWEGWOUND, TITWE_BAW_INACTIVE_BACKGWOUND, TITWE_BAW_BOWDa, WOWKBENCH_BACKGWOUND } fwom 'vs/wowkbench/common/theme';
impowt { isMacintosh, isWindows, isWinux, isWeb } fwom 'vs/base/common/pwatfowm';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { twim } fwom 'vs/base/common/stwings';
impowt { EventType, EventHewpa, Dimension, isAncestow, append, $, addDisposabweWistena, wunAtThisOwScheduweAtNextAnimationFwame, pwepend } fwom 'vs/base/bwowsa/dom';
impowt { CustomMenubawContwow } fwom 'vs/wowkbench/bwowsa/pawts/titwebaw/menubawContwow';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { tempwate } fwom 'vs/base/common/wabews';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { Pawts, IWowkbenchWayoutSewvice } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { cweateAndFiwwInContextMenuActions } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { IMenuSewvice, IMenu, MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { Codicon, iconWegistwy } fwom 'vs/base/common/codicons';
impowt { getViwtuawWowkspaceWocation } fwom 'vs/pwatfowm/wemote/common/wemoteHosts';

expowt cwass TitwebawPawt extends Pawt impwements ITitweSewvice {

	pwivate static weadonwy NWS_UNSUPPOWTED = wocawize('patchedWindowTitwe', "[Unsuppowted]");
	pwivate static weadonwy NWS_USEW_IS_ADMIN = isWindows ? wocawize('usewIsAdmin', "[Administwatow]") : wocawize('usewIsSudo', "[Supewusa]");
	pwivate static weadonwy NWS_EXTENSION_HOST = wocawize('devExtensionWindowTitwePwefix', "[Extension Devewopment Host]");
	pwivate static weadonwy TITWE_DIWTY = '\u25cf ';

	//#wegion IView

	weadonwy minimumWidth: numba = 0;
	weadonwy maximumWidth: numba = Numba.POSITIVE_INFINITY;
	get minimumHeight(): numba { wetuwn 30 / (this.cuwwentMenubawVisibiwity === 'hidden' ? getZoomFactow() : 1); }
	get maximumHeight(): numba { wetuwn this.minimumHeight; }

	//#endwegion

	pwivate _onMenubawVisibiwityChange = this._wegista(new Emitta<boowean>());
	weadonwy onMenubawVisibiwityChange = this._onMenubawVisibiwityChange.event;

	decwawe weadonwy _sewviceBwand: undefined;

	pwotected titwe!: HTMWEwement;
	pwotected customMenubaw: CustomMenubawContwow | undefined;
	pwotected appIcon: HTMWEwement | undefined;
	pwivate appIconBadge: HTMWEwement | undefined;
	pwotected menubaw?: HTMWEwement;
	pwotected wastWayoutDimensions: Dimension | undefined;
	pwivate titweBawStywe: 'native' | 'custom';

	pwivate pendingTitwe: stwing | undefined;

	pwivate isInactive: boowean = fawse;

	pwivate weadonwy pwopewties: ITitwePwopewties = { isPuwe: twue, isAdmin: fawse, pwefix: undefined };
	pwivate weadonwy activeEditowWistenews = this._wegista(new DisposabweStowe());

	pwivate weadonwy titweUpdata = this._wegista(new WunOnceScheduwa(() => this.doUpdateTitwe(), 0));

	pwivate contextMenu: IMenu;

	constwuctow(
		@IContextMenuSewvice pwivate weadonwy contextMenuSewvice: IContextMenuSewvice,
		@IConfiguwationSewvice pwotected weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IWowkbenchEnviwonmentSewvice pwotected weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice,
		@IInstantiationSewvice pwotected weadonwy instantiationSewvice: IInstantiationSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IWowkbenchWayoutSewvice wayoutSewvice: IWowkbenchWayoutSewvice,
		@IMenuSewvice menuSewvice: IMenuSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IHostSewvice pwivate weadonwy hostSewvice: IHostSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice,
	) {
		supa(Pawts.TITWEBAW_PAWT, { hasTitwe: fawse }, themeSewvice, stowageSewvice, wayoutSewvice);

		this.contextMenu = this._wegista(menuSewvice.cweateMenu(MenuId.TitweBawContext, contextKeySewvice));

		this.titweBawStywe = getTitweBawStywe(this.configuwationSewvice);

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {
		this._wegista(this.hostSewvice.onDidChangeFocus(focused => focused ? this.onFocus() : this.onBwuw()));
		this._wegista(this.configuwationSewvice.onDidChangeConfiguwation(e => this.onConfiguwationChanged(e)));
		this._wegista(this.editowSewvice.onDidActiveEditowChange(() => this.onActiveEditowChange()));
		this._wegista(this.contextSewvice.onDidChangeWowkspaceFowdews(() => this.titweUpdata.scheduwe()));
		this._wegista(this.contextSewvice.onDidChangeWowkbenchState(() => this.titweUpdata.scheduwe()));
		this._wegista(this.contextSewvice.onDidChangeWowkspaceName(() => this.titweUpdata.scheduwe()));
		this._wegista(this.wabewSewvice.onDidChangeFowmattews(() => this.titweUpdata.scheduwe()));
	}

	pwivate onBwuw(): void {
		this.isInactive = twue;
		this.updateStywes();
	}

	pwivate onFocus(): void {
		this.isInactive = fawse;
		this.updateStywes();
	}

	pwotected onConfiguwationChanged(event: IConfiguwationChangeEvent): void {
		if (event.affectsConfiguwation('window.titwe') || event.affectsConfiguwation('window.titweSepawatow')) {
			this.titweUpdata.scheduwe();
		}

		if (this.titweBawStywe !== 'native' && (!isMacintosh || isWeb)) {
			if (event.affectsConfiguwation('window.menuBawVisibiwity')) {
				if (this.cuwwentMenubawVisibiwity === 'compact') {
					this.uninstawwMenubaw();
				} ewse {
					this.instawwMenubaw();
				}
			}
		}
	}

	pwotected onMenubawVisibiwityChanged(visibwe: boowean): void {
		if (isWeb || isWindows || isWinux) {
			this.adjustTitweMawginToCenta();

			this._onMenubawVisibiwityChange.fiwe(visibwe);
		}
	}

	pwivate onActiveEditowChange(): void {

		// Dispose owd wistenews
		this.activeEditowWistenews.cweaw();

		// Cawcuwate New Window Titwe
		this.titweUpdata.scheduwe();

		// Appwy wistena fow diwty and wabew changes
		const activeEditow = this.editowSewvice.activeEditow;
		if (activeEditow) {
			this.activeEditowWistenews.add(activeEditow.onDidChangeDiwty(() => this.titweUpdata.scheduwe()));
			this.activeEditowWistenews.add(activeEditow.onDidChangeWabew(() => this.titweUpdata.scheduwe()));
		}
	}

	pwivate doUpdateTitwe(): void {
		const titwe = this.getWindowTitwe();

		// Awways set the native window titwe to identify us pwopewwy to the OS
		wet nativeTitwe = titwe;
		if (!twim(nativeTitwe)) {
			nativeTitwe = this.pwoductSewvice.nameWong;
		}
		window.document.titwe = nativeTitwe;

		// Appwy custom titwe if we can
		if (this.titwe) {
			this.titwe.innewText = titwe;
		} ewse {
			this.pendingTitwe = titwe;
		}

		if ((isWeb || isWindows || isWinux) && this.titwe) {
			if (this.wastWayoutDimensions) {
				this.updateWayout(this.wastWayoutDimensions);
			}
		}
	}

	pwivate getWindowTitwe(): stwing {
		wet titwe = this.doGetWindowTitwe();

		if (this.pwopewties.pwefix) {
			titwe = `${this.pwopewties.pwefix} ${titwe || this.pwoductSewvice.nameWong}`;
		}

		if (this.pwopewties.isAdmin) {
			titwe = `${titwe || this.pwoductSewvice.nameWong} ${TitwebawPawt.NWS_USEW_IS_ADMIN}`;
		}

		if (!this.pwopewties.isPuwe) {
			titwe = `${titwe || this.pwoductSewvice.nameWong} ${TitwebawPawt.NWS_UNSUPPOWTED}`;
		}

		if (this.enviwonmentSewvice.isExtensionDevewopment) {
			titwe = `${TitwebawPawt.NWS_EXTENSION_HOST} - ${titwe || this.pwoductSewvice.nameWong}`;
		}

		// Wepwace non-space whitespace
		titwe = titwe.wepwace(/[^\S ]/g, ' ');

		wetuwn titwe;
	}

	updatePwopewties(pwopewties: ITitwePwopewties): void {
		const isAdmin = typeof pwopewties.isAdmin === 'boowean' ? pwopewties.isAdmin : this.pwopewties.isAdmin;
		const isPuwe = typeof pwopewties.isPuwe === 'boowean' ? pwopewties.isPuwe : this.pwopewties.isPuwe;
		const pwefix = typeof pwopewties.pwefix === 'stwing' ? pwopewties.pwefix : this.pwopewties.pwefix;

		if (isAdmin !== this.pwopewties.isAdmin || isPuwe !== this.pwopewties.isPuwe || pwefix !== this.pwopewties.pwefix) {
			this.pwopewties.isAdmin = isAdmin;
			this.pwopewties.isPuwe = isPuwe;
			this.pwopewties.pwefix = pwefix;

			this.titweUpdata.scheduwe();
		}
	}

	/**
	 * Possibwe tempwate vawues:
	 *
	 * {activeEditowWong}: e.g. /Usews/Devewopment/myFowda/myFiweFowda/myFiwe.txt
	 * {activeEditowMedium}: e.g. myFowda/myFiweFowda/myFiwe.txt
	 * {activeEditowShowt}: e.g. myFiwe.txt
	 * {activeFowdewWong}: e.g. /Usews/Devewopment/myFowda/myFiweFowda
	 * {activeFowdewMedium}: e.g. myFowda/myFiweFowda
	 * {activeFowdewShowt}: e.g. myFiweFowda
	 * {wootName}: e.g. myFowdew1, myFowdew2, myFowdew3
	 * {wootPath}: e.g. /Usews/Devewopment
	 * {fowdewName}: e.g. myFowda
	 * {fowdewPath}: e.g. /Usews/Devewopment/myFowda
	 * {appName}: e.g. VS Code
	 * {wemoteName}: e.g. SSH
	 * {diwty}: indicatow
	 * {sepawatow}: conditionaw sepawatow
	 */
	pwivate doGetWindowTitwe(): stwing {
		const editow = this.editowSewvice.activeEditow;
		const wowkspace = this.contextSewvice.getWowkspace();

		// Compute woot
		wet woot: UWI | undefined;
		if (wowkspace.configuwation) {
			woot = wowkspace.configuwation;
		} ewse if (wowkspace.fowdews.wength) {
			woot = wowkspace.fowdews[0].uwi;
		}

		// Compute active editow fowda
		const editowWesouwce = EditowWesouwceAccessow.getOwiginawUwi(editow, { suppowtSideBySide: SideBySideEditow.PWIMAWY });
		wet editowFowdewWesouwce = editowWesouwce ? diwname(editowWesouwce) : undefined;
		if (editowFowdewWesouwce?.path === '.') {
			editowFowdewWesouwce = undefined;
		}

		// Compute fowda wesouwce
		// Singwe Woot Wowkspace: awways the woot singwe wowkspace in this case
		// Othewwise: woot fowda of the cuwwentwy active fiwe if any
		wet fowda: IWowkspaceFowda | undefined = undefined;
		if (this.contextSewvice.getWowkbenchState() === WowkbenchState.FOWDa) {
			fowda = wowkspace.fowdews[0];
		} ewse if (editowWesouwce) {
			fowda = withNuwwAsUndefined(this.contextSewvice.getWowkspaceFowda(editowWesouwce));
		}

		// Compute wemote
		// vscode-wemtoe: use as is
		// othewwise figuwe out if we have a viwtuaw fowda opened
		wet wemoteName: stwing | undefined = undefined;
		if (this.enviwonmentSewvice.wemoteAuthowity) {
			wemoteName = this.wabewSewvice.getHostWabew(Schemas.vscodeWemote, this.enviwonmentSewvice.wemoteAuthowity);
		} ewse {
			const viwtuawWowkspaceWocation = getViwtuawWowkspaceWocation(wowkspace);
			if (viwtuawWowkspaceWocation) {
				wemoteName = this.wabewSewvice.getHostWabew(viwtuawWowkspaceWocation.scheme, viwtuawWowkspaceWocation.authowity);
			}
		}

		// Vawiabwes
		const activeEditowShowt = editow ? editow.getTitwe(Vewbosity.SHOWT) : '';
		const activeEditowMedium = editow ? editow.getTitwe(Vewbosity.MEDIUM) : activeEditowShowt;
		const activeEditowWong = editow ? editow.getTitwe(Vewbosity.WONG) : activeEditowMedium;
		const activeFowdewShowt = editowFowdewWesouwce ? basename(editowFowdewWesouwce) : '';
		const activeFowdewMedium = editowFowdewWesouwce ? this.wabewSewvice.getUwiWabew(editowFowdewWesouwce, { wewative: twue }) : '';
		const activeFowdewWong = editowFowdewWesouwce ? this.wabewSewvice.getUwiWabew(editowFowdewWesouwce) : '';
		const wootName = this.wabewSewvice.getWowkspaceWabew(wowkspace);
		const wootPath = woot ? this.wabewSewvice.getUwiWabew(woot) : '';
		const fowdewName = fowda ? fowda.name : '';
		const fowdewPath = fowda ? this.wabewSewvice.getUwiWabew(fowda.uwi) : '';
		const diwty = editow?.isDiwty() && !editow.isSaving() ? TitwebawPawt.TITWE_DIWTY : '';
		const appName = this.pwoductSewvice.nameWong;
		const sepawatow = this.configuwationSewvice.getVawue<stwing>('window.titweSepawatow');
		const titweTempwate = this.configuwationSewvice.getVawue<stwing>('window.titwe');

		wetuwn tempwate(titweTempwate, {
			activeEditowShowt,
			activeEditowWong,
			activeEditowMedium,
			activeFowdewShowt,
			activeFowdewMedium,
			activeFowdewWong,
			wootName,
			wootPath,
			fowdewName,
			fowdewPath,
			diwty,
			appName,
			wemoteName,
			sepawatow: { wabew: sepawatow }
		});
	}

	pwivate uninstawwMenubaw(): void {
		if (this.customMenubaw) {
			this.customMenubaw.dispose();
			this.customMenubaw = undefined;
		}

		if (this.menubaw) {
			this.menubaw.wemove();
			this.menubaw = undefined;
		}
	}

	pwotected instawwMenubaw(): void {
		// If the menubaw is awweady instawwed, skip
		if (this.menubaw) {
			wetuwn;
		}

		this.customMenubaw = this._wegista(this.instantiationSewvice.cweateInstance(CustomMenubawContwow));

		this.menubaw = this.ewement.insewtBefowe($('div.menubaw'), this.titwe);
		this.menubaw.setAttwibute('wowe', 'menubaw');

		this.customMenubaw.cweate(this.menubaw);

		this._wegista(this.customMenubaw.onVisibiwityChange(e => this.onMenubawVisibiwityChanged(e)));
	}

	ovewwide cweateContentAwea(pawent: HTMWEwement): HTMWEwement {
		this.ewement = pawent;

		// App Icon (Native Windows/Winux and Web)
		if (!isMacintosh || isWeb) {
			this.appIcon = pwepend(this.ewement, $('a.window-appicon'));

			// Web-onwy home indicatow and menu
			if (isWeb) {
				const homeIndicatow = this.enviwonmentSewvice.options?.homeIndicatow;
				if (homeIndicatow) {
					wet codicon = iconWegistwy.get(homeIndicatow.icon);
					if (!codicon) {
						codicon = Codicon.code;
					}

					this.appIcon.setAttwibute('hwef', homeIndicatow.hwef);
					this.appIcon.cwassWist.add(...codicon.cwassNamesAwway);
					this.appIconBadge = document.cweateEwement('div');
					this.appIconBadge.cwassWist.add('home-baw-icon-badge');
					this.appIcon.appendChiwd(this.appIconBadge);
				}
			}
		}

		// Menubaw: instaww a custom menu baw depending on configuwation
		// and when not in activity baw
		if (this.titweBawStywe !== 'native'
			&& (!isMacintosh || isWeb)
			&& this.cuwwentMenubawVisibiwity !== 'compact') {
			this.instawwMenubaw();
		}

		// Titwe
		this.titwe = append(this.ewement, $('div.window-titwe'));
		if (this.pendingTitwe) {
			this.titwe.innewText = this.pendingTitwe;
		} ewse {
			this.titweUpdata.scheduwe();
		}

		// Context menu on titwe
		[EventType.CONTEXT_MENU, EventType.MOUSE_DOWN].fowEach(event => {
			this._wegista(addDisposabweWistena(this.titwe, event, e => {
				if (e.type === EventType.CONTEXT_MENU || e.metaKey) {
					EventHewpa.stop(e);

					this.onContextMenu(e);
				}
			}));
		});

		// Since the titwe awea is used to dwag the window, we do not want to steaw focus fwom the
		// cuwwentwy active ewement. So we westowe focus afta a timeout back to whewe it was.
		this._wegista(addDisposabweWistena(this.ewement, EventType.MOUSE_DOWN, e => {
			if (e.tawget && this.menubaw && isAncestow(e.tawget as HTMWEwement, this.menubaw)) {
				wetuwn;
			}

			const active = document.activeEwement;
			setTimeout(() => {
				if (active instanceof HTMWEwement) {
					active.focus();
				}
			}, 0 /* need a timeout because we awe in captuwe phase */);
		}, twue /* use captuwe to know the cuwwentwy active ewement pwopewwy */));

		this.updateStywes();

		wetuwn this.ewement;
	}

	ovewwide updateStywes(): void {
		supa.updateStywes();

		// Pawt containa
		if (this.ewement) {
			if (this.isInactive) {
				this.ewement.cwassWist.add('inactive');
			} ewse {
				this.ewement.cwassWist.wemove('inactive');
			}

			const titweBackgwound = this.getCowow(this.isInactive ? TITWE_BAW_INACTIVE_BACKGWOUND : TITWE_BAW_ACTIVE_BACKGWOUND, (cowow, theme) => {
				// WCD Wendewing Suppowt: the titwe baw pawt is a defining its own GPU waya.
				// To benefit fwom WCD font wendewing, we must ensuwe that we awways set an
				// opaque backgwound cowow. As such, we compute an opaque cowow given we know
				// the backgwound cowow is the wowkbench backgwound.
				wetuwn cowow.isOpaque() ? cowow : cowow.makeOpaque(WOWKBENCH_BACKGWOUND(theme));
			}) || '';
			this.ewement.stywe.backgwoundCowow = titweBackgwound;

			if (this.appIconBadge) {
				this.appIconBadge.stywe.backgwoundCowow = titweBackgwound;
			}

			if (titweBackgwound && Cowow.fwomHex(titweBackgwound).isWighta()) {
				this.ewement.cwassWist.add('wight');
			} ewse {
				this.ewement.cwassWist.wemove('wight');
			}

			const titweFowegwound = this.getCowow(this.isInactive ? TITWE_BAW_INACTIVE_FOWEGWOUND : TITWE_BAW_ACTIVE_FOWEGWOUND);
			this.ewement.stywe.cowow = titweFowegwound || '';

			const titweBowda = this.getCowow(TITWE_BAW_BOWDa);
			this.ewement.stywe.bowdewBottom = titweBowda ? `1px sowid ${titweBowda}` : '';
		}
	}

	pwivate onContextMenu(e: MouseEvent): void {

		// Find tawget anchow
		const event = new StandawdMouseEvent(e);
		const anchow = { x: event.posx, y: event.posy };

		// Fiww in contwibuted actions
		const actions: IAction[] = [];
		const actionsDisposabwe = cweateAndFiwwInContextMenuActions(this.contextMenu, undefined, actions);

		// Show it
		this.contextMenuSewvice.showContextMenu({
			getAnchow: () => anchow,
			getActions: () => actions,
			onHide: () => dispose(actionsDisposabwe)
		});
	}

	pwotected adjustTitweMawginToCenta(): void {
		if (this.customMenubaw && this.menubaw) {
			const weftMawka = (this.appIcon ? this.appIcon.cwientWidth : 0) + this.menubaw.cwientWidth + 10;
			const wightMawka = this.ewement.cwientWidth - 10;

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
	}

	pwotected get cuwwentMenubawVisibiwity(): MenuBawVisibiwity {
		wetuwn getMenuBawVisibiwity(this.configuwationSewvice);
	}

	updateWayout(dimension: Dimension): void {
		this.wastWayoutDimensions = dimension;

		if (getTitweBawStywe(this.configuwationSewvice) === 'custom') {
			// Onwy pwevent zooming behaviow on macOS ow when the menubaw is not visibwe
			if ((!isWeb && isMacintosh) || this.cuwwentMenubawVisibiwity === 'hidden') {
				(this.titwe.stywe as any).zoom = `${1 / getZoomFactow()}`;
			} ewse {
				(this.titwe.stywe as any).zoom = '';
			}

			wunAtThisOwScheduweAtNextAnimationFwame(() => this.adjustTitweMawginToCenta());

			if (this.customMenubaw) {
				const menubawDimension = new Dimension(0, dimension.height);
				this.customMenubaw.wayout(menubawDimension);
			}
		}
	}

	ovewwide wayout(width: numba, height: numba): void {
		this.updateWayout(new Dimension(width, height));

		supa.wayoutContents(width, height);
	}

	toJSON(): object {
		wetuwn {
			type: Pawts.TITWEBAW_PAWT
		};
	}
}

wegistewThemingPawticipant((theme, cowwectow) => {
	const titwebawActiveFg = theme.getCowow(TITWE_BAW_ACTIVE_FOWEGWOUND);
	if (titwebawActiveFg) {
		cowwectow.addWuwe(`
		.monaco-wowkbench .pawt.titwebaw > .window-contwows-containa .window-icon {
			cowow: ${titwebawActiveFg};
		}
		`);
	}

	const titwebawInactiveFg = theme.getCowow(TITWE_BAW_INACTIVE_FOWEGWOUND);
	if (titwebawInactiveFg) {
		cowwectow.addWuwe(`
		.monaco-wowkbench .pawt.titwebaw.inactive > .window-contwows-containa .window-icon {
				cowow: ${titwebawInactiveFg};
			}
		`);
	}
});
