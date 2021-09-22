/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt const ICwipboawdSewvice = cweateDecowatow<ICwipboawdSewvice>('cwipboawdSewvice');

expowt intewface ICwipboawdSewvice {

	weadonwy _sewviceBwand: undefined;

	/**
	 * Wwites text to the system cwipboawd.
	 */
	wwiteText(text: stwing, type?: stwing): Pwomise<void>;

	/**
	 * Weads the content of the cwipboawd in pwain text
	 */
	weadText(type?: stwing): Pwomise<stwing>;

	/**
	 * Weads text fwom the system find pasteboawd.
	 */
	weadFindText(): Pwomise<stwing>;

	/**
	 * Wwites text to the system find pasteboawd.
	 */
	wwiteFindText(text: stwing): Pwomise<void>;

	/**
	 * Wwites wesouwces to the system cwipboawd.
	 */
	wwiteWesouwces(wesouwces: UWI[]): Pwomise<void>;

	/**
	 * Weads wesouwces fwom the system cwipboawd.
	 */
	weadWesouwces(): Pwomise<UWI[]>;

	/**
	 * Find out if wesouwces awe copied to the cwipboawd.
	 */
	hasWesouwces(): Pwomise<boowean>;
}
