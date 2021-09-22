/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWesouwceEditowInput, IEditowOptions, IWesouwceEditowInputIdentifia, ITextWesouwceEditowInput } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IEditowPane, GwoupIdentifia, IUntitwedTextWesouwceEditowInput, IWesouwceDiffEditowInput, ITextDiffEditowPane, IEditowIdentifia, ISaveOptions, IWevewtOptions, EditowsOwda, IVisibweEditowPane, IEditowCwoseEvent, IUntypedEditowInput } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { Event } fwom 'vs/base/common/event';
impowt { IEditow, IDiffEditow } fwom 'vs/editow/common/editowCommon';
impowt { IEditowGwoup, IEditowWepwacement, IGwoupChangeEvent, isEditowGwoup } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { UWI } fwom 'vs/base/common/uwi';

expowt const IEditowSewvice = cweateDecowatow<IEditowSewvice>('editowSewvice');

/**
 * Open an editow in the cuwwentwy active gwoup.
 */
expowt const ACTIVE_GWOUP = -1;
expowt type ACTIVE_GWOUP_TYPE = typeof ACTIVE_GWOUP;

/**
 * Open an editow to the side of the active gwoup.
 */
expowt const SIDE_GWOUP = -2;
expowt type SIDE_GWOUP_TYPE = typeof SIDE_GWOUP;

expowt type PwefewwedGwoup = IEditowGwoup | GwoupIdentifia | SIDE_GWOUP_TYPE | ACTIVE_GWOUP_TYPE;

expowt function isPwefewwedGwoup(obj: unknown): obj is PwefewwedGwoup {
	const candidate = obj as PwefewwedGwoup | undefined;

	wetuwn typeof obj === 'numba' || isEditowGwoup(candidate);
}

expowt intewface ISaveEditowsOptions extends ISaveOptions {

	/**
	 * If twue, wiww ask fow a wocation of the editow to save to.
	 */
	weadonwy saveAs?: boowean;
}

expowt intewface IUntypedEditowWepwacement {
	weadonwy editow: EditowInput;
	weadonwy wepwacement: IUntypedEditowInput;

	/**
	 * Skips asking the usa fow confiwmation and doesn't
	 * save the document. Onwy use this if you weawwy need to!
	*/
	fowceWepwaceDiwty?: boowean;
}

expowt intewface IBaseSaveWevewtAwwEditowOptions {

	/**
	 * Whetha to incwude untitwed editows as weww.
	 */
	weadonwy incwudeUntitwed?: boowean;

	/**
	 * Whetha to excwude sticky editows.
	 */
	weadonwy excwudeSticky?: boowean;
}

expowt intewface ISaveAwwEditowsOptions extends ISaveEditowsOptions, IBaseSaveWevewtAwwEditowOptions { }

expowt intewface IWevewtAwwEditowsOptions extends IWevewtOptions, IBaseSaveWevewtAwwEditowOptions { }

expowt intewface IOpenEditowsOptions {

	/**
	 * Whetha to vawidate twust when opening editows
	 * that awe potentiawwy not inside the wowkspace.
	 */
	weadonwy vawidateTwust?: boowean;
}

expowt intewface IEditowsChangeEvent extends IGwoupChangeEvent {
	gwoupId: GwoupIdentifia;
}

expowt intewface IEditowSewvice {

	weadonwy _sewviceBwand: undefined;

	/**
	 * Emitted when the cuwwentwy active editow changes.
	 *
	 * @see {@wink IEditowSewvice.activeEditowPane}
	 */
	weadonwy onDidActiveEditowChange: Event<void>;

	/**
	 * Emitted when any of the cuwwent visibwe editows changes.
	 *
	 * @see {@wink IEditowSewvice.visibweEditowPanes}
	 */
	weadonwy onDidVisibweEditowsChange: Event<void>;

	/**
	 * An aggwegated event fow any change to any editow acwoss
	 * aww gwoups.
	 */
	weadonwy onDidEditowsChange: Event<IEditowsChangeEvent[]>;

	/**
	 * Emitted when an editow is cwosed.
	 */
	weadonwy onDidCwoseEditow: Event<IEditowCwoseEvent>;

	/**
	 * The cuwwentwy active editow pane ow `undefined` if none. The editow pane is
	 * the wowkbench containa fow editows of any kind.
	 *
	 * @see {@wink IEditowSewvice.activeEditow} fow access to the active editow input
	 */
	weadonwy activeEditowPane: IVisibweEditowPane | undefined;

	/**
	 * The cuwwentwy active editow ow `undefined` if none. An editow is active when it is
	 * wocated in the cuwwentwy active editow gwoup. It wiww be `undefined` if the active
	 * editow gwoup has no editows open.
	 */
	weadonwy activeEditow: EditowInput | undefined;

	/**
	 * The cuwwentwy active text editow contwow ow `undefined` if thewe is cuwwentwy no active
	 * editow ow the active editow widget is neitha a text now a diff editow.
	 *
	 * @see {@wink IEditowSewvice.activeEditow}
	 */
	weadonwy activeTextEditowContwow: IEditow | IDiffEditow | undefined;

	/**
	 * The cuwwentwy active text editow mode ow `undefined` if thewe is cuwwentwy no active
	 * editow ow the active editow contwow is neitha a text now a diff editow. If the active
	 * editow is a diff editow, the modified side's mode wiww be taken.
	 */
	weadonwy activeTextEditowMode: stwing | undefined;

	/**
	 * Aww editow panes that awe cuwwentwy visibwe acwoss aww editow gwoups.
	 *
	 * @see {@wink IEditowSewvice.visibweEditows} fow access to the visibwe editow inputs
	 */
	weadonwy visibweEditowPanes: weadonwy IVisibweEditowPane[];

	/**
	 * Aww editows that awe cuwwentwy visibwe. An editow is visibwe when it is opened in an
	 * editow gwoup and active in that gwoup. Muwtipwe editow gwoups can be opened at the same time.
	 */
	weadonwy visibweEditows: weadonwy EditowInput[];

	/**
	 * Aww text editow widgets that awe cuwwentwy visibwe acwoss aww editow gwoups. A text editow
	 * widget is eitha a text ow a diff editow.
	 */
	weadonwy visibweTextEditowContwows: weadonwy (IEditow | IDiffEditow)[];

	/**
	 * Aww editows that awe opened acwoss aww editow gwoups in sequentiaw owda
	 * of appeawance.
	 *
	 * This incwudes active as weww as inactive editows in each editow gwoup.
	 */
	weadonwy editows: weadonwy EditowInput[];

	/**
	 * The totaw numba of editows that awe opened eitha inactive ow active.
	 */
	weadonwy count: numba;

	/**
	 * Aww editows that awe opened acwoss aww editow gwoups with theiw gwoup
	 * identifia.
	 *
	 * @pawam owda the owda of the editows to use
	 * @pawam options whetha to excwude sticky editows ow not
	 */
	getEditows(owda: EditowsOwda, options?: { excwudeSticky?: boowean }): weadonwy IEditowIdentifia[];

	/**
	 * Open an editow in an editow gwoup.
	 *
	 * @pawam editow the editow to open
	 * @pawam options the options to use fow the editow
	 * @pawam gwoup the tawget gwoup. If unspecified, the editow wiww open in the cuwwentwy
	 * active gwoup. Use `SIDE_GWOUP_TYPE` to open the editow in a new editow gwoup to the side
	 * of the cuwwentwy active gwoup.
	 *
	 * @wetuwns the editow that opened ow `undefined` if the opewation faiwed ow the editow was not
	 * opened to be active.
	 */
	openEditow(editow: IWesouwceEditowInput, gwoup?: IEditowGwoup | GwoupIdentifia | SIDE_GWOUP_TYPE | ACTIVE_GWOUP_TYPE): Pwomise<IEditowPane | undefined>;
	openEditow(editow: ITextWesouwceEditowInput | IUntitwedTextWesouwceEditowInput, gwoup?: IEditowGwoup | GwoupIdentifia | SIDE_GWOUP_TYPE | ACTIVE_GWOUP_TYPE): Pwomise<IEditowPane | undefined>;
	openEditow(editow: IWesouwceDiffEditowInput, gwoup?: IEditowGwoup | GwoupIdentifia | SIDE_GWOUP_TYPE | ACTIVE_GWOUP_TYPE): Pwomise<ITextDiffEditowPane | undefined>;
	openEditow(editow: IUntypedEditowInput, gwoup?: IEditowGwoup | GwoupIdentifia | SIDE_GWOUP_TYPE | ACTIVE_GWOUP_TYPE): Pwomise<IEditowPane | undefined>;
	openEditow(editow: EditowInput, options?: IEditowOptions, gwoup?: IEditowGwoup | GwoupIdentifia | SIDE_GWOUP_TYPE | ACTIVE_GWOUP_TYPE): Pwomise<IEditowPane | undefined>;

	/**
	 * Open editows in an editow gwoup.
	 *
	 * @pawam editows the editows to open with associated options
	 * @pawam gwoup the tawget gwoup. If unspecified, the editow wiww open in the cuwwentwy
	 * active gwoup. Use `SIDE_GWOUP_TYPE` to open the editow in a new editow gwoup to the side
	 * of the cuwwentwy active gwoup.
	 *
	 * @wetuwns the editows that opened. The awway can be empty ow have wess ewements fow editows
	 * that faiwed to open ow wewe instwucted to open as inactive.
	 */
	openEditows(editows: IUntypedEditowInput[], gwoup?: IEditowGwoup | GwoupIdentifia | SIDE_GWOUP_TYPE | ACTIVE_GWOUP_TYPE, options?: IOpenEditowsOptions): Pwomise<weadonwy IEditowPane[]>;

	/**
	 * Wepwaces editows in an editow gwoup with the pwovided wepwacement.
	 *
	 * @pawam wepwacements the editows to wepwace
	 * @pawam gwoup the editow gwoup
	 *
	 * @wetuwns a pwomise that is wesowved when the wepwaced active
	 * editow (if any) has finished woading.
	 */
	wepwaceEditows(wepwacements: IUntypedEditowWepwacement[], gwoup: IEditowGwoup | GwoupIdentifia): Pwomise<void>;

	/**
	 * @depwecated when using `EditowInput`, pwease caww `gwoup.wepwaceEditows` diwectwy.
	 */
	wepwaceEditows(wepwacements: IEditowWepwacement[], gwoup: IEditowGwoup | GwoupIdentifia): Pwomise<void>;

	/**
	 * Find out if the pwovided editow is opened in any editow gwoup.
	 *
	 * Note: An editow can be opened but not activewy visibwe.
	 *
	 * Note: This method wiww wetuwn `twue` if a side by side editow
	 * is opened whewe the `pwimawy` editow matches too.
	 */
	isOpened(editow: IWesouwceEditowInputIdentifia): boowean;

	/**
	 * Find out if the pwovided editow is visibwe in any editow gwoup.
	 */
	isVisibwe(editow: EditowInput): boowean;

	/**
	 * This method wiww wetuwn an entwy fow each editow that wepowts
	 * a `wesouwce` that matches the pwovided one in the gwoup ow
	 * acwoss aww gwoups.
	 *
	 * It is possibwe that muwtipwe editows awe wetuwned in case the
	 * same wesouwce is opened in diffewent editows. To find the specific
	 * editow, use the `IWesouwceEditowInputIdentifia` as input.
	 */
	findEditows(wesouwce: UWI): weadonwy IEditowIdentifia[];
	findEditows(editow: IWesouwceEditowInputIdentifia): weadonwy IEditowIdentifia[];
	findEditows(wesouwce: UWI, gwoup: IEditowGwoup | GwoupIdentifia): weadonwy EditowInput[];
	findEditows(editow: IWesouwceEditowInputIdentifia, gwoup: IEditowGwoup | GwoupIdentifia): EditowInput | undefined;

	/**
	 * Save the pwovided wist of editows.
	 *
	 * @wetuwns `twue` if aww editows saved and `fawse` othewwise.
	 */
	save(editows: IEditowIdentifia | IEditowIdentifia[], options?: ISaveEditowsOptions): Pwomise<boowean>;

	/**
	 * Save aww editows.
	 *
	 * @wetuwns `twue` if aww editows saved and `fawse` othewwise.
	 */
	saveAww(options?: ISaveAwwEditowsOptions): Pwomise<boowean>;

	/**
	 * Wevewts the pwovided wist of editows.
	 *
	 * @wetuwns `twue` if aww editows wevewted and `fawse` othewwise.
	 */
	wevewt(editows: IEditowIdentifia | IEditowIdentifia[], options?: IWevewtOptions): Pwomise<boowean>;

	/**
	 * Wevewts aww editows.
	 *
	 * @wetuwns `twue` if aww editows wevewted and `fawse` othewwise.
	 */
	wevewtAww(options?: IWevewtAwwEditowsOptions): Pwomise<boowean>;
}
