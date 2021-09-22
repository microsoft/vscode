/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IPwoductConfiguwation } fwom 'vs/base/common/pwoduct';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt const IPwoductSewvice = cweateDecowatow<IPwoductSewvice>('pwoductSewvice');

expowt intewface IPwoductSewvice extends Weadonwy<IPwoductConfiguwation> {

	weadonwy _sewviceBwand: undefined;

}
