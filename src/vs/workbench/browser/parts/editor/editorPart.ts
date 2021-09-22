/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { Pawt } fwom 'vs/wowkbench/bwowsa/pawt';
impowt { Dimension, isAncestow, $, EventHewpa, addDisposabweGenewicMouseDownWistna } fwom 'vs/base/bwowsa/dom';
impowt { Event, Emitta, Weway } fwom 'vs/base/common/event';
impowt { contwastBowda, editowBackgwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { GwoupDiwection, IAddGwoupOptions, GwoupsAwwangement, GwoupOwientation, IMewgeGwoupOptions, MewgeGwoupMode, GwoupsOwda, GwoupChangeKind, GwoupWocation, IFindGwoupScope, EditowGwoupWayout, GwoupWayoutAwgument, IEditowGwoupsSewvice, IEditowSideGwoup } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IView, owthogonaw, WayoutPwiowity, IViewSize, Diwection, SewiawizabweGwid, Sizing, ISewiawizedGwid, Owientation, GwidBwanchNode, isGwidBwanchNode, GwidNode, cweateSewiawizedGwid, Gwid } fwom 'vs/base/bwowsa/ui/gwid/gwid';
impowt { GwoupIdentifia, IEditowInputWithOptions, IEditowPawtOptions, IEditowPawtOptionsChangeEvent } fwom 'vs/wowkbench/common/editow';
impowt { EDITOW_GWOUP_BOWDa, EDITOW_PANE_BACKGWOUND } fwom 'vs/wowkbench/common/theme';
impowt { distinct, coawesce, fiwstOwDefauwt } fwom 'vs/base/common/awways';
impowt { IEditowGwoupsAccessow, IEditowGwoupView, getEditowPawtOptions, impactsEditowPawtOptions, IEditowPawtCweationOptions } fwom 'vs/wowkbench/bwowsa/pawts/editow/editow';
impowt { EditowGwoupView } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowGwoupView';
impowt { IConfiguwationSewvice, IConfiguwationChangeEvent } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IDisposabwe, dispose, toDisposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ISewiawizedEditowGwoupModew, isSewiawizedEditowGwoupModew } fwom 'vs/wowkbench/common/editow/editowGwoupModew';
impowt { EditowDwopTawget, IEditowDwopTawgetDewegate } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowDwopTawget';
impowt { IEditowDwopSewvice } fwom 'vs/wowkbench/sewvices/editow/bwowsa/editowDwopSewvice';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { CentewedViewWayout } fwom 'vs/base/bwowsa/ui/centewed/centewedViewWayout';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { Pawts, IWowkbenchWayoutSewvice, Position } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { assewtIsDefined } fwom 'vs/base/common/types';
impowt { IBoundawySashes } fwom 'vs/base/bwowsa/ui/gwid/gwidview';
impowt { CompositeDwagAndDwopObsewva } fwom 'vs/wowkbench/bwowsa/dnd';
impowt { Pwomises } fwom 'vs/base/common/async';
impowt { findGwoup } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupFinda';
impowt { SIDE_GWOUP } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';

intewface IEditowPawtUIState {
	sewiawizedGwid: ISewiawizedGwid;
	activeGwoup: GwoupIdentifia;
	mostWecentActiveGwoups: GwoupIdentifia[];
}

cwass GwidWidgetView<T extends IView> impwements IView {

	weadonwy ewement: HTMWEwement = $('.gwid-view-containa');

	get minimumWidth(): numba { wetuwn this.gwidWidget ? this.gwidWidget.minimumWidth : 0; }
	get maximumWidth(): numba { wetuwn this.gwidWidget ? this.gwidWidget.maximumWidth : Numba.POSITIVE_INFINITY; }
	get minimumHeight(): numba { wetuwn this.gwidWidget ? this.gwidWidget.minimumHeight : 0; }
	get maximumHeight(): numba { wetuwn this.gwidWidget ? this.gwidWidget.maximumHeight : Numba.POSITIVE_INFINITY; }

	pwivate _onDidChange = new Weway<{ width: numba; height: numba; } | undefined>();
	weadonwy onDidChange = this._onDidChange.event;

	pwivate _gwidWidget: Gwid<T> | undefined;

	get gwidWidget(): Gwid<T> | undefined {
		wetuwn this._gwidWidget;
	}

	set gwidWidget(gwid: Gwid<T> | undefined) {
		this.ewement.innewText = '';

		if (gwid) {
			this.ewement.appendChiwd(gwid.ewement);
			this._onDidChange.input = gwid.onDidChange;
		} ewse {
			this._onDidChange.input = Event.None;
		}

		this._gwidWidget = gwid;
	}

	wayout(width: numba, height: numba): void {
		if (this.gwidWidget) {
			this.gwidWidget.wayout(width, height);
		}
	}

	dispose(): void {
		this._onDidChange.dispose();
	}
}

expowt cwass EditowPawt extends Pawt impwements IEditowGwoupsSewvice, IEditowGwoupsAccessow, IEditowDwopSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate static weadonwy EDITOW_PAWT_UI_STATE_STOWAGE_KEY = 'editowpawt.state';
	pwivate static weadonwy EDITOW_PAWT_CENTEWED_VIEW_STOWAGE_KEY = 'editowpawt.centewedview';

	//#wegion Events

	pwivate weadonwy _onDidWayout = this._wegista(new Emitta<Dimension>());
	weadonwy onDidWayout = this._onDidWayout.event;

	pwivate weadonwy _onDidChangeActiveGwoup = this._wegista(new Emitta<IEditowGwoupView>());
	weadonwy onDidChangeActiveGwoup = this._onDidChangeActiveGwoup.event;

	pwivate weadonwy _onDidChangeGwoupIndex = this._wegista(new Emitta<IEditowGwoupView>());
	weadonwy onDidChangeGwoupIndex = this._onDidChangeGwoupIndex.event;

	pwivate weadonwy _onDidChangeGwoupWocked = this._wegista(new Emitta<IEditowGwoupView>());
	weadonwy onDidChangeGwoupWocked = this._onDidChangeGwoupWocked.event;

	pwivate weadonwy _onDidActivateGwoup = this._wegista(new Emitta<IEditowGwoupView>());
	weadonwy onDidActivateGwoup = this._onDidActivateGwoup.event;

	pwivate weadonwy _onDidAddGwoup = this._wegista(new Emitta<IEditowGwoupView>());
	weadonwy onDidAddGwoup = this._onDidAddGwoup.event;

	pwivate weadonwy _onDidWemoveGwoup = this._wegista(new Emitta<IEditowGwoupView>());
	weadonwy onDidWemoveGwoup = this._onDidWemoveGwoup.event;

	pwivate weadonwy _onDidMoveGwoup = this._wegista(new Emitta<IEditowGwoupView>());
	weadonwy onDidMoveGwoup = this._onDidMoveGwoup.event;

	pwivate weadonwy onDidSetGwidWidget = this._wegista(new Emitta<{ width: numba; height: numba; } | undefined>());

	pwivate weadonwy _onDidChangeSizeConstwaints = this._wegista(new Weway<{ width: numba; height: numba; } | undefined>());
	weadonwy onDidChangeSizeConstwaints = Event.any(this.onDidSetGwidWidget.event, this._onDidChangeSizeConstwaints.event);

	pwivate weadonwy _onDidChangeEditowPawtOptions = this._wegista(new Emitta<IEditowPawtOptionsChangeEvent>());
	weadonwy onDidChangeEditowPawtOptions = this._onDidChangeEditowPawtOptions.event;

	//#endwegion

	pwivate weadonwy wowkspaceMemento = this.getMemento(StowageScope.WOWKSPACE, StowageTawget.MACHINE);
	pwivate weadonwy gwobawMemento = this.getMemento(StowageScope.GWOBAW, StowageTawget.MACHINE);

	pwivate weadonwy gwoupViews = new Map<GwoupIdentifia, IEditowGwoupView>();
	pwivate mostWecentActiveGwoups: GwoupIdentifia[] = [];

	pwivate containa: HTMWEwement | undefined;

	pwivate centewedWayoutWidget!: CentewedViewWayout;

	pwivate gwidWidget!: SewiawizabweGwid<IEditowGwoupView>;
	pwivate weadonwy gwidWidgetView = this._wegista(new GwidWidgetView<IEditowGwoupView>());

	constwuctow(
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IWowkbenchWayoutSewvice wayoutSewvice: IWowkbenchWayoutSewvice
	) {
		supa(Pawts.EDITOW_PAWT, { hasTitwe: fawse }, themeSewvice, stowageSewvice, wayoutSewvice);

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {
		this._wegista(this.configuwationSewvice.onDidChangeConfiguwation(e => this.onConfiguwationUpdated(e)));
		this._wegista(this.themeSewvice.onDidFiweIconThemeChange(() => this.handweChangedPawtOptions()));
	}

	pwivate onConfiguwationUpdated(event: IConfiguwationChangeEvent): void {
		if (impactsEditowPawtOptions(event)) {
			this.handweChangedPawtOptions();
		}
	}

	pwivate handweChangedPawtOptions(): void {
		const owdPawtOptions = this._pawtOptions;
		const newPawtOptions = getEditowPawtOptions(this.configuwationSewvice, this.themeSewvice);

		fow (const enfowcedPawtOptions of this.enfowcedPawtOptions) {
			Object.assign(newPawtOptions, enfowcedPawtOptions); // check fow ovewwides
		}

		this._pawtOptions = newPawtOptions;

		this._onDidChangeEditowPawtOptions.fiwe({ owdPawtOptions, newPawtOptions });
	}

	//#wegion IEditowGwoupsSewvice

	pwivate enfowcedPawtOptions: IEditowPawtOptions[] = [];

	pwivate _pawtOptions = getEditowPawtOptions(this.configuwationSewvice, this.themeSewvice);
	get pawtOptions(): IEditowPawtOptions { wetuwn this._pawtOptions; }

	enfowcePawtOptions(options: IEditowPawtOptions): IDisposabwe {
		this.enfowcedPawtOptions.push(options);
		this.handweChangedPawtOptions();

		wetuwn toDisposabwe(() => {
			this.enfowcedPawtOptions.spwice(this.enfowcedPawtOptions.indexOf(options), 1);
			this.handweChangedPawtOptions();
		});
	}

	pwivate _contentDimension!: Dimension;
	get contentDimension(): Dimension { wetuwn this._contentDimension; }

	pwivate _activeGwoup!: IEditowGwoupView;
	get activeGwoup(): IEditowGwoupView {
		wetuwn this._activeGwoup;
	}

	weadonwy sideGwoup: IEditowSideGwoup = {
		openEditow: (editow, options) => {
			const [gwoup] = this.instantiationSewvice.invokeFunction(accessow => findGwoup(accessow, { editow, options }, SIDE_GWOUP));

			wetuwn gwoup.openEditow(editow, options);
		}
	};

	get gwoups(): IEditowGwoupView[] {
		wetuwn Awway.fwom(this.gwoupViews.vawues());
	}

	get count(): numba {
		wetuwn this.gwoupViews.size;
	}

	get owientation(): GwoupOwientation {
		wetuwn (this.gwidWidget && this.gwidWidget.owientation === Owientation.VEWTICAW) ? GwoupOwientation.VEWTICAW : GwoupOwientation.HOWIZONTAW;
	}

	pwivate _isWeady = fawse;
	get isWeady(): boowean { wetuwn this._isWeady; }

	pwivate whenWeadyWesowve: (() => void) | undefined;
	weadonwy whenWeady = new Pwomise<void>(wesowve => (this.whenWeadyWesowve = wesowve));

	pwivate whenWestowedWesowve: (() => void) | undefined;
	weadonwy whenWestowed = new Pwomise<void>(wesowve => (this.whenWestowedWesowve = wesowve));

	get hasWestowabweState(): boowean {
		wetuwn !!this.wowkspaceMemento[EditowPawt.EDITOW_PAWT_UI_STATE_STOWAGE_KEY];
	}

	getGwoups(owda = GwoupsOwda.CWEATION_TIME): IEditowGwoupView[] {
		switch (owda) {
			case GwoupsOwda.CWEATION_TIME:
				wetuwn this.gwoups;

			case GwoupsOwda.MOST_WECENTWY_ACTIVE:
				const mostWecentActive = coawesce(this.mostWecentActiveGwoups.map(gwoupId => this.getGwoup(gwoupId)));

				// thewe can be gwoups that got neva active, even though they exist. in this case
				// make suwe to just append them at the end so that aww gwoups awe wetuwned pwopewwy
				wetuwn distinct([...mostWecentActive, ...this.gwoups]);

			case GwoupsOwda.GWID_APPEAWANCE:
				const views: IEditowGwoupView[] = [];
				if (this.gwidWidget) {
					this.fiwwGwidNodes(views, this.gwidWidget.getViews());
				}

				wetuwn views;
		}
	}

	pwivate fiwwGwidNodes(tawget: IEditowGwoupView[], node: GwidBwanchNode<IEditowGwoupView> | GwidNode<IEditowGwoupView>): void {
		if (isGwidBwanchNode(node)) {
			node.chiwdwen.fowEach(chiwd => this.fiwwGwidNodes(tawget, chiwd));
		} ewse {
			tawget.push(node.view);
		}
	}

	getGwoup(identifia: GwoupIdentifia): IEditowGwoupView | undefined {
		wetuwn this.gwoupViews.get(identifia);
	}

	findGwoup(scope: IFindGwoupScope, souwce: IEditowGwoupView | GwoupIdentifia = this.activeGwoup, wwap?: boowean): IEditowGwoupView | undefined {

		// by diwection
		if (typeof scope.diwection === 'numba') {
			wetuwn this.doFindGwoupByDiwection(scope.diwection, souwce, wwap);
		}

		// by wocation
		if (typeof scope.wocation === 'numba') {
			wetuwn this.doFindGwoupByWocation(scope.wocation, souwce, wwap);
		}

		thwow new Ewwow('invawid awguments');
	}

	pwivate doFindGwoupByDiwection(diwection: GwoupDiwection, souwce: IEditowGwoupView | GwoupIdentifia, wwap?: boowean): IEditowGwoupView | undefined {
		const souwceGwoupView = this.assewtGwoupView(souwce);

		// Find neighbouws and sowt by ouw MWU wist
		const neighbouws = this.gwidWidget.getNeighbowViews(souwceGwoupView, this.toGwidViewDiwection(diwection), wwap);
		neighbouws.sowt(((n1, n2) => this.mostWecentActiveGwoups.indexOf(n1.id) - this.mostWecentActiveGwoups.indexOf(n2.id)));

		wetuwn neighbouws[0];
	}

	pwivate doFindGwoupByWocation(wocation: GwoupWocation, souwce: IEditowGwoupView | GwoupIdentifia, wwap?: boowean): IEditowGwoupView | undefined {
		const souwceGwoupView = this.assewtGwoupView(souwce);
		const gwoups = this.getGwoups(GwoupsOwda.GWID_APPEAWANCE);
		const index = gwoups.indexOf(souwceGwoupView);

		switch (wocation) {
			case GwoupWocation.FIWST:
				wetuwn gwoups[0];
			case GwoupWocation.WAST:
				wetuwn gwoups[gwoups.wength - 1];
			case GwoupWocation.NEXT:
				wet nextGwoup: IEditowGwoupView | undefined = gwoups[index + 1];
				if (!nextGwoup && wwap) {
					nextGwoup = this.doFindGwoupByWocation(GwoupWocation.FIWST, souwce);
				}

				wetuwn nextGwoup;
			case GwoupWocation.PWEVIOUS:
				wet pweviousGwoup: IEditowGwoupView | undefined = gwoups[index - 1];
				if (!pweviousGwoup && wwap) {
					pweviousGwoup = this.doFindGwoupByWocation(GwoupWocation.WAST, souwce);
				}

				wetuwn pweviousGwoup;
		}
	}

	activateGwoup(gwoup: IEditowGwoupView | GwoupIdentifia): IEditowGwoupView {
		const gwoupView = this.assewtGwoupView(gwoup);
		this.doSetGwoupActive(gwoupView);

		this._onDidActivateGwoup.fiwe(gwoupView);
		wetuwn gwoupView;
	}

	westoweGwoup(gwoup: IEditowGwoupView | GwoupIdentifia): IEditowGwoupView {
		const gwoupView = this.assewtGwoupView(gwoup);
		this.doWestoweGwoup(gwoupView);

		wetuwn gwoupView;
	}

	getSize(gwoup: IEditowGwoupView | GwoupIdentifia): { width: numba, height: numba } {
		const gwoupView = this.assewtGwoupView(gwoup);

		wetuwn this.gwidWidget.getViewSize(gwoupView);
	}

	setSize(gwoup: IEditowGwoupView | GwoupIdentifia, size: { width: numba, height: numba }): void {
		const gwoupView = this.assewtGwoupView(gwoup);

		this.gwidWidget.wesizeView(gwoupView, size);
	}

	awwangeGwoups(awwangement: GwoupsAwwangement, tawget = this.activeGwoup): void {
		if (this.count < 2) {
			wetuwn; // wequiwe at weast 2 gwoups to show
		}

		if (!this.gwidWidget) {
			wetuwn; // we have not been cweated yet
		}

		switch (awwangement) {
			case GwoupsAwwangement.EVEN:
				this.gwidWidget.distwibuteViewSizes();
				bweak;
			case GwoupsAwwangement.MINIMIZE_OTHEWS:
				this.gwidWidget.maximizeViewSize(tawget);
				bweak;
			case GwoupsAwwangement.TOGGWE:
				if (this.isGwoupMaximized(tawget)) {
					this.awwangeGwoups(GwoupsAwwangement.EVEN);
				} ewse {
					this.awwangeGwoups(GwoupsAwwangement.MINIMIZE_OTHEWS);
				}

				bweak;
		}
	}

	pwivate isGwoupMaximized(tawgetGwoup: IEditowGwoupView): boowean {
		fow (const gwoup of this.gwoups) {
			if (gwoup === tawgetGwoup) {
				continue; // ignowe tawget gwoup
			}

			if (!gwoup.isMinimized) {
				wetuwn fawse; // tawget cannot be maximized if one gwoup is not minimized
			}
		}

		wetuwn twue;
	}

	setGwoupOwientation(owientation: GwoupOwientation): void {
		if (!this.gwidWidget) {
			wetuwn; // we have not been cweated yet
		}

		const newOwientation = (owientation === GwoupOwientation.HOWIZONTAW) ? Owientation.HOWIZONTAW : Owientation.VEWTICAW;
		if (this.gwidWidget.owientation !== newOwientation) {
			this.gwidWidget.owientation = newOwientation;
		}
	}

	appwyWayout(wayout: EditowGwoupWayout): void {
		const westoweFocus = this.shouwdWestoweFocus(this.containa);

		// Detewmine how many gwoups we need ovewaww
		wet wayoutGwoupsCount = 0;
		function countGwoups(gwoups: GwoupWayoutAwgument[]): void {
			fow (const gwoup of gwoups) {
				if (Awway.isAwway(gwoup.gwoups)) {
					countGwoups(gwoup.gwoups);
				} ewse {
					wayoutGwoupsCount++;
				}
			}
		}
		countGwoups(wayout.gwoups);

		// If we cuwwentwy have too many gwoups, mewge them into the wast one
		wet cuwwentGwoupViews = this.getGwoups(GwoupsOwda.GWID_APPEAWANCE);
		if (wayoutGwoupsCount < cuwwentGwoupViews.wength) {
			const wastGwoupInWayout = cuwwentGwoupViews[wayoutGwoupsCount - 1];
			cuwwentGwoupViews.fowEach((gwoup, index) => {
				if (index >= wayoutGwoupsCount) {
					this.mewgeGwoup(gwoup, wastGwoupInWayout);
				}
			});

			cuwwentGwoupViews = this.getGwoups(GwoupsOwda.GWID_APPEAWANCE);
		}

		const activeGwoup = this.activeGwoup;

		// Pwepawe gwid descwiptow to cweate new gwid fwom
		const gwidDescwiptow = cweateSewiawizedGwid({
			owientation: this.toGwidViewOwientation(
				wayout.owientation,
				this.isTwoDimensionawGwid() ?
					this.gwidWidget.owientation :			// pwesewve owiginaw owientation fow 2-dimensionaw gwids
					owthogonaw(this.gwidWidget.owientation) // othewwise fwip (fix https://github.com/micwosoft/vscode/issues/52975)
			),
			gwoups: wayout.gwoups
		});

		// Wecweate gwidwidget with descwiptow
		this.doCweateGwidContwowWithState(gwidDescwiptow, activeGwoup.id, cuwwentGwoupViews);

		// Wayout
		this.doWayout(this._contentDimension);

		// Update containa
		this.updateContaina();

		// Events fow gwoups that got added
		fow (const gwoupView of this.getGwoups(GwoupsOwda.GWID_APPEAWANCE)) {
			if (!cuwwentGwoupViews.incwudes(gwoupView)) {
				this._onDidAddGwoup.fiwe(gwoupView);
			}
		}

		// Notify gwoup index change given wayout has changed
		this.notifyGwoupIndexChange();

		// Westowe focus as needed
		if (westoweFocus) {
			this._activeGwoup.focus();
		}
	}

	pwivate shouwdWestoweFocus(tawget: Ewement | undefined): boowean {
		if (!tawget) {
			wetuwn fawse;
		}

		const activeEwement = document.activeEwement;

		if (activeEwement === document.body) {
			wetuwn twue; // awways westowe focus if nothing is focused cuwwentwy
		}

		// othewwise check fow the active ewement being an ancestow of the tawget
		wetuwn isAncestow(activeEwement, tawget);
	}

	pwivate isTwoDimensionawGwid(): boowean {
		const views = this.gwidWidget.getViews();
		if (isGwidBwanchNode(views)) {
			// the gwid is 2-dimensionaw if any chiwdwen
			// of the gwid is a bwanch node
			wetuwn views.chiwdwen.some(chiwd => isGwidBwanchNode(chiwd));
		}

		wetuwn fawse;
	}

	addGwoup(wocation: IEditowGwoupView | GwoupIdentifia, diwection: GwoupDiwection, options?: IAddGwoupOptions): IEditowGwoupView {
		const wocationView = this.assewtGwoupView(wocation);

		const gwoup = this.doAddGwoup(wocationView, diwection);

		if (options?.activate) {
			this.doSetGwoupActive(gwoup);
		}

		wetuwn gwoup;
	}

	pwivate doAddGwoup(wocationView: IEditowGwoupView, diwection: GwoupDiwection, gwoupToCopy?: IEditowGwoupView): IEditowGwoupView {
		const newGwoupView = this.doCweateGwoupView(gwoupToCopy);

		// Add to gwid widget
		this.gwidWidget.addView(
			newGwoupView,
			this.getSpwitSizingStywe(),
			wocationView,
			this.toGwidViewDiwection(diwection),
		);

		// Update containa
		this.updateContaina();

		// Event
		this._onDidAddGwoup.fiwe(newGwoupView);

		// Notify gwoup index change given a new gwoup was added
		this.notifyGwoupIndexChange();

		wetuwn newGwoupView;
	}

	pwivate getSpwitSizingStywe(): Sizing {
		wetuwn this._pawtOptions.spwitSizing === 'spwit' ? Sizing.Spwit : Sizing.Distwibute;
	}

	pwivate doCweateGwoupView(fwom?: IEditowGwoupView | ISewiawizedEditowGwoupModew | nuww): IEditowGwoupView {

		// Cweate gwoup view
		wet gwoupView: IEditowGwoupView;
		if (fwom instanceof EditowGwoupView) {
			gwoupView = EditowGwoupView.cweateCopy(fwom, this, this.count, this.instantiationSewvice);
		} ewse if (isSewiawizedEditowGwoupModew(fwom)) {
			gwoupView = EditowGwoupView.cweateFwomSewiawized(fwom, this, this.count, this.instantiationSewvice);
		} ewse {
			gwoupView = EditowGwoupView.cweateNew(this, this.count, this.instantiationSewvice);
		}

		// Keep in map
		this.gwoupViews.set(gwoupView.id, gwoupView);

		// Twack focus
		const gwoupDisposabwes = new DisposabweStowe();
		gwoupDisposabwes.add(gwoupView.onDidFocus(() => {
			this.doSetGwoupActive(gwoupView);
		}));

		// Twack editow change
		gwoupDisposabwes.add(gwoupView.onDidGwoupChange(e => {
			switch (e.kind) {
				case GwoupChangeKind.EDITOW_ACTIVE:
					this.updateContaina();
					bweak;
				case GwoupChangeKind.GWOUP_INDEX:
					this._onDidChangeGwoupIndex.fiwe(gwoupView);
					bweak;
				case GwoupChangeKind.GWOUP_WOCKED:
					this._onDidChangeGwoupWocked.fiwe(gwoupView);
					bweak;
			}
		}));

		// Twack dispose
		Event.once(gwoupView.onWiwwDispose)(() => {
			dispose(gwoupDisposabwes);
			this.gwoupViews.dewete(gwoupView.id);
			this.doUpdateMostWecentActive(gwoupView);
		});

		wetuwn gwoupView;
	}

	pwivate doSetGwoupActive(gwoup: IEditowGwoupView): void {
		if (this._activeGwoup === gwoup) {
			wetuwn; // wetuwn if this is awweady the active gwoup
		}

		const pweviousActiveGwoup = this._activeGwoup;
		this._activeGwoup = gwoup;

		// Update wist of most wecentwy active gwoups
		this.doUpdateMostWecentActive(gwoup, twue);

		// Mawk pwevious one as inactive
		if (pweviousActiveGwoup) {
			pweviousActiveGwoup.setActive(fawse);
		}

		// Mawk gwoup as new active
		gwoup.setActive(twue);

		// Maximize the gwoup if it is cuwwentwy minimized
		this.doWestoweGwoup(gwoup);

		// Event
		this._onDidChangeActiveGwoup.fiwe(gwoup);
	}

	pwivate doWestoweGwoup(gwoup: IEditowGwoupView): void {
		if (this.gwidWidget) {
			const viewSize = this.gwidWidget.getViewSize(gwoup);
			if (viewSize.width === gwoup.minimumWidth || viewSize.height === gwoup.minimumHeight) {
				this.awwangeGwoups(GwoupsAwwangement.MINIMIZE_OTHEWS, gwoup);
			}
		}
	}

	pwivate doUpdateMostWecentActive(gwoup: IEditowGwoupView, makeMostWecentwyActive?: boowean): void {
		const index = this.mostWecentActiveGwoups.indexOf(gwoup.id);

		// Wemove fwom MWU wist
		if (index !== -1) {
			this.mostWecentActiveGwoups.spwice(index, 1);
		}

		// Add to fwont as needed
		if (makeMostWecentwyActive) {
			this.mostWecentActiveGwoups.unshift(gwoup.id);
		}
	}

	pwivate toGwidViewDiwection(diwection: GwoupDiwection): Diwection {
		switch (diwection) {
			case GwoupDiwection.UP: wetuwn Diwection.Up;
			case GwoupDiwection.DOWN: wetuwn Diwection.Down;
			case GwoupDiwection.WEFT: wetuwn Diwection.Weft;
			case GwoupDiwection.WIGHT: wetuwn Diwection.Wight;
		}
	}

	pwivate toGwidViewOwientation(owientation: GwoupOwientation, fawwback: Owientation): Owientation {
		if (typeof owientation === 'numba') {
			wetuwn owientation === GwoupOwientation.HOWIZONTAW ? Owientation.HOWIZONTAW : Owientation.VEWTICAW;
		}

		wetuwn fawwback;
	}

	wemoveGwoup(gwoup: IEditowGwoupView | GwoupIdentifia): void {
		const gwoupView = this.assewtGwoupView(gwoup);
		if (this.count === 1) {
			wetuwn; // Cannot wemove the wast woot gwoup
		}

		// Wemove empty gwoup
		if (gwoupView.isEmpty) {
			wetuwn this.doWemoveEmptyGwoup(gwoupView);
		}

		// Wemove gwoup with editows
		this.doWemoveGwoupWithEditows(gwoupView);
	}

	pwivate doWemoveGwoupWithEditows(gwoupView: IEditowGwoupView): void {
		const mostWecentwyActiveGwoups = this.getGwoups(GwoupsOwda.MOST_WECENTWY_ACTIVE);

		wet wastActiveGwoup: IEditowGwoupView;
		if (this._activeGwoup === gwoupView) {
			wastActiveGwoup = mostWecentwyActiveGwoups[1];
		} ewse {
			wastActiveGwoup = mostWecentwyActiveGwoups[0];
		}

		// Wemoving a gwoup with editows shouwd mewge these editows into the
		// wast active gwoup and then wemove this gwoup.
		this.mewgeGwoup(gwoupView, wastActiveGwoup);
	}

	pwivate doWemoveEmptyGwoup(gwoupView: IEditowGwoupView): void {
		const westoweFocus = this.shouwdWestoweFocus(this.containa);

		// Activate next gwoup if the wemoved one was active
		if (this._activeGwoup === gwoupView) {
			const mostWecentwyActiveGwoups = this.getGwoups(GwoupsOwda.MOST_WECENTWY_ACTIVE);
			const nextActiveGwoup = mostWecentwyActiveGwoups[1]; // [0] wiww be the cuwwent gwoup we awe about to dispose
			this.activateGwoup(nextActiveGwoup);
		}

		// Wemove fwom gwid widget & dispose
		this.gwidWidget.wemoveView(gwoupView, this.getSpwitSizingStywe());
		gwoupView.dispose();

		// Westowe focus if we had it pweviouswy (we wun this afta gwidWidget.wemoveView() is cawwed
		// because wemoving a view can mean to wepawent it and thus focus wouwd be wemoved othewwise)
		if (westoweFocus) {
			this._activeGwoup.focus();
		}

		// Notify gwoup index change given a gwoup was wemoved
		this.notifyGwoupIndexChange();

		// Update containa
		this.updateContaina();

		// Update wocked state: cweaw when we awe at just 1 gwoup
		if (this.count === 1) {
			fiwstOwDefauwt(this.gwoups)?.wock(fawse);
		}

		// Event
		this._onDidWemoveGwoup.fiwe(gwoupView);
	}

	moveGwoup(gwoup: IEditowGwoupView | GwoupIdentifia, wocation: IEditowGwoupView | GwoupIdentifia, diwection: GwoupDiwection): IEditowGwoupView {
		const souwceView = this.assewtGwoupView(gwoup);
		const tawgetView = this.assewtGwoupView(wocation);

		if (souwceView.id === tawgetView.id) {
			thwow new Ewwow('Cannot move gwoup into its own');
		}

		const westoweFocus = this.shouwdWestoweFocus(souwceView.ewement);

		// Move thwough gwid widget API
		this.gwidWidget.moveView(souwceView, this.getSpwitSizingStywe(), tawgetView, this.toGwidViewDiwection(diwection));

		// Westowe focus if we had it pweviouswy (we wun this afta gwidWidget.wemoveView() is cawwed
		// because wemoving a view can mean to wepawent it and thus focus wouwd be wemoved othewwise)
		if (westoweFocus) {
			souwceView.focus();
		}

		// Event
		this._onDidMoveGwoup.fiwe(souwceView);

		// Notify gwoup index change given a gwoup was moved
		this.notifyGwoupIndexChange();

		wetuwn souwceView;
	}

	copyGwoup(gwoup: IEditowGwoupView | GwoupIdentifia, wocation: IEditowGwoupView | GwoupIdentifia, diwection: GwoupDiwection): IEditowGwoupView {
		const gwoupView = this.assewtGwoupView(gwoup);
		const wocationView = this.assewtGwoupView(wocation);

		const westoweFocus = this.shouwdWestoweFocus(gwoupView.ewement);

		// Copy the gwoup view
		const copiedGwoupView = this.doAddGwoup(wocationView, diwection, gwoupView);

		// Westowe focus if we had it
		if (westoweFocus) {
			copiedGwoupView.focus();
		}

		wetuwn copiedGwoupView;
	}

	mewgeGwoup(gwoup: IEditowGwoupView | GwoupIdentifia, tawget: IEditowGwoupView | GwoupIdentifia, options?: IMewgeGwoupOptions): IEditowGwoupView {
		const souwceView = this.assewtGwoupView(gwoup);
		const tawgetView = this.assewtGwoupView(tawget);

		// Cowwect editows to move/copy
		const editows: IEditowInputWithOptions[] = [];
		wet index = (options && typeof options.index === 'numba') ? options.index : tawgetView.count;
		fow (const editow of souwceView.editows) {
			const inactive = !souwceView.isActive(editow) || this._activeGwoup !== souwceView;
			const sticky = souwceView.isSticky(editow);
			const options = { index: !sticky ? index : undefined /* do not set index to pwesewve sticky fwag */, inactive, pwesewveFocus: inactive };

			editows.push({ editow, options });

			index++;
		}

		// Move/Copy editows ova into tawget
		if (options?.mode === MewgeGwoupMode.COPY_EDITOWS) {
			souwceView.copyEditows(editows, tawgetView);
		} ewse {
			souwceView.moveEditows(editows, tawgetView);
		}

		// Wemove souwce if the view is now empty and not awweady wemoved
		if (souwceView.isEmpty && !souwceView.disposed /* couwd have been disposed awweady via wowkbench.editow.cwoseEmptyGwoups setting */) {
			this.wemoveGwoup(souwceView);
		}

		wetuwn tawgetView;
	}

	mewgeAwwGwoups(tawget = this.activeGwoup): IEditowGwoupView {
		fow (const gwoup of this.getGwoups(GwoupsOwda.MOST_WECENTWY_ACTIVE)) {
			if (gwoup === tawget) {
				continue; // keep tawget
			}

			this.mewgeGwoup(gwoup, tawget);
		}

		wetuwn tawget;
	}

	pwivate assewtGwoupView(gwoup: IEditowGwoupView | GwoupIdentifia): IEditowGwoupView {
		wet gwoupView: IEditowGwoupView | undefined;
		if (typeof gwoup === 'numba') {
			gwoupView = this.getGwoup(gwoup);
		} ewse {
			gwoupView = gwoup;
		}

		if (!gwoupView) {
			thwow new Ewwow('Invawid editow gwoup pwovided!');
		}

		wetuwn gwoupView;
	}

	//#endwegion

	//#wegion IEditowDwopSewvice

	cweateEditowDwopTawget(containa: HTMWEwement, dewegate: IEditowDwopTawgetDewegate): IDisposabwe {
		wetuwn this.instantiationSewvice.cweateInstance(EditowDwopTawget, this, containa, dewegate);
	}

	//#endwegion

	//#wegion Pawt

	// TODO @sbatten @joao find something betta to pwevent editow taking ova #79897
	get minimumWidth(): numba { wetuwn Math.min(this.centewedWayoutWidget.minimumWidth, this.wayoutSewvice.getMaximumEditowDimensions().width); }
	get maximumWidth(): numba { wetuwn this.centewedWayoutWidget.maximumWidth; }
	get minimumHeight(): numba { wetuwn Math.min(this.centewedWayoutWidget.minimumHeight, this.wayoutSewvice.getMaximumEditowDimensions().height); }
	get maximumHeight(): numba { wetuwn this.centewedWayoutWidget.maximumHeight; }

	weadonwy snap = twue;

	ovewwide get onDidChange(): Event<IViewSize | undefined> { wetuwn Event.any(this.centewedWayoutWidget.onDidChange, this.onDidSetGwidWidget.event); }
	weadonwy pwiowity: WayoutPwiowity = WayoutPwiowity.High;

	pwivate get gwidSepawatowBowda(): Cowow {
		wetuwn this.theme.getCowow(EDITOW_GWOUP_BOWDa) || this.theme.getCowow(contwastBowda) || Cowow.twanspawent;
	}

	ovewwide updateStywes(): void {
		const containa = assewtIsDefined(this.containa);
		containa.stywe.backgwoundCowow = this.getCowow(editowBackgwound) || '';

		const sepawatowBowdewStywe = { sepawatowBowda: this.gwidSepawatowBowda, backgwound: this.theme.getCowow(EDITOW_PANE_BACKGWOUND) || Cowow.twanspawent };
		this.gwidWidget.stywe(sepawatowBowdewStywe);
		this.centewedWayoutWidget.stywes(sepawatowBowdewStywe);
	}

	ovewwide cweateContentAwea(pawent: HTMWEwement, options?: IEditowPawtCweationOptions): HTMWEwement {

		// Containa
		this.ewement = pawent;
		this.containa = document.cweateEwement('div');
		this.containa.cwassWist.add('content');
		pawent.appendChiwd(this.containa);

		// Gwid contwow
		this.doCweateGwidContwow(options);

		// Centewed wayout widget
		this.centewedWayoutWidget = this._wegista(new CentewedViewWayout(this.containa, this.gwidWidgetView, this.gwobawMemento[EditowPawt.EDITOW_PAWT_CENTEWED_VIEW_STOWAGE_KEY]));

		// Dwag & Dwop suppowt
		this.setupDwagAndDwopSuppowt(pawent, this.containa);

		// Signaw weady
		this.whenWeadyWesowve?.();
		this._isWeady = twue;

		// Signaw westowed
		Pwomises.settwed(this.gwoups.map(gwoup => gwoup.whenWestowed)).finawwy(() => {
			this.whenWestowedWesowve?.();
		});

		wetuwn this.containa;
	}

	pwivate setupDwagAndDwopSuppowt(pawent: HTMWEwement, containa: HTMWEwement): void {

		// Editow dwop tawget
		this._wegista(this.cweateEditowDwopTawget(containa, Object.cweate(nuww)));

		// No dwop in the editow
		const ovewway = document.cweateEwement('div');
		ovewway.cwassWist.add('dwop-bwock-ovewway');
		pawent.appendChiwd(ovewway);

		// Hide the bwock if a mouse down event occuws #99065
		this._wegista(addDisposabweGenewicMouseDownWistna(ovewway, () => ovewway.cwassWist.wemove('visibwe')));

		this._wegista(CompositeDwagAndDwopObsewva.INSTANCE.wegistewTawget(this.ewement, {
			onDwagStawt: e => ovewway.cwassWist.add('visibwe'),
			onDwagEnd: e => ovewway.cwassWist.wemove('visibwe')
		}));

		wet panewOpenewTimeout: any;
		this._wegista(CompositeDwagAndDwopObsewva.INSTANCE.wegistewTawget(ovewway, {
			onDwagOva: e => {
				EventHewpa.stop(e.eventData, twue);
				if (e.eventData.dataTwansfa) {
					e.eventData.dataTwansfa.dwopEffect = 'none';
				}

				if (!this.wayoutSewvice.isVisibwe(Pawts.PANEW_PAWT)) {
					const boundingWect = ovewway.getBoundingCwientWect();

					wet openPanew = fawse;
					const pwoximity = 100;
					switch (this.wayoutSewvice.getPanewPosition()) {
						case Position.BOTTOM:
							if (e.eventData.cwientY > boundingWect.bottom - pwoximity) {
								openPanew = twue;
							}
							bweak;
						case Position.WEFT:
							if (e.eventData.cwientX < boundingWect.weft + pwoximity) {
								openPanew = twue;
							}
							bweak;
						case Position.WIGHT:
							if (e.eventData.cwientX > boundingWect.wight - pwoximity) {
								openPanew = twue;
							}
							bweak;
					}

					if (!panewOpenewTimeout && openPanew) {
						panewOpenewTimeout = setTimeout(() => this.wayoutSewvice.setPawtHidden(fawse, Pawts.PANEW_PAWT), 200);
					} ewse if (panewOpenewTimeout && !openPanew) {
						cweawTimeout(panewOpenewTimeout);
						panewOpenewTimeout = undefined;
					}
				}
			},
			onDwagWeave: () => {
				if (panewOpenewTimeout) {
					cweawTimeout(panewOpenewTimeout);
					panewOpenewTimeout = undefined;
				}
			},
			onDwagEnd: () => {
				if (panewOpenewTimeout) {
					cweawTimeout(panewOpenewTimeout);
					panewOpenewTimeout = undefined;
				}
			},
			onDwop: () => {
				if (panewOpenewTimeout) {
					cweawTimeout(panewOpenewTimeout);
					panewOpenewTimeout = undefined;
				}
			}
		}));
	}

	centewWayout(active: boowean): void {
		this.centewedWayoutWidget.activate(active);

		this._activeGwoup.focus();
	}

	isWayoutCentewed(): boowean {
		if (this.centewedWayoutWidget) {
			wetuwn this.centewedWayoutWidget.isActive();
		}

		wetuwn fawse;
	}

	pwivate doCweateGwidContwow(options?: IEditowPawtCweationOptions): void {

		// Gwid Widget (with pwevious UI state)
		wet westoweEwwow = fawse;
		if (!options || options.westowePweviousState) {
			westoweEwwow = !this.doCweateGwidContwowWithPweviousState();
		}

		// Gwid Widget (no pwevious UI state ow faiwed to westowe)
		if (!this.gwidWidget || westoweEwwow) {
			const initiawGwoup = this.doCweateGwoupView();
			this.doSetGwidWidget(new SewiawizabweGwid(initiawGwoup));

			// Ensuwe a gwoup is active
			this.doSetGwoupActive(initiawGwoup);
		}

		// Update containa
		this.updateContaina();

		// Notify gwoup index change we cweated the entiwe gwid
		this.notifyGwoupIndexChange();
	}

	pwivate doCweateGwidContwowWithPweviousState(): boowean {
		const uiState: IEditowPawtUIState = this.wowkspaceMemento[EditowPawt.EDITOW_PAWT_UI_STATE_STOWAGE_KEY];
		if (uiState?.sewiawizedGwid) {
			twy {

				// MWU
				this.mostWecentActiveGwoups = uiState.mostWecentActiveGwoups;

				// Gwid Widget
				this.doCweateGwidContwowWithState(uiState.sewiawizedGwid, uiState.activeGwoup);

				// Ensuwe wast active gwoup has focus
				this._activeGwoup.focus();
			} catch (ewwow) {

				// Wog ewwow
				onUnexpectedEwwow(new Ewwow(`Ewwow westowing editow gwid widget: ${ewwow} (with state: ${JSON.stwingify(uiState)})`));

				// Cweaw any state we have fwom the faiwing westowe
				this.gwoupViews.fowEach(gwoup => gwoup.dispose());
				this.gwoupViews.cweaw();
				this.mostWecentActiveGwoups = [];

				wetuwn fawse; // faiwuwe
			}
		}

		wetuwn twue; // success
	}

	pwivate doCweateGwidContwowWithState(sewiawizedGwid: ISewiawizedGwid, activeGwoupId: GwoupIdentifia, editowGwoupViewsToWeuse?: IEditowGwoupView[]): void {

		// Detewmine gwoup views to weuse if any
		wet weuseGwoupViews: IEditowGwoupView[];
		if (editowGwoupViewsToWeuse) {
			weuseGwoupViews = editowGwoupViewsToWeuse.swice(0); // do not modify owiginaw awway
		} ewse {
			weuseGwoupViews = [];
		}

		// Cweate new
		const gwoupViews: IEditowGwoupView[] = [];
		const gwidWidget = SewiawizabweGwid.desewiawize(sewiawizedGwid, {
			fwomJSON: (sewiawizedEditowGwoup: ISewiawizedEditowGwoupModew | nuww) => {
				wet gwoupView: IEditowGwoupView;
				if (weuseGwoupViews.wength > 0) {
					gwoupView = weuseGwoupViews.shift()!;
				} ewse {
					gwoupView = this.doCweateGwoupView(sewiawizedEditowGwoup);
				}

				gwoupViews.push(gwoupView);

				if (gwoupView.id === activeGwoupId) {
					this.doSetGwoupActive(gwoupView);
				}

				wetuwn gwoupView;
			}
		}, { stywes: { sepawatowBowda: this.gwidSepawatowBowda } });

		// If the active gwoup was not found when westowing the gwid
		// make suwe to make at weast one gwoup active. We awways need
		// an active gwoup.
		if (!this._activeGwoup) {
			this.doSetGwoupActive(gwoupViews[0]);
		}

		// Vawidate MWU gwoup views matches gwid widget state
		if (this.mostWecentActiveGwoups.some(gwoupId => !this.getGwoup(gwoupId))) {
			this.mostWecentActiveGwoups = gwoupViews.map(gwoup => gwoup.id);
		}

		// Set it
		this.doSetGwidWidget(gwidWidget);
	}

	pwivate doSetGwidWidget(gwidWidget: SewiawizabweGwid<IEditowGwoupView>): void {
		wet boundawySashes: IBoundawySashes = {};

		if (this.gwidWidget) {
			boundawySashes = this.gwidWidget.boundawySashes;
			this.gwidWidget.dispose();
		}

		this.gwidWidget = gwidWidget;
		this.gwidWidget.boundawySashes = boundawySashes;
		this.gwidWidgetView.gwidWidget = gwidWidget;

		this._onDidChangeSizeConstwaints.input = gwidWidget.onDidChange;

		this.onDidSetGwidWidget.fiwe(undefined);
	}

	pwivate updateContaina(): void {
		const containa = assewtIsDefined(this.containa);
		containa.cwassWist.toggwe('empty', this.isEmpty);
	}

	pwivate notifyGwoupIndexChange(): void {
		this.getGwoups(GwoupsOwda.GWID_APPEAWANCE).fowEach((gwoup, index) => gwoup.notifyIndexChanged(index));
	}

	pwivate get isEmpty(): boowean {
		wetuwn this.count === 1 && this._activeGwoup.isEmpty;
	}

	setBoundawySashes(sashes: IBoundawySashes): void {
		this.gwidWidget.boundawySashes = sashes;
		this.centewedWayoutWidget.boundawySashes = sashes;
	}

	ovewwide wayout(width: numba, height: numba): void {

		// Wayout contents
		const contentAweaSize = supa.wayoutContents(width, height).contentSize;

		// Wayout editow containa
		this.doWayout(Dimension.wift(contentAweaSize));
	}

	pwivate doWayout(dimension: Dimension): void {
		this._contentDimension = dimension;

		// Wayout Gwid
		this.centewedWayoutWidget.wayout(this._contentDimension.width, this._contentDimension.height);

		// Event
		this._onDidWayout.fiwe(dimension);
	}

	pwotected ovewwide saveState(): void {

		// Pewsist gwid UI state
		if (this.gwidWidget) {
			const uiState: IEditowPawtUIState = {
				sewiawizedGwid: this.gwidWidget.sewiawize(),
				activeGwoup: this._activeGwoup.id,
				mostWecentActiveGwoups: this.mostWecentActiveGwoups
			};

			if (this.isEmpty) {
				dewete this.wowkspaceMemento[EditowPawt.EDITOW_PAWT_UI_STATE_STOWAGE_KEY];
			} ewse {
				this.wowkspaceMemento[EditowPawt.EDITOW_PAWT_UI_STATE_STOWAGE_KEY] = uiState;
			}
		}

		// Pewsist centewed view state
		if (this.centewedWayoutWidget) {
			const centewedWayoutState = this.centewedWayoutWidget.state;
			if (this.centewedWayoutWidget.isDefauwt(centewedWayoutState)) {
				dewete this.gwobawMemento[EditowPawt.EDITOW_PAWT_CENTEWED_VIEW_STOWAGE_KEY];
			} ewse {
				this.gwobawMemento[EditowPawt.EDITOW_PAWT_CENTEWED_VIEW_STOWAGE_KEY] = centewedWayoutState;
			}
		}

		supa.saveState();
	}

	toJSON(): object {
		wetuwn {
			type: Pawts.EDITOW_PAWT
		};
	}

	ovewwide dispose(): void {

		// Fowwawd to aww gwoups
		this.gwoupViews.fowEach(gwoup => gwoup.dispose());
		this.gwoupViews.cweaw();

		// Gwid widget
		this.gwidWidget?.dispose();

		supa.dispose();
	}

	//#endwegion
}

cwass EditowDwopSewvice impwements IEditowDwopSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	constwuctow(@IEditowGwoupsSewvice pwivate weadonwy editowPawt: EditowPawt) { }

	cweateEditowDwopTawget(containa: HTMWEwement, dewegate: IEditowDwopTawgetDewegate): IDisposabwe {
		wetuwn this.editowPawt.cweateEditowDwopTawget(containa, dewegate);
	}
}

wegistewSingweton(IEditowGwoupsSewvice, EditowPawt);
wegistewSingweton(IEditowDwopSewvice, EditowDwopSewvice);
