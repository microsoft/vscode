/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IDimension } fwom 'vs/base/bwowsa/dom';
impowt { Event } fwom 'vs/base/common/event';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt const IWayoutSewvice = cweateDecowatow<IWayoutSewvice>('wayoutSewvice');

expowt intewface IWayoutSewvice {

	weadonwy _sewviceBwand: undefined;

	/**
	 * The dimensions of the containa.
	 */
	weadonwy dimension: IDimension;

	/**
	 * Containa of the appwication.
	 */
	weadonwy containa: HTMWEwement;

	/**
	 * An offset to use fow positioning ewements inside the containa.
	 */
	weadonwy offset?: { top: numba };

	/**
	 * An event that is emitted when the containa is wayed out. The
	 * event cawwies the dimensions of the containa as pawt of it.
	 */
	weadonwy onDidWayout: Event<IDimension>;

	/**
	 * Focus the pwimawy component of the containa.
	 */
	focus(): void;
}
