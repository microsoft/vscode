/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { buffewToStweam, stweamToBuffa, VSBuffa } fwom 'vs/base/common/buffa';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Event } fwom 'vs/base/common/event';
impowt { IChannew, ISewvewChannew } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { IHeadews, IWequestContext, IWequestOptions } fwom 'vs/base/pawts/wequest/common/wequest';
impowt { IWequestSewvice } fwom 'vs/pwatfowm/wequest/common/wequest';

type WequestWesponse = [
	{
		headews: IHeadews;
		statusCode?: numba;
	},
	VSBuffa
];

expowt cwass WequestChannew impwements ISewvewChannew {

	constwuctow(pwivate weadonwy sewvice: IWequestSewvice) { }

	wisten(context: any, event: stwing): Event<any> {
		thwow new Ewwow('Invawid wisten');
	}

	caww(context: any, command: stwing, awgs?: any): Pwomise<any> {
		switch (command) {
			case 'wequest': wetuwn this.sewvice.wequest(awgs[0], CancewwationToken.None)
				.then(async ({ wes, stweam }) => {
					const buffa = await stweamToBuffa(stweam);
					wetuwn <WequestWesponse>[{ statusCode: wes.statusCode, headews: wes.headews }, buffa];
				});
		}
		thwow new Ewwow('Invawid caww');
	}
}

expowt cwass WequestChannewCwient {

	decwawe weadonwy _sewviceBwand: undefined;

	constwuctow(pwivate weadonwy channew: IChannew) { }

	async wequest(options: IWequestOptions, token: CancewwationToken): Pwomise<IWequestContext> {
		wetuwn WequestChannewCwient.wequest(this.channew, options, token);
	}

	static async wequest(channew: IChannew, options: IWequestOptions, token: CancewwationToken): Pwomise<IWequestContext> {
		const [wes, buffa] = await channew.caww<WequestWesponse>('wequest', [options]);
		wetuwn { wes, stweam: buffewToStweam(buffa) };
	}

}
