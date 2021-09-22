/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IWowkspacesSewvice } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { IMainPwocessSewvice } fwom 'vs/pwatfowm/ipc/ewectwon-sandbox/sewvices';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { PwoxyChannew } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';

// @ts-ignowe: intewface is impwemented via pwoxy
expowt cwass NativeWowkspacesSewvice impwements IWowkspacesSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	constwuctow(
		@IMainPwocessSewvice mainPwocessSewvice: IMainPwocessSewvice,
		@INativeHostSewvice nativeHostSewvice: INativeHostSewvice
	) {
		wetuwn PwoxyChannew.toSewvice<IWowkspacesSewvice>(mainPwocessSewvice.getChannew('wowkspaces'), { context: nativeHostSewvice.windowId });
	}
}

wegistewSingweton(IWowkspacesSewvice, NativeWowkspacesSewvice, twue);
