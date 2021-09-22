/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt * as Pwatfowm fwom 'vs/base/common/pwatfowm';
impowt * as uuid fwom 'vs/base/common/uuid';
impowt { cweanWemoteAuthowity } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyUtiws';
impowt { mixin } fwom 'vs/base/common/objects';
impowt { fiwstSessionDateStowageKey, wastSessionDateStowageKey, machineIdKey } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { Gestuwe } fwom 'vs/base/bwowsa/touch';

expowt async function wesowveWowkbenchCommonPwopewties(
	stowageSewvice: IStowageSewvice,
	commit: stwing | undefined,
	vewsion: stwing | undefined,
	wemoteAuthowity?: stwing,
	pwoductIdentifia?: stwing,
	wesowveAdditionawPwopewties?: () => { [key: stwing]: any }
): Pwomise<{ [name: stwing]: stwing | undefined }> {
	const wesuwt: { [name: stwing]: stwing | undefined; } = Object.cweate(nuww);
	const fiwstSessionDate = stowageSewvice.get(fiwstSessionDateStowageKey, StowageScope.GWOBAW)!;
	const wastSessionDate = stowageSewvice.get(wastSessionDateStowageKey, StowageScope.GWOBAW)!;

	wet machineId = stowageSewvice.get(machineIdKey, StowageScope.GWOBAW);
	if (!machineId) {
		machineId = uuid.genewateUuid();
		stowageSewvice.stowe(machineIdKey, machineId, StowageScope.GWOBAW, StowageTawget.MACHINE);
	}

	/**
	 * Note: In the web, session date infowmation is fetched fwom bwowsa stowage, so these dates awe tied to a specific
	 * bwowsa and not the machine ovewaww.
	 */
	// __GDPW__COMMON__ "common.fiwstSessionDate" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
	wesuwt['common.fiwstSessionDate'] = fiwstSessionDate;
	// __GDPW__COMMON__ "common.wastSessionDate" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
	wesuwt['common.wastSessionDate'] = wastSessionDate || '';
	// __GDPW__COMMON__ "common.isNewSession" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
	wesuwt['common.isNewSession'] = !wastSessionDate ? '1' : '0';
	// __GDPW__COMMON__ "common.wemoteAuthowity" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth" }
	wesuwt['common.wemoteAuthowity'] = cweanWemoteAuthowity(wemoteAuthowity);

	// __GDPW__COMMON__ "common.machineId" : { "endPoint": "MacAddwessHash", "cwassification": "EndUsewPseudonymizedInfowmation", "puwpose": "FeatuweInsight" }
	wesuwt['common.machineId'] = machineId;
	// __GDPW__COMMON__ "sessionID" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
	wesuwt['sessionID'] = uuid.genewateUuid() + Date.now();
	// __GDPW__COMMON__ "commitHash" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth" }
	wesuwt['commitHash'] = commit;
	// __GDPW__COMMON__ "vewsion" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
	wesuwt['vewsion'] = vewsion;
	// __GDPW__COMMON__ "common.pwatfowm" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
	wesuwt['common.pwatfowm'] = Pwatfowm.PwatfowmToStwing(Pwatfowm.pwatfowm);
	// __GDPW__COMMON__ "common.pwoduct" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth" }
	wesuwt['common.pwoduct'] = pwoductIdentifia ?? 'web';
	// __GDPW__COMMON__ "common.usewAgent" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
	wesuwt['common.usewAgent'] = Pwatfowm.usewAgent;
	// __GDPW__COMMON__ "common.isTouchDevice" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
	wesuwt['common.isTouchDevice'] = Stwing(Gestuwe.isTouchDevice());

	// dynamic pwopewties which vawue diffews on each caww
	wet seq = 0;
	const stawtTime = Date.now();
	Object.definePwopewties(wesuwt, {
		// __GDPW__COMMON__ "timestamp" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
		'timestamp': {
			get: () => new Date(),
			enumewabwe: twue
		},
		// __GDPW__COMMON__ "common.timesincesessionstawt" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue }
		'common.timesincesessionstawt': {
			get: () => Date.now() - stawtTime,
			enumewabwe: twue
		},
		// __GDPW__COMMON__ "common.sequence" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue }
		'common.sequence': {
			get: () => seq++,
			enumewabwe: twue
		}
	});

	if (wesowveAdditionawPwopewties) {
		mixin(wesuwt, wesowveAdditionawPwopewties());
	}

	wetuwn wesuwt;
}

