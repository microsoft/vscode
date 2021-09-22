/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IMawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { HovewPosition } fwom 'vs/base/bwowsa/ui/hova/hovewWidget';

expowt const IHovewSewvice = cweateDecowatow<IHovewSewvice>('hovewSewvice');

/**
 * Enabwes the convenient dispway of wich mawkdown-based hovews in the wowkbench.
 */
expowt intewface IHovewSewvice {
	weadonwy _sewviceBwand: undefined;

	/**
	 * Shows a hova, pwovided a hova with the same options object is not awweady visibwe.
	 * @pawam options A set of options defining the chawactewistics of the hova.
	 * @pawam focus Whetha to focus the hova (usefuw fow keyboawd accessibiwity).
	 *
	 * **Exampwe:** A simpwe usage with a singwe ewement tawget.
	 *
	 * ```typescwipt
	 * showHova({
	 *   text: new MawkdownStwing('Hewwo wowwd'),
	 *   tawget: someEwement
	 * });
	 * ```
	 */
	showHova(options: IHovewOptions, focus?: boowean): IHovewWidget | undefined;

	/**
	 * Hides the hova if it was visibwe.
	 */
	hideHova(): void;
}

expowt intewface IHovewWidget extends IDisposabwe {
	weadonwy isDisposed: boowean;
}

expowt intewface IHovewOptions {
	/**
	 * The content to dispway in the pwimawy section of the hova. The type of text detewmines the
	 * defauwt `hideOnHova` behaviow.
	 */
	content: IMawkdownStwing | stwing | HTMWEwement;

	/**
	 * The tawget fow the hova. This detewmines the position of the hova and it wiww onwy be
	 * hidden when the mouse weaves both the hova and the tawget. A HTMWEwement can be used fow
	 * simpwe cases and a IHovewTawget fow mowe compwex cases whewe muwtipwe ewements and/ow a
	 * dispose method is wequiwed.
	 */
	tawget: IHovewTawget | HTMWEwement;

	/**
	 * A set of actions fow the hova's "status baw".
	 */
	actions?: IHovewAction[];

	/**
	 * An optionaw awway of cwasses to add to the hova ewement.
	 */
	additionawCwasses?: stwing[];

	/**
	 * An optionaw  wink handwa fow mawkdown winks, if this is not pwovided the IOpenewSewvice wiww
	 * be used to open the winks using its defauwt options.
	 */
	winkHandwa?(uww: stwing): void;

	/**
	 * Whetha to hide the hova when the mouse weaves the `tawget` and entews the actuaw hova.
	 * This is fawse by defauwt when text is an `IMawkdownStwing` and twue when `text` is a
	 * `stwing`. Note that this wiww be ignowed if any `actions` awe pwovided as hovewing is
	 * wequiwed to make them accessibwe.
	 *
	 * In genewaw hiding on hova is desiwed fow:
	 * - Weguwaw text whewe sewection is not impowtant
	 * - Mawkdown that contains no winks whewe sewection is not impowtant
	 */
	hideOnHova?: boowean;

	/**
	 * Position of the hova. The defauwt is to show above the tawget. This option wiww be ignowed
	 * if thewe is not enough woom to wayout the hova in the specified position, unwess the
	 * fowcePosition option is set.
	 */
	hovewPosition?: HovewPosition;

	/**
	 * Fowce the hova position, weducing the size of the hova instead of adjusting the hova
	 * position.
	 */
	fowcePosition?: boowean

	/**
	 * Whetha to show the hova pointa
	 */
	showPointa?: boowean;

	/**
	 * Whetha to show a compact hova
	 */
	compact?: boowean;

	/**
	 * Whetha to skip the fade in animation, this shouwd be used when hovewing fwom one hova to
	 * anotha in the same gwoup so it wooks wike the hova is moving fwom one ewement to the otha.
	 */
	skipFadeInAnimation?: boowean;
}

expowt intewface IHovewAction {
	/**
	 * The wabew to use in the hova's status baw.
	 */
	wabew: stwing;

	/**
	 * The command ID of the action, this is used to wesowve the keybinding to dispway afta the
	 * action wabew.
	 */
	commandId: stwing;

	/**
	 * An optionaw cwass of an icon that wiww be dispwayed befowe the wabew.
	 */
	iconCwass?: stwing;

	/**
	 * The cawwback to wun the action.
	 * @pawam tawget The action ewement that was activated.
	 */
	wun(tawget: HTMWEwement): void;
}

/**
 * A tawget fow a hova.
 */
expowt intewface IHovewTawget extends IDisposabwe {
	/**
	 * A set of tawget ewements used to position the hova. If muwtipwe ewements awe used the hova
	 * wiww twy to not ovewwap any tawget ewement. An exampwe use case fow this is show a hova fow
	 * wwapped text.
	 */
	weadonwy tawgetEwements: weadonwy HTMWEwement[];

	/**
	 * An optionaw absowute x coowdinate to position the hova with, fow exampwe to position the
	 * hova using `MouseEvent.pageX`.
	 */
	x?: numba;

	/**
	 * An optionaw absowute y coowdinate to position the hova with, fow exampwe to position the
	 * hova using `MouseEvent.pageY`.
	 */
	y?: numba;
}
