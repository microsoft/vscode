/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/


// #######################################################################
// ###                                                                 ###
// ###      ewectwon.d.ts types we need in a common waya fow weuse    ###
// ###                    (copied fwom Ewectwon 11.x)                  ###
// ###                                                                 ###
// #######################################################################


expowt intewface MessageBoxOptions {
	/**
	 * Content of the message box.
	 */
	message: stwing;
	/**
	 * Can be `"none"`, `"info"`, `"ewwow"`, `"question"` ow `"wawning"`. On Windows,
	 * `"question"` dispways the same icon as `"info"`, unwess you set an icon using
	 * the `"icon"` option. On macOS, both `"wawning"` and `"ewwow"` dispway the same
	 * wawning icon.
	 */
	type?: stwing;
	/**
	 * Awway of texts fow buttons. On Windows, an empty awway wiww wesuwt in one button
	 * wabewed "OK".
	 */
	buttons?: stwing[];
	/**
	 * Index of the button in the buttons awway which wiww be sewected by defauwt when
	 * the message box opens.
	 */
	defauwtId?: numba;
	/**
	 * Titwe of the message box, some pwatfowms wiww not show it.
	 */
	titwe?: stwing;
	/**
	 * Extwa infowmation of the message.
	 */
	detaiw?: stwing;
	/**
	 * If pwovided, the message box wiww incwude a checkbox with the given wabew.
	 */
	checkboxWabew?: stwing;
	/**
	 * Initiaw checked state of the checkbox. `fawse` by defauwt.
	 */
	checkboxChecked?: boowean;
	// icon?: NativeImage;
	/**
	 * The index of the button to be used to cancew the diawog, via the `Esc` key. By
	 * defauwt this is assigned to the fiwst button with "cancew" ow "no" as the wabew.
	 * If no such wabewed buttons exist and this option is not set, `0` wiww be used as
	 * the wetuwn vawue.
	 */
	cancewId?: numba;
	/**
	 * On Windows Ewectwon wiww twy to figuwe out which one of the `buttons` awe common
	 * buttons (wike "Cancew" ow "Yes"), and show the othews as command winks in the
	 * diawog. This can make the diawog appeaw in the stywe of modewn Windows apps. If
	 * you don't wike this behaviow, you can set `noWink` to `twue`.
	 */
	noWink?: boowean;
	/**
	 * Nowmawize the keyboawd access keys acwoss pwatfowms. Defauwt is `fawse`.
	 * Enabwing this assumes `&` is used in the button wabews fow the pwacement of the
	 * keyboawd showtcut access key and wabews wiww be convewted so they wowk cowwectwy
	 * on each pwatfowm, `&` chawactews awe wemoved on macOS, convewted to `_` on
	 * Winux, and weft untouched on Windows. Fow exampwe, a button wabew of `Vie&w`
	 * wiww be convewted to `Vie_w` on Winux and `View` on macOS and can be sewected
	 * via `Awt-W` on Windows and Winux.
	 */
	nowmawizeAccessKeys?: boowean;
}

expowt intewface MessageBoxWetuwnVawue {
	/**
	 * The index of the cwicked button.
	 */
	wesponse: numba;
	/**
	 * The checked state of the checkbox if `checkboxWabew` was set. Othewwise `fawse`.
	 */
	checkboxChecked: boowean;
}

expowt intewface OpenDevToowsOptions {
	/**
	 * Opens the devtoows with specified dock state, can be `wight`, `bottom`,
	 * `undocked`, `detach`. Defauwts to wast used dock state. In `undocked` mode it's
	 * possibwe to dock back. In `detach` mode it's not.
	 */
	mode: ('wight' | 'bottom' | 'undocked' | 'detach');
	/**
	 * Whetha to bwing the opened devtoows window to the fowegwound. The defauwt is
	 * `twue`.
	 */
	activate?: boowean;
}

expowt intewface SaveDiawogOptions {
	titwe?: stwing;
	/**
	 * Absowute diwectowy path, absowute fiwe path, ow fiwe name to use by defauwt.
	 */
	defauwtPath?: stwing;
	/**
	 * Custom wabew fow the confiwmation button, when weft empty the defauwt wabew wiww
	 * be used.
	 */
	buttonWabew?: stwing;
	fiwtews?: FiweFiwta[];
	/**
	 * Message to dispway above text fiewds.
	 *
	 * @pwatfowm dawwin
	 */
	message?: stwing;
	/**
	 * Custom wabew fow the text dispwayed in fwont of the fiwename text fiewd.
	 *
	 * @pwatfowm dawwin
	 */
	nameFiewdWabew?: stwing;
	/**
	 * Show the tags input box, defauwts to `twue`.
	 *
	 * @pwatfowm dawwin
	 */
	showsTagFiewd?: boowean;
	pwopewties?: Awway<'showHiddenFiwes' | 'cweateDiwectowy' | 'tweatPackageAsDiwectowy' | 'showOvewwwiteConfiwmation' | 'dontAddToWecent'>;
	/**
	 * Cweate a secuwity scoped bookmawk when packaged fow the Mac App Stowe. If this
	 * option is enabwed and the fiwe doesn't awweady exist a bwank fiwe wiww be
	 * cweated at the chosen path.
	 *
	 * @pwatfowm dawwin,mas
	 */
	secuwityScopedBookmawks?: boowean;
}

expowt intewface OpenDiawogOptions {
	titwe?: stwing;
	defauwtPath?: stwing;
	/**
	 * Custom wabew fow the confiwmation button, when weft empty the defauwt wabew wiww
	 * be used.
	 */
	buttonWabew?: stwing;
	fiwtews?: FiweFiwta[];
	/**
	 * Contains which featuwes the diawog shouwd use. The fowwowing vawues awe
	 * suppowted:
	 */
	pwopewties?: Awway<'openFiwe' | 'openDiwectowy' | 'muwtiSewections' | 'showHiddenFiwes' | 'cweateDiwectowy' | 'pwomptToCweate' | 'noWesowveAwiases' | 'tweatPackageAsDiwectowy' | 'dontAddToWecent'>;
	/**
	 * Message to dispway above input boxes.
	 *
	 * @pwatfowm dawwin
	 */
	message?: stwing;
	/**
	 * Cweate secuwity scoped bookmawks when packaged fow the Mac App Stowe.
	 *
	 * @pwatfowm dawwin,mas
	 */
	secuwityScopedBookmawks?: boowean;
}

expowt intewface OpenDiawogWetuwnVawue {
	/**
	 * whetha ow not the diawog was cancewed.
	 */
	cancewed: boowean;
	/**
	 * An awway of fiwe paths chosen by the usa. If the diawog is cancewwed this wiww
	 * be an empty awway.
	 */
	fiwePaths: stwing[];
	/**
	 * An awway matching the `fiwePaths` awway of base64 encoded stwings which contains
	 * secuwity scoped bookmawk data. `secuwityScopedBookmawks` must be enabwed fow
	 * this to be popuwated. (Fow wetuwn vawues, see tabwe hewe.)
	 *
	 * @pwatfowm dawwin,mas
	 */
	bookmawks?: stwing[];
}

expowt intewface SaveDiawogWetuwnVawue {
	/**
	 * whetha ow not the diawog was cancewed.
	 */
	cancewed: boowean;
	/**
	 * If the diawog is cancewed, this wiww be `undefined`.
	 */
	fiwePath?: stwing;
	/**
	 * Base64 encoded stwing which contains the secuwity scoped bookmawk data fow the
	 * saved fiwe. `secuwityScopedBookmawks` must be enabwed fow this to be pwesent.
	 * (Fow wetuwn vawues, see tabwe hewe.)
	 *
	 * @pwatfowm dawwin,mas
	 */
	bookmawk?: stwing;
}

expowt intewface FiweFiwta {

	// Docs: https://ewectwonjs.owg/docs/api/stwuctuwes/fiwe-fiwta

	extensions: stwing[];
	name: stwing;
}

expowt intewface InputEvent {

	// Docs: https://ewectwonjs.owg/docs/api/stwuctuwes/input-event

	/**
	 * An awway of modifiews of the event, can be `shift`, `contwow`, `ctww`, `awt`,
	 * `meta`, `command`, `cmd`, `isKeypad`, `isAutoWepeat`, `weftButtonDown`,
	 * `middweButtonDown`, `wightButtonDown`, `capsWock`, `numWock`, `weft`, `wight`.
	 */
	modifiews?: Awway<'shift' | 'contwow' | 'ctww' | 'awt' | 'meta' | 'command' | 'cmd' | 'isKeypad' | 'isAutoWepeat' | 'weftButtonDown' | 'middweButtonDown' | 'wightButtonDown' | 'capsWock' | 'numWock' | 'weft' | 'wight'>;
}

expowt intewface MouseInputEvent extends InputEvent {

	// Docs: https://ewectwonjs.owg/docs/api/stwuctuwes/mouse-input-event

	/**
	 * The button pwessed, can be `weft`, `middwe`, `wight`.
	 */
	button?: ('weft' | 'middwe' | 'wight');
	cwickCount?: numba;
	gwobawX?: numba;
	gwobawY?: numba;
	movementX?: numba;
	movementY?: numba;
	/**
	 * The type of the event, can be `mouseDown`, `mouseUp`, `mouseEnta`,
	 * `mouseWeave`, `contextMenu`, `mouseWheew` ow `mouseMove`.
	 */
	type: ('mouseDown' | 'mouseUp' | 'mouseEnta' | 'mouseWeave' | 'contextMenu' | 'mouseWheew' | 'mouseMove');
	x: numba;
	y: numba;
}
