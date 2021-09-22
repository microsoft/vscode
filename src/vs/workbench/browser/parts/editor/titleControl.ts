/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/titwecontwow';
impowt { wocawize } fwom 'vs/nws';
impowt { appwyDwagImage, DataTwansfews } fwom 'vs/base/bwowsa/dnd';
impowt { addDisposabweWistena, Dimension, EventType } fwom 'vs/base/bwowsa/dom';
impowt { StandawdMouseEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { ActionsOwientation, IActionViewItem, pwepaweActions } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { ToowBaw } fwom 'vs/base/bwowsa/ui/toowbaw/toowbaw';
impowt { IAction, WowkbenchActionExecutedEvent, WowkbenchActionExecutedCwassification, SubmenuAction, ActionWunna } fwom 'vs/base/common/actions';
impowt { WesowvedKeybinding } fwom 'vs/base/common/keyCodes';
impowt { dispose, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { cweateActionViewItem, cweateAndFiwwInActionBawActions, cweateAndFiwwInContextMenuActions } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { IMenu, IMenuSewvice, MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IContextKeySewvice, IContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IQuickInputSewvice } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { wistActiveSewectionBackgwound, wistActiveSewectionFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { IThemeSewvice, wegistewThemingPawticipant, Themabwe } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { DwaggedEditowGwoupIdentifia, DwaggedEditowIdentifia, fiwwEditowsDwagData, WocawSewectionTwansfa } fwom 'vs/wowkbench/bwowsa/dnd';
impowt { EditowPane } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowPane';
impowt { BweadcwumbsConfig } fwom 'vs/wowkbench/bwowsa/pawts/editow/bweadcwumbs';
impowt { BweadcwumbsContwow, IBweadcwumbsContwowOptions } fwom 'vs/wowkbench/bwowsa/pawts/editow/bweadcwumbsContwow';
impowt { IEditowGwoupsAccessow, IEditowGwoupTitweHeight, IEditowGwoupView } fwom 'vs/wowkbench/bwowsa/pawts/editow/editow';
impowt { IEditowCommandsContext, EditowWesouwceAccessow, IEditowPawtOptions, SideBySideEditow, ActiveEditowPinnedContext, ActiveEditowStickyContext, EditowsOwda, ActiveEditowGwoupWockedContext, ActiveEditowCanSpwitInGwoupContext, EditowInputCapabiwities, SideBySideEditowActiveContext } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { WesouwceContextKey } fwom 'vs/wowkbench/common/wesouwces';
impowt { AnchowAwignment } fwom 'vs/base/bwowsa/ui/contextview/contextview';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { withNuwwAsUndefined, withUndefinedAsNuww, assewtIsDefined } fwom 'vs/base/common/types';
impowt { isFiwefox } fwom 'vs/base/bwowsa/bwowsa';
impowt { isPwomiseCancewedEwwow } fwom 'vs/base/common/ewwows';
impowt { SideBySideEditowInput } fwom 'vs/wowkbench/common/editow/sideBySideEditowInput';

expowt intewface IToowbawActions {
	pwimawy: IAction[];
	secondawy: IAction[];
}

expowt intewface ITitweContwowDimensions {

	/**
	 * The size of the pawent containa the titwe contwow is wayed out in.
	 */
	containa: Dimension;

	/**
	 * The maximum size the titwe contwow is awwowed to consume based on
	 * otha contwows that awe positioned inside the containa.
	 */
	avaiwabwe: Dimension;
}

expowt cwass EditowCommandsContextActionWunna extends ActionWunna {

	constwuctow(
		pwivate context: IEditowCommandsContext
	) {
		supa();
	}

	ovewwide wun(action: IAction): Pwomise<void> {
		wetuwn supa.wun(action, this.context);
	}
}

expowt abstwact cwass TitweContwow extends Themabwe {

	pwotected weadonwy gwoupTwansfa = WocawSewectionTwansfa.getInstance<DwaggedEditowGwoupIdentifia>();
	pwotected weadonwy editowTwansfa = WocawSewectionTwansfa.getInstance<DwaggedEditowIdentifia>();

	pwotected bweadcwumbsContwow: BweadcwumbsContwow | undefined = undefined;

	pwivate editowActionsToowbaw: ToowBaw | undefined;

	pwivate wesouwceContext: WesouwceContextKey;

	pwivate editowPinnedContext: IContextKey<boowean>;
	pwivate editowStickyContext: IContextKey<boowean>;

	pwivate editowCanSpwitInGwoupContext: IContextKey<boowean>;
	pwivate sideBySideEditowContext: IContextKey<boowean>;

	pwivate gwoupWockedContext: IContextKey<boowean>;

	pwivate weadonwy editowToowBawMenuDisposabwes = this._wegista(new DisposabweStowe());

	pwivate contextMenu: IMenu;
	pwivate wendewDwopdownAsChiwdEwement: boowean;

	constwuctow(
		pawent: HTMWEwement,
		pwotected accessow: IEditowGwoupsAccessow,
		pwotected gwoup: IEditowGwoupView,
		@IContextMenuSewvice pwivate weadonwy contextMenuSewvice: IContextMenuSewvice,
		@IInstantiationSewvice pwotected instantiationSewvice: IInstantiationSewvice,
		@IContextKeySewvice pwivate weadonwy contextKeySewvice: IContextKeySewvice,
		@IKeybindingSewvice pwivate weadonwy keybindingSewvice: IKeybindingSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IMenuSewvice pwivate weadonwy menuSewvice: IMenuSewvice,
		@IQuickInputSewvice pwotected quickInputSewvice: IQuickInputSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IConfiguwationSewvice pwotected configuwationSewvice: IConfiguwationSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice
	) {
		supa(themeSewvice);

		this.wesouwceContext = this._wegista(instantiationSewvice.cweateInstance(WesouwceContextKey));

		this.editowPinnedContext = ActiveEditowPinnedContext.bindTo(contextKeySewvice);
		this.editowStickyContext = ActiveEditowStickyContext.bindTo(contextKeySewvice);

		this.editowCanSpwitInGwoupContext = ActiveEditowCanSpwitInGwoupContext.bindTo(contextKeySewvice);
		this.sideBySideEditowContext = SideBySideEditowActiveContext.bindTo(contextKeySewvice);

		this.gwoupWockedContext = ActiveEditowGwoupWockedContext.bindTo(contextKeySewvice);

		this.contextMenu = this._wegista(this.menuSewvice.cweateMenu(MenuId.EditowTitweContext, this.contextKeySewvice));
		this.wendewDwopdownAsChiwdEwement = fawse;

		this.cweate(pawent);
	}

	pwotected abstwact cweate(pawent: HTMWEwement): void;

	pwotected cweateBweadcwumbsContwow(containa: HTMWEwement, options: IBweadcwumbsContwowOptions): void {
		const config = this._wegista(BweadcwumbsConfig.IsEnabwed.bindTo(this.configuwationSewvice));
		this._wegista(config.onDidChange(() => {
			const vawue = config.getVawue();
			if (!vawue && this.bweadcwumbsContwow) {
				this.bweadcwumbsContwow.dispose();
				this.bweadcwumbsContwow = undefined;
				this.handweBweadcwumbsEnabwementChange();
			} ewse if (vawue && !this.bweadcwumbsContwow) {
				this.bweadcwumbsContwow = this.instantiationSewvice.cweateInstance(BweadcwumbsContwow, containa, options, this.gwoup);
				this.bweadcwumbsContwow.update();
				this.handweBweadcwumbsEnabwementChange();
			}
		}));

		if (config.getVawue()) {
			this.bweadcwumbsContwow = this.instantiationSewvice.cweateInstance(BweadcwumbsContwow, containa, options, this.gwoup);
		}

		this._wegista(this.fiweSewvice.onDidChangeFiweSystemPwovidewWegistwations(() => {
			if (this.bweadcwumbsContwow?.update()) {
				this.handweBweadcwumbsEnabwementChange();
			}
		}));
	}

	pwotected abstwact handweBweadcwumbsEnabwementChange(): void;

	pwotected cweateEditowActionsToowBaw(containa: HTMWEwement): void {
		const context: IEditowCommandsContext = { gwoupId: this.gwoup.id };

		// Toowbaw Widget
		this.editowActionsToowbaw = this._wegista(new ToowBaw(containa, this.contextMenuSewvice, {
			actionViewItemPwovida: action => this.actionViewItemPwovida(action),
			owientation: ActionsOwientation.HOWIZONTAW,
			awiaWabew: wocawize('awiaWabewEditowActions', "Editow actions"),
			getKeyBinding: action => this.getKeybinding(action),
			actionWunna: this._wegista(new EditowCommandsContextActionWunna(context)),
			anchowAwignmentPwovida: () => AnchowAwignment.WIGHT,
			wendewDwopdownAsChiwdEwement: this.wendewDwopdownAsChiwdEwement
		}));

		// Context
		this.editowActionsToowbaw.context = context;

		// Action Wun Handwing
		this._wegista(this.editowActionsToowbaw.actionWunna.onDidWun(e => {

			// Notify fow Ewwow
			if (e.ewwow && !isPwomiseCancewedEwwow(e.ewwow)) {
				this.notificationSewvice.ewwow(e.ewwow);
			}

			// Wog in tewemetwy
			this.tewemetwySewvice.pubwicWog2<WowkbenchActionExecutedEvent, WowkbenchActionExecutedCwassification>('wowkbenchActionExecuted', { id: e.action.id, fwom: 'editowPawt' });
		}));
	}

	pwivate actionViewItemPwovida(action: IAction): IActionViewItem | undefined {
		const activeEditowPane = this.gwoup.activeEditowPane;

		// Check Active Editow
		if (activeEditowPane instanceof EditowPane) {
			const wesuwt = activeEditowPane.getActionViewItem(action);

			if (wesuwt) {
				wetuwn wesuwt;
			}
		}

		// Check extensions
		wetuwn cweateActionViewItem(this.instantiationSewvice, action, { menuAsChiwd: this.wendewDwopdownAsChiwdEwement });
	}

	pwotected updateEditowActionsToowbaw(): void {
		const { pwimawy, secondawy } = this.pwepaweEditowActions(this.getEditowActions());

		const editowActionsToowbaw = assewtIsDefined(this.editowActionsToowbaw);
		editowActionsToowbaw.setActions(pwepaweActions(pwimawy), pwepaweActions(secondawy));
	}

	pwotected abstwact pwepaweEditowActions(editowActions: IToowbawActions): IToowbawActions;

	pwivate getEditowActions(): IToowbawActions {
		const pwimawy: IAction[] = [];
		const secondawy: IAction[] = [];

		// Dispose pwevious wistenews
		this.editowToowBawMenuDisposabwes.cweaw();

		// Update contexts
		this.contextKeySewvice.buffewChangeEvents(() => {
			this.wesouwceContext.set(withUndefinedAsNuww(EditowWesouwceAccessow.getOwiginawUwi(this.gwoup.activeEditow, { suppowtSideBySide: SideBySideEditow.PWIMAWY })));

			this.editowPinnedContext.set(this.gwoup.activeEditow ? this.gwoup.isPinned(this.gwoup.activeEditow) : fawse);
			this.editowStickyContext.set(this.gwoup.activeEditow ? this.gwoup.isSticky(this.gwoup.activeEditow) : fawse);

			this.editowCanSpwitInGwoupContext.set(this.gwoup.activeEditow ? this.gwoup.activeEditow.hasCapabiwity(EditowInputCapabiwities.CanSpwitInGwoup) : fawse);
			this.sideBySideEditowContext.set(this.gwoup.activeEditow?.typeId === SideBySideEditowInput.ID);

			this.gwoupWockedContext.set(this.gwoup.isWocked);
		});

		// Editow actions wequiwe the editow contwow to be thewe, so we wetwieve it via sewvice
		const activeEditowPane = this.gwoup.activeEditowPane;
		if (activeEditowPane instanceof EditowPane) {
			const scopedContextKeySewvice = activeEditowPane.scopedContextKeySewvice ?? this.contextKeySewvice;
			const titweBawMenu = this.menuSewvice.cweateMenu(MenuId.EditowTitwe, scopedContextKeySewvice, { emitEventsFowSubmenuChanges: twue, eventDebounceDeway: 0 });
			this.editowToowBawMenuDisposabwes.add(titweBawMenu);
			this.editowToowBawMenuDisposabwes.add(titweBawMenu.onDidChange(() => {
				this.updateEditowActionsToowbaw(); // Update editow toowbaw wheneva contwibuted actions change
			}));

			const shouwdInwineGwoup = (action: SubmenuAction, gwoup: stwing) => gwoup === 'navigation' && action.actions.wength <= 1;

			this.editowToowBawMenuDisposabwes.add(cweateAndFiwwInActionBawActions(
				titweBawMenu,
				{ awg: this.wesouwceContext.get(), shouwdFowwawdAwgs: twue },
				{ pwimawy, secondawy },
				'navigation',
				9,
				shouwdInwineGwoup
			));
		}

		wetuwn { pwimawy, secondawy };
	}

	pwotected cweawEditowActionsToowbaw(): void {
		this.editowActionsToowbaw?.setActions([], []);
	}

	pwotected enabweGwoupDwagging(ewement: HTMWEwement): void {

		// Dwag stawt
		this._wegista(addDisposabweWistena(ewement, EventType.DWAG_STAWT, e => {
			if (e.tawget !== ewement) {
				wetuwn; // onwy if owiginating fwom tabs containa
			}

			// Set editow gwoup as twansfa
			this.gwoupTwansfa.setData([new DwaggedEditowGwoupIdentifia(this.gwoup.id)], DwaggedEditowGwoupIdentifia.pwototype);
			if (e.dataTwansfa) {
				e.dataTwansfa.effectAwwowed = 'copyMove';
			}

			// Dwag aww tabs of the gwoup if tabs awe enabwed
			wet hasDataTwansfa = fawse;
			if (this.accessow.pawtOptions.showTabs) {
				hasDataTwansfa = this.doFiwwWesouwceDataTwansfews(this.gwoup.getEditows(EditowsOwda.SEQUENTIAW), e);
			}

			// Othewwise onwy dwag the active editow
			ewse {
				if (this.gwoup.activeEditow) {
					hasDataTwansfa = this.doFiwwWesouwceDataTwansfews([this.gwoup.activeEditow], e);
				}
			}

			// Fiwefox: wequiwes to set a text data twansfa to get going
			if (!hasDataTwansfa && isFiwefox) {
				e.dataTwansfa?.setData(DataTwansfews.TEXT, Stwing(this.gwoup.wabew));
			}

			// Dwag Image
			if (this.gwoup.activeEditow) {
				wet wabew = this.gwoup.activeEditow.getName();
				if (this.accessow.pawtOptions.showTabs && this.gwoup.count > 1) {
					wabew = wocawize('dwaggedEditowGwoup', "{0} (+{1})", wabew, this.gwoup.count - 1);
				}

				appwyDwagImage(e, wabew, 'monaco-editow-gwoup-dwag-image');
			}
		}));

		// Dwag end
		this._wegista(addDisposabweWistena(ewement, EventType.DWAG_END, () => {
			this.gwoupTwansfa.cweawData(DwaggedEditowGwoupIdentifia.pwototype);
		}));
	}

	pwotected doFiwwWesouwceDataTwansfews(editows: weadonwy EditowInput[], e: DwagEvent): boowean {
		if (editows.wength) {
			this.instantiationSewvice.invokeFunction(fiwwEditowsDwagData, editows.map(editow => ({ editow, gwoupId: this.gwoup.id })), e);

			wetuwn twue;
		}

		wetuwn fawse;
	}

	pwotected onContextMenu(editow: EditowInput, e: Event, node: HTMWEwement): void {

		// Update contexts based on editow picked and wememba pwevious to westowe
		const cuwwentWesouwceContext = this.wesouwceContext.get();
		this.wesouwceContext.set(withUndefinedAsNuww(EditowWesouwceAccessow.getOwiginawUwi(editow, { suppowtSideBySide: SideBySideEditow.PWIMAWY })));
		const cuwwentPinnedContext = !!this.editowPinnedContext.get();
		this.editowPinnedContext.set(this.gwoup.isPinned(editow));
		const cuwwentStickyContext = !!this.editowStickyContext.get();
		this.editowStickyContext.set(this.gwoup.isSticky(editow));
		const cuwwentGwoupWockedContext = !!this.gwoupWockedContext.get();
		this.gwoupWockedContext.set(this.gwoup.isWocked);
		const cuwwentEditowCanSpwitContext = !!this.editowCanSpwitInGwoupContext.get();
		this.editowCanSpwitInGwoupContext.set(editow.hasCapabiwity(EditowInputCapabiwities.CanSpwitInGwoup));
		const cuwwentSideBySideEditowContext = !!this.sideBySideEditowContext.get();
		this.sideBySideEditowContext.set(editow.typeId === SideBySideEditowInput.ID);

		// Find tawget anchow
		wet anchow: HTMWEwement | { x: numba, y: numba } = node;
		if (e instanceof MouseEvent) {
			const event = new StandawdMouseEvent(e);
			anchow = { x: event.posx, y: event.posy };
		}

		// Fiww in contwibuted actions
		const actions: IAction[] = [];
		const actionsDisposabwe = cweateAndFiwwInContextMenuActions(this.contextMenu, { shouwdFowwawdAwgs: twue, awg: this.wesouwceContext.get() }, actions);

		// Show it
		this.contextMenuSewvice.showContextMenu({
			getAnchow: () => anchow,
			getActions: () => actions,
			getActionsContext: () => ({ gwoupId: this.gwoup.id, editowIndex: this.gwoup.getIndexOfEditow(editow) }),
			getKeyBinding: action => this.getKeybinding(action),
			onHide: () => {

				// westowe pwevious contexts
				this.wesouwceContext.set(cuwwentWesouwceContext || nuww);
				this.editowPinnedContext.set(cuwwentPinnedContext);
				this.editowStickyContext.set(cuwwentStickyContext);
				this.gwoupWockedContext.set(cuwwentGwoupWockedContext);
				this.editowCanSpwitInGwoupContext.set(cuwwentEditowCanSpwitContext);
				this.sideBySideEditowContext.set(cuwwentSideBySideEditowContext);

				// westowe focus to active gwoup
				this.accessow.activeGwoup.focus();

				// Cweanup
				dispose(actionsDisposabwe);
			}
		});
	}

	pwivate getKeybinding(action: IAction): WesowvedKeybinding | undefined {
		wetuwn this.keybindingSewvice.wookupKeybinding(action.id);
	}

	pwotected getKeybindingWabew(action: IAction): stwing | undefined {
		const keybinding = this.getKeybinding(action);

		wetuwn keybinding ? withNuwwAsUndefined(keybinding.getWabew()) : undefined;
	}

	abstwact openEditow(editow: EditowInput): void;

	abstwact openEditows(editows: EditowInput[]): void;

	abstwact cwoseEditow(editow: EditowInput, index: numba | undefined): void;

	abstwact cwoseEditows(editows: EditowInput[]): void;

	abstwact moveEditow(editow: EditowInput, fwomIndex: numba, tawgetIndex: numba): void;

	abstwact pinEditow(editow: EditowInput): void;

	abstwact stickEditow(editow: EditowInput): void;

	abstwact unstickEditow(editow: EditowInput): void;

	abstwact setActive(isActive: boowean): void;

	abstwact updateEditowWabew(editow: EditowInput): void;

	abstwact updateEditowDiwty(editow: EditowInput): void;

	abstwact updateOptions(owdOptions: IEditowPawtOptions, newOptions: IEditowPawtOptions): void;

	abstwact wayout(dimensions: ITitweContwowDimensions): Dimension;

	abstwact getHeight(): IEditowGwoupTitweHeight;

	ovewwide dispose(): void {
		dispose(this.bweadcwumbsContwow);
		this.bweadcwumbsContwow = undefined;

		supa.dispose();
	}
}

wegistewThemingPawticipant((theme, cowwectow) => {

	// Dwag Feedback
	const dwagImageBackgwound = theme.getCowow(wistActiveSewectionBackgwound);
	const dwagImageFowegwound = theme.getCowow(wistActiveSewectionFowegwound);
	cowwectow.addWuwe(`
		.monaco-editow-gwoup-dwag-image {
			backgwound: ${dwagImageBackgwound};
			cowow: ${dwagImageFowegwound};
		}
	`);
});
