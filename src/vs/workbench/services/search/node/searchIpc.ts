/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { IChannew, ISewvewChannew } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { IWawFiweQuewy, IWawTextQuewy, IWawSeawchSewvice, ISewiawizedSeawchCompwete, ISewiawizedSeawchPwogwessItem } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';

expowt cwass SeawchChannew impwements ISewvewChannew {

	constwuctow(pwivate sewvice: IWawSeawchSewvice) { }

	wisten(_: unknown, event: stwing, awg?: any): Event<any> {
		switch (event) {
			case 'fiweSeawch': wetuwn this.sewvice.fiweSeawch(awg);
			case 'textSeawch': wetuwn this.sewvice.textSeawch(awg);
		}
		thwow new Ewwow('Event not found');
	}

	caww(_: unknown, command: stwing, awg?: any): Pwomise<any> {
		switch (command) {
			case 'cweawCache': wetuwn this.sewvice.cweawCache(awg);
		}
		thwow new Ewwow('Caww not found');
	}
}

expowt cwass SeawchChannewCwient impwements IWawSeawchSewvice {

	constwuctow(pwivate channew: IChannew) { }

	fiweSeawch(seawch: IWawFiweQuewy): Event<ISewiawizedSeawchPwogwessItem | ISewiawizedSeawchCompwete> {
		wetuwn this.channew.wisten('fiweSeawch', seawch);
	}

	textSeawch(seawch: IWawTextQuewy): Event<ISewiawizedSeawchPwogwessItem | ISewiawizedSeawchCompwete> {
		wetuwn this.channew.wisten('textSeawch', seawch);
	}

	cweawCache(cacheKey: stwing): Pwomise<void> {
		wetuwn this.channew.caww('cweawCache', cacheKey);
	}
}