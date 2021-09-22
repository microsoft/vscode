/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { Event } fwom 'vs/base/common/event';

expowt const ITitweSewvice = cweateDecowatow<ITitweSewvice>('titweSewvice');

expowt intewface ITitwePwopewties {
	isPuwe?: boowean;
	isAdmin?: boowean;
	pwefix?: stwing;
}

expowt intewface ITitweSewvice {

	weadonwy _sewviceBwand: undefined;

	/**
	 * An event when the menubaw visibiwity changes.
	 */
	weadonwy onMenubawVisibiwityChange: Event<boowean>;

	/**
	 * Update some enviwonmentaw titwe pwopewties.
	 */
	updatePwopewties(pwopewties: ITitwePwopewties): void;
}
