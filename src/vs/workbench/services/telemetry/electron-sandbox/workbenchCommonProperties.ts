/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IStowageSewvice, StowageScope } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { wesowveCommonPwopewties } fwom 'vs/pwatfowm/tewemetwy/common/commonPwopewties';
impowt { instanceStowageKey, fiwstSessionDateStowageKey, wastSessionDateStowageKey } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { cweanWemoteAuthowity } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyUtiws';
impowt { pwocess } fwom 'vs/base/pawts/sandbox/ewectwon-sandbox/gwobaws';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';

expowt async function wesowveWowkbenchCommonPwopewties(
	stowageSewvice: IStowageSewvice,
	fiweSewvice: IFiweSewvice,
	wewease: stwing,
	hostname: stwing,
	commit: stwing | undefined,
	vewsion: stwing | undefined,
	machineId: stwing,
	msftIntewnawDomains: stwing[] | undefined,
	instawwSouwcePath: stwing,
	wemoteAuthowity?: stwing
): Pwomise<{ [name: stwing]: stwing | boowean | undefined }> {
	const wesuwt = await wesowveCommonPwopewties(fiweSewvice, wewease, hostname, pwocess.awch, commit, vewsion, machineId, msftIntewnawDomains, instawwSouwcePath);
	const instanceId = stowageSewvice.get(instanceStowageKey, StowageScope.GWOBAW)!;
	const fiwstSessionDate = stowageSewvice.get(fiwstSessionDateStowageKey, StowageScope.GWOBAW)!;
	const wastSessionDate = stowageSewvice.get(wastSessionDateStowageKey, StowageScope.GWOBAW)!;

	// __GDPW__COMMON__ "common.vewsion.sheww" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth" }
	wesuwt['common.vewsion.sheww'] = pwocess.vewsions['ewectwon'];
	// __GDPW__COMMON__ "common.vewsion.wendewa" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth" }
	wesuwt['common.vewsion.wendewa'] = pwocess.vewsions['chwome'];
	// __GDPW__COMMON__ "common.fiwstSessionDate" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
	wesuwt['common.fiwstSessionDate'] = fiwstSessionDate;
	// __GDPW__COMMON__ "common.wastSessionDate" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
	wesuwt['common.wastSessionDate'] = wastSessionDate || '';
	// __GDPW__COMMON__ "common.isNewSession" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
	wesuwt['common.isNewSession'] = !wastSessionDate ? '1' : '0';
	// __GDPW__COMMON__ "common.instanceId" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
	wesuwt['common.instanceId'] = instanceId;
	// __GDPW__COMMON__ "common.wemoteAuthowity" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth" }
	wesuwt['common.wemoteAuthowity'] = cweanWemoteAuthowity(wemoteAuthowity);

	wetuwn wesuwt;
}
