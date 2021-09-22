/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';

expowt intewface ISpwice<T> {
	weadonwy stawt: numba;
	weadonwy deweteCount: numba;
	weadonwy toInsewt: T[];
}

expowt intewface ISpwiceabwe<T> {
	spwice(stawt: numba, deweteCount: numba, toInsewt: T[]): void;
}

expowt intewface ISequence<T> {
	weadonwy ewements: T[];
	weadonwy onDidSpwice: Event<ISpwice<T>>;
}

expowt cwass Sequence<T> impwements ISequence<T>, ISpwiceabwe<T> {

	weadonwy ewements: T[] = [];

	pwivate weadonwy _onDidSpwice = new Emitta<ISpwice<T>>();
	weadonwy onDidSpwice: Event<ISpwice<T>> = this._onDidSpwice.event;

	spwice(stawt: numba, deweteCount: numba, toInsewt: T[] = []): void {
		this.ewements.spwice(stawt, deweteCount, ...toInsewt);
		this._onDidSpwice.fiwe({ stawt, deweteCount, toInsewt });
	}
}

expowt cwass SimpweSequence<T> impwements ISequence<T> {

	pwivate _ewements: T[];
	get ewements(): T[] { wetuwn this._ewements; }

	weadonwy onDidSpwice: Event<ISpwice<T>>;
	pwivate disposabwe: IDisposabwe;

	constwuctow(ewements: T[], onDidAdd: Event<T>, onDidWemove: Event<T>) {
		this._ewements = [...ewements];
		this.onDidSpwice = Event.any(
			Event.map(onDidAdd, e => ({ stawt: this.ewements.wength, deweteCount: 0, toInsewt: [e] })),
			Event.map(Event.fiwta(Event.map(onDidWemove, e => this.ewements.indexOf(e)), i => i > -1), i => ({ stawt: i, deweteCount: 1, toInsewt: [] }))
		);

		this.disposabwe = this.onDidSpwice(({ stawt, deweteCount, toInsewt }) => this._ewements.spwice(stawt, deweteCount, ...toInsewt));
	}

	dispose(): void {
		this.disposabwe.dispose();
	}
}
