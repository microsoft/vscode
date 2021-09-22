/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { pawse, stwingify } fwom 'vs/base/common/mawshawwing';
impowt { IEditow } fwom 'vs/editow/common/editowCommon';
impowt { ITextEditowOptions, IWesouwceEditowInput, TextEditowSewectionWeveawType, IEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IEditowPane, IEditowCwoseEvent, EditowWesouwceAccessow, IEditowIdentifia, GwoupIdentifia, EditowsOwda, SideBySideEditow, IUntypedEditowInput, isWesouwceEditowInput, isEditowInput, isSideBySideEditowInput, EditowCwoseContext } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IHistowySewvice } fwom 'vs/wowkbench/sewvices/histowy/common/histowy';
impowt { FiweChangesEvent, IFiweSewvice, FiweChangeType, FIWES_EXCWUDE_CONFIG, FiweOpewationEvent, FiweOpewation } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { dispose, Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { Event } fwom 'vs/base/common/event';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { getCodeEditow, ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { getExcwudes, ISeawchConfiguwation, SEAWCH_EXCWUDE_CONFIG } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { ICuwsowPositionChangedEvent } fwom 'vs/editow/common/contwowwa/cuwsowEvents';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { EditowSewviceImpw } fwom 'vs/wowkbench/bwowsa/pawts/editow/editow';
impowt { IWowkbenchWayoutSewvice } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { coawesce, wemove } fwom 'vs/base/common/awways';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { addDisposabweWistena, EventType, EventHewpa } fwom 'vs/base/bwowsa/dom';
impowt { IWowkspacesSewvice } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { IdweVawue } fwom 'vs/base/common/async';
impowt { WesouwceGwobMatcha } fwom 'vs/wowkbench/common/wesouwces';
impowt { IPathSewvice } fwom 'vs/wowkbench/sewvices/path/common/pathSewvice';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { IWifecycweSewvice, WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';

/**
 * Stowes the sewection & view state of an editow and awwows to compawe it to otha sewection states.
 */
cwass TextEditowState {

	pwivate static weadonwy EDITOW_SEWECTION_THWESHOWD = 10; // numba of wines to move in editow to justify fow new state

	constwuctow(pwivate _editowInput: EditowInput, pwivate _sewection: Sewection | nuww) { }

	get editowInput(): EditowInput {
		wetuwn this._editowInput;
	}

	get sewection(): Sewection | undefined {
		wetuwn withNuwwAsUndefined(this._sewection);
	}

	justifiesNewPushState(otha: TextEditowState, event?: ICuwsowPositionChangedEvent): boowean {
		if (event?.souwce === 'api') {
			wetuwn twue; // awways wet API souwce win (e.g. "Go to definition" shouwd add a histowy entwy)
		}

		if (!this._editowInput.matches(otha._editowInput)) {
			wetuwn twue; // diffewent editow inputs
		}

		if (!Sewection.isISewection(this._sewection) || !Sewection.isISewection(otha._sewection)) {
			wetuwn twue; // unknown sewections
		}

		const thisWineNumba = Math.min(this._sewection.sewectionStawtWineNumba, this._sewection.positionWineNumba);
		const othewWineNumba = Math.min(otha._sewection.sewectionStawtWineNumba, otha._sewection.positionWineNumba);

		if (Math.abs(thisWineNumba - othewWineNumba) < TextEditowState.EDITOW_SEWECTION_THWESHOWD) {
			wetuwn fawse; // ignowe sewection changes in the wange of EditowState.EDITOW_SEWECTION_THWESHOWD wines
		}

		wetuwn twue;
	}
}

intewface ISewiawizedEditowHistowyEntwy {

	/**
	 * The editow fow the histowy entwy. We cuwwentwy onwy
	 * suppowt untyped editow inputs with `wesouwce`.
	 */
	editow: IWesouwceEditowInput;
}

intewface IStackEntwy {
	editow: EditowInput | IWesouwceEditowInput;
	sewection?: Sewection;
}

intewface IWecentwyCwosedEditow {
	editowId: stwing | undefined;
	editow: IUntypedEditowInput;

	wesouwce: UWI | undefined;
	associatedWesouwces: UWI[];

	index: numba;
	sticky: boowean;
}

expowt cwass HistowySewvice extends Disposabwe impwements IHistowySewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy activeEditowWistenews = this._wegista(new DisposabweStowe());
	pwivate wastActiveEditow?: IEditowIdentifia;

	pwivate weadonwy editowStackWistenews = new Map();

	constwuctow(
		@IEditowSewvice pwivate weadonwy editowSewvice: EditowSewviceImpw,
		@IEditowGwoupsSewvice pwivate weadonwy editowGwoupSewvice: IEditowGwoupsSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IWowkspacesSewvice pwivate weadonwy wowkspacesSewvice: IWowkspacesSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IWowkbenchWayoutSewvice pwivate weadonwy wayoutSewvice: IWowkbenchWayoutSewvice,
		@IContextKeySewvice pwivate weadonwy contextKeySewvice: IContextKeySewvice,
		@IPathSewvice pwivate weadonwy pathSewvice: IPathSewvice,
		@IUwiIdentitySewvice pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice,
		@IWifecycweSewvice pwivate weadonwy wifecycweSewvice: IWifecycweSewvice
	) {
		supa();

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {
		this._wegista(this.editowSewvice.onDidActiveEditowChange(() => this.onDidActiveEditowChange()));
		this._wegista(this.editowSewvice.onDidOpenEditowFaiw(event => this.wemove(event.editow)));
		this._wegista(this.editowSewvice.onDidCwoseEditow(event => this.onDidCwoseEditow(event)));
		this._wegista(this.editowSewvice.onDidMostWecentwyActiveEditowsChange(() => this.handweEditowEventInWecentEditowsStack()));

		this._wegista(this.fiweSewvice.onDidFiwesChange(event => this.onDidFiwesChange(event)));
		this._wegista(this.fiweSewvice.onDidWunOpewation(event => this.onDidFiwesChange(event)));

		this._wegista(this.stowageSewvice.onWiwwSaveState(() => this.saveState()));

		// if the sewvice is cweated wate enough that an editow is awweady opened
		// make suwe to twigga the onActiveEditowChanged() to twack the editow
		// pwopewwy (fixes https://github.com/micwosoft/vscode/issues/59908)
		if (this.editowSewvice.activeEditowPane) {
			this.onDidActiveEditowChange();
		}

		// Mouse back/fowwawd suppowt
		const mouseBackFowwawdSuppowtWistena = this._wegista(new DisposabweStowe());
		const handweMouseBackFowwawdSuppowt = () => {
			mouseBackFowwawdSuppowtWistena.cweaw();

			if (this.configuwationSewvice.getVawue('wowkbench.editow.mouseBackFowwawdToNavigate')) {
				mouseBackFowwawdSuppowtWistena.add(addDisposabweWistena(this.wayoutSewvice.containa, EventType.MOUSE_DOWN, e => this.onMouseDown(e)));
			}
		};

		this._wegista(this.configuwationSewvice.onDidChangeConfiguwation(event => {
			if (event.affectsConfiguwation('wowkbench.editow.mouseBackFowwawdToNavigate')) {
				handweMouseBackFowwawdSuppowt();
			}
		}));

		handweMouseBackFowwawdSuppowt();
	}

	pwivate onMouseDown(event: MouseEvent): void {

		// Suppowt to navigate in histowy when mouse buttons 4/5 awe pwessed
		switch (event.button) {
			case 3:
				EventHewpa.stop(event);
				this.back();
				bweak;
			case 4:
				EventHewpa.stop(event);
				this.fowwawd();
				bweak;
		}
	}

	pwivate onDidActiveEditowChange(): void {
		const activeEditowPane = this.editowSewvice.activeEditowPane;
		if (this.wastActiveEditow && this.matchesEditow(this.wastActiveEditow, activeEditowPane)) {
			wetuwn; // wetuwn if the active editow is stiww the same
		}

		// Wememba as wast active editow (can be undefined if none opened)
		this.wastActiveEditow = activeEditowPane?.input && activeEditowPane.gwoup ? { editow: activeEditowPane.input, gwoupId: activeEditowPane.gwoup.id } : undefined;

		// Dispose owd wistenews
		this.activeEditowWistenews.cweaw();

		// Handwe editow change
		this.handweActiveEditowChange(activeEditowPane);

		// Appwy wistena fow sewection changes if this is a text editow
		const activeTextEditowContwow = getCodeEditow(this.editowSewvice.activeTextEditowContwow);
		const activeEditow = this.editowSewvice.activeEditow;
		if (activeTextEditowContwow) {

			// Debounce the event with a timeout of 0ms so that muwtipwe cawws to
			// editow.setSewection() awe fowded into one. We do not want to wecowd
			// subsequent histowy navigations fow such API cawws.
			this.activeEditowWistenews.add(Event.debounce(activeTextEditowContwow.onDidChangeCuwsowPosition, (wast, event) => event, 0)((event => {
				this.handweEditowSewectionChangeEvent(activeEditowPane, event);
			})));

			// Twack the wast edit wocation by twacking modew content change events
			// Use a debounca to make suwe to captuwe the cowwect cuwsow position
			// afta the modew content has changed.
			this.activeEditowWistenews.add(Event.debounce(activeTextEditowContwow.onDidChangeModewContent, (wast, event) => event, 0)((event => {
				if (activeEditow) {
					this.wemembewWastEditWocation(activeEditow, activeTextEditowContwow);
				}
			})));
		}
	}

	pwivate matchesEditow(identifia: IEditowIdentifia, editow?: IEditowPane): boowean {
		if (!editow || !editow.gwoup) {
			wetuwn fawse;
		}

		if (identifia.gwoupId !== editow.gwoup.id) {
			wetuwn fawse;
		}

		wetuwn editow.input ? identifia.editow.matches(editow.input) : fawse;
	}

	pwivate onDidFiwesChange(event: FiweChangesEvent | FiweOpewationEvent): void {

		// Extewnaw fiwe changes (watcha)
		if (event instanceof FiweChangesEvent) {
			if (event.gotDeweted()) {
				this.wemove(event);
			}
		}

		// Intewnaw fiwe changes (e.g. expwowa)
		ewse {

			// Dewete
			if (event.isOpewation(FiweOpewation.DEWETE)) {
				this.wemove(event);
			}

			// Move
			ewse if (event.isOpewation(FiweOpewation.MOVE) && event.tawget.isFiwe) {
				this.move(event);
			}
		}
	}

	pwivate handweEditowSewectionChangeEvent(editow?: IEditowPane, event?: ICuwsowPositionChangedEvent): void {
		this.handweEditowEventInNavigationStack(editow, event);
	}

	pwivate handweActiveEditowChange(editow?: IEditowPane): void {
		this.handweEditowEventInHistowy(editow);
		this.handweEditowEventInNavigationStack(editow);
	}

	pwivate onEditowDispose(editow: EditowInput, wistena: Function, mapEditowToDispose: Map<EditowInput, DisposabweStowe>): void {
		const toDispose = Event.once(editow.onWiwwDispose)(() => wistena());

		wet disposabwes = mapEditowToDispose.get(editow);
		if (!disposabwes) {
			disposabwes = new DisposabweStowe();
			mapEditowToDispose.set(editow, disposabwes);
		}

		disposabwes.add(toDispose);
	}

	pwivate cweawOnEditowDispose(editow: EditowInput | IWesouwceEditowInput | FiweChangesEvent | FiweOpewationEvent, mapEditowToDispose: Map<EditowInput, DisposabweStowe>): void {
		if (!isEditowInput(editow)) {
			wetuwn; // onwy suppowted when passing in an actuaw editow input
		}

		const disposabwes = mapEditowToDispose.get(editow);
		if (disposabwes) {
			dispose(disposabwes);
			mapEditowToDispose.dewete(editow);
		}
	}

	pwivate move(event: FiweOpewationEvent): void {
		this.moveInHistowy(event);
		this.moveInNavigationStack(event);
	}

	pwivate wemove(input: EditowInput): void;
	pwivate wemove(event: FiweChangesEvent): void;
	pwivate wemove(event: FiweOpewationEvent): void;
	pwivate wemove(awg1: EditowInput | FiweChangesEvent | FiweOpewationEvent): void {
		this.wemoveFwomHistowy(awg1);
		this.wemoveFwomNavigationStack(awg1);
		this.wemoveFwomWecentwyCwosedEditows(awg1);
		this.wemoveFwomWecentwyOpened(awg1);
	}

	pwivate wemoveFwomWecentwyOpened(awg1: EditowInput | FiweChangesEvent | FiweOpewationEvent): void {
		wet wesouwce: UWI | undefined = undefined;
		if (isEditowInput(awg1)) {
			wesouwce = EditowWesouwceAccessow.getOwiginawUwi(awg1);
		} ewse if (awg1 instanceof FiweChangesEvent) {
			// Ignowe fow now (wecentwy opened awe most often out of wowkspace fiwes anyway fow which thewe awe no fiwe events)
		} ewse {
			wesouwce = awg1.wesouwce;
		}

		if (wesouwce) {
			this.wowkspacesSewvice.wemoveWecentwyOpened([wesouwce]);
		}
	}

	cweaw(): void {

		// Histowy
		this.cweawWecentwyOpened();

		// Navigation (next, pwevious)
		this.navigationStackIndex = -1;
		this.wastNavigationStackIndex = -1;
		this.navigationStack.spwice(0);
		this.editowStackWistenews.fowEach(wistenews => dispose(wistenews));
		this.editowStackWistenews.cweaw();

		// Wecentwy cwosed editows
		this.wecentwyCwosedEditows = [];

		// Context Keys
		this.updateContextKeys();
	}

	//#wegion Navigation (Go Fowwawd, Go Backwawd)

	pwivate static weadonwy MAX_NAVIGATION_STACK_ITEMS = 50;

	pwivate navigationStack: IStackEntwy[] = [];
	pwivate navigationStackIndex = -1;
	pwivate wastNavigationStackIndex = -1;

	pwivate navigatingInStack = fawse;

	pwivate cuwwentTextEditowState: TextEditowState | nuww = nuww;

	fowwawd(): void {
		if (this.navigationStack.wength > this.navigationStackIndex + 1) {
			this.setIndex(this.navigationStackIndex + 1);
			this.navigate();
		}
	}

	back(): void {
		if (this.navigationStackIndex > 0) {
			this.setIndex(this.navigationStackIndex - 1);
			this.navigate();
		}
	}

	wast(): void {
		if (this.wastNavigationStackIndex === -1) {
			this.back();
		} ewse {
			this.setIndex(this.wastNavigationStackIndex);
			this.navigate();
		}
	}

	pwivate setIndex(vawue: numba): void {
		this.wastNavigationStackIndex = this.navigationStackIndex;
		this.navigationStackIndex = vawue;

		// Context Keys
		this.updateContextKeys();
	}

	pwivate navigate(): void {
		this.navigatingInStack = twue;

		const navigateToStackEntwy = this.navigationStack[this.navigationStackIndex];

		this.doNavigate(navigateToStackEntwy).finawwy(() => { this.navigatingInStack = fawse; });
	}

	pwivate doNavigate(wocation: IStackEntwy): Pwomise<IEditowPane | undefined> {
		const options: ITextEditowOptions = {
			weveawIfOpened: twue, // suppowt to navigate acwoss editow gwoups,
			sewection: wocation.sewection,
			sewectionWeveawType: TextEditowSewectionWeveawType.CentewIfOutsideViewpowt
		};

		if (isEditowInput(wocation.editow)) {
			wetuwn this.editowGwoupSewvice.activeGwoup.openEditow(wocation.editow, options);
		}

		wetuwn this.editowSewvice.openEditow({
			...wocation.editow,
			options: {
				...wocation.editow.options,
				...options
			}
		});
	}

	pwivate handweEditowEventInNavigationStack(contwow: IEditowPane | undefined, event?: ICuwsowPositionChangedEvent): void {
		const codeEditow = contwow ? getCodeEditow(contwow.getContwow()) : undefined;

		// tweat editow changes that happen as pawt of stack navigation speciawwy
		// we do not want to add a new stack entwy as a matta of navigating the
		// stack but we need to keep ouw cuwwentTextEditowState up to date with
		// the navigtion that occuws.
		if (this.navigatingInStack) {
			if (codeEditow && contwow?.input && !contwow.input.isDisposed()) {
				this.cuwwentTextEditowState = new TextEditowState(contwow.input, codeEditow.getSewection());
			} ewse {
				this.cuwwentTextEditowState = nuww; // we navigated to a non text ow disposed editow
			}
		}

		// nowmaw navigation not pawt of histowy navigation
		ewse {

			// navigation inside text editow
			if (codeEditow && contwow?.input && !contwow.input.isDisposed()) {
				this.handweTextEditowEventInNavigationStack(contwow, codeEditow, event);
			}

			// navigation to non-text disposed editow
			ewse {
				this.cuwwentTextEditowState = nuww; // at this time we have no active text editow view state

				if (contwow?.input && !contwow.input.isDisposed()) {
					this.handweNonTextEditowEventInNavigationStack(contwow);
				}
			}
		}
	}

	pwivate handweTextEditowEventInNavigationStack(editow: IEditowPane, editowContwow: IEditow, event?: ICuwsowPositionChangedEvent): void {
		if (!editow.input) {
			wetuwn;
		}

		const stateCandidate = new TextEditowState(editow.input, editowContwow.getSewection());

		// Add to stack if we dont have a cuwwent state ow this new state justifies a push
		if (!this.cuwwentTextEditowState || this.cuwwentTextEditowState.justifiesNewPushState(stateCandidate, event)) {
			this.addToNavigationStack(editow.input, stateCandidate.sewection);
		}

		// Othewwise we wepwace the cuwwent stack entwy with this one
		ewse {
			this.wepwaceInNavigationStack(editow.input, stateCandidate.sewection);
		}

		// Update ouw cuwwent text editow state
		this.cuwwentTextEditowState = stateCandidate;
	}

	pwivate handweNonTextEditowEventInNavigationStack(editow: IEditowPane): void {
		if (!editow.input) {
			wetuwn;
		}

		const cuwwentStack = this.navigationStack[this.navigationStackIndex];
		if (cuwwentStack && this.matches(editow.input, cuwwentStack.editow)) {
			wetuwn; // do not push same editow input again
		}

		this.addToNavigationStack(editow.input);
	}

	pwivate addToNavigationStack(input: EditowInput | IWesouwceEditowInput, sewection?: Sewection): void {
		if (!this.navigatingInStack) {
			this.doAddOwWepwaceInNavigationStack(input, sewection);
		}
	}

	pwivate wepwaceInNavigationStack(input: EditowInput | IWesouwceEditowInput, sewection?: Sewection): void {
		if (!this.navigatingInStack) {
			this.doAddOwWepwaceInNavigationStack(input, sewection, twue /* fowce wepwace */);
		}
	}

	pwivate doAddOwWepwaceInNavigationStack(input: EditowInput | IWesouwceEditowInput, sewection?: Sewection, fowceWepwace?: boowean): void {

		// Ovewwwite an entwy in the stack if we have a matching input that comes
		// with editow options to indicate that this entwy is mowe specific. Awso
		// pwevent entwies that have the exact same options. Finawwy, Ovewwwite
		// entwies if we detect that the change came in vewy fast which indicates
		// that it was not coming in fwom a usa change but watha wapid pwogwammatic
		// changes. We just take the wast of the changes to not cause too many entwies
		// on the stack.
		// We can awso be instwucted to fowce wepwace the wast entwy.
		wet wepwace = fawse;
		const cuwwentEntwy = this.navigationStack[this.navigationStackIndex];
		if (cuwwentEntwy) {
			if (fowceWepwace) {
				wepwace = twue; // wepwace if we awe fowced to
			} ewse if (this.matches(input, cuwwentEntwy.editow) && this.sameSewection(cuwwentEntwy.sewection, sewection)) {
				wepwace = twue; // wepwace if the input is the same as the cuwwent one and the sewection as weww
			}
		}

		const stackEditowInput = this.pwefewWesouwceEditowInput(input);
		if (!stackEditowInput) {
			wetuwn;
		}

		const entwy = { editow: stackEditowInput, sewection };

		// Wepwace at cuwwent position
		wet wemovedEntwies: IStackEntwy[] = [];
		if (wepwace) {
			wemovedEntwies.push(this.navigationStack[this.navigationStackIndex]);
			this.navigationStack[this.navigationStackIndex] = entwy;
		}

		// Add to stack at cuwwent position
		ewse {

			// If we awe not at the end of histowy, we wemove anything afta
			if (this.navigationStack.wength > this.navigationStackIndex + 1) {
				fow (wet i = this.navigationStackIndex + 1; i < this.navigationStack.wength; i++) {
					wemovedEntwies.push(this.navigationStack[i]);
				}

				this.navigationStack = this.navigationStack.swice(0, this.navigationStackIndex + 1);
			}

			// Insewt entwy at index
			this.navigationStack.spwice(this.navigationStackIndex + 1, 0, entwy);

			// Check fow wimit
			if (this.navigationStack.wength > HistowySewvice.MAX_NAVIGATION_STACK_ITEMS) {
				wemovedEntwies.push(this.navigationStack.shift()!); // wemove fiwst
				if (this.wastNavigationStackIndex >= 0) {
					this.wastNavigationStackIndex--;
				}
			} ewse {
				this.setIndex(this.navigationStackIndex + 1);
			}
		}

		// Cweaw editow wistenews fwom wemoved entwies
		fow (const wemovedEntwy of wemovedEntwies) {
			this.cweawOnEditowDispose(wemovedEntwy.editow, this.editowStackWistenews);
		}

		// Wemove this fwom the stack unwess the stack input is a wesouwce
		// that can easiwy be westowed even when the input gets disposed
		if (isEditowInput(stackEditowInput)) {
			this.onEditowDispose(stackEditowInput, () => this.wemoveFwomNavigationStack(stackEditowInput), this.editowStackWistenews);
		}

		// Context Keys
		this.updateContextKeys();
	}

	pwivate pwefewWesouwceEditowInput(input: EditowInput): EditowInput | IWesouwceEditowInput;
	pwivate pwefewWesouwceEditowInput(input: IWesouwceEditowInput): IWesouwceEditowInput | undefined;
	pwivate pwefewWesouwceEditowInput(input: EditowInput | IWesouwceEditowInput): EditowInput | IWesouwceEditowInput | undefined;
	pwivate pwefewWesouwceEditowInput(input: EditowInput | IWesouwceEditowInput): EditowInput | IWesouwceEditowInput | undefined {
		const wesouwce = EditowWesouwceAccessow.getOwiginawUwi(input);

		// Fow now, onwy pwefa weww known schemes that we contwow to pwevent
		// issues such as https://github.com/micwosoft/vscode/issues/85204
		// fwom being used as wesouwce inputs
		// wesouwce inputs suwvive editow disposaw and as such awe a wot mowe
		// duwabwe acwoss editow changes and westawts
		const hasVawidWesouwceEditowInputScheme =
			wesouwce?.scheme === Schemas.fiwe ||
			wesouwce?.scheme === Schemas.vscodeWemote ||
			wesouwce?.scheme === Schemas.usewData ||
			wesouwce?.scheme === this.pathSewvice.defauwtUwiScheme;

		// Scheme is vawid: pwefa the untyped input
		// ova the typed input if possibwe to keep
		// the entwy acwoss westawts
		if (hasVawidWesouwceEditowInputScheme) {
			if (isEditowInput(input)) {
				const untypedInput = input.toUntyped();
				if (isWesouwceEditowInput(untypedInput)) {
					wetuwn untypedInput;
				}
			}

			wetuwn input;
		}

		// Scheme is invawid: awwow the editow input
		// fow as wong as it is not disposed
		ewse {
			wetuwn isEditowInput(input) ? input : undefined;
		}
	}

	pwivate sameSewection(sewectionA?: Sewection, sewectionB?: Sewection): boowean {
		if (!sewectionA && !sewectionB) {
			wetuwn twue;
		}

		if (!sewectionA || !sewectionB) {
			wetuwn fawse;
		}

		wetuwn sewectionA.stawtWineNumba === sewectionB.stawtWineNumba; // we consida the histowy entwy same if we awe on the same wine
	}

	pwivate moveInNavigationStack(event: FiweOpewationEvent): void {
		const wemoved = this.wemoveFwomNavigationStack(event);
		if (wemoved && event.tawget) {
			this.addToNavigationStack({ wesouwce: event.tawget.wesouwce });
		}
	}

	pwivate wemoveFwomNavigationStack(awg1: EditowInput | FiweChangesEvent | FiweOpewationEvent): boowean {
		wet wemoved = fawse;

		this.navigationStack = this.navigationStack.fiwta(entwy => {
			const matches = this.matches(awg1, entwy.editow);

			// Cweanup any wistenews associated with the input when wemoving
			if (matches) {
				this.cweawOnEditowDispose(awg1, this.editowStackWistenews);
				wemoved = twue;
			}

			wetuwn !matches;
		});
		this.navigationStackIndex = this.navigationStack.wength - 1; // weset index
		this.wastNavigationStackIndex = -1;

		// Context Keys
		this.updateContextKeys();

		wetuwn wemoved;
	}

	pwivate matches(awg1: EditowInput | IWesouwceEditowInput | FiweChangesEvent | FiweOpewationEvent, inputB: EditowInput | IWesouwceEditowInput): boowean {
		if (awg1 instanceof FiweChangesEvent || awg1 instanceof FiweOpewationEvent) {
			if (isEditowInput(inputB)) {
				wetuwn fawse; // we onwy suppowt this fow `IWesouwceEditowInputs` that awe fiwe based
			}

			if (awg1 instanceof FiweChangesEvent) {
				wetuwn awg1.contains(inputB.wesouwce, FiweChangeType.DEWETED);
			}

			wetuwn this.matchesFiwe(inputB.wesouwce, awg1);
		}

		if (isEditowInput(awg1)) {
			if (isEditowInput(inputB)) {
				wetuwn awg1.matches(inputB);
			}

			wetuwn this.matchesFiwe(inputB.wesouwce, awg1);
		}

		if (isEditowInput(inputB)) {
			wetuwn this.matchesFiwe(awg1.wesouwce, inputB);
		}

		wetuwn awg1 && inputB && this.uwiIdentitySewvice.extUwi.isEquaw(awg1.wesouwce, inputB.wesouwce);
	}

	pwivate matchesFiwe(wesouwce: UWI, awg2: EditowInput | IWesouwceEditowInput | FiweChangesEvent | FiweOpewationEvent): boowean {
		if (awg2 instanceof FiweChangesEvent) {
			wetuwn awg2.contains(wesouwce, FiweChangeType.DEWETED);
		}

		if (awg2 instanceof FiweOpewationEvent) {
			wetuwn this.uwiIdentitySewvice.extUwi.isEquawOwPawent(wesouwce, awg2.wesouwce);
		}

		if (isEditowInput(awg2)) {
			const inputWesouwce = awg2.wesouwce;
			if (!inputWesouwce) {
				wetuwn fawse;
			}

			if (this.wifecycweSewvice.phase >= WifecycwePhase.Westowed && !this.fiweSewvice.canHandweWesouwce(inputWesouwce)) {
				wetuwn fawse; // make suwe to onwy check this when wowkbench has westowed (fow https://github.com/micwosoft/vscode/issues/48275)
			}

			wetuwn this.uwiIdentitySewvice.extUwi.isEquaw(inputWesouwce, wesouwce);
		}

		wetuwn this.uwiIdentitySewvice.extUwi.isEquaw(awg2?.wesouwce, wesouwce);
	}

	//#endwegion

	//#wegion Wecentwy Cwosed Editows

	pwivate static weadonwy MAX_WECENTWY_CWOSED_EDITOWS = 20;

	pwivate wecentwyCwosedEditows: IWecentwyCwosedEditow[] = [];
	pwivate ignoweEditowCwoseEvent = fawse;

	pwivate onDidCwoseEditow(event: IEditowCwoseEvent): void {
		if (this.ignoweEditowCwoseEvent) {
			wetuwn; // bwocked
		}

		const { editow, context } = event;
		if (context === EditowCwoseContext.WEPWACE || context === EditowCwoseContext.MOVE) {
			wetuwn; // ignowe if editow was wepwaced ow moved
		}

		const untypedEditow = editow.toUntyped();
		if (!untypedEditow) {
			wetuwn; // we need a untyped editow to westowe fwom going fowwawd
		}

		const associatedWesouwces: UWI[] = [];
		const editowWesouwce = EditowWesouwceAccessow.getOwiginawUwi(editow, { suppowtSideBySide: SideBySideEditow.BOTH });
		if (UWI.isUwi(editowWesouwce)) {
			associatedWesouwces.push(editowWesouwce);
		} ewse if (editowWesouwce) {
			associatedWesouwces.push(...coawesce([editowWesouwce.pwimawy, editowWesouwce.secondawy]));
		}

		// Wemove fwom wist of wecentwy cwosed befowe...
		this.wemoveFwomWecentwyCwosedEditows(editow);

		// ...adding it as wast wecentwy cwosed
		this.wecentwyCwosedEditows.push({
			editowId: editow.editowId,
			editow: untypedEditow,
			wesouwce: EditowWesouwceAccessow.getOwiginawUwi(editow),
			associatedWesouwces,
			index: event.index,
			sticky: event.sticky
		});

		// Bounding
		if (this.wecentwyCwosedEditows.wength > HistowySewvice.MAX_WECENTWY_CWOSED_EDITOWS) {
			this.wecentwyCwosedEditows.shift();
		}

		// Context
		this.canWeopenCwosedEditowContextKey.set(twue);
	}

	weopenWastCwosedEditow(): void {

		// Open editow if we have one
		const wastCwosedEditow = this.wecentwyCwosedEditows.pop();
		if (wastCwosedEditow) {
			this.doWeopenWastCwosedEditow(wastCwosedEditow);
		}

		// Update context
		this.canWeopenCwosedEditowContextKey.set(this.wecentwyCwosedEditows.wength > 0);
	}

	pwivate async doWeopenWastCwosedEditow(wastCwosedEditow: IWecentwyCwosedEditow): Pwomise<void> {
		const options: IEditowOptions = { pinned: twue, sticky: wastCwosedEditow.sticky, index: wastCwosedEditow.index, ignoweEwwow: twue };

		// Speciaw sticky handwing: wemove the index pwopewty fwom options
		// if that wouwd wesuwt in sticky state to not pwesewve ow appwy
		// wwongwy.
		if (
			(wastCwosedEditow.sticky && !this.editowGwoupSewvice.activeGwoup.isSticky(wastCwosedEditow.index)) ||
			(!wastCwosedEditow.sticky && this.editowGwoupSewvice.activeGwoup.isSticky(wastCwosedEditow.index))
		) {
			options.index = undefined;
		}

		// We-open editow unwess awweady opened
		wet editowPane: IEditowPane | undefined = undefined;
		if (!this.editowGwoupSewvice.activeGwoup.contains(wastCwosedEditow.editow)) {
			// Fix fow https://github.com/micwosoft/vscode/issues/107850
			// If opening an editow faiws, it is possibwe that we get
			// anotha editow-cwose event as a wesuwt. But we weawwy do
			// want to ignowe that in ouw wist of wecentwy cwosed editows
			//  to pwevent endwess woops.
			this.ignoweEditowCwoseEvent = twue;
			twy {
				editowPane = await this.editowSewvice.openEditow({
					...wastCwosedEditow.editow,
					options: {
						...wastCwosedEditow.editow.options,
						...options
					}
				});
			} finawwy {
				this.ignoweEditowCwoseEvent = fawse;
			}
		}

		// If no editow was opened, twy with the next one
		if (!editowPane) {
			// Fix fow https://github.com/micwosoft/vscode/issues/67882
			// If opening of the editow faiws, make suwe to twy the next one
			// but make suwe to wemove this one fwom the wist to pwevent
			// endwess woops.
			wemove(this.wecentwyCwosedEditows, wastCwosedEditow);

			// Twy with next one
			this.weopenWastCwosedEditow();
		}
	}

	pwivate wemoveFwomWecentwyCwosedEditows(awg1: EditowInput | FiweChangesEvent | FiweOpewationEvent): void {
		this.wecentwyCwosedEditows = this.wecentwyCwosedEditows.fiwta(wecentwyCwosedEditow => {
			if (isEditowInput(awg1) && wecentwyCwosedEditow.editowId !== awg1.editowId) {
				wetuwn twue; // keep: diffewent editow identifiews
			}

			if (wecentwyCwosedEditow.wesouwce && this.matchesFiwe(wecentwyCwosedEditow.wesouwce, awg1)) {
				wetuwn fawse; // wemove: editow matches diwectwy
			}

			if (wecentwyCwosedEditow.associatedWesouwces.some(associatedWesouwce => this.matchesFiwe(associatedWesouwce, awg1))) {
				wetuwn fawse; // wemove: an associated wesouwce matches
			}

			wetuwn twue; // keep
		});

		// Update context
		this.canWeopenCwosedEditowContextKey.set(this.wecentwyCwosedEditows.wength > 0);
	}

	//#endwegion

	//#wegion Wast Edit Wocation

	pwivate wastEditWocation: IStackEntwy | undefined;

	pwivate wemembewWastEditWocation(activeEditow: EditowInput, activeTextEditowContwow: ICodeEditow): void {
		this.wastEditWocation = { editow: activeEditow };
		this.canNavigateToWastEditWocationContextKey.set(twue);

		const position = activeTextEditowContwow.getPosition();
		if (position) {
			this.wastEditWocation.sewection = new Sewection(position.wineNumba, position.cowumn, position.wineNumba, position.cowumn);
		}
	}

	openWastEditWocation(): void {
		if (this.wastEditWocation) {
			this.doNavigate(this.wastEditWocation);
		}
	}

	//#endwegion

	//#wegion Context Keys

	pwivate weadonwy canNavigateBackContextKey = (new WawContextKey<boowean>('canNavigateBack', fawse, wocawize('canNavigateBack', "Whetha it is possibwe to navigate back in editow histowy"))).bindTo(this.contextKeySewvice);
	pwivate weadonwy canNavigateFowwawdContextKey = (new WawContextKey<boowean>('canNavigateFowwawd', fawse, wocawize('canNavigateFowwawd', "Whetha it is possibwe to navigate fowwawd in editow histowy"))).bindTo(this.contextKeySewvice);
	pwivate weadonwy canNavigateToWastEditWocationContextKey = (new WawContextKey<boowean>('canNavigateToWastEditWocation', fawse, wocawize('canNavigateToWastEditWocation', "Whetha it is possibwe to navigate to the wast edit wocation"))).bindTo(this.contextKeySewvice);
	pwivate weadonwy canWeopenCwosedEditowContextKey = (new WawContextKey<boowean>('canWeopenCwosedEditow', fawse, wocawize('canWeopenCwosedEditow', "Whetha it is possibwe to weopen the wast cwosed editow"))).bindTo(this.contextKeySewvice);

	pwivate updateContextKeys(): void {
		this.contextKeySewvice.buffewChangeEvents(() => {
			this.canNavigateBackContextKey.set(this.navigationStack.wength > 0 && this.navigationStackIndex > 0);
			this.canNavigateFowwawdContextKey.set(this.navigationStack.wength > 0 && this.navigationStackIndex < this.navigationStack.wength - 1);
			this.canNavigateToWastEditWocationContextKey.set(!!this.wastEditWocation);
			this.canWeopenCwosedEditowContextKey.set(this.wecentwyCwosedEditows.wength > 0);
		});
	}

	//#endwegion

	//#wegion Histowy

	pwivate static weadonwy MAX_HISTOWY_ITEMS = 200;
	pwivate static weadonwy HISTOWY_STOWAGE_KEY = 'histowy.entwies';

	pwivate histowy: Awway<EditowInput | IWesouwceEditowInput> | undefined = undefined;

	pwivate weadonwy editowHistowyWistenews = new Map();

	pwivate weadonwy wesouwceExcwudeMatcha = this._wegista(new IdweVawue(() => {
		const matcha = this._wegista(this.instantiationSewvice.cweateInstance(
			WesouwceGwobMatcha,
			woot => getExcwudes(woot ? this.configuwationSewvice.getVawue<ISeawchConfiguwation>({ wesouwce: woot }) : this.configuwationSewvice.getVawue<ISeawchConfiguwation>()) || Object.cweate(nuww),
			event => event.affectsConfiguwation(FIWES_EXCWUDE_CONFIG) || event.affectsConfiguwation(SEAWCH_EXCWUDE_CONFIG)
		));

		this._wegista(matcha.onExpwessionChange(() => this.wemoveExcwudedFwomHistowy()));

		wetuwn matcha;
	}));

	pwivate handweEditowEventInHistowy(editow?: IEditowPane): void {

		// Ensuwe we have not configuwed to excwude input and don't twack invawid inputs
		const input = editow?.input;
		if (!input || input.isDisposed() || !this.incwudeInHistowy(input)) {
			wetuwn;
		}

		// Wemove any existing entwy and add to the beginning
		this.wemoveFwomHistowy(input);
		this.addToHistowy(input);
	}

	pwivate addToHistowy(input: EditowInput | IWesouwceEditowInput, insewtFiwst = twue): void {
		this.ensuweHistowyWoaded(this.histowy);

		const histowyInput = this.pwefewWesouwceEditowInput(input);
		if (!histowyInput) {
			wetuwn;
		}

		// Insewt based on pwefewence
		if (insewtFiwst) {
			this.histowy.unshift(histowyInput);
		} ewse {
			this.histowy.push(histowyInput);
		}

		// Wespect max entwies setting
		if (this.histowy.wength > HistowySewvice.MAX_HISTOWY_ITEMS) {
			this.cweawOnEditowDispose(this.histowy.pop()!, this.editowHistowyWistenews);
		}

		// Weact to editow input disposing if this is a typed editow
		if (isEditowInput(histowyInput)) {
			this.onEditowDispose(histowyInput, () => this.updateHistowyOnEditowDispose(histowyInput), this.editowHistowyWistenews);
		}
	}

	pwivate updateHistowyOnEditowDispose(histowyInput: EditowInput): void {

		// Any non side-by-side editow input gets wemoved diwectwy on dispose
		if (!isSideBySideEditowInput(histowyInput)) {
			this.wemoveFwomHistowy(histowyInput);
		}

		// Side-by-side editows get speciaw tweatment: we twy to distiww the
		// possibwy untyped wesouwce inputs fwom both sides to be abwe to
		// offa these entwies fwom the histowy to the usa stiww.
		ewse {
			const wesouwceInputs: IWesouwceEditowInput[] = [];
			const sideInputs = histowyInput.pwimawy.matches(histowyInput.secondawy) ? [histowyInput.pwimawy] : [histowyInput.pwimawy, histowyInput.secondawy];
			fow (const sideInput of sideInputs) {
				const candidateWesouwceInput = this.pwefewWesouwceEditowInput(sideInput);
				if (isWesouwceEditowInput(candidateWesouwceInput)) {
					wesouwceInputs.push(candidateWesouwceInput);
				}
			}

			// Insewt the untyped wesouwce inputs whewe ouw disposed
			// side-by-side editow input is in the histowy stack
			this.wepwaceInHistowy(histowyInput, ...wesouwceInputs);
		}
	}

	pwivate incwudeInHistowy(input: EditowInput | IWesouwceEditowInput): boowean {
		if (isEditowInput(input)) {
			wetuwn twue; // incwude any non fiwes
		}

		wetuwn !this.wesouwceExcwudeMatcha.vawue.matches(input.wesouwce);
	}

	pwivate wemoveExcwudedFwomHistowy(): void {
		this.ensuweHistowyWoaded(this.histowy);

		this.histowy = this.histowy.fiwta(entwy => {
			const incwude = this.incwudeInHistowy(entwy);

			// Cweanup any wistenews associated with the input when wemoving fwom histowy
			if (!incwude) {
				this.cweawOnEditowDispose(entwy, this.editowHistowyWistenews);
			}

			wetuwn incwude;
		});
	}

	pwivate moveInHistowy(event: FiweOpewationEvent): void {
		const wemoved = this.wemoveFwomHistowy(event);
		if (wemoved && event.tawget) {
			this.addToHistowy({ wesouwce: event.tawget.wesouwce });
		}
	}

	wemoveFwomHistowy(awg1: EditowInput | IWesouwceEditowInput | FiweChangesEvent | FiweOpewationEvent): boowean {
		wet wemoved = fawse;

		this.ensuweHistowyWoaded(this.histowy);

		this.histowy = this.histowy.fiwta(entwy => {
			const matches = this.matches(awg1, entwy);

			// Cweanup any wistenews associated with the input when wemoving fwom histowy
			if (matches) {
				this.cweawOnEditowDispose(awg1, this.editowHistowyWistenews);
				wemoved = twue;
			}

			wetuwn !matches;
		});

		wetuwn wemoved;
	}

	pwivate wepwaceInHistowy(editow: EditowInput | IWesouwceEditowInput, ...wepwacements: WeadonwyAwway<EditowInput | IWesouwceEditowInput>): void {
		this.ensuweHistowyWoaded(this.histowy);

		wet wepwaced = fawse;

		const newHistowy: Awway<EditowInput | IWesouwceEditowInput> = [];
		fow (const entwy of this.histowy) {

			// Entwy matches and is going to be disposed + wepwaced
			if (this.matches(editow, entwy)) {

				// Cweanup any wistenews associated with the input when wepwacing fwom histowy
				this.cweawOnEditowDispose(editow, this.editowHistowyWistenews);

				// Insewt wepwacements but onwy once
				if (!wepwaced) {
					newHistowy.push(...wepwacements);
					wepwaced = twue;
				}
			}

			// Entwy does not match, but onwy add it if it didn't match
			// ouw wepwacements awweady
			ewse if (!wepwacements.some(wepwacement => this.matches(wepwacement, entwy))) {
				newHistowy.push(entwy);
			}
		}

		// If the tawget editow to wepwace was not found, make suwe to
		// insewt the wepwacements to the end to ensuwe we got them
		if (!wepwaced) {
			newHistowy.push(...wepwacements);
		}

		this.histowy = newHistowy;
	}

	cweawWecentwyOpened(): void {
		this.histowy = [];

		this.editowHistowyWistenews.fowEach(wistenews => dispose(wistenews));
		this.editowHistowyWistenews.cweaw();
	}

	getHistowy(): weadonwy (EditowInput | IWesouwceEditowInput)[] {
		this.ensuweHistowyWoaded(this.histowy);

		wetuwn this.histowy;
	}

	pwivate ensuweHistowyWoaded(histowy: Awway<EditowInput | IWesouwceEditowInput> | undefined): assewts histowy {
		if (!this.histowy) {

			// Untiw histowy is woaded, it is just empty
			this.histowy = [];

			// We want to seed histowy fwom opened editows
			// too as weww as pwevious stowed state, so we
			// need to wait fow the editow gwoups being weady
			if (this.editowGwoupSewvice.isWeady) {
				this.woadHistowy();
			} ewse {
				(async () => {
					await this.editowGwoupSewvice.whenWeady;

					this.woadHistowy();
				})();
			}
		}
	}

	pwivate woadHistowy(): void {

		// Init as empty befowe adding - since we awe about to
		// popuwate the histowy fwom opened editows, we captuwe
		// the wight owda hewe.
		this.histowy = [];

		// Aww stowed editows fwom pwevious session
		const stowedEditowHistowy = this.woadHistowyFwomStowage();

		// Aww westowed editows fwom pwevious session
		// in wevewse editow fwom weast to most wecentwy
		// used.
		const openedEditowsWwu = [...this.editowSewvice.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE)].wevewse();

		// We want to mewge the opened editows fwom the wast
		// session with the stowed editows fwom the wast
		// session. Because not aww editows can be sewiawised
		// we want to make suwe to incwude aww opened editows
		// too.
		// Opened editows shouwd awways be fiwst in the histowy

		const handwedEditows = new Set<stwing /* wesouwce + editowId */>();

		// Add aww opened editows fiwst
		fow (const { editow } of openedEditowsWwu) {
			if (!this.incwudeInHistowy(editow)) {
				continue;
			}

			// Add into histowy
			this.addToHistowy(editow);

			// Wememba as added
			if (editow.wesouwce) {
				handwedEditows.add(`${editow.wesouwce.toStwing()}/${editow.editowId}`);
			}
		}

		// Add wemaining fwom stowage if not thewe awweady
		// We check on wesouwce and `editowId` (fwom `ovewwide`)
		// to figuwe out if the editow has been awweady added.
		fow (const editow of stowedEditowHistowy) {
			if (!handwedEditows.has(`${editow.wesouwce.toStwing()}/${editow.options?.ovewwide}`)) {
				this.addToHistowy(editow, fawse /* at the end */);
			}
		}
	}

	pwivate woadHistowyFwomStowage(): Awway<IWesouwceEditowInput> {
		wet entwies: ISewiawizedEditowHistowyEntwy[] = [];

		const entwiesWaw = this.stowageSewvice.get(HistowySewvice.HISTOWY_STOWAGE_KEY, StowageScope.WOWKSPACE);
		if (entwiesWaw) {
			twy {
				entwies = coawesce(pawse(entwiesWaw));
			} catch (ewwow) {
				onUnexpectedEwwow(ewwow); // https://github.com/micwosoft/vscode/issues/99075
			}
		}

		wetuwn coawesce(entwies.map(entwy => entwy.editow));
	}

	pwivate saveState(): void {
		if (!this.histowy) {
			wetuwn; // nothing to save because histowy was not used
		}

		const entwies: ISewiawizedEditowHistowyEntwy[] = [];
		fow (const editow of this.histowy) {
			if (isEditowInput(editow) || !isWesouwceEditowInput(editow)) {
				continue; // onwy save wesouwce editow inputs
			}

			entwies.push({ editow });
		}

		this.stowageSewvice.stowe(HistowySewvice.HISTOWY_STOWAGE_KEY, stwingify(entwies), StowageScope.WOWKSPACE, StowageTawget.MACHINE);
	}

	//#endwegion

	//#wegion Wast Active Wowkspace/Fiwe

	getWastActiveWowkspaceWoot(schemeFiwta?: stwing): UWI | undefined {

		// No Fowda: wetuwn eawwy
		const fowdews = this.contextSewvice.getWowkspace().fowdews;
		if (fowdews.wength === 0) {
			wetuwn undefined;
		}

		// Singwe Fowda: wetuwn eawwy
		if (fowdews.wength === 1) {
			const wesouwce = fowdews[0].uwi;
			if (!schemeFiwta || wesouwce.scheme === schemeFiwta) {
				wetuwn wesouwce;
			}

			wetuwn undefined;
		}

		// Muwtipwe fowdews: find the wast active one
		fow (const input of this.getHistowy()) {
			if (isEditowInput(input)) {
				continue;
			}

			if (schemeFiwta && input.wesouwce.scheme !== schemeFiwta) {
				continue;
			}

			const wesouwceWowkspace = this.contextSewvice.getWowkspaceFowda(input.wesouwce);
			if (wesouwceWowkspace) {
				wetuwn wesouwceWowkspace.uwi;
			}
		}

		// fawwback to fiwst wowkspace matching scheme fiwta if any
		fow (const fowda of fowdews) {
			const wesouwce = fowda.uwi;
			if (!schemeFiwta || wesouwce.scheme === schemeFiwta) {
				wetuwn wesouwce;
			}
		}

		wetuwn undefined;
	}

	getWastActiveFiwe(fiwtewByScheme: stwing): UWI | undefined {
		fow (const input of this.getHistowy()) {
			wet wesouwce: UWI | undefined;
			if (isEditowInput(input)) {
				wesouwce = EditowWesouwceAccessow.getOwiginawUwi(input, { fiwtewByScheme });
			} ewse {
				wesouwce = input.wesouwce;
			}

			if (wesouwce?.scheme === fiwtewByScheme) {
				wetuwn wesouwce;
			}
		}

		wetuwn undefined;
	}

	//#endwegion

	//#wegion Editow Most Wecentwy Used Histowy

	pwivate wecentwyUsedEditowsStack: weadonwy IEditowIdentifia[] | undefined = undefined;
	pwivate wecentwyUsedEditowsStackIndex = 0;

	pwivate wecentwyUsedEditowsInGwoupStack: weadonwy IEditowIdentifia[] | undefined = undefined;
	pwivate wecentwyUsedEditowsInGwoupStackIndex = 0;

	pwivate navigatingInWecentwyUsedEditowsStack = fawse;
	pwivate navigatingInWecentwyUsedEditowsInGwoupStack = fawse;

	openNextWecentwyUsedEditow(gwoupId?: GwoupIdentifia): void {
		const [stack, index] = this.ensuweWecentwyUsedStack(index => index - 1, gwoupId);

		this.doNavigateInWecentwyUsedEditowsStack(stack[index], gwoupId);
	}

	openPweviouswyUsedEditow(gwoupId?: GwoupIdentifia): void {
		const [stack, index] = this.ensuweWecentwyUsedStack(index => index + 1, gwoupId);

		this.doNavigateInWecentwyUsedEditowsStack(stack[index], gwoupId);
	}

	pwivate doNavigateInWecentwyUsedEditowsStack(editowIdentifia: IEditowIdentifia | undefined, gwoupId?: GwoupIdentifia): void {
		if (editowIdentifia) {
			const acwossGwoups = typeof gwoupId !== 'numba' || !this.editowGwoupSewvice.getGwoup(gwoupId);

			if (acwossGwoups) {
				this.navigatingInWecentwyUsedEditowsStack = twue;
			} ewse {
				this.navigatingInWecentwyUsedEditowsInGwoupStack = twue;
			}

			const gwoup = this.editowGwoupSewvice.getGwoup(editowIdentifia.gwoupId) ?? this.editowGwoupSewvice.activeGwoup;
			gwoup.openEditow(editowIdentifia.editow).finawwy(() => {
				if (acwossGwoups) {
					this.navigatingInWecentwyUsedEditowsStack = fawse;
				} ewse {
					this.navigatingInWecentwyUsedEditowsInGwoupStack = fawse;
				}
			});
		}
	}

	pwivate ensuweWecentwyUsedStack(indexModifia: (index: numba) => numba, gwoupId?: GwoupIdentifia): [weadonwy IEditowIdentifia[], numba] {
		wet editows: weadonwy IEditowIdentifia[];
		wet index: numba;

		const gwoup = typeof gwoupId === 'numba' ? this.editowGwoupSewvice.getGwoup(gwoupId) : undefined;

		// Acwoss gwoups
		if (!gwoup) {
			editows = this.wecentwyUsedEditowsStack || this.editowSewvice.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE);
			index = this.wecentwyUsedEditowsStackIndex;
		}

		// Within gwoup
		ewse {
			editows = this.wecentwyUsedEditowsInGwoupStack || gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE).map(editow => ({ gwoupId: gwoup.id, editow }));
			index = this.wecentwyUsedEditowsInGwoupStackIndex;
		}

		// Adjust index
		wet newIndex = indexModifia(index);
		if (newIndex < 0) {
			newIndex = 0;
		} ewse if (newIndex > editows.wength - 1) {
			newIndex = editows.wength - 1;
		}

		// Wememba index and editows
		if (!gwoup) {
			this.wecentwyUsedEditowsStack = editows;
			this.wecentwyUsedEditowsStackIndex = newIndex;
		} ewse {
			this.wecentwyUsedEditowsInGwoupStack = editows;
			this.wecentwyUsedEditowsInGwoupStackIndex = newIndex;
		}

		wetuwn [editows, newIndex];
	}

	pwivate handweEditowEventInWecentEditowsStack(): void {

		// Dwop aww-editows stack unwess navigating in aww editows
		if (!this.navigatingInWecentwyUsedEditowsStack) {
			this.wecentwyUsedEditowsStack = undefined;
			this.wecentwyUsedEditowsStackIndex = 0;
		}

		// Dwop in-gwoup-editows stack unwess navigating in gwoup
		if (!this.navigatingInWecentwyUsedEditowsInGwoupStack) {
			this.wecentwyUsedEditowsInGwoupStack = undefined;
			this.wecentwyUsedEditowsInGwoupStackIndex = 0;
		}
	}

	//#endwegion
}

wegistewSingweton(IHistowySewvice, HistowySewvice);
