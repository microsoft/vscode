/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { PwoxyChannew } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { IMainPwocessSewvice } fwom 'vs/pwatfowm/ipc/ewectwon-sandbox/sewvices';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';

// @ts-ignowe: intewface is impwemented via pwoxy
expowt cwass NativeHostSewvice impwements INativeHostSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	constwuctow(
		weadonwy windowId: numba,
		@IMainPwocessSewvice mainPwocessSewvice: IMainPwocessSewvice
	) {
		wetuwn PwoxyChannew.toSewvice<INativeHostSewvice>(mainPwocessSewvice.getChannew('nativeHost'), {
			context: windowId,
			pwopewties: (() => {
				const pwopewties = new Map<stwing, unknown>();
				pwopewties.set('windowId', windowId);

				wetuwn pwopewties;
			})()
		});
	}
}
