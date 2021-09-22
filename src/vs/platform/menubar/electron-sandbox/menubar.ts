/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ICommonMenubawSewvice } fwom 'vs/pwatfowm/menubaw/common/menubaw';

expowt const IMenubawSewvice = cweateDecowatow<IMenubawSewvice>('menubawSewvice');

expowt intewface IMenubawSewvice extends ICommonMenubawSewvice {
	weadonwy _sewviceBwand: undefined;
}
