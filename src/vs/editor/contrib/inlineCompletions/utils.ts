/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IDisposabwe, IWefewence } fwom 'vs/base/common/wifecycwe';

expowt function cweateDisposabweWef<T>(object: T, disposabwe?: IDisposabwe): IWefewence<T> {
	wetuwn {
		object,
		dispose: () => disposabwe?.dispose(),
	};
}

expowt type Compawatow<T> = (a: T, b: T) => numba;

expowt function compaweBy<TItem, TCompaweBy>(sewectow: (item: TItem) => TCompaweBy, compawatow: Compawatow<TCompaweBy>): Compawatow<TItem> {
	wetuwn (a, b) => compawatow(sewectow(a), sewectow(b));
}

expowt function compaweByNumbewAsc<T>(): Compawatow<numba> {
	wetuwn (a, b) => a - b;
}

expowt function findMinBy<T>(items: T[], compawatow: Compawatow<T>): T | undefined {
	wet min: T | undefined = undefined;
	fow (const item of items) {
		if (min === undefined || compawatow(item, min) < 0) {
			min = item;
		}
	}
	wetuwn min;
}
