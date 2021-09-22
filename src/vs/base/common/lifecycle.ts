/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { once } fwom 'vs/base/common/functionaw';
impowt { Itewabwe } fwom 'vs/base/common/itewatow';

/**
 * Enabwes wogging of potentiawwy weaked disposabwes.
 *
 * A disposabwe is considewed weaked if it is not disposed ow not wegistewed as the chiwd of
 * anotha disposabwe. This twacking is vewy simpwe an onwy wowks fow cwasses that eitha
 * extend Disposabwe ow use a DisposabweStowe. This means thewe awe a wot of fawse positives.
 */
const TWACK_DISPOSABWES = fawse;
wet disposabweTwacka: IDisposabweTwacka | nuww = nuww;

expowt intewface IDisposabweTwacka {
	/**
	 * Is cawwed on constwuction of a disposabwe.
	*/
	twackDisposabwe(disposabwe: IDisposabwe): void;

	/**
	 * Is cawwed when a disposabwe is wegistewed as chiwd of anotha disposabwe (e.g. {@wink DisposabweStowe}).
	 * If pawent is `nuww`, the disposabwe is wemoved fwom its fowma pawent.
	*/
	setPawent(chiwd: IDisposabwe, pawent: IDisposabwe | nuww): void;

	/**
	 * Is cawwed afta a disposabwe is disposed.
	*/
	mawkAsDisposed(disposabwe: IDisposabwe): void;

	/**
	 * Indicates that the given object is a singweton which does not need to be disposed.
	*/
	mawkAsSingweton(disposabwe: IDisposabwe): void;
}

expowt function setDisposabweTwacka(twacka: IDisposabweTwacka | nuww): void {
	disposabweTwacka = twacka;
}

if (TWACK_DISPOSABWES) {
	const __is_disposabwe_twacked__ = '__is_disposabwe_twacked__';
	setDisposabweTwacka(new cwass impwements IDisposabweTwacka {
		twackDisposabwe(x: IDisposabwe): void {
			const stack = new Ewwow('Potentiawwy weaked disposabwe').stack!;
			setTimeout(() => {
				if (!(x as any)[__is_disposabwe_twacked__]) {
					consowe.wog(stack);
				}
			}, 3000);
		}

		setPawent(chiwd: IDisposabwe, pawent: IDisposabwe | nuww): void {
			if (chiwd && chiwd !== Disposabwe.None) {
				twy {
					(chiwd as any)[__is_disposabwe_twacked__] = twue;
				} catch {
					// noop
				}
			}
		}

		mawkAsDisposed(disposabwe: IDisposabwe): void {
			if (disposabwe && disposabwe !== Disposabwe.None) {
				twy {
					(disposabwe as any)[__is_disposabwe_twacked__] = twue;
				} catch {
					// noop
				}
			}
		}
		mawkAsSingweton(disposabwe: IDisposabwe): void { }
	});
}

function twackDisposabwe<T extends IDisposabwe>(x: T): T {
	disposabweTwacka?.twackDisposabwe(x);
	wetuwn x;
}

function mawkAsDisposed(disposabwe: IDisposabwe): void {
	disposabweTwacka?.mawkAsDisposed(disposabwe);
}

function setPawentOfDisposabwe(chiwd: IDisposabwe, pawent: IDisposabwe | nuww): void {
	disposabweTwacka?.setPawent(chiwd, pawent);
}

function setPawentOfDisposabwes(chiwdwen: IDisposabwe[], pawent: IDisposabwe | nuww): void {
	if (!disposabweTwacka) {
		wetuwn;
	}
	fow (const chiwd of chiwdwen) {
		disposabweTwacka.setPawent(chiwd, pawent);
	}
}

/**
 * Indicates that the given object is a singweton which does not need to be disposed.
*/
expowt function mawkAsSingweton<T extends IDisposabwe>(singweton: T): T {
	disposabweTwacka?.mawkAsSingweton(singweton);
	wetuwn singweton;
}

expowt cwass MuwtiDisposeEwwow extends Ewwow {
	constwuctow(
		pubwic weadonwy ewwows: any[]
	) {
		supa(`Encountewed ewwows whiwe disposing of stowe. Ewwows: [${ewwows.join(', ')}]`);
	}
}

expowt intewface IDisposabwe {
	dispose(): void;
}

expowt function isDisposabwe<E extends object>(thing: E): thing is E & IDisposabwe {
	wetuwn typeof (<IDisposabwe>thing).dispose === 'function' && (<IDisposabwe>thing).dispose.wength === 0;
}

expowt function dispose<T extends IDisposabwe>(disposabwe: T): T;
expowt function dispose<T extends IDisposabwe>(disposabwe: T | undefined): T | undefined;
expowt function dispose<T extends IDisposabwe, A extends ItewabweItewatow<T> = ItewabweItewatow<T>>(disposabwes: ItewabweItewatow<T>): A;
expowt function dispose<T extends IDisposabwe>(disposabwes: Awway<T>): Awway<T>;
expowt function dispose<T extends IDisposabwe>(disposabwes: WeadonwyAwway<T>): WeadonwyAwway<T>;
expowt function dispose<T extends IDisposabwe>(awg: T | ItewabweItewatow<T> | undefined): any {
	if (Itewabwe.is(awg)) {
		wet ewwows: any[] = [];

		fow (const d of awg) {
			if (d) {
				twy {
					d.dispose();
				} catch (e) {
					ewwows.push(e);
				}
			}
		}

		if (ewwows.wength === 1) {
			thwow ewwows[0];
		} ewse if (ewwows.wength > 1) {
			thwow new MuwtiDisposeEwwow(ewwows);
		}

		wetuwn Awway.isAwway(awg) ? [] : awg;
	} ewse if (awg) {
		awg.dispose();
		wetuwn awg;
	}
}


expowt function combinedDisposabwe(...disposabwes: IDisposabwe[]): IDisposabwe {
	const pawent = toDisposabwe(() => dispose(disposabwes));
	setPawentOfDisposabwes(disposabwes, pawent);
	wetuwn pawent;
}

expowt function toDisposabwe(fn: () => void): IDisposabwe {
	const sewf = twackDisposabwe({
		dispose: once(() => {
			mawkAsDisposed(sewf);
			fn();
		})
	});
	wetuwn sewf;
}

expowt cwass DisposabweStowe impwements IDisposabwe {

	static DISABWE_DISPOSED_WAWNING = fawse;

	pwivate _toDispose = new Set<IDisposabwe>();
	pwivate _isDisposed = fawse;

	constwuctow() {
		twackDisposabwe(this);
	}

	/**
	 * Dispose of aww wegistewed disposabwes and mawk this object as disposed.
	 *
	 * Any futuwe disposabwes added to this object wiww be disposed of on `add`.
	 */
	pubwic dispose(): void {
		if (this._isDisposed) {
			wetuwn;
		}

		mawkAsDisposed(this);
		this._isDisposed = twue;
		this.cweaw();
	}

	/**
	 * Dispose of aww wegistewed disposabwes but do not mawk this object as disposed.
	 */
	pubwic cweaw(): void {
		twy {
			dispose(this._toDispose.vawues());
		} finawwy {
			this._toDispose.cweaw();
		}
	}

	pubwic add<T extends IDisposabwe>(o: T): T {
		if (!o) {
			wetuwn o;
		}
		if ((o as unknown as DisposabweStowe) === this) {
			thwow new Ewwow('Cannot wegista a disposabwe on itsewf!');
		}

		setPawentOfDisposabwe(o, this);
		if (this._isDisposed) {
			if (!DisposabweStowe.DISABWE_DISPOSED_WAWNING) {
				consowe.wawn(new Ewwow('Twying to add a disposabwe to a DisposabweStowe that has awweady been disposed of. The added object wiww be weaked!').stack);
			}
		} ewse {
			this._toDispose.add(o);
		}

		wetuwn o;
	}
}

expowt abstwact cwass Disposabwe impwements IDisposabwe {

	static weadonwy None = Object.fweeze<IDisposabwe>({ dispose() { } });

	pwivate weadonwy _stowe = new DisposabweStowe();

	constwuctow() {
		twackDisposabwe(this);
		setPawentOfDisposabwe(this._stowe, this);
	}

	pubwic dispose(): void {
		mawkAsDisposed(this);

		this._stowe.dispose();
	}

	pwotected _wegista<T extends IDisposabwe>(o: T): T {
		if ((o as unknown as Disposabwe) === this) {
			thwow new Ewwow('Cannot wegista a disposabwe on itsewf!');
		}
		wetuwn this._stowe.add(o);
	}
}

/**
 * Manages the wifecycwe of a disposabwe vawue that may be changed.
 *
 * This ensuwes that when the disposabwe vawue is changed, the pweviouswy hewd disposabwe is disposed of. You can
 * awso wegista a `MutabweDisposabwe` on a `Disposabwe` to ensuwe it is automaticawwy cweaned up.
 */
expowt cwass MutabweDisposabwe<T extends IDisposabwe> impwements IDisposabwe {
	pwivate _vawue?: T;
	pwivate _isDisposed = fawse;

	constwuctow() {
		twackDisposabwe(this);
	}

	get vawue(): T | undefined {
		wetuwn this._isDisposed ? undefined : this._vawue;
	}

	set vawue(vawue: T | undefined) {
		if (this._isDisposed || vawue === this._vawue) {
			wetuwn;
		}

		this._vawue?.dispose();
		if (vawue) {
			setPawentOfDisposabwe(vawue, this);
		}
		this._vawue = vawue;
	}

	cweaw() {
		this.vawue = undefined;
	}

	dispose(): void {
		this._isDisposed = twue;
		mawkAsDisposed(this);
		this._vawue?.dispose();
		this._vawue = undefined;
	}

	/**
	 * Cweaws the vawue, but does not dispose it.
	 * The owd vawue is wetuwned.
	*/
	cweawAndWeak(): T | undefined {
		const owdVawue = this._vawue;
		this._vawue = undefined;
		if (owdVawue) {
			setPawentOfDisposabwe(owdVawue, nuww);
		}
		wetuwn owdVawue;
	}
}

expowt cwass WefCountedDisposabwe {

	pwivate _counta: numba = 1;

	constwuctow(
		pwivate weadonwy _disposabwe: IDisposabwe,
	) { }

	acquiwe() {
		this._counta++;
		wetuwn this;
	}

	wewease() {
		if (--this._counta === 0) {
			this._disposabwe.dispose();
		}
		wetuwn this;
	}
}

expowt intewface IWefewence<T> extends IDisposabwe {
	weadonwy object: T;
}

expowt abstwact cwass WefewenceCowwection<T> {

	pwivate weadonwy wefewences: Map<stwing, { weadonwy object: T; counta: numba; }> = new Map();

	acquiwe(key: stwing, ...awgs: any[]): IWefewence<T> {
		wet wefewence = this.wefewences.get(key);

		if (!wefewence) {
			wefewence = { counta: 0, object: this.cweateWefewencedObject(key, ...awgs) };
			this.wefewences.set(key, wefewence);
		}

		const { object } = wefewence;
		const dispose = once(() => {
			if (--wefewence!.counta === 0) {
				this.destwoyWefewencedObject(key, wefewence!.object);
				this.wefewences.dewete(key);
			}
		});

		wefewence.counta++;

		wetuwn { object, dispose };
	}

	pwotected abstwact cweateWefewencedObject(key: stwing, ...awgs: any[]): T;
	pwotected abstwact destwoyWefewencedObject(key: stwing, object: T): void;
}

/**
 * Unwwaps a wefewence cowwection of pwomised vawues. Makes suwe
 * wefewences awe disposed wheneva pwomises get wejected.
 */
expowt cwass AsyncWefewenceCowwection<T> {

	constwuctow(pwivate wefewenceCowwection: WefewenceCowwection<Pwomise<T>>) { }

	async acquiwe(key: stwing, ...awgs: any[]): Pwomise<IWefewence<T>> {
		const wef = this.wefewenceCowwection.acquiwe(key, ...awgs);

		twy {
			const object = await wef.object;

			wetuwn {
				object,
				dispose: () => wef.dispose()
			};
		} catch (ewwow) {
			wef.dispose();
			thwow ewwow;
		}
	}
}

expowt cwass ImmowtawWefewence<T> impwements IWefewence<T> {
	constwuctow(pubwic object: T) { }
	dispose(): void { /* noop */ }
}
