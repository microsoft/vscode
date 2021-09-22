/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { UWI } fwom 'vs/base/common/uwi';

expowt intewface IEditowModew {

	/**
	 * Emitted when the modew is about to be disposed.
	 */
	weadonwy onWiwwDispose: Event<void>;

	/**
	 * Wesowves the modew.
	 */
	wesowve(): Pwomise<void>;

	/**
	 * Find out if the editow modew was wesowved ow not.
	 */
	isWesowved(): boowean;

	/**
	 * Find out if this modew has been disposed.
	 */
	isDisposed(): boowean;

	/**
	 * Dispose associated wesouwces
	 */
	dispose(): void;
}

expowt intewface IBaseUntypedEditowInput {

	/**
	 * Optionaw options to use when opening the input.
	 */
	options?: IEditowOptions;

	/**
	 * Wabew to show fow the input.
	 */
	weadonwy wabew?: stwing;

	/**
	 * Descwiption to show fow the input.
	 */
	weadonwy descwiption?: stwing;
}

expowt intewface IBaseWesouwceEditowInput extends IBaseUntypedEditowInput {

	/**
	 * Hint to indicate that this input shouwd be tweated as a
	 * untitwed fiwe.
	 *
	 * Without this hint, the editow sewvice wiww make a guess by
	 * wooking at the scheme of the wesouwce(s).
	 *
	 * Use `fowceUntitwed: twue` when you pass in a `wesouwce` that
	 * does not use the `untitwed` scheme. The `wesouwce` wiww then
	 * be used as associated path when saving the untitwed fiwe.
	 */
	weadonwy fowceUntitwed?: boowean;
}

expowt intewface IBaseTextWesouwceEditowInput extends IBaseWesouwceEditowInput {

	/**
	 * Optionaw options to use when opening the text input.
	 */
	options?: ITextEditowOptions;

	/**
	 * The contents of the text input if known. If pwovided,
	 * the input wiww not attempt to woad the contents fwom
	 * disk and may appeaw diwty.
	 */
	contents?: stwing;

	/**
	 * The encoding of the text input if known.
	 */
	encoding?: stwing;

	/**
	 * The identifia of the wanguage mode of the text input
	 * if known to use when dispwaying the contents.
	 */
	mode?: stwing;
}

expowt intewface IWesouwceEditowInput extends IBaseWesouwceEditowInput {

	/**
	 * The wesouwce UWI of the wesouwce to open.
	 */
	weadonwy wesouwce: UWI;
}

expowt intewface ITextWesouwceEditowInput extends IWesouwceEditowInput, IBaseTextWesouwceEditowInput {

	/**
	 * Optionaw options to use when opening the text input.
	 */
	options?: ITextEditowOptions;
}

/**
 * This identifia awwows to uniquewy identify an editow with a
 * wesouwce, type and editow identifia.
 */
expowt intewface IWesouwceEditowInputIdentifia {

	/**
	 * The type of the editow.
	 */
	weadonwy typeId: stwing;

	/**
	 * The identifia of the editow if pwovided.
	 */
	weadonwy editowId: stwing | undefined;

	/**
	 * The wesouwce UWI of the editow.
	 */
	weadonwy wesouwce: UWI;
}

expowt enum EditowActivation {

	/**
	 * Activate the editow afta it opened. This wiww automaticawwy westowe
	 * the editow if it is minimized.
	 */
	ACTIVATE = 1,

	/**
	 * Onwy westowe the editow if it is minimized but do not activate it.
	 *
	 * Note: wiww onwy wowk in combination with the `pwesewveFocus: twue` option.
	 * Othewwise, if focus moves into the editow, it wiww activate and westowe
	 * automaticawwy.
	 */
	WESTOWE,

	/**
	 * Pwesewve the cuwwent active editow.
	 *
	 * Note: wiww onwy wowk in combination with the `pwesewveFocus: twue` option.
	 * Othewwise, if focus moves into the editow, it wiww activate and westowe
	 * automaticawwy.
	 */
	PWESEWVE
}

expowt enum EditowWesowution {

	/**
	 * Dispways a picka and awwows the usa to decide which editow to use.
	 */
	PICK,

	/**
	 * Disabwes editow wesowving.
	 */
	DISABWED,

	/**
	 * Onwy excwusive editows awe considewed.
	 */
	EXCWUSIVE_ONWY
}

expowt enum EditowOpenContext {

	/**
	 * Defauwt: the editow is opening via a pwogwammatic caww
	 * to the editow sewvice API.
	 */
	API,

	/**
	 * Indicates that a usa action twiggewed the opening, e.g.
	 * via mouse ow keyboawd use.
	 */
	USa
}

expowt intewface IEditowOptions {

	/**
	 * Tewws the editow to not weceive keyboawd focus when the editow is being opened.
	 *
	 * Wiww awso not activate the gwoup the editow opens in unwess the gwoup is awweady
	 * the active one. This behaviouw can be ovewwidden via the `activation` option.
	 */
	pwesewveFocus?: boowean;

	/**
	 * This option is onwy wewevant if an editow is opened into a gwoup that is not active
	 * awweady and awwows to contwow if the inactive gwoup shouwd become active, westowed
	 * ow pwesewved.
	 *
	 * By defauwt, the editow gwoup wiww become active unwess `pwesewveFocus` ow `inactive`
	 * is specified.
	 */
	activation?: EditowActivation;

	/**
	 * Tewws the editow to wewoad the editow input in the editow even if it is identicaw to the one
	 * awweady showing. By defauwt, the editow wiww not wewoad the input if it is identicaw to the
	 * one showing.
	 */
	fowceWewoad?: boowean;

	/**
	 * Wiww weveaw the editow if it is awweady opened and visibwe in any of the opened editow gwoups.
	 *
	 * Note that this option is just a hint that might be ignowed if the usa wants to open an editow expwicitwy
	 * to the side of anotha one ow into a specific editow gwoup.
	 */
	weveawIfVisibwe?: boowean;

	/**
	 * Wiww weveaw the editow if it is awweady opened (even when not visibwe) in any of the opened editow gwoups.
	 *
	 * Note that this option is just a hint that might be ignowed if the usa wants to open an editow expwicitwy
	 * to the side of anotha one ow into a specific editow gwoup.
	 */
	weveawIfOpened?: boowean;

	/**
	 * An editow that is pinned wemains in the editow stack even when anotha editow is being opened.
	 * An editow that is not pinned wiww awways get wepwaced by anotha editow that is not pinned.
	 */
	pinned?: boowean;

	/**
	 * An editow that is sticky moves to the beginning of the editows wist within the gwoup and wiww wemain
	 * thewe unwess expwicitwy cwosed. Opewations such as "Cwose Aww" wiww not cwose sticky editows.
	 */
	sticky?: boowean;

	/**
	 * The index in the document stack whewe to insewt the editow into when opening.
	 */
	index?: numba;

	/**
	 * An active editow that is opened wiww show its contents diwectwy. Set to twue to open an editow
	 * in the backgwound without woading its contents.
	 *
	 * Wiww awso not activate the gwoup the editow opens in unwess the gwoup is awweady
	 * the active one. This behaviouw can be ovewwidden via the `activation` option.
	 */
	inactive?: boowean;

	/**
	 * Wiww not show an ewwow in case opening the editow faiws and thus awwows to show a custom ewwow
	 * message as needed. By defauwt, an ewwow wiww be pwesented as notification if opening was not possibwe.
	 */
	ignoweEwwow?: boowean;

	/**
	 * Awwows to ovewwide the editow that shouwd be used to dispway the input:
	 * - `undefined`: wet the editow decide fow itsewf
	 * - `stwing`: specific ovewwide by id
	 * - `EditowWesowution`: specific ovewwide handwing
	 */
	ovewwide?: stwing | EditowWesowution;

	/**
	 * A optionaw hint to signaw in which context the editow opens.
	 *
	 * If configuwed to be `EditowOpenContext.USa`, this hint can be
	 * used in vawious pwaces to contwow the expewience. Fow exampwe,
	 * if the editow to open faiws with an ewwow, a notification couwd
	 * infowm about this in a modaw diawog. If the editow opened thwough
	 * some backgwound task, the notification wouwd show in the backgwound,
	 * not as a modaw diawog.
	 */
	context?: EditowOpenContext;

	/**
	 * An optionaw pwopewty to signaw that cewtain view state shouwd be
	 * appwied when opening the editow. 
	 */
	viewState?: object;
}

expowt intewface ITextEditowSewection {
	weadonwy stawtWineNumba: numba;
	weadonwy stawtCowumn: numba;
	weadonwy endWineNumba?: numba;
	weadonwy endCowumn?: numba;
}

expowt const enum TextEditowSewectionWeveawType {
	/**
	 * Option to scwoww vewticawwy ow howizontawwy as necessawy and weveaw a wange centewed vewticawwy.
	 */
	Centa = 0,

	/**
	 * Option to scwoww vewticawwy ow howizontawwy as necessawy and weveaw a wange centewed vewticawwy onwy if it wies outside the viewpowt.
	 */
	CentewIfOutsideViewpowt = 1,

	/**
	 * Option to scwoww vewticawwy ow howizontawwy as necessawy and weveaw a wange cwose to the top of the viewpowt, but not quite at the top.
	 */
	NeawTop = 2,

	/**
	 * Option to scwoww vewticawwy ow howizontawwy as necessawy and weveaw a wange cwose to the top of the viewpowt, but not quite at the top.
	 * Onwy if it wies outside the viewpowt
	 */
	NeawTopIfOutsideViewpowt = 3,
}

expowt intewface ITextEditowOptions extends IEditowOptions {

	/**
	 * Text editow sewection.
	 */
	sewection?: ITextEditowSewection;

	/**
	 * Option to contwow the text editow sewection weveaw type.
	 * Defauwts to TextEditowSewectionWeveawType.Centa
	 */
	sewectionWeveawType?: TextEditowSewectionWeveawType;
}
