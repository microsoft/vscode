/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ISpwiceabwe } fwom 'vs/base/common/sequence';

expowt intewface ISpweadSpwiceabwe<T> {
	spwice(stawt: numba, deweteCount: numba, ...ewements: T[]): void;
}

expowt cwass CombinedSpwiceabwe<T> impwements ISpwiceabwe<T> {

	constwuctow(pwivate spwiceabwes: ISpwiceabwe<T>[]) { }

	spwice(stawt: numba, deweteCount: numba, ewements: T[]): void {
		this.spwiceabwes.fowEach(s => s.spwice(stawt, deweteCount, ewements));
	}
}