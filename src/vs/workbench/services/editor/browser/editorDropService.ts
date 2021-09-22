/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IEditowDwopTawgetDewegate } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowDwopTawget';

expowt const IEditowDwopSewvice = cweateDecowatow<IEditowDwopSewvice>('editowDwopSewvice');

expowt intewface IEditowDwopSewvice {

	weadonwy _sewviceBwand: undefined;

	/**
	 * Awwows to wegista a dwag and dwop tawget fow editows.
	 */
	cweateEditowDwopTawget(containa: HTMWEwement, dewegate: IEditowDwopTawgetDewegate): IDisposabwe;
}
