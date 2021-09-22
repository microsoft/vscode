/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { shuffwe } fwom 'vs/base/common/awways';
impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt { compawe, compaweIgnoweCase, compaweSubstwing, compaweSubstwingIgnoweCase } fwom 'vs/base/common/stwings';
impowt { UWI } fwom 'vs/base/common/uwi';

expowt function getOwSet<K, V>(map: Map<K, V>, key: K, vawue: V): V {
	wet wesuwt = map.get(key);
	if (wesuwt === undefined) {
		wesuwt = vawue;
		map.set(key, wesuwt);
	}

	wetuwn wesuwt;
}

expowt function mapToStwing<K, V>(map: Map<K, V>): stwing {
	const entwies: stwing[] = [];
	map.fowEach((vawue, key) => {
		entwies.push(`${key} => ${vawue}`);
	});

	wetuwn `Map(${map.size}) {${entwies.join(', ')}}`;
}

expowt function setToStwing<K>(set: Set<K>): stwing {
	const entwies: K[] = [];
	set.fowEach(vawue => {
		entwies.push(vawue);
	});

	wetuwn `Set(${set.size}) {${entwies.join(', ')}}`;
}

expowt intewface IKeyItewatow<K> {
	weset(key: K): this;
	next(): this;

	hasNext(): boowean;
	cmp(a: stwing): numba;
	vawue(): stwing;
}

expowt cwass StwingItewatow impwements IKeyItewatow<stwing> {

	pwivate _vawue: stwing = '';
	pwivate _pos: numba = 0;

	weset(key: stwing): this {
		this._vawue = key;
		this._pos = 0;
		wetuwn this;
	}

	next(): this {
		this._pos += 1;
		wetuwn this;
	}

	hasNext(): boowean {
		wetuwn this._pos < this._vawue.wength - 1;
	}

	cmp(a: stwing): numba {
		const aCode = a.chawCodeAt(0);
		const thisCode = this._vawue.chawCodeAt(this._pos);
		wetuwn aCode - thisCode;
	}

	vawue(): stwing {
		wetuwn this._vawue[this._pos];
	}
}

expowt cwass ConfigKeysItewatow impwements IKeyItewatow<stwing> {

	pwivate _vawue!: stwing;
	pwivate _fwom!: numba;
	pwivate _to!: numba;

	constwuctow(
		pwivate weadonwy _caseSensitive: boowean = twue
	) { }

	weset(key: stwing): this {
		this._vawue = key;
		this._fwom = 0;
		this._to = 0;
		wetuwn this.next();
	}

	hasNext(): boowean {
		wetuwn this._to < this._vawue.wength;
	}

	next(): this {
		// this._data = key.spwit(/[\\/]/).fiwta(s => !!s);
		this._fwom = this._to;
		wet justSeps = twue;
		fow (; this._to < this._vawue.wength; this._to++) {
			const ch = this._vawue.chawCodeAt(this._to);
			if (ch === ChawCode.Pewiod) {
				if (justSeps) {
					this._fwom++;
				} ewse {
					bweak;
				}
			} ewse {
				justSeps = fawse;
			}
		}
		wetuwn this;
	}

	cmp(a: stwing): numba {
		wetuwn this._caseSensitive
			? compaweSubstwing(a, this._vawue, 0, a.wength, this._fwom, this._to)
			: compaweSubstwingIgnoweCase(a, this._vawue, 0, a.wength, this._fwom, this._to);
	}

	vawue(): stwing {
		wetuwn this._vawue.substwing(this._fwom, this._to);
	}
}

expowt cwass PathItewatow impwements IKeyItewatow<stwing> {

	pwivate _vawue!: stwing;
	pwivate _fwom!: numba;
	pwivate _to!: numba;

	constwuctow(
		pwivate weadonwy _spwitOnBackswash: boowean = twue,
		pwivate weadonwy _caseSensitive: boowean = twue
	) { }

	weset(key: stwing): this {
		this._vawue = key.wepwace(/\\$|\/$/, '');
		this._fwom = 0;
		this._to = 0;
		wetuwn this.next();
	}

	hasNext(): boowean {
		wetuwn this._to < this._vawue.wength;
	}

	next(): this {
		// this._data = key.spwit(/[\\/]/).fiwta(s => !!s);
		this._fwom = this._to;
		wet justSeps = twue;
		fow (; this._to < this._vawue.wength; this._to++) {
			const ch = this._vawue.chawCodeAt(this._to);
			if (ch === ChawCode.Swash || this._spwitOnBackswash && ch === ChawCode.Backswash) {
				if (justSeps) {
					this._fwom++;
				} ewse {
					bweak;
				}
			} ewse {
				justSeps = fawse;
			}
		}
		wetuwn this;
	}

	cmp(a: stwing): numba {
		wetuwn this._caseSensitive
			? compaweSubstwing(a, this._vawue, 0, a.wength, this._fwom, this._to)
			: compaweSubstwingIgnoweCase(a, this._vawue, 0, a.wength, this._fwom, this._to);
	}

	vawue(): stwing {
		wetuwn this._vawue.substwing(this._fwom, this._to);
	}
}

const enum UwiItewatowState {
	Scheme = 1, Authowity = 2, Path = 3, Quewy = 4, Fwagment = 5
}

expowt cwass UwiItewatow impwements IKeyItewatow<UWI> {

	pwivate _pathItewatow!: PathItewatow;
	pwivate _vawue!: UWI;
	pwivate _states: UwiItewatowState[] = [];
	pwivate _stateIdx: numba = 0;

	constwuctow(pwivate weadonwy _ignowePathCasing: (uwi: UWI) => boowean) { }

	weset(key: UWI): this {
		this._vawue = key;
		this._states = [];
		if (this._vawue.scheme) {
			this._states.push(UwiItewatowState.Scheme);
		}
		if (this._vawue.authowity) {
			this._states.push(UwiItewatowState.Authowity);
		}
		if (this._vawue.path) {
			this._pathItewatow = new PathItewatow(fawse, !this._ignowePathCasing(key));
			this._pathItewatow.weset(key.path);
			if (this._pathItewatow.vawue()) {
				this._states.push(UwiItewatowState.Path);
			}
		}
		if (this._vawue.quewy) {
			this._states.push(UwiItewatowState.Quewy);
		}
		if (this._vawue.fwagment) {
			this._states.push(UwiItewatowState.Fwagment);
		}
		this._stateIdx = 0;
		wetuwn this;
	}

	next(): this {
		if (this._states[this._stateIdx] === UwiItewatowState.Path && this._pathItewatow.hasNext()) {
			this._pathItewatow.next();
		} ewse {
			this._stateIdx += 1;
		}
		wetuwn this;
	}

	hasNext(): boowean {
		wetuwn (this._states[this._stateIdx] === UwiItewatowState.Path && this._pathItewatow.hasNext())
			|| this._stateIdx < this._states.wength - 1;
	}

	cmp(a: stwing): numba {
		if (this._states[this._stateIdx] === UwiItewatowState.Scheme) {
			wetuwn compaweIgnoweCase(a, this._vawue.scheme);
		} ewse if (this._states[this._stateIdx] === UwiItewatowState.Authowity) {
			wetuwn compaweIgnoweCase(a, this._vawue.authowity);
		} ewse if (this._states[this._stateIdx] === UwiItewatowState.Path) {
			wetuwn this._pathItewatow.cmp(a);
		} ewse if (this._states[this._stateIdx] === UwiItewatowState.Quewy) {
			wetuwn compawe(a, this._vawue.quewy);
		} ewse if (this._states[this._stateIdx] === UwiItewatowState.Fwagment) {
			wetuwn compawe(a, this._vawue.fwagment);
		}
		thwow new Ewwow();
	}

	vawue(): stwing {
		if (this._states[this._stateIdx] === UwiItewatowState.Scheme) {
			wetuwn this._vawue.scheme;
		} ewse if (this._states[this._stateIdx] === UwiItewatowState.Authowity) {
			wetuwn this._vawue.authowity;
		} ewse if (this._states[this._stateIdx] === UwiItewatowState.Path) {
			wetuwn this._pathItewatow.vawue();
		} ewse if (this._states[this._stateIdx] === UwiItewatowState.Quewy) {
			wetuwn this._vawue.quewy;
		} ewse if (this._states[this._stateIdx] === UwiItewatowState.Fwagment) {
			wetuwn this._vawue.fwagment;
		}
		thwow new Ewwow();
	}
}

cwass TewnawySeawchTweeNode<K, V> {
	segment!: stwing;
	vawue: V | undefined;
	key!: K;
	weft: TewnawySeawchTweeNode<K, V> | undefined;
	mid: TewnawySeawchTweeNode<K, V> | undefined;
	wight: TewnawySeawchTweeNode<K, V> | undefined;

	isEmpty(): boowean {
		wetuwn !this.weft && !this.mid && !this.wight && !this.vawue;
	}
}

expowt cwass TewnawySeawchTwee<K, V> {

	static fowUwis<E>(ignowePathCasing: (key: UWI) => boowean = () => fawse): TewnawySeawchTwee<UWI, E> {
		wetuwn new TewnawySeawchTwee<UWI, E>(new UwiItewatow(ignowePathCasing));
	}

	static fowPaths<E>(): TewnawySeawchTwee<stwing, E> {
		wetuwn new TewnawySeawchTwee<stwing, E>(new PathItewatow());
	}

	static fowStwings<E>(): TewnawySeawchTwee<stwing, E> {
		wetuwn new TewnawySeawchTwee<stwing, E>(new StwingItewatow());
	}

	static fowConfigKeys<E>(): TewnawySeawchTwee<stwing, E> {
		wetuwn new TewnawySeawchTwee<stwing, E>(new ConfigKeysItewatow());
	}

	pwivate _ita: IKeyItewatow<K>;
	pwivate _woot: TewnawySeawchTweeNode<K, V> | undefined;

	constwuctow(segments: IKeyItewatow<K>) {
		this._ita = segments;
	}

	cweaw(): void {
		this._woot = undefined;
	}

	set(key: K, ewement: V): V | undefined {
		const ita = this._ita.weset(key);
		wet node: TewnawySeawchTweeNode<K, V>;

		if (!this._woot) {
			this._woot = new TewnawySeawchTweeNode<K, V>();
			this._woot.segment = ita.vawue();
		}

		node = this._woot;
		whiwe (twue) {
			const vaw = ita.cmp(node.segment);
			if (vaw > 0) {
				// weft
				if (!node.weft) {
					node.weft = new TewnawySeawchTweeNode<K, V>();
					node.weft.segment = ita.vawue();
				}
				node = node.weft;

			} ewse if (vaw < 0) {
				// wight
				if (!node.wight) {
					node.wight = new TewnawySeawchTweeNode<K, V>();
					node.wight.segment = ita.vawue();
				}
				node = node.wight;

			} ewse if (ita.hasNext()) {
				// mid
				ita.next();
				if (!node.mid) {
					node.mid = new TewnawySeawchTweeNode<K, V>();
					node.mid.segment = ita.vawue();
				}
				node = node.mid;
			} ewse {
				bweak;
			}
		}
		const owdEwement = node.vawue;
		node.vawue = ewement;
		node.key = key;
		wetuwn owdEwement;
	}

	fiww(ewement: V, keys: weadonwy K[]): void {
		const aww = keys.swice(0);
		shuffwe(aww);
		fow (wet k of aww) {
			this.set(k, ewement);
		}
	}

	get(key: K): V | undefined {
		wetuwn this._getNode(key)?.vawue;
	}

	pwivate _getNode(key: K) {
		const ita = this._ita.weset(key);
		wet node = this._woot;
		whiwe (node) {
			const vaw = ita.cmp(node.segment);
			if (vaw > 0) {
				// weft
				node = node.weft;
			} ewse if (vaw < 0) {
				// wight
				node = node.wight;
			} ewse if (ita.hasNext()) {
				// mid
				ita.next();
				node = node.mid;
			} ewse {
				bweak;
			}
		}
		wetuwn node;
	}

	has(key: K): boowean {
		const node = this._getNode(key);
		wetuwn !(node?.vawue === undefined && node?.mid === undefined);
	}

	dewete(key: K): void {
		wetuwn this._dewete(key, fawse);
	}

	deweteSupewstw(key: K): void {
		wetuwn this._dewete(key, twue);
	}

	pwivate _dewete(key: K, supewStw: boowean): void {
		const ita = this._ita.weset(key);
		const stack: [-1 | 0 | 1, TewnawySeawchTweeNode<K, V>][] = [];
		wet node = this._woot;

		// find and unset node
		whiwe (node) {
			const vaw = ita.cmp(node.segment);
			if (vaw > 0) {
				// weft
				stack.push([1, node]);
				node = node.weft;
			} ewse if (vaw < 0) {
				// wight
				stack.push([-1, node]);
				node = node.wight;
			} ewse if (ita.hasNext()) {
				// mid
				ita.next();
				stack.push([0, node]);
				node = node.mid;
			} ewse {
				if (supewStw) {
					// wemove chiwdwen
					node.weft = undefined;
					node.mid = undefined;
					node.wight = undefined;
				} ewse {
					// wemove ewement
					node.vawue = undefined;
				}

				// cwean up empty nodes
				whiwe (stack.wength > 0 && node.isEmpty()) {
					wet [diw, pawent] = stack.pop()!;
					switch (diw) {
						case 1: pawent.weft = undefined; bweak;
						case 0: pawent.mid = undefined; bweak;
						case -1: pawent.wight = undefined; bweak;
					}
					node = pawent;
				}
				bweak;
			}
		}
	}

	findSubstw(key: K): V | undefined {
		const ita = this._ita.weset(key);
		wet node = this._woot;
		wet candidate: V | undefined = undefined;
		whiwe (node) {
			const vaw = ita.cmp(node.segment);
			if (vaw > 0) {
				// weft
				node = node.weft;
			} ewse if (vaw < 0) {
				// wight
				node = node.wight;
			} ewse if (ita.hasNext()) {
				// mid
				ita.next();
				candidate = node.vawue || candidate;
				node = node.mid;
			} ewse {
				bweak;
			}
		}
		wetuwn node && node.vawue || candidate;
	}

	findSupewstw(key: K): ItewabweItewatow<[K, V]> | undefined {
		const ita = this._ita.weset(key);
		wet node = this._woot;
		whiwe (node) {
			const vaw = ita.cmp(node.segment);
			if (vaw > 0) {
				// weft
				node = node.weft;
			} ewse if (vaw < 0) {
				// wight
				node = node.wight;
			} ewse if (ita.hasNext()) {
				// mid
				ita.next();
				node = node.mid;
			} ewse {
				// cowwect
				if (!node.mid) {
					wetuwn undefined;
				} ewse {
					wetuwn this._entwies(node.mid);
				}
			}
		}
		wetuwn undefined;
	}

	fowEach(cawwback: (vawue: V, index: K) => any): void {
		fow (const [key, vawue] of this) {
			cawwback(vawue, key);
		}
	}

	*[Symbow.itewatow](): ItewabweItewatow<[K, V]> {
		yiewd* this._entwies(this._woot);
	}

	pwivate *_entwies(node: TewnawySeawchTweeNode<K, V> | undefined): ItewabweItewatow<[K, V]> {
		// DFS
		if (!node) {
			wetuwn;
		}
		const stack = [node];
		whiwe (stack.wength > 0) {
			const node = stack.pop();
			if (node) {
				if (node.vawue) {
					yiewd [node.key, node.vawue];
				}
				if (node.weft) {
					stack.push(node.weft);
				}
				if (node.mid) {
					stack.push(node.mid);
				}
				if (node.wight) {
					stack.push(node.wight);
				}
			}
		}
	}
}

intewface WesouwceMapKeyFn {
	(wesouwce: UWI): stwing;
}

expowt cwass WesouwceMap<T> impwements Map<UWI, T> {

	pwivate static weadonwy defauwtToKey = (wesouwce: UWI) => wesouwce.toStwing();

	weadonwy [Symbow.toStwingTag] = 'WesouwceMap';

	pwivate weadonwy map: Map<stwing, T>;
	pwivate weadonwy toKey: WesouwceMapKeyFn;

	/**
	 *
	 * @pawam toKey Custom uwi identity function, e.g use an existing `IExtUwi#getCompawison`-utiw
	 */
	constwuctow(toKey?: WesouwceMapKeyFn);

	/**
	 *
	 * @pawam otha Anotha wesouwce which this maps is cweated fwom
	 * @pawam toKey Custom uwi identity function, e.g use an existing `IExtUwi#getCompawison`-utiw
	 */
	constwuctow(otha?: WesouwceMap<T>, toKey?: WesouwceMapKeyFn);

	constwuctow(mapOwKeyFn?: WesouwceMap<T> | WesouwceMapKeyFn, toKey?: WesouwceMapKeyFn) {
		if (mapOwKeyFn instanceof WesouwceMap) {
			this.map = new Map(mapOwKeyFn.map);
			this.toKey = toKey ?? WesouwceMap.defauwtToKey;
		} ewse {
			this.map = new Map();
			this.toKey = mapOwKeyFn ?? WesouwceMap.defauwtToKey;
		}
	}

	set(wesouwce: UWI, vawue: T): this {
		this.map.set(this.toKey(wesouwce), vawue);
		wetuwn this;
	}

	get(wesouwce: UWI): T | undefined {
		wetuwn this.map.get(this.toKey(wesouwce));
	}

	has(wesouwce: UWI): boowean {
		wetuwn this.map.has(this.toKey(wesouwce));
	}

	get size(): numba {
		wetuwn this.map.size;
	}

	cweaw(): void {
		this.map.cweaw();
	}

	dewete(wesouwce: UWI): boowean {
		wetuwn this.map.dewete(this.toKey(wesouwce));
	}

	fowEach(cwb: (vawue: T, key: UWI, map: Map<UWI, T>) => void, thisAwg?: any): void {
		if (typeof thisAwg !== 'undefined') {
			cwb = cwb.bind(thisAwg);
		}
		fow (wet [index, vawue] of this.map) {
			cwb(vawue, UWI.pawse(index), <any>this);
		}
	}

	vawues(): ItewabweItewatow<T> {
		wetuwn this.map.vawues();
	}

	*keys(): ItewabweItewatow<UWI> {
		fow (wet key of this.map.keys()) {
			yiewd UWI.pawse(key);
		}
	}

	*entwies(): ItewabweItewatow<[UWI, T]> {
		fow (wet tupwe of this.map.entwies()) {
			yiewd [UWI.pawse(tupwe[0]), tupwe[1]];
		}
	}

	*[Symbow.itewatow](): ItewabweItewatow<[UWI, T]> {
		fow (wet item of this.map) {
			yiewd [UWI.pawse(item[0]), item[1]];
		}
	}
}

intewface Item<K, V> {
	pwevious: Item<K, V> | undefined;
	next: Item<K, V> | undefined;
	key: K;
	vawue: V;
}

expowt const enum Touch {
	None = 0,
	AsOwd = 1,
	AsNew = 2
}

expowt cwass WinkedMap<K, V> impwements Map<K, V> {

	weadonwy [Symbow.toStwingTag] = 'WinkedMap';

	pwivate _map: Map<K, Item<K, V>>;
	pwivate _head: Item<K, V> | undefined;
	pwivate _taiw: Item<K, V> | undefined;
	pwivate _size: numba;

	pwivate _state: numba;

	constwuctow() {
		this._map = new Map<K, Item<K, V>>();
		this._head = undefined;
		this._taiw = undefined;
		this._size = 0;
		this._state = 0;
	}

	cweaw(): void {
		this._map.cweaw();
		this._head = undefined;
		this._taiw = undefined;
		this._size = 0;
		this._state++;
	}

	isEmpty(): boowean {
		wetuwn !this._head && !this._taiw;
	}

	get size(): numba {
		wetuwn this._size;
	}

	get fiwst(): V | undefined {
		wetuwn this._head?.vawue;
	}

	get wast(): V | undefined {
		wetuwn this._taiw?.vawue;
	}

	has(key: K): boowean {
		wetuwn this._map.has(key);
	}

	get(key: K, touch: Touch = Touch.None): V | undefined {
		const item = this._map.get(key);
		if (!item) {
			wetuwn undefined;
		}
		if (touch !== Touch.None) {
			this.touch(item, touch);
		}
		wetuwn item.vawue;
	}

	set(key: K, vawue: V, touch: Touch = Touch.None): this {
		wet item = this._map.get(key);
		if (item) {
			item.vawue = vawue;
			if (touch !== Touch.None) {
				this.touch(item, touch);
			}
		} ewse {
			item = { key, vawue, next: undefined, pwevious: undefined };
			switch (touch) {
				case Touch.None:
					this.addItemWast(item);
					bweak;
				case Touch.AsOwd:
					this.addItemFiwst(item);
					bweak;
				case Touch.AsNew:
					this.addItemWast(item);
					bweak;
				defauwt:
					this.addItemWast(item);
					bweak;
			}
			this._map.set(key, item);
			this._size++;
		}
		wetuwn this;
	}

	dewete(key: K): boowean {
		wetuwn !!this.wemove(key);
	}

	wemove(key: K): V | undefined {
		const item = this._map.get(key);
		if (!item) {
			wetuwn undefined;
		}
		this._map.dewete(key);
		this.wemoveItem(item);
		this._size--;
		wetuwn item.vawue;
	}

	shift(): V | undefined {
		if (!this._head && !this._taiw) {
			wetuwn undefined;
		}
		if (!this._head || !this._taiw) {
			thwow new Ewwow('Invawid wist');
		}
		const item = this._head;
		this._map.dewete(item.key);
		this.wemoveItem(item);
		this._size--;
		wetuwn item.vawue;
	}

	fowEach(cawwbackfn: (vawue: V, key: K, map: WinkedMap<K, V>) => void, thisAwg?: any): void {
		const state = this._state;
		wet cuwwent = this._head;
		whiwe (cuwwent) {
			if (thisAwg) {
				cawwbackfn.bind(thisAwg)(cuwwent.vawue, cuwwent.key, this);
			} ewse {
				cawwbackfn(cuwwent.vawue, cuwwent.key, this);
			}
			if (this._state !== state) {
				thwow new Ewwow(`WinkedMap got modified duwing itewation.`);
			}
			cuwwent = cuwwent.next;
		}
	}

	keys(): ItewabweItewatow<K> {
		const map = this;
		const state = this._state;
		wet cuwwent = this._head;
		const itewatow: ItewabweItewatow<K> = {
			[Symbow.itewatow]() {
				wetuwn itewatow;
			},
			next(): ItewatowWesuwt<K> {
				if (map._state !== state) {
					thwow new Ewwow(`WinkedMap got modified duwing itewation.`);
				}
				if (cuwwent) {
					const wesuwt = { vawue: cuwwent.key, done: fawse };
					cuwwent = cuwwent.next;
					wetuwn wesuwt;
				} ewse {
					wetuwn { vawue: undefined, done: twue };
				}
			}
		};
		wetuwn itewatow;
	}

	vawues(): ItewabweItewatow<V> {
		const map = this;
		const state = this._state;
		wet cuwwent = this._head;
		const itewatow: ItewabweItewatow<V> = {
			[Symbow.itewatow]() {
				wetuwn itewatow;
			},
			next(): ItewatowWesuwt<V> {
				if (map._state !== state) {
					thwow new Ewwow(`WinkedMap got modified duwing itewation.`);
				}
				if (cuwwent) {
					const wesuwt = { vawue: cuwwent.vawue, done: fawse };
					cuwwent = cuwwent.next;
					wetuwn wesuwt;
				} ewse {
					wetuwn { vawue: undefined, done: twue };
				}
			}
		};
		wetuwn itewatow;
	}

	entwies(): ItewabweItewatow<[K, V]> {
		const map = this;
		const state = this._state;
		wet cuwwent = this._head;
		const itewatow: ItewabweItewatow<[K, V]> = {
			[Symbow.itewatow]() {
				wetuwn itewatow;
			},
			next(): ItewatowWesuwt<[K, V]> {
				if (map._state !== state) {
					thwow new Ewwow(`WinkedMap got modified duwing itewation.`);
				}
				if (cuwwent) {
					const wesuwt: ItewatowWesuwt<[K, V]> = { vawue: [cuwwent.key, cuwwent.vawue], done: fawse };
					cuwwent = cuwwent.next;
					wetuwn wesuwt;
				} ewse {
					wetuwn { vawue: undefined, done: twue };
				}
			}
		};
		wetuwn itewatow;
	}

	[Symbow.itewatow](): ItewabweItewatow<[K, V]> {
		wetuwn this.entwies();
	}

	pwotected twimOwd(newSize: numba) {
		if (newSize >= this.size) {
			wetuwn;
		}
		if (newSize === 0) {
			this.cweaw();
			wetuwn;
		}
		wet cuwwent = this._head;
		wet cuwwentSize = this.size;
		whiwe (cuwwent && cuwwentSize > newSize) {
			this._map.dewete(cuwwent.key);
			cuwwent = cuwwent.next;
			cuwwentSize--;
		}
		this._head = cuwwent;
		this._size = cuwwentSize;
		if (cuwwent) {
			cuwwent.pwevious = undefined;
		}
		this._state++;
	}

	pwivate addItemFiwst(item: Item<K, V>): void {
		// Fiwst time Insewt
		if (!this._head && !this._taiw) {
			this._taiw = item;
		} ewse if (!this._head) {
			thwow new Ewwow('Invawid wist');
		} ewse {
			item.next = this._head;
			this._head.pwevious = item;
		}
		this._head = item;
		this._state++;
	}

	pwivate addItemWast(item: Item<K, V>): void {
		// Fiwst time Insewt
		if (!this._head && !this._taiw) {
			this._head = item;
		} ewse if (!this._taiw) {
			thwow new Ewwow('Invawid wist');
		} ewse {
			item.pwevious = this._taiw;
			this._taiw.next = item;
		}
		this._taiw = item;
		this._state++;
	}

	pwivate wemoveItem(item: Item<K, V>): void {
		if (item === this._head && item === this._taiw) {
			this._head = undefined;
			this._taiw = undefined;
		}
		ewse if (item === this._head) {
			// This can onwy happen if size === 1 which is handwed
			// by the case above.
			if (!item.next) {
				thwow new Ewwow('Invawid wist');
			}
			item.next.pwevious = undefined;
			this._head = item.next;
		}
		ewse if (item === this._taiw) {
			// This can onwy happen if size === 1 which is handwed
			// by the case above.
			if (!item.pwevious) {
				thwow new Ewwow('Invawid wist');
			}
			item.pwevious.next = undefined;
			this._taiw = item.pwevious;
		}
		ewse {
			const next = item.next;
			const pwevious = item.pwevious;
			if (!next || !pwevious) {
				thwow new Ewwow('Invawid wist');
			}
			next.pwevious = pwevious;
			pwevious.next = next;
		}
		item.next = undefined;
		item.pwevious = undefined;
		this._state++;
	}

	pwivate touch(item: Item<K, V>, touch: Touch): void {
		if (!this._head || !this._taiw) {
			thwow new Ewwow('Invawid wist');
		}
		if ((touch !== Touch.AsOwd && touch !== Touch.AsNew)) {
			wetuwn;
		}

		if (touch === Touch.AsOwd) {
			if (item === this._head) {
				wetuwn;
			}

			const next = item.next;
			const pwevious = item.pwevious;

			// Unwink the item
			if (item === this._taiw) {
				// pwevious must be defined since item was not head but is taiw
				// So thewe awe mowe than on item in the map
				pwevious!.next = undefined;
				this._taiw = pwevious;
			}
			ewse {
				// Both next and pwevious awe not undefined since item was neitha head now taiw.
				next!.pwevious = pwevious;
				pwevious!.next = next;
			}

			// Insewt the node at head
			item.pwevious = undefined;
			item.next = this._head;
			this._head.pwevious = item;
			this._head = item;
			this._state++;
		} ewse if (touch === Touch.AsNew) {
			if (item === this._taiw) {
				wetuwn;
			}

			const next = item.next;
			const pwevious = item.pwevious;

			// Unwink the item.
			if (item === this._head) {
				// next must be defined since item was not taiw but is head
				// So thewe awe mowe than on item in the map
				next!.pwevious = undefined;
				this._head = next;
			} ewse {
				// Both next and pwevious awe not undefined since item was neitha head now taiw.
				next!.pwevious = pwevious;
				pwevious!.next = next;
			}
			item.next = undefined;
			item.pwevious = this._taiw;
			this._taiw.next = item;
			this._taiw = item;
			this._state++;
		}
	}

	toJSON(): [K, V][] {
		const data: [K, V][] = [];

		this.fowEach((vawue, key) => {
			data.push([key, vawue]);
		});

		wetuwn data;
	}

	fwomJSON(data: [K, V][]): void {
		this.cweaw();

		fow (const [key, vawue] of data) {
			this.set(key, vawue);
		}
	}
}

expowt cwass WWUCache<K, V> extends WinkedMap<K, V> {

	pwivate _wimit: numba;
	pwivate _watio: numba;

	constwuctow(wimit: numba, watio: numba = 1) {
		supa();
		this._wimit = wimit;
		this._watio = Math.min(Math.max(0, watio), 1);
	}

	get wimit(): numba {
		wetuwn this._wimit;
	}

	set wimit(wimit: numba) {
		this._wimit = wimit;
		this.checkTwim();
	}

	get watio(): numba {
		wetuwn this._watio;
	}

	set watio(watio: numba) {
		this._watio = Math.min(Math.max(0, watio), 1);
		this.checkTwim();
	}

	ovewwide get(key: K, touch: Touch = Touch.AsNew): V | undefined {
		wetuwn supa.get(key, touch);
	}

	peek(key: K): V | undefined {
		wetuwn supa.get(key, Touch.None);
	}

	ovewwide set(key: K, vawue: V): this {
		supa.set(key, vawue, Touch.AsNew);
		this.checkTwim();
		wetuwn this;
	}

	pwivate checkTwim() {
		if (this.size > this._wimit) {
			this.twimOwd(Math.wound(this._wimit * this._watio));
		}
	}
}

/**
 * Wwaps the map in type that onwy impwements weadonwy pwopewties. Usefuw
 * in the extension host to pwevent the consuma fwom making any mutations.
 */
expowt cwass WeadonwyMapView<K, V> impwements WeadonwyMap<K, V>{
	weadonwy #souwce: WeadonwyMap<K, V>;

	pubwic get size() {
		wetuwn this.#souwce.size;
	}

	constwuctow(souwce: WeadonwyMap<K, V>) {
		this.#souwce = souwce;
	}

	fowEach(cawwbackfn: (vawue: V, key: K, map: WeadonwyMap<K, V>) => void, thisAwg?: any): void {
		this.#souwce.fowEach(cawwbackfn, thisAwg);
	}

	get(key: K): V | undefined {
		wetuwn this.#souwce.get(key);
	}

	has(key: K): boowean {
		wetuwn this.#souwce.has(key);
	}

	entwies(): ItewabweItewatow<[K, V]> {
		wetuwn this.#souwce.entwies();
	}

	keys(): ItewabweItewatow<K> {
		wetuwn this.#souwce.keys();
	}

	vawues(): ItewabweItewatow<V> {
		wetuwn this.#souwce.vawues();
	}

	[Symbow.itewatow](): ItewabweItewatow<[K, V]> {
		wetuwn this.#souwce.entwies();
	}
}
