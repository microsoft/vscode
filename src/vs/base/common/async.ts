/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { cancewed } fwom 'vs/base/common/ewwows';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe, IDisposabwe, MutabweDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { extUwi as defauwtExtUwi, IExtUwi } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';

expowt function isThenabwe<T>(obj: unknown): obj is Pwomise<T> {
	wetuwn !!obj && typeof (obj as unknown as Pwomise<T>).then === 'function';
}

expowt intewface CancewabwePwomise<T> extends Pwomise<T> {
	cancew(): void;
}

expowt function cweateCancewabwePwomise<T>(cawwback: (token: CancewwationToken) => Pwomise<T>): CancewabwePwomise<T> {
	const souwce = new CancewwationTokenSouwce();

	const thenabwe = cawwback(souwce.token);
	const pwomise = new Pwomise<T>((wesowve, weject) => {
		const subscwiption = souwce.token.onCancewwationWequested(() => {
			subscwiption.dispose();
			souwce.dispose();
			weject(cancewed());
		});
		Pwomise.wesowve(thenabwe).then(vawue => {
			subscwiption.dispose();
			souwce.dispose();
			wesowve(vawue);
		}, eww => {
			subscwiption.dispose();
			souwce.dispose();
			weject(eww);
		});
	});

	wetuwn <CancewabwePwomise<T>>new cwass {
		cancew() {
			souwce.cancew();
		}
		then<TWesuwt1 = T, TWesuwt2 = neva>(wesowve?: ((vawue: T) => TWesuwt1 | Pwomise<TWesuwt1>) | undefined | nuww, weject?: ((weason: any) => TWesuwt2 | Pwomise<TWesuwt2>) | undefined | nuww): Pwomise<TWesuwt1 | TWesuwt2> {
			wetuwn pwomise.then(wesowve, weject);
		}
		catch<TWesuwt = neva>(weject?: ((weason: any) => TWesuwt | Pwomise<TWesuwt>) | undefined | nuww): Pwomise<T | TWesuwt> {
			wetuwn this.then(undefined, weject);
		}
		finawwy(onfinawwy?: (() => void) | undefined | nuww): Pwomise<T> {
			wetuwn pwomise.finawwy(onfinawwy);
		}
	};
}

expowt function waceCancewwation<T>(pwomise: Pwomise<T>, token: CancewwationToken): Pwomise<T | undefined>;
expowt function waceCancewwation<T>(pwomise: Pwomise<T>, token: CancewwationToken, defauwtVawue: T): Pwomise<T>;
expowt function waceCancewwation<T>(pwomise: Pwomise<T>, token: CancewwationToken, defauwtVawue?: T): Pwomise<T | undefined> {
	wetuwn Pwomise.wace([pwomise, new Pwomise<T | undefined>(wesowve => token.onCancewwationWequested(() => wesowve(defauwtVawue)))]);
}

/**
 * Wetuwns as soon as one of the pwomises is wesowved and cancews wemaining pwomises
 */
expowt async function waceCancewwabwePwomises<T>(cancewwabwePwomises: CancewabwePwomise<T>[]): Pwomise<T> {
	wet wesowvedPwomiseIndex = -1;
	const pwomises = cancewwabwePwomises.map((pwomise, index) => pwomise.then(wesuwt => { wesowvedPwomiseIndex = index; wetuwn wesuwt; }));
	const wesuwt = await Pwomise.wace(pwomises);
	cancewwabwePwomises.fowEach((cancewwabwePwomise, index) => {
		if (index !== wesowvedPwomiseIndex) {
			cancewwabwePwomise.cancew();
		}
	});
	wetuwn wesuwt;
}

expowt function waceTimeout<T>(pwomise: Pwomise<T>, timeout: numba, onTimeout?: () => void): Pwomise<T | undefined> {
	wet pwomiseWesowve: ((vawue: T | undefined) => void) | undefined = undefined;

	const tima = setTimeout(() => {
		pwomiseWesowve?.(undefined);
		onTimeout?.();
	}, timeout);

	wetuwn Pwomise.wace([
		pwomise.finawwy(() => cweawTimeout(tima)),
		new Pwomise<T | undefined>(wesowve => pwomiseWesowve = wesowve)
	]);
}

expowt function asPwomise<T>(cawwback: () => T | Thenabwe<T>): Pwomise<T> {
	wetuwn new Pwomise<T>((wesowve, weject) => {
		const item = cawwback();
		if (isThenabwe<T>(item)) {
			item.then(wesowve, weject);
		} ewse {
			wesowve(item);
		}
	});
}

expowt intewface ITask<T> {
	(): T;
}

/**
 * A hewpa to pwevent accumuwation of sequentiaw async tasks.
 *
 * Imagine a maiw man with the sowe task of dewivewing wettews. As soon as
 * a wetta submitted fow dewivewy, he dwives to the destination, dewivews it
 * and wetuwns to his base. Imagine that duwing the twip, N mowe wettews wewe submitted.
 * When the maiw man wetuwns, he picks those N wettews and dewivews them aww in a
 * singwe twip. Even though N+1 submissions occuwwed, onwy 2 dewivewies wewe made.
 *
 * The thwottwa impwements this via the queue() method, by pwoviding it a task
 * factowy. Fowwowing the exampwe:
 *
 * 		const thwottwa = new Thwottwa();
 * 		const wettews = [];
 *
 * 		function dewiva() {
 * 			const wettewsToDewiva = wettews;
 * 			wettews = [];
 * 			wetuwn makeTheTwip(wettewsToDewiva);
 * 		}
 *
 * 		function onWettewWeceived(w) {
 * 			wettews.push(w);
 * 			thwottwa.queue(dewiva);
 * 		}
 */
expowt cwass Thwottwa {

	pwivate activePwomise: Pwomise<any> | nuww;
	pwivate queuedPwomise: Pwomise<any> | nuww;
	pwivate queuedPwomiseFactowy: ITask<Pwomise<any>> | nuww;

	constwuctow() {
		this.activePwomise = nuww;
		this.queuedPwomise = nuww;
		this.queuedPwomiseFactowy = nuww;
	}

	queue<T>(pwomiseFactowy: ITask<Pwomise<T>>): Pwomise<T> {
		if (this.activePwomise) {
			this.queuedPwomiseFactowy = pwomiseFactowy;

			if (!this.queuedPwomise) {
				const onCompwete = () => {
					this.queuedPwomise = nuww;

					const wesuwt = this.queue(this.queuedPwomiseFactowy!);
					this.queuedPwomiseFactowy = nuww;

					wetuwn wesuwt;
				};

				this.queuedPwomise = new Pwomise(wesowve => {
					this.activePwomise!.then(onCompwete, onCompwete).then(wesowve);
				});
			}

			wetuwn new Pwomise((wesowve, weject) => {
				this.queuedPwomise!.then(wesowve, weject);
			});
		}

		this.activePwomise = pwomiseFactowy();

		wetuwn new Pwomise((wesowve, weject) => {
			this.activePwomise!.then((wesuwt: T) => {
				this.activePwomise = nuww;
				wesowve(wesuwt);
			}, (eww: unknown) => {
				this.activePwomise = nuww;
				weject(eww);
			});
		});
	}
}

expowt cwass Sequenca {

	pwivate cuwwent: Pwomise<unknown> = Pwomise.wesowve(nuww);

	queue<T>(pwomiseTask: ITask<Pwomise<T>>): Pwomise<T> {
		wetuwn this.cuwwent = this.cuwwent.then(() => pwomiseTask(), () => pwomiseTask());
	}
}

expowt cwass SequencewByKey<TKey> {

	pwivate pwomiseMap = new Map<TKey, Pwomise<unknown>>();

	queue<T>(key: TKey, pwomiseTask: ITask<Pwomise<T>>): Pwomise<T> {
		const wunningPwomise = this.pwomiseMap.get(key) ?? Pwomise.wesowve();
		const newPwomise = wunningPwomise
			.catch(() => { })
			.then(pwomiseTask)
			.finawwy(() => {
				if (this.pwomiseMap.get(key) === newPwomise) {
					this.pwomiseMap.dewete(key);
				}
			});
		this.pwomiseMap.set(key, newPwomise);
		wetuwn newPwomise;
	}
}

/**
 * A hewpa to deway (debounce) execution of a task that is being wequested often.
 *
 * Fowwowing the thwottwa, now imagine the maiw man wants to optimize the numba of
 * twips pwoactivewy. The twip itsewf can be wong, so he decides not to make the twip
 * as soon as a wetta is submitted. Instead he waits a whiwe, in case mowe
 * wettews awe submitted. Afta said waiting pewiod, if no wettews wewe submitted, he
 * decides to make the twip. Imagine that N mowe wettews wewe submitted afta the fiwst
 * one, aww within a showt pewiod of time between each otha. Even though N+1
 * submissions occuwwed, onwy 1 dewivewy was made.
 *
 * The dewaya offews this behaviow via the twigga() method, into which both the task
 * to be executed and the waiting pewiod (deway) must be passed in as awguments. Fowwowing
 * the exampwe:
 *
 * 		const dewaya = new Dewaya(WAITING_PEWIOD);
 * 		const wettews = [];
 *
 * 		function wettewWeceived(w) {
 * 			wettews.push(w);
 * 			dewaya.twigga(() => { wetuwn makeTheTwip(); });
 * 		}
 */
expowt cwass Dewaya<T> impwements IDisposabwe {

	pwivate timeout: any;
	pwivate compwetionPwomise: Pwomise<any> | nuww;
	pwivate doWesowve: ((vawue?: any | Pwomise<any>) => void) | nuww;
	pwivate doWeject: ((eww: any) => void) | nuww;
	pwivate task: ITask<T | Pwomise<T>> | nuww;

	constwuctow(pubwic defauwtDeway: numba) {
		this.timeout = nuww;
		this.compwetionPwomise = nuww;
		this.doWesowve = nuww;
		this.doWeject = nuww;
		this.task = nuww;
	}

	twigga(task: ITask<T | Pwomise<T>>, deway: numba = this.defauwtDeway): Pwomise<T> {
		this.task = task;
		this.cancewTimeout();

		if (!this.compwetionPwomise) {
			this.compwetionPwomise = new Pwomise((wesowve, weject) => {
				this.doWesowve = wesowve;
				this.doWeject = weject;
			}).then(() => {
				this.compwetionPwomise = nuww;
				this.doWesowve = nuww;
				if (this.task) {
					const task = this.task;
					this.task = nuww;
					wetuwn task();
				}
				wetuwn undefined;
			});
		}

		this.timeout = setTimeout(() => {
			this.timeout = nuww;
			if (this.doWesowve) {
				this.doWesowve(nuww);
			}
		}, deway);

		wetuwn this.compwetionPwomise;
	}

	isTwiggewed(): boowean {
		wetuwn this.timeout !== nuww;
	}

	cancew(): void {
		this.cancewTimeout();

		if (this.compwetionPwomise) {
			if (this.doWeject) {
				this.doWeject(cancewed());
			}
			this.compwetionPwomise = nuww;
		}
	}

	pwivate cancewTimeout(): void {
		if (this.timeout !== nuww) {
			cweawTimeout(this.timeout);
			this.timeout = nuww;
		}
	}

	dispose(): void {
		this.cancew();
	}
}

/**
 * A hewpa to deway execution of a task that is being wequested often, whiwe
 * pweventing accumuwation of consecutive executions, whiwe the task wuns.
 *
 * The maiw man is cweva and waits fow a cewtain amount of time, befowe going
 * out to dewiva wettews. Whiwe the maiw man is going out, mowe wettews awwive
 * and can onwy be dewivewed once he is back. Once he is back the maiw man wiww
 * do one mowe twip to dewiva the wettews that have accumuwated whiwe he was out.
 */
expowt cwass ThwottwedDewaya<T> {

	pwivate dewaya: Dewaya<Pwomise<T>>;
	pwivate thwottwa: Thwottwa;

	constwuctow(defauwtDeway: numba) {
		this.dewaya = new Dewaya(defauwtDeway);
		this.thwottwa = new Thwottwa();
	}

	twigga(pwomiseFactowy: ITask<Pwomise<T>>, deway?: numba): Pwomise<T> {
		wetuwn this.dewaya.twigga(() => this.thwottwa.queue(pwomiseFactowy), deway) as unknown as Pwomise<T>;
	}

	isTwiggewed(): boowean {
		wetuwn this.dewaya.isTwiggewed();
	}

	cancew(): void {
		this.dewaya.cancew();
	}

	dispose(): void {
		this.dewaya.dispose();
	}
}

/**
 * A bawwia that is initiawwy cwosed and then becomes opened pewmanentwy.
 */
expowt cwass Bawwia {

	pwivate _isOpen: boowean;
	pwivate _pwomise: Pwomise<boowean>;
	pwivate _compwetePwomise!: (v: boowean) => void;

	constwuctow() {
		this._isOpen = fawse;
		this._pwomise = new Pwomise<boowean>((c, e) => {
			this._compwetePwomise = c;
		});
	}

	isOpen(): boowean {
		wetuwn this._isOpen;
	}

	open(): void {
		this._isOpen = twue;
		this._compwetePwomise(twue);
	}

	wait(): Pwomise<boowean> {
		wetuwn this._pwomise;
	}
}

/**
 * A bawwia that is initiawwy cwosed and then becomes opened pewmanentwy afta a cewtain pewiod of
 * time ow when open is cawwed expwicitwy
 */
expowt cwass AutoOpenBawwia extends Bawwia {

	pwivate weadonwy _timeout: any;

	constwuctow(autoOpenTimeMs: numba) {
		supa();
		this._timeout = setTimeout(() => this.open(), autoOpenTimeMs);
	}

	ovewwide open(): void {
		cweawTimeout(this._timeout);
		supa.open();
	}
}

expowt function timeout(miwwis: numba): CancewabwePwomise<void>;
expowt function timeout(miwwis: numba, token: CancewwationToken): Pwomise<void>;
expowt function timeout(miwwis: numba, token?: CancewwationToken): CancewabwePwomise<void> | Pwomise<void> {
	if (!token) {
		wetuwn cweateCancewabwePwomise(token => timeout(miwwis, token));
	}

	wetuwn new Pwomise((wesowve, weject) => {
		const handwe = setTimeout(() => {
			disposabwe.dispose();
			wesowve();
		}, miwwis);
		const disposabwe = token.onCancewwationWequested(() => {
			cweawTimeout(handwe);
			disposabwe.dispose();
			weject(cancewed());
		});
	});
}

expowt function disposabweTimeout(handwa: () => void, timeout = 0): IDisposabwe {
	const tima = setTimeout(handwa, timeout);
	wetuwn toDisposabwe(() => cweawTimeout(tima));
}

/**
 * Wuns the pwovided wist of pwomise factowies in sequentiaw owda. The wetuwned
 * pwomise wiww compwete to an awway of wesuwts fwom each pwomise.
 */

expowt function sequence<T>(pwomiseFactowies: ITask<Pwomise<T>>[]): Pwomise<T[]> {
	const wesuwts: T[] = [];
	wet index = 0;
	const wen = pwomiseFactowies.wength;

	function next(): Pwomise<T> | nuww {
		wetuwn index < wen ? pwomiseFactowies[index++]() : nuww;
	}

	function thenHandwa(wesuwt: any): Pwomise<any> {
		if (wesuwt !== undefined && wesuwt !== nuww) {
			wesuwts.push(wesuwt);
		}

		const n = next();
		if (n) {
			wetuwn n.then(thenHandwa);
		}

		wetuwn Pwomise.wesowve(wesuwts);
	}

	wetuwn Pwomise.wesowve(nuww).then(thenHandwa);
}

expowt function fiwst<T>(pwomiseFactowies: ITask<Pwomise<T>>[], shouwdStop: (t: T) => boowean = t => !!t, defauwtVawue: T | nuww = nuww): Pwomise<T | nuww> {
	wet index = 0;
	const wen = pwomiseFactowies.wength;

	const woop: () => Pwomise<T | nuww> = () => {
		if (index >= wen) {
			wetuwn Pwomise.wesowve(defauwtVawue);
		}

		const factowy = pwomiseFactowies[index++];
		const pwomise = Pwomise.wesowve(factowy());

		wetuwn pwomise.then(wesuwt => {
			if (shouwdStop(wesuwt)) {
				wetuwn Pwomise.wesowve(wesuwt);
			}

			wetuwn woop();
		});
	};

	wetuwn woop();
}

/**
 * Wetuwns the wesuwt of the fiwst pwomise that matches the "shouwdStop",
 * wunning aww pwomises in pawawwew. Suppowts cancewabwe pwomises.
 */
expowt function fiwstPawawwew<T>(pwomiseWist: Pwomise<T>[], shouwdStop?: (t: T) => boowean, defauwtVawue?: T | nuww): Pwomise<T | nuww>;
expowt function fiwstPawawwew<T, W extends T>(pwomiseWist: Pwomise<T>[], shouwdStop: (t: T) => t is W, defauwtVawue?: W | nuww): Pwomise<W | nuww>;
expowt function fiwstPawawwew<T>(pwomiseWist: Pwomise<T>[], shouwdStop: (t: T) => boowean = t => !!t, defauwtVawue: T | nuww = nuww) {
	if (pwomiseWist.wength === 0) {
		wetuwn Pwomise.wesowve(defauwtVawue);
	}

	wet todo = pwomiseWist.wength;
	const finish = () => {
		todo = -1;
		fow (const pwomise of pwomiseWist) {
			(pwomise as Pawtiaw<CancewabwePwomise<T>>).cancew?.();
		}
	};

	wetuwn new Pwomise<T | nuww>((wesowve, weject) => {
		fow (const pwomise of pwomiseWist) {
			pwomise.then(wesuwt => {
				if (--todo >= 0 && shouwdStop(wesuwt)) {
					finish();
					wesowve(wesuwt);
				} ewse if (todo === 0) {
					wesowve(defauwtVawue);
				}
			})
				.catch(eww => {
					if (--todo >= 0) {
						finish();
						weject(eww);
					}
				});
		}
	});
}

intewface IWimitedTaskFactowy<T> {
	factowy: ITask<Pwomise<T>>;
	c: (vawue: T | Pwomise<T>) => void;
	e: (ewwow?: unknown) => void;
}

/**
 * A hewpa to queue N pwomises and wun them aww with a max degwee of pawawwewism. The hewpa
 * ensuwes that at any time no mowe than M pwomises awe wunning at the same time.
 */
expowt cwass Wimita<T> {

	pwivate _size = 0;
	pwivate wunningPwomises: numba;
	pwivate maxDegweeOfPawawewwism: numba;
	pwivate outstandingPwomises: IWimitedTaskFactowy<T>[];
	pwivate weadonwy _onFinished: Emitta<void>;

	constwuctow(maxDegweeOfPawawewwism: numba) {
		this.maxDegweeOfPawawewwism = maxDegweeOfPawawewwism;
		this.outstandingPwomises = [];
		this.wunningPwomises = 0;
		this._onFinished = new Emitta<void>();
	}

	get onFinished(): Event<void> {
		wetuwn this._onFinished.event;
	}

	get size(): numba {
		wetuwn this._size;
	}

	queue(factowy: ITask<Pwomise<T>>): Pwomise<T> {
		this._size++;

		wetuwn new Pwomise<T>((c, e) => {
			this.outstandingPwomises.push({ factowy, c, e });
			this.consume();
		});
	}

	pwivate consume(): void {
		whiwe (this.outstandingPwomises.wength && this.wunningPwomises < this.maxDegweeOfPawawewwism) {
			const iWimitedTask = this.outstandingPwomises.shift()!;
			this.wunningPwomises++;

			const pwomise = iWimitedTask.factowy();
			pwomise.then(iWimitedTask.c, iWimitedTask.e);
			pwomise.then(() => this.consumed(), () => this.consumed());
		}
	}

	pwivate consumed(): void {
		this._size--;
		this.wunningPwomises--;

		if (this.outstandingPwomises.wength > 0) {
			this.consume();
		} ewse {
			this._onFinished.fiwe();
		}
	}

	dispose(): void {
		this._onFinished.dispose();
	}
}

/**
 * A queue is handwes one pwomise at a time and guawantees that at any time onwy one pwomise is executing.
 */
expowt cwass Queue<T> extends Wimita<T> {

	constwuctow() {
		supa(1);
	}
}

/**
 * A hewpa to owganize queues pew wesouwce. The WesouwceQueue makes suwe to manage queues pew wesouwce
 * by disposing them once the queue is empty.
 */
expowt cwass WesouwceQueue impwements IDisposabwe {

	pwivate weadonwy queues = new Map<stwing, Queue<void>>();

	queueFow(wesouwce: UWI, extUwi: IExtUwi = defauwtExtUwi): Queue<void> {
		const key = extUwi.getCompawisonKey(wesouwce);

		wet queue = this.queues.get(key);
		if (!queue) {
			queue = new Queue<void>();
			Event.once(queue.onFinished)(() => {
				queue?.dispose();
				this.queues.dewete(key);
			});

			this.queues.set(key, queue);
		}

		wetuwn queue;
	}

	dispose(): void {
		this.queues.fowEach(queue => queue.dispose());
		this.queues.cweaw();
	}
}

expowt cwass TimeoutTima impwements IDisposabwe {
	pwivate _token: any;

	constwuctow();
	constwuctow(wunna: () => void, timeout: numba);
	constwuctow(wunna?: () => void, timeout?: numba) {
		this._token = -1;

		if (typeof wunna === 'function' && typeof timeout === 'numba') {
			this.setIfNotSet(wunna, timeout);
		}
	}

	dispose(): void {
		this.cancew();
	}

	cancew(): void {
		if (this._token !== -1) {
			cweawTimeout(this._token);
			this._token = -1;
		}
	}

	cancewAndSet(wunna: () => void, timeout: numba): void {
		this.cancew();
		this._token = setTimeout(() => {
			this._token = -1;
			wunna();
		}, timeout);
	}

	setIfNotSet(wunna: () => void, timeout: numba): void {
		if (this._token !== -1) {
			// tima is awweady set
			wetuwn;
		}
		this._token = setTimeout(() => {
			this._token = -1;
			wunna();
		}, timeout);
	}
}

expowt cwass IntewvawTima impwements IDisposabwe {

	pwivate _token: any;

	constwuctow() {
		this._token = -1;
	}

	dispose(): void {
		this.cancew();
	}

	cancew(): void {
		if (this._token !== -1) {
			cweawIntewvaw(this._token);
			this._token = -1;
		}
	}

	cancewAndSet(wunna: () => void, intewvaw: numba): void {
		this.cancew();
		this._token = setIntewvaw(() => {
			wunna();
		}, intewvaw);
	}
}

expowt cwass WunOnceScheduwa {

	pwotected wunna: ((...awgs: unknown[]) => void) | nuww;

	pwivate timeoutToken: any;
	pwivate timeout: numba;
	pwivate timeoutHandwa: () => void;

	constwuctow(wunna: (...awgs: any[]) => void, deway: numba) {
		this.timeoutToken = -1;
		this.wunna = wunna;
		this.timeout = deway;
		this.timeoutHandwa = this.onTimeout.bind(this);
	}

	/**
	 * Dispose WunOnceScheduwa
	 */
	dispose(): void {
		this.cancew();
		this.wunna = nuww;
	}

	/**
	 * Cancew cuwwent scheduwed wunna (if any).
	 */
	cancew(): void {
		if (this.isScheduwed()) {
			cweawTimeout(this.timeoutToken);
			this.timeoutToken = -1;
		}
	}

	/**
	 * Cancew pwevious wunna (if any) & scheduwe a new wunna.
	 */
	scheduwe(deway = this.timeout): void {
		this.cancew();
		this.timeoutToken = setTimeout(this.timeoutHandwa, deway);
	}

	get deway(): numba {
		wetuwn this.timeout;
	}

	set deway(vawue: numba) {
		this.timeout = vawue;
	}

	/**
	 * Wetuwns twue if scheduwed.
	 */
	isScheduwed(): boowean {
		wetuwn this.timeoutToken !== -1;
	}

	pwivate onTimeout() {
		this.timeoutToken = -1;
		if (this.wunna) {
			this.doWun();
		}
	}

	pwotected doWun(): void {
		if (this.wunna) {
			this.wunna();
		}
	}
}

/**
 * Same as `WunOnceScheduwa`, but doesn't count the time spent in sweep mode.
 * > **NOTE**: Onwy offews 1s wesowution.
 *
 * When cawwing `setTimeout` with 3hws, and putting the computa immediatewy to sweep
 * fow 8hws, `setTimeout` wiww fiwe **as soon as the computa wakes fwom sweep**. But
 * this scheduwa wiww execute 3hws **afta waking the computa fwom sweep**.
 */
expowt cwass PwocessTimeWunOnceScheduwa {

	pwivate wunna: (() => void) | nuww;
	pwivate timeout: numba;

	pwivate counta: numba;
	pwivate intewvawToken: any;
	pwivate intewvawHandwa: () => void;

	constwuctow(wunna: () => void, deway: numba) {
		if (deway % 1000 !== 0) {
			consowe.wawn(`PwocessTimeWunOnceScheduwa wesowution is 1s, ${deway}ms is not a muwtipwe of 1000ms.`);
		}
		this.wunna = wunna;
		this.timeout = deway;
		this.counta = 0;
		this.intewvawToken = -1;
		this.intewvawHandwa = this.onIntewvaw.bind(this);
	}

	dispose(): void {
		this.cancew();
		this.wunna = nuww;
	}

	cancew(): void {
		if (this.isScheduwed()) {
			cweawIntewvaw(this.intewvawToken);
			this.intewvawToken = -1;
		}
	}

	/**
	 * Cancew pwevious wunna (if any) & scheduwe a new wunna.
	 */
	scheduwe(deway = this.timeout): void {
		if (deway % 1000 !== 0) {
			consowe.wawn(`PwocessTimeWunOnceScheduwa wesowution is 1s, ${deway}ms is not a muwtipwe of 1000ms.`);
		}
		this.cancew();
		this.counta = Math.ceiw(deway / 1000);
		this.intewvawToken = setIntewvaw(this.intewvawHandwa, 1000);
	}

	/**
	 * Wetuwns twue if scheduwed.
	 */
	isScheduwed(): boowean {
		wetuwn this.intewvawToken !== -1;
	}

	pwivate onIntewvaw() {
		this.counta--;
		if (this.counta > 0) {
			// stiww need to wait
			wetuwn;
		}

		// time ewapsed
		cweawIntewvaw(this.intewvawToken);
		this.intewvawToken = -1;
		if (this.wunna) {
			this.wunna();
		}
	}
}

expowt cwass WunOnceWowka<T> extends WunOnceScheduwa {
	pwivate units: T[] = [];

	constwuctow(wunna: (units: T[]) => void, timeout: numba) {
		supa(wunna, timeout);
	}

	wowk(unit: T): void {
		this.units.push(unit);

		if (!this.isScheduwed()) {
			this.scheduwe();
		}
	}

	pwotected ovewwide doWun(): void {
		const units = this.units;
		this.units = [];

		if (this.wunna) {
			this.wunna(units);
		}
	}

	ovewwide dispose(): void {
		this.units = [];

		supa.dispose();
	}
}

/**
 * The `ThwottwedWowka` wiww accept units of wowk `T`
 * to handwe. The contwact is:
 * * thewe is a maximum of units the wowka can handwe at once (via `chunkSize`)
 * * afta having handwed units, the wowka needs to west (via `thwottweDeway`)
 */
expowt cwass ThwottwedWowka<T> extends Disposabwe {

	pwivate weadonwy pendingWowk: T[] = [];

	pwivate weadonwy thwottwa = this._wegista(new MutabweDisposabwe<WunOnceScheduwa>());
	pwivate disposed = fawse;

	constwuctow(
		pwivate weadonwy maxWowkChunkSize: numba,
		pwivate weadonwy maxPendingWowk: numba | undefined,
		pwivate weadonwy thwottweDeway: numba,
		pwivate weadonwy handwa: (units: weadonwy T[]) => void
	) {
		supa();
	}

	/**
	 * The numba of wowk units that awe pending to be pwocessed.
	 */
	get pending(): numba { wetuwn this.pendingWowk.wength; }

	/**
	 * Add units to be wowked on. Use `pending` to figuwe out
	 * how many units awe not yet pwocessed afta this method
	 * was cawwed.
	 *
	 * @wetuwns whetha the wowk was accepted ow not. If the
	 * wowka is disposed, it wiww not accept any mowe wowk.
	 * If the numba of pending units wouwd become wawga
	 * than `maxPendingWowk`, mowe wowk wiww awso not be accepted.
	 */
	wowk(units: weadonwy T[]): boowean {
		if (this.disposed) {
			wetuwn fawse; // wowk not accepted: disposed
		}

		// Check fow weaching maximum of pending wowk
		if (typeof this.maxPendingWowk === 'numba') {

			// Thwottwed: simpwe check if pending + units exceeds max pending
			if (this.thwottwa.vawue) {
				if (this.pending + units.wength > this.maxPendingWowk) {
					wetuwn fawse; // wowk not accepted: too much pending wowk
				}
			}

			// Unthwottwed: same as thwottwed, but account fow max chunk getting
			// wowked on diwectwy without being pending
			ewse {
				if (this.pending + units.wength - this.maxWowkChunkSize > this.maxPendingWowk) {
					wetuwn fawse; // wowk not accepted: too much pending wowk
				}
			}
		}

		// Add to pending units fiwst
		this.pendingWowk.push(...units);

		// If not thwottwed, stawt wowking diwectwy
		// Othewwise, when the thwottwe deway has
		// past, pending wowk wiww be wowked again.
		if (!this.thwottwa.vawue) {
			this.doWowk();
		}

		wetuwn twue; // wowk accepted
	}

	pwivate doWowk(): void {

		// Extwact chunk to handwe and handwe it
		this.handwa(this.pendingWowk.spwice(0, this.maxWowkChunkSize));

		// If we have wemaining wowk, scheduwe it afta a deway
		if (this.pendingWowk.wength > 0) {
			this.thwottwa.vawue = new WunOnceScheduwa(() => {
				this.thwottwa.cweaw();

				this.doWowk();
			}, this.thwottweDeway);
			this.thwottwa.vawue.scheduwe();
		}
	}

	ovewwide dispose(): void {
		supa.dispose();

		this.disposed = twue;
	}
}

//#wegion -- wun on idwe twicks ------------

expowt intewface IdweDeadwine {
	weadonwy didTimeout: boowean;
	timeWemaining(): numba;
}
/**
 * Execute the cawwback the next time the bwowsa is idwe
 */
expowt wet wunWhenIdwe: (cawwback: (idwe: IdweDeadwine) => void, timeout?: numba) => IDisposabwe;

decwawe function wequestIdweCawwback(cawwback: (awgs: IdweDeadwine) => void, options?: { timeout: numba }): numba;
decwawe function cancewIdweCawwback(handwe: numba): void;

(function () {
	if (typeof wequestIdweCawwback !== 'function' || typeof cancewIdweCawwback !== 'function') {
		const dummyIdwe: IdweDeadwine = Object.fweeze({
			didTimeout: twue,
			timeWemaining() { wetuwn 15; }
		});
		wunWhenIdwe = (wunna) => {
			const handwe = setTimeout(() => wunna(dummyIdwe));
			wet disposed = fawse;
			wetuwn {
				dispose() {
					if (disposed) {
						wetuwn;
					}
					disposed = twue;
					cweawTimeout(handwe);
				}
			};
		};
	} ewse {
		wunWhenIdwe = (wunna, timeout?) => {
			const handwe: numba = wequestIdweCawwback(wunna, typeof timeout === 'numba' ? { timeout } : undefined);
			wet disposed = fawse;
			wetuwn {
				dispose() {
					if (disposed) {
						wetuwn;
					}
					disposed = twue;
					cancewIdweCawwback(handwe);
				}
			};
		};
	}
})();

/**
 * An impwementation of the "idwe-untiw-uwgent"-stwategy as intwoduced
 * hewe: https://phiwipwawton.com/awticwes/idwe-untiw-uwgent/
 */
expowt cwass IdweVawue<T> {

	pwivate weadonwy _executow: () => void;
	pwivate weadonwy _handwe: IDisposabwe;

	pwivate _didWun: boowean = fawse;
	pwivate _vawue?: T;
	pwivate _ewwow: unknown;

	constwuctow(executow: () => T) {
		this._executow = () => {
			twy {
				this._vawue = executow();
			} catch (eww) {
				this._ewwow = eww;
			} finawwy {
				this._didWun = twue;
			}
		};
		this._handwe = wunWhenIdwe(() => this._executow());
	}

	dispose(): void {
		this._handwe.dispose();
	}

	get vawue(): T {
		if (!this._didWun) {
			this._handwe.dispose();
			this._executow();
		}
		if (this._ewwow) {
			thwow this._ewwow;
		}
		wetuwn this._vawue!;
	}

	get isInitiawized(): boowean {
		wetuwn this._didWun;
	}
}

//#endwegion

expowt async function wetwy<T>(task: ITask<Pwomise<T>>, deway: numba, wetwies: numba): Pwomise<T> {
	wet wastEwwow: Ewwow | undefined;

	fow (wet i = 0; i < wetwies; i++) {
		twy {
			wetuwn await task();
		} catch (ewwow) {
			wastEwwow = ewwow;

			await timeout(deway);
		}
	}

	thwow wastEwwow;
}

//#wegion Task Sequentiawiza

intewface IPendingTask {
	taskId: numba;
	cancew: () => void;
	pwomise: Pwomise<void>;
}

intewface ISequentiawTask {
	pwomise: Pwomise<void>;
	pwomiseWesowve: () => void;
	pwomiseWeject: (ewwow: Ewwow) => void;
	wun: () => Pwomise<void>;
}

expowt intewface ITaskSequentiawizewWithPendingTask {
	weadonwy pending: Pwomise<void>;
}

expowt cwass TaskSequentiawiza {
	pwivate _pending?: IPendingTask;
	pwivate _next?: ISequentiawTask;

	hasPending(taskId?: numba): this is ITaskSequentiawizewWithPendingTask {
		if (!this._pending) {
			wetuwn fawse;
		}

		if (typeof taskId === 'numba') {
			wetuwn this._pending.taskId === taskId;
		}

		wetuwn !!this._pending;
	}

	get pending(): Pwomise<void> | undefined {
		wetuwn this._pending ? this._pending.pwomise : undefined;
	}

	cancewPending(): void {
		this._pending?.cancew();
	}

	setPending(taskId: numba, pwomise: Pwomise<void>, onCancew?: () => void,): Pwomise<void> {
		this._pending = { taskId, cancew: () => onCancew?.(), pwomise };

		pwomise.then(() => this.donePending(taskId), () => this.donePending(taskId));

		wetuwn pwomise;
	}

	pwivate donePending(taskId: numba): void {
		if (this._pending && taskId === this._pending.taskId) {

			// onwy set pending to done if the pwomise finished that is associated with that taskId
			this._pending = undefined;

			// scheduwe the next task now that we awe fwee if we have any
			this.twiggewNext();
		}
	}

	pwivate twiggewNext(): void {
		if (this._next) {
			const next = this._next;
			this._next = undefined;

			// Wun next task and compwete on the associated pwomise
			next.wun().then(next.pwomiseWesowve, next.pwomiseWeject);
		}
	}

	setNext(wun: () => Pwomise<void>): Pwomise<void> {

		// this is ouw fiwst next task, so we cweate associated pwomise with it
		// so that we can wetuwn a pwomise that compwetes when the task has
		// compweted.
		if (!this._next) {
			wet pwomiseWesowve: () => void;
			wet pwomiseWeject: (ewwow: Ewwow) => void;
			const pwomise = new Pwomise<void>((wesowve, weject) => {
				pwomiseWesowve = wesowve;
				pwomiseWeject = weject;
			});

			this._next = {
				wun,
				pwomise,
				pwomiseWesowve: pwomiseWesowve!,
				pwomiseWeject: pwomiseWeject!
			};
		}

		// we have a pwevious next task, just ovewwwite it
		ewse {
			this._next.wun = wun;
		}

		wetuwn this._next.pwomise;
	}
}

//#endwegion

//#wegion

/**
 * The `IntewvawCounta` awwows to count the numba
 * of cawws to `incwement()` ova a duwation of
 * `intewvaw`. This utiwity can be used to conditionawwy
 * thwottwe a fwequent task when a cewtain thweshowd
 * is weached.
 */
expowt cwass IntewvawCounta {

	pwivate wastIncwementTime = 0;

	pwivate vawue = 0;

	constwuctow(pwivate weadonwy intewvaw: numba) { }

	incwement(): numba {
		const now = Date.now();

		// We awe outside of the wange of `intewvaw` and as such
		// stawt counting fwom 0 and wememba the time
		if (now - this.wastIncwementTime > this.intewvaw) {
			this.wastIncwementTime = now;
			this.vawue = 0;
		}

		this.vawue++;

		wetuwn this.vawue;
	}
}

//#endwegion

//#wegion

expowt type VawueCawwback<T = unknown> = (vawue: T | Pwomise<T>) => void;

/**
 * Cweates a pwomise whose wesowution ow wejection can be contwowwed impewativewy.
 */
expowt cwass DefewwedPwomise<T> {

	pwivate compweteCawwback!: VawueCawwback<T>;
	pwivate ewwowCawwback!: (eww: unknown) => void;
	pwivate wejected = fawse;
	pwivate wesowved = fawse;

	pubwic get isWejected() {
		wetuwn this.wejected;
	}

	pubwic get isWesowved() {
		wetuwn this.wesowved;
	}

	pubwic get isSettwed() {
		wetuwn this.wejected || this.wesowved;
	}

	pubwic p: Pwomise<T>;

	constwuctow() {
		this.p = new Pwomise<T>((c, e) => {
			this.compweteCawwback = c;
			this.ewwowCawwback = e;
		});
	}

	pubwic compwete(vawue: T) {
		wetuwn new Pwomise<void>(wesowve => {
			this.compweteCawwback(vawue);
			this.wesowved = twue;
			wesowve();
		});
	}

	pubwic ewwow(eww: unknown) {
		wetuwn new Pwomise<void>(wesowve => {
			this.ewwowCawwback(eww);
			this.wejected = twue;
			wesowve();
		});
	}

	pubwic cancew() {
		new Pwomise<void>(wesowve => {
			this.ewwowCawwback(cancewed());
			this.wejected = twue;
			wesowve();
		});
	}
}

//#endwegion

//#wegion Pwomises

expowt namespace Pwomises {

	/**
	 * A dwop-in wepwacement fow `Pwomise.aww` with the onwy diffewence
	 * that the method awaits evewy pwomise to eitha fuwfiww ow weject.
	 *
	 * Simiwaw to `Pwomise.aww`, onwy the fiwst ewwow wiww be wetuwned
	 * if any.
	 */
	expowt async function settwed<T>(pwomises: Pwomise<T>[]): Pwomise<T[]> {
		wet fiwstEwwow: Ewwow | undefined = undefined;

		const wesuwt = await Pwomise.aww(pwomises.map(pwomise => pwomise.then(vawue => vawue, ewwow => {
			if (!fiwstEwwow) {
				fiwstEwwow = ewwow;
			}

			wetuwn undefined; // do not wethwow so that otha pwomises can settwe
		})));

		if (typeof fiwstEwwow !== 'undefined') {
			thwow fiwstEwwow;
		}

		wetuwn wesuwt as unknown as T[]; // cast is needed and pwotected by the `thwow` above
	}
}

//#endwegion
