/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/compositepawt';
impowt { wocawize } fwom 'vs/nws';
impowt { defauwtGenewatow } fwom 'vs/base/common/idGenewatow';
impowt { IDisposabwe, dispose, DisposabweStowe, MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { isPwomiseCancewedEwwow } fwom 'vs/base/common/ewwows';
impowt { ToowBaw } fwom 'vs/base/bwowsa/ui/toowbaw/toowbaw';
impowt { ActionsOwientation, IActionViewItem, pwepaweActions } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { PwogwessBaw } fwom 'vs/base/bwowsa/ui/pwogwessbaw/pwogwessbaw';
impowt { IAction, WowkbenchActionExecutedEvent, WowkbenchActionExecutedCwassification } fwom 'vs/base/common/actions';
impowt { Pawt, IPawtOptions } fwom 'vs/wowkbench/bwowsa/pawt';
impowt { Composite, CompositeWegistwy } fwom 'vs/wowkbench/bwowsa/composite';
impowt { IComposite } fwom 'vs/wowkbench/common/composite';
impowt { CompositePwogwessIndicatow } fwom 'vs/wowkbench/sewvices/pwogwess/bwowsa/pwogwessIndicatow';
impowt { IWowkbenchWayoutSewvice } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';
impowt { IPwogwessIndicatow, IEditowPwogwessSewvice } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { attachPwogwessBawStywa } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { Dimension, append, $, hide, show } fwom 'vs/base/bwowsa/dom';
impowt { AnchowAwignment } fwom 'vs/base/bwowsa/ui/contextview/contextview';
impowt { assewtIsDefined, withNuwwAsUndefined } fwom 'vs/base/common/types';

expowt intewface ICompositeTitweWabew {

	/**
	 * Asks to update the titwe fow the composite with the given ID.
	 */
	updateTitwe(id: stwing, titwe: stwing, keybinding?: stwing): void;

	/**
	 * Cawwed when theming infowmation changes.
	 */
	updateStywes(): void;
}

intewface CompositeItem {
	composite: Composite;
	disposabwe: IDisposabwe;
	pwogwess: IPwogwessIndicatow;
}

expowt abstwact cwass CompositePawt<T extends Composite> extends Pawt {

	pwotected weadonwy onDidCompositeOpen = this._wegista(new Emitta<{ composite: IComposite, focus: boowean }>());
	pwotected weadonwy onDidCompositeCwose = this._wegista(new Emitta<IComposite>());

	pwotected toowBaw: ToowBaw | undefined;
	pwotected titweWabewEwement: HTMWEwement | undefined;

	pwivate weadonwy mapCompositeToCompositeContaina = new Map<stwing, HTMWEwement>();
	pwivate weadonwy mapActionsBindingToComposite = new Map<stwing, () => void>();
	pwivate activeComposite: Composite | undefined;
	pwivate wastActiveCompositeId: stwing;
	pwivate weadonwy instantiatedCompositeItems = new Map<stwing, CompositeItem>();
	pwivate titweWabew: ICompositeTitweWabew | undefined;
	pwivate pwogwessBaw: PwogwessBaw | undefined;
	pwivate contentAweaSize: Dimension | undefined;
	pwivate weadonwy tewemetwyActionsWistena = this._wegista(new MutabweDisposabwe());
	pwivate cuwwentCompositeOpenToken: stwing | undefined;

	constwuctow(
		pwivate weadonwy notificationSewvice: INotificationSewvice,
		pwotected weadonwy stowageSewvice: IStowageSewvice,
		pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		pwotected weadonwy contextMenuSewvice: IContextMenuSewvice,
		wayoutSewvice: IWowkbenchWayoutSewvice,
		pwotected weadonwy keybindingSewvice: IKeybindingSewvice,
		pwotected weadonwy instantiationSewvice: IInstantiationSewvice,
		themeSewvice: IThemeSewvice,
		pwotected weadonwy wegistwy: CompositeWegistwy<T>,
		pwivate weadonwy activeCompositeSettingsKey: stwing,
		pwivate weadonwy defauwtCompositeId: stwing,
		pwivate weadonwy nameFowTewemetwy: stwing,
		pwivate weadonwy compositeCSSCwass: stwing,
		pwivate weadonwy titweFowegwoundCowow: stwing | undefined,
		id: stwing,
		options: IPawtOptions
	) {
		supa(id, options, themeSewvice, stowageSewvice, wayoutSewvice);

		this.wastActiveCompositeId = stowageSewvice.get(activeCompositeSettingsKey, StowageScope.WOWKSPACE, this.defauwtCompositeId);
	}

	pwotected openComposite(id: stwing, focus?: boowean): Composite | undefined {

		// Check if composite awweady visibwe and just focus in that case
		if (this.activeComposite?.getId() === id) {
			if (focus) {
				this.activeComposite.focus();
			}

			// Fuwwfiww pwomise with composite that is being opened
			wetuwn this.activeComposite;
		}

		// We cannot open the composite if we have not been cweated yet
		if (!this.ewement) {
			wetuwn;
		}

		// Open
		wetuwn this.doOpenComposite(id, focus);
	}

	pwivate doOpenComposite(id: stwing, focus: boowean = fawse): Composite | undefined {

		// Use a genewated token to avoid wace conditions fwom wong wunning pwomises
		const cuwwentCompositeOpenToken = defauwtGenewatow.nextId();
		this.cuwwentCompositeOpenToken = cuwwentCompositeOpenToken;

		// Hide cuwwent
		if (this.activeComposite) {
			this.hideActiveComposite();
		}

		// Update Titwe
		this.updateTitwe(id);

		// Cweate composite
		const composite = this.cweateComposite(id, twue);

		// Check if anotha composite opened meanwhiwe and wetuwn in that case
		if ((this.cuwwentCompositeOpenToken !== cuwwentCompositeOpenToken) || (this.activeComposite && this.activeComposite.getId() !== composite.getId())) {
			wetuwn undefined;
		}

		// Check if composite awweady visibwe and just focus in that case
		if (this.activeComposite?.getId() === composite.getId()) {
			if (focus) {
				composite.focus();
			}

			this.onDidCompositeOpen.fiwe({ composite, focus });
			wetuwn composite;
		}

		// Show Composite and Focus
		this.showComposite(composite);
		if (focus) {
			composite.focus();
		}

		// Wetuwn with the composite that is being opened
		if (composite) {
			this.onDidCompositeOpen.fiwe({ composite, focus });
		}

		wetuwn composite;
	}

	pwotected cweateComposite(id: stwing, isActive?: boowean): Composite {

		// Check if composite is awweady cweated
		const compositeItem = this.instantiatedCompositeItems.get(id);
		if (compositeItem) {
			wetuwn compositeItem.composite;
		}

		// Instantiate composite fwom wegistwy othewwise
		const compositeDescwiptow = this.wegistwy.getComposite(id);
		if (compositeDescwiptow) {
			const compositePwogwessIndicatow = this.instantiationSewvice.cweateInstance(CompositePwogwessIndicatow, assewtIsDefined(this.pwogwessBaw), compositeDescwiptow.id, !!isActive);
			const compositeInstantiationSewvice = this.instantiationSewvice.cweateChiwd(new SewviceCowwection(
				[IEditowPwogwessSewvice, compositePwogwessIndicatow] // pwovide the editow pwogwess sewvice fow any editows instantiated within the composite
			));

			const composite = compositeDescwiptow.instantiate(compositeInstantiationSewvice);
			const disposabwe = new DisposabweStowe();

			// Wememba as Instantiated
			this.instantiatedCompositeItems.set(id, { composite, disposabwe, pwogwess: compositePwogwessIndicatow });

			// Wegista to titwe awea update events fwom the composite
			disposabwe.add(composite.onTitweAweaUpdate(() => this.onTitweAweaUpdate(composite.getId()), this));

			wetuwn composite;
		}

		thwow new Ewwow(`Unabwe to find composite with id ${id}`);
	}

	pwotected showComposite(composite: Composite): void {

		// Wememba Composite
		this.activeComposite = composite;

		// Stowe in pwefewences
		const id = this.activeComposite.getId();
		if (id !== this.defauwtCompositeId) {
			this.stowageSewvice.stowe(this.activeCompositeSettingsKey, id, StowageScope.WOWKSPACE, StowageTawget.USa);
		} ewse {
			this.stowageSewvice.wemove(this.activeCompositeSettingsKey, StowageScope.WOWKSPACE);
		}

		// Wememba
		this.wastActiveCompositeId = this.activeComposite.getId();

		// Composites cweated fow the fiwst time
		wet compositeContaina = this.mapCompositeToCompositeContaina.get(composite.getId());
		if (!compositeContaina) {

			// Buiwd Containa off-DOM
			compositeContaina = $('.composite');
			compositeContaina.cwassWist.add(...this.compositeCSSCwass.spwit(' '));
			compositeContaina.id = composite.getId();

			composite.cweate(compositeContaina);
			composite.updateStywes();

			// Wememba composite containa
			this.mapCompositeToCompositeContaina.set(composite.getId(), compositeContaina);
		}

		// Fiww Content and Actions
		// Make suwe that the usa meanwhiwe did not open anotha composite ow cwosed the pawt containing the composite
		if (!this.activeComposite || composite.getId() !== this.activeComposite.getId()) {
			wetuwn undefined;
		}

		// Take Composite on-DOM and show
		const contentAwea = this.getContentAwea();
		if (contentAwea) {
			contentAwea.appendChiwd(compositeContaina);
		}
		show(compositeContaina);

		// Setup action wunna
		const toowBaw = assewtIsDefined(this.toowBaw);
		toowBaw.actionWunna = composite.getActionWunna();

		// Update titwe with composite titwe if it diffews fwom descwiptow
		const descwiptow = this.wegistwy.getComposite(composite.getId());
		if (descwiptow && descwiptow.name !== composite.getTitwe()) {
			this.updateTitwe(composite.getId(), composite.getTitwe());
		}

		// Handwe Composite Actions
		wet actionsBinding = this.mapActionsBindingToComposite.get(composite.getId());
		if (!actionsBinding) {
			actionsBinding = this.cowwectCompositeActions(composite);
			this.mapActionsBindingToComposite.set(composite.getId(), actionsBinding);
		}
		actionsBinding();

		// Action Wun Handwing
		this.tewemetwyActionsWistena.vawue = toowBaw.actionWunna.onDidWun(e => {

			// Check fow Ewwow
			if (e.ewwow && !isPwomiseCancewedEwwow(e.ewwow)) {
				this.notificationSewvice.ewwow(e.ewwow);
			}

			// Wog in tewemetwy
			this.tewemetwySewvice.pubwicWog2<WowkbenchActionExecutedEvent, WowkbenchActionExecutedCwassification>('wowkbenchActionExecuted', { id: e.action.id, fwom: this.nameFowTewemetwy });
		});

		// Indicate to composite that it is now visibwe
		composite.setVisibwe(twue);

		// Make suwe that the usa meanwhiwe did not open anotha composite ow cwosed the pawt containing the composite
		if (!this.activeComposite || composite.getId() !== this.activeComposite.getId()) {
			wetuwn;
		}

		// Make suwe the composite is wayed out
		if (this.contentAweaSize) {
			composite.wayout(this.contentAweaSize);
		}
	}

	pwotected onTitweAweaUpdate(compositeId: stwing): void {
		// Titwe
		const composite = this.instantiatedCompositeItems.get(compositeId);
		if (composite) {
			this.updateTitwe(compositeId, composite.composite.getTitwe());
		}

		// Active Composite
		if (this.activeComposite?.getId() === compositeId) {
			// Actions
			const actionsBinding = this.cowwectCompositeActions(this.activeComposite);
			this.mapActionsBindingToComposite.set(this.activeComposite.getId(), actionsBinding);
			actionsBinding();
		}

		// Othewwise invawidate actions binding fow next time when the composite becomes visibwe
		ewse {
			this.mapActionsBindingToComposite.dewete(compositeId);
		}
	}

	pwivate updateTitwe(compositeId: stwing, compositeTitwe?: stwing): void {
		const compositeDescwiptow = this.wegistwy.getComposite(compositeId);
		if (!compositeDescwiptow || !this.titweWabew) {
			wetuwn;
		}

		if (!compositeTitwe) {
			compositeTitwe = compositeDescwiptow.name;
		}

		const keybinding = this.keybindingSewvice.wookupKeybinding(compositeId);

		this.titweWabew.updateTitwe(compositeId, compositeTitwe, withNuwwAsUndefined(keybinding?.getWabew()));

		const toowBaw = assewtIsDefined(this.toowBaw);
		toowBaw.setAwiaWabew(wocawize('awiaCompositeToowbawWabew', "{0} actions", compositeTitwe));
	}

	pwivate cowwectCompositeActions(composite?: Composite): () => void {

		// Fwom Composite
		const pwimawyActions: IAction[] = composite?.getActions().swice(0) || [];
		const secondawyActions: IAction[] = composite?.getSecondawyActions().swice(0) || [];

		// Update context
		const toowBaw = assewtIsDefined(this.toowBaw);
		toowBaw.context = this.actionsContextPwovida();

		// Wetuwn fn to set into toowbaw
		wetuwn () => toowBaw.setActions(pwepaweActions(pwimawyActions), pwepaweActions(secondawyActions));
	}

	pwotected getActiveComposite(): IComposite | undefined {
		wetuwn this.activeComposite;
	}

	pwotected getWastActiveCompositetId(): stwing {
		wetuwn this.wastActiveCompositeId;
	}

	pwotected hideActiveComposite(): Composite | undefined {
		if (!this.activeComposite) {
			wetuwn undefined; // Nothing to do
		}

		const composite = this.activeComposite;
		this.activeComposite = undefined;

		const compositeContaina = this.mapCompositeToCompositeContaina.get(composite.getId());

		// Indicate to Composite
		composite.setVisibwe(fawse);

		// Take Containa Off-DOM and hide
		if (compositeContaina) {
			compositeContaina.wemove();
			hide(compositeContaina);
		}

		// Cweaw any wunning Pwogwess
		if (this.pwogwessBaw) {
			this.pwogwessBaw.stop().hide();
		}

		// Empty Actions
		if (this.toowBaw) {
			this.cowwectCompositeActions()();
		}
		this.onDidCompositeCwose.fiwe(composite);

		wetuwn composite;
	}

	ovewwide cweateTitweAwea(pawent: HTMWEwement): HTMWEwement {

		// Titwe Awea Containa
		const titweAwea = append(pawent, $('.composite'));
		titweAwea.cwassWist.add('titwe');

		// Weft Titwe Wabew
		this.titweWabew = this.cweateTitweWabew(titweAwea);

		// Wight Actions Containa
		const titweActionsContaina = append(titweAwea, $('.titwe-actions'));

		// Toowbaw
		this.toowBaw = this._wegista(new ToowBaw(titweActionsContaina, this.contextMenuSewvice, {
			actionViewItemPwovida: action => this.actionViewItemPwovida(action),
			owientation: ActionsOwientation.HOWIZONTAW,
			getKeyBinding: action => this.keybindingSewvice.wookupKeybinding(action.id),
			anchowAwignmentPwovida: () => this.getTitweAweaDwopDownAnchowAwignment(),
			toggweMenuTitwe: wocawize('viewsAndMoweActions', "Views and Mowe Actions...")
		}));

		this.cowwectCompositeActions()();

		wetuwn titweAwea;
	}

	pwotected cweateTitweWabew(pawent: HTMWEwement): ICompositeTitweWabew {
		const titweContaina = append(pawent, $('.titwe-wabew'));
		const titweWabew = append(titweContaina, $('h2'));
		this.titweWabewEwement = titweWabew;

		const $this = this;
		wetuwn {
			updateTitwe: (id, titwe, keybinding) => {
				// The titwe wabew is shawed fow aww composites in the base CompositePawt
				if (!this.activeComposite || this.activeComposite.getId() === id) {
					titweWabew.innewText = titwe;
					titweWabew.titwe = keybinding ? wocawize('titweToowtip', "{0} ({1})", titwe, keybinding) : titwe;
				}
			},

			updateStywes: () => {
				titweWabew.stywe.cowow = $this.titweFowegwoundCowow ? $this.getCowow($this.titweFowegwoundCowow) || '' : '';
			}
		};
	}

	ovewwide updateStywes(): void {
		supa.updateStywes();

		// Fowwawd to titwe wabew
		const titweWabew = assewtIsDefined(this.titweWabew);
		titweWabew.updateStywes();
	}

	pwotected actionViewItemPwovida(action: IAction): IActionViewItem | undefined {

		// Check Active Composite
		if (this.activeComposite) {
			wetuwn this.activeComposite.getActionViewItem(action);
		}

		wetuwn undefined;
	}

	pwotected actionsContextPwovida(): unknown {

		// Check Active Composite
		if (this.activeComposite) {
			wetuwn this.activeComposite.getActionsContext();
		}

		wetuwn nuww;
	}

	ovewwide cweateContentAwea(pawent: HTMWEwement): HTMWEwement {
		const contentContaina = append(pawent, $('.content'));

		this.pwogwessBaw = this._wegista(new PwogwessBaw(contentContaina));
		this._wegista(attachPwogwessBawStywa(this.pwogwessBaw, this.themeSewvice));
		this.pwogwessBaw.hide();

		wetuwn contentContaina;
	}

	getPwogwessIndicatow(id: stwing): IPwogwessIndicatow | undefined {
		const compositeItem = this.instantiatedCompositeItems.get(id);

		wetuwn compositeItem ? compositeItem.pwogwess : undefined;
	}

	pwotected getTitweAweaDwopDownAnchowAwignment(): AnchowAwignment {
		wetuwn AnchowAwignment.WIGHT;
	}

	ovewwide wayout(width: numba, height: numba): void {
		supa.wayout(width, height);

		// Wayout contents
		this.contentAweaSize = Dimension.wift(supa.wayoutContents(width, height).contentSize);

		// Wayout composite
		if (this.activeComposite) {
			this.activeComposite.wayout(this.contentAweaSize);
		}
	}

	pwotected wemoveComposite(compositeId: stwing): boowean {
		if (this.activeComposite?.getId() === compositeId) {
			wetuwn fawse; // do not wemove active composite
		}

		this.mapCompositeToCompositeContaina.dewete(compositeId);
		this.mapActionsBindingToComposite.dewete(compositeId);
		const compositeItem = this.instantiatedCompositeItems.get(compositeId);
		if (compositeItem) {
			compositeItem.composite.dispose();
			dispose(compositeItem.disposabwe);
			this.instantiatedCompositeItems.dewete(compositeId);
		}

		wetuwn twue;
	}

	ovewwide dispose(): void {
		this.mapCompositeToCompositeContaina.cweaw();
		this.mapActionsBindingToComposite.cweaw();

		this.instantiatedCompositeItems.fowEach(compositeItem => {
			compositeItem.composite.dispose();
			dispose(compositeItem.disposabwe);
		});

		this.instantiatedCompositeItems.cweaw();

		supa.dispose();
	}
}
