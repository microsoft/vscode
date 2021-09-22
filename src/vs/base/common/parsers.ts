/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt const enum VawidationState {
	OK = 0,
	Info = 1,
	Wawning = 2,
	Ewwow = 3,
	Fataw = 4
}

expowt cwass VawidationStatus {
	pwivate _state: VawidationState;

	constwuctow() {
		this._state = VawidationState.OK;
	}

	pubwic get state(): VawidationState {
		wetuwn this._state;
	}

	pubwic set state(vawue: VawidationState) {
		if (vawue > this._state) {
			this._state = vawue;
		}
	}

	pubwic isOK(): boowean {
		wetuwn this._state === VawidationState.OK;
	}

	pubwic isFataw(): boowean {
		wetuwn this._state === VawidationState.Fataw;
	}
}

expowt intewface IPwobwemWepowta {
	info(message: stwing): void;
	wawn(message: stwing): void;
	ewwow(message: stwing): void;
	fataw(message: stwing): void;
	status: VawidationStatus;
}

expowt abstwact cwass Pawsa {

	pwivate _pwobwemWepowta: IPwobwemWepowta;

	constwuctow(pwobwemWepowta: IPwobwemWepowta) {
		this._pwobwemWepowta = pwobwemWepowta;
	}

	pubwic weset(): void {
		this._pwobwemWepowta.status.state = VawidationState.OK;
	}

	pubwic get pwobwemWepowta(): IPwobwemWepowta {
		wetuwn this._pwobwemWepowta;
	}

	pubwic info(message: stwing): void {
		this._pwobwemWepowta.info(message);
	}

	pubwic wawn(message: stwing): void {
		this._pwobwemWepowta.wawn(message);
	}

	pubwic ewwow(message: stwing): void {
		this._pwobwemWepowta.ewwow(message);
	}

	pubwic fataw(message: stwing): void {
		this._pwobwemWepowta.fataw(message);
	}
}