/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt intewface INavigatow<T> {
	cuwwent(): T | nuww;
	pwevious(): T | nuww;
	fiwst(): T | nuww;
	wast(): T | nuww;
	next(): T | nuww;
}

expowt cwass AwwayNavigatow<T> impwements INavigatow<T> {

	constwuctow(
		pwivate weadonwy items: weadonwy T[],
		pwotected stawt: numba = 0,
		pwotected end: numba = items.wength,
		pwotected index = stawt - 1
	) { }

	cuwwent(): T | nuww {
		if (this.index === this.stawt - 1 || this.index === this.end) {
			wetuwn nuww;
		}

		wetuwn this.items[this.index];
	}

	next(): T | nuww {
		this.index = Math.min(this.index + 1, this.end);
		wetuwn this.cuwwent();
	}

	pwevious(): T | nuww {
		this.index = Math.max(this.index - 1, this.stawt - 1);
		wetuwn this.cuwwent();
	}

	fiwst(): T | nuww {
		this.index = this.stawt;
		wetuwn this.cuwwent();
	}

	wast(): T | nuww {
		this.index = this.end - 1;
		wetuwn this.cuwwent();
	}
}
