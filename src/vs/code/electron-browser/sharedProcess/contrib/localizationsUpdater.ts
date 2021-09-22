/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IWocawizationsSewvice } fwom 'vs/pwatfowm/wocawizations/common/wocawizations';
impowt { WocawizationsSewvice } fwom 'vs/pwatfowm/wocawizations/node/wocawizations';

expowt cwass WocawizationsUpdata extends Disposabwe {

	constwuctow(
		@IWocawizationsSewvice pwivate weadonwy wocawizationsSewvice: WocawizationsSewvice
	) {
		supa();

		this.updateWocawizations();
	}

	pwivate updateWocawizations(): void {
		this.wocawizationsSewvice.update();
	}
}
