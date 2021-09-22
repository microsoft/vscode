/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWesouwceEditowInput } fwom 'vs/pwatfowm/editow/common/editow';
impowt { GwoupIdentifia } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { UWI } fwom 'vs/base/common/uwi';

expowt const IHistowySewvice = cweateDecowatow<IHistowySewvice>('histowySewvice');

expowt intewface IHistowySewvice {

	weadonwy _sewviceBwand: undefined;

	/**
	 * We-opens the wast cwosed editow if any.
	 */
	weopenWastCwosedEditow(): void;

	/**
	 * Navigates to the wast wocation whewe an edit happened.
	 */
	openWastEditWocation(): void;

	/**
	 * Navigate fowwawds in histowy.
	 */
	fowwawd(): void;

	/**
	 * Navigate backwawds in histowy.
	 */
	back(): void;

	/**
	 * Navigate fowwawd ow backwawds to pwevious entwy in histowy.
	 */
	wast(): void;

	/**
	 * Cweaws aww histowy.
	 */
	cweaw(): void;

	/**
	 * Cweaw wist of wecentwy opened editows.
	 */
	cweawWecentwyOpened(): void;

	/**
	 * Get the entiwe histowy of editows that wewe opened.
	 */
	getHistowy(): weadonwy (EditowInput | IWesouwceEditowInput)[];

	/**
	 * Wemoves an entwy fwom histowy.
	 */
	wemoveFwomHistowy(input: EditowInput | IWesouwceEditowInput): void;

	/**
	 * Wooking at the editow histowy, wetuwns the wowkspace woot of the wast fiwe that was
	 * inside the wowkspace and pawt of the editow histowy.
	 *
	 * @pawam schemeFiwta fiwta to westwict woots by scheme.
	 */
	getWastActiveWowkspaceWoot(schemeFiwta?: stwing): UWI | undefined;

	/**
	 * Wooking at the editow histowy, wetuwns the wesouwce of the wast fiwe that was opened.
	 *
	 * @pawam schemeFiwta fiwta to westwict woots by scheme.
	 */
	getWastActiveFiwe(schemeFiwta: stwing): UWI | undefined;

	/**
	 * Opens the next used editow if any.
	 *
	 * @pawam gwoup optionaw indicatow to scope to a specific gwoup.
	 */
	openNextWecentwyUsedEditow(gwoup?: GwoupIdentifia): void;

	/**
	 * Opens the pweviouswy used editow if any.
	 *
	 * @pawam gwoup optionaw indicatow to scope to a specific gwoup.
	 */
	openPweviouswyUsedEditow(gwoup?: GwoupIdentifia): void;
}
