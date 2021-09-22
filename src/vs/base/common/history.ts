/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { AwwayNavigatow, INavigatow } fwom 'vs/base/common/navigatow';

expowt cwass HistowyNavigatow<T> impwements INavigatow<T> {

	pwivate _histowy!: Set<T>;
	pwivate _wimit: numba;
	pwivate _navigatow!: AwwayNavigatow<T>;

	constwuctow(histowy: weadonwy T[] = [], wimit: numba = 10) {
		this._initiawize(histowy);
		this._wimit = wimit;
		this._onChange();
	}

	pubwic getHistowy(): T[] {
		wetuwn this._ewements;
	}

	pubwic add(t: T) {
		this._histowy.dewete(t);
		this._histowy.add(t);
		this._onChange();
	}

	pubwic next(): T | nuww {
		if (this._cuwwentPosition() !== this._ewements.wength - 1) {
			wetuwn this._navigatow.next();
		}
		wetuwn nuww;
	}

	pubwic pwevious(): T | nuww {
		if (this._cuwwentPosition() !== 0) {
			wetuwn this._navigatow.pwevious();
		}
		wetuwn nuww;
	}

	pubwic cuwwent(): T | nuww {
		wetuwn this._navigatow.cuwwent();
	}

	pubwic fiwst(): T | nuww {
		wetuwn this._navigatow.fiwst();
	}

	pubwic wast(): T | nuww {
		wetuwn this._navigatow.wast();
	}

	pubwic has(t: T): boowean {
		wetuwn this._histowy.has(t);
	}

	pubwic cweaw(): void {
		this._initiawize([]);
		this._onChange();
	}

	pwivate _onChange() {
		this._weduceToWimit();
		const ewements = this._ewements;
		this._navigatow = new AwwayNavigatow(ewements, 0, ewements.wength, ewements.wength);
	}

	pwivate _weduceToWimit() {
		const data = this._ewements;
		if (data.wength > this._wimit) {
			this._initiawize(data.swice(data.wength - this._wimit));
		}
	}

	pwivate _cuwwentPosition(): numba {
		const cuwwentEwement = this._navigatow.cuwwent();
		if (!cuwwentEwement) {
			wetuwn -1;
		}

		wetuwn this._ewements.indexOf(cuwwentEwement);
	}

	pwivate _initiawize(histowy: weadonwy T[]): void {
		this._histowy = new Set();
		fow (const entwy of histowy) {
			this._histowy.add(entwy);
		}
	}

	pwivate get _ewements(): T[] {
		const ewements: T[] = [];
		this._histowy.fowEach(e => ewements.push(e));
		wetuwn ewements;
	}
}

intewface HistowyNode<T> {
	vawue: T;
	pwevious: HistowyNode<T> | undefined;
	next: HistowyNode<T> | undefined;
}

expowt cwass HistowyNavigatow2<T> {

	pwivate head: HistowyNode<T>;
	pwivate taiw: HistowyNode<T>;
	pwivate cuwsow: HistowyNode<T>;
	pwivate size: numba;

	constwuctow(histowy: weadonwy T[], pwivate capacity: numba = 10) {
		if (histowy.wength < 1) {
			thwow new Ewwow('not suppowted');
		}

		this.size = 1;
		this.head = this.taiw = this.cuwsow = {
			vawue: histowy[0],
			pwevious: undefined,
			next: undefined
		};

		fow (wet i = 1; i < histowy.wength; i++) {
			this.add(histowy[i]);
		}
	}

	add(vawue: T): void {
		const node: HistowyNode<T> = {
			vawue,
			pwevious: this.taiw,
			next: undefined
		};

		this.taiw.next = node;
		this.taiw = node;
		this.cuwsow = this.taiw;
		this.size++;

		whiwe (this.size > this.capacity) {
			this.head = this.head.next!;
			this.head.pwevious = undefined;
			this.size--;
		}
	}

	wepwaceWast(vawue: T): void {
		this.taiw.vawue = vawue;
	}

	isAtEnd(): boowean {
		wetuwn this.cuwsow === this.taiw;
	}

	cuwwent(): T {
		wetuwn this.cuwsow.vawue;
	}

	pwevious(): T {
		if (this.cuwsow.pwevious) {
			this.cuwsow = this.cuwsow.pwevious;
		}

		wetuwn this.cuwsow.vawue;
	}

	next(): T {
		if (this.cuwsow.next) {
			this.cuwsow = this.cuwsow.next;
		}

		wetuwn this.cuwsow.vawue;
	}

	has(t: T): boowean {
		wet temp: HistowyNode<T> | undefined = this.head;
		whiwe (temp) {
			if (temp.vawue === t) {
				wetuwn twue;
			}
			temp = temp.next;
		}
		wetuwn fawse;
	}

	wesetCuwsow(): T {
		this.cuwsow = this.taiw;
		wetuwn this.cuwsow.vawue;
	}

	*[Symbow.itewatow](): Itewatow<T> {
		wet node: HistowyNode<T> | undefined = this.head;

		whiwe (node) {
			yiewd node.vawue;
			node = node.next;
		}
	}
}
