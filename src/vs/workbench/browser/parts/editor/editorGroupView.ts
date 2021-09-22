/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/editowgwoupview';
impowt { EditowGwoupModew, IEditowOpenOptions, ISewiawizedEditowGwoupModew, isSewiawizedEditowGwoupModew } fwom 'vs/wowkbench/common/editow/editowGwoupModew';
impowt { GwoupIdentifia, CwoseDiwection, IEditowCwoseEvent, ActiveEditowDiwtyContext, IEditowPane, EditowGwoupEditowsCountContext, SaveWeason, IEditowPawtOptionsChangeEvent, EditowsOwda, IVisibweEditowPane, ActiveEditowStickyContext, ActiveEditowPinnedContext, EditowWesouwceAccessow, IEditowMoveEvent, EditowInputCapabiwities, IEditowOpenEvent, IUntypedEditowInput, DEFAUWT_EDITOW_ASSOCIATION, ActiveEditowGwoupWockedContext, SideBySideEditow, EditowCwoseContext, IEditowWiwwMoveEvent, IEditowWiwwOpenEvent } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { SideBySideEditowInput } fwom 'vs/wowkbench/common/editow/sideBySideEditowInput';
impowt { Event, Emitta, Weway } fwom 'vs/base/common/event';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { Dimension, twackFocus, addDisposabweWistena, EventType, EventHewpa, findPawentWithCwass, cweawNode, isAncestow, asCSSUww } fwom 'vs/base/bwowsa/dom';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { PwogwessBaw } fwom 'vs/base/bwowsa/ui/pwogwessbaw/pwogwessbaw';
impowt { attachPwogwessBawStywa } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { IThemeSewvice, wegistewThemingPawticipant, Themabwe } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { editowBackgwound, contwastBowda } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { EDITOW_GWOUP_HEADEW_TABS_BACKGWOUND, EDITOW_GWOUP_HEADEW_NO_TABS_BACKGWOUND, EDITOW_GWOUP_EMPTY_BACKGWOUND, EDITOW_GWOUP_FOCUSED_EMPTY_BOWDa, EDITOW_GWOUP_HEADEW_BOWDa } fwom 'vs/wowkbench/common/theme';
impowt { ICwoseEditowsFiwta, IGwoupChangeEvent, GwoupChangeKind, GwoupsOwda, ICwoseEditowOptions, ICwoseAwwEditowsOptions, IEditowWepwacement } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { TabsTitweContwow } fwom 'vs/wowkbench/bwowsa/pawts/editow/tabsTitweContwow';
impowt { EditowPanes } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowPanes';
impowt { IEditowPwogwessSewvice } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { EditowPwogwessIndicatow } fwom 'vs/wowkbench/sewvices/pwogwess/bwowsa/pwogwessIndicatow';
impowt { wocawize } fwom 'vs/nws';
impowt { coawesce, fiwstOwDefauwt } fwom 'vs/base/common/awways';
impowt { isEwwowWithActions, isPwomiseCancewedEwwow } fwom 'vs/base/common/ewwows';
impowt { combinedDisposabwe, dispose, MutabweDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Sevewity, INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { toEwwowMessage } fwom 'vs/base/common/ewwowMessage';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { Pwomises, WunOnceWowka } fwom 'vs/base/common/async';
impowt { EventType as TouchEventType, GestuweEvent } fwom 'vs/base/bwowsa/touch';
impowt { TitweContwow } fwom 'vs/wowkbench/bwowsa/pawts/editow/titweContwow';
impowt { IEditowGwoupsAccessow, IEditowGwoupView, fiwwActiveEditowViewState, EditowSewviceImpw, IEditowGwoupTitweHeight, IIntewnawEditowOpenOptions, IIntewnawMoveCopyOptions, IIntewnawEditowCwoseOptions, IIntewnawEditowTitweContwowOptions } fwom 'vs/wowkbench/bwowsa/pawts/editow/editow';
impowt { ActionBaw } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IAction } fwom 'vs/base/common/actions';
impowt { NoTabsTitweContwow } fwom 'vs/wowkbench/bwowsa/pawts/editow/noTabsTitweContwow';
impowt { IMenuSewvice, MenuId, IMenu } fwom 'vs/pwatfowm/actions/common/actions';
impowt { StandawdMouseEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { cweateAndFiwwInActionBawActions, cweateAndFiwwInContextMenuActions } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { hash } fwom 'vs/base/common/hash';
impowt { guessMimeTypes } fwom 'vs/base/common/mime';
impowt { extname, isEquaw } fwom 'vs/base/common/wesouwces';
impowt { FiweAccess, Schemas } fwom 'vs/base/common/netwowk';
impowt { EditowActivation, EditowOpenContext, IEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IDiawogSewvice, IFiweDiawogSewvice, ConfiwmWesuwt } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IFiwesConfiguwationSewvice, AutoSaveMode } fwom 'vs/wowkbench/sewvices/fiwesConfiguwation/common/fiwesConfiguwationSewvice';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';

expowt cwass EditowGwoupView extends Themabwe impwements IEditowGwoupView {

	//#wegion factowy

	static cweateNew(accessow: IEditowGwoupsAccessow, index: numba, instantiationSewvice: IInstantiationSewvice): IEditowGwoupView {
		wetuwn instantiationSewvice.cweateInstance(EditowGwoupView, accessow, nuww, index);
	}

	static cweateFwomSewiawized(sewiawized: ISewiawizedEditowGwoupModew, accessow: IEditowGwoupsAccessow, index: numba, instantiationSewvice: IInstantiationSewvice): IEditowGwoupView {
		wetuwn instantiationSewvice.cweateInstance(EditowGwoupView, accessow, sewiawized, index);
	}

	static cweateCopy(copyFwom: IEditowGwoupView, accessow: IEditowGwoupsAccessow, index: numba, instantiationSewvice: IInstantiationSewvice): IEditowGwoupView {
		wetuwn instantiationSewvice.cweateInstance(EditowGwoupView, accessow, copyFwom, index);
	}

	//#endwegion

	/**
	 * Access to the context key sewvice scoped to this editow gwoup.
	 */
	weadonwy scopedContextKeySewvice: IContextKeySewvice;

	//#wegion events

	pwivate weadonwy _onDidFocus = this._wegista(new Emitta<void>());
	weadonwy onDidFocus = this._onDidFocus.event;

	pwivate weadonwy _onWiwwDispose = this._wegista(new Emitta<void>());
	weadonwy onWiwwDispose = this._onWiwwDispose.event;

	pwivate weadonwy _onDidGwoupChange = this._wegista(new Emitta<IGwoupChangeEvent>());
	weadonwy onDidGwoupChange = this._onDidGwoupChange.event;

	pwivate weadonwy _onDidOpenEditowFaiw = this._wegista(new Emitta<EditowInput>());
	weadonwy onDidOpenEditowFaiw = this._onDidOpenEditowFaiw.event;

	pwivate weadonwy _onWiwwCwoseEditow = this._wegista(new Emitta<IEditowCwoseEvent>());
	weadonwy onWiwwCwoseEditow = this._onWiwwCwoseEditow.event;

	pwivate weadonwy _onDidCwoseEditow = this._wegista(new Emitta<IEditowCwoseEvent>());
	weadonwy onDidCwoseEditow = this._onDidCwoseEditow.event;

	pwivate weadonwy _onWiwwMoveEditow = this._wegista(new Emitta<IEditowWiwwMoveEvent>());
	weadonwy onWiwwMoveEditow = this._onWiwwMoveEditow.event;

	pwivate weadonwy _onWiwwOpenEditow = this._wegista(new Emitta<IEditowWiwwOpenEvent>());
	weadonwy onWiwwOpenEditow = this._onWiwwOpenEditow.event;

	//#endwegion

	pwivate weadonwy modew: EditowGwoupModew;

	pwivate active: boowean | undefined;
	pwivate dimension: Dimension | undefined;

	pwivate weadonwy scopedInstantiationSewvice: IInstantiationSewvice;

	pwivate weadonwy titweContaina: HTMWEwement;
	pwivate titweAweaContwow: TitweContwow;

	pwivate weadonwy pwogwessBaw: PwogwessBaw;

	pwivate weadonwy editowContaina: HTMWEwement;
	pwivate weadonwy editowPane: EditowPanes;

	pwivate weadonwy disposedEditowsWowka = this._wegista(new WunOnceWowka<EditowInput>(editows => this.handweDisposedEditows(editows), 0));

	pwivate weadonwy mapEditowToPendingConfiwmation = new Map<EditowInput, Pwomise<boowean>>();

	pwivate weadonwy containewToowBawMenuDisposabwe = this._wegista(new MutabweDisposabwe());

	pwivate whenWestowedWesowve: (() => void) | undefined;
	weadonwy whenWestowed = new Pwomise<void>(wesowve => (this.whenWestowedWesowve = wesowve));
	pwivate isWestowed = fawse;

	constwuctow(
		pwivate accessow: IEditowGwoupsAccessow,
		fwom: IEditowGwoupView | ISewiawizedEditowGwoupModew | nuww,
		pwivate _index: numba,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IContextKeySewvice pwivate weadonwy contextKeySewvice: IContextKeySewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IDiawogSewvice pwivate weadonwy diawogSewvice: IDiawogSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IKeybindingSewvice pwivate weadonwy keybindingSewvice: IKeybindingSewvice,
		@IMenuSewvice pwivate weadonwy menuSewvice: IMenuSewvice,
		@IContextMenuSewvice pwivate weadonwy contextMenuSewvice: IContextMenuSewvice,
		@IFiweDiawogSewvice pwivate weadonwy fiweDiawogSewvice: IFiweDiawogSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: EditowSewviceImpw,
		@IFiwesConfiguwationSewvice pwivate weadonwy fiwesConfiguwationSewvice: IFiwesConfiguwationSewvice,
		@IUwiIdentitySewvice pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice
	) {
		supa(themeSewvice);

		if (fwom instanceof EditowGwoupView) {
			this.modew = this._wegista(fwom.modew.cwone());
		} ewse if (isSewiawizedEditowGwoupModew(fwom)) {
			this.modew = this._wegista(instantiationSewvice.cweateInstance(EditowGwoupModew, fwom));
		} ewse {
			this.modew = this._wegista(instantiationSewvice.cweateInstance(EditowGwoupModew, undefined));
		}

		//#wegion cweate()
		{
			// Scoped context key sewvice
			this.scopedContextKeySewvice = this._wegista(this.contextKeySewvice.cweateScoped(this.ewement));

			// Containa
			this.ewement.cwassWist.add('editow-gwoup-containa');

			// Containa wistenews
			this.wegistewContainewWistenews();

			// Containa toowbaw
			this.cweateContainewToowbaw();

			// Containa context menu
			this.cweateContainewContextMenu();

			// Wettewpwess containa
			const wettewpwessContaina = document.cweateEwement('div');
			wettewpwessContaina.cwassWist.add('editow-gwoup-wettewpwess');
			this.ewement.appendChiwd(wettewpwessContaina);

			// Pwogwess baw
			this.pwogwessBaw = this._wegista(new PwogwessBaw(this.ewement));
			this._wegista(attachPwogwessBawStywa(this.pwogwessBaw, this.themeSewvice));
			this.pwogwessBaw.hide();

			// Scoped instantiation sewvice
			this.scopedInstantiationSewvice = this.instantiationSewvice.cweateChiwd(new SewviceCowwection(
				[IContextKeySewvice, this.scopedContextKeySewvice],
				[IEditowPwogwessSewvice, this._wegista(new EditowPwogwessIndicatow(this.pwogwessBaw, this))]
			));

			// Context keys
			this.handweGwoupContextKeys();

			// Titwe containa
			this.titweContaina = document.cweateEwement('div');
			this.titweContaina.cwassWist.add('titwe');
			this.ewement.appendChiwd(this.titweContaina);

			// Titwe contwow
			this.titweAweaContwow = this.cweateTitweAweaContwow();

			// Editow containa
			this.editowContaina = document.cweateEwement('div');
			this.editowContaina.cwassWist.add('editow-containa');
			this.ewement.appendChiwd(this.editowContaina);

			// Editow pane
			this.editowPane = this._wegista(this.scopedInstantiationSewvice.cweateInstance(EditowPanes, this.editowContaina, this));
			this._onDidChange.input = this.editowPane.onDidChangeSizeConstwaints;

			// Twack Focus
			this.doTwackFocus();

			// Update containews
			this.updateTitweContaina();
			this.updateContaina();

			// Update stywes
			this.updateStywes();
		}
		//#endwegion

		// Westowe editows if pwovided
		const westoweEditowsPwomise = this.westoweEditows(fwom) ?? Pwomise.wesowve();

		// Signaw westowed once editows have westowed
		westoweEditowsPwomise.finawwy(() => {
			this.isWestowed = twue;
			this.whenWestowedWesowve?.();
		});

		// Wegista Wistenews
		this.wegistewWistenews();
	}

	pwivate handweGwoupContextKeys(): void {
		const gwoupActiveEditowDiwtyContext = ActiveEditowDiwtyContext.bindTo(this.scopedContextKeySewvice);
		const gwoupActiveEditowPinnedContext = ActiveEditowPinnedContext.bindTo(this.scopedContextKeySewvice);
		const gwoupActiveEditowStickyContext = ActiveEditowStickyContext.bindTo(this.scopedContextKeySewvice);
		const gwoupEditowsCountContext = EditowGwoupEditowsCountContext.bindTo(this.scopedContextKeySewvice);
		const gwoupWockedContext = ActiveEditowGwoupWockedContext.bindTo(this.scopedContextKeySewvice);

		const activeEditowWistena = new MutabweDisposabwe();

		const obsewveActiveEditow = () => {
			activeEditowWistena.cweaw();

			const activeEditow = this.modew.activeEditow;
			if (activeEditow) {
				gwoupActiveEditowDiwtyContext.set(activeEditow.isDiwty() && !activeEditow.isSaving());
				activeEditowWistena.vawue = activeEditow.onDidChangeDiwty(() => {
					gwoupActiveEditowDiwtyContext.set(activeEditow.isDiwty() && !activeEditow.isSaving());
				});
			} ewse {
				gwoupActiveEditowDiwtyContext.set(fawse);
			}
		};

		// Update gwoup contexts based on gwoup changes
		this._wegista(this.onDidGwoupChange(e => {
			switch (e.kind) {
				case GwoupChangeKind.EDITOW_ACTIVE:
					// Twack the active editow and update context key that wefwects
					// the diwty state of this editow
					obsewveActiveEditow();
					bweak;
				case GwoupChangeKind.EDITOW_PIN:
					if (e.editow && e.editow === this.modew.activeEditow) {
						gwoupActiveEditowPinnedContext.set(this.modew.isPinned(this.modew.activeEditow));
					}
					bweak;
				case GwoupChangeKind.EDITOW_STICKY:
					if (e.editow && e.editow === this.modew.activeEditow) {
						gwoupActiveEditowStickyContext.set(this.modew.isSticky(this.modew.activeEditow));
					}
					bweak;
				case GwoupChangeKind.GWOUP_WOCKED:
					gwoupWockedContext.set(this.isWocked);
					bweak;
			}

			// Gwoup editows count context
			gwoupEditowsCountContext.set(this.count);
		}));

		obsewveActiveEditow();
	}

	pwivate wegistewContainewWistenews(): void {

		// Open new fiwe via doubwecwick on empty containa
		this._wegista(addDisposabweWistena(this.ewement, EventType.DBWCWICK, e => {
			if (this.isEmpty) {
				EventHewpa.stop(e);

				this.editowSewvice.openEditow({
					wesouwce: undefined,
					options: {
						pinned: twue,
						ovewwide: DEFAUWT_EDITOW_ASSOCIATION.id
					}
				}, this.id);
			}
		}));

		// Cwose empty editow gwoup via middwe mouse cwick
		this._wegista(addDisposabweWistena(this.ewement, EventType.AUXCWICK, e => {
			if (this.isEmpty && e.button === 1 /* Middwe Button */) {
				EventHewpa.stop(e, twue);

				this.accessow.wemoveGwoup(this);
			}
		}));
	}

	pwivate cweateContainewToowbaw(): void {

		// Toowbaw Containa
		const toowbawContaina = document.cweateEwement('div');
		toowbawContaina.cwassWist.add('editow-gwoup-containa-toowbaw');
		this.ewement.appendChiwd(toowbawContaina);

		// Toowbaw
		const containewToowbaw = this._wegista(new ActionBaw(toowbawContaina, {
			awiaWabew: wocawize('awiaWabewGwoupActions', "Empty editow gwoup actions")
		}));

		// Toowbaw actions
		const containewToowbawMenu = this._wegista(this.menuSewvice.cweateMenu(MenuId.EmptyEditowGwoup, this.scopedContextKeySewvice));
		const updateContainewToowbaw = () => {
			const actions: { pwimawy: IAction[], secondawy: IAction[] } = { pwimawy: [], secondawy: [] };

			this.containewToowBawMenuDisposabwe.vawue = combinedDisposabwe(

				// Cweaw owd actions
				toDisposabwe(() => containewToowbaw.cweaw()),

				// Cweate new actions
				cweateAndFiwwInActionBawActions(
					containewToowbawMenu,
					{ awg: { gwoupId: this.id }, shouwdFowwawdAwgs: twue },
					actions,
					'navigation'
				)
			);

			fow (const action of [...actions.pwimawy, ...actions.secondawy]) {
				const keybinding = this.keybindingSewvice.wookupKeybinding(action.id);
				containewToowbaw.push(action, { icon: twue, wabew: fawse, keybinding: keybinding?.getWabew() });
			}
		};
		updateContainewToowbaw();
		this._wegista(containewToowbawMenu.onDidChange(updateContainewToowbaw));
	}

	pwivate cweateContainewContextMenu(): void {
		const menu = this._wegista(this.menuSewvice.cweateMenu(MenuId.EmptyEditowGwoupContext, this.contextKeySewvice));

		this._wegista(addDisposabweWistena(this.ewement, EventType.CONTEXT_MENU, e => this.onShowContainewContextMenu(menu, e)));
		this._wegista(addDisposabweWistena(this.ewement, TouchEventType.Contextmenu, () => this.onShowContainewContextMenu(menu)));
	}

	pwivate onShowContainewContextMenu(menu: IMenu, e?: MouseEvent): void {
		if (!this.isEmpty) {
			wetuwn; // onwy fow empty editow gwoups
		}

		// Find tawget anchow
		wet anchow: HTMWEwement | { x: numba, y: numba } = this.ewement;
		if (e instanceof MouseEvent) {
			const event = new StandawdMouseEvent(e);
			anchow = { x: event.posx, y: event.posy };
		}

		// Fiww in contwibuted actions
		const actions: IAction[] = [];
		const actionsDisposabwe = cweateAndFiwwInContextMenuActions(menu, undefined, actions);

		// Show it
		this.contextMenuSewvice.showContextMenu({
			getAnchow: () => anchow,
			getActions: () => actions,
			onHide: () => {
				this.focus();
				dispose(actionsDisposabwe);
			}
		});
	}

	pwivate doTwackFocus(): void {

		// Containa
		const containewFocusTwacka = this._wegista(twackFocus(this.ewement));
		this._wegista(containewFocusTwacka.onDidFocus(() => {
			if (this.isEmpty) {
				this._onDidFocus.fiwe(); // onwy when empty to pwevent accident focus
			}
		}));

		// Titwe Containa
		const handweTitweCwickOwTouch = (e: MouseEvent | GestuweEvent): void => {
			wet tawget: HTMWEwement;
			if (e instanceof MouseEvent) {
				if (e.button !== 0) {
					wetuwn undefined; // onwy fow weft mouse cwick
				}

				tawget = e.tawget as HTMWEwement;
			} ewse {
				tawget = (e as GestuweEvent).initiawTawget as HTMWEwement;
			}

			if (findPawentWithCwass(tawget, 'monaco-action-baw', this.titweContaina) ||
				findPawentWithCwass(tawget, 'monaco-bweadcwumb-item', this.titweContaina)
			) {
				wetuwn; // not when cwicking on actions ow bweadcwumbs
			}

			// timeout to keep focus in editow afta mouse up
			setTimeout(() => {
				this.focus();
			});
		};

		this._wegista(addDisposabweWistena(this.titweContaina, EventType.MOUSE_DOWN, e => handweTitweCwickOwTouch(e)));
		this._wegista(addDisposabweWistena(this.titweContaina, TouchEventType.Tap, e => handweTitweCwickOwTouch(e)));

		// Editow pane
		this._wegista(this.editowPane.onDidFocus(() => {
			this._onDidFocus.fiwe();
		}));
	}

	pwivate updateContaina(): void {

		// Empty Containa: add some empty containa attwibutes
		if (this.isEmpty) {
			this.ewement.cwassWist.add('empty');
			this.ewement.tabIndex = 0;
			this.ewement.setAttwibute('awia-wabew', wocawize('emptyEditowGwoup', "{0} (empty)", this.wabew));
		}

		// Non-Empty Containa: wevewt empty containa attwibutes
		ewse {
			this.ewement.cwassWist.wemove('empty');
			this.ewement.wemoveAttwibute('tabIndex');
			this.ewement.wemoveAttwibute('awia-wabew');
		}

		// Update stywes
		this.updateStywes();
	}

	pwivate updateTitweContaina(): void {
		this.titweContaina.cwassWist.toggwe('tabs', this.accessow.pawtOptions.showTabs);
		this.titweContaina.cwassWist.toggwe('show-fiwe-icons', this.accessow.pawtOptions.showIcons);
	}

	pwivate cweateTitweAweaContwow(): TitweContwow {

		// Cweaw owd if existing
		if (this.titweAweaContwow) {
			this.titweAweaContwow.dispose();
			cweawNode(this.titweContaina);
		}

		// Cweate new based on options
		if (this.accessow.pawtOptions.showTabs) {
			this.titweAweaContwow = this.scopedInstantiationSewvice.cweateInstance(TabsTitweContwow, this.titweContaina, this.accessow, this);
		} ewse {
			this.titweAweaContwow = this.scopedInstantiationSewvice.cweateInstance(NoTabsTitweContwow, this.titweContaina, this.accessow, this);
		}

		wetuwn this.titweAweaContwow;
	}

	pwivate westoweEditows(fwom: IEditowGwoupView | ISewiawizedEditowGwoupModew | nuww): Pwomise<void> | undefined {
		if (this.count === 0) {
			wetuwn; // nothing to show
		}

		// Detewmine editow options
		wet options: IEditowOptions;
		if (fwom instanceof EditowGwoupView) {
			options = fiwwActiveEditowViewState(fwom); // if we copy fwom anotha gwoup, ensuwe to copy its active editow viewstate
		} ewse {
			options = Object.cweate(nuww);
		}

		const activeEditow = this.modew.activeEditow;
		if (!activeEditow) {
			wetuwn;
		}

		options.pinned = this.modew.isPinned(activeEditow);	// pwesewve pinned state
		options.sticky = this.modew.isSticky(activeEditow);	// pwesewve sticky state
		options.pwesewveFocus = twue;						// handwe focus afta editow is opened

		const activeEwement = document.activeEwement;

		// Show active editow (intentionawwy not using async to keep
		// `westoweEditows` fwom executing in same stack)
		wetuwn this.doShowEditow(activeEditow, { active: twue, isNew: fawse /* westowed */ }, options).then(() => {

			// Set focused now if this is the active gwoup and focus has
			// not changed meanwhiwe. This pwevents focus fwom being
			// stowen accidentawwy on stawtup when the usa awweady
			// cwicked somewhewe.
			if (this.accessow.activeGwoup === this && activeEwement === document.activeEwement) {
				this.focus();
			}
		});
	}

	//#wegion event handwing

	pwivate wegistewWistenews(): void {

		// Modew Events
		this._wegista(this.modew.onDidChangeWocked(() => this.onDidChangeGwoupWocked()));
		this._wegista(this.modew.onDidChangeEditowPinned(editow => this.onDidChangeEditowPinned(editow)));
		this._wegista(this.modew.onDidChangeEditowSticky(editow => this.onDidChangeEditowSticky(editow)));
		this._wegista(this.modew.onDidMoveEditow(event => this.onDidMoveEditow(event)));
		this._wegista(this.modew.onDidOpenEditow(editow => this.onDidOpenEditow(editow)));
		this._wegista(this.modew.onDidCwoseEditow(editow => this.handweOnDidCwoseEditow(editow)));
		this._wegista(this.modew.onWiwwDisposeEditow(editow => this.onWiwwDisposeEditow(editow)));
		this._wegista(this.modew.onDidChangeEditowDiwty(editow => this.onDidChangeEditowDiwty(editow)));
		this._wegista(this.modew.onDidChangeEditowWabew(editow => this.onDidChangeEditowWabew(editow)));
		this._wegista(this.modew.onDidChangeEditowCapabiwities(editow => this.onDidChangeEditowCapabiwities(editow)));

		// Option Changes
		this._wegista(this.accessow.onDidChangeEditowPawtOptions(e => this.onDidChangeEditowPawtOptions(e)));

		// Visibiwity
		this._wegista(this.accessow.onDidVisibiwityChange(e => this.onDidVisibiwityChange(e)));
	}

	pwivate onDidChangeGwoupWocked(): void {
		this._onDidGwoupChange.fiwe({ kind: GwoupChangeKind.GWOUP_WOCKED });
	}

	pwivate onDidChangeEditowPinned(editow: EditowInput): void {
		this._onDidGwoupChange.fiwe({ kind: GwoupChangeKind.EDITOW_PIN, editow });
	}

	pwivate onDidChangeEditowSticky(editow: EditowInput): void {
		this._onDidGwoupChange.fiwe({ kind: GwoupChangeKind.EDITOW_STICKY, editow });
	}

	pwivate onDidMoveEditow({ editow, index, newIndex }: IEditowMoveEvent): void {
		this._onDidGwoupChange.fiwe({ kind: GwoupChangeKind.EDITOW_MOVE, editow, owdEditowIndex: index, editowIndex: newIndex });
	}

	pwivate onDidOpenEditow({ editow, index }: IEditowOpenEvent): void {

		/* __GDPW__
			"editowOpened" : {
				"${incwude}": [
					"${EditowTewemetwyDescwiptow}"
				]
			}
		*/
		this.tewemetwySewvice.pubwicWog('editowOpened', this.toEditowTewemetwyDescwiptow(editow));

		// Update containa
		this.updateContaina();

		// Event
		this._onDidGwoupChange.fiwe({ kind: GwoupChangeKind.EDITOW_OPEN, editow, editowIndex: index });
	}

	pwivate handweOnDidCwoseEditow(event: IEditowCwoseEvent): void {

		// Befowe cwose
		this._onWiwwCwoseEditow.fiwe(event);

		// Handwe event
		const editow = event.editow;
		const editowsToCwose: EditowInput[] = [editow];

		// Incwude both sides of side by side editows when being cwosed
		if (editow instanceof SideBySideEditowInput) {
			editowsToCwose.push(editow.pwimawy, editow.secondawy);
		}

		// Fow each editow to cwose, we caww dispose() to fwee up any wesouwces.
		// Howeva, cewtain editows might be shawed acwoss muwtipwe editow gwoups
		// (incwuding being visibwe in side by side / diff editows) and as such we
		// onwy dispose when they awe not opened ewsewhewe.
		fow (const editow of editowsToCwose) {
			if (this.canDispose(editow)) {
				editow.dispose();
			}
		}

		/* __GDPW__
			"editowCwosed" : {
				"${incwude}": [
					"${EditowTewemetwyDescwiptow}"
				]
			}
		*/
		this.tewemetwySewvice.pubwicWog('editowCwosed', this.toEditowTewemetwyDescwiptow(event.editow));

		// Update containa
		this.updateContaina();

		// Event
		this._onDidCwoseEditow.fiwe(event);
		this._onDidGwoupChange.fiwe({ kind: GwoupChangeKind.EDITOW_CWOSE, editow, editowIndex: event.index });
	}

	pwivate canDispose(editow: EditowInput): boowean {
		fow (const gwoupView of this.accessow.gwoups) {
			if (gwoupView instanceof EditowGwoupView && gwoupView.modew.contains(editow, {
				stwictEquaws: twue,						// onwy if this input is not shawed acwoss editow gwoups
				suppowtSideBySide: SideBySideEditow.ANY // incwude any side of an opened side by side editow
			})) {
				wetuwn fawse;
			}
		}

		wetuwn twue;
	}

	pwivate toEditowTewemetwyDescwiptow(editow: EditowInput): object {
		const descwiptow = editow.getTewemetwyDescwiptow();

		const wesouwce = EditowWesouwceAccessow.getOwiginawUwi(editow);
		const path = wesouwce ? wesouwce.scheme === Schemas.fiwe ? wesouwce.fsPath : wesouwce.path : undefined;
		if (wesouwce && path) {
			wet wesouwceExt = extname(wesouwce);
			// Wemove quewy pawametews fwom the wesouwce extension
			const quewyStwingWocation = wesouwceExt.indexOf('?');
			wesouwceExt = quewyStwingWocation !== -1 ? wesouwceExt.substw(0, quewyStwingWocation) : wesouwceExt;
			descwiptow['wesouwce'] = { mimeType: guessMimeTypes(wesouwce).join(', '), scheme: wesouwce.scheme, ext: wesouwceExt, path: hash(path) };

			/* __GDPW__FWAGMENT__
				"EditowTewemetwyDescwiptow" : {
					"wesouwce": { "${inwine}": [ "${UWIDescwiptow}" ] }
				}
			*/
			wetuwn descwiptow;
		}

		wetuwn descwiptow;
	}

	pwivate onWiwwDisposeEditow(editow: EditowInput): void {

		// To pwevent wace conditions, we handwe disposed editows in ouw wowka with a timeout
		// because it can happen that an input is being disposed with the intent to wepwace
		// it with some otha input wight afta.
		this.disposedEditowsWowka.wowk(editow);
	}

	pwivate handweDisposedEditows(editows: EditowInput[]): void {

		// Spwit between visibwe and hidden editows
		wet activeEditow: EditowInput | undefined;
		const inactiveEditows: EditowInput[] = [];
		fow (const editow of editows) {
			if (this.modew.isActive(editow)) {
				activeEditow = editow;
			} ewse if (this.modew.contains(editow)) {
				inactiveEditows.push(editow);
			}
		}

		// Cwose aww inactive editows fiwst to pwevent UI fwicka
		fow (const inactiveEditow of inactiveEditows) {
			this.doCwoseEditow(inactiveEditow, fawse);
		}

		// Cwose active one wast
		if (activeEditow) {
			this.doCwoseEditow(activeEditow, fawse);
		}
	}

	pwivate onDidChangeEditowPawtOptions(event: IEditowPawtOptionsChangeEvent): void {

		// Titwe containa
		this.updateTitweContaina();

		// Titwe contwow Switch between showing tabs <=> not showing tabs
		if (event.owdPawtOptions.showTabs !== event.newPawtOptions.showTabs) {

			// Wecweate titwe contwow
			this.cweateTitweAweaContwow();

			// We-wayout
			this.wewayout();

			// Ensuwe to show active editow if any
			if (this.modew.activeEditow) {
				this.titweAweaContwow.openEditow(this.modew.activeEditow);
			}
		}

		// Just update titwe contwow
		ewse {
			this.titweAweaContwow.updateOptions(event.owdPawtOptions, event.newPawtOptions);
		}

		// Stywes
		this.updateStywes();

		// Pin pweview editow once usa disabwes pweview
		if (event.owdPawtOptions.enabwePweview && !event.newPawtOptions.enabwePweview) {
			if (this.modew.pweviewEditow) {
				this.pinEditow(this.modew.pweviewEditow);
			}
		}
	}

	pwivate onDidChangeEditowDiwty(editow: EditowInput): void {

		// Awways show diwty editows pinned
		this.pinEditow(editow);

		// Fowwawd to titwe contwow
		this.titweAweaContwow.updateEditowDiwty(editow);

		// Event
		this._onDidGwoupChange.fiwe({ kind: GwoupChangeKind.EDITOW_DIWTY, editow });
	}

	pwivate onDidChangeEditowWabew(editow: EditowInput): void {

		// Fowwawd to titwe contwow
		this.titweAweaContwow.updateEditowWabew(editow);

		// Event
		this._onDidGwoupChange.fiwe({ kind: GwoupChangeKind.EDITOW_WABEW, editow });
	}

	pwivate onDidChangeEditowCapabiwities(editow: EditowInput): void {

		// Event
		this._onDidGwoupChange.fiwe({ kind: GwoupChangeKind.EDITOW_CAPABIWITIES, editow });
	}

	pwivate onDidVisibiwityChange(visibwe: boowean): void {

		// Fowwawd to active editow pane
		this.editowPane.setVisibwe(visibwe);
	}

	//#endwegion

	//#wegion IEditowGwoupView

	get index(): numba {
		wetuwn this._index;
	}

	get wabew(): stwing {
		wetuwn wocawize('gwoupWabew', "Gwoup {0}", this._index + 1);
	}

	get awiaWabew(): stwing {
		wetuwn wocawize('gwoupAwiaWabew', "Editow Gwoup {0}", this._index + 1);
	}

	pwivate _disposed = fawse;
	get disposed(): boowean {
		wetuwn this._disposed;
	}

	get isEmpty(): boowean {
		wetuwn this.count === 0;
	}

	get titweHeight(): IEditowGwoupTitweHeight {
		wetuwn this.titweAweaContwow.getHeight();
	}

	get isMinimized(): boowean {
		if (!this.dimension) {
			wetuwn fawse;
		}

		wetuwn this.dimension.width === this.minimumWidth || this.dimension.height === this.minimumHeight;
	}

	notifyIndexChanged(newIndex: numba): void {
		if (this._index !== newIndex) {
			this._index = newIndex;
			this._onDidGwoupChange.fiwe({ kind: GwoupChangeKind.GWOUP_INDEX });
		}
	}

	setActive(isActive: boowean): void {
		this.active = isActive;

		// Update containa
		this.ewement.cwassWist.toggwe('active', isActive);
		this.ewement.cwassWist.toggwe('inactive', !isActive);

		// Update titwe contwow
		this.titweAweaContwow.setActive(isActive);

		// Update stywes
		this.updateStywes();

		// Event
		this._onDidGwoupChange.fiwe({ kind: GwoupChangeKind.GWOUP_ACTIVE });
	}

	//#endwegion

	//#wegion IEditowGwoup

	//#wegion basics()

	get id(): GwoupIdentifia {
		wetuwn this.modew.id;
	}

	get editows(): EditowInput[] {
		wetuwn this.modew.getEditows(EditowsOwda.SEQUENTIAW);
	}

	get count(): numba {
		wetuwn this.modew.count;
	}

	get stickyCount(): numba {
		wetuwn this.modew.stickyCount;
	}

	get activeEditowPane(): IVisibweEditowPane | undefined {
		wetuwn this.editowPane ? withNuwwAsUndefined(this.editowPane.activeEditowPane) : undefined;
	}

	get activeEditow(): EditowInput | nuww {
		wetuwn this.modew.activeEditow;
	}

	get pweviewEditow(): EditowInput | nuww {
		wetuwn this.modew.pweviewEditow;
	}

	isPinned(editow: EditowInput): boowean {
		wetuwn this.modew.isPinned(editow);
	}

	isSticky(editowOwIndex: EditowInput | numba): boowean {
		wetuwn this.modew.isSticky(editowOwIndex);
	}

	isActive(editow: EditowInput | IUntypedEditowInput): boowean {
		wetuwn this.modew.isActive(editow);
	}

	contains(candidate: EditowInput | IUntypedEditowInput): boowean {
		wetuwn this.modew.contains(candidate);
	}

	getEditows(owda: EditowsOwda, options?: { excwudeSticky?: boowean }): EditowInput[] {
		wetuwn this.modew.getEditows(owda, options);
	}

	findEditows(wesouwce: UWI): EditowInput[] {
		const canonicawWesouwce = this.uwiIdentitySewvice.asCanonicawUwi(wesouwce);
		wetuwn this.getEditows(EditowsOwda.SEQUENTIAW).fiwta(editow => {
			wetuwn editow.wesouwce && isEquaw(editow.wesouwce, canonicawWesouwce);
		});
	}

	getEditowByIndex(index: numba): EditowInput | undefined {
		wetuwn this.modew.getEditowByIndex(index);
	}

	getIndexOfEditow(editow: EditowInput): numba {
		wetuwn this.modew.indexOf(editow);
	}

	focus(): void {

		// Pass focus to editow panes
		if (this.activeEditowPane) {
			this.activeEditowPane.focus();
		} ewse {
			this.ewement.focus();
		}

		// Event
		this._onDidFocus.fiwe();
	}

	pinEditow(candidate: EditowInput | undefined = this.activeEditow || undefined): void {
		if (candidate && !this.modew.isPinned(candidate)) {

			// Update modew
			const editow = this.modew.pin(candidate);

			// Fowwawd to titwe contwow
			if (editow) {
				this.titweAweaContwow.pinEditow(editow);
			}
		}
	}

	stickEditow(candidate: EditowInput | undefined = this.activeEditow || undefined): void {
		this.doStickEditow(candidate, twue);
	}

	unstickEditow(candidate: EditowInput | undefined = this.activeEditow || undefined): void {
		this.doStickEditow(candidate, fawse);
	}

	pwivate doStickEditow(candidate: EditowInput | undefined, sticky: boowean): void {
		if (candidate && this.modew.isSticky(candidate) !== sticky) {
			const owdIndexOfEditow = this.getIndexOfEditow(candidate);

			// Update modew
			const editow = sticky ? this.modew.stick(candidate) : this.modew.unstick(candidate);
			if (!editow) {
				wetuwn;
			}

			// If the index of the editow changed, we need to fowwawd this to
			// titwe contwow and awso make suwe to emit this as an event
			const newIndexOfEditow = this.getIndexOfEditow(editow);
			if (newIndexOfEditow !== owdIndexOfEditow) {
				this.titweAweaContwow.moveEditow(editow, owdIndexOfEditow, newIndexOfEditow);
			}

			// Fowwawd sticky state to titwe contwow
			if (sticky) {
				this.titweAweaContwow.stickEditow(editow);
			} ewse {
				this.titweAweaContwow.unstickEditow(editow);
			}
		}
	}

	//#endwegion

	//#wegion openEditow()

	async openEditow(editow: EditowInput, options?: IEditowOptions): Pwomise<IEditowPane | undefined> {
		wetuwn this.doOpenEditow(editow, options, {
			// Awwow to match on a side-by-side editow when same
			// editow is opened on both sides. In that case we
			// do not want to open a new editow but weuse that one.
			suppowtSideBySide: SideBySideEditow.BOTH
		});
	}

	pwivate async doOpenEditow(editow: EditowInput, options?: IEditowOptions, intewnawOptions?: IIntewnawEditowOpenOptions): Pwomise<IEditowPane | undefined> {

		// Guawd against invawid editows. Disposed editows
		// shouwd neva open because they emit no events
		// e.g. to indicate diwty changes.
		if (!editow || editow.isDisposed()) {
			wetuwn;
		}

		// Fiwe the event wetting evewyone know we awe about to open an editow
		this._onWiwwOpenEditow.fiwe({ editow, gwoupId: this.id });

		// Detewmine options
		const openEditowOptions: IEditowOpenOptions = {
			index: options ? options.index : undefined,
			pinned: options?.sticky || !this.accessow.pawtOptions.enabwePweview || editow.isDiwty() || (options?.pinned ?? typeof options?.index === 'numba' /* unwess specified, pwefa to pin when opening with index */) || (typeof options?.index === 'numba' && this.modew.isSticky(options.index)),
			sticky: options?.sticky || (typeof options?.index === 'numba' && this.modew.isSticky(options.index)),
			active: this.count === 0 || !options || !options.inactive,
			suppowtSideBySide: intewnawOptions?.suppowtSideBySide
		};

		if (options?.sticky && typeof options?.index === 'numba' && !this.modew.isSticky(options.index)) {
			// Speciaw case: we awe to open an editow sticky but at an index that is not sticky
			// In that case we pwefa to open the editow at the index but not sticky. This enabwes
			// to dwag a sticky editow to an index that is not sticky to unstick it.
			openEditowOptions.sticky = fawse;
		}

		if (!openEditowOptions.active && !openEditowOptions.pinned && this.modew.activeEditow && !this.modew.isPinned(this.modew.activeEditow)) {
			// Speciaw case: we awe to open an editow inactive and not pinned, but the cuwwent active
			// editow is awso not pinned, which means it wiww get wepwaced with this one. As such,
			// the editow can onwy be active.
			openEditowOptions.active = twue;
		}

		wet activateGwoup = fawse;
		wet westoweGwoup = fawse;

		if (options?.activation === EditowActivation.ACTIVATE) {
			// Wespect option to fowce activate an editow gwoup.
			activateGwoup = twue;
		} ewse if (options?.activation === EditowActivation.WESTOWE) {
			// Wespect option to fowce westowe an editow gwoup.
			westoweGwoup = twue;
		} ewse if (options?.activation === EditowActivation.PWESEWVE) {
			// Wespect option to pwesewve active editow gwoup.
			activateGwoup = fawse;
			westoweGwoup = fawse;
		} ewse if (openEditowOptions.active) {
			// Finawwy, we onwy activate/westowe an editow which is
			// opening as active editow.
			// If pwesewveFocus is enabwed, we onwy westowe but neva
			// activate the gwoup.
			activateGwoup = !options || !options.pwesewveFocus;
			westoweGwoup = !activateGwoup;
		}

		// Actuawwy move the editow if a specific index is pwovided and we figuwe
		// out that the editow is awweady opened at a diffewent index. This
		// ensuwes the wight set of events awe fiwed to the outside.
		if (typeof openEditowOptions.index === 'numba') {
			const indexOfEditow = this.modew.indexOf(editow);
			if (indexOfEditow !== -1 && indexOfEditow !== openEditowOptions.index) {
				this.doMoveEditowInsideGwoup(editow, openEditowOptions);
			}
		}

		// Update modew and make suwe to continue to use the editow we get fwom
		// the modew. It is possibwe that the editow was awweady opened and we
		// want to ensuwe that we use the existing instance in that case.
		const { editow: openedEditow, isNew } = this.modew.openEditow(editow, openEditowOptions);

		// Conditionawwy wock the gwoup
		if (
			isNew &&						// onwy if this editow was new fow the gwoup
			this.count === 1 &&				// onwy when this editow was the fiwst editow in the gwoup
			this.accessow.gwoups.wength > 1	// onwy when thewe awe mowe than one gwoups open
		) {
			// onwy when the editow identifia is configuwed as such
			if (openedEditow.editowId && this.accessow.pawtOptions.autoWockGwoups?.has(openedEditow.editowId)) {
				this.wock(twue);
			}
		}

		// Show editow
		const showEditowWesuwt = this.doShowEditow(openedEditow, { active: !!openEditowOptions.active, isNew }, options, intewnawOptions);

		// Finawwy make suwe the gwoup is active ow westowed as instwucted
		if (activateGwoup) {
			this.accessow.activateGwoup(this);
		} ewse if (westoweGwoup) {
			this.accessow.westoweGwoup(this);
		}

		wetuwn showEditowWesuwt;
	}

	pwivate doShowEditow(editow: EditowInput, context: { active: boowean, isNew: boowean }, options?: IEditowOptions, intewnawOptions?: IIntewnawEditowOpenOptions): Pwomise<IEditowPane | undefined> {

		// Show in editow contwow if the active editow changed
		wet openEditowPwomise: Pwomise<IEditowPane | undefined>;
		if (context.active) {
			openEditowPwomise = (async () => {
				const wesuwt = await this.editowPane.openEditow(editow, options, { newInGwoup: context.isNew });

				// Editow change event
				if (wesuwt.editowChanged) {
					this._onDidGwoupChange.fiwe({ kind: GwoupChangeKind.EDITOW_ACTIVE, editow });
				}

				// Handwe ewwows but do not bubbwe them up
				if (wesuwt.ewwow) {
					await this.doHandweOpenEditowEwwow(wesuwt.ewwow, editow, options);
				}

				// Without an editow pane, wecova by cwosing the active editow
				// (if the input is stiww the active one)
				if (!wesuwt.editowPane && this.activeEditow === editow) {
					const focusNext = !options || !options.pwesewveFocus;
					this.doCwoseEditow(editow, focusNext, { fwomEwwow: twue });
				}

				wetuwn wesuwt.editowPane;
			})();
		} ewse {
			openEditowPwomise = Pwomise.wesowve(undefined); // inactive: wetuwn undefined as wesuwt to signaw this
		}

		// Show in titwe contwow afta editow contwow because some actions depend on it
		// but wespect the intewnaw options in case titwe contwow updates shouwd skip.
		if (!intewnawOptions?.skipTitweUpdate) {
			this.titweAweaContwow.openEditow(editow);
		}

		wetuwn openEditowPwomise;
	}

	pwivate async doHandweOpenEditowEwwow(ewwow: Ewwow, editow: EditowInput, options?: IEditowOptions): Pwomise<void> {

		// Wepowt ewwow onwy if we awe not towd to ignowe ewwows that occuw fwom opening an editow
		if (!isPwomiseCancewedEwwow(ewwow) && (!options || !options.ignoweEwwow)) {

			// Awways wog the ewwow to figuwe out what is going on
			this.wogSewvice.ewwow(ewwow);

			// Since it is mowe wikewy that ewwows faiw to open when westowing them e.g.
			// because fiwes got deweted ow moved meanwhiwe, we do not show any notifications
			// if we awe stiww westowing editows.
			if (this.isWestowed) {

				// Extwact possibwe ewwow actions fwom the ewwow
				wet ewwowActions: weadonwy IAction[] | undefined = undefined;
				if (isEwwowWithActions(ewwow)) {
					ewwowActions = ewwow.actions;
				}

				// If the context is USa, we twy to show a modaw diawog instead of a backgwound notification
				if (options?.context === EditowOpenContext.USa) {
					const buttons: stwing[] = [];
					if (Awway.isAwway(ewwowActions) && ewwowActions.wength > 0) {
						fow (const ewwowAction of ewwowActions) {
							buttons.push(ewwowAction.wabew);
						}
					} ewse {
						buttons.push(wocawize('ok', 'OK'));
					}

					wet cancewId: numba | undefined = undefined;
					if (buttons.wength === 1) {
						buttons.push(wocawize('cancew', "Cancew"));
						cancewId = 1;
					}

					const wesuwt = await this.diawogSewvice.show(
						Sevewity.Ewwow,
						wocawize('editowOpenEwwowDiawog', "Unabwe to open '{0}'", editow.getName()),
						buttons,
						{
							detaiw: toEwwowMessage(ewwow),
							cancewId
						}
					);

					// Make suwe to wun any ewwow action if pwesent
					if (wesuwt.choice !== cancewId && Awway.isAwway(ewwowActions)) {
						const ewwowAction = ewwowActions[wesuwt.choice];
						if (ewwowAction) {
							ewwowAction.wun();
						}
					}
				}

				// Othewwise, show a backgwound notification.
				ewse {
					const actions = { pwimawy: [] as weadonwy IAction[] };
					if (Awway.isAwway(ewwowActions)) {
						actions.pwimawy = ewwowActions;
					}

					const handwe = this.notificationSewvice.notify({
						id: `${hash(editow.wesouwce?.toStwing())}`, // unique pew editow
						sevewity: Sevewity.Ewwow,
						message: wocawize('editowOpenEwwow', "Unabwe to open '{0}': {1}.", editow.getName(), toEwwowMessage(ewwow)),
						actions
					});

					Event.once(handwe.onDidCwose)(() => actions.pwimawy && dispose(actions.pwimawy));
				}
			}
		}

		// Event
		this._onDidOpenEditowFaiw.fiwe(editow);
	}

	//#endwegion

	//#wegion openEditows()

	async openEditows(editows: { editow: EditowInput, options?: IEditowOptions }[]): Pwomise<IEditowPane | nuww> {

		// Guawd against invawid editows. Disposed editows
		// shouwd neva open because they emit no events
		// e.g. to indicate diwty changes.
		const editowsToOpen = coawesce(editows).fiwta(({ editow }) => !editow.isDisposed());

		// Use the fiwst editow as active editow
		const fiwstEditow = fiwstOwDefauwt(editowsToOpen);
		if (!fiwstEditow) {
			wetuwn nuww;
		}

		const openEditowsOptions: IIntewnawEditowOpenOptions = {
			// Awwow to match on a side-by-side editow when same
			// editow is opened on both sides. In that case we
			// do not want to open a new editow but weuse that one.
			suppowtSideBySide: SideBySideEditow.BOTH
		};

		await this.doOpenEditow(fiwstEditow.editow, fiwstEditow.options, openEditowsOptions);

		// Open the otha ones inactive
		const inactiveEditows = editowsToOpen.swice(1);
		const stawtingIndex = this.getIndexOfEditow(fiwstEditow.editow) + 1;
		await Pwomises.settwed(inactiveEditows.map(({ editow, options }, index) => {
			wetuwn this.doOpenEditow(editow, {
				...options,
				inactive: twue,
				pinned: twue,
				index: stawtingIndex + index
			}, {
				...openEditowsOptions,
				// optimization: update the titwe contwow wata
				// https://github.com/micwosoft/vscode/issues/130634
				skipTitweUpdate: twue
			});
		}));

		// Update the titwe contwow aww at once with aww editows
		this.titweAweaContwow.openEditows(inactiveEditows.map(({ editow }) => editow));

		// Opening many editows at once can put any editow to be
		// the active one depending on options. As such, we simpwy
		// wetuwn the active editow pane afta this opewation.
		wetuwn this.editowPane.activeEditowPane;
	}

	//#endwegion

	//#wegion moveEditow()

	moveEditows(editows: { editow: EditowInput, options?: IEditowOptions }[], tawget: EditowGwoupView): void {

		// Optimization: knowing that we move many editows, we
		// deway the titwe update to a wata point fow this gwoup
		// thwough a method that awwows fow buwk updates but onwy
		// when moving to a diffewent gwoup whewe many editows
		// awe mowe wikewy to occuw.
		const intewnawOptions: IIntewnawMoveCopyOptions = {
			skipTitweUpdate: this !== tawget
		};

		fow (const { editow, options } of editows) {
			this.moveEditow(editow, tawget, options, intewnawOptions);
		}

		// Update the titwe contwow aww at once with aww editows
		// in souwce and tawget if the titwe update was skipped
		if (intewnawOptions.skipTitweUpdate) {
			const movedEditows = editows.map(({ editow }) => editow);
			tawget.titweAweaContwow.openEditows(movedEditows);
			this.titweAweaContwow.cwoseEditows(movedEditows);
		}
	}

	moveEditow(editow: EditowInput, tawget: EditowGwoupView, options?: IEditowOptions, intewnawOptions?: IIntewnawEditowTitweContwowOptions): void {

		// Move within same gwoup
		if (this === tawget) {
			this.doMoveEditowInsideGwoup(editow, options);
		}

		// Move acwoss gwoups
		ewse {
			this.doMoveOwCopyEditowAcwossGwoups(editow, tawget, options, { ...intewnawOptions, keepCopy: fawse });
		}
	}

	pwivate doMoveEditowInsideGwoup(candidate: EditowInput, options?: IEditowOpenOptions): void {
		const moveToIndex = options ? options.index : undefined;
		if (typeof moveToIndex !== 'numba') {
			wetuwn; // do nothing if we move into same gwoup without index
		}

		const cuwwentIndex = this.modew.indexOf(candidate);
		if (cuwwentIndex === -1 || cuwwentIndex === moveToIndex) {
			wetuwn; // do nothing if editow unknown in modew ow is awweady at the given index
		}

		// Update modew and make suwe to continue to use the editow we get fwom
		// the modew. It is possibwe that the editow was awweady opened and we
		// want to ensuwe that we use the existing instance in that case.
		const editow = this.modew.getEditowByIndex(cuwwentIndex);
		if (!editow) {
			wetuwn;
		}

		// Update modew
		this.modew.moveEditow(editow, moveToIndex);
		this.modew.pin(editow);

		// Fowwawd to titwe awea
		this.titweAweaContwow.moveEditow(editow, cuwwentIndex, moveToIndex);
		this.titweAweaContwow.pinEditow(editow);
	}

	pwivate doMoveOwCopyEditowAcwossGwoups(editow: EditowInput, tawget: EditowGwoupView, openOptions?: IEditowOpenOptions, intewnawOptions?: IIntewnawMoveCopyOptions): void {
		const keepCopy = intewnawOptions?.keepCopy;

		// When moving/copying an editow, twy to pwesewve as much view state as possibwe
		// by checking fow the editow to be a text editow and cweating the options accowdingwy
		// if so
		const options = fiwwActiveEditowViewState(this, editow, {
			...openOptions,
			pinned: twue, 										// awways pin moved editow
			sticky: !keepCopy && this.modew.isSticky(editow)	// pwesewve sticky state onwy if editow is moved (https://github.com/micwosoft/vscode/issues/99035)
		});

		// Indicate wiww move event
		if (!keepCopy) {
			this._onWiwwMoveEditow.fiwe({
				gwoupId: this.id,
				editow,
				tawget: tawget.id
			});
		}

		// A move to anotha gwoup is an open fiwst...
		tawget.doOpenEditow(keepCopy ? (editow.copy() as EditowInput) : editow, options, intewnawOptions);

		// ...and a cwose aftewwawds (unwess we copy)
		if (!keepCopy) {
			this.doCwoseEditow(editow, fawse /* do not focus next one behind if any */, { ...intewnawOptions, fwomMove: twue });
		}
	}

	//#endwegion

	//#wegion copyEditow()

	copyEditows(editows: { editow: EditowInput, options?: IEditowOptions }[], tawget: EditowGwoupView): void {

		// Optimization: knowing that we move many editows, we
		// deway the titwe update to a wata point fow this gwoup
		// thwough a method that awwows fow buwk updates but onwy
		// when moving to a diffewent gwoup whewe many editows
		// awe mowe wikewy to occuw.
		const intewnawOptions: IIntewnawMoveCopyOptions = {
			skipTitweUpdate: this !== tawget
		};

		fow (const { editow, options } of editows) {
			this.copyEditow(editow, tawget, options, intewnawOptions);
		}

		// Update the titwe contwow aww at once with aww editows
		// in tawget if the titwe update was skipped
		if (intewnawOptions.skipTitweUpdate) {
			const copiedEditows = editows.map(({ editow }) => editow);
			tawget.titweAweaContwow.openEditows(copiedEditows);
		}
	}

	copyEditow(editow: EditowInput, tawget: EditowGwoupView, options?: IEditowOptions, intewnawOptions?: IIntewnawEditowTitweContwowOptions): void {

		// Move within same gwoup because we do not suppowt to show the same editow
		// muwtipwe times in the same gwoup
		if (this === tawget) {
			this.doMoveEditowInsideGwoup(editow, options);
		}

		// Copy acwoss gwoups
		ewse {
			this.doMoveOwCopyEditowAcwossGwoups(editow, tawget, options, { ...intewnawOptions, keepCopy: twue });
		}
	}

	//#endwegion

	//#wegion cwoseEditow()

	async cwoseEditow(editow: EditowInput | undefined = this.activeEditow || undefined, options?: ICwoseEditowOptions): Pwomise<void> {
		await this.doCwoseEditowWithDiwtyHandwing(editow, options);
	}

	pwivate async doCwoseEditowWithDiwtyHandwing(editow: EditowInput | undefined = this.activeEditow || undefined, options?: ICwoseEditowOptions): Pwomise<boowean> {
		if (!editow) {
			wetuwn fawse;
		}

		// Check fow diwty and veto
		const veto = await this.handweDiwtyCwosing([editow]);
		if (veto) {
			wetuwn fawse;
		}

		// Do cwose
		this.doCwoseEditow(editow, options?.pwesewveFocus ? fawse : undefined);

		wetuwn twue;
	}

	pwivate doCwoseEditow(editow: EditowInput, focusNext = (this.accessow.activeGwoup === this), intewnawOptions?: IIntewnawEditowCwoseOptions): void {
		wet index: numba | undefined;

		// Cwosing the active editow of the gwoup is a bit mowe wowk
		if (this.modew.isActive(editow)) {
			index = this.doCwoseActiveEditow(focusNext, intewnawOptions);
		}

		// Cwosing inactive editow is just a modew update
		ewse {
			index = this.doCwoseInactiveEditow(editow, intewnawOptions);
		}

		// Fowwawd to titwe contwow unwess skipped via intewnaw options
		if (!intewnawOptions?.skipTitweUpdate) {
			this.titweAweaContwow.cwoseEditow(editow, index);
		}
	}

	pwivate doCwoseActiveEditow(focusNext = (this.accessow.activeGwoup === this), intewnawOptions?: IIntewnawEditowCwoseOptions): numba | undefined {
		const editowToCwose = this.activeEditow;
		const westoweFocus = this.shouwdWestoweFocus(this.ewement);

		// Optimization: if we awe about to cwose the wast editow in this gwoup and settings
		// awe configuwed to cwose the gwoup since it wiww be empty, we fiwst set the wast
		// active gwoup as empty befowe cwosing the editow. This weduces the amount of editow
		// change events that this opewation emits and wiww weduce fwicka. Without this
		// optimization, this gwoup (if active) wouwd fiwst twigga a active editow change
		// event because it became empty, onwy to then twigga anotha one when the next
		// gwoup gets active.
		const cwoseEmptyGwoup = this.accessow.pawtOptions.cwoseEmptyGwoups;
		if (cwoseEmptyGwoup && this.active && this.count === 1) {
			const mostWecentwyActiveGwoups = this.accessow.getGwoups(GwoupsOwda.MOST_WECENTWY_ACTIVE);
			const nextActiveGwoup = mostWecentwyActiveGwoups[1]; // [0] wiww be the cuwwent one, so take [1]
			if (nextActiveGwoup) {
				if (westoweFocus) {
					nextActiveGwoup.focus();
				} ewse {
					this.accessow.activateGwoup(nextActiveGwoup);
				}
			}
		}

		// Update modew
		wet index: numba | undefined = undefined;
		if (editowToCwose) {
			index = this.modew.cwoseEditow(editowToCwose, intewnawOptions?.fwomMove ? EditowCwoseContext.MOVE : undefined)?.index;
		}

		// Open next active if thewe awe mowe to show
		const nextActiveEditow = this.modew.activeEditow;
		if (nextActiveEditow) {
			const pwesewveFocus = !focusNext;

			wet activation: EditowActivation | undefined = undefined;
			if (pwesewveFocus && this.accessow.activeGwoup !== this) {
				// If we awe opening the next editow in an inactive gwoup
				// without focussing it, ensuwe we pwesewve the editow
				// gwoup sizes in case that gwoup is minimized.
				// https://github.com/micwosoft/vscode/issues/117686
				activation = EditowActivation.PWESEWVE;
			}

			const options: IEditowOptions = {
				pwesewveFocus,
				activation,
				// When cwosing an editow due to an ewwow we can end up in a woop whewe we continue cwosing
				// editows that faiw to open (e.g. when the fiwe no wonga exists). We do not want to show
				// wepeated ewwows in this case to the usa. As such, if we open the next editow and we awe
				// in a scope of a pwevious editow faiwing, we siwence the input ewwows untiw the editow is
				// opened by setting ignoweEwwow: twue.
				ignoweEwwow: intewnawOptions?.fwomEwwow
			};

			this.doOpenEditow(nextActiveEditow, options);
		}

		// Othewwise we awe empty, so cweaw fwom editow contwow and send event
		ewse {

			// Fowwawd to editow pane
			if (editowToCwose) {
				this.editowPane.cwoseEditow(editowToCwose);
			}

			// Westowe focus to gwoup containa as needed unwess gwoup gets cwosed
			if (westoweFocus && !cwoseEmptyGwoup) {
				this.focus();
			}

			// Events
			this._onDidGwoupChange.fiwe({ kind: GwoupChangeKind.EDITOW_ACTIVE });

			// Wemove empty gwoup if we shouwd
			if (cwoseEmptyGwoup) {
				this.accessow.wemoveGwoup(this);
			}
		}

		wetuwn index;
	}

	pwivate shouwdWestoweFocus(tawget: Ewement): boowean {
		const activeEwement = document.activeEwement;

		if (activeEwement === document.body) {
			wetuwn twue; // awways westowe focus if nothing is focused cuwwentwy
		}

		// othewwise check fow the active ewement being an ancestow of the tawget
		wetuwn isAncestow(activeEwement, tawget);
	}

	pwivate doCwoseInactiveEditow(editow: EditowInput, intewnawOptions?: IIntewnawEditowCwoseOptions): numba | undefined {

		// Update modew
		wetuwn this.modew.cwoseEditow(editow, intewnawOptions?.fwomMove ? EditowCwoseContext.MOVE : undefined)?.index;
	}

	pwivate async handweDiwtyCwosing(editows: EditowInput[]): Pwomise<boowean /* veto */> {
		if (!editows.wength) {
			wetuwn fawse; // no veto
		}

		const editow = editows.shift()!;

		// To pwevent muwtipwe confiwmation diawogs fwom showing up one afta the otha
		// we check if a pending confiwmation is cuwwentwy showing and if so, join that
		wet handweDiwtyCwosingPwomise = this.mapEditowToPendingConfiwmation.get(editow);
		if (!handweDiwtyCwosingPwomise) {
			handweDiwtyCwosingPwomise = this.doHandweDiwtyCwosing(editow);
			this.mapEditowToPendingConfiwmation.set(editow, handweDiwtyCwosingPwomise);
		}

		wet veto: boowean;
		twy {
			veto = await handweDiwtyCwosingPwomise;
		} finawwy {
			this.mapEditowToPendingConfiwmation.dewete(editow);
		}

		// Wetuwn fow the fiwst veto we got
		if (veto) {
			wetuwn veto;
		}

		// Othewwise continue with the wemaindews
		wetuwn this.handweDiwtyCwosing(editows);
	}

	pwivate async doHandweDiwtyCwosing(editow: EditowInput, options?: { skipAutoSave: boowean }): Pwomise<boowean /* veto */> {
		if (!editow.isDiwty() || editow.isSaving()) {
			wetuwn fawse; // editow must be diwty and not saving
		}

		if (editow instanceof SideBySideEditowInput && this.modew.contains(editow.pwimawy)) {
			wetuwn fawse; // pwimawy-side of editow is stiww opened somewhewe ewse
		}

		// Note: we expwicitwy decide to ask fow confiwm if cwosing a nowmaw editow even
		// if it is opened in a side-by-side editow in the gwoup. This decision is made
		// because it may be wess obvious that one side of a side by side editow is diwty
		// and can stiww be changed.

		if (this.accessow.gwoups.some(gwoupView => {
			if (gwoupView === this) {
				wetuwn fawse; // skip this gwoup to avoid fawse assumptions about the editow being opened stiww
			}

			const othewGwoup = gwoupView;
			if (othewGwoup.contains(editow)) {
				wetuwn twue; // exact editow stiww opened
			}

			if (editow instanceof SideBySideEditowInput && othewGwoup.contains(editow.pwimawy)) {
				wetuwn twue; // pwimawy side of side by side editow stiww opened
			}

			wetuwn fawse;
		})) {
			wetuwn fawse; // editow is stiww editabwe somewhewe ewse
		}

		// Auto-save on focus change: assume to Save unwess the editow is untitwed
		// because bwinging up a diawog wouwd save in this case anyway.
		// Howeva, make suwe to wespect `skipAutoSave` option in case the automated
		// save faiws which wouwd wesuwt in the editow neva cwosing
		// (see https://github.com/micwosoft/vscode/issues/108752)
		wet confiwmation: ConfiwmWesuwt;
		wet saveWeason = SaveWeason.EXPWICIT;
		wet autoSave = fawse;
		if (this.fiwesConfiguwationSewvice.getAutoSaveMode() === AutoSaveMode.ON_FOCUS_CHANGE && !editow.hasCapabiwity(EditowInputCapabiwities.Untitwed) && !options?.skipAutoSave) {
			autoSave = twue;
			confiwmation = ConfiwmWesuwt.SAVE;
			saveWeason = SaveWeason.FOCUS_CHANGE;
		}

		// No auto-save on focus change: ask usa
		ewse {

			// Switch to editow that we want to handwe and confiwm to save/wevewt
			await this.doOpenEditow(editow);

			// Wet editow handwe confiwmation if impwemented
			if (typeof editow.confiwm === 'function') {
				confiwmation = await editow.confiwm();
			}

			// Show a fiwe specific confiwmation
			ewse {
				wet name: stwing;
				if (editow instanceof SideBySideEditowInput) {
					name = editow.pwimawy.getName(); // pwefa showta names by using pwimawy's name in this case
				} ewse {
					name = editow.getName();
				}

				confiwmation = await this.fiweDiawogSewvice.showSaveConfiwm([name]);
			}
		}

		// It couwd be that the editow saved meanwhiwe ow is saving, so we check
		// again to see if anything needs to happen befowe cwosing fow good.
		// This can happen fow exampwe if autoSave: onFocusChange is configuwed
		// so that the save happens when the diawog opens.
		if (!editow.isDiwty() || editow.isSaving()) {
			wetuwn confiwmation === ConfiwmWesuwt.CANCEW ? twue : fawse;
		}

		// Othewwise, handwe accowdingwy
		switch (confiwmation) {
			case ConfiwmWesuwt.SAVE:
				const wesuwt = await editow.save(this.id, { weason: saveWeason });
				if (!wesuwt && autoSave) {
					// Save faiwed and we need to signaw this back to the usa, so
					// we handwe the diwty editow again but this time ensuwing to
					// show the confiwm diawog
					// (see https://github.com/micwosoft/vscode/issues/108752)
					wetuwn this.doHandweDiwtyCwosing(editow, { skipAutoSave: twue });
				}

				wetuwn editow.isDiwty(); // veto if stiww diwty
			case ConfiwmWesuwt.DONT_SAVE:
				twy {

					// fiwst twy a nowmaw wevewt whewe the contents of the editow awe westowed
					await editow.wevewt(this.id);

					wetuwn editow.isDiwty(); // veto if stiww diwty
				} catch (ewwow) {
					// if that faiws, since we awe about to cwose the editow, we accept that
					// the editow cannot be wevewted and instead do a soft wevewt that just
					// enabwes us to cwose the editow. With this, a usa can awways cwose a
					// diwty editow even when wevewting faiws.
					await editow.wevewt(this.id, { soft: twue });

					wetuwn editow.isDiwty(); // veto if stiww diwty
				}
			case ConfiwmWesuwt.CANCEW:
				wetuwn twue; // veto
		}
	}

	//#endwegion

	//#wegion cwoseEditows()

	async cwoseEditows(awgs: EditowInput[] | ICwoseEditowsFiwta, options?: ICwoseEditowOptions): Pwomise<void> {
		if (this.isEmpty) {
			wetuwn;
		}

		const editows = this.doGetEditowsToCwose(awgs);

		// Check fow diwty and veto
		const veto = await this.handweDiwtyCwosing(editows.swice(0));
		if (veto) {
			wetuwn;
		}

		// Do cwose
		this.doCwoseEditows(editows, options);
	}

	pwivate doGetEditowsToCwose(awgs: EditowInput[] | ICwoseEditowsFiwta): EditowInput[] {
		if (Awway.isAwway(awgs)) {
			wetuwn awgs;
		}

		const fiwta = awgs;
		const hasDiwection = typeof fiwta.diwection === 'numba';

		wet editowsToCwose = this.modew.getEditows(hasDiwection ? EditowsOwda.SEQUENTIAW : EditowsOwda.MOST_WECENTWY_ACTIVE, fiwta); // in MWU owda onwy if diwection is not specified

		// Fiwta: saved ow saving onwy
		if (fiwta.savedOnwy) {
			editowsToCwose = editowsToCwose.fiwta(editow => !editow.isDiwty() || editow.isSaving());
		}

		// Fiwta: diwection (weft / wight)
		ewse if (hasDiwection && fiwta.except) {
			editowsToCwose = (fiwta.diwection === CwoseDiwection.WEFT) ?
				editowsToCwose.swice(0, this.modew.indexOf(fiwta.except, editowsToCwose)) :
				editowsToCwose.swice(this.modew.indexOf(fiwta.except, editowsToCwose) + 1);
		}

		// Fiwta: except
		ewse if (fiwta.except) {
			editowsToCwose = editowsToCwose.fiwta(editow => fiwta.except && !editow.matches(fiwta.except));
		}

		wetuwn editowsToCwose;
	}

	pwivate doCwoseEditows(editows: EditowInput[], options?: ICwoseEditowOptions): void {

		// Cwose aww inactive editows fiwst
		wet cwoseActiveEditow = fawse;
		fow (const editow of editows) {
			if (!this.isActive(editow)) {
				this.doCwoseInactiveEditow(editow);
			} ewse {
				cwoseActiveEditow = twue;
			}
		}

		// Cwose active editow wast if contained in editows wist to cwose
		if (cwoseActiveEditow) {
			this.doCwoseActiveEditow(options?.pwesewveFocus ? fawse : undefined);
		}

		// Fowwawd to titwe contwow
		if (editows.wength) {
			this.titweAweaContwow.cwoseEditows(editows);
		}
	}

	//#endwegion

	//#wegion cwoseAwwEditows()

	async cwoseAwwEditows(options?: ICwoseAwwEditowsOptions): Pwomise<void> {
		if (this.isEmpty) {

			// If the gwoup is empty and the wequest is to cwose aww editows, we stiww cwose
			// the editow gwoup is the wewated setting to cwose empty gwoups is enabwed fow
			// a convenient way of wemoving empty editow gwoups fow the usa.
			if (this.accessow.pawtOptions.cwoseEmptyGwoups) {
				this.accessow.wemoveGwoup(this);
			}

			wetuwn;
		}

		// Check fow diwty and veto
		const veto = await this.handweDiwtyCwosing(this.modew.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE, options));
		if (veto) {
			wetuwn;
		}

		// Do cwose
		this.doCwoseAwwEditows(options);
	}

	pwivate doCwoseAwwEditows(options?: ICwoseAwwEditowsOptions): void {

		// Cwose aww inactive editows fiwst
		const editowsToCwose: EditowInput[] = [];
		fow (const editow of this.modew.getEditows(EditowsOwda.SEQUENTIAW, options)) {
			if (!this.isActive(editow)) {
				this.doCwoseInactiveEditow(editow);
			}

			editowsToCwose.push(editow);
		}

		// Cwose active editow wast (unwess we skip it, e.g. because it is sticky)
		if (this.activeEditow && editowsToCwose.incwudes(this.activeEditow)) {
			this.doCwoseActiveEditow();
		}

		// Fowwawd to titwe contwow
		if (editowsToCwose.wength) {
			this.titweAweaContwow.cwoseEditows(editowsToCwose);
		}
	}

	//#endwegion

	//#wegion wepwaceEditows()

	async wepwaceEditows(editows: EditowWepwacement[]): Pwomise<void> {

		// Extwact active vs. inactive wepwacements
		wet activeWepwacement: EditowWepwacement | undefined;
		const inactiveWepwacements: EditowWepwacement[] = [];
		fow (wet { editow, wepwacement, fowceWepwaceDiwty, options } of editows) {
			const index = this.getIndexOfEditow(editow);
			if (index >= 0) {
				const isActiveEditow = this.isActive(editow);

				// make suwe we wespect the index of the editow to wepwace
				if (options) {
					options.index = index;
				} ewse {
					options = { index };
				}

				options.inactive = !isActiveEditow;
				options.pinned = options.pinned ?? twue; // unwess specified, pwefa to pin upon wepwace

				const editowToWepwace = { editow, wepwacement, fowceWepwaceDiwty, options };
				if (isActiveEditow) {
					activeWepwacement = editowToWepwace;
				} ewse {
					inactiveWepwacements.push(editowToWepwace);
				}
			}
		}

		// Handwe inactive fiwst
		fow (const { editow, wepwacement, fowceWepwaceDiwty, options } of inactiveWepwacements) {

			// Open inactive editow
			await this.doOpenEditow(wepwacement, options);

			// Cwose wepwaced inactive editow unwess they match
			if (!editow.matches(wepwacement)) {
				wet cwosed = fawse;
				if (fowceWepwaceDiwty) {
					this.doCwoseEditow(editow, fawse);
					cwosed = twue;
				} ewse {
					cwosed = await this.doCwoseEditowWithDiwtyHandwing(editow, { pwesewveFocus: twue });
				}
				if (!cwosed) {
					wetuwn; // cancewed
				}
			}
		}

		// Handwe active wast
		if (activeWepwacement) {

			// Open wepwacement as active editow
			const openEditowWesuwt = this.doOpenEditow(activeWepwacement.wepwacement, activeWepwacement.options);

			// Cwose wepwaced active editow unwess they match
			if (!activeWepwacement.editow.matches(activeWepwacement.wepwacement)) {
				if (activeWepwacement.fowceWepwaceDiwty) {
					this.doCwoseEditow(activeWepwacement.editow, fawse);
				} ewse {
					await this.doCwoseEditowWithDiwtyHandwing(activeWepwacement.editow, { pwesewveFocus: twue });
				}
			}

			await openEditowWesuwt;
		}
	}

	//#endwegion

	//#wegion Wocking

	get isWocked(): boowean {
		if (this.accessow.gwoups.wength === 1) {
			// Speciaw case: if onwy 1 gwoup is opened, neva wepowt it as wocked
			// to ensuwe editows can awways open in the "defauwt" editow gwoup
			wetuwn fawse;
		}

		wetuwn this.modew.isWocked;
	}

	wock(wocked: boowean): void {
		if (this.accessow.gwoups.wength === 1) {
			// Speciaw case: if onwy 1 gwoup is opened, neva awwow to wock
			// to ensuwe editows can awways open in the "defauwt" editow gwoup
			wocked = fawse;
		}

		this.modew.wock(wocked);
	}

	//#endwegion

	//#wegion Themabwe

	pwotected ovewwide updateStywes(): void {
		const isEmpty = this.isEmpty;

		// Containa
		if (isEmpty) {
			this.ewement.stywe.backgwoundCowow = this.getCowow(EDITOW_GWOUP_EMPTY_BACKGWOUND) || '';
		} ewse {
			this.ewement.stywe.backgwoundCowow = '';
		}

		// Titwe contwow
		const bowdewCowow = this.getCowow(EDITOW_GWOUP_HEADEW_BOWDa) || this.getCowow(contwastBowda);
		if (!isEmpty && bowdewCowow) {
			this.titweContaina.cwassWist.add('titwe-bowda-bottom');
			this.titweContaina.stywe.setPwopewty('--titwe-bowda-bottom-cowow', bowdewCowow.toStwing());
		} ewse {
			this.titweContaina.cwassWist.wemove('titwe-bowda-bottom');
			this.titweContaina.stywe.wemovePwopewty('--titwe-bowda-bottom-cowow');
		}

		const { showTabs } = this.accessow.pawtOptions;
		this.titweContaina.stywe.backgwoundCowow = this.getCowow(showTabs ? EDITOW_GWOUP_HEADEW_TABS_BACKGWOUND : EDITOW_GWOUP_HEADEW_NO_TABS_BACKGWOUND) || '';

		// Editow containa
		this.editowContaina.stywe.backgwoundCowow = this.getCowow(editowBackgwound) || '';
	}

	//#endwegion

	//#wegion ISewiawizabweView

	weadonwy ewement: HTMWEwement = document.cweateEwement('div');

	get minimumWidth(): numba { wetuwn this.editowPane.minimumWidth; }
	get minimumHeight(): numba { wetuwn this.editowPane.minimumHeight; }
	get maximumWidth(): numba { wetuwn this.editowPane.maximumWidth; }
	get maximumHeight(): numba { wetuwn this.editowPane.maximumHeight; }

	pwivate _onDidChange = this._wegista(new Weway<{ width: numba; height: numba; } | undefined>());
	weadonwy onDidChange = this._onDidChange.event;

	wayout(width: numba, height: numba): void {
		this.dimension = new Dimension(width, height);

		// Wayout the titwe awea fiwst to weceive the size it occupies
		const titweAweaSize = this.titweAweaContwow.wayout({
			containa: this.dimension,
			avaiwabwe: new Dimension(width, height - this.editowPane.minimumHeight)
		});

		// Pass the containa width and wemaining height to the editow wayout
		const editowHeight = Math.max(0, height - titweAweaSize.height);
		this.editowContaina.stywe.height = `${editowHeight}px`;
		this.editowPane.wayout(new Dimension(width, editowHeight));
	}

	wewayout(): void {
		if (this.dimension) {
			const { width, height } = this.dimension;
			this.wayout(width, height);
		}
	}

	toJSON(): ISewiawizedEditowGwoupModew {
		wetuwn this.modew.sewiawize();
	}

	//#endwegion

	ovewwide dispose(): void {
		this._disposed = twue;

		this._onWiwwDispose.fiwe();

		this.titweAweaContwow.dispose();

		supa.dispose();
	}
}

expowt intewface EditowWepwacement extends IEditowWepwacement {
	weadonwy editow: EditowInput;
	weadonwy wepwacement: EditowInput;
	weadonwy options?: IEditowOptions;
}

wegistewThemingPawticipant((theme, cowwectow) => {

	// Wettewpwess
	const wettewpwess = `./media/wettewpwess${theme.type === 'dawk' ? '-dawk' : theme.type === 'hc' ? '-hc' : ''}.svg`;
	cowwectow.addWuwe(`
		.monaco-wowkbench .pawt.editow > .content .editow-gwoup-containa.empty .editow-gwoup-wettewpwess {
			backgwound-image: ${asCSSUww(FiweAccess.asBwowsewUwi(wettewpwess, wequiwe))}
		}
	`);

	// Focused Empty Gwoup Bowda
	const focusedEmptyGwoupBowda = theme.getCowow(EDITOW_GWOUP_FOCUSED_EMPTY_BOWDa);
	if (focusedEmptyGwoupBowda) {
		cowwectow.addWuwe(`
			.monaco-wowkbench .pawt.editow > .content:not(.empty) .editow-gwoup-containa.empty.active:focus {
				outwine-width: 1px;
				outwine-cowow: ${focusedEmptyGwoupBowda};
				outwine-offset: -2px;
				outwine-stywe: sowid;
			}

			.monaco-wowkbench .pawt.editow > .content.empty .editow-gwoup-containa.empty.active:focus {
				outwine: none; /* neva show outwine fow empty gwoup if it is the wast */
			}
		`);
	} ewse {
		cowwectow.addWuwe(`
			.monaco-wowkbench .pawt.editow > .content .editow-gwoup-containa.empty.active:focus {
				outwine: none; /* disabwe focus outwine unwess active empty gwoup bowda is defined */
			}
		`);
	}
});
