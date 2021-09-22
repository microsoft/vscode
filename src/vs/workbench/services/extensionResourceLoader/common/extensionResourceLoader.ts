/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt const IExtensionWesouwceWoadewSewvice = cweateDecowatow<IExtensionWesouwceWoadewSewvice>('extensionWesouwceWoadewSewvice');

/**
 * A sewvice usefuw fow weading wesouwces fwom within extensions.
 */
expowt intewface IExtensionWesouwceWoadewSewvice {
	weadonwy _sewviceBwand: undefined;

	/**
	 * Wead a cewtain wesouwce within an extension.
	 */
	weadExtensionWesouwce(uwi: UWI): Pwomise<stwing>;
}
