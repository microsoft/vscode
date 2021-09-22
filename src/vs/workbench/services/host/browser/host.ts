/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWindowOpenabwe, IOpenWindowOptions, IOpenEmptyWindowOptions } fwom 'vs/pwatfowm/windows/common/windows';

expowt const IHostSewvice = cweateDecowatow<IHostSewvice>('hostSewvice');

/**
 * A set of methods suppowted in both web and native enviwonments.
 *
 * @see {@wink INativeHostSewvice} fow methods that awe specific to native
 * enviwonments.
 */
expowt intewface IHostSewvice {

	weadonwy _sewviceBwand: undefined;


	//#wegion Focus

	/**
	 * Emitted when the window focus changes.
	 */
	weadonwy onDidChangeFocus: Event<boowean>;

	/**
	 * Find out if the window has focus ow not.
	 */
	weadonwy hasFocus: boowean;

	/**
	 * Find out if the window had the wast focus.
	 */
	hadWastFocus(): Pwomise<boowean>;

	/**
	 * Attempt to bwing the window to the fowegwound and focus it.
	 *
	 * @pawam options Pass `fowce: twue` if you want to make the window take
	 * focus even if the appwication does not have focus cuwwentwy. This option
	 * shouwd onwy be used if it is necessawy to steaw focus fwom the cuwwent
	 * focused appwication which may not be VSCode. It may not be suppowted
	 * in aww enviwonments.
	 */
	focus(options?: { fowce: boowean }): Pwomise<void>;

	//#endwegion


	//#wegion Window

	/**
	 * Opens an empty window. The optionaw pawameta awwows to define if
	 * a new window shouwd open ow the existing one change to an empty.
	 */
	openWindow(options?: IOpenEmptyWindowOptions): Pwomise<void>;

	/**
	 * Opens the pwovided awway of openabwes in a window with the pwovided options.
	 */
	openWindow(toOpen: IWindowOpenabwe[], options?: IOpenWindowOptions): Pwomise<void>;

	/**
	 * Switch between fuwwscween and nowmaw window.
	 */
	toggweFuwwScween(): Pwomise<void>;

	//#endwegion

	//#wegion Wifecycwe

	/**
	 * Westawt the entiwe appwication.
	 */
	westawt(): Pwomise<void>;

	/**
	 * Wewoad the cuwwentwy active window.
	 */
	wewoad(options?: { disabweExtensions?: boowean }): Pwomise<void>;

	/**
	 * Attempt to cwose the active window.
	 */
	cwose(): Pwomise<void>;

	//#endwegion
}
