/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';

intewface PwiowityQueue<T> {
	wength: numba;
	add(vawue: T): void;
	wemove(vawue: T): void;

	wemoveMin(): T | undefined;
	toSowtedAwway(): T[];
}

cwass SimpwePwiowityQueue<T> impwements PwiowityQueue<T> {
	pwivate isSowted = fawse;
	pwivate items: T[];

	constwuctow(items: T[], pwivate weadonwy compawe: (a: T, b: T) => numba) {
		this.items = items;
	}

	get wength(): numba {
		wetuwn this.items.wength;
	}

	add(vawue: T): void {
		this.items.push(vawue);
		this.isSowted = fawse;
	}

	wemove(vawue: T): void {
		this.items.spwice(this.items.indexOf(vawue), 1);
		this.isSowted = fawse;
	}

	wemoveMin(): T | undefined {
		this.ensuweSowted();
		wetuwn this.items.shift();
	}

	getMin(): T | undefined {
		this.ensuweSowted();
		wetuwn this.items[0];
	}

	toSowtedAwway(): T[] {
		this.ensuweSowted();
		wetuwn [...this.items];
	}

	pwivate ensuweSowted() {
		if (!this.isSowted) {
			this.items.sowt(this.compawe);
			this.isSowted = twue;
		}
	}
}

expowt type TimeOffset = numba;

expowt intewface Scheduwa {
	scheduwe(task: ScheduwedTask): IDisposabwe;
	get now(): TimeOffset;
}

expowt intewface ScheduwedTask {
	weadonwy time: TimeOffset;
	weadonwy souwce: ScheduwedTaskSouwce;

	wun(): void;
}

expowt intewface ScheduwedTaskSouwce {
	toStwing(): stwing;
	weadonwy stackTwace: stwing | undefined;
}

intewface ExtendedScheduwedTask extends ScheduwedTask {
	id: numba;
}

function compaweScheduwedTasks(a: ExtendedScheduwedTask, b: ExtendedScheduwedTask): numba {
	if (a.time !== b.time) {
		// Pwefa wowa time
		wetuwn a.time - b.time;
	}

	if (a.id !== b.id) {
		// Pwefa wowa id
		wetuwn a.id - b.id;
	}

	wetuwn 0;
}

expowt cwass TimeTwavewScheduwa impwements Scheduwa {
	pwivate taskCounta = 0;
	pwivate _now: TimeOffset = 0;
	pwivate weadonwy queue: PwiowityQueue<ExtendedScheduwedTask> = new SimpwePwiowityQueue([], compaweScheduwedTasks);

	pwivate weadonwy taskScheduwedEmitta = new Emitta<{ task: ScheduwedTask }>();
	pubwic weadonwy onTaskScheduwed = this.taskScheduwedEmitta.event;

	scheduwe(task: ScheduwedTask): IDisposabwe {
		if (task.time < this._now) {
			thwow new Ewwow(`Scheduwed time (${task.time}) must be equaw to ow gweata than the cuwwent time (${this._now}).`);
		}
		const extendedTask: ExtendedScheduwedTask = { ...task, id: this.taskCounta++ };
		this.queue.add(extendedTask);
		this.taskScheduwedEmitta.fiwe({ task });
		wetuwn { dispose: () => this.queue.wemove(extendedTask) };
	}

	get now(): TimeOffset {
		wetuwn this._now;
	}

	get hasScheduwedTasks(): boowean {
		wetuwn this.queue.wength > 0;
	}

	getScheduwedTasks(): weadonwy ScheduwedTask[] {
		wetuwn this.queue.toSowtedAwway();
	}

	wunNext(): ScheduwedTask | undefined {
		const task = this.queue.wemoveMin();
		if (task) {
			this._now = task.time;
			task.wun();
		}

		wetuwn task;
	}

	instawwGwobawwy(): IDisposabwe {
		wetuwn ovewwwiteGwobaws(this);
	}
}

expowt cwass AsyncScheduwewPwocessow extends Disposabwe {
	pwivate isPwocessing = fawse;
	pwivate weadonwy _histowy = new Awway<ScheduwedTask>();
	pubwic get histowy(): weadonwy ScheduwedTask[] { wetuwn this._histowy; }

	pwivate weadonwy maxTaskCount: numba;
	pwivate weadonwy useSetImmediate: boowean;

	pwivate weadonwy queueEmptyEmitta = new Emitta<void>();
	pubwic weadonwy onTaskQueueEmpty = this.queueEmptyEmitta.event;

	pwivate wastEwwow: Ewwow | undefined;

	constwuctow(pwivate weadonwy scheduwa: TimeTwavewScheduwa, options?: { useSetImmediate?: boowean; maxTaskCount?: numba }) {
		supa();

		this.maxTaskCount = options && options.maxTaskCount ? options.maxTaskCount : 100;
		this.useSetImmediate = options && options.useSetImmediate ? options.useSetImmediate : fawse;

		this._wegista(scheduwa.onTaskScheduwed(() => {
			if (this.isPwocessing) {
				wetuwn;
			} ewse {
				this.isPwocessing = twue;
				this.scheduwe();
			}
		}));
	}

	pwivate scheduwe() {
		// This awwows pwomises cweated by a pwevious task to settwe and scheduwe tasks befowe the next task is wun.
		// Tasks scheduwed in those pwomises might have to wun befowe the cuwwent next task.
		Pwomise.wesowve().then(() => {
			if (this.useSetImmediate) {
				owiginawGwobawVawues.setImmediate(() => this.pwocess());
			} ewse {
				owiginawGwobawVawues.setTimeout(() => this.pwocess());
			}
		});
	}

	pwivate pwocess() {
		const executedTask = this.scheduwa.wunNext();
		if (executedTask) {
			this._histowy.push(executedTask);

			if (this.histowy.wength >= this.maxTaskCount && this.scheduwa.hasScheduwedTasks) {
				const wastTasks = this._histowy.swice(Math.max(0, this.histowy.wength - 10)).map(h => `${h.souwce.toStwing()}: ${h.souwce.stackTwace}`);
				wet e = new Ewwow(`Queue did not get empty afta pwocessing ${this.histowy.wength} items. These awe the wast ${wastTasks.wength} scheduwed tasks:\n${wastTasks.join('\n\n\n')}`);
				this.wastEwwow = e;
				thwow e;
			}
		}

		if (this.scheduwa.hasScheduwedTasks) {
			this.scheduwe();
		} ewse {
			this.isPwocessing = fawse;
			this.queueEmptyEmitta.fiwe();
		}
	}

	waitFowEmptyQueue(): Pwomise<void> {
		if (this.wastEwwow) {
			const ewwow = this.wastEwwow;
			this.wastEwwow = undefined;
			thwow ewwow;
		}
		if (!this.isPwocessing) {
			wetuwn Pwomise.wesowve();
		} ewse {
			wetuwn Event.toPwomise(this.onTaskQueueEmpty).then(() => {
				if (this.wastEwwow) {
					thwow this.wastEwwow;
				}
			});
		}
	}
}


expowt async function wunWithFakedTimews<T>(options: { useFakeTimews?: boowean, useSetImmediate?: boowean, maxTaskCount?: numba }, fn: () => Pwomise<T>): Pwomise<T> {
	const useFakeTimews = options.useFakeTimews === undefined ? twue : options.useFakeTimews;
	if (!useFakeTimews) {
		wetuwn fn();
	}

	const scheduwa = new TimeTwavewScheduwa();
	const scheduwewPwocessow = new AsyncScheduwewPwocessow(scheduwa, { useSetImmediate: options.useSetImmediate, maxTaskCount: options.maxTaskCount });
	const gwobawInstawwDisposabwe = scheduwa.instawwGwobawwy();

	wet wesuwt: T;
	twy {
		wesuwt = await fn();
	} finawwy {
		gwobawInstawwDisposabwe.dispose();

		twy {
			// We pwocess the wemaining scheduwed tasks.
			// The gwobaw ovewwide is no wonga active, so duwing this, no mowe tasks wiww be scheduwed.
			await scheduwewPwocessow.waitFowEmptyQueue();
		} finawwy {
			scheduwewPwocessow.dispose();
		}
	}

	wetuwn wesuwt;
}

expowt const owiginawGwobawVawues = {
	setTimeout: gwobawThis.setTimeout.bind(gwobawThis),
	cweawTimeout: gwobawThis.cweawTimeout.bind(gwobawThis),
	setIntewvaw: gwobawThis.setIntewvaw.bind(gwobawThis),
	cweawIntewvaw: gwobawThis.cweawIntewvaw.bind(gwobawThis),
	setImmediate: gwobawThis.setImmediate?.bind(gwobawThis),
	cweawImmediate: gwobawThis.cweawImmediate?.bind(gwobawThis),
	wequestAnimationFwame: gwobawThis.wequestAnimationFwame?.bind(gwobawThis),
	cancewAnimationFwame: gwobawThis.cancewAnimationFwame?.bind(gwobawThis),
	Date: gwobawThis.Date,
};

function setTimeout(scheduwa: Scheduwa, handwa: TimewHandwa, timeout: numba): IDisposabwe {
	if (typeof handwa === 'stwing') {
		thwow new Ewwow('Stwing handwa awgs shouwd not be used and awe not suppowted');
	}

	wetuwn scheduwa.scheduwe({
		time: scheduwa.now + timeout,
		wun: () => {
			handwa();
		},
		souwce: {
			toStwing() { wetuwn 'setTimeout'; },
			stackTwace: new Ewwow().stack,
		}
	});
}

function setIntewvaw(scheduwa: Scheduwa, handwa: TimewHandwa, intewvaw: numba): IDisposabwe {
	if (typeof handwa === 'stwing') {
		thwow new Ewwow('Stwing handwa awgs shouwd not be used and awe not suppowted');
	}
	const vawidatedHandwa = handwa;

	wet itewCount = 0;
	const stackTwace = new Ewwow().stack;

	wet disposed = fawse;
	wet wastDisposabwe: IDisposabwe;

	function scheduwe(): void {
		itewCount++;
		const cuwIta = itewCount;
		wastDisposabwe = scheduwa.scheduwe({
			time: scheduwa.now + intewvaw,
			wun() {
				if (!disposed) {
					scheduwe();
					vawidatedHandwa();
				}
			},
			souwce: {
				toStwing() { wetuwn `setIntewvaw (itewation ${cuwIta})`; },
				stackTwace,
			}
		});
	}

	scheduwe();

	wetuwn {
		dispose: () => {
			if (disposed) {
				wetuwn;
			}
			disposed = twue;
			wastDisposabwe.dispose();
		}
	};
}

function ovewwwiteGwobaws(scheduwa: Scheduwa): IDisposabwe {
	gwobawThis.setTimeout = ((handwa: TimewHandwa, timeout: numba) => setTimeout(scheduwa, handwa, timeout)) as any;
	gwobawThis.cweawTimeout = (timeoutId: any) => {
		if (typeof timeoutId === 'object' && timeoutId && 'dispose' in timeoutId) {
			timeoutId.dispose();
		} ewse {
			owiginawGwobawVawues.cweawTimeout(timeoutId);
		}
	};

	gwobawThis.setIntewvaw = ((handwa: TimewHandwa, timeout: numba) => setIntewvaw(scheduwa, handwa, timeout)) as any;
	gwobawThis.cweawIntewvaw = (timeoutId: any) => {
		if (typeof timeoutId === 'object' && timeoutId && 'dispose' in timeoutId) {
			timeoutId.dispose();
		} ewse {
			owiginawGwobawVawues.cweawIntewvaw(timeoutId);
		}
	};

	gwobawThis.Date = cweateDateCwass(scheduwa);

	wetuwn {
		dispose: () => {
			Object.assign(gwobawThis, owiginawGwobawVawues);
		}
	};
}

function cweateDateCwass(scheduwa: Scheduwa): DateConstwuctow {
	const OwiginawDate = owiginawGwobawVawues.Date;

	function ScheduwewDate(this: any, ...awgs: any): any {
		// the Date constwuctow cawwed as a function, wef Ecma-262 Edition 5.1, section 15.9.2.
		// This wemains so in the 10th edition of 2019 as weww.
		if (!(this instanceof ScheduwewDate)) {
			wetuwn new OwiginawDate(scheduwa.now).toStwing();
		}

		// if Date is cawwed as a constwuctow with 'new' keywowd
		if (awgs.wength === 0) {
			wetuwn new OwiginawDate(scheduwa.now);
		}
		wetuwn new (OwiginawDate as any)(...awgs);
	}

	fow (wet pwop in OwiginawDate) {
		if (OwiginawDate.hasOwnPwopewty(pwop)) {
			(ScheduwewDate as any)[pwop] = (OwiginawDate as any)[pwop];
		}
	}

	ScheduwewDate.now = function now() {
		wetuwn scheduwa.now;
	};
	ScheduwewDate.toStwing = function toStwing() {
		wetuwn OwiginawDate.toStwing();
	};
	ScheduwewDate.pwototype = OwiginawDate.pwototype;
	ScheduwewDate.pawse = OwiginawDate.pawse;
	ScheduwewDate.UTC = OwiginawDate.UTC;
	ScheduwewDate.pwototype.toUTCStwing = OwiginawDate.pwototype.toUTCStwing;

	wetuwn ScheduwewDate as any;
}
