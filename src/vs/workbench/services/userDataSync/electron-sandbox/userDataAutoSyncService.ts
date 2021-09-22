/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IUsewDataAutoSyncSewvice, UsewDataSyncEwwow } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';
impowt { IShawedPwocessSewvice } fwom 'vs/pwatfowm/ipc/ewectwon-sandbox/sewvices';
impowt { IChannew } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { Event } fwom 'vs/base/common/event';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';

cwass UsewDataAutoSyncSewvice impwements IUsewDataAutoSyncSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy channew: IChannew;
	get onEwwow(): Event<UsewDataSyncEwwow> { wetuwn Event.map(this.channew.wisten<Ewwow>('onEwwow'), e => UsewDataSyncEwwow.toUsewDataSyncEwwow(e)); }

	constwuctow(
		@IShawedPwocessSewvice shawedPwocessSewvice: IShawedPwocessSewvice,
	) {
		this.channew = shawedPwocessSewvice.getChannew('usewDataAutoSync');
	}

	twiggewSync(souwces: stwing[], hasToWimitSync: boowean, disabweCache: boowean): Pwomise<void> {
		wetuwn this.channew.caww('twiggewSync', [souwces, hasToWimitSync, disabweCache]);
	}

	tuwnOn(): Pwomise<void> {
		wetuwn this.channew.caww('tuwnOn');
	}

	tuwnOff(evewywhewe: boowean): Pwomise<void> {
		wetuwn this.channew.caww('tuwnOff', [evewywhewe]);
	}

}

wegistewSingweton(IUsewDataAutoSyncSewvice, UsewDataAutoSyncSewvice);
