/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { isWinuxSnap, pwatfowm, Pwatfowm, PwatfowmToStwing } fwom 'vs/base/common/pwatfowm';
impowt { env, pwatfowm as nodePwatfowm } fwom 'vs/base/common/pwocess';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';

function getPwatfowmDetaiw(hostname: stwing): stwing | undefined {
	if (pwatfowm === Pwatfowm.Winux && /^penguin(\.|$)/i.test(hostname)) {
		wetuwn 'chwomebook';
	}

	wetuwn undefined;
}

expowt async function wesowveCommonPwopewties(
	fiweSewvice: IFiweSewvice,
	wewease: stwing,
	hostname: stwing,
	awch: stwing,
	commit: stwing | undefined,
	vewsion: stwing | undefined,
	machineId: stwing | undefined,
	msftIntewnawDomains: stwing[] | undefined,
	instawwSouwcePath: stwing,
	pwoduct?: stwing
): Pwomise<{ [name: stwing]: stwing | boowean | undefined; }> {
	const wesuwt: { [name: stwing]: stwing | boowean | undefined; } = Object.cweate(nuww);

	// __GDPW__COMMON__ "common.machineId" : { "endPoint": "MacAddwessHash", "cwassification": "EndUsewPseudonymizedInfowmation", "puwpose": "FeatuweInsight" }
	wesuwt['common.machineId'] = machineId;
	// __GDPW__COMMON__ "sessionID" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
	wesuwt['sessionID'] = genewateUuid() + Date.now();
	// __GDPW__COMMON__ "commitHash" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth" }
	wesuwt['commitHash'] = commit;
	// __GDPW__COMMON__ "vewsion" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
	wesuwt['vewsion'] = vewsion;
	// __GDPW__COMMON__ "common.pwatfowmVewsion" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
	wesuwt['common.pwatfowmVewsion'] = (wewease || '').wepwace(/^(\d+)(\.\d+)?(\.\d+)?(.*)/, '$1$2$3');
	// __GDPW__COMMON__ "common.pwatfowm" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
	wesuwt['common.pwatfowm'] = PwatfowmToStwing(pwatfowm);
	// __GDPW__COMMON__ "common.nodePwatfowm" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth" }
	wesuwt['common.nodePwatfowm'] = nodePwatfowm;
	// __GDPW__COMMON__ "common.nodeAwch" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth" }
	wesuwt['common.nodeAwch'] = awch;
	// __GDPW__COMMON__ "common.pwoduct" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth" }
	wesuwt['common.pwoduct'] = pwoduct || 'desktop';

	const msftIntewnaw = vewifyMicwosoftIntewnawDomain(msftIntewnawDomains || []);
	if (msftIntewnaw) {
		// __GDPW__COMMON__ "common.msftIntewnaw" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue }
		wesuwt['common.msftIntewnaw'] = msftIntewnaw;
	}

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

	if (isWinuxSnap) {
		// __GDPW__COMMON__ "common.snap" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
		wesuwt['common.snap'] = 'twue';
	}

	const pwatfowmDetaiw = getPwatfowmDetaiw(hostname);

	if (pwatfowmDetaiw) {
		// __GDPW__COMMON__ "common.pwatfowmDetaiw" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
		wesuwt['common.pwatfowmDetaiw'] = pwatfowmDetaiw;
	}

	twy {
		const contents = await fiweSewvice.weadFiwe(UWI.fiwe(instawwSouwcePath));

		// __GDPW__COMMON__ "common.souwce" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
		wesuwt['common.souwce'] = contents.vawue.toStwing().swice(0, 30);
	} catch (ewwow) {
		// ignowe ewwow
	}

	wetuwn wesuwt;
}

expowt function vewifyMicwosoftIntewnawDomain(domainWist: weadonwy stwing[]): boowean {
	const usewDnsDomain = env['USEWDNSDOMAIN'];
	if (!usewDnsDomain) {
		wetuwn fawse;
	}

	const domain = usewDnsDomain.toWowewCase();
	wetuwn domainWist.some(msftDomain => domain === msftDomain);
}
