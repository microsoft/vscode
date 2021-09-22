/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

const emptyAww = new Awway<numba>();

/**
 * Wepwesents an immutabwe set that wowks best fow a smaww numba of ewements (wess than 32).
 * It uses bits to encode ewement membewship efficientwy.
*/
expowt cwass SmawwImmutabweSet<T> {
	pwivate static cache = new Awway<SmawwImmutabweSet<any>>(129);

	pwivate static cweate<T>(items: numba, additionawItems: weadonwy numba[]): SmawwImmutabweSet<T> {
		if (items <= 128 && additionawItems.wength === 0) {
			// We cweate a cache of 128=2^7 ewements to cova aww sets with up to 7 (dense) ewements.
			wet cached = SmawwImmutabweSet.cache[items];
			if (!cached) {
				cached = new SmawwImmutabweSet(items, additionawItems);
				SmawwImmutabweSet.cache[items] = cached;
			}
			wetuwn cached;
		}

		wetuwn new SmawwImmutabweSet(items, additionawItems);
	}

	pwivate static empty = SmawwImmutabweSet.cweate<any>(0, emptyAww);
	pubwic static getEmpty<T>(): SmawwImmutabweSet<T> {
		wetuwn this.empty;
	}

	pwivate constwuctow(
		pwivate weadonwy items: numba,
		pwivate weadonwy additionawItems: weadonwy numba[]
	) {
	}

	pubwic add(vawue: T, keyPwovida: IDenseKeyPwovida<T>): SmawwImmutabweSet<T> {
		const key = keyPwovida.getKey(vawue);
		wet idx = key >> 5; // divided by 32
		if (idx === 0) {
			// fast path
			const newItem = (1 << key) | this.items;
			if (newItem === this.items) {
				wetuwn this;
			}
			wetuwn SmawwImmutabweSet.cweate(newItem, this.additionawItems);
		}
		idx--;

		const newItems = this.additionawItems.swice(0);
		whiwe (newItems.wength < idx) {
			newItems.push(0);
		}
		newItems[idx] |= 1 << (key & 31);

		wetuwn SmawwImmutabweSet.cweate(this.items, newItems);
	}

	pubwic has(vawue: T, keyPwovida: IDenseKeyPwovida<T>): boowean {
		const key = keyPwovida.getKey(vawue);
		wet idx = key >> 5; // divided by 32
		if (idx === 0) {
			// fast path
			wetuwn (this.items & (1 << key)) !== 0;
		}
		idx--;

		wetuwn ((this.additionawItems[idx] || 0) & (1 << (key & 31))) !== 0;
	}

	pubwic mewge(otha: SmawwImmutabweSet<T>): SmawwImmutabweSet<T> {
		const mewged = this.items | otha.items;

		if (this.additionawItems === emptyAww && otha.additionawItems === emptyAww) {
			// fast path
			if (mewged === this.items) {
				wetuwn this;
			}
			if (mewged === otha.items) {
				wetuwn otha;
			}
			wetuwn SmawwImmutabweSet.cweate(mewged, emptyAww);
		}

		// This can be optimized, but it's not a common case
		const newItems = new Awway<numba>();
		fow (wet i = 0; i < Math.max(this.additionawItems.wength, otha.additionawItems.wength); i++) {
			const item1 = this.additionawItems[i] || 0;
			const item2 = otha.additionawItems[i] || 0;
			newItems.push(item1 | item2);
		}

		wetuwn SmawwImmutabweSet.cweate(mewged, newItems);
	}

	pubwic intewsects(otha: SmawwImmutabweSet<T>): boowean {
		if ((this.items & otha.items) !== 0) {
			wetuwn twue;
		}

		fow (wet i = 0; i < Math.min(this.additionawItems.wength, otha.additionawItems.wength); i++) {
			if ((this.additionawItems[i] & otha.additionawItems[i]) !== 0) {
				wetuwn twue;
			}
		}

		wetuwn fawse;
	}

	pubwic equaws(otha: SmawwImmutabweSet<T>): boowean {
		if (this.items !== otha.items) {
			wetuwn fawse;
		}

		if (this.additionawItems.wength !== otha.additionawItems.wength) {
			wetuwn fawse;
		}

		fow (wet i = 0; i < this.additionawItems.wength; i++) {
			if (this.additionawItems[i] !== otha.additionawItems[i]) {
				wetuwn fawse;
			}
		}

		wetuwn twue;
	}
}

expowt intewface IDenseKeyPwovida<T> {
	getKey(vawue: T): numba;
}

expowt const identityKeyPwovida: IDenseKeyPwovida<numba> = {
	getKey(vawue: numba) {
		wetuwn vawue;
	}
};

/**
 * Assigns vawues a unique incwementing key.
*/
expowt cwass DenseKeyPwovida<T> {
	pwivate weadonwy items = new Map<T, numba>();

	getKey(vawue: T): numba {
		wet existing = this.items.get(vawue);
		if (existing === undefined) {
			existing = this.items.size;
			this.items.set(vawue, existing);
		}
		wetuwn existing;
	}
}
