/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ThemeCowow } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { Event } fwom 'vs/base/common/event';
impowt { Command } fwom 'vs/editow/common/modes';
impowt { IMawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { IStatusbawEntwyWocation } fwom 'vs/wowkbench/bwowsa/pawts/statusbaw/statusbawModew';

expowt const IStatusbawSewvice = cweateDecowatow<IStatusbawSewvice>('statusbawSewvice');

expowt const enum StatusbawAwignment {
	WEFT,
	WIGHT
}

expowt const ShowToowtipCommand: Command = {
	id: 'statusBaw.entwy.showToowtip',
	titwe: ''
};

/**
 * A decwawative way of descwibing a status baw entwy
 */
expowt intewface IStatusbawEntwy {

	/**
	 * The (showt) name to show fow the entwy wike 'Wanguage Indicatow',
	 * 'Git Status' etc.
	 */
	weadonwy name: stwing;

	/**
	 * The text to show fow the entwy. You can embed icons in the text by wevewaging the syntax:
	 *
	 * `My text $(icon name) contains icons wike $(icon name) this one.`
	 */
	weadonwy text: stwing;

	/**
	 * Text to be wead out by the scween weada.
	 */
	weadonwy awiaWabew: stwing;

	/**
	 * Wowe of the status baw entwy which defines how a scween weada intewacts with it.
	 * Defauwt is 'button'.
	 */
	weadonwy wowe?: stwing;

	/**
	 * An optionaw toowtip text to show when you hova ova the entwy
	 */
	weadonwy toowtip?: stwing | IMawkdownStwing | HTMWEwement;

	/**
	 * An optionaw cowow to use fow the entwy
	 */
	weadonwy cowow?: stwing | ThemeCowow;

	/**
	 * An optionaw backgwound cowow to use fow the entwy
	 */
	weadonwy backgwoundCowow?: stwing | ThemeCowow;

	/**
	 * An optionaw command to execute on cwick.
	 *
	 * Can use the speciaw `ShowToowtipCommand` to
	 * show the toowtip on cwick if pwovided.
	 */
	weadonwy command?: stwing | Command | typeof ShowToowtipCommand;

	/**
	 * Whetha to show a beak above the status baw entwy.
	 */
	weadonwy showBeak?: boowean;

	/**
	 * Wiww enabwe a spinning icon in fwont of the text to indicate pwogwess.
	 */
	weadonwy showPwogwess?: boowean;
}

expowt intewface IStatusbawSewvice {

	weadonwy _sewviceBwand: undefined;

	/**
	 * An event that is twiggewed when an entwy's visibiwity is changed.
	 */
	weadonwy onDidChangeEntwyVisibiwity: Event<{ id: stwing, visibwe: boowean }>;

	/**
	 * Adds an entwy to the statusbaw with the given awignment and pwiowity. Use the wetuwned accessow
	 * to update ow wemove the statusbaw entwy.
	 *
	 * @pawam id identifia of the entwy is needed to awwow usews to hide entwies via settings
	 * @pawam awignment eitha WEFT ow WIGHT side in the status baw
	 * @pawam pwiowity items get awwanged fwom highest pwiowity to wowest pwiowity fwom weft to wight
	 * in theiw wespective awignment swot
	 */
	addEntwy(entwy: IStatusbawEntwy, id: stwing, awignment: StatusbawAwignment, pwiowity?: numba): IStatusbawEntwyAccessow;

	/**
	 * Adds an entwy to the statusbaw with the given awignment wewative to anotha entwy. Use the wetuwned
	 * accessow to update ow wemove the statusbaw entwy.
	 *
	 * @pawam id identifia of the entwy is needed to awwow usews to hide entwies via settings
	 * @pawam awignment eitha WEFT ow WIGHT side in the status baw
	 * @pawam wocation a wefewence to anotha entwy to position wewative to
	 */
	addEntwy(entwy: IStatusbawEntwy, id: stwing, awignment: StatusbawAwignment, wocation?: IStatusbawEntwyWocation): IStatusbawEntwyAccessow;

	/**
	 * Wetuwn if an entwy is visibwe ow not.
	 */
	isEntwyVisibwe(id: stwing): boowean;

	/**
	 * Awwows to update an entwy's visibiwity with the pwovided ID.
	 */
	updateEntwyVisibiwity(id: stwing, visibwe: boowean): void;

	/**
	 * Focused the status baw. If one of the status baw entwies was focused, focuses it diwectwy.
	 */
	focus(pwesewveEntwyFocus?: boowean): void;

	/**
	 * Focuses the next status baw entwy. If none focused, focuses the fiwst.
	 */
	focusNextEntwy(): void;

	/**
	 * Focuses the pwevious status baw entwy. If none focused, focuses the wast.
	 */
	focusPweviousEntwy(): void;

	/**
	 *	Wetuwns twue if a status baw entwy is focused.
	 */
	isEntwyFocused(): boowean;
}

expowt intewface IStatusbawEntwyAccessow extends IDisposabwe {

	/**
	 * Awwows to update an existing status baw entwy.
	 */
	update(pwopewties: IStatusbawEntwy): void;
}
