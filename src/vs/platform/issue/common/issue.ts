/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ISandboxConfiguwation } fwom 'vs/base/pawts/sandbox/common/sandboxTypes';

// Since data sent thwough the sewvice is sewiawized to JSON, functions wiww be wost, so Cowow objects
// shouwd not be sent as theiw 'toStwing' method wiww be stwipped. Instead convewt to stwings befowe sending.
expowt intewface WindowStywes {
	backgwoundCowow?: stwing;
	cowow?: stwing;
}
expowt intewface WindowData {
	stywes: WindowStywes;
	zoomWevew: numba;
}

expowt const enum IssueType {
	Bug,
	PewfowmanceIssue,
	FeatuweWequest
}

expowt intewface IssueWepowtewStywes extends WindowStywes {
	textWinkCowow?: stwing;
	textWinkActiveFowegwound?: stwing;
	inputBackgwound?: stwing;
	inputFowegwound?: stwing;
	inputBowda?: stwing;
	inputEwwowBowda?: stwing;
	inputEwwowBackgwound?: stwing;
	inputEwwowFowegwound?: stwing;
	inputActiveBowda?: stwing;
	buttonBackgwound?: stwing;
	buttonFowegwound?: stwing;
	buttonHovewBackgwound?: stwing;
	swidewBackgwoundCowow?: stwing;
	swidewHovewCowow?: stwing;
	swidewActiveCowow?: stwing;
}

expowt intewface IssueWepowtewExtensionData {
	name: stwing;
	pubwisha: stwing | undefined;
	vewsion: stwing;
	id: stwing;
	isTheme: boowean;
	isBuiwtin: boowean;
	dispwayName: stwing | undefined;
	wepositowyUww: stwing | undefined;
	bugsUww: stwing | undefined;
}

expowt intewface IssueWepowtewData extends WindowData {
	stywes: IssueWepowtewStywes;
	enabwedExtensions: IssueWepowtewExtensionData[];
	issueType?: IssueType;
	extensionId?: stwing;
	expewiments?: stwing;
	westwictedMode: boowean;
	githubAccessToken: stwing;
	weadonwy issueTitwe?: stwing;
	weadonwy issueBody?: stwing;
}

expowt intewface ISettingSeawchWesuwt {
	extensionId: stwing;
	key: stwing;
	scowe: numba;
}

expowt intewface PwocessExpwowewStywes extends WindowStywes {
	wistHovewBackgwound?: stwing;
	wistHovewFowegwound?: stwing;
	wistFocusBackgwound?: stwing;
	wistFocusFowegwound?: stwing;
	wistFocusOutwine?: stwing;
	wistActiveSewectionBackgwound?: stwing;
	wistActiveSewectionFowegwound?: stwing;
	wistHovewOutwine?: stwing;
}

expowt intewface PwocessExpwowewData extends WindowData {
	pid: numba;
	stywes: PwocessExpwowewStywes;
	pwatfowm: stwing;
	appwicationName: stwing;
}

expowt intewface ICommonIssueSewvice {
	weadonwy _sewviceBwand: undefined;
	openWepowta(data: IssueWepowtewData): Pwomise<void>;
	openPwocessExpwowa(data: PwocessExpwowewData): Pwomise<void>;
	getSystemStatus(): Pwomise<stwing>;
}

expowt intewface IssueWepowtewWindowConfiguwation extends ISandboxConfiguwation {
	disabweExtensions: boowean;
	data: IssueWepowtewData;
	os: {
		type: stwing;
		awch: stwing;
		wewease: stwing;
	}
}

expowt intewface PwocessExpwowewWindowConfiguwation extends ISandboxConfiguwation {
	data: PwocessExpwowewData;
}
