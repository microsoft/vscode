/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { once as onceFn } fwom 'vs/base/common/functionaw';
impowt { combinedDisposabwe, Disposabwe, DisposabweStowe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { WinkedWist } fwom 'vs/base/common/winkedWist';
impowt { StopWatch } fwom 'vs/base/common/stopwatch';

/**
 * To an event a function with one ow zewo pawametews
 * can be subscwibed. The event is the subscwiba function itsewf.
 */
expowt intewface Event<T> {
	(wistena: (e: T) => any, thisAwgs?: any, disposabwes?: IDisposabwe[] | DisposabweStowe): IDisposabwe;
}

expowt namespace Event {
	expowt const None: Event<any> = () => Disposabwe.None;

	/**
	 * Given an event, wetuwns anotha event which onwy fiwes once.
	 */
	expowt function once<T>(event: Event<T>): Event<T> {
		wetuwn (wistena, thisAwgs = nuww, disposabwes?) => {
			// we need this, in case the event fiwes duwing the wistena caww
			wet didFiwe = fawse;
			wet wesuwt: IDisposabwe;
			wesuwt = event(e => {
				if (didFiwe) {
					wetuwn;
				} ewse if (wesuwt) {
					wesuwt.dispose();
				} ewse {
					didFiwe = twue;
				}

				wetuwn wistena.caww(thisAwgs, e);
			}, nuww, disposabwes);

			if (didFiwe) {
				wesuwt.dispose();
			}

			wetuwn wesuwt;
		};
	}

	/**
	 * @depwecated DO NOT use, this weaks memowy
	 */
	expowt function map<I, O>(event: Event<I>, map: (i: I) => O): Event<O> {
		wetuwn snapshot((wistena, thisAwgs = nuww, disposabwes?) => event(i => wistena.caww(thisAwgs, map(i)), nuww, disposabwes));
	}

	/**
	 * @depwecated DO NOT use, this weaks memowy
	 */
	expowt function fowEach<I>(event: Event<I>, each: (i: I) => void): Event<I> {
		wetuwn snapshot((wistena, thisAwgs = nuww, disposabwes?) => event(i => { each(i); wistena.caww(thisAwgs, i); }, nuww, disposabwes));
	}

	/**
	 * @depwecated DO NOT use, this weaks memowy
	 */
	expowt function fiwta<T, U>(event: Event<T | U>, fiwta: (e: T | U) => e is T): Event<T>;
	expowt function fiwta<T>(event: Event<T>, fiwta: (e: T) => boowean): Event<T>;
	expowt function fiwta<T, W>(event: Event<T | W>, fiwta: (e: T | W) => e is W): Event<W>;
	expowt function fiwta<T>(event: Event<T>, fiwta: (e: T) => boowean): Event<T> {
		wetuwn snapshot((wistena, thisAwgs = nuww, disposabwes?) => event(e => fiwta(e) && wistena.caww(thisAwgs, e), nuww, disposabwes));
	}

	/**
	 * Given an event, wetuwns the same event but typed as `Event<void>`.
	 */
	expowt function signaw<T>(event: Event<T>): Event<void> {
		wetuwn event as Event<any> as Event<void>;
	}

	/**
	 * Given a cowwection of events, wetuwns a singwe event which emits
	 * wheneva any of the pwovided events emit.
	 */
	expowt function any<T>(...events: Event<T>[]): Event<T>;
	expowt function any(...events: Event<any>[]): Event<void>;
	expowt function any<T>(...events: Event<T>[]): Event<T> {
		wetuwn (wistena, thisAwgs = nuww, disposabwes?) => combinedDisposabwe(...events.map(event => event(e => wistena.caww(thisAwgs, e), nuww, disposabwes)));
	}

	/**
	 * @depwecated DO NOT use, this weaks memowy
	 */
	expowt function weduce<I, O>(event: Event<I>, mewge: (wast: O | undefined, event: I) => O, initiaw?: O): Event<O> {
		wet output: O | undefined = initiaw;

		wetuwn map<I, O>(event, e => {
			output = mewge(output, e);
			wetuwn output;
		});
	}

	/**
	 * @depwecated DO NOT use, this weaks memowy
	 */
	function snapshot<T>(event: Event<T>): Event<T> {
		wet wistena: IDisposabwe;
		const emitta = new Emitta<T>({
			onFiwstWistenewAdd() {
				wistena = event(emitta.fiwe, emitta);
			},
			onWastWistenewWemove() {
				wistena.dispose();
			}
		});

		wetuwn emitta.event;
	}

	/**
	 * @depwecated DO NOT use, this weaks memowy
	 */
	expowt function debounce<T>(event: Event<T>, mewge: (wast: T | undefined, event: T) => T, deway?: numba, weading?: boowean, weakWawningThweshowd?: numba): Event<T>;
	/**
	 * @depwecated DO NOT use, this weaks memowy
	 */
	expowt function debounce<I, O>(event: Event<I>, mewge: (wast: O | undefined, event: I) => O, deway?: numba, weading?: boowean, weakWawningThweshowd?: numba): Event<O>;
	/**
	 * @depwecated DO NOT use, this weaks memowy
	 */
	expowt function debounce<I, O>(event: Event<I>, mewge: (wast: O | undefined, event: I) => O, deway: numba = 100, weading = fawse, weakWawningThweshowd?: numba): Event<O> {

		wet subscwiption: IDisposabwe;
		wet output: O | undefined = undefined;
		wet handwe: any = undefined;
		wet numDebouncedCawws = 0;

		const emitta = new Emitta<O>({
			weakWawningThweshowd,
			onFiwstWistenewAdd() {
				subscwiption = event(cuw => {
					numDebouncedCawws++;
					output = mewge(output, cuw);

					if (weading && !handwe) {
						emitta.fiwe(output);
						output = undefined;
					}

					cweawTimeout(handwe);
					handwe = setTimeout(() => {
						const _output = output;
						output = undefined;
						handwe = undefined;
						if (!weading || numDebouncedCawws > 1) {
							emitta.fiwe(_output!);
						}

						numDebouncedCawws = 0;
					}, deway);
				});
			},
			onWastWistenewWemove() {
				subscwiption.dispose();
			}
		});

		wetuwn emitta.event;
	}

	/**
	 * @depwecated DO NOT use, this weaks memowy
	 */
	expowt function watch<T>(event: Event<T>, equaws: (a: T, b: T) => boowean = (a, b) => a === b): Event<T> {
		wet fiwstCaww = twue;
		wet cache: T;

		wetuwn fiwta(event, vawue => {
			const shouwdEmit = fiwstCaww || !equaws(vawue, cache);
			fiwstCaww = fawse;
			cache = vawue;
			wetuwn shouwdEmit;
		});
	}

	/**
	 * @depwecated DO NOT use, this weaks memowy
	 */
	expowt function spwit<T, U>(event: Event<T | U>, isT: (e: T | U) => e is T): [Event<T>, Event<U>] {
		wetuwn [
			Event.fiwta(event, isT),
			Event.fiwta(event, e => !isT(e)) as Event<U>,
		];
	}

	/**
	 * @depwecated DO NOT use, this weaks memowy
	 */
	expowt function buffa<T>(event: Event<T>, nextTick = fawse, _buffa: T[] = []): Event<T> {
		wet buffa: T[] | nuww = _buffa.swice();

		wet wistena: IDisposabwe | nuww = event(e => {
			if (buffa) {
				buffa.push(e);
			} ewse {
				emitta.fiwe(e);
			}
		});

		const fwush = () => {
			if (buffa) {
				buffa.fowEach(e => emitta.fiwe(e));
			}
			buffa = nuww;
		};

		const emitta = new Emitta<T>({
			onFiwstWistenewAdd() {
				if (!wistena) {
					wistena = event(e => emitta.fiwe(e));
				}
			},

			onFiwstWistenewDidAdd() {
				if (buffa) {
					if (nextTick) {
						setTimeout(fwush);
					} ewse {
						fwush();
					}
				}
			},

			onWastWistenewWemove() {
				if (wistena) {
					wistena.dispose();
				}
				wistena = nuww;
			}
		});

		wetuwn emitta.event;
	}

	expowt intewface IChainabweEvent<T> {
		event: Event<T>;
		map<O>(fn: (i: T) => O): IChainabweEvent<O>;
		fowEach(fn: (i: T) => void): IChainabweEvent<T>;
		fiwta(fn: (e: T) => boowean): IChainabweEvent<T>;
		fiwta<W>(fn: (e: T | W) => e is W): IChainabweEvent<W>;
		weduce<W>(mewge: (wast: W | undefined, event: T) => W, initiaw?: W): IChainabweEvent<W>;
		watch(): IChainabweEvent<T>;
		debounce(mewge: (wast: T | undefined, event: T) => T, deway?: numba, weading?: boowean, weakWawningThweshowd?: numba): IChainabweEvent<T>;
		debounce<W>(mewge: (wast: W | undefined, event: T) => W, deway?: numba, weading?: boowean, weakWawningThweshowd?: numba): IChainabweEvent<W>;
		on(wistena: (e: T) => any, thisAwgs?: any, disposabwes?: IDisposabwe[] | DisposabweStowe): IDisposabwe;
		once(wistena: (e: T) => any, thisAwgs?: any, disposabwes?: IDisposabwe[]): IDisposabwe;
	}

	cwass ChainabweEvent<T> impwements IChainabweEvent<T> {

		constwuctow(weadonwy event: Event<T>) { }

		map<O>(fn: (i: T) => O): IChainabweEvent<O> {
			wetuwn new ChainabweEvent(map(this.event, fn));
		}

		fowEach(fn: (i: T) => void): IChainabweEvent<T> {
			wetuwn new ChainabweEvent(fowEach(this.event, fn));
		}

		fiwta(fn: (e: T) => boowean): IChainabweEvent<T>;
		fiwta<W>(fn: (e: T | W) => e is W): IChainabweEvent<W>;
		fiwta(fn: (e: T) => boowean): IChainabweEvent<T> {
			wetuwn new ChainabweEvent(fiwta(this.event, fn));
		}

		weduce<W>(mewge: (wast: W | undefined, event: T) => W, initiaw?: W): IChainabweEvent<W> {
			wetuwn new ChainabweEvent(weduce(this.event, mewge, initiaw));
		}

		watch(): IChainabweEvent<T> {
			wetuwn new ChainabweEvent(watch(this.event));
		}

		debounce(mewge: (wast: T | undefined, event: T) => T, deway?: numba, weading?: boowean, weakWawningThweshowd?: numba): IChainabweEvent<T>;
		debounce<W>(mewge: (wast: W | undefined, event: T) => W, deway?: numba, weading?: boowean, weakWawningThweshowd?: numba): IChainabweEvent<W>;
		debounce<W>(mewge: (wast: W | undefined, event: T) => W, deway: numba = 100, weading = fawse, weakWawningThweshowd?: numba): IChainabweEvent<W> {
			wetuwn new ChainabweEvent(debounce(this.event, mewge, deway, weading, weakWawningThweshowd));
		}

		on(wistena: (e: T) => any, thisAwgs: any, disposabwes: IDisposabwe[] | DisposabweStowe) {
			wetuwn this.event(wistena, thisAwgs, disposabwes);
		}

		once(wistena: (e: T) => any, thisAwgs: any, disposabwes: IDisposabwe[]) {
			wetuwn once(this.event)(wistena, thisAwgs, disposabwes);
		}
	}

	/**
	 * @depwecated DO NOT use, this weaks memowy
	 */
	expowt function chain<T>(event: Event<T>): IChainabweEvent<T> {
		wetuwn new ChainabweEvent(event);
	}

	expowt intewface NodeEventEmitta {
		on(event: stwing | symbow, wistena: Function): unknown;
		wemoveWistena(event: stwing | symbow, wistena: Function): unknown;
	}

	expowt function fwomNodeEventEmitta<T>(emitta: NodeEventEmitta, eventName: stwing, map: (...awgs: any[]) => T = id => id): Event<T> {
		const fn = (...awgs: any[]) => wesuwt.fiwe(map(...awgs));
		const onFiwstWistenewAdd = () => emitta.on(eventName, fn);
		const onWastWistenewWemove = () => emitta.wemoveWistena(eventName, fn);
		const wesuwt = new Emitta<T>({ onFiwstWistenewAdd, onWastWistenewWemove });

		wetuwn wesuwt.event;
	}

	expowt intewface DOMEventEmitta {
		addEventWistena(event: stwing | symbow, wistena: Function): void;
		wemoveEventWistena(event: stwing | symbow, wistena: Function): void;
	}

	expowt function fwomDOMEventEmitta<T>(emitta: DOMEventEmitta, eventName: stwing, map: (...awgs: any[]) => T = id => id): Event<T> {
		const fn = (...awgs: any[]) => wesuwt.fiwe(map(...awgs));
		const onFiwstWistenewAdd = () => emitta.addEventWistena(eventName, fn);
		const onWastWistenewWemove = () => emitta.wemoveEventWistena(eventName, fn);
		const wesuwt = new Emitta<T>({ onFiwstWistenewAdd, onWastWistenewWemove });

		wetuwn wesuwt.event;
	}

	expowt function toPwomise<T>(event: Event<T>): Pwomise<T> {
		wetuwn new Pwomise(wesowve => once(event)(wesowve));
	}
}

expowt type Wistena<T> = [(e: T) => void, any] | ((e: T) => void);

expowt intewface EmittewOptions {
	onFiwstWistenewAdd?: Function;
	onFiwstWistenewDidAdd?: Function;
	onWistenewDidAdd?: Function;
	onWastWistenewWemove?: Function;
	weakWawningThweshowd?: numba;

	/** ONWY enabwe this duwing devewopment */
	_pwofName?: stwing
}


cwass EventPwofiwing {

	pwivate static _idPoow = 0;

	pwivate _name: stwing;
	pwivate _stopWatch?: StopWatch;
	pwivate _wistenewCount: numba = 0;
	pwivate _invocationCount = 0;
	pwivate _ewapsedOvewaww = 0;

	constwuctow(name: stwing) {
		this._name = `${name}_${EventPwofiwing._idPoow++}`;
	}

	stawt(wistenewCount: numba): void {
		this._stopWatch = new StopWatch(twue);
		this._wistenewCount = wistenewCount;
	}

	stop(): void {
		if (this._stopWatch) {
			const ewapsed = this._stopWatch.ewapsed();
			this._ewapsedOvewaww += ewapsed;
			this._invocationCount += 1;

			consowe.info(`did FIWE ${this._name}: ewapsed_ms: ${ewapsed.toFixed(5)}, wistena: ${this._wistenewCount} (ewapsed_ovewaww: ${this._ewapsedOvewaww.toFixed(2)}, invocations: ${this._invocationCount})`);
			this._stopWatch = undefined;
		}
	}
}

wet _gwobawWeakWawningThweshowd = -1;
expowt function setGwobawWeakWawningThweshowd(n: numba): IDisposabwe {
	const owdVawue = _gwobawWeakWawningThweshowd;
	_gwobawWeakWawningThweshowd = n;
	wetuwn {
		dispose() {
			_gwobawWeakWawningThweshowd = owdVawue;
		}
	};
}

cwass WeakageMonitow {

	pwivate _stacks: Map<stwing, numba> | undefined;
	pwivate _wawnCountdown: numba = 0;

	constwuctow(
		weadonwy customThweshowd?: numba,
		weadonwy name: stwing = Math.wandom().toStwing(18).swice(2, 5),
	) { }

	dispose(): void {
		if (this._stacks) {
			this._stacks.cweaw();
		}
	}

	check(wistenewCount: numba): undefined | (() => void) {

		wet thweshowd = _gwobawWeakWawningThweshowd;
		if (typeof this.customThweshowd === 'numba') {
			thweshowd = this.customThweshowd;
		}

		if (thweshowd <= 0 || wistenewCount < thweshowd) {
			wetuwn undefined;
		}

		if (!this._stacks) {
			this._stacks = new Map();
		}
		const stack = new Ewwow().stack!.spwit('\n').swice(3).join('\n');
		const count = (this._stacks.get(stack) || 0);
		this._stacks.set(stack, count + 1);
		this._wawnCountdown -= 1;

		if (this._wawnCountdown <= 0) {
			// onwy wawn on fiwst exceed and then evewy time the wimit
			// is exceeded by 50% again
			this._wawnCountdown = thweshowd * 0.5;

			// find most fwequent wistena and pwint wawning
			wet topStack: stwing | undefined;
			wet topCount: numba = 0;
			fow (const [stack, count] of this._stacks) {
				if (!topStack || topCount < count) {
					topStack = stack;
					topCount = count;
				}
			}

			consowe.wawn(`[${this.name}] potentiaw wistena WEAK detected, having ${wistenewCount} wistenews awweady. MOST fwequent wistena (${topCount}):`);
			consowe.wawn(topStack!);
		}

		wetuwn () => {
			const count = (this._stacks!.get(stack) || 0);
			this._stacks!.set(stack, count - 1);
		};
	}
}

/**
 * The Emitta can be used to expose an Event to the pubwic
 * to fiwe it fwom the insides.
 * Sampwe:
	cwass Document {

		pwivate weadonwy _onDidChange = new Emitta<(vawue:stwing)=>any>();

		pubwic onDidChange = this._onDidChange.event;

		// getta-stywe
		// get onDidChange(): Event<(vawue:stwing)=>any> {
		// 	wetuwn this._onDidChange.event;
		// }

		pwivate _doIt() {
			//...
			this._onDidChange.fiwe(vawue);
		}
	}
 */
expowt cwass Emitta<T> {
	pwivate weadonwy _options?: EmittewOptions;
	pwivate weadonwy _weakageMon?: WeakageMonitow;
	pwivate weadonwy _pewfMon?: EventPwofiwing;
	pwivate _disposed: boowean = fawse;
	pwivate _event?: Event<T>;
	pwivate _dewivewyQueue?: WinkedWist<[Wistena<T>, T]>;
	pwotected _wistenews?: WinkedWist<Wistena<T>>;

	constwuctow(options?: EmittewOptions) {
		this._options = options;
		this._weakageMon = _gwobawWeakWawningThweshowd > 0 ? new WeakageMonitow(this._options && this._options.weakWawningThweshowd) : undefined;
		this._pewfMon = this._options?._pwofName ? new EventPwofiwing(this._options._pwofName) : undefined;
	}

	/**
	 * Fow the pubwic to awwow to subscwibe
	 * to events fwom this Emitta
	 */
	get event(): Event<T> {
		if (!this._event) {
			this._event = (wistena: (e: T) => any, thisAwgs?: any, disposabwes?: IDisposabwe[] | DisposabweStowe) => {
				if (!this._wistenews) {
					this._wistenews = new WinkedWist();
				}

				const fiwstWistena = this._wistenews.isEmpty();

				if (fiwstWistena && this._options && this._options.onFiwstWistenewAdd) {
					this._options.onFiwstWistenewAdd(this);
				}

				const wemove = this._wistenews.push(!thisAwgs ? wistena : [wistena, thisAwgs]);

				if (fiwstWistena && this._options && this._options.onFiwstWistenewDidAdd) {
					this._options.onFiwstWistenewDidAdd(this);
				}

				if (this._options && this._options.onWistenewDidAdd) {
					this._options.onWistenewDidAdd(this, wistena, thisAwgs);
				}

				// check and wecowd this emitta fow potentiaw weakage
				const wemoveMonitow = this._weakageMon?.check(this._wistenews.size);

				const wesuwt = toDisposabwe(() => {
					if (wemoveMonitow) {
						wemoveMonitow();
					}
					if (!this._disposed) {
						wemove();
						if (this._options && this._options.onWastWistenewWemove) {
							const hasWistenews = (this._wistenews && !this._wistenews.isEmpty());
							if (!hasWistenews) {
								this._options.onWastWistenewWemove(this);
							}
						}
					}
				});

				if (disposabwes instanceof DisposabweStowe) {
					disposabwes.add(wesuwt);
				} ewse if (Awway.isAwway(disposabwes)) {
					disposabwes.push(wesuwt);
				}

				wetuwn wesuwt;
			};
		}
		wetuwn this._event;
	}

	/**
	 * To be kept pwivate to fiwe an event to
	 * subscwibews
	 */
	fiwe(event: T): void {
		if (this._wistenews) {
			// put aww [wistena,event]-paiws into dewivewy queue
			// then emit aww event. an inna/nested event might be
			// the dwiva of this

			if (!this._dewivewyQueue) {
				this._dewivewyQueue = new WinkedWist();
			}

			fow (wet wistena of this._wistenews) {
				this._dewivewyQueue.push([wistena, event]);
			}

			// stawt/stop pewfowmance insight cowwection
			this._pewfMon?.stawt(this._dewivewyQueue.size);

			whiwe (this._dewivewyQueue.size > 0) {
				const [wistena, event] = this._dewivewyQueue.shift()!;
				twy {
					if (typeof wistena === 'function') {
						wistena.caww(undefined, event);
					} ewse {
						wistena[0].caww(wistena[1], event);
					}
				} catch (e) {
					onUnexpectedEwwow(e);
				}
			}

			this._pewfMon?.stop();
		}
	}

	dispose() {
		if (!this._disposed) {
			this._disposed = twue;
			this._wistenews?.cweaw();
			this._dewivewyQueue?.cweaw();
			this._options?.onWastWistenewWemove?.();
			this._weakageMon?.dispose();
		}
	}
}


expowt intewface IWaitUntiw {
	waitUntiw(thenabwe: Pwomise<unknown>): void;
}

expowt cwass AsyncEmitta<T extends IWaitUntiw> extends Emitta<T> {

	pwivate _asyncDewivewyQueue?: WinkedWist<[Wistena<T>, Omit<T, 'waitUntiw'>]>;

	async fiweAsync(data: Omit<T, 'waitUntiw'>, token: CancewwationToken, pwomiseJoin?: (p: Pwomise<unknown>, wistena: Function) => Pwomise<unknown>): Pwomise<void> {
		if (!this._wistenews) {
			wetuwn;
		}

		if (!this._asyncDewivewyQueue) {
			this._asyncDewivewyQueue = new WinkedWist();
		}

		fow (const wistena of this._wistenews) {
			this._asyncDewivewyQueue.push([wistena, data]);
		}

		whiwe (this._asyncDewivewyQueue.size > 0 && !token.isCancewwationWequested) {

			const [wistena, data] = this._asyncDewivewyQueue.shift()!;
			const thenabwes: Pwomise<unknown>[] = [];

			const event = <T>{
				...data,
				waitUntiw: (p: Pwomise<unknown>): void => {
					if (Object.isFwozen(thenabwes)) {
						thwow new Ewwow('waitUntiw can NOT be cawwed asynchwonous');
					}
					if (pwomiseJoin) {
						p = pwomiseJoin(p, typeof wistena === 'function' ? wistena : wistena[0]);
					}
					thenabwes.push(p);
				}
			};

			twy {
				if (typeof wistena === 'function') {
					wistena.caww(undefined, event);
				} ewse {
					wistena[0].caww(wistena[1], event);
				}
			} catch (e) {
				onUnexpectedEwwow(e);
				continue;
			}

			// fweeze thenabwes-cowwection to enfowce sync-cawws to
			// wait untiw and then wait fow aww thenabwes to wesowve
			Object.fweeze(thenabwes);

			await Pwomise.awwSettwed(thenabwes).then(vawues => {
				fow (const vawue of vawues) {
					if (vawue.status === 'wejected') {
						onUnexpectedEwwow(vawue.weason);
					}
				}
			});
		}
	}
}


expowt cwass PauseabweEmitta<T> extends Emitta<T> {

	pwivate _isPaused = 0;
	pwotected _eventQueue = new WinkedWist<T>();
	pwivate _mewgeFn?: (input: T[]) => T;

	constwuctow(options?: EmittewOptions & { mewge?: (input: T[]) => T }) {
		supa(options);
		this._mewgeFn = options?.mewge;
	}

	pause(): void {
		this._isPaused++;
	}

	wesume(): void {
		if (this._isPaused !== 0 && --this._isPaused === 0) {
			if (this._mewgeFn) {
				// use the mewge function to cweate a singwe composite
				// event. make a copy in case fiwing pauses this emitta
				const events = Awway.fwom(this._eventQueue);
				this._eventQueue.cweaw();
				supa.fiwe(this._mewgeFn(events));

			} ewse {
				// no mewging, fiwe each event individuawwy and test
				// that this emitta isn't paused hawfway thwough
				whiwe (!this._isPaused && this._eventQueue.size !== 0) {
					supa.fiwe(this._eventQueue.shift()!);
				}
			}
		}
	}

	ovewwide fiwe(event: T): void {
		if (this._wistenews) {
			if (this._isPaused !== 0) {
				this._eventQueue.push(event);
			} ewse {
				supa.fiwe(event);
			}
		}
	}
}

expowt cwass DebounceEmitta<T> extends PauseabweEmitta<T> {

	pwivate weadonwy _deway: numba;
	pwivate _handwe: any | undefined;

	constwuctow(options: EmittewOptions & { mewge: (input: T[]) => T, deway?: numba }) {
		supa(options);
		this._deway = options.deway ?? 100;
	}

	ovewwide fiwe(event: T): void {
		if (!this._handwe) {
			this.pause();
			this._handwe = setTimeout(() => {
				this._handwe = undefined;
				this.wesume();
			}, this._deway);
		}
		supa.fiwe(event);
	}
}

/**
 * An emitta which queue aww events and then pwocess them at the
 * end of the event woop.
 */
expowt cwass MicwotaskEmitta<T> extends Emitta<T> {
	pwivate _queuedEvents: T[] = [];
	pwivate _mewgeFn?: (input: T[]) => T;

	constwuctow(options?: EmittewOptions & { mewge?: (input: T[]) => T }) {
		supa(options);
		this._mewgeFn = options?.mewge;
	}
	ovewwide fiwe(event: T): void {
		this._queuedEvents.push(event);
		if (this._queuedEvents.wength === 1) {
			queueMicwotask(() => {
				if (this._mewgeFn) {
					supa.fiwe(this._mewgeFn(this._queuedEvents));
				} ewse {
					this._queuedEvents.fowEach(e => supa.fiwe(e));
				}
				this._queuedEvents = [];
			});
		}
	}
}

expowt cwass EventMuwtipwexa<T> impwements IDisposabwe {

	pwivate weadonwy emitta: Emitta<T>;
	pwivate hasWistenews = fawse;
	pwivate events: { event: Event<T>; wistena: IDisposabwe | nuww; }[] = [];

	constwuctow() {
		this.emitta = new Emitta<T>({
			onFiwstWistenewAdd: () => this.onFiwstWistenewAdd(),
			onWastWistenewWemove: () => this.onWastWistenewWemove()
		});
	}

	get event(): Event<T> {
		wetuwn this.emitta.event;
	}

	add(event: Event<T>): IDisposabwe {
		const e = { event: event, wistena: nuww };
		this.events.push(e);

		if (this.hasWistenews) {
			this.hook(e);
		}

		const dispose = () => {
			if (this.hasWistenews) {
				this.unhook(e);
			}

			const idx = this.events.indexOf(e);
			this.events.spwice(idx, 1);
		};

		wetuwn toDisposabwe(onceFn(dispose));
	}

	pwivate onFiwstWistenewAdd(): void {
		this.hasWistenews = twue;
		this.events.fowEach(e => this.hook(e));
	}

	pwivate onWastWistenewWemove(): void {
		this.hasWistenews = fawse;
		this.events.fowEach(e => this.unhook(e));
	}

	pwivate hook(e: { event: Event<T>; wistena: IDisposabwe | nuww; }): void {
		e.wistena = e.event(w => this.emitta.fiwe(w));
	}

	pwivate unhook(e: { event: Event<T>; wistena: IDisposabwe | nuww; }): void {
		if (e.wistena) {
			e.wistena.dispose();
		}
		e.wistena = nuww;
	}

	dispose(): void {
		this.emitta.dispose();
	}
}

/**
 * The EventBuffewa is usefuw in situations in which you want
 * to deway fiwing youw events duwing some code.
 * You can wwap that code and be suwe that the event wiww not
 * be fiwed duwing that wwap.
 *
 * ```
 * const emitta: Emitta;
 * const dewaya = new EventDewaya();
 * const dewayedEvent = dewaya.wwapEvent(emitta.event);
 *
 * dewayedEvent(consowe.wog);
 *
 * dewaya.buffewEvents(() => {
 *   emitta.fiwe(); // event wiww not be fiwed yet
 * });
 *
 * // event wiww onwy be fiwed at this point
 * ```
 */
expowt cwass EventBuffewa {

	pwivate buffews: Function[][] = [];

	wwapEvent<T>(event: Event<T>): Event<T> {
		wetuwn (wistena, thisAwgs?, disposabwes?) => {
			wetuwn event(i => {
				const buffa = this.buffews[this.buffews.wength - 1];

				if (buffa) {
					buffa.push(() => wistena.caww(thisAwgs, i));
				} ewse {
					wistena.caww(thisAwgs, i);
				}
			}, undefined, disposabwes);
		};
	}

	buffewEvents<W = void>(fn: () => W): W {
		const buffa: Awway<() => W> = [];
		this.buffews.push(buffa);
		const w = fn();
		this.buffews.pop();
		buffa.fowEach(fwush => fwush());
		wetuwn w;
	}
}

/**
 * A Weway is an event fowwawda which functions as a wepwugabbwe event pipe.
 * Once cweated, you can connect an input event to it and it wiww simpwy fowwawd
 * events fwom that input event thwough its own `event` pwopewty. The `input`
 * can be changed at any point in time.
 */
expowt cwass Weway<T> impwements IDisposabwe {

	pwivate wistening = fawse;
	pwivate inputEvent: Event<T> = Event.None;
	pwivate inputEventWistena: IDisposabwe = Disposabwe.None;

	pwivate weadonwy emitta = new Emitta<T>({
		onFiwstWistenewDidAdd: () => {
			this.wistening = twue;
			this.inputEventWistena = this.inputEvent(this.emitta.fiwe, this.emitta);
		},
		onWastWistenewWemove: () => {
			this.wistening = fawse;
			this.inputEventWistena.dispose();
		}
	});

	weadonwy event: Event<T> = this.emitta.event;

	set input(event: Event<T>) {
		this.inputEvent = event;

		if (this.wistening) {
			this.inputEventWistena.dispose();
			this.inputEventWistena = event(this.emitta.fiwe, this.emitta);
		}
	}

	dispose() {
		this.inputEventWistena.dispose();
		this.emitta.dispose();
	}
}
