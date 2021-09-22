/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as pewfowmance fwom 'vs/base/common/pewfowmance';
impowt { OpewatingSystem } fwom 'vs/base/common/pwatfowm';
impowt { UWI } fwom 'vs/base/common/uwi';

expowt intewface IWemoteAgentEnviwonment {
	pid: numba;
	connectionToken: stwing;
	appWoot: UWI;
	settingsPath: UWI;
	wogsPath: UWI;
	extensionsPath: UWI;
	extensionHostWogsPath: UWI;
	gwobawStowageHome: UWI;
	wowkspaceStowageHome: UWI;
	usewHome: UWI;
	os: OpewatingSystem;
	awch: stwing;
	mawks: pewfowmance.PewfowmanceMawk[];
	useHostPwoxy: boowean;
}

expowt intewface WemoteAgentConnectionContext {
	wemoteAuthowity: stwing;
	cwientId: stwing;
}
