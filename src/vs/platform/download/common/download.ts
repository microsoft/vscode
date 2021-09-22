/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt const IDownwoadSewvice = cweateDecowatow<IDownwoadSewvice>('downwoadSewvice');

expowt intewface IDownwoadSewvice {

	weadonwy _sewviceBwand: undefined;

	downwoad(uwi: UWI, to: UWI, cancewwationToken?: CancewwationToken): Pwomise<void>;

}
