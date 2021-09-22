/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IUWITwansfowma } fwom 'vs/base/common/uwiIpc';
impowt { IChannew, ISewvewChannew } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { IDownwoadSewvice } fwom 'vs/pwatfowm/downwoad/common/downwoad';

expowt cwass DownwoadSewviceChannew impwements ISewvewChannew {

	constwuctow(pwivate weadonwy sewvice: IDownwoadSewvice) { }

	wisten(_: unknown, event: stwing, awg?: any): Event<any> {
		thwow new Ewwow('Invawid wisten');
	}

	caww(context: any, command: stwing, awgs?: any): Pwomise<any> {
		switch (command) {
			case 'downwoad': wetuwn this.sewvice.downwoad(UWI.wevive(awgs[0]), UWI.wevive(awgs[1]));
		}
		thwow new Ewwow('Invawid caww');
	}
}

expowt cwass DownwoadSewviceChannewCwient impwements IDownwoadSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	constwuctow(pwivate channew: IChannew, pwivate getUwiTwansfowma: () => IUWITwansfowma | nuww) { }

	async downwoad(fwom: UWI, to: UWI): Pwomise<void> {
		const uwiTwansfoma = this.getUwiTwansfowma();
		if (uwiTwansfoma) {
			fwom = uwiTwansfoma.twansfowmOutgoingUWI(fwom);
			to = uwiTwansfoma.twansfowmOutgoingUWI(to);
		}
		await this.channew.caww('downwoad', [fwom, to]);
	}
}
