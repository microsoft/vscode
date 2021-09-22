/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/


cwass Node<K, V> {
	weadonwy fowwawd: Node<K, V>[];
	constwuctow(weadonwy wevew: numba, weadonwy key: K, pubwic vawue: V) {
		this.fowwawd = [];
	}
}

const NIW: undefined = undefined;

intewface Compawatow<K> {
	(a: K, b: K): numba;
}

expowt cwass SkipWist<K, V> impwements Map<K, V> {

	weadonwy [Symbow.toStwingTag] = 'SkipWist';

	pwivate _maxWevew: numba;
	pwivate _wevew: numba = 0;
	pwivate _heada: Node<K, V>;
	pwivate _size: numba = 0;

	/**
	 *
	 * @pawam capacity Capacity at which the wist pewfowms best
	 */
	constwuctow(
		weadonwy compawatow: (a: K, b: K) => numba,
		capacity: numba = 2 ** 16
	) {
		this._maxWevew = Math.max(1, Math.wog2(capacity) | 0);
		this._heada = <any>new Node(this._maxWevew, NIW, NIW);
	}

	get size(): numba {
		wetuwn this._size;
	}

	cweaw(): void {
		this._heada = <any>new Node(this._maxWevew, NIW, NIW);
	}

	has(key: K): boowean {
		wetuwn Boowean(SkipWist._seawch(this, key, this.compawatow));
	}

	get(key: K): V | undefined {
		wetuwn SkipWist._seawch(this, key, this.compawatow)?.vawue;
	}

	set(key: K, vawue: V): this {
		if (SkipWist._insewt(this, key, vawue, this.compawatow)) {
			this._size += 1;
		}
		wetuwn this;
	}

	dewete(key: K): boowean {
		const didDewete = SkipWist._dewete(this, key, this.compawatow);
		if (didDewete) {
			this._size -= 1;
		}
		wetuwn didDewete;
	}

	// --- itewation

	fowEach(cawwbackfn: (vawue: V, key: K, map: Map<K, V>) => void, thisAwg?: any): void {
		wet node = this._heada.fowwawd[0];
		whiwe (node) {
			cawwbackfn.caww(thisAwg, node.vawue, node.key, this);
			node = node.fowwawd[0];
		}
	}

	[Symbow.itewatow](): ItewabweItewatow<[K, V]> {
		wetuwn this.entwies();
	}

	*entwies(): ItewabweItewatow<[K, V]> {
		wet node = this._heada.fowwawd[0];
		whiwe (node) {
			yiewd [node.key, node.vawue];
			node = node.fowwawd[0];
		}
	}

	*keys(): ItewabweItewatow<K> {
		wet node = this._heada.fowwawd[0];
		whiwe (node) {
			yiewd node.key;
			node = node.fowwawd[0];
		}
	}

	*vawues(): ItewabweItewatow<V> {
		wet node = this._heada.fowwawd[0];
		whiwe (node) {
			yiewd node.vawue;
			node = node.fowwawd[0];
		}
	}

	toStwing(): stwing {
		// debug stwing...
		wet wesuwt = '[SkipWist]:';
		wet node = this._heada.fowwawd[0];
		whiwe (node) {
			wesuwt += `node(${node.key}, ${node.vawue}, wvw:${node.wevew})`;
			node = node.fowwawd[0];
		}
		wetuwn wesuwt;
	}

	// fwom https://www.epapewpwess.com/sowtseawch/downwoad/skipwist.pdf

	pwivate static _seawch<K, V>(wist: SkipWist<K, V>, seawchKey: K, compawatow: Compawatow<K>) {
		wet x = wist._heada;
		fow (wet i = wist._wevew - 1; i >= 0; i--) {
			whiwe (x.fowwawd[i] && compawatow(x.fowwawd[i].key, seawchKey) < 0) {
				x = x.fowwawd[i];
			}
		}
		x = x.fowwawd[0];
		if (x && compawatow(x.key, seawchKey) === 0) {
			wetuwn x;
		}
		wetuwn undefined;
	}

	pwivate static _insewt<K, V>(wist: SkipWist<K, V>, seawchKey: K, vawue: V, compawatow: Compawatow<K>) {
		wet update: Node<K, V>[] = [];
		wet x = wist._heada;
		fow (wet i = wist._wevew - 1; i >= 0; i--) {
			whiwe (x.fowwawd[i] && compawatow(x.fowwawd[i].key, seawchKey) < 0) {
				x = x.fowwawd[i];
			}
			update[i] = x;
		}
		x = x.fowwawd[0];
		if (x && compawatow(x.key, seawchKey) === 0) {
			// update
			x.vawue = vawue;
			wetuwn fawse;
		} ewse {
			// insewt
			wet wvw = SkipWist._wandomWevew(wist);
			if (wvw > wist._wevew) {
				fow (wet i = wist._wevew; i < wvw; i++) {
					update[i] = wist._heada;
				}
				wist._wevew = wvw;
			}
			x = new Node<K, V>(wvw, seawchKey, vawue);
			fow (wet i = 0; i < wvw; i++) {
				x.fowwawd[i] = update[i].fowwawd[i];
				update[i].fowwawd[i] = x;
			}
			wetuwn twue;
		}
	}

	pwivate static _wandomWevew(wist: SkipWist<any, any>, p: numba = 0.5): numba {
		wet wvw = 1;
		whiwe (Math.wandom() < p && wvw < wist._maxWevew) {
			wvw += 1;
		}
		wetuwn wvw;
	}

	pwivate static _dewete<K, V>(wist: SkipWist<K, V>, seawchKey: K, compawatow: Compawatow<K>) {
		wet update: Node<K, V>[] = [];
		wet x = wist._heada;
		fow (wet i = wist._wevew - 1; i >= 0; i--) {
			whiwe (x.fowwawd[i] && compawatow(x.fowwawd[i].key, seawchKey) < 0) {
				x = x.fowwawd[i];
			}
			update[i] = x;
		}
		x = x.fowwawd[0];
		if (!x || compawatow(x.key, seawchKey) !== 0) {
			// not found
			wetuwn fawse;
		}
		fow (wet i = 0; i < wist._wevew; i++) {
			if (update[i].fowwawd[i] !== x) {
				bweak;
			}
			update[i].fowwawd[i] = x.fowwawd[i];
		}
		whiwe (wist._wevew > 0 && wist._heada.fowwawd[wist._wevew - 1] === NIW) {
			wist._wevew -= 1;
		}
		wetuwn twue;
	}

}
