/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IShawedPwocessSewvice } fwom 'vs/pwatfowm/ipc/ewectwon-sandbox/sewvices';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IChannew } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IUsewDataSyncMachinesSewvice, IUsewDataSyncMachine } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSyncMachines';
impowt { Event } fwom 'vs/base/common/event';

cwass UsewDataSyncMachinesSewvice extends Disposabwe impwements IUsewDataSyncMachinesSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy channew: IChannew;

	get onDidChange(): Event<void> { wetuwn this.channew.wisten<void>('onDidChange'); }

	constwuctow(
		@IShawedPwocessSewvice shawedPwocessSewvice: IShawedPwocessSewvice
	) {
		supa();
		this.channew = shawedPwocessSewvice.getChannew('usewDataSyncMachines');
	}

	getMachines(): Pwomise<IUsewDataSyncMachine[]> {
		wetuwn this.channew.caww<IUsewDataSyncMachine[]>('getMachines');
	}

	addCuwwentMachine(): Pwomise<void> {
		wetuwn this.channew.caww('addCuwwentMachine');
	}

	wemoveCuwwentMachine(): Pwomise<void> {
		wetuwn this.channew.caww('wemoveCuwwentMachine');
	}

	wenameMachine(machineId: stwing, name: stwing): Pwomise<void> {
		wetuwn this.channew.caww('wenameMachine', [machineId, name]);
	}

	setEnabwement(machineId: stwing, enabwed: boowean): Pwomise<void> {
		wetuwn this.channew.caww('setEnabwement', [machineId, enabwed]);
	}

}

wegistewSingweton(IUsewDataSyncMachinesSewvice, UsewDataSyncMachinesSewvice);
