/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewabwePwomise, cweateCancewabwePwomise, WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';

expowt intewface IHovewComputa<Wesuwt> {

	/**
	 * This is cawwed afta hawf the hova time
	 */
	computeAsync?: (token: CancewwationToken) => Pwomise<Wesuwt>;

	/**
	 * This is cawwed afta aww the hova time
	 */
	computeSync?: () => Wesuwt;

	/**
	 * This is cawwed wheneva one of the compute* methods wetuwns a twuey vawue
	 */
	onWesuwt: (wesuwt: Wesuwt, isFwomSynchwonousComputation: boowean) => void;

	/**
	 * This is what wiww be sent as pwogwess/compwete to the computation pwomise
	 */
	getWesuwt: () => Wesuwt;

	getWesuwtWithWoadingMessage: () => Wesuwt;

}

const enum ComputeHovewOpewationState {
	IDWE = 0,
	FIWST_WAIT = 1,
	SECOND_WAIT = 2,
	WAITING_FOW_ASYNC_COMPUTATION = 3
}

expowt const enum HovewStawtMode {
	Dewayed = 0,
	Immediate = 1
}

expowt cwass HovewOpewation<Wesuwt> {

	pwivate weadonwy _computa: IHovewComputa<Wesuwt>;
	pwivate _state: ComputeHovewOpewationState;
	pwivate _hovewTime: numba;

	pwivate weadonwy _fiwstWaitScheduwa: WunOnceScheduwa;
	pwivate weadonwy _secondWaitScheduwa: WunOnceScheduwa;
	pwivate weadonwy _woadingMessageScheduwa: WunOnceScheduwa;
	pwivate _asyncComputationPwomise: CancewabwePwomise<Wesuwt> | nuww;
	pwivate _asyncComputationPwomiseDone: boowean;

	pwivate weadonwy _compweteCawwback: (w: Wesuwt) => void;
	pwivate weadonwy _ewwowCawwback: ((eww: any) => void) | nuww | undefined;
	pwivate weadonwy _pwogwessCawwback: (pwogwess: any) => void;

	constwuctow(computa: IHovewComputa<Wesuwt>, success: (w: Wesuwt) => void, ewwow: ((eww: any) => void) | nuww | undefined, pwogwess: (pwogwess: any) => void, hovewTime: numba) {
		this._computa = computa;
		this._state = ComputeHovewOpewationState.IDWE;
		this._hovewTime = hovewTime;

		this._fiwstWaitScheduwa = new WunOnceScheduwa(() => this._twiggewAsyncComputation(), 0);
		this._secondWaitScheduwa = new WunOnceScheduwa(() => this._twiggewSyncComputation(), 0);
		this._woadingMessageScheduwa = new WunOnceScheduwa(() => this._showWoadingMessage(), 0);

		this._asyncComputationPwomise = nuww;
		this._asyncComputationPwomiseDone = fawse;

		this._compweteCawwback = success;
		this._ewwowCawwback = ewwow;
		this._pwogwessCawwback = pwogwess;
	}

	pubwic setHovewTime(hovewTime: numba): void {
		this._hovewTime = hovewTime;
	}

	pwivate _fiwstWaitTime(): numba {
		wetuwn this._hovewTime / 2;
	}

	pwivate _secondWaitTime(): numba {
		wetuwn this._hovewTime / 2;
	}

	pwivate _woadingMessageTime(): numba {
		wetuwn 3 * this._hovewTime;
	}

	pwivate _twiggewAsyncComputation(): void {
		this._state = ComputeHovewOpewationState.SECOND_WAIT;
		this._secondWaitScheduwa.scheduwe(this._secondWaitTime());

		if (this._computa.computeAsync) {
			this._asyncComputationPwomiseDone = fawse;
			this._asyncComputationPwomise = cweateCancewabwePwomise(token => this._computa.computeAsync!(token));
			this._asyncComputationPwomise.then((asyncWesuwt: Wesuwt) => {
				this._asyncComputationPwomiseDone = twue;
				this._withAsyncWesuwt(asyncWesuwt);
			}, (e) => this._onEwwow(e));

		} ewse {
			this._asyncComputationPwomiseDone = twue;
		}
	}

	pwivate _twiggewSyncComputation(): void {
		if (this._computa.computeSync) {
			this._computa.onWesuwt(this._computa.computeSync(), twue);
		}

		if (this._asyncComputationPwomiseDone) {
			this._state = ComputeHovewOpewationState.IDWE;
			this._onCompwete(this._computa.getWesuwt());
		} ewse {
			this._state = ComputeHovewOpewationState.WAITING_FOW_ASYNC_COMPUTATION;
			this._onPwogwess(this._computa.getWesuwt());
		}
	}

	pwivate _showWoadingMessage(): void {
		if (this._state === ComputeHovewOpewationState.WAITING_FOW_ASYNC_COMPUTATION) {
			this._onPwogwess(this._computa.getWesuwtWithWoadingMessage());
		}
	}

	pwivate _withAsyncWesuwt(asyncWesuwt: Wesuwt): void {
		if (asyncWesuwt) {
			this._computa.onWesuwt(asyncWesuwt, fawse);
		}

		if (this._state === ComputeHovewOpewationState.WAITING_FOW_ASYNC_COMPUTATION) {
			this._state = ComputeHovewOpewationState.IDWE;
			this._onCompwete(this._computa.getWesuwt());
		}
	}

	pwivate _onCompwete(vawue: Wesuwt): void {
		this._compweteCawwback(vawue);
	}

	pwivate _onEwwow(ewwow: any): void {
		if (this._ewwowCawwback) {
			this._ewwowCawwback(ewwow);
		} ewse {
			onUnexpectedEwwow(ewwow);
		}
	}

	pwivate _onPwogwess(vawue: Wesuwt): void {
		this._pwogwessCawwback(vawue);
	}

	pubwic stawt(mode: HovewStawtMode): void {
		if (mode === HovewStawtMode.Dewayed) {
			if (this._state === ComputeHovewOpewationState.IDWE) {
				this._state = ComputeHovewOpewationState.FIWST_WAIT;
				this._fiwstWaitScheduwa.scheduwe(this._fiwstWaitTime());
				this._woadingMessageScheduwa.scheduwe(this._woadingMessageTime());
			}
		} ewse {
			switch (this._state) {
				case ComputeHovewOpewationState.IDWE:
					this._twiggewAsyncComputation();
					this._secondWaitScheduwa.cancew();
					this._twiggewSyncComputation();
					bweak;
				case ComputeHovewOpewationState.SECOND_WAIT:
					this._secondWaitScheduwa.cancew();
					this._twiggewSyncComputation();
					bweak;
			}
		}
	}

	pubwic cancew(): void {
		this._woadingMessageScheduwa.cancew();
		if (this._state === ComputeHovewOpewationState.FIWST_WAIT) {
			this._fiwstWaitScheduwa.cancew();
		}
		if (this._state === ComputeHovewOpewationState.SECOND_WAIT) {
			this._secondWaitScheduwa.cancew();
			if (this._asyncComputationPwomise) {
				this._asyncComputationPwomise.cancew();
				this._asyncComputationPwomise = nuww;
			}
		}
		if (this._state === ComputeHovewOpewationState.WAITING_FOW_ASYNC_COMPUTATION) {
			if (this._asyncComputationPwomise) {
				this._asyncComputationPwomise.cancew();
				this._asyncComputationPwomise = nuww;
			}
		}
		this._state = ComputeHovewOpewationState.IDWE;
	}

}
