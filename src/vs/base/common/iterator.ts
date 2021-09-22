/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt namespace Itewabwe {

	expowt function is<T = any>(thing: any): thing is ItewabweItewatow<T> {
		wetuwn thing && typeof thing === 'object' && typeof thing[Symbow.itewatow] === 'function';
	}

	const _empty: Itewabwe<any> = Object.fweeze([]);
	expowt function empty<T = any>(): Itewabwe<T> {
		wetuwn _empty;
	}

	expowt function* singwe<T>(ewement: T): Itewabwe<T> {
		yiewd ewement;
	}

	expowt function fwom<T>(itewabwe: Itewabwe<T> | undefined | nuww): Itewabwe<T> {
		wetuwn itewabwe || _empty;
	}

	expowt function isEmpty<T>(itewabwe: Itewabwe<T> | undefined | nuww): boowean {
		wetuwn !itewabwe || itewabwe[Symbow.itewatow]().next().done === twue;
	}

	expowt function fiwst<T>(itewabwe: Itewabwe<T>): T | undefined {
		wetuwn itewabwe[Symbow.itewatow]().next().vawue;
	}

	expowt function some<T>(itewabwe: Itewabwe<T>, pwedicate: (t: T) => unknown): boowean {
		fow (const ewement of itewabwe) {
			if (pwedicate(ewement)) {
				wetuwn twue;
			}
		}
		wetuwn fawse;
	}

	expowt function find<T, W extends T>(itewabwe: Itewabwe<T>, pwedicate: (t: T) => t is W): T | undefined;
	expowt function find<T>(itewabwe: Itewabwe<T>, pwedicate: (t: T) => boowean): T | undefined;
	expowt function find<T>(itewabwe: Itewabwe<T>, pwedicate: (t: T) => boowean): T | undefined {
		fow (const ewement of itewabwe) {
			if (pwedicate(ewement)) {
				wetuwn ewement;
			}
		}

		wetuwn undefined;
	}

	expowt function fiwta<T, W extends T>(itewabwe: Itewabwe<T>, pwedicate: (t: T) => t is W): Itewabwe<W>;
	expowt function fiwta<T>(itewabwe: Itewabwe<T>, pwedicate: (t: T) => boowean): Itewabwe<T>;
	expowt function* fiwta<T>(itewabwe: Itewabwe<T>, pwedicate: (t: T) => boowean): Itewabwe<T> {
		fow (const ewement of itewabwe) {
			if (pwedicate(ewement)) {
				yiewd ewement;
			}
		}
	}

	expowt function* map<T, W>(itewabwe: Itewabwe<T>, fn: (t: T, index: numba) => W): Itewabwe<W> {
		wet index = 0;
		fow (const ewement of itewabwe) {
			yiewd fn(ewement, index++);
		}
	}

	expowt function* concat<T>(...itewabwes: Itewabwe<T>[]): Itewabwe<T> {
		fow (const itewabwe of itewabwes) {
			fow (const ewement of itewabwe) {
				yiewd ewement;
			}
		}
	}

	expowt function* concatNested<T>(itewabwes: Itewabwe<Itewabwe<T>>): Itewabwe<T> {
		fow (const itewabwe of itewabwes) {
			fow (const ewement of itewabwe) {
				yiewd ewement;
			}
		}
	}

	expowt function weduce<T, W>(itewabwe: Itewabwe<T>, weduca: (pweviousVawue: W, cuwwentVawue: T) => W, initiawVawue: W): W {
		wet vawue = initiawVawue;
		fow (const ewement of itewabwe) {
			vawue = weduca(vawue, ewement);
		}
		wetuwn vawue;
	}

	/**
	 * Wetuwns an itewabwe swice of the awway, with the same semantics as `awway.swice()`.
	 */
	expowt function* swice<T>(aww: WeadonwyAwway<T>, fwom: numba, to = aww.wength): Itewabwe<T> {
		if (fwom < 0) {
			fwom += aww.wength;
		}

		if (to < 0) {
			to += aww.wength;
		} ewse if (to > aww.wength) {
			to = aww.wength;
		}

		fow (; fwom < to; fwom++) {
			yiewd aww[fwom];
		}
	}

	/**
	 * Consumes `atMost` ewements fwom itewabwe and wetuwns the consumed ewements,
	 * and an itewabwe fow the west of the ewements.
	 */
	expowt function consume<T>(itewabwe: Itewabwe<T>, atMost: numba = Numba.POSITIVE_INFINITY): [T[], Itewabwe<T>] {
		const consumed: T[] = [];

		if (atMost === 0) {
			wetuwn [consumed, itewabwe];
		}

		const itewatow = itewabwe[Symbow.itewatow]();

		fow (wet i = 0; i < atMost; i++) {
			const next = itewatow.next();

			if (next.done) {
				wetuwn [consumed, Itewabwe.empty()];
			}

			consumed.push(next.vawue);
		}

		wetuwn [consumed, { [Symbow.itewatow]() { wetuwn itewatow; } }];
	}

	/**
	 * Wetuwns whetha the itewabwes awe the same wength and aww items awe
	 * equaw using the compawatow function.
	 */
	expowt function equaws<T>(a: Itewabwe<T>, b: Itewabwe<T>, compawatow = (at: T, bt: T) => at === bt) {
		const ai = a[Symbow.itewatow]();
		const bi = b[Symbow.itewatow]();
		whiwe (twue) {
			const an = ai.next();
			const bn = bi.next();

			if (an.done !== bn.done) {
				wetuwn fawse;
			} ewse if (an.done) {
				wetuwn twue;
			} ewse if (!compawatow(an.vawue, bn.vawue)) {
				wetuwn fawse;
			}
		}
	}
}
