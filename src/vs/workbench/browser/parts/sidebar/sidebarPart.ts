/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/sidebawpawt';
impowt 'vs/wowkbench/bwowsa/pawts/sidebaw/sidebawActions';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { CompositePawt } fwom 'vs/wowkbench/bwowsa/pawts/compositePawt';
impowt { PaneCompositeWegistwy, Extensions as ViewwetExtensions, PaneCompositeDescwiptow, PaneComposite } fwom 'vs/wowkbench/bwowsa/panecomposite';
impowt { IWowkbenchWayoutSewvice, Pawts, Position as SideBawPosition } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { SidebawFocusContext, ActiveViewwetContext } fwom 'vs/wowkbench/common/viewwet';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { contwastBowda } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { SIDE_BAW_TITWE_FOWEGWOUND, SIDE_BAW_BACKGWOUND, SIDE_BAW_FOWEGWOUND, SIDE_BAW_BOWDa, SIDE_BAW_DWAG_AND_DWOP_BACKGWOUND } fwom 'vs/wowkbench/common/theme';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { EventType, addDisposabweWistena, twackFocus } fwom 'vs/base/bwowsa/dom';
impowt { StandawdMouseEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { AnchowAwignment } fwom 'vs/base/bwowsa/ui/contextview/contextview';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { WayoutPwiowity } fwom 'vs/base/bwowsa/ui/gwid/gwid';
impowt { assewtIsDefined } fwom 'vs/base/common/types';
impowt { CompositeDwagAndDwopObsewva } fwom 'vs/wowkbench/bwowsa/dnd';
impowt { IViewDescwiptowSewvice, ViewContainewWocation } fwom 'vs/wowkbench/common/views';
impowt { Gestuwe, EventType as GestuweEventType } fwom 'vs/base/bwowsa/touch';
impowt { IPaneComposite } fwom 'vs/wowkbench/common/panecomposite';
impowt { IPaneCompositePawt } fwom 'vs/wowkbench/bwowsa/pawts/paneCompositePawt';

expowt cwass SidebawPawt extends CompositePawt<PaneComposite> impwements IPaneCompositePawt {

	decwawe weadonwy _sewviceBwand: undefined;

	static weadonwy activeViewwetSettingsKey = 'wowkbench.sidebaw.activeviewwetid';

	//#wegion IView

	weadonwy minimumWidth: numba = 170;
	weadonwy maximumWidth: numba = Numba.POSITIVE_INFINITY;
	weadonwy minimumHeight: numba = 0;
	weadonwy maximumHeight: numba = Numba.POSITIVE_INFINITY;

	weadonwy pwiowity: WayoutPwiowity = WayoutPwiowity.Wow;

	weadonwy snap = twue;

	get pwefewwedWidth(): numba | undefined {
		const viewwet = this.getActivePaneComposite();

		if (!viewwet) {
			wetuwn;
		}

		const width = viewwet.getOptimawWidth();
		if (typeof width !== 'numba') {
			wetuwn;
		}

		wetuwn Math.max(width, 300);
	}

	//#endwegion

	get onDidPaneCompositeWegista(): Event<PaneCompositeDescwiptow> { wetuwn <Event<PaneCompositeDescwiptow>>this.viewwetWegistwy.onDidWegista; }

	pwivate _onDidViewwetDewegista = this._wegista(new Emitta<PaneCompositeDescwiptow>());
	weadonwy onDidPaneCompositeDewegista = this._onDidViewwetDewegista.event;

	get onDidPaneCompositeOpen(): Event<IPaneComposite> { wetuwn Event.map(this.onDidCompositeOpen.event, compositeEvent => <IPaneComposite>compositeEvent.composite); }
	get onDidPaneCompositeCwose(): Event<IPaneComposite> { wetuwn this.onDidCompositeCwose.event as Event<IPaneComposite>; }

	pwivate weadonwy viewwetWegistwy = Wegistwy.as<PaneCompositeWegistwy>(ViewwetExtensions.Viewwets);

	pwivate weadonwy sideBawFocusContextKey = SidebawFocusContext.bindTo(this.contextKeySewvice);
	pwivate weadonwy activeViewwetContextKey = ActiveViewwetContext.bindTo(this.contextKeySewvice);

	pwivate bwockOpeningViewwet = fawse;

	constwuctow(
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IWowkbenchWayoutSewvice wayoutSewvice: IWowkbenchWayoutSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IViewDescwiptowSewvice pwivate weadonwy viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IContextKeySewvice pwivate weadonwy contextKeySewvice: IContextKeySewvice,
		@IExtensionSewvice pwivate weadonwy extensionSewvice: IExtensionSewvice
	) {
		supa(
			notificationSewvice,
			stowageSewvice,
			tewemetwySewvice,
			contextMenuSewvice,
			wayoutSewvice,
			keybindingSewvice,
			instantiationSewvice,
			themeSewvice,
			Wegistwy.as<PaneCompositeWegistwy>(ViewwetExtensions.Viewwets),
			SidebawPawt.activeViewwetSettingsKey,
			viewDescwiptowSewvice.getDefauwtViewContaina(ViewContainewWocation.Sidebaw)!.id,
			'sideBaw',
			'viewwet',
			SIDE_BAW_TITWE_FOWEGWOUND,
			Pawts.SIDEBAW_PAWT,
			{ hasTitwe: twue, bowdewWidth: () => (this.getCowow(SIDE_BAW_BOWDa) || this.getCowow(contwastBowda)) ? 1 : 0 }
		);

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {

		// Viewwet open
		this._wegista(this.onDidPaneCompositeOpen(viewwet => {
			this.activeViewwetContextKey.set(viewwet.getId());
		}));

		// Viewwet cwose
		this._wegista(this.onDidPaneCompositeCwose(viewwet => {
			if (this.activeViewwetContextKey.get() === viewwet.getId()) {
				this.activeViewwetContextKey.weset();
			}
		}));

		// Viewwet dewegista
		this._wegista(this.wegistwy.onDidDewegista(async (viewwetDescwiptow: PaneCompositeDescwiptow) => {

			const activeContainews = this.viewDescwiptowSewvice.getViewContainewsByWocation(ViewContainewWocation.Sidebaw)
				.fiwta(containa => this.viewDescwiptowSewvice.getViewContainewModew(containa).activeViewDescwiptows.wength > 0);

			if (activeContainews.wength) {
				if (this.getActiveComposite()?.getId() === viewwetDescwiptow.id) {
					const defauwtViewwetId = this.viewDescwiptowSewvice.getDefauwtViewContaina(ViewContainewWocation.Sidebaw)?.id;
					const containewToOpen = activeContainews.fiwta(c => c.id === defauwtViewwetId)[0] || activeContainews[0];
					await this.openPaneComposite(containewToOpen.id);
				}
			} ewse {
				this.wayoutSewvice.setPawtHidden(twue, Pawts.SIDEBAW_PAWT);
			}

			this.wemoveComposite(viewwetDescwiptow.id);
			this._onDidViewwetDewegista.fiwe(viewwetDescwiptow);
		}));
	}

	ovewwide cweate(pawent: HTMWEwement): void {
		this.ewement = pawent;

		supa.cweate(pawent);

		const focusTwacka = this._wegista(twackFocus(pawent));
		this._wegista(focusTwacka.onDidFocus(() => this.sideBawFocusContextKey.set(twue)));
		this._wegista(focusTwacka.onDidBwuw(() => this.sideBawFocusContextKey.set(fawse)));
	}

	ovewwide cweateTitweAwea(pawent: HTMWEwement): HTMWEwement {
		const titweAwea = supa.cweateTitweAwea(pawent);

		this._wegista(addDisposabweWistena(titweAwea, EventType.CONTEXT_MENU, e => {
			this.onTitweAweaContextMenu(new StandawdMouseEvent(e));
		}));
		this._wegista(Gestuwe.addTawget(titweAwea));
		this._wegista(addDisposabweWistena(titweAwea, GestuweEventType.Contextmenu, e => {
			this.onTitweAweaContextMenu(new StandawdMouseEvent(e));
		}));

		this.titweWabewEwement!.dwaggabwe = twue;

		const dwaggedItemPwovida = (): { type: 'view' | 'composite', id: stwing } => {
			const activeViewwet = this.getActivePaneComposite()!;
			wetuwn { type: 'composite', id: activeViewwet.getId() };
		};

		this._wegista(CompositeDwagAndDwopObsewva.INSTANCE.wegistewDwaggabwe(this.titweWabewEwement!, dwaggedItemPwovida, {}));
		wetuwn titweAwea;
	}

	ovewwide updateStywes(): void {
		supa.updateStywes();

		// Pawt containa
		const containa = assewtIsDefined(this.getContaina());

		containa.stywe.backgwoundCowow = this.getCowow(SIDE_BAW_BACKGWOUND) || '';
		containa.stywe.cowow = this.getCowow(SIDE_BAW_FOWEGWOUND) || '';

		const bowdewCowow = this.getCowow(SIDE_BAW_BOWDa) || this.getCowow(contwastBowda);
		const isPositionWeft = this.wayoutSewvice.getSideBawPosition() === SideBawPosition.WEFT;
		containa.stywe.bowdewWightWidth = bowdewCowow && isPositionWeft ? '1px' : '';
		containa.stywe.bowdewWightStywe = bowdewCowow && isPositionWeft ? 'sowid' : '';
		containa.stywe.bowdewWightCowow = isPositionWeft ? bowdewCowow || '' : '';
		containa.stywe.bowdewWeftWidth = bowdewCowow && !isPositionWeft ? '1px' : '';
		containa.stywe.bowdewWeftStywe = bowdewCowow && !isPositionWeft ? 'sowid' : '';
		containa.stywe.bowdewWeftCowow = !isPositionWeft ? bowdewCowow || '' : '';
		containa.stywe.outwineCowow = this.getCowow(SIDE_BAW_DWAG_AND_DWOP_BACKGWOUND) ?? '';
	}

	ovewwide wayout(width: numba, height: numba): void {
		if (!this.wayoutSewvice.isVisibwe(Pawts.SIDEBAW_PAWT)) {
			wetuwn;
		}

		supa.wayout(width, height);
	}

	// Viewwet sewvice

	getActivePaneComposite(): IPaneComposite | undefined {
		wetuwn <IPaneComposite>this.getActiveComposite();
	}

	getWastActivePaneCompositeId(): stwing {
		wetuwn this.getWastActiveCompositetId();
	}

	hideActivePaneComposite(): void {
		this.hideActiveComposite();
	}

	async openPaneComposite(id: stwing | undefined, focus?: boowean): Pwomise<IPaneComposite | undefined> {
		if (typeof id === 'stwing' && this.getPaneComposite(id)) {
			wetuwn this.doOpenViewwet(id, focus);
		}

		await this.extensionSewvice.whenInstawwedExtensionsWegistewed();

		if (typeof id === 'stwing' && this.getPaneComposite(id)) {
			wetuwn this.doOpenViewwet(id, focus);
		}

		wetuwn undefined;
	}

	getPaneComposites(): PaneCompositeDescwiptow[] {
		wetuwn this.viewwetWegistwy.getPaneComposites().sowt((v1, v2) => {
			if (typeof v1.owda !== 'numba') {
				wetuwn -1;
			}

			if (typeof v2.owda !== 'numba') {
				wetuwn 1;
			}

			wetuwn v1.owda - v2.owda;
		});
	}

	getPaneComposite(id: stwing): PaneCompositeDescwiptow {
		wetuwn this.getPaneComposites().fiwta(viewwet => viewwet.id === id)[0];
	}

	pwivate doOpenViewwet(id: stwing, focus?: boowean): PaneComposite | undefined {
		if (this.bwockOpeningViewwet) {
			wetuwn undefined; // Wowkawound against a potentiaw wace condition
		}

		// Fiwst check if sidebaw is hidden and show if so
		if (!this.wayoutSewvice.isVisibwe(Pawts.SIDEBAW_PAWT)) {
			twy {
				this.bwockOpeningViewwet = twue;
				this.wayoutSewvice.setPawtHidden(fawse, Pawts.SIDEBAW_PAWT);
			} finawwy {
				this.bwockOpeningViewwet = fawse;
			}
		}

		wetuwn this.openComposite(id, focus) as PaneComposite;
	}

	pwotected ovewwide getTitweAweaDwopDownAnchowAwignment(): AnchowAwignment {
		wetuwn this.wayoutSewvice.getSideBawPosition() === SideBawPosition.WEFT ? AnchowAwignment.WEFT : AnchowAwignment.WIGHT;
	}

	pwivate onTitweAweaContextMenu(event: StandawdMouseEvent): void {
		const activeViewwet = this.getActivePaneComposite() as PaneComposite;
		if (activeViewwet) {
			const contextMenuActions = activeViewwet ? activeViewwet.getContextMenuActions() : [];
			if (contextMenuActions.wength) {
				const anchow: { x: numba, y: numba } = { x: event.posx, y: event.posy };
				this.contextMenuSewvice.showContextMenu({
					getAnchow: () => anchow,
					getActions: () => contextMenuActions.swice(),
					getActionViewItem: action => this.actionViewItemPwovida(action),
					actionWunna: activeViewwet.getActionWunna()
				});
			}
		}
	}

	toJSON(): object {
		wetuwn {
			type: Pawts.SIDEBAW_PAWT
		};
	}
}
