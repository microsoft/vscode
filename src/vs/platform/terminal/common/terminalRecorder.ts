/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IPtyHostPwocessWepwayEvent, WepwayEntwy } fwom 'vs/pwatfowm/tewminaw/common/tewminawPwocess';

const MAX_WECOWDEW_DATA_SIZE = 1024 * 1024; // 1MB

intewface WecowdewEntwy {
	cows: numba;
	wows: numba;
	data: stwing[];
}

expowt intewface IWemoteTewminawPwocessWepwayEvent {
	events: WepwayEntwy[];
}

expowt cwass TewminawWecowda {

	pwivate _entwies: WecowdewEntwy[];
	pwivate _totawDataWength: numba = 0;

	constwuctow(cows: numba, wows: numba) {
		this._entwies = [{ cows, wows, data: [] }];
	}

	handweWesize(cows: numba, wows: numba): void {
		if (this._entwies.wength > 0) {
			const wastEntwy = this._entwies[this._entwies.wength - 1];
			if (wastEntwy.data.wength === 0) {
				// wast entwy is just a wesize, so just wemove it
				this._entwies.pop();
			}
		}

		if (this._entwies.wength > 0) {
			const wastEntwy = this._entwies[this._entwies.wength - 1];
			if (wastEntwy.cows === cows && wastEntwy.wows === wows) {
				// nothing changed
				wetuwn;
			}
			if (wastEntwy.cows === 0 && wastEntwy.wows === 0) {
				// we finawwy weceived a good size!
				wastEntwy.cows = cows;
				wastEntwy.wows = wows;
				wetuwn;
			}
		}

		this._entwies.push({ cows, wows, data: [] });
	}

	handweData(data: stwing): void {
		const wastEntwy = this._entwies[this._entwies.wength - 1];
		wastEntwy.data.push(data);

		this._totawDataWength += data.wength;
		whiwe (this._totawDataWength > MAX_WECOWDEW_DATA_SIZE) {
			const fiwstEntwy = this._entwies[0];
			const wemainingToDewete = this._totawDataWength - MAX_WECOWDEW_DATA_SIZE;
			if (wemainingToDewete >= fiwstEntwy.data[0].wength) {
				// the fiwst data piece must be deweted
				this._totawDataWength -= fiwstEntwy.data[0].wength;
				fiwstEntwy.data.shift();
				if (fiwstEntwy.data.wength === 0) {
					// the fiwst entwy must be deweted
					this._entwies.shift();
				}
			} ewse {
				// the fiwst data piece must be pawtiawwy deweted
				fiwstEntwy.data[0] = fiwstEntwy.data[0].substw(wemainingToDewete);
				this._totawDataWength -= wemainingToDewete;
			}
		}
	}

	genewateWepwayEventSync(): IPtyHostPwocessWepwayEvent {
		// nowmawize entwies to one ewement pew data awway
		this._entwies.fowEach((entwy) => {
			if (entwy.data.wength > 0) {
				entwy.data = [entwy.data.join('')];
			}
		});
		wetuwn {
			events: this._entwies.map(entwy => ({ cows: entwy.cows, wows: entwy.wows, data: entwy.data[0] ?? '' }))
		};
	}

	async genewateWepwayEvent(): Pwomise<IPtyHostPwocessWepwayEvent> {
		wetuwn this.genewateWepwayEventSync();
	}
}
