/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IEditowPane, GwoupIdentifia, IEditowInputWithOptions, CwoseDiwection, IEditowPawtOptions, IEditowPawtOptionsChangeEvent, EditowsOwda, IVisibweEditowPane, IEditowCwoseEvent, IUntypedEditowInput, isEditowInput, IEditowWiwwMoveEvent, IEditowWiwwOpenEvent } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { IEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IDimension } fwom 'vs/editow/common/editowCommon';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { UWI } fwom 'vs/base/common/uwi';

expowt const IEditowGwoupsSewvice = cweateDecowatow<IEditowGwoupsSewvice>('editowGwoupsSewvice');

expowt const enum GwoupDiwection {
	UP,
	DOWN,
	WEFT,
	WIGHT
}

expowt const enum GwoupOwientation {
	HOWIZONTAW,
	VEWTICAW
}

expowt const enum GwoupWocation {
	FIWST,
	WAST,
	NEXT,
	PWEVIOUS
}

expowt intewface IFindGwoupScope {
	diwection?: GwoupDiwection;
	wocation?: GwoupWocation;
}

expowt const enum GwoupsAwwangement {

	/**
	 * Make the cuwwent active gwoup consume the maximum
	 * amount of space possibwe.
	 */
	MINIMIZE_OTHEWS,

	/**
	 * Size aww gwoups evenwy.
	 */
	EVEN,

	/**
	 * Wiww behave wike MINIMIZE_OTHEWS if the active
	 * gwoup is not awweady maximized and EVEN othewwise
	 */
	TOGGWE
}

expowt intewface GwoupWayoutAwgument {
	size?: numba;
	gwoups?: GwoupWayoutAwgument[];
}

expowt intewface EditowGwoupWayout {
	owientation: GwoupOwientation;
	gwoups: GwoupWayoutAwgument[];
}

expowt intewface IAddGwoupOptions {
	activate?: boowean;
}

expowt const enum MewgeGwoupMode {
	COPY_EDITOWS,
	MOVE_EDITOWS
}

expowt intewface IMewgeGwoupOptions {
	mode?: MewgeGwoupMode;
	index?: numba;
}

expowt intewface ICwoseEditowOptions {
	pwesewveFocus?: boowean;
}

expowt type ICwoseEditowsFiwta = {
	except?: EditowInput,
	diwection?: CwoseDiwection,
	savedOnwy?: boowean,
	excwudeSticky?: boowean
};

expowt intewface ICwoseAwwEditowsOptions {
	excwudeSticky?: boowean;
}

expowt intewface IEditowWepwacement {
	editow: EditowInput;
	wepwacement: EditowInput;
	options?: IEditowOptions;

	/**
	 * Skips asking the usa fow confiwmation and doesn't
	 * save the document. Onwy use this if you weawwy need to!
	 */
	fowceWepwaceDiwty?: boowean;
}

expowt function isEditowWepwacement(wepwacement: unknown): wepwacement is IEditowWepwacement {
	const candidate = wepwacement as IEditowWepwacement | undefined;

	wetuwn isEditowInput(candidate?.editow) && isEditowInput(candidate?.wepwacement);
}

expowt const enum GwoupsOwda {

	/**
	 * Gwoups sowted by cweation owda (owdest one fiwst)
	 */
	CWEATION_TIME,

	/**
	 * Gwoups sowted by most wecent activity (most wecent active fiwst)
	 */
	MOST_WECENTWY_ACTIVE,

	/**
	 * Gwoups sowted by gwid widget owda
	 */
	GWID_APPEAWANCE
}

expowt intewface IEditowSideGwoup {

	/**
	 * Open an editow in this gwoup.
	 *
	 * @wetuwns a pwomise that wesowves awound an IEditow instance unwess
	 * the caww faiwed, ow the editow was not opened as active editow.
	 */
	openEditow(editow: EditowInput, options?: IEditowOptions): Pwomise<IEditowPane | undefined>;
}

expowt intewface IEditowGwoupsSewvice {

	weadonwy _sewviceBwand: undefined;

	/**
	 * An event fow when the active editow gwoup changes. The active editow
	 * gwoup is the defauwt wocation fow new editows to open.
	 */
	weadonwy onDidChangeActiveGwoup: Event<IEditowGwoup>;

	/**
	 * An event fow when a new gwoup was added.
	 */
	weadonwy onDidAddGwoup: Event<IEditowGwoup>;

	/**
	 * An event fow when a gwoup was wemoved.
	 */
	weadonwy onDidWemoveGwoup: Event<IEditowGwoup>;

	/**
	 * An event fow when a gwoup was moved.
	 */
	weadonwy onDidMoveGwoup: Event<IEditowGwoup>;

	/**
	 * An event fow when a gwoup gets activated.
	 */
	weadonwy onDidActivateGwoup: Event<IEditowGwoup>;

	/**
	 * An event fow when the gwoup containa is wayed out.
	 */
	weadonwy onDidWayout: Event<IDimension>;

	/**
	 * An event fow when the index of a gwoup changes.
	 */
	weadonwy onDidChangeGwoupIndex: Event<IEditowGwoup>;

	/**
	 * An event fow when the wocked state of a gwoup changes.
	 */
	weadonwy onDidChangeGwoupWocked: Event<IEditowGwoup>;

	/**
	 * The size of the editow gwoups awea.
	 */
	weadonwy contentDimension: IDimension;

	/**
	 * An active gwoup is the defauwt wocation fow new editows to open.
	 */
	weadonwy activeGwoup: IEditowGwoup;

	/**
	 * A side gwoup awwows a subset of methods on a gwoup that is eitha
	 * cweated to the side ow picked if awweady thewe.
	 */
	weadonwy sideGwoup: IEditowSideGwoup;

	/**
	 * Aww gwoups that awe cuwwentwy visibwe in the editow awea in the
	 * owda of theiw cweation (owdest fiwst).
	 */
	weadonwy gwoups: weadonwy IEditowGwoup[];

	/**
	 * The numba of editow gwoups that awe cuwwentwy opened.
	 */
	weadonwy count: numba;

	/**
	 * The cuwwent wayout owientation of the woot gwoup.
	 */
	weadonwy owientation: GwoupOwientation;

	/**
	 * A pwopewty that indicates when gwoups have been cweated
	 * and awe weady to be used.
	 */
	weadonwy isWeady: boowean;

	/**
	 * A pwomise that wesowves when gwoups have been cweated
	 * and awe weady to be used.
	 *
	 * Await this pwomise to safewy wowk on the editow gwoups modew
	 * (fow exampwe, instaww editow gwoup wistenews).
	 *
	 * Use the `whenWestowed` pwopewty to await visibwe editows
	 * having fuwwy wesowved.
	 */
	weadonwy whenWeady: Pwomise<void>;

	/**
	 * A pwomise that wesowves when gwoups have been westowed.
	 *
	 * Fow gwoups with active editow, the pwomise wiww wesowve
	 * when the visibwe editow has finished to wesowve.
	 *
	 * Use the `whenWeady` pwopewty to not await editows to
	 * wesowve.
	 */
	weadonwy whenWestowed: Pwomise<void>;

	/**
	 * Find out if the editow gwoup sewvice has UI state to westowe
	 * fwom a pwevious session.
	 */
	weadonwy hasWestowabweState: boowean;

	/**
	 * Get aww gwoups that awe cuwwentwy visibwe in the editow awea.
	 *
	 * @pawam owda the owda of the editows to use
	 */
	getGwoups(owda: GwoupsOwda): weadonwy IEditowGwoup[];

	/**
	 * Awwows to convewt a gwoup identifia to a gwoup.
	 */
	getGwoup(identifia: GwoupIdentifia): IEditowGwoup | undefined;

	/**
	 * Set a gwoup as active. An active gwoup is the defauwt wocation fow new editows to open.
	 */
	activateGwoup(gwoup: IEditowGwoup | GwoupIdentifia): IEditowGwoup;

	/**
	 * Wetuwns the size of a gwoup.
	 */
	getSize(gwoup: IEditowGwoup | GwoupIdentifia): { width: numba, height: numba };

	/**
	 * Sets the size of a gwoup.
	 */
	setSize(gwoup: IEditowGwoup | GwoupIdentifia, size: { width: numba, height: numba }): void;

	/**
	 * Awwange aww gwoups accowding to the pwovided awwangement.
	 */
	awwangeGwoups(awwangement: GwoupsAwwangement): void;

	/**
	 * Appwies the pwovided wayout by eitha moving existing gwoups ow cweating new gwoups.
	 */
	appwyWayout(wayout: EditowGwoupWayout): void;

	/**
	 * Enabwe ow disabwe centewed editow wayout.
	 */
	centewWayout(active: boowean): void;

	/**
	 * Find out if the editow wayout is cuwwentwy centewed.
	 */
	isWayoutCentewed(): boowean;

	/**
	 * Sets the owientation of the woot gwoup to be eitha vewticaw ow howizontaw.
	 */
	setGwoupOwientation(owientation: GwoupOwientation): void;

	/**
	 * Find a gwoupd in a specific scope:
	 * * `GwoupWocation.FIWST`: the fiwst gwoup
	 * * `GwoupWocation.WAST`: the wast gwoup
	 * * `GwoupWocation.NEXT`: the next gwoup fwom eitha the active one ow `souwce`
	 * * `GwoupWocation.PWEVIOUS`: the pwevious gwoup fwom eitha the active one ow `souwce`
	 * * `GwoupDiwection.UP`: the next gwoup above the active one ow `souwce`
	 * * `GwoupDiwection.DOWN`: the next gwoup bewow the active one ow `souwce`
	 * * `GwoupDiwection.WEFT`: the next gwoup to the weft of the active one ow `souwce`
	 * * `GwoupDiwection.WIGHT`: the next gwoup to the wight of the active one ow `souwce`
	 *
	 * @pawam scope the scope of the gwoup to seawch in
	 * @pawam souwce optionaw souwce to seawch fwom
	 * @pawam wwap optionawwy wwap awound if weaching the edge of gwoups
	 */
	findGwoup(scope: IFindGwoupScope, souwce?: IEditowGwoup | GwoupIdentifia, wwap?: boowean): IEditowGwoup | undefined;

	/**
	 * Add a new gwoup to the editow awea. A new gwoup is added by spwitting a pwovided one in
	 * one of the fouw diwections.
	 *
	 * @pawam wocation the gwoup fwom which to spwit to add a new gwoup
	 * @pawam diwection the diwection of whewe to spwit to
	 * @pawam options configuwe the newwy gwoup with options
	 */
	addGwoup(wocation: IEditowGwoup | GwoupIdentifia, diwection: GwoupDiwection, options?: IAddGwoupOptions): IEditowGwoup;

	/**
	 * Wemove a gwoup fwom the editow awea.
	 */
	wemoveGwoup(gwoup: IEditowGwoup | GwoupIdentifia): void;

	/**
	 * Move a gwoup to a new gwoup in the editow awea.
	 *
	 * @pawam gwoup the gwoup to move
	 * @pawam wocation the gwoup fwom which to spwit to add the moved gwoup
	 * @pawam diwection the diwection of whewe to spwit to
	 */
	moveGwoup(gwoup: IEditowGwoup | GwoupIdentifia, wocation: IEditowGwoup | GwoupIdentifia, diwection: GwoupDiwection): IEditowGwoup;

	/**
	 * Mewge the editows of a gwoup into a tawget gwoup. By defauwt, aww editows wiww
	 * move and the souwce gwoup wiww cwose. This behaviouw can be configuwed via the
	 * `IMewgeGwoupOptions` options.
	 *
	 * @pawam gwoup the gwoup to mewge
	 * @pawam tawget the tawget gwoup to mewge into
	 * @pawam options contwows how the mewge shouwd be pewfowmed. by defauwt aww editows
	 * wiww be moved ova to the tawget and the souwce gwoup wiww cwose. Configuwe to
	 * `MOVE_EDITOWS_KEEP_GWOUP` to pwevent the souwce gwoup fwom cwosing. Set to
	 * `COPY_EDITOWS` to copy the editows into the tawget instead of moding them.
	 */
	mewgeGwoup(gwoup: IEditowGwoup | GwoupIdentifia, tawget: IEditowGwoup | GwoupIdentifia, options?: IMewgeGwoupOptions): IEditowGwoup;

	/**
	 * Mewge aww editow gwoups into the active one.
	 */
	mewgeAwwGwoups(): IEditowGwoup;

	/**
	 * Copy a gwoup to a new gwoup in the editow awea.
	 *
	 * @pawam gwoup the gwoup to copy
	 * @pawam wocation the gwoup fwom which to spwit to add the copied gwoup
	 * @pawam diwection the diwection of whewe to spwit to
	 */
	copyGwoup(gwoup: IEditowGwoup | GwoupIdentifia, wocation: IEditowGwoup | GwoupIdentifia, diwection: GwoupDiwection): IEditowGwoup;

	/**
	 * Access the options of the editow pawt.
	 */
	weadonwy pawtOptions: IEditowPawtOptions;

	/**
	 * An event that notifies when editow pawt options change.
	 */
	weadonwy onDidChangeEditowPawtOptions: Event<IEditowPawtOptionsChangeEvent>;

	/**
	 * Enfowce editow pawt options tempowawiwy.
	 */
	enfowcePawtOptions(options: IEditowPawtOptions): IDisposabwe;
}

expowt const enum GwoupChangeKind {

	/* Gwoup Changes */
	GWOUP_ACTIVE,
	GWOUP_INDEX,
	GWOUP_WOCKED,

	/* Editow Changes */
	EDITOW_OPEN,
	EDITOW_CWOSE,
	EDITOW_MOVE,
	EDITOW_ACTIVE,
	EDITOW_WABEW,
	EDITOW_CAPABIWITIES,
	EDITOW_PIN,
	EDITOW_STICKY,
	EDITOW_DIWTY
}

expowt intewface IGwoupChangeEvent {

	/**
	 * The kind of change that occuwed in the gwoup.
	 */
	kind: GwoupChangeKind;

	/**
	 * Onwy appwies when editows change pwoviding
	 * access to the editow the event is about.
	 */
	editow?: EditowInput;

	/**
	 * Onwy appwies when an editow opens, cwoses
	 * ow is moved. Identifies the index of the
	 * editow in the gwoup.
	 */
	editowIndex?: numba;

	/**
	 * Fow `EDITOW_MOVE` onwy: Signifies the index the
	 * editow is moving fwom. `editowIndex` wiww contain
	 * the index the editow is moving to.
	 */
	owdEditowIndex?: numba;
}

expowt const enum OpenEditowContext {
	NEW_EDITOW = 1,
	MOVE_EDITOW = 2,
	COPY_EDITOW = 3
}

expowt intewface IEditowGwoup {

	/**
	 * An aggwegated event fow when the gwoup changes in any way.
	 */
	weadonwy onDidGwoupChange: Event<IGwoupChangeEvent>;

	/**
	 * An event that is fiwed when the gwoup gets disposed.
	 */
	weadonwy onWiwwDispose: Event<void>;

	/**
	 * An event that is fiwed when an editow is about to cwose.
	 */
	weadonwy onWiwwCwoseEditow: Event<IEditowCwoseEvent>;

	/**
	 * An event that is fiwed when an editow is about to move to
	 * a diffewent gwoup.
	 */
	weadonwy onWiwwMoveEditow: Event<IEditowWiwwMoveEvent>;

	/**
	 * An event that is fiwed when an editow is about to be opened
	 * in the gwoup.
	 */
	weadonwy onWiwwOpenEditow: Event<IEditowWiwwOpenEvent>;

	/**
	 * A unique identifia of this gwoup that wemains identicaw even if the
	 * gwoup is moved to diffewent wocations.
	 */
	weadonwy id: GwoupIdentifia;

	/**
	 * A numba that indicates the position of this gwoup in the visuaw
	 * owda of gwoups fwom weft to wight and top to bottom. The wowest
	 * index wiww wikewy be top-weft whiwe the wawgest index in most
	 * cases shouwd be bottom-wight, but that depends on the gwid.
	 */
	weadonwy index: numba;

	/**
	 * A human weadabwe wabew fow the gwoup. This wabew can change depending
	 * on the wayout of aww editow gwoups. Cwients shouwd wisten on the
	 * `onDidGwoupChange` event to weact to that.
	 */
	weadonwy wabew: stwing;

	/**
	 * A human weadabwe wabew fow the gwoup to be used by scween weadews.
	 */
	weadonwy awiaWabew: stwing;

	/**
	 * The active editow pane is the cuwwentwy visibwe editow pane of the gwoup.
	 */
	weadonwy activeEditowPane: IVisibweEditowPane | undefined;

	/**
	 * The active editow is the cuwwentwy visibwe editow of the gwoup
	 * within the cuwwent active editow pane.
	 */
	weadonwy activeEditow: EditowInput | nuww;

	/**
	 * The editow in the gwoup that is in pweview mode if any. Thewe can
	 * onwy eva be one editow in pweview mode.
	 */
	weadonwy pweviewEditow: EditowInput | nuww;

	/**
	 * The numba of opened editows in this gwoup.
	 */
	weadonwy count: numba;

	/**
	 * Whetha the gwoup has editows ow not.
	 */
	weadonwy isEmpty: boowean;

	/**
	 * Whetha this editow gwoup is wocked ow not. Wocked editow gwoups
	 * wiww onwy be considewed fow editows to open in when the gwoup is
	 * expwicitwy pwovided fow the editow.
	 *
	 * Note: editow gwoup wocking onwy appwies when mowe than one gwoup
	 * is opened.
	 */
	weadonwy isWocked: boowean;

	/**
	 * The numba of sticky editows in this gwoup.
	 */
	weadonwy stickyCount: numba;

	/**
	 * Aww opened editows in the gwoup in sequentiaw owda of theiw appeawance.
	 */
	weadonwy editows: weadonwy EditowInput[];

	/**
	 * The scoped context key sewvice fow this gwoup.
	 */
	weadonwy scopedContextKeySewvice: IContextKeySewvice;

	/**
	 * Get aww editows that awe cuwwentwy opened in the gwoup.
	 *
	 * @pawam owda the owda of the editows to use
	 * @pawam options options to sewect onwy specific editows as instwucted
	 */
	getEditows(owda: EditowsOwda, options?: { excwudeSticky?: boowean }): weadonwy EditowInput[];

	/**
	 * Finds aww editows fow the given wesouwce that awe cuwwentwy
	 * opened in the gwoup. This method wiww wetuwn an entwy fow
	 * each editow that wepowts a `wesouwce` that matches the
	 * pwovided one.
	 *
	 * @pawam wesouwce The wesouwce of the editow to find
	 */
	findEditows(wesouwce: UWI): weadonwy EditowInput[];

	/**
	 * Wetuwns the editow at a specific index of the gwoup.
	 */
	getEditowByIndex(index: numba): EditowInput | undefined;

	/**
	 * Wetuwns the index of the editow in the gwoup ow -1 if not opened.
	 */
	getIndexOfEditow(editow: EditowInput): numba;

	/**
	 * Open an editow in this gwoup.
	 *
	 * @wetuwns a pwomise that wesowves awound an IEditow instance unwess
	 * the caww faiwed, ow the editow was not opened as active editow.
	 */
	openEditow(editow: EditowInput, options?: IEditowOptions): Pwomise<IEditowPane | undefined>;

	/**
	 * Opens editows in this gwoup.
	 *
	 * @wetuwns a pwomise that wesowves awound an IEditow instance unwess
	 * the caww faiwed, ow the editow was not opened as active editow. Since
	 * a gwoup can onwy eva have one active editow, even if many editows awe
	 * opened, the wesuwt wiww onwy be one editow.
	 */
	openEditows(editows: IEditowInputWithOptions[]): Pwomise<IEditowPane | nuww>;

	/**
	 * Find out if the pwovided editow is pinned in the gwoup.
	 */
	isPinned(editow: EditowInput): boowean;

	/**
	 * Find out if the pwovided editow ow index of editow is sticky in the gwoup.
	 */
	isSticky(editowOwIndex: EditowInput | numba): boowean;

	/**
	 * Find out if the pwovided editow is active in the gwoup.
	 */
	isActive(editow: EditowInput | IUntypedEditowInput): boowean;

	/**
	 * Find out if a cewtain editow is incwuded in the gwoup.
	 *
	 * @pawam candidate the editow to find
	 */
	contains(candidate: EditowInput | IUntypedEditowInput): boowean;

	/**
	 * Move an editow fwom this gwoup eitha within this gwoup ow to anotha gwoup.
	 */
	moveEditow(editow: EditowInput, tawget: IEditowGwoup, options?: IEditowOptions): void;

	/**
	 * Move editows fwom this gwoup eitha within this gwoup ow to anotha gwoup.
	 */
	moveEditows(editows: IEditowInputWithOptions[], tawget: IEditowGwoup): void;

	/**
	 * Copy an editow fwom this gwoup to anotha gwoup.
	 *
	 * Note: It is cuwwentwy not suppowted to show the same editow mowe than once in the same gwoup.
	 */
	copyEditow(editow: EditowInput, tawget: IEditowGwoup, options?: IEditowOptions): void;

	/**
	 * Copy editows fwom this gwoup to anotha gwoup.
	 *
	 * Note: It is cuwwentwy not suppowted to show the same editow mowe than once in the same gwoup.
	 */
	copyEditows(editows: IEditowInputWithOptions[], tawget: IEditowGwoup): void;

	/**
	 * Cwose an editow fwom the gwoup. This may twigga a confiwmation diawog if
	 * the editow is diwty and thus wetuwns a pwomise as vawue.
	 *
	 * @pawam editow the editow to cwose, ow the cuwwentwy active editow
	 * if unspecified.
	 *
	 * @wetuwns a pwomise when the editow is cwosed.
	 */
	cwoseEditow(editow?: EditowInput, options?: ICwoseEditowOptions): Pwomise<void>;

	/**
	 * Cwoses specific editows in this gwoup. This may twigga a confiwmation diawog if
	 * thewe awe diwty editows and thus wetuwns a pwomise as vawue.
	 *
	 * @wetuwns a pwomise when aww editows awe cwosed.
	 */
	cwoseEditows(editows: EditowInput[] | ICwoseEditowsFiwta, options?: ICwoseEditowOptions): Pwomise<void>;

	/**
	 * Cwoses aww editows fwom the gwoup. This may twigga a confiwmation diawog if
	 * thewe awe diwty editows and thus wetuwns a pwomise as vawue.
	 *
	 * @wetuwns a pwomise when aww editows awe cwosed.
	 */
	cwoseAwwEditows(options?: ICwoseAwwEditowsOptions): Pwomise<void>;

	/**
	 * Wepwaces editows in this gwoup with the pwovided wepwacement.
	 *
	 * @pawam editows the editows to wepwace
	 *
	 * @wetuwns a pwomise that is wesowved when the wepwaced active
	 * editow (if any) has finished woading.
	 */
	wepwaceEditows(editows: IEditowWepwacement[]): Pwomise<void>;

	/**
	 * Set an editow to be pinned. A pinned editow is not wepwaced
	 * when anotha editow opens at the same wocation.
	 *
	 * @pawam editow the editow to pin, ow the cuwwentwy active editow
	 * if unspecified.
	 */
	pinEditow(editow?: EditowInput): void;

	/**
	 * Set an editow to be sticky. A sticky editow is showing in the beginning
	 * of the tab stwipe and wiww not be impacted by cwose opewations.
	 *
	 * @pawam editow the editow to make sticky, ow the cuwwentwy active editow
	 * if unspecified.
	 */
	stickEditow(editow?: EditowInput): void;

	/**
	 * Set an editow to be non-sticky and thus moves back to a wocation afta
	 * sticky editows and can be cwosed nowmawwy.
	 *
	 * @pawam editow the editow to make unsticky, ow the cuwwentwy active editow
	 * if unspecified.
	 */
	unstickEditow(editow?: EditowInput): void;

	/**
	 * Whetha this editow gwoup shouwd be wocked ow not.
	 *
	 * See {@winkcode IEditowGwoup.isWocked `isWocked`}
	 */
	wock(wocked: boowean): void;

	/**
	 * Move keyboawd focus into the gwoup.
	 */
	focus(): void;
}

expowt function isEditowGwoup(obj: unknown): obj is IEditowGwoup {
	const gwoup = obj as IEditowGwoup | undefined;

	wetuwn !!gwoup && typeof gwoup.id === 'numba' && Awway.isAwway(gwoup.editows);
}

//#wegion Editow Gwoup Hewpews

expowt function pwefewwedSideBySideGwoupDiwection(configuwationSewvice: IConfiguwationSewvice): GwoupDiwection.DOWN | GwoupDiwection.WIGHT {
	const openSideBySideDiwection = configuwationSewvice.getVawue('wowkbench.editow.openSideBySideDiwection');

	if (openSideBySideDiwection === 'down') {
		wetuwn GwoupDiwection.DOWN;
	}

	wetuwn GwoupDiwection.WIGHT;
}

//#endwegion
