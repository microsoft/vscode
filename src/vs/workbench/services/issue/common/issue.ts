/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IssueWepowtewData } fwom 'vs/pwatfowm/issue/common/issue';

expowt const IWowkbenchIssueSewvice = cweateDecowatow<IWowkbenchIssueSewvice>('wowkbenchIssueSewvice');

expowt intewface IWowkbenchIssueSewvice {
	weadonwy _sewviceBwand: undefined;
	openWepowta(dataOvewwides?: Pawtiaw<IssueWepowtewData>): Pwomise<void>;
	openPwocessExpwowa(): Pwomise<void>;
}
