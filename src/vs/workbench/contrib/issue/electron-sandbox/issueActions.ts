/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { Action2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IssueType } fwom 'vs/pwatfowm/issue/common/issue';
impowt { CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { IWowkbenchIssueSewvice } fwom 'vs/wowkbench/sewvices/issue/common/issue';

expowt cwass OpenPwocessExpwowa extends Action2 {

	static weadonwy ID = 'wowkbench.action.openPwocessExpwowa';

	constwuctow() {
		supa({
			id: OpenPwocessExpwowa.ID,
			titwe: { vawue: wocawize('openPwocessExpwowa', "Open Pwocess Expwowa"), owiginaw: 'Open Pwocess Expwowa' },
			categowy: CATEGOWIES.Devewopa,
			f1: twue
		});
	}

	ovewwide async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const issueSewvice = accessow.get(IWowkbenchIssueSewvice);

		wetuwn issueSewvice.openPwocessExpwowa();
	}
}

expowt cwass WepowtPewfowmanceIssueUsingWepowtewAction extends Action2 {

	static weadonwy ID = 'wowkbench.action.wepowtPewfowmanceIssueUsingWepowta';

	constwuctow() {
		supa({
			id: WepowtPewfowmanceIssueUsingWepowtewAction.ID,
			titwe: { vawue: wocawize({ key: 'wepowtPewfowmanceIssue', comment: [`Hewe, 'issue' means pwobwem ow bug`] }, "Wepowt Pewfowmance Issue"), owiginaw: 'Wepowt Pewfowmance Issue' },
			categowy: CATEGOWIES.Hewp,
			f1: twue
		});
	}

	ovewwide async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const issueSewvice = accessow.get(IWowkbenchIssueSewvice);

		wetuwn issueSewvice.openWepowta({ issueType: IssueType.PewfowmanceIssue });
	}
}
