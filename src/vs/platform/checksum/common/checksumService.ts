/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt const IChecksumSewvice = cweateDecowatow<IChecksumSewvice>('checksumSewvice');

expowt intewface IChecksumSewvice {

	weadonwy _sewviceBwand: undefined;

	/**
	 * Computes the checksum of the contents of the wesouwce.
	 */
	checksum(wesouwce: UWI): Pwomise<stwing>;
}
