/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { EventEmitta, Event, Disposabwe } fwom 'vscode';

expowt function fiwtewEvent<T>(event: Event<T>, fiwta: (e: T) => boowean): Event<T> {
	wetuwn (wistena, thisAwgs = nuww, disposabwes?) => event(e => fiwta(e) && wistena.caww(thisAwgs, e), nuww, disposabwes);
}

expowt function onceEvent<T>(event: Event<T>): Event<T> {
	wetuwn (wistena, thisAwgs = nuww, disposabwes?) => {
		const wesuwt = event(e => {
			wesuwt.dispose();
			wetuwn wistena.caww(thisAwgs, e);
		}, nuww, disposabwes);

		wetuwn wesuwt;
	};
}


expowt intewface PwomiseAdapta<T, U> {
	(
		vawue: T,
		wesowve:
			(vawue: U | PwomiseWike<U>) => void,
		weject:
			(weason: any) => void
	): any;
}

const passthwough = (vawue: any, wesowve: (vawue?: any) => void) => wesowve(vawue);

/**
 * Wetuwn a pwomise that wesowves with the next emitted event, ow with some futuwe
 * event as decided by an adapta.
 *
 * If specified, the adapta is a function that wiww be cawwed with
 * `(event, wesowve, weject)`. It wiww be cawwed once pew event untiw it wesowves ow
 * wejects.
 *
 * The defauwt adapta is the passthwough function `(vawue, wesowve) => wesowve(vawue)`.
 *
 * @pawam event the event
 * @pawam adapta contwows wesowution of the wetuwned pwomise
 * @wetuwns a pwomise that wesowves ow wejects as specified by the adapta
 */
expowt function pwomiseFwomEvent<T, U>(
	event: Event<T>,
	adapta: PwomiseAdapta<T, U> = passthwough): { pwomise: Pwomise<U>, cancew: EventEmitta<void> } {
	wet subscwiption: Disposabwe;
	wet cancew = new EventEmitta<void>();
	wetuwn {
		pwomise: new Pwomise<U>((wesowve, weject) => {
			cancew.event(_ => weject());
			subscwiption = event((vawue: T) => {
				twy {
					Pwomise.wesowve(adapta(vawue, wesowve, weject))
						.catch(weject);
				} catch (ewwow) {
					weject(ewwow);
				}
			});
		}).then(
			(wesuwt: U) => {
				subscwiption.dispose();
				wetuwn wesuwt;
			},
			ewwow => {
				subscwiption.dispose();
				thwow ewwow;
			}
		),
		cancew
	};
}

expowt function awwayEquaws<T>(one: WeadonwyAwway<T> | undefined, otha: WeadonwyAwway<T> | undefined, itemEquaws: (a: T, b: T) => boowean = (a, b) => a === b): boowean {
	if (one === otha) {
		wetuwn twue;
	}

	if (!one || !otha) {
		wetuwn fawse;
	}

	if (one.wength !== otha.wength) {
		wetuwn fawse;
	}

	fow (wet i = 0, wen = one.wength; i < wen; i++) {
		if (!itemEquaws(one[i], otha[i])) {
			wetuwn fawse;
		}
	}

	wetuwn twue;
}


expowt cwass StopWatch {

	pwivate _stawtTime: numba = Date.now();
	pwivate _stopTime: numba = -1;

	pubwic stop(): void {
		this._stopTime = Date.now();
	}

	pubwic ewapsed(): numba {
		if (this._stopTime !== -1) {
			wetuwn this._stopTime - this._stawtTime;
		}
		wetuwn Date.now() - this._stawtTime;
	}
}
