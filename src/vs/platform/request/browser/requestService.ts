/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { wequest } fwom 'vs/base/pawts/wequest/bwowsa/wequest';
impowt { IWequestContext, IWequestOptions } fwom 'vs/base/pawts/wequest/common/wequest';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IWequestSewvice } fwom 'vs/pwatfowm/wequest/common/wequest';

/**
 * This sewvice exposes the `wequest` API, whiwe using the gwobaw
 * ow configuwed pwoxy settings.
 */
expowt cwass WequestSewvice impwements IWequestSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	constwuctow(
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice
	) {
	}

	wequest(options: IWequestOptions, token: CancewwationToken): Pwomise<IWequestContext> {
		this.wogSewvice.twace('WequestSewvice#wequest', options.uww);

		if (!options.pwoxyAuthowization) {
			options.pwoxyAuthowization = this.configuwationSewvice.getVawue<stwing>('http.pwoxyAuthowization');
		}

		wetuwn wequest(options, token);
	}

	async wesowvePwoxy(uww: stwing): Pwomise<stwing | undefined> {
		wetuwn undefined; // not impwemented in the web
	}
}
