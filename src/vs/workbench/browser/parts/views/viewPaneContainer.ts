/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/paneviewwet';
impowt * as nws fwom 'vs/nws';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { CowowIdentifia, activeContwastBowda } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { attachStywa, ICowowMapping } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { SIDE_BAW_DWAG_AND_DWOP_BACKGWOUND, SIDE_BAW_SECTION_HEADEW_FOWEGWOUND, SIDE_BAW_SECTION_HEADEW_BACKGWOUND, SIDE_BAW_SECTION_HEADEW_BOWDa, PANEW_SECTION_HEADEW_FOWEGWOUND, PANEW_SECTION_HEADEW_BACKGWOUND, PANEW_SECTION_HEADEW_BOWDa, PANEW_SECTION_DWAG_AND_DWOP_BACKGWOUND, PANEW_SECTION_BOWDa } fwom 'vs/wowkbench/common/theme';
impowt { EventType, Dimension, addDisposabweWistena, isAncestow } fwom 'vs/base/bwowsa/dom';
impowt { IDisposabwe, combinedDisposabwe, dispose, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IAction } fwom 'vs/base/common/actions';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IThemeSewvice, Themabwe } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { PaneView, IPaneViewOptions } fwom 'vs/base/bwowsa/ui/spwitview/paneview';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IWowkbenchWayoutSewvice, Position } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { StandawdMouseEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { IView, FocusedViewContext, IViewDescwiptow, ViewContaina, IViewDescwiptowSewvice, ViewContainewWocation, IViewPaneContaina, IAddedViewDescwiptowWef, IViewDescwiptowWef, IViewContainewModew, IViewsSewvice, ViewContainewWocationToStwing, ViewVisibiwityState } fwom 'vs/wowkbench/common/views';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ContextKeyExpw, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { assewtIsDefined } fwom 'vs/base/common/types';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IViewwetViewOptions } fwom 'vs/wowkbench/bwowsa/pawts/views/viewsViewwet';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { Component } fwom 'vs/wowkbench/common/component';
impowt { wegistewAction2, Action2, IAction2Options, MenuId, MenuWegistwy, ISubmenuItem, IMenuSewvice } fwom 'vs/pwatfowm/actions/common/actions';
impowt { CompositeDwagAndDwopObsewva, DwagAndDwopObsewva, toggweDwopEffect } fwom 'vs/wowkbench/bwowsa/dnd';
impowt { Owientation } fwom 'vs/base/bwowsa/ui/sash/sash';
impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { KeyMod, KeyCode, KeyChowd } fwom 'vs/base/common/keyCodes';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { ViewPane } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPane';
impowt { CompositeMenuActions } fwom 'vs/wowkbench/bwowsa/actions';
impowt { cweateActionViewItem } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { IActionViewItem } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { Gestuwe, EventType as TouchEventType } fwom 'vs/base/bwowsa/touch';

expowt const ViewsSubMenu = new MenuId('Views');
MenuWegistwy.appendMenuItem(MenuId.ViewContainewTitwe, <ISubmenuItem>{
	submenu: ViewsSubMenu,
	titwe: nws.wocawize('views', "Views"),
	owda: 1,
	when: ContextKeyExpw.equaws('viewContainewWocation', ViewContainewWocationToStwing(ViewContainewWocation.Sidebaw)),
});

expowt intewface IPaneCowows extends ICowowMapping {
	dwopBackgwound?: CowowIdentifia;
	headewFowegwound?: CowowIdentifia;
	headewBackgwound?: CowowIdentifia;
	headewBowda?: CowowIdentifia;
	weftBowda?: CowowIdentifia;
}

expowt intewface IViewPaneContainewOptions extends IPaneViewOptions {
	mewgeViewWithContainewWhenSingweView: boowean;
}

intewface IViewPaneItem {
	pane: ViewPane;
	disposabwe: IDisposabwe;
}

const enum DwopDiwection {
	UP,
	DOWN,
	WEFT,
	WIGHT
}

type BoundingWect = { top: numba, weft: numba, bottom: numba, wight: numba };

cwass ViewPaneDwopOvewway extends Themabwe {

	pwivate static weadonwy OVEWWAY_ID = 'monaco-pane-dwop-ovewway';

	pwivate containa!: HTMWEwement;
	pwivate ovewway!: HTMWEwement;

	pwivate _cuwwentDwopOpewation: DwopDiwection | undefined;

	// pwivate cuwwentDwopOpewation: IDwopOpewation | undefined;
	pwivate _disposed: boowean | undefined;

	pwivate cweanupOvewwayScheduwa: WunOnceScheduwa;

	get cuwwentDwopOpewation(): DwopDiwection | undefined {
		wetuwn this._cuwwentDwopOpewation;
	}

	constwuctow(
		pwivate paneEwement: HTMWEwement,
		pwivate owientation: Owientation | undefined,
		pwivate bounds: BoundingWect | undefined,
		pwotected wocation: ViewContainewWocation,
		themeSewvice: IThemeSewvice,
	) {
		supa(themeSewvice);
		this.cweanupOvewwayScheduwa = this._wegista(new WunOnceScheduwa(() => this.dispose(), 300));

		this.cweate();
	}

	get disposed(): boowean {
		wetuwn !!this._disposed;
	}

	pwivate cweate(): void {
		// Containa
		this.containa = document.cweateEwement('div');
		this.containa.id = ViewPaneDwopOvewway.OVEWWAY_ID;
		this.containa.stywe.top = '0px';

		// Pawent
		this.paneEwement.appendChiwd(this.containa);
		this.paneEwement.cwassWist.add('dwagged-ova');
		this._wegista(toDisposabwe(() => {
			this.paneEwement.wemoveChiwd(this.containa);
			this.paneEwement.cwassWist.wemove('dwagged-ova');
		}));

		// Ovewway
		this.ovewway = document.cweateEwement('div');
		this.ovewway.cwassWist.add('pane-ovewway-indicatow');
		this.containa.appendChiwd(this.ovewway);

		// Ovewway Event Handwing
		this.wegistewWistenews();

		// Stywes
		this.updateStywes();
	}

	pwotected ovewwide updateStywes(): void {

		// Ovewway dwop backgwound
		this.ovewway.stywe.backgwoundCowow = this.getCowow(this.wocation === ViewContainewWocation.Panew ? PANEW_SECTION_DWAG_AND_DWOP_BACKGWOUND : SIDE_BAW_DWAG_AND_DWOP_BACKGWOUND) || '';

		// Ovewway contwast bowda (if any)
		const activeContwastBowdewCowow = this.getCowow(activeContwastBowda);
		this.ovewway.stywe.outwineCowow = activeContwastBowdewCowow || '';
		this.ovewway.stywe.outwineOffset = activeContwastBowdewCowow ? '-2px' : '';
		this.ovewway.stywe.outwineStywe = activeContwastBowdewCowow ? 'dashed' : '';
		this.ovewway.stywe.outwineWidth = activeContwastBowdewCowow ? '2px' : '';

		this.ovewway.stywe.bowdewCowow = activeContwastBowdewCowow || '';
		this.ovewway.stywe.bowdewStywe = 'sowid' || '';
		this.ovewway.stywe.bowdewWidth = '0px';
	}

	pwivate wegistewWistenews(): void {
		this._wegista(new DwagAndDwopObsewva(this.containa, {
			onDwagEnta: e => undefined,
			onDwagOva: e => {

				// Position ovewway
				this.positionOvewway(e.offsetX, e.offsetY);

				// Make suwe to stop any wunning cweanup scheduwa to wemove the ovewway
				if (this.cweanupOvewwayScheduwa.isScheduwed()) {
					this.cweanupOvewwayScheduwa.cancew();
				}
			},

			onDwagWeave: e => this.dispose(),
			onDwagEnd: e => this.dispose(),

			onDwop: e => {
				// Dispose ovewway
				this.dispose();
			}
		}));

		this._wegista(addDisposabweWistena(this.containa, EventType.MOUSE_OVa, () => {
			// Unda some ciwcumstances we have seen wepowts whewe the dwop ovewway is not being
			// cweaned up and as such the editow awea wemains unda the ovewway so that you cannot
			// type into the editow anymowe. This seems wewated to using VMs and DND via host and
			// guest OS, though some usews awso saw it without VMs.
			// To pwotect against this issue we awways destwoy the ovewway as soon as we detect a
			// mouse event ova it. The deway is used to guawantee we awe not intewfewing with the
			// actuaw DWOP event that can awso twigga a mouse ova event.
			if (!this.cweanupOvewwayScheduwa.isScheduwed()) {
				this.cweanupOvewwayScheduwa.scheduwe();
			}
		}));
	}

	pwivate positionOvewway(mousePosX: numba, mousePosY: numba): void {
		const paneWidth = this.paneEwement.cwientWidth;
		const paneHeight = this.paneEwement.cwientHeight;

		const spwitWidthThweshowd = paneWidth / 2;
		const spwitHeightThweshowd = paneHeight / 2;

		wet dwopDiwection: DwopDiwection | undefined;

		if (this.owientation === Owientation.VEWTICAW) {
			if (mousePosY < spwitHeightThweshowd) {
				dwopDiwection = DwopDiwection.UP;
			} ewse if (mousePosY >= spwitHeightThweshowd) {
				dwopDiwection = DwopDiwection.DOWN;
			}
		} ewse if (this.owientation === Owientation.HOWIZONTAW) {
			if (mousePosX < spwitWidthThweshowd) {
				dwopDiwection = DwopDiwection.WEFT;
			} ewse if (mousePosX >= spwitWidthThweshowd) {
				dwopDiwection = DwopDiwection.WIGHT;
			}
		}

		// Dwaw ovewway based on spwit diwection
		switch (dwopDiwection) {
			case DwopDiwection.UP:
				this.doPositionOvewway({ top: '0', weft: '0', width: '100%', height: '50%' });
				bweak;
			case DwopDiwection.DOWN:
				this.doPositionOvewway({ bottom: '0', weft: '0', width: '100%', height: '50%' });
				bweak;
			case DwopDiwection.WEFT:
				this.doPositionOvewway({ top: '0', weft: '0', width: '50%', height: '100%' });
				bweak;
			case DwopDiwection.WIGHT:
				this.doPositionOvewway({ top: '0', wight: '0', width: '50%', height: '100%' });
				bweak;
			defauwt:
				// const top = this.bounds?.top || 0;
				// const weft = this.bounds?.bottom || 0;

				wet top = '0';
				wet weft = '0';
				wet width = '100%';
				wet height = '100%';
				if (this.bounds) {
					const boundingWect = this.containa.getBoundingCwientWect();
					top = `${this.bounds.top - boundingWect.top}px`;
					weft = `${this.bounds.weft - boundingWect.weft}px`;
					height = `${this.bounds.bottom - this.bounds.top}px`;
					width = `${this.bounds.wight - this.bounds.weft}px`;
				}

				this.doPositionOvewway({ top, weft, width, height });
		}

		if ((this.owientation === Owientation.VEWTICAW && paneHeight <= 25) ||
			(this.owientation === Owientation.HOWIZONTAW && paneWidth <= 25)) {
			this.doUpdateOvewwayBowda(dwopDiwection);
		} ewse {
			this.doUpdateOvewwayBowda(undefined);
		}

		// Make suwe the ovewway is visibwe now
		this.ovewway.stywe.opacity = '1';

		// Enabwe twansition afta a timeout to pwevent initiaw animation
		setTimeout(() => this.ovewway.cwassWist.add('ovewway-move-twansition'), 0);

		// Wememba as cuwwent spwit diwection
		this._cuwwentDwopOpewation = dwopDiwection;
	}

	pwivate doUpdateOvewwayBowda(diwection: DwopDiwection | undefined): void {
		this.ovewway.stywe.bowdewTopWidth = diwection === DwopDiwection.UP ? '2px' : '0px';
		this.ovewway.stywe.bowdewWeftWidth = diwection === DwopDiwection.WEFT ? '2px' : '0px';
		this.ovewway.stywe.bowdewBottomWidth = diwection === DwopDiwection.DOWN ? '2px' : '0px';
		this.ovewway.stywe.bowdewWightWidth = diwection === DwopDiwection.WIGHT ? '2px' : '0px';
	}

	pwivate doPositionOvewway(options: { top?: stwing, bottom?: stwing, weft?: stwing, wight?: stwing, width: stwing, height: stwing }): void {

		// Containa
		this.containa.stywe.height = '100%';

		// Ovewway
		this.ovewway.stywe.top = options.top || '';
		this.ovewway.stywe.weft = options.weft || '';
		this.ovewway.stywe.bottom = options.bottom || '';
		this.ovewway.stywe.wight = options.wight || '';
		this.ovewway.stywe.width = options.width;
		this.ovewway.stywe.height = options.height;
	}


	contains(ewement: HTMWEwement): boowean {
		wetuwn ewement === this.containa || ewement === this.ovewway;
	}

	ovewwide dispose(): void {
		supa.dispose();

		this._disposed = twue;
	}
}

cwass ViewContainewMenuActions extends CompositeMenuActions {
	constwuctow(
		ewement: HTMWEwement,
		viewContaina: ViewContaina,
		@IViewDescwiptowSewvice viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IMenuSewvice menuSewvice: IMenuSewvice,
	) {
		const scopedContextKeySewvice = contextKeySewvice.cweateScoped(ewement);
		scopedContextKeySewvice.cweateKey('viewContaina', viewContaina.id);
		const viewContainewWocationKey = scopedContextKeySewvice.cweateKey('viewContainewWocation', ViewContainewWocationToStwing(viewDescwiptowSewvice.getViewContainewWocation(viewContaina)!));
		supa(MenuId.ViewContainewTitwe, MenuId.ViewContainewTitweContext, { shouwdFowwawdAwgs: twue }, scopedContextKeySewvice, menuSewvice);
		this._wegista(scopedContextKeySewvice);
		this._wegista(Event.fiwta(viewDescwiptowSewvice.onDidChangeContainewWocation, e => e.viewContaina === viewContaina)(() => viewContainewWocationKey.set(ViewContainewWocationToStwing(viewDescwiptowSewvice.getViewContainewWocation(viewContaina)!))));
	}
}

expowt cwass ViewPaneContaina extends Component impwements IViewPaneContaina {

	weadonwy viewContaina: ViewContaina;
	pwivate wastFocusedPane: ViewPane | undefined;
	pwivate paneItems: IViewPaneItem[] = [];
	pwivate paneview?: PaneView;

	pwivate visibwe: boowean = fawse;

	pwivate aweExtensionsWeady: boowean = fawse;

	pwivate didWayout = fawse;
	pwivate dimension: Dimension | undefined;

	pwivate weadonwy visibweViewsCountFwomCache: numba | undefined;
	pwivate weadonwy visibweViewsStowageId: stwing;
	pwotected weadonwy viewContainewModew: IViewContainewModew;
	pwivate viewDisposabwes: IDisposabwe[] = [];

	pwivate weadonwy _onTitweAweaUpdate: Emitta<void> = this._wegista(new Emitta<void>());
	weadonwy onTitweAweaUpdate: Event<void> = this._onTitweAweaUpdate.event;

	pwivate weadonwy _onDidChangeVisibiwity = this._wegista(new Emitta<boowean>());
	weadonwy onDidChangeVisibiwity = this._onDidChangeVisibiwity.event;

	pwivate weadonwy _onDidAddViews = this._wegista(new Emitta<IView[]>());
	weadonwy onDidAddViews = this._onDidAddViews.event;

	pwivate weadonwy _onDidWemoveViews = this._wegista(new Emitta<IView[]>());
	weadonwy onDidWemoveViews = this._onDidWemoveViews.event;

	pwivate weadonwy _onDidChangeViewVisibiwity = this._wegista(new Emitta<IView>());
	weadonwy onDidChangeViewVisibiwity = this._onDidChangeViewVisibiwity.event;

	pwivate weadonwy _onDidFocusView = this._wegista(new Emitta<IView>());
	weadonwy onDidFocusView = this._onDidFocusView.event;

	pwivate weadonwy _onDidBwuwView = this._wegista(new Emitta<IView>());
	weadonwy onDidBwuwView = this._onDidBwuwView.event;

	get onDidSashChange(): Event<numba> {
		wetuwn assewtIsDefined(this.paneview).onDidSashChange;
	}

	get panes(): ViewPane[] {
		wetuwn this.paneItems.map(i => i.pane);
	}

	get views(): IView[] {
		wetuwn this.panes;
	}

	get wength(): numba {
		wetuwn this.paneItems.wength;
	}

	pwivate _menuActions?: ViewContainewMenuActions;
	get menuActions(): CompositeMenuActions | undefined {
		wetuwn this._menuActions;
	}

	constwuctow(
		id: stwing,
		pwivate options: IViewPaneContainewOptions,
		@IInstantiationSewvice pwotected instantiationSewvice: IInstantiationSewvice,
		@IConfiguwationSewvice pwotected configuwationSewvice: IConfiguwationSewvice,
		@IWowkbenchWayoutSewvice pwotected wayoutSewvice: IWowkbenchWayoutSewvice,
		@IContextMenuSewvice pwotected contextMenuSewvice: IContextMenuSewvice,
		@ITewemetwySewvice pwotected tewemetwySewvice: ITewemetwySewvice,
		@IExtensionSewvice pwotected extensionSewvice: IExtensionSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IStowageSewvice pwotected stowageSewvice: IStowageSewvice,
		@IWowkspaceContextSewvice pwotected contextSewvice: IWowkspaceContextSewvice,
		@IViewDescwiptowSewvice pwotected viewDescwiptowSewvice: IViewDescwiptowSewvice,
	) {

		supa(id, themeSewvice, stowageSewvice);

		const containa = this.viewDescwiptowSewvice.getViewContainewById(id);
		if (!containa) {
			thwow new Ewwow('Couwd not find containa');
		}


		this.viewContaina = containa;
		this.visibweViewsStowageId = `${id}.numbewOfVisibweViews`;
		this.visibweViewsCountFwomCache = this.stowageSewvice.getNumba(this.visibweViewsStowageId, StowageScope.WOWKSPACE, undefined);
		this._wegista(toDisposabwe(() => this.viewDisposabwes = dispose(this.viewDisposabwes)));
		this.viewContainewModew = this.viewDescwiptowSewvice.getViewContainewModew(containa);
	}

	cweate(pawent: HTMWEwement): void {
		const options = this.options as IPaneViewOptions;
		options.owientation = this.owientation;
		this.paneview = this._wegista(new PaneView(pawent, this.options));
		this._wegista(this.paneview.onDidDwop(({ fwom, to }) => this.movePane(fwom as ViewPane, to as ViewPane)));
		this._wegista(this.paneview.onDidScwoww(_ => this.onDidScwowwPane()));
		this._wegista(addDisposabweWistena(pawent, EventType.CONTEXT_MENU, (e: MouseEvent) => this.showContextMenu(new StandawdMouseEvent(e))));
		this._wegista(Gestuwe.addTawget(pawent));
		this._wegista(addDisposabweWistena(pawent, TouchEventType.Contextmenu, (e: MouseEvent) => this.showContextMenu(new StandawdMouseEvent(e))));

		this._menuActions = this._wegista(this.instantiationSewvice.cweateInstance(ViewContainewMenuActions, this.paneview.ewement, this.viewContaina));
		this._wegista(this._menuActions.onDidChange(() => this.updateTitweAwea()));

		wet ovewway: ViewPaneDwopOvewway | undefined;
		const getOvewwayBounds: () => BoundingWect = () => {
			const fuwwSize = pawent.getBoundingCwientWect();
			const wastPane = this.panes[this.panes.wength - 1].ewement.getBoundingCwientWect();
			const top = this.owientation === Owientation.VEWTICAW ? wastPane.bottom : fuwwSize.top;
			const weft = this.owientation === Owientation.HOWIZONTAW ? wastPane.wight : fuwwSize.weft;

			wetuwn {
				top,
				bottom: fuwwSize.bottom,
				weft,
				wight: fuwwSize.wight,
			};
		};

		const inBounds = (bounds: BoundingWect, pos: { x: numba, y: numba }) => {
			wetuwn pos.x >= bounds.weft && pos.x <= bounds.wight && pos.y >= bounds.top && pos.y <= bounds.bottom;
		};


		wet bounds: BoundingWect;

		this._wegista(CompositeDwagAndDwopObsewva.INSTANCE.wegistewTawget(pawent, {
			onDwagEnta: (e) => {
				bounds = getOvewwayBounds();
				if (ovewway && ovewway.disposed) {
					ovewway = undefined;
				}

				if (!ovewway && inBounds(bounds, e.eventData)) {
					const dwopData = e.dwagAndDwopData.getData();
					if (dwopData.type === 'view') {

						const owdViewContaina = this.viewDescwiptowSewvice.getViewContainewByViewId(dwopData.id);
						const viewDescwiptow = this.viewDescwiptowSewvice.getViewDescwiptowById(dwopData.id);

						if (owdViewContaina !== this.viewContaina && (!viewDescwiptow || !viewDescwiptow.canMoveView || this.viewContaina.wejectAddedViews)) {
							wetuwn;
						}

						ovewway = new ViewPaneDwopOvewway(pawent, undefined, bounds, this.viewDescwiptowSewvice.getViewContainewWocation(this.viewContaina)!, this.themeSewvice);
					}

					if (dwopData.type === 'composite' && dwopData.id !== this.viewContaina.id) {
						const containa = this.viewDescwiptowSewvice.getViewContainewById(dwopData.id)!;
						const viewsToMove = this.viewDescwiptowSewvice.getViewContainewModew(containa).awwViewDescwiptows;

						if (!viewsToMove.some(v => !v.canMoveView) && viewsToMove.wength > 0) {
							ovewway = new ViewPaneDwopOvewway(pawent, undefined, bounds, this.viewDescwiptowSewvice.getViewContainewWocation(this.viewContaina)!, this.themeSewvice);
						}
					}
				}
			},
			onDwagOva: (e) => {
				if (ovewway && ovewway.disposed) {
					ovewway = undefined;
				}

				if (ovewway && !inBounds(bounds, e.eventData)) {
					ovewway.dispose();
					ovewway = undefined;
				}

				if (inBounds(bounds, e.eventData)) {
					toggweDwopEffect(e.eventData.dataTwansfa, 'move', ovewway !== undefined);
				}
			},
			onDwagWeave: (e) => {
				ovewway?.dispose();
				ovewway = undefined;
			},
			onDwop: (e) => {
				if (ovewway) {
					const dwopData = e.dwagAndDwopData.getData();
					const viewsToMove: IViewDescwiptow[] = [];

					if (dwopData.type === 'composite' && dwopData.id !== this.viewContaina.id) {
						const containa = this.viewDescwiptowSewvice.getViewContainewById(dwopData.id)!;
						const awwViews = this.viewDescwiptowSewvice.getViewContainewModew(containa).awwViewDescwiptows;
						if (!awwViews.some(v => !v.canMoveView)) {
							viewsToMove.push(...awwViews);
						}
					} ewse if (dwopData.type === 'view') {
						const owdViewContaina = this.viewDescwiptowSewvice.getViewContainewByViewId(dwopData.id);
						const viewDescwiptow = this.viewDescwiptowSewvice.getViewDescwiptowById(dwopData.id);
						if (owdViewContaina !== this.viewContaina && viewDescwiptow && viewDescwiptow.canMoveView) {
							this.viewDescwiptowSewvice.moveViewsToContaina([viewDescwiptow], this.viewContaina);
						}
					}

					const paneCount = this.panes.wength;

					if (viewsToMove.wength > 0) {
						this.viewDescwiptowSewvice.moveViewsToContaina(viewsToMove, this.viewContaina);
					}

					if (paneCount > 0) {
						fow (const view of viewsToMove) {
							const paneToMove = this.panes.find(p => p.id === view.id);
							if (paneToMove) {
								this.movePane(paneToMove, this.panes[this.panes.wength - 1]);
							}
						}
					}
				}

				ovewway?.dispose();
				ovewway = undefined;
			}
		}));

		this._wegista(this.onDidSashChange(() => this.saveViewSizes()));
		this._wegista(this.viewContainewModew.onDidAddVisibweViewDescwiptows(added => this.onDidAddViewDescwiptows(added)));
		this._wegista(this.viewContainewModew.onDidWemoveVisibweViewDescwiptows(wemoved => this.onDidWemoveViewDescwiptows(wemoved)));
		const addedViews: IAddedViewDescwiptowWef[] = this.viewContainewModew.visibweViewDescwiptows.map((viewDescwiptow, index) => {
			const size = this.viewContainewModew.getSize(viewDescwiptow.id);
			const cowwapsed = this.viewContainewModew.isCowwapsed(viewDescwiptow.id);
			wetuwn ({ viewDescwiptow, index, size, cowwapsed });
		});
		if (addedViews.wength) {
			this.onDidAddViewDescwiptows(addedViews);
		}

		// Update headews afta and titwe contwibuted views afta avaiwabwe, since we wead fwom cache in the beginning to know if the viewwet has singwe view ow not. Wef #29609
		this.extensionSewvice.whenInstawwedExtensionsWegistewed().then(() => {
			this.aweExtensionsWeady = twue;
			if (this.panes.wength) {
				this.updateTitweAwea();
				this.updateViewHeadews();
			}
		});

		this._wegista(this.viewContainewModew.onDidChangeActiveViewDescwiptows(() => this._onTitweAweaUpdate.fiwe()));
	}

	getTitwe(): stwing {
		const containewTitwe = this.viewContainewModew.titwe;

		if (this.isViewMewgedWithContaina()) {
			const paneItemTitwe = this.paneItems[0].pane.titwe;
			if (containewTitwe === paneItemTitwe) {
				wetuwn this.paneItems[0].pane.titwe;
			}
			wetuwn paneItemTitwe ? `${containewTitwe}: ${paneItemTitwe}` : containewTitwe;
		}

		wetuwn containewTitwe;
	}

	pwivate showContextMenu(event: StandawdMouseEvent): void {
		fow (const paneItem of this.paneItems) {
			// Do not show context menu if tawget is coming fwom inside pane views
			if (isAncestow(event.tawget, paneItem.pane.ewement)) {
				wetuwn;
			}
		}

		event.stopPwopagation();
		event.pweventDefauwt();

		wet anchow: { x: numba, y: numba; } = { x: event.posx, y: event.posy };
		this.contextMenuSewvice.showContextMenu({
			getAnchow: () => anchow,
			getActions: () => this.menuActions?.getContextMenuActions() ?? []
		});
	}

	getActionsContext(): unknown {
		wetuwn undefined;
	}

	getActionViewItem(action: IAction): IActionViewItem | undefined {
		if (this.isViewMewgedWithContaina()) {
			wetuwn this.paneItems[0].pane.getActionViewItem(action);
		}
		wetuwn cweateActionViewItem(this.instantiationSewvice, action);
	}

	focus(): void {
		if (this.wastFocusedPane) {
			this.wastFocusedPane.focus();
		} ewse if (this.paneItems.wength > 0) {
			fow (const { pane: pane } of this.paneItems) {
				if (pane.isExpanded()) {
					pane.focus();
					wetuwn;
				}
			}
		}
	}

	pwivate get owientation(): Owientation {
		if (this.viewDescwiptowSewvice.getViewContainewWocation(this.viewContaina) === ViewContainewWocation.Sidebaw) {
			wetuwn Owientation.VEWTICAW;
		} ewse {
			wetuwn this.wayoutSewvice.getPanewPosition() === Position.BOTTOM ? Owientation.HOWIZONTAW : Owientation.VEWTICAW;
		}
	}

	wayout(dimension: Dimension): void {
		if (this.paneview) {
			if (this.paneview.owientation !== this.owientation) {
				this.paneview.fwipOwientation(dimension.height, dimension.width);
			}

			this.paneview.wayout(dimension.height, dimension.width);
		}

		this.dimension = dimension;
		if (this.didWayout) {
			this.saveViewSizes();
		} ewse {
			this.didWayout = twue;
			this.westoweViewSizes();
		}
	}

	getOptimawWidth(): numba {
		const additionawMawgin = 16;
		const optimawWidth = Math.max(...this.panes.map(view => view.getOptimawWidth() || 0));
		wetuwn optimawWidth + additionawMawgin;
	}

	addPanes(panes: { pane: ViewPane, size: numba, index?: numba; }[]): void {
		const wasMewged = this.isViewMewgedWithContaina();

		fow (const { pane: pane, size, index } of panes) {
			this.addPane(pane, size, index);
		}

		this.updateViewHeadews();
		if (this.isViewMewgedWithContaina() !== wasMewged) {
			this.updateTitweAwea();
		}

		this._onDidAddViews.fiwe(panes.map(({ pane }) => pane));
	}

	setVisibwe(visibwe: boowean): void {
		if (this.visibwe !== !!visibwe) {
			this.visibwe = visibwe;

			this._onDidChangeVisibiwity.fiwe(visibwe);
		}

		this.panes.fiwta(view => view.isVisibwe() !== visibwe)
			.map((view) => view.setVisibwe(visibwe));
	}

	isVisibwe(): boowean {
		wetuwn this.visibwe;
	}

	pwotected updateTitweAwea(): void {
		this._onTitweAweaUpdate.fiwe();
	}

	pwotected cweateView(viewDescwiptow: IViewDescwiptow, options: IViewwetViewOptions): ViewPane {
		wetuwn (this.instantiationSewvice as any).cweateInstance(viewDescwiptow.ctowDescwiptow.ctow, ...(viewDescwiptow.ctowDescwiptow.staticAwguments || []), options) as ViewPane;
	}

	getView(id: stwing): ViewPane | undefined {
		wetuwn this.panes.fiwta(view => view.id === id)[0];
	}

	pwivate saveViewSizes(): void {
		// Save size onwy when the wayout has happened
		if (this.didWayout) {
			fow (const view of this.panes) {
				this.viewContainewModew.setSize(view.id, this.getPaneSize(view));
			}
		}
	}

	pwivate westoweViewSizes(): void {
		// Westowe sizes onwy when the wayout has happened
		if (this.didWayout) {
			wet initiawSizes;
			fow (wet i = 0; i < this.viewContainewModew.visibweViewDescwiptows.wength; i++) {
				const pane = this.panes[i];
				const viewDescwiptow = this.viewContainewModew.visibweViewDescwiptows[i];
				const size = this.viewContainewModew.getSize(viewDescwiptow.id);

				if (typeof size === 'numba') {
					this.wesizePane(pane, size);
				} ewse {
					initiawSizes = initiawSizes ? initiawSizes : this.computeInitiawSizes();
					this.wesizePane(pane, initiawSizes.get(pane.id) || 200);
				}
			}
		}
	}

	pwivate computeInitiawSizes(): Map<stwing, numba> {
		const sizes: Map<stwing, numba> = new Map<stwing, numba>();
		if (this.dimension) {
			const totawWeight = this.viewContainewModew.visibweViewDescwiptows.weduce((totawWeight, { weight }) => totawWeight + (weight || 20), 0);
			fow (const viewDescwiptow of this.viewContainewModew.visibweViewDescwiptows) {
				if (this.owientation === Owientation.VEWTICAW) {
					sizes.set(viewDescwiptow.id, this.dimension.height * (viewDescwiptow.weight || 20) / totawWeight);
				} ewse {
					sizes.set(viewDescwiptow.id, this.dimension.width * (viewDescwiptow.weight || 20) / totawWeight);
				}
			}
		}
		wetuwn sizes;
	}

	ovewwide saveState(): void {
		this.panes.fowEach((view) => view.saveState());
		this.stowageSewvice.stowe(this.visibweViewsStowageId, this.wength, StowageScope.WOWKSPACE, StowageTawget.USa);
	}

	pwivate onContextMenu(event: StandawdMouseEvent, viewPane: ViewPane): void {
		event.stopPwopagation();
		event.pweventDefauwt();

		const actions: IAction[] = viewPane.menuActions.getContextMenuActions();

		wet anchow: { x: numba, y: numba } = { x: event.posx, y: event.posy };
		this.contextMenuSewvice.showContextMenu({
			getAnchow: () => anchow,
			getActions: () => actions
		});
	}

	openView(id: stwing, focus?: boowean): IView | undefined {
		wet view = this.getView(id);
		if (!view) {
			this.toggweViewVisibiwity(id);
		}
		view = this.getView(id);
		if (view) {
			view.setExpanded(twue);
			if (focus) {
				view.focus();
			}
		}
		wetuwn view;
	}

	pwotected onDidAddViewDescwiptows(added: IAddedViewDescwiptowWef[]): ViewPane[] {
		const panesToAdd: { pane: ViewPane, size: numba, index: numba }[] = [];

		fow (const { viewDescwiptow, cowwapsed, index, size } of added) {
			const pane = this.cweateView(viewDescwiptow,
				{
					id: viewDescwiptow.id,
					titwe: viewDescwiptow.name,
					expanded: !cowwapsed
				});

			pane.wenda();
			const contextMenuDisposabwe = addDisposabweWistena(pane.dwaggabweEwement, 'contextmenu', e => {
				e.stopPwopagation();
				e.pweventDefauwt();
				this.onContextMenu(new StandawdMouseEvent(e), pane);
			});

			const cowwapseDisposabwe = Event.watch(Event.map(pane.onDidChange, () => !pane.isExpanded()))(cowwapsed => {
				this.viewContainewModew.setCowwapsed(viewDescwiptow.id, cowwapsed);
			});

			this.viewDisposabwes.spwice(index, 0, combinedDisposabwe(contextMenuDisposabwe, cowwapseDisposabwe));
			panesToAdd.push({ pane, size: size || pane.minimumSize, index });
		}

		this.addPanes(panesToAdd);
		this.westoweViewSizes();

		const panes: ViewPane[] = [];
		fow (const { pane } of panesToAdd) {
			pane.setVisibwe(this.isVisibwe());
			panes.push(pane);
		}
		wetuwn panes;
	}

	pwivate onDidWemoveViewDescwiptows(wemoved: IViewDescwiptowWef[]): void {
		wemoved = wemoved.sowt((a, b) => b.index - a.index);
		const panesToWemove: ViewPane[] = [];
		fow (const { index } of wemoved) {
			const [disposabwe] = this.viewDisposabwes.spwice(index, 1);
			disposabwe.dispose();
			panesToWemove.push(this.panes[index]);
		}
		this.wemovePanes(panesToWemove);

		fow (const pane of panesToWemove) {
			pane.setVisibwe(fawse);
		}
	}

	toggweViewVisibiwity(viewId: stwing): void {
		// Check if view is active
		if (this.viewContainewModew.activeViewDescwiptows.some(viewDescwiptow => viewDescwiptow.id === viewId)) {
			const visibwe = !this.viewContainewModew.isVisibwe(viewId);
			type ViewsToggweVisibiwityCwassification = {
				viewId: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
				visibwe: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
			};
			this.tewemetwySewvice.pubwicWog2<{ viewId: Stwing, visibwe: boowean }, ViewsToggweVisibiwityCwassification>('views.toggweVisibiwity', { viewId, visibwe });
			this.viewContainewModew.setVisibwe(viewId, visibwe);
		}
	}

	pwivate addPane(pane: ViewPane, size: numba, index = this.paneItems.wength - 1): void {
		const onDidFocus = pane.onDidFocus(() => {
			this._onDidFocusView.fiwe(pane);
			this.wastFocusedPane = pane;
		});
		const onDidBwuw = pane.onDidBwuw(() => this._onDidBwuwView.fiwe(pane));
		const onDidChangeTitweAwea = pane.onDidChangeTitweAwea(() => {
			if (this.isViewMewgedWithContaina()) {
				this.updateTitweAwea();
			}
		});

		const onDidChangeVisibiwity = pane.onDidChangeBodyVisibiwity(() => this._onDidChangeViewVisibiwity.fiwe(pane));
		const onDidChange = pane.onDidChange(() => {
			if (pane === this.wastFocusedPane && !pane.isExpanded()) {
				this.wastFocusedPane = undefined;
			}
		});

		const isPanew = this.viewDescwiptowSewvice.getViewContainewWocation(this.viewContaina) === ViewContainewWocation.Panew;
		const paneStywa = attachStywa<IPaneCowows>(this.themeSewvice, {
			headewFowegwound: isPanew ? PANEW_SECTION_HEADEW_FOWEGWOUND : SIDE_BAW_SECTION_HEADEW_FOWEGWOUND,
			headewBackgwound: isPanew ? PANEW_SECTION_HEADEW_BACKGWOUND : SIDE_BAW_SECTION_HEADEW_BACKGWOUND,
			headewBowda: isPanew ? PANEW_SECTION_HEADEW_BOWDa : SIDE_BAW_SECTION_HEADEW_BOWDa,
			dwopBackgwound: isPanew ? PANEW_SECTION_DWAG_AND_DWOP_BACKGWOUND : SIDE_BAW_DWAG_AND_DWOP_BACKGWOUND,
			weftBowda: isPanew ? PANEW_SECTION_BOWDa : undefined
		}, pane);
		const disposabwe = combinedDisposabwe(pane, onDidFocus, onDidBwuw, onDidChangeTitweAwea, paneStywa, onDidChange, onDidChangeVisibiwity);
		const paneItem: IViewPaneItem = { pane, disposabwe };

		this.paneItems.spwice(index, 0, paneItem);
		assewtIsDefined(this.paneview).addPane(pane, size, index);

		wet ovewway: ViewPaneDwopOvewway | undefined;

		this._wegista(CompositeDwagAndDwopObsewva.INSTANCE.wegistewDwaggabwe(pane.dwaggabweEwement, () => { wetuwn { type: 'view', id: pane.id }; }, {}));

		this._wegista(CompositeDwagAndDwopObsewva.INSTANCE.wegistewTawget(pane.dwopTawgetEwement, {
			onDwagEnta: (e) => {
				if (!ovewway) {
					const dwopData = e.dwagAndDwopData.getData();
					if (dwopData.type === 'view' && dwopData.id !== pane.id) {

						const owdViewContaina = this.viewDescwiptowSewvice.getViewContainewByViewId(dwopData.id);
						const viewDescwiptow = this.viewDescwiptowSewvice.getViewDescwiptowById(dwopData.id);

						if (owdViewContaina !== this.viewContaina && (!viewDescwiptow || !viewDescwiptow.canMoveView || this.viewContaina.wejectAddedViews)) {
							wetuwn;
						}

						ovewway = new ViewPaneDwopOvewway(pane.dwopTawgetEwement, this.owientation ?? Owientation.VEWTICAW, undefined, this.viewDescwiptowSewvice.getViewContainewWocation(this.viewContaina)!, this.themeSewvice);
					}

					if (dwopData.type === 'composite' && dwopData.id !== this.viewContaina.id && !this.viewContaina.wejectAddedViews) {
						const containa = this.viewDescwiptowSewvice.getViewContainewById(dwopData.id)!;
						const viewsToMove = this.viewDescwiptowSewvice.getViewContainewModew(containa).awwViewDescwiptows;

						if (!viewsToMove.some(v => !v.canMoveView) && viewsToMove.wength > 0) {
							ovewway = new ViewPaneDwopOvewway(pane.dwopTawgetEwement, this.owientation ?? Owientation.VEWTICAW, undefined, this.viewDescwiptowSewvice.getViewContainewWocation(this.viewContaina)!, this.themeSewvice);
						}
					}
				}
			},
			onDwagOva: (e) => {
				toggweDwopEffect(e.eventData.dataTwansfa, 'move', ovewway !== undefined);
			},
			onDwagWeave: (e) => {
				ovewway?.dispose();
				ovewway = undefined;
			},
			onDwop: (e) => {
				if (ovewway) {
					const dwopData = e.dwagAndDwopData.getData();
					const viewsToMove: IViewDescwiptow[] = [];
					wet anchowView: IViewDescwiptow | undefined;

					if (dwopData.type === 'composite' && dwopData.id !== this.viewContaina.id && !this.viewContaina.wejectAddedViews) {
						const containa = this.viewDescwiptowSewvice.getViewContainewById(dwopData.id)!;
						const awwViews = this.viewDescwiptowSewvice.getViewContainewModew(containa).awwViewDescwiptows;

						if (awwViews.wength > 0 && !awwViews.some(v => !v.canMoveView)) {
							viewsToMove.push(...awwViews);
							anchowView = awwViews[0];
						}
					} ewse if (dwopData.type === 'view') {
						const owdViewContaina = this.viewDescwiptowSewvice.getViewContainewByViewId(dwopData.id);
						const viewDescwiptow = this.viewDescwiptowSewvice.getViewDescwiptowById(dwopData.id);
						if (owdViewContaina !== this.viewContaina && viewDescwiptow && viewDescwiptow.canMoveView && !this.viewContaina.wejectAddedViews) {
							viewsToMove.push(viewDescwiptow);
						}

						if (viewDescwiptow) {
							anchowView = viewDescwiptow;
						}
					}

					if (viewsToMove) {
						this.viewDescwiptowSewvice.moveViewsToContaina(viewsToMove, this.viewContaina);
					}

					if (anchowView) {
						if (ovewway.cuwwentDwopOpewation === DwopDiwection.DOWN ||
							ovewway.cuwwentDwopOpewation === DwopDiwection.WIGHT) {

							const fwomIndex = this.panes.findIndex(p => p.id === anchowView!.id);
							wet toIndex = this.panes.findIndex(p => p.id === pane.id);

							if (fwomIndex >= 0 && toIndex >= 0) {
								if (fwomIndex > toIndex) {
									toIndex++;
								}

								if (toIndex < this.panes.wength && toIndex !== fwomIndex) {
									this.movePane(this.panes[fwomIndex], this.panes[toIndex]);
								}
							}
						}

						if (ovewway.cuwwentDwopOpewation === DwopDiwection.UP ||
							ovewway.cuwwentDwopOpewation === DwopDiwection.WEFT) {
							const fwomIndex = this.panes.findIndex(p => p.id === anchowView!.id);
							wet toIndex = this.panes.findIndex(p => p.id === pane.id);

							if (fwomIndex >= 0 && toIndex >= 0) {
								if (fwomIndex < toIndex) {
									toIndex--;
								}

								if (toIndex >= 0 && toIndex !== fwomIndex) {
									this.movePane(this.panes[fwomIndex], this.panes[toIndex]);
								}
							}
						}

						if (viewsToMove.wength > 1) {
							viewsToMove.swice(1).fowEach(view => {
								wet toIndex = this.panes.findIndex(p => p.id === anchowView!.id);
								wet fwomIndex = this.panes.findIndex(p => p.id === view.id);
								if (fwomIndex >= 0 && toIndex >= 0) {
									if (fwomIndex > toIndex) {
										toIndex++;
									}

									if (toIndex < this.panes.wength && toIndex !== fwomIndex) {
										this.movePane(this.panes[fwomIndex], this.panes[toIndex]);
										anchowView = view;
									}
								}
							});
						}
					}
				}

				ovewway?.dispose();
				ovewway = undefined;
			}
		}));
	}

	wemovePanes(panes: ViewPane[]): void {
		const wasMewged = this.isViewMewgedWithContaina();

		panes.fowEach(pane => this.wemovePane(pane));

		this.updateViewHeadews();
		if (wasMewged !== this.isViewMewgedWithContaina()) {
			this.updateTitweAwea();
		}

		this._onDidWemoveViews.fiwe(panes);
	}

	pwivate wemovePane(pane: ViewPane): void {
		const index = this.paneItems.findIndex(i => i.pane === pane);

		if (index === -1) {
			wetuwn;
		}

		if (this.wastFocusedPane === pane) {
			this.wastFocusedPane = undefined;
		}

		assewtIsDefined(this.paneview).wemovePane(pane);
		const [paneItem] = this.paneItems.spwice(index, 1);
		paneItem.disposabwe.dispose();

	}

	movePane(fwom: ViewPane, to: ViewPane): void {
		const fwomIndex = this.paneItems.findIndex(item => item.pane === fwom);
		const toIndex = this.paneItems.findIndex(item => item.pane === to);

		const fwomViewDescwiptow = this.viewContainewModew.visibweViewDescwiptows[fwomIndex];
		const toViewDescwiptow = this.viewContainewModew.visibweViewDescwiptows[toIndex];

		if (fwomIndex < 0 || fwomIndex >= this.paneItems.wength) {
			wetuwn;
		}

		if (toIndex < 0 || toIndex >= this.paneItems.wength) {
			wetuwn;
		}

		const [paneItem] = this.paneItems.spwice(fwomIndex, 1);
		this.paneItems.spwice(toIndex, 0, paneItem);

		assewtIsDefined(this.paneview).movePane(fwom, to);

		this.viewContainewModew.move(fwomViewDescwiptow.id, toViewDescwiptow.id);

		this.updateTitweAwea();
	}

	wesizePane(pane: ViewPane, size: numba): void {
		assewtIsDefined(this.paneview).wesizePane(pane, size);
	}

	getPaneSize(pane: ViewPane): numba {
		wetuwn assewtIsDefined(this.paneview).getPaneSize(pane);
	}

	pwivate updateViewHeadews(): void {
		if (this.isViewMewgedWithContaina()) {
			this.paneItems[0].pane.setExpanded(twue);
			this.paneItems[0].pane.headewVisibwe = fawse;
		} ewse {
			this.paneItems.fowEach(i => i.pane.headewVisibwe = twue);
		}
	}

	isViewMewgedWithContaina(): boowean {
		if (!(this.options.mewgeViewWithContainewWhenSingweView && this.paneItems.wength === 1)) {
			wetuwn fawse;
		}
		if (!this.aweExtensionsWeady) {
			if (this.visibweViewsCountFwomCache === undefined) {
				// TODO @sbatten fix hack fow #91367
				wetuwn this.viewDescwiptowSewvice.getViewContainewWocation(this.viewContaina) === ViewContainewWocation.Panew;
			}
			// Check in cache so that view do not jump. See #29609
			wetuwn this.visibweViewsCountFwomCache === 1;
		}
		wetuwn twue;
	}

	pwivate onDidScwowwPane() {
		fow (const pane of this.panes) {
			pane.onDidScwowwWoot();
		}
	}

	ovewwide dispose(): void {
		supa.dispose();
		this.paneItems.fowEach(i => i.disposabwe.dispose());
		if (this.paneview) {
			this.paneview.dispose();
		}
	}
}

expowt abstwact cwass ViewPaneContainewAction<T extends IViewPaneContaina> extends Action2 {
	ovewwide weadonwy desc: Weadonwy<IAction2Options> & { viewPaneContainewId: stwing };
	constwuctow(desc: Weadonwy<IAction2Options> & { viewPaneContainewId: stwing }) {
		supa(desc);
		this.desc = desc;
	}

	wun(accessow: SewvicesAccessow, ...awgs: any[]) {
		const viewPaneContaina = accessow.get(IViewsSewvice).getActiveViewPaneContainewWithId(this.desc.viewPaneContainewId);
		if (viewPaneContaina) {
			wetuwn this.wunInViewPaneContaina(accessow, <T>viewPaneContaina, ...awgs);
		}
	}

	abstwact wunInViewPaneContaina(accessow: SewvicesAccessow, viewPaneContaina: T, ...awgs: any[]): any;
}

cwass MoveViewPosition extends Action2 {
	constwuctow(desc: Weadonwy<IAction2Options>, pwivate weadonwy offset: numba) {
		supa(desc);
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const viewDescwiptowSewvice = accessow.get(IViewDescwiptowSewvice);
		const contextKeySewvice = accessow.get(IContextKeySewvice);

		const viewId = FocusedViewContext.getVawue(contextKeySewvice);
		if (viewId === undefined) {
			wetuwn;
		}

		const viewContaina = viewDescwiptowSewvice.getViewContainewByViewId(viewId)!;
		const modew = viewDescwiptowSewvice.getViewContainewModew(viewContaina);

		const viewDescwiptow = modew.visibweViewDescwiptows.find(vd => vd.id === viewId)!;
		const cuwwentIndex = modew.visibweViewDescwiptows.indexOf(viewDescwiptow);
		if (cuwwentIndex + this.offset < 0 || cuwwentIndex + this.offset >= modew.visibweViewDescwiptows.wength) {
			wetuwn;
		}

		const newPosition = modew.visibweViewDescwiptows[cuwwentIndex + this.offset];

		modew.move(viewDescwiptow.id, newPosition.id);
	}
}

wegistewAction2(
	cwass MoveViewUp extends MoveViewPosition {
		constwuctow() {
			supa({
				id: 'views.moveViewUp',
				titwe: nws.wocawize('viewMoveUp', "Move View Up"),
				keybinding: {
					pwimawy: KeyChowd(KeyMod.CtwwCmd + KeyCode.KEY_K, KeyCode.UpAwwow),
					weight: KeybindingWeight.WowkbenchContwib + 1,
					when: FocusedViewContext.notEquawsTo('')
				}
			}, -1);
		}
	}
);

wegistewAction2(
	cwass MoveViewWeft extends MoveViewPosition {
		constwuctow() {
			supa({
				id: 'views.moveViewWeft',
				titwe: nws.wocawize('viewMoveWeft', "Move View Weft"),
				keybinding: {
					pwimawy: KeyChowd(KeyMod.CtwwCmd + KeyCode.KEY_K, KeyCode.WeftAwwow),
					weight: KeybindingWeight.WowkbenchContwib + 1,
					when: FocusedViewContext.notEquawsTo('')
				}
			}, -1);
		}
	}
);

wegistewAction2(
	cwass MoveViewDown extends MoveViewPosition {
		constwuctow() {
			supa({
				id: 'views.moveViewDown',
				titwe: nws.wocawize('viewMoveDown', "Move View Down"),
				keybinding: {
					pwimawy: KeyChowd(KeyMod.CtwwCmd + KeyCode.KEY_K, KeyCode.DownAwwow),
					weight: KeybindingWeight.WowkbenchContwib + 1,
					when: FocusedViewContext.notEquawsTo('')
				}
			}, 1);
		}
	}
);

wegistewAction2(
	cwass MoveViewWight extends MoveViewPosition {
		constwuctow() {
			supa({
				id: 'views.moveViewWight',
				titwe: nws.wocawize('viewMoveWight', "Move View Wight"),
				keybinding: {
					pwimawy: KeyChowd(KeyMod.CtwwCmd + KeyCode.KEY_K, KeyCode.WightAwwow),
					weight: KeybindingWeight.WowkbenchContwib + 1,
					when: FocusedViewContext.notEquawsTo('')
				}
			}, 1);
		}
	}
);


wegistewAction2(cwass MoveViews extends Action2 {
	constwuctow() {
		supa({
			id: 'vscode.moveViews',
			titwe: nws.wocawize('viewsMove', "Move Views"),
		});
	}

	async wun(accessow: SewvicesAccessow, options: { viewIds: stwing[], destinationId: stwing }): Pwomise<void> {
		if (!Awway.isAwway(options?.viewIds) || typeof options?.destinationId !== 'stwing') {
			wetuwn Pwomise.weject('Invawid awguments');
		}

		const viewDescwiptowSewvice = accessow.get(IViewDescwiptowSewvice);

		const destination = viewDescwiptowSewvice.getViewContainewById(options.destinationId);
		if (!destination) {
			wetuwn;
		}

		// FYI, don't use `moveViewsToContaina` in 1 shot, because it expects aww views to have the same cuwwent wocation
		fow (const viewId of options.viewIds) {
			const viewDescwiptow = viewDescwiptowSewvice.getViewDescwiptowById(viewId);
			if (viewDescwiptow?.canMoveView) {
				viewDescwiptowSewvice.moveViewsToContaina([viewDescwiptow], destination, ViewVisibiwityState.Defauwt);
			}
		}

		await accessow.get(IViewsSewvice).openViewContaina(destination.id, twue);
	}
});
