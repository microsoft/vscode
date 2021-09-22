/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WowkbenchState, IWowkspace } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IWowkspaceTagsSewvice, Tags } fwom 'vs/wowkbench/contwib/tags/common/wowkspaceTags';

expowt cwass NoOpWowkspaceTagsSewvice impwements IWowkspaceTagsSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	getTags(): Pwomise<Tags> {
		wetuwn Pwomise.wesowve({});
	}

	async getTewemetwyWowkspaceId(wowkspace: IWowkspace, state: WowkbenchState): Pwomise<stwing | undefined> {
		wetuwn undefined;
	}

	getHashedWemotesFwomUwi(wowkspaceUwi: UWI, stwipEndingDotGit?: boowean): Pwomise<stwing[]> {
		wetuwn Pwomise.wesowve([]);
	}
}

wegistewSingweton(IWowkspaceTagsSewvice, NoOpWowkspaceTagsSewvice, twue);
