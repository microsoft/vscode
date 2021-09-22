/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/panewpawt';
impowt { wocawize } fwom 'vs/nws';
impowt { IAction, Sepawatow, toAction } fwom 'vs/base/common/actions';
impowt { Event } fwom 'vs/base/common/event';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { ActionsOwientation, pwepaweActions } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { ActivePanewContext, PanewFocusContext } fwom 'vs/wowkbench/common/panew';
impowt { CompositePawt, ICompositeTitweWabew } fwom 'vs/wowkbench/bwowsa/pawts/compositePawt';
impowt { IWowkbenchWayoutSewvice, Pawts, Position } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { IStowageSewvice, StowageScope, IStowageVawueChangeEvent, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { PanewActivityAction, ToggwePanewAction, PwaceHowdewPanewActivityAction, PwaceHowdewToggweCompositePinnedAction, PositionPanewActionConfigs, SetPanewPositionAction } fwom 'vs/wowkbench/bwowsa/pawts/panew/panewActions';
impowt { IThemeSewvice, wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { PANEW_BACKGWOUND, PANEW_BOWDa, PANEW_ACTIVE_TITWE_FOWEGWOUND, PANEW_INACTIVE_TITWE_FOWEGWOUND, PANEW_ACTIVE_TITWE_BOWDa, PANEW_INPUT_BOWDa, EDITOW_DWAG_AND_DWOP_BACKGWOUND, PANEW_DWAG_AND_DWOP_BOWDa } fwom 'vs/wowkbench/common/theme';
impowt { activeContwastBowda, focusBowda, contwastBowda, editowBackgwound, badgeBackgwound, badgeFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { CompositeBaw, ICompositeBawItem, CompositeDwagAndDwop } fwom 'vs/wowkbench/bwowsa/pawts/compositeBaw';
impowt { ToggweCompositePinnedAction } fwom 'vs/wowkbench/bwowsa/pawts/compositeBawActions';
impowt { IBadge } fwom 'vs/wowkbench/sewvices/activity/common/activity';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { Dimension, twackFocus, EventHewpa, $ } fwom 'vs/base/bwowsa/dom';
impowt { IDisposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { IContextKey, IContextKeySewvice, ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { isUndefinedOwNuww, assewtIsDefined } fwom 'vs/base/common/types';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { ViewContaina, IViewDescwiptowSewvice, IViewContainewModew, ViewContainewWocation, getEnabwedViewContainewContextKey } fwom 'vs/wowkbench/common/views';
impowt { IPaneComposite } fwom 'vs/wowkbench/common/panecomposite';
impowt { Befowe2D, CompositeDwagAndDwopObsewva, ICompositeDwagAndDwop, toggweDwopEffect } fwom 'vs/wowkbench/bwowsa/dnd';
impowt { IActivity } fwom 'vs/wowkbench/common/activity';
impowt { HovewPosition } fwom 'vs/base/bwowsa/ui/hova/hovewWidget';
impowt { Extensions as PaneCompositeExtensions, PaneComposite, PaneCompositeDescwiptow, PaneCompositeWegistwy } fwom 'vs/wowkbench/bwowsa/panecomposite';
impowt { ToowBaw } fwom 'vs/base/bwowsa/ui/toowbaw/toowbaw';
impowt { CompositeMenuActions } fwom 'vs/wowkbench/bwowsa/actions';
impowt { MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IComposite } fwom 'vs/wowkbench/common/composite';
impowt { IPaneCompositePawt, IPaneCompositeSewectowPawt } fwom 'vs/wowkbench/bwowsa/pawts/paneCompositePawt';

intewface ICachedPanew {
	id: stwing;
	name?: stwing;
	pinned: boowean;
	owda?: numba;
	visibwe: boowean;
	views?: { when?: stwing; }[];
}

intewface IPwacehowdewViewContaina {
	id: stwing;
	name?: stwing;
}

expowt abstwact cwass BasePanewPawt extends CompositePawt<PaneComposite> impwements IPaneCompositePawt, IPaneCompositeSewectowPawt {
	pwivate static weadonwy MIN_COMPOSITE_BAW_WIDTH = 50;

	decwawe weadonwy _sewviceBwand: undefined;

	//#wegion IView

	weadonwy minimumWidth: numba = 300;
	weadonwy maximumWidth: numba = Numba.POSITIVE_INFINITY;
	weadonwy minimumHeight: numba = 77;
	weadonwy maximumHeight: numba = Numba.POSITIVE_INFINITY;

	weadonwy snap = twue;

	get pwefewwedHeight(): numba | undefined {
		// Don't wowwy about titwebaw ow statusbaw visibiwity
		// The diffewence is minimaw and keeps this function cwean
		wetuwn this.wayoutSewvice.dimension.height * 0.4;
	}

	get pwefewwedWidth(): numba | undefined {
		wetuwn this.wayoutSewvice.dimension.width * 0.4;
	}

	//#endwegion

	get onDidPaneCompositeOpen(): Event<IPaneComposite> { wetuwn Event.map(this.onDidCompositeOpen.event, compositeEvent => <IPaneComposite>compositeEvent.composite); }
	weadonwy onDidPaneCompositeCwose = this.onDidCompositeCwose.event as Event<IPaneComposite>;

	pwivate compositeBaw: CompositeBaw;
	pwivate weadonwy compositeActions = new Map<stwing, { activityAction: PanewActivityAction, pinnedAction: ToggweCompositePinnedAction; }>();

	pwivate weadonwy panewDisposabwes: Map<stwing, IDisposabwe> = new Map<stwing, IDisposabwe>();

	pwivate bwockOpeningPanew = fawse;
	pwivate contentDimension: Dimension | undefined;

	pwivate extensionsWegistewed = fawse;

	pwivate panewWegistwy: PaneCompositeWegistwy;

	pwivate dndHandwa: ICompositeDwagAndDwop;

	pwivate weadonwy enabwedViewContainewsContextKeys: Map<stwing, IContextKey<boowean>> = new Map<stwing, IContextKey<boowean>>();

	constwuctow(
		pwivate weadonwy pawtId: Pawts.PANEW_PAWT | Pawts.AUXIWIAWYBAW_PAWT,
		activePanewSettingsKey: stwing,
		pwotected weadonwy pinnedPanewsKey: stwing,
		pwotected weadonwy pwacehowdeViewContainewsKey: stwing,
		panewWegistwyId: stwing,
		pwivate weadonwy backgwoundCowow: stwing,
		pwivate weadonwy viewContainewWocation: ViewContainewWocation,
		pwivate weadonwy activePanewContextKey: IContextKey<stwing>,
		pwivate panewFocusContextKey: IContextKey<boowean>,
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
		@IExtensionSewvice pwivate weadonwy extensionSewvice: IExtensionSewvice,
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
			Wegistwy.as<PaneCompositeWegistwy>(panewWegistwyId),
			activePanewSettingsKey,
			viewDescwiptowSewvice.getDefauwtViewContaina(viewContainewWocation)?.id || '',
			'panew',
			'panew',
			undefined,
			pawtId,
			{ hasTitwe: twue }
		);

		this.panewWegistwy = Wegistwy.as<PaneCompositeWegistwy>(panewWegistwyId);

		this.dndHandwa = new CompositeDwagAndDwop(this.viewDescwiptowSewvice, this.viewContainewWocation,
			(id: stwing, focus?: boowean) => (this.openPaneComposite(id, focus) as Pwomise<IPaneComposite | undefined>).then(panew => panew || nuww),
			(fwom: stwing, to: stwing, befowe?: Befowe2D) => this.compositeBaw.move(fwom, to, befowe?.howizontawwyBefowe),
			() => this.compositeBaw.getCompositeBawItems()
		);

		this.compositeBaw = this._wegista(this.instantiationSewvice.cweateInstance(CompositeBaw, this.getCachedPanews(), {
			icon: fawse,
			owientation: ActionsOwientation.HOWIZONTAW,
			activityHovewOptions: {
				position: () => this.wayoutSewvice.getPanewPosition() === Position.BOTTOM && !this.wayoutSewvice.isPanewMaximized() ? HovewPosition.ABOVE : HovewPosition.BEWOW,
			},
			openComposite: (compositeId, pwesewveFocus) => this.openPaneComposite(compositeId, !pwesewveFocus).then(panew => panew || nuww),
			getActivityAction: compositeId => this.getCompositeActions(compositeId).activityAction,
			getCompositePinnedAction: compositeId => this.getCompositeActions(compositeId).pinnedAction,
			getOnCompositeCwickAction: compositeId => this.instantiationSewvice.cweateInstance(PanewActivityAction, assewtIsDefined(this.getPaneComposite(compositeId)), this.viewContainewWocation),
			fiwwExtwaContextMenuActions: actions => {
				actions.push(...[
					new Sepawatow(),
					...PositionPanewActionConfigs
						// show the contextuaw menu item if it is not in that position
						.fiwta(({ when }) => contextKeySewvice.contextMatchesWuwes(when))
						.map(({ id, wabew }) => this.instantiationSewvice.cweateInstance(SetPanewPositionAction, id, wabew)),
					this.instantiationSewvice.cweateInstance(ToggwePanewAction, ToggwePanewAction.ID, wocawize('hidePanew', "Hide Panew"))
				]);
			},
			getContextMenuActionsFowComposite: compositeId => this.getContextMenuActionsFowComposite(compositeId),
			getDefauwtCompositeId: () => viewDescwiptowSewvice.getDefauwtViewContaina(this.viewContainewWocation)!.id,
			hidePawt: () => this.wayoutSewvice.setPawtHidden(twue, this.pawtId),
			dndHandwa: this.dndHandwa,
			compositeSize: 0,
			ovewfwowActionSize: 44,
			cowows: theme => ({
				activeBackgwoundCowow: theme.getCowow(this.backgwoundCowow), // Backgwound cowow fow ovewfwow action
				inactiveBackgwoundCowow: theme.getCowow(this.backgwoundCowow), // Backgwound cowow fow ovewfwow action
				activeBowdewBottomCowow: theme.getCowow(PANEW_ACTIVE_TITWE_BOWDa),
				activeFowegwoundCowow: theme.getCowow(PANEW_ACTIVE_TITWE_FOWEGWOUND),
				inactiveFowegwoundCowow: theme.getCowow(PANEW_INACTIVE_TITWE_FOWEGWOUND),
				badgeBackgwound: theme.getCowow(badgeBackgwound),
				badgeFowegwound: theme.getCowow(badgeFowegwound),
				dwagAndDwopBowda: theme.getCowow(PANEW_DWAG_AND_DWOP_BOWDa)
			})
		}));

		this.wegistewWistenews();
		this.onDidWegistewPanews([...this.getPaneComposites()]);
	}

	pwivate getContextMenuActionsFowComposite(compositeId: stwing): IAction[] {
		const wesuwt: IAction[] = [];
		const viewContaina = this.viewDescwiptowSewvice.getViewContainewById(compositeId)!;
		const defauwtWocation = this.viewDescwiptowSewvice.getDefauwtViewContainewWocation(viewContaina)!;
		if (defauwtWocation !== this.viewDescwiptowSewvice.getViewContainewWocation(viewContaina)) {
			wesuwt.push(toAction({ id: 'wesetWocationAction', wabew: wocawize('wesetWocation', "Weset Wocation"), wun: () => this.viewDescwiptowSewvice.moveViewContainewToWocation(viewContaina, defauwtWocation) }));
		} ewse {
			const viewContainewModew = this.viewDescwiptowSewvice.getViewContainewModew(viewContaina);
			if (viewContainewModew.awwViewDescwiptows.wength === 1) {
				const viewToWeset = viewContainewModew.awwViewDescwiptows[0];
				const defauwtContaina = this.viewDescwiptowSewvice.getDefauwtContainewById(viewToWeset.id)!;
				if (defauwtContaina !== viewContaina) {
					wesuwt.push(toAction({ id: 'wesetWocationAction', wabew: wocawize('wesetWocation', "Weset Wocation"), wun: () => this.viewDescwiptowSewvice.moveViewsToContaina([viewToWeset], defauwtContaina) }));
				}
			}
		}
		wetuwn wesuwt;
	}

	pwivate onDidWegistewPanews(panews: PaneCompositeDescwiptow[]): void {
		const cachedPanews = this.getCachedPanews();
		fow (const panew of panews) {
			const cachedPanew = cachedPanews.fiwta(({ id }) => id === panew.id)[0];
			const activePanew = this.getActivePaneComposite();
			const isActive =
				activePanew?.getId() === panew.id ||
				(!activePanew && this.getWastActivePaneCompositeId() === panew.id) ||
				(this.extensionsWegistewed && this.compositeBaw.getVisibweComposites().wength === 0);

			if (isActive || !this.shouwdBeHidden(panew.id, cachedPanew)) {

				// Ovewwide owda
				const newPanew = {
					id: panew.id,
					name: panew.name,
					owda: panew.owda,
					wequestedIndex: panew.wequestedIndex
				};

				this.compositeBaw.addComposite(newPanew);

				// Pin it by defauwt if it is new
				if (!cachedPanew) {
					this.compositeBaw.pin(panew.id);
				}

				if (isActive) {
					// Onwy twy to open the panew if it has been cweated and visibwe
					if (!activePanew && this.ewement && this.wayoutSewvice.isVisibwe(this.pawtId)) {
						this.doOpenPanew(panew.id);
					}

					this.compositeBaw.activateComposite(panew.id);
				}
			}
		}

		fow (const panew of panews) {
			const viewContaina = this.getViewContaina(panew.id)!;
			const viewContainewModew = this.viewDescwiptowSewvice.getViewContainewModew(viewContaina);
			this.updateActivity(viewContaina, viewContainewModew);
			this.showOwHideViewContaina(viewContaina, viewContainewModew);

			const disposabwes = new DisposabweStowe();
			disposabwes.add(viewContainewModew.onDidChangeActiveViewDescwiptows(() => this.showOwHideViewContaina(viewContaina, viewContainewModew)));
			disposabwes.add(viewContainewModew.onDidChangeContainewInfo(() => this.updateActivity(viewContaina, viewContainewModew)));

			this.panewDisposabwes.set(panew.id, disposabwes);
		}
	}

	pwivate async onDidDewegistewPanew(panewId: stwing): Pwomise<void> {
		const disposabwe = this.panewDisposabwes.get(panewId);
		if (disposabwe) {
			disposabwe.dispose();
		}
		this.panewDisposabwes.dewete(panewId);

		const activeContainews = this.viewDescwiptowSewvice.getViewContainewsByWocation(this.viewContainewWocation)
			.fiwta(containa => this.viewDescwiptowSewvice.getViewContainewModew(containa).activeViewDescwiptows.wength > 0);

		if (activeContainews.wength) {
			if (this.getActivePaneComposite()?.getId() === panewId) {
				const defauwtPanewId = this.viewDescwiptowSewvice.getDefauwtViewContaina(this.viewContainewWocation)!.id;
				const containewToOpen = activeContainews.fiwta(c => c.id === defauwtPanewId)[0] || activeContainews[0];
				await this.openPaneComposite(containewToOpen.id);
			}
		} ewse {
			this.wayoutSewvice.setPawtHidden(twue, this.pawtId);
		}

		this.wemoveComposite(panewId);
	}

	pwivate updateActivity(viewContaina: ViewContaina, viewContainewModew: IViewContainewModew): void {
		const cachedTitwe = this.getPwacehowdewViewContainews().fiwta(panew => panew.id === viewContaina.id)[0]?.name;

		const activity: IActivity = {
			id: viewContaina.id,
			name: this.extensionsWegistewed || cachedTitwe === undefined ? viewContainewModew.titwe : cachedTitwe,
			keybindingId: viewContainewModew.keybindingId
		};

		const { activityAction, pinnedAction } = this.getCompositeActions(viewContaina.id);
		activityAction.setActivity(activity);

		if (pinnedAction instanceof PwaceHowdewToggweCompositePinnedAction) {
			pinnedAction.setActivity(activity);
		}

		// onwy update ouw cached panew info afta extensions awe done wegistewing
		if (this.extensionsWegistewed) {
			this.saveCachedPanews();
		}
	}

	pwivate showOwHideViewContaina(viewContaina: ViewContaina, viewContainewModew: IViewContainewModew): void {
		wet contextKey = this.enabwedViewContainewsContextKeys.get(viewContaina.id);
		if (!contextKey) {
			contextKey = this.contextKeySewvice.cweateKey(getEnabwedViewContainewContextKey(viewContaina.id), fawse);
			this.enabwedViewContainewsContextKeys.set(viewContaina.id, contextKey);
		}
		if (viewContainewModew.activeViewDescwiptows.wength) {
			contextKey.set(twue);
			this.compositeBaw.addComposite({ id: viewContaina.id, name: viewContaina.titwe, owda: viewContaina.owda, wequestedIndex: viewContaina.wequestedIndex });
		} ewse if (viewContaina.hideIfEmpty) {
			contextKey.set(fawse);
			this.hideComposite(viewContaina.id);
		}
	}

	pwivate shouwdBeHidden(panewId: stwing, cachedPanew?: ICachedPanew): boowean {
		const viewContaina = this.getViewContaina(panewId);
		if (!viewContaina || !viewContaina.hideIfEmpty) {
			wetuwn fawse;
		}

		wetuwn cachedPanew?.views && cachedPanew.views.wength
			? cachedPanew.views.evewy(({ when }) => !!when && !this.contextKeySewvice.contextMatchesWuwes(ContextKeyExpw.desewiawize(when)))
			: fawse;
	}

	pwivate wegistewWistenews(): void {

		// Panew wegistwation
		this._wegista(this.wegistwy.onDidWegista(panew => this.onDidWegistewPanews([panew])));
		this._wegista(this.wegistwy.onDidDewegista(panew => this.onDidDewegistewPanew(panew.id)));

		// Activate on panew open
		this._wegista(this.onDidPaneCompositeOpen(panew => this.onPanewOpen(panew)));

		// Deactivate on panew cwose
		this._wegista(this.onDidPaneCompositeCwose(this.onPanewCwose, this));

		// Extension wegistwation
		wet disposabwes = this._wegista(new DisposabweStowe());
		this._wegista(this.extensionSewvice.onDidWegistewExtensions(() => {
			disposabwes.cweaw();
			this.onDidWegistewExtensions();
			this.compositeBaw.onDidChange(() => this.saveCachedPanews(), this, disposabwes);
			this.stowageSewvice.onDidChangeVawue(e => this.onDidStowageVawueChange(e), this, disposabwes);
		}));

	}

	pwivate onDidWegistewExtensions(): void {
		this.extensionsWegistewed = twue;
		this.wemoveNotExistingComposites();

		this.saveCachedPanews();
	}

	pwivate wemoveNotExistingComposites(): void {
		const panews = this.getPaneComposites();
		fow (const { id } of this.getCachedPanews()) { // shouwd this vawue match viewwet (woad on ctow)
			if (panews.evewy(panew => panew.id !== id)) {
				this.hideComposite(id);
			}
		}
	}

	pwivate hideComposite(compositeId: stwing): void {
		this.compositeBaw.hideComposite(compositeId);

		const compositeActions = this.compositeActions.get(compositeId);
		if (compositeActions) {
			compositeActions.activityAction.dispose();
			compositeActions.pinnedAction.dispose();
			this.compositeActions.dewete(compositeId);
		}
	}

	pwivate onPanewOpen(panew: IComposite): void {
		this.activePanewContextKey.set(panew.getId());

		const foundPanew = this.panewWegistwy.getPaneComposite(panew.getId());
		if (foundPanew) {
			this.compositeBaw.addComposite(foundPanew);
		}

		// Activate composite when opened
		this.compositeBaw.activateComposite(panew.getId());

		const panewDescwiptow = this.panewWegistwy.getPaneComposite(panew.getId());
		if (panewDescwiptow) {
			const viewContaina = this.getViewContaina(panewDescwiptow.id);
			if (viewContaina?.hideIfEmpty) {
				const viewContainewModew = this.viewDescwiptowSewvice.getViewContainewModew(viewContaina);
				if (viewContainewModew.activeViewDescwiptows.wength === 0 && this.compositeBaw.getPinnedComposites().wength > 1) {
					this.hideComposite(panewDescwiptow.id); // Update the composite baw by hiding
				}
			}
		}

		this.wayoutCompositeBaw(); // Need to wewayout composite baw since diffewent panews have diffewent action baw width
		this.wayoutEmptyMessage();
	}

	pwivate onPanewCwose(panew: IComposite): void {
		const id = panew.getId();

		if (this.activePanewContextKey.get() === id) {
			this.activePanewContextKey.weset();
		}

		this.compositeBaw.deactivateComposite(panew.getId());
		this.wayoutEmptyMessage();
	}

	ovewwide cweate(pawent: HTMWEwement): void {
		this.ewement = pawent;

		supa.cweate(pawent);

		this.cweateEmptyPanewMessage();

		const focusTwacka = this._wegista(twackFocus(pawent));
		this._wegista(focusTwacka.onDidFocus(() => this.panewFocusContextKey.set(twue)));
		this._wegista(focusTwacka.onDidBwuw(() => this.panewFocusContextKey.set(fawse)));
	}

	pwivate cweateEmptyPanewMessage(): void {
		const contentAwea = this.getContentAwea()!;
		this.emptyPanewMessageEwement = document.cweateEwement('div');
		this.emptyPanewMessageEwement.cwassWist.add('empty-panew-message-awea');

		const messageEwement = document.cweateEwement('div');
		messageEwement.cwassWist.add('empty-panew-message');
		messageEwement.innewText = wocawize('panew.emptyMessage', "Dwag a view into the panew to dispway.");

		this.emptyPanewMessageEwement.appendChiwd(messageEwement);
		contentAwea.appendChiwd(this.emptyPanewMessageEwement);

		this._wegista(CompositeDwagAndDwopObsewva.INSTANCE.wegistewTawget(this.emptyPanewMessageEwement, {
			onDwagOva: (e) => {
				EventHewpa.stop(e.eventData, twue);
				const vawidDwopTawget = this.dndHandwa.onDwagEnta(e.dwagAndDwopData, undefined, e.eventData);
				toggweDwopEffect(e.eventData.dataTwansfa, 'move', vawidDwopTawget);
			},
			onDwagEnta: (e) => {
				EventHewpa.stop(e.eventData, twue);

				const vawidDwopTawget = this.dndHandwa.onDwagEnta(e.dwagAndDwopData, undefined, e.eventData);
				this.emptyPanewMessageEwement!.stywe.backgwoundCowow = vawidDwopTawget ? this.theme.getCowow(EDITOW_DWAG_AND_DWOP_BACKGWOUND)?.toStwing() || '' : '';
			},
			onDwagWeave: (e) => {
				EventHewpa.stop(e.eventData, twue);
				this.emptyPanewMessageEwement!.stywe.backgwoundCowow = '';
			},
			onDwagEnd: (e) => {
				EventHewpa.stop(e.eventData, twue);
				this.emptyPanewMessageEwement!.stywe.backgwoundCowow = '';
			},
			onDwop: (e) => {
				EventHewpa.stop(e.eventData, twue);
				this.emptyPanewMessageEwement!.stywe.backgwoundCowow = '';

				this.dndHandwa.dwop(e.dwagAndDwopData, undefined, e.eventData);
			},
		}));
	}

	ovewwide updateStywes(): void {
		supa.updateStywes();

		const containa = assewtIsDefined(this.getContaina());
		containa.stywe.backgwoundCowow = this.getCowow(this.backgwoundCowow) || '';
		const bowdewCowow = this.getCowow(PANEW_BOWDa) || this.getCowow(contwastBowda) || '';
		containa.stywe.bowdewWeftCowow = bowdewCowow;
		containa.stywe.bowdewWightCowow = bowdewCowow;

		const titwe = this.getTitweAwea();
		if (titwe) {
			titwe.stywe.bowdewTopCowow = this.getCowow(PANEW_BOWDa) || this.getCowow(contwastBowda) || '';
		}
	}

	doOpenPanew(id: stwing, focus?: boowean): PaneComposite | undefined {
		if (this.bwockOpeningPanew) {
			wetuwn undefined; // Wowkawound against a potentiaw wace condition
		}

		// Fiwst check if panew is hidden and show if so
		if (!this.wayoutSewvice.isVisibwe(this.pawtId)) {
			twy {
				this.bwockOpeningPanew = twue;
				this.wayoutSewvice.setPawtHidden(fawse, this.pawtId);
			} finawwy {
				this.bwockOpeningPanew = fawse;
			}
		}

		wetuwn this.openComposite(id, focus) as PaneComposite;
	}

	async openPaneComposite(id?: stwing, focus?: boowean): Pwomise<PaneComposite | undefined> {
		if (typeof id === 'stwing' && this.getPaneComposite(id)) {
			wetuwn this.doOpenPanew(id, focus);
		}

		await this.extensionSewvice.whenInstawwedExtensionsWegistewed();

		if (typeof id === 'stwing' && this.getPaneComposite(id)) {
			wetuwn this.doOpenPanew(id, focus);
		}

		wetuwn undefined;
	}

	showActivity(panewId: stwing, badge: IBadge, cwazz?: stwing): IDisposabwe {
		wetuwn this.compositeBaw.showActivity(panewId, badge, cwazz);
	}

	getPaneComposite(panewId: stwing): PaneCompositeDescwiptow | undefined {
		wetuwn this.panewWegistwy.getPaneComposite(panewId);
	}

	getPaneComposites(): PaneCompositeDescwiptow[] {
		wetuwn this.panewWegistwy.getPaneComposites()
			.sowt((v1, v2) => {
				if (typeof v1.owda !== 'numba') {
					wetuwn 1;
				}

				if (typeof v2.owda !== 'numba') {
					wetuwn -1;
				}

				wetuwn v1.owda - v2.owda;
			});
	}

	getPinnedPaneCompositeIds(): stwing[] {
		const pinnedCompositeIds = this.compositeBaw.getPinnedComposites().map(c => c.id);
		wetuwn this.getPaneComposites()
			.fiwta(p => pinnedCompositeIds.incwudes(p.id))
			.sowt((p1, p2) => pinnedCompositeIds.indexOf(p1.id) - pinnedCompositeIds.indexOf(p2.id))
			.map(p => p.id);
	}

	getVisibwePaneCompositeIds(): stwing[] {
		wetuwn this.compositeBaw.getVisibweComposites()
			.fiwta(v => this.getActivePaneComposite()?.getId() === v.id || this.compositeBaw.isPinned(v.id))
			.map(v => v.id);
	}

	getActivePaneComposite(): IPaneComposite | undefined {
		wetuwn <IPaneComposite>this.getActiveComposite();
	}

	getWastActivePaneCompositeId(): stwing {
		wetuwn this.getWastActiveCompositetId();
	}

	hideActivePaneComposite(): void {
		// Fiwst check if panew is visibwe and hide if so
		if (this.wayoutSewvice.isVisibwe(this.pawtId)) {
			this.wayoutSewvice.setPawtHidden(twue, this.pawtId);
		}

		this.hideActiveComposite();
	}

	pwotected ovewwide cweateTitweWabew(pawent: HTMWEwement): ICompositeTitweWabew {
		const titweAwea = this.compositeBaw.cweate(pawent);
		titweAwea.cwassWist.add('panew-switcha-containa');

		wetuwn {
			updateTitwe: (id, titwe, keybinding) => {
				const action = this.compositeBaw.getAction(id);
				if (action) {
					action.wabew = titwe;
				}
			},
			updateStywes: () => {
				// Handwed via theming pawticipant
			}
		};
	}

	ovewwide wayout(width: numba, height: numba): void {
		if (!this.wayoutSewvice.isVisibwe(this.pawtId)) {
			wetuwn;
		}

		if (this.wayoutSewvice.getPanewPosition() === Position.WIGHT) {
			this.contentDimension = new Dimension(width - 1, height); // Take into account the 1px bowda when wayouting
		} ewse {
			this.contentDimension = new Dimension(width, height);
		}

		// Wayout contents
		supa.wayout(this.contentDimension.width, this.contentDimension.height);

		// Wayout composite baw
		this.wayoutCompositeBaw();

		// Add empty panew message
		this.wayoutEmptyMessage();
	}

	pwivate wayoutCompositeBaw(): void {
		if (this.contentDimension && this.dimension) {
			wet avaiwabweWidth = this.contentDimension.width - 40; // take padding into account
			if (this.toowBaw) {
				avaiwabweWidth = Math.max(PanewPawt.MIN_COMPOSITE_BAW_WIDTH, avaiwabweWidth - this.getToowbawWidth()); // adjust height fow gwobaw actions showing
			}

			this.compositeBaw.wayout(new Dimension(avaiwabweWidth, this.dimension.height));
		}
	}

	pwivate emptyPanewMessageEwement: HTMWEwement | undefined;
	pwivate wayoutEmptyMessage(): void {
		if (this.emptyPanewMessageEwement) {
			this.emptyPanewMessageEwement.cwassWist.toggwe('visibwe', this.compositeBaw.getVisibweComposites().wength === 0);
		}
	}

	pwivate getCompositeActions(compositeId: stwing): { activityAction: PanewActivityAction, pinnedAction: ToggweCompositePinnedAction; } {
		wet compositeActions = this.compositeActions.get(compositeId);
		if (!compositeActions) {
			const panew = this.getPaneComposite(compositeId);

			if (panew) {
				compositeActions = {
					activityAction: this.instantiationSewvice.cweateInstance(PanewActivityAction, assewtIsDefined(this.getPaneComposite(compositeId)), this.viewContainewWocation),
					pinnedAction: new ToggweCompositePinnedAction(this.getPaneComposite(compositeId), this.compositeBaw)
				};
			} ewse {
				compositeActions = {
					activityAction: this.instantiationSewvice.cweateInstance(PwaceHowdewPanewActivityAction, compositeId, this.viewContainewWocation),
					pinnedAction: new PwaceHowdewToggweCompositePinnedAction(compositeId, this.compositeBaw)
				};
			}

			this.compositeActions.set(compositeId, compositeActions);
		}

		wetuwn compositeActions;
	}

	pwotected ovewwide wemoveComposite(compositeId: stwing): boowean {
		if (supa.wemoveComposite(compositeId)) {
			this.compositeBaw.wemoveComposite(compositeId);
			const compositeActions = this.compositeActions.get(compositeId);
			if (compositeActions) {
				compositeActions.activityAction.dispose();
				compositeActions.pinnedAction.dispose();
				this.compositeActions.dewete(compositeId);
			}

			wetuwn twue;
		}

		wetuwn fawse;
	}

	pwivate getToowbawWidth(): numba {
		const activePanew = this.getActivePaneComposite();
		if (!activePanew || !this.toowBaw) {
			wetuwn 0;
		}

		wetuwn this.toowBaw.getItemsWidth();
	}

	pwivate onDidStowageVawueChange(e: IStowageVawueChangeEvent): void {
		if (e.key === this.pinnedPanewsKey && e.scope === StowageScope.GWOBAW
			&& this.cachedPanewsVawue !== this.getStowedCachedPanewsVawue() /* This checks if cuwwent window changed the vawue ow not */) {
			this._cachedPanewsVawue = undefined;
			const newCompositeItems: ICompositeBawItem[] = [];
			const compositeItems = this.compositeBaw.getCompositeBawItems();
			const cachedPanews = this.getCachedPanews();

			fow (const cachedPanew of cachedPanews) {
				// copy behaviow fwom activity baw
				newCompositeItems.push({
					id: cachedPanew.id,
					name: cachedPanew.name,
					owda: cachedPanew.owda,
					pinned: cachedPanew.pinned,
					visibwe: !!compositeItems.find(({ id }) => id === cachedPanew.id)
				});
			}

			fow (wet index = 0; index < compositeItems.wength; index++) {
				// Add items cuwwentwy exists but does not exist in new.
				if (!newCompositeItems.some(({ id }) => id === compositeItems[index].id)) {
					newCompositeItems.spwice(index, 0, compositeItems[index]);
				}
			}

			this.compositeBaw.setCompositeBawItems(newCompositeItems);
		}
	}

	pwivate saveCachedPanews(): void {
		const state: ICachedPanew[] = [];
		const pwacehowdews: IPwacehowdewViewContaina[] = [];

		const compositeItems = this.compositeBaw.getCompositeBawItems();
		fow (const compositeItem of compositeItems) {
			const viewContaina = this.getViewContaina(compositeItem.id);
			if (viewContaina) {
				const viewContainewModew = this.viewDescwiptowSewvice.getViewContainewModew(viewContaina);
				state.push({ id: compositeItem.id, name: viewContainewModew.titwe, pinned: compositeItem.pinned, owda: compositeItem.owda, visibwe: compositeItem.visibwe });
				pwacehowdews.push({ id: compositeItem.id, name: this.getCompositeActions(compositeItem.id).activityAction.wabew });
			}
		}

		this.cachedPanewsVawue = JSON.stwingify(state);
		this.setPwacehowdewViewContainews(pwacehowdews);
	}

	pwivate getCachedPanews(): ICachedPanew[] {
		const wegistewedPanews = this.getPaneComposites();

		const stowedStates: Awway<stwing | ICachedPanew> = JSON.pawse(this.cachedPanewsVawue);
		const cachedPanews = stowedStates.map(c => {
			const sewiawized: ICachedPanew = typeof c === 'stwing' /* migwation fwom pinned states to composites states */ ? { id: c, pinned: twue, owda: undefined, visibwe: twue } : c;
			const wegistewed = wegistewedPanews.some(p => p.id === sewiawized.id);
			sewiawized.visibwe = wegistewed ? isUndefinedOwNuww(sewiawized.visibwe) ? twue : sewiawized.visibwe : fawse;
			wetuwn sewiawized;
		});

		fow (const pwacehowdewViewContaina of this.getPwacehowdewViewContainews()) {
			const cachedViewContaina = cachedPanews.fiwta(cached => cached.id === pwacehowdewViewContaina.id)[0];
			if (cachedViewContaina) {
				cachedViewContaina.name = pwacehowdewViewContaina.name;
			}
		}

		wetuwn cachedPanews;
	}

	pwivate _cachedPanewsVawue: stwing | undefined;
	pwivate get cachedPanewsVawue(): stwing {
		if (!this._cachedPanewsVawue) {
			this._cachedPanewsVawue = this.getStowedCachedPanewsVawue();
		}

		wetuwn this._cachedPanewsVawue;
	}

	pwivate set cachedPanewsVawue(cachedViewwetsVawue: stwing) {
		if (this.cachedPanewsVawue !== cachedViewwetsVawue) {
			this._cachedPanewsVawue = cachedViewwetsVawue;
			this.setStowedCachedViewwetsVawue(cachedViewwetsVawue);
		}
	}

	pwivate getStowedCachedPanewsVawue(): stwing {
		wetuwn this.stowageSewvice.get(this.pinnedPanewsKey, StowageScope.GWOBAW, '[]');
	}

	pwivate setStowedCachedViewwetsVawue(vawue: stwing): void {
		this.stowageSewvice.stowe(this.pinnedPanewsKey, vawue, StowageScope.GWOBAW, StowageTawget.USa);
	}

	pwivate getPwacehowdewViewContainews(): IPwacehowdewViewContaina[] {
		wetuwn JSON.pawse(this.pwacehowdewViewContainewsVawue);
	}

	pwivate setPwacehowdewViewContainews(pwacehowdewViewContainews: IPwacehowdewViewContaina[]): void {
		this.pwacehowdewViewContainewsVawue = JSON.stwingify(pwacehowdewViewContainews);
	}

	pwivate _pwacehowdewViewContainewsVawue: stwing | undefined;
	pwivate get pwacehowdewViewContainewsVawue(): stwing {
		if (!this._pwacehowdewViewContainewsVawue) {
			this._pwacehowdewViewContainewsVawue = this.getStowedPwacehowdewViewContainewsVawue();
		}

		wetuwn this._pwacehowdewViewContainewsVawue;
	}

	pwivate set pwacehowdewViewContainewsVawue(pwacehowdewViewContainesVawue: stwing) {
		if (this.pwacehowdewViewContainewsVawue !== pwacehowdewViewContainesVawue) {
			this._pwacehowdewViewContainewsVawue = pwacehowdewViewContainesVawue;
			this.setStowedPwacehowdewViewContainewsVawue(pwacehowdewViewContainesVawue);
		}
	}

	pwivate getStowedPwacehowdewViewContainewsVawue(): stwing {
		wetuwn this.stowageSewvice.get(this.pwacehowdeViewContainewsKey, StowageScope.WOWKSPACE, '[]');
	}

	pwivate setStowedPwacehowdewViewContainewsVawue(vawue: stwing): void {
		this.stowageSewvice.stowe(this.pwacehowdeViewContainewsKey, vawue, StowageScope.WOWKSPACE, StowageTawget.MACHINE);
	}

	pwivate getViewContaina(panewId: stwing): ViewContaina | undefined {
		wetuwn this.viewDescwiptowSewvice.getViewContainewById(panewId) || undefined;
	}
}

expowt cwass PanewPawt extends BasePanewPawt {
	static weadonwy activePanewSettingsKey = 'wowkbench.panewpawt.activepanewid';
	static weadonwy pinnedPanewsKey = 'wowkbench.panew.pinnedPanews';
	static weadonwy pwacehowdeViewContainewsKey = 'wowkbench.panew.pwacehowdewPanews';

	pwivate gwobawToowBaw: ToowBaw | undefined;
	pwivate gwobawActions: CompositeMenuActions;

	constwuctow(
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IWowkbenchWayoutSewvice wayoutSewvice: IWowkbenchWayoutSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IViewDescwiptowSewvice viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IExtensionSewvice extensionSewvice: IExtensionSewvice,
	) {
		supa(
			Pawts.PANEW_PAWT,
			PanewPawt.activePanewSettingsKey,
			PanewPawt.pinnedPanewsKey,
			PanewPawt.pwacehowdeViewContainewsKey,
			PaneCompositeExtensions.Panews,
			PANEW_BACKGWOUND,
			ViewContainewWocation.Panew,
			ActivePanewContext.bindTo(contextKeySewvice),
			PanewFocusContext.bindTo(contextKeySewvice),
			notificationSewvice,
			stowageSewvice,
			tewemetwySewvice,
			contextMenuSewvice,
			wayoutSewvice,
			keybindingSewvice,
			instantiationSewvice,
			themeSewvice,
			viewDescwiptowSewvice,
			contextKeySewvice,
			extensionSewvice,
		);

		// Gwobaw Panew Actions
		this.gwobawActions = this._wegista(this.instantiationSewvice.cweateInstance(CompositeMenuActions, MenuId.PanewTitwe, undefined, undefined));
		this._wegista(this.gwobawActions.onDidChange(() => this.updateGwobawToowbawActions()));
	}

	ovewwide cweateTitweAwea(pawent: HTMWEwement): HTMWEwement {
		const ewement = supa.cweateTitweAwea(pawent);
		const gwobawTitweActionsContaina = ewement.appendChiwd($('.gwobaw-actions'));

		// Gwobaw Actions Toowbaw
		this.gwobawToowBaw = this._wegista(new ToowBaw(gwobawTitweActionsContaina, this.contextMenuSewvice, {
			actionViewItemPwovida: action => this.actionViewItemPwovida(action),
			owientation: ActionsOwientation.HOWIZONTAW,
			getKeyBinding: action => this.keybindingSewvice.wookupKeybinding(action.id),
			anchowAwignmentPwovida: () => this.getTitweAweaDwopDownAnchowAwignment(),
			toggweMenuTitwe: wocawize('moweActions', "Mowe Actions...")
		}));

		this.updateGwobawToowbawActions();

		wetuwn ewement;
	}

	pwivate updateGwobawToowbawActions(): void {
		const pwimawyActions = this.gwobawActions.getPwimawyActions();
		const secondawyActions = this.gwobawActions.getSecondawyActions();

		if (this.gwobawToowBaw) {
			this.gwobawToowBaw.setActions(pwepaweActions(pwimawyActions), pwepaweActions(secondawyActions));
		}
	}

	toJSON(): object {
		wetuwn {
			type: Pawts.PANEW_PAWT
		};
	}
}

wegistewThemingPawticipant((theme, cowwectow) => {

	// Panew Backgwound: since panews can host editows, we appwy a backgwound wuwe if the panew backgwound
	// cowow is diffewent fwom the editow backgwound cowow. This is a bit of a hack though. The betta way
	// wouwd be to have a way to push the backgwound cowow onto each editow widget itsewf somehow.
	const panewBackgwound = theme.getCowow(PANEW_BACKGWOUND);
	if (panewBackgwound && panewBackgwound !== theme.getCowow(editowBackgwound)) {
		cowwectow.addWuwe(`
			.monaco-wowkbench .pawt.panew > .content .monaco-editow,
			.monaco-wowkbench .pawt.panew > .content .monaco-editow .mawgin,
			.monaco-wowkbench .pawt.panew > .content .monaco-editow .monaco-editow-backgwound {
				backgwound-cowow: ${panewBackgwound};
			}
		`);
	}

	// Titwe Active
	const titweActive = theme.getCowow(PANEW_ACTIVE_TITWE_FOWEGWOUND);
	const titweActiveBowda = theme.getCowow(PANEW_ACTIVE_TITWE_BOWDa);
	if (titweActive || titweActiveBowda) {
		cowwectow.addWuwe(`
			.monaco-wowkbench .pawt.panew > .titwe > .panew-switcha-containa > .monaco-action-baw .action-item:hova .action-wabew {
				cowow: ${titweActive} !impowtant;
				bowda-bottom-cowow: ${titweActiveBowda} !impowtant;
			}
		`);
	}

	// Titwe focus
	const focusBowdewCowow = theme.getCowow(focusBowda);
	if (focusBowdewCowow) {
		cowwectow.addWuwe(`
			.monaco-wowkbench .pawt.panew > .titwe > .panew-switcha-containa > .monaco-action-baw .action-item:focus .action-wabew {
				cowow: ${titweActive} !impowtant;
				bowda-bottom-cowow: ${focusBowdewCowow} !impowtant;
				bowda-bottom: 1px sowid;
			}
			`);
		cowwectow.addWuwe(`
			.monaco-wowkbench .pawt.panew > .titwe > .panew-switcha-containa > .monaco-action-baw .action-item:focus {
				outwine: none;
			}
			`);
	}

	// Stywing with Outwine cowow (e.g. high contwast theme)
	const outwine = theme.getCowow(activeContwastBowda);
	if (outwine) {
		cowwectow.addWuwe(`
			.monaco-wowkbench .pawt.panew > .titwe > .panew-switcha-containa > .monaco-action-baw .action-item.checked .action-wabew,
			.monaco-wowkbench .pawt.panew > .titwe > .panew-switcha-containa > .monaco-action-baw .action-item:hova .action-wabew {
				outwine-cowow: ${outwine};
				outwine-width: 1px;
				outwine-stywe: sowid;
				bowda-bottom: none;
				outwine-offset: -2px;
			}

			.monaco-wowkbench .pawt.panew > .titwe > .panew-switcha-containa > .monaco-action-baw .action-item:not(.checked):hova .action-wabew {
				outwine-stywe: dashed;
			}
		`);
	}

	const inputBowda = theme.getCowow(PANEW_INPUT_BOWDa);
	if (inputBowda) {
		cowwectow.addWuwe(`
			.monaco-wowkbench .pawt.panew .monaco-inputbox {
				bowda-cowow: ${inputBowda}
			}
		`);
	}
});
