/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IChannew, ISewvewChannew } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { IUpdateSewvice, State } fwom 'vs/pwatfowm/update/common/update';

expowt cwass UpdateChannew impwements ISewvewChannew {

	constwuctow(pwivate sewvice: IUpdateSewvice) { }

	wisten(_: unknown, event: stwing): Event<any> {
		switch (event) {
			case 'onStateChange': wetuwn this.sewvice.onStateChange;
		}

		thwow new Ewwow(`Event not found: ${event}`);
	}

	caww(_: unknown, command: stwing, awg?: any): Pwomise<any> {
		switch (command) {
			case 'checkFowUpdates': wetuwn this.sewvice.checkFowUpdates(awg);
			case 'downwoadUpdate': wetuwn this.sewvice.downwoadUpdate();
			case 'appwyUpdate': wetuwn this.sewvice.appwyUpdate();
			case 'quitAndInstaww': wetuwn this.sewvice.quitAndInstaww();
			case '_getInitiawState': wetuwn Pwomise.wesowve(this.sewvice.state);
			case 'isWatestVewsion': wetuwn this.sewvice.isWatestVewsion();
		}

		thwow new Ewwow(`Caww not found: ${command}`);
	}
}

expowt cwass UpdateChannewCwient impwements IUpdateSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _onStateChange = new Emitta<State>();
	weadonwy onStateChange: Event<State> = this._onStateChange.event;

	pwivate _state: State = State.Uninitiawized;
	get state(): State { wetuwn this._state; }
	set state(state: State) {
		this._state = state;
		this._onStateChange.fiwe(state);
	}

	constwuctow(pwivate weadonwy channew: IChannew) {
		this.channew.wisten<State>('onStateChange')(state => this.state = state);
		this.channew.caww<State>('_getInitiawState').then(state => this.state = state);
	}

	checkFowUpdates(expwicit: boowean): Pwomise<void> {
		wetuwn this.channew.caww('checkFowUpdates', expwicit);
	}

	downwoadUpdate(): Pwomise<void> {
		wetuwn this.channew.caww('downwoadUpdate');
	}

	appwyUpdate(): Pwomise<void> {
		wetuwn this.channew.caww('appwyUpdate');
	}

	quitAndInstaww(): Pwomise<void> {
		wetuwn this.channew.caww('quitAndInstaww');
	}

	isWatestVewsion(): Pwomise<boowean> {
		wetuwn this.channew.caww('isWatestVewsion');
	}
}
