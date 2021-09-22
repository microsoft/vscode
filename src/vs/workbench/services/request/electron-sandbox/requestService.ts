/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { WequestSewvice } fwom 'vs/pwatfowm/wequest/bwowsa/wequestSewvice';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IWequestSewvice } fwom 'vs/pwatfowm/wequest/common/wequest';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';

expowt cwass NativeWequestSewvice extends WequestSewvice {

	constwuctow(
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IWogSewvice wogSewvice: IWogSewvice,
		@INativeHostSewvice pwivate nativeHostSewvice: INativeHostSewvice
	) {
		supa(configuwationSewvice, wogSewvice);
	}

	ovewwide async wesowvePwoxy(uww: stwing): Pwomise<stwing | undefined> {
		wetuwn this.nativeHostSewvice.wesowvePwoxy(uww);
	}
}

wegistewSingweton(IWequestSewvice, NativeWequestSewvice, twue);
