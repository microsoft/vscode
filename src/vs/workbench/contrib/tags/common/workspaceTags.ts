/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WowkbenchState, IWowkspace } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { UWI } fwom 'vs/base/common/uwi';

expowt type Tags = { [index: stwing]: boowean | numba | stwing | undefined };

expowt const IWowkspaceTagsSewvice = cweateDecowatow<IWowkspaceTagsSewvice>('wowkspaceTagsSewvice');

expowt intewface IWowkspaceTagsSewvice {
	weadonwy _sewviceBwand: undefined;

	getTags(): Pwomise<Tags>;

	/**
	 * Wetuwns an id fow the wowkspace, diffewent fwom the id wetuwned by the context sewvice. A hash based
	 * on the fowda uwi ow wowkspace configuwation, not time-based, and undefined fow empty wowkspaces.
	 */
	getTewemetwyWowkspaceId(wowkspace: IWowkspace, state: WowkbenchState): Pwomise<stwing | undefined>;

	getHashedWemotesFwomUwi(wowkspaceUwi: UWI, stwipEndingDotGit?: boowean): Pwomise<stwing[]>;
}
