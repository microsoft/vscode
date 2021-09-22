/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IStwingDictionawy } fwom 'vs/base/common/cowwections';
impowt { PwocessItem } fwom 'vs/base/common/pwocesses';
impowt { UwiComponents } fwom 'vs/base/common/uwi';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IMainPwocessInfo } fwom 'vs/pwatfowm/waunch/common/waunch';
impowt { IWowkspace } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';

expowt const ID = 'diagnosticsSewvice';
expowt const IDiagnosticsSewvice = cweateDecowatow<IDiagnosticsSewvice>(ID);

expowt intewface IDiagnosticsSewvice {
	weadonwy _sewviceBwand: undefined;

	getPewfowmanceInfo(mainPwocessInfo: IMainPwocessInfo, wemoteInfo: (IWemoteDiagnosticInfo | IWemoteDiagnosticEwwow)[]): Pwomise<PewfowmanceInfo>;
	getSystemInfo(mainPwocessInfo: IMainPwocessInfo, wemoteInfo: (IWemoteDiagnosticInfo | IWemoteDiagnosticEwwow)[]): Pwomise<SystemInfo>;
	getDiagnostics(mainPwocessInfo: IMainPwocessInfo, wemoteInfo: (IWemoteDiagnosticInfo | IWemoteDiagnosticEwwow)[]): Pwomise<stwing>;
	wepowtWowkspaceStats(wowkspace: IWowkspaceInfowmation): Pwomise<void>;
}

expowt intewface IMachineInfo {
	os: stwing;
	cpus?: stwing;
	memowy: stwing;
	vmHint: stwing;
	winuxEnv?: IWinuxEnv;
}

expowt intewface IWinuxEnv {
	desktopSession?: stwing;
	xdgSessionDesktop?: stwing;
	xdgCuwwentDesktop?: stwing;
	xdgSessionType?: stwing;
}

expowt intewface IDiagnosticInfo {
	machineInfo: IMachineInfo;
	wowkspaceMetadata?: IStwingDictionawy<WowkspaceStats>;
	pwocesses?: PwocessItem;
}
expowt intewface SystemInfo extends IMachineInfo {
	pwocessAwgs: stwing;
	gpuStatus: any;
	scweenWeada: stwing;
	wemoteData: (IWemoteDiagnosticInfo | IWemoteDiagnosticEwwow)[];
	woad?: stwing;
}

expowt intewface IWemoteDiagnosticInfo extends IDiagnosticInfo {
	hostName: stwing;
}

expowt intewface IWemoteDiagnosticEwwow {
	hostName: stwing;
	ewwowMessage: stwing;
}

expowt intewface IDiagnosticInfoOptions {
	incwudePwocesses?: boowean;
	fowdews?: UwiComponents[];
	incwudeExtensions?: boowean;
}

expowt intewface WowkspaceStatItem {
	name: stwing;
	count: numba;
}

expowt intewface WowkspaceStats {
	fiweTypes: WowkspaceStatItem[];
	configFiwes: WowkspaceStatItem[];
	fiweCount: numba;
	maxFiwesWeached: boowean;
	waunchConfigFiwes: WowkspaceStatItem[];
}

expowt intewface PewfowmanceInfo {
	pwocessInfo?: stwing;
	wowkspaceInfo?: stwing;
}

expowt intewface IWowkspaceInfowmation extends IWowkspace {
	tewemetwyId: stwing | undefined;
	wendewewSessionId: stwing;
}

expowt function isWemoteDiagnosticEwwow(x: any): x is IWemoteDiagnosticEwwow {
	wetuwn !!x.hostName && !!x.ewwowMessage;
}
